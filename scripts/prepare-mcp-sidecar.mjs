import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const release = process.argv.includes("--release");
const sidecarTargetDirectory = path.join(
  repositoryRoot,
  "src-tauri",
  "target-mcp-sidecar",
);
const cargoArguments = [
  "build",
  "--manifest-path",
  "src-tauri/Cargo.toml",
  "--bin",
  "xrift-studio-mcp",
  // Keep this as an explicit Cargo CLI option. On Windows an inherited or
  // case-duplicated environment variable can otherwise resolve to Cargo's
  // normal target directory, which may contain a running legacy MCP binary.
  "--target-dir",
  sidecarTargetDirectory,
  "--locked",
];
if (release) cargoArguments.push("--release");

run("cargo", cargoArguments, false, {
  // The sidecar is the file Tauri validates. Disable that validation only
  // while compiling the sidecar itself so a clean checkout can bootstrap.
  TAURI_CONFIG: JSON.stringify({ bundle: { externalBin: [] } }),
});
const rustcVersion = run("rustc", ["-vV"], true);
const targetTriple = rustcVersion
  .split(/\r?\n/)
  .find((line) => line.startsWith("host: "))
  ?.slice("host: ".length)
  .trim();
if (!targetTriple) {
  throw new Error("Rust host targetを取得できませんでした");
}

const executableSuffix = process.platform === "win32" ? ".exe" : "";
const profile = release ? "release" : "debug";
const source = path.join(
  sidecarTargetDirectory,
  profile,
  `xrift-studio-mcp${executableSuffix}`,
);
const destinationDirectory = path.join(repositoryRoot, "src-tauri", "binaries");
const destination = path.join(
  destinationDirectory,
  `xrift-studio-mcp-sidecar-${targetTriple}${executableSuffix}`,
);
mkdirSync(destinationDirectory, { recursive: true });
copyFileSync(source, destination);
process.stdout.write(`Prepared XRift Studio MCP sidecar (${profile}, ${targetTriple})\n`);

function run(command, argumentsValue, capture = false, extraEnv = {}) {
  const result = spawnSync(command, argumentsValue, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
    shell: false,
    env: { ...process.env, ...extraEnv },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (capture && result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${command} failed with exit code ${result.status}`);
  }
  return result.stdout ?? "";
}
