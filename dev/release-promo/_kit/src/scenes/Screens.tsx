import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CompareScene, ScreenScene } from "../core/storyboard";
import type { Theme } from "../core/theme";
import { sceneAnchor, stageBox, toStagePoint } from "../core/layout";
import { ScreenStage, SourceMedia } from "../stage/ScreenStage";
import { Pointer } from "../overlays/Pointer";
import { Callout, FocusRing, KeyCaps, SceneLabel } from "../overlays/Annotations";

/** 実画面のデモ。ポインター・ズーム・注釈はすべて同じ対象に連動させる。 */
export const ScreenSceneView: React.FC<{
  scene: ScreenScene;
  theme: Theme;
  sourceAspect: number;
}> = ({ scene, theme, sourceAspect }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const box = stageBox(width, height, sourceAspect, sceneAnchor(scene));

  const focusProgress = scene.focus
    ? spring({
        frame: Math.max(0, frame - scene.focus.startFrame),
        fps,
        durationInFrames: scene.focus.durationInFrames,
        config: { damping: 200 },
      })
    : 0;

  // ズームの中心は、ポインターの着地点と同じ座標だけを指す。
  const ringTarget = scene.focus
    ? toStagePoint(box, scene.focus.x, scene.focus.y)
    : scene.pointer
      ? toStagePoint(box, scene.pointer.to.x, scene.pointer.to.y)
      : null;
  const focusEnded =
    scene.focus === undefined
      ? true
      : frame > scene.focus.startFrame + scene.focus.durationInFrames + (scene.focus.holdInFrames ?? 0);

  return (
    <AbsoluteFill>
      {scene.label ? <SceneLabel text={scene.label} theme={theme} /> : null}
      <ScreenStage box={box} theme={theme} source={scene.source} focus={scene.focus} />
      {ringTarget && scene.focus && !focusEnded ? (
        <FocusRing x={ringTarget.x} y={ringTarget.y} progress={focusProgress} theme={theme} />
      ) : null}
      {(scene.callouts ?? []).map((callout, i) => (
        <Callout key={`${callout.text}-${i}`} spec={callout} box={box} theme={theme} />
      ))}
      {scene.keyHint ? <KeyCaps spec={scene.keyHint} box={box} theme={theme} /> : null}
      {scene.pointer ? <Pointer spec={scene.pointer} box={box} theme={theme} /> : null}
    </AbsoluteFill>
  );
};

/** 変更前と変更後の比較。同じ枠の中でワイプして切り替える。 */
export const CompareSceneView: React.FC<{
  scene: CompareScene;
  theme: Theme;
  sourceAspect: number;
}> = ({ scene, theme, sourceAspect }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const box = stageBox(width, height, sourceAspect);

  const wipeStart = scene.wipeAtFrame ?? 25;
  const wipeDuration = scene.wipeDurationInFrames ?? 26;
  const wipe = interpolate(frame, [wipeStart, wipeStart + wipeDuration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      {scene.label ? <SceneLabel text={scene.label} theme={theme} /> : null}
      <ScreenStage box={box} theme={theme} source={scene.before} ambientZoom={false}>
        <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 0 0 ${(1 - wipe) * 100}%)` }}>
          <SourceMedia source={scene.after} />
        </div>
        {/* 切り替え位置の縦線。どこまで置き換わったかを分かるようにする。 */}
        {wipe > 0 && wipe < 1 ? (
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${(1 - wipe) * 100}%`,
              width: 4,
              background: theme.ring,
              boxShadow: `0 0 24px ${theme.ring}`,
            }}
          />
        ) : null}
      </ScreenStage>
      <CompareTag
        text={scene.beforeLabel ?? "変更前"}
        theme={theme}
        left={box.left + 26}
        top={box.top + 24}
        opacity={interpolate(wipe, [0, 0.55], [1, 0], { extrapolateRight: "clamp" })}
        tone="muted"
      />
      <CompareTag
        text={scene.afterLabel ?? "変更後"}
        theme={theme}
        left={box.left + box.width - 26}
        top={box.top + 24}
        opacity={interpolate(wipe, [0.4, 0.9], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
        tone="accent"
        anchorRight
      />
    </AbsoluteFill>
  );
};

const CompareTag: React.FC<{
  text: string;
  theme: Theme;
  left: number;
  top: number;
  opacity: number;
  tone: "muted" | "accent";
  anchorRight?: boolean;
}> = ({ text, theme, left, top, opacity, tone, anchorRight }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      transform: anchorRight ? "translateX(-100%)" : undefined,
      padding: "10px 20px",
      borderRadius: 999,
      background: tone === "accent" ? theme.accent : theme.panel,
      border: `1px solid ${tone === "accent" ? theme.accent : theme.panelBorder}`,
      color: tone === "accent" ? "#ffffff" : theme.inkSoft,
      fontSize: 26,
      fontWeight: 700,
      opacity,
      zIndex: 46,
    }}
  >
    {text}
  </div>
);
