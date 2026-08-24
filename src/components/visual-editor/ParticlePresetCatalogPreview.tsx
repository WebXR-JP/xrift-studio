import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import { XriftScriptParticleEmitter } from "../../../packages/xrift-studio-runtime/src/script/particle";
import {
  normalizeParticleProperties,
  type ParticleAuthoringPreset,
} from "../../lib/visual-editor";

/**
 * Runs the preset's own simulation on the card.
 *
 * The same emitter the Scene View and the published world use, given the same
 * properties, so what moves here is what lands. A still image or a CSS
 * approximation would be the one thing a particle card cannot afford to be:
 * a particle is motion, and its timing is most of the choice being made.
 */
export function ParticlePresetCatalogPreview({
  preset,
  className = "h-full w-full",
  detail = false,
}: {
  preset: ParticleAuthoringPreset;
  className?: string;
  /** The larger pane frames wider systems, which the card crop would clip. */
  detail?: boolean;
}) {
  const config = useMemo(
    () => normalizeParticleProperties(preset.properties),
    [preset.properties],
  );

  // Weather presets emit across metres; a campfire lives inside one. Framing
  // them at the same distance would show either a blank card or a wall of
  // particles, so the camera backs off for the wide ones.
  const spread = useMemo(() => {
    if (config.shape.type === "box") {
      return Math.max(config.shape.size[0], config.shape.size[2]);
    }
    if (config.shape.type === "sphere") return config.shape.radius * 2;
    return 1;
  }, [config.shape]);
  const distance = Math.max(2.2, Math.min(9, spread * 0.9 + 1.6));

  return (
    <div className={className}>
      <Canvas
        dpr={[1, 1.5]}
        camera={{
          position: [distance * 0.55, distance * 0.42, distance],
          fov: detail ? 42 : 38,
        }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#0b1120"]} />
        <ambientLight intensity={0.4} />
        <XriftScriptParticleEmitter
          config={config}
          color="#ffffff"
          opacity={1}
        />
      </Canvas>
    </div>
  );
}
