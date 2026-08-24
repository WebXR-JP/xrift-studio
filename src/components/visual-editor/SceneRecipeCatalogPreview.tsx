import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import { XriftScriptParticleEmitter } from "../../../packages/xrift-studio-runtime/src/script/particle";
import {
  BUILTIN_MATERIAL_ASSETS,
  getParticleAuthoringPreset,
  normalizeParticleProperties,
  type SceneRecipe,
  type SceneRecipePart,
} from "../../lib/visual-editor";

/**
 * Builds the card from the recipe's own parts.
 *
 * Same stones, same particle presets, same light values the placement uses, so
 * the card cannot promise an arrangement the Scene does not get. A hand-drawn
 * illustration would drift the first time a stone moves.
 */
export function SceneRecipeCatalogPreview({
  recipe,
  className = "h-full w-full",
}: {
  recipe: SceneRecipe;
  className?: string;
}) {
  return (
    <div className={className}>
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [1.5, 1.05, 1.9], fov: 42 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#0b1120"]} />
        <ambientLight intensity={0.22} />
        {/* A ground plane is what makes a ring of stones read as a ring
            rather than as blocks floating in the dark. */}
        <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[8, 8]} />
          <meshStandardMaterial color="#1e293b" metalness={0} roughness={0.95} />
        </mesh>
        {recipe.parts.map((part, index) => (
          <RecipePartVisual key={`${part.kind}-${index}`} part={part} />
        ))}
      </Canvas>
    </div>
  );
}

function RecipePartVisual({ part }: { part: SceneRecipePart }) {
  if (part.kind === "primitive") {
    return (
      <mesh
        position={[...part.position]}
        rotation={[...part.rotation]}
        scale={[...part.scale]}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color={builtinMaterialColor(part.materialAssetId)}
          metalness={0}
          roughness={0.9}
        />
      </mesh>
    );
  }

  if (part.kind === "light") {
    return (
      <pointLight
        position={[...part.position]}
        color={part.light.color}
        intensity={part.light.intensity}
        distance={part.light.distance}
        decay={part.light.decay}
      />
    );
  }

  return <RecipeParticleVisual part={part} />;
}

function RecipeParticleVisual({
  part,
}: {
  part: Extract<SceneRecipePart, { kind: "particle" }>;
}) {
  const config = useMemo(() => {
    const preset = getParticleAuthoringPreset(part.presetId);
    if (!preset) return null;
    return normalizeParticleProperties({
      ...preset.properties,
      ...(part.overrides ?? {}),
    });
  }, [part.overrides, part.presetId]);
  if (!config) return null;
  return (
    <group position={[...part.position]}>
      <XriftScriptParticleEmitter config={config} color="#ffffff" opacity={1} />
    </group>
  );
}

/** The Material the placement will actually assign, read from one place. */
function builtinMaterialColor(materialAssetId: string): string {
  const material = BUILTIN_MATERIAL_ASSETS.find(
    (candidate) => candidate.id === materialAssetId,
  );
  const factor = material?.properties.pbrMetallicRoughness?.baseColorFactor;
  if (!factor) return "#94a3b8";
  const channel = (value: number) =>
    Math.round(Math.min(1, Math.max(0, value)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(factor[0])}${channel(factor[1])}${channel(factor[2])}`;
}
