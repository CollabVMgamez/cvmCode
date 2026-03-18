// DOM refs
const messagesEl = document.getElementById("messages");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");
const chatStatus = document.getElementById("chat-status");
const providerName = document.getElementById("provider-name");
const providerModel = document.getElementById("provider-model");
const providerEndpoint = document.getElementById("provider-endpoint");
const usageTotal = document.getElementById("usage-total");
const usageBreakdown = document.getElementById("usage-breakdown");
const btnClear = document.getElementById("btn-clear");
const appVersion = document.getElementById("app-version");

// Session token accumulator
let sessionUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

// ── Helpers ─────────────────────────────────────────────────────────────

function setStatus(text, type = "") {
  chatStatus.textContent = text;
  chatStatus.className = "chat-status" + (type ? ` ${type}` : "");
}

function updateUsageDisplay(usage) {
  if (!usage) return;
  sessionUsage.inputTokens += usage.inputTokens ?? 0;
  sessionUsage.outputTokens += usage.outputTokens ?? 0;
  sessionUsage.totalTokens += usage.totalTokens ?? (sessionUsage.inputTokens + sessionUsage.outputTokens);

  usageTotal.textContent = `${sessionUsage.totalTokens.toLocaleString()} tokens`;
  usageBreakdown.textContent = `in ${sessionUsage.inputTokens.toLocaleString()} · out ${sessionUsage.outputTokens.toLocaleString()}`;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMarkdown(text) {
  // Code blocks
  let result = text.replace(/```([a-z]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="lang-${lang}">${escapeHtml(code.trim())}</code></pre>`;
  });
  // Inline code
  result = result.replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`);
  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Escape remaining HTML outside code blocks
  // Already done above per chunk, just preserve
  return result;
}

function appendMessage(role, content, tokens) {
  // Remove welcome message if present
  const welcome = messagesEl.querySelector(".welcome-msg");
  if (welcome) welcome.remove();

  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;

  const roleLabel = document.createElement("div");
  roleLabel.className = "message-role";
  roleLabel.textContent = role === "user" ? "you" : "cvmCode";

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.innerHTML = renderMarkdown(content);

  wrapper.appendChild(roleLabel);
  wrapper.appendChild(bubble);

  if (tokens && (tokens.totalTokens || tokens.inputTokens || tokens.outputTokens)) {
    const tokenLine = document.createElement("div");
    tokenLine.className = "message-tokens";
    const parts = [
      tokens.inputTokens ? `in ${tokens.inputTokens}` : null,
      tokens.outputTokens ? `out ${tokens.outputTokens}` : null,
      tokens.totalTokens ? `total ${tokens.totalTokens}` : null
    ].filter(Boolean);
    tokenLine.textContent = parts.join(" · ");
    wrapper.appendChild(tokenLine);
  }

  messagesEl.appendChild(wrapper);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return wrapper;
}

function autoResize() {
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 200) + "px";
}

// ── Boot ─────────────────────────────────────────────────────────────────

async function boot() {
  try {
    const meta = await window.cvmcode.getMeta();
    appVersion.textContent = `v${meta.version ?? "1.0.2"}`;

    if (meta.error) {
      providerName.textContent = "Config error";
      providerModel.textContent = meta.error;
      setStatus("Config error", "error");
      return;
    }

    providerName.textContent = meta.provider ?? "—";
    providerModel.textContent = meta.model ?? "";
    providerEndpoint.textContent = meta.endpointMode ?? "—";
    setStatus("Ready");
  } catch (err) {
    providerName.textContent = "Error";
    providerModel.textContent = String(err);
    setStatus("IPC error", "error");
  }
}

// ── Send message ─────────────────────────────────────────────────────────

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  sendBtn.disabled = true;
  chatInput.value = "";
  autoResize();
  setStatus("Thinking…", "thinking");

  appendMessage("user", text);

  try {
    const result = await window.cvmcode.sendChat(text);

    if (result.error) {
      appendMessage("assistant", `⚠ Error: ${result.error}`);
      setStatus("Error", "error");
    } else {
      appendMessage("assistant", result.text ?? "", result.usage);
      updateUsageDisplay(result.usage);
      setStatus("Ready");
    }
  } catch (err) {
    appendMessage("assistant", `⚠ IPC error: ${String(err)}`);
    setStatus("Error", "error");
  } finally {
    sendBtn.disabled = false;
    chatInput.focus();
  }
}

// ── Event listeners ───────────────────────────────────────────────────────

sendBtn.addEventListener("click", sendMessage);

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

chatInput.addEventListener("input", autoResize);

btnClear.addEventListener("click", () => {
  messagesEl.innerHTML = `
    <div class="welcome-msg">
      <div class="welcome-icon">✦</div>
      <p>Ask cvmCode anything about your code.</p>
    </div>`;
  sessionUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  usageTotal.textContent = "0 tokens";
  usageBreakdown.textContent = "in 0 · out 0";
  setStatus("Ready");
});

boot();
