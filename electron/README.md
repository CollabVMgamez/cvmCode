# cvmCode GUI Scaffold

This directory contains the initial Electron desktop scaffold for a future graphical version of [`cvmCode`](../README.md).

Current scaffold includes:
- Electron main process in [`main.js`](main.js)
- preload bridge in [`preload.js`](preload.js)
- renderer HTML in [`renderer/index.html`](renderer/index.html)
- renderer styling in [`renderer/styles.css`](renderer/styles.css)
- renderer startup logic in [`renderer/renderer.js`](renderer/renderer.js)

This is only a starting point. It does not yet run chat or provider logic directly.

Planned next steps:
- move config actions behind IPC
- expose chat/session APIs to the renderer
- add provider/model selectors
- add message history and streaming output
- add context controls and reasoning panel
