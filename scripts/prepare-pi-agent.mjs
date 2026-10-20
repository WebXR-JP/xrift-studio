import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(root, "src-tauri", "resources", "pi-agent");
const manifest = path.join(destination, "package.json");
// Only replace our generated deployment; never delete an unrelated directory.
if (existsSync(destination)) {
  if (!existsSync(manifest) || JSON.parse(readFileSync(manifest, "utf8")).name !== "xrift-studio-agent") {
    throw new Error("Piの出力先に別のデータがあります。出力先を確認してください。");
  }
  rmSync(destination, { recursive: true });
}
const pnpm = process.env.npm_execpath;
if (!pnpm) throw new Error("pnpm agent:prepare から実行してください。");
const isScript = /\.(?:c?js|mjs)$/i.test(pnpm);
const args = ["--filter", "xrift-studio-agent", "deploy", "--prod", "--ignore-scripts", destination];
const result = spawnSync(isScript ? process.execPath : pnpm, isScript ? [pnpm, ...args] : args, {
  cwd: root, stdio: "inherit", shell: false,
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
if (!existsSync(path.join(destination, "dist", "main.js"))) throw new Error("Piランタイムのビルドがありません。");
