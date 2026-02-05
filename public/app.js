const chatEl = document.getElementById("chat");
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

const permissionModal = document.getElementById("permissionModal");
const permissionBody = document.getElementById("permissionBody");
const allowBtn = document.getElementById("allowBtn");
const denyBtn = document.getElementById("denyBtn");

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
const terminalModal = document.getElementById("terminalModal");
const terminalShell = document.getElementById("terminalShell");
const terminalOutput = document.getElementById("terminalOutput");
const terminalCommand = document.getElementById("terminalCommand");
const terminalRunBtn = document.getElementById("terminalRunBtn");
const terminalClearBtn = document.getElementById("terminalClearBtn");
const terminalCloseBtn = document.getElementById("terminalCloseBtn");

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
let autoScrollEnabled = true;
let lastRenderKey = "";
let activeSpeechKey = null;
let terminalRunning = false;

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

function isWindowsClient() {
  if (typeof navigator === "undefined") return false;
  return /Windows/i.test(navigator.userAgent);
}

function setupTerminalShellOptions() {
  if (!terminalShell) return;
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
}

function appendTerminalOutput(text, className) {
  if (!terminalOutput || text === null || text === undefined) return;
  const lines = String(text).split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (line === "" && idx === lines.length - 1) return;
    const row = document.createElement("div");
    row.className = `terminal-line${className ? ` ${className}` : ""}`;
    row.textContent = line === "" ? " " : line;
    terminalOutput.appendChild(row);
  });

  const maxLines = 400;
  while (terminalOutput.children.length > maxLines) {
    terminalOutput.removeChild(terminalOutput.firstChild);
  }
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

function openTerminalModal() {
  if (!terminalModal) return;
  setupTerminalShellOptions();
  terminalModal.classList.add("show");
  terminalModal.setAttribute("aria-hidden", "false");
  if (terminalCommand) {
    terminalCommand.focus();
  }
}

function closeTerminalModal() {
  if (!terminalModal) return;
  terminalModal.classList.remove("show");
  terminalModal.setAttribute("aria-hidden", "true");
}

async function runTerminalCommand() {
  if (!terminalCommand || !terminalRunBtn) return;
  if (terminalRunning) return;
  const command = terminalCommand.value.trim();
  if (!command) return;

  terminalRunning = true;
  terminalCommand.value = "";
  terminalRunBtn.disabled = true;
  terminalRunBtn.textContent = "Running...";

  appendTerminalOutput(`> ${command}`, "command");

  try {
    const result = await fetchJson("/api/terminal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        command,
        shell: terminalShell?.value || "default",
      }),
    });
    if (result.output) {
      appendTerminalOutput(
        result.output,
        result.exitCode === 0 ? "" : "error",
      );
    }
    const exitCode =
      typeof result.exitCode === "number" ? result.exitCode : 0;
    appendTerminalOutput(`exit ${exitCode}`, "meta");
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    appendTerminalOutput(message, "error");
  } finally {
    terminalRunning = false;
    terminalRunBtn.disabled = false;
    terminalRunBtn.textContent = "Run";
  }
}

function roleLabel(role) {
  if (role === "assistant" || role === "thinking") return "dbSAIcle";
  if (role === "user") return "You";
  if (role === "system") return "System";
  return role || "dbSAIcle";
}

function createActionButton(label, options = {}) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `action-btn${options.className ? ` ${options.className}` : ""}`;
  btn.textContent = label;
  if (options.onClick) {
    btn.addEventListener("click", options.onClick);
  }
  return btn;
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

  if (role === "assistant" && "speechSynthesis" in window) {
    const isSpeaking = activeSpeechKey === signature;
    actions.appendChild(
      createActionButton(isSpeaking ? "Stop reading" : "Read aloud", {
        className: isSpeaking ? "active" : "",
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
        onClick: () => {
          setFeedbackState(sessionId, signature, true);
          renderMessages(liveState.session?.history || [], liveState.isProcessing, liveState.pendingPermission);
        },
      }),
    );
    actions.appendChild(
      createActionButton("Unhelpful", {
        className: feedback === false ? "active" : "",
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

    const outputText = normalizeToolOutput(tc.output);
    if (outputText) {
      const output = document.createElement("div");
      output.className = "tool-call-output";
      output.innerHTML = renderRichText(outputText);
      hydratePreviews(output);
      card.appendChild(output);
    }

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
    empty.innerHTML =
      '<div class="message-role">dbSAIcle</div><div class="message-content">Start a conversation to see responses here.</div>';
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

    msg.appendChild(roleEl);
    msg.appendChild(content);

    if (role === "assistant" && item.toolCallStates) {
      renderToolCalls(item.toolCallStates, msg);
    }

    const actions = buildMessageActions(
      item,
      index,
      index === lastRenderableIndex,
    );
    if (actions) {
      msg.appendChild(actions);
    }

    chatEl.appendChild(msg);
  });

  if (pendingPermission) {
    appendPermissionCard(pendingPermission);
  } else if (showThinking) {
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

  const content = document.createElement("div");
  content.className = "message-content";
  content.textContent = "Thinking...";

  msg.appendChild(roleEl);
  msg.appendChild(content);

  chatEl.appendChild(msg);
}

function appendPermissionCard(pending) {
  const msg = document.createElement("div");
  msg.className = "permission-card message assistant";

  const roleEl = document.createElement("div");
  roleEl.className = "message-role";
  roleEl.textContent = "dbSAIcle";

  const content = document.createElement("div");
  content.className = "message-content";
  content.innerHTML = renderRichText(
    `Tool requires permission: ${pending.toolName}\n\nArgs:\n${JSON.stringify(
      pending.toolArgs,
      null,
      2,
    )}`,
  );
  hydratePreviews(content);

  const actions = document.createElement("div");
  actions.className = "permission-actions";

  const deny = document.createElement("button");
  deny.className = "secondary-btn";
  deny.type = "button";
  deny.textContent = "Deny";
  deny.onclick = async () => {
    await fetchJson("/api/permission", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId: pending.requestId, approved: false }),
    });
  };

  const allow = document.createElement("button");
  allow.className = "primary-btn";
  allow.type = "button";
  allow.textContent = "Allow";
  allow.onclick = async () => {
    await fetchJson("/api/permission", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId: pending.requestId, approved: true }),
    });
  };

  actions.appendChild(deny);
  actions.appendChild(allow);

  msg.appendChild(roleEl);
  msg.appendChild(content);
  msg.appendChild(actions);

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
      if (pending) {
        setStatus("Waiting for approval", true);
      } else {
        setStatus(
          state.isProcessing ? "Processing" : "Idle",
          state.isProcessing,
        );
      }
      handlePermission(pending);
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
    updateProcessingUI(false);
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
    renderMessages(session.history || [], false, null);
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

if (credentialsModal) {
  credentialsModal.addEventListener("click", (event) => {
    if (event.target === credentialsModal) {
      closeCredentialsModal();
    }
  });
}

if (secretCancelBtn) {
  secretCancelBtn.addEventListener("click", closeCredentialsModal);
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
  terminalBtn.addEventListener("click", openTerminalModal);
}

if (terminalModal) {
  terminalModal.addEventListener("click", (event) => {
    if (event.target === terminalModal) {
      closeTerminalModal();
    }
  });
}

if (terminalCloseBtn) {
  terminalCloseBtn.addEventListener("click", closeTerminalModal);
}

if (terminalClearBtn) {
  terminalClearBtn.addEventListener("click", () => {
    if (terminalOutput) {
      terminalOutput.innerHTML = "";
    }
  });
}

if (terminalRunBtn) {
  terminalRunBtn.addEventListener("click", runTerminalCommand);
}

if (terminalCommand) {
  terminalCommand.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runTerminalCommand();
    }
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
  refreshSecretFieldOptions();
  toggleCredentialsMode();
})();
