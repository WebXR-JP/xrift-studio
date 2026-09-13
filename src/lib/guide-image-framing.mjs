// Display a detail from an unmodified 1280 × 800 Tauri capture.
// The original image remains available through the browser guide's image link.
const frames = {
  "セットアップ": [410, 270, 460, 390],
  "追加メニュー": [68, 84, 302, 540],
  "Transform": [1004, 120, 254, 180],
  "マテリアルの割り当て": [1004, 500, 254, 112],
  "Base Color": [1004, 352, 254, 280],
  "Metallic / Roughness": [1004, 384, 254, 350],
  "Ambient Light": [1004, 386, 254, 164],
};

export function guideImageFraming(title) {
  const frame = Object.hasOwn(frames, title ?? "") ? frames[title] : undefined;
  if (!frame) return {};
  const [x, y, width, height] = frame;
  return {
    frame: {
      display: "block", position: "relative", overflow: "hidden",
      width: "100%", maxWidth: title === "セットアップ" ? 560 : 400, aspectRatio: `${width} / ${height}`,
      marginInline: "auto", borderRadius: 8,
    },
    image: {
      position: "absolute", width: `${1280 / width * 100}%`, maxWidth: "none",
      height: "auto", left: `${-x / width * 100}%`, top: `${-y / height * 100}%`,
      margin: 0, border: 0, borderRadius: 0,
    },
  };
}
