// BGM の拍とシーンの切り替えを揃えるための拍グリッド。
// シーンの長さを小節で書くと、カットが必ず拍の上に来る。

export type BeatGrid = {
  bpm: number;
  fps: number;
  framesPerBeat: number;
  framesPerBar: number;
  /** 小節数をフレーム数へ。4/4 拍子。 */
  bars: (n: number) => number;
  /** 拍数をフレーム数へ。 */
  beats: (n: number) => number;
  /** 任意のフレーム数を最も近い拍へ寄せる。 */
  snapToBeat: (frames: number) => number;
  /** 任意のフレーム数を最も近い小節へ寄せる。 */
  snapToBar: (frames: number) => number;
};

export const createBeatGrid = ({ bpm, fps }: { bpm: number; fps: number }): BeatGrid => {
  const framesPerBeat = (60 / bpm) * fps;
  const framesPerBar = framesPerBeat * 4;
  return {
    bpm,
    fps,
    framesPerBeat,
    framesPerBar,
    bars: (n) => Math.round(framesPerBar * n),
    beats: (n) => Math.round(framesPerBeat * n),
    snapToBeat: (frames) => Math.round(Math.round(frames / framesPerBeat) * framesPerBeat),
    snapToBar: (frames) => Math.round(Math.round(frames / framesPerBar) * framesPerBar),
  };
};

import bedsJson from "../../beds.json";

export type BedSpec = {
  bpm: number;
  bars: number;
  /** 繰り返して使えるか。楽曲を切り出したものは前奏と終わりがあるので繰り返さない。 */
  loop: boolean;
  /** track は楽曲から切り出したもの、synth はこのリポジトリで合成したもの。 */
  kind: "track" | "synth";
  label: string;
};

/**
 * BGM の仕様。実体は _kit/beds.json にあり、スクリプト側も同じファイルを読む。
 * 書き出し時に cut-music.mjs と gen-audio.mjs がこの表と一致するか確認する。
 */
export const BED_SPECS: Record<string, BedSpec> = bedsJson.beds as Record<string, BedSpec>;

export const isLoopingBed = (bed: string): boolean => BED_SPECS[bed]?.loop ?? false;

/** BGM 1ループのフレーム数。ループを並べるときの長さになる。 */
export const bedDurationInFrames = (bed: string, fps: number): number => {
  const spec = BED_SPECS[bed];
  if (!spec) return 0;
  return Math.round((spec.bars * 4 * 60 * fps) / spec.bpm);
};
