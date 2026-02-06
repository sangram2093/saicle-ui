const chatEl = document.getElementById("chat");
const appEl = document.getElementById("app");
const workspaceEl = document.querySelector(".workspace");
const statusEl = document.getElementById("status");
const sendBtn = document.getElementById("sendBtn");
const promptEl = document.getElementById("prompt");
const sessionsEl = document.getElementById("sessions");
const newChatBtn = document.getElementById("newChatBtn");
const chatTitleEl = document.getElementById("chatTitle");
const chatSubEl = document.getElementById("chatSub");
const stopTopBtn = document.getElementById("stopTopBtn");
const stopBtn = document.getElementById("stopBtn");
const hangBanner = document.getElementById("hangBanner");
const hangText = document.getElementById("hangText");
const restartBtn = document.getElementById("restartBtn");
const retryBtn = document.getElementById("retryBtn");
const credentialsBtn = document.getElementById("credentialsBtn");
const sidebarResizer = document.getElementById("sidebarResizer");
const historyToggleBtn = document.getElementById("historyToggleBtn");
const historyPanel = document.querySelector(".sidebar .panel");

const permissionBar = document.getElementById("permissionBar");
const permissionLabel = document.getElementById("permissionLabel");
const permissionAllowBtn = document.getElementById("permissionAllowBtn");
const permissionDenyBtn = document.getElementById("permissionDenyBtn");

const credentialsModal = document.getElementById("credentialsModal");
const secretMode = document.getElementById("secretMode");
const secretKeyField = document.getElementById("secretKeyField");
const secretKeyInput = document.getElementById("secretKey");
const secretService = document.getElementById("secretService");
const secretProfile = document.getElementById("secretProfile");
const secretField = document.getElementById("secretField");
const secretValue = document.getElementById("secretValue");
const secretSaveBtn = document.getElementById("secretSaveBtn");
const secretCancelBtn = document.getElementById("secretCancelBtn");
const secretList = document.getElementById("secretList");
const terminalBtn = document.getElementById("terminalBtn");
const terminalPanel = document.getElementById("terminalPanel");
const terminalShell = document.getElementById("terminalShell");
const terminalContainer = document.getElementById("terminalContainer");
const terminalReconnectBtn = document.getElementById("terminalReconnectBtn");
const terminalClearBtn = document.getElementById("terminalClearBtn");
const terminalCloseBtn = document.getElementById("terminalCloseBtn");
const terminalPopoutBtn = document.getElementById("terminalPopoutBtn");
const terminalMeta = document.getElementById("terminalMeta");
const terminalResizer = document.getElementById("terminalResizer");
const modeIndicator = document.getElementById("modeIndicator");
const modeButtons = document.querySelectorAll(".mode-btn");
const toolsBtn = document.getElementById("toolsBtn");
const mcpBtn = document.getElementById("mcpBtn");
const toolsModal = document.getElementById("toolsModal");
const mcpModal = document.getElementById("mcpModal");
const toolsList = document.getElementById("toolsList");
const mcpList = document.getElementById("mcpList");
const toolsSummary = document.getElementById("toolsSummary");
const mcpSummary = document.getElementById("mcpSummary");
const toolsCloseBtn = document.getElementById("toolsCloseBtn");
const mcpCloseBtn = document.getElementById("mcpCloseBtn");
const contextIndicator = document.getElementById("contextIndicator");
const contextLabel = document.getElementById("contextLabel");

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
const SCROLL_BOTTOM_THRESHOLD = 32;
const SIDEBAR_WIDTH_KEY = "saicle.sidebarWidth";
const TERMINAL_WIDTH_KEY = "saicle.terminalWidth";
const SIDEBAR_MIN_WIDTH = 220;
const TERMINAL_MIN_WIDTH = 260;
const CHAT_MIN_WIDTH = 320;
const RESIZER_WIDTH = 6;
const HISTORY_COLLAPSED_KEY = "saicle.historyCollapsed";
let autoScrollEnabled = true;
let lastRenderKey = "";
let activeSpeechKey = null;
let terminalInstance = null;
let terminalSocket = null;
let terminalFitAddon = null;
let terminalPanelVisible = false;
let terminalConnected = false;
let currentMode = "normal";
let historyCollapsed = false;

const TERMINAL_TOOL_NAMES = new Set([
  "run_terminal_command",
  "runterminalcommand",
  "terminal",
  "bash",
]);

const ACTION_ICONS = {
  compact: `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 3H3v6" />
    <path d="M21 9V3h-6" />
    <path d="M3 15v6h6" />
    <path d="M15 21h6v-6" />
  </svg>`,
  rule: `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
    <path d="M14 3v6h6" />
    <path d="M9 13h6" />
    <path d="M9 17h6" />
  </svg>`,
  delete: `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M6 6l1 14h10l1-14" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
  </svg>`,
  read: `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 10v4h4l5 4V6l-5 4H4z" />
    <path d="M16 9a3 3 0 0 1 0 6" />
    <path d="M18.5 7a5.5 5.5 0 0 1 0 10" />
  </svg>`,
  stop: `<svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>`,
  copy: `<svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="9" y="9" width="10" height="10" rx="2" />
    <path d="M5 15V5h10" />
  </svg>`,
  helpful: `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.3a2 2 0 0 0 2-1.7l1.4-9a2 2 0 0 0-2-2.3z" />
    <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
  </svg>`,
  unhelpful: `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H6.7a2 2 0 0 0-2 1.7L3.3 13a2 2 0 0 0 2 2.3z" />
    <path d="M17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" />
  </svg>`,
};

const terminalToolLog = {
  seen: new Set(),
  outputCache: new Map(),
};

const SERVICE_FIELDS = {
  servicenow: [
    "auth.type",
    "auth.basic.username",
    "auth.basic.password",
    "auth.apiKey.apiKey",
    "auth.apiKey.headerName",
    "auth.oauth.clientId",
    "auth.oauth.clientSecret",
    "auth.oauth.username",
    "auth.oauth.password",
    "auth.oauth.tokenUrl",
  ],
  jira: ["apiToken"],
  confluence: ["apiToken"],
  bitbucket: ["apiToken"],
  veracode: ["apiKeySecret"],
  ossVulnerability: ["jfrogAccessToken", "jfrogPlatformUrl"],
};

function isNearBottom(container) {
  if (!container) return true;
  const distance =
    container.scrollHeight - (container.scrollTop + container.clientHeight);
  return distance <= SCROLL_BOTTOM_THRESHOLD;
}

function updateAutoScrollState() {
  autoScrollEnabled = isNearBottom(chatEl);
}

function hasActiveSelection() {
  const selection = window.getSelection?.();
  if (!selection || selection.isCollapsed) return false;
  const anchor = selection.anchorNode;
  return anchor && chatEl && chatEl.contains(anchor);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function readStoredNumber(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? value : null;
  } catch (_err) {
    return null;
  }
}

function writeStoredNumber(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch (_err) {
    // ignore storage errors
  }
}

function readStoredBool(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === undefined) return null;
    if (raw === "true") return true;
    if (raw === "false") return false;
    return null;
  } catch (_err) {
    return null;
  }
}

function writeStoredBool(key, value) {
  try {
    localStorage.setItem(key, value ? "true" : "false");
  } catch (_err) {
    // ignore storage errors
  }
}

function getCssVarPx(name, fallback) {
  if (!appEl) return fallback;
  const raw = getComputedStyle(appEl).getPropertyValue(name);
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

function getSidebarLimits() {
  const width = appEl ? appEl.getBoundingClientRect().width : window.innerWidth;
  const min = SIDEBAR_MIN_WIDTH;
  const max = Math.max(min, Math.floor(width * 0.55));
  return { min, max };
}

function getTerminalLimits() {
  const width = workspaceEl
    ? workspaceEl.getBoundingClientRect().width
    : appEl
      ? appEl.getBoundingClientRect().width
      : window.innerWidth;
  const maxByChat = width - CHAT_MIN_WIDTH - RESIZER_WIDTH;
  const min = Math.max(180, Math.min(TERMINAL_MIN_WIDTH, maxByChat));
  const max = Math.max(min, Math.min(Math.floor(width * 0.65), maxByChat));
  return { min, max };
}

function applySidebarWidth(width, persist) {
  if (!appEl || width === null || width === undefined) return;
  const limits = getSidebarLimits();
  const next = clamp(width, limits.min, limits.max);
  appEl.style.setProperty("--sidebar-width", `${next}px`);
  if (persist) {
    writeStoredNumber(SIDEBAR_WIDTH_KEY, next);
  }
}

function applyTerminalWidth(width, persist) {
  if (!appEl || width === null || width === undefined) return;
  const limits = getTerminalLimits();
  const next = clamp(width, limits.min, limits.max);
  appEl.style.setProperty("--terminal-width", `${next}px`);
  if (persist) {
    writeStoredNumber(TERMINAL_WIDTH_KEY, next);
  }
}

function loadPanelSizes() {
  const sidebarStored = readStoredNumber(SIDEBAR_WIDTH_KEY);
  if (sidebarStored !== null) {
    applySidebarWidth(sidebarStored, false);
  }
  const terminalStored = readStoredNumber(TERMINAL_WIDTH_KEY);
  if (terminalStored !== null) {
    applyTerminalWidth(terminalStored, false);
  }
}

function refreshPanelSizes() {
  const sidebarWidth = getCssVarPx("--sidebar-width", 280);
  applySidebarWidth(sidebarWidth, false);
  const terminalWidth = getCssVarPx("--terminal-width", 360);
  applyTerminalWidth(terminalWidth, false);
}

function setHistoryCollapsed(collapsed, persist) {
  historyCollapsed = collapsed;
  if (historyPanel) {
    historyPanel.classList.toggle("collapsed", collapsed);
  }
  if (historyToggleBtn) {
    historyToggleBtn.setAttribute(
      "aria-label",
      collapsed ? "Expand history" : "Collapse history",
    );
    historyToggleBtn.title = collapsed ? "Expand history" : "Collapse history";
  }
  if (persist) {
    writeStoredBool(HISTORY_COLLAPSED_KEY, collapsed);
  }
}

function loadHistoryState() {
  const stored = readStoredBool(HISTORY_COLLAPSED_KEY);
  if (stored !== null) {
    setHistoryCollapsed(stored, false);
  }
}

function initResizer(handle, onResize, onCommit) {
  if (!handle) return;
  let dragging = false;
  let latestValue = null;

  const stopDragging = (event) => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove("dragging");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    if (handle.releasePointerCapture && event?.pointerId !== undefined) {
      try {
        handle.releasePointerCapture(event.pointerId);
      } catch (_err) {
        // ignore capture errors
      }
    }
    if (typeof onCommit === "function" && latestValue !== null) {
      onCommit(latestValue);
    }
    latestValue = null;
  };

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    dragging = true;
    handle.classList.add("dragging");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    if (handle.setPointerCapture) {
      handle.setPointerCapture(event.pointerId);
    }
    const value = onResize(event);
    if (typeof value === "number") {
      latestValue = value;
    }
  });

  window.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const value = onResize(event);
    if (typeof value === "number") {
      latestValue = value;
    }
  });

  window.addEventListener("pointerup", stopDragging);
  window.addEventListener("pointercancel", stopDragging);
}

function setupResizers() {
  initResizer(
    sidebarResizer,
    (event) => {
      if (!appEl) return null;
      const rect = appEl.getBoundingClientRect();
      const rawWidth = event.clientX - rect.left;
      const limits = getSidebarLimits();
      const next = clamp(rawWidth, limits.min, limits.max);
      appEl.style.setProperty("--sidebar-width", `${next}px`);
      return next;
    },
    (value) => {
      applySidebarWidth(value, true);
    },
  );

  initResizer(
    terminalResizer,
    (event) => {
      if (!terminalPanelVisible) return null;
      if (window.matchMedia("(max-width: 980px)").matches) return null;
      if (!workspaceEl || !appEl) return null;
      const rect = workspaceEl.getBoundingClientRect();
      const rawWidth = rect.right - event.clientX;
      const limits = getTerminalLimits();
      const next = clamp(rawWidth, limits.min, limits.max);
      appEl.style.setProperty("--terminal-width", `${next}px`);
      if (terminalFitAddon) {
        terminalFitAddon.fit();
      }
      return next;
    },
    (value) => {
      applyTerminalWidth(value, true);
      if (terminalFitAddon && terminalPanelVisible) {
        terminalFitAddon.fit();
      }
    },
  );
}

function setStatus(text, isBusy) {
  statusEl.textContent = text;
  statusEl.style.borderColor = isBusy ? "rgba(14, 99, 156, 0.6)" : "";
}

function setHangBanner(show, text) {
  if (!hangBanner) return;
  if (show) {
    if (hangText && text) {
      hangText.textContent = text;
    }
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

function updatePermissionBar(pending) {
  if (!permissionBar || !permissionLabel) return;

  if (!pending) {
    permissionBar.classList.remove("show");
    permissionBar.setAttribute("aria-hidden", "true");
    permissionLabel.textContent = "";
    return;
  }

  const toolName = pending.toolName || "tool";
  const summary =
    pending.toolArgs && typeof pending.toolArgs.command === "string"
      ? pending.toolArgs.command
      : "";
  const label = summary
    ? `Allow ${toolName}: ${summary}`
    : `Allow ${toolName}`;

  permissionLabel.textContent = label;
  permissionLabel.title = JSON.stringify(pending.toolArgs || {}, null, 2);
  permissionBar.classList.add("show");
  permissionBar.setAttribute("aria-hidden", "false");

  if (isTerminalToolCall({ toolCall: { function: { name: toolName } } })) {
    openTerminalPanel({ focus: false });
  }

  if (permissionAllowBtn) {
    permissionAllowBtn.onclick = async () => {
      await fetchJson("/api/permission", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId: pending.requestId, approved: true }),
      });
      permissionBar.classList.remove("show");
    };
  }

  if (permissionDenyBtn) {
    permissionDenyBtn.onclick = async () => {
      await fetchJson("/api/permission", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId: pending.requestId, approved: false }),
      });
      permissionBar.classList.remove("show");
    };
  }
}

function modeLabel(mode) {
  if (mode === "plan") return "Plan";
  if (mode === "auto") return "Auto";
  return "Chat";
}

function setModeUI(mode) {
  if (!mode) return;
  currentMode = mode;
  if (modeIndicator) {
    modeIndicator.textContent = modeLabel(mode);
  }
  if (!modeButtons || modeButtons.length === 0) return;
  modeButtons.forEach((btn) => {
    const isActive = btn.dataset.mode === mode;
    if (isActive) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
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

function getMessageText(item) {
  return normalizeContent(item?.message?.content);
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return (hash >>> 0).toString(36);
}

function getMessageSignature(item, index) {
  const role = item?.message?.role || "assistant";
  const text = getMessageText(item) || "";
  return `${role}-${index}-${hashString(text).slice(0, 8)}`;
}

function getFeedbackKey(sessionId, signature) {
  return `feedback:${sessionId || "session"}:${signature}`;
}

function getFeedbackState(sessionId, signature) {
  try {
    const value = localStorage.getItem(getFeedbackKey(sessionId, signature));
    if (value === "true") return true;
    if (value === "false") return false;
  } catch (_err) {
    return undefined;
  }
  return undefined;
}

function setFeedbackState(sessionId, signature, value) {
  try {
    localStorage.setItem(getFeedbackKey(sessionId, signature), String(value));
  } catch (_err) {
    // ignore storage errors
  }
}

async function copyToClipboard(text) {
  if (!text) return;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch (_err) {
    // fallback below
  }
  const temp = document.createElement("textarea");
  temp.value = text;
  temp.style.position = "fixed";
  temp.style.opacity = "0";
  document.body.appendChild(temp);
  temp.select();
  document.execCommand("copy");
  temp.remove();
}

function stringifyValue(value) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch (_err) {
    return String(value);
  }
}

function normalizeToolOutput(output) {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    return output
      .map((item) => {
        if (!item) return "";
        if (typeof item === "string") return item;
        if (typeof item.content === "string") return item.content;
        if (typeof item.text === "string") return item.text;
        return stringifyValue(item);
      })
      .filter(Boolean)
      .join("\n");
  }
  if (output && typeof output.content === "string") return output.content;
  return stringifyValue(output);
}

function normalizeToolArgs(rawArgs) {
  if (rawArgs === undefined || rawArgs === null) return "";
  if (typeof rawArgs === "object") {
    return JSON.stringify(rawArgs, null, 2);
  }
  if (typeof rawArgs !== "string") {
    return stringifyValue(rawArgs);
  }
  const trimmed = rawArgs.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed);
    return JSON.stringify(parsed, null, 2);
  } catch (_err) {
    return trimmed;
  }
}

function getToolCallName(toolCallState) {
  return (
    toolCallState?.toolCall?.function?.name ||
    toolCallState?.toolCall?.name ||
    toolCallState?.name ||
    ""
  );
}

function isTerminalToolCall(toolCallState) {
  const rawName = getToolCallName(toolCallState);
  const normalized = String(rawName).toLowerCase();
  const compact = normalized.replace(/[^a-z0-9]/g, "");
  return (
    TERMINAL_TOOL_NAMES.has(normalized) ||
    TERMINAL_TOOL_NAMES.has(compact) ||
    compact.includes("terminalcommand") ||
    normalized.includes("terminal")
  );
}

function extractTerminalCommand(toolCallState) {
  const rawArgs = toolCallState?.toolCall?.function?.arguments;
  if (rawArgs && typeof rawArgs === "object" && typeof rawArgs.command === "string") {
    return rawArgs.command;
  }
  if (typeof rawArgs === "string") {
    try {
      const parsed = JSON.parse(rawArgs);
      if (parsed && typeof parsed.command === "string") {
        return parsed.command;
      }
    } catch (_err) {
      return rawArgs.trim();
    }
  }
  return "";
}

function getToolCallKey(toolCallState, index) {
  return (
    toolCallState?.toolCall?.id ||
    toolCallState?.toolCallId ||
    toolCallState?.id ||
    `${getToolCallName(toolCallState)}:${index}:${String(
      toolCallState?.toolCall?.function?.arguments || "",
    )}`
  );
}

function writeTerminalOutput(text) {
  if (!terminalInstance || !text) return;
  const normalized = text.replace(/\r?\n/g, "\r\n");
  terminalInstance.write(normalized);
}

function mirrorTerminalToolCall(toolCallState, index) {
  if (!isTerminalToolCall(toolCallState)) return;
  const key = getToolCallKey(toolCallState, index);
  if (!key) return;

  const command = extractTerminalCommand(toolCallState);
  const output = normalizeToolOutput(toolCallState?.output);
  const previousOutput = terminalToolLog.outputCache.get(key) || "";
  const needsOutputUpdate = output && output !== previousOutput;
  const isNewCall = !terminalToolLog.seen.has(key);
  const shouldMirrorOutput = !terminalConnected;

  if (!isNewCall && !needsOutputUpdate) {
    return;
  }

  if (!terminalPanelVisible) {
    openTerminalPanel({ focus: false });
  } else {
    ensureTerminalInstance();
  }

  if (isNewCall && shouldMirrorOutput) {
    const toolName = getToolCallName(toolCallState) || "terminal";
    writeTerminalOutput(`\r\n[dbSAIcle tool: ${toolName}]`);
    if (command) {
      writeTerminalOutput(`\r\n$ ${command}\r\n`);
    } else {
      writeTerminalOutput("\r\n");
    }
    terminalToolLog.seen.add(key);
  } else if (isNewCall) {
    terminalToolLog.seen.add(key);
  }

  if (needsOutputUpdate && shouldMirrorOutput) {
    const delta = output.startsWith(previousOutput)
      ? output.slice(previousOutput.length)
      : `\r\n${output}`;
    writeTerminalOutput(delta);
    terminalToolLog.outputCache.set(key, output);
  } else if (needsOutputUpdate) {
    terminalToolLog.outputCache.set(key, output);
  }
}

function mirrorTerminalToolCalls(history) {
  if (!Array.isArray(history)) return;
  history.forEach((item) => {
    const toolCalls = item?.toolCallStates;
    if (!Array.isArray(toolCalls)) return;
    toolCalls.forEach((toolCallState, index) => {
      mirrorTerminalToolCall(toolCallState, index);
    });
  });
}

function resetTerminalToolLog() {
  terminalToolLog.seen.clear();
  terminalToolLog.outputCache.clear();
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderInline(text) {
  return text.replace(/`([^`]+)`/g, "<code>$1</code>");
}

function renderBlock(block) {
  const lines = block.split("\n");
  let html = "";
  let inList = false;
  lines.forEach((line) => {
    const trimmed = line.trim();
    const match = trimmed.match(/^[-*]\s+(.*)/);
    if (match) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${renderInline(match[1])}</li>`;
      return;
    }
    if (inList) {
      html += "</ul>";
      inList = false;
    }
    if (trimmed.length === 0) return;
    html += `<p>${renderInline(trimmed)}</p>`;
  });
  if (inList) {
    html += "</ul>";
  }
  return html;
}

function looksLikeSvg(code) {
  return /<\s*svg[\s>]/i.test(code);
}

function looksLikeHtml(code) {
  return /<\s*(html|head|body|script|style|div|span|section|article|canvas|table)\b/i.test(
    code,
  );
}

function looksLikeD3(code) {
  return /\bd3\s*\./i.test(code) || /\bd3\s*\(/i.test(code);
}

function detectPreviewLanguage(code, language) {
  const lang = (language || "")
    .toLowerCase()
    .split(/[\s.]/)
    .filter(Boolean)[0] || "";
  if (["html", "svg", "d3", "d3js"].includes(lang)) {
    return lang === "d3js" ? "d3" : lang;
  }
  if (["js", "javascript", "ts", "typescript"].includes(lang)) {
    if (looksLikeD3(code)) return "d3";
  }
  if (looksLikeSvg(code)) return "svg";
  if (looksLikeHtml(code)) return "html";
  if (looksLikeD3(code)) return "d3";
  return null;
}

function getAssetUrl(assetPath) {
  if (!assetPath) return "";
  if (/^https?:\/\//i.test(assetPath)) return assetPath;
  const normalized = assetPath.startsWith("/") ? assetPath : `/${assetPath}`;
  if (typeof window === "undefined") return normalized;
  const origin = window.location && window.location.origin ? window.location.origin : "";
  return origin ? `${origin}${normalized}` : normalized;
}

function findAutoPreview(text) {
  if (!text) return null;
  if (/```/.test(text)) return null;
  const htmlMatch = text.match(/<!doctype html[\s\S]*<\/html>/i);
  if (htmlMatch) {
    return { code: htmlMatch[0], language: "html" };
  }
  const htmlBlock = text.match(/<html[\s\S]*<\/html>/i);
  if (htmlBlock) {
    return { code: htmlBlock[0], language: "html" };
  }
  const svgBlock = text.match(/<svg[\s\S]*<\/svg>/i);
  if (svgBlock) {
    return { code: svgBlock[0], language: "svg" };
  }
  if (looksLikeD3(text)) {
    return { code: text, language: "d3" };
  }
  if (looksLikeHtml(text)) {
    return { code: text, language: "html" };
  }
  return null;
}

function buildPreviewHtml(code, language) {
  const baseStyle =
    "body{margin:0;padding:12px;background:#ffffff;color:#111111;font-family:Segoe UI,system-ui,sans-serif;}*{box-sizing:border-box;}";
  const trimmed = (code || "").trim();
  const hasHtmlDoc = /<!doctype html>/i.test(trimmed) || /<html[\s>]/i.test(trimmed);
  const usesD3 = looksLikeD3(trimmed);
  const hasD3Script = /d3\.v\d+\.min\.js|d3js\.org|d3\.min\.js/i.test(trimmed);
  const localD3 = getAssetUrl("/vendor/d3.v7.min.js");
  const d3Script = `<script src="${localD3}" onerror="this.onerror=null;this.src='https://d3js.org/d3.v7.min.js';"></script>`;
  if (hasHtmlDoc) {
    return trimmed;
  }

  if (language === "d3" || language === "d3js") {
    const isHtml = looksLikeHtml(trimmed) || looksLikeSvg(trimmed);
    if (isHtml) {
      return `<!doctype html><html><head><meta charset="utf-8"/><style>${baseStyle}</style></head><body>${trimmed}</body></html>`;
    }
    return `<!doctype html><html><head><meta charset="utf-8"/><style>${baseStyle}</style></head><body><div id="chart"></div>${d3Script}<script>${trimmed}</script></body></html>`;
  }

  return `<!doctype html><html><head><meta charset="utf-8"/><style>${baseStyle}</style>${usesD3 && !hasD3Script ? d3Script : ""}</head><body>${trimmed}</body></html>`;
}

function buildPreviewFrame(code, language) {
  const srcdoc = buildPreviewHtml(code, language);
  const encoded = encodeURIComponent(srcdoc);
  return `<iframe class="html-preview" sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer" data-srcdoc="${encoded}" data-loading="true"></iframe>`;
}

function renderRichText(rawText) {
  const text = rawText || "";
  const autoPreview = findAutoPreview(text);
  if (window.marked) {
    const renderer = new window.marked.Renderer();
    renderer.code = (code, language) => {
      const lang =
        (language || "")
          .toLowerCase()
          .split(/[\s.]/)
          .filter(Boolean)[0] || "";
      const escaped = escapeHtml(code);
      let preview = "";
      const previewLang = detectPreviewLanguage(code, lang);
      if (previewLang) {
        preview = buildPreviewFrame(code, previewLang);
      }
      return `${preview}<pre><code class="language-${lang}">${escaped}</code></pre>`;
    };

    const markdownHtml = window.marked.parse(text, {
      renderer,
      gfm: true,
      breaks: true,
    });

    const previewHtml = autoPreview
      ? buildPreviewFrame(autoPreview.code, autoPreview.language)
      : "";

    const html = `${previewHtml}${markdownHtml}`;

    if (window.DOMPurify) {
      return window.DOMPurify.sanitize(html, {
        ADD_TAGS: ["iframe", "svg", "path", "g", "circle", "rect", "line", "polyline", "polygon"],
        ADD_ATTR: [
          "class",
          "style",
          "d",
          "fill",
          "stroke",
          "viewBox",
          "width",
          "height",
          "x",
          "y",
          "cx",
          "cy",
          "r",
          "points",
          "transform",
          "data-srcdoc",
          "data-loading",
          "sandbox",
          "referrerpolicy",
        ],
        ALLOW_DATA_ATTR: true,
      });
    }
    return html;
  }

  const escaped = escapeHtml(text);
  const parts = escaped.split("```");
  let html = autoPreview
    ? buildPreviewFrame(autoPreview.code, autoPreview.language)
    : "";
  parts.forEach((part, index) => {
    if (index % 2 === 1) {
      const lines = part.split("\n");
      let language = "";
      if (lines.length > 1) {
        const firstLine = lines[0].trim();
        const token = firstLine.split(/\s+/)[0];
        if (token && /^[a-zA-Z0-9+-]+$/.test(token)) {
          language = token;
          lines.shift();
        }
      }
      const code = lines.join("\n");
      const previewLang = detectPreviewLanguage(code, language);
      if (previewLang) {
        html += buildPreviewFrame(code, previewLang);
      }
      html += `<pre><code${language ? ` data-lang="${language}"` : ""}>${code}</code></pre>`;
    } else {
      const blocks = part.split(/\n{2,}/);
      blocks.forEach((block) => {
        html += renderBlock(block);
      });
    }
  });
  return html;
}

function hydratePreviews(container) {
  if (!container) return;
  const frames = container.querySelectorAll("iframe[data-srcdoc]");
  frames.forEach((frame) => {
    if (frame.dataset.loaded === "true") return;
    const encoded = frame.dataset.srcdoc || "";
    frame.srcdoc = decodeURIComponent(encoded);
    frame.dataset.loaded = "true";
    frame.onload = () => {
      frame.removeAttribute("data-loading");
    };
  });
}

function refreshSecretFieldOptions() {
  if (!secretField || !secretService) return;
  const service = secretService.value;
  const fields = SERVICE_FIELDS[service] || [];
  secretField.innerHTML = "";
  fields.forEach((field) => {
    const option = document.createElement("option");
    option.value = field;
    option.textContent = field;
    secretField.appendChild(option);
  });
}

function toggleCredentialsMode() {
  const isCustom = !secretMode || secretMode.value === "custom";
  if (secretKeyField) {
    secretKeyField.style.display = isCustom ? "grid" : "none";
  }
  if (secretService && secretProfile && secretField) {
    const container = document.getElementById("serviceFields");
    if (container) {
      container.style.display = isCustom ? "none" : "grid";
    }
  }
}

async function loadSecretList() {
  if (!secretList) return;
  secretList.innerHTML = "";
  try {
    const data = await fetchJson("/api/secret/list");
    if (!data.keys || data.keys.length === 0) {
      const empty = document.createElement("div");
      empty.className = "session-meta";
      empty.textContent = "No stored secrets yet.";
      secretList.appendChild(empty);
      return;
    }

    data.keys.forEach((key) => {
      const row = document.createElement("div");
      row.className = "secret-item";

      const name = document.createElement("div");
      name.className = "secret-key";
      name.textContent = key;

      const del = document.createElement("button");
      del.className = "secondary-btn";
      del.type = "button";
      del.textContent = "Delete";
      del.onclick = async () => {
        await fetchJson("/api/secret/delete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key }),
        });
        loadSecretList();
      };

      row.appendChild(name);
      row.appendChild(del);
      secretList.appendChild(row);
    });
  } catch (_err) {
    const error = document.createElement("div");
    error.className = "session-meta";
    error.textContent = "Failed to load secrets.";
    secretList.appendChild(error);
  }
}

async function saveSecret() {
  if (!secretValue || !secretMode) return;
  const mode = secretMode.value || "custom";
  const value = secretValue.value.trim();
  if (!value) return;

  let key = "";
  if (mode === "service") {
    const service = secretService?.value;
    const profile = (secretProfile?.value || "default").trim();
    const field = secretField?.value;
    if (!service || !field) return;
    key = `dbsaicle.${service}.${profile}.${field}`;
  } else {
    key = (secretKeyInput?.value || "").trim();
  }

  if (!key) return;

  await fetchJson("/api/secret/set", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key, value }),
  });

  secretValue.value = "";
  if (secretKeyInput) {
    secretKeyInput.value = "";
  }
  loadSecretList();
}

function openCredentialsModal() {
  if (!credentialsModal) return;
  refreshSecretFieldOptions();
  toggleCredentialsMode();
  credentialsModal.classList.add("show");
  credentialsModal.setAttribute("aria-hidden", "false");
  loadSecretList();
}

function closeCredentialsModal() {
  if (!credentialsModal) return;
  credentialsModal.classList.remove("show");
  credentialsModal.setAttribute("aria-hidden", "true");
}

function openToolsModal() {
  if (!toolsModal) return;
  toolsModal.classList.add("show");
  toolsModal.setAttribute("aria-hidden", "false");
  loadToolsList();
}

function closeToolsModal() {
  if (!toolsModal) return;
  toolsModal.classList.remove("show");
  toolsModal.setAttribute("aria-hidden", "true");
}

function openMcpModal() {
  if (!mcpModal) return;
  mcpModal.classList.add("show");
  mcpModal.setAttribute("aria-hidden", "false");
  loadMcpList();
}

function closeMcpModal() {
  if (!mcpModal) return;
  mcpModal.classList.remove("show");
  mcpModal.setAttribute("aria-hidden", "true");
}

function updateContextIndicator(contextUsage) {
  if (!contextIndicator || !contextLabel) return;
  if (!contextUsage || typeof contextUsage.percentage !== "number") {
    contextIndicator.style.setProperty("--context", "0");
    contextIndicator.style.setProperty("--context-color", "var(--accent)");
    contextLabel.textContent = "--";
    contextIndicator.title = "Context";
    return;
  }
  const percent = clamp(Math.round(contextUsage.percentage), 0, 100);
  const tokenCount = Number(contextUsage.tokenCount || 0);
  const limit = Number(contextUsage.limit || 0);
  contextIndicator.style.setProperty("--context", String(percent));

  let color = "var(--accent)";
  if (percent >= 90) {
    color = "var(--error)";
  } else if (percent >= 75) {
    color = "var(--warning)";
  }
  contextIndicator.style.setProperty("--context-color", color);
  contextLabel.textContent = `${percent}%`;
  contextIndicator.title = limit
    ? `Context ${percent}% (${tokenCount} / ${limit} tokens)`
    : `Context ${percent}% (${tokenCount} tokens)`;
}

async function loadToolsList() {
  if (!toolsList || !toolsSummary) return;
  toolsList.innerHTML = "";
  toolsSummary.textContent = "Loading tools...";
  try {
    const data = await fetchJson("/api/tools");
    const tools = Array.isArray(data.tools) ? data.tools : [];
    toolsSummary.textContent = `${tools.length} tool(s) available`;

    if (tools.length === 0) {
      const empty = document.createElement("div");
      empty.className = "session-meta";
      empty.textContent = "No tools reported by the backend.";
      toolsList.appendChild(empty);
      return;
    }

    tools.forEach((tool) => {
      const row = document.createElement("div");
      row.className = "list-item";

      const title = document.createElement("div");
      title.className = "list-item-title";
      title.textContent = tool.displayName || tool.name || "Tool";

      const meta = document.createElement("div");
      meta.className = "list-item-meta";
      meta.textContent = tool.description || "No description available.";

      const detail = document.createElement("div");
      detail.className = "list-item-meta";
      const kind = String(tool.name || "").startsWith("mcp__")
        ? "MCP tool"
        : "Built-in tool";
      detail.textContent = `${kind} · ${tool.name || ""}`;

      row.appendChild(title);
      row.appendChild(meta);
      row.appendChild(detail);
      toolsList.appendChild(row);
    });
  } catch (_err) {
    toolsSummary.textContent = "Failed to load tools.";
  }
}

async function loadMcpList() {
  if (!mcpList || !mcpSummary) return;
  mcpList.innerHTML = "";
  mcpSummary.textContent = "Loading MCP servers...";
  try {
    const data = await fetchJson("/api/mcp");
    const servers = Array.isArray(data.servers) ? data.servers : [];
    mcpSummary.textContent = `${servers.length} server(s) configured`;

    if (servers.length === 0) {
      const empty = document.createElement("div");
      empty.className = "session-meta";
      empty.textContent = "No MCP servers configured.";
      mcpList.appendChild(empty);
      return;
    }

    servers.forEach((server) => {
      const row = document.createElement("div");
      row.className = "list-item";

      const title = document.createElement("div");
      title.className = "list-item-title";
      title.textContent = server.name || "MCP Server";

      const meta = document.createElement("div");
      meta.className = "list-item-meta";
      meta.textContent = `Status: ${server.status || "unknown"}`;

      const detail = document.createElement("div");
      detail.className = "list-item-meta";
      const toolCount = Number(server.toolCount || 0);
      const warningCount = Array.isArray(server.warnings)
        ? server.warnings.length
        : 0;
      const errorText = server.error ? ` · Error: ${server.error}` : "";
      detail.textContent = `${toolCount} tool(s)${
        warningCount ? ` · ${warningCount} warning(s)` : ""
      }${errorText}`;

      row.appendChild(title);
      row.appendChild(meta);
      row.appendChild(detail);
      mcpList.appendChild(row);
    });
  } catch (_err) {
    mcpSummary.textContent = "Failed to load MCP servers.";
  }
}

function isWindowsClient() {
  if (typeof navigator === "undefined") return false;
  return /Windows/i.test(navigator.userAgent);
}

function setupTerminalShellOptions() {
  if (!terminalShell) return;
  if (terminalShell.options.length) return;
  terminalShell.innerHTML = "";

  if (isWindowsClient()) {
    const powershell = document.createElement("option");
    powershell.value = "powershell";
    powershell.textContent = "PowerShell";
    terminalShell.appendChild(powershell);

    const cmd = document.createElement("option");
    cmd.value = "cmd";
    cmd.textContent = "Command Prompt";
    terminalShell.appendChild(cmd);
    return;
  }

  const def = document.createElement("option");
  def.value = "default";
  def.textContent = "Default shell";
  terminalShell.appendChild(def);

  const zsh = document.createElement("option");
  zsh.value = "zsh";
  zsh.textContent = "Zsh";
  terminalShell.appendChild(zsh);

  const bash = document.createElement("option");
  bash.value = "bash";
  bash.textContent = "Bash";
  terminalShell.appendChild(bash);
}

function ensureTerminalInstance() {
  if (!terminalContainer || terminalInstance) return;
  const TerminalCtor = window.Terminal || (window.XTerm && window.XTerm.Terminal);
  if (!TerminalCtor) {
    terminalContainer.textContent =
      "Terminal library not loaded. Please restart the UI.";
    return;
  }

  terminalInstance = new TerminalCtor({
    fontFamily: 'Consolas, "JetBrains Mono", "Courier New", monospace',
    fontSize: 12,
    lineHeight: 1.4,
    cursorBlink: true,
    theme: {
      background: "#111111",
      foreground: "#e6e6e6",
    },
    scrollback: 2000,
  });

  const FitAddonCtor = window.FitAddon
    ? window.FitAddon.FitAddon || window.FitAddon
    : null;
  if (FitAddonCtor) {
    terminalFitAddon = new FitAddonCtor();
    terminalInstance.loadAddon(terminalFitAddon);
  }

  terminalInstance.open(terminalContainer);
  if (terminalFitAddon) {
    terminalFitAddon.fit();
  }

  terminalInstance.onData((data) => {
    if (terminalSocket && terminalSocket.readyState === WebSocket.OPEN) {
      terminalSocket.send(JSON.stringify({ type: "input", data }));
    }
  });

  terminalInstance.onResize(({ cols, rows }) => {
    if (terminalSocket && terminalSocket.readyState === WebSocket.OPEN) {
      terminalSocket.send(JSON.stringify({ type: "resize", cols, rows }));
    }
  });
}

function updateTerminalMeta(payload) {
  if (!terminalMeta || !payload) return;
  const shell = payload.shell || "Shell";
  const cwd = payload.cwd || "";
  terminalMeta.textContent = cwd ? `${shell} | ${cwd}` : shell;
}

function connectTerminal() {
  if (!terminalInstance) return;
  if (terminalSocket) {
    try {
      terminalSocket.close();
    } catch (_err) {
      // ignore
    }
  }

  if (terminalMeta) {
    terminalMeta.textContent = "Connecting...";
  }

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(
    `${protocol}://${window.location.host}/api/terminal/ws`,
  );
  terminalSocket = socket;
  terminalConnected = false;

  socket.addEventListener("open", () => {
    terminalConnected = true;
    if (terminalFitAddon) {
      terminalFitAddon.fit();
    }
    const cols = terminalInstance.cols || 80;
    const rows = terminalInstance.rows || 24;
    socket.send(
      JSON.stringify({
        type: "init",
        shell: terminalShell?.value || "default",
        cols,
        rows,
      }),
    );
    terminalInstance.focus();
    if (terminalMeta) {
      terminalMeta.textContent = "Connecting...";
    }
  });

  socket.addEventListener("message", (event) => {
    let payload = null;
    try {
      payload = JSON.parse(event.data);
    } catch (_err) {
      return;
    }
    if (!payload) return;
    if (payload.type === "output" && payload.data) {
      terminalInstance.write(payload.data);
    }
    if (payload.type === "exit") {
      terminalInstance.write(
        `\r\n[process exited ${payload.exitCode ?? 0}]\r\n`,
      );
    }
    if (payload.type === "meta") {
      updateTerminalMeta(payload);
    }
    if (payload.type === "error" && payload.message) {
      terminalInstance.write(`\r\n[error] ${payload.message}\r\n`);
      if (terminalMeta) {
        terminalMeta.textContent = "Terminal error";
      }
    }
  });

  socket.addEventListener("close", () => {
    terminalConnected = false;
    terminalInstance.write("\r\n[disconnected]\r\n");
    if (terminalMeta) {
      terminalMeta.textContent = "Disconnected";
    }
  });
}

function setTerminalPanelVisible(visible, options = {}) {
  if (!terminalPanel) return;
  terminalPanelVisible = visible;
  terminalPanel.classList.toggle("show", visible);
  terminalPanel.setAttribute("aria-hidden", visible ? "false" : "true");
  document.body.classList.toggle("terminal-open", visible);
  if (terminalResizer) {
    terminalResizer.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  if (!visible) {
    return;
  }

  refreshPanelSizes();
  setupTerminalShellOptions();
  ensureTerminalInstance();

  if (terminalFitAddon) {
    terminalFitAddon.fit();
  }

  if (!terminalSocket || terminalSocket.readyState !== WebSocket.OPEN) {
    if (terminalMeta) {
      terminalMeta.textContent = "Connecting...";
    }
    connectTerminal();
  }

  if (options.focus && terminalInstance) {
    terminalInstance.focus();
  }
}

function openTerminalPanel(options) {
  setTerminalPanelVisible(true, options);
}

function closeTerminalPanel() {
  setTerminalPanelVisible(false);
}

function toggleTerminalPanel() {
  setTerminalPanelVisible(!terminalPanelVisible, { focus: true });
}

function openTerminalWindow() {
  const url = new URL(window.location.href);
  url.searchParams.set("terminal", "1");
  window.open(url.toString(), "_blank", "noopener");
}

function roleLabel(role) {
  if (role === "assistant" || role === "thinking") return "dbSAIcle";
  if (role === "user") return "You";
  if (role === "system") return "System";
  return role || "dbSAIcle";
}

function getActionIcon(name) {
  return ACTION_ICONS[name] || "";
}

function createActionButton(label, options = {}) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `action-btn${options.className ? ` ${options.className}` : ""}`;
  const iconMarkup = options.icon ? getActionIcon(options.icon) : "";
  if (iconMarkup) {
    btn.innerHTML = iconMarkup;
  } else {
    btn.textContent = label;
  }
  btn.setAttribute("aria-label", label);
  btn.title = label;
  if (options.onClick) {
    btn.addEventListener("click", options.onClick);
  }
  return btn;
}

function isToolCallCompleted(status) {
  const normalized = String(status || "").toLowerCase();
  return [
    "done",
    "completed",
    "success",
    "failed",
    "error",
    "errored",
    "canceled",
    "cancelled",
  ].includes(normalized);
}

function buildMessageActions(item, index, isLast) {
  const role = item.message?.role || "assistant";
  if (role === "system") return null;

  const actions = document.createElement("div");
  actions.className = "message-actions";

  const messageText = getMessageText(item);
  const signature = getMessageSignature(item, index);
  const sessionId = liveState.session?.sessionId || "";

  if (role === "assistant" && isLast) {
    actions.appendChild(
      createActionButton("Compact conversation", {
        className: "primary",
        icon: "compact",
        onClick: async () => {
          if (viewingSession) return;
          setStatus("Compacting", true);
          try {
            await fetchJson("/api/compact", { method: "POST" });
            await updateState();
          } catch (_err) {
            setStatus("Compact failed", false);
          }
        },
      }),
    );

    actions.appendChild(
      createActionButton("Generate rule", {
        icon: "rule",
        onClick: async () => {
          if (viewingSession) return;
          const prompt =
            "Generate a dbSAIcle rule based on our conversation. Return:\n" +
            "- Rule name\n- Short description\n- Rule text in markdown\n";
          await sendMessage(prompt);
        },
      }),
    );
  }

  actions.appendChild(
    createActionButton("Delete", {
      className: "danger",
      icon: "delete",
      onClick: async () => {
        if (viewingSession) return;
        await fetchJson("/api/delete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ index }),
        });
        await updateState();
      },
    }),
  );

  if (role === "user") {
    actions.appendChild(
      createActionButton("Copy", {
        icon: "copy",
        onClick: async () => {
          await copyToClipboard(messageText);
        },
      }),
    );
    return actions;
  }

  if (role === "assistant" && "speechSynthesis" in window) {
    const isSpeaking = activeSpeechKey === signature;
    actions.appendChild(
      createActionButton(isSpeaking ? "Stop reading" : "Read aloud", {
        className: isSpeaking ? "active" : "",
        icon: isSpeaking ? "stop" : "read",
        onClick: () => {
          if (!messageText) return;
          if (activeSpeechKey === signature) {
            window.speechSynthesis.cancel();
            activeSpeechKey = null;
            renderMessages(liveState.session?.history || [], liveState.isProcessing, liveState.pendingPermission);
            return;
          }
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(messageText);
          utterance.onend = () => {
            activeSpeechKey = null;
            renderMessages(liveState.session?.history || [], liveState.isProcessing, liveState.pendingPermission);
          };
          utterance.onerror = () => {
            activeSpeechKey = null;
            renderMessages(liveState.session?.history || [], liveState.isProcessing, liveState.pendingPermission);
          };
          activeSpeechKey = signature;
          window.speechSynthesis.speak(utterance);
          renderMessages(liveState.session?.history || [], liveState.isProcessing, liveState.pendingPermission);
        },
      }),
    );
  }

  actions.appendChild(
    createActionButton("Copy", {
      icon: "copy",
      onClick: async () => {
        await copyToClipboard(messageText);
      },
    }),
  );

  if (role === "assistant") {
    const feedback = getFeedbackState(sessionId, signature);
    actions.appendChild(
      createActionButton("Helpful", {
        className: feedback === true ? "active" : "",
        icon: "helpful",
        onClick: () => {
          setFeedbackState(sessionId, signature, true);
          renderMessages(liveState.session?.history || [], liveState.isProcessing, liveState.pendingPermission);
        },
      }),
    );
    actions.appendChild(
      createActionButton("Unhelpful", {
        className: feedback === false ? "active" : "",
        icon: "unhelpful",
        onClick: () => {
          setFeedbackState(sessionId, signature, false);
          renderMessages(liveState.session?.history || [], liveState.isProcessing, liveState.pendingPermission);
        },
      }),
    );
  }

  return actions;
}

function renderToolCalls(toolCallStates, container) {
  if (!Array.isArray(toolCallStates) || toolCallStates.length === 0) return;
  const wrapper = document.createElement("div");
  wrapper.className = "tool-calls";

  toolCallStates.forEach((tc) => {
    const statusValue = String(tc.status || "").toLowerCase();
    const isCompleted = isToolCallCompleted(statusValue);
    const card = document.createElement("details");
    card.className = "tool-call";
    if (!isCompleted) {
      card.open = true;
    }

    const title = document.createElement("div");
    title.className = "tool-call-title";

    const name = document.createElement("span");
    name.textContent = tc.toolCall?.function?.name || "tool";

    const status = document.createElement("span");
    status.className = `tool-call-status ${statusValue}`;
    status.textContent = tc.status || "";

    title.appendChild(name);
    title.appendChild(status);

    const summary = document.createElement("summary");
    summary.appendChild(title);
    card.appendChild(summary);

    const body = document.createElement("div");
    body.className = "tool-call-body";

    const argText = normalizeToolArgs(tc.toolCall?.function?.arguments);
    if (argText) {
      const args = document.createElement("div");
      args.className = "tool-call-section tool-call-args";
      args.innerHTML = `<div class="tool-call-label">Args</div><pre><code class="language-json">${escapeHtml(
        argText,
      )}</code></pre>`;
      body.appendChild(args);
    }

    const outputText = normalizeToolOutput(tc.output);
    if (outputText) {
      const output = document.createElement("div");
      output.className = "tool-call-section tool-call-output";
      output.innerHTML = `<div class="tool-call-label">Output</div>${renderRichText(
        outputText,
      )}`;
      hydratePreviews(output);
      body.appendChild(output);
    }

    card.appendChild(body);
    wrapper.appendChild(card);
  });

  container.appendChild(wrapper);
}

function renderMessages(history, showThinking, pendingPermission) {
  const shouldStickToBottom = autoScrollEnabled;
  const previousScrollTop = chatEl.scrollTop;
  const previousScrollHeight = chatEl.scrollHeight;
  chatEl.innerHTML = "";

  const lastRenderableIndex = Array.isArray(history)
    ? history.reduce((lastIndex, item, idx) => {
        const role = item?.message?.role;
        return role === "system" ? lastIndex : idx;
      }, -1)
    : -1;

  if (!history || history.length === 0 || lastRenderableIndex === -1) {
    const empty = document.createElement("div");
    empty.className = "message assistant";
    const header = document.createElement("div");
    header.className = "message-header";
    const roleEl = document.createElement("div");
    roleEl.className = "message-role";
    roleEl.textContent = "dbSAIcle";
    header.appendChild(roleEl);
    empty.appendChild(header);

    const content = document.createElement("div");
    content.className = "message-content";
    content.textContent = "Start a conversation to see responses here.";
    empty.appendChild(content);

    chatEl.appendChild(empty);
    if (showThinking && !pendingPermission) {
      appendThinkingMessage();
    }
    return;
  }

  history.forEach((item, index) => {
    const role = item.message?.role || "assistant";
    if (role === "system") return;
    const msg = document.createElement("div");
    msg.className = `message ${role}`;

    const roleEl = document.createElement("div");
    roleEl.className = "message-role";
    roleEl.textContent = roleLabel(role);

    const content = document.createElement("div");
    content.className = "message-content";
    content.innerHTML = renderRichText(normalizeContent(item.message?.content));
    hydratePreviews(content);

    const header = document.createElement("div");
    header.className = "message-header";
    header.appendChild(roleEl);

    const actions = buildMessageActions(
      item,
      index,
      index === lastRenderableIndex,
    );
    if (actions) {
      header.appendChild(actions);
    }

    msg.appendChild(header);
    msg.appendChild(content);

    if (role === "assistant" && item.toolCallStates) {
      renderToolCalls(item.toolCallStates, msg);
    }

    chatEl.appendChild(msg);
  });

  if (showThinking && !pendingPermission) {
    appendThinkingMessage();
  }

  if (shouldStickToBottom) {
    chatEl.scrollTop = chatEl.scrollHeight;
  } else {
    const delta = chatEl.scrollHeight - previousScrollHeight;
    chatEl.scrollTop = previousScrollTop + (delta > 0 ? delta : 0);
  }
}

function appendThinkingMessage() {
  const msg = document.createElement("div");
  msg.className = "message assistant thinking";

  const roleEl = document.createElement("div");
  roleEl.className = "message-role";
  roleEl.textContent = "dbSAIcle";

  const header = document.createElement("div");
  header.className = "message-header";
  header.appendChild(roleEl);

  const content = document.createElement("div");
  content.className = "message-content";
  content.textContent = "Thinking...";

  msg.appendChild(header);
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
    const pending = state.pendingPermission;

    if (state.isProcessing && !wasProcessing) {
      processingStartAt = Date.now();
    }
    if (!state.isProcessing) {
      processingStartAt = 0;
    }

    if (!viewingSession) {
      const history = state.session?.history || [];
      const last = history[history.length - 1];
      const lastId = last?.message?.id || "";
      const lastRole = last?.message?.role || "";
      const lastLen =
        typeof last?.message?.content === "string"
          ? last.message.content.length
          : Array.isArray(last?.message?.content)
            ? last.message.content.length
            : 0;
      const renderKey = `${history.length}|${lastId}|${lastRole}|${lastLen}|${state.isProcessing}|${pending ? pending.requestId : ""}`;

      const selectionActive = hasActiveSelection();
      if (!selectionActive && renderKey !== lastRenderKey) {
        renderMessages(history, state.isProcessing, pending);
        lastRenderKey = renderKey;
      }
      mirrorTerminalToolCalls(history);
      if (pending) {
        setStatus("Waiting for approval", true);
      } else {
        setStatus(
          state.isProcessing ? "Processing" : "Idle",
          state.isProcessing,
        );
      }
      if (state.mode) {
        setModeUI(state.mode);
      }
      updateContextIndicator(state.contextUsage);
      updatePermissionBar(pending);
      updateProcessingUI(state.isProcessing);

      if (state.isProcessing && processingStartAt && !pending) {
        const elapsed = Date.now() - processingStartAt;
        if (elapsed > HANG_THRESHOLD_MS) {
          setHangBanner(
            true,
            "No response yet. You can stop and restart the session.",
          );
          setStatus("No response yet", true);
        }
      }
    }
  } catch (_err) {
    setStatus("Backend disconnected", false);
    if (!viewingSession) {
      renderMessages(liveState.session?.history || [], false, null);
    }
    updateContextIndicator(null);
    updateProcessingUI(false);
    updatePermissionBar(null);
    setHangBanner(
      true,
      "Backend disconnected. Please restart the session.",
    );
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
    renderMessages(session.history || [], false, null);
    setStatus("Viewing history", false);
    sendBtn.disabled = true;
    promptEl.disabled = true;
    updateProcessingUI(false);
    updatePermissionBar(null);
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
  updatePermissionBar(liveState.pendingPermission);
  startPolling();
}

async function restartSession() {
  setStatus("Restarting", true);
  resetTerminalToolLog();
  await fetchJson("/api/new-session", { method: "POST" });
  setLiveSessionView();
  await updateState();
  loadSessions();
}

newChatBtn.addEventListener("click", restartSession);

sendBtn.addEventListener("click", sendMessage);

if (stopTopBtn) {
  stopTopBtn.addEventListener("click", restartSession);
}

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

if (credentialsBtn) {
  credentialsBtn.addEventListener("click", openCredentialsModal);
}

if (toolsBtn) {
  toolsBtn.addEventListener("click", openToolsModal);
}

if (mcpBtn) {
  mcpBtn.addEventListener("click", openMcpModal);
}

if (historyToggleBtn) {
  historyToggleBtn.addEventListener("click", () => {
    setHistoryCollapsed(!historyCollapsed, true);
  });
}

if (credentialsModal) {
  credentialsModal.addEventListener("click", (event) => {
    if (event.target === credentialsModal) {
      closeCredentialsModal();
    }
  });
}

if (toolsModal) {
  toolsModal.addEventListener("click", (event) => {
    if (event.target === toolsModal) {
      closeToolsModal();
    }
  });
}

if (mcpModal) {
  mcpModal.addEventListener("click", (event) => {
    if (event.target === mcpModal) {
      closeMcpModal();
    }
  });
}

if (secretCancelBtn) {
  secretCancelBtn.addEventListener("click", closeCredentialsModal);
}

if (toolsCloseBtn) {
  toolsCloseBtn.addEventListener("click", closeToolsModal);
}

if (mcpCloseBtn) {
  mcpCloseBtn.addEventListener("click", closeMcpModal);
}

if (secretSaveBtn) {
  secretSaveBtn.addEventListener("click", saveSecret);
}

if (secretMode) {
  secretMode.addEventListener("change", toggleCredentialsMode);
}

if (secretService) {
  secretService.addEventListener("change", refreshSecretFieldOptions);
}

if (terminalBtn) {
  terminalBtn.addEventListener("click", toggleTerminalPanel);
}

if (terminalCloseBtn) {
  terminalCloseBtn.addEventListener("click", closeTerminalPanel);
}

if (terminalClearBtn) {
  terminalClearBtn.addEventListener("click", () => {
    if (terminalInstance) {
      terminalInstance.clear();
      terminalInstance.write("\r\n");
    }
  });
}

if (terminalReconnectBtn) {
  terminalReconnectBtn.addEventListener("click", connectTerminal);
}

if (terminalPopoutBtn) {
  terminalPopoutBtn.addEventListener("click", openTerminalWindow);
}

if (terminalContainer) {
  terminalContainer.addEventListener(
    "wheel",
    (event) => {
      event.stopPropagation();
    },
    { passive: true },
  );
  terminalContainer.addEventListener("click", () => {
    if (terminalInstance) {
      terminalInstance.focus();
    }
  });
}

if (terminalShell) {
  terminalShell.addEventListener("change", () => {
    if (terminalPanelVisible) {
      connectTerminal();
    }
  });
}

if (modeButtons && modeButtons.length) {
  modeButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const mode = btn.dataset.mode;
      if (!mode || mode === currentMode) return;
      try {
        await fetchJson("/api/mode", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode }),
        });
        setModeUI(mode);
        if (!viewingSession) {
          setStatus(`Mode: ${mode}`, false);
        }
      } catch (_err) {
        setStatus("Mode switch failed", false);
      }
    });
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
  if (chatEl) {
    chatEl.addEventListener("scroll", updateAutoScrollState);
  }
  loadPanelSizes();
  loadHistoryState();
  setupResizers();
  refreshSecretFieldOptions();
  toggleCredentialsMode();
  const params = new URLSearchParams(window.location.search);
  if (params.get("terminal") === "1") {
    openTerminalPanel({ focus: true });
  }
  window.addEventListener("resize", () => {
    refreshPanelSizes();
    if (terminalFitAddon && terminalPanelVisible) {
      terminalFitAddon.fit();
    }
  });
})();
