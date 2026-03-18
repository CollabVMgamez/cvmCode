export interface ProviderSettings {
  type: "openai-compatible";
  endpointMode?: "responses" | "chat-completions";
  baseURL: string;
  apiKey?: string;
  apiKeyEnv?: string;
  model: string;
  headers?: Record<string, string>;
}

export interface AppConfig {
  provider: string;
  providers: Record<string, ProviderSettings>;
  defaultSystemPrompt: string;
  createdAt: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface RepoSummary {
  root: string;
  files: string[];
  snippets: Array<{ path: string; content: string }>;
  fileLimit: number;
  snippetLimit: number;
  snippetBytes: number;
}

export interface ProviderErrorDetails {
  kind:
    | "auth"
    | "rate_limit"
    | "server"
    | "network"
    | "bad_request"
    | "tool_unsupported"
    | "not_found"
    | "unknown";
  status?: number;
  title: string;
  detail: string;
  retryable: boolean;
  suggestions: string[];
}

export interface ProviderModelListResult {
  models: string[];
  source: "remote" | "manual";
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface AgentTurnResult {
  text: string;
  usedTools: boolean;
  thinking?: string;
  usage?: TokenUsage;
}
