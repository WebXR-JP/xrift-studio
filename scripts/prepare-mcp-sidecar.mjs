import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const release = process.argv.includes("--release");
const targetArgumentIndex = process.argv.indexOf("--target");
const requestedTarget =
  targetArgumentIndex === -1 ? null : process.argv[targetArgumentIndex + 1];
if (targetArgumentIndex !== -1 && !requestedTarget) {
  throw new Error("--target には Rust target triple を指定してください");
}
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
if (requestedTarget) cargoArguments.push("--target", requestedTarget);

const rustcVersion = run("rustc", ["-vV"], true);
const hostTarget = rustcVersion
  .split(/\r?\n/)
  .find((line) => line.startsWith("host: "))
  ?.slice("host: ".length)
  .trim();
if (!hostTarget) {
  throw new Error("Rust host targetを取得できませんでした");
}
const targetTriple = requestedTarget ?? hostTarget;

const executableSuffix = process.platform === "win32" ? ".exe" : "";
const profile = release ? "release" : "debug";
const source = path.join(
  sidecarTargetDirectory,
  ...(requestedTarget ? [requestedTarget] : []),
  profile,
  `xrift-studio-mcp${executableSuffix}`,
);
const destinationDirectory = path.join(repositoryRoot, "src-tauri", "binaries");
const destination = path.join(
  destinationDirectory,
  `xrift-studio-mcp-sidecar-${targetTriple}${executableSuffix}`,
);

// Release workflow の macOS job は、universal 版を作るために aarch64 と
// x86_64 の sidecar を先に用意する。そのあと tauri build が呼ぶ
// beforeBuildCommand が host 向けに同じものをもう一度作っていた。--target を
// 付けない cargo は別の target ディレクトリへ出力するため、依存をすべて
// 再コンパイルして 3 分近くかかっていた。
//
// XRIFT_MCP_SIDECAR_REUSE_PREBUILT に値を入れて呼ぶと、目的の実行ファイルが
// すでにある場合だけ cargo を省く。無ければこれまでどおりビルドするので、
// 用意し忘れた実行ファイルが黙って欠けることはない。設定してよいのは、
// 同じ profile の sidecar を直前に用意した呼び出し元だけだ。debug と release
// は同じファイル名へ書き出すので、開発中の既定では設定しない。
const reusePrebuilt = Boolean(process.env.XRIFT_MCP_SIDECAR_REUSE_PREBUILT);
if (reusePrebuilt && existsSync(destination)) {
  process.stdout.write(
    `Reused prebuilt XRift Studio MCP sidecar (${profile}, ${targetTriple})\n`,
  );
  process.exit(0);
}

run("cargo", cargoArguments, false, {
  // The sidecar is the file Tauri validates. Disable that validation only
  // while compiling the sidecar itself so a clean checkout can bootstrap.
  TAURI_CONFIG: JSON.stringify({ bundle: { externalBin: [] } }),
});

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
