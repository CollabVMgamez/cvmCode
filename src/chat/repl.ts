import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import prompts from "prompts";
import { loadConfigWithAutoFix } from "../config/store.js";
import {
  COMMAND_HINTS,
  commandMatches,
  contextWindowSummary,
  handleSlashCommand
} from "./command-handlers.js";
import { composeSystemPrompt } from "../prompt/compose.js";
import { ProviderRequestError, renderProviderFailure } from "../provider/errors.js";
import { summarizeRepository } from "../repo/context.js";
import { runAgentTurn } from "../provider/openai-compatible.js";
import { ChatMessage } from "../types.js";
import {
  renderChatIntro,
  renderCommandPalette,
  renderErrorMessage,
  renderMutedInfo,
  renderPrompt,
  renderStreamingChunk,
  renderStreamingEnd,
  renderStreamingStart,
  renderThinkingPanel,
  renderUsageLine,
  renderUserMessage,
  withThinking
} from "../ui/tui.js";

export async function startChat(cwd: string): Promise<void> {
  let { config } = await loadConfigWithAutoFix();
  let contextRoot = cwd;
  let contextFileLimit = 10;
  let contextSnippetLimit = 5;
  let contextSnippetBytes = 1200;
  let showThinking = false;
  let repo = await summarizeRepository(contextRoot, {
    fileLimit: contextFileLimit,
    snippetLimit: contextSnippetLimit,
    snippetBytes: contextSnippetBytes
  });
  let rl = readline.createInterface({ input, output });
  let provider = config.providers[config.provider];
  let instructions = composeSystemPrompt(repo);
  let sessionChangeCount = 0;

  const history: ChatMessage[] = [
    {
      role: "system",
      content: instructions
    }
  ];

  function applyLiveConfig(nextConfig: typeof config, notice: string) {
    config = nextConfig;
    provider = config.providers[config.provider];
    instructions = composeSystemPrompt(repo);
    history[0] = { role: "system", content: instructions };
    sessionChangeCount += 1;
    renderMutedInfo(`${notice} Session preserved.`);
    console.log("");
  }

  async function reloadRepositoryContext(notice: string) {
    repo = await summarizeRepository(contextRoot, {
      fileLimit: contextFileLimit,
      snippetLimit: contextSnippetLimit,
      snippetBytes: contextSnippetBytes
    });
    instructions = composeSystemPrompt(repo);
    history[0] = { role: "system", content: instructions };
    renderMutedInfo(`${notice} Context reloaded.`);
    console.log("");
  }

  async function runPromptSession<T>(questions: T): Promise<any> {
    rl.pause();
    const result = await prompts(questions as any);
    rl.resume();
    return result;
  }

  renderChatIntro({
    cwd: repo.root,
    provider: config.provider,
    model: provider?.model ?? "unknown",
    endpointMode: provider?.endpointMode ?? "responses",
    fileCount: repo.files.length,
    contextWindow: contextWindowSummary(repo)
  });

  while (true) {
    const line = (await rl.question(renderPrompt())).trim();
    if (!line) {
      continue;
    }

    const matchingCommands = commandMatches(line);
    if (matchingCommands.length > 1 && !COMMAND_HINTS.some((command) => command.startsWith(line))) {
      renderCommandPalette(matchingCommands);
      continue;
    }

    const commandResult = await handleSlashCommand(line, {
      config,
      provider,
      repo,
      contextRoot,
      contextFileLimit,
      contextSnippetLimit,
      contextSnippetBytes,
      showThinking
    }, {
      runPromptSession,
      applyLiveConfig,
      reloadRepositoryContext
    });

    if (commandResult.handled) {
      if (commandResult.state?.config) {
        config = commandResult.state.config;
      }
      if (commandResult.state?.provider !== undefined) {
        provider = commandResult.state.provider;
      }
      if (commandResult.state?.repo) {
        repo = commandResult.state.repo;
      }
      if (commandResult.state?.contextRoot) {
        contextRoot = commandResult.state.contextRoot;
      }
      if (typeof commandResult.state?.contextFileLimit === "number") {
        contextFileLimit = commandResult.state.contextFileLimit;
      }
      if (typeof commandResult.state?.contextSnippetLimit === "number") {
        contextSnippetLimit = commandResult.state.contextSnippetLimit;
      }
      if (typeof commandResult.state?.contextSnippetBytes === "number") {
        contextSnippetBytes = commandResult.state.contextSnippetBytes;
      }
      if (typeof commandResult.state?.showThinking === "boolean") {
        showThinking = commandResult.state.showThinking;
      }
      if (commandResult.exit) {
        break;
      }
      continue;
    }

    renderUserMessage(line);
    history.push({ role: "user", content: line });

    try {
      instructions = composeSystemPrompt(repo);
      history[0] = { role: "system", content: instructions };
      const result = await withThinking(
        showThinking ? "Thinking (reasoning capture enabled)" : "Thinking",
        runAgentTurn({
          config,
          instructions,
          history,
          cwd: repo.root
        })
      );
      history.push({ role: "assistant", content: result.text });
      if (showThinking && result.thinking) {
        renderThinkingPanel(result.thinking);
      }
      renderStreamingStart();
      renderStreamingChunk(result.text);
      renderStreamingEnd();
      renderUsageLine(result.usage);
      if (sessionChangeCount > 0) {
        renderMutedInfo(`Live session changes applied: ${sessionChangeCount}`);
        console.log("");
        sessionChangeCount = 0;
      }
    } catch (error) {
      history.pop();
      const rendered =
        error instanceof ProviderRequestError
          ? renderProviderFailure(error.details)
          : error instanceof Error
            ? error.message
            : String(error);
      renderErrorMessage(rendered);
      renderMutedInfo("Tip: use /doctor to inspect provider config.");
      console.log("");
    }
  }

  await rl.close();
}
