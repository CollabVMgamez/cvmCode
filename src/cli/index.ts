#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { ensureFirstRunSetup } from "../bootstrap/first-run.js";
import { startChat } from "../chat/repl.js";
import { getConfigPath, loadConfigWithAutoFix } from "../config/store.js";

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

async function main() {
  const program = new Command();

  program
    .name("cvmCode")
    .description(
      "cvmCode: terminal coding assistant with first-run setup and a built-in system prompt"
    )
    .version("1.0.0")
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
    await startChat(process.cwd());
    return;
  }

  await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
