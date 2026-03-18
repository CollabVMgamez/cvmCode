import { ChatMessage } from "../types.js";

const FILE_REFERENCE_RE =
  /\b[\w./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|txt|html|css|scss|less|py|rb|php|java|kt|go|rs|cs|cpp|c|h|hpp|yaml|yml|toml|ini|sh|ps1)\b/i;

const TOOL_REQUIRED_PATTERNS: RegExp[] = [
  /\b(create|make|build|generate|write|edit|update|change|modify|refactor|fix|repair|implement|rename|move|delete|remove|patch)\b.{0,40}\b(file|files|repo|repository|project|workspace|code|component|page|site|app|game|script|module|config|test|tests|docs?)\b/i,
  /\b(read|open|inspect|search|find|scan|grep|look through)\b.{0,40}\b(file|files|repo|repository|workspace|codebase|project)\b/i,
  /\badd\b.{0,40}\b(feature|endpoint|command|component|page|test|tests|config|tool)\b/i,
  /\bin (?:this|the) (?:repo|repository|workspace|project)\b/i,
  /\b(use|apply)\b.{0,20}\btools?\b/i,
  /\bflappy bird\b/i,
  FILE_REFERENCE_RE
];

const TOOL_EVASION_PATTERNS: RegExp[] = [
  /i (?:do not|don't) have (?:direct )?(?:file|workspace|tool|write) (?:access|capabilit)/i,
  /\bsave (?:this|the code) as\b/i,
  /\bcreate a file called\b/i,
  /\bcopy(?: and paste)?\b/i,
  /\bpaste the following code\b/i,
  /\bhere(?:'s| is) the complete code\b/i
];

export function latestUserMessage(history: ChatMessage[]): string {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message?.role === "user") {
      return message.content;
    }
  }
  return "";
}

export function taskLikelyRequiresTools(input: string): boolean {
  const text = input.trim();
  if (!text) {
    return false;
  }
  return TOOL_REQUIRED_PATTERNS.some((pattern) => pattern.test(text));
}

export function responseLooksLikeCodeDump(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  if (trimmed.includes("```")) {
    return true;
  }

  const lines = trimmed.split(/\r?\n/).map((line) => line.trim());
  const codeLikeLines = lines.filter((line) =>
    /^(?:<!DOCTYPE html>|<html\b|<script\b|<style\b|import\s.+from\s|export\s|const\s|let\s|var\s|function\s|class\s|\w+\s*=\s*[{[])/i.test(
      line
    )
  );

  return codeLikeLines.length >= 4;
}

export function responseEvadedTools(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  return TOOL_EVASION_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function shouldForceToolRetry(input: {
  lastUserMessage: string;
  assistantText: string;
  usedTools: boolean;
}): boolean {
  if (input.usedTools) {
    return false;
  }

  if (!taskLikelyRequiresTools(input.lastUserMessage)) {
    return false;
  }

  const answer = input.assistantText.trim();
  if (!answer) {
    return true;
  }

  if (responseEvadedTools(answer) || responseLooksLikeCodeDump(answer)) {
    return true;
  }

  if (/^(?:sure|okay|alright)[!.]?\s*$/i.test(answer)) {
    return true;
  }

  return false;
}

export function appendForcedToolInstruction(baseInstructions: string): string {
  return [
    baseInstructions,
    "",
    "Mandatory workspace execution for this turn:",
    "- You must use workspace tools before answering.",
    "- Do not claim that you cannot read, search, or write files.",
    "- Do not paste a full solution as plain text unless the user explicitly asked for code only.",
    "- If files are relevant, inspect them with list_files, search_files, and read_file.",
    "- If you create or modify code, apply it with write_file and then summarize the changed paths."
  ].join("\n");
}
