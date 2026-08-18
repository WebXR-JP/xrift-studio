#!/usr/bin/env node
// XRift Studio リリース動画の BGM と効果音を生成する。
//
//   node _kit/scripts/gen-audio.mjs            # すべて生成
//   node _kit/scripts/gen-audio.mjs --only bgm # BGM だけ
//   node _kit/scripts/gen-audio.mjs --force    # 既存ファイルも作り直す
//
// 出力はすべてこのスクリプトが合成した原音。外部音源を含まないので、
// 出典表記やライセンス確認なしに動画へ使える。同じコードからは常に
// 同じ波形が出るため、生成物は Git に入れず必要なときに作り直す。
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SR, Track, toWav } from "./dsp.mjs";
import * as inst from "./instruments.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSET_DIR = resolve(HERE, "..", "assets", "audio");

// --- BGM の設計 ---------------------------------------------------------
// chords は 1 小節ぶん。notes はパッドとアルペジオが使う和音、bass はベース音。

const BEDS = [
  {
    id: "bright-120",
    label: "明るいポップ。標準の30秒アップデート紹介向け",
    bpm: 120,
    bars: 8,
    mood: "bright",
    chords: [
      { notes: [65, 69, 72], bass: 41 },
      { notes: [67, 71, 74], bass: 43 },
      { notes: [64, 69, 72], bass: 45 },
      { notes: [64, 69, 72], bass: 45 },
      { notes: [65, 69, 72], bass: 41 },
      { notes: [67, 71, 74], bass: 43 },
      { notes: [64, 67, 72], bass: 36 },
      { notes: [64, 67, 72], bass: 36 },
    ],
  },
  {
    id: "calm-96",
    label: "落ち着いた雰囲気。使い方ガイドや長めの解説向け",
    bpm: 96,
    bars: 8,
    mood: "calm",
    chords: [
      { notes: [64, 67, 71, 74], bass: 36 },
      { notes: [64, 69, 72, 76], bass: 45 },
      { notes: [65, 69, 72, 76], bass: 41 },
      { notes: [67, 71, 74, 78], bass: 43 },
      { notes: [64, 67, 71, 74], bass: 36 },
      { notes: [64, 69, 72, 76], bass: 45 },
      { notes: [65, 69, 72, 76], bass: 41 },
      { notes: [67, 71, 74, 79], bass: 43 },
    ],
  },
  {
    id: "drive-128",
    label: "勢いのある展開。大きな機能追加やリリース総集編向け",
    bpm: 128,
    bars: 8,
    mood: "drive",
    chords: [
      { notes: [69, 72, 76], bass: 45 },
      { notes: [69, 72, 76], bass: 45 },
      { notes: [65, 69, 72], bass: 41 },
      { notes: [65, 69, 72], bass: 41 },
      { notes: [67, 72, 76], bass: 36 },
      { notes: [67, 72, 76], bass: 36 },
      { notes: [67, 71, 74], bass: 43 },
      { notes: [67, 71, 74], bass: 43 },
    ],
  },
];

const renderBed = (bed) => {
  const beatSec = 60 / bed.bpm;
  const barSec = beatSec * 4;
  const total = barSec * bed.bars;
  const track = new Track(total * SR, { wrap: true });

  bed.chords.forEach((chord, bar) => {
    const t0 = bar * barSec;
    const isLastBar = bar === bed.bars - 1;

    // パッドは小節いっぱい伸ばす。ループ末尾もリリースが先頭へ回り込む。
    inst.pad(track, t0, barSec * 0.98, chord.notes, {
      gain: bed.mood === "calm" ? 0.3 : 0.2,
      cutoff: bed.mood === "drive" ? 2400 : bed.mood === "calm" ? 1250 : 1750,
      attack: bed.mood === "calm" ? 0.6 : 0.22,
    });

    if (bed.mood === "calm") {
      // 静かな帯域。ベースは長く、上物は小節に2音だけ。
      inst.bass(track, t0, barSec * 0.9, chord.bass, { gain: 0.34, cutoff: 300 });
      inst.bell(track, t0 + beatSec * 0.5, chord.notes[chord.notes.length - 1] + 12, {
        gain: 0.16,
        tau: 1.3,
        p: -0.3,
      });
      inst.bell(track, t0 + beatSec * 2.5, chord.notes[1] + 12, { gain: 0.12, tau: 1.1, p: 0.35 });
      return;
    }

    if (bed.mood === "drive") {
      for (let b = 0; b < 4; b += 1) {
        inst.kick(track, t0 + b * beatSec, { gain: 0.8, tau: 0.19 });
        inst.hat(track, t0 + b * beatSec + beatSec * 0.5, { gain: 0.13, p: 0.2 });
        inst.hat(track, t0 + b * beatSec, { gain: 0.07, tau: 0.022, p: -0.2 });
        // 8分のオフビートベースで前へ進む感じを出す。
        inst.bass(track, t0 + b * beatSec, beatSec * 0.42, chord.bass, { gain: 0.42, cutoff: 520 });
        inst.bass(track, t0 + b * beatSec + beatSec * 0.5, beatSec * 0.36, chord.bass + 12, {
          gain: 0.24,
          cutoff: 620,
        });
      }
      for (let s = 0; s < 8; s += 1) {
        const note = chord.notes[s % chord.notes.length] + (s >= 4 ? 12 : 0);
        inst.pluck(track, t0 + s * beatSec * 0.5, note, {
          gain: 0.2,
          tau: 0.16,
          p: s % 2 === 0 ? -0.35 : 0.35,
          tone: 4200,
        });
      }
      return;
    }

    // bright: 1拍目と3拍目のキック、8分ハット、シェイカー、上昇アルペジオ。
    inst.kick(track, t0, { gain: 0.62, tau: 0.2 });
    inst.kick(track, t0 + beatSec * 2, { gain: 0.5, tau: 0.18 });
    inst.bass(track, t0, beatSec * 1.8, chord.bass, { gain: 0.38 });
    inst.bass(track, t0 + beatSec * 2, beatSec * 1.7, chord.bass, { gain: 0.32 });
    for (let b = 0; b < 4; b += 1) {
      inst.hat(track, t0 + b * beatSec + beatSec * 0.5, { gain: 0.1, p: 0.25 });
      if (b % 2 === 1) inst.shaker(track, t0 + b * beatSec, { gain: 0.08, p: -0.3 });
    }
    for (let s = 0; s < 8; s += 1) {
      const tone = chord.notes[s % chord.notes.length] + (s >= 4 ? 12 : 0);
      inst.pluck(track, t0 + s * beatSec * 0.5, tone, {
        gain: s % 2 === 0 ? 0.19 : 0.13,
        tau: 0.2,
        p: s % 2 === 0 ? -0.3 : 0.3,
      });
    }
    // 最後の小節の裏拍に小さな返しを足し、ループの折り返しを自然にする。
    if (isLastBar) {
      inst.pluck(track, t0 + beatSec * 3.5, chord.notes[0] + 12, { gain: 0.16, tau: 0.14, p: 0.1 });
      inst.hat(track, t0 + beatSec * 3.75, { gain: 0.09, tau: 0.025 });
    }
  });

  inst.applyReverb(track, {
    mix: bed.mood === "calm" ? 0.34 : 0.2,
    room: 0.84,
    damp: bed.mood === "drive" ? 0.42 : 0.3,
    passes: 2,
  });

  // ナレーションや字幕の下で鳴らす前提なので、ピークを抑えて余裕を残す。
  return track.normalize(0.88).clip().gain(0.82);
};

const SFX = [
  { id: "click", label: "ポインターのクリック", make: inst.sfxClick },
  { id: "tick", label: "箇条書きや小さな出現", make: inst.sfxTick },
  { id: "pop", label: "テロップの出現", make: inst.sfxPop },
  { id: "type", label: "キー入力", make: inst.sfxType },
  { id: "whoosh", label: "シーンの切り替え", make: inst.sfxWhoosh },
  { id: "swish", label: "短い切り替え、ワイプ", make: inst.sfxSwish },
  { id: "zoom", label: "ズームイン", make: inst.sfxZoom },
  { id: "riser", label: "見せ場の直前の助走", make: inst.sfxRiser },
  { id: "impact", label: "タイトルの着地", make: inst.sfxImpact },
  { id: "chime", label: "成功、完了", make: inst.sfxChime },
  { id: "confirm", label: "小さな確定、決定", make: inst.sfxConfirm },
];

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : "all";
const force = args.includes("--force");

const write = (name, track, meta) => {
  const file = join(ASSET_DIR, name);
  if (!force && existsSync(file)) {
    console.log(`skip   ${name} (既にある。--force で作り直す)`);
    return { ...meta, file: name, durationInSeconds: track.length / SR };
  }
  writeFileSync(file, toWav(track));
  const sec = track.length / SR;
  console.log(`write  ${name}  ${sec.toFixed(2)}s`);
  return { ...meta, file: name, durationInSeconds: Number(sec.toFixed(4)) };
};

// beds.json と食い違ったまま書き出すと、動画側の小節計算がずれる。
const beds = JSON.parse(readFileSync(resolve(HERE, "..", "beds.json"), "utf8")).beds;
for (const bed of BEDS) {
  const spec = beds[bed.id];
  if (!spec) throw new Error(`_kit/beds.json に ${bed.id} がありません。`);
  if (spec.bpm !== bed.bpm || spec.bars !== bed.bars) {
    throw new Error(
      `_kit/beds.json の ${bed.id} が合いません: ${spec.bpm}BPM ${spec.bars}小節 と ${bed.bpm}BPM ${bed.bars}小節`,
    );
  }
}

mkdirSync(ASSET_DIR, { recursive: true });

const manifest = { generator: "gen-audio.mjs", sampleRate: SR, bgm: [], sfx: [] };

if (only === "all" || only === "bgm") {
  for (const bed of BEDS) {
    const track = renderBed(bed);
    manifest.bgm.push(
      write(`bgm-${bed.id}.wav`, track, {
        id: bed.id,
        label: bed.label,
        bpm: bed.bpm,
        bars: bed.bars,
        loop: true,
      }),
    );
  }
}

if (only === "all" || only === "sfx") {
  for (const s of SFX) {
    manifest.sfx.push(write(`sfx-${s.id}.wav`, s.make(), { id: s.id, label: s.label }));
  }
}

if (only === "all") {
  writeFileSync(join(ASSET_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`write  manifest.json  (BGM ${manifest.bgm.length} / SFX ${manifest.sfx.length})`);
}
