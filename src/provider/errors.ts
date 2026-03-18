import { ProviderErrorDetails } from "../types.js";

export class ProviderRequestError extends Error {
  constructor(
    message: string,
    public readonly details: ProviderErrorDetails
  ) {
    super(message);
    this.name = "ProviderRequestError";
  }
}

function extractMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    return parsed.error?.message?.trim() || body.trim();
  } catch {
    return body.trim();
  }
}

export function classifyProviderFailure(input: {
  status?: number;
  statusText?: string;
  body?: string;
  error?: unknown;
}): ProviderErrorDetails {
  const message =
    typeof input.body === "string" && input.body.trim().length > 0
      ? extractMessage(input.body)
      : input.error instanceof Error
        ? input.error.message
        : input.statusText || "Unknown provider error";

  if (input.status === 401) {
    return {
      kind: "auth",
      status: 401,
      title: "Authentication failed",
      detail: "Your provider rejected the request because no valid API key was sent.",
      retryable: false,
      suggestions: [
        "Add a valid API key to your configured env var or stored config.",
        "Run `cvmCode doctor` to inspect the active provider settings.",
        "Run `cvmCode init` if you want to reconfigure or switch providers."
      ]
    };
  }

  if (input.status === 429) {
    return {
      kind: "rate_limit",
      status: 429,
      title: "Rate limited",
      detail: message || "The provider asked cvmCode to slow down.",
      retryable: true,
      suggestions: [
        "Wait a moment and try again.",
        "Switch to another provider or model if available."
      ]
    };
  }

  if (input.status === 400) {
    if (/does not support tool calling|remove tools from the request|tool-capable model/i.test(message)) {
      return {
        kind: "tool_unsupported",
        status: 400,
        title: "Model does not support tool calling",
        detail: message || "The selected model rejected tool use.",
        retryable: false,
        suggestions: [
          "cvmCode can retry this turn without tools.",
          "Switch to a tool-capable model if you want file read/write/search abilities.",
          "Use `/endpoint` if you want to change API mode."
        ]
      };
    }

    return {
      kind: "bad_request",
      status: 400,
      title: "Bad provider request",
      detail: message || "The provider rejected the request payload.",
      retryable: false,
      suggestions: [
        "Check your configured base URL and model.",
        "Run `cvmCode doctor` to inspect current provider settings."
      ]
    };
  }

  if (input.status === 404) {
    return {
      kind: "not_found",
      status: 404,
      title: "Provider endpoint not found",
      detail: message || "The configured base URL or endpoint looks invalid.",
      retryable: false,
      suggestions: [
        "Check the provider base URL.",
        "If you are using a custom gateway, verify it exposes OpenAI-compatible chat endpoints."
      ]
    };
  }

  if (input.status && input.status >= 500) {
    return {
      kind: "server",
      status: input.status,
      title: "Provider server error",
      detail: message || "The provider had a temporary server-side failure.",
      retryable: true,
      suggestions: [
        "Try again in a moment.",
        "If this keeps happening, switch providers or models."
      ]
    };
  }

  if (input.error) {
    return {
      kind: "network",
      title: "Network or connection error",
      detail: message,
      retryable: true,
      suggestions: [
        "Check your internet connection.",
        "Verify the configured provider base URL is reachable."
      ]
    };
  }

  return {
    kind: "unknown",
    status: input.status,
    title: "Provider request failed",
    detail: message || "An unknown provider error occurred.",
    retryable: false,
    suggestions: ["Run `cvmCode doctor` to inspect your provider configuration."]
  };
}

export function renderProviderFailure(details: ProviderErrorDetails): string {
  return [
    `${details.title}`,
    details.detail,
    "",
    ...details.suggestions.map((item) => `• ${item}`)
  ].join("\n");
}
