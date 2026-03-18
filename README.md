# cvmCode v1.0

cvmCode is a terminal coding assistant focused on fast setup, multi-provider support, and a chat-first workflow for real repositories.

## Why cvmCode

- clean terminal UI
- automatic first-run onboarding
- preset providers for popular AI platforms
- model picker using [`/v1/models`](src/provider/openai-compatible.ts:365) when available
- fallback to manual model entry when providers do not expose a model list
- chat-first workflow with live provider/model switching
- repository-aware prompting

## Features

- first-run setup with a more decorative onboarding flow in [`ensureFirstRunSetup()`](src/bootstrap/first-run.ts:153)
- preset provider catalog in [`PROVIDER_PRESETS`](src/provider/presets.ts:10)
- OpenAI-compatible provider support
- filterable model selection in chat via [`chooseModelInteractively()`](src/chat/repl.ts:59)
- richer provider creation flow inside chat via [`createProviderInteractively()`](src/chat/repl.ts:107)
- switch providers and models from inside chat
- built-in config doctor command
- Windows and shell installers via [`install.bat`](install.bat), [`install.cmd`](install.cmd), [`install.sh`](install.sh), and [`scripts/uninstall.sh`](scripts/uninstall.sh)

## Included preset providers

Current presets are defined in [`src/provider/presets.ts`](src/provider/presets.ts) and include:

- OpenAI
- Together AI
- Groq
- Cerebras
- DeepSeek
- xAI
- Anthropic
- Alibaba Cloud
- OpenRouter
- Mistral
- Fireworks AI
- Perplexity

## Quick start

### Run in development

```bash
pnpm install
pnpm build
pnpm test
pnpm dev
```

### Run the built CLI directly

```bash
node dist/cli/index.js
```

### Main commands

```bash
cvmCode
cvmCode chat
cvmCode init
cvmCode config
cvmCode doctor
```

## Install

### Windows

Run either [`install.cmd`](install.cmd) or [`install.bat`](install.bat) from the repo root:

```bat
install.cmd
```

or

```bat
install.bat
```

This installer will:

- install dependencies if needed
- build cvmCode
- copy the runtime into `%LOCALAPPDATA%\cvmCode`
- create `cvmCode.cmd` and `cvmcode.cmd` shims in `%USERPROFILE%\.cvmcode\bin`
- add the bin directory to your user `PATH`

After install, open a new terminal and run:

```bat
cvmCode
```

### Linux / macOS / shell environments

Use [`install.sh`](install.sh):

```sh
sh ./install.sh
```

To remove a shell install later:

```sh
sh ./scripts/uninstall.sh
```

This installer will:

- build the project
- install runtime files into `~/.local/share/cvmCode`
- create `cvmCode` and `cvmcode` launchers in `~/.local/bin`
- print a `PATH` hint if `~/.local/bin` is not already available

After install, open a new terminal and run:

```sh
cvmCode
```

## First-run experience

On first launch, cvmCode will:

1. show a styled onboarding screen
2. let you choose a default provider
3. let you include multiple preset providers in your config
4. let you decide whether the default provider should use an environment variable or a pasted API key
5. fetch models from the provider when possible
6. fall back to manual model entry if needed

Config is saved to `~/.cvmcode/config.yaml` on first setup.

## In-chat commands

Inside chat, you can use commands such as:

- `/help`
- `/provider`
- `/model`
- `/models`
- `/endpoint`
- `/doctor`
- `/config`
- `/add-provider`
- `/remove-provider`
- `/rename-provider`
- `/baseurl`
- `/apikey`
- `/headers`
- `/exit`

The command handling lives in [`startChat()`](src/chat/repl.ts:172).

## Development

Useful commands:

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm format
```

Important files:

- [`src/bootstrap/first-run.ts`](src/bootstrap/first-run.ts)
- [`src/provider/presets.ts`](src/provider/presets.ts)
- [`src/provider/openai-compatible.ts`](src/provider/openai-compatible.ts)
- [`src/chat/repl.ts`](src/chat/repl.ts)
- [`src/config/store.ts`](src/config/store.ts)
- [`src/ui/tui.ts`](src/ui/tui.ts)
- [`scripts/uninstall.sh`](scripts/uninstall.sh)

## License

This project is licensed under the [`MIT`](LICENSE) license.
