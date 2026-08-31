import { TerrainBrushCursor } from "./TerrainBrushCursor";
import { SceneVramMetrics } from "./SceneDebugCapture";
import {
  SceneEntityTreeProvider,
  useSceneEntityNode,
  useSceneEntityTreeShared,
} from "./scene-entity-tree-context";
import {
  Canvas,
  useFrame,
  useThree,
  createPortal,
} from "@react-three/fiber";
import {
  Edges,
  Html,
  OrbitControls,
  TransformControls,
} from "@react-three/drei";
import {
  ConvexHullCollider,
  CuboidCollider,
  MeshCollider,
  RigidBody,
  TrimeshCollider,
} from "@react-three/rapier";
import { SpawnPoint } from "@xrift/world-components";
import { TextPanelVisual } from "./TextPanelVisual";
import { XriftScriptRoot } from "../../../packages/xrift-studio-runtime/src/script/host";
import {
  XriftAudioSource,
  type XriftAudioSourceSourceStatus,
} from "../../../packages/xrift-studio-runtime/src/script/audio-source";
import { XriftScriptLight } from "../../../packages/xrift-studio-runtime/src/script/light";
import { PlayInteractionHost } from "./PlayInteractionHost";
import {
  emitXriftInteraction,
  XriftInteractionTriggerRuntime,
} from "../../../packages/xrift-studio-runtime/src/script/interaction-trigger-runtime";
import { XriftSceneRuntime } from "../../../packages/xrift-studio-runtime/src/script/scene-runtime";
import {
  applyTimeUniformValue,
  type MutableUniformValue,
  type TimeUniformSpec,
} from "../../../packages/xrift-studio-runtime/src/shader-time";
import {
  EntityScriptVisual,
  ScriptViewportProvider,
  type ScriptViewportRuntime,
} from "./EntityScriptVisual";
import {
  createContext,
  Fragment,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  type MutableRefObject,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ElementRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  BackSide,
  BoxGeometry,
  BufferGeometry,
  Color,
  DoubleSide,
  EquirectangularReflectionMapping,
  Euler,
  Float32BufferAttribute,
  MathUtils,
  Matrix4,
  OrthographicCamera,
  Uint32BufferAttribute,
  Plane,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  SRGBColorSpace,
  SphereGeometry,
  TextureLoader,
  Vector2,
  Vector3,
  type Group,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  type ShaderMaterial,
  type Texture,
} from "three";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import {
  BUILTIN_PRIMITIVE_CREATION_CATALOG,
  getBuiltinPrefabRecipe,
  getBuiltinPrimitiveCreation,
  applyCustomShaderSourceOverrides,
  bindCustomShaderGeometryAttributes,
  hasCustomShaderEntrypoints,
  validateClassicR3fMaterialShader,
  getMaterialAssignmentTarget,
  getMaterialAsset,
  getPrimaryMaterialAssetId,
  getTextureSourceFormat,
  getTransform,
  inspectColliderConfiguration,
  isEnvironmentTextureAsset,
  normalizeProjectRelativePath,
  resolveOpenBrushEditorBrushBaseUrl,
  resolveRuntimeSpawn,
  resolveSceneSettings,
  resolveSkyShaderMaterial,
  resolveSceneWind,
  skyShaderDrivenUniforms,
  lightingDrivenUniforms,
  materialAlphaRenderProps,
  resolveSceneLighting,
  UNLIT_SCENE_LIGHTING,
  windDrivenUniforms,
  STILL_WIND,
  createTerrainMeshBuffers,
  terrainHeightRange,
  STUDIO_GUIDE_INTERACTION_DOOR_MODEL_ASSET_ID,
  type AssetManifest,
  type ClassicR3fMaterialShader,
  type ResolvedSceneLighting,
  type ResolvedWind,
  type AudioSourceComponent,
  type ColliderComponent,
  type MaterialAsset,
  type MeshComponent,
  type ModelAsset,
  type PrefabDocument,
  type PrimitiveGeometry,
  type RigidBodyComponent,
  type SceneComponent,
  type SceneDocument,
  type SceneEntity,
  type SceneGizmoSettings,
  type SceneSettings,
  type VegetationWindComponent,
  type TerrainGeometry,
  type TerrainSceneBrushOperation,
  type TerrainViewportBrushKind,
  type TerrainViewportEditing,
  type SkyboxAsset,
  type TransformPatch,
  type TextureAsset,
  type Vec3,
  type VisualProjectKind,
  NATIVE_MODEL_EXTENSION_PATTERN,
  getKhrInteractivityOnStartAnimationCues,
  type InteractivityAnimationCue,
} from "../../lib/visual-editor";
import { tauri } from "../../lib/tauri";
import { resolveSceneClickSelection } from "../../lib/visual-editor/scene-click-selection";
import { isEditableShortcutTarget } from "../../lib/visual-editor/shortcuts";
import {
  EDITOR_HELPER_USER_DATA,
  computeEntityFocusBounds,
  resolveEntityWorldPosition,
  resolveFocusDistance,
} from "../../lib/visual-editor/gizmo-focus";
import {
  formatSnapStep,
  minSnapStepForMode,
  resolveSnapActive,
  snapPresetsForMode,
  snapStepForMode,
  snapStepLabel,
  snapStepUnit,
} from "../../lib/visual-editor/gizmo-snap";
import { commandTitle, EDITOR_ICONS } from "./editor-icons";
import { ParticleEmitterVisual } from "./ParticleEmitterVisual";
import { SceneThumbnailCapture } from "./SceneThumbnailCapture";
import { TerrainGrassVisual } from "./TerrainGrassVisual";
import {
  ScenePerformanceProbe,
  SceneVideoCapture,
  formatDebugNumber,
  type SceneDebugCaptureRequest,
  type SceneDebugCaptureResult,
  type ScenePerformanceMetrics,
} from "./SceneDebugCapture";
import {
  SceneScreenshotCapture,
  type SceneScreenshotRequest,
} from "./SceneScreenshotCapture";
import {
  applyOpenBrushMaterialAssetProperties,
  createClassicR3fMaterial,
  useClassicShaderTextures,
  loadProjectModelData,
  ProjectModelVisual,
  PROJECT_MODEL_SOURCE_NODE_INDEX_USER_DATA_KEY,
} from "./ProjectModelVisual";
import {
  loadOpenBrushPreviewMaterial,
  normalizeOpenBrushGlslSource,
} from "../../lib/visual-editor/open-brush-preview-loader";
import {
  readProjectTextureDataUrl,
  useCoreMaterialPreviewTextures,
  useMaterialPreviewRenderSync,
} from "./material-texture-preview";
import { clearEditorDragData } from "./editor-drag-data";
import {
  fallbackViewportGroundPosition,
  getSceneViewportDragIntent,
  hasPointerMovedBeyondThreshold,
  type SceneViewportDragIntent,
} from "./scene-viewport-drag";
import { createSceneViewportPreview } from "./scene-viewport-preview";
import {
  type EditorMode,
  type EditorSelection,
  type TransformMode,
  type TransformSpace,
} from "./types";
import {
  OfficialXriftComponentRenderer,
  OfficialXriftEntityWrappers,
  OfficialXriftPreviewProvider,
  isOfficialXriftWrapperComponent,
} from "./OfficialXriftComponentRenderer";
import {
  SCENE_VIEWPORT_DISPLAY_OPTIONS,
  getEntityMeshMaterialStyle,
  getSceneViewportDisplayProfile,
  type SceneViewportDisplayProfile,
  type SceneViewportDisplayMode,
  type SceneViewportMaterialStyle,
} from "./scene-viewport-display";
import {
  SCENE_VIEWPORT_QUALITY_OPTIONS,
  getSceneViewportQualityProfile,
  getSceneViewportRenderScale,
  loadSceneViewportQualityMode,
  saveSceneViewportQualityMode,
  type SceneViewportQualityMode,
} from "./scene-viewport-quality";
import { applyWorldPlayCameraLook } from "./world-play-camera";

/**
 * Recompiles Materials when shadows are switched off or on.
 *
 * three keeps the compiled program a Material already has, so turning the
 * shadow map off without this leaves every surface sampling the shadow map it
 * last rendered — the frames get cheaper and the shadows freeze in place
 * instead of going away.
 */
function ViewportShadowQuality({ enabled }: { enabled: boolean }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
    scene.traverse((object) => {
      const material = (object as Mesh).material;
      if (!material) return;
      for (const entry of Array.isArray(material) ? material : [material]) {
        entry.needsUpdate = true;
      }
    });
  }, [enabled, gl, scene]);
  return null;
}

/**
 * The wind every wind-driven Material in the viewport reads. It is a context
 * rather than a prop so the Scene View matches the compiled world, where the
 * compiler resolves the same wind per Entity: an Entity with a Wind component
 * nests its own value, everything else inherits the scene's.
 */
const SceneWindContext = createContext<ResolvedWind>(STILL_WIND);

/**
 * Narrows the wind for one Entity's subtree. The Wind component overrides the
 * rate and gustiness for the Materials under it; direction stays scene-wide.
 */
function EntityWindScope({
  component,
  children,
}: {
  component: VegetationWindComponent;
  children: ReactNode;
}) {
  const scene = useContext(SceneWindContext);
  const value = useMemo<ResolvedWind>(
    () =>
      component.enabled
        ? {
            direction: scene.direction,
            speed: Math.max(component.windSpeed, 0),
            turbulence: Math.min(Math.max(component.gustStrength, 0), 1),
          }
        : { ...STILL_WIND, direction: scene.direction },
    [component.enabled, component.gustStrength, component.windSpeed, scene.direction],
  );
  return (
    <SceneWindContext.Provider value={value}>{children}</SceneWindContext.Provider>
  );
}

const SceneLightingContext = createContext<ResolvedSceneLighting>(
  UNLIT_SCENE_LIGHTING,
);

/**
 * Pushes the scene's key light into a Custom Shader that declares those
 * uniforms, so an official Material shades from the same light as everything
 * else instead of from a sun it carries itself.
 */
function useLightingDrivenMaterial(
  material: ShaderMaterial | undefined,
  shader: ClassicR3fMaterialShader | undefined,
): void {
  const lighting = useContext(SceneLightingContext);
  useEffect(() => {
    if (!material || !shader) return;
    for (const entry of lightingDrivenUniforms(shader, lighting)) {
      const uniform = material.uniforms[entry.name];
      if (!uniform) continue;
      if (entry.kind === "number") {
        uniform.value = entry.value;
        continue;
      }
      const current = uniform.value;
      if (current instanceof Vector3) {
        current.set(entry.value[0], entry.value[1], entry.value[2]);
      } else {
        uniform.value = new Vector3(
          entry.value[0],
          entry.value[1],
          entry.value[2],
        );
      }
    }
    material.needsUpdate = true;
  }, [lighting, material, shader]);
}

/** Pushes the scene's wind into a Custom Shader that declares those uniforms. */
function useWindDrivenMaterial(
  material: ShaderMaterial | undefined,
  shader: ClassicR3fMaterialShader | undefined,
): void {
  const wind = useContext(SceneWindContext);
  useEffect(() => {
    if (!material || !shader) return;
    for (const entry of windDrivenUniforms(shader, wind)) {
      const uniform = material.uniforms[entry.name];
      if (!uniform) continue;
      if (entry.kind === "number") {
        uniform.value = entry.value;
        continue;
      }
      const current = uniform.value;
      if (current instanceof Vector2) {
        current.set(entry.value[0], entry.value[1]);
      } else {
        uniform.value = new Vector2(entry.value[0], entry.value[1]);
      }
    }
    material.needsUpdate = true;
  }, [material, shader, wind]);
}

const PLAY_KEYS = new Set([
  "w",
  "a",
  "s",
  "d",
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "q",
  "e",
  "shift",
]);
const SCENE_VIEW_ENTITY_ORIGIN_HIT_RADIUS_PX = 18;
const EDIT_CAMERA_TARGET: [number, number, number] = [0, 0.7, 0];
const EDITOR_SELECTION_COLOR = "#7c3aed";
const MUTED_GIZMO_COLOR = new Color("#64748b");
const WORLD_PLAY_CAMERA_EYE_HEIGHT = 1.6;
const WORLD_PLAY_CAMERA_SPEED = 4.5;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("デバッグ動画を読み込めませんでした。"));
        return;
      }
      resolve(reader.result.replace(/^data:[^,]+,/, "data:video/webm;base64,"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("デバッグ動画を読み込めませんでした。"));
    reader.readAsDataURL(blob);
  });
}

type WorldPlayCameraInput = {
  pointerId: number | null;
  lastX: number;
  lastY: number;
  deltaX: number;
  deltaY: number;
};

type ViewProjection = "perspective" | "orthographic";

type SceneViewportSelectionModifiers = {
  additive: boolean;
};

type SceneViewportEntitySelection =
  | Extract<EditorSelection, { kind: "entity" }>
  | null;

export type SceneFocusState = {
  entityId: string;
  entityName: string;
};

type EditCameraSnapshot = {
  position: Vector3;
  quaternion: Quaternion;
  target: Vector3;
  up: Vector3;
  zoom: number;
};

type TransformGizmoMaterial = {
  color: Color;
  opacity: number;
  transparent: boolean;
  needsUpdate: boolean;
  tempColor?: Color;
  tempOpacity?: number;
};

/**
 * Three's default transform controls use fully saturated RGB handles. Keep the
 * same hit areas and active-axis feedback, but make the resting controls a
 * quiet neutral so the authored scene remains the visual focus.
 */
function muteTransformGizmo(controls: Object3D | null): void {
  const transformControls = controls as (Object3D & { gizmo?: Object3D }) | null;
  const gizmoRoot =
    transformControls?.gizmo ??
    controls?.children.find((child) => child.type === "TransformControlsGizmo");
  if (!gizmoRoot) return;

  const styledMaterials = new Set<TransformGizmoMaterial>();
  gizmoRoot.traverse((object) => {
    const candidate = object as Object3D & {
      material?: TransformGizmoMaterial | TransformGizmoMaterial[];
    };
    const materials = Array.isArray(candidate.material)
      ? candidate.material
      : candidate.material
        ? [candidate.material]
        : [];
    for (const material of materials) {
      if (styledMaterials.has(material) || !material.color) continue;
      styledMaterials.add(material);
      const opacity = Math.min(
        material.tempOpacity ?? material.opacity,
        0.55,
      );
      material.color.copy(MUTED_GIZMO_COLOR);
      material.tempColor = MUTED_GIZMO_COLOR.clone();
      material.opacity = opacity;
      material.tempOpacity = opacity;
      material.transparent = true;
      material.needsUpdate = true;
    }
  });
}

function colorFactorToHex(value: [number, number, number] | undefined): string {
  if (!value) return "#000000";
  return `#${value
    .map((channel) =>
      Math.round(Math.max(0, Math.min(1, channel)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function PrimitiveGeometryView({ primitive }: { primitive: PrimitiveGeometry }) {
  switch (primitive) {
    case "box":
      return <boxGeometry args={[1, 1, 1]} />;
    case "sphere":
      return <sphereGeometry args={[0.5, 32, 20]} />;
    case "cylinder":
      return <cylinderGeometry args={[0.5, 0.5, 1, 32]} />;
    case "cone":
      return <coneGeometry args={[0.5, 1, 32]} />;
    case "plane":
      return <planeGeometry args={[1, 1]} />;
  }
}

const KHR_INTERACTIVITY_ON_START_ANIMATION_INDICES = [0] as const;

/** Keeps Editor Preview in lockstep with the published Mesh maxDistance contract. */
function RenderDistanceGate({
  maxDistance,
  renderOrder,
  children,
}: {
  maxDistance?: number;
  /** Explicit draw order for transparency the renderer cannot sort by distance. */
  renderOrder?: number;
  children: ReactNode;
}) {
  const ref = useRef<Group | null>(null);
  const worldPosition = useMemo(() => new Vector3(), []);
  useFrame(({ camera }) => {
    const group = ref.current;
    if (!group) return;
    if (maxDistance === undefined || !Number.isFinite(maxDistance)) {
      group.visible = true;
      return;
    }
    group.getWorldPosition(worldPosition);
    group.visible = camera.position.distanceTo(worldPosition) <= maxDistance;
  });
  // three reads renderOrder per object, so it has to reach the children rather
  // than sit on the group: setting it here alone would order the group against
  // its siblings and leave what is inside sorted by distance as before.
  useEffect(() => {
    const group = ref.current;
    if (!group) return;
    const order = renderOrder ?? 0;
    group.renderOrder = order;
    group.traverse((object) => {
      object.renderOrder = order;
    });
  }, [children, renderOrder]);
  return <group ref={ref}>{children}</group>;
}

function MeshVisual({
  component,
  graphAnimationCues,
  playing,
  assets,
  selected,
  materialDropHighlighted,
  viewportMaterialStyle,
  projectPath,
}: {
  component: MeshComponent;
  graphAnimationCues: readonly InteractivityAnimationCue[];
  playing: boolean;
  assets: AssetManifest;
  selected: boolean;
  materialDropHighlighted: boolean;
  viewportMaterialStyle: SceneViewportMaterialStyle;
  projectPath?: string;
}) {
  const geometryAssetId =
    component.geometry?.kind === "asset"
      ? component.geometry.assetId
      : component.geometryAssetId;
  const geometry = assets.assets[geometryAssetId];
  const builtinDefinition =
    component.geometry?.kind === "builtin-primitive"
      ? getBuiltinPrimitiveCreation(component.geometry.creationId)
      : getBuiltinPrimitiveCreation(component.geometryAssetId);
  const primitive =
    geometry?.kind === "primitive"
      ? geometry.primitive
      : component.geometry?.kind === "builtin-primitive"
        ? component.geometry.primitive
        : builtinDefinition?.primitive;
  const terrain =
    component.geometry?.kind === "terrain"
      ? component.geometry.terrain
      : undefined;
  const projectModelSource =
    geometry?.kind === "model"
      ? resolveProjectModelSource(geometry, projectPath)
      : undefined;
  const assignedModelMaterials = useMemo(
    () => {
      if (geometry?.kind !== "model") return [];
      const globalAssignments = geometry.materialSlots.flatMap((slot) => {
            if (slot.sourceMaterialIndex === undefined) return [];
            const binding = component.materialBindings.find(
              (candidate) =>
                candidate.slot === slot.slot &&
                candidate.sourceNodeIndex === undefined,
            );
            const materialAssetId =
              binding?.materialAssetId ?? slot.defaultMaterialAssetId;
            const material = materialAssetId
              ? getMaterialAsset(assets, materialAssetId)
              : undefined;
            return material
              ? [
                  {
                    slot: slot.slot,
                    sourceMaterialIndex: slot.sourceMaterialIndex,
                    material,
                  },
                ]
                : [];
          });
      const nodeAssignments = component.materialBindings.flatMap((binding) => {
        if (binding.sourceNodeIndex === undefined) return [];
        const slot = geometry.materialSlots.find(
          (candidate) => candidate.slot === binding.slot,
        );
        const material = getMaterialAsset(assets, binding.materialAssetId);
        return slot?.sourceMaterialIndex !== undefined && material
          ? [{
              slot: slot.slot,
              sourceMaterialIndex: slot.sourceMaterialIndex,
              sourceNodeIndex: binding.sourceNodeIndex,
              material,
            }]
          : [];
      });
      return [...globalAssignments, ...nodeAssignments];
    },
    [assets, component.materialBindings, geometry],
  );

  if (!component.enabled) return null;

  if (projectModelSource && projectPath && geometry?.kind === "model") {
    return (
      <RenderDistanceGate maxDistance={component.maxDistance} renderOrder={component.renderOrder}>
        <ProjectModelVisual
          projectPath={projectPath}
          sourceRelativePath={projectModelSource}
          sourceHash={geometry.sourceHash}
          importScale={geometry.importSettings.scale}
          castShadow={component.castShadow}
          receiveShadow={component.receiveShadow}
          selected={selected || materialDropHighlighted}
          assets={assets}
          assignedMaterials={assignedModelMaterials}
          pose={component.modelPose}
          playing={playing}
          graphAnimationCues={graphAnimationCues}
          declaredInteractionAnimationIndices={
            geometry.id === STUDIO_GUIDE_INTERACTION_DOOR_MODEL_ASSET_ID &&
            geometry.importMetadata?.extensionsUsed.includes("KHR_interactivity")
              ? KHR_INTERACTIVITY_ON_START_ANIMATION_INDICES
              : undefined
          }
          sourceNodeIndex={
            component.geometry?.kind === "asset"
              ? component.geometry.sourceNodeIndex
              : undefined
          }
          sourceNodeName={
            component.geometry?.kind === "asset"
              ? component.geometry.sourceNodeName
              : undefined
          }
          viewportMaterialStyle={viewportMaterialStyle}
        />
      </RenderDistanceGate>
    );
  }

  if (terrain) {
    const materialAssetId = getPrimaryMaterialAssetId(component);
    return (
      <RenderDistanceGate maxDistance={component.maxDistance} renderOrder={component.renderOrder}>
        <TerrainMeshVisual
          component={component}
          terrain={terrain}
          material={
            materialAssetId
              ? getMaterialAsset(assets, materialAssetId)
              : undefined
          }
          assets={assets}
          projectPath={projectPath}
          selected={selected}
          materialDropHighlighted={materialDropHighlighted}
          viewportMaterialStyle={viewportMaterialStyle}
        />
      </RenderDistanceGate>
    );
  }

  if (primitive) {
    const materialAssetId = getPrimaryMaterialAssetId(component);
    const material = materialAssetId
      ? getMaterialAsset(assets, materialAssetId)
      : undefined;
    return (
      <RenderDistanceGate maxDistance={component.maxDistance} renderOrder={component.renderOrder}>
        <PrimitiveMeshVisual
          component={component}
          primitive={primitive}
          material={material}
          assets={assets}
          projectPath={projectPath}
          selected={selected}
          materialDropHighlighted={materialDropHighlighted}
          viewportMaterialStyle={viewportMaterialStyle}
        />
      </RenderDistanceGate>
    );
  }

  return (
    <RenderDistanceGate maxDistance={component.maxDistance} renderOrder={component.renderOrder}>
      <mesh castShadow={false} receiveShadow={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial
          color={geometry?.kind === "model" ? "#71717a" : "#fb7185"}
          wireframe
        />
        {selected || materialDropHighlighted ? (
          <Edges
            color={materialDropHighlighted ? "#38bdf8" : EDITOR_SELECTION_COLOR}
            scale={1.02}
          />
        ) : null}
      </mesh>
    </RenderDistanceGate>
  );
}

function TerrainGeometryView({ terrain }: { terrain: TerrainGeometry }) {
  const geometry = useMemo(() => {
    const buffers = createTerrainMeshBuffers(terrain);
    const next = new BufferGeometry();
    next.setAttribute("position", new Float32BufferAttribute(buffers.positions, 3));
    next.setIndex([...buffers.indices]);
    next.computeVertexNormals();
    next.computeBoundingBox();
    next.computeBoundingSphere();
    return next;
  }, [terrain]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <primitive object={geometry} attach="geometry" />;
}

function TerrainMeshVisual({
  component,
  terrain,
  material,
  assets,
  projectPath,
  selected,
  materialDropHighlighted,
  viewportMaterialStyle,
}: {
  component: MeshComponent;
  terrain: TerrainGeometry;
  material?: MaterialAsset;
  assets: AssetManifest;
  projectPath?: string;
  selected: boolean;
  materialDropHighlighted: boolean;
  viewportMaterialStyle: SceneViewportMaterialStyle;
}) {
  const materialTextures = useCoreMaterialPreviewTextures(
    material,
    assets,
    projectPath,
  );
  const materialRef = useRef<MeshStandardMaterial | null>(null);
  useMaterialPreviewRenderSync(materialRef, materialTextures);
  const pbr = material?.properties.pbrMetallicRoughness;
  const alphaMode = material?.properties.alphaMode ?? "OPAQUE";
  const alphaProps = materialAlphaRenderProps({
    alphaMode,
    alphaCutoff: material?.properties.alphaCutoff ?? 0.5,
    blending: material?.properties.blending ?? "normal",
    depthWrite: material?.properties.depthWrite ?? "auto",
    alphaToCoverage: material?.properties.alphaToCoverage ?? false,
  });
  const opacity =
    alphaMode === "OPAQUE"
      ? 1
      : (pbr?.baseColorFactor[3] ?? material?.properties.opacity ?? 1);
  const normalScale = material?.properties.normalTexture?.scale ?? 1;

  // Terrain accepts Custom Shader Materials like any other mesh. Without this
  // the surface presets are assignable but never drawn: the standard material
  // below would ignore the shader and paint the ground one flat colour.
  const classicShaderTextures = useClassicShaderTextures(
    material,
    assets,
    projectPath,
  );
  const authoredShaderMaterial = useMemo(
    () =>
      material?.shader?.kind === "classic-r3f" &&
      validateClassicR3fMaterialShader(material.shader).length === 0
        ? createClassicR3fMaterial(material.shader, classicShaderTextures, "")
        : undefined,
    [classicShaderTextures, material?.shader],
  );
  useWindDrivenMaterial(
    authoredShaderMaterial,
    material?.shader?.kind === "classic-r3f" ? material.shader : undefined,
  );
  useLightingDrivenMaterial(
    authoredShaderMaterial,
    material?.shader?.kind === "classic-r3f" ? material.shader : undefined,
  );
  useFrame((state) => {
    const uniform = authoredShaderMaterial?.uniforms?.uTime;
    if (uniform) uniform.value = state.clock.getElapsedTime();
  });
  const usesAuthoredShader =
    Boolean(authoredShaderMaterial) &&
    // Only the shading modes: wireframe, ghost and collider views exist to
    // show structure, and a lit surface shader would defeat them.
    (viewportMaterialStyle === "scene" || viewportMaterialStyle === "unlit");

  return (
    <mesh
      castShadow={component.castShadow}
      receiveShadow={component.receiveShadow}
    >
      <TerrainGeometryView terrain={terrain} />
      {usesAuthoredShader && authoredShaderMaterial ? (
        <primitive object={authoredShaderMaterial} attach="material" />
      ) : viewportMaterialStyle === "unlit" ? (
        <meshBasicMaterial
          color={material?.properties.color ?? "#6b8e4e"}
          map={materialTextures.baseColorMap}
          opacity={opacity}
          transparent={alphaMode === "BLEND"}
          depthWrite={alphaMode !== "BLEND"}
          side={DoubleSide}
        />
      ) : viewportMaterialStyle === "wireframe" ||
        viewportMaterialStyle === "collider-wireframe" ? (
        <meshBasicMaterial
          color={
            viewportMaterialStyle === "collider-wireframe" ? "#0f766e" : "#52606d"
          }
          wireframe
          transparent={viewportMaterialStyle === "collider-wireframe"}
          opacity={viewportMaterialStyle === "collider-wireframe" ? 0.88 : 1}
          depthTest={viewportMaterialStyle !== "collider-wireframe"}
          depthWrite={viewportMaterialStyle !== "collider-wireframe"}
          side={DoubleSide}
        />
      ) : viewportMaterialStyle === "ghost" ? (
        <meshBasicMaterial
          color="#64748b"
          transparent
          opacity={0.16}
          depthWrite={false}
          side={DoubleSide}
        />
      ) : (
        <meshStandardMaterial
          ref={materialRef}
          color={material?.properties.color ?? "#6b8e4e"}
          metalness={pbr?.metallicFactor ?? material?.properties.metalness ?? 0}
          roughness={pbr?.roughnessFactor ?? material?.properties.roughness ?? 0.9}
          emissive={colorFactorToHex(material?.properties.emissiveFactor)}
          emissiveIntensity={
            material?.properties.extensions.KHR_materials_emissive_strength
              ?.emissiveStrength ?? 1
          }
          opacity={opacity}
          transparent={alphaProps.transparent}
          depthWrite={alphaProps.depthWrite}
          alphaTest={alphaProps.alphaTest}
          alphaToCoverage={alphaProps.alphaToCoverage}
          blending={THREE_BLENDING[alphaProps.blending]}
          map={materialTextures.baseColorMap}
          metalnessMap={materialTextures.metallicRoughnessMap}
          roughnessMap={materialTextures.metallicRoughnessMap}
          normalMap={materialTextures.normalMap}
          normalScale={[normalScale, normalScale]}
          aoMap={materialTextures.occlusionMap}
          aoMapIntensity={material?.properties.occlusionTexture?.strength ?? 1}
          emissiveMap={materialTextures.emissiveMap}
          side={DoubleSide}
        />
      )}
      {selected || materialDropHighlighted ? (
        <TerrainSelectionOutline
          terrain={terrain}
          color={materialDropHighlighted ? "#38bdf8" : EDITOR_SELECTION_COLOR}
        />
      ) : null}
      {/* Grass is a child of the Terrain mesh, so it inherits the Entity's
          transform and moves with the ground it grows on. */}
      <TerrainGrassLayers terrain={terrain} style={viewportMaterialStyle} />
    </mesh>
  );
}

/**
 * Draws every grass layer a Terrain carries. The layers are skipped in the
 * non-lit viewport styles, where the author is inspecting the surface itself
 * and a field of blades would only be in the way.
 */
function TerrainGrassLayers({
  terrain,
  style,
}: {
  terrain: TerrainGeometry;
  style: SceneViewportMaterialStyle;
}) {
  const wind = useContext(SceneWindContext);
  const lighting = useContext(SceneLightingContext);
  if (style === "wireframe" || style === "collider-wireframe" || style === "ghost") {
    return null;
  }
  return (
    <>
      {(terrain.grass ?? []).map((layer) => (
        <TerrainGrassVisual
          key={layer.id}
          terrain={terrain}
          layer={layer}
          wind={wind}
          lighting={lighting}
        />
      ))}
    </>
  );
}

/** A Terrain selection is its bounds, never every heightmap triangle. */
function TerrainSelectionOutline({
  terrain,
  color,
}: {
  terrain: TerrainGeometry;
  color: string;
}) {
  const range = terrainHeightRange(terrain);
  const height = Math.max(0.05, range.max - range.min);
  return (
    <mesh
      position={[0, (range.min + range.max) / 2, 0]}
      userData={EDITOR_HELPER_USER_DATA}
    >
      <boxGeometry args={[terrain.width, height, terrain.depth]} />
      <meshBasicMaterial color={color} wireframe depthTest={false} transparent opacity={0.88} />
    </mesh>
  );
}

function PrimitiveMeshVisual({
  component,
  primitive,
  material,
  assets,
  projectPath,
  selected,
  materialDropHighlighted,
  viewportMaterialStyle,
}: {
  component: MeshComponent;
  primitive: PrimitiveGeometry;
  material?: MaterialAsset;
  assets: AssetManifest;
  projectPath?: string;
  selected: boolean;
  materialDropHighlighted: boolean;
  viewportMaterialStyle: SceneViewportMaterialStyle;
}) {
  const materialTextures = useCoreMaterialPreviewTextures(
    material,
    assets,
    projectPath,
  );
  const customShaderMaterial = useOpenBrushPrimitiveMaterial(material);
  const classicShaderTextures = useClassicShaderTextures(
    material,
    assets,
    projectPath,
  );
  const authoredShaderMaterial = useMemo(
    () =>
      material?.shader?.kind === "classic-r3f"
        && validateClassicR3fMaterialShader(material.shader).length === 0
        ? createClassicR3fMaterial(material.shader, classicShaderTextures, "")
        : undefined,
    [classicShaderTextures, material?.shader],
  );
  useWindDrivenMaterial(
    authoredShaderMaterial,
    material?.shader?.kind === "classic-r3f" ? material.shader : undefined,
  );
  useLightingDrivenMaterial(
    authoredShaderMaterial,
    material?.shader?.kind === "classic-r3f" ? material.shader : undefined,
  );
  const resolvedCustomShaderMaterial = authoredShaderMaterial ?? customShaderMaterial;
  const meshRef = useRef<Mesh | null>(null);
  const customShaderInstance = useMemo(() => {
    const instance = resolvedCustomShaderMaterial?.clone();
    if (!instance || material?.shader?.kind !== "openbrush") return instance;
    const overrides = material.shader.sourceOverrides;
    applyCustomShaderSourceOverrides(
      instance,
      overrides
        ? {
            ...(overrides.vertexShader !== undefined
              ? { vertexShader: normalizeOpenBrushGlslSource(overrides.vertexShader) }
              : {}),
            ...(overrides.fragmentShader !== undefined
              ? { fragmentShader: normalizeOpenBrushGlslSource(overrides.fragmentShader) }
              : {}),
          }
        : undefined,
    );
    applyOpenBrushMaterialAssetProperties(instance, material, materialTextures);
    return hasCustomShaderEntrypoints(instance) ? instance : undefined;
  }, [material, materialTextures, resolvedCustomShaderMaterial]);
  useFrame((state) => {
    if (
      !authoredShaderMaterial ||
      material?.shader?.kind !== "classic-r3f"
    ) {
      return;
    }
    const elapsed = state.clock.getElapsedTime();
    const specs = authoredShaderMaterial.userData.xriftTimeUniforms as
      | TimeUniformSpec[]
      | undefined;
    if (Array.isArray(specs)) {
      for (const spec of specs) {
        const uniform = authoredShaderMaterial.uniforms[spec.name];
        if (uniform) {
          applyTimeUniformValue(
            uniform as MutableUniformValue,
            spec,
            elapsed,
          );
        }
      }
      return;
    }
    const uniformName = material.shader.animatedTimeUniform;
    const uniform = uniformName
      ? authoredShaderMaterial.uniforms[uniformName]
      : undefined;
    if (uniform) uniform.value = elapsed;
  });
  const materialRef = useRef<MeshStandardMaterial | null>(null);
  useMaterialPreviewRenderSync(materialRef, materialTextures);
  useLayoutEffect(() => {
    if (!meshRef.current || !customShaderInstance) return;
    bindCustomShaderGeometryAttributes(
      meshRef.current.geometry,
      customShaderInstance,
      material?.shader?.kind === "openbrush"
        ? material.shader.attributeBindings
        : undefined,
    );
    customShaderInstance.needsUpdate = true;
  }, [customShaderInstance, material?.shader, primitive]);
  useEffect(
    () => () => customShaderInstance?.dispose(),
    [customShaderInstance],
  );
  const pbr = material?.properties.pbrMetallicRoughness;
  const alphaMode = material?.properties.alphaMode ?? "OPAQUE";
  const alphaProps = materialAlphaRenderProps({
    alphaMode,
    alphaCutoff: material?.properties.alphaCutoff ?? 0.5,
    blending: material?.properties.blending ?? "normal",
    depthWrite: material?.properties.depthWrite ?? "auto",
    alphaToCoverage: material?.properties.alphaToCoverage ?? false,
  });
  const opacity =
    alphaMode === "OPAQUE"
      ? 1
      : (pbr?.baseColorFactor[3] ?? material?.properties.opacity ?? 1);
  const normalScale = material?.properties.normalTexture?.scale ?? 1;

  return (
    <mesh
      ref={meshRef}
      castShadow={component.castShadow}
      receiveShadow={component.receiveShadow}
    >
      <PrimitiveGeometryView primitive={primitive} />
      {viewportMaterialStyle === "unlit" ? (
        <meshBasicMaterial
          color={material?.properties.color ?? "#f43f5e"}
          map={materialTextures.baseColorMap}
          opacity={opacity}
          transparent={alphaProps.transparent}
          depthWrite={alphaProps.depthWrite}
          alphaTest={alphaProps.alphaTest}
          alphaToCoverage={alphaProps.alphaToCoverage}
          blending={THREE_BLENDING[alphaProps.blending]}
          side={
            primitive === "plane" || material?.properties.doubleSided
              ? DoubleSide
              : undefined
          }
        />
      ) : viewportMaterialStyle === "wireframe" ? (
        <meshBasicMaterial color="#52606d" wireframe />
      ) : viewportMaterialStyle === "ghost" ? (
        <meshBasicMaterial
          color="#64748b"
          transparent
          opacity={0.16}
          depthWrite={false}
          side={DoubleSide}
        />
      ) : viewportMaterialStyle === "collider-wireframe" ? (
        <meshBasicMaterial
          color="#0f766e"
          wireframe
          transparent
          opacity={0.88}
          depthTest={false}
          depthWrite={false}
          side={DoubleSide}
        />
      ) : customShaderInstance ? (
        <primitive object={customShaderInstance} attach="material" />
      ) : (
      <meshStandardMaterial
        ref={materialRef}
        color={material?.properties.color ?? "#f43f5e"}
        metalness={pbr?.metallicFactor ?? material?.properties.metalness ?? 0}
        roughness={pbr?.roughnessFactor ?? material?.properties.roughness ?? 1}
        emissive={colorFactorToHex(material?.properties.emissiveFactor)}
        emissiveIntensity={
          material?.properties.extensions.KHR_materials_emissive_strength
            ?.emissiveStrength ?? 1
        }
        opacity={opacity}
        transparent={alphaMode === "BLEND"}
        depthWrite={alphaMode !== "BLEND"}
        alphaTest={
          alphaMode === "MASK"
            ? (material?.properties.alphaCutoff ?? 0.5)
            : 0
        }
        map={materialTextures.baseColorMap}
        metalnessMap={materialTextures.metallicRoughnessMap}
        roughnessMap={materialTextures.metallicRoughnessMap}
        normalMap={materialTextures.normalMap}
        normalScale={[normalScale, normalScale]}
        aoMap={materialTextures.occlusionMap}
        aoMapIntensity={material?.properties.occlusionTexture?.strength ?? 1}
        emissiveMap={materialTextures.emissiveMap}
        side={
          primitive === "plane" || material?.properties.doubleSided
            ? DoubleSide
            : undefined
        }
      />
      )}
      {selected || materialDropHighlighted ? (
        <Edges
          color={materialDropHighlighted ? "#38bdf8" : EDITOR_SELECTION_COLOR}
          scale={1.015}
          threshold={12}
        />
      ) : null}
    </mesh>
  );
}

function LightVisual({
  component,
  selected,
  showSceneLighting,
  showHelperVisual,
}: {
  component: Extract<SceneComponent, { type: "light" }>;
  selected: boolean;
  showSceneLighting: boolean;
  showHelperVisual: boolean;
}) {
  return (
    <>
      {showSceneLighting ? (
        <XriftScriptLight
          componentId={component.id}
          lightType={component.lightType}
          enabled={component.enabled}
          color={component.color}
          intensity={component.intensity}
          castShadow={component.castShadow}
          groundColor={component.groundColor ?? "#334155"}
          distance={component.distance ?? 0}
          decay={component.decay ?? 2}
          angle={component.angle ?? Math.PI / 3}
          penumbra={component.penumbra ?? 0.5}
          width={component.width ?? 1}
          height={component.height ?? 1}
        />
      ) : null}
      {showHelperVisual && component.enabled ? (
        <>
          <EditorLightIcon color={component.color} selected={selected} />
          {component.lightType === "directional" ||
          component.lightType === "spot" ? (
            <DirectionArrow
              direction={-1}
              color={selected ? EDITOR_SELECTION_COLOR : component.color}
              position={[0, -0.18, 0]}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}

function EditorLightIcon({
  color,
  selected,
}: {
  color: string;
  selected: boolean;
}) {
  const LightIcon = EDITOR_ICONS.light;
  return (
    <Html
      transform
      sprite
      distanceFactor={4}
      zIndexRange={[2, 0]}
      style={{ pointerEvents: "none" }}
    >
      <div
        aria-hidden="true"
        style={{
          alignItems: "center",
          background: selected ? "rgba(255,255,255,0.96)" : "rgba(15,23,42,0.82)",
          border: `2px solid ${selected ? EDITOR_SELECTION_COLOR : color}`,
          borderRadius: 6,
          boxShadow: selected
            ? "0 0 0 3px rgba(148,163,184,0.28), 0 4px 14px rgba(15,23,42,0.28)"
            : "0 3px 10px rgba(15,23,42,0.28)",
          color: selected ? "#334155" : color,
          display: "flex",
          height: 18,
          justifyContent: "center",
          width: 18,
        }}
      >
        <LightIcon size={11} strokeWidth={2.2} />
      </div>
    </Html>
  );
}

function useOpenBrushPrimitiveMaterial(
  material: MaterialAsset | undefined,
): Material | undefined {
  const [resolved, setResolved] = useState<Material>();
  useEffect(() => {
    let active = true;
    setResolved(undefined);
    if (material?.shader?.kind !== "openbrush") {
      return () => {
        active = false;
      };
    }
    void loadOpenBrushPreviewMaterial(
      material.shader.brushName,
      resolveOpenBrushEditorBrushBaseUrl(),
    )
      .then((preset) => {
        if (active) setResolved(preset);
      })
      .catch(() => {
        if (active) setResolved(undefined);
      });
    return () => {
      active = false;
    };
  }, [material?.shader]);
  return resolved;
}

function AudioSourceVisual({ selected }: { selected: boolean }) {
  const AudioIcon = EDITOR_ICONS.audio;
  return (
    <Html
      transform
      sprite
      distanceFactor={4}
      zIndexRange={[2, 0]}
      style={{ pointerEvents: "none" }}
    >
      <div
        aria-hidden="true"
        title="Audio Source"
        style={{
          alignItems: "center",
          background: selected ? "rgba(255,255,255,0.96)" : "rgba(15,23,42,0.82)",
          border: `2px solid ${selected ? EDITOR_SELECTION_COLOR : "#a78bfa"}`,
          borderRadius: 6,
          boxShadow: selected
            ? "0 0 0 3px rgba(148,163,184,0.28), 0 4px 14px rgba(15,23,42,0.28)"
            : "0 3px 10px rgba(15,23,42,0.28)",
          color: selected ? "#6d28d9" : "#c4b5fd",
          display: "flex",
          height: 18,
          justifyContent: "center",
          width: 18,
        }}
      >
        <AudioIcon size={17} strokeWidth={2.2} />
      </div>
    </Html>
  );
}

type StudioAudioSourceResolution = {
  key: string;
  status: XriftAudioSourceSourceStatus;
  url: string | null;
};

function StudioAudioSourceRuntime({
  component,
  assets,
  projectPath,
  effectivelyEnabled,
}: {
  component: AudioSourceComponent;
  assets: AssetManifest;
  projectPath?: string;
  effectivelyEnabled: boolean;
}) {
  const audioAssetId = component.audioAssetId?.trim() ?? "";
  const candidate = audioAssetId ? assets.assets[audioAssetId] : undefined;
  const audioAsset =
    candidate?.kind === "audio" &&
    candidate.status === "ready" &&
    candidate.source.kind === "project"
      ? candidate
      : undefined;
  const audioRelativePath =
    audioAsset?.source.kind === "project"
      ? audioAsset.source.relativePath
      : "";
  const resolutionKey = [
    projectPath ?? "",
    audioAsset?.id ?? audioAssetId,
    audioAsset?.sourceHash ?? "",
    audioRelativePath,
  ].join("\n");
  const [resolution, setResolution] = useState<StudioAudioSourceResolution>({
    key: "",
    status: "loading",
    url: null,
  });

  useEffect(() => {
    let active = true;
    if (!audioAssetId || !audioAsset || !audioRelativePath) {
      setResolution({
        key: resolutionKey,
        status: "missing",
        url: null,
      });
      return () => {
        active = false;
      };
    }
    if (!projectPath?.trim()) {
      setResolution({
        key: resolutionKey,
        status: "unavailable",
        url: null,
      });
      return () => {
        active = false;
      };
    }
    if (!effectivelyEnabled || !component.enabled) {
      setResolution({
        key: resolutionKey,
        status: "loading",
        url: null,
      });
      return () => {
        active = false;
      };
    }
    setResolution({
      key: resolutionKey,
      status: "loading",
      url: null,
    });
    void tauri
      .readAudioDataUrl(projectPath, audioRelativePath)
      .then((url) => {
        if (!active) return;
        setResolution({
          key: resolutionKey,
          status: "available",
          url,
        });
      })
      .catch(() => {
        if (!active) return;
        setResolution({
          key: resolutionKey,
          status: "unavailable",
          url: null,
        });
      });
    return () => {
      active = false;
    };
  }, [
    audioRelativePath,
    audioAssetId,
    component.enabled,
    effectivelyEnabled,
    projectPath,
    resolutionKey,
  ]);

  const current =
    resolution.key === resolutionKey
      ? resolution
      : ({
          key: resolutionKey,
          status: audioAsset ? "loading" : "missing",
          url: null,
        } satisfies StudioAudioSourceResolution);

  return (
    <XriftAudioSource
      componentId={component.id}
      audioAssetId={audioAssetId}
      assetUrl={current.url}
      sourceStatus={current.status}
      enabled={effectivelyEnabled && component.enabled}
      volume={component.volume}
      loop={component.loop}
      autoplay={component.autoplay}
      spatial={component.spatial}
      refDistance={component.refDistance}
      rolloffFactor={component.rolloffFactor}
      maxDistance={component.maxDistance}
    />
  );
}

function DirectionArrow({
  direction,
  color,
  position,
}: {
  direction: -1 | 1;
  color: string;
  position: Vec3;
}) {
  const rotationX = direction < 0 ? -Math.PI / 2 : Math.PI / 2;
  return (
    <group position={position} userData={EDITOR_HELPER_USER_DATA}>
      <mesh
        position={[0, 0, direction * 0.34]}
        rotation={[rotationX, 0, 0]}
        renderOrder={18}
      >
        <cylinderGeometry args={[0.018, 0.018, 0.58, 8]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.8}
          depthTest={false}
        />
      </mesh>
      <mesh
        position={[0, 0, direction * 0.7]}
        rotation={[rotationX, 0, 0]}
        renderOrder={18}
      >
        <coneGeometry args={[0.08, 0.18, 12]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.9}
          depthTest={false}
        />
      </mesh>
    </group>
  );
}

function ComponentVisual({
  component,
  graphAnimationCues,
  playing,
  assets,
  selected,
  materialDragActive,
  materialDropHighlighted,
  viewportMaterialStyle,
  showHelpers,
  renderThumbnail,
  showSceneLighting,
  showAllColliders,
  effectivelyEnabled,
  projectPath,
  entityModelNode,
}: {
  component: SceneComponent;
  graphAnimationCues: readonly InteractivityAnimationCue[];
  playing: boolean;
  assets: AssetManifest;
  selected: boolean;
  materialDragActive: boolean;
  materialDropHighlighted: boolean;
  viewportMaterialStyle: SceneViewportMaterialStyle | null;
  showHelpers: boolean;
  renderThumbnail: boolean;
  showSceneLighting: boolean;
  showAllColliders: boolean;
  effectivelyEnabled: boolean;
  projectPath?: string;
  /** Set for expanded shared-Model nodes: the geometry their Model draws. */
  entityModelNode?: SceneEntity["modelNode"];
}) {
  switch (component.type) {
    case "transform":
      return null;
    case "mesh":
      if (!viewportMaterialStyle) return null;
      return (
        <group userData={{ meshComponentId: component.id }}>
          <MeshVisual
            component={component}
            graphAnimationCues={graphAnimationCues}
            playing={playing}
            assets={assets}
            selected={materialDragActive ? materialDropHighlighted : selected}
            materialDropHighlighted={materialDropHighlighted}
            viewportMaterialStyle={viewportMaterialStyle}
            projectPath={projectPath}
          />
        </group>
      );
    case "collider":
      if (playing || !component.enabled || (!selected && !showAllColliders)) {
        return null;
      }
      if (component.shape === "mesh") {
        // A shared-Model node's Mesh Collider has no sibling Mesh to repaint,
        // so its outline is the baked node geometry itself.
        return entityModelNode ? (
          <ModelNodeMeshColliderOutline
            modelNode={entityModelNode}
            assets={assets}
            projectPath={projectPath}
            isTrigger={component.isTrigger}
            selected={selected}
            colliderMode={showAllColliders}
          />
        ) : null;
      }
      return (
        <mesh
          position={component.center}
          renderOrder={20}
          userData={EDITOR_HELPER_USER_DATA}
        >
          <boxGeometry
            args={[
              component.halfExtents[0] * 2,
              component.halfExtents[1] * 2,
              component.halfExtents[2] * 2,
            ]}
          />
          <meshBasicMaterial
            color={component.isTrigger ? "#d97706" : "#0f766e"}
            wireframe
            transparent
            opacity={selected ? 0.9 : 0.62}
            depthTest={false}
          />
        </mesh>
      );
    case "rigid-body":
      return null;
    case "light":
      return showHelpers || renderThumbnail || showSceneLighting ? (
        <LightVisual
          component={component}
          selected={selected}
          showSceneLighting={showSceneLighting}
          showHelperVisual={showHelpers}
        />
      ) : null;
    case "text":
      // `playing` is listed because Play forces `showHelpers` off: a wall label
      // is world content, so hiding it during Play would misrepresent the
      // world. The wireframe and collider display modes still drop it, the way
      // they drop every other authored visual.
      return (showHelpers || playing || renderThumbnail) && component.enabled ? (
        <TextPanelVisual
          component={component}
          assets={assets}
          projectPath={projectPath}
        />
      ) : null;
    case "audio-source":
      return playing ? (
        <StudioAudioSourceRuntime
          component={component}
          assets={assets}
          projectPath={projectPath}
          effectivelyEnabled={effectivelyEnabled}
        />
      ) : showHelpers && component.enabled ? (
        <AudioSourceVisual selected={selected} />
      ) : null;
    case "spawn-point":
      return showHelpers && component.enabled ? (
        <SpawnPoint position={[0, 0, 0]} yaw={0} />
      ) : null;
    case "particle-emitter": {
      const asset = assets.assets[component.particleAssetId];
      const textureAsset =
        asset?.kind === "particle" && asset.properties.renderer.textureAssetId
          ? assets.assets[asset.properties.renderer.textureAssetId]
          : undefined;
      const materialAsset =
        asset?.kind === "particle" && asset.properties.renderer.materialAssetId
          ? assets.assets[asset.properties.renderer.materialAssetId]
          : undefined;
      // `playing` is listed for the same reason the Text panel lists it: Play
      // forces `showHelpers` off, and a particle effect is world content, so
      // hiding it during Play would misrepresent the world — and would make a
      // graph that starts an effect impossible to check.
      return (showHelpers || playing || renderThumbnail) &&
        component.enabled &&
        asset?.kind === "particle" ? (
        <ParticleEmitterVisual
          componentId={component.id}
          asset={asset}
          textureAsset={
            textureAsset?.kind === "texture" ? textureAsset : undefined
          }
          materialAsset={
            materialAsset?.kind === "material" ? materialAsset : undefined
          }
          projectPath={projectPath}
          selected={selected}
        />
      ) : null;
    }
    case "xrift-component":
      return showHelpers || renderThumbnail ? (
        <OfficialXriftComponentRenderer component={component} />
      ) : null;
    case "script":
      // Mounted by EntityObject, which has the Entity identity the host needs,
      // in the same way official wrapper components are handled there.
      return null;
  }
}

type SceneEntityModelNode = NonNullable<SceneEntity["modelNode"]>;

type ModelNodeColliderGeometryData = {
  vertices: Float32Array;
  indices: Uint32Array;
};

/**
 * Bakes the collider geometry of one shared-Model node: the node's own
 * meshes, in node-local space, excluding descendants that are glTF nodes
 * themselves — those belong to their own expanded Entities. Read-only over
 * the shared cached model object.
 */
function extractModelNodeColliderGeometry(
  root: Object3D,
  sourceNodeIndex: number,
): ModelNodeColliderGeometryData | null {
  root.updateMatrixWorld(true);
  let found: Object3D | null = null;
  root.traverse((candidate) => {
    if (
      !found &&
      candidate.userData[PROJECT_MODEL_SOURCE_NODE_INDEX_USER_DATA_KEY] ===
        sourceNodeIndex
    ) {
      found = candidate;
    }
  });
  const node = found as Object3D | null;
  if (!node) return null;
  const nodeInverse = new Matrix4().copy(node.matrixWorld).invert();
  const positions: number[] = [];
  const indices: number[] = [];
  const vertex = new Vector3();
  const visit = (object: Object3D, isNodeRoot: boolean) => {
    if (!isNodeRoot) {
      const candidateIndex =
        object.userData[PROJECT_MODEL_SOURCE_NODE_INDEX_USER_DATA_KEY];
      if (typeof candidateIndex === "number") return;
    }
    const mesh = object as Mesh & { isMesh?: boolean };
    const geometry = mesh.isMesh ? (mesh.geometry as BufferGeometry) : null;
    const position = geometry?.getAttribute("position");
    if (geometry && position) {
      const toNodeLocal = new Matrix4().multiplyMatrices(
        nodeInverse,
        object.matrixWorld,
      );
      const offset = positions.length / 3;
      for (let index = 0; index < position.count; index += 1) {
        vertex.fromBufferAttribute(position, index).applyMatrix4(toNodeLocal);
        positions.push(vertex.x, vertex.y, vertex.z);
      }
      const meshIndex = geometry.getIndex();
      if (meshIndex) {
        for (let index = 0; index < meshIndex.count; index += 1) {
          indices.push(offset + meshIndex.getX(index));
        }
      } else {
        for (let index = 0; index < position.count; index += 1) {
          indices.push(offset + index);
        }
      }
    }
    for (const child of object.children) visit(child, false);
  };
  visit(node, true);
  if (positions.length === 0 || indices.length === 0) return null;
  return {
    vertices: new Float32Array(positions),
    indices: new Uint32Array(indices),
  };
}

function useModelNodeColliderGeometry(
  modelNode: SceneEntityModelNode,
  assets: AssetManifest,
  projectPath: string | undefined,
): ModelNodeColliderGeometryData | null {
  const asset = assets.assets[modelNode.modelAssetId];
  const modelAsset = asset?.kind === "model" ? asset : undefined;
  const sourceRelativePath = modelAsset
    ? resolveProjectModelSource(modelAsset, projectPath)
    : undefined;
  const sourceHash = modelAsset?.sourceHash;
  const [modelObject, setModelObject] = useState<Object3D | null>(null);
  useEffect(() => {
    if (!projectPath || !sourceRelativePath) {
      setModelObject(null);
      return;
    }
    let active = true;
    void loadProjectModelData(projectPath, sourceRelativePath, sourceHash)
      .then((data) => {
        if (active) setModelObject(data.object);
      })
      .catch(() => {
        if (active) setModelObject(null);
      });
    return () => {
      active = false;
    };
  }, [projectPath, sourceHash, sourceRelativePath]);
  return useMemo(
    () =>
      modelObject
        ? extractModelNodeColliderGeometry(
            modelObject,
            modelNode.sourceNodeIndex,
          )
        : null,
    [modelObject, modelNode.sourceNodeIndex],
  );
}

/**
 * Physics shapes for a Mesh Collider on a shared-Model node. The node Entity
 * draws nothing itself — the Model root does — so Rapier's own child-mesh
 * sweep finds no geometry there. Explicit shapes carry the node's baked
 * triangles instead; Rapier applies the Entity's world scale to the args.
 */
function ModelNodeMeshColliderShapes({
  modelNode,
  collider,
  assets,
  projectPath,
}: {
  modelNode: SceneEntityModelNode;
  collider: Extract<ColliderComponent, { shape: "mesh" }>;
  assets: AssetManifest;
  projectPath?: string;
}) {
  const geometry = useModelNodeColliderGeometry(modelNode, assets, projectPath);
  if (!geometry) return null;
  const bodyIsFixed = (collider.bodyType ?? "fixed") === "fixed";
  return collider.meshMode === "convex" || !bodyIsFixed ? (
    <ConvexHullCollider
      args={[geometry.vertices]}
      friction={collider.friction}
      restitution={collider.restitution}
      sensor={collider.isTrigger}
    />
  ) : (
    <TrimeshCollider
      args={[geometry.vertices, geometry.indices]}
      friction={collider.friction}
      restitution={collider.restitution}
      sensor={collider.isTrigger}
    />
  );
}

/**
 * Above this, a wireframe of every triangle stops being a shape and becomes a
 * solid field of lines — a beach's ground node is one mesh with hundreds of
 * thousands of them. Dense nodes are drawn as a translucent skin instead, which
 * says the same thing about where the collision is and leaves the world behind
 * it readable.
 */
const MODEL_NODE_COLLIDER_WIREFRAME_TRIANGLE_LIMIT = 4000;

/** Outline of a shared-Model node's Mesh Collider for コライダー編集. */
function ModelNodeMeshColliderOutline({
  modelNode,
  assets,
  projectPath,
  isTrigger,
  selected,
  colliderMode,
}: {
  modelNode: SceneEntityModelNode;
  assets: AssetManifest;
  projectPath?: string;
  isTrigger: boolean;
  selected: boolean;
  /** コライダー編集: the Scene's own Meshes are hidden behind this one. */
  colliderMode: boolean;
}) {
  const data = useModelNodeColliderGeometry(modelNode, assets, projectPath);
  const geometry = useMemo(() => {
    if (!data) return null;
    const built = new BufferGeometry();
    built.setAttribute(
      "position",
      new Float32BufferAttribute(data.vertices, 3),
    );
    built.setIndex(new Uint32BufferAttribute(data.indices, 1));
    return built;
  }, [data]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry || !data) return null;
  const color = isTrigger ? "#d97706" : "#0f766e";
  const dense =
    data.indices.length / 3 > MODEL_NODE_COLLIDER_WIREFRAME_TRIANGLE_LIMIT;
  return (
    <mesh
      geometry={geometry}
      renderOrder={20}
      userData={EDITOR_HELPER_USER_DATA}
    >
      {/*
       * Depth-tested, unlike the Box outline: a box is twelve edges and can be
       * drawn through whatever hides it, while a Model node's collider follows
       * real geometry, so drawing its far side over its near side — over the
       * whole viewport — hides the Scene instead of explaining it. The offset
       * keeps it off the identical surface it traces.
       */}
      <meshBasicMaterial
        color={color}
        wireframe={!dense}
        side={dense ? DoubleSide : undefined}
        transparent
        /*
         * A skin over a hidden Scene has to carry the picture on its own; the
         * same skin over the Model it traces only has to say "collision here",
         * so it stays a wash rather than a repaint of the ground.
         */
        opacity={
          dense
            ? colliderMode
              ? 0.38
              : 0.18
            : selected
              ? 0.9
              : 0.62
        }
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </mesh>
  );
}

function RuntimePhysicsEntity({
  entity,
  children,
}: {
  entity: SceneEntity;
  children: ReactNode;
}) {
  const colliders = entity.components.filter(
    (component) => component.type === "collider" && component.enabled,
  ) as ColliderComponent[];
  if (colliders.length === 0) return children;

  const meshCollider = colliders.find(
    (component) => component.shape === "mesh",
  );
  // A shared-Model node has no meshes of its own for Rapier to sweep; its
  // Mesh Collider arrives as explicit baked shapes through children instead.
  const autoMeshCollider = entity.modelNode ? undefined : meshCollider;
  const primaryCollider = meshCollider ?? colliders[0]!;
  const bodyType = primaryCollider.bodyType ?? "fixed";

  return (
    <RigidBody
      type={bodyType}
      colliders={
        autoMeshCollider
          ? autoMeshCollider.meshMode === "convex" || bodyType !== "fixed"
            ? "hull"
            : "trimesh"
          : false
      }
      gravityScale={primaryCollider.gravityScale ?? 1}
      linearDamping={primaryCollider.linearDamping ?? 0}
      angularDamping={primaryCollider.angularDamping ?? 0}
      canSleep={primaryCollider.canSleep ?? true}
      ccd={primaryCollider.ccd ?? false}
      lockTranslations={primaryCollider.lockTranslations ?? false}
      lockRotations={primaryCollider.lockRotations ?? false}
      friction={primaryCollider.friction}
      restitution={primaryCollider.restitution}
      sensor={primaryCollider.isTrigger}
    >
      {children}
      {colliders.map((collider) =>
        collider.shape === "box" ? (
          <CuboidCollider
            key={collider.id}
            args={collider.halfExtents}
            position={collider.center}
            friction={collider.friction}
            restitution={collider.restitution}
            sensor={collider.isTrigger}
          />
        ) : null,
      )}
    </RigidBody>
  );
}

function RuntimeOwnedColliderContent({
  entity,
  bodyType,
  autoColliders,
  children,
}: {
  entity: SceneEntity;
  bodyType: RigidBodyComponent["bodyType"];
  autoColliders: RigidBodyComponent["autoColliders"];
  children: ReactNode;
}) {
  const colliders = entity.components.filter(
    (component): component is ColliderComponent =>
      component.type === "collider" && component.enabled,
  );
  const meshCollider = colliders.find(
    (component) => component.shape === "mesh",
  );
  let renderedChildren = children;
  // A shared-Model node's Mesh Collider ships explicit baked shapes through
  // children; wrapping its empty subtree here would generate nothing.
  if (meshCollider && !entity.modelNode) {
    renderedChildren = (
      <MeshCollider
        type={
          meshCollider.meshMode === "convex" || bodyType !== "fixed"
            ? "hull"
            : "trimesh"
        }
      >
        {renderedChildren}
      </MeshCollider>
    );
  }
  if (autoColliders !== "none") {
    const autoColliderType =
      autoColliders === "trimesh" && bodyType !== "fixed"
        ? "hull"
        : autoColliders;
    renderedChildren = (
      <MeshCollider type={autoColliderType}>{renderedChildren}</MeshCollider>
    );
  }

  return (
    <>
      {renderedChildren}
      {colliders.map((collider) =>
        collider.shape === "box" ? (
          <CuboidCollider
            key={collider.id}
            args={collider.halfExtents}
            position={collider.center}
            friction={collider.friction}
            restitution={collider.restitution}
            sensor={collider.isTrigger}
          />
        ) : null,
      )}
    </>
  );
}

function RuntimeOwnedRigidBody({
  component,
  children,
}: {
  component: RigidBodyComponent;
  children: ReactNode;
}) {
  return (
    <RigidBody
      type={component.bodyType}
      colliders={false}
      sensor={component.isTrigger}
      friction={component.friction}
      restitution={component.restitution}
      gravityScale={component.gravityScale}
      linearDamping={component.linearDamping}
      angularDamping={component.angularDamping}
      canSleep={component.canSleep}
      ccd={component.ccd}
      lockTranslations={component.lockTranslations}
      lockRotations={component.lockRotations}
    >
      {children}
    </RigidBody>
  );
}

function EntityObject({
  entity,
  authoringEntityId,
  assets,
  selected,
  primary,
  editable,
  playing,
  physicsEnabled,
  ownRigidBody,
  rigidBodyOwner,
  effectivelyEnabled,
  runtimeRevision,
  transformMode,
  transformSpace,
  gizmo,
  projectPath,
  onTransformCommit,
  onDraggingChange,
  transformDraggingRef,
  materialDragActive,
  materialDropComponentId,
  displayMode,
  displayProfile,
  renderThumbnail,
  children,
}: {
  entity: SceneEntity;
  authoringEntityId: string;
  assets: AssetManifest;
  selected: boolean;
  primary: boolean;
  editable: boolean;
  playing: boolean;
  physicsEnabled: boolean;
  ownRigidBody?: RigidBodyComponent;
  rigidBodyOwner?: RigidBodyComponent;
  /** False when this Entity or one of its ancestors is disabled. */
  effectivelyEnabled: boolean;
  /** Restarts this Entity's local runtime content without remounting children. */
  runtimeRevision: number;
  transformMode: TransformMode;
  transformSpace: TransformSpace;
  gizmo: SceneSettings["editor"]["gizmo"];
  projectPath?: string;
  onTransformCommit: (entityId: string, patch: TransformPatch) => void;
  onDraggingChange: (dragging: boolean) => void;
  transformDraggingRef: { current: boolean };
  materialDragActive: boolean;
  /** Mesh Component on this Entity a dragged Material would land on, if any. */
  materialDropComponentId: string | null;
  displayMode: SceneViewportDisplayMode;
  displayProfile: SceneViewportDisplayProfile;
  renderThumbnail: boolean;
  children?: ReactNode;
}) {
  const objectRef = useRef<Group>(null!);
  const transformControlsRef = useRef<ElementRef<typeof TransformControls>>(null);
  const transform = getTransform(entity);
  const enabledColliders = entity.components.filter(
    (component): component is ColliderComponent =>
      component.type === "collider" && component.enabled,
  );
  const viewportMaterialStyle = getEntityMeshMaterialStyle(
    displayMode,
    enabledColliders.some((component) => component.shape === "box"),
    enabledColliders.some((component) => component.shape === "mesh"),
  );
  const xriftWrapperComponents = entity.components.filter(
    (
      component,
    ): component is Extract<SceneComponent, { type: "xrift-component" }> =>
      component.type === "xrift-component" &&
      isOfficialXriftWrapperComponent(component),
  );
  const scriptComponents = effectivelyEnabled
    ? entity.components.filter(
        (component): component is Extract<SceneComponent, { type: "script" }> =>
          component.type === "script" && component.enabled,
      )
    : [];
  // Stable per Entity: the official Interactable writes this into userData on
  // every change, and a fresh closure each render would rewrite it every time.
  const handleInteract = useCallback(
    () => emitXriftInteraction(entity.id),
    [entity.id],
  );
  // Triggers run in Play only, like Scripts: interacting while editing would
  // change Entities the author is still arranging.
  const interactionTriggerComponents =
    playing && effectivelyEnabled
      ? entity.components.filter(
          (
            component,
          ): component is Extract<SceneComponent, { type: "interaction-trigger" }> =>
            component.type === "interaction-trigger" && component.enabled,
        )
      : [];
  const entityWindComponent = entity.components.find(
    (component): component is VegetationWindComponent =>
      component.type === "vegetation-wind",
  );
  /*
   * What the Entity's graphs start on `event/onStart`, read here rather than
   * waited for.
   *
   * The graph runtime below runs before this Entity's Model has attached its
   * animation bridge — it is rendered first, and the bridge only exists once
   * the Model has loaded — so a clip started by `event/onStart` is pushed at a
   * Model that cannot hear it yet, and nothing retries. Handing the Model the
   * cues instead lets it start them when it is ready, which is the same thing
   * a published world does with a graph embedded in the glTF.
   */
  const graphAnimationCues = useMemo(
    () =>
      interactionTriggerComponents.flatMap((component) => {
        const graphAsset = assets.assets[component.interactivityAssetId];
        return graphAsset?.kind === "interactivity"
          ? getKhrInteractivityOnStartAnimationCues(graphAsset.extension)
          : [];
      }),
    [assets, interactionTriggerComponents],
  );
  const entityVisuals = (
    <Fragment key={runtimeRevision}>
      {interactionTriggerComponents.map((component, index) => {
        const graphAsset = assets.assets[component.interactivityAssetId];
        if (graphAsset?.kind !== "interactivity") return null;
        return (
          <XriftInteractionTriggerRuntime
            key={component.id}
            entityId={entity.id}
            graph={graphAsset.extension}
            componentId={component.id}
            order={index}
            playing={playing}
          />
        );
      })}
      {scriptComponents.map((component) => (
        <EntityScriptVisual
          key={component.id}
          component={component}
          entityId={entity.id}
          entityName={entity.name}
        />
      ))}
      {entity.components.map((component) =>
        component.type === "xrift-component" &&
        isOfficialXriftWrapperComponent(component) ? null : (
          <ComponentVisual
            key={component.id}
            component={component}
            graphAnimationCues={graphAnimationCues}
            playing={playing}
            assets={assets}
            selected={selected}
            materialDragActive={materialDragActive}
            materialDropHighlighted={materialDropComponentId === component.id}
            viewportMaterialStyle={viewportMaterialStyle}
            showHelpers={displayProfile.showHelpers}
            renderThumbnail={renderThumbnail}
            showSceneLighting={displayProfile.showSceneLighting}
            showAllColliders={displayProfile.showAllColliders}
            effectivelyEnabled={effectivelyEnabled}
            projectPath={projectPath}
            entityModelNode={entity.modelNode}
          />
        ),
      )}
    </Fragment>
  );
  const windScopedVisuals = entityWindComponent ? (
    <EntityWindScope component={entityWindComponent}>
      {entityVisuals}
    </EntityWindScope>
  ) : (
    entityVisuals
  );
  const ownedColliderVisuals = rigidBodyOwner ? (
    <RuntimeOwnedColliderContent
      entity={entity}
      bodyType={rigidBodyOwner.bodyType}
      autoColliders={rigidBodyOwner.autoColliders}
    >
      {windScopedVisuals}
    </RuntimeOwnedColliderContent>
  ) : (
    windScopedVisuals
  );
  const modelNodeMeshCollider = entity.modelNode
    ? entity.components.find(
        (
          component,
        ): component is Extract<ColliderComponent, { shape: "mesh" }> =>
          component.type === "collider" &&
          component.enabled &&
          component.shape === "mesh",
      )
    : undefined;
  const modelNodeColliderShapes =
    physicsEnabled && entity.modelNode && modelNodeMeshCollider ? (
      <ModelNodeMeshColliderShapes
        modelNode={entity.modelNode}
        collider={modelNodeMeshCollider}
        assets={assets}
        projectPath={projectPath}
      />
    ) : null;

  const setTransformControlsRef = useCallback(
    (controls: ElementRef<typeof TransformControls> | null) => {
      transformControlsRef.current = controls;
      muteTransformGizmo(controls);
    },
    [],
  );

  useLayoutEffect(() => {
    if (!primary || !editable || !transform) return;
    muteTransformGizmo(transformControlsRef.current);
  }, [editable, primary, transform]);

  const commitTransform = () => {
    const object = objectRef.current;
    if (!object || !transform) return;
    onTransformCommit(authoringEntityId, {
      position: [object.position.x, object.position.y, object.position.z],
      rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
      scale: [object.scale.x, object.scale.y, object.scale.z],
    });
  };

  return (
    <>
      <group
        ref={objectRef}
        name={entity.name}
        visible={effectivelyEnabled}
        position={transform?.position ?? [0, 0, 0]}
        rotation={transform?.rotation ?? [0, 0, 0]}
        scale={transform?.scale ?? [1, 1, 1]}
        userData={{ authoringEntityId, renderedEntityId: entity.id }}
      >
        <OfficialXriftEntityWrappers
          components={xriftWrapperComponents}
          {...(playing ? { onInteract: handleInteract } : {})}
        >
          {physicsEnabled ? (
            ownRigidBody ? (
              <RuntimeOwnedRigidBody component={ownRigidBody}>
                {ownedColliderVisuals}
                {modelNodeColliderShapes}
                {children}
              </RuntimeOwnedRigidBody>
            ) : rigidBodyOwner ? (
              <>
                {ownedColliderVisuals}
                {modelNodeColliderShapes}
                {children}
              </>
            ) : (
              <RuntimePhysicsEntity entity={entity}>
                {entityVisuals}
                {modelNodeColliderShapes}
                {children}
              </RuntimePhysicsEntity>
            )
          ) : (
            <>
              {entityVisuals}
              {children}
            </>
          )}
        </OfficialXriftEntityWrappers>
      </group>
      {primary &&
      editable &&
      transform &&
      displayMode !== "colliders" &&
      entity.id === authoringEntityId ? (
        <EntityTransformGizmo
          controlsRef={setTransformControlsRef}
          objectRef={objectRef}
          transformMode={transformMode}
          transformSpace={transformSpace}
          gizmo={gizmo}
          onDragStart={() => {
            transformDraggingRef.current = true;
            onDraggingChange(true);
          }}
          onDragEnd={() => {
            commitTransform();
            transformDraggingRef.current = false;
            onDraggingChange(false);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * The transform gizmo for the primary selected Entity.
 *
 * Three positions the gizmo handles and the drag plane in the controls' own
 * parent space, so the controls have to hang off the Scene root. Written where
 * they are used - inside the Entity's ancestors, and inside a RigidBody while
 * physics is armed - the ancestors' transform is applied a second time: a
 * child Entity's gizmo draws away from the object it moves, and the drag plane
 * drifts with it so a drag moves the object by the wrong amount.
 */
function EntityTransformGizmo({
  controlsRef,
  objectRef,
  transformMode,
  transformSpace,
  gizmo,
  onDragStart,
  onDragEnd,
}: {
  controlsRef: (controls: ElementRef<typeof TransformControls> | null) => void;
  objectRef: MutableRefObject<Group>;
  transformMode: TransformMode;
  transformSpace: TransformSpace;
  gizmo: SceneSettings["editor"]["gizmo"];
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const sceneRoot = useThree((state) => state.scene);
  return createPortal(
    <TransformControls
      ref={controlsRef}
      object={objectRef}
      mode={transformMode}
      space={transformSpace}
      size={gizmo.size}
      // null, not undefined: three reads these live during a drag, and a
      // removed prop is not guaranteed to clear the previous step.
      translationSnap={gizmo.snapEnabled ? gizmo.translateSnap : null}
      rotationSnap={
        gizmo.snapEnabled ? (gizmo.rotateSnapDegrees * Math.PI) / 180 : null
      }
      scaleSnap={gizmo.snapEnabled ? gizmo.scaleSnap : null}
      onMouseDown={onDragStart}
      onMouseUp={onDragEnd}
    />,
    sceneRoot,
  );
}

type SceneDropHit = {
  groundPosition: Vec3 | null;
  /** Intersection transformed into the hit mesh's local coordinates. */
  localPosition: Vec3 | null;
  authoringEntityId: string | null;
  renderedEntityId: string | null;
  meshComponentId: string | null;
  /** Authoring Entity ids of every surface on the ray, front to back. */
  rayEntityIds: string[];
  /** Authoring Entity ids with an origin near the pointer, nearest first. */
  originEntityIds: string[];
};

const XRIFT_TERRAIN_INVERSE: Partial<
  Record<TerrainViewportBrushKind, TerrainViewportBrushKind>
> = {
  raise: "lower",
  lower: "raise",
  "hole-add": "hole-remove",
  "hole-remove": "hole-add",
  "grass-paint": "grass-erase",
  "grass-erase": "grass-paint",
};

/** Ctrl swaps a brush for its opposite without a trip to the panel. */
function invertTerrainBrush(
  editing: TerrainViewportEditing,
  inverted: boolean,
): TerrainViewportEditing {
  if (!inverted) return editing;
  const kind = XRIFT_TERRAIN_INVERSE[editing.kind];
  return kind ? { ...editing, kind } : editing;
}

/**
 * Places the brush cursor in the armed Terrain's own space.
 *
 * The hover centre arrives as terrain-local X/Z, so the cursor is parented to
 * the same object the hit was measured against; anything else would need the
 * transform reapplied by hand and would drift as soon as the Terrain moved.
 */
function TerrainBrushCursorBinding({
  terrain,
  entityId,
  kind,
  radius,
  falloff,
  hoverRef,
}: {
  terrain: TerrainGeometry;
  entityId: string;
  kind: TerrainViewportBrushKind;
  radius: number;
  falloff: number;
  hoverRef: MutableRefObject<[number, number] | null>;
}) {
  const { scene } = useThree();
  const [host, setHost] = useState<Object3D | null>(null);
  const [center, setCenter] = useState<[number, number] | null>(null);

  useEffect(() => {
    let found: Object3D | null = null;
    scene.traverse((object) => {
      if (found) return;
      if (object.userData.authoringEntityId === entityId) found = object;
    });
    setHost(found);
  }, [entityId, scene]);

  // The centre lives in a ref so pointer moves stay cheap; this pulls it into
  // state at frame rate for the one component that renders it.
  useFrame(() => {
    const next = hoverRef.current;
    setCenter((current) => {
      if (next === null) return current === null ? current : null;
      if (current && current[0] === next[0] && current[1] === next[1]) {
        return current;
      }
      return [next[0], next[1]];
    });
  });

  if (!host) return null;
  return createPortal(
    <TerrainBrushCursor
      terrain={terrain}
      kind={kind}
      radius={radius}
      falloff={falloff}
      center={center}
    />,
    host,
  );
}

type SceneDropResolver = (
  clientX: number,
  clientY: number,
  options?: { includeEntityOriginFallback?: boolean },
) => SceneDropHit;

function entityPointerMetadata(object: Object3D): {
  authoringEntityId: string;
  renderedEntityId: string;
  meshComponentId: string | null;
} | null {
  let current: Object3D | null = object;
  let meshComponentId: string | null = null;
  while (current) {
    const candidateMeshComponentId = current.userData.meshComponentId;
    if (
      meshComponentId === null &&
      typeof candidateMeshComponentId === "string"
    ) {
      meshComponentId = candidateMeshComponentId;
    }
    const authoringEntityId = current.userData.authoringEntityId;
    const renderedEntityId = current.userData.renderedEntityId;
    if (
      typeof authoringEntityId === "string" &&
      typeof renderedEntityId === "string"
    ) {
      return { authoringEntityId, renderedEntityId, meshComponentId };
    }
    current = current.parent;
  }
  return null;
}

function isObjectVisibleInHierarchy(object: Object3D): boolean {
  let current: Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

type MaterialDropReadyTarget = {
  status: "ready";
  entityId: string;
  meshComponentId: string;
};

type MaterialDropRejectedTarget = {
  status: "rejected";
  message: string;
};

type MaterialDropTarget =
  | MaterialDropReadyTarget
  | MaterialDropRejectedTarget;

function resolveMaterialDropTarget(
  scene: SceneDocument,
  assets: AssetManifest,
  hit: SceneDropHit | undefined,
): MaterialDropTarget {
  if (
    !hit?.authoringEntityId ||
    !hit.renderedEntityId ||
    !hit.meshComponentId
  ) {
    return {
      status: "rejected",
      message: "Materialを適用するMeshの上へドロップしてください",
    };
  }
  if (hit.renderedEntityId !== hit.authoringEntityId) {
    return {
      status: "rejected",
      message:
        "Prefab内のMeshはインスタンスから直接変更できません。Prefab Assetを編集してください",
    };
  }

  const entity = scene.entities[hit.authoringEntityId];
  const mesh = entity?.components.find(
    (component): component is MeshComponent =>
      component.type === "mesh" && component.id === hit.meshComponentId,
  );
  if (!entity?.enabled || !mesh?.enabled) {
    return {
      status: "rejected",
      message: "ドロップ先に有効なMeshがありません",
    };
  }
  const target = getMaterialAssignmentTarget(
    scene,
    assets,
    hit.authoringEntityId,
    hit.meshComponentId,
  );
  if (!target.ready) {
    return {
      status: "rejected",
      message:
        target.reason === "slot-missing"
          ? "ドロップ先のMeshに適用できるMaterial slotがありません"
          : "ドロップ先に編集可能なMeshがありません",
    };
  }
  return {
    status: "ready",
    entityId: hit.authoringEntityId,
    meshComponentId: target.meshId,
  };
}

function materialDropTargetsEqual(
  left: MaterialDropTarget | null,
  right: MaterialDropTarget | null,
): boolean {
  if (left === right) return true;
  if (!left || !right || left.status !== right.status) return false;
  if (left.status === "rejected" && right.status === "rejected") {
    return left.message === right.message;
  }
  return (
    left.status === "ready" &&
    right.status === "ready" &&
    left.entityId === right.entityId &&
    left.meshComponentId === right.meshComponentId
  );
}

/** Keeps DOM drag events aligned with the live Orbit camera and scene graph. */
function SceneDropProjectionBridge({
  resolverRef,
}: {
  resolverRef: { current: SceneDropResolver | null };
}) {
  const { camera, gl, scene } = useThree();
  const raycaster = useMemo(() => new Raycaster(), []);
  const pointer = useMemo(() => new Vector2(), []);
  const groundPlane = useMemo(
    () => new Plane(new Vector3(0, 1, 0), 0),
    [],
  );
  const groundHit = useMemo(() => new Vector3(), []);
  const entityWorldPosition = useMemo(() => new Vector3(), []);
  const entityNdcPosition = useMemo(() => new Vector3(), []);
  const localHitPosition = useMemo(() => new Vector3(), []);

  useLayoutEffect(() => {
    resolverRef.current = (clientX, clientY, options) => {
      const bounds = gl.domElement.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) {
        return {
          groundPosition: null,
          localPosition: null,
          authoringEntityId: null,
          renderedEntityId: null,
          meshComponentId: null,
          rayEntityIds: [],
          originEntityIds: [],
        };
      }
      pointer.set(
        ((clientX - bounds.left) / bounds.width) * 2 - 1,
        -((clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);

      let authoringEntityId: string | null = null;
      let renderedEntityId: string | null = null;
      let meshComponentId: string | null = null;
      let localPosition: Vec3 | null = null;
      const rayEntityIds: string[] = [];
      const seenRayEntityIds = new Set<string>();
      for (const intersection of raycaster.intersectObjects(scene.children, true)) {
        if (!isObjectVisibleInHierarchy(intersection.object)) continue;
        const metadata = entityPointerMetadata(intersection.object);
        if (
          !metadata ||
          (!options?.includeEntityOriginFallback && !metadata.meshComponentId)
        ) {
          continue;
        }
        if (!seenRayEntityIds.has(metadata.authoringEntityId)) {
          seenRayEntityIds.add(metadata.authoringEntityId);
          rayEntityIds.push(metadata.authoringEntityId);
        }
        if (authoringEntityId !== null) continue;
        authoringEntityId = metadata.authoringEntityId;
        renderedEntityId = metadata.renderedEntityId;
        meshComponentId = metadata.meshComponentId;
        localHitPosition.copy(intersection.point);
        intersection.object.worldToLocal(localHitPosition);
        localPosition = [localHitPosition.x, localHitPosition.y, localHitPosition.z];
      }
      const originEntityIds: string[] = [];
      if (options?.includeEntityOriginFallback) {
        const maximumDistanceSquared =
          SCENE_VIEW_ENTITY_ORIGIN_HIT_RADIUS_PX *
          SCENE_VIEW_ENTITY_ORIGIN_HIT_RADIUS_PX;
        const originCandidates: Array<{
          authoringEntityId: string;
          renderedEntityId: string;
          distanceSquared: number;
          depth: number;
        }> = [];
        scene.traverse((object) => {
          const candidateAuthoringEntityId = object.userData.authoringEntityId;
          const candidateRenderedEntityId = object.userData.renderedEntityId;
          if (
            typeof candidateAuthoringEntityId !== "string" ||
            typeof candidateRenderedEntityId !== "string"
          ) {
            return;
          }
          if (!isObjectVisibleInHierarchy(object)) return;
          object.getWorldPosition(entityWorldPosition);
          entityNdcPosition.copy(entityWorldPosition).project(camera);
          if (
            !Number.isFinite(entityNdcPosition.x) ||
            !Number.isFinite(entityNdcPosition.y) ||
            entityNdcPosition.z < -1 ||
            entityNdcPosition.z > 1
          ) {
            return;
          }
          const candidateX =
            bounds.left + ((entityNdcPosition.x + 1) / 2) * bounds.width;
          const candidateY =
            bounds.top + ((1 - entityNdcPosition.y) / 2) * bounds.height;
          const deltaX = clientX - candidateX;
          const deltaY = clientY - candidateY;
          const distanceSquared = deltaX * deltaX + deltaY * deltaY;
          if (distanceSquared > maximumDistanceSquared) return;
          originCandidates.push({
            authoringEntityId: candidateAuthoringEntityId,
            renderedEntityId: candidateRenderedEntityId,
            distanceSquared,
            depth: entityNdcPosition.z,
          });
        });
        originCandidates.sort(
          (a, b) => a.distanceSquared - b.distanceSquared || a.depth - b.depth,
        );
        const seenOriginEntityIds = new Set<string>();
        for (const candidate of originCandidates) {
          if (seenOriginEntityIds.has(candidate.authoringEntityId)) continue;
          seenOriginEntityIds.add(candidate.authoringEntityId);
          originEntityIds.push(candidate.authoringEntityId);
        }
        if (!authoringEntityId && originCandidates.length > 0) {
          authoringEntityId = originCandidates[0].authoringEntityId;
          renderedEntityId = originCandidates[0].renderedEntityId;
        }
      }
      const position = raycaster.ray.intersectPlane(groundPlane, groundHit);
      return {
        groundPosition: position
          ? [position.x, 0, position.z]
          : null,
        localPosition,
        authoringEntityId,
        renderedEntityId,
        meshComponentId,
        rayEntityIds,
        originEntityIds,
      };
    };
    return () => {
      resolverRef.current = null;
    };
  }, [
    camera,
    entityNdcPosition,
    entityWorldPosition,
    gl,
    groundHit,
    groundPlane,
    pointer,
    raycaster,
    resolverRef,
    scene,
  ]);

  return null;
}

/** Thumbnail capture hides selection; one shared empty set keeps the identity. */
const EMPTY_SELECTION: ReadonlySet<string> = new Set<string>();

/**
 * One Entity of the Scene View tree, subscribed to its own slice of the Scene.
 *
 * Only three props, and all three come from the parent Entity rather than from
 * the Scene: everything else arrives through the store (per Entity) or the
 * shared context (identical for every node). That is what lets `memo` do its
 * job — editing one Entity re-renders that Entity, not the whole Scene.
 */
const SceneEntityHierarchy = memo(function SceneEntityHierarchy({
  entityId,
  inheritedRigidBody,
  ancestorEnabled = true,
}: {
  entityId: string;
  inheritedRigidBody?: RigidBodyComponent;
  ancestorEnabled?: boolean;
}) {
  const node = useSceneEntityNode(entityId);
  const shared = useSceneEntityTreeShared();
  const entity = node.entity;
  if (!entity) return null;
  const ownRigidBody = entity.components.find(
    (component): component is RigidBodyComponent =>
      component.type === "rigid-body" && component.enabled,
  );
  const rigidBodyOwner = ownRigidBody ?? inheritedRigidBody;
  const effectivelyEnabled = ancestorEnabled && entity.enabled;

  return (
    <EntityObject
      entity={entity}
      authoringEntityId={node.authoringEntityId}
      assets={shared.assets}
      projectPath={shared.projectPath}
      selected={node.selected}
      primary={node.primary}
      editable={shared.editable}
      playing={shared.playing}
      physicsEnabled={shared.physicsEnabled && effectivelyEnabled}
      ownRigidBody={ownRigidBody}
      rigidBodyOwner={rigidBodyOwner}
      effectivelyEnabled={effectivelyEnabled}
      runtimeRevision={node.runtimeRevision}
      transformMode={shared.transformMode}
      transformSpace={shared.transformSpace}
      gizmo={shared.gizmo}
      onTransformCommit={shared.onTransformCommit}
      onDraggingChange={shared.onDraggingChange}
      transformDraggingRef={shared.transformDraggingRef}
      materialDragActive={shared.materialDragActive}
      materialDropComponentId={node.materialDropComponentId}
      displayMode={shared.displayMode}
      displayProfile={shared.displayProfile}
      renderThumbnail={shared.renderThumbnail}
    >
      {node.childIds.map((childId) => (
        <SceneEntityHierarchy
          key={childId}
          entityId={childId}
          inheritedRigidBody={rigidBodyOwner}
          ancestorEnabled={effectivelyEnabled}
        />
      ))}
    </EntityObject>
  );
});

function findSceneEntityObject(
  scene: Object3D,
  entityId: string,
): Object3D | null {
  let result: Object3D | null = null;
  scene.traverse((object) => {
    if (
      !result &&
      object.userData.authoringEntityId === entityId &&
      object.userData.renderedEntityId === entityId
    ) {
      result = object;
    }
  });
  return result;
}

type SettleableOrbitControls = {
  enableDamping: boolean;
  update: () => void;
};

/**
 * Drops the momentum OrbitControls is still easing out.
 *
 * Damping keeps applying the last drag's rotation and pan for dozens of frames
 * after the pointer is released, and `update()` only clears that residue when
 * damping is off. Without this flush, a camera pose written by focus - or the
 * pose restored when focus is left - is dragged off the object over the next
 * few frames, and a gizmo drag that starts on a still-gliding camera measures
 * against a viewpoint that is no longer where the author is looking.
 */
function settleOrbitControls(controls: SettleableOrbitControls | null): void {
  if (!controls) return;
  const damping = controls.enableDamping;
  controls.enableDamping = false;
  controls.update();
  controls.enableDamping = damping;
}

/**
 * Where a caller can put the Scene View camera.
 *
 * The named views are the ones a person reaches for while debugging a layout —
 * looking straight down to check spacing, straight on to check alignment — and
 * they are exactly what someone driving the editor through MCP cannot do by
 * dragging. `focusEntityId` is the same framing the F key performs, so an agent
 * and a person end up at the same place.
 */
export const SCENE_VIEW_CAMERA_PRESETS = [
  "top",
  "bottom",
  "front",
  "back",
  "left",
  "right",
  "iso",
] as const;

export type SceneViewCameraPreset = (typeof SCENE_VIEW_CAMERA_PRESETS)[number];

export type SceneViewCameraRequest = {
  /** Must change to run a new move, like the other viewport requests. */
  id: number;
  preset?: SceneViewCameraPreset;
  /** Frames this Entity's real rendered bounds, as the F key does. */
  focusEntityId?: string;
  /** Explicit placement. `target` alone keeps the current distance. */
  position?: Vec3;
  target?: Vec3;
  /** Overrides the distance a preset or a framing would have chosen. */
  distance?: number;
};

export type SceneViewCameraResult = {
  requestId: number;
  ok: boolean;
  position: Vec3;
  target: Vec3;
  /** Set when the move framed an Entity's bounds rather than a bare point. */
  framedEntityId?: string;
  message?: string;
};

/** Unit view directions, pointing from the target toward the camera. */
const SCENE_VIEW_CAMERA_DIRECTIONS: Record<SceneViewCameraPreset, Vec3> = {
  top: [0, 1, 0],
  bottom: [0, -1, 0],
  front: [0, 0, 1],
  back: [0, 0, -1],
  left: [-1, 0, 0],
  right: [1, 0, 0],
  iso: [1, 0.8, 1],
};

function CameraControls({
  editorMode,
  projectKind,
  transformDragging,
  terrainEditing,
  frameSelectionRequest,
  exitFocusRequest,
  frameEntityId,
  frameEntityName,
  frameTarget,
  cameraRequest,
  onCameraResult,
  onFocusChange,
}: {
  editorMode: EditorMode;
  projectKind: VisualProjectKind;
  transformDragging: boolean;
  terrainEditing: boolean;
  frameSelectionRequest: number;
  exitFocusRequest: number;
  frameEntityId: string | null;
  frameEntityName: string | null;
  frameTarget?: Vec3;
  cameraRequest?: SceneViewCameraRequest | null;
  onCameraResult?: (result: SceneViewCameraResult) => void;
  onFocusChange: (focus: SceneFocusState | null) => void;
}) {
  const camera = useThree((state) => state.camera);
  const threeScene = useThree((state) => state.scene);
  const controlsRef = useRef<ElementRef<typeof OrbitControls>>(null!);
  const previousMode = useRef<EditorMode>(editorMode);
  const savedEditPosition = useRef(new Vector3(7, 5, 7));
  const savedEditTarget = useRef(new Vector3(...EDIT_CAMERA_TARGET));
  const focusSnapshotRef = useRef<EditCameraSnapshot | null>(null);
  const focusedEntityIdRef = useRef<string | null>(null);
  const handledFrameRequestRef = useRef(frameSelectionRequest);

  const restoreFocusSnapshot = useCallback(() => {
    const controls = controlsRef.current;
    const snapshot = focusSnapshotRef.current;
    if (!controls || !snapshot) {
      focusSnapshotRef.current = null;
      focusedEntityIdRef.current = null;
      onFocusChange(null);
      return false;
    }
    settleOrbitControls(controls);
    camera.position.copy(snapshot.position);
    camera.quaternion.copy(snapshot.quaternion);
    camera.up.copy(snapshot.up);
    camera.zoom = snapshot.zoom;
    controls.target.copy(snapshot.target);
    settleOrbitControls(controls);
    camera.updateProjectionMatrix();
    focusSnapshotRef.current = null;
    focusedEntityIdRef.current = null;
    onFocusChange(null);
    return true;
  }, [camera, onFocusChange]);

  useLayoutEffect(() => {
    const previous = previousMode.current;
    const controls = controlsRef.current;
    if (previous === "edit" && editorMode === "play") {
      restoreFocusSnapshot();
      savedEditPosition.current.copy(camera.position);
      if (controls) savedEditTarget.current.copy(controls.target);
    } else if (previous === "play" && editorMode === "edit") {
      camera.position.copy(savedEditPosition.current);
      if (controls) {
        controls.target.copy(savedEditTarget.current);
        controls.update();
      } else {
        camera.lookAt(savedEditTarget.current);
      }
      camera.updateProjectionMatrix();
    }
    previousMode.current = editorMode;
  }, [camera, editorMode, restoreFocusSnapshot]);

  useLayoutEffect(() => {
    const controls = controlsRef.current;
    if (frameSelectionRequest === 0) {
      handledFrameRequestRef.current = 0;
      return;
    }
    if (
      handledFrameRequestRef.current === frameSelectionRequest ||
      editorMode !== "edit" ||
      !controls ||
      !frameEntityId
    ) {
      return;
    }
    handledFrameRequestRef.current = frameSelectionRequest;

    if (focusedEntityIdRef.current === frameEntityId) {
      restoreFocusSnapshot();
      return;
    }

    // Read the pose only after the previous drag's momentum is spent, or the
    // snapshot restores a camera the author never came to rest at.
    settleOrbitControls(controls);

    if (!focusSnapshotRef.current) {
      focusSnapshotRef.current = {
        position: camera.position.clone(),
        quaternion: camera.quaternion.clone(),
        target: controls.target.clone(),
        up: camera.up.clone(),
        zoom: camera.zoom,
      };
    }

    const selectedObject = findSceneEntityObject(threeScene, frameEntityId);

    const target = new Vector3();
    let radius = 0;
    if (selectedObject) {
      // Measured from the drawn content only. Framing the raw Object3D bounds
      // would follow the collider wireframe that appears with the selection
      // and leave the gizmo, which sits on the Entity origin, off centre.
      const bounds = computeEntityFocusBounds(selectedObject);
      if (bounds) {
        target.fromArray(bounds.center);
        radius = bounds.radius;
      } else {
        selectedObject.updateWorldMatrix(true, true);
        selectedObject.getWorldPosition(target);
      }
    } else if (frameTarget) {
      target.fromArray(frameTarget);
    } else {
      target.copy(controls.target);
    }

    const offset = camera.position.clone().sub(controls.target);
    if (offset.lengthSq() < 0.01) offset.set(4, 3, 4);
    const distance = resolveFocusDistance({
      radius,
      currentDistance: Math.min(8, offset.length()),
      ...(camera instanceof PerspectiveCamera
        ? { verticalFov: MathUtils.degToRad(camera.fov), aspect: camera.aspect }
        : {}),
      minDistance: 2.5,
      maxDistance: camera.far * 0.8,
    });
    offset.setLength(distance);
    controls.target.copy(target);
    camera.position.copy(target.clone().add(offset));
    settleOrbitControls(controls);
    focusedEntityIdRef.current = frameEntityId;
    onFocusChange({
      entityId: frameEntityId,
      entityName: frameEntityName ?? frameEntityId,
    });
  }, [
    camera,
    editorMode,
    frameEntityId,
    frameEntityName,
    frameSelectionRequest,
    frameTarget,
    onFocusChange,
    restoreFocusSnapshot,
    threeScene,
  ]);

  useLayoutEffect(() => {
    if (exitFocusRequest === 0) return;
    restoreFocusSnapshot();
  }, [exitFocusRequest, restoreFocusSnapshot]);

  // A gizmo drag is measured against the camera it starts with, and orbit
  // damping is frozen rather than finished while the controls are disabled.
  // Spending it here keeps the drag steady and stops the view from lurching
  // when the drag hands the camera back.
  useLayoutEffect(() => {
    if (!transformDragging) return;
    settleOrbitControls(controlsRef.current);
  }, [transformDragging]);

  const handledCameraRequestRef = useRef(0);
  useLayoutEffect(() => {
    const request = cameraRequest;
    if (!request || handledCameraRequestRef.current === request.id) return;
    handledCameraRequestRef.current = request.id;
    const controls = controlsRef.current;
    const report = (result: Omit<SceneViewCameraResult, "requestId">) =>
      onCameraResult?.({ ...result, requestId: request.id });
    if (!controls) {
      report({
        ok: false,
        position: camera.position.toArray() as Vec3,
        target: [0, 0, 0],
        message: "Scene Viewのカメラがまだ準備できていません",
      });
      return;
    }
    const currentTarget = controls.target.clone();
    const currentPosition = camera.position.clone();
    const finish = (message?: string) => {
      settleOrbitControls(controls);
      camera.updateProjectionMatrix();
      report({
        ok: true,
        position: camera.position.toArray() as Vec3,
        target: controls.target.toArray() as Vec3,
        ...(request.focusEntityId
          ? { framedEntityId: request.focusEntityId }
          : {}),
        ...(message ? { message } : {}),
      });
    };

    // An explicit placement is taken literally: a caller that computed a
    // position from bounds should not have it re-derived here.
    if (request.position || request.target) {
      const target = request.target
        ? new Vector3(...request.target)
        : currentTarget;
      const position = request.position
        ? new Vector3(...request.position)
        : target
            .clone()
            .add(currentPosition.clone().sub(currentTarget));
      camera.position.copy(position);
      controls.target.copy(target);
      finish();
      return;
    }

    const target = new Vector3();
    let radius = 0;
    if (request.focusEntityId) {
      const object = findSceneEntityObject(threeScene, request.focusEntityId);
      if (!object) {
        report({
          ok: false,
          position: currentPosition.toArray() as Vec3,
          target: currentTarget.toArray() as Vec3,
          message: "指定されたEntityがScene Viewに見つかりません",
        });
        return;
      }
      // The same drawn-content measurement the F key uses, so an agent and a
      // person framing the same Entity land in the same place.
      const bounds = computeEntityFocusBounds(object);
      if (bounds) {
        target.fromArray(bounds.center);
        radius = bounds.radius;
      } else {
        object.updateWorldMatrix(true, true);
        object.getWorldPosition(target);
      }
    } else if (request.preset) {
      // A preset with no Entity keeps looking at whatever the view was on, so
      // switching to the top view answers "what does this look like from
      // above" rather than jumping back to the world origin.
      target.copy(currentTarget);
    } else {
      report({
        ok: false,
        position: currentPosition.toArray() as Vec3,
        target: currentTarget.toArray() as Vec3,
        message: "preset、focusEntityId、position/targetのいずれかを指定してください",
      });
      return;
    }

    // Keeping the current distance is what makes a named view read as "turn
    // and look from there": capping it would silently zoom in on a large
    // Terrain the caller had deliberately backed away from.
    const previous = currentPosition.clone().sub(currentTarget).length();
    const distance =
      request.distance ??
      resolveFocusDistance({
        radius,
        currentDistance: previous > 0.01 ? previous : 8,
        ...(camera instanceof PerspectiveCamera
          ? {
              verticalFov: MathUtils.degToRad(camera.fov),
              aspect: camera.aspect,
            }
          : {}),
        minDistance: 2.5,
        maxDistance: Number.POSITIVE_INFINITY,
      });
    const direction = request.preset
      ? new Vector3(...SCENE_VIEW_CAMERA_DIRECTIONS[request.preset])
      : currentPosition.clone().sub(currentTarget);
    if (direction.lengthSq() < 1e-6) direction.set(1, 0.8, 1);
    direction.setLength(Math.min(distance, camera.far * 0.8));
    camera.position.copy(target.clone().add(direction));
    controls.target.copy(target);
    // Straight down has no yaw to keep, and the default up vector makes the
    // view roll to an arbitrary heading. Pinning it keeps -Z up on screen.
    camera.up.set(
      0,
      request.preset === "top" || request.preset === "bottom" ? 0 : 1,
      request.preset === "top" ? -1 : request.preset === "bottom" ? 1 : 0,
    );
    finish();
  }, [camera, cameraRequest, onCameraResult, threeScene]);

  const enabled =
    editorMode === "edit"
      ? !transformDragging && !terrainEditing
      : projectKind === "item";

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enabled={enabled}
      target={EDIT_CAMERA_TARGET}
      minDistance={2}
      maxDistance={Math.max(30, camera.far * 0.8)}
      maxPolarAngle={Math.PI / 2 - 0.03}
      enableDamping
      dampingFactor={0.08}
    />
  );
}

function WorldPlayCameraController({
  initialPosition,
  initialYaw,
  isPressed,
  inputRef,
}: {
  initialPosition: Vec3;
  initialYaw: number;
  isPressed: (key: string) => boolean;
  inputRef: { current: WorldPlayCameraInput };
}) {
  const camera = useThree((state) => state.camera);
  const initializedRef = useRef(false);
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const movement = useMemo(() => new Vector3(), []);
  const forward = useMemo(() => new Vector3(), []);
  const right = useMemo(() => new Vector3(), []);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    camera.position.set(
      initialPosition[0],
      initialPosition[1] + WORLD_PLAY_CAMERA_EYE_HEIGHT,
      initialPosition[2],
    );
    yawRef.current = initialYaw;
    pitchRef.current = 0;
    camera.rotation.set(pitchRef.current, yawRef.current, 0, "YXZ");
    camera.updateProjectionMatrix();
  }, [camera, initialPosition, initialYaw]);

  useFrame(({ camera }, delta) => {
    const input = inputRef.current;
    if (input.deltaX !== 0 || input.deltaY !== 0) {
      // Play looks the way the pointer moves: drag right to turn right, drag
      // down to look down. See `applyWorldPlayCameraLook` for the signs.
      const look = applyWorldPlayCameraLook(
        { yaw: yawRef.current, pitch: pitchRef.current },
        input.deltaX,
        input.deltaY,
      );
      yawRef.current = look.yaw;
      pitchRef.current = look.pitch;
      input.deltaX = 0;
      input.deltaY = 0;
    }
    camera.rotation.set(pitchRef.current, yawRef.current, 0, "YXZ");

    movement.set(0, 0, 0);
    // `forward` already points along the camera's local -Z axis, so the
    // forward input must be positive here. The previous signs made W/S run
    // exactly opposite to the camera-facing direction.
    if (isPressed("w") || isPressed("arrowup")) movement.z += 1;
    if (isPressed("s") || isPressed("arrowdown")) movement.z -= 1;
    if (isPressed("a") || isPressed("arrowleft")) movement.x -= 1;
    if (isPressed("d") || isPressed("arrowright")) movement.x += 1;
    if (isPressed("e")) movement.y += 1;
    if (isPressed("q")) movement.y -= 1;
    if (movement.lengthSq() === 0) return;

    forward.set(0, 0, -1).applyEuler(camera.rotation);
    right.set(1, 0, 0).applyEuler(camera.rotation);
    movement.set(
      right.x * movement.x + forward.x * movement.z,
      movement.y,
      right.z * movement.x + forward.z * movement.z,
    );
    if (movement.lengthSq() > 1) movement.normalize();
    const speed = WORLD_PLAY_CAMERA_SPEED * (isPressed("shift") ? 2 : 1);
    camera.position.addScaledVector(movement, speed * Math.min(delta, 0.05));
  });

  return null;
}

function resolveProjectModelSource(
  asset: ModelAsset,
  projectPath: string | undefined,
): string | undefined {
  if (!projectPath?.trim() || asset.status !== "ready") return undefined;
  if (asset.source.kind !== "project") return undefined;
  const relativePath = normalizeProjectRelativePath(asset.source.relativePath);
  if (!relativePath || /^[a-z][a-z0-9+.-]*:/i.test(relativePath)) {
    return undefined;
  }
  return NATIVE_MODEL_EXTENSION_PATTERN.test(relativePath)
    ? relativePath
    : undefined;
}

function hasModelProxy(
  scene: SceneDocument,
  assets: AssetManifest,
  projectPath: string | undefined,
): boolean {
  return Object.values(scene.entities).some((entity) =>
    entity.components.some(
      (component) => {
        if (component.type !== "mesh") return false;
        const assetId =
          component.geometry?.kind === "asset"
            ? component.geometry.assetId
            : component.geometryAssetId;
        const asset = assets.assets[assetId];
        return (
          asset?.kind === "model" &&
          !resolveProjectModelSource(asset, projectPath)
        );
      },
    ),
  );
}

const SKYBOX_VERTEX_SHADER = `
  varying vec3 vDirection;
  uniform vec3 uCenter;
  void main() {
    vec3 worldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    vec3 worldCenter = (modelMatrix * vec4(uCenter, 1.0)).xyz;
    vDirection = worldPosition - worldCenter;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKYBOX_FRAGMENT_SHADER = `
  uniform sampler2D uTexture;
  uniform bool uHasTexture;
  uniform vec3 uTopColor;
  uniform vec3 uBottomColor;
  uniform float uOffset;
  uniform float uExponent;
  uniform float uExposure;
  uniform float uRotation;
  varying vec3 vDirection;
  void main() {
    vec3 direction = normalize(vDirection);
    vec3 color;
    if (uHasTexture) {
      vec2 uv = vec2(
        atan(direction.z, direction.x) * 0.15915494309189535 + 0.5,
        asin(clamp(direction.y, -1.0, 1.0)) * 0.3183098861837907 + 0.5
      );
      uv.x = fract(uv.x + uRotation * 0.15915494309189535);
      color = texture2D(uTexture, uv).rgb;
    } else {
      float t = clamp(direction.y * 0.5 + 0.5 + uOffset, 0.0, 1.0);
      t = pow(t, max(uExponent, 0.01));
      color = mix(uBottomColor, uTopColor, t);
    }
    gl_FragColor = vec4(color * uExposure, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function createDomeSkyGeometry(): SphereGeometry {
  const geometry = new SphereGeometry(0.5, 50, 50);
  const position = geometry.attributes.position;
  const radius = 0.5;
  const bottomLimit = 0.1;
  const curvatureRadiusSquared = 0.95 * 0.95;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index) / radius;
    let y = position.getY(index) / radius;
    const z = position.getZ(index) / radius;
    if (y < 0) {
      y *= 0.3;
      if (x * x + z * z < curvatureRadiusSquared) y = -bottomLimit;
    }
    position.setY(index, (y + bottomLimit) * radius);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createSkyGeometry(
  projection: SceneSettings["skybox"]["projection"],
): BoxGeometry | SphereGeometry {
  if (projection === "box") {
    const geometry = new BoxGeometry(1, 1, 1);
    geometry.translate(0, 0.5, 0);
    return geometry;
  }
  if (projection === "dome") return createDomeSkyGeometry();
  return new SphereGeometry(1, 32, 20);
}

function useSceneSkyboxTexture(
  assets: AssetManifest,
  imageAssetId: string | undefined,
  projectPath: string | undefined,
  flipY: boolean,
): Texture | null {
  const asset = imageAssetId ? assets.assets[imageAssetId] : undefined;
  const textureAsset =
    asset?.kind === "texture" && asset.source.kind === "project"
      ? (asset as TextureAsset & {
          source: { kind: "project"; relativePath: string };
        })
      : undefined;
  const skyboxAsset =
    asset?.kind === "skybox" && asset.source.kind === "project"
      ? (asset as SkyboxAsset & {
          source: { kind: "project"; relativePath: string };
        })
      : undefined;
  const sourceAsset = skyboxAsset ?? textureAsset;
  const textureSourceFormat = textureAsset
    ? getTextureSourceFormat(textureAsset)
    : undefined;
  const sourceFormat = skyboxAsset?.sourceFormat ?? textureSourceFormat;
  const assetFlipY = textureAsset?.importSettings.flipY ?? false;
  const resolvedFlipY = assetFlipY !== flipY;
  const textureKey = sourceAsset
    ? [
        projectPath ?? "",
        sourceAsset.id,
        sourceAsset.sourceHash ?? "",
        sourceAsset.source.relativePath,
        resolvedFlipY,
      ].join("\\n")
    : "";
  const [texture, setTexture] = useState<Texture | null>(null);

  useEffect(() => {
    let active = true;
    let ownedTexture: Texture | null = null;
    setTexture(null);
    if (!projectPath || !sourceAsset) {
      return () => {
        active = false;
      };
    }

    const readSource =
      skyboxAsset || isEnvironmentTextureAsset(textureAsset)
      ? tauri.readProjectFileDataUrl(projectPath, sourceAsset.source.relativePath)
      : readProjectTextureDataUrl(projectPath, textureAsset!);
    void readSource
      .then(async (dataUrl): Promise<Texture> => {
        if (sourceFormat === "hdr") {
          return await new HDRLoader().loadAsync(dataUrl);
        }
        if (sourceFormat === "exr") {
          return await new EXRLoader().loadAsync(dataUrl);
        }
        return await new TextureLoader().loadAsync(dataUrl);
      })
      .then((nextTexture) => {
        nextTexture.name = `${sourceAsset.name} (skybox)`;
        if (sourceFormat !== "hdr" && sourceFormat !== "exr") {
          nextTexture.colorSpace = SRGBColorSpace;
        }
        nextTexture.flipY = resolvedFlipY;
        nextTexture.mapping = EquirectangularReflectionMapping;
        nextTexture.needsUpdate = true;
        if (!active) {
          nextTexture.dispose();
          return;
        }
        ownedTexture = nextTexture;
        setTexture(nextTexture);
      })
      .catch(() => {
        if (active) setTexture(null);
      });

    return () => {
      active = false;
      ownedTexture?.dispose();
      ownedTexture = null;
    };
  }, [
    projectPath,
    resolvedFlipY,
    skyboxAsset,
    sourceAsset,
    sourceFormat,
    textureAsset,
    textureKey,
  ]);

  return texture;
}

function ImageSkyboxEnvironment({
  texture,
  settings,
}: {
  texture: Texture;
  settings: SceneSettings["skybox"];
}) {
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    const previousBackground = scene.background;
    const previousEnvironment = scene.environment;
    const previousBackgroundIntensity = scene.backgroundIntensity;
    const previousEnvironmentIntensity = scene.environmentIntensity;
    const previousBackgroundRotation = new Euler().copy(scene.backgroundRotation);
    const previousEnvironmentRotation = new Euler().copy(scene.environmentRotation);
    const rotation = (settings.rotationDegrees * Math.PI) / 180;

    texture.mapping = EquirectangularReflectionMapping;
    if (settings.iblEnabled) {
      scene.environment = texture;
      scene.environmentIntensity = settings.exposure;
      scene.environmentRotation.set(0, rotation, 0);
    }
    if (settings.enabled && settings.projection === "infinite") {
      scene.background = texture;
      scene.backgroundIntensity = settings.exposure;
      scene.backgroundRotation.set(0, rotation, 0);
    }

    return () => {
      scene.background = previousBackground;
      scene.environment = previousEnvironment;
      scene.backgroundIntensity = previousBackgroundIntensity;
      scene.environmentIntensity = previousEnvironmentIntensity;
      scene.backgroundRotation.copy(previousBackgroundRotation);
      scene.environmentRotation.copy(previousEnvironmentRotation);
    };
  }, [
    scene,
    settings.enabled,
    settings.exposure,
    settings.iblEnabled,
    settings.projection,
    settings.rotationDegrees,
    texture,
  ]);
  return null;
}

function ProjectedSkyboxPreview({
  texture,
  settings,
}: {
  texture: Texture | null;
  settings: SceneSettings["skybox"];
}) {
  const meshRef = useRef<Mesh>(null);
  const geometry = useMemo(
    () => createSkyGeometry(settings.projection),
    [settings.projection],
  );
  const rotation = useMemo(
    () =>
      settings.meshRotationDegrees.map((value) => MathUtils.degToRad(value)) as [
        number,
        number,
        number,
      ],
    [settings.meshRotationDegrees],
  );
  const center = settings.projection === "infinite" ? [0, 0, 0] : settings.center;
  const uniforms = useMemo(
    () => ({
      uTexture: { value: texture },
      uHasTexture: { value: Boolean(texture) },
      uTopColor: { value: new Color(settings.topColor) },
      uBottomColor: { value: new Color(settings.bottomColor) },
      uOffset: { value: settings.offset },
      uExponent: { value: settings.exponent },
      uExposure: { value: settings.exposure },
      uRotation: { value: MathUtils.degToRad(settings.rotationDegrees) },
      uCenter: { value: new Vector3(center[0], center[1], center[2]) },
    }),
    [
      center,
      settings.bottomColor,
      settings.exponent,
      settings.exposure,
      settings.offset,
      settings.rotationDegrees,
      settings.topColor,
      texture,
    ],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(({ camera }) => {
    if (settings.projection === "infinite" && meshRef.current) {
      meshRef.current.position.copy(camera.position);
    }
  });

  return (
    <>
      {texture &&
      (settings.iblEnabled ||
        (settings.enabled && settings.projection === "infinite")) ? (
        <ImageSkyboxEnvironment texture={texture} settings={settings} />
      ) : null}
      {settings.enabled &&
      !(settings.projection === "infinite" && texture) ? (
        <mesh
          ref={meshRef}
          geometry={geometry}
          position={
            settings.projection === "infinite" ? undefined : settings.meshPosition
          }
          rotation={settings.projection === "infinite" ? undefined : rotation}
          scale={settings.projection === "infinite" ? 100 : settings.meshScale}
          frustumCulled={false}
          renderOrder={-1}
        >
          <shaderMaterial
            side={BackSide}
            depthTest={false}
            depthWrite={false}
            vertexShader={SKYBOX_VERTEX_SHADER}
            fragmentShader={SKYBOX_FRAGMENT_SHADER}
            uniforms={uniforms}
          />
        </mesh>
      ) : null}
    </>
  );
}

import { ScenePostprocessing } from "./ScenePostprocessing";
import { THREE_BLENDING } from "./material-blending";

type EditorVegetationTarget = {
  object: Object3D;
  position: Vector3;
  rotation: Euler;
  phase: number;
  componentEnabled: boolean;
};

function SceneWind({
  sceneDocument,
  settings,
}: {
  sceneDocument: SceneDocument;
  settings: SceneSettings["vegetation"];
}) {
  const { scene } = useThree();
  const [targets, setTargets] = useState<EditorVegetationTarget[]>([]);

  useLayoutEffect(() => {
    const found: EditorVegetationTarget[] = [];
    const seen = new Set<Object3D>();
    scene.traverse((root) => {
      const entityId = root.userData.renderedEntityId;
      if (typeof entityId !== "string") return;
      const entity = sceneDocument.entities[entityId];
      if (!entity) return;
      const component = entity.components.find(
        (candidate): candidate is VegetationWindComponent =>
          candidate.type === "vegetation-wind",
      );
      if (!component) return;
      root.traverse((object) => {
        if (!(object as Mesh).isMesh || seen.has(object)) return;
        seen.add(object);
        const position = object.position.clone();
        const rotation = object.rotation.clone();
        let phase = 0;
        for (const character of `${entity.id}:${object.uuid}`) {
          phase = (phase * 31 + character.charCodeAt(0)) % 628;
        }
        found.push({
          object,
          position,
          rotation,
          phase: phase / 100,
          componentEnabled: component.enabled,
        });
      });
    });
    // EntityHierarchy is a sibling rendered below this behavior component.
    // Collect after commit so the initial Scene graph is already mounted.
    setTargets(found);
  }, [scene, sceneDocument]);

  useFrame((state) => {
    if (!settings.enabled || targets.length === 0) return;
    const elapsed = state.clock.getElapsedTime();
    for (const target of targets) {
      if (!target.componentEnabled) continue;
      const wave =
        Math.sin(elapsed * settings.windSpeed + target.phase) * 0.7 +
        Math.sin(
          elapsed * settings.windSpeed * 0.37 + target.phase * 1.7,
        ) * settings.gustStrength;
      target.object.position.copy(target.position);
      target.object.position.x += wave * settings.windStrength * 0.03;
      target.object.position.y +=
        Math.cos(elapsed * settings.windSpeed * 0.63 + target.phase) *
        settings.windStrength *
        0.01;
      target.object.rotation.copy(target.rotation);
      target.object.rotation.z += wave * settings.windStrength * 0.35;
      target.object.rotation.x += wave * settings.windStrength * 0.16;
    }
  });
  return null;
}

/**
 * Draws the scene's Sky Shader Material on the sky mesh. Scene Settings feeds
 * the framing uniforms the shader declares, so the Center, Rotation and
 * Brightness controls keep working the same way they do for the built-in sky.
 */
function SkyShaderPreview({
  shader,
  settings,
}: {
  shader: ClassicR3fMaterialShader;
  settings: SceneSettings["skybox"];
}) {
  const meshRef = useRef<Mesh>(null);
  const geometry = useMemo(
    () => createSkyGeometry(settings.projection),
    [settings.projection],
  );
  const material = useMemo(() => {
    const next = createClassicR3fMaterial(shader, {}, "");
    next.side = BackSide;
    next.depthTest = false;
    next.depthWrite = false;
    next.needsUpdate = true;
    return next;
  }, [shader]);
  const driven = useMemo(
    () => skyShaderDrivenUniforms(shader, settings),
    [settings, shader],
  );
  const rotation = useMemo(
    () =>
      settings.meshRotationDegrees.map((value) => MathUtils.degToRad(value)) as [
        number,
        number,
        number,
      ],
    [settings.meshRotationDegrees],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    for (const entry of driven) {
      const uniform = material.uniforms[entry.name];
      if (!uniform) continue;
      if (entry.kind === "number") {
        uniform.value = entry.value;
        continue;
      }
      const current = uniform.value;
      if (current instanceof Vector3) {
        current.set(entry.value[0], entry.value[1], entry.value[2]);
      } else {
        uniform.value = new Vector3(
          entry.value[0],
          entry.value[1],
          entry.value[2],
        );
      }
    }
  }, [driven, material]);

  useFrame(({ camera, clock }) => {
    if (settings.projection === "infinite" && meshRef.current) {
      meshRef.current.position.copy(camera.position);
    }
    const elapsed = clock.getElapsedTime();
    const specs = material.userData.xriftTimeUniforms as
      | TimeUniformSpec[]
      | undefined;
    if (!Array.isArray(specs)) return;
    for (const spec of specs) {
      const uniform = material.uniforms[spec.name];
      if (uniform) {
        applyTimeUniformValue(uniform as MutableUniformValue, spec, elapsed);
      }
    }
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      position={
        settings.projection === "infinite" ? undefined : settings.meshPosition
      }
      rotation={settings.projection === "infinite" ? undefined : rotation}
      scale={settings.projection === "infinite" ? 100 : settings.meshScale}
      frustumCulled={false}
      renderOrder={-1}
    />
  );
}

function SceneSkyboxPreview({
  settings,
  assets,
  projectPath,
}: {
  settings: SceneSettings["skybox"];
  assets: AssetManifest;
  projectPath: string | undefined;
}) {
  const skyShader = useMemo(
    () => resolveSkyShaderMaterial(assets, settings.materialAssetId),
    [assets, settings.materialAssetId],
  );
  // The shader owns the visible sky; the image path still runs for IBL so a
  // scene can light itself from an HDRI while a procedural sky is drawn.
  const shaderDrawsSky = settings.enabled && skyShader.status === "ready";
  const imageTexture = useSceneSkyboxTexture(
    assets,
    settings.enabled || settings.iblEnabled ? settings.imageAssetId : undefined,
    projectPath,
    settings.flipY,
  );
  if (!settings.enabled && !settings.iblEnabled) return null;
  const backgroundSettings = shaderDrawsSky
    ? { ...settings, enabled: false }
    : settings;
  return (
    <>
      {shaderDrawsSky && skyShader.status === "ready" ? (
        <SkyShaderPreview shader={skyShader.shader} settings={settings} />
      ) : null}
      {backgroundSettings.enabled || backgroundSettings.iblEnabled ? (
        <ProjectedSkyboxPreview
          texture={imageTexture}
          settings={backgroundSettings}
        />
      ) : null}
    </>
  );
}

function EditorCameraSettings({
  settings,
}: {
  settings: SceneSettings["camera"];
}) {
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    camera.near = settings.near;
    camera.far = settings.far;
    if (camera instanceof PerspectiveCamera) {
      camera.fov = settings.fov;
    } else if (camera instanceof OrthographicCamera) {
      camera.zoom = 70;
    }
    camera.updateProjectionMatrix();
  }, [camera, settings.far, settings.fov, settings.near]);
  return null;
}

/**
 * The Scene View entry point for snapping: the button flips it, the label
 * always says what one step is worth for the active tool, and the panel edits
 * the three step sizes without a trip to Scene Settings.
 */
function SnapToolbarControl({
  gizmo,
  transformMode,
  snapActive,
  modifierHeld,
  disabled,
  playing,
  open,
  onOpenChange,
  onChange,
  shortcut,
}: {
  gizmo: SceneGizmoSettings;
  transformMode: TransformMode;
  /** Includes the held modifier, so the button shows what a drag would do now. */
  snapActive: boolean;
  modifierHeld: boolean;
  disabled: boolean;
  playing: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange?: (patch: Partial<SceneGizmoSettings>) => void;
  shortcut?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const step = snapStepForMode(gizmo, transformMode);
  const stepText = formatSnapStep(transformMode, step);
  const editable = Boolean(onChange) && !disabled;

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        onOpenChange(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("pointerdown", closeOnOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onOpenChange, open]);

  useEffect(() => {
    if (disabled) onOpenChange(false);
  }, [disabled, onOpenChange]);

  return (
    <div ref={containerRef} className="relative flex shrink-0 items-center">
      <button
        type="button"
        aria-label={`スナップ${snapActive ? "有効" : "無効"}${
          modifierHeld ? "。Shiftで反転中" : ""
        }。1ステップ ${stepText}`}
        aria-pressed={snapActive}
        disabled={!editable}
        onClick={() => onChange?.({ snapEnabled: !gizmo.snapEnabled })}
        title={commandTitle(
          `スナップを${gizmo.snapEnabled ? "切る" : "入れる"}。移動 ${formatSnapStep(
            "translate",
            gizmo.translateSnap,
          )} / 回転 ${formatSnapStep(
            "rotate",
            gizmo.rotateSnapDegrees,
          )} / 拡縮 ${formatSnapStep("scale", gizmo.scaleSnap)}${
            gizmo.snapHoldShift ? "。Shiftを押している間は反転します" : ""
          }`,
          "transform.toggle-snap",
          shortcut,
        )}
        className={`flex h-7 items-center gap-1 rounded-l border px-1.5 text-[11px] font-semibold tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
          modifierHeld
            ? "border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100"
            : snapActive
              ? "border-violet-500 bg-violet-600 text-white hover:bg-violet-500"
              : playing
                ? "border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-700"
                : "border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-100"
        }`}
      >
        <EDITOR_ICONS.snap size={13} aria-hidden="true" />
        {/* The step only fits while the Scene View header is wide enough; the
            button keeps its aria-label and title when it does not. */}
        <span className="hidden @[420px]/scene-header:inline">
          {modifierHeld
            ? snapActive
              ? `Shift ${stepText}`
              : "Shift 自由"
            : stepText}
        </span>
      </button>
      <button
        type="button"
        aria-label="スナップの間隔を設定"
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={!editable}
        onClick={() => onOpenChange(!open)}
        title="スナップの間隔とShiftの扱いを設定"
        className={`flex h-7 w-5 items-center justify-center rounded-r border border-l-0 transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
          playing
            ? "border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-700"
            : "border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-100"
        }`}
      >
        <EDITOR_ICONS.expanded size={12} aria-hidden="true" />
      </button>

      {open && onChange ? (
        <div
          role="dialog"
          aria-label="スナップ設定"
          className="absolute right-0 top-full z-40 mt-1 w-64 rounded-md border border-slate-300 bg-white p-3 text-slate-800 shadow-xl"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] font-semibold text-slate-800">スナップ</p>
            <button
              type="button"
              role="switch"
              aria-checked={gizmo.snapEnabled}
              onClick={() => onChange({ snapEnabled: !gizmo.snapEnabled })}
              className={`h-6 rounded border px-2 text-[11px] font-semibold ${
                gizmo.snapEnabled
                  ? "border-violet-500 bg-violet-600 text-white"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {gizmo.snapEnabled ? "オン" : "オフ"}
            </button>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-slate-500">
            ギズモのドラッグと矢印キーの1ステップを、指定した間隔にそろえます。
          </p>

          {(["translate", "rotate", "scale"] as const).map((mode) => (
            <SnapStepField
              key={mode}
              mode={mode}
              value={snapStepForMode(gizmo, mode)}
              highlighted={mode === transformMode}
              onChange={(value) =>
                onChange(
                  mode === "rotate"
                    ? { rotateSnapDegrees: value }
                    : mode === "scale"
                      ? { scaleSnap: value }
                      : { translateSnap: value },
                )
              }
            />
          ))}

          <label className="mt-3 flex cursor-pointer items-start justify-between gap-3 border-t border-slate-100 pt-2.5">
            <span>
              <span className="block text-[11px] font-medium text-slate-700">
                Shiftを押している間は反転する
              </span>
              <span className="block text-[11px] leading-4 text-slate-500">
                オフの時は一時的にそろえ、オンの時は一時的に自由に動かせます。
              </span>
            </span>
            <input
              type="checkbox"
              checked={gizmo.snapHoldShift}
              onChange={(event) =>
                onChange({ snapHoldShift: event.currentTarget.checked })
              }
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
            />
          </label>

          <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] leading-4 text-slate-500">
            矢印キーで選択を1ステップ動かします。左右がX、上下がZ、PageUpとPageDownがYです。回転ツールと拡縮ツールでは、その軸の角度と倍率が同じ1ステップだけ動きます。
          </p>
        </div>
      ) : null}
    </div>
  );
}

function SnapStepField({
  mode,
  value,
  highlighted,
  onChange,
}: {
  mode: TransformMode;
  value: number;
  /** The active tool's row is the one the toolbar label is showing. */
  highlighted: boolean;
  onChange: (value: number) => void;
}) {
  const minimum = minSnapStepForMode(mode);
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const next = Number(draft);
    if (!Number.isFinite(next) || next < minimum) {
      setDraft(String(value));
      return;
    }
    if (next !== value) onChange(next);
    else setDraft(String(value));
  };

  return (
    <div
      className={`mt-2.5 rounded border px-2 py-1.5 ${
        highlighted ? "border-violet-200 bg-violet-50/60" : "border-transparent"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] font-medium text-slate-700">
          {snapStepLabel(mode)}
          <div className="mt-1 flex items-center gap-1">
            <input
              type="number"
              value={draft}
              min={minimum}
              step={minimum}
              onChange={(event) => setDraft(event.currentTarget.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commit();
                }
              }}
              className="h-6 w-20 rounded border border-slate-300 px-1.5 text-right text-[11px] tabular-nums outline-none focus:border-violet-400"
            />
            <span className="text-[10px] text-slate-500">
              {snapStepUnit(mode)}
            </span>
          </div>
        </label>
        <div className="flex max-w-[7.5rem] flex-wrap justify-end gap-1">
          {snapPresetsForMode(mode).map((preset) => (
            <button
              key={preset}
              type="button"
              aria-label={`${snapStepLabel(mode)}を${formatSnapStep(mode, preset)}にする`}
              aria-pressed={preset === value}
              onClick={() => onChange(preset)}
              className={`h-5 rounded border px-1.5 text-[10px] font-semibold tabular-nums ${
                preset === value
                  ? "border-violet-500 bg-violet-600 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-100"
              }`}
            >
              {formatSnapStep(mode, preset)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The Scene View's own tab, always first and never closable. */
export const SCENE_VIEW_TAB_ID = "scene-view";

export function SceneViewport({
  scene,
  assets,
  prefabs,
  projectPath,
  projectKind,
  selection,
  selectedEntityIds,
  editorMode,
  runtimeEntityRevisions,
  runtimeRevision = 0,
  lastReloadedEntityName,
  transformMode,
  transformSpace,
  playDisabled,
  playPreparing,
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  maximized,
  onToggleMaximize,
  playShortcut,
  snapShortcut,
  onTogglePlay,
  onTransformModeChange,
  onToggleTransformSpace,
  onGizmoSettingsChange,
  notice,
  onSelect,
  onTransformCommit,
  onDropPrimitive,
  onDropMaterial,
  onDropSkybox,
  onDropBuiltinPrefab,
  onDropSceneAsset,
  onCreatePrimitive,
  onDeleteEntity,
  frameSelectionRequest,
  exitFocusRequest,
  focusedEntity,
  onFocusChange,
  onExitFocus,
  onViewportFileDrop,
  onPlayDropAttempt,
  onDropRejected,
  onOptimizeColliders,
  terrainEditing = null,
  onTerrainEditingPatch,
  onTerrainEditingExit,
  onTerrainStrokeStart,
  onTerrainStroke,
  onTerrainStrokeEnd,
  onTerrainStrokeCancel,
  scriptRuntime,
  thumbnailCaptureRequest = 0,
  onThumbnailCaptured,
  onThumbnailCaptureError,
  screenshotRequest = null,
  onScreenshotComplete,
  debugCaptureRequest = null,
  onDebugCaptureResult,
  cameraRequest = null,
  onCameraResult,
}: {
  scene: SceneDocument;
  assets: AssetManifest;
  prefabs: Readonly<Record<string, PrefabDocument>>;
  /** Desktop project root used only to resolve project-relative model sources. */
  projectPath?: string;
  projectKind: VisualProjectKind;
  selection: EditorSelection;
  selectedEntityIds: readonly string[];
  editorMode: EditorMode;
  runtimeEntityRevisions?: Readonly<Record<string, number>>;
  runtimeRevision?: number;
  lastReloadedEntityName?: string | null;
  transformMode: TransformMode;
  transformSpace: TransformSpace;
  playDisabled: boolean;
  /** Script compilation runs before Play starts; the button shows it. */
  playPreparing?: boolean;
  /**
   * Other editors that share this cell, shown beside the Scene View's name.
   *
   * A graph editor that floats over the viewport has to fit between the panels
   * and ends up fighting them for width. As a tab it gets the whole cell, and
   * the two are one place rather than one covering the other.
   */
  tabs?: readonly { id: string; label: string; closable?: boolean }[];
  activeTabId?: string;
  onSelectTab?: (id: string) => void;
  onCloseTab?: (id: string) => void;
  /** Whether this cell currently has the whole editor area. */
  maximized?: boolean;
  onToggleMaximize?: () => void;
  playShortcut?: string;
  snapShortcut?: string;
  onTogglePlay: () => void;
  onTransformModeChange: (mode: TransformMode) => void;
  onToggleTransformSpace: () => void;
  /** Snap is flipped often enough that the toolbar patches it without Undo. */
  onGizmoSettingsChange?: (patch: Partial<SceneGizmoSettings>) => void;
  notice: string | null;
  onSelect: (
    selection: SceneViewportEntitySelection,
    modifiers: SceneViewportSelectionModifiers,
  ) => void;
  onTransformCommit: (entityId: string, patch: TransformPatch) => void;
  onDropPrimitive: (creationId: string, position: Vec3) => void;
  onDropMaterial: (
    entityId: string,
    materialAssetId: string,
    meshComponentId: string,
  ) => void;
  onDropSkybox: (assetId: string) => void;
  onDropBuiltinPrefab: (recipeId: string, position: Vec3) => void;
  onDropSceneAsset: (assetId: string, position: Vec3) => void;
  onCreatePrimitive: (creationId: string) => void;
  /** Deletes the Entity the viewport's context menu was opened on. */
  onDeleteEntity: (entityId: string) => void;
  frameSelectionRequest: number;
  exitFocusRequest: number;
  focusedEntity: SceneFocusState | null;
  onFocusChange: (focus: SceneFocusState | null) => void;
  onExitFocus: () => void;
  onViewportFileDrop: () => void;
  onPlayDropAttempt: () => void;
  onDropRejected: (message: string) => void;
  onOptimizeColliders: (entityIds?: readonly string[]) => void;
  /** Inspector-selected Terrain tool. A hit point supplies each stamp center. */
  terrainEditing?: TerrainViewportEditing | null;
  onTerrainEditingPatch?: (
    patch: Partial<Omit<TerrainViewportEditing, "entityId" | "componentId">>,
  ) => void;
  onTerrainEditingExit?: () => void;
  onTerrainStrokeStart?: (entityId: string, componentId: string) => boolean;
  onTerrainStroke?: (
    entityId: string,
    componentId: string,
    operation: TerrainSceneBrushOperation,
  ) => void;
  onTerrainStrokeEnd?: (entityId: string) => void;
  onTerrainStrokeCancel?: (entityId: string) => void;
  /** Compiled Script Assets plus the callbacks their hosts need. */
  scriptRuntime?: ScriptViewportRuntime;
  /** Requests a clean capture from the active Three.js Scene View. */
  thumbnailCaptureRequest?: number;
  onThumbnailCaptured?: (dataUrl: string) => void;
  onThumbnailCaptureError?: (message: string) => void;
  /** MCP or Quick Prompt screenshot capture request. */
  screenshotRequest?: SceneScreenshotRequest | null;
  onScreenshotComplete?: () => void;
  /** MCP-driven metrics / bounded WebM capture request. */
  debugCaptureRequest?: SceneDebugCaptureRequest | null;
  onDebugCaptureResult?: (result: SceneDebugCaptureResult) => void;
  cameraRequest?: SceneViewCameraRequest | null;
  onCameraResult?: (result: SceneViewCameraResult) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dropResolverRef = useRef<SceneDropResolver | null>(null);
  // The brush centre under the cursor. A ref because it updates on every
  // pointer move and only the cursor mesh consumes it.
  const terrainHoverRef = useRef<[number, number] | null>(null);
  // Held for the length of a stroke: releasing Ctrl mid-drag must not flip the
  // brush under the user's hand.
  const terrainInvertedRef = useRef(false);
  const pressedKeysRef = useRef(new Set<string>());
  const worldPlayCameraInputRef = useRef<WorldPlayCameraInput>({
    pointerId: null,
    lastX: 0,
    lastY: 0,
    deltaX: 0,
    deltaY: 0,
  });
  const [dragOverKind, setDragOverKind] = useState<
    SceneViewportDragIntent["kind"] | null
  >(null);
  const [dragOverLabel, setDragOverLabel] = useState<string | null>(null);
  const [materialDropTarget, setMaterialDropTarget] =
    useState<MaterialDropTarget | null>(null);
  const [projection, setProjection] = useState<ViewProjection>("perspective");
  // Held-Shift inverts snap for the length of the hold. Tracked on window
  // because the gizmo captures the pointer, so the key never reaches the
  // viewport element once a drag is under way.
  const [snapModifierHeld, setSnapModifierHeld] = useState(false);
  const [snapPanelOpen, setSnapPanelOpen] = useState(false);
  // The view controls stay inline while the Scene View header is wide enough
  // and collapse into this popover when it is not. Only the open state lives in
  // React; which of the two forms is shown is a container query on the header,
  // so the controls exist once in the DOM either way.
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [thumbnailCaptureActive, setThumbnailCaptureActive] = useState(false);
  const [displayMode, setDisplayMode] =
    useState<SceneViewportDisplayMode>("scene");
  const [qualityMode, setQualityMode] = useState<SceneViewportQualityMode>(
    loadSceneViewportQualityMode,
  );
  const [debugOverlayEnabled, setDebugOverlayEnabled] = useState(false);
  const [debugMetrics, setDebugMetrics] =
    useState<ScenePerformanceMetrics | null>(null);
  const [videoRecording, setVideoRecording] = useState(false);
  const [videoSaving, setVideoSaving] = useState(false);
  const [debugNotice, setDebugNotice] = useState<string | null>(null);
  const debugRequestIdRef = useRef(0);
  const pendingMetricsRequestRef = useRef<number | null>(null);
  const activeVideoRequestRef = useRef<SceneDebugCaptureRequest | null>(null);
  const activeVideoAutoSaveRef = useRef(false);
  const lastDebugVideoPathRef = useRef<string | null>(null);
  const debugResultRef = useRef(onDebugCaptureResult);
  debugResultRef.current = onDebugCaptureResult;
  const viewMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!viewMenuOpen) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!viewMenuRef.current?.contains(event.target as Node)) {
        setViewMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setViewMenuOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [viewMenuOpen]);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    /** The Entity the pointer was over, so the menu can act on it. */
    entityId: string | null;
    entityName: string | null;
  } | null>(null);
  const [transformDragging, setTransformDragging] = useState(false);
  const transformDraggingRef = useRef(false);
  const terrainPointerRef = useRef<{
    pointerId: number;
    entityId: string;
    componentId: string;
  } | null>(null);
  const rightPointerGestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
    suppressContextMenu: boolean;
  } | null>(null);
  const leftPointerGestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
    additive: boolean;
    pressedEntityId: string | null;
  } | null>(null);
  const preview = useMemo(
    () => createSceneViewportPreview(scene, assets, prefabs),
    [assets, prefabs, scene],
  );
  const sceneSettings = useMemo(
    () => resolveSceneSettings(scene.settings),
    [scene.settings],
  );
  const gizmoSettings = sceneSettings.editor.gizmo;
  const snapActive = resolveSnapActive(gizmoSettings, snapModifierHeld);
  // One object identity per resolved state keeps the Entity tree from
  // re-rendering on unrelated renders.
  const activeGizmo = useMemo(
    () => ({ ...gizmoSettings, snapEnabled: snapActive }),
    [gizmoSettings, snapActive],
  );

  useEffect(() => {
    if (editorMode !== "edit" || !gizmoSettings.snapHoldShift) {
      setSnapModifierHeld(false);
      return;
    }
    const sync = (event: KeyboardEvent | PointerEvent) => {
      // Shift also capitalises letters. Typing a name in the Inspector must
      // not flip the gizmo and re-render the whole Entity tree.
      if (isEditableShortcutTarget(event.target)) return;
      setSnapModifierHeld(event.shiftKey);
    };
    const clear = () => setSnapModifierHeld(false);
    window.addEventListener("keydown", sync);
    window.addEventListener("keyup", sync);
    window.addEventListener("pointerdown", sync);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    return () => {
      window.removeEventListener("keydown", sync);
      window.removeEventListener("keyup", sync);
      window.removeEventListener("pointerdown", sync);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
    };
  }, [editorMode, gizmoSettings.snapHoldShift]);
  const viewportWind = useMemo(
    () => resolveSceneWind(sceneSettings.vegetation),
    [sceneSettings.vegetation],
  );
  const viewportLighting = useMemo(
    () => resolveSceneLighting(scene, sceneSettings.ambient),
    [scene, sceneSettings.ambient],
  );
  const effectiveDisplayMode = editorMode === "play" ? "scene" : displayMode;
  // Play and thumbnail capture are previews of the published world, so they
  // always draw at full quality however the editing view is set.
  const qualityProfile = useMemo(
    () =>
      getSceneViewportQualityProfile(
        editorMode === "play" || thumbnailCaptureActive ? "high" : qualityMode,
      ),
    [editorMode, qualityMode, thumbnailCaptureActive],
  );
  const activeRenderScale = useMemo(
    () =>
      getSceneViewportRenderScale(
        qualityMode,
        typeof window === "undefined" ? 1 : window.devicePixelRatio,
      ),
    [qualityMode],
  );
  const colliderOnlyEdit = effectiveDisplayMode === "colliders";
  const renderDisplayMode = thumbnailCaptureActive ? "scene" : effectiveDisplayMode;
  const displayProfile = useMemo(
    () => {
      const profile = getSceneViewportDisplayProfile(renderDisplayMode);
      return thumbnailCaptureActive || editorMode === "play"
        ? { ...profile, showHelpers: false }
        : profile;
    },
    [editorMode, renderDisplayMode, thumbnailCaptureActive],
  );
  const runtimeSpawn = useMemo(
    () => resolveRuntimeSpawn(preview.scene),
    [preview.scene],
  );
  const modelProxyVisible = useMemo(
    () => hasModelProxy(preview.scene, assets, projectPath),
    [assets, preview.scene, projectPath],
  );
  const isPressed = useCallback(
    (key: string) => pressedKeysRef.current.has(key),
    [],
  );
  const selectedEntityId =
    selection?.kind === "entity" ? selection.id : null;
  const selectedEntityIdSet = useMemo(
    () => new Set(selectedEntityIds),
    [selectedEntityIds],
  );
  // Transforms are stored in the parent's space, so a child Entity's own
  // position is not somewhere the camera can look. This is only reached when
  // the Entity has no object in the scene graph yet, but pointing the fallback
  // at the wrong place is exactly the drift focus is meant to remove.
  const selectedWorldPosition = useMemo(
    () =>
      selectedEntityId
        ? resolveEntityWorldPosition(scene, selectedEntityId) ?? undefined
        : undefined,
    [scene, selectedEntityId],
  );
  const colliderInspection = useMemo(
    () => inspectColliderConfiguration(scene),
    [scene],
  );
  const selectedColliderInspection = useMemo(
    () =>
      selectedEntityId
        ? inspectColliderConfiguration(scene, { entityIds: [selectedEntityId] })
        : null,
    [scene, selectedEntityId],
  );
  const colliderPanelInspection =
    selectedColliderInspection && selectedColliderInspection.colliderCount > 0
      ? selectedColliderInspection
      : colliderInspection;

  useEffect(() => {
    if (thumbnailCaptureRequest <= 0) return;
    setThumbnailCaptureActive(true);
  }, [thumbnailCaptureRequest]);

  const handleThumbnailCaptured = useCallback(
    (dataUrl: string) => {
      setThumbnailCaptureActive(false);
      onThumbnailCaptured?.(dataUrl);
    },
    [onThumbnailCaptured],
  );

  const handleThumbnailCaptureError = useCallback(
    (message: string) => {
      setThumbnailCaptureActive(false);
      onThumbnailCaptureError?.(message);
    },
    [onThumbnailCaptureError],
  );

  const handleVideoCaptured = useCallback(async (blob: Blob) => {
    const activeRequest = activeVideoRequestRef.current;
    activeVideoRequestRef.current = null;
    setVideoRecording(false);
    setVideoSaving(true);
    try {
      const dataUrl = await blobToDataUrl(blob);
      if (activeRequest?.autoSave) {
        const path = await tauri.saveDebugVideo(dataUrl, "scene-view");
        lastDebugVideoPathRef.current = path;
        setDebugNotice(`診断動画を保存しました: ${path}`);
        debugResultRef.current?.({
          requestId: activeRequest.id,
          action: "stop",
          status: "saved",
          path,
          durationMs: activeRequest.durationMs,
        });
      } else if (tauri.isAvailable()) {
        const path = await tauri.saveVideo(dataUrl);
        setDebugNotice(path ? `診断動画を保存しました: ${path}` : "診断動画の保存をキャンセルしました");
      } else {
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = "xrift-studio-debug.webm";
        link.click();
        setDebugNotice("診断動画をダウンロードしました");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "診断動画を保存できませんでした。";
      setDebugNotice(message);
      if (activeRequest) {
        debugResultRef.current?.({
          requestId: activeRequest.id,
          action: "stop",
          status: "error",
          message,
        });
      }
    } finally {
      setVideoSaving(false);
    }
  }, []);

  const handleVideoCaptureError = useCallback((message: string) => {
    const activeRequest = activeVideoRequestRef.current;
    activeVideoRequestRef.current = null;
    setVideoRecording(false);
    setVideoSaving(false);
    setDebugNotice(message);
    if (activeRequest) {
      debugResultRef.current?.({
        requestId: activeRequest.id,
        action: activeRequest.action,
        status: "error",
        message,
      });
    }
  }, []);

  const toggleVideoRecording = useCallback(() => {
    if (videoSaving) return;
    if (videoRecording) {
      setVideoRecording(false);
      setDebugNotice("診断動画を保存中…");
      return;
    }
    setDebugOverlayEnabled(true);
    setVideoRecording(true);
    setDebugNotice("診断動画を録画中… 最大15秒");
  }, [videoRecording, videoSaving]);

  const handleVideoAutoStop = useCallback(() => {
    setVideoRecording(false);
    setDebugNotice("15秒の診断動画を保存中…");
  }, []);

  const handleDebugMetrics = useCallback((metrics: ScenePerformanceMetrics) => {
    setDebugMetrics(metrics);
    const requestId = pendingMetricsRequestRef.current;
    if (requestId === null) return;
    pendingMetricsRequestRef.current = null;
    debugResultRef.current?.({
      requestId,
      action: "metrics",
      status: "ready",
      metrics,
    });
  }, []);

  const appliedDebugCaptureRequestId = debugCaptureRequest?.id ?? 0;
  useEffect(() => {
    const request = debugCaptureRequest;
    if (!request || request.id <= debugRequestIdRef.current) return;
    debugRequestIdRef.current = request.id;
    if (request.action === "metrics") {
      setDebugOverlayEnabled(true);
      if (debugMetrics) {
        debugResultRef.current?.({
          requestId: request.id,
          action: "metrics",
          status: "ready",
          metrics: debugMetrics,
        });
      } else {
        pendingMetricsRequestRef.current = request.id;
      }
      return;
    }
    if (request.action === "start") {
      if (videoRecording || videoSaving) {
        debugResultRef.current?.({
          requestId: request.id,
          action: "start",
          status: "error",
          message: "別の診断動画を保存中です。完了後に再試行してください。",
        });
        return;
      }
      activeVideoRequestRef.current = request;
      activeVideoAutoSaveRef.current = request.autoSave === true;
      lastDebugVideoPathRef.current = null;
      setDebugOverlayEnabled(true);
      setVideoRecording(true);
      setDebugNotice(`診断動画を録画中… 最大${Math.round((request.durationMs ?? 15_000) / 1000)}秒`);
      debugResultRef.current?.({
        requestId: request.id,
        action: "start",
        status: "recording",
        durationMs: request.durationMs ?? 15_000,
      });
      return;
    }
    if (!videoRecording) {
      if (lastDebugVideoPathRef.current) {
        debugResultRef.current?.({
          requestId: request.id,
          action: "stop",
          status: "saved",
          path: lastDebugVideoPathRef.current,
        });
        return;
      }
      debugResultRef.current?.({
        requestId: request.id,
        action: "stop",
        status: "error",
        message: "録画中のScene Viewがありません。",
      });
      return;
    }
    activeVideoRequestRef.current = {
      ...request,
      durationMs: activeVideoRequestRef.current?.durationMs ?? 15_000,
      autoSave: activeVideoAutoSaveRef.current,
    };
    setVideoRecording(false);
    setDebugNotice("診断動画を保存中…");
  }, [appliedDebugCaptureRequestId, debugCaptureRequest, debugMetrics, videoRecording, videoSaving]);

  useEffect(() => {
    if (editorMode === "play") setProjection("perspective");
  }, [editorMode]);

  useEffect(() => {
    if (!terrainEditing) return;
    const frame = window.requestAnimationFrame(() => viewportRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [terrainEditing]);

  useEffect(() => {
    pressedKeysRef.current.clear();
    if (editorMode !== "play" || projectKind !== "world") return;
    const frame = window.requestAnimationFrame(() => viewportRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [editorMode, projectKind]);

  const handlePlayKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && terrainPointerRef.current) {
      const terrainPointer = terrainPointerRef.current;
      terrainPointerRef.current = null;
      onTerrainStrokeCancel?.(terrainPointer.entityId);
      event.preventDefault();
      return;
    }
    if (terrainEditing) {
      // Escape with no stroke in flight means "leave the brush", so the way out
      // is the same key whether or not a stroke is running.
      if (event.key === "Escape") {
        onTerrainEditingExit?.();
        event.preventDefault();
        return;
      }
      // Bracket keys size the brush without moving the eye off the ground.
      if (event.key === "[" || event.key === "]") {
        const step = Math.max(terrainEditing.radius * 0.15, 0.1);
        const next =
          event.key === "["
            ? Math.max(0.1, terrainEditing.radius - step)
            : terrainEditing.radius + step;
        onTerrainEditingPatch?.({ radius: Number(next.toFixed(2)) });
        event.preventDefault();
        return;
      }
    }
    if (editorMode !== "play" || projectKind !== "world") return;
    const key = event.key.toLowerCase();
    if (!PLAY_KEYS.has(key)) return;
    event.preventDefault();
    pressedKeysRef.current.add(key);
  };

  const handlePlayKeyUp = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const key = event.key.toLowerCase();
    if (!PLAY_KEYS.has(key)) return;
    event.preventDefault();
    pressedKeysRef.current.delete(key);
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    const intent = getSceneViewportDragIntent(event.dataTransfer);
    if (!intent) return;
    event.preventDefault();
    event.stopPropagation();
    setDragOverKind(intent.kind);
    if (intent.kind === "material") {
      const nextTarget = resolveMaterialDropTarget(
        scene,
        assets,
        dropResolverRef.current?.(event.clientX, event.clientY),
      );
      setMaterialDropTarget((current) =>
        materialDropTargetsEqual(current, nextTarget) ? current : nextTarget,
      );
    } else {
      setMaterialDropTarget(null);
    }
    if (intent.kind === "builtin-prefab") {
      setDragOverLabel(
        getBuiltinPrefabRecipe(intent.id)?.name ?? null,
      );
    } else if (intent.kind === "scene-asset") {
      setDragOverLabel(assets.assets[intent.id]?.name ?? null);
    } else if (intent.kind === "skybox") {
      setDragOverLabel(assets.assets[intent.id]?.name ?? null);
    } else {
      setDragOverLabel(null);
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    const intent = getSceneViewportDragIntent(event.dataTransfer);
    if (!intent) return;
    event.preventDefault();
    event.stopPropagation();
    const nextMaterialTarget =
      intent.kind === "material"
        ? resolveMaterialDropTarget(
            scene,
            assets,
            dropResolverRef.current?.(event.clientX, event.clientY),
          )
        : null;
    if (intent.kind === "material") {
      setMaterialDropTarget((current) =>
        materialDropTargetsEqual(current, nextMaterialTarget)
          ? current
          : nextMaterialTarget,
      );
    } else if (materialDropTarget) {
      setMaterialDropTarget(null);
    }
    event.dataTransfer.dropEffect =
      editorMode === "edit" &&
      (intent.kind !== "material" || nextMaterialTarget?.status === "ready")
        ? "copy"
        : "none";
    if (dragOverKind !== intent.kind) setDragOverKind(intent.kind);
    if (intent.kind === "builtin-prefab" && !dragOverLabel) {
      setDragOverLabel(
        getBuiltinPrefabRecipe(intent.id)?.name ?? null,
      );
    } else if (intent.kind === "scene-asset" && !dragOverLabel) {
      setDragOverLabel(assets.assets[intent.id]?.name ?? null);
    }
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    const relatedTarget = event.relatedTarget;
    if (
      relatedTarget instanceof Node &&
      event.currentTarget.contains(relatedTarget)
    ) {
      return;
    }
    setDragOverKind(null);
    setDragOverLabel(null);
    setMaterialDropTarget(null);
  };

  const handleViewportPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const isCanvasPointer = event.target instanceof HTMLCanvasElement;
    if (
      isCanvasPointer &&
      event.button === 0 &&
      editorMode === "edit" &&
      terrainEditing &&
      !transformDraggingRef.current
    ) {
      const hit = dropResolverRef.current?.(event.clientX, event.clientY);
      // Alt samples the height under the cursor into the flatten target, so a
      // road can be levelled to ground it already has rather than a guess.
      if (
        event.altKey &&
        hit?.authoringEntityId === terrainEditing.entityId &&
        hit.meshComponentId === terrainEditing.componentId &&
        hit.localPosition
      ) {
        onTerrainEditingPatch?.({
          kind: "flatten",
          targetHeight: Number(hit.localPosition[1].toFixed(3)),
        });
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (
        hit?.authoringEntityId === terrainEditing.entityId &&
        hit.renderedEntityId === terrainEditing.entityId &&
        hit.meshComponentId === terrainEditing.componentId &&
        hit.localPosition &&
        onTerrainStrokeStart?.(terrainEditing.entityId, terrainEditing.componentId)
      ) {
        terrainPointerRef.current = {
          pointerId: event.pointerId,
          entityId: terrainEditing.entityId,
          componentId: terrainEditing.componentId,
        };
        viewportRef.current?.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        onTerrainStroke?.(terrainEditing.entityId, terrainEditing.componentId, {
          ...invertTerrainBrush(terrainEditing, event.ctrlKey),
          center: [hit.localPosition[0], hit.localPosition[2]],
        });
        terrainInvertedRef.current = event.ctrlKey;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    if (
      isCanvasPointer &&
      editorMode === "play" &&
      projectKind === "world" &&
      (event.button === 0 || event.button === 2)
    ) {
      const input = worldPlayCameraInputRef.current;
      input.pointerId = event.pointerId;
      input.lastX = event.clientX;
      input.lastY = event.clientY;
      input.deltaX = 0;
      input.deltaY = 0;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (
      isCanvasPointer &&
      event.button === 0 &&
      !transformDraggingRef.current
    ) {
      leftPointerGestureRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        additive: event.shiftKey || event.ctrlKey || event.metaKey,
        pressedEntityId:
          dropResolverRef.current?.(event.clientX, event.clientY, {
            includeEntityOriginFallback: true,
          }).authoringEntityId ?? null,
      };
    }
    if (isCanvasPointer && event.button === 2) {
      rightPointerGestureRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        suppressContextMenu: false,
      };
    }
    if (contextMenu) setContextMenu(null);
    if (editorMode === "play" && projectKind === "world") {
      viewportRef.current?.focus();
    }
  };

  const terrainBrushTarget = useMemo(() => {
    if (!terrainEditing) return null;
    const entity = scene.entities[terrainEditing.entityId];
    const mesh = entity?.components.find(
      (component): component is Extract<typeof component, { type: "mesh" }> =>
        component.type === "mesh" && component.id === terrainEditing.componentId,
    );
    const terrain =
      mesh?.geometry?.kind === "terrain" ? mesh.geometry.terrain : null;
    return terrain ? { terrain } : null;
  }, [scene.entities, terrainEditing]);

  const trackTerrainHover = (clientX: number, clientY: number) => {
    if (!terrainEditing) {
      terrainHoverRef.current = null;
      return;
    }
    const hit = dropResolverRef.current?.(clientX, clientY);
    terrainHoverRef.current =
      hit?.authoringEntityId === terrainEditing.entityId &&
      hit.meshComponentId === terrainEditing.componentId &&
      hit.localPosition
        ? [hit.localPosition[0], hit.localPosition[2]]
        : null;
  };

  const handleViewportPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    trackTerrainHover(event.clientX, event.clientY);
    const terrainPointer = terrainPointerRef.current;
    if (terrainPointer?.pointerId === event.pointerId && terrainEditing) {
      const hit = dropResolverRef.current?.(event.clientX, event.clientY);
      if (
        hit?.authoringEntityId === terrainPointer.entityId &&
        hit.meshComponentId === terrainPointer.componentId &&
        hit.localPosition
      ) {
        onTerrainStroke?.(terrainPointer.entityId, terrainPointer.componentId, {
          ...invertTerrainBrush(terrainEditing, terrainInvertedRef.current),
          center: [hit.localPosition[0], hit.localPosition[2]],
        });
      }
      return;
    }
    const cameraInput = worldPlayCameraInputRef.current;
    if (
      editorMode === "play" &&
      projectKind === "world" &&
      cameraInput.pointerId === event.pointerId
    ) {
      cameraInput.deltaX += event.clientX - cameraInput.lastX;
      cameraInput.deltaY += event.clientY - cameraInput.lastY;
      cameraInput.lastX = event.clientX;
      cameraInput.lastY = event.clientY;
    }
    const leftGesture = leftPointerGestureRef.current;
    if (
      leftGesture &&
      leftGesture.pointerId === event.pointerId &&
      !leftGesture.moved &&
      hasPointerMovedBeyondThreshold(
        leftGesture.startX,
        leftGesture.startY,
        event.clientX,
        event.clientY,
      )
    ) {
      leftGesture.moved = true;
    }
    const gesture = rightPointerGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.moved) {
      return;
    }
    if (
      hasPointerMovedBeyondThreshold(
        gesture.startX,
        gesture.startY,
        event.clientX,
        event.clientY,
      )
    ) {
      gesture.moved = true;
    }
  };

  const handleViewportPointerUp = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const terrainPointer = terrainPointerRef.current;
    if (terrainPointer?.pointerId === event.pointerId) {
      const hit = dropResolverRef.current?.(event.clientX, event.clientY);
      if (
        terrainEditing &&
        hit?.authoringEntityId === terrainPointer.entityId &&
        hit.meshComponentId === terrainPointer.componentId &&
        hit.localPosition
      ) {
        onTerrainStroke?.(terrainPointer.entityId, terrainPointer.componentId, {
          ...invertTerrainBrush(terrainEditing, terrainInvertedRef.current),
          center: [hit.localPosition[0], hit.localPosition[2]],
        });
      }
      terrainInvertedRef.current = false;
      terrainPointerRef.current = null;
      onTerrainStrokeEnd?.(terrainPointer.entityId);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }
    const cameraInput = worldPlayCameraInputRef.current;
    if (cameraInput.pointerId === event.pointerId) {
      cameraInput.pointerId = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
    const leftGesture = leftPointerGestureRef.current;
    if (leftGesture?.pointerId === event.pointerId) {
      if (
        !leftGesture.moved &&
        hasPointerMovedBeyondThreshold(
          leftGesture.startX,
          leftGesture.startY,
          event.clientX,
          event.clientY,
        )
      ) {
        leftGesture.moved = true;
      }
      if (!leftGesture.moved && !transformDraggingRef.current && !terrainEditing) {
        const pick = dropResolverRef.current?.(event.clientX, event.clientY, {
          includeEntityOriginFallback: true,
        });
        const fallbackEntityId =
          pick?.authoringEntityId ?? leftGesture.pressedEntityId;
        // Clicking the selected Entity again drills into its subtree, so
        // content buried inside a large mesh stays reachable by clicks alone.
        const entityId =
          editorMode === "edit" && !leftGesture.additive
            ? resolveSceneClickSelection(scene, selectedEntityId, {
                rayEntityIds: pick?.rayEntityIds ?? [],
                originEntityIds: pick?.originEntityIds ?? [],
                fallbackEntityId,
              })
            : fallbackEntityId;
        if (entityId) {
          onSelect(
            { kind: "entity", id: entityId },
            { additive: leftGesture.additive },
          );
        } else if (editorMode === "edit") {
          onSelect(null, { additive: leftGesture.additive });
        }
      }
      leftPointerGestureRef.current = null;
    }
    const gesture = rightPointerGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (
      !gesture.moved &&
      hasPointerMovedBeyondThreshold(
        gesture.startX,
        gesture.startY,
        event.clientX,
        event.clientY,
      )
    ) {
      gesture.moved = true;
    }
    gesture.suppressContextMenu = gesture.moved;
  };

  const handleViewportPointerCancel = () => {
    const terrainPointer = terrainPointerRef.current;
    terrainPointerRef.current = null;
    if (terrainPointer) onTerrainStrokeCancel?.(terrainPointer.entityId);
    leftPointerGestureRef.current = null;
    rightPointerGestureRef.current = null;
    worldPlayCameraInputRef.current.pointerId = null;
    worldPlayCameraInputRef.current.deltaX = 0;
    worldPlayCameraInputRef.current.deltaY = 0;
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    const intent = getSceneViewportDragIntent(event.dataTransfer);
    if (!intent) return;
    event.preventDefault();
    event.stopPropagation();
    clearEditorDragData();
    setDragOverKind(null);
    setDragOverLabel(null);
    setMaterialDropTarget(null);
    const projected = dropResolverRef.current?.(event.clientX, event.clientY);
    const fallbackPosition = fallbackViewportGroundPosition(
      event.clientX,
      event.clientY,
      event.currentTarget.getBoundingClientRect(),
    );
    const groundPosition = projected?.groundPosition ?? fallbackPosition;

    if (editorMode === "play") {
      onPlayDropAttempt();
      return;
    }
    if (intent.kind === "files") {
      onViewportFileDrop();
      return;
    }

    if (intent.kind === "skybox") {
      if (
        intent.id &&
        (isEnvironmentTextureAsset(assets.assets[intent.id]) ||
          assets.assets[intent.id]?.kind === "skybox")
      ) {
        onDropSkybox(intent.id);
      } else {
        onDropRejected("Skyboxのドラッグ情報を読み取れませんでした。もう一度ドラッグしてください");
      }
      return;
    }

    if (intent.kind === "material") {
      const target = resolveMaterialDropTarget(scene, assets, projected);
      if (target.status === "rejected") {
        onDropRejected(target.message);
      } else if (!intent.id) {
        onDropRejected("Materialのドラッグ情報を読み取れませんでした。もう一度ドラッグしてください");
      } else {
        onDropMaterial(target.entityId, intent.id, target.meshComponentId);
      }
      return;
    }

    if (intent.kind === "builtin-prefab") {
      const recipe = getBuiltinPrefabRecipe(intent.id);
      if (recipe) {
        onDropBuiltinPrefab(intent.id, [
          groundPosition[0],
          recipe.defaultTransform.position[1],
          groundPosition[2],
        ]);
      } else {
        onDropRejected("XRift Prefabのドラッグ情報を読み取れませんでした");
      }
      return;
    }

    if (intent.kind === "scene-asset") {
      if (intent.id) onDropSceneAsset(intent.id, groundPosition);
      else onDropRejected("Assetのドラッグ情報を読み取れませんでした。もう一度ドラッグしてください");
      return;
    }

    const definition = getBuiltinPrimitiveCreation(intent.id);
    if (definition) {
      onDropPrimitive(intent.id, [
        groundPosition[0],
        definition.defaultTransform.position[1],
        groundPosition[2],
      ]);
    } else {
      onDropRejected("Primitiveのドラッグ情報を読み取れませんでした");
    }
  };

  const openContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    if (editorMode !== "edit") {
      if (editorMode === "play" && projectKind === "world") {
        event.preventDefault();
      }
      return;
    }
    const gesture = rightPointerGestureRef.current;
    event.preventDefault();
    if (gesture?.suppressContextMenu || gesture?.moved) {
      rightPointerGestureRef.current = null;
      return;
    }
    rightPointerGestureRef.current = null;
    const bounds = event.currentTarget.getBoundingClientRect();
    // Right-clicking an object acts on that object, the way the Hierarchy's own
    // context menu does: the Entity under the pointer is selected first, so the
    // menu's delete and the gizmo never disagree about the target.
    const pointedEntityId =
      dropResolverRef.current?.(event.clientX, event.clientY, {
        includeEntityOriginFallback: true,
      }).authoringEntityId ?? null;
    if (
      pointedEntityId &&
      !(selection?.kind === "entity" && selection.id === pointedEntityId)
    ) {
      onSelect({ kind: "entity", id: pointedEntityId }, { additive: false });
    }
    setContextMenu({
      x: Math.min(event.clientX - bounds.left, Math.max(8, bounds.width - 190)),
      y: Math.min(event.clientY - bounds.top, Math.max(8, bounds.height - 206)),
      entityId: pointedEntityId,
      entityName: pointedEntityId
        ? scene.entities[pointedEntityId]?.name ?? null
        : null,
    });
  };

  const profileLabel =
    projectKind === "world" ? "World Play Mode" : "Item Play Mode";
  const profileGuide =
    projectKind === "world"
      ? "WASD / 矢印キーで移動 · ドラッグで視点 · Q/Eで上下 · Shiftで加速"
      : "ドラッグでアイテムをOrbit確認";
  const readyMaterialDropTarget =
    materialDropTarget?.status === "ready" ? materialDropTarget : null;

  // The Entity tree reads these two objects instead of taking twenty props per
  // node. Both are memoised so a render that changed neither leaves every
  // Entity alone: `input` is diffed per Entity by the store, and `shared` is a
  // context whose consumers only wake when it actually changes identity.
  const handleTransformDraggingChange = useCallback((dragging: boolean) => {
    transformDraggingRef.current = dragging;
    setTransformDragging(dragging);
  }, []);
  const entityTreeInput = useMemo(
    () => ({
      scene: preview.scene,
      authoringEntityIdByEntityId: preview.authoringEntityIdByEntityId,
      selectedEntityIds: thumbnailCaptureActive
        ? EMPTY_SELECTION
        : selectedEntityIdSet,
      primaryEntityId: thumbnailCaptureActive ? null : selectedEntityId,
      runtimeEntityRevisions,
      materialDropTarget: readyMaterialDropTarget,
    }),
    [
      preview.authoringEntityIdByEntityId,
      preview.scene,
      readyMaterialDropTarget,
      runtimeEntityRevisions,
      selectedEntityId,
      selectedEntityIdSet,
      thumbnailCaptureActive,
    ],
  );
  const entityTreeShared = useMemo(
    () => ({
      assets,
      projectPath,
      editable:
        editorMode === "edit" &&
        !thumbnailCaptureActive &&
        // A brush is a gesture over the ground; leaving gizmos live lets a
        // stroke grab and drag an object instead of painting.
        !terrainEditing,
      playing: editorMode === "play",
      physicsEnabled: editorMode === "play" && projectKind === "world",
      transformMode,
      transformSpace,
      gizmo: activeGizmo,
      onTransformCommit,
      onDraggingChange: handleTransformDraggingChange,
      transformDraggingRef,
      materialDragActive: dragOverKind === "material",
      displayMode: renderDisplayMode,
      displayProfile,
      renderThumbnail: thumbnailCaptureActive,
    }),
    [
      activeGizmo,
      assets,
      displayProfile,
      dragOverKind,
      editorMode,
      handleTransformDraggingChange,
      onTransformCommit,
      projectKind,
      projectPath,
      renderDisplayMode,
      terrainEditing,
      thumbnailCaptureActive,
      transformMode,
      transformSpace,
    ],
  );
  const PlayIcon = editorMode === "play" ? EDITOR_ICONS.stop : EDITOR_ICONS.play;
  const dropMessage =
    editorMode === "play"
      ? "Playを停止してから配置してください"
      : dragOverKind === "files"
        ? "外部モデルは下のAssetsへドロップ"
        : dragOverKind === "material"
          ? materialDropTarget?.status === "rejected"
            ? materialDropTarget.message
            : readyMaterialDropTarget
              ? `${scene.entities[readyMaterialDropTarget.entityId]?.name ?? "Mesh"}へMaterialを適用`
              : "Materialを適用するMeshの上へ移動"
          : dragOverKind === "skybox"
            ? `${dragOverLabel ?? "Skybox"}をシーン全体へ設定`
          : dragOverKind === "builtin-prefab"
            ? `${dragOverLabel ?? "XRift Component"}を配置`
            : dragOverKind === "scene-asset"
              ? `${dragOverLabel ?? "Model / Prefab / Particle"}をSceneへ配置`
        : "CreateメニューからPrimitiveを追加";

  const MaximizeIcon = EDITOR_ICONS.maximize;
  const MinimizeIcon = EDITOR_ICONS.minimize;

  return (
    <section
      className={`relative flex min-h-0 flex-col overflow-hidden transition-shadow duration-200 ${
        editorMode === "play"
          ? "z-10 bg-zinc-950 ring-4 ring-inset ring-violet-400/90 shadow-[0_0_0_1px_rgba(139,92,246,0.9),0_0_28px_rgba(124,58,237,0.28)]"
          : "bg-slate-100"
      }`}
      aria-labelledby="scene-view-heading"
    >
      <div
        className={`@container/scene-header relative flex h-9 shrink-0 items-center gap-2 border-b px-2.5 ${
          editorMode === "play"
            ? "border-violet-400/70 bg-violet-950"
            : "border-slate-200 bg-slate-50"
        }`}
      >
        {/*
         * The title shrinks first, the toolbar never shrinks below its content,
         * and Play sits between two equal flexible halves. Play therefore stays
         * centred while the toolbar fits in its half and slides left instead of
         * covering the tools when it does not.
         */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {onToggleMaximize ? (
            <button
              type="button"
              onClick={onToggleMaximize}
              aria-pressed={maximized}
              title={
                maximized
                  ? "パネルを戻す"
                  : "このビューだけを広げる（Hierarchy・Inspector・Assetsを畳む）"
              }
              aria-label={maximized ? "パネルを戻す" : "このビューだけを広げる"}
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${
                editorMode === "play"
                  ? "text-zinc-300 hover:bg-violet-900 hover:text-zinc-100"
                  : maximized
                    ? "bg-violet-100 text-violet-700"
                    : "text-slate-500 hover:bg-slate-200 hover:text-slate-800"
              }`}
            >
              {maximized ? (
                <MinimizeIcon size={12} aria-hidden="true" />
              ) : (
                <MaximizeIcon size={12} aria-hidden="true" />
              )}
            </button>
          ) : null}
          {tabs && tabs.length > 0 ? (
            <div
              role="tablist"
              aria-label="Scene Viewとエディター"
              className="flex min-w-0 items-center gap-px overflow-x-auto"
            >
              {[
                {
                  id: SCENE_VIEW_TAB_ID,
                  label: editorMode === "play" ? "Play Window" : "Scene View",
                },
                ...tabs,
              ].map((tab) => {
                const active = (activeTabId ?? SCENE_VIEW_TAB_ID) === tab.id;
                const closable = "closable" in tab && tab.closable;
                return (
                  <div
                    key={tab.id}
                    className={`flex shrink-0 items-center rounded-t ${
                      active
                        ? editorMode === "play"
                          ? "bg-violet-900/70"
                          : "bg-white shadow-[inset_0_-2px_0_0_rgb(124_58_237)]"
                        : ""
                    }`}
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={active}
                      id={tab.id === SCENE_VIEW_TAB_ID ? "scene-view-heading" : undefined}
                      title={tab.label}
                      onClick={() => onSelectTab?.(tab.id)}
                      className={`max-w-[11rem] truncate px-2 py-0.5 text-[11px] font-semibold ${
                        active
                          ? editorMode === "play"
                            ? "text-zinc-100"
                            : "text-slate-900"
                          : editorMode === "play"
                            ? "text-zinc-400 hover:text-zinc-200"
                            : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {tab.label}
                    </button>
                    {closable ? (
                      <button
                        type="button"
                        onClick={() => onCloseTab?.(tab.id)}
                        aria-label={`${tab.label}を閉じる`}
                        title={`${tab.label}を閉じる`}
                        className={`mr-0.5 rounded px-0.5 text-[12px] leading-none ${
                          editorMode === "play"
                            ? "text-zinc-400 hover:bg-violet-800 hover:text-zinc-100"
                            : "text-slate-400 hover:bg-slate-200 hover:text-slate-800"
                        }`}
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <h2
              id="scene-view-heading"
              title={editorMode === "play" ? "Play Window" : "Scene View"}
              className={`truncate text-[12px] font-semibold ${
                editorMode === "play" ? "text-zinc-100" : "text-slate-800"
              }`}
            >
              {editorMode === "play" ? "Play Window" : "Scene View"}
            </h2>
          )}
          {editorMode === "play" ? (
            <>
              <span className="hidden shrink-0 truncate text-xs text-zinc-400 @[900px]/scene-header:inline">
                {profileLabel}
              </span>
              <span
                className="hidden shrink-0 rounded border border-violet-300/50 bg-violet-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-100 @[1100px]/scene-header:inline"
                role="status"
                aria-live="polite"
              >
                分離された実行コピー · 更新 {runtimeRevision}
              </span>
            </>
          ) : selectedEntityIds.length > 1 ? (
            <span
              className="hidden shrink-0 rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 @[900px]/scene-header:inline"
              role="status"
              aria-live="polite"
            >
              {selectedEntityIds.length}件を選択
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            disabled={playDisabled || playPreparing}
            aria-pressed={editorMode === "play"}
            onClick={onTogglePlay}
            title={commandTitle(
              editorMode === "play"
                ? "Playを停止"
                : playPreparing
                  ? "Scriptを変換しています"
                  : playDisabled
                    ? "アセットの読み込みが終わるとPlayできます"
                    : "Playを開始",
              "play.toggle",
              playShortcut,
            )}
            className={`flex h-7 min-w-20 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-xs font-semibold transition-colors disabled:cursor-wait disabled:opacity-45 ${
              editorMode === "play"
                ? "border-rose-400/70 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25"
                : "border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100"
            }`}
          >
            <PlayIcon size={13} aria-hidden="true" />
            {editorMode === "play"
              ? "停止"
              : playPreparing
                ? "準備中"
                : "Play"}
          </button>
        </div>
        <div className="flex flex-1 items-center justify-end gap-1.5" role="toolbar" aria-label="Scene Viewの操作">
          {(["translate", "rotate", "scale"] as const).map((mode) => {
            const Icon = EDITOR_ICONS[mode === "translate" ? "move" : mode];
            const label = mode === "translate" ? "移動" : mode === "rotate" ? "回転" : "拡縮";
            return (
              <button
                key={mode}
                type="button"
                aria-label={label}
                aria-pressed={transformMode === mode}
                disabled={editorMode !== "edit" || colliderOnlyEdit}
                onClick={() => onTransformModeChange(mode)}
                title={commandTitle(`${label}ギズモ`, `transform.${mode}`)}
                className={`flex size-7 shrink-0 items-center justify-center rounded border transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                  transformMode === mode
                    ? editorMode === "play"
                      ? "border-violet-400 bg-violet-500/80 text-white"
                      : "border-violet-500 bg-violet-600 text-white"
                    : editorMode === "play"
                      ? "border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-700"
                      : "border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-100"
                }`}
              >
                <Icon size={14} aria-hidden="true" />
              </button>
            );
          })}
          <button
            type="button"
            aria-label={`${transformSpace === "world" ? "World" : "Local"}座標。クリックで切り替え`}
            disabled={editorMode !== "edit" || colliderOnlyEdit}
            onClick={onToggleTransformSpace}
            title={commandTitle("ギズモ座標系を切り替える", "transform.toggle-space")}
            className={`flex size-7 shrink-0 items-center justify-center rounded border disabled:cursor-not-allowed disabled:opacity-35 ${
              editorMode === "play"
                ? "border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-700"
                : "border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-100"
            }`}
          >
            {transformSpace === "world" ? (
              <EDITOR_ICONS.world size={14} aria-hidden="true" />
            ) : (
              <EDITOR_ICONS.axis size={14} aria-hidden="true" />
            )}
          </button>
          <SnapToolbarControl
            gizmo={gizmoSettings}
            transformMode={transformMode}
            snapActive={snapActive}
            modifierHeld={snapModifierHeld && gizmoSettings.snapHoldShift}
            disabled={editorMode !== "edit" || colliderOnlyEdit}
            playing={editorMode === "play"}
            open={snapPanelOpen}
            onOpenChange={setSnapPanelOpen}
            onChange={onGizmoSettingsChange}
            shortcut={snapShortcut}
          />
          {/*
           * Camera, display mode, diagnostics and recording are one group that
           * the header lays out inline when it is wide enough and as a popover
           * when it is not. The controls are the same elements in both forms,
           * so no control is duplicated or dropped from the accessibility tree.
           */}
          <div
            ref={viewMenuRef}
            className="relative flex shrink-0 items-center @[760px]/scene-header:contents"
          >
            <button
              type="button"
              aria-label="表示と診断の設定"
              aria-expanded={viewMenuOpen}
              aria-haspopup="dialog"
              onClick={() => setViewMenuOpen((open) => !open)}
              title="カメラ投影方式、表示モード、診断、録画"
              className={`flex h-7 shrink-0 items-center justify-center gap-1 rounded border px-2 text-[11px] font-semibold transition-colors @[420px]/scene-header:min-w-[66px] @[760px]/scene-header:hidden ${
                videoRecording
                  ? "border-rose-300 bg-rose-500/15 text-rose-700"
                  : debugOverlayEnabled
                    ? editorMode === "play"
                      ? "border-cyan-300/70 bg-cyan-400/15 text-cyan-100"
                      : "border-cyan-400 bg-cyan-50 text-cyan-700"
                    : displayMode !== "scene" || qualityMode !== "high"
                      ? "border-violet-300 bg-violet-50 text-violet-700"
                      : editorMode === "play"
                        ? "border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-700"
                        : "border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-100"
              }`}
            >
              <EDITOR_ICONS.settings size={13} aria-hidden="true" />
              <span className="hidden @[420px]/scene-header:inline">
                {videoRecording ? "録画中" : "表示"}
              </span>
            </button>
            <div
              role="group"
              aria-label="表示と診断"
              className={`absolute right-0 top-full z-40 mt-1 w-60 shrink-0 flex-col items-stretch gap-2 rounded-md border border-slate-300 bg-white p-3 shadow-xl @[760px]/scene-header:static @[760px]/scene-header:z-auto @[760px]/scene-header:mt-0 @[760px]/scene-header:flex @[760px]/scene-header:w-auto @[760px]/scene-header:flex-row @[760px]/scene-header:items-center @[760px]/scene-header:gap-1.5 @[760px]/scene-header:rounded-none @[760px]/scene-header:border-0 @[760px]/scene-header:bg-transparent @[760px]/scene-header:p-0 @[760px]/scene-header:shadow-none ${
                viewMenuOpen ? "flex" : "hidden"
              }`}
            >
              <div className="flex items-center justify-between gap-2 @[760px]/scene-header:contents">
                <span className="text-[11px] font-medium text-slate-600 @[760px]/scene-header:hidden">
                  カメラ
                </span>
                <select
                  value={projection}
                  disabled={editorMode !== "edit"}
                  onChange={(event) => setProjection(event.currentTarget.value as ViewProjection)}
                  aria-label="カメラ投影方式"
                  title="Perspective / Ortho"
                  className={`h-7 shrink-0 rounded border px-1.5 text-[11px] font-medium outline-none focus:border-violet-400 disabled:cursor-not-allowed disabled:opacity-50 ${
                    editorMode === "play"
                      ? "border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500"
                      : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                  }`}
                >
                  <option value="perspective">Perspective</option>
                  <option value="orthographic">Ortho</option>
                </select>
              </div>
              <div className="flex items-center justify-between gap-2 @[760px]/scene-header:contents">
                <span className="text-[11px] font-medium text-slate-600 @[760px]/scene-header:hidden">
                  表示モード
                </span>
                <select
                  value={effectiveDisplayMode}
                  disabled={editorMode !== "edit"}
                  onChange={(event) =>
                    setDisplayMode(event.currentTarget.value as SceneViewportDisplayMode)
                  }
                  aria-label="Scene View表示モード"
                  title={
                    SCENE_VIEWPORT_DISPLAY_OPTIONS.find(
                      (option) => option.value === effectiveDisplayMode,
                    )?.description
                  }
                  className={`h-7 shrink-0 rounded border px-1.5 text-[11px] font-semibold outline-none focus:border-violet-400 disabled:cursor-not-allowed disabled:opacity-50 ${
                    editorMode === "play"
                      ? "border-zinc-700 bg-zinc-800 text-zinc-300"
                      : displayMode === "scene"
                        ? "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                        : "border-violet-300 bg-violet-50 text-violet-700 hover:border-violet-400"
                  }`}
                >
                  {SCENE_VIEWPORT_DISPLAY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-between gap-2 @[760px]/scene-header:contents">
                <span className="text-[11px] font-medium text-slate-600 @[760px]/scene-header:hidden">
                  描画品質
                </span>
                <select
                  value={qualityMode}
                  disabled={editorMode !== "edit"}
                  onChange={(event) => {
                    const next = event.currentTarget
                      .value as SceneViewportQualityMode;
                    setQualityMode(next);
                    saveSceneViewportQualityMode(next);
                  }}
                  aria-label="Scene View描画品質"
                  title={
                    editorMode === "play"
                      ? "Play中は高品質で描画します"
                      : // The resolved number, not just the mode's description:
                        // "高品質" follows the display, so what a mode costs is
                        // only answerable on the screen it is running on.
                        `${
                          SCENE_VIEWPORT_QUALITY_OPTIONS.find(
                            (option) => option.value === qualityMode,
                          )?.description ?? ""
                        }\nこのディスプレイでの実描画: 表示サイズの${Math.round(
                          activeRenderScale * 100,
                        )}%`
                  }
                  className={`h-7 shrink-0 rounded border px-1.5 text-[11px] font-semibold outline-none focus:border-violet-400 disabled:cursor-not-allowed disabled:opacity-50 ${
                    editorMode === "play"
                      ? "border-zinc-700 bg-zinc-800 text-zinc-300"
                      : qualityMode === "high"
                        ? "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                        : "border-violet-300 bg-violet-50 text-violet-700 hover:border-violet-400"
                  }`}
                >
                  {SCENE_VIEWPORT_QUALITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                aria-label="Scene View診断表示"
                aria-pressed={debugOverlayEnabled}
                onClick={() => setDebugOverlayEnabled((enabled) => !enabled)}
                title="FPS、描画負荷、カメラ距離を表示"
                className={`flex h-7 min-w-[68px] shrink-0 items-center justify-center gap-1 rounded border px-2 text-[11px] font-semibold transition-colors ${
                  debugOverlayEnabled
                    ? editorMode === "play"
                      ? "border-cyan-300/70 bg-cyan-400/15 text-cyan-100"
                      : "border-cyan-400 bg-cyan-50 text-cyan-700"
                    : editorMode === "play"
                      ? "border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-700"
                      : "border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-100"
                }`}
              >
                <EDITOR_ICONS.diagnostics size={13} aria-hidden="true" />
                診断
              </button>
              <button
                type="button"
                aria-label={videoRecording ? "診断動画を停止" : "診断動画を録画"}
                onClick={toggleVideoRecording}
                disabled={videoSaving}
                title={videoRecording ? "診断動画を停止して保存" : "Scene Viewを最大15秒録画"}
                className={`flex h-7 min-w-[68px] shrink-0 items-center justify-center gap-1 rounded border px-2 text-[11px] font-semibold transition-colors disabled:cursor-wait disabled:opacity-50 ${
                  videoRecording
                    ? "border-rose-300 bg-rose-500/15 text-rose-700 hover:bg-rose-500/25"
                    : editorMode === "play"
                      ? "border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-700"
                      : "border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-100"
                }`}
              >
                <EDITOR_ICONS.record size={13} aria-hidden="true" />
                {videoSaving ? "保存中" : videoRecording ? "停止" : "録画"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        ref={viewportRef}
        tabIndex={
          // Terrain shortcuts need the viewport focusable in Edit too, or the
          // brush keys land on whatever the panel focused last.
          (editorMode === "play" && projectKind === "world") || terrainEditing
            ? 0
            : -1
        }
        className="relative min-h-0 flex-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400"
        aria-label={
          editorMode === "play"
            ? `${profileLabel}。${profileGuide}`
            : "編集可能な3Dシーン"
        }
        onKeyDown={handlePlayKeyDown}
        onKeyUp={handlePlayKeyUp}
        onBlur={() => pressedKeysRef.current.clear()}
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handleViewportPointerMove}
        onPointerUp={handleViewportPointerUp}
        onPointerCancel={handleViewportPointerCancel}
        onDragEnterCapture={handleDragEnter}
        onDragOverCapture={handleDragOver}
        onDragLeave={handleDragLeave}
        onDropCapture={handleDrop}
        onContextMenu={openContextMenu}
      >
        <Canvas
          key={projection}
          orthographic={projection === "orthographic"}
          shadows={qualityProfile.shadows ? "basic" : false}
          dpr={qualityProfile.dpr}
          camera={{
            position: [7, 5, 7],
            ...(projection === "orthographic"
              ? { zoom: 70 }
              : { fov: sceneSettings.camera.fov }),
            near: sceneSettings.camera.near,
            far: sceneSettings.camera.far,
          }}
        >
          <SceneLightingContext.Provider value={viewportLighting}>
          <SceneWindContext.Provider value={viewportWind}>
          <color
            attach="background"
            args={[
              displayProfile.backgroundColor ??
                sceneSettings.editor.backgroundColor,
            ]}
          />
          {displayProfile.showFog && sceneSettings.fog.enabled ? (
            <fog
              attach="fog"
              args={[
                sceneSettings.fog.color,
                sceneSettings.fog.near,
                sceneSettings.fog.far,
              ]}
            />
          ) : null}
          {displayProfile.showSkybox ? (
            <SceneSkyboxPreview
              settings={sceneSettings.skybox}
              assets={assets}
              projectPath={projectPath}
            />
          ) : null}
          <EditorCameraSettings settings={sceneSettings.camera} />
          {displayProfile.showSceneLighting && sceneSettings.ambient.enabled ? (
            <ambientLight
              color={sceneSettings.ambient.color}
              intensity={sceneSettings.ambient.intensity}
            />
          ) : null}
          <ViewportShadowQuality enabled={qualityProfile.shadows} />
          {qualityProfile.postprocessing ? (
            <ScenePostprocessing settings={sceneSettings.postprocessing} />
          ) : null}
          {/* Scene-wide graph writes: exposure and the screen fade. Mounted only
              while Play runs, so a graph never dims the editing view. */}
          <XriftSceneRuntime enabled={editorMode === "play"} />
          <SceneWind
            sceneDocument={preview.scene}
            settings={sceneSettings.vegetation}
          />
          {sceneSettings.editor.gizmo.gridVisible && !thumbnailCaptureActive ? (
            <gridHelper
              args={[
                sceneSettings.editor.gizmo.gridSize,
                sceneSettings.editor.gizmo.gridDivisions,
                sceneSettings.skybox.enabled ? "#94a3b8" : "#52525b",
                sceneSettings.skybox.enabled ? "#d5dbe3" : "#2d2d33",
              ]}
              position={[0, 0.005, 0]}
            />
          ) : null}

          <SceneDropProjectionBridge resolverRef={dropResolverRef} />

          <SceneThumbnailCapture
            requestId={thumbnailCaptureRequest}
            ready={thumbnailCaptureActive}
            onCapture={handleThumbnailCaptured}
            onError={handleThumbnailCaptureError}
          />

          <SceneScreenshotCapture
            request={screenshotRequest}
            onComplete={() => onScreenshotComplete?.()}
          />

          <ScenePerformanceProbe
            enabled={debugOverlayEnabled || videoRecording}
            onSample={handleDebugMetrics}
          />
          <SceneVideoCapture
            recording={videoRecording}
            maxDurationMs={activeVideoRequestRef.current?.durationMs ?? 15_000}
            onComplete={handleVideoCaptured}
            onError={handleVideoCaptureError}
            onAutoStop={handleVideoAutoStop}
          />

          <OfficialXriftPreviewProvider
            withPhysics
            gravity={
              // Scene settings hold gravity as a positive magnitude, matching
              // xrift.json, so Play applies the same number the published
              // world receives rather than a separate hardcoded constant.
              editorMode === "play" && projectKind === "world"
                ? [0, -sceneSettings.physics.gravity, 0]
                : [0, 0, 0]
            }
          >
            <PlayInteractionHost active={editorMode === "play"} />
            <ScriptViewportProvider value={scriptRuntime ?? null}>
            <XriftScriptRoot pressedKeys={pressedKeysRef.current}>
            <Fragment key={editorMode}>
              <SceneEntityTreeProvider
                input={entityTreeInput}
                shared={entityTreeShared}
              >
                {preview.scene.rootEntityIds.map((entityId) => (
                  <SceneEntityHierarchy key={entityId} entityId={entityId} />
                ))}
              </SceneEntityTreeProvider>
              {terrainEditing && terrainBrushTarget ? (
                <TerrainBrushCursorBinding
                  terrain={terrainBrushTarget.terrain}
                  entityId={terrainEditing.entityId}
                  kind={terrainEditing.kind}
                  radius={terrainEditing.radius}
                  falloff={terrainEditing.falloff ?? 0.5}
                  hoverRef={terrainHoverRef}
                />
              ) : null}
              {editorMode === "play" && projectKind === "world" ? (
                <WorldPlayCameraController
                  initialPosition={runtimeSpawn.position}
                  initialYaw={runtimeSpawn.yaw}
                  isPressed={isPressed}
                  inputRef={worldPlayCameraInputRef}
                />
              ) : null}
            </Fragment>
            </XriftScriptRoot>
            </ScriptViewportProvider>
          </OfficialXriftPreviewProvider>

          <CameraControls
            editorMode={editorMode}
            projectKind={projectKind}
            transformDragging={transformDragging}
            terrainEditing={Boolean(terrainEditing)}
            frameSelectionRequest={frameSelectionRequest}
            exitFocusRequest={exitFocusRequest}
            frameEntityId={selectedEntityId}
            frameEntityName={
              selectedEntityId
                ? scene.entities[selectedEntityId]?.name ?? null
                : null
            }
            frameTarget={selectedWorldPosition}
            cameraRequest={cameraRequest}
            onCameraResult={onCameraResult}
            onFocusChange={onFocusChange}
          />
          </SceneWindContext.Provider>
          </SceneLightingContext.Provider>
        </Canvas>

        {debugOverlayEnabled && debugMetrics && !thumbnailCaptureActive ? (
          <div
            className="pointer-events-none absolute right-2.5 top-2.5 z-20 w-[min(18rem,calc(100%-1.25rem))] rounded-md border border-cyan-300/60 bg-slate-950/90 px-3 py-2.5 font-mono text-[10px] leading-4 text-cyan-50 shadow-lg backdrop-blur"
            role="status"
            aria-live="polite"
            aria-label="Scene View診断メトリクス"
          >
            <div className="flex items-center justify-between gap-2 font-sans text-[11px] font-semibold">
              <span>Scene View診断</span>
              <span className="text-cyan-200">{videoRecording ? "REC" : "LIVE"}</span>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-cyan-100/90">
              <span>FPS {formatDebugNumber(debugMetrics.fps, 1)}</span>
              <span>Frame {formatDebugNumber(debugMetrics.frameTimeMs, 1)}ms</span>
              <span>Draw {formatDebugNumber(debugMetrics.drawCalls)}</span>
              <span>Tris {formatDebugNumber(debugMetrics.triangles)}</span>
              <span>Mesh {formatDebugNumber(debugMetrics.visibleMeshes)} / {formatDebugNumber(debugMetrics.totalMeshes)}</span>
              <span>Geo {formatDebugNumber(debugMetrics.geometries)} · Tex {formatDebugNumber(debugMetrics.textures)}</span>
            </div>
            <SceneVramMetrics metrics={debugMetrics} />
            <div className="mt-1 border-t border-cyan-200/20 pt-1 text-cyan-200/80">
              Camera {debugMetrics.cameraPosition.map((value) => formatDebugNumber(value, 1)).join(", ")} · Far {formatDebugNumber(debugMetrics.cameraFar, 0)}m
            </div>
          </div>
        ) : null}

        {effectiveDisplayMode === "colliders" && !thumbnailCaptureActive ? (
          <div
            className="absolute right-2.5 top-12 z-20 w-[min(19rem,calc(100%-1.25rem))] rounded-md border border-teal-300/70 bg-slate-950/90 px-3 py-2.5 text-slate-100 shadow-lg backdrop-blur"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold">コライダー専用編集</p>
              <span className="text-[11px] tabular-nums text-slate-300">
                Box {colliderPanelInspection.boxColliderCount} · Mesh {colliderPanelInspection.meshColliderCount}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-4 text-slate-300">
              {colliderPanelInspection.diagnostics.length === 0
                ? "表示中の形状と実行設定に問題はありません"
                : `${colliderPanelInspection.diagnostics.length}件の診断。${colliderPanelInspection.fixableCount}件を自動修正できます`}
            </p>
            {colliderPanelInspection.diagnostics.slice(0, 2).map((diagnostic) => (
              <p
                key={`${diagnostic.entityId}-${diagnostic.componentId ?? diagnostic.code}`}
                className={`mt-1 text-[11px] leading-4 ${diagnostic.severity === "error" ? "text-rose-300" : "text-amber-200"}`}
              >
                {diagnostic.message}
              </p>
            ))}
            {colliderPanelInspection.fixableCount > 0 ? (
              <button
                type="button"
                onClick={() =>
                  onOptimizeColliders(
                    selectedColliderInspection && selectedColliderInspection.colliderCount > 0
                      ? [selectedEntityId!]
                      : undefined,
                  )
                }
                className="mt-2 w-full rounded border border-teal-300/70 bg-teal-500/20 px-2 py-1.5 text-xs font-semibold text-teal-100 hover:bg-teal-500/30"
              >
                {selectedColliderInspection && selectedColliderInspection.colliderCount > 0
                  ? "選択Entityを最適化"
                  : "Scene全体を最適化"}
              </button>
            ) : null}
            <p className="mt-2 border-t border-slate-700 pt-1.5 text-[10px] text-slate-400">
              MCP: inspect_colliders → optimize_colliders
            </p>
          </div>
        ) : null}

        {dragOverKind ? (
          <div
            className={`pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-lg border-2 border-dashed px-4 text-center text-xs font-semibold backdrop-blur-[2px] ${
              dragOverKind === "material" && materialDropTarget?.status === "rejected"
                ? "border-rose-400 bg-rose-500/15 text-rose-100"
                : dragOverKind === "material" && readyMaterialDropTarget
                  ? "border-sky-400 bg-sky-500/10 text-sky-100"
                  : "border-violet-400 bg-violet-500/15 text-violet-100"
            }`}
            aria-live="polite"
          >
            {dropMessage}
          </div>
        ) : null}

        {editorMode === "play" ? (
          <div className="pointer-events-none absolute left-2.5 top-2.5 z-10 max-w-[80%] rounded-md border border-violet-400/60 bg-violet-950/90 px-2.5 py-1.5 text-xs leading-4 text-violet-50 shadow-lg backdrop-blur">
            <p className="font-semibold">実行コピー · 編集データとは分離</p>
            <p className="text-violet-200">{profileGuide}</p>
            {lastReloadedEntityName ? (
              <p className="mt-1 border-t border-violet-300/20 pt-1 text-violet-100">
                {lastReloadedEntityName} を先頭から再実行
              </p>
            ) : null}
          </div>
        ) : null}

        {terrainEditing && !thumbnailCaptureActive ? (
          <div
            className="pointer-events-none absolute left-2.5 top-2.5 z-10 max-w-[80%] rounded-md border border-violet-400/70 bg-violet-950/90 px-2.5 py-1.5 text-xs leading-4 text-violet-50 shadow-lg backdrop-blur"
            role="status"
            aria-live="polite"
          >
            <p className="font-semibold">Terrain Scene 編集 · {terrainEditing.kind}</p>
            <p className="text-violet-200">
              左ドラッグでブラシを適用 · 半径 {terrainEditing.radius.toFixed(1)}m · Escで現在のストロークを取り消し
            </p>
          </div>
        ) : null}

        {modelProxyVisible ? (
          <div className="pointer-events-none absolute right-2.5 top-2.5 z-10 rounded border border-amber-700/60 bg-amber-950/75 px-2 py-1 text-xs text-amber-200">
            Model proxy preview
          </div>
        ) : null}

        {focusedEntity ? (
          <div
            className="absolute bottom-2.5 right-2.5 z-20 flex max-w-[min(20rem,70%)] items-center gap-3 rounded-md border border-violet-400/60 bg-zinc-950/92 px-3 py-2 text-zinc-100 shadow-lg backdrop-blur"
            role="group"
            aria-label="Entityフォーカス"
          >
            <div className="min-w-0">
              <p
                className="truncate text-xs font-semibold"
                role="status"
                aria-live="polite"
              >
                フォーカス中: {scene.entities[focusedEntity.entityId]?.name ?? focusedEntity.entityName}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-400">
                {selection?.kind === "entity" &&
                selection.id !== focusedEntity.entityId
                  ? "Fで選択対象へ切替 / Escapeで解除"
                  : "FキーまたはEscapeで解除"}
              </p>
            </div>
            <button
              type="button"
              onClick={onExitFocus}
              title="フォーカスを解除 (Escape)"
              className="shrink-0 rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs font-semibold text-zinc-100 hover:border-zinc-400 hover:bg-zinc-700"
            >
              解除
            </button>
          </div>
        ) : null}

        {contextMenu ? (
          <div
            className="absolute z-40 w-48 rounded-md border border-slate-300 bg-white p-1 text-slate-800 shadow-xl"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            role="menu"
            onPointerDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.stopPropagation()}
          >
            {contextMenu.entityId ? (
              <>
                <p
                  className="truncate px-2 py-1 text-xs font-semibold text-slate-500"
                  title={contextMenu.entityName ?? contextMenu.entityId}
                >
                  {contextMenu.entityName ?? contextMenu.entityId}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const entityId = contextMenu.entityId;
                    setContextMenu(null);
                    if (entityId) onDeleteEntity(entityId);
                  }}
                  title={commandTitle(
                    `${contextMenu.entityName ?? "Entity"}を削除`,
                    "edit.delete",
                  )}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-rose-50 hover:text-rose-700"
                >
                  <EDITOR_ICONS.delete size={14} aria-hidden="true" />
                  削除
                </button>
                <div className="my-1 border-t border-slate-200" />
              </>
            ) : null}
            <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Create Mesh
            </p>
            {BUILTIN_PRIMITIVE_CREATION_CATALOG.map((entry) => (
              <button
                key={entry.creationId}
                type="button"
                onClick={() => {
                  setContextMenu(null);
                  onCreatePrimitive(entry.creationId);
                }}
                title={commandTitle(`${entry.name}をSceneへ作成`, `CreatePrimitive.${entry.name}`)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-violet-50 hover:text-violet-800"
              >
                <EDITOR_ICONS.primitive size={14} aria-hidden="true" />
                {entry.name}
              </button>
            ))}
          </div>
        ) : null}

        {notice ?? debugNotice ? (
          <div
            className="pointer-events-none absolute bottom-2.5 left-1/2 z-10 max-w-[84%] -translate-x-1/2 rounded-md border border-zinc-700 bg-zinc-950/90 px-3 py-1.5 text-xs leading-4 text-zinc-100 shadow-lg"
            role="status"
            aria-live="polite"
          >
            {notice ?? debugNotice}
          </div>
        ) : null}
      </div>
    </section>
  );
}
