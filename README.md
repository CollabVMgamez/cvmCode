# cvmCode 

cvmCode is a coding assistant for your terminal and desktop. It connects to any OpenAI-compatible provider, has a guided first-run setup, and ships with a built-in Electron GUI.

## Quick start

### Run from source

```bash
pnpm install
pnpm build
pnpm dev
```

### Or run the built CLI

```bash
node dist/cli/index.js
```

On first launch, a setup wizard runs automatically. Choose a provider, enter your API key or env var name, and pick a model.

## Install globally

### Windows — `install.cmd` or `install.bat`

```bat
install.cmd
```

Installs to `%LOCALAPPDATA%\cvmCode` and adds `cvmCode.cmd` to `%USERPROFILE%\.cvmcode\bin`. Open a new terminal and run `cvmCode`.

### Linux / macOS — `install.sh`

```sh
sh ./install.sh
```

Installs to `~/.local/share/cvmCode` and creates launchers in `~/.local/bin`. Open a new terminal and run `cvmCode`.

### Uninstall

```sh
sh ./scripts/uninstall.sh
```

## Usage

### Startup mode

When you run `cvmCode` with no arguments, it asks you to choose between:

- **CLI chat** — terminal chat interface
- **GUI preview** — Electron desktop window

You can also pass a subcommand directly:

```bash
cvmCode chat     # CLI chat mode
cvmCode gui      # open the GUI
cvmCode init     # re-run first-run setup
cvmCode config   # print saved config
cvmCode doctor   # show provider diagnostics
```

## CLI chat commands

Inside the CLI chat interface:

| Command | What it does |
|---|---|
| `/help` | Show all commands |
| `/provider` | Switch or add a provider |
| `/model` | Switch model |
| `/models` | List available models |
| `/endpoint` | Switch between `responses` and `chat-completions` |
| `/config` | Show current config |
| `/doctor` | Show provider health info |
| `/context` | Adjust context window (file count, snippet count, size, root) |
| `/showthink` | Show provider reasoning when available |
| `/hidethink` | Hide reasoning panels |
| `/add-provider` | Add a new provider |
| `/remove-provider` | Remove a provider |
| `/rename-provider` | Rename a provider |
| `/baseurl` | Change the active provider's base URL |
| `/apikey` | Change auth mode (env var, inline, or clear) |
| `/headers` | Set custom request headers |
| `/clear` | Clear the screen and redraw the header |
| `/exit` | Quit |

## Token usage

After each reply, cvmCode shows token counts when the provider returns usage data:

```
  tokens · in 512 · out 1024 · total 1536
```

Cost tracking is not implemented yet.

## GUI

The Electron GUI opens from `cvmCode gui` or the startup mode selector.

Features:
- Full chat workspace with styled message bubbles
- Code block rendering in assistant messages
- Session token count in the sidebar
- Active provider, model, and endpoint displayed
- Clear chat button
- Shift+Enter for multiline input

The GUI calls the same provider backend as the CLI using IPC.

## Preset providers

Providers shipped in [`src/provider/presets.ts`](src/provider/presets.ts):

- OpenAI
- Together AI
- Groq
- Cerebras
- DeepSeek
- xAI
- Anthropic
- Alibaba Cloud (Qwen)
- OpenRouter
- Mistral
- Fireworks AI
- Perplexity

## Config

Config is stored at `~/.cvmcode/config.yaml`. You can edit it directly or use in-chat commands.

## Development

```bash
pnpm install
pnpm build     # compile TypeScript
pnpm test      # run tests
pnpm dev       # run from source with tsx
pnpm lint      # lint
pnpm format    # format with prettier
```

## Changelog

See [`CHANGELOG.md`](CHANGELOG.md).

## License

[MIT](LICENSE)
