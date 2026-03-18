import { describe, expect, it } from "vitest";
import { classifyProviderFailure, renderProviderFailure } from "../src/provider/errors.js";

describe("provider error handling", () => {
  it("classifies 401 as auth guidance", () => {
    const details = classifyProviderFailure({
      status: 401,
      statusText: "Unauthorized",
      body: JSON.stringify({
        error: {
          message: "You didn't provide an API key."
        }
      })
    });

    expect(details.kind).toBe("auth");
    expect(details.retryable).toBe(false);
    expect(renderProviderFailure(details)).toContain("Authentication failed");
    expect(renderProviderFailure(details)).toContain("API key");
  });

  it("classifies 429 as retryable", () => {
    const details = classifyProviderFailure({
      status: 429,
      statusText: "Too Many Requests",
      body: "slow down"
    });

    expect(details.kind).toBe("rate_limit");
    expect(details.retryable).toBe(true);
  });

  it("classifies unsupported tool calling errors", () => {
    const details = classifyProviderFailure({
      status: 400,
      statusText: "Bad Request",
      body: "Model qwen3.5-plus does not support tool calling. Use a tool-capable model or remove tools from the request."
    });

    expect(details.kind).toBe("tool_unsupported");
    expect(details.retryable).toBe(false);
    expect(renderProviderFailure(details)).toContain("tool calling");
  });
});
