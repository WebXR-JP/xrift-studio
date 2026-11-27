import { WorldAssetCatalogPreview } from "./WorldAssetCatalogPreview";
import { catalogPublicAssetUrl } from "../../lib/visual-editor/catalog-public-url";
import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { getCatalogMaterialProperties, useCatalogMaterial } from "./useCatalogMaterial";
import { getCatalogShaderMaterial, useCatalogShaderMaterials } from "./useCatalogShaderMaterials";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { XriftScriptParticleEmitter } from "../../../packages/xrift-studio-runtime/src/script/particle";
import { XriftTextPanel } from "../../../packages/xrift-studio-runtime/src/script/text-panel";
import type { XriftTextPanelConfig } from "../../../packages/xrift-studio-runtime/src/text-panel-layout";
import {
  getBuiltinPrimitiveCreation,
  getBuiltinRecipeModel,
  getParticleAuthoringPreset,
  normalizeParticleProperties,
  type SceneRecipe,
  type SceneRecipePart,
} from "../../lib/visual-editor";
import { CatalogPreviewFrame, useCatalogPreviewAssetLoad } from "./CatalogPreviewFrame";
import { disposeCatalogModel } from "./dispose-catalog-model";
import { attachMToonOutlines, updateMToonMaterials } from "../../../packages/xrift-studio-runtime/src/mtoon-material";
import type { ResolvedSceneLighting } from "../../lib/visual-editor/lighting-contract";
import { DEFAULT_SCENE_SETTINGS } from "../../lib/visual-editor/scene-settings";
import { resolveSceneWind, type ResolvedWind } from "../../lib/visual-editor/wind-contract";

/**
 * What a Custom Shader on a card is lit and blown by: the card's own neutral
 * light (the directional and ambient lights below, for a set that brings no
 * light of its own) and the wind a new Scene starts with.
 */
const CARD_LIGHT_DIRECTION = new THREE.Vector3(2.5, 4, 3).normalize();
const CARD_LIGHTING: ResolvedSceneLighting = {
  sunDirection: [CARD_LIGHT_DIRECTION.x, CARD_LIGHT_DIRECTION.y, CARD_LIGHT_DIRECTION.z],
  sunColor: [1, 1, 1],
  sunIntensity: 1.2,
  ambientColor: [1, 1, 1],
  ambientIntensity: 0.55,
};
const CARD_WIND: ResolvedWind = resolveSceneWind(DEFAULT_SCENE_SETTINGS.vegetation, undefined);

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
  const hasMToon = useMemo(
    () => recipe.parts.some((part) =>
      (part.kind === "model" || part.kind === "primitive") &&
      getCatalogMaterialProperties(part.materialAssetId)?.extensions.VRMC_materials_mtoon !== undefined),
    [recipe],
  );

  if (recipe.assembly === "vehicle") return <WorldAssetCatalogPreview kind="vehicle" className={className} />;

  return (
    <CatalogPreviewFrame
      key={recipe.id}
      cacheKey={`${hasMToon ? "recipe-studio-mtoon-directional-v1" : "recipe-studio-v2"}:${recipe.id}:${recipe.parts
        .filter((part) => part.kind === "model")
        .map((part) => getBuiltinRecipeModel(part.modelId)?.sha256.slice(0, 12) ?? part.modelId)
        .join(":")}`}
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
      {recipe.category === "material" || recipe.category === "tutorial" ? (
        <>
          <StudioEnvironment />
          <ambientLight intensity={hasMToon ? 0.08 : 0.65} />
          <directionalLight position={hasMToon ? [-3, 3, 0.75] : [0, 4, 3]} intensity={hasMToon ? 1.5 : 2.2} />
          {!hasMToon ? <directionalLight position={[0, 2, -3]} intensity={0.8} /> : null}
        </>
      ) : recipe.parts.some((part) => part.kind === "light" && !part.startsOff) ? (
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
      {live ? <OrbitControls target={[0, framing.lookAtY, 0]} enablePan={false}
        minDistance={1.4} maxDistance={12} minPolarAngle={0.25} maxPolarAngle={Math.PI * 0.85} /> : null}
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
    return (
      <mesh
        position={[...part.position]}
        rotation={[...part.rotation]}
        scale={[...part.scale]}
      >
        <PrimitiveGeometry creationId={part.creationId} />
        <RecipePrimitiveMaterial materialAssetId={part.materialAssetId} />
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
        <RecipeModelVisual modelId={part.modelId} materialAssetId={part.materialAssetId} />
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
function RecipeModelVisual({ modelId, materialAssetId }: { modelId: string; materialAssetId?: string }) {
  // A Custom Shader Material is built per mesh, the way the Scene View builds
  // it; every other catalog Material is one material for the whole model.
  const usesShader = getCatalogShaderMaterial(materialAssetId) !== undefined;
  const shaderMaterials = useCatalogShaderMaterials(materialAssetId, CARD_LIGHTING, CARD_WIND);
  const override = useCatalogMaterial(usesShader ? undefined : materialAssetId);
  const [object, setObject] = useState<THREE.Object3D | null>(null);
  const trackAssetLoad = useCatalogPreviewAssetLoad();
  useFrame((frame, delta) => {
    if (object) updateMToonMaterials(object, delta, frame.gl.info.render.frame, frame.gl);
  });

  useEffect(() => {
    if (!object || !shaderMaterials) return;
    const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      originals.set(child, child.material);
      child.material = shaderMaterials.forMesh(child.name);
    });
    // The hook owns the shader Materials. Give the GLB its own back first, so
    // disposing the model does not dispose a Material another card may wear.
    return () => {
      for (const [mesh, material] of originals) mesh.material = material;
    };
  }, [object, shaderMaterials]);

  useEffect(() => {
    setObject(null);
    const definition = getBuiltinRecipeModel(modelId);
    if (!definition) return;
    let cancelled = false;
    let loaded: THREE.Object3D | null = null;
    let outlines: ReturnType<typeof attachMToonOutlines> | undefined;
    const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    const finishLoad = trackAssetLoad();
    const loader = new GLTFLoader();
    loader.load(
      `${catalogPublicAssetUrl(definition.publicPath)}?v=${definition.sha256.slice(0, 12)}`,
      (gltf) => {
        if (cancelled) {
          disposeCatalogModel(gltf.scene);
          return;
        }
        loaded = gltf.scene;
        if (materialAssetId && !usesShader) {
          loaded.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            originals.set(object, object.material);
            object.material = override;
          });
        }
        outlines = attachMToonOutlines(loaded);
        setObject(loaded);
        finishLoad();
      },
      undefined,
      () => {
        if (!cancelled) {
          setObject(null);
          finishLoad(false);
        }
      },
    );
    return () => {
      cancelled = true;
      finishLoad();
      outlines?.dispose();
      // The override hook owns its textures. Restore GLB materials before disposal.
      for (const [mesh, material] of originals) mesh.material = material;
      if (loaded) disposeCatalogModel(loaded);
    };
  }, [modelId, materialAssetId, override, trackAssetLoad, usesShader]);

  // Until its pictures have loaded, a shader model would show the GLB's plain
  // fallback colours.
  if (!object || (usesShader && !shaderMaterials)) return null;
  // Ownership lives in the loader effect; R3F must not dispose these twice.
  return <primitive object={object} dispose={null} />;
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
  if (primitive === "sphere") return <sphereGeometry args={[1, 48, 32]} />;
  if (primitive === "cylinder") return <cylinderGeometry args={[1, 1, 1, 48]} />;
  if (primitive === "cone") return <coneGeometry args={[1, 1, 48]} />;
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
    if (part.kind === "model") {
      const bounds = getBuiltinRecipeModel(part.modelId)?.bounds;
      if (bounds) {
        const transform = new THREE.Matrix4().compose(
          new THREE.Vector3(...part.position),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(...part.rotation)),
          new THREE.Vector3(...part.scale),
        );
        const box = new THREE.Box3(new THREE.Vector3(...bounds.min), new THREE.Vector3(...bounds.max)).applyMatrix4(transform);
        maxY = Math.max(maxY, box.max.y);
        maxRadius = Math.max(maxRadius, Math.hypot(
          Math.max(Math.abs(box.min.x), Math.abs(box.max.x)),
          Math.max(Math.abs(box.min.z), Math.abs(box.max.z)),
        ));
        continue;
      }
    }
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

/** PMREM lights reflect in metal/glass without a network HDR dependency. */
function StudioEnvironment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const previous = scene.environment;
    const room = new RoomEnvironment();
    const generator = new THREE.PMREMGenerator(gl);
    const target = generator.fromScene(room, 0.04);
    scene.environment = target.texture;
    room.dispose();
    generator.dispose();
    return () => { scene.environment = previous; target.dispose(); };
  }, [gl, scene]);
  return null;
}

function RecipePrimitiveMaterial({ materialAssetId }: { materialAssetId: string }) {
  const material = useCatalogMaterial(materialAssetId);
  const meshRef = useRef<THREE.Mesh | null>(null);
  useFrame((frame, delta) => {
    if (meshRef.current) updateMToonMaterials(meshRef.current, delta, frame.gl.info.render.frame, frame.gl);
  });
  const attach = useCallback((mesh: THREE.Mesh, instance: THREE.Material) => {
    const previous = mesh.material;
    mesh.material = instance;
    meshRef.current = mesh;
    const outlines = attachMToonOutlines(mesh);
    return () => {
      outlines.dispose();
      if (mesh.material === instance) mesh.material = previous;
      if (meshRef.current === mesh) meshRef.current = null;
    };
  }, []);
  return <primitive object={material} attach={attach} dispose={null} />;
}
