#!/usr/bin/env node
// assets/music の楽曲から、動画の尺に合わせた BGM を書き出す。
//
//   node _kit/scripts/cut-music.mjs                       # 無いものだけ
//   node _kit/scripts/cut-music.mjs --force               # 作り直す
//   node _kit/scripts/cut-music.mjs --only shipped-this-week-30
//
// 切る位置は tracks.json の小節番号で決まる。開始も終了も必ず小節の頭になるので、
// キットの durationInBars と合わせるとカットが拍の上に乗る。
// 元の速度は変えない。曲の性格をそのまま残し、尺のほうを小節数で合わせる。
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const MUSIC_DIR = resolve(HERE, "..", "assets", "music");
const OUT_DIR = resolve(HERE, "..", "assets", "audio");
const SR = 44100;
/** つなぎ目の重ね合わせ。1 拍ぶん重ねると、切り替えが拍の上に隠れる。 */
const CROSSFADE_BEATS = 1;

const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;

const ffmpeg = (params) => {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-v", "error", "-y", ...params], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    throw new Error(`ffmpeg failed: ${params.join(" ")}`);
  }
  return r;
};

/** 統合ラウドネスを測る。音量を揃えるために使う。 */
const measureLufs = (file) => {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-af", "ebur128", "-f", "null", "-"], {
    encoding: "utf8",
  });
  const m = /I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g;
  const all = [...(r.stderr || "").matchAll(m)];
  if (!all.length) throw new Error(`ラウドネスを測れませんでした: ${file}`);
  return Number(all[all.length - 1][1]);
};

const config = JSON.parse(readFileSync(join(MUSIC_DIR, "tracks.json"), "utf8"));
const beds = JSON.parse(readFileSync(resolve(HERE, "..", "beds.json"), "utf8")).beds;

// beds.json と実際に書き出す長さがずれると、動画と音の終わりが合わなくなる。
const assertMatchesBeds = (id, bpm, bars) => {
  const spec = beds[id];
  if (!spec) {
    throw new Error(`_kit/beds.json に ${id} がありません。BGM を足したら両方へ書いてください。`);
  }
  if (spec.bpm !== bpm || spec.bars !== bars) {
    throw new Error(
      `_kit/beds.json の ${id} が合いません: beds.json は ${spec.bpm}BPM ${spec.bars}小節、tracks.json からは ${bpm}BPM ${bars}小節`,
    );
  }
};
mkdirSync(OUT_DIR, { recursive: true });

const tmpRoot = join(tmpdir(), `xrift-promo-cut-${process.pid}`);
mkdirSync(tmpRoot, { recursive: true });

const manifest = [];

try {
  for (const track of config.tracks) {
    const source = join(MUSIC_DIR, track.source);
    if (!existsSync(source)) {
      console.error(`原曲が見つかりません: ${source}`);
      process.exitCode = 1;
      continue;
    }
    const barSec = (60 / track.bpm) * 4;
    const beatSec = 60 / track.bpm;
    const fade = beatSec * CROSSFADE_BEATS;

    for (const cut of track.cuts) {
      if (only && cut.id !== only) continue;
      const outFile = join(OUT_DIR, `bgm-${cut.id}.wav`);
      const bars = cut.segments.reduce((sum, [from, to]) => sum + (to - from), 0);
      const durationSec = bars * barSec;
      assertMatchesBeds(cut.id, track.bpm, bars);

      if (!force && existsSync(outFile)) {
        console.log(`skip   bgm-${cut.id}.wav (既にある。--force で作り直す)`);
        manifest.push({ id: cut.id, track: track.id, bars, bpm: track.bpm, durationSec });
        continue;
      }

      // 各区間を切り出す。2 つ目以降は、重ね合わせるぶんだけ手前から取り、
      // 長さも同じだけ伸ばす。こうすると合成後の長さが小節数どおりになる。
      const parts = cut.segments.map(([fromBar, toBar], i) => {
        const startSec = track.firstDownbeatSec + fromBar * barSec;
        const lengthSec = (toBar - fromBar) * barSec;
        const seek = i === 0 ? startSec : startSec - fade;
        const take = i === 0 ? lengthSec : lengthSec + fade;
        const part = join(tmpRoot, `${cut.id}-${i}.wav`);
        ffmpeg([
          "-i", source,
          "-ss", seek.toFixed(6),
          "-t", take.toFixed(6),
          "-map", "0:a:0",
          "-ac", "2",
          "-ar", String(SR),
          "-c:a", "pcm_s16le",
          part,
        ]);
        return part;
      });

      const joined = join(tmpRoot, `${cut.id}-joined.wav`);
      if (parts.length === 1) {
        ffmpeg(["-i", parts[0], "-c:a", "copy", joined]);
      } else {
        const inputs = parts.flatMap((p) => ["-i", p]);
        let filter = "";
        let prev = "0:a";
        for (let i = 1; i < parts.length; i += 1) {
          const label = i === parts.length - 1 ? "out" : `x${i}`;
          filter += `[${prev}][${i}:a]acrossfade=d=${fade.toFixed(6)}:c1=tri:c2=tri[${label}];`;
          prev = label;
        }
        ffmpeg([...inputs, "-filter_complex", filter.replace(/;$/, ""), "-map", "[out]", "-c:a", "pcm_s16le", joined]);
      }

      // 合成ベッドと同じ音量に揃える。動画側の music.volume がどの曲でも同じ意味になる。
      const lufs = measureLufs(joined);
      const gainDb = (config.targetLufs ?? -16) - lufs;
      const fadeOutStart = Math.max(0, durationSec - 0.02);
      ffmpeg([
        "-i", joined,
        "-af",
        `volume=${gainDb.toFixed(2)}dB,afade=t=in:st=0:d=0.02,afade=t=out:st=${fadeOutStart.toFixed(3)}:d=0.02`,
        "-c:a", "pcm_s16le",
        "-ar", String(SR),
        "-ac", "2",
        outFile,
      ]);

      const check = measureLufs(outFile);
      console.log(
        `write  bgm-${cut.id}.wav  ${durationSec.toFixed(2)}s  ${bars}小節  ${track.bpm}BPM  ${check.toFixed(1)} LUFS`,
      );
      manifest.push({ id: cut.id, track: track.id, bars, bpm: track.bpm, durationSec, lufs: check });
    }
  }
} finally {
  rmSync(tmpRoot, { recursive: true, force: true });
}

if (!only) {
  writeFileSync(join(OUT_DIR, "music-manifest.json"), `${JSON.stringify({ cuts: manifest }, null, 2)}\n`);
  console.log(`write  music-manifest.json  (${manifest.length} 件)`);
}
