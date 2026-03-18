import { z } from "zod";

export const providerSettingsSchema = z.object({
  type: z.literal("openai-compatible"),
  endpointMode: z.enum(["responses", "chat-completions"]).optional(),
  baseURL: z.string().url(),
  apiKey: z.string().min(1).optional(),
  apiKeyEnv: z.string().min(1).optional(),
  model: z.string().min(1),
  headers: z.record(z.string()).optional()
});

export const appConfigSchema = z.object({
  provider: z.string().min(1),
  providers: z.record(providerSettingsSchema),
  defaultSystemPrompt: z.string().min(1),
  createdAt: z.string().min(1)
});
