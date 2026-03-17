# cvmCode

cvmCode is a chat-first terminal coding agent.

## What changed

- Launch with **`cvmCode`** or **`cvmcode`**
- On first launch, it runs setup automatically
- Setup is saved to `~/.cvmcode/config.yaml`
- After setup, launching `cvmCode` opens the assistant
- The assistant always talks through a dedicated system prompt

## Commands

```bash
cvmCode
cvmCode chat
cvmCode init
cvmCode config
cvmCode doctor
```

## Windows installer

From the repo root:

```bat
install.cmd
```

This will:

- build cvmCode
- install runtime files to `%LOCALAPPDATA%\cvmCode`
- create `cvmCode.cmd` and `cvmcode.cmd`
- add `%USERPROFILE%\.cvmcode\bin` to your user PATH

Then open a new terminal and run:

```bat
cvmCode
```

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
node dist/cli/index.js
```
