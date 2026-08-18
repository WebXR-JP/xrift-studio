#!/usr/bin/env node
// キットの音素材を、動画プロジェクトの public/audio へ配る。
// Remotion の staticFile はプロジェクトの public 配下しか読めないため、
// storyboard が使う BGM と効果音だけをここでコピーする。
//
//   node ../_kit/scripts/sync-assets.mjs          # カレントのプロジェクトへ
//   node _kit/scripts/sync-assets.mjs --project terrain-brush
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT_AUDIO = resolve(HERE, "..", "assets", "audio");

const args = process.argv.slice(2);
const projectArg = args.includes("--project") ? args[args.indexOf("--project") + 1] : ".";
const project = resolve(process.cwd(), projectArg);

if (!existsSync(join(project, "storyboard.json"))) {
  console.error(`storyboard.json が見つかりません: ${project}`);
  console.error("動画プロジェクトのディレクトリで実行するか、--project でパスを指定してください。");
  process.exit(1);
}

const storyboard = JSON.parse(readFileSync(join(project, "storyboard.json"), "utf8"));
const bed = storyboard.music?.bed ?? "none";

const run = (script, extra = []) => {
  const r = spawnSync(process.execPath, [join(HERE, script), ...extra], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

// 素材が生成されていなければ、その場で作る。生成物は Git に入れない運用のため、
// 別のマシンや別のクローンでも同じ手順で揃う。
const has = (file) => existsSync(join(KIT_AUDIO, file));
if (!existsSync(KIT_AUDIO) || !readdirSync(KIT_AUDIO).some((f) => f.startsWith("sfx-"))) {
  console.log("効果音と合成 BGM がないので生成します...");
  run("gen-audio.mjs");
}
// 楽曲から切り出す BGM は、必要になったときだけ書き出す。
if (bed !== "none" && !has(`bgm-${bed}.wav`)) {
  console.log(`BGM ${bed} がないので書き出します...`);
  run("cut-music.mjs");
}

const destDir = join(project, "public", "audio");
mkdirSync(destDir, { recursive: true });
mkdirSync(join(project, "public", "source"), { recursive: true });

const wanted = readdirSync(KIT_AUDIO).filter((file) => {
  if (file === "manifest.json" || file === "music-manifest.json") return true;
  if (file.startsWith("sfx-")) return true;
  if (file === `bgm-${bed}.wav`) return true;
  return false;
});

if (bed !== "none" && !wanted.includes(`bgm-${bed}.wav`)) {
  console.error(`BGM が見つかりません: bgm-${bed}.wav`);
  console.error("storyboard.music.bed を manifest.json か music-manifest.json にある ID にしてください。");
  process.exit(1);
}

let copied = 0;
for (const file of wanted) {
  const from = join(KIT_AUDIO, file);
  const to = join(destDir, file);
  if (existsSync(to) && statSync(to).size === statSync(from).size && statSync(to).mtimeMs >= statSync(from).mtimeMs) {
    continue;
  }
  copyFileSync(from, to);
  copied += 1;
}

console.log(`public/audio へ ${copied} 件をコピーしました（BGM: ${bed} / 効果音: ${wanted.filter((f) => f.startsWith("sfx-")).length} 件）`);
