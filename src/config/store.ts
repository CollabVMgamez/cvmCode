import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { appConfigSchema } from "./schema.js";
import { AppConfig, ProviderSettings } from "../types.js";
import { composeSystemPrompt } from "../prompt/compose.js";

const DEFAULT_PROVIDER_NAME = "openai";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultProviderSettings(name: string): ProviderSettings {
  if (name === "openai") {
    return {
      type: "openai-compatible",
      endpointMode: "responses",
      baseURL: "https://api.openai.com/v1",
      model: "gpt-4.1",
      apiKeyEnv: "OPENAI_API_KEY"
    };
  }

  return {
    type: "openai-compatible",
    endpointMode: "responses",
    baseURL: "https://api.openai.com/v1",
    model: "gpt-4.1"
  };
}

function normalizeHeaders(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeProviderSettings(name: string, value: unknown): ProviderSettings {
  const fallback = defaultProviderSettings(name);
  const raw = isRecord(value) ? value : {};

  return {
    type: "openai-compatible",
    endpointMode:
      raw.endpointMode === "chat-completions" || raw.endpointMode === "responses"
        ? raw.endpointMode
        : fallback.endpointMode,
    baseURL: typeof raw.baseURL === "string" && raw.baseURL.length > 0 ? raw.baseURL : fallback.baseURL,
    model: typeof raw.model === "string" && raw.model.length > 0 ? raw.model : fallback.model,
    ...(typeof raw.apiKey === "string" && raw.apiKey.length > 0 ? { apiKey: raw.apiKey } : {}),
    ...(typeof raw.apiKeyEnv === "string" && raw.apiKeyEnv.length > 0
      ? { apiKeyEnv: raw.apiKeyEnv }
      : fallback.apiKeyEnv
        ? { apiKeyEnv: fallback.apiKeyEnv }
        : {}),
    ...(normalizeHeaders(raw.headers) ? { headers: normalizeHeaders(raw.headers) } : {})
  };
}

export function normalizeConfig(raw: unknown): AppConfig {
  const source = isRecord(raw) ? raw : {};
  const providersSource = isRecord(source.providers) ? source.providers : {};
  const providerNames = Object.keys(providersSource);
  const activeProvider =
    typeof source.provider === "string" && source.provider.length > 0
      ? source.provider
      : providerNames[0] ?? DEFAULT_PROVIDER_NAME;

  const normalizedProviders: Record<string, ProviderSettings> = {};
  for (const [name, value] of Object.entries(providersSource)) {
    normalizedProviders[name] = normalizeProviderSettings(name, value);
  }
  if (!normalizedProviders[activeProvider]) {
    normalizedProviders[activeProvider] = normalizeProviderSettings(activeProvider, {});
  }

  return appConfigSchema.parse({
    provider: activeProvider,
    providers: normalizedProviders,
    defaultSystemPrompt:
      typeof source.defaultSystemPrompt === "string" && source.defaultSystemPrompt.length > 0
        ? source.defaultSystemPrompt
        : composeSystemPrompt(),
    createdAt:
      typeof source.createdAt === "string" && source.createdAt.length > 0
        ? source.createdAt
        : new Date().toISOString()
  });
}

export function getConfigDir(): string {
  return path.join(os.homedir(), ".cvmcode");
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), "config.yaml");
}

export async function configExists(): Promise<boolean> {
  try {
    await fs.access(getConfigPath());
    return true;
  } catch {
    return false;
  }
}

export async function loadConfig(): Promise<AppConfig> {
  const raw = await fs.readFile(getConfigPath(), "utf8");
  const parsed = YAML.parse(raw);
  const normalized = normalizeConfig(parsed);

  if (JSON.stringify(parsed ?? {}) !== JSON.stringify(normalized)) {
    await saveConfig(normalized);
  }

  return normalized;
}

export async function repairConfigFile(): Promise<{
  config: AppConfig;
  backupPath: string | null;
}> {
  const configPath = getConfigPath();
  let parsed: unknown = {};
  let backupPath: string | null = null;

  try {
    const raw = await fs.readFile(configPath, "utf8");
    parsed = YAML.parse(raw);
    backupPath = path.join(
      getConfigDir(),
      `config.bak.${new Date().toISOString().replace(/[:.]/g, "-")}.yaml`
    );
    await fs.writeFile(backupPath, raw, "utf8");
  } catch {
    parsed = {};
  }

  const normalized = normalizeConfig(parsed);
  await saveConfig(normalized);
  return { config: normalized, backupPath };
}

export async function loadConfigWithAutoFix(): Promise<{
  config: AppConfig;
  repaired: boolean;
  backupPath: string | null;
}> {
  try {
    return {
      config: await loadConfig(),
      repaired: false,
      backupPath: null
    };
  } catch {
    const repaired = await repairConfigFile();
    return {
      config: repaired.config,
      repaired: true,
      backupPath: repaired.backupPath
    };
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await fs.mkdir(getConfigDir(), { recursive: true });
  await fs.writeFile(getConfigPath(), YAML.stringify(config), "utf8");
}

export async function updateConfig(
  mutate: (config: AppConfig) => AppConfig
): Promise<AppConfig> {
  const current = await loadConfigWithAutoFix();
  const next = mutate(structuredClone(current.config));
  await saveConfig(next);
  return next;
}

export function createDefaultConfig(input: {
  providerName: string;
  baseURL: string;
  model: string;
  apiKeyEnv?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  endpointMode?: "responses" | "chat-completions";
  providers?: Record<string, ProviderSettings>;
}): AppConfig {
  return {
    provider: input.providerName,
    providers:
      input.providers ?? {
        [input.providerName]: {
          type: "openai-compatible",
          endpointMode: input.endpointMode ?? "responses",
          baseURL: input.baseURL,
          model: input.model,
          ...(input.apiKeyEnv ? { apiKeyEnv: input.apiKeyEnv } : {}),
          ...(input.apiKey ? { apiKey: input.apiKey } : {}),
          ...(input.headers ? { headers: input.headers } : {})
        }
      },
    defaultSystemPrompt: composeSystemPrompt(),
    createdAt: new Date().toISOString()
  };
}
