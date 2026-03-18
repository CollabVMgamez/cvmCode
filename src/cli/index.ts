#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import prompts from "prompts";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ensureFirstRunSetup } from "../bootstrap/first-run.js";
import { startChat } from "../chat/repl.js";
import { getConfigPath, loadConfigWithAutoFix } from "../config/store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function ensureConfigIsHealthy() {
  const result = await loadConfigWithAutoFix();
  if (result.repaired) {
    console.log(chalk.yellow("Detected a broken cvmCode config and auto-fixed it."));
    if (result.backupPath) {
      console.log(chalk.gray(`Backup saved to ${result.backupPath}`));
    }
  }
  return result.config;
}

async function launchGuiMode(): Promise<void> {
  let electronBin: string;
  try {
    const req = createRequire(import.meta.url);
    electronBin = req("electron") as string;
  } catch {
    console.error(chalk.red("Electron is not installed. Run: pnpm add -D electron"));
    return;
  }

  // main.js lives two levels up from dist/cli/ -> project root -> electron/main.js
  const mainJs = path.join(__dirname, "..", "..", "electron", "main.js");

  console.log(chalk.cyan("Launching cvmCode GUI..."));
  const child = spawn(electronBin, [mainJs], {
    stdio: "inherit",
    detached: false
  });

  await new Promise<void>((resolve) => {
    child.on("close", () => resolve());
  });
}

async function chooseStartupMode() {
  const answer = await prompts({
    type: "select",
    name: "value",
    message: "Choose how to launch cvmCode",
    choices: [
      { title: "CLI chat", value: "cli" },
      { title: "GUI preview", value: "gui" }
    ],
    initial: 0
  });
  return answer.value === "gui" ? "gui" : "cli";
}

async function main() {
  const program = new Command();

  program
    .name("cvmCode")
    .description(
      "cvmCode: terminal coding assistant with first-run setup and a built-in system prompt"
    )
    .version("1.0.2")
    .showHelpAfterError();

  program
    .command("init")
    .description("Run first-time setup and save config")
    .action(async () => {
      await ensureFirstRunSetup();
      console.log(`Config path: ${getConfigPath()}`);
    });

  program
    .command("chat")
    .description("Launch the cvmCode assistant")
    .action(async () => {
      await ensureFirstRunSetup();
      await ensureConfigIsHealthy();
      await startChat(process.cwd());
    });

  program
    .command("gui")
    .description("Launch the GUI preview scaffold")
    .action(async () => {
      await ensureFirstRunSetup();
      await ensureConfigIsHealthy();
      await launchGuiMode();
    });

  program
    .command("config")
    .description("Print saved config")
    .action(async () => {
      await ensureFirstRunSetup();
      console.log(JSON.stringify(await ensureConfigIsHealthy(), null, 2));
    });

  program
    .command("doctor")
    .description("Basic config/provider diagnostics")
    .action(async () => {
      await ensureFirstRunSetup();
      const config = await ensureConfigIsHealthy();
      const provider = config.providers[config.provider];
      console.log(`config: ${getConfigPath()}`);
      console.log(`provider: ${config.provider}`);
      console.log(`baseURL: ${provider?.baseURL ?? "missing"}`);
      console.log(`model: ${provider?.model ?? "missing"}`);
      if (provider?.apiKeyEnv) {
        console.log(
          `${provider.apiKeyEnv}: ${process.env[provider.apiKeyEnv] ? "set" : "missing"}`
        );
      } else {
        console.log(`apiKey: ${provider?.apiKey ? "stored" : "missing"}`);
      }
    });

  if (process.argv.slice(2).length === 0) {
    await ensureFirstRunSetup();
    await ensureConfigIsHealthy();
    const startupMode = await chooseStartupMode();
    if (startupMode === "gui") {
      await launchGuiMode();
      return;
    }
    await startChat(process.cwd());
    return;
  }

  await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
