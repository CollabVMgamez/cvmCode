# Changelog

## Unreleased

### Added
- richer first-run setup with preset providers in [`ensureFirstRunSetup()`](src/bootstrap/first-run.ts:153)
- preset provider catalog in [`PROVIDER_PRESETS`](src/provider/presets.ts:10)
- provider model discovery during setup and in-chat model picking via [`listProviderModels()`](src/provider/openai-compatible.ts:365)
- shell installers and uninstall support through [`install.sh`](install.sh) and [`scripts/uninstall.sh`](scripts/uninstall.sh)
- provider preset regression coverage in [`tests/provider-presets.test.ts`](tests/provider-presets.test.ts)
- configurable context window controls through [`/context`](src/chat/repl.ts:355)
- best-effort reasoning visibility through [`/showthink`](src/chat/repl.ts:341) and [`/hidethink`](src/chat/repl.ts:347)

### Changed
- improved provider creation flow in [`createProviderInteractively()`](src/chat/repl.ts:158)
- improved auth UX in [`/apikey`](src/chat/repl.ts:611)
- improved model selection flow in [`chooseModelInteractively()`](src/chat/repl.ts:99)
- redesigned terminal UI in [`renderChatIntro()`](src/ui/tui.ts:61)
- improved chat command discovery with [`renderCommandPalette()`](src/ui/tui.ts:102)
- extended repository summary metadata in [`RepoSummary`](src/types.ts:23) and [`summarizeRepository()`](src/repo/context.ts:24)

### Notes
- reasoning visibility is best-effort only and depends on the active provider returning reasoning-like fields in a compatible shape

## v1.0.0

- initial public release
- terminal chat workflow
- config storage
- provider switching
- OpenAI-compatible backend support
