// XRift Studio リリース動画キット。
// 各動画プロジェクトはここからだけ読み込み、シーンの実装を作り直さない。

export { Promo, resolveBpm, resolveDurationInFrames } from "./Promo";
export type { PromoProps } from "./Promo";

export * from "./core/storyboard";
export * from "./core/timing";
export * from "./core/theme";
export * from "./core/layout";

export { PromoAudio, deriveSfxCues, SFX_GAIN } from "./audio/PromoAudio";
export type { ResolvedCue } from "./audio/PromoAudio";

export { Backdrop } from "./stage/Backdrop";
export { ScreenStage, SourceMedia } from "./stage/ScreenStage";
export { Pointer } from "./overlays/Pointer";
export type { Box as PointerBox } from "./overlays/Pointer";
export { Badge, Callout, Caption, FocusRing, KeyCaps, SceneLabel } from "./overlays/Annotations";
export { BulletsCard, EndCard, FeatureCard, TitleCard } from "./scenes/Cards";
export { CompareSceneView, ScreenSceneView } from "./scenes/Screens";
