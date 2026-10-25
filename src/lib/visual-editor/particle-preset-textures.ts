import manifest from "./particle-textures.manifest.json";
import { normalizeTextureImportSettings, type AssetManifest, type TextureAsset } from "./asset-manifest";
import type { ParticleAuthoringPreset } from "./particle-system";

const PRESET_TEXTURES: Readonly<Record<string, string>> = {
  fire: "flame", torch: "flame", smoke: "smoke", steam: "smoke", mist: "smoke",
  magic: "star", "magic-aura": "star", healing: "star",
  snow: "snowflake", blizzard: "snowflake",
  confetti: "confetti", "confetti-burst": "confetti",
  fountain: "droplet", waterfall: "droplet", splash: "droplet",
  spark: "streak", rain: "streak", fireworks: "streak",
  sakura: "petal", "autumn-leaves": "leaf", bubbles: "bubble",
  firefly: "glow", embers: "glow", pollen: "glow", dust: "glow",
};

export function getParticlePresetTexture(presetId: string) {
  const entry = manifest.find(texture => texture.id === PRESET_TEXTURES[presetId]);
  if (!entry) return undefined;
  return { ...entry, url: `${import.meta.env.BASE_URL}visual-editor/particle-textures/v1/${entry.id}.png` };
}

export function particlePresetTextureSettings() {
  return normalizeTextureImportSettings({
    colorSpace: "srgb", flipY: true, generateMipmaps: true,
    sampler: { wrapS: "clamp-to-edge", wrapT: "clamp-to-edge", magFilter: "linear", minFilter: "linear-mipmap-linear" },
  });
}

/** Save the exact preview PNG before committing the Particle and its dependency. */
export async function prepareParticlePresetTexture(
  assets: AssetManifest,
  preset: ParticleAuthoringPreset,
  options: { textureId: string; folderId?: string | null; writeFile: (relativePath: string, dataUrl: string) => Promise<void> },
): Promise<{ assets: AssetManifest; preset: ParticleAuthoringPreset }> {
  const definition = getParticlePresetTexture(preset.id);
  if (!definition || preset.properties.renderer?.textureAssetId) return { assets, preset };
  const settings = particlePresetTextureSettings();
  let texture = Object.values(assets.assets).find((asset): asset is TextureAsset =>
    asset.kind === "texture" && asset.status === "ready" && asset.source.kind === "project" &&
    asset.sourceHash === definition.sha256 && JSON.stringify(asset.importSettings) === JSON.stringify(settings),
  );
  if (!texture) {
    if (!options.textureId.trim() || assets.assets[options.textureId]) throw new Error("ParticleのテクスチャIDが重複しています");
    const response = await fetch(definition.url);
    if (!response.ok) throw new Error("Particleのテクスチャを読み込めませんでした");
    const bytes = await response.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    if (bytes.byteLength !== definition.byteLength || hash !== definition.sha256) throw new Error("Particleのテクスチャが同梱データと一致しません");
    const relativePath = `assets/particles/${definition.id}-${options.textureId.replace(/[^a-zA-Z0-9_-]/g, "_")}.png`;
    const dataUrl = `data:image/png;base64,${btoa(Array.from(new Uint8Array(bytes), byte => String.fromCharCode(byte)).join(""))}`;
    await options.writeFile(relativePath, dataUrl);
    texture = {
      id: options.textureId, name: `Particle ${definition.name}`, kind: "texture", status: "ready",
      source: { kind: "project", relativePath }, sourceHash: definition.sha256,
      thumbnail: { status: "missing" }, folderId: options.folderId ?? null,
      importSettings: settings,
      importMetadata: { sourceFormat: "png", mimeType: "image/png", byteLength: definition.byteLength, width: definition.width, height: definition.height },
    };
    assets = { ...assets, assets: { ...assets.assets, [texture.id]: texture } };
  }
  return {
    assets,
    preset: { ...preset, properties: { ...preset.properties, renderer: { ...preset.properties.renderer, textureAssetId: texture.id } } },
  };
}
