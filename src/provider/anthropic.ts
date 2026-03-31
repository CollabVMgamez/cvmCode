import {
  AgentTurnResult,
  AgentTurnStreamHandlers,
  AppConfig,
  ChatMessage,
  TokenUsage
} from "../types.js";
import { classifyProviderFailure, ProviderRequestError } from "./errors.js";
import { agentToolDefinitions, executeAgentTool } from "../tools/agent-tools.js";
import {
  appendForcedToolInstruction,
  latestUserMessage,
  shouldForceToolRetry,
  taskLikelyRequiresTools
} from "../agent/tool-policy.js";

function activeProvider(config: AppConfig) {
  const provider = config.providers[config.provider];
  if (!provider) {
    throw new Error(`Configured provider "${config.provider}" was not found.`);
  }
  return provider;
}

function resolveApiKey(config: AppConfig): string | undefined {
  const provider = activeProvider(config);
  if (provider.apiKey) {
    return provider.apiKey;
  }
  if (provider.apiKeyEnv) {
    return process.env[provider.apiKeyEnv];
  }
  return undefined;
}

function createHeaders(config: AppConfig): Record<string, string> {
  const provider = activeProvider(config);
  const apiKey = resolveApiKey(config);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(provider.headers ?? {})
  };

  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  return headers;
}

const MAX_RETRY_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 30_000;
const MAX_TOOL_LOOPS = 8;

function backoffDelay(attempt: number, retryAfterMs?: number): number {
  if (retryAfterMs && retryAfterMs > 0) {
    return Math.min(retryAfterMs, MAX_BACKOFF_MS);
  }
  const base = BASE_BACKOFF_MS * Math.pow(2, attempt);
  const jitter = Math.random() * base * 0.3;
  return Math.min(base + jitter, MAX_BACKOFF_MS);
}

function parseRetryAfterMs(response: Response): number | undefined {
  const header = response.headers.get("retry-after") ?? response.headers.get("x-ratelimit-reset-after");
  if (!header) {
    return undefined;
  }
  const seconds = parseFloat(header);
  if (!isNaN(seconds)) {
    return seconds * 1000;
  }
  const resetTime = new Date(header).getTime();
  if (!isNaN(resetTime)) {
    return Math.max(0, resetTime - Date.now());
  }
  return undefined;
}

async function postJson(
  config: AppConfig,
  endpoint: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const provider = activeProvider(config);
  const url = `${provider.baseURL.replace(/\/$/, "")}${endpoint}`;

  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt += 1) {
    let httpResponse: Response | undefined;
    try {
      httpResponse = await fetch(url, {
        method: "POST",
        headers: createHeaders(config),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000)
      });

      if (!httpResponse.ok) {
        const text = await httpResponse.text();
        const details = classifyProviderFailure({
          status: httpResponse.status,
          statusText: httpResponse.statusText,
          body: text
        });
        if (details.retryable && attempt < MAX_RETRY_ATTEMPTS - 1) {
          const delay = backoffDelay(attempt, parseRetryAfterMs(httpResponse));
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new ProviderRequestError(details.title, details);
      }

      return (await httpResponse.json()) as Record<string, unknown>;
    } catch (error) {
      if (error instanceof ProviderRequestError) {
        throw error;
      }
      const details = classifyProviderFailure({ error });
      if (details.retryable && attempt < MAX_RETRY_ATTEMPTS - 1) {
        const delay = backoffDelay(attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw new ProviderRequestError(details.title, details);
    }
  }

  throw new ProviderRequestError("Provider request failed", {
    kind: "unknown",
    title: "Provider request failed",
    detail: "The request failed after multiple attempts.",
    retryable: false,
    suggestions: ["Run `cvmCode doctor` to inspect your provider settings."]
  });
}

async function postStream(
  config: AppConfig,
  endpoint: string,
  body: Record<string, unknown>,
  onEvent: (eventName: string | undefined, payload: Record<string, unknown>) => void
): Promise<void> {
  const provider = activeProvider(config);
  const url = `${provider.baseURL.replace(/\/$/, "")}${endpoint}`;

  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt += 1) {
    let httpResponse: Response | undefined;
    try {
      httpResponse = await fetch(url, {
        method: "POST",
        headers: {
          ...createHeaders(config),
          Accept: "text/event-stream"
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000)
      });

      if (!httpResponse.ok) {
        const text = await httpResponse.text();
        const details = classifyProviderFailure({
          status: httpResponse.status,
          statusText: httpResponse.statusText,
          body: text
        });
        if (details.retryable && attempt < MAX_RETRY_ATTEMPTS - 1) {
          const delay = backoffDelay(attempt, parseRetryAfterMs(httpResponse));
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new ProviderRequestError(details.title, details);
      }

      if (!httpResponse.body) {
        throw new ProviderRequestError("Streaming response body missing", {
          kind: "server",
          title: "Streaming response body missing",
          detail: "The provider accepted the request but did not return a stream body.",
          retryable: false,
          suggestions: [
            "Switch to a different provider or endpoint mode.",
            "Retry the request to see if the provider supports SSE for this model."
          ]
        });
      }

      const reader = httpResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let eventName: string | undefined;
      let dataLines: string[] = [];

      const flushEvent = () => {
        if (dataLines.length === 0) {
          eventName = undefined;
          return;
        }

        const data = dataLines.join("\n").trim();
        dataLines = [];
        const currentEvent = eventName;
        eventName = undefined;

        if (!data || data === "[DONE]") {
          return;
        }

        try {
          onEvent(currentEvent, JSON.parse(data) as Record<string, unknown>);
        } catch {
          // Ignore malformed SSE frames and keep consuming the stream.
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          buffer += decoder.decode();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const normalized = buffer.replace(/\r\n/g, "\n");
        const lines = normalized.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line) {
            flushEvent();
            continue;
          }
          if (line.startsWith(":")) {
            continue;
          }
          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
            continue;
          }
          if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trimStart());
          }
        }
      }

      if (buffer.trim()) {
        const trailingLines = buffer.replace(/\r\n/g, "\n").split("\n");
        for (const line of trailingLines) {
          if (!line) {
            flushEvent();
            continue;
          }
          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
            continue;
          }
          if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trimStart());
          }
        }
      }

      flushEvent();
      return;
    } catch (error) {
      if (error instanceof ProviderRequestError) {
        throw error;
      }
      const details = classifyProviderFailure({ error });
      if (details.retryable && attempt < MAX_RETRY_ATTEMPTS - 1) {
        const delay = backoffDelay(attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw new ProviderRequestError(details.title, details);
    }
  }

  throw new ProviderRequestError("Provider stream failed", {
    kind: "unknown",
    title: "Provider stream failed",
    detail: "The streaming request failed after multiple attempts.",
    retryable: false,
    suggestions: ["Run `cvmCode doctor` to inspect your provider settings."]
  });
}

function extractUsage(response: Record<string, unknown>): TokenUsage | undefined {
  const usage = typeof response.usage === "object" && response.usage !== null ? response.usage as Record<string, unknown> : null;
  if (!usage) {
    return undefined;
  }

  const inputTokens =
    typeof usage.input_tokens === "number" ? usage.input_tokens : undefined;
  const outputTokens =
    typeof usage.output_tokens === "number" ? usage.output_tokens : undefined;
  const totalTokens = typeof usage.total_tokens === "number" ? usage.total_tokens : undefined;

  if (
    typeof inputTokens !== "number" &&
    typeof outputTokens !== "number" &&
    typeof totalTokens !== "number"
  ) {
    return undefined;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens: totalTokens ?? [inputTokens, outputTokens].every((value) => typeof value === "number")
      ? (inputTokens ?? 0) + (outputTokens ?? 0)
      : undefined
  };
}

function mergeUsage(left?: TokenUsage, right?: TokenUsage): TokenUsage | undefined {
  if (!left && !right) {
    return undefined;
  }

  return {
    inputTokens: (left?.inputTokens ?? 0) + (right?.inputTokens ?? 0) || undefined,
    outputTokens: (left?.outputTokens ?? 0) + (right?.outputTokens ?? 0) || undefined,
    totalTokens: (left?.totalTokens ?? 0) + (right?.totalTokens ?? 0) || undefined
  };
}

type AnthropicMessageContent =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | AnthropicMessageContent[];
};

function toAnthropicMessages(history: ChatMessage[], systemPrompt: string): AnthropicMessage[] {
  const messages: AnthropicMessage[] = [];

  messages.push({ role: "user", content: systemPrompt });

  for (const message of history) {
    if (message.role === "system") {
      continue;
    }
    const role = message.role === "assistant" ? "assistant" : "user";
    messages.push({ role, content: message.content });
  }

  return messages;
}

function toAnthropicTools() {
  return agentToolDefinitions.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters
  }));
}

function extractAnthropicText(response: Record<string, unknown>): string {
  const content = Array.isArray(response.content) ? response.content : [];
  const parts: string[] = [];

  for (const entry of content) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    if ((entry as { type?: string }).type === "text" && typeof (entry as { text?: string }).text === "string") {
      parts.push((entry as { text: string }).text);
    }
  }

  return parts.join("\n").trim();
}

function extractAnthropicThinking(response: Record<string, unknown>): string {
  const content = Array.isArray(response.content) ? response.content : [];
  const parts: string[] = [];

  for (const entry of content) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const entryType = (entry as { type?: string }).type;
    if (entryType === "thinking" && typeof (entry as { thinking?: string }).thinking === "string") {
      parts.push((entry as { thinking: string }).thinking);
    }
  }

  return parts.join("\n\n").trim();
}

interface AnthropicToolUse {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

function extractToolCalls(response: Record<string, unknown>): AnthropicToolUse[] {
  const content = Array.isArray(response.content) ? response.content : [];
  return content.filter(
    (entry): entry is AnthropicToolUse =>
      typeof entry === "object" &&
      entry !== null &&
      (entry as { type?: string }).type === "tool_use" &&
      typeof (entry as { name?: string }).name === "string" &&
      typeof (entry as { input?: Record<string, unknown> }).input === "object"
  ).map((entry) => ({
    type: entry.type,
    id: entry.id,
    name: entry.name,
    input: entry.input
  }));
}

async function runAnthropicTurn(input: {
  config: AppConfig;
  instructions: string;
  history: ChatMessage[];
  cwd: string;
  forceToolRetry?: boolean;
  stream?: AgentTurnStreamHandlers;
}): Promise<AgentTurnResult> {
  const lastUserInput = latestUserMessage(input.history);
  const toolRequired = taskLikelyRequiresTools(lastUserInput);
  const canStream = !toolRequired && typeof input.stream?.onTextDelta === "function";
  const messages = toAnthropicMessages(input.history, input.instructions);
  const maxTokens = 8192;

  let usedTools = false;
  let usage: TokenUsage | undefined;
  const toolCalls: Array<{ name: string; arguments: string }> = [];

  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop += 1) {
    let response: Record<string, unknown>;
    try {
      if (canStream && loop === 0) {
        let streamedText = "";
        let streamedUsage: TokenUsage | undefined;
        await postStream(
          input.config,
          "/v1/messages",
          {
            model: activeProvider(input.config).model,
            messages,
            max_tokens: maxTokens,
            stream: true,
            tools: toAnthropicTools()
          },
          (_eventName, payload) => {
            const type = typeof payload.type === "string" ? payload.type : undefined;
            if (type === "content_block_delta") {
              const delta = payload.delta;
              if (typeof delta === "object" && delta !== null) {
                const deltaType = (delta as { type?: string }).type;
                if (deltaType === "text_delta" && typeof (delta as { text?: string }).text === "string") {
                  const text = (delta as { text: string }).text;
                  streamedText += text;
                  input.stream?.onTextDelta?.(text);
                }
              }
            } else if (type === "message_delta") {
              streamedUsage = mergeUsage(streamedUsage, extractUsage(payload));
            }
          }
        );

        response = {
          content: [{ type: "text", text: streamedText }],
          usage: streamedUsage
        };
      } else {
        response = await postJson(input.config, "/v1/messages", {
          model: activeProvider(input.config).model,
          messages,
          max_tokens: maxTokens,
          tools: toolRequired ? toAnthropicTools() : undefined
        });
      }
      usage = mergeUsage(usage, extractUsage(response));
    } catch (error) {
      if (error instanceof ProviderRequestError && error.details.kind === "tool_unsupported") {
        if (toolRequired) {
          throw error;
        }
        response = await postJson(input.config, "/v1/messages", {
          model: activeProvider(input.config).model,
          messages,
          max_tokens: maxTokens
        });
        usage = mergeUsage(usage, extractUsage(response));
        return {
          text: extractAnthropicText(response),
          usedTools: false,
          thinking: extractAnthropicThinking(response),
          usage,
          toolCalls
        };
      }
      throw error;
    }

    const calls = extractToolCalls(response);

    if (calls.length === 0) {
      const text = extractAnthropicText(response);
      const thinking = extractAnthropicThinking(response);
      if (
        loop === 0 &&
        !input.forceToolRetry &&
        shouldForceToolRetry({
          lastUserMessage: lastUserInput,
          assistantText: text,
          usedTools
        })
      ) {
        return runAnthropicTurn({
          ...input,
          instructions: appendForcedToolInstruction(input.instructions),
          forceToolRetry: true
        });
      }
      return { text, usedTools, thinking, usage, toolCalls };
    }

    const priorContent = Array.isArray(response.content) ? response.content : [];
    const toolResults: Array<{ type: "tool_result"; tool_use_id: string; content: string }> = [];
    usedTools = true;

    for (const call of calls) {
      toolCalls.push({ name: call.name, arguments: JSON.stringify(call.input) });
      const result = await executeAgentTool({ cwd: input.cwd }, call.name, JSON.stringify(call.input));
      toolResults.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: JSON.stringify(result)
      });
    }

    messages.push({
      role: "assistant",
      content: priorContent
    });
    messages.push({
      role: "user",
      content: toolResults
    });
  }

  throw new ProviderRequestError("Agent tool loop limit reached", {
    kind: "server",
    title: "Agent tool loop limit reached",
    detail: `The agent used tools for ${MAX_TOOL_LOOPS} consecutive turns without producing a final response.`,
    retryable: false,
    suggestions: [
      "Rephrase your request to be more specific.",
      "Try switching to a different model.",
      "Use /doctor to check provider configuration."
    ]
  });
}

export async function runAgentTurn(input: {
  config: AppConfig;
  instructions: string;
  history: ChatMessage[];
  cwd: string;
  stream?: AgentTurnStreamHandlers;
}): Promise<AgentTurnResult> {
  return runAnthropicTurn(input);
}
