import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { BulletsScene, EndScene, FeatureScene, TitleScene } from "../core/storyboard";
import type { Theme } from "../core/theme";
import { gradientBrand } from "../core/theme";
import { SourceMedia } from "../stage/ScreenStage";
import { Badge } from "../overlays/Annotations";

/** シリーズ見出し。先頭2秒でアップデート動画だと分かるようにする。 */
export const TitleCard: React.FC<{ scene: TitleScene; theme: Theme }> = ({ scene, theme }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  // 6フレーム目で着地させ、同じ位置に置く効果音と合わせる。
  const land = spring({ frame, fps, durationInFrames: 12, config: { damping: 190 } });
  const shock = interpolate(frame, [6, 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lineWidth = interpolate(land, [0, 1], [0, width * 0.16]);

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          position: "absolute",
          width: width * 0.5,
          height: width * 0.5,
          borderRadius: 999,
          border: `2px solid ${theme.accent}`,
          opacity: (1 - shock) * 0.5,
          transform: `scale(${interpolate(shock, [0, 1], [0.35, 1.15])})`,
        }}
      />
      <div
        style={{
          color: theme.accentSoft,
          fontSize: 32,
          fontWeight: 700,
          letterSpacing: 5,
          opacity: land,
        }}
      >
        {scene.eyebrow ?? "XRIFT STUDIO"}
      </div>
      <div
        style={{
          marginTop: 24,
          color: theme.ink,
          fontSize: 82,
          fontWeight: 700,
          letterSpacing: 1,
          opacity: land,
          transform: `scale(${interpolate(land, [0, 1], [1.08, 1])})`,
        }}
      >
        {scene.title ?? "XRift Studio アップデート情報"}
      </div>
      <div
        style={{
          width: lineWidth,
          height: 6,
          marginTop: 34,
          borderRadius: 999,
          background: gradientBrand,
        }}
      />
      {scene.version ? (
        <Badge text={`バージョン ${scene.version}`} theme={theme} style={{ marginTop: 34, opacity: land }} />
      ) : null}
    </AbsoluteFill>
  );
};

/** 更新の紹介。1行目に変わったこと、2行目に利用者にとっての変化を置く。 */
export const FeatureCard: React.FC<{ scene: FeatureScene; theme: Theme }> = ({ scene, theme }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const line1 = spring({ frame: Math.max(0, frame - 8), fps, config: { damping: 190 } });
  const line2 = spring({ frame: Math.max(0, frame - 20), fps, config: { damping: 190 } });

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {scene.background ? (
        <div style={{ position: "absolute", inset: -40, filter: "blur(10px)", opacity: 0.32 }}>
          <SourceMedia source={scene.background} />
        </div>
      ) : null}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            theme.name === "dark"
              ? `linear-gradient(90deg, ${theme.bg}f5 0%, ${theme.bg}d6 56%, ${theme.bg}70 100%)`
              : `linear-gradient(90deg, ${theme.bg}f7 0%, ${theme.bg}e0 56%, ${theme.bg}80 100%)`,
        }}
      />
      <div style={{ position: "absolute", left: width * 0.085, top: height * 0.2 }}>
        <div style={{ color: theme.accentSoft, fontSize: 28, fontWeight: 700, letterSpacing: 2.5 }}>
          {scene.eyebrow ?? "今回のアップデート"}
        </div>
        <div
          style={{
            marginTop: 40,
            maxWidth: width * 0.74,
            color: theme.ink,
            fontSize: 72,
            fontWeight: 700,
            lineHeight: 1.28,
            opacity: line1,
            transform: `translateY(${interpolate(line1, [0, 1], [22, 0])}px)`,
          }}
        >
          {scene.headline}
        </div>
        <div
          style={{
            marginTop: 26,
            maxWidth: width * 0.7,
            color: theme.inkSoft,
            fontSize: 46,
            fontWeight: 700,
            lineHeight: 1.34,
            opacity: line2,
            transform: `translateY(${interpolate(line2, [0, 1], [18, 0])}px)`,
          }}
        >
          {scene.subhead}
        </div>
        <div
          style={{
            marginTop: 44,
            width: interpolate(line2, [0, 1], [0, 200]),
            height: 6,
            borderRadius: 999,
            background: gradientBrand,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

/** 変化の整理。2〜4項目まで。1画面の文字量を増やしすぎない。 */
export const BulletsCard: React.FC<{ scene: BulletsScene; theme: Theme }> = ({ scene, theme }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const heading = spring({ frame, fps, config: { damping: 200 } });

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {scene.background ? (
        <div style={{ position: "absolute", inset: -40, filter: "blur(14px)", opacity: 0.22 }}>
          <SourceMedia source={scene.background} />
        </div>
      ) : null}
      <div style={{ position: "absolute", inset: 0, background: `${theme.bg}e8` }} />
      <div style={{ position: "absolute", left: width * 0.085, top: height * 0.22, width: width * 0.8 }}>
        <div
          style={{
            color: theme.ink,
            fontSize: 58,
            fontWeight: 700,
            opacity: heading,
            transform: `translateY(${interpolate(heading, [0, 1], [16, 0])}px)`,
          }}
        >
          {scene.heading}
        </div>
        <div style={{ marginTop: 46, display: "flex", flexDirection: "column", gap: 26 }}>
          {scene.items.map((item, i) => {
            // 出現タイミングは効果音の自動付与（12 + i*14）と合わせる。
            const reveal = spring({ frame: Math.max(0, frame - (12 + i * 14)), fps, config: { damping: 200 } });
            return (
              <div
                key={item}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 22,
                  opacity: reveal,
                  transform: `translateX(${interpolate(reveal, [0, 1], [-22, 0])}px)`,
                }}
              >
                <div style={{ width: 14, height: 14, borderRadius: 999, background: theme.accent }} />
                <div style={{ color: theme.inkSoft, fontSize: 40, fontWeight: 700 }}>{item}</div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** 締め。公開済みを既定にし、次の一手を残す。 */
export const EndCard: React.FC<{
  scene: EndScene;
  theme: Theme;
  releaseStatus: "published" | "upcoming";
}> = ({ scene, theme, releaseStatus }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const reveal = spring({ frame, fps, config: { damping: 200 } });
  const glow = interpolate(reveal, [0, 1], [0.3, 1]);
  const status = releaseStatus === "published" ? "アップデート公開中" : "アップデート公開予定";

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          width: width * 0.62,
          height: width * 0.62,
          borderRadius: 999,
          background: `radial-gradient(circle, ${theme.accent}5c, transparent 66%)`,
          opacity: glow,
        }}
      />
      <div
        style={{
          position: "relative",
          color: theme.accentSoft,
          fontSize: 30,
          fontWeight: 700,
          letterSpacing: 4,
          opacity: reveal,
        }}
      >
        XRIFT STUDIO
      </div>
      <div
        style={{
          position: "relative",
          marginTop: 26,
          color: theme.ink,
          fontSize: 74,
          fontWeight: 700,
          opacity: reveal,
          transform: `scale(${interpolate(reveal, [0, 1], [0.94, 1])})`,
        }}
      >
        {status}
      </div>
      <div
        style={{
          position: "relative",
          marginTop: 28,
          color: theme.inkSoft,
          fontSize: 34,
          fontWeight: 700,
          opacity: reveal,
        }}
      >
        {scene.featureLabel}
      </div>
      {scene.version ? (
        <Badge text={`バージョン ${scene.version}`} theme={theme} style={{ marginTop: 30, opacity: reveal }} />
      ) : null}
      {scene.note ? (
        <div
          style={{
            position: "relative",
            marginTop: 26,
            color: theme.inkFaint,
            fontSize: 26,
            fontWeight: 700,
            opacity: reveal,
          }}
        >
          {scene.note}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
