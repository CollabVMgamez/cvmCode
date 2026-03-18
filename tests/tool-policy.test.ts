import { describe, expect, it } from "vitest";
import {
  appendForcedToolInstruction,
  responseEvadedTools,
  responseLooksLikeCodeDump,
  shouldForceToolRetry,
  taskLikelyRequiresTools
} from "../src/agent/tool-policy.js";

describe("tool policy", () => {
  it("detects tasks that should use workspace tools", () => {
    expect(taskLikelyRequiresTools("make a simple flappy bird site")).toBe(true);
    expect(taskLikelyRequiresTools("edit src/app.ts to add logging")).toBe(true);
    expect(taskLikelyRequiresTools("search the repo for TODO markers")).toBe(true);
    expect(taskLikelyRequiresTools("what ai are you")).toBe(false);
  });

  it("detects plain code dumps and tool evasion", () => {
    expect(
      responseLooksLikeCodeDump([
        "```html",
        "<!DOCTYPE html>",
        "<html>",
        "<script>",
        "const game = true;",
        "</script>",
        "</html>",
        "```"
      ].join("\n"))
    ).toBe(true);

    expect(
      responseEvadedTools("I don't have direct file writing capabilities, but here is the complete code.")
    ).toBe(true);
  });

  it("forces one retry when a tool-required task got a code-only answer", () => {
    expect(
      shouldForceToolRetry({
        lastUserMessage: "build a flappy bird game in this repo",
        assistantText: "Create a file called flappybird.html with this code:\n```html\n<html></html>\n```",
        usedTools: false
      })
    ).toBe(true);

    expect(
      shouldForceToolRetry({
        lastUserMessage: "build a flappy bird game in this repo",
        assistantText: "Done. I updated index.html and game.js.",
        usedTools: true
      })
    ).toBe(false);
  });

  it("appends a stronger mandatory tool instruction", () => {
    const prompt = appendForcedToolInstruction("base prompt");
    expect(prompt).toContain("Mandatory workspace execution for this turn");
    expect(prompt).toContain("must use workspace tools");
    expect(prompt).toContain("Do not claim that you cannot read, search, or write files");
  });
});
