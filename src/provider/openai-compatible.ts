import { AgentTurnResult, AppConfig, ChatMessage, ProviderModelListResult, TokenUsage } from "../types.js";
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
    headers.Authorization = `Bearer ${apiKey}`;
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

function extractUsage(response: Record<string, unknown>): TokenUsage | undefined {
  const usage = typeof response.usage === "object" && response.usage !== null ? response.usage as Record<string, unknown> : null;
  if (!usage) {
    return undefined;
  }

  const inputTokens =
    typeof usage.prompt_tokens === "number"
      ? usage.prompt_tokens
      : typeof usage.input_tokens === "number"
        ? usage.input_tokens
        : undefined;
  const outputTokens =
    typeof usage.completion_tokens === "number"
      ? usage.completion_tokens
      : typeof usage.output_tokens === "number"
        ? usage.output_tokens
        : undefined;
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

function mapHistoryToResponsesInput(history: ChatMessage[]) {
  return history.map((message) => ({
    role: message.role === "assistant" ? "assistant" : message.role === "system" ? "system" : "user",
    content: [{ type: "input_text", text: message.content }]
  }));
}

function extractResponsesText(response: Record<string, unknown>): string {
  const output = Array.isArray(response.output) ? response.output : [];
  const parts: string[] = [];

  for (const item of output) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    if ((item as { type?: string }).type !== "message") {
      continue;
    }
    const content = Array.isArray((item as { content?: unknown[] }).content)
      ? ((item as { content?: unknown[] }).content as unknown[])
      : [];
    for (const entry of content) {
      if (
        typeof entry === "object" &&
        entry !== null &&
        (entry as { type?: string }).type === "output_text" &&
        typeof (entry as { text?: string }).text === "string"
      ) {
        parts.push((entry as { text: string }).text);
      }
    }
  }

  return parts.join("\n").trim();
}

function extractResponsesThinking(response: Record<string, unknown>): string {
  const output = Array.isArray(response.output) ? response.output : [];
  const parts: string[] = [];

  for (const item of output) {
    if (typeof item !== "object" || item === null) {
      continue;
    }

    const itemType = (item as { type?: string }).type;
    if (itemType === "reasoning" && typeof (item as { summary?: string }).summary === "string") {
      parts.push((item as { summary: string }).summary);
    }

    const content = Array.isArray((item as { content?: unknown[] }).content)
      ? ((item as { content?: unknown[] }).content as unknown[])
      : [];
    for (const entry of content) {
      if (typeof entry !== "object" || entry === null) {
        continue;
      }
      const entryType = (entry as { type?: string }).type;
      if (
        (entryType === "reasoning" || entryType === "thinking" || entryType === "summary_text") &&
        typeof (entry as { text?: string }).text === "string"
      ) {
        parts.push((entry as { text: string }).text);
      }
      if (
        entryType === "reasoning" &&
        typeof (entry as { summary?: string }).summary === "string"
      ) {
        parts.push((entry as { summary: string }).summary);
      }
    }
  }

  return parts.join("\n\n").trim();
}

function extractResponsesFunctionCalls(response: Record<string, unknown>) {
  const output = Array.isArray(response.output) ? response.output : [];
  return output.filter(
    (item): item is { type: string; name: string; arguments: string; call_id: string } =>
      typeof item === "object" &&
      item !== null &&
      (item as { type?: string }).type === "function_call" &&
      typeof (item as { name?: string }).name === "string" &&
      typeof (item as { arguments?: string }).arguments === "string" &&
      typeof (item as { call_id?: string }).call_id === "string"
  );
}

async function runResponsesTurn(input: {
  config: AppConfig;
  instructions: string;
  history: ChatMessage[];
  cwd: string;
  forceToolRetry?: boolean;
}): Promise<AgentTurnResult> {
  const lastUserInput = latestUserMessage(input.history);
  const toolRequired = taskLikelyRequiresTools(lastUserInput);
  let response: Record<string, unknown>;
  try {
    response = await postJson(input.config, "/responses", {
      model: activeProvider(input.config).model,
      instructions: input.instructions,
      input: mapHistoryToResponsesInput(input.history),
      tools: agentToolDefinitions
    });
  } catch (error) {
    if (error instanceof ProviderRequestError && error.details.kind === "tool_unsupported") {
      if (toolRequired) {
        throw error;
      }
      response = await postJson(input.config, "/responses", {
        model: activeProvider(input.config).model,
        instructions: input.instructions,
        input: mapHistoryToResponsesInput(input.history)
      });
      return {
        text: extractResponsesText(response),
        usedTools: false,
        thinking: extractResponsesThinking(response),
        usage: extractUsage(response)
      };
    }
    throw error;
  }

  let usedTools = false;
  let usage = extractUsage(response);
  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop += 1) {
    const functionCalls = extractResponsesFunctionCalls(response);
    if (functionCalls.length === 0) {
      const text = extractResponsesText(response);
      const thinking = extractResponsesThinking(response);
      if (
        !input.forceToolRetry &&
        shouldForceToolRetry({
          lastUserMessage: lastUserInput,
          assistantText: text,
          usedTools
        })
      ) {
        return runResponsesTurn({
          ...input,
          instructions: appendForcedToolInstruction(input.instructions),
          forceToolRetry: true
        });
      }
      return { text, usedTools, thinking, usage };
    }

    const priorOutput = Array.isArray(response.output) ? response.output : [];
    const toolOutputs = [];
    usedTools = true;
    for (const call of functionCalls) {
      const result = await executeAgentTool({ cwd: input.cwd }, call.name, call.arguments);
      toolOutputs.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result)
      });
    }

    response = await postJson(input.config, "/responses", {
      model: activeProvider(input.config).model,
      instructions: input.instructions,
      input: [...priorOutput, ...toolOutputs],
      tools: agentToolDefinitions
    });
    usage = mergeUsage(usage, extractUsage(response));
  }

  throw new ProviderRequestError("Agent tool loop limit reached", {
    kind: "server",
    title: "Agent tool loop limit reached",
    detail: `The agent made ${MAX_TOOL_LOOPS} tool calls without producing a final text response.`,
    retryable: false,
    suggestions: [
      "Rephrase your request to be more specific.",
      "Try switching to a different model or endpoint mode.",
      "Use /doctor to check provider configuration."
    ]
  });
}

type ChatCompletionToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

function toChatTools() {
  return agentToolDefinitions.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      strict: tool.strict
    }
  }));
}

function extractChatCompletionMessage(response: Record<string, unknown>) {
  const choice = Array.isArray(response.choices) ? response.choices[0] : undefined;
  const message =
    choice && typeof choice === "object" ? (choice as { message?: Record<string, unknown> }).message : undefined;
  return typeof message === "object" && message !== null ? message : {};
}

function extractChatCompletionThinking(message: Record<string, unknown>): string {
  const parts: string[] = [];

  if (typeof message.reasoning === "string") {
    parts.push(message.reasoning);
  }
  if (typeof message.reasoning_content === "string") {
    parts.push(message.reasoning_content);
  }
  if (typeof message.thinking === "string") {
    parts.push(message.thinking);
  }

  const content = Array.isArray(message.content) ? message.content : [];
  for (const entry of content) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const entryType = (entry as { type?: string }).type;
    if (
      (entryType === "reasoning" || entryType === "thinking" || entryType === "summary_text") &&
      typeof (entry as { text?: string }).text === "string"
    ) {
      parts.push((entry as { text: string }).text);
    }
  }

  return parts.join("\n\n").trim();
}

async function runChatCompletionsTurn(input: {
  config: AppConfig;
  instructions: string;
  history: ChatMessage[];
  cwd: string;
  forceToolRetry?: boolean;
}): Promise<AgentTurnResult> {
  const lastUserInput = latestUserMessage(input.history);
  const toolRequired = taskLikelyRequiresTools(lastUserInput);
  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: input.instructions },
    ...input.history
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role,
        content: message.content
      }))
  ];
  let usedTools = false;
  let usage: TokenUsage | undefined;

  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop += 1) {
    let response: Record<string, unknown>;
    try {
      response = await postJson(input.config, "/chat/completions", {
        model: activeProvider(input.config).model,
        messages,
        tools: toChatTools(),
        tool_choice: "auto"
      });
      usage = mergeUsage(usage, extractUsage(response));
    } catch (error) {
      if (error instanceof ProviderRequestError && error.details.kind === "tool_unsupported") {
        if (toolRequired) {
          throw error;
        }
        response = await postJson(input.config, "/chat/completions", {
          model: activeProvider(input.config).model,
          messages
        });
        usage = mergeUsage(usage, extractUsage(response));
        const fallbackMessage = extractChatCompletionMessage(response);
        return {
          text:
            typeof fallbackMessage.content === "string"
              ? fallbackMessage.content.trim()
              : "",
          usedTools: false,
          thinking: extractChatCompletionThinking(fallbackMessage),
          usage
        };
      }
      throw error;
    }

    const message = extractChatCompletionMessage(response);
    const toolCalls = Array.isArray(message.tool_calls)
      ? (message.tool_calls as ChatCompletionToolCall[])
      : [];

    if (toolCalls.length === 0) {
      const text = typeof message.content === "string" ? message.content.trim() : "";
      const thinking = extractChatCompletionThinking(message);
      if (
        loop === 0 &&
        !input.forceToolRetry &&
        shouldForceToolRetry({
          lastUserMessage: lastUserInput,
          assistantText: text,
          usedTools
        })
      ) {
        return runChatCompletionsTurn({
          ...input,
          instructions: appendForcedToolInstruction(input.instructions),
          forceToolRetry: true
        });
      }
      return {
        text,
        usedTools,
        thinking,
        usage
      };
    }

    usedTools = true;
    messages.push({
      role: "assistant",
      content: typeof message.content === "string" ? message.content : "",
      tool_calls: toolCalls
    });

    for (const toolCall of toolCalls) {
      const result = await executeAgentTool(
        { cwd: input.cwd },
        toolCall.function.name,
        toolCall.function.arguments
      );
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result)
      });
    }
  }

  throw new ProviderRequestError("Agent tool loop limit reached", {
    kind: "server",
    title: "Agent tool loop limit reached",
    detail: `The agent used tools for ${MAX_TOOL_LOOPS} consecutive turns without producing a final response.`,
    retryable: false,
    suggestions: [
      "Rephrase your request to be more specific.",
      "Try switching to a different model or endpoint mode.",
      "Use /doctor to check provider configuration."
    ]
  });
}

export async function runAgentTurn(input: {
  config: AppConfig;
  instructions: string;
  history: ChatMessage[];
  cwd: string;
}): Promise<AgentTurnResult> {
  const provider = activeProvider(input.config);
  if (provider.endpointMode === "chat-completions") {
    return runChatCompletionsTurn(input);
  }
  return runResponsesTurn(input);
}

export async function listProviderModels(config: AppConfig): Promise<ProviderModelListResult> {
  const provider = activeProvider(config);
  const base = provider.baseURL.replace(/\/$/, "");

  try {
    const response = await fetch(`${base}/models`, {
      method: "GET",
      headers: createHeaders(config),
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      return { models: [], source: "manual" };
    }

    const json = (await response.json()) as { data?: Array<{ id?: string }> };
    const models = (json.data ?? [])
      .map((entry) => entry.id)
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .sort((a, b) => a.localeCompare(b));

    return { models, source: models.length > 0 ? "remote" : "manual" };
  } catch {
    return { models: [], source: "manual" };
  }
}
