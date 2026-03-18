import { describe, expect, it } from "vitest";
import { composeSystemPrompt } from "../src/prompt/compose.js";

describe("system prompt", () => {
  it("defines the cvmCode assistant identity", () => {
    const prompt = composeSystemPrompt();
    expect(prompt).toContain("You are cvmCode");
    expect(prompt).toContain("terminal-native coding agent");
    expect(prompt).toContain("Use write_file");
    expect(prompt).toContain("must use tools");
    expect(prompt).toContain("Do not output hidden reasoning");
  });
});
