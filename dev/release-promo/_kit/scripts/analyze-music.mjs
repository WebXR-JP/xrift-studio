#!/usr/bin/env node
// 楽曲を解析して、BPM・小節の位置・盛り上がりの推移を出す。
// リリース動画に合わせて切るとき、カットを小節の頭へ置くために使う。
//
//   node _kit/scripts/analyze-music.mjs "path/to/track.mp3"
//   node _kit/scripts/analyze-music.mjs track.mp3 --json out.json
//
// ffmpeg が必要。解析は決定論的で、同じ音源からは同じ結果になる。
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const SR = 44100;
const HOP = 512;
const FPS_ENV = SR / HOP; // 約 86.13 フレーム/秒

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error('使い方: node analyze-music.mjs "track.mp3" [--json out.json]');
  process.exit(1);
}
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;

// --- 読み込み -----------------------------------------------------------

const decoded = spawnSync(
  "ffmpeg",
  ["-v", "error", "-i", file, "-map", "0:a:0", "-ac", "1", "-ar", String(SR), "-f", "s16le", "-"],
  { maxBuffer: 1024 * 1024 * 512 },
);
if (decoded.status !== 0) {
  console.error(decoded.stderr?.toString() || "ffmpeg で読み込めませんでした");
  process.exit(1);
}
const raw = decoded.stdout;
const n = Math.floor(raw.length / 2);
const pcm = new Float32Array(n);
for (let i = 0; i < n; i += 1) pcm[i] = raw.readInt16LE(i * 2) / 32768;
const durationSec = n / SR;

// --- 3 帯域のエネルギー包絡 ---------------------------------------------
// FFT を使わず、1 次フィルタで低域・中域・高域に分けて包絡を取る。
// 打楽器の立ち上がりを拾えれば BPM の推定には足りる。

const onePole = (cutoff) => {
  const a = 1 - Math.exp((-2 * Math.PI * cutoff) / SR);
  let z = 0;
  return (x) => {
    z += a * (x - z);
    return z;
  };
};

const frames = Math.floor((n - HOP) / HOP);
const bands = [
  { name: "low", lp: onePole(200), prev: 0 },
  { name: "mid", lp1: onePole(2000), lp2: onePole(200), prev: 0 },
  { name: "high", lp: onePole(2000), prev: 0 },
];
const lowEnv = new Float32Array(frames);
const midEnv = new Float32Array(frames);
const highEnv = new Float32Array(frames);
const rms = new Float32Array(frames);

{
  const lpLow = onePole(200);
  const lpMid = onePole(2000);
  for (let f = 0; f < frames; f += 1) {
    let sl = 0;
    let sm = 0;
    let sh = 0;
    let sr = 0;
    for (let i = 0; i < HOP; i += 1) {
      const x = pcm[f * HOP + i];
      const low = lpLow(x);
      const mid = lpMid(x) - low;
      const high = x - lpMid(x);
      sl += low * low;
      sm += mid * mid;
      sh += high * high;
      sr += x * x;
    }
    lowEnv[f] = Math.sqrt(sl / HOP);
    midEnv[f] = Math.sqrt(sm / HOP);
    highEnv[f] = Math.sqrt(sh / HOP);
    rms[f] = Math.sqrt(sr / HOP);
  }
}

// 立ち上がり関数。各帯域の増加ぶんだけを足す。
const onset = new Float32Array(frames);
for (let f = 1; f < frames; f += 1) {
  const d =
    Math.max(0, Math.log1p(lowEnv[f] * 40) - Math.log1p(lowEnv[f - 1] * 40)) * 1.4 +
    Math.max(0, Math.log1p(midEnv[f] * 40) - Math.log1p(midEnv[f - 1] * 40)) +
    Math.max(0, Math.log1p(highEnv[f] * 40) - Math.log1p(highEnv[f - 1] * 40)) * 1.2;
  onset[f] = d;
}
// 移動平均を引いて、緩やかな増減を落とす。
{
  const w = 20;
  const smoothed = new Float32Array(frames);
  let acc = 0;
  for (let f = 0; f < frames; f += 1) {
    acc += onset[f];
    if (f >= w) acc -= onset[f - w];
    smoothed[f] = acc / Math.min(w, f + 1);
  }
  for (let f = 0; f < frames; f += 1) onset[f] = Math.max(0, onset[f] - smoothed[f]);
}

// --- BPM ----------------------------------------------------------------

const bpmToLag = (bpm) => (60 / bpm) * FPS_ENV;

// 立ち上がり関数の自己相関で、おおよその周期を出す。
const coarse = [];
for (let b = 70; b <= 190; b += 0.25) {
  const lag = bpmToLag(b);
  let score = 0;
  for (const mult of [1, 2, 4]) {
    const l = Math.round(lag * mult);
    let s = 0;
    for (let f = 0; f + l < frames; f += 1) s += onset[f] * onset[f + l];
    score += s / Math.max(1, frames - l) / mult;
  }
  coarse.push({ bpm: b, score });
}
coarse.sort((a, b) => b.score - a.score);
const coarseBpm = coarse[0].bpm;
const confidence = coarse[0].score / Math.max(1e-9, coarse[9].score);

// 拍の位置に立ち上がりがどれだけ乗るかを、1 拍あたりの平均で測る。
// 合計ではなく平均にするのは、BPM が高いほど有利になるのを避けるため。
const comb = (b) => {
  const lag = bpmToLag(b);
  let best = { perBeat: -1, phase: 0 };
  for (let phase = 0; phase < lag; phase += 0.25) {
    let sum = 0;
    let count = 0;
    for (let beat = 0; ; beat += 1) {
      const f = Math.round(phase + beat * lag);
      if (f >= frames) break;
      sum += onset[f];
      count += 1;
    }
    const perBeat = sum / Math.max(1, count);
    if (perBeat > best.perBeat) best = { perBeat, phase };
  }
  return best;
};

// 2倍・半分・3分の2などの取り違えを直す。
// 特に 2/3 倍（3連符との混同）は自己相関だけでは判別できない。
const ratios = [1 / 3, 1 / 2, 2 / 3, 1, 4 / 3, 3 / 2, 2, 3];
let best = { bpm: coarseBpm, perBeat: -1, phase: 0 };
for (const ratio of ratios) {
  const center = coarseBpm * ratio;
  if (center < 70 || center > 190) continue;
  // 候補ごとに細かく探し直す。長い曲では 0.1 BPM の差でも終端が数百ミリ秒ずれる。
  for (let b = center - 1.5; b <= center + 1.5; b += 0.01) {
    const r = comb(b);
    if (r.perBeat > best.perBeat) best = { bpm: Number(b.toFixed(2)), perBeat: r.perBeat, phase: r.phase };
  }
}
const bpmFinal = best.bpm;
const beatFrames = bpmToLag(bpmFinal);
const bestPhase = best.phase;

// 4 拍のうちどれが小節の頭かを、低域の強さで決める。
let bestDownbeat = 0;
let bestDownbeatScore = -1;
for (let d = 0; d < 4; d += 1) {
  let s = 0;
  for (let b = d; ; b += 4) {
    const f = Math.round(bestPhase + b * beatFrames);
    if (f >= frames) break;
    s += lowEnv[f];
  }
  if (s > bestDownbeatScore) {
    bestDownbeatScore = s;
    bestDownbeat = d;
  }
}

const firstDownbeatSec = (bestPhase + bestDownbeat * beatFrames) / FPS_ENV;
const barSec = (60 / bpmFinal) * 4;
const barCount = Math.floor((durationSec - firstDownbeatSec) / barSec);

// --- 構成 ---------------------------------------------------------------
// 4 小節ごとの平均音量。並べると、静かな区間と盛り上がる区間の位置が分かる。

const phraseBars = 4;
const phrases = [];
for (let bar = 0; bar + phraseBars <= barCount; bar += phraseBars) {
  const start = firstDownbeatSec + bar * barSec;
  const end = start + phraseBars * barSec;
  const f0 = Math.floor(start * FPS_ENV);
  const f1 = Math.min(frames, Math.floor(end * FPS_ENV));
  let sum = 0;
  let low = 0;
  let high = 0;
  for (let f = f0; f < f1; f += 1) {
    sum += rms[f] * rms[f];
    low += lowEnv[f];
    high += highEnv[f];
  }
  const count = Math.max(1, f1 - f0);
  phrases.push({
    bar,
    startSec: Number(start.toFixed(3)),
    db: Number((20 * Math.log10(Math.sqrt(sum / count) + 1e-9)).toFixed(1)),
    low: Number((low / count).toFixed(4)),
    high: Number((high / count).toFixed(4)),
  });
}

const loudest = Math.max(...phrases.map((p) => p.db));
const quietest = Math.min(...phrases.map((p) => p.db));

// --- 出力 ---------------------------------------------------------------

console.log(`file        ${file}`);
console.log(`duration    ${durationSec.toFixed(2)}s`);
console.log(`bpm         ${bpmFinal}  (自己相関の候補 ${coarseBpm} / 確信度 ${confidence.toFixed(2)})`);
console.log(`bar         ${barSec.toFixed(3)}s  (${(barSec * 30).toFixed(2)} フレーム @30fps)`);
console.log(`first bar   ${firstDownbeatSec.toFixed(3)}s`);
console.log(`bars        ${barCount}`);
console.log(`30秒 = ${(30 / barSec).toFixed(2)} 小節 / 60秒 = ${(60 / barSec).toFixed(2)} 小節`);
console.log("");
console.log("小節  開始      音量    低域の強さ");
for (const p of phrases) {
  const level = Math.round(((p.db - quietest) / Math.max(0.1, loudest - quietest)) * 28);
  console.log(
    `${String(p.bar).padStart(4)}  ${p.startSec.toFixed(2).padStart(7)}s  ${p.db.toFixed(1).padStart(6)}  ${"#".repeat(Math.max(0, level))}`,
  );
}

if (jsonOut) {
  writeFileSync(
    jsonOut,
    `${JSON.stringify({ file, durationSec, bpm: bpmFinal, coarseBpm, confidence, barSec, firstDownbeatSec, barCount, phrases }, null, 2)}\n`,
  );
  console.log(`\nwrote ${jsonOut}`);
}
