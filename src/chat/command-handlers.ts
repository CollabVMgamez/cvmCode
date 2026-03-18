import path from "node:path";
import { updateConfig } from "../config/store.js";
import { listProviderModels } from "../provider/openai-compatible.js";
import { panel, renderChatIntro, renderCommandPalette, renderConfigPanel, renderDoctorPanel, renderMutedInfo, withThinking } from "../ui/tui.js";
import { AppConfig, ProviderSettings, RepoSummary } from "../types.js";

export const COMMAND_HINTS = [
  "/help           show command help",
  "/add-provider   add a new provider",
  "/clear          clear the screen and redraw the header",
  "/clear-history  clear the session message history",
  "/config         show active config summary",
  "/context        change context window or root directory",
  "/doctor         show provider health info",
  "/models         list models from the active provider",
  "/model          change the active model",
  "/provider       change the active provider",
  "/endpoint       switch between responses and chat-completions",
  "/remove-provider remove a provider",
  "/rename-provider rename a provider",
  "/baseurl        change active provider base URL",
  "/apikey         change active provider auth mode",
  "/headers        change active provider headers",
  "/showthink      show provider reasoning when available",
  "/hidethink      hide provider reasoning panels",
  "/exit           quit cvmCode"
];

export type RunPromptSession = <T>(questions: T) => Promise<any>;

export interface CommandHandlerState {
  config: AppConfig;
  provider: ProviderSettings | undefined;
  repo: RepoSummary;
  contextRoot: string;
  contextFileLimit: number;
  contextSnippetLimit: number;
  contextSnippetBytes: number;
  showThinking: boolean;
}

interface CommandHandlerDependencies {
  runPromptSession: RunPromptSession;
  applyLiveConfig: (nextConfig: AppConfig, notice: string) => void;
  reloadRepositoryContext: (notice: string) => Promise<void>;
  clearHistory: () => void;
}

export interface CommandHandlerResult {
  handled: boolean;
  exit?: boolean;
  state?: Partial<CommandHandlerState>;
}

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

export function commandMatches(inputValue: string): string[] {
  const trimmed = inputValue.trim().toLowerCase();
  if (!trimmed.startsWith("/")) {
    return [];
  }
  return COMMAND_HINTS.filter((command) => command.toLowerCase().includes(trimmed));
}

export function contextWindowSummary(repo: RepoSummary): string {
  return `${repo.files.length}/${repo.fileLimit} files · ${repo.snippets.length}/${repo.snippetLimit} snippets · ${repo.snippetBytes} chars`;
}

async function chooseModelInteractively(input: {
  runPromptSession: RunPromptSession;
  provider: ProviderSettings | undefined;
  config: Pick<AppConfig, "provider" | "providers">;
}): Promise<string> {
  const result = await withThinking("Loading models", listProviderModels(input.config as AppConfig));
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
  runPromptSession: RunPromptSession;
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

export async function handleSlashCommand(
  line: string,
  state: CommandHandlerState,
  deps: CommandHandlerDependencies
): Promise<CommandHandlerResult> {
  if (line === "/exit" || line === "/quit") {
    return { handled: true, exit: true };
  }
  if (line === "/help") {
    renderCommandPalette(COMMAND_HINTS);
    return { handled: true };
  }
  if (line === "/showthink") {
    renderMutedInfo("Provider reasoning will be shown when available.");
    console.log("");
    return { handled: true, state: { showThinking: true } };
  }
  if (line === "/hidethink") {
    renderMutedInfo("Provider reasoning panels hidden.");
    console.log("");
    return { handled: true, state: { showThinking: false } };
  }
  if (line === "/clear-history") {
    deps.clearHistory();
    renderMutedInfo("Session history cleared. Starting fresh.");
    console.log("");
    return { handled: true };
  }
  if (line === "/clear") {
    console.clear();
    renderChatIntro({
      cwd: state.repo.root,
      provider: state.config.provider,
      model: state.provider?.model ?? "unknown",
      endpointMode: state.provider?.endpointMode ?? "responses",
      fileCount: state.repo.files.length,
      contextWindow: contextWindowSummary(state.repo)
    });
    return { handled: true };
  }
  if (line === "/config") {
    renderConfigPanel({
      provider: state.config.provider,
      endpointMode: state.provider?.endpointMode ?? "responses",
      baseURL: state.provider?.baseURL ?? "missing",
      model: state.provider?.model ?? "missing",
      apiKeySource: summarizeApiKeySource(state.provider)
    });
    return { handled: true };
  }
  if (line === "/context") {
    const answer = await deps.runPromptSession([
      {
        type: "number",
        name: "fileLimit",
        message: "How many files should the context window scan?",
        initial: state.contextFileLimit,
        min: 1,
        max: 200
      },
      {
        type: "number",
        name: "snippetLimit",
        message: "How many file snippets should be injected into the prompt?",
        initial: state.contextSnippetLimit,
        min: 1,
        max: 20
      },
      {
        type: "number",
        name: "snippetBytes",
        message: "How many characters per snippet?",
        initial: state.contextSnippetBytes,
        min: 200,
        max: 8000
      },
      {
        type: "text",
        name: "root",
        message: "Context root directory",
        initial: state.contextRoot
      }
    ]);

    const nextState: Partial<CommandHandlerState> = {
      contextFileLimit: typeof answer.fileLimit === "number" ? answer.fileLimit : state.contextFileLimit,
      contextSnippetLimit: typeof answer.snippetLimit === "number" ? answer.snippetLimit : state.contextSnippetLimit,
      contextSnippetBytes: typeof answer.snippetBytes === "number" ? answer.snippetBytes : state.contextSnippetBytes,
      contextRoot:
        typeof answer.root === "string" && answer.root.trim().length > 0 ? path.resolve(answer.root.trim()) : state.contextRoot
    };

    await deps.reloadRepositoryContext(
      `Context updated to ${contextWindowSummary(state.repo)} at ${nextState.contextRoot ?? state.contextRoot}.`
    );
    return { handled: true, state: nextState };
  }
  if (line === "/doctor") {
    renderDoctorPanel({
      provider: state.config.provider,
      endpointMode: state.provider?.endpointMode ?? "responses",
      baseURL: state.provider?.baseURL ?? "missing",
      model: state.provider?.model ?? "missing",
      authStatus: summarizeApiKeySource(state.provider)
    });
    return { handled: true };
  }
  if (line === "/models") {
    const result = await withThinking("Loading models", listProviderModels(state.config));
    if (result.models.length > 0) {
      panel(
        `Models (${result.source})`,
        result.models.map(
          (model, index) =>
            `${String(index + 1).padStart(2, " ")}. ${model}${model === state.provider?.model ? "  [active]" : ""}`
        ),
        "cyan"
      );
    } else {
      panel("Models", ["No models were returned by /v1/models.", "Use /model to type a custom model id."], "yellow");
    }
    console.log("");
    return { handled: true };
  }
  if (line === "/model") {
    const nextModel = await chooseModelInteractively({
      runPromptSession: deps.runPromptSession,
      provider: state.provider,
      config: state.config
    });

    if (nextModel) {
      const nextConfig = await updateConfig((current) => {
        const active = current.providers[current.provider];
        if (!active) {
          return current;
        }
        active.model = nextModel;
        return current;
      });
      deps.applyLiveConfig(nextConfig, `Active model changed to ${nextConfig.providers[nextConfig.provider]?.model ?? nextModel}.`);
      return {
        handled: true,
        state: {
          config: nextConfig,
          provider: nextConfig.providers[nextConfig.provider]
        }
      };
    }
    return { handled: true };
  }
  if (line === "/provider") {
    const providerNames = Object.keys(state.config.providers);
    const answer = await deps.runPromptSession({
      type: "select",
      name: "value",
      message: "Choose a provider",
      choices: [
        ...providerNames.map((name) => ({ title: name, value: name })),
        { title: "Create new provider", value: "__new__" }
      ],
      initial: Math.max(0, providerNames.indexOf(state.config.provider))
    });

    let nextProvider = typeof answer.value === "string" ? answer.value : "";
    let nextConfig = state.config;
    if (nextProvider === "__new__") {
      const created = await createProviderInteractively({ runPromptSession: deps.runPromptSession });

      nextConfig = await updateConfig((current) => {
        current.providers[created.createdName] = created.settings;
        current.provider = created.createdName;
        return current;
      });
      nextProvider = created.createdName;
    } else if (nextProvider) {
      nextConfig = await updateConfig((current) => {
        current.provider = nextProvider;
        return current;
      });
    }

    if (nextProvider) {
      const nextActiveProvider = nextConfig.providers[nextConfig.provider];
      deps.applyLiveConfig(
        nextConfig,
        `Active provider changed to ${nextConfig.provider}${nextActiveProvider ? ` (${nextActiveProvider.model})` : ""}.`
      );
      return {
        handled: true,
        state: {
          config: nextConfig,
          provider: nextActiveProvider
        }
      };
    }
    return { handled: true };
  }
  if (line === "/endpoint") {
    const answer = await deps.runPromptSession({
      type: "select",
      name: "value",
      message: "Choose endpoint mode",
      choices: [
        { title: "responses (recommended)", value: "responses" },
        { title: "chat-completions", value: "chat-completions" }
      ],
      initial: state.provider?.endpointMode === "chat-completions" ? 1 : 0
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
      deps.applyLiveConfig(nextConfig, `Endpoint mode changed to ${nextConfig.providers[nextConfig.provider]?.endpointMode ?? nextMode}.`);
      return {
        handled: true,
        state: {
          config: nextConfig,
          provider: nextConfig.providers[nextConfig.provider]
        }
      };
    }
    return { handled: true };
  }
  if (line === "/add-provider") {
    const created = await createProviderInteractively({ runPromptSession: deps.runPromptSession });

    const nextConfig = await updateConfig((current) => {
      current.providers[created.createdName] = created.settings;
      current.provider = created.createdName;
      return current;
    });
    deps.applyLiveConfig(nextConfig, `Added provider ${created.createdName} and switched to it.`);
    return {
      handled: true,
      state: {
        config: nextConfig,
        provider: nextConfig.providers[nextConfig.provider]
      }
    };
  }
  if (line === "/remove-provider") {
    const providerNames = Object.keys(state.config.providers);
    if (providerNames.length <= 1) {
      renderMutedInfo("You need at least one provider configured.");
      console.log("");
      return { handled: true };
    }
    const answer = await deps.runPromptSession({
      type: "select",
      name: "value",
      message: "Choose a provider to remove",
      choices: providerNames.map((name) => ({
        title: `${name}${name === state.config.provider ? " (active)" : ""}`,
        value: name
      }))
    });
    const target = typeof answer.value === "string" ? answer.value : "";
    if (!target) {
      return { handled: true };
    }
    const nextConfig = await updateConfig((current) => {
      delete current.providers[target];
      if (current.provider === target) {
        current.provider = Object.keys(current.providers)[0] ?? "openai";
      }
      return current;
    });
    deps.applyLiveConfig(nextConfig, `Removed provider ${target}. Active provider: ${nextConfig.provider}.`);
    return {
      handled: true,
      state: {
        config: nextConfig,
        provider: nextConfig.providers[nextConfig.provider]
      }
    };
  }
  if (line === "/rename-provider") {
    const providerNames = Object.keys(state.config.providers);
    const selected = await deps.runPromptSession({
      type: "select",
      name: "value",
      message: "Choose a provider to rename",
      choices: providerNames.map((name) => ({ title: name, value: name })),
      initial: Math.max(0, providerNames.indexOf(state.config.provider))
    });
    const oldName = typeof selected.value === "string" ? selected.value : "";
    if (!oldName) {
      return { handled: true };
    }
    const renamed = await deps.runPromptSession({
      type: "text",
      name: "value",
      message: "New provider name",
      initial: oldName
    });
    const newName = typeof renamed.value === "string" ? renamed.value.trim() : "";
    if (!newName || newName === oldName) {
      return { handled: true };
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
    deps.applyLiveConfig(nextConfig, `Renamed provider ${oldName} to ${newName}.`);
    return {
      handled: true,
      state: {
        config: nextConfig,
        provider: nextConfig.providers[nextConfig.provider]
      }
    };
  }
  if (line === "/baseurl") {
    const answer = await deps.runPromptSession({
      type: "text",
      name: "value",
      message: "New base URL",
      initial: state.provider?.baseURL ?? "https://api.openai.com/v1"
    });
    const nextBaseURL = typeof answer.value === "string" ? answer.value.trim() : "";
    if (!nextBaseURL) {
      return { handled: true };
    }
    const nextConfig = await updateConfig((current) => {
      const active = current.providers[current.provider];
      if (!active) {
        return current;
      }
      active.baseURL = nextBaseURL;
      return current;
    });
    deps.applyLiveConfig(nextConfig, `Base URL updated to ${nextBaseURL}.`);
    return {
      handled: true,
      state: {
        config: nextConfig,
        provider: nextConfig.providers[nextConfig.provider]
      }
    };
  }
  if (line === "/apikey") {
    const mode = await deps.runPromptSession({
      type: "select",
      name: "value",
      message: `How should ${state.config.provider} authenticate?`,
      choices: [
        {
          title: "Environment variable",
          description: `Current: ${state.provider?.apiKeyEnv ?? "not set"}`,
          value: "env"
        },
        {
          title: "Store directly in config",
          description: state.provider?.apiKey ? "Current: key stored" : "Current: not stored",
          value: "inline"
        },
        { title: "Remove configured API key", value: "clear" }
      ]
    });
    const selectedMode = typeof mode.value === "string" ? mode.value : "";
    if (!selectedMode) {
      return { handled: true };
    }

    if (selectedMode === "env") {
      const envAnswer = await deps.runPromptSession({
        type: "text",
        name: "value",
        message: `Environment variable name for ${state.config.provider}`,
        initial: state.provider?.apiKeyEnv ?? "OPENAI_API_KEY"
      });
      const envName = typeof envAnswer.value === "string" ? envAnswer.value.trim() : "";
      if (!envName) {
        return { handled: true };
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
      deps.applyLiveConfig(nextConfig, `API key source changed to env var ${envName}.`);
      return {
        handled: true,
        state: {
          config: nextConfig,
          provider: nextConfig.providers[nextConfig.provider]
        }
      };
    }

    if (selectedMode === "inline") {
      const keyAnswer = await deps.runPromptSession({
        type: "password",
        name: "value",
        message: `Paste API key for ${state.config.provider}`
      });
      const apiKey = typeof keyAnswer.value === "string" ? keyAnswer.value.trim() : "";
      if (!apiKey) {
        return { handled: true };
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
      deps.applyLiveConfig(nextConfig, `API key stored in config for ${state.config.provider}.`);
      renderMutedInfo("API key received and saved for the active provider.");
      console.log("");
      return {
        handled: true,
        state: {
          config: nextConfig,
          provider: nextConfig.providers[nextConfig.provider]
        }
      };
    }

    const nextConfig = await updateConfig((current) => {
      const active = current.providers[current.provider];
      if (!active) {
        return current;
      }
      delete active.apiKey;
      delete active.apiKeyEnv;
      return current;
    });
    deps.applyLiveConfig(nextConfig, "Removed configured API key source from active provider.");
    return {
      handled: true,
      state: {
        config: nextConfig,
        provider: nextConfig.providers[nextConfig.provider]
      }
    };
  }
  if (line === "/headers") {
    const currentHeaders = Object.entries(state.provider?.headers ?? {})
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");
    const answer = await deps.runPromptSession({
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
    deps.applyLiveConfig(
      nextConfig,
      Object.keys(parsedHeaders).length > 0
        ? `Updated ${Object.keys(parsedHeaders).length} header(s) for ${state.config.provider}.`
        : `Cleared custom headers for ${state.config.provider}.`
    );
    return {
      handled: true,
      state: {
        config: nextConfig,
        provider: nextConfig.providers[nextConfig.provider]
      }
    };
  }

  return { handled: false };
}
