// XRift Studio 本体（src/index.css）のブランドトークンに合わせた動画用テーマ。
// 動画側で独自の配色を足さず、ここだけを更新する。

export const brand = {
  50: "#f5f3ff",
  100: "#ede9fe",
  200: "#ddd6fe",
  300: "#c4b5fd",
  400: "#a78bfa",
  500: "#8b5cf6",
  600: "#7c3aed",
  700: "#6d28d9",
  800: "#5b21b6",
  900: "#4c1d95",
} as const;

export const gradientBrand = "linear-gradient(135deg, #7c3aed 0%, #6366f1 60%, #3b82f6 100%)";

export type ThemeName = "dark" | "light";

export type Theme = {
  name: ThemeName;
  bg: string;
  bgDeep: string;
  stage: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  panel: string;
  panelBorder: string;
  accent: string;
  accentSoft: string;
  ring: string;
  shadow: string;
  captionBg: string;
  captionInk: string;
};

export const themes: Record<ThemeName, Theme> = {
  // 画面キャプチャを主役にする既定のテーマ。周囲を落としてスクリーンを浮かせる。
  dark: {
    name: "dark",
    bg: "#0b1020",
    bgDeep: "#060913",
    stage: "#020617",
    ink: "#ffffff",
    inkSoft: "#dbeafe",
    inkFaint: "rgba(226,232,240,.62)",
    panel: "rgba(8,15,32,.92)",
    panelBorder: "rgba(196,181,253,.34)",
    accent: brand[400],
    accentSoft: brand[300],
    ring: "#67e8f9",
    shadow: "0 30px 80px rgba(0,0,0,.46)",
    captionBg: "rgba(8,15,32,.92)",
    captionInk: "#ffffff",
  },
  // 静かな白基調。ドキュメントやガイド寄りの動画で使う。
  light: {
    name: "light",
    bg: "#f8fafc",
    bgDeep: "#eef2f7",
    stage: "#ffffff",
    ink: "#0f172a",
    inkSoft: "#334155",
    inkFaint: "rgba(15,23,42,.55)",
    panel: "rgba(255,255,255,.94)",
    panelBorder: "rgba(15,23,42,.12)",
    accent: brand[600],
    accentSoft: brand[500],
    ring: brand[600],
    shadow: "0 26px 60px rgba(15,23,42,.16)",
    captionBg: "rgba(255,255,255,.95)",
    captionInk: "#0f172a",
  },
};

export const FONT_STACK =
  '"Noto Sans JP", "Yu Gothic UI", "Hiragino Sans", "Meiryo", system-ui, sans-serif';

export const resolveTheme = (name: ThemeName | undefined): Theme => themes[name ?? "dark"];
