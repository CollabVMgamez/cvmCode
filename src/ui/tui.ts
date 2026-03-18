import os from "node:os";
import path from "node:path";
import chalk from "chalk";
import { TokenUsage } from "../types.js";

type Tone = "cyan" | "green" | "yellow" | "red" | "gray";

function terminalWidth(): number {
  return Math.min(process.stdout.columns || 100, 96);
}

function toneColor(tone: Tone) {
  return {
    cyan: chalk.cyan,
    green: chalk.green,
    yellow: chalk.yellow,
    red: chalk.red,
    gray: chalk.gray
  }[tone];
}

function shortenHome(inputPath: string): string {
  const home = os.homedir();
  if (inputPath.toLowerCase().startsWith(home.toLowerCase())) {
    return `~${inputPath.slice(home.length)}`;
  }
  return inputPath;
}

function stripAnsi(input: string): string {
  return input.replace(/\x1B\[[0-9;]*m/g, "");
}

function fitLine(text: string, width: number): string {
  const visible = stripAnsi(text);
  if (visible.length <= width) {
    return text + " ".repeat(width - visible.length);
  }
  return `${visible.slice(0, Math.max(0, width - 1))}…`;
}

function wrapText(text: string, width: number): string[] {
  if (!text) {
    return [""];
  }

  const plain = stripAnsi(text);
  if (plain.length <= width) {
    return [text];
  }

  const lines: string[] = [];
  let remaining = plain;
  while (remaining.length > width) {
    lines.push(remaining.slice(0, width));
    remaining = remaining.slice(width);
  }
  lines.push(remaining);
  return lines;
}

function stat(label: string, value: string): string {
  return `${chalk.gray(label.padEnd(10, " "))}${chalk.white(value)}`;
}

export function panel(title: string, lines: string[], tone: Tone = "cyan") {
  const width = Math.max(56, Math.min(terminalWidth(), 92));
  const color = toneColor(tone);

  console.log(color(`╭${"─".repeat(width - 2)}╮`));
  console.log(color(`│ ${fitLine(title, width - 4)} │`));
  if (lines.length > 0) {
    console.log(color(`├${"─".repeat(width - 2)}┤`));
    for (const line of lines) {
      for (const wrapped of wrapText(line, width - 4)) {
        console.log(color(`│ ${fitLine(wrapped, width - 4)} │`));
      }
    }
  }
  console.log(color(`╰${"─".repeat(width - 2)}╯`));
}

export function renderChatIntro(input: {
  cwd: string;
  provider: string;
  model: string;
  endpointMode: string;
  fileCount: number;
  contextWindow: string;
}) {
  const width = Math.max(56, Math.min(terminalWidth(), 92));
  const line = "─".repeat(width - 2);

  console.log(chalk.hex("#7c3aed")(`╭${line}╮`));
  console.log(
    chalk.hex("#7c3aed")("│ ") +
      fitLine(`${chalk.bold.white("cvmCode")} ${chalk.gray("v1.0.2")}`, width - 4) +
      chalk.hex("#7c3aed")(" │")
  );
  console.log(
    chalk.hex("#7c3aed")("│ ") +
      fitLine(chalk.gray("terminal coding agent"), width - 4) +
      chalk.hex("#7c3aed")(" │")
  );
  console.log(chalk.hex("#7c3aed")(`├${line}┤`));
  console.log(
    chalk.hex("#7c3aed")("│ ") +
      fitLine(`${chalk.cyan(input.provider)}  ${chalk.gray("/")}  ${chalk.white(input.model)}`, width - 4) +
      chalk.hex("#7c3aed")(" │")
  );
  console.log(
    chalk.hex("#7c3aed")("│ ") +
      fitLine(chalk.gray(`mode ${input.endpointMode}`), width - 4) +
      chalk.hex("#7c3aed")(" │")
  );
  console.log(chalk.hex("#7c3aed")(`├${line}┤`));

  const rows = [
    stat("workspace", shortenHome(input.cwd)),
    stat("context", `${input.fileCount} files indexed`),
    stat("window", input.contextWindow)
  ];

  for (const row of rows) {
    console.log(
      chalk.hex("#7c3aed")("│ ") + fitLine(row, width - 4) + chalk.hex("#7c3aed")(" │")
    );
  }

  console.log(chalk.hex("#7c3aed")(`╰${line}╯`));
  console.log(chalk.gray("  /help  commands   /doctor  provider check   /context  context settings"));
  console.log("");
}

export function renderCommandPalette(commands: string[]) {
  panel("Command palette", commands, "gray");
  console.log("");
}

export function renderThinkingPanel(text: string) {
  panel("Model reasoning", text.split("\n"), "yellow");
  console.log("");
}

export function renderUsageLine(usage?: TokenUsage) {
  if (!usage) {
    return;
  }

  const parts = [
    typeof usage.inputTokens === "number" ? `in ${usage.inputTokens}` : null,
    typeof usage.outputTokens === "number" ? `out ${usage.outputTokens}` : null,
    typeof usage.totalTokens === "number" ? `total ${usage.totalTokens}` : null
  ].filter((value): value is string => Boolean(value));

  if (parts.length === 0) {
    return;
  }

  console.log(chalk.gray(`  tokens · ${parts.join(" · ")}`));
  console.log("");
}

export function renderUserMessage(text: string) {
  console.log(chalk.bold.cyan("\n>"), chalk.white(text));
}

export function renderAssistantMessage(text: string) {
  panel("cvmCode", text.split("\n"), "green");
  console.log(chalk.gray("  active model · reply complete"));
  console.log("");
}

export function renderStreamingStart() {
  process.stdout.write(`${chalk.green("\ncvmCode")}\n`);
}

export function renderStreamingChunk(text: string) {
  process.stdout.write(text);
}

export function renderStreamingEnd() {
  process.stdout.write("\n\n");
  console.log(chalk.gray("  active model · reply complete"));
  console.log("");
}

export function renderErrorMessage(text: string) {
  panel("Request issue", text.split("\n"), "red");
  console.log("");
}

export function renderMutedInfo(text: string) {
  console.log(chalk.gray(text));
}

export function renderPrompt(): string {
  return chalk.bold.cyan("> ");
}

export function renderConfigPanel(input: {
  provider: string;
  baseURL: string;
  model: string;
  endpointMode: string;
  apiKeySource: string;
}) {
  panel("Current config", [
    `provider:  ${input.provider}`,
    `endpoint:  ${input.endpointMode}`,
    `base URL:  ${input.baseURL}`,
    `model:     ${input.model}`,
    `api key:   ${input.apiKeySource}`
  ]);
  console.log("");
}

export function renderDoctorPanel(input: {
  provider: string;
  baseURL: string;
  model: string;
  endpointMode: string;
  authStatus: string;
}) {
  panel(
    "Provider doctor",
    [
      `provider:  ${input.provider}`,
      `endpoint:  ${input.endpointMode}`,
      `base URL:  ${input.baseURL}`,
      `model:     ${input.model}`,
      `auth:      ${input.authStatus}`
    ],
    "yellow"
  );
  console.log("");
}

export async function withThinking<T>(label: string, task: Promise<T>): Promise<T> {
  const frames = ["◜", "◠", "◝", "◞", "◡", "◟"];
  let index = 0;
  const timer = setInterval(() => {
    process.stdout.write(`\r${chalk.cyan(frames[index % frames.length])} ${label}...   `);
    index += 1;
  }, 100);

  try {
    const result = await task;
    clearInterval(timer);
    process.stdout.write(`\r${" ".repeat(label.length + 10)}\r`);
    return result;
  } catch (error) {
    clearInterval(timer);
    process.stdout.write(`\r${" ".repeat(label.length + 10)}\r`);
    throw error;
  }
}

export function formatPathForUi(value: string): string {
  return shortenHome(path.resolve(value));
}
