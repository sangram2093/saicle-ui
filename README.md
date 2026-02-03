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

The UI will open on `http://127.0.0.1:4173`.

## Configure CLI path
By default the server runs `cn` from your PATH. If your CLI entrypoint is a JS file (like `cn.js`), set the path explicitly.

Create a `config.json` in the repo root:
```json
{
  "cliPath": "C:\\Users\\sangr\\Downloads\\sangram\\developments\\saicle\\extensions\\cli\\dist\\cn.js",
  "cliConfigPath": "C:\\Users\\sangr\\.dbsaicle\\config.yaml",
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

## Build a single Windows binary
```
npm run build:pkg
```
Output:
- `dist/saicle-ui.exe`

This single file starts the UI server and the CLI backend on localhost.

## Notes
- The History panel reads saved sessions from `~/.dbsaicle/sessions`.
- Selecting a past session opens it read-only. Click the sub-title to return to the live session.
- “New Chat” restarts the CLI server to create a new session.
