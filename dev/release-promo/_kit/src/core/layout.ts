export type Box = { left: number; top: number; width: number; height: number };
export type Anchor = { x: number; y: number };

/** 縦型で素材を拡大する倍率。画面内の文字が読める大きさを優先する。 */
export const PORTRAIT_ZOOM = 1.62;

/**
 * 画面キャプチャを置く枠を決める。
 *
 * 横型は、上のラベルと下の字幕の場所を残して素材全体を入れる。
 * 縦型は 16:9 をそのまま入れると画面内の文字が読めないため、拡大して
 * 注目点を中央へ寄せる。枠が画面をはみ出す分は書き出し時に切り取られる。
 */
export const stageBox = (
  width: number,
  height: number,
  sourceAspect = 16 / 9,
  anchor: Anchor = { x: 0.5, y: 0.5 },
): Box => {
  const portrait = height > width;

  if (portrait) {
    const padTop = height * 0.16;
    const padBottom = height * 0.2;
    const w = width * PORTRAIT_ZOOM;
    const h = w / sourceAspect;

    // 注目点を中央へ寄せる。素材の端が来たらそれ以上は動かさない。
    const left = clamp(width / 2 - anchor.x * w, width - w, 0);
    const band = height - padTop - padBottom;
    const top =
      h >= band
        ? clamp(height * 0.44 - anchor.y * h, height - padBottom - h, padTop)
        : padTop + (band - h) / 2;

    return { left, top, width: w, height: h };
  }

  const padX = width * 0.05;
  const padTop = height * 0.1;
  const padBottom = height * 0.155;
  const availableWidth = width - padX * 2;
  const availableHeight = height - padTop - padBottom;

  let w = availableWidth;
  let h = w / sourceAspect;
  if (h > availableHeight) {
    h = availableHeight;
    w = h * sourceAspect;
  }

  return {
    left: (width - w) / 2,
    top: padTop + (availableHeight - h) / 2,
    width: w,
    height: h,
  };
};

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, Math.min(lo, hi)), Math.max(lo, hi));

/** 0〜1 の素材座標を、画面上の絶対座標へ変換する。 */
export const toStagePoint = (box: Box, x: number, y: number) => ({
  x: box.left + x * box.width,
  y: box.top + y * box.height,
});

/** シーンの注目点。ズーム指定があればそこ、なければポインターの着地点を使う。 */
export const sceneAnchor = (scene: {
  focus?: { x: number; y: number };
  pointer?: { to: { x: number; y: number } };
  callouts?: { x: number; y: number }[];
}): Anchor => {
  if (scene.focus) return { x: scene.focus.x, y: scene.focus.y };
  if (scene.pointer) return { x: scene.pointer.to.x, y: scene.pointer.to.y };
  const first = scene.callouts?.[0];
  if (first) return { x: first.x, y: first.y };
  return { x: 0.5, y: 0.5 };
};
