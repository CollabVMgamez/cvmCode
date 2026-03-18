# Changelog

## v1.0.2 — 2026-03-18

### Added
- Startup mode choice between CLI and GUI when running `cvmCode` with no arguments via [`chooseStartupMode()`](src/cli/index.ts:32)
- `cvmCode gui` CLI command to launch the Electron GUI directly
- Token usage extraction in the provider layer via [`extractUsage()`](src/provider/openai-compatible.ts:99)
- Token usage now returned in [`AgentTurnResult`](src/types.ts:54) for both `responses` and `chat-completions` endpoints
- CLI usage display after each reply via [`renderUsageLine()`](src/ui/tui.ts:144)
- Full Electron desktop GUI with:
  - working chat interface connected to the real provider backend
  - user/AI message bubbles with code block rendering
  - per-message and session token accumulation in the sidebar
  - provider name, model, and endpoint mode display
  - clear chat button
- [`electron/package.json`](electron/package.json) scoped to `type: "commonjs"` to fix CJS preload in an ESM project
- [`electron/preload.js`](electron/preload.js) updated to use `require()` correctly and expose `sendChat`, `getConfig`, and `getMeta` IPC channels
- [`electron/main.js`](electron/main.js) updated to handle `chat:send`, `app:get-config`, and `app:get-meta` IPC handlers using `runAgentTurn()` from compiled `dist/`

### Changed
- Version bumped to `1.0.2` in [`package.json`](package.json), [`src/cli/index.ts`](src/cli/index.ts), [`src/ui/tui.ts`](src/ui/tui.ts), and [`electron/main.js`](electron/main.js)
- Chat header now shows `v1.0.2`
- Electron GUI redesigned from scaffold to a usable chat shell with styled dark theme in [`electron/renderer/styles.css`](electron/renderer/styles.css)

## v1.0.1

### Added
- Chat command handler refactor: slash commands extracted from [`startChat()`](src/chat/repl.ts:31) into [`src/chat/command-handlers.ts`](src/chat/command-handlers.ts)
- [`handleSlashCommand()`](src/chat/command-handlers.ts:246) function handling all slash commands
- Context window controls via [`/context`](src/chat/command-handlers.ts:290): file limit, snippet limit, snippet size, and root directory
- Best-effort provider reasoning via [`/showthink`](src/chat/command-handlers.ts:258) and [`/hidethink`](src/chat/command-handlers.ts:264)
- Reasoning extraction in both response and chat-completion turns via [`extractResponsesThinking()`](src/provider/openai-compatible.ts:135) and [`extractChatCompletionThinking()`](src/provider/openai-compatible.ts:299)
- [`renderThinkingPanel()`](src/ui/tui.ts:139) for displaying provider reasoning
- Command palette suggestions for partial slash commands via [`commandMatches()`](src/chat/command-handlers.ts:94)
- Shell uninstall script at [`scripts/uninstall.sh`](scripts/uninstall.sh)
- Configurable file/snippet context with new [`RepoSummary`](src/types.ts:23) fields
- [`summarizeRepository()`](src/repo/context.ts:24) accepts `fileLimit`, `snippetLimit`, and `snippetBytes` options

### Changed
- [`startChat()`](src/chat/repl.ts:31) reduced to a simple main loop delegating to [`handleSlashCommand()`](src/chat/command-handlers.ts:246)
- [`renderUserMessage()`](src/ui/tui.ts:144) called before sending to the provider
- Electron GUI scaffold added at [`electron/`](electron)

## v1.0.0 — Initial release

### Added
- First-run onboarding via [`ensureFirstRunSetup()`](src/bootstrap/first-run.ts:54)
- Preset provider catalog via [`PROVIDER_PRESETS`](src/provider/presets.ts:10) including OpenAI, Anthropic, Together AI, Groq, Cerebras, DeepSeek, xAI, Alibaba Cloud, OpenRouter, Mistral, Fireworks AI, and Perplexity
- OpenAI-compatible provider support via [`runAgentTurn()`](src/provider/openai-compatible.ts:434) and [`runResponsesTurn()`](src/provider/openai-compatible.ts:188)
- Chat-completions and responses endpoint modes
- Interactive model picker via [`listProviderModels()`](src/provider/openai-compatible.ts:447)
- In-chat provider/model switching via `/provider` and `/model`
- Config doctor via `/doctor` command and `cvmCode doctor` CLI command
- Windows installers [`install.cmd`](install.cmd) and [`install.bat`](install.bat)
- Shell installer [`install.sh`](install.sh)
- PowerShell installer [`scripts/install.ps1`](scripts/install.ps1)
- YAML config storage via [`src/config/store.ts`](src/config/store.ts)
- Tool use in both response and chat-completions modes via [`src/tools/agent-tools.ts`](src/tools/agent-tools.ts)
- Repository context scanning via [`summarizeRepository()`](src/repo/context.ts:24)
- Provider error classification via [`classifyProviderFailure()`](src/provider/errors.ts)
- Retry with exponential-style backoff for retryable errors
