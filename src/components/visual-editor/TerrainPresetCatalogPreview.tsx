import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BufferGeometry, DoubleSide, Float32BufferAttribute } from "three";
import {
  STILL_WIND,
  createTerrainFromPreset,
  createTerrainMeshBuffers,
  resolveSceneWind,
  type ResolvedWind,
  type TerrainGeometry,
  type TerrainPreset,
} from "../../lib/visual-editor";
import { TerrainGrassVisual } from "./TerrainGrassVisual";

/**
 * A card is a few hundred pixels tall, so the editor's blade limit would cost
 * a great deal to say something the viewer cannot see. This is a preview cap,
 * not the Terrain's own.
 */
const PREVIEW_GRASS_INSTANCES = 2500;

/**
 * Renders a Terrain preset from the real height field and the real grass
 * placement, so the card shows the Terrain the author is about to receive
 * rather than a picture of one.
 */
export function TerrainPresetCatalogPreview({
  preset,
  className = "h-full w-full",
  animated = false,
}: {
  preset: TerrainPreset;
  className?: string;
  animated?: boolean;
}) {
  const terrain = useMemo(() => createTerrainFromPreset(preset), [preset]);
  // A still card should not look becalmed, so the grass sits leaning rather
  // than upright; only the selected preset actually animates.
  const wind = useMemo<ResolvedWind>(
    () =>
      animated
        ? resolveSceneWind({
            enabled: true,
            windStrength: 0.1,
            windSpeed: 0.9,
            gustStrength: 0.3,
            windDirectionDegrees: 35,
          })
        : { ...STILL_WIND, direction: [0.82, 0.57] },
    [animated],
  );
  const span = Math.max(terrain.width, terrain.depth);

  return (
    <div
      className={`relative overflow-hidden bg-slate-900 ${className}`}
      data-terrain-preset-preview={preset.id}
    >
      <Canvas
        frameloop={animated ? "always" : "demand"}
        dpr={[1, 1.5]}
        camera={{
          position: [span * 0.42, span * 0.3, span * 0.52],
          fov: 38,
          near: 0.5,
          far: span * 4,
        }}
        gl={{ antialias: true, alpha: false }}
        onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
      >
        <color attach="background" args={["#93b7d8"]} />
        <hemisphereLight args={["#cfe4f5", "#3d4a33", 1.1]} />
        <directionalLight
          position={[span, span * 0.9, span * 0.6]}
          intensity={2.1}
        />
        <TerrainPresetSurface terrain={terrain} wind={wind} />
      </Canvas>
    </div>
  );
}

function TerrainPresetSurface({
  terrain,
  wind,
}: {
  terrain: TerrainGeometry;
  wind: ResolvedWind;
}) {
  const geometry = useMemo(() => {
    const buffers = createTerrainMeshBuffers(terrain);
    const next = new BufferGeometry();
    next.setAttribute(
      "position",
      new Float32BufferAttribute(buffers.positions, 3),
    );
    next.setIndex([...buffers.indices]);
    next.computeVertexNormals();
    return next;
  }, [terrain]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <group>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color="#6b8e4e"
          roughness={0.95}
          side={DoubleSide}
        />
      </mesh>
      {(terrain.grass ?? []).map((layer) => (
        <TerrainGrassVisual
          key={layer.id}
          terrain={terrain}
          layer={layer}
          wind={wind}
          maxInstances={PREVIEW_GRASS_INSTANCES}
        />
      ))}
    </group>
  );
}
