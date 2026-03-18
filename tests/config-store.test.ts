import { describe, expect, it } from "vitest";
import { createDefaultConfig, normalizeConfig } from "../src/config/store.js";

describe("config store", () => {
  it("creates a default config with the system prompt", () => {
    const config = createDefaultConfig({
      providerName: "openai",
      baseURL: "https://api.openai.com/v1",
      model: "gpt-4.1",
      apiKeyEnv: "OPENAI_API_KEY"
    });

    expect(config.provider).toBe("openai");
    expect(config.defaultSystemPrompt).toContain("You are cvmCode");
    expect(config.providers.openai.model).toBe("gpt-4.1");
  });

  it("auto-heals missing provider fields", () => {
    const config = normalizeConfig({
      provider: "openai",
      providers: {
        openai: {
          type: "openai-compatible"
        }
      }
    });

    expect(config.providers.openai.baseURL).toBe("https://api.openai.com/v1");
    expect(config.providers.openai.model).toBe("gpt-4.1");
    expect(config.defaultSystemPrompt).toContain("You are cvmCode");
  });

  it("creates a default provider when providers are missing entirely", () => {
    const config = normalizeConfig({});
    expect(config.provider).toBe("openai");
    expect(config.providers.openai.baseURL).toBe("https://api.openai.com/v1");
    expect(config.providers.openai.model).toBe("gpt-4.1");
  });
});
