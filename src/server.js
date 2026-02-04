const express = require("express");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");
const open = require("open");
const { loadConfig } = require("./config");

const config = loadConfig();
const app = express();

app.use(express.json({ limit: "2mb" }));

const cliBaseUrl = `http://127.0.0.1:${config.cliPort}`;
let cliProcess = null;
let cliReady = false;
let expectCliExit = false;
let restartTimer = null;
const publicDir = path.join(__dirname, "..", "public");

function ensureVendorAssets() {
  try {
    const vendorDir = path.join(publicDir, "vendor");
    if (!fs.existsSync(vendorDir)) {
      fs.mkdirSync(vendorDir, { recursive: true });
    }

    const assets = [
      {
        src: path.join(
          __dirname,
          "..",
          "node_modules",
          "marked",
          "marked.min.js",
        ),
        dest: path.join(vendorDir, "marked.min.js"),
      },
      {
        src: path.join(
          __dirname,
          "..",
          "node_modules",
          "dompurify",
          "dist",
          "purify.min.js",
        ),
        dest: path.join(vendorDir, "purify.min.js"),
      },
    ];

    assets.forEach((asset) => {
      if (fs.existsSync(asset.src) && !fs.existsSync(asset.dest)) {
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
    return { command: process.execPath, args: [cliPath] };
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
    env: { ...process.env },
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
      await open(url);
    } catch (_err) {
      // ignore
    }
  }
});

function shutdown() {
  stopCli().finally(() => {
    server.close(() => process.exit(0));
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
