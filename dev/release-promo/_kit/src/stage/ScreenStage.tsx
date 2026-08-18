import React from "react";
import {
  Img,
  OffthreadVideo,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { Focus, Redaction, SourceRef } from "../core/storyboard";
import { normalizeSource } from "../core/storyboard";
import type { Theme } from "../core/theme";
import type { Box } from "../core/layout";

/** 素材 1 枚を、そのまま等倍で描く。加工はズームだけに限る。 */
export const SourceMedia: React.FC<{ source: SourceRef; style?: React.CSSProperties }> = ({ source, style }) => {
  const s = normalizeSource(source);
  const common: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
    ...style,
  };
  if (s.type === "video") {
    return (
      <OffthreadVideo
        src={staticFile(s.src)}
        style={common}
        startFrom={s.startFrom}
        playbackRate={s.playbackRate}
        volume={s.volume}
        muted={!s.volume}
      />
    );
  }
  return <Img src={staticFile(s.src)} style={common} />;
};

/**
 * 画面キャプチャを置く枠。
 * ズームは transform-origin をフォーカス点に合わせるので、指定した座標が動かない。
 */
export const ScreenStage: React.FC<{
  box: Box;
  theme: Theme;
  source?: SourceRef;
  focus?: Focus;
  /** 静止画のときだけ、ごく緩やかな寄りを足して映像を止めない。 */
  ambientZoom?: boolean;
  /** 公開したくない範囲を伏せる。 */
  redactions?: Redaction[];
  children?: React.ReactNode;
}> = ({ box, theme, source, focus, ambientZoom = true, redactions, children }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width: frameWidth } = useVideoConfig();
  // 枠が画面より大きいときは切り取られるので、角丸と縁の光を出さない。
  const bleeds = box.width > frameWidth - 2;

  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 14 });
  const focusProgress = focus
    ? spring({
        frame: Math.max(0, frame - focus.startFrame),
        fps,
        durationInFrames: focus.durationInFrames,
        config: { damping: 200 },
      })
    : 0;

  const ambient = ambientZoom
    ? interpolate(frame, [0, Math.max(1, durationInFrames)], [1, 1.028], { extrapolateRight: "clamp" })
    : 1;
  const zoom = focus ? interpolate(focusProgress, [0, 1], [1, focus.scale]) : 1;
  const origin = focus ? `${focus.x * 100}% ${focus.y * 100}%` : "50% 50%";

  return (
    <>
    {/* 枠が暗い背景に浮いて見えないよう、後ろに淡い光を敷く。 */}
    <div
      style={{
        position: "absolute",
        left: box.left - box.width * 0.06,
        top: box.top - box.height * 0.08,
        width: box.width * 1.12,
        height: box.height * 1.16,
        borderRadius: 60,
        background: `radial-gradient(ellipse at center, ${theme.accent}1f, transparent 70%)`,
        opacity: bleeds ? 0 : enter,
      }}
    />
    <div
      style={{
        position: "absolute",
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        borderRadius: bleeds ? 0 : 22,
        overflow: "hidden",
        background: theme.stage,
        border: bleeds ? "none" : `1px solid ${theme.panelBorder}`,
        boxShadow: bleeds ? "none" : theme.shadow,
        opacity: enter,
        transform: `scale(${interpolate(enter, [0, 1], [0.985, 1])})`,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          transformOrigin: origin,
          transform: `scale(${zoom * ambient})`,
        }}
      >
        {source ? <SourceMedia source={source} /> : <MissingSource theme={theme} />}
        {(redactions ?? []).map((r, i) => (
          <Redacted key={`redact-${i}`} spec={r} />
        ))}
      </div>
      {children}
    </div>
    </>
  );
};

/** 伏せる範囲。素材は加工せず、ここで重ねるだけにする。 */
const Redacted: React.FC<{ spec: Redaction }> = ({ spec }) => (
  <div
    style={{
      position: "absolute",
      left: `${spec.x * 100}%`,
      top: `${spec.y * 100}%`,
      width: `${spec.width * 100}%`,
      height: `${spec.height * 100}%`,
      borderRadius: 6,
      ...(spec.mode === "block"
        ? { background: "rgba(100,116,139,.92)" }
        : { backdropFilter: "blur(14px)", background: "rgba(148,163,184,.34)" }),
    }}
  />
);

/**
 * 素材が未収録のときの表示。
 * 架空の UI を作らず、収録が必要なことがひと目で分かる状態にして公開を止める。
 */
const MissingSource: React.FC<{ theme: Theme }> = ({ theme }) => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 14,
      background: `repeating-linear-gradient(45deg, ${theme.bgDeep} 0 22px, ${theme.bg} 22px 44px)`,
      color: theme.ink,
      fontSize: 34,
      fontWeight: 700,
    }}
  >
    <div>実画面の素材が未収録です</div>
    <div style={{ fontSize: 24, fontWeight: 700, color: theme.inkFaint }}>
      収録してから storyboard の source を指定してください
    </div>
  </div>
);
