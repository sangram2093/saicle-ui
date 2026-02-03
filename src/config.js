const fs = require("fs");
const os = require("os");
const path = require("path");

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function readJsonIfExists(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (_err) {
    return null;
  }
}

function loadConfig() {
  const argv = parseArgs(process.argv.slice(2));
  const explicitConfigPath = argv.config;

  const cwdConfigPath = path.join(process.cwd(), "config.json");
  const homeConfigPath = path.join(os.homedir(), ".saicle-ui", "config.json");

  const fileConfig =
    readJsonIfExists(explicitConfigPath) ||
    readJsonIfExists(cwdConfigPath) ||
    readJsonIfExists(homeConfigPath) ||
    {};

  const env = process.env;

  const config = {
    uiPort: Number(argv["ui-port"] || env.SAICLE_UI_PORT || fileConfig.uiPort || 4173),
    cliPort: Number(argv["cli-port"] || env.SAICLE_CLI_PORT || fileConfig.cliPort || 8000),
    cliTimeoutSeconds: Number(
      argv["cli-timeout"] ||
        env.SAICLE_CLI_TIMEOUT ||
        fileConfig.cliTimeoutSeconds ||
        3600,
    ),
    autoOpen:
      argv["no-open"]
        ? false
        : String(env.SAICLE_UI_AUTO_OPEN || fileConfig.autoOpen || "true") === "true",
    dev: Boolean(argv.dev || env.SAICLE_UI_DEV || fileConfig.dev),
    cliPath:
      argv["cli-path"] ||
      env.SAICLE_CLI_PATH ||
      fileConfig.cliPath ||
      "cn",
    cliConfigPath:
      argv["cli-config"] || env.SAICLE_CLI_CONFIG || fileConfig.cliConfigPath || "",
    cliExtraArgs: Array.isArray(fileConfig.cliExtraArgs)
      ? fileConfig.cliExtraArgs
      : [],
  };

  return config;
}

module.exports = {
  loadConfig,
};
