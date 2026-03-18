# cvmCode v1.0 Release Notes

## Overview

v1.0 is the first major release of cvmCode, focused on making the CLI easier to install, easier to configure, and much better to use on first launch.

This release introduces a polished first-run onboarding flow, multi-provider preset setup, model selection during setup, better installer coverage, and a more complete project layout for GitHub release publishing.

## Highlights

### New first-run onboarding

The first-run experience has been upgraded to feel much more premium and guided.

New onboarding improvements include:
- decorative terminal welcome screen
- guided setup flow
- clearer provider and authentication wording
- setup summary panel before model selection
- automatic config creation on first launch

Relevant implementation:
- [`ensureFirstRunSetup()`](src/bootstrap/first-run.ts:153)
- [`panel()`](src/ui/tui.ts:53)

### Preset provider catalog

cvmCode now ships with built-in preset providers so users no longer need to manually type provider details on first launch.

Included presets:
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

Relevant implementation:
- [`PROVIDER_PRESETS`](src/provider/presets.ts:10)
- [`createPresetProviderMap()`](src/provider/presets.ts:187)

### Model selection during setup

First-run setup now attempts to fetch available models from the selected provider automatically.

Behavior:
- calls the provider model listing endpoint
- shows an interactive model picker when models are returned
- falls back to manual model id entry if listing is unavailable

Relevant implementation:
- [`chooseModel()`](src/bootstrap/first-run.ts:104)
- [`listProviderModels()`](src/provider/openai-compatible.ts:365)

### Better install experience

v1.0 adds more installation entry points for different environments.

Installers now include:
- [`install.cmd`](install.cmd)
- [`install.bat`](install.bat)
- [`install.sh`](install.sh)

This makes it easier to install cvmCode on Windows and shell-based environments.

### Versioned release branding

The project now identifies as v1.0 in the CLI and package metadata.

Updated locations include:
- [`package.json`](package.json:3)
- [`src/cli/index.ts`](src/cli/index.ts:27)
- [`src/ui/tui.ts`](src/ui/tui.ts:77)

### GitHub/project publishing improvements

This release also improves repository readiness by adding:
- a better [`README.md`](README.md)
- an MIT [`LICENSE`](LICENSE)
- release notes for v1.0 in [`RELEASE_NOTES_v1.0.md`](RELEASE_NOTES_v1.0.md)

## Quality and validation

Before release, the project was validated with:
- [`pnpm test`](package.json)
- [`pnpm build`](package.json)

Status at release:
- 7 test files passed
- 14 tests passed
- TypeScript build passed

## Notes

- Default models in provider presets can be adjusted in [`src/provider/presets.ts`](src/provider/presets.ts).
- First-run config is saved to `~/.cvmcode/config.yaml`.
- Users can switch providers and models later from inside chat using commands such as [`/provider`](src/chat/repl.ts:217), [`/model`](src/chat/repl.ts:157), and [`/models`](src/chat/repl.ts:145).

## v1.0 summary

cvmCode v1.0 delivers:
- a cleaner first impression
- faster provider setup
- preset multi-provider configuration
- automatic model discovery with manual fallback
- better install options
- improved repo readiness for public release
