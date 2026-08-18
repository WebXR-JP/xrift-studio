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

/** BGM の仕様。gen-audio.mjs の BEDS と必ず一致させる。 */
export const BED_SPECS: Record<string, { bpm: number; bars: number }> = {
  "bright-120": { bpm: 120, bars: 8 },
  "calm-96": { bpm: 96, bars: 8 },
  "drive-128": { bpm: 128, bars: 8 },
};

/** BGM 1ループのフレーム数。ループを並べるときの長さになる。 */
export const bedDurationInFrames = (bed: string, fps: number): number => {
  const spec = BED_SPECS[bed];
  if (!spec) return 0;
  return Math.round((spec.bars * 4 * 60 * fps) / spec.bpm);
};
