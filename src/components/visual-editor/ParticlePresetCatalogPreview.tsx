import { useMemo } from "react";
import { XriftScriptParticleEmitter } from "../../../packages/xrift-studio-runtime/src/script/particle";
import {
  normalizeParticleProperties,
  type ParticleAuthoringPreset,
} from "../../lib/visual-editor";
import { CatalogPreviewFrame } from "./CatalogPreviewFrame";

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
}: {
  preset: ParticleAuthoringPreset;
  className?: string;
  /** The larger pane frames wider systems, which the card crop would clip. */
  detail?: boolean;
  live?: boolean;
}) {
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
    return Math.max(2.2, Math.min(9, spread * 0.9 + 1.6));
  }, [config.shape]);

  return (
    <CatalogPreviewFrame
      cacheKey={`particle:${preset.id}`}
      cameraPosition={[distance * 0.55, distance * 0.42, distance]}
      fov={detail ? 42 : 38}
      className={className}
      live={live}
    >
      <color attach="background" args={["#0b1120"]} />
      <ambientLight intensity={0.4} />
      <XriftScriptParticleEmitter config={config} color="#ffffff" opacity={1} />
    </CatalogPreviewFrame>
  );
}
