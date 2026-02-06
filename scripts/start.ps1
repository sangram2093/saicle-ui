$ErrorActionPreference = "Stop"

$bundleRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $env:SAICLE_HOME) {
  $env:SAICLE_HOME = $bundleRoot
}

$node = $env:SAICLE_NODE_PATH
if (-not $node) {
  $node = "node"
}

& $node "$bundleRoot\\saicle-ui\\server.cjs" --no-open @args
