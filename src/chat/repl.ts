import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import prompts from "prompts";
import { loadConfigWithAutoFix, updateConfig } from "../config/store.js";
import { composeSystemPrompt } from "../prompt/compose.js";
import { ProviderRequestError, renderProviderFailure } from "../provider/errors.js";
import { summarizeRepository } from "../repo/context.js";
import { listProviderModels, runAgentTurn } from "../provider/openai-compatible.js";
import { ChatMessage, ProviderSettings, RepoSummary } from "../types.js";
import {
  panel,
  renderAssistantMessage,
  renderChatIntro,
  renderCommandPalette,
  renderConfigPanel,
  renderDoctorPanel,
  renderErrorMessage,
  renderMutedInfo,
  renderPrompt,
  renderStreamingChunk,
  renderStreamingEnd,
  renderStreamingStart,
  renderThinkingPanel,
  renderUserMessage,
  withThinking
} from "../ui/tui.js";

const COMMAND_HINTS = [
  "/help      show command help",
  "/add-provider add a new provider",
  "/clear     clear the screen and redraw the header",
  "/config    show active config summary",
  "/context   change context window or root directory",
  "/doctor    show provider health info",
  "/models    list models from the active provider",
  "/model     change the active model",
  "/provider  change the active provider",
  "/endpoint  switch between responses and chat-completions",
  "/remove-provider remove a provider",
  "/rename-provider rename a provider",
  "/baseurl   change active provider base URL",
  "/apikey    change active provider auth mode",
  "/headers   change active provider headers",
  "/showthink show provider reasoning when available",
  "/hidethink hide provider reasoning panels",
  "/exit      quit cvmCode"
];

function parseHeaderLines(inputValue: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const rawLine of inputValue.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const separator = line.indexOf(":");
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key && value) {
      headers[key] = value;
    }
  }
  return headers;
}

function summarizeApiKeySource(provider: ProviderSettings | undefined): string {
  if (!provider) {
    return "missing";
  }
  if (provider.apiKey) {
    return "stored in config";
  }
  if (provider.apiKeyEnv) {
    return `${provider.apiKeyEnv}${process.env[provider.apiKeyEnv] ? " (set)" : " (missing)"}`;
  }
  return "missing";
}

function filterModelList(models: string[], query: string): string[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return models;
  }
  return models.filter((model) => model.toLowerCase().includes(trimmed));
}

function commandMatches(inputValue: string): string[] {
  const trimmed = inputValue.trim().toLowerCase();
  if (!trimmed.startsWith("/")) {
    return [];
  }
  return COMMAND_HINTS.filter((command) => command.toLowerCase().includes(trimmed));
}

function contextWindowSummary(repo: RepoSummary): string {
  return `${repo.files.length}/${repo.fileLimit} files · ${repo.snippets.length}/${repo.snippetLimit} snippets · ${repo.snippetBytes} chars`;
}

async function chooseModelInteractively(input: {
  runPromptSession: <T>(questions: T) => Promise<any>;
  provider: ProviderSettings | undefined;
  config: { provider: string; providers: Record<string, ProviderSettings> };
}): Promise<string> {
  const result = await withThinking("Loading models", listProviderModels(input.config as any));
  let nextModel: string | undefined;

  if (result.models.length > 0) {
    const filterAnswer = await input.runPromptSession({
      type: "text",
      name: "value",
      message: "Filter models (blank for all)",
      initial: ""
    });
    const filteredModels = filterModelList(
      result.models,
      typeof filterAnswer.value === "string" ? filterAnswer.value : ""
    );
    const choicePool = filteredModels.length > 0 ? filteredModels : result.models;

    const answer = await input.runPromptSession({
      type: "select",
      name: "value",
      message: `Choose a model (${choicePool.length} shown)`,
      choices: [
        ...choicePool.slice(0, 100).map((model) => ({
          title: `${model}${model === input.provider?.model ? "  [active]" : ""}`,
          value: model
        })),
        { title: "Enter custom model id", value: "__custom__" }
      ],
      initial: Math.max(0, choicePool.indexOf(input.provider?.model ?? ""))
    });

    if (answer.value === "__custom__") {
      const custom = await input.runPromptSession({
        type: "text",
        name: "value",
        message: "Custom model id",
        initial: input.provider?.model ?? ""
      });
      nextModel = typeof custom.value === "string" ? custom.value.trim() : "";
    } else {
      nextModel = typeof answer.value === "string" ? answer.value : "";
    }
  } else {
    const custom = await input.runPromptSession({
      type: "text",
      name: "value",
      message: "No /v1/models result. Enter a custom model id",
      initial: input.provider?.model ?? "gpt-4.1"
    });
    nextModel = typeof custom.value === "string" ? custom.value.trim() : "";
  }

  return nextModel || input.provider?.model || "gpt-4.1";
}

async function createProviderInteractively(input: {
  runPromptSession: <T>(questions: T) => Promise<any>;
}): Promise<{
  createdName: string;
  settings: ProviderSettings;
}> {
  const created = await input.runPromptSession([
    {
      type: "text",
      name: "name",
      message: "Provider name",
      initial: "custom"
    },
    {
      type: "text",
      name: "baseURL",
      message: "Base URL",
      initial: "https://api.openai.com/v1"
    },
    {
      type: "select",
      name: "endpointMode",
      message: "Endpoint mode",
      choices: [
        { title: "responses", value: "responses" },
        { title: "chat-completions", value: "chat-completions" }
      ],
      initial: 0
    },
    {
      type: "text",
      name: "apiKeyEnv",
      message: "API key env var",
      initial: "OPENAI_API_KEY"
    },
    {
      type: "text",
      name: "headers",
      message: "Optional headers as 'Key: Value' lines (blank to skip)",
      initial: ""
    }
  ]);

  const createdName =
    typeof created.name === "string" && created.name.trim().length > 0 ? created.name.trim() : "custom";
  const settings: ProviderSettings = {
    type: "openai-compatible",
    endpointMode: created.endpointMode === "chat-completions" ? "chat-completions" : "responses",
    baseURL:
      typeof created.baseURL === "string" && created.baseURL.trim().length > 0
        ? created.baseURL.trim()
        : "https://api.openai.com/v1",
    ...(typeof created.apiKeyEnv === "string" && created.apiKeyEnv.trim().length > 0
      ? { apiKeyEnv: created.apiKeyEnv.trim() }
      : {}),
    ...(typeof created.headers === "string" && created.headers.trim().length > 0
      ? { headers: parseHeaderLines(created.headers) }
      : {}),
    model: "gpt-4.1"
  };

  const model = await chooseModelInteractively({
    runPromptSession: input.runPromptSession,
    provider: settings,
    config: {
      provider: createdName,
      providers: {
        [createdName]: settings
      }
    }
  });

  return {
    createdName,
    settings: {
      ...settings,
      model
    }
  };
}

export async function startChat(cwd: string): Promise<void> {
  let { config } = await loadConfigWithAutoFix();
  let contextRoot = cwd;
  let contextFileLimit = 10;
  let contextSnippetLimit = 5;
  let contextSnippetBytes = 1200;
  let showThinking = false;
  let repo = await summarizeRepository(contextRoot, {
    fileLimit: contextFileLimit,
    snippetLimit: contextSnippetLimit,
    snippetBytes: contextSnippetBytes
  });
  let rl = readline.createInterface({ input, output });
  let provider = config.providers[config.provider];
  let instructions = composeSystemPrompt(repo);
  let sessionChangeCount = 0;

  const history: ChatMessage[] = [
    {
      role: "system",
      content: instructions
    }
  ];

  function applyLiveConfig(nextConfig: typeof config, notice: string) {
    config = nextConfig;
    provider = config.providers[config.provider];
    instructions = composeSystemPrompt(repo);
    history[0] = { role: "system", content: instructions };
    sessionChangeCount += 1;
    renderMutedInfo(`${notice} Session preserved.`);
    console.log("");
  }

  async function reloadRepositoryContext(notice: string) {
    repo = await summarizeRepository(contextRoot, {
      fileLimit: contextFileLimit,
      snippetLimit: contextSnippetLimit,
      snippetBytes: contextSnippetBytes
    });
    instructions = composeSystemPrompt(repo);
    history[0] = { role: "system", content: instructions };
    renderMutedInfo(`${notice} Context reloaded.`);
    console.log("");
  }

  async function runPromptSession<T>(questions: T): Promise<any> {
    rl.pause();
    const result = await prompts(questions as any);
    rl.resume();
    return result;
  }

  renderChatIntro({
    cwd: repo.root,
    provider: config.provider,
    model: provider?.model ?? "unknown",
    endpointMode: provider?.endpointMode ?? "responses",
    fileCount: repo.files.length,
    contextWindow: contextWindowSummary(repo)
  });

  while (true) {
    const line = (await rl.question(renderPrompt())).trim();
    if (!line) {
      continue;
    }

    const matchingCommands = commandMatches(line);
    if (matchingCommands.length > 1 && !COMMAND_HINTS.some((command) => command.startsWith(line))) {
      renderCommandPalette(matchingCommands);
      continue;
    }

    if (line === "/exit" || line === "/quit") {
      break;
    }
    if (line === "/help") {
      renderCommandPalette(COMMAND_HINTS);
      continue;
    }
    if (line === "/showthink") {
      showThinking = true;
      renderMutedInfo("Provider reasoning will be shown when available.");
      console.log("");
      continue;
    }
    if (line === "/hidethink") {
      showThinking = false;
      renderMutedInfo("Provider reasoning panels hidden.");
      console.log("");
      continue;
    }
    if (line === "/clear") {
      console.clear();
      renderChatIntro({
        cwd: repo.root,
        provider: config.provider,
        model: provider?.model ?? "unknown",
        endpointMode: provider?.endpointMode ?? "responses",
        fileCount: repo.files.length,
        contextWindow: contextWindowSummary(repo)
      });
      continue;
    }
    if (line === "/config") {
      renderConfigPanel({
        provider: config.provider,
        endpointMode: provider?.endpointMode ?? "responses",
        baseURL: provider?.baseURL ?? "missing",
        model: provider?.model ?? "missing",
        apiKeySource: summarizeApiKeySource(provider)
      });
      continue;
    }
    if (line === "/context") {
      const answer = await runPromptSession([
        {
          type: "number",
          name: "fileLimit",
          message: "How many files should the context window scan?",
          initial: contextFileLimit,
          min: 1,
          max: 200
        },
        {
          type: "number",
          name: "snippetLimit",
          message: "How many file snippets should be injected into the prompt?",
          initial: contextSnippetLimit,
          min: 1,
          max: 20
        },
        {
          type: "number",
          name: "snippetBytes",
          message: "How many characters per snippet?",
          initial: contextSnippetBytes,
          min: 200,
          max: 8000
        },
        {
          type: "text",
          name: "root",
          message: "Context root directory",
          initial: contextRoot
        }
      ]);

      contextFileLimit = typeof answer.fileLimit === "number" ? answer.fileLimit : contextFileLimit;
      contextSnippetLimit = typeof answer.snippetLimit === "number" ? answer.snippetLimit : contextSnippetLimit;
      contextSnippetBytes = typeof answer.snippetBytes === "number" ? answer.snippetBytes : contextSnippetBytes;
      contextRoot = typeof answer.root === "string" && answer.root.trim().length > 0 ? path.resolve(answer.root.trim()) : contextRoot;
      await reloadRepositoryContext(`Context updated to ${contextWindowSummary(repo)} at ${contextRoot}.`);
      continue;
    }
    if (line === "/doctor") {
      renderDoctorPanel({
        provider: config.provider,
        endpointMode: provider?.endpointMode ?? "responses",
        baseURL: provider?.baseURL ?? "missing",
        model: provider?.model ?? "missing",
        authStatus: summarizeApiKeySource(provider)
      });
      continue;
    }
    if (line === "/models") {
      const result = await withThinking("Loading models", listProviderModels(config));
      if (result.models.length > 0) {
        panel(
          `Models (${result.source})`,
          result.models.map((model, index) =>
            `${String(index + 1).padStart(2, " ")}. ${model}${model === provider?.model ? "  [active]" : ""}`
          ),
          "cyan"
        );
      } else {
        panel("Models", [
          "No models were returned by /v1/models.",
          "Use /model to type a custom model id."
        ], "yellow");
      }
      console.log("");
      continue;
    }
    if (line === "/model") {
      const nextModel = await chooseModelInteractively({
        runPromptSession,
        provider,
        config
      });

      if (nextModel) {
        config = await updateConfig((current) => {
          const active = current.providers[current.provider];
          if (!active) {
            return current;
          }
          active.model = nextModel;
          return current;
        });
        applyLiveConfig(config, `Active model changed to ${config.providers[config.provider]?.model ?? nextModel}.`);
      }
      continue;
    }
    if (line === "/provider") {
      const providerNames = Object.keys(config.providers);
      const answer = await runPromptSession({
        type: "select",
        name: "value",
        message: "Choose a provider",
        choices: [
          ...providerNames.map((name) => ({ title: name, value: name })),
          { title: "Create new provider", value: "__new__" }
        ],
        initial: Math.max(0, providerNames.indexOf(config.provider))
      });

      let nextProvider = typeof answer.value === "string" ? answer.value : "";
      if (nextProvider === "__new__") {
        const created = await createProviderInteractively({ runPromptSession });

        config = await updateConfig((current) => {
          current.providers[created.createdName] = created.settings;
          current.provider = created.createdName;
          return current;
        });
        nextProvider = created.createdName;
      } else if (nextProvider) {
        config = await updateConfig((current) => {
          current.provider = nextProvider;
          return current;
        });
      }

      if (nextProvider) {
        provider = config.providers[config.provider];
        applyLiveConfig(
          config,
          `Active provider changed to ${config.provider}${provider ? ` (${provider.model})` : ""}.`
        );
      }
      continue;
    }
    if (line === "/endpoint") {
      const answer = await runPromptSession({
        type: "select",
        name: "value",
        message: "Choose endpoint mode",
        choices: [
          { title: "responses (recommended)", value: "responses" },
          { title: "chat-completions", value: "chat-completions" }
        ],
        initial: provider?.endpointMode === "chat-completions" ? 1 : 0
      });
      const nextMode =
        answer.value === "chat-completions" ? "chat-completions" : answer.value === "responses" ? "responses" : "";
      if (nextMode) {
        const nextConfig = await updateConfig((current) => {
          const active = current.providers[current.provider];
          if (!active) {
            return current;
          }
          active.endpointMode = nextMode;
          return current;
        });
        applyLiveConfig(nextConfig, `Endpoint mode changed to ${nextConfig.providers[nextConfig.provider]?.endpointMode ?? nextMode}.`);
      }
      continue;
    }
    if (line === "/add-provider") {
      const created = await createProviderInteractively({ runPromptSession });

      const nextConfig = await updateConfig((current) => {
        current.providers[created.createdName] = created.settings;
        current.provider = created.createdName;
        return current;
      });
      applyLiveConfig(nextConfig, `Added provider ${created.createdName} and switched to it.`);
      continue;
    }
    if (line === "/remove-provider") {
      const providerNames = Object.keys(config.providers);
      if (providerNames.length <= 1) {
        renderMutedInfo("You need at least one provider configured.");
        console.log("");
        continue;
      }
      const answer = await runPromptSession({
        type: "select",
        name: "value",
        message: "Choose a provider to remove",
        choices: providerNames.map((name) => ({
          title: `${name}${name === config.provider ? " (active)" : ""}`,
          value: name
        }))
      });
      const target = typeof answer.value === "string" ? answer.value : "";
      if (!target) {
        continue;
      }
      const nextConfig = await updateConfig((current) => {
        delete current.providers[target];
        if (current.provider === target) {
          current.provider = Object.keys(current.providers)[0] ?? "openai";
        }
        return current;
      });
      applyLiveConfig(nextConfig, `Removed provider ${target}. Active provider: ${nextConfig.provider}.`);
      continue;
    }
    if (line === "/rename-provider") {
      const providerNames = Object.keys(config.providers);
      const selected = await runPromptSession({
        type: "select",
        name: "value",
        message: "Choose a provider to rename",
        choices: providerNames.map((name) => ({ title: name, value: name })),
        initial: Math.max(0, providerNames.indexOf(config.provider))
      });
      const oldName = typeof selected.value === "string" ? selected.value : "";
      if (!oldName) {
        continue;
      }
      const renamed = await runPromptSession({
        type: "text",
        name: "value",
        message: "New provider name",
        initial: oldName
      });
      const newName = typeof renamed.value === "string" ? renamed.value.trim() : "";
      if (!newName || newName === oldName) {
        continue;
      }
      const nextConfig = await updateConfig((current) => {
        const existing = current.providers[oldName];
        if (!existing) {
          return current;
        }
        current.providers[newName] = existing;
        delete current.providers[oldName];
        if (current.provider === oldName) {
          current.provider = newName;
        }
        return current;
      });
      applyLiveConfig(nextConfig, `Renamed provider ${oldName} to ${newName}.`);
      continue;
    }
    if (line === "/baseurl") {
      const answer = await runPromptSession({
        type: "text",
        name: "value",
        message: "New base URL",
        initial: provider?.baseURL ?? "https://api.openai.com/v1"
      });
      const nextBaseURL = typeof answer.value === "string" ? answer.value.trim() : "";
      if (!nextBaseURL) {
        continue;
      }
      const nextConfig = await updateConfig((current) => {
        const active = current.providers[current.provider];
        if (!active) {
          return current;
        }
        active.baseURL = nextBaseURL;
        return current;
      });
      applyLiveConfig(nextConfig, `Base URL updated to ${nextBaseURL}.`);
      continue;
    }
    if (line === "/apikey") {
      const mode = await runPromptSession({
        type: "select",
        name: "value",
        message: `How should ${config.provider} authenticate?`,
        choices: [
          {
            title: "Environment variable",
            description: `Current: ${provider?.apiKeyEnv ?? "not set"}`,
            value: "env"
          },
          {
            title: "Store directly in config",
            description: provider?.apiKey ? "Current: key stored" : "Current: not stored",
            value: "inline"
          },
          { title: "Remove configured API key", value: "clear" }
        ]
      });
      const selectedMode = typeof mode.value === "string" ? mode.value : "";
      if (!selectedMode) {
        continue;
      }

      if (selectedMode === "env") {
        const envAnswer = await runPromptSession({
          type: "text",
          name: "value",
          message: `Environment variable name for ${config.provider}`,
          initial: provider?.apiKeyEnv ?? "OPENAI_API_KEY"
        });
        const envName = typeof envAnswer.value === "string" ? envAnswer.value.trim() : "";
        if (!envName) {
          continue;
        }
        const nextConfig = await updateConfig((current) => {
          const active = current.providers[current.provider];
          if (!active) {
            return current;
          }
          active.apiKeyEnv = envName;
          delete active.apiKey;
          return current;
        });
        applyLiveConfig(nextConfig, `API key source changed to env var ${envName}.`);
      } else if (selectedMode === "inline") {
        const keyAnswer = await runPromptSession({
          type: "password",
          name: "value",
          message: `Paste API key for ${config.provider}`
        });
        const apiKey = typeof keyAnswer.value === "string" ? keyAnswer.value.trim() : "";
        if (!apiKey) {
          continue;
        }
        const nextConfig = await updateConfig((current) => {
          const active = current.providers[current.provider];
          if (!active) {
            return current;
          }
          active.apiKey = apiKey;
          delete active.apiKeyEnv;
          return current;
        });
        applyLiveConfig(nextConfig, `API key stored in config for ${config.provider}.`);
        renderMutedInfo("API key received and saved for the active provider.");
        console.log("");
      } else {
        const nextConfig = await updateConfig((current) => {
          const active = current.providers[current.provider];
          if (!active) {
            return current;
          }
          delete active.apiKey;
          delete active.apiKeyEnv;
          return current;
        });
        applyLiveConfig(nextConfig, "Removed configured API key source from active provider.");
      }
      continue;
    }
    if (line === "/headers") {
      const currentHeaders = Object.entries(provider?.headers ?? {})
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n");
      const answer = await runPromptSession({
        type: "text",
        name: "value",
        message: "Headers as 'Key: Value' lines (blank to clear)",
        initial: currentHeaders
      });
      const headerText = typeof answer.value === "string" ? answer.value : "";
      const parsedHeaders = parseHeaderLines(headerText);
      const nextConfig = await updateConfig((current) => {
        const active = current.providers[current.provider];
        if (!active) {
          return current;
        }
        if (Object.keys(parsedHeaders).length > 0) {
          active.headers = parsedHeaders;
        } else {
          delete active.headers;
        }
        return current;
      });
      applyLiveConfig(
        nextConfig,
        Object.keys(parsedHeaders).length > 0
          ? `Updated ${Object.keys(parsedHeaders).length} header(s) for ${config.provider}.`
          : `Cleared custom headers for ${config.provider}.`
      );
      continue;
    }

    renderUserMessage(line);
    history.push({ role: "user", content: line });

    try {
      instructions = composeSystemPrompt(repo);
      history[0] = { role: "system", content: instructions };
      const result = await withThinking(
        showThinking ? "Thinking (reasoning capture enabled)" : "Thinking",
        runAgentTurn({
          config,
          instructions,
          history,
          cwd: repo.root
        })
      );
      history.push({ role: "assistant", content: result.text });
      if (showThinking && result.thinking) {
        renderThinkingPanel(result.thinking);
      }
      renderStreamingStart();
      renderStreamingChunk(result.text);
      renderStreamingEnd();
      if (sessionChangeCount > 0) {
        renderMutedInfo(`Live session changes applied: ${sessionChangeCount}`);
        console.log("");
        sessionChangeCount = 0;
      }
    } catch (error) {
      history.pop();
      const rendered =
        error instanceof ProviderRequestError
          ? renderProviderFailure(error.details)
          : error instanceof Error
            ? error.message
            : String(error);
      renderErrorMessage(rendered);
      renderMutedInfo("Tip: use /doctor to inspect provider config.");
      console.log("");
    }
  }

  await rl.close();
}
