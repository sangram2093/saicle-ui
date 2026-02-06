const express = require("express");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");
const { WebSocketServer } = require("ws");
const pty = require("@homebridge/node-pty-prebuilt-multiarch");
const { loadConfig } = require("./config");

const config = loadConfig();
const app = express();

app.use(express.json({ limit: "2mb" }));

const cliBaseUrl = `http://127.0.0.1:${config.cliPort}`;
let cliProcess = null;
let cliReady = false;
let expectCliExit = false;
let restartTimer = null;
let openBrowser = null;
const terminalSessions = new Map();
let activeTerminalSessionId = null;
const terminalSessionWaiters = [];
const terminalRunQueue = [];
let terminalRunActive = false;
const TERMINAL_RUN_TIMEOUT_MS = 30000;

function resolvePublicDir() {
  const localPublic = path.join(__dirname, "public");
  if (fs.existsSync(localPublic)) return localPublic;
  return path.join(__dirname, "..", "public");
}

const publicDir = resolvePublicDir();

async function openUrl(url) {
  if (!openBrowser) {
    const mod = await import("open");
    openBrowser = mod.default || mod;
  }
  return openBrowser(url);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripAnsi(value) {
  if (!value) return "";
  return value
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
    .replace(/\x1b\][^\u0007]*(\u0007|\x1b\\)/g, "")
    .replace(/\r/g, "");
}

function getActiveTerminalSession() {
  if (activeTerminalSessionId && terminalSessions.has(activeTerminalSessionId)) {
    return terminalSessions.get(activeTerminalSessionId);
  }
  return null;
}

function waitForTerminalSession(timeoutMs = 2500) {
  const existing = getActiveTerminalSession();
  if (existing && existing.ptyProcess) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(null);
    }, timeoutMs);
    terminalSessionWaiters.push({ resolve, timer });
  });
}

function notifyTerminalSessionWaiters(session) {
  while (terminalSessionWaiters.length > 0) {
    const waiter = terminalSessionWaiters.shift();
    clearTimeout(waiter.timer);
    waiter.resolve(session);
  }
}

function buildTerminalCommand(command, shellHint, markerPrefix) {
  const trimmed = String(command || "").trim();
  if (!trimmed) {
    return `echo ${markerPrefix}0__`;
  }
  if (process.platform === "win32") {
    if (String(shellHint || "").toLowerCase() === "cmd") {
      return `${trimmed} & echo ${markerPrefix}%ERRORLEVEL%__`;
    }
    return `${trimmed}; $code = $LASTEXITCODE; Write-Output \"${markerPrefix}$code__\"`;
  }
  return `${trimmed}; echo ${markerPrefix}$?__`;
}

function finalizeTerminalRun(session, run, rawOutput, exitCode) {
  const cleaned = stripAnsi(rawOutput);
  const lines = cleaned.split("\n");
  let output = cleaned;
  if (lines.length > 5000) {
    output = lines.slice(0, 5000).join("\n");
    output += `\n\n[Output truncated to first 5000 lines of ${lines.length} total]`;
  }
  clearTimeout(run.timeoutId);
  session.activeRun = null;
  run.resolve({ output, exitCode });
}

function handleTerminalRunOutput(session, chunk) {
  if (!session || !session.activeRun) return;
  const run = session.activeRun;
  run.output += chunk;
  const match = run.output.match(run.markerRegex);
  if (!match) return;
  const markerIndex = run.output.search(run.markerRegex);
  const beforeMarker =
    markerIndex >= 0 ? run.output.slice(0, markerIndex) : run.output;
  const exitCode = Number.parseInt(match[1] || "0", 10);
  finalizeTerminalRun(
    session,
    run,
    beforeMarker,
    Number.isNaN(exitCode) ? 0 : exitCode,
  );
}

function failActiveTerminalRun(session, message) {
  if (!session || !session.activeRun) return;
  const run = session.activeRun;
  session.activeRun = null;
  clearTimeout(run.timeoutId);
  run.reject(new Error(message || "Terminal session ended"));
}

async function runTerminalCommandInSession(command, shellHint) {
  const session = await waitForTerminalSession();
  if (!session || !session.ptyProcess) {
    return runTerminalCommand(command, shellHint);
  }

  return new Promise((resolve, reject) => {
    const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const markerPrefix = `__DBSAICLE_DONE_${runId}__`;
    const markerRegex = new RegExp(
      `${escapeRegExp(markerPrefix)}(-?\\d+)__`,
    );
    const shellType = session.shellHint || shellHint || "default";
    const wrappedCommand = buildTerminalCommand(
      command,
      shellType,
      markerPrefix,
    );

    const run = {
      id: runId,
      markerPrefix,
      markerRegex,
      output: "",
      resolve,
      reject,
      timeoutId: null,
    };

    run.timeoutId = setTimeout(() => {
      if (session.activeRun !== run) return;
      try {
        session.ptyProcess.write("\x03");
      } catch (_err) {
        // ignore
      }
      const timeoutMessage = `${run.output}\n\n[Command timed out after ${Math.floor(
        TERMINAL_RUN_TIMEOUT_MS / 1000,
      )} seconds of no output]`;
      finalizeTerminalRun(session, run, timeoutMessage, 124);
    }, TERMINAL_RUN_TIMEOUT_MS);

    session.activeRun = run;
    try {
      session.ptyProcess.write(`${wrappedCommand}\r\n`);
    } catch (err) {
      clearTimeout(run.timeoutId);
      session.activeRun = null;
      reject(err);
    }
  });
}

async function enqueueTerminalRun(command, shellHint) {
  return new Promise((resolve, reject) => {
    terminalRunQueue.push({ command, shellHint, resolve, reject });
    processTerminalRunQueue();
  });
}

async function processTerminalRunQueue() {
  if (terminalRunActive) return;
  const next = terminalRunQueue.shift();
  if (!next) return;
  terminalRunActive = true;
  try {
    const result = await runTerminalCommandInSession(
      next.command,
      next.shellHint,
    );
    next.resolve(result);
  } catch (err) {
    next.reject(err);
  } finally {
    terminalRunActive = false;
    if (terminalRunQueue.length > 0) {
      processTerminalRunQueue();
    }
  }
}

function ensureVendorAssets() {
  try {
    const vendorDir = path.join(publicDir, "vendor");
    if (!fs.existsSync(vendorDir)) {
      fs.mkdirSync(vendorDir, { recursive: true });
    }

    const moduleRoot = fs.existsSync(path.join(__dirname, "node_modules"))
      ? path.join(__dirname, "node_modules")
      : path.join(__dirname, "..", "node_modules");
    const assets = [
      {
        src: path.join(moduleRoot, "marked", "marked.min.js"),
        dest: path.join(vendorDir, "marked.min.js"),
      },
      {
        src: path.join(moduleRoot, "dompurify", "dist", "purify.min.js"),
        dest: path.join(vendorDir, "purify.min.js"),
      },
      {
        src: path.join(moduleRoot, "@xterm", "xterm", "lib", "xterm.js"),
        dest: path.join(vendorDir, "xterm.js"),
      },
      {
        src: path.join(moduleRoot, "@xterm", "xterm", "css", "xterm.css"),
        dest: path.join(vendorDir, "xterm.css"),
      },
      {
        src: path.join(
          moduleRoot,
          "@xterm",
          "addon-fit",
          "lib",
          "addon-fit.js",
        ),
        dest: path.join(vendorDir, "xterm-addon-fit.js"),
      },
    ];

    assets.forEach((asset) => {
      if (fs.existsSync(asset.src)) {
        fs.copyFileSync(asset.src, asset.dest);
      }
    });
  } catch (_err) {
    // Best-effort; continue even if vendor assets are missing
  }
}

function buildCliCommand(cliPath) {
  const ext = path.extname(cliPath).toLowerCase();
  if (ext === ".js" || ext === ".mjs" || ext === ".cjs") {
    const nodePath =
      config.cliNodePath || (process.pkg ? "node" : process.execPath);
    return { command: nodePath, args: [cliPath] };
  }
  return { command: cliPath, args: [] };
}

function runCliCommand(args) {
  return new Promise((resolve) => {
    const { command, args: baseArgs } = buildCliCommand(config.cliPath);
    const child = spawn(command, [...baseArgs, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

function resolveTerminalShell(shellHint) {
  const hint = (shellHint || "").toLowerCase();
  if (process.platform === "win32") {
    if (hint === "cmd") {
      return { command: "cmd.exe", args: ["/d", "/s", "/c"] };
    }
    return {
      command: "powershell.exe",
      args: ["-NoLogo", "-ExecutionPolicy", "Bypass", "-Command"],
    };
  }

  if (hint === "bash") {
    return { command: "/bin/bash", args: ["-l", "-c"] };
  }
  if (hint === "zsh") {
    return { command: "/bin/zsh", args: ["-l", "-c"] };
  }

  const userShell = process.env.SHELL || "/bin/bash";
  return { command: userShell, args: ["-l", "-c"] };
}

function runTerminalCommand(command, shellHint) {
  return new Promise((resolve, reject) => {
    const shell = resolveTerminalShell(shellHint);
    const child = spawn(shell.command, [...shell.args, command], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      reject(err);
    });

    child.on("close", (code) => {
      const output = stdout + (stderr ? `\n${stderr}` : "");
      resolve({ output, exitCode: code ?? 0 });
    });
  });
}

function isExecutable(filePath) {
  if (!filePath) return false;
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch (_err) {
    return false;
  }
}

function resolvePtyShellCandidates(shellHint) {
  const hint = (shellHint || "").toLowerCase();
  if (process.platform === "win32") {
    if (hint === "cmd") {
      return [{ command: "cmd.exe", args: [], label: "Command Prompt" }];
    }
    return [
      {
        command: "powershell.exe",
        args: ["-NoLogo", "-NoProfile"],
        label: "PowerShell",
      },
    ];
  }

  const candidates = [];
  const seen = new Set();
  const addCandidate = (command, args, label) => {
    if (!command || seen.has(command)) return;
    seen.add(command);
    if (!isExecutable(command)) return;
    candidates.push({ command, args, label });
  };

  if (hint === "zsh") {
    addCandidate("/bin/zsh", ["-l"], "Zsh");
  } else if (hint === "bash") {
    addCandidate("/bin/bash", ["-l"], "Bash");
  } else if (hint === "sh") {
    addCandidate("/bin/sh", ["-l"], "Shell");
  } else if (shellHint && shellHint.startsWith("/")) {
    addCandidate(shellHint, ["-l"], path.basename(shellHint));
  }

  if (process.env.SHELL) {
    addCandidate(
      process.env.SHELL,
      ["-l"],
      path.basename(process.env.SHELL),
    );
  }

  addCandidate("/bin/zsh", ["-l"], "Zsh");
  addCandidate("/bin/bash", ["-l"], "Bash");
  addCandidate("/bin/sh", ["-l"], "Shell");

  if (candidates.length === 0) {
    return [{ command: "/bin/sh", args: ["-l"], label: "Shell" }];
  }

  return candidates;
}

function setupTerminalWebSocket(server) {
  const wss = new WebSocketServer({ server, path: "/api/terminal/ws" });

  wss.on("connection", (ws) => {
    let ptyProcess = null;
    const sessionId = `term_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let session = null;

    const sendMessage = (payload) => {
      if (ws.readyState !== ws.OPEN) return;
      ws.send(JSON.stringify(payload));
    };

    ws.on("message", (data) => {
      let payload = null;
      try {
        payload = JSON.parse(data.toString());
      } catch (_err) {
        return;
      }

      if (!payload || typeof payload.type !== "string") return;

      if (payload.type === "init") {
        if (ptyProcess) return;
        const cols = Number(payload.cols) || 80;
        const rows = Number(payload.rows) || 24;
        const shellCandidates = resolvePtyShellCandidates(payload.shell);
        let spawnError = null;

        for (const shell of shellCandidates) {
          try {
            ptyProcess = pty.spawn(shell.command, shell.args, {
              name: "xterm-256color",
              cols,
              rows,
              cwd: process.cwd(),
              env: { ...process.env },
            });

            sendMessage({
              type: "meta",
              shell: shell.label || shell.command,
              cwd: process.cwd(),
            });
            break;
          } catch (err) {
            spawnError = err;
            if (config.dev) {
              console.warn(
                `[terminal] spawn failed for ${shell.command}: ${err?.message || err}`,
              );
            }
          }
        }

        if (!ptyProcess) {
          const message =
            spawnError && spawnError.message
              ? spawnError.message
              : "Unable to start terminal session.";
          sendMessage({
            type: "error",
            message: `Failed to start terminal (${message}).`,
          });
          try {
            ws.close();
          } catch (_err) {
            // ignore
          }
          return;
        }

        session = {
          id: sessionId,
          ws,
          ptyProcess,
          shellHint: payload.shell || "default",
          activeRun: null,
        };
        terminalSessions.set(sessionId, session);
        activeTerminalSessionId = sessionId;
        notifyTerminalSessionWaiters(session);

        ptyProcess.onData((chunk) => {
          sendMessage({ type: "output", data: chunk });
          handleTerminalRunOutput(session, chunk);
        });

        ptyProcess.onExit(({ exitCode, signal }) => {
          sendMessage({ type: "exit", exitCode, signal });
          failActiveTerminalRun(
            session,
            "Terminal session exited while command was running.",
          );
          try {
            ws.close();
          } catch (_err) {
            // ignore
          }
        });

        return;
      }

      if (payload.type === "input" && ptyProcess) {
        ptyProcess.write(String(payload.data || ""));
        return;
      }

      if (payload.type === "resize" && ptyProcess) {
        const cols = Number(payload.cols) || 80;
        const rows = Number(payload.rows) || 24;
        try {
          ptyProcess.resize(cols, rows);
        } catch (_err) {
          // ignore resize errors
        }
        return;
      }

      if (payload.type === "close") {
        try {
          ws.close();
        } catch (_err) {
          // ignore
        }
      }
    });

    ws.on("close", () => {
      if (ptyProcess) {
        try {
          ptyProcess.kill();
        } catch (_err) {
          // ignore
        }
        ptyProcess = null;
      }
      if (session) {
        failActiveTerminalRun(session, "Terminal session closed.");
        terminalSessions.delete(session.id);
        if (activeTerminalSessionId === session.id) {
          activeTerminalSessionId = null;
        }
        session = null;
      }
    });
  });
}

function logCliOutput(prefix, chunk) {
  const text = chunk.toString();
  if (config.dev) {
    process.stdout.write(`[${prefix}] ${text}`);
  }
}

async function waitForCliReady(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${cliBaseUrl}/state`);
      if (res.ok) {
        cliReady = true;
        return true;
      }
    } catch (_err) {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

function startCli() {
  if (cliProcess) return;
  expectCliExit = false;

  const { command, args } = buildCliCommand(config.cliPath);
  const cliArgs = [
    ...args,
    "serve",
    "--port",
    String(config.cliPort),
    "--timeout",
    String(config.cliTimeoutSeconds),
  ];
  if (config.cliConfigPath) {
    cliArgs.push("--config", config.cliConfigPath);
  }
  if (config.cliExtraArgs.length) {
    cliArgs.push(...config.cliExtraArgs);
  }

  cliProcess = spawn(command, cliArgs, {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      SAICLE_TERMINAL_PROXY_URL: `http://127.0.0.1:${config.uiPort}/api/terminal`,
    },
  });

  cliProcess.stdout.on("data", (chunk) => logCliOutput("cli", chunk));
  cliProcess.stderr.on("data", (chunk) => logCliOutput("cli", chunk));

  cliProcess.on("exit", (code, signal) => {
    cliProcess = null;
    cliReady = false;
    if (config.dev) {
      console.log(`CLI exited (code=${code}, signal=${signal})`);
    }
    if (!expectCliExit) {
      if (restartTimer) clearTimeout(restartTimer);
      restartTimer = setTimeout(() => {
        startCli();
      }, 1500);
    }
  });
}

async function stopCli() {
  if (!cliProcess) return;
  expectCliExit = true;
  try {
    await fetch(`${cliBaseUrl}/exit`, { method: "POST" });
  } catch (_err) {
    // ignore
  }
  await new Promise((r) => setTimeout(r, 200));
  try {
    cliProcess.kill();
  } catch (_err) {
    // ignore
  }
  cliProcess = null;
  cliReady = false;
}

function getSessionDir() {
  return path.join(os.homedir(), ".dbsaicle", "sessions");
}

function extractFirstUserMessage(history) {
  if (!Array.isArray(history)) return "";
  for (const item of history) {
    if (item && item.message && item.message.role === "user") {
      const content = item.message.content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        const textPart = content.find((p) => p && p.type === "text");
        if (textPart && typeof textPart.text === "string") return textPart.text;
      }
      return "(message)";
    }
  }
  return "";
}

function listSessions(limit = 30) {
  const sessionDir = getSessionDir();
  if (!fs.existsSync(sessionDir)) return [];

  const files = fs
    .readdirSync(sessionDir)
    .filter((f) => f.endsWith(".json") && f !== "sessions.json")
    .map((f) => ({
      name: f,
      path: path.join(sessionDir, f),
      stat: fs.statSync(path.join(sessionDir, f)),
    }))
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
    .slice(0, limit);

  const sessions = [];
  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(file.path, "utf8"));
      sessions.push({
        sessionId: raw.sessionId,
        title: raw.title || "Chat",
        dateCreated: file.stat.birthtime.toISOString(),
        workspaceDirectory: raw.workspaceDirectory || "",
        firstUserMessage: extractFirstUserMessage(raw.history),
      });
    } catch (_err) {
      // ignore
    }
  }
  return sessions;
}

async function proxyJson(req, res, method, endpoint) {
  try {
    const upstream = await fetch(`${cliBaseUrl}${endpoint}`, {
      method,
      headers: { "content-type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(req.body || {}),
    });

    const text = await upstream.text();
    res.status(upstream.status);
    if (text) {
      try {
        res.json(JSON.parse(text));
      } catch (_err) {
        res.type("application/json").send(text);
      }
    } else {
      res.end();
    }
  } catch (err) {
    res.status(502).json({
      error: "CLI not available",
      details: err && err.message ? err.message : String(err),
    });
  }
}

app.get("/api/health", (_req, res) => {
  res.json({
    ui: "ok",
    cliReady,
    cliPort: config.cliPort,
    uiPort: config.uiPort,
  });
});

app.get("/api/state", async (req, res) => {
  await proxyJson(req, res, "GET", "/state");
});

app.post("/api/message", async (req, res) => {
  await proxyJson(req, res, "POST", "/message");
});

app.post("/api/permission", async (req, res) => {
  await proxyJson(req, res, "POST", "/permission");
});

app.post("/api/compact", async (req, res) => {
  await proxyJson(req, res, "POST", "/compact");
});

app.post("/api/delete", async (req, res) => {
  await proxyJson(req, res, "POST", "/delete");
});

app.post("/api/mode", async (req, res) => {
  await proxyJson(req, res, "POST", "/mode");
});

app.get("/api/diff", async (req, res) => {
  await proxyJson(req, res, "GET", "/diff");
});

app.post("/api/exit", async (req, res) => {
  await proxyJson(req, res, "POST", "/exit");
  await stopCli();
});

app.get("/api/secret/list", async (_req, res) => {
  try {
    const result = await runCliCommand(["secret", "list"]);
    if (result.code !== 0) {
      res.status(500).json({ error: result.stderr || "Secret list failed" });
      return;
    }
    const keys = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    res.json({ keys });
  } catch (err) {
    res.status(500).json({
      error: err && err.message ? err.message : String(err),
    });
  }
});

app.post("/api/secret/set", async (req, res) => {
  const { key, value } = req.body || {};
  if (!key || typeof key !== "string") {
    res.status(400).json({ error: "key is required" });
    return;
  }
  if (!value || typeof value !== "string") {
    res.status(400).json({ error: "value is required" });
    return;
  }
  try {
    const result = await runCliCommand(["secret", "set", key, value]);
    if (result.code !== 0) {
      res.status(500).json({ error: result.stderr || "Secret set failed" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({
      error: err && err.message ? err.message : String(err),
    });
  }
});

app.post("/api/secret/delete", async (req, res) => {
  const { key } = req.body || {};
  if (!key || typeof key !== "string") {
    res.status(400).json({ error: "key is required" });
    return;
  }
  try {
    const result = await runCliCommand(["secret", "delete", key]);
    if (result.code !== 0) {
      res.status(500).json({ error: result.stderr || "Secret delete failed" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({
      error: err && err.message ? err.message : String(err),
    });
  }
});

app.post("/api/terminal", async (req, res) => {
  const { command, shell } = req.body || {};
  if (!command || typeof command !== "string") {
    res.status(400).json({ error: "command is required" });
    return;
  }
  try {
    const result = await enqueueTerminalRun(command, shell);
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: err && err.message ? err.message : String(err),
    });
  }
});

app.get("/api/sessions", (_req, res) => {
  res.json({ sessions: listSessions(30) });
});

app.get("/api/session/:id", (req, res) => {
  const sessionDir = getSessionDir();
  const sessionPath = path.join(sessionDir, `${req.params.id}.json`);
  if (!fs.existsSync(sessionPath)) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
    res.json(raw);
  } catch (_err) {
    res.status(500).json({ error: "Failed to read session" });
  }
});

app.post("/api/new-session", async (_req, res) => {
  await stopCli();
  startCli();
  const ok = await waitForCliReady(10000);
  res.json({ ok });
});

ensureVendorAssets();
app.use(express.static(publicDir));

app.get("*", (req, res) => {
  if (req.path.startsWith("/api")) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.sendFile(path.join(publicDir, "index.html"));
});

const server = app.listen(config.uiPort, async () => {
  startCli();
  const ok = await waitForCliReady(10000);
  if (!ok) {
    console.log(
      `Warning: CLI did not respond on ${cliBaseUrl}. Check cliPath and config.`,
    );
  }

  const url = `http://127.0.0.1:${config.uiPort}`;
  console.log(`saicle-ui running at ${url}`);

  if (config.autoOpen && !config.dev) {
    try {
      await openUrl(url);
    } catch (_err) {
      // ignore
    }
  }
});

setupTerminalWebSocket(server);

function shutdown() {
  stopCli().finally(() => {
    server.close(() => process.exit(0));
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
