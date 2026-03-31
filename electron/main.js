"use strict";
const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const isDev = !app.isPackaged;
const distRoot = isDev 
  ? path.join(__dirname, "..", "dist")
  : path.join(process.resourcesPath, "dist");
const initialRepo = process.cwd();

let win = null;
let currentChatId = null;
let chatCounter = 1;
const chatSessions = new Map();
const knownRepos = new Set();

function normalizeProviderName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function chatTitleFromMessages(messages) {
  const firstUser = messages.find((message) => message.role === "user");
  if (!firstUser || !firstUser.content) {
    return "New chat";
  }
  return firstUser.content.trim().slice(0, 48) || "New chat";
}

function createChat(seed = {}) {
  const id = `chat-${Date.now()}-${chatCounter++}`;
  const chat = {
    id,
    title: seed.title ?? "New chat",
    provider: seed.provider ?? null,
    repoPath: seed.repoPath ?? null,
    messages: Array.isArray(seed.messages) ? seed.messages : [],
    usage: seed.usage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    createdAt: new Date().toISOString()
  };
  chatSessions.set(id, chat);
  if (chat.repoPath) {
    knownRepos.add(chat.repoPath);
  }
  if (!currentChatId) {
    currentChatId = id;
  }
  return chat;
}

async function ensureInitialState() {
  try {
    const gitDir = path.join(initialRepo, ".git");
    await fs.access(gitDir);
    knownRepos.add(initialRepo);
  } catch {
    // Ignore non-git working directory.
  }

  if (chatSessions.size === 0) {
    createChat({ repoPath: knownRepos.has(initialRepo) ? initialRepo : null });
  }
}

function getActiveChat() {
  const active = currentChatId ? chatSessions.get(currentChatId) : null;
  if (active) {
    return active;
  }
  return createChat();
}

async function loadMods() {
  const storeUrl = new URL(`file://${distRoot.replace(/\\/g, "/")}/config/store.js`).href;
  const promptUrl = new URL(`file://${distRoot.replace(/\\/g, "/")}/prompt/compose.js`).href;
  const openaiUrl = new URL(`file://${distRoot.replace(/\\/g, "/")}/provider/openai-compatible.js`).href;
  const repoUrl = new URL(`file://${distRoot.replace(/\\/g, "/")}/repo/context.js`).href;
  const [store, prompt, openai, repo] = await Promise.all([
    import(storeUrl),
    import(promptUrl),
    import(openaiUrl),
    import(repoUrl)
  ]);
  return { store, prompt, openai, repo };
}

async function providerCatalog() {
  const { store } = await loadMods();
  const result = await store.loadConfigWithAutoFix();
  const config = result.config;
  const entries = Object.entries(config.providers).map(([id, provider]) => ({
    id,
    model: provider.model,
    endpointMode: provider.endpointMode ?? "responses",
    baseURL: provider.baseURL
  }));
  return { config, entries };
}

async function loadConfigModule() {
  const { store } = await loadMods();
  const result = await store.loadConfigWithAutoFix();
  return { store, config: result.config };
}

async function detectGitRepo(repoPath) {
  if (!repoPath) {
    return false;
  }
  try {
    await fs.access(path.join(repoPath, ".git"));
    return true;
  } catch {
    return false;
  }
}

async function serializeRepos() {
  const repos = [];
  for (const repoPath of knownRepos) {
    repos.push({
      path: repoPath,
      name: path.basename(repoPath) || repoPath,
      isGitRepo: await detectGitRepo(repoPath)
    });
  }
  repos.sort((left, right) => left.name.localeCompare(right.name));
  return repos;
}

function serializeChats() {
  return [...chatSessions.values()]
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
    .map((chat) => ({
      id: chat.id,
      title: chat.title,
      provider: chat.provider,
      repoPath: chat.repoPath,
      messageCount: chat.messages.length,
      preview:
        [...chat.messages]
          .reverse()
          .find((message) => message.role === "assistant" || message.role === "user")
          ?.content?.slice(0, 72) ?? "No messages yet",
      usage: chat.usage,
      messages: chat.messages
    }));
}

async function workspaceSnapshot() {
  await ensureInitialState();
  const { config, entries } = await providerCatalog();
  const activeChat = getActiveChat();
  return {
    app: {
      name: "cvmCode",
      version: "1.0.2"
    },
    currentChatId: activeChat.id,
    providers: entries,
    defaultProvider: config.provider,
    chats: serializeChats(),
    repos: await serializeRepos()
  };
}

function createWindow() {
  win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    title: "cvmCode",
    backgroundColor: "#f2ede2",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(async () => {
  await ensureInitialState();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("app:get-meta", async () => {
  try {
    const snapshot = await workspaceSnapshot();
    const currentChat = chatSessions.get(snapshot.currentChatId);
    const provider = snapshot.providers.find(
      (entry) => entry.id === (currentChat?.provider ?? snapshot.defaultProvider)
    );
    return {
      name: snapshot.app.name,
      version: snapshot.app.version,
      status: "ready",
      provider: provider?.id ?? snapshot.defaultProvider,
      model: provider?.model ?? "unknown",
      endpointMode: provider?.endpointMode ?? "responses",
      error: undefined,
      usage: currentChat?.usage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("app:get-config", async () => {
  const snapshot = await workspaceSnapshot();
  const currentChat = chatSessions.get(snapshot.currentChatId);
  const provider = snapshot.providers.find(
    (entry) => entry.id === (currentChat?.provider ?? snapshot.defaultProvider)
  );
  return {
    provider: provider?.id ?? snapshot.defaultProvider,
    model: provider?.model ?? "",
    endpointMode: provider?.endpointMode ?? "responses",
    baseURL: provider?.baseURL ?? ""
  };
});

ipcMain.handle("workspace:get", async () => workspaceSnapshot());

ipcMain.handle("provider:list-models", async (_event, providerId) => {
  const { config } = await providerCatalog();
  const targetProvider =
    typeof providerId === "string" && config.providers[providerId] ? providerId : config.provider;
  const { openai } = await loadMods();
  const runtimeConfig = { ...config, provider: targetProvider };
  return openai.listProviderModels(runtimeConfig);
});

ipcMain.handle("provider:update-model", async (_event, payload) => {
  const { store, config } = await loadConfigModule();
  const providerId =
    typeof payload?.providerId === "string" && config.providers[payload.providerId]
      ? payload.providerId
      : config.provider;
  const model = typeof payload?.model === "string" ? payload.model.trim() : "";

  if (!model) {
    return workspaceSnapshot();
  }

  await store.updateConfig((draft) => {
    if (draft.providers[providerId]) {
      draft.providers[providerId].model = model;
    }
    return draft;
  });

  return workspaceSnapshot();
});

ipcMain.handle("provider:create", async (_event, payload) => {
  const { store } = await loadConfigModule();
  const name = normalizeProviderName(payload?.name);
  if (!name) {
    throw new Error("Provider name is required.");
  }

  await store.updateConfig((draft) => {
    if (draft.providers[name]) {
      throw new Error(`Provider "${name}" already exists.`);
    }

    draft.providers[name] = {
      type: "openai-compatible",
      baseURL:
        typeof payload?.baseURL === "string" && payload.baseURL.trim()
          ? payload.baseURL.trim()
          : "https://api.openai.com/v1",
      model:
        typeof payload?.model === "string" && payload.model.trim()
          ? payload.model.trim()
          : "gpt-4.1",
      endpointMode: payload?.endpointMode === "chat-completions" ? "chat-completions" : "responses",
      ...(typeof payload?.apiKeyEnv === "string" && payload.apiKeyEnv.trim()
        ? { apiKeyEnv: payload.apiKeyEnv.trim() }
        : {}),
      ...(typeof payload?.apiKey === "string" && payload.apiKey.trim()
        ? { apiKey: payload.apiKey.trim() }
        : {})
    };

    if (!draft.provider) {
      draft.provider = name;
    }

    return draft;
  });

  return workspaceSnapshot();
});

ipcMain.handle("chat:new", async () => {
  const snapshot = await workspaceSnapshot();
  createChat({
    provider: snapshot.defaultProvider,
    repoPath: knownRepos.has(initialRepo) ? initialRepo : null
  });
  currentChatId = getActiveChat().id;
  return workspaceSnapshot();
});

ipcMain.handle("chat:switch", async (_event, chatId) => {
  if (typeof chatId === "string" && chatSessions.has(chatId)) {
    currentChatId = chatId;
  }
  return workspaceSnapshot();
});

ipcMain.handle("chat:clear", async (_event, chatId) => {
  const chat = typeof chatId === "string" ? chatSessions.get(chatId) : getActiveChat();
  if (chat) {
    chat.messages = [];
    chat.title = "New chat";
    chat.usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  }
  return workspaceSnapshot();
});

ipcMain.handle("chat:set-provider", async (_event, payload) => {
  const chat = chatSessions.get(payload?.chatId);
  if (chat && typeof payload?.provider === "string") {
    chat.provider = payload.provider;
  }
  return workspaceSnapshot();
});

ipcMain.handle("chat:set-repo", async (_event, payload) => {
  const chat = chatSessions.get(payload?.chatId);
  if (chat && typeof payload?.repoPath === "string") {
    chat.repoPath = payload.repoPath.length > 0 ? payload.repoPath : null;
    if (chat.repoPath) {
      knownRepos.add(chat.repoPath);
    }
  }
  return workspaceSnapshot();
});

ipcMain.handle("repo:pick", async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ["openDirectory"],
    title: "Choose a repository folder"
  });

  if (result.canceled || result.filePaths.length === 0) {
    return workspaceSnapshot();
  }

  knownRepos.add(result.filePaths[0]);
  return workspaceSnapshot();
});

ipcMain.on("chat:send", async (event, payload) => {
  const requestId = payload?.requestId;
  const chatId = payload?.chatId;
  const message = payload?.message;

  if (!requestId || typeof requestId !== "string") {
    event.sender.send("chat:error", { requestId: "unknown", error: "Missing request id" });
    return;
  }

  if (!chatId || typeof chatId !== "string" || !chatSessions.has(chatId)) {
    event.sender.send("chat:error", { requestId, error: "Invalid chat id" });
    return;
  }

  if (!message || typeof message !== "string" || !message.trim()) {
    event.sender.send("chat:error", { requestId, error: "Empty message" });
    return;
  }

  try {
    const { store, prompt, openai, repo } = await loadMods();
    const result = await store.loadConfigWithAutoFix();
    const config = result.config;
    const chat = chatSessions.get(chatId);
    const providerName = chat.provider && config.providers[chat.provider] ? chat.provider : config.provider;
    const runtimeConfig = { ...config, provider: providerName };
    const cwd = chat.repoPath ?? app.getPath("home");
    const repoSummary = chat.repoPath ? await repo.summarizeRepository(chat.repoPath) : undefined;
    const instructions = prompt.composeSystemPrompt(repoSummary);
    const history = [{ role: "system", content: instructions }, ...chat.messages];

    history.push({ role: "user", content: message });
    chat.messages.push({ role: "user", content: message });
    currentChatId = chat.id;

    const turn = await openai.runAgentTurn({
      config: runtimeConfig,
      instructions,
      history,
      cwd,
      stream: {
        onTextDelta(delta) {
          event.sender.send("chat:chunk", { requestId, chatId, delta });
        }
      }
    });

    chat.messages.push({ role: "assistant", content: turn.text });
    chat.title = chatTitleFromMessages(chat.messages);
    chat.usage = {
      inputTokens: (chat.usage.inputTokens ?? 0) + (turn.usage?.inputTokens ?? 0),
      outputTokens: (chat.usage.outputTokens ?? 0) + (turn.usage?.outputTokens ?? 0),
      totalTokens: (chat.usage.totalTokens ?? 0) + (turn.usage?.totalTokens ?? 0)
    };

    event.sender.send("chat:done", {
      requestId,
      chatId,
      text: turn.text,
      usage: turn.usage ?? {},
      workspace: await workspaceSnapshot()
    });
  } catch (err) {
    event.sender.send("chat:error", { requestId, chatId, error: String(err) });
  }
});
