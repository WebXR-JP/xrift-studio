import { Canvas } from "@react-three/fiber";
import { DoubleSide, FrontSide } from "three";
import { useMemo } from "react";
import {
  DEFAULT_SCENE_SETTINGS,
  glowEmissiveStrength,
  type GlowFixtureShape,
  type GlowMaterialPreset,
} from "../../lib/visual-editor";
import { ScenePostprocessing } from "./ScenePostprocessing";

/**
 * Renders a glow fixture as the shape the author is about to place, through
 * the scene's own compositor.
 *
 * The halo is the product here, and it exists only because Bloom runs. Drawing
 * the card any other way — a swatch, a CSS shadow — would advertise something
 * the Material does not do on its own.
 */
export function GlowMaterialCatalogPreview({
  preset,
  shape,
  className = "h-full w-full",
  bloom = false,
}: {
  preset: GlowMaterialPreset;
  /** Geometry and proportions of the fixture being previewed. */
  shape: GlowFixtureShape;
  className?: string;
  /**
   * Mounts the scene compositor.
   *
   * Each compositor allocates a half-float target plus an SSAO and a bloom
   * pass, and one per card exhausted the GPU: the editor viewport started
   * losing its WebGL context while the shelf was open. Only the detail pane
   * carries it, and the cards render the same Material without the halo.
   */
  bloom?: boolean;
}) {
  const emissiveStrength = useMemo(
    () => glowEmissiveStrength(preset.tint),
    [preset.tint],
  );
  // The card shows what the preset looks like when it works, so post effects
  // are on here regardless of the scene's own setting.
  const postprocessing = useMemo(
    () => ({
      ...DEFAULT_SCENE_SETTINGS.postprocessing,
      enabled: true,
      // SSAO costs a full pass and contributes nothing to a single cube on an
      // empty background.
      ao: { ...DEFAULT_SCENE_SETTINGS.postprocessing.ao, enabled: false },
    }),
    [],
  );

  return (
    <div className={className}>
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [1.9, 1.4, 2.2], fov: 40 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#0b1120"]} />
        <ambientLight intensity={0.25} />
        <directionalLight position={[3, 5, 2]} intensity={0.4} />
        <mesh scale={[...shape.previewScale]}>
          <FixtureGeometry preview={shape.preview} />
          <meshStandardMaterial
            side={shape.preview === "plane" ? DoubleSide : FrontSide}
            color={preset.tint}
            emissive={preset.tint}
            emissiveIntensity={emissiveStrength}
            metalness={0}
            roughness={1}
          />
        </mesh>
        {/* A floor is what makes the halo legible as light rather than as a
            bright square. */}
        <mesh position={[0, -0.85, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[8, 8]} />
          <meshStandardMaterial color="#1e293b" metalness={0} roughness={0.9} />
        </mesh>
        {bloom ? <ScenePostprocessing settings={postprocessing} /> : null}
      </Canvas>
    </div>
  );
}

/** Matches the primitive the creation places, so the card is not a stand-in. */
function FixtureGeometry({ preview }: { preview: GlowFixtureShape["preview"] }) {
  if (preview === "plane") return <planeGeometry args={[1, 1]} />;
  if (preview === "cylinder") return <cylinderGeometry args={[1, 1, 1, 24]} />;
  if (preview === "sphere") return <sphereGeometry args={[1, 32, 24]} />;
  return <boxGeometry args={[1, 1, 1]} />;
}