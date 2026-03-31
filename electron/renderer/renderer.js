const THEME_KEY = "cvmcode-theme";

const messagesEl = document.getElementById("messages");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");
const chatStatus = document.getElementById("chat-status");
const usageTotal = document.getElementById("usage-total");
const usageBreakdown = document.getElementById("usage-breakdown");
const chatTitle = document.getElementById("chat-title");
const chatList = document.getElementById("chat-list");
const repoSelect = document.getElementById("repo-select");
const providerSelect = document.getElementById("provider-select");
const modelSelect = document.getElementById("model-select");
const providerEndpoint = document.getElementById("provider-endpoint");
const providerModel = document.getElementById("provider-model");
const btnNewChat = document.getElementById("btn-new-chat");
const btnAddRepo = document.getElementById("btn-add-repo");
const btnClear = document.getElementById("btn-clear");
const btnRefreshModels = document.getElementById("btn-refresh-models");
const btnSaveModel = document.getElementById("btn-save-model");
const btnCreateProvider = document.getElementById("btn-create-provider");
const themeToggle = document.getElementById("theme-toggle");
const providerNameInput = document.getElementById("provider-name-input");
const providerBaseUrlInput = document.getElementById("provider-base-url-input");
const providerApiKeyEnvInput = document.getElementById("provider-api-key-env-input");
const providerApiKeyInput = document.getElementById("provider-api-key-input");
const providerDefaultModelInput = document.getElementById("provider-default-model-input");
const providerEndpointInput = document.getElementById("provider-endpoint-input");

let workspace = null;
let modelCache = new Map();
const activeRequests = new Map();

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMarkdown(text) {
  let result = String(text ?? "").replace(/```([a-z]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="lang-${lang}">${escapeHtml(code.trim())}</code></pre>`;
  });
  result = result.replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`);
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  return result;
}

function applyTheme(theme) {
  const resolved = theme === "dark" ? "dark" : "light";
  document.body.dataset.theme = resolved;
  themeToggle.textContent = resolved === "dark" ? "☀" : "☾";
  localStorage.setItem(THEME_KEY, resolved);
}

function setStatus(text) {
  chatStatus.textContent = text;
}

function autoResize() {
  chatInput.style.height = "auto";
  chatInput.style.height = `${Math.min(chatInput.scrollHeight, 180)}px`;
}

function currentChat() {
  return workspace?.chats?.find((chat) => chat.id === workspace.currentChatId) ?? null;
}

function currentProvider() {
  const chat = currentChat();
  const providerId = chat?.provider ?? workspace?.defaultProvider;
  return workspace?.providers?.find((provider) => provider.id === providerId) ?? null;
}

function updateUsage(usage) {
  usageTotal.textContent = `${(usage?.totalTokens ?? 0).toLocaleString()} tokens`;
  usageBreakdown.textContent = `in ${(usage?.inputTokens ?? 0).toLocaleString()} · out ${(usage?.outputTokens ?? 0).toLocaleString()}`;
}

function createMessage(role, content, usage) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;

  const roleLabel = document.createElement("div");
  roleLabel.className = "message-role";
  roleLabel.textContent = role === "user" ? "You" : "cvmCode";

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.innerHTML = renderMarkdown(content);

  wrapper.appendChild(roleLabel);
  wrapper.appendChild(bubble);

  if (usage && (usage.totalTokens || usage.inputTokens || usage.outputTokens)) {
    const tokenLine = document.createElement("div");
    tokenLine.className = "message-tokens";
    tokenLine.textContent = [
      usage.inputTokens ? `in ${usage.inputTokens}` : null,
      usage.outputTokens ? `out ${usage.outputTokens}` : null,
      usage.totalTokens ? `total ${usage.totalTokens}` : null
    ]
      .filter(Boolean)
      .join(" · ");
    wrapper.appendChild(tokenLine);
  }

  return wrapper;
}

function updateMessageBubble(wrapper, content) {
  const bubble = wrapper.querySelector(".message-bubble");
  if (bubble) {
    bubble.innerHTML = renderMarkdown(content);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderMessages() {
  const chat = currentChat();
  messagesEl.innerHTML = "";

  if (!chat || !chat.messages?.length) {
    messagesEl.innerHTML = `
      <div class="empty-state">
        <h3>Choose a repo and start a chat.</h3>
        <p>Streaming replies, provider switching, and model selection all stay in this window.</p>
      </div>`;
    return;
  }

  for (const message of chat.messages) {
    messagesEl.appendChild(createMessage(message.role, message.content));
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderChats() {
  chatList.innerHTML = "";
  for (const chat of workspace.chats) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chat-item${chat.id === workspace.currentChatId ? " active" : ""}`;
    button.innerHTML = `
      <strong>${escapeHtml(chat.title)}</strong>
      <span>${escapeHtml(chat.preview || "No messages yet")}</span>`;
    button.addEventListener("click", async () => {
      workspace = await window.cvmcode.switchChat(chat.id);
      hydrateWorkspace();
    });
    chatList.appendChild(button);
  }
}

function renderRepos() {
  const chat = currentChat();
  repoSelect.innerHTML = "";

  const noneOption = document.createElement("option");
  noneOption.value = "";
  noneOption.textContent = "No repo context";
  noneOption.selected = !chat?.repoPath;
  repoSelect.appendChild(noneOption);

  for (const repo of workspace.repos) {
    const option = document.createElement("option");
    option.value = repo.path;
    option.textContent = repo.isGitRepo ? `${repo.name} (git)` : repo.name;
    option.selected = repo.path === chat?.repoPath;
    repoSelect.appendChild(option);
  }
}

function renderProviders() {
  const active = currentProvider();
  providerSelect.innerHTML = "";
  for (const provider of workspace.providers) {
    const option = document.createElement("option");
    option.value = provider.id;
    option.textContent = provider.id;
    option.selected = provider.id === active?.id;
    providerSelect.appendChild(option);
  }

  providerEndpoint.textContent = active?.endpointMode ?? "-";
  providerModel.textContent = active?.baseURL ?? "-";
}

function renderModelOptions(models, activeModel) {
  modelSelect.innerHTML = "";

  const unique = [...new Set([activeModel, ...(models ?? [])].filter(Boolean))];
  for (const model of unique) {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    option.selected = model === activeModel;
    modelSelect.appendChild(option);
  }

  if (unique.length === 0) {
    const option = document.createElement("option");
    option.value = activeModel ?? "";
    option.textContent = activeModel ?? "No models";
    option.selected = true;
    modelSelect.appendChild(option);
  }
}

async function ensureModelsLoaded(force = false) {
  const provider = currentProvider();
  if (!provider) {
    renderModelOptions([], "");
    return;
  }

  if (!force && modelCache.has(provider.id)) {
    renderModelOptions(modelCache.get(provider.id), provider.model);
    return;
  }

  setStatus("Loading models...");
  const result = await window.cvmcode.listProviderModels(provider.id);
  modelCache.set(provider.id, result.models ?? []);
  renderModelOptions(result.models ?? [], provider.model);
  setStatus("Ready");
}

function hydrateWorkspace() {
  const chat = currentChat();
  chatTitle.textContent = chat?.title ?? "New chat";
  updateUsage(chat?.usage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 });
  renderChats();
  renderRepos();
  renderProviders();
  renderMessages();
  ensureModelsLoaded().catch((error) => {
    setStatus("Model list failed");
    console.error(error);
  });
  setStatus("Ready");
}

async function refreshWorkspace() {
  workspace = await window.cvmcode.getWorkspace();
  hydrateWorkspace();
}

async function sendMessage() {
  const text = chatInput.value.trim();
  const chat = currentChat();
  if (!text || !chat) {
    return;
  }

  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const assistantMessage = createMessage("assistant", "");

  sendBtn.disabled = true;
  if (messagesEl.querySelector(".empty-state")) {
    messagesEl.innerHTML = "";
  }
  messagesEl.appendChild(createMessage("user", text));
  messagesEl.appendChild(assistantMessage);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  chatInput.value = "";
  autoResize();
  setStatus("Working on it...");

  activeRequests.set(requestId, {
    wrapper: assistantMessage,
    text: "",
    resolve: null,
    reject: null
  });

  try {
    await new Promise((resolve, reject) => {
      const request = activeRequests.get(requestId);
      request.resolve = resolve;
      request.reject = reject;
      window.cvmcode.sendChat(requestId, chat.id, text);
    });
  } finally {
    activeRequests.delete(requestId);
    sendBtn.disabled = false;
    chatInput.focus();
  }
}

btnNewChat.addEventListener("click", async () => {
  workspace = await window.cvmcode.createChat();
  hydrateWorkspace();
});

btnAddRepo.addEventListener("click", async () => {
  workspace = await window.cvmcode.pickRepo();
  hydrateWorkspace();
});

btnClear.addEventListener("click", async () => {
  const chat = currentChat();
  if (!chat) return;
  workspace = await window.cvmcode.clearChat(chat.id);
  hydrateWorkspace();
});

repoSelect.addEventListener("change", async () => {
  const chat = currentChat();
  if (!chat) return;
  workspace = await window.cvmcode.setChatRepo(chat.id, repoSelect.value);
  hydrateWorkspace();
});

providerSelect.addEventListener("change", async () => {
  const chat = currentChat();
  if (!chat) return;
  workspace = await window.cvmcode.setChatProvider(chat.id, providerSelect.value);
  await refreshWorkspace();
});

btnRefreshModels.addEventListener("click", async () => {
  await ensureModelsLoaded(true);
});

btnSaveModel.addEventListener("click", async () => {
  const provider = currentProvider();
  if (!provider || !modelSelect.value) return;
  workspace = await window.cvmcode.updateProviderModel(provider.id, modelSelect.value);
  modelCache.delete(provider.id);
  await refreshWorkspace();
});

btnCreateProvider.addEventListener("click", async () => {
  await window.cvmcode.createProvider({
    name: providerNameInput.value,
    baseURL: providerBaseUrlInput.value,
    apiKeyEnv: providerApiKeyEnvInput.value,
    apiKey: providerApiKeyInput.value,
    model: providerDefaultModelInput.value,
    endpointMode: providerEndpointInput.value
  });

  providerNameInput.value = "";
  providerBaseUrlInput.value = "";
  providerApiKeyEnvInput.value = "";
  providerApiKeyInput.value = "";
  providerDefaultModelInput.value = "";
  providerEndpointInput.value = "responses";
  await refreshWorkspace();
});

themeToggle.addEventListener("click", () => {
  applyTheme(document.body.dataset.theme === "dark" ? "light" : "dark");
});

sendBtn.addEventListener("click", sendMessage);
chatInput.addEventListener("input", autoResize);
chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

window.cvmcode.onChatChunk((payload) => {
  const request = activeRequests.get(payload.requestId);
  if (!request) return;
  request.text += payload.delta ?? "";
  updateMessageBubble(request.wrapper, request.text);
});

window.cvmcode.onChatDone((payload) => {
  const request = activeRequests.get(payload.requestId);
  if (!request) return;

  if (!request.text && payload.text) {
    request.text = payload.text;
    updateMessageBubble(request.wrapper, request.text);
  }

  if (payload.workspace) {
    workspace = payload.workspace;
    hydrateWorkspace();
  } else {
    setStatus("Ready");
  }
  request.resolve();
});

window.cvmcode.onChatError((payload) => {
  const request = activeRequests.get(payload.requestId);
  if (!request) return;
  updateMessageBubble(request.wrapper, `Error: ${payload.error}`);
  setStatus("Error");
  request.reject(new Error(payload.error));
});

applyTheme(localStorage.getItem(THEME_KEY) ?? "light");
refreshWorkspace();
