import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Pointer as PointerSpec } from "../core/storyboard";
import type { Theme } from "../core/theme";

export type Box = { left: number; top: number; width: number; height: number };

/**
 * 素材側のカーソルは隠し、ここで決定論的にポインターを描く。
 * 移動・クリック波紋・座標はすべて storyboard の同じ数値から動く。
 */
export const Pointer: React.FC<{
  spec: PointerSpec;
  box: Box;
  theme: Theme;
}> = ({ spec, box, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const move = spring({
    frame: Math.max(0, frame - spec.moveStartFrame),
    fps,
    durationInFrames: spec.moveDurationInFrames,
    config: { damping: 200 },
  });
  const x = box.left + interpolate(move, [0, 1], [spec.from.x, spec.to.x]) * box.width;
  const y = box.top + interpolate(move, [0, 1], [spec.from.y, spec.to.y]) * box.height;

  const clickFrames = [
    ...(spec.clickAtFrame === undefined ? [] : [spec.clickAtFrame]),
    ...(spec.extraClickFrames ?? []),
  ];
  // クリックの瞬間だけポインターを少し縮め、押した感じを出す。
  const press = clickFrames.reduce((acc, at) => {
    const d = frame - at;
    if (d < 0 || d > 8) return acc;
    return Math.min(acc, interpolate(d, [0, 3, 8], [1, 0.86, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  }, 1);

  const scale = (spec.scale ?? 1.9) * press;

  return (
    <div style={{ position: "absolute", left: 0, top: 0, zIndex: 40, pointerEvents: "none" }}>
      {clickFrames.map((at) => (
        <Ripple key={at} x={x} y={y} frame={frame - at} color={theme.ring} />
      ))}
      <div
        style={{
          position: "absolute",
          left: x,
          top: y,
          transform: `translate(-6px, -4px) scale(${scale})`,
          transformOrigin: "top left",
          filter: "drop-shadow(0 6px 10px rgba(0,0,0,.55))",
        }}
      >
        <svg width="52" height="68" viewBox="0 0 52 68" fill="none">
          <path
            d="M5 4L7 55L20 44L31 65L40 60L29 40L47 39L5 4Z"
            fill="#ffffff"
            stroke="#0f172a"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <path d="M5 4L7 55L20 44L31 65L40 60L29 40L47 39L5 4Z" fill="#ffffff" />
        </svg>
      </div>
    </div>
  );
};

const Ripple: React.FC<{ x: number; y: number; frame: number; color: string }> = ({ x, y, frame, color }) => {
  if (frame < 0 || frame > 22) return null;
  const grow = interpolate(frame, [0, 16], [0.35, 1.7], { extrapolateRight: "clamp" });
  const fade = interpolate(frame, [0, 4, 16], [0, 0.9, 0], { extrapolateRight: "clamp" });
  const inner = interpolate(frame, [0, 10], [0.2, 1.05], { extrapolateRight: "clamp" });
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: x - 46,
          top: y - 46,
          width: 92,
          height: 92,
          borderRadius: 999,
          border: `4px solid ${color}`,
          opacity: fade,
          transform: `scale(${grow})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: x - 46,
          top: y - 46,
          width: 92,
          height: 92,
          borderRadius: 999,
          background: color,
          opacity: fade * 0.18,
          transform: `scale(${inner})`,
        }}
      />
    </>
  );
};
