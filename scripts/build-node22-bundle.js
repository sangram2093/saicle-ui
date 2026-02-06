const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const esbuild = require("esbuild");

const rootDir = path.resolve(__dirname, "..");
const outRoot = path.join(rootDir, "bundle");
const uiOut = path.join(outRoot, "saicle-ui");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function cleanDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  ensureDir(dirPath);
}

function copyDir(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  ensureDir(destDir);
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isSymbolicLink()) {
      const target = fs.readlinkSync(srcPath);
      fs.symlinkSync(target, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function copyFileIfExists(srcPath, destPath) {
  if (!fs.existsSync(srcPath)) return;
  ensureDir(path.dirname(destPath));
  fs.copyFileSync(srcPath, destPath);
}

async function buildBundle() {
  cleanDir(uiOut);

  copyDir(path.join(rootDir, "public"), path.join(uiOut, "public"));
  fs.copyFileSync(
    path.join(rootDir, "config.example.json"),
    path.join(uiOut, "config.example.json"),
  );
  copyFileIfExists(
    path.join(rootDir, "scripts", "start.ps1"),
    path.join(outRoot, "start.ps1"),
  );
  copyFileIfExists(
    path.join(rootDir, "scripts", "start.sh"),
    path.join(outRoot, "start.sh"),
  );
  try {
    fs.chmodSync(path.join(outRoot, "start.sh"), 0o755);
  } catch (_err) {
    // Ignore chmod failures on Windows
  }

  await esbuild.build({
    entryPoints: [path.join(rootDir, "src", "server.js")],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
    minify: true,
    outfile: path.join(uiOut, "server.cjs"),
    external: ["@homebridge/node-pty-prebuilt-multiarch", "open"],
  });

  const pkg = JSON.parse(
    fs.readFileSync(path.join(rootDir, "package.json"), "utf8"),
  );
  const runtimePkg = {
    name: "saicle-ui-runtime",
    private: true,
    type: "commonjs",
    dependencies: {
      "@homebridge/node-pty-prebuilt-multiarch":
        pkg.dependencies["@homebridge/node-pty-prebuilt-multiarch"],
      open: pkg.dependencies.open,
    },
  };
  writeJson(path.join(uiOut, "package.json"), runtimePkg);

  execSync("npm install --omit=dev", { cwd: uiOut, stdio: "inherit" });
}

buildBundle().catch((err) => {
  console.error(err);
  process.exit(1);
});
