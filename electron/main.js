"use strict";
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const { createRequire } = require("node:module");

// dist/ is two levels above electron/: electron/ -> project root -> dist/
const distRoot = path.join(__dirname, "..", "dist");

let win = null;
const chatHistory = [];

async function loadMods() {
  // Use import() even from CJS so we can load ES modules in dist/
  const storeUrl = new URL(`file://${distRoot.replace(/\\/g, "/")}/config/store.js`).href;
  const promptUrl = new URL(`file://${distRoot.replace(/\\/g, "/")}/prompt/compose.js`).href;
  const openaiUrl = new URL(`file://${distRoot.replace(/\\/g, "/")}/provider/openai-compatible.js`).href;
  const [store, prompt, openai] = await Promise.all([
    import(storeUrl),
    import(promptUrl),
    import(openaiUrl)
  ]);
  return { store, prompt, openai };
}

async function getConfigInfo() {
  try {
    const { store } = await loadMods();
    const result = await store.loadConfigWithAutoFix();
    const config = result.config;
    const provider = config.providers[config.provider];
    return {
      ok: true,
      provider: config.provider,
      model: provider?.model ?? "unknown",
      endpointMode: provider?.endpointMode ?? "responses",
      baseURL: provider?.baseURL ?? "",
      config
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: "cvmCode",
    backgroundColor: "#0b1020",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("app:get-meta", async () => {
  const info = await getConfigInfo();
  return {
    name: "cvmCode",
    version: "1.0.2",
    status: info.ok ? "ready" : "error",
    provider: info.provider,
    model: info.model,
    endpointMode: info.endpointMode,
    error: info.error,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  };
});

ipcMain.handle("app:get-config", async () => {
  const info = await getConfigInfo();
  if (!info.ok) return { error: info.error };
  return {
    provider: info.provider,
    model: info.model,
    endpointMode: info.endpointMode,
    baseURL: info.baseURL
  };
});

ipcMain.handle("chat:send", async (_event, message) => {
  if (!message || typeof message !== "string" || !message.trim()) {
    return { error: "Empty message" };
  }

  try {
    const { store, prompt, openai } = await loadMods();
    const result = await store.loadConfigWithAutoFix();
    const config = result.config;

    if (chatHistory.length === 0) {
      const instructions = prompt.composeSystemPrompt();
      chatHistory.push({ role: "system", content: instructions });
    }

    chatHistory.push({ role: "user", content: message });

    const turn = await openai.runAgentTurn({
      config,
      instructions: chatHistory[0].content,
      history: chatHistory,
      cwd: app.getPath("home")
    });

    chatHistory.push({ role: "assistant", content: turn.text });

    return { text: turn.text, usage: turn.usage ?? {} };
  } catch (err) {
    return { error: String(err) };
  }
});
