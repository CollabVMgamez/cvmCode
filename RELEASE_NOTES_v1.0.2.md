# cvmCode v1.0.2

## What's new

### Desktop GUI
Run `cvmCode` and choose **GUI preview** to open the new Electron desktop app. It connects to your configured provider and lets you chat from a proper window with message bubbles, code block rendering, and a session token counter in the sidebar.

### Startup mode selector
Running `cvmCode` with no arguments now asks whether you want the CLI or the GUI. You can also use `cvmCode gui` or `cvmCode chat` to skip the prompt.

### Token usage display
After each reply, the CLI now shows how many tokens were used (input / output / total) when the provider returns usage data.

## Bug fixes
- Fixed the Electron IPC error (`Cannot read properties of undefined (reading 'getMeta')`) caused by the preload script being loaded as ESM in a CJS context.

## Install / upgrade
If you installed with the script before, just re-run it:

**Windows:**
```bat
install.cmd
```

**Linux / macOS:**
```sh
sh ./install.sh
```
