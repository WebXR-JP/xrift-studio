import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { Theme } from "../core/theme";

/**
 * 全シーン共通の背景。
 * 主役は画面キャプチャなので、動きは非常にゆっくりにして視線を奪わない。
 */
export const Backdrop: React.FC<{ theme: Theme; intensity?: number }> = ({ theme, intensity = 1 }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const drift = interpolate(frame, [0, Math.max(1, durationInFrames)], [0, 1]);

  return (
    <AbsoluteFill style={{ background: theme.name === "dark" ? theme.bg : theme.bg, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          width: width * 0.72,
          height: width * 0.72,
          right: -width * 0.2 + drift * 26,
          top: -width * 0.26,
          borderRadius: 999,
          background: `radial-gradient(circle, ${theme.accent}${theme.name === "dark" ? "3d" : "24"}, transparent 68%)`,
          opacity: intensity,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: width * 0.5,
          height: width * 0.5,
          left: -width * 0.16,
          bottom: -width * 0.24 - drift * 20,
          borderRadius: 999,
          background: `radial-gradient(circle, ${theme.accentSoft}${theme.name === "dark" ? "33" : "1f"}, transparent 70%)`,
          opacity: intensity,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            theme.name === "dark"
              ? `linear-gradient(180deg, transparent 0%, ${theme.bgDeep}cc 100%)`
              : `linear-gradient(180deg, transparent 0%, ${theme.bgDeep}aa 100%)`,
        }}
      />
      {/* 目盛りのような細い線。画面に落ち着いた奥行きを与える。 */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: theme.name === "dark" ? 0.055 : 0.045,
          backgroundImage: `linear-gradient(${theme.ink} 1px, transparent 1px), linear-gradient(90deg, ${theme.ink} 1px, transparent 1px)`,
          backgroundSize: `${Math.round(width / 24)}px ${Math.round(width / 24)}px`,
        }}
      />
    </AbsoluteFill>
  );
};
