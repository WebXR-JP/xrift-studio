import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Callout as CalloutSpec, KeyHint } from "../core/storyboard";
import type { Theme } from "../core/theme";
import type { Box } from "./Pointer";

/** 画面下の字幕。音声なしで読める短い文をここに置く。 */
export const Caption: React.FC<{ text: string; theme: Theme; delay?: number }> = ({
  text,
  theme,
  delay = 6,
}) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const enter = spring({ frame: Math.max(0, frame - delay), fps, config: { damping: 200 } });
  return (
    <div
      style={{
        position: "absolute",
        left: width * 0.085,
        bottom: 52,
        maxWidth: width * 0.72,
        padding: "18px 30px",
        borderRadius: 16,
        background: theme.captionBg,
        border: `1px solid ${theme.panelBorder}`,
        color: theme.captionInk,
        fontSize: 34,
        fontWeight: 700,
        lineHeight: 1.35,
        letterSpacing: 0.2,
        boxShadow: theme.shadow,
        opacity: enter,
        transform: `translateY(${interpolate(enter, [0, 1], [18, 0])}px)`,
        zIndex: 45,
      }}
    >
      {text}
    </div>
  );
};

/** 素材の出どころを示すラベル。実画面であることを明示する。 */
export const SceneLabel: React.FC<{ text: string; theme: Theme }> = ({ text, theme }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 } });
  return (
    <div
      style={{
        position: "absolute",
        left: width * 0.085,
        top: 62,
        display: "flex",
        alignItems: "center",
        gap: 12,
        color: theme.inkSoft,
        fontSize: 24,
        fontWeight: 700,
        letterSpacing: 1.2,
        opacity: enter,
        zIndex: 45,
      }}
    >
      <span style={{ width: 10, height: 10, borderRadius: 999, background: theme.accent }} />
      {text}
    </div>
  );
};

/** 画面の一点を指す注釈。ズームと同じ 0〜1 の座標で指定する。 */
export const Callout: React.FC<{ spec: CalloutSpec; box: Box; theme: Theme }> = ({ spec, box, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - spec.at;
  const life = spec.durationInFrames ?? 9999;
  if (local < 0 || local > life) return null;

  const enter = spring({ frame: Math.max(0, local), fps, config: { damping: 190 } });
  const exit = interpolate(local, [life - 8, life], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = enter * exit;

  const x = box.left + spec.x * box.width;
  const y = box.top + spec.y * box.height;
  const side = spec.side ?? "right";
  const gap = 26;
  const offset = {
    right: { left: x + gap, top: y - 26, transform: "translateX(0)" },
    left: { left: x - gap, top: y - 26, transform: "translateX(-100%)" },
    top: { left: x, top: y - gap - 52, transform: "translateX(-50%)" },
    bottom: { left: x, top: y + gap, transform: "translateX(-50%)" },
  }[side];

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: x - 9,
          top: y - 9,
          width: 18,
          height: 18,
          borderRadius: 999,
          background: theme.accent,
          boxShadow: `0 0 0 ${8 * enter}px ${theme.accent}26`,
          opacity,
          zIndex: 46,
        }}
      />
      <div
        style={{
          position: "absolute",
          ...offset,
          padding: "10px 18px",
          borderRadius: 12,
          background: theme.panel,
          border: `1px solid ${theme.panelBorder}`,
          color: theme.ink,
          fontSize: 26,
          fontWeight: 700,
          whiteSpace: "nowrap",
          boxShadow: theme.shadow,
          opacity,
          zIndex: 46,
        }}
      >
        {spec.text}
      </div>
    </>
  );
};

/** キーボード操作の提示。実際に押した操作だけを並べる。 */
export const KeyCaps: React.FC<{ spec: KeyHint; box: Box; theme: Theme }> = ({ spec, box, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - spec.at;
  const life = spec.durationInFrames ?? 9999;
  if (local < 0 || local > life) return null;

  const enter = spring({ frame: Math.max(0, local), fps, config: { damping: 200 } });
  const exit = interpolate(local, [life - 10, life], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        left: box.left + box.width / 2,
        top: box.top + box.height - 118,
        transform: `translate(-50%, ${interpolate(enter, [0, 1], [16, 0])}px)`,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 22px",
        borderRadius: 18,
        background: theme.panel,
        border: `1px solid ${theme.panelBorder}`,
        boxShadow: theme.shadow,
        opacity: enter * exit,
        zIndex: 46,
      }}
    >
      {spec.keys.map((key, i) => {
        // 順番に押す指定なら、キーごとに押下タイミングをずらす。
        const pressAt = spec.sequence ? 10 + i * 12 : 10;
        const d = local - pressAt;
        const pressed = d >= 0 && d < 10;
        return (
          <div
            key={`${key}-${i}`}
            style={{
              minWidth: 54,
              height: 54,
              padding: "0 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 10,
              background: pressed ? theme.accent : "transparent",
              border: `2px solid ${pressed ? theme.accent : theme.panelBorder}`,
              color: pressed ? "#ffffff" : theme.ink,
              fontSize: 26,
              fontWeight: 700,
              transform: `translateY(${pressed ? 3 : 0}px)`,
            }}
          >
            {key}
          </div>
        );
      })}
      {spec.label ? (
        <div style={{ marginLeft: 8, color: theme.inkSoft, fontSize: 24, fontWeight: 700 }}>{spec.label}</div>
      ) : null}
    </div>
  );
};

/** ズーム対象を示す輪。ポインターと同じ位置にだけ出す。 */
export const FocusRing: React.FC<{ x: number; y: number; progress: number; theme: Theme }> = ({
  x,
  y,
  progress,
  theme,
}) => (
  <div
    style={{
      position: "absolute",
      left: x - 52,
      top: y - 52,
      width: 104,
      height: 104,
      borderRadius: 999,
      border: `4px solid ${theme.ring}`,
      opacity: interpolate(progress, [0, 1], [0, 0.92], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }),
      transform: `scale(${interpolate(progress, [0, 1], [0.7, 1.08], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })})`,
      boxShadow: `0 0 0 10px ${theme.ring}1f`,
      zIndex: 35,
    }}
  />
);

/** バージョン表示などの小さなバッジ。 */
export const Badge: React.FC<{ text: string; theme: Theme; style?: React.CSSProperties }> = ({
  text,
  theme,
  style,
}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      padding: "8px 18px",
      borderRadius: 999,
      border: `1px solid ${theme.panelBorder}`,
      background: theme.panel,
      color: theme.inkSoft,
      fontSize: 24,
      fontWeight: 700,
      letterSpacing: 1,
      ...style,
    }}
  >
    {text}
  </div>
);
