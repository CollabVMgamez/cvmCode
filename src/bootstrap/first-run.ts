import chalk from "chalk";
import prompts from "prompts";
import {
  configExists,
  createDefaultConfig,
  getConfigPath,
  saveConfig
} from "../config/store.js";
import { listProviderModels } from "../provider/openai-compatible.js";
import {
  DEFAULT_PROVIDER_PRESET,
  createPresetProviderMap,
  listProviderPresets
} from "../provider/presets.js";
import { AppConfig, ProviderSettings } from "../types.js";
import { panel } from "../ui/tui.js";

function presetChoices() {
  return listProviderPresets().map((preset) => ({
    title: `${preset.label} — ${preset.description}`,
    value: preset.name,
    selected: ["openai", "together", "groq", "deepseek", "xai", "anthropic", "alibaba"].includes(preset.name)
  }));
}

function normalizeSelectedProviders(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function authModeLabel(authMode: unknown): string {
  return authMode === "inline" ? "Paste one key now" : "Use environment variables";
}

function applyAuthModeToProviders(input: {
  providers: Record<string, ProviderSettings>;
  defaultProviderName: string;
  authMode: unknown;
  apiKey: unknown;
}): Record<string, ProviderSettings> {
  return Object.fromEntries(
    Object.entries(input.providers).map(([name, provider]) => [
      name,
      {
        ...provider,
        ...(input.authMode === "inline" && name === input.defaultProviderName
          ? {
              apiKey: typeof input.apiKey === "string" ? input.apiKey : undefined,
              apiKeyEnv: undefined
            }
          : {})
      }
    ])
  );
}

function renderHero() {
  console.clear();
  console.log(chalk.hex("#8b5cf6")("╭──────────────────────────────────────────────────────────────────────────────╮"));
  console.log(chalk.hex("#8b5cf6")("│") + chalk.bold.white("                          ✦ cvmCode First Run ✦                           ") + chalk.hex("#8b5cf6")("│"));
  console.log(chalk.hex("#8b5cf6")("│") + chalk.gray("                 terminal coding agent · instant provider setup               ") + chalk.hex("#8b5cf6")("│"));
  console.log(chalk.hex("#8b5cf6")("╰──────────────────────────────────────────────────────────────────────────────╯"));
  console.log("");
}

function renderSetupSummary() {
  panel(
    "Starter flow",
    [
      "1. Pick your default AI provider",
      "2. Toggle the preset providers you want included",
      "3. Decide how the default provider should load its API key",
      "4. Auto-fetch models from /v1/models when possible",
      "5. Fall back to manual model entry if the provider does not list models"
    ],
    "cyan"
  );
  console.log("");
  console.log(chalk.gray("  Enter = confirm · Space = toggle · Ctrl+C = cancel"));
  console.log("");
}

function renderSelectionSummary(input: {
  providerLabel: string;
  providerBaseURL: string;
  authMode: unknown;
}) {
  panel(
    "Current setup choices",
    [
      `default provider: ${input.providerLabel}`,
      `base URL:          ${input.providerBaseURL}`,
      `auth mode:         ${authModeLabel(input.authMode)}`,
      input.authMode === "inline"
        ? "note: only the default provider gets the pasted key right now"
        : "note: presets will expect their own environment variables"
    ],
    "gray"
  );
  console.log("");
}

async function chooseModel(input: {
  providerName: string;
  provider: ProviderSettings;
  authMode: unknown;
  apiKey: unknown;
}): Promise<string> {
  const tempConfig: AppConfig = {
    provider: input.providerName,
    providers: {
      [input.providerName]: {
        ...input.provider,
        ...(input.authMode === "inline"
          ? {
              apiKey: typeof input.apiKey === "string" ? input.apiKey : undefined,
              apiKeyEnv: undefined
            }
          : {})
      }
    },
    defaultSystemPrompt: "first-run model selection",
    createdAt: new Date().toISOString()
  };

  console.log("");
  console.log(chalk.gray(`  Checking ${input.providerName} for available models...`));
  const result = await listProviderModels(tempConfig);

  if (result.models.length > 0) {
    const answer = await prompts({
      type: "select",
      name: "value",
      message: chalk.bold("Choose the model for your default provider"),
      choices: [
        ...result.models.slice(0, 100).map((model) => ({
          title: model,
          value: model
        })),
        { title: "Enter a custom model id", value: "__custom__" }
      ],
      initial: Math.max(0, result.models.indexOf(input.provider.model))
    });

    if (answer.value === "__custom__") {
      const custom = await prompts({
        type: "text",
        name: "value",
        message: chalk.bold("Enter the model id for your default provider"),
        initial: input.provider.model
      });
      return typeof custom.value === "string" && custom.value.trim().length > 0
        ? custom.value.trim()
        : input.provider.model;
    }

    if (typeof answer.value === "string" && answer.value.trim().length > 0) {
      return answer.value.trim();
    }
  }

  const fallback = await prompts({
    type: "text",
    name: "value",
    message: chalk.bold("This provider did not return a model list. Enter the model id to use"),
    initial: input.provider.model
  });

  return typeof fallback.value === "string" && fallback.value.trim().length > 0
    ? fallback.value.trim()
    : input.provider.model;
}

export async function ensureFirstRunSetup(): Promise<boolean> {
  if (await configExists()) {
    return false;
  }

  renderHero();
  panel(
    "Welcome",
    [
      "First launch detected.",
      "We'll build a polished starter config with popular AI providers.",
      "",
      "The goal is to make setup feel fast, premium, and clear."
    ],
    "yellow"
  );
  console.log("");
  renderSetupSummary();

  const defaultPreset = DEFAULT_PROVIDER_PRESET;
  const presets = listProviderPresets();
  const answers = await prompts([
    {
      type: "select",
      name: "defaultProvider",
      message: chalk.bold("Which provider do you want to use first?"),
      choices: presets.map((preset) => ({
        title: `${preset.label} · ${preset.provider.model}`,
        description: `${preset.provider.baseURL} · ${preset.description}`,
        value: preset.name
      })),
      initial: 0
    },
    {
      type: "multiselect",
      name: "enabledProviders",
      message: chalk.bold("Which preset providers should be added to your starter config?"),
      instructions: false,
      min: 1,
      choices: presetChoices(),
      hint: "Space to toggle · Enter to confirm"
    },
    {
      type: "select",
      name: "authMode",
      message: chalk.bold("How should the default provider authenticate?"),
      choices: [
        {
          title: "Use an environment variable",
          description: "Recommended. cvmCode will read the key from your shell environment.",
          value: "env"
        },
        {
          title: "Paste one API key now",
          description: "Only the default provider will use the pasted key.",
          value: "inline"
        }
      ],
      initial: 0
    },
    {
      type: (prev: unknown) => (prev === "inline" ? "password" : null),
      name: "apiKey",
      message: chalk.bold("Paste the API key for the default provider"),
      validate: (value: string) => (value.trim().length > 0 ? true : "Paste a non-empty API key")
    }
  ]);

  const enabledProviderNames = normalizeSelectedProviders(answers.enabledProviders);
  const requestedDefaultProviderName =
    typeof answers.defaultProvider === "string" && answers.defaultProvider.length > 0
      ? answers.defaultProvider
      : defaultPreset.name;

  const finalProviderNames = enabledProviderNames.includes(requestedDefaultProviderName)
    ? enabledProviderNames
    : [requestedDefaultProviderName, ...enabledProviderNames];

  const providerMap = createPresetProviderMap(finalProviderNames);
  const resolvedDefaultProviderName = providerMap[requestedDefaultProviderName]
    ? requestedDefaultProviderName
    : defaultPreset.name;
  const activeProvider: ProviderSettings = providerMap[resolvedDefaultProviderName] ?? defaultPreset.provider;
  const activePreset = presets.find((preset) => preset.name === resolvedDefaultProviderName) ?? defaultPreset;

  renderSelectionSummary({
    providerLabel: activePreset.label,
    providerBaseURL: activeProvider.baseURL,
    authMode: answers.authMode
  });

  const selectedModel = await chooseModel({
    providerName: resolvedDefaultProviderName,
    provider: activeProvider,
    authMode: answers.authMode,
    apiKey: answers.apiKey
  });

  const updatedProviders = applyAuthModeToProviders({
    providers: providerMap,
    defaultProviderName: resolvedDefaultProviderName,
    authMode: answers.authMode,
    apiKey: answers.apiKey
  });
  const currentDefaultProvider = updatedProviders[resolvedDefaultProviderName] ?? activeProvider;
  updatedProviders[resolvedDefaultProviderName] = {
    ...currentDefaultProvider,
    model: selectedModel
  };

  const config = createDefaultConfig({
    providerName: resolvedDefaultProviderName,
    baseURL: activeProvider.baseURL,
    model: selectedModel,
    apiKeyEnv: answers.authMode === "env" ? activeProvider.apiKeyEnv : undefined,
    apiKey: answers.authMode === "inline" && typeof answers.apiKey === "string" ? answers.apiKey : undefined,
    headers: activeProvider.headers,
    endpointMode: activeProvider.endpointMode,
    providers: updatedProviders
  });

  await saveConfig(config);

  console.log("");
  panel(
    "Setup complete ✓",
    [
      `default provider: ${activePreset.label}`,
      `default model:    ${selectedModel}`,
      `auth mode:        ${authModeLabel(answers.authMode)}`,
      `starter providers:${String(Object.keys(config.providers).length).padStart(3, " ")}`,
      `config saved to ${getConfigPath()}`,
      "Use /provider and /model inside chat to switch instantly."
    ],
    "green"
  );
  console.log("");
  return true;
}
