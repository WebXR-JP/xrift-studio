import React from "react";
import { Audio, Sequence, interpolate, staticFile, useVideoConfig } from "remotion";
import type { Scene, SfxCue, SfxId, Storyboard } from "../core/storyboard";
import { sceneDuration, sceneStarts } from "../core/storyboard";

/** 効果音ごとの既定音量。BGM と字幕の邪魔をしない範囲に収める。 */
const SFX_GAIN: Record<SfxId, number> = {
  click: 0.5,
  tick: 0.34,
  pop: 0.4,
  type: 0.32,
  whoosh: 0.42,
  swish: 0.38,
  zoom: 0.3,
  riser: 0.4,
  impact: 0.62,
  chime: 0.5,
  confirm: 0.42,
};

/** BGM を一時的に下げる効果音。見せ場が埋もれないようにする。 */
const DUCKING: Partial<Record<SfxId, { amount: number; frames: number }>> = {
  impact: { amount: 0.55, frames: 24 },
  chime: { amount: 0.65, frames: 30 },
  riser: { amount: 0.75, frames: 36 },
};

export type ResolvedCue = SfxCue & { absoluteFrame: number; sceneId: string; reason: string };

/**
 * storyboard から効果音の配置を決める。
 * シーン種別ごとの自動付与と、シーンに書いた明示指定をまとめて返す。
 */
export const deriveSfxCues = (storyboard: Storyboard, framesPerBar: number): ResolvedCue[] => {
  const auto = storyboard.sfx?.auto !== false;
  const starts = sceneStarts(storyboard.scenes, framesPerBar);
  const cues: ResolvedCue[] = [];

  const push = (sceneIndex: number, cue: SfxCue, reason: string) => {
    const scene = storyboard.scenes[sceneIndex];
    const absolute = starts[sceneIndex] + cue.at;
    if (absolute < 0) return;
    cues.push({ ...cue, absoluteFrame: Math.round(absolute), sceneId: scene.id, reason });
  };

  storyboard.scenes.forEach((scene, index) => {
    if (auto) {
      // シーンの切り替えは、カットの少し前から鳴らすと自然につながる。
      if (index > 0 && !scene.noTransitionSfx) {
        push(index, { id: "whoosh", at: -5 }, "シーンの切り替え");
      }
      for (const cue of autoCuesFor(scene)) push(index, cue.cue, cue.reason);
    }
    for (const cue of scene.sfx ?? []) push(index, cue, "storyboard の明示指定");
  });

  return cues.sort((a, b) => a.absoluteFrame - b.absoluteFrame);
};

const autoCuesFor = (scene: Scene): { cue: SfxCue; reason: string }[] => {
  switch (scene.kind) {
    case "title":
      return [{ cue: { id: "impact", at: 6 }, reason: "タイトルの着地" }];
    case "feature":
      return [{ cue: { id: "pop", at: 10 }, reason: "見出しの出現" }];
    case "screen": {
      const out: { cue: SfxCue; reason: string }[] = [];
      if (scene.pointer?.clickAtFrame !== undefined) {
        out.push({ cue: { id: "click", at: scene.pointer.clickAtFrame }, reason: "クリック" });
      }
      for (const f of scene.pointer?.extraClickFrames ?? []) {
        out.push({ cue: { id: "click", at: f, volume: SFX_GAIN.click * 0.8 }, reason: "追加のクリック" });
      }
      if (scene.focus) {
        out.push({ cue: { id: "zoom", at: scene.focus.startFrame }, reason: "ズームイン" });
      }
      for (const callout of scene.callouts ?? []) {
        out.push({ cue: { id: "tick", at: callout.at }, reason: "注釈の出現" });
      }
      if (scene.keyHint) {
        const keys = scene.keyHint.keys.length;
        for (let i = 0; i < keys; i += 1) {
          out.push({
            cue: { id: "type", at: scene.keyHint.at + i * 6 },
            reason: "キー操作の提示",
          });
        }
      }
      return out;
    }
    case "compare":
      return [{ cue: { id: "swish", at: scene.wipeAtFrame ?? 25 }, reason: "前後の切り替え" }];
    case "bullets":
      return scene.items.map((_, i) => ({
        cue: { id: "tick", at: 12 + i * 14 },
        reason: "箇条書きの出現",
      }));
    case "end":
      return [{ cue: { id: "chime", at: 4 }, reason: "締め" }];
    default:
      return [];
  }
};

const bedFile = (bed: string) => `audio/bgm-${bed}.wav`;
const sfxFile = (id: SfxId) => `audio/sfx-${id}.wav`;

/**
 * BGM と効果音をまとめて鳴らす。
 * storyboard を渡すだけで、シーン構成に合った音が付く。
 */
export const PromoAudio: React.FC<{
  storyboard: Storyboard;
  framesPerBar: number;
  bedDurationInFrames?: number;
  totalDurationInFrames: number;
}> = ({ storyboard, framesPerBar, bedDurationInFrames, totalDurationInFrames }) => {
  const { fps } = useVideoConfig();
  const music = storyboard.music;
  const sfxEnabled = storyboard.sfx?.enabled !== false;
  const sfxMaster = storyboard.sfx?.volume ?? 1;
  const cues = React.useMemo(
    () => (sfxEnabled ? deriveSfxCues(storyboard, framesPerBar) : []),
    [storyboard, framesPerBar, sfxEnabled],
  );

  const fadeIn = music?.fadeInInFrames ?? Math.round(fps * 0.5);
  const fadeOut = music?.fadeOutInFrames ?? Math.round(fps * 1.2);
  const bedVolume = music?.volume ?? 0.32;

  // 全体の音量カーブ。フェードと、効果音に合わせた一時的な下げを重ねる。
  const bedVolumeAt = React.useCallback(
    (frame: number) => {
      const fade = interpolate(
        frame,
        [0, fadeIn, Math.max(fadeIn + 1, totalDurationInFrames - fadeOut), totalDurationInFrames],
        [0, 1, 1, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      );
      let duck = 1;
      for (const cue of cues) {
        const rule = DUCKING[cue.id];
        if (!rule) continue;
        const delta = frame - cue.absoluteFrame;
        if (delta < -4 || delta > rule.frames) continue;
        const shape = interpolate(delta, [-4, 2, rule.frames], [1, rule.amount, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        duck = Math.min(duck, shape);
      }
      return bedVolume * fade * duck;
    },
    [cues, bedVolume, fadeIn, fadeOut, totalDurationInFrames],
  );

  const bedFrames = bedDurationInFrames ?? 0;
  const repeats = music && music.bed !== "none" && bedFrames > 0
    ? Math.ceil(totalDurationInFrames / bedFrames)
    : 0;

  return (
    <>
      {Array.from({ length: repeats }).map((_, i) => (
        // ループ素材は継ぎ目が合うように作ってあるので、同じ長さで並べれば途切れない。
        <Sequence key={`bed-${i}`} from={i * bedFrames} durationInFrames={bedFrames} name={`BGM ${i + 1}`}>
          <Audio
            src={staticFile(bedFile(music!.bed))}
            volume={(f) => bedVolumeAt(i * bedFrames + f)}
          />
        </Sequence>
      ))}
      {cues.map((cue, i) => (
        <Sequence
          key={`sfx-${i}-${cue.id}-${cue.absoluteFrame}`}
          from={Math.max(0, cue.absoluteFrame)}
          name={`SFX ${cue.id}`}
        >
          <Audio
            src={staticFile(sfxFile(cue.id))}
            volume={(cue.volume ?? SFX_GAIN[cue.id]) * sfxMaster}
          />
        </Sequence>
      ))}
    </>
  );
};

export { SFX_GAIN };
export const sceneDurationOf = sceneDuration;
