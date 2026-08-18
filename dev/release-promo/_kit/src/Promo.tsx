import React from "react";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { Scene, Storyboard } from "./core/storyboard";
import { sceneDuration, sceneStarts, totalDuration } from "./core/storyboard";
import { FONT_STACK, resolveTheme } from "./core/theme";
import { BED_SPECS, bedDurationInFrames, createBeatGrid } from "./core/timing";
import { PromoAudio } from "./audio/PromoAudio";
import { Backdrop } from "./stage/Backdrop";
import { BulletsCard, EndCard, FeatureCard, TitleCard } from "./scenes/Cards";
import { CompareSceneView, ScreenSceneView } from "./scenes/Screens";
import { Caption } from "./overlays/Annotations";

export type PromoProps = {
  storyboard: Storyboard;
  /** 収録素材の縦横比。既定は 16:9。 */
  sourceAspect?: number;
  /** 文字が画面外へ出ないか確認する補助線。書き出し時は必ず false。 */
  showGuides?: boolean;
};

/** storyboard の BPM を決める。BGM を鳴らさない場合も拍グリッドは使う。 */
export const resolveBpm = (storyboard: Storyboard): number =>
  storyboard.music?.bpm ?? BED_SPECS[storyboard.music?.bed ?? ""]?.bpm ?? 120;

/** Composition に渡す長さ。storyboard から計算する。 */
export const resolveDurationInFrames = (storyboard: Storyboard): number => {
  const grid = createBeatGrid({ bpm: resolveBpm(storyboard), fps: storyboard.format.fps });
  return totalDuration(storyboard, grid.framesPerBar);
};

export const Promo: React.FC<PromoProps> = ({ storyboard, sourceAspect, showGuides = false }) => {
  const { fps } = useVideoConfig();
  // 収録素材の比。storyboard で指定でき、既定は 16:9。
  const aspect = sourceAspect ?? storyboard.format.sourceAspect ?? 16 / 9;
  const theme = resolveTheme(storyboard.theme);
  const grid = createBeatGrid({ bpm: resolveBpm(storyboard), fps });
  const starts = sceneStarts(storyboard.scenes, grid.framesPerBar);
  const total = totalDuration(storyboard, grid.framesPerBar);
  const bedFrames = bedDurationInFrames(storyboard.music?.bed ?? "none", fps);

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, fontFamily: FONT_STACK }}>
      <Backdrop theme={theme} />
      <PromoAudio
        storyboard={storyboard}
        framesPerBar={grid.framesPerBar}
        bedDurationInFrames={bedFrames}
        totalDurationInFrames={total}
      />
      {storyboard.scenes.map((scene, index) => (
        <Sequence
          key={scene.id}
          from={starts[index]}
          durationInFrames={sceneDuration(scene, grid.framesPerBar)}
          name={`${index + 1}. ${scene.id}`}
        >
          <SceneView scene={scene} storyboard={storyboard} sourceAspect={aspect} />
          {scene.caption ? <Caption text={scene.caption} theme={theme} /> : null}
        </Sequence>
      ))}
      {/* カットの瞬間に走る帯。切り替え音と同じタイミングで動く。 */}
      {storyboard.scenes.map((scene, index) =>
        index === 0 || scene.noTransitionSfx ? null : (
          <Sequence key={`sweep-${scene.id}`} from={starts[index] - 4} durationInFrames={16} name="cut">
            <CutSweep color={theme.accent} />
          </Sequence>
        ),
      )}
      {showGuides ? <Guides /> : null}
    </AbsoluteFill>
  );
};

const SceneView: React.FC<{ scene: Scene; storyboard: Storyboard; sourceAspect: number }> = ({
  scene,
  storyboard,
  sourceAspect,
}) => {
  const theme = resolveTheme(storyboard.theme);
  switch (scene.kind) {
    case "title":
      return <TitleCard scene={scene} theme={theme} />;
    case "feature":
      return <FeatureCard scene={scene} theme={theme} />;
    case "screen":
      return <ScreenSceneView scene={scene} theme={theme} sourceAspect={sourceAspect} />;
    case "compare":
      return <CompareSceneView scene={scene} theme={theme} sourceAspect={sourceAspect} />;
    case "bullets":
      return <BulletsCard scene={scene} theme={theme} />;
    case "end":
      return <EndCard scene={scene} theme={theme} releaseStatus={storyboard.releaseStatus} />;
    default:
      return null;
  }
};

const CutSweep: React.FC<{ color: string }> = ({ color }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const x = interpolate(frame, [0, 12], [-width * 0.7, width * 1.1], { extrapolateRight: "clamp" });
  const opacity = interpolate(frame, [0, 3, 12], [0, 0.5, 0], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ overflow: "hidden", zIndex: 60, pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          top: "-20%",
          left: x,
          width: width * 0.5,
          height: "140%",
          transform: "skewX(-14deg)",
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
          opacity,
        }}
      />
    </AbsoluteFill>
  );
};

/** 縦横どちらの書き出しでも、要素が端に寄りすぎていないか見るための補助線。 */
const Guides: React.FC = () => (
  <AbsoluteFill style={{ zIndex: 90, pointerEvents: "none" }}>
    <div style={{ position: "absolute", inset: "5% 5%", border: "2px dashed rgba(255,80,80,.5)" }} />
    <div style={{ position: "absolute", inset: "10% 10%", border: "2px dashed rgba(80,200,255,.4)" }} />
  </AbsoluteFill>
);
