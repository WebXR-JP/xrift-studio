import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { XriftScriptParticleEmitter } from "../../../packages/xrift-studio-runtime/src/script/particle";
import { XriftTextPanel } from "../../../packages/xrift-studio-runtime/src/script/text-panel";
import type { XriftTextPanelConfig } from "../../../packages/xrift-studio-runtime/src/text-panel-layout";
import {
  BUILTIN_ASSET_IDS,
  BUILTIN_MATERIAL_ASSETS,
  getBuiltinPrimitiveCreation,
  getBuiltinRecipeModel,
  getParticleAuthoringPreset,
  normalizeParticleProperties,
  type SceneRecipe,
  type SceneRecipePart,
} from "../../lib/visual-editor";
import { CatalogPreviewFrame } from "./CatalogPreviewFrame";

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
  live = false,
}: {
  recipe: SceneRecipe;
  className?: string;
  /** The detail pane keeps one long-lived preview and stays in motion. */
  live?: boolean;
}) {
  // A campfire is a metre across and a street light is over three tall.
  // Framing both from a fixed camera shows a speck or a cropped pole, so the
  // camera is derived from the parts the recipe actually places.
  const framing = useMemo(() => recipeFraming(recipe), [recipe]);

  return (
    <CatalogPreviewFrame
      cacheKey={`recipe:${recipe.id}`}
      cameraPosition={framing.cameraPosition}
      lookAtY={framing.lookAtY}
      className={className}
      live={live}
    >
      <color attach="background" args={["#0b1120"]} />
      {/* A set that brings its own light is shown by that light — that is the
          point of a campfire. A set that brings none would otherwise be a dark
          smudge, so the card lights it neutrally. This is the card's lighting,
          not the scene's: what gets placed is unchanged either way. */}
      {recipe.parts.some((part) => part.kind === "light" && !part.startsOff) ? (
        <ambientLight intensity={0.22} />
      ) : (
        <>
          <ambientLight intensity={0.55} />
          <directionalLight position={[2.5, 4, 3]} intensity={1.2} />
        </>
      )}
      {/* A ground plane is what makes a ring of stones read as a ring
          rather than as blocks floating in the dark. */}
      {recipe.preview?.ground === false ? null : (
        <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[8, 8]} />
          <meshStandardMaterial color="#1e293b" metalness={0} roughness={0.95} />
        </mesh>
      )}
      {recipe.parts.map((part, index) => (
        <RecipePartVisual key={`${part.kind}-${index}`} part={part} />
      ))}
    </CatalogPreviewFrame>
  );
}

function RecipePartVisual({ part }: { part: SceneRecipePart }) {
  // A part the set places hidden is not drawn. The card is what the Scene
  // gets, and showing the treasure the switch is supposed to reveal would give
  // away the one thing that set exists to demonstrate.
  if ((part.kind === "primitive" || part.kind === "model") && part.startsDisabled) {
    return null;
  }

  if (part.kind === "primitive") {
    const color = builtinMaterialColor(part.materialAssetId);
    // The glow Material is emissive, and a lamp drawn as a grey ball would
    // misrepresent the one thing the set is for.
    const emissive = part.materialAssetId === BUILTIN_ASSET_IDS.material.glow;
    return (
      <mesh
        position={[...part.position]}
        rotation={[...part.rotation]}
        scale={[...part.scale]}
      >
        <PrimitiveGeometry creationId={part.creationId} />
        <meshStandardMaterial
          color={color}
          emissive={emissive ? color : "#000000"}
          emissiveIntensity={emissive ? 2.4 : 0}
          metalness={0}
          roughness={0.9}
        />
      </mesh>
    );
  }

  if (part.kind === "light") {
    // A Light the set places switched off is drawn switched off. The card is
    // what the Scene gets, and a lamp that looks lit until it is placed would
    // hide the one thing the switch set exists to demonstrate.
    if (part.startsOff) return null;
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

  if (part.kind === "model") {
    return (
      <group position={[...part.position]} rotation={[...part.rotation]} scale={[...part.scale]}>
        <RecipeModelVisual modelId={part.modelId} />
      </group>
    );
  }

  if (part.kind === "text") {
    return <RecipeTextVisual part={part} />;
  }

  // An Audio Source has nothing to draw. The card says what a set contains in
  // its contents list, and inventing a speaker icon in 3D would put a shape in
  // the card that the Scene never gets.
  if (part.kind === "audio") return null;

  return <RecipeParticleVisual part={part} />;
}

/**
 * Draws a sign through the runtime's own text object, so the card typesets it
 * exactly as Play and the published world do.
 */
function RecipeTextVisual({
  part,
}: {
  part: Extract<SceneRecipePart, { kind: "text" }>;
}) {
  const config = useMemo<XriftTextPanelConfig>(
    () => ({
      text: part.text,
      color: part.color ?? "#ffffff",
      fontSize: part.fontSize,
      ...(part.maxWidth === undefined ? {} : { maxWidth: part.maxWidth }),
      anchorX: "center",
      anchorY: "middle",
      outlineWidth: 0,
      outlineColor: "#000000",
    }),
    [part.color, part.fontSize, part.maxWidth, part.text],
  );
  return (
    <group position={[...part.position]} rotation={[...part.rotation]}>
      <XriftTextPanel config={config} />
    </group>
  );
}

/**
 * Loads a bundled recipe GLB straight from its public path. The card shows
 * placements before the current project has imported the Model Asset, so
 * this cannot go through project storage the way `ProjectModelVisual` does --
 * same `GLTFLoader` class, same real-rendering rule (AGENT.md), different
 * source.
 */
function RecipeModelVisual({ modelId }: { modelId: string }) {
  const [object, setObject] = useState<THREE.Object3D | null>(null);

  useEffect(() => {
    const definition = getBuiltinRecipeModel(modelId);
    if (!definition) return;
    let cancelled = false;
    const loader = new GLTFLoader();
    loader.load(
      definition.publicPath,
      (gltf) => {
        if (!cancelled) setObject(gltf.scene);
      },
      undefined,
      () => {
        if (!cancelled) setObject(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [modelId]);

  if (!object) return null;
  return <primitive object={object} />;
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

/**
 * The geometry the placement will create, at the same unit size the builtin
 * primitives use, so a scale in the recipe means the same thing here.
 */
function PrimitiveGeometry({ creationId }: { creationId: string }) {
  const primitive = getBuiltinPrimitiveCreation(creationId)?.primitive;
  if (primitive === "sphere") return <sphereGeometry args={[1, 24, 18]} />;
  if (primitive === "cylinder") return <cylinderGeometry args={[1, 1, 1, 20]} />;
  if (primitive === "cone") return <coneGeometry args={[1, 1, 20]} />;
  if (primitive === "plane") return <planeGeometry args={[1, 1]} />;
  return <boxGeometry args={[1, 1, 1]} />;
}

/**
 * A camera that fits the recipe.
 *
 * Bounds come from the parts themselves rather than a number typed per recipe,
 * so a set that grows a taller piece stays framed without anyone remembering
 * to retune the card.
 */
function recipeFraming(recipe: SceneRecipe): {
  cameraPosition: [number, number, number];
  lookAtY: number;
} {
  if (recipe.preview) {
    const [x, y, z] = recipe.preview.cameraPosition;
    return { cameraPosition: [x, y, z], lookAtY: recipe.preview.lookAtY };
  }
  let maxY = 0.6;
  let maxRadius = 0.6;
  for (const part of recipe.parts) {
    const [x, y, z] = part.position;
    const half =
      part.kind === "primitive"
        ? Math.max(part.scale[0], part.scale[1], part.scale[2]) / 2
        : part.kind === "model"
          ? (getBuiltinRecipeModel(part.modelId)?.approxRadius ?? 0.5) *
            Math.max(part.scale[0], part.scale[1], part.scale[2])
          : 0.2;
    maxY = Math.max(maxY, y + half);
    maxRadius = Math.max(maxRadius, Math.hypot(x, z) + half);
  }
  // Enough distance to hold the taller of "how wide" and "how tall", with the
  // eye a little above the middle so the ground plane stays readable.
  const distance = Math.max(2.2, maxRadius * 2.4 + maxY * 0.9);
  return {
    cameraPosition: [distance * 0.55, maxY * 0.75 + 0.5, distance * 0.8],
    lookAtY: maxY * 0.45,
  };
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
