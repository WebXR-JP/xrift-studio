#!/usr/bin/env node
// 収録した動画素材を、Remotion が確実に扱える形へ整える。
//
//   node ../_kit/scripts/prepare-footage.mjs            # カレントのプロジェクト
//   node _kit/scripts/prepare-footage.mjs --project studio-intro
//   node _kit/scripts/prepare-footage.mjs --force       # 整え直す
//
// 画面収録は可変フレームレートだったり、タイムスタンプが飛んでいたりする。
// そのままだと書き出しの途中で「No frame found at position」で止まるため、
// 固定フレームレート・一定間隔のキーフレームへ変換してから使う。
// 変換後は同じ場所へ置き換える。元の収録は収録元のディレクトリに残っている前提。
import { copyFileSync, existsSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const force = args.includes("--force");
const projectArg = args.includes("--project") ? args[args.indexOf("--project") + 1] : ".";
const project = resolve(process.cwd(), projectArg);
const sourceDir = join(project, "public", "source");

if (!existsSync(sourceDir)) {
  console.error(`public/source が見つかりません: ${sourceDir}`);
  process.exit(1);
}

const MARKER = join(sourceDir, "prepared.json");
const prepared = existsSync(MARKER) ? JSON.parse(readFileSync(MARKER, "utf8")) : {};

const videos = readdirSync(sourceDir).filter((f) => [".mp4", ".mov", ".webm", ".m4v"].includes(extname(f).toLowerCase()));
if (videos.length === 0) {
  console.log("整える動画素材はありません。");
  process.exit(0);
}

const probe = (file, entries) =>
  spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", `stream=${entries}`, "-of", "csv=p=0", file], {
    encoding: "utf8",
  }).stdout.trim();

let changed = 0;
for (const name of videos) {
  const file = join(sourceDir, name);
  const stat = statSync(file);
  const key = `${name}`;
  if (!force && prepared[key] && prepared[key].size === stat.size) {
    console.log(`skip   ${name} (整え済み)`);
    continue;
  }

  const fps = probe(file, "r_frame_rate") || "30/1";
  const [num, den] = fps.split("/").map(Number);
  const rate = Math.round((num / (den || 1)) * 100) / 100 || 30;

  const tmp = join(sourceDir, `.tmp-${name}`);
  const r = spawnSync(
    "ffmpeg",
    [
      "-hide_banner", "-v", "error", "-y",
      "-i", file,
      "-map", "0:v:0",
      "-c:v", "libx264",
      "-preset", "slow",
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      // 固定フレームレートにして、タイムスタンプの飛びをなくす。
      "-r", String(rate),
      "-fps_mode", "cfr",
      // キーフレームを詰めて、どの位置でも取り出せるようにする。
      "-g", "10",
      "-movflags", "+faststart",
      // 素材の音は動画側で使わない。
      "-an",
      tmp,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    console.error(r.stderr);
    rmSync(tmp, { force: true });
    process.exit(1);
  }

  rmSync(file, { force: true });
  renameSync(tmp, file);
  const after = statSync(file);
  prepared[key] = { size: after.size, fps: rate };
  changed += 1;
  console.log(`ready  ${name}  ${rate}fps  ${(after.size / 1024 / 1024).toFixed(2)}MB`);
}

writeFileSync(MARKER, `${JSON.stringify(prepared, null, 2)}\n`);
console.log(changed === 0 ? "すべて整え済みです。" : `${changed} 件を整えました。`);
