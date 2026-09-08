import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const planPath = path.join(projectRoot, "scripts/guide/capture-plan.json");
const mediaDir = path.join(projectRoot, "docs/guide/media");
const isWindows = process.platform === "win32";

async function readPlan() {
  return JSON.parse(await fs.readFile(planPath, "utf8"));
}

function runPnpmMcp(args) {
  return new Promise((resolve) => {
    const command = isWindows ? "pnpm.cmd" : "pnpm";
    const child = spawn(command, ["mcp:cli", ...args], { cwd: projectRoot, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => resolve({ code: 1, stdout, stderr: String(error) }));
    child.on("exit", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function driverConnected() {
  const result = await runPnpmMcp(["driver_session", "status"]);
  const output = `${result.stdout}\n${result.stderr}`;
  return /"connected"\s*:\s*true|connected:\s*true|connected true/i.test(output) ? output : null;
}

function waitForEnter(message) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(message, () => { rl.close(); resolve(); }));
}

async function listShots(plan) {
  const rows = [];
  for (const shot of plan.shots) {
    try {
      const stat = await fs.stat(path.join(mediaDir, shot.file));
      rows.push({ file: shot.file, page: shot.page, status: `あり ${(stat.size / 1024).toFixed(0)}KB` });
    } catch {
      rows.push({ file: shot.file, page: shot.page, status: "不足" });
    }
  }
  for (const row of rows) console.log(`${row.status === "不足" ? "不足" : "あり"}  ${row.file}  (${row.page})${row.status.startsWith("あり") ? `  ${row.status}` : ""}`);
  const missing = rows.filter((row) => row.status === "不足");
  console.log(`\n${rows.length - missing.length}/${rows.length} 件あり。不足 ${missing.length} 件。`);
  return missing;
}

async function checkShots(plan) {
  const missing = await listShots(plan);
  if (missing.length) {
    console.error(`\n不足: ${missing.map((row) => row.file).join(", ")}`);
    console.error("撮影方法は docs/GUIDE_MAINTENANCE.md の「画像の撮影」を参照してください。");
    process.exitCode = 1;
  }
}

async function captureShots(plan, { only, autoYes }) {
  const targets = only ? plan.shots.filter((shot) => shot.file === only) : plan.shots;
  if (only && !targets.length) throw new Error(`撮影計画に ${only} がありません。list で一覧を確認してください。`);
  const connected = await driverConnected();
  if (!connected) {
    throw new Error("Tauri アプリに接続できません。pnpm tauri:dev でデバッグ版を起動し、MCP クライアントで tauri サーバーを読み直すか pnpm mcp:cli driver_session start で接続してから実行してください。");
  }
  await fs.mkdir(mediaDir, { recursive: true });
  for (const shot of targets) {
    const outPath = path.join(mediaDir, shot.file);
    console.log(`\n== ${shot.file} (${shot.page}) ==`);
    console.log(`説明: ${shot.alt}`);
    for (const [index, step] of shot.setup.entries()) console.log(`  ${index + 1}. ${step}`);
    if (!autoYes) await waitForEnter("画面の用意ができたら Enter を押してください (Ctrl+C で中断) > ");
    const result = await runPnpmMcp(["webview_screenshot", "--file", outPath, "--max-width", String(plan.maxWidth ?? 1280)]);
    if (result.code !== 0) {
      console.error(`撮影に失敗しました: ${result.stderr.trim().slice(0, 500)}`);
      process.exitCode = 1;
      return;
    }
    try {
      const stat = await fs.stat(outPath);
      console.log(`保存: docs/guide/media/${shot.file} (${(stat.size / 1024).toFixed(0)}KB)`);
    } catch {
      console.error(`撮影コマンドは終わりましたが ${outPath} が見つかりません。`);
      process.exitCode = 1;
      return;
    }
  }
  console.log("\n撮影が終わったら pnpm run test:guide と pnpm run build:guide で確認してください。");
}

const [command, ...rest] = process.argv.slice(2);
const plan = await readPlan();
if (command === "list") {
  await listShots(plan);
} else if (command === "check") {
  await checkShots(plan);
} else if (command === "capture") {
  const onlyFlag = rest.indexOf("--shot");
  const only = onlyFlag >= 0 ? rest[onlyFlag + 1] : null;
  const autoYes = rest.includes("--yes");
  await captureShots(plan, { only, autoYes }).catch((error) => { console.error(error.message); process.exitCode = 1; });
} else {
  console.log("使い方:");
  console.log("  node scripts/guide/capture-guide.mjs list            # 必要な画像と不足の一覧");
  console.log("  node scripts/guide/capture-guide.mjs check           # 不足があれば終了コード1");
  console.log("  node scripts/guide/capture-guide.mjs capture         # 不足分を順に撮影（各 shot の用意を確認）");
  console.log("  node scripts/guide/capture-guide.mjs capture --shot first-world.png [--yes]");
  process.exitCode = command ? 1 : 0;
}
