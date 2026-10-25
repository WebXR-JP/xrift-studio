import { useEffect, useMemo, useState } from "react";
import { TextureLoader, type Texture } from "three";
import { XriftScriptParticleEmitter } from "../../../packages/xrift-studio-runtime/src/script/particle";
import {
  normalizeParticleProperties,
  type ParticleAuthoringPreset,
} from "../../lib/visual-editor";
import { CatalogPreviewFrame, useCatalogPreviewAssetLoad } from "./CatalogPreviewFrame";
import { getParticlePresetTexture, particlePresetTextureSettings } from "../../lib/visual-editor/particle-preset-textures";
import { configureMaterialPreviewTexture } from "./material-texture-preview";
import { createTextureAsset } from "../../lib/visual-editor/asset-manifest";

/**
 * The preset's own simulation, drawn by the same emitter the Scene View and
 * the published world use.
 *
 * Grid cards keep one captured frame; the detail pane runs live. See
 * `CatalogPreviewFrame` for why a card cannot hold a renderer of its own.
 */
export function ParticlePresetCatalogPreview({
  preset,
  className = "h-full w-full",
  detail = false,
  live = false,
  restartKey = 0,
}: {
  preset: ParticleAuthoringPreset;
  className?: string;
  /** The larger pane frames wider systems, which the card crop would clip. */
  detail?: boolean;
  live?: boolean;
  restartKey?: number;
}) {
  const [textureError, setTextureError] = useState(false);
  useEffect(() => setTextureError(false), [preset.id, restartKey]);
  const config = useMemo(
    () => normalizeParticleProperties(preset.properties),
    [preset.properties],
  );

  // Weather presets emit across metres; a campfire lives inside one. Framing
  // them at the same distance would show either a blank card or a wall of
  // particles, so the camera backs off for the wide ones.
  const distance = useMemo(() => {
    const spread =
      config.shape.type === "box"
        ? Math.max(config.shape.size[0], config.shape.size[2])
        : config.shape.type === "sphere"
          ? config.shape.radius * 2
          : 1;
    const burstSpread = config.emission.bursts.length > 0
      ? config.startSpeed.max * Math.min(config.startLifetime.max, 0.9) * 2
      : 0;
    return Math.max(2.2, Math.min(9, Math.max(spread, burstSpread) * 0.9 + 1.6));
  }, [config]);

  if (textureError) return <div role="alert" className={`${className} flex items-center justify-center bg-slate-900 p-3 text-xs text-white`}>Particleのテクスチャを読み込めませんでした</div>;
  return (
    <CatalogPreviewFrame
      cacheKey={`particle-textured-v1:${preset.id}`}
      cameraPosition={[distance * 0.55, distance * 0.42, distance]}
      fov={detail ? 42 : 38}
      className={className}
      live={live}
    >
      <color attach="background" args={["#0b1120"]} />
      <ambientLight intensity={0.4} />
      <TexturedPresetEmitter key={`${preset.id}:${restartKey}`} presetId={preset.id} config={config} onError={setTextureError} />
    </CatalogPreviewFrame>
  );
}

function TexturedPresetEmitter({ presetId, config, onError }: {
  presetId: string;
  config: ReturnType<typeof normalizeParticleProperties>;
  onError: (failed: boolean) => void;
}) {
  const definition = useMemo(() => getParticlePresetTexture(presetId), [presetId]);
  const beginLoad = useCatalogPreviewAssetLoad();
  const [map, setMap] = useState<Texture | null>(null);
  useEffect(() => {
    if (!definition) return;
    let active = true;
    let owned: Texture | undefined;
    const finish = beginLoad();
    new TextureLoader().load(definition.url, texture => {
      if (!active) { texture.dispose(); return; }
      const asset = createTextureAsset({ id: definition.id, name: definition.name,
        source: { kind: "project", relativePath: `assets/particles/${definition.id}.png` },
        importSettings: particlePresetTextureSettings() })!;
      configureMaterialPreviewTexture(texture, asset, { textureAssetId: asset.id, texCoord: 0 }, "srgb", "particle");
      owned = texture;
      setMap(texture);
      finish();
    }, undefined, () => { if (active) { finish(false); onError(true); } });
    return () => { active = false; finish(); owned?.dispose(); };
  }, [definition, beginLoad, onError]);
  if (definition && !map) return null;
  return <XriftScriptParticleEmitter config={config} map={map} color="#ffffff" opacity={1} />;
}
