import { ProviderSettings } from "../types.js";

export interface ProviderPreset {
  name: string;
  label: string;
  description: string;
  provider: ProviderSettings;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    name: "openai",
    label: "OpenAI",
    description: "Official OpenAI platform",
    provider: {
      type: "openai-compatible",
      endpointMode: "responses",
      baseURL: "https://api.openai.com/v1",
      apiKeyEnv: "OPENAI_API_KEY",
      model: "gpt-4.1"
    }
  },
  {
    name: "together",
    label: "Together AI",
    description: "Large open-model catalog via Together",
    provider: {
      type: "openai-compatible",
      endpointMode: "chat-completions",
      baseURL: "https://api.together.xyz/v1",
      apiKeyEnv: "TOGETHER_API_KEY",
      model: "meta-llama/Llama-3.3-70B-Instruct-Turbo"
    }
  },
  {
    name: "groq",
    label: "Groq",
    description: "Fast inference for open models",
    provider: {
      type: "openai-compatible",
      endpointMode: "chat-completions",
      baseURL: "https://api.groq.com/openai/v1",
      apiKeyEnv: "GROQ_API_KEY",
      model: "moonshotai/kimi-k2-instruct"
    }
  },
  {
    name: "cerebras",
    label: "Cerebras",
    description: "Ultra-fast hosted inference",
    provider: {
      type: "openai-compatible",
      endpointMode: "chat-completions",
      baseURL: "https://api.cerebras.ai/v1",
      apiKeyEnv: "CEREBRAS_API_KEY",
      model: "gpt-oss-120b"
    }
  },
  {
    name: "deepseek",
    label: "DeepSeek",
    description: "DeepSeek chat and reasoning models",
    provider: {
      type: "openai-compatible",
      endpointMode: "chat-completions",
      baseURL: "https://api.deepseek.com/v1",
      apiKeyEnv: "DEEPSEEK_API_KEY",
      model: "deepseek-reasoner"
    }
  },
  {
    name: "xai",
    label: "xAI",
    description: "Grok models from xAI",
    provider: {
      type: "openai-compatible",
      endpointMode: "chat-completions",
      baseURL: "https://api.x.ai/v1",
      apiKeyEnv: "XAI_API_KEY",
      model: "grok-4.1-fast-reasoning"
    }
  },
  {
    name: "anthropic",
    label: "Anthropic",
    description: "Claude via Anthropic Messages API",
    provider: {
      type: "anthropic",
      baseURL: "https://api.anthropic.com",
      apiKeyEnv: "ANTHROPIC_API_KEY",
      model: "claude-sonnet-4-20250514",
      headers: {
        "anthropic-version": "2023-06-01"
      }
    }
  },
  {
    name: "alibaba",
    label: "Alibaba Cloud",
    description: "Qwen-compatible gateway on Alibaba Cloud",
    provider: {
      type: "openai-compatible",
      endpointMode: "chat-completions",
      baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
      apiKeyEnv: "ALIBABA_CLOUD_API_KEY",
      model: "qwen-flash"
    }
  },
  {
    name: "openrouter",
    label: "OpenRouter",
    description: "Many model providers behind one endpoint",
    provider: {
      type: "openai-compatible",
      endpointMode: "chat-completions",
      baseURL: "https://openrouter.ai/api/v1",
      apiKeyEnv: "OPENROUTER_API_KEY",
      model: "openai/gpt-4.1-mini",
      headers: {
        "HTTP-Referer": "https://github.com/CollabVMGamez/cvmCode",
        "X-Title": "cvmCode"
      }
    }
  },
  {
    name: "mistral",
    label: "Mistral",
    description: "Official Mistral API",
    provider: {
      type: "openai-compatible",
      endpointMode: "chat-completions",
      baseURL: "https://api.mistral.ai/v1",
      apiKeyEnv: "MISTRAL_API_KEY",
      model: "mistral-large-latest"
    }
  },
  {
    name: "fireworks",
    label: "Fireworks AI",
    description: "Hosted open models with OpenAI-style API",
    provider: {
      type: "openai-compatible",
      endpointMode: "chat-completions",
      baseURL: "https://api.fireworks.ai/inference/v1",
      apiKeyEnv: "FIREWORKS_API_KEY",
      model: "accounts/fireworks/models/llama4-maverick-instruct-basic"
    }
  },
  {
    name: "perplexity",
    label: "Perplexity",
    description: "Perplexity Sonar models",
    provider: {
      type: "openai-compatible",
      endpointMode: "chat-completions",
      baseURL: "https://api.perplexity.ai",
      apiKeyEnv: "PERPLEXITY_API_KEY",
      model: "sonar-pro"
    }
  }
];

export const DEFAULT_PROVIDER_PRESET: ProviderPreset = {
  name: "openai",
  label: "OpenAI",
  description: "Official OpenAI platform",
  provider: {
    type: "openai-compatible",
    endpointMode: "responses",
    baseURL: "https://api.openai.com/v1",
    apiKeyEnv: "OPENAI_API_KEY",
    model: "gpt-4.1"
  }
};

export function listProviderPresets(): ProviderPreset[] {
  return PROVIDER_PRESETS.map((preset) => ({
    ...preset,
    provider: {
      ...preset.provider,
      headers: preset.provider.headers ? { ...preset.provider.headers } : undefined
    }
  }));
}

export function createPresetProviderMap(names?: string[]): Record<string, ProviderSettings> {
  const selected = names && names.length > 0 ? PROVIDER_PRESETS.filter((preset) => names.includes(preset.name)) : PROVIDER_PRESETS;

  return Object.fromEntries(
    selected.map((preset) => [
      preset.name,
      {
        ...preset.provider,
        headers: preset.provider.headers ? { ...preset.provider.headers } : undefined
      }
    ])
  );
}
