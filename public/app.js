const chatEl = document.getElementById("chat");
const statusEl = document.getElementById("status");
const sendBtn = document.getElementById("sendBtn");
const promptEl = document.getElementById("prompt");
const sessionsEl = document.getElementById("sessions");
const newChatBtn = document.getElementById("newChatBtn");
const chatTitleEl = document.getElementById("chatTitle");
const chatSubEl = document.getElementById("chatSub");
const stopBtn = document.getElementById("stopBtn");
const hangBanner = document.getElementById("hangBanner");
const restartBtn = document.getElementById("restartBtn");
const retryBtn = document.getElementById("retryBtn");

const permissionModal = document.getElementById("permissionModal");
const permissionBody = document.getElementById("permissionBody");
const allowBtn = document.getElementById("allowBtn");
const denyBtn = document.getElementById("denyBtn");

let liveState = {
  session: { history: [] },
  isProcessing: false,
  pendingPermission: null,
};
let viewingSession = null; // { id, session }
let polling = false;
let processingStartAt = 0;
let lastMessage = "";
const HANG_THRESHOLD_MS = 45000;

function setStatus(text, isBusy) {
  statusEl.textContent = text;
  statusEl.style.borderColor = isBusy ? "rgba(14, 99, 156, 0.6)" : "";
}

function setHangBanner(show) {
  if (!hangBanner) return;
  if (show) {
    hangBanner.classList.add("show");
    hangBanner.setAttribute("aria-hidden", "false");
  } else {
    hangBanner.classList.remove("show");
    hangBanner.setAttribute("aria-hidden", "true");
  }
}

function updateProcessingUI(isProcessing) {
  if (stopBtn) {
    stopBtn.style.display = isProcessing ? "inline-flex" : "none";
  }
  if (!isProcessing) {
    setHangBanner(false);
  }
}

function normalizeContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part) return "";
        if (part.type === "text" && typeof part.text === "string") return part.text;
        if (typeof part.text === "string") return part.text;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function roleLabel(role) {
  if (role === "assistant" || role === "thinking") return "dbSAIcle";
  if (role === "user") return "You";
  if (role === "system") return "System";
  return role || "dbSAIcle";
}

function renderToolCalls(toolCallStates, container) {
  if (!Array.isArray(toolCallStates) || toolCallStates.length === 0) return;
  const wrapper = document.createElement("div");
  wrapper.className = "tool-calls";

  toolCallStates.forEach((tc) => {
    const card = document.createElement("div");
    card.className = "tool-call";

    const title = document.createElement("div");
    title.className = "tool-call-title";

    const name = document.createElement("span");
    name.textContent = tc.toolCall?.function?.name || "tool";

    const status = document.createElement("span");
    status.className = `tool-call-status ${tc.status || ""}`;
    status.textContent = tc.status || "";

    title.appendChild(name);
    title.appendChild(status);

    const args = document.createElement("div");
    const argText = tc.toolCall?.function?.arguments || "{}";
    args.textContent = `Args: ${argText}`;

    card.appendChild(title);
    card.appendChild(args);

    if (Array.isArray(tc.output) && tc.output.length > 0) {
      const output = document.createElement("div");
      output.textContent = `Output: ${tc.output.map((o) => o.content || "").join("\n")}`;
      card.appendChild(output);
    }

    wrapper.appendChild(card);
  });

  container.appendChild(wrapper);
}

function renderMessages(history, showThinking) {
  chatEl.innerHTML = "";

  if (!history || history.length === 0) {
    const empty = document.createElement("div");
    empty.className = "message assistant";
    empty.innerHTML =
      '<div class="message-role">dbSAIcle</div><div class="message-content">Start a conversation to see responses here.</div>';
    chatEl.appendChild(empty);
    if (showThinking) {
      appendThinkingMessage();
    }
    return;
  }

  history.forEach((item) => {
    const role = item.message?.role || "assistant";
    const msg = document.createElement("div");
    msg.className = `message ${role}`;

    const roleEl = document.createElement("div");
    roleEl.className = "message-role";
    roleEl.textContent = roleLabel(role);

    const content = document.createElement("div");
    content.className = "message-content";
    content.textContent = normalizeContent(item.message?.content);

    msg.appendChild(roleEl);
    msg.appendChild(content);

    if (role === "assistant" && item.toolCallStates) {
      renderToolCalls(item.toolCallStates, msg);
    }

    chatEl.appendChild(msg);
  });

  if (showThinking) {
    appendThinkingMessage();
  }

  chatEl.scrollTop = chatEl.scrollHeight;
}

function appendThinkingMessage() {
  const msg = document.createElement("div");
  msg.className = "message assistant thinking";

  const roleEl = document.createElement("div");
  roleEl.className = "message-role";
  roleEl.textContent = "dbSAIcle";

  const content = document.createElement("div");
  content.className = "message-content";
  content.textContent = "Thinking...";

  msg.appendChild(roleEl);
  msg.appendChild(content);

  chatEl.appendChild(msg);
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json();
}

async function updateState() {
  try {
    const state = await fetchJson("/api/state");
    const wasProcessing = liveState.isProcessing;
    liveState = state;

    if (state.isProcessing && !wasProcessing) {
      processingStartAt = Date.now();
    }
    if (!state.isProcessing) {
      processingStartAt = 0;
    }

    if (!viewingSession) {
      renderMessages(state.session?.history || [], state.isProcessing);
      setStatus(state.isProcessing ? "Processing" : "Idle", state.isProcessing);
      handlePermission(state.pendingPermission);
      updateProcessingUI(state.isProcessing);

      if (state.isProcessing && processingStartAt) {
        const elapsed = Date.now() - processingStartAt;
        if (elapsed > HANG_THRESHOLD_MS) {
          setHangBanner(true);
          setStatus("No response yet", true);
        }
      }
    }
  } catch (_err) {
    setStatus("Disconnected", false);
  }
}

async function startPolling() {
  if (polling) return;
  polling = true;
  const loop = async () => {
    if (viewingSession) {
      polling = false;
      return;
    }
    await updateState();
    const delay = liveState.isProcessing ? 800 : 2000;
    setTimeout(loop, delay);
  };
  loop();
}

function handlePermission(pending) {
  if (!pending) {
    permissionModal.classList.remove("show");
    permissionModal.setAttribute("aria-hidden", "true");
    return;
  }

  permissionBody.textContent = `Tool: ${pending.toolName}\nArgs: ${JSON.stringify(
    pending.toolArgs,
    null,
    2,
  )}`;

  permissionModal.classList.add("show");
  permissionModal.setAttribute("aria-hidden", "false");

  allowBtn.onclick = async () => {
    await fetchJson("/api/permission", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId: pending.requestId, approved: true }),
    });
    permissionModal.classList.remove("show");
  };

  denyBtn.onclick = async () => {
    await fetchJson("/api/permission", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId: pending.requestId, approved: false }),
    });
    permissionModal.classList.remove("show");
  };
}

async function sendMessage(messageOverride) {
  if (viewingSession) return;
  const message = (messageOverride ?? promptEl.value).trim();
  if (!message) return;

  promptEl.value = "";
  lastMessage = message;
  await fetchJson("/api/message", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
  });

  setStatus("Processing", true);
  updateProcessingUI(true);
  startPolling();
}

async function loadSessions() {
  try {
    const data = await fetchJson("/api/sessions");
    sessionsEl.innerHTML = "";

    if (!data.sessions || data.sessions.length === 0) {
      const empty = document.createElement("div");
      empty.className = "session-meta";
      empty.textContent = "No saved sessions yet.";
      sessionsEl.appendChild(empty);
      return;
    }

    data.sessions.forEach((session) => {
      const item = document.createElement("div");
      item.className = "session-item";

      const title = document.createElement("div");
      title.className = "session-title";
      title.textContent = session.title || "Chat";

      const meta = document.createElement("div");
      meta.className = "session-meta";
      meta.textContent = `${new Date(session.dateCreated).toLocaleString()} · ${
        session.firstUserMessage ? session.firstUserMessage.slice(0, 42) : ""
      }`;

      item.appendChild(title);
      item.appendChild(meta);
      item.onclick = () => viewSession(session.sessionId, session.title);

      sessionsEl.appendChild(item);
    });
  } catch (_err) {
    sessionsEl.innerHTML = "";
  }
}

async function viewSession(sessionId, title) {
  try {
    const session = await fetchJson(`/api/session/${sessionId}`);
    viewingSession = { id: sessionId, session };
    chatTitleEl.textContent = title || "Chat";
    chatSubEl.textContent = "Read-only session";
    renderMessages(session.history || [], false);
    setStatus("Viewing history", false);
    sendBtn.disabled = true;
    promptEl.disabled = true;
    updateProcessingUI(false);
  } catch (_err) {
    viewingSession = null;
  }
}

function setLiveSessionView() {
  viewingSession = null;
  chatTitleEl.textContent = "Chat";
  chatSubEl.textContent = "Live session";
  sendBtn.disabled = false;
  promptEl.disabled = false;
  updateProcessingUI(liveState.isProcessing);
  startPolling();
}

async function restartSession() {
  setStatus("Restarting", true);
  await fetchJson("/api/new-session", { method: "POST" });
  setLiveSessionView();
  await updateState();
  loadSessions();
}

newChatBtn.addEventListener("click", async () => {
  await fetchJson("/api/new-session", { method: "POST" });
  setLiveSessionView();
  loadSessions();
});

sendBtn.addEventListener("click", sendMessage);

if (stopBtn) {
  stopBtn.addEventListener("click", restartSession);
}

if (restartBtn) {
  restartBtn.addEventListener("click", restartSession);
}

if (retryBtn) {
  retryBtn.addEventListener("click", async () => {
    if (!lastMessage) return;
    await restartSession();
    await sendMessage(lastMessage);
  });
}

promptEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

chatSubEl.addEventListener("click", () => {
  if (viewingSession) {
    setLiveSessionView();
  }
});

(async function init() {
  await loadSessions();
  await updateState();
  startPolling();
})();
