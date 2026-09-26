import { normalizeTextureImportSettings, type TextureAsset } from "./asset-manifest";
import { createPrototypeProject } from "./prototype-project";
import { DEFAULT_SCENE_SETTINGS } from "./scene-settings";
import { estimateTextureBytes, estimateWorldVram } from "./vram-estimate";

export function runVramEstimateFixtureAssertions(): void {
  const texture: TextureAsset = {
    id: "vram-current-image",
    name: "Current image",
    kind: "texture",
    status: "ready",
    source: { kind: "project", relativePath: "assets/image.png" },
    sourceHash: "a".repeat(64),
    thumbnail: { status: "missing" },
    importMetadata: {
      sourceFormat: "png",
      mimeType: "image/png",
      width: 4096,
      height: 2048,
      byteLength: 1024 * 1024,
    },
    importSettings: normalizeTextureImportSettings({
      resize: { mode: "max-size", maxSize: 1024 },
      compression: { format: "ktx2" },
      generateMipmaps: false,
    }),
  };
  const before = JSON.stringify(texture);
  const current = estimateTextureBytes(texture);
  assert(current.bytes === 4096 * 2048 * 4,
    "Pending resize and KTX2 settings must not reduce current PNG VRAM estimates");
  assert(current.detail.includes("4096 × 2048") && !current.detail.includes("KTX2"),
    "Texture details must describe the currently loaded source image");

  const bundle = createPrototypeProject("world", "Current texture estimate");
  bundle.assets.assets[texture.id] = texture;
  bundle.scene.settings = {
    ...DEFAULT_SCENE_SETTINGS,
    skybox: { ...DEFAULT_SCENE_SETTINGS.skybox, imageAssetId: texture.id },
  };
  const estimate = estimateWorldVram(bundle);
  const load = estimate.loadContributions.find((entry) => entry.assetId === texture.id);
  assert(load?.estimatedBytes === texture.importMetadata!.byteLength &&
    load.detail === "PNG / 使用中の画像",
  "Publication load estimate must describe the source bytes without pending conversion promises");
  assert(estimate.recommendations.some((entry) => entry.id === `ktx2:${texture.id}`),
    "A pending KTX2 recipe must not hide an available explicit compression recommendation");
  assert(estimate.recommendations.some((entry) => entry.id === `resize:${texture.id}`),
    "A pending resize recipe must not hide the current oversized image");
  assert(JSON.stringify(texture) === before, "Estimates must not apply pending image settings");

  const applied: TextureAsset = {
    ...texture,
    source: { kind: "project", relativePath: "assets/.optimized/image.ktx2" },
    importMetadata: {
      ...texture.importMetadata!, sourceFormat: "ktx2", mimeType: "image/ktx2",
      width: 1024, height: 512,
    },
    importSettings: normalizeTextureImportSettings({ generateMipmaps: false }),
  };
  assert(estimateTextureBytes(applied).bytes === 1024 * 512,
    "Applied KTX2 must use the compressed source dimensions in the estimate");
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
