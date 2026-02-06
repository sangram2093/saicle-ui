# saicle-ui

Standalone local web UI for dbSAIcle that mirrors the chat window and talks to the CLI in the backend.

## How it works
- The UI server starts a local CLI process in `serve` mode.
- The UI proxies `/state`, `/message`, `/permission`, and `/diff` to the CLI.
- Chat history is persisted by the CLI to `~/.dbsaicle/sessions`.

## Quick start
1. Install dependencies:
   ```
   npm install
   ```
2. Start the UI:
   ```
   npm start
   ```

The UI will open on `http://127.0.0.1:4173` (Node 22 recommended).

## Configure CLI path
By default the server runs `cn` from your PATH. If your CLI entrypoint is a JS file (like `dist/cn.js`), set the path explicitly.

Create a `config.json` in the repo root:
```json
{
  "cliPath": "cli/dist/cn.js",
  "cliConfigPath": "config/config.yaml",
  "cliNodePath": "",
  "uiPort": 4173,
  "cliPort": 8000,
  "cliTimeoutSeconds": 3600
}
```

You can also use env vars:
- `SAICLE_CLI_PATH`
- `SAICLE_CLI_CONFIG`
- `SAICLE_UI_PORT`
- `SAICLE_CLI_PORT`
- `SAICLE_CLI_TIMEOUT`
- `SAICLE_UI_AUTO_OPEN` (true/false)
- `SAICLE_HOME` (bundle root for resolving relative paths)
- `SAICLE_NODE_PATH` (optional Node binary path for running the CLI)

If you set `SAICLE_HOME`, `cliPath` and `cliConfigPath` can stay relative (for portable bundles).

## Node 22 bundle (no binary)
1. Build the UI bundle:
   ```
   npm run bundle:node22
   ```
   Output: `bundle/saicle-ui/` (minified `server.cjs`)
2. Build the CLI bundle (from the `saicle` repo):
   ```
   cd extensions/cli
   npm install
   npm run build
   ```
3. Assemble a single folder:
   ```
   saicle-bundle/
     start.ps1
     start.sh
     cli/
       dist/
       node_modules/
       package.json
     config/
       config.yaml
     saicle-ui/
       server.cjs
       public/
       node_modules/
       package.json
       config.example.json
   ```
4. Run from the bundle root:
   - Windows (PowerShell):
     ```
     .\start.ps1
     ```
   - macOS/Linux:
     ```
     chmod +x ./start.sh
     ./start.sh
     ```
   Both scripts set `SAICLE_HOME` automatically.
   If Node 22 is not on PATH, set `SAICLE_NODE_PATH` to the Node 22 binary.
   You can pass extra args (e.g., `--ui-port 4175`).
5. Alternatively, set `SAICLE_HOME` and run:
   ```
   node saicle-ui/server.cjs --no-open
   ```

## Notes
- The History panel reads saved sessions from `~/.dbsaicle/sessions`.
- Selecting a past session opens it read-only. Click the sub-title to return to the live session.
- “New Chat” restarts the CLI server to create a new session.
