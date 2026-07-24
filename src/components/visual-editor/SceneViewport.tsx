import {
  Canvas,
  useFrame,
  useThree,
} from "@react-three/fiber";
import {
  Edges,
  Html,
  OrbitControls,
  Text as DreiText,
  TransformControls,
} from "@react-three/drei";
import {
  CapsuleCollider,
  CuboidCollider,
  MeshCollider,
  RigidBody,
  type RapierRigidBody,
} from "@react-three/rapier";
import { SpawnPoint } from "@xrift/world-components";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
  Box3,
  BoxGeometry,
  Color,
  DoubleSide,
  EquirectangularReflectionMapping,
  Euler,
  MathUtils,
  OrthographicCamera,
  Plane,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  SRGBColorSpace,
  Sphere,
  SphereGeometry,
  TextureLoader,
  Vector2,
  Vector3,
  type Group,
  type Material,
  type Mesh,
  type DirectionalLight,
  type MeshStandardMaterial,
  type Object3D,
  type SpotLight,
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
  getMaterialAssignmentTarget,
  getMaterialAsset,
  getPrimaryMaterialAssetId,
  getTextureSourceFormat,
  getTransform,
  isEnvironmentTextureAsset,
  normalizeProjectRelativePath,
  resolveOpenBrushEditorBrushBaseUrl,
  resolveRuntimeSpawnPosition,
  resolveSceneSettings,
  STUDIO_GUIDE_INTERACTION_DOOR_MODEL_ASSET_ID,
  type AssetManifest,
  type AnimationComponent,
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
  type SceneSettings,
  type SkyboxAsset,
  type TransformPatch,
  type TextureAsset,
  type Vec3,
  type VisualProjectKind,
} from "../../lib/visual-editor";
import { tauri } from "../../lib/tauri";
import { commandTitle, EDITOR_ICONS } from "./editor-icons";
import { ParticleEmitterVisual } from "./ParticleEmitterVisual";
import {
  applyOpenBrushMaterialAssetProperties,
  ProjectModelVisual,
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

const PLAY_KEYS = new Set([
  "w",
  "a",
  "s",
  "d",
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
]);
const SCENE_VIEW_ENTITY_ORIGIN_HIT_RADIUS_PX = 18;
const EDIT_CAMERA_TARGET: [number, number, number] = [0, 0.7, 0];
const EDITOR_SELECTION_COLOR = "#7c3aed";
const MUTED_GIZMO_COLOR = new Color("#64748b");

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

function MeshVisual({
  component,
  animation,
  playing,
  assets,
  selected,
  materialDropHighlighted,
  viewportMaterialStyle,
  projectPath,
}: {
  component: MeshComponent;
  animation?: AnimationComponent;
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
        animation={animation}
        playing={playing}
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
    );
  }

  if (primitive) {
    const materialAssetId = getPrimaryMaterialAssetId(component);
    const material = materialAssetId
      ? getMaterialAsset(assets, materialAssetId)
      : undefined;
    return (
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
    );
  }

  return (
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
  const meshRef = useRef<Mesh | null>(null);
  const customShaderInstance = useMemo(() => {
    const instance = customShaderMaterial?.clone();
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
  }, [customShaderMaterial, material, materialTextures]);
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
          transparent={alphaMode === "BLEND"}
          depthWrite={alphaMode !== "BLEND"}
          alphaTest={
            alphaMode === "MASK"
              ? (material?.properties.alphaCutoff ?? 0.5)
              : 0
          }
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
}: {
  component: Extract<SceneComponent, { type: "light" }>;
  selected: boolean;
  showSceneLighting: boolean;
}) {
  const directionalLightRef = useRef<DirectionalLight | null>(null);
  const spotLightRef = useRef<SpotLight | null>(null);
  const directionalTargetRef = useRef<Object3D | null>(null);

  useLayoutEffect(() => {
    const light = directionalLightRef.current ?? spotLightRef.current;
    const target = directionalTargetRef.current;
    if (!light || !target) return;
    light.target = target;
    target.updateMatrixWorld();
  }, [component.lightType]);

  if (!component.enabled) return null;

  return (
    <>
      {showSceneLighting && component.lightType === "ambient" ? (
        <ambientLight color={component.color} intensity={component.intensity} />
      ) : showSceneLighting && component.lightType === "hemisphere" ? (
        <hemisphereLight
          color={component.color}
          groundColor={component.groundColor ?? "#334155"}
          intensity={component.intensity}
        />
      ) : showSceneLighting && component.lightType === "point" ? (
        <pointLight
          color={component.color}
          intensity={component.intensity}
          distance={component.distance ?? 0}
          decay={component.decay ?? 2}
          castShadow={component.castShadow}
        />
      ) : showSceneLighting && component.lightType === "spot" ? (
        <>
          <spotLight
            ref={spotLightRef}
            color={component.color}
            intensity={component.intensity}
            distance={component.distance ?? 0}
            angle={component.angle ?? Math.PI / 3}
            penumbra={component.penumbra ?? 0.5}
            decay={component.decay ?? 2}
            castShadow={component.castShadow}
          />
          <object3D ref={directionalTargetRef} position={[0, 0, -1]} />
        </>
      ) : showSceneLighting && component.lightType === "rectArea" ? (
        <rectAreaLight
          color={component.color}
          intensity={component.intensity}
          width={component.width ?? 1}
          height={component.height ?? 1}
        />
      ) : showSceneLighting ? (
        <>
          <directionalLight
            ref={directionalLightRef}
            color={component.color}
            intensity={component.intensity}
            castShadow={component.castShadow}
          />
          <object3D ref={directionalTargetRef} position={[0, 0, -1]} />
        </>
      ) : null}
      <EditorLightIcon color={component.color} selected={selected} />
      {component.lightType === "directional" || component.lightType === "spot" ? (
        <DirectionArrow
          direction={-1}
          color={selected ? EDITOR_SELECTION_COLOR : component.color}
          position={[0, -0.18, 0]}
        />
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
      distanceFactor={7}
      zIndexRange={[2, 0]}
      style={{ pointerEvents: "none" }}
    >
      <div
        aria-hidden="true"
        style={{
          alignItems: "center",
          background: selected ? "rgba(255,255,255,0.96)" : "rgba(15,23,42,0.82)",
          border: `2px solid ${selected ? EDITOR_SELECTION_COLOR : color}`,
          borderRadius: 10,
          boxShadow: selected
            ? "0 0 0 3px rgba(148,163,184,0.28), 0 4px 14px rgba(15,23,42,0.28)"
            : "0 3px 10px rgba(15,23,42,0.28)",
          color: selected ? "#334155" : color,
          display: "flex",
          height: 34,
          justifyContent: "center",
          width: 34,
        }}
      >
        <LightIcon size={20} strokeWidth={2} />
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
      distanceFactor={7}
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
          borderRadius: 10,
          boxShadow: selected
            ? "0 0 0 3px rgba(148,163,184,0.28), 0 4px 14px rgba(15,23,42,0.28)"
            : "0 3px 10px rgba(15,23,42,0.28)",
          color: selected ? "#6d28d9" : "#c4b5fd",
          display: "flex",
          height: 34,
          justifyContent: "center",
          width: 34,
        }}
      >
        <AudioIcon size={17} strokeWidth={2.2} />
      </div>
    </Html>
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
    <group position={position}>
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
  animation,
  playing,
  assets,
  selected,
  materialDragActive,
  materialDropHighlighted,
  viewportMaterialStyle,
  showHelpers,
  showSceneLighting,
  showAllColliders,
  projectPath,
}: {
  component: SceneComponent;
  animation?: AnimationComponent;
  playing: boolean;
  assets: AssetManifest;
  selected: boolean;
  materialDragActive: boolean;
  materialDropHighlighted: boolean;
  viewportMaterialStyle: SceneViewportMaterialStyle | null;
  showHelpers: boolean;
  showSceneLighting: boolean;
  showAllColliders: boolean;
  projectPath?: string;
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
            animation={animation}
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
      if (
        playing ||
        !component.enabled ||
        (!selected && !showAllColliders) ||
        component.shape !== "box"
      ) {
        return null;
      }
      return (
        <mesh position={component.center} renderOrder={20}>
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
      return showHelpers ? (
        <LightVisual
          component={component}
          selected={selected}
          showSceneLighting={showSceneLighting}
        />
      ) : null;
    case "text":
      return showHelpers && component.enabled ? (
        <DreiText
          color={component.color}
          fontSize={component.fontSize}
          maxWidth={component.maxWidth}
          anchorX={component.anchorX}
          anchorY={component.anchorY}
          outlineWidth={component.outlineWidth}
          outlineColor={component.outlineColor}
        >
          {component.text}
        </DreiText>
      ) : null;
    case "audio-source":
      return showHelpers && component.enabled ? (
        <AudioSourceVisual selected={selected} />
      ) : null;
    case "animation":
      return null;
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
      return showHelpers && component.enabled && asset?.kind === "particle" ? (
        <ParticleEmitterVisual
          asset={asset}
          textureAsset={
            textureAsset?.kind === "texture" ? textureAsset : undefined
          }
          projectPath={projectPath}
          selected={selected}
        />
      ) : null;
    }
    case "xrift-component":
      return showHelpers ? (
        <OfficialXriftComponentRenderer component={component} />
      ) : null;
  }
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
  const primaryCollider = meshCollider ?? colliders[0]!;
  const bodyType = primaryCollider.bodyType ?? "fixed";

  return (
    <RigidBody
      type={bodyType}
      colliders={
        meshCollider
          ? meshCollider.meshMode === "convex" || bodyType !== "fixed"
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
  if (meshCollider) {
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
  transformMode,
  transformSpace,
  gizmo,
  projectPath,
  onTransformCommit,
  onDraggingChange,
  transformDraggingRef,
  materialDragActive,
  materialDropTarget,
  displayMode,
  displayProfile,
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
  transformMode: TransformMode;
  transformSpace: TransformSpace;
  gizmo: SceneSettings["editor"]["gizmo"];
  projectPath?: string;
  onTransformCommit: (entityId: string, patch: TransformPatch) => void;
  onDraggingChange: (dragging: boolean) => void;
  transformDraggingRef: { current: boolean };
  materialDragActive: boolean;
  materialDropTarget: MaterialDropReadyTarget | null;
  displayMode: SceneViewportDisplayMode;
  displayProfile: SceneViewportDisplayProfile;
  children?: ReactNode;
}) {
  const objectRef = useRef<Group>(null!);
  const transformControlsRef = useRef<ElementRef<typeof TransformControls>>(null);
  const transform = getTransform(entity);
  const animation = entity.components.find(
    (component): component is AnimationComponent =>
      component.type === "animation" && component.enabled,
  );
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
  const entityVisuals = (
    <>
      {entity.components.map((component) =>
        component.type === "xrift-component" &&
        isOfficialXriftWrapperComponent(component) ? null : (
          <ComponentVisual
            key={component.id}
            component={component}
            animation={animation}
            playing={playing}
            assets={assets}
            selected={selected}
            materialDragActive={materialDragActive}
            materialDropHighlighted={
              materialDropTarget?.entityId === authoringEntityId &&
              materialDropTarget.meshComponentId === component.id
            }
            viewportMaterialStyle={viewportMaterialStyle}
            showHelpers={displayProfile.showHelpers}
            showSceneLighting={displayProfile.showSceneLighting}
            showAllColliders={displayProfile.showAllColliders}
            projectPath={projectPath}
          />
        ),
      )}
    </>
  );
  const ownedColliderVisuals = rigidBodyOwner ? (
    <RuntimeOwnedColliderContent
      entity={entity}
      bodyType={rigidBodyOwner.bodyType}
      autoColliders={rigidBodyOwner.autoColliders}
    >
      {entityVisuals}
    </RuntimeOwnedColliderContent>
  ) : (
    entityVisuals
  );

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
        visible={entity.enabled}
        position={transform?.position ?? [0, 0, 0]}
        rotation={transform?.rotation ?? [0, 0, 0]}
        scale={transform?.scale ?? [1, 1, 1]}
        userData={{ authoringEntityId, renderedEntityId: entity.id }}
      >
        <OfficialXriftEntityWrappers components={xriftWrapperComponents}>
          {physicsEnabled ? (
            ownRigidBody ? (
              <RuntimeOwnedRigidBody component={ownRigidBody}>
                {ownedColliderVisuals}
                {children}
              </RuntimeOwnedRigidBody>
            ) : rigidBodyOwner ? (
              <>
                {ownedColliderVisuals}
                {children}
              </>
            ) : (
              <RuntimePhysicsEntity entity={entity}>
                {entityVisuals}
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
      entity.id === authoringEntityId ? (
        <TransformControls
          ref={setTransformControlsRef}
          object={objectRef}
          mode={transformMode}
          space={transformSpace}
          size={gizmo.size}
          translationSnap={gizmo.snapEnabled ? gizmo.translateSnap : undefined}
          rotationSnap={
            gizmo.snapEnabled
              ? (gizmo.rotateSnapDegrees * Math.PI) / 180
              : undefined
          }
          scaleSnap={gizmo.snapEnabled ? gizmo.scaleSnap : undefined}
          onMouseDown={() => {
            transformDraggingRef.current = true;
            onDraggingChange(true);
          }}
          onMouseUp={() => {
            commitTransform();
            transformDraggingRef.current = false;
            onDraggingChange(false);
          }}
        />
      ) : null}
    </>
  );
}

type SceneDropHit = {
  groundPosition: Vec3 | null;
  authoringEntityId: string | null;
  renderedEntityId: string | null;
  meshComponentId: string | null;
};

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

  useLayoutEffect(() => {
    resolverRef.current = (clientX, clientY, options) => {
      const bounds = gl.domElement.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) {
        return {
          groundPosition: null,
          authoringEntityId: null,
          renderedEntityId: null,
          meshComponentId: null,
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
      for (const intersection of raycaster.intersectObjects(scene.children, true)) {
        if (!isObjectVisibleInHierarchy(intersection.object)) continue;
        const metadata = entityPointerMetadata(intersection.object);
        if (
          !metadata ||
          (!options?.includeEntityOriginFallback && !metadata.meshComponentId)
        ) {
          continue;
        }
        authoringEntityId = metadata.authoringEntityId;
        renderedEntityId = metadata.renderedEntityId;
        meshComponentId = metadata.meshComponentId;
        break;
      }
      if (!authoringEntityId && options?.includeEntityOriginFallback) {
        const maximumDistanceSquared =
          SCENE_VIEW_ENTITY_ORIGIN_HIT_RADIUS_PX *
          SCENE_VIEW_ENTITY_ORIGIN_HIT_RADIUS_PX;
        let bestDistanceSquared = maximumDistanceSquared;
        let bestDepth = Number.POSITIVE_INFINITY;
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
          if (
            distanceSquared > bestDistanceSquared ||
            (distanceSquared === bestDistanceSquared &&
              entityNdcPosition.z >= bestDepth)
          ) {
            return;
          }
          bestDistanceSquared = distanceSquared;
          bestDepth = entityNdcPosition.z;
          authoringEntityId = candidateAuthoringEntityId;
          renderedEntityId = candidateRenderedEntityId;
        });
      }
      const position = raycaster.ray.intersectPlane(groundPlane, groundHit);
      return {
        groundPosition: position
          ? [position.x, 0, position.z]
          : null,
        authoringEntityId,
        renderedEntityId,
        meshComponentId,
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

function SceneEntityHierarchy({
  entityId,
  scene,
  authoringEntityIdByEntityId,
  assets,
  selectedEntityIds,
  primaryEntityId,
  editable,
  playing,
  physicsEnabled,
  runtimeEntityRevisions,
  transformMode,
  transformSpace,
  gizmo,
  projectPath,
  onTransformCommit,
  onDraggingChange,
  transformDraggingRef,
  materialDragActive,
  materialDropTarget,
  displayMode,
  displayProfile,
  inheritedRigidBody,
  ancestors = new Set<string>(),
}: {
  entityId: string;
  scene: SceneDocument;
  authoringEntityIdByEntityId: Readonly<Record<string, string>>;
  assets: AssetManifest;
  selectedEntityIds: ReadonlySet<string>;
  primaryEntityId: string | null;
  editable: boolean;
  playing: boolean;
  physicsEnabled: boolean;
  runtimeEntityRevisions?: Readonly<Record<string, number>>;
  transformMode: TransformMode;
  transformSpace: TransformSpace;
  gizmo: SceneSettings["editor"]["gizmo"];
  projectPath?: string;
  onTransformCommit: (entityId: string, patch: TransformPatch) => void;
  onDraggingChange: (dragging: boolean) => void;
  transformDraggingRef: { current: boolean };
  materialDragActive: boolean;
  materialDropTarget: MaterialDropReadyTarget | null;
  displayMode: SceneViewportDisplayMode;
  displayProfile: SceneViewportDisplayProfile;
  inheritedRigidBody?: RigidBodyComponent;
  ancestors?: ReadonlySet<string>;
}) {
  const entity = scene.entities[entityId];
  if (!entity || ancestors.has(entityId)) return null;
  const authoringEntityId =
    authoringEntityIdByEntityId[entityId] ?? entityId;
  const nextAncestors = new Set(ancestors);
  nextAncestors.add(entityId);
  const ownRigidBody = entity.components.find(
    (component): component is RigidBodyComponent =>
      component.type === "rigid-body" && component.enabled,
  );
  const rigidBodyOwner = ownRigidBody ?? inheritedRigidBody;

  return (
    <EntityObject
      entity={entity}
      authoringEntityId={authoringEntityId}
      assets={assets}
      projectPath={projectPath}
      selected={selectedEntityIds.has(authoringEntityId)}
      primary={primaryEntityId === authoringEntityId}
      editable={editable}
      playing={playing}
      physicsEnabled={physicsEnabled}
      ownRigidBody={ownRigidBody}
      rigidBodyOwner={rigidBodyOwner}
      transformMode={transformMode}
      transformSpace={transformSpace}
      gizmo={gizmo}
      onTransformCommit={onTransformCommit}
      onDraggingChange={onDraggingChange}
      transformDraggingRef={transformDraggingRef}
      materialDragActive={materialDragActive}
      materialDropTarget={materialDropTarget}
      displayMode={displayMode}
      displayProfile={displayProfile}
    >
      {entity.children.map((childId) => (
        <SceneEntityHierarchy
          key={`${childId}:${
            runtimeEntityRevisions?.[
              authoringEntityIdByEntityId[childId] ?? childId
            ] ?? 0
          }`}
          entityId={childId}
          scene={scene}
          authoringEntityIdByEntityId={authoringEntityIdByEntityId}
          assets={assets}
          selectedEntityIds={selectedEntityIds}
          primaryEntityId={primaryEntityId}
          editable={editable}
          playing={playing}
          physicsEnabled={physicsEnabled}
          runtimeEntityRevisions={runtimeEntityRevisions}
          transformMode={transformMode}
          transformSpace={transformSpace}
          gizmo={gizmo}
          projectPath={projectPath}
          onTransformCommit={onTransformCommit}
          onDraggingChange={onDraggingChange}
          transformDraggingRef={transformDraggingRef}
          materialDragActive={materialDragActive}
          materialDropTarget={materialDropTarget}
          displayMode={displayMode}
          displayProfile={displayProfile}
          inheritedRigidBody={rigidBodyOwner}
          ancestors={nextAncestors}
        />
      ))}
    </EntityObject>
  );
}

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

function CameraControls({
  editorMode,
  projectKind,
  transformDragging,
  frameSelectionRequest,
  exitFocusRequest,
  frameEntityId,
  frameEntityName,
  frameTarget,
  onFocusChange,
}: {
  editorMode: EditorMode;
  projectKind: VisualProjectKind;
  transformDragging: boolean;
  frameSelectionRequest: number;
  exitFocusRequest: number;
  frameEntityId: string | null;
  frameEntityName: string | null;
  frameTarget?: Vec3;
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
    camera.position.copy(snapshot.position);
    camera.quaternion.copy(snapshot.quaternion);
    camera.up.copy(snapshot.up);
    camera.zoom = snapshot.zoom;
    controls.target.copy(snapshot.target);
    controls.update();
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
      selectedObject.updateWorldMatrix(true, true);
      const bounds = new Box3().setFromObject(selectedObject);
      if (!bounds.isEmpty()) {
        const sphere = bounds.getBoundingSphere(new Sphere());
        target.copy(sphere.center);
        radius = sphere.radius;
      } else {
        selectedObject.getWorldPosition(target);
      }
    } else if (frameTarget) {
      target.fromArray(frameTarget);
    } else {
      target.copy(controls.target);
    }

    const offset = camera.position.clone().sub(controls.target);
    if (offset.lengthSq() < 0.01) offset.set(4, 3, 4);
    let distance = Math.max(2.5, Math.min(8, offset.length()));
    if (camera instanceof PerspectiveCamera && radius > 0.001) {
      const verticalFov = MathUtils.degToRad(camera.fov);
      const horizontalFov = 2 * Math.atan(
        Math.tan(verticalFov / 2) * camera.aspect,
      );
      const limitingFov = Math.max(
        Math.min(verticalFov, horizontalFov),
        MathUtils.degToRad(1),
      );
      distance = Math.max(2.5, radius / Math.sin(limitingFov / 2) * 1.15);
    }
    offset.setLength(Math.min(distance, camera.far * 0.8));
    controls.target.copy(target);
    camera.position.copy(target.clone().add(offset));
    controls.update();
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

  const enabled =
    editorMode === "edit"
      ? !transformDragging
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

function WorldPlayController({
  initialPosition,
  isPressed,
}: {
  initialPosition: Vec3;
  isPressed: (key: string) => boolean;
}) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const playerPosition = useMemo(
    () => new Vector3(initialPosition[0], initialPosition[1], initialPosition[2]),
    // The controller is a PlaySession resource. Authoring hot reloads must not
    // reset it unless the controller itself is remounted by starting Play.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const movement = useMemo(() => new Vector3(), []);
  const desiredCameraPosition = useMemo(() => new Vector3(), []);

  useFrame(({ camera }, delta) => {
    movement.set(0, 0, 0);
    if (isPressed("w") || isPressed("arrowup")) movement.z -= 1;
    if (isPressed("s") || isPressed("arrowdown")) movement.z += 1;
    if (isPressed("a") || isPressed("arrowleft")) movement.x -= 1;
    if (isPressed("d") || isPressed("arrowright")) movement.x += 1;

    const body = bodyRef.current;
    if (body) {
      const velocity = body.linvel();
      if (movement.lengthSq() > 0) movement.normalize().multiplyScalar(3.2);
      body.setLinvel(
        { x: movement.x, y: velocity.y, z: movement.z },
        true,
      );
      const translation = body.translation();
      playerPosition.set(translation.x, translation.y, translation.z);
    }

    desiredCameraPosition.set(
      playerPosition.x + 4.5,
      playerPosition.y + 3.5,
      playerPosition.z + 5.5,
    );
    camera.position.lerp(
      desiredCameraPosition,
      1 - Math.exp(-6 * Math.min(delta, 0.05)),
    );
    camera.lookAt(playerPosition.x, playerPosition.y + 0.65, playerPosition.z);
  });

  return (
    <RigidBody
      ref={bodyRef}
      type="dynamic"
      position={initialPosition}
      colliders={false}
      enabledRotations={[false, false, false]}
      linearDamping={5}
      canSleep={false}
    >
      <CapsuleCollider args={[0.45, 0.28]} position={[0, 0.73, 0]} friction={0.8} />
      <mesh position={[0, 0.72, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.28, 0.9, 18]} />
        <meshStandardMaterial color="#8b5cf6" roughness={0.55} />
      </mesh>
      <mesh position={[0, 1.28, 0]} castShadow>
        <sphereGeometry args={[0.26, 20, 14]} />
        <meshStandardMaterial color="#c4b5fd" roughness={0.5} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.35, 0.46, 28]} />
        <meshBasicMaterial color="#a78bfa" side={DoubleSide} />
      </mesh>
    </RigidBody>
  );
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
  return /\.(?:glb|gltf|obj|vrm)$/i.test(relativePath) ? relativePath : undefined;
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

function SceneSkyboxPreview({
  settings,
  assets,
  projectPath,
}: {
  settings: SceneSettings["skybox"];
  assets: AssetManifest;
  projectPath: string | undefined;
}) {
  const imageTexture = useSceneSkyboxTexture(
    assets,
    settings.enabled || settings.iblEnabled ? settings.imageAssetId : undefined,
    projectPath,
    settings.flipY,
  );
  if (!settings.enabled && !settings.iblEnabled) return null;
  return <ProjectedSkyboxPreview texture={imageTexture} settings={settings} />;
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
  playShortcut,
  onTogglePlay,
  onTransformModeChange,
  onToggleTransformSpace,
  notice,
  onSelect,
  onTransformCommit,
  onDropPrimitive,
  onDropMaterial,
  onDropSkybox,
  onDropBuiltinPrefab,
  onDropSceneAsset,
  onCreatePrimitive,
  frameSelectionRequest,
  exitFocusRequest,
  focusedEntity,
  onFocusChange,
  onExitFocus,
  onViewportFileDrop,
  onPlayDropAttempt,
  onDropRejected,
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
  playShortcut?: string;
  onTogglePlay: () => void;
  onTransformModeChange: (mode: TransformMode) => void;
  onToggleTransformSpace: () => void;
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
  frameSelectionRequest: number;
  exitFocusRequest: number;
  focusedEntity: SceneFocusState | null;
  onFocusChange: (focus: SceneFocusState | null) => void;
  onExitFocus: () => void;
  onViewportFileDrop: () => void;
  onPlayDropAttempt: () => void;
  onDropRejected: (message: string) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dropResolverRef = useRef<SceneDropResolver | null>(null);
  const pressedKeysRef = useRef(new Set<string>());
  const [dragOverKind, setDragOverKind] = useState<
    SceneViewportDragIntent["kind"] | null
  >(null);
  const [dragOverLabel, setDragOverLabel] = useState<string | null>(null);
  const [materialDropTarget, setMaterialDropTarget] =
    useState<MaterialDropTarget | null>(null);
  const [projection, setProjection] = useState<ViewProjection>("perspective");
  const [displayMode, setDisplayMode] =
    useState<SceneViewportDisplayMode>("scene");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [transformDragging, setTransformDragging] = useState(false);
  const transformDraggingRef = useRef(false);
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
  const effectiveDisplayMode = editorMode === "play" ? "scene" : displayMode;
  const displayProfile = useMemo(
    () => getSceneViewportDisplayProfile(effectiveDisplayMode),
    [effectiveDisplayMode],
  );
  const runtimeSpawn = useMemo(
    () => resolveRuntimeSpawnPosition(preview.scene),
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
  const selectedTransform = selectedEntityId
    ? getTransform(scene, selectedEntityId)
    : undefined;

  useEffect(() => {
    if (editorMode === "play") setProjection("perspective");
  }, [editorMode]);

  useEffect(() => {
    pressedKeysRef.current.clear();
    if (editorMode !== "play" || projectKind !== "world") return;
    const frame = window.requestAnimationFrame(() => viewportRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [editorMode, projectKind]);

  const handlePlayKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
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

  const handleViewportPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
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
      if (!leftGesture.moved && !transformDraggingRef.current) {
        const releasedEntityId =
          dropResolverRef.current?.(event.clientX, event.clientY, {
            includeEntityOriginFallback: true,
          }).authoringEntityId ?? null;
        const entityId = releasedEntityId ?? leftGesture.pressedEntityId;
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
    if (editorMode !== "edit") return;
    const gesture = rightPointerGestureRef.current;
    event.preventDefault();
    if (gesture?.suppressContextMenu || gesture?.moved) {
      rightPointerGestureRef.current = null;
      return;
    }
    rightPointerGestureRef.current = null;
    const bounds = event.currentTarget.getBoundingClientRect();
    setContextMenu({
      x: Math.min(event.clientX - bounds.left, Math.max(8, bounds.width - 190)),
      y: Math.min(event.clientY - bounds.top, Math.max(8, bounds.height - 206)),
    });
  };

  const profileLabel =
    projectKind === "world" ? "World Play Mode" : "Item Play Mode";
  const profileGuide =
    projectKind === "world"
      ? "WASD / 矢印キーでキャラクターを移動"
      : "ドラッグでアイテムをOrbit確認";
  const readyMaterialDropTarget =
    materialDropTarget?.status === "ready" ? materialDropTarget : null;
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
        className={`relative flex h-9 shrink-0 items-center justify-between gap-2 border-b px-2.5 ${
          editorMode === "play"
            ? "border-violet-400/70 bg-violet-950"
            : "border-slate-200 bg-slate-50"
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <h2
            id="scene-view-heading"
            className={`text-[12px] font-semibold ${
              editorMode === "play" ? "text-zinc-100" : "text-slate-800"
            }`}
          >
            {editorMode === "play" ? "Play Window" : "Scene View"}
          </h2>
          {editorMode === "play" ? (
            <span
              className="hidden rounded border border-violet-300/50 bg-violet-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-100 lg:inline"
              role="status"
              aria-live="polite"
            >
              分離された実行コピー · 更新 {runtimeRevision}
            </span>
          ) : selectedEntityIds.length > 1 ? (
            <span
              className="hidden rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 lg:inline"
              role="status"
              aria-live="polite"
            >
              {selectedEntityIds.length}件を選択
            </span>
          ) : null}
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-1/2 z-10 flex -translate-x-1/2 items-center">
          <button
            type="button"
            disabled={playDisabled}
            aria-pressed={editorMode === "play"}
            onClick={onTogglePlay}
            title={commandTitle(
              editorMode === "play"
                ? "Playを停止"
                : playDisabled
                  ? "アセットの読み込みが終わるとPlayできます"
                  : "Playを開始",
              "play.toggle",
              playShortcut,
            )}
            className={`pointer-events-auto flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition-colors disabled:cursor-wait disabled:opacity-45 ${
              editorMode === "play"
                ? "border-rose-400/70 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25"
                : "border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100"
            }`}
          >
            <PlayIcon size={13} aria-hidden="true" />
            {editorMode === "play" ? "停止" : "Play"}
          </button>
        </div>
        <div className="flex min-w-0 items-center gap-1.5" role="toolbar" aria-label="Scene Viewの操作">
          {(["translate", "rotate", "scale"] as const).map((mode) => {
            const Icon = EDITOR_ICONS[mode === "translate" ? "move" : mode];
            const label = mode === "translate" ? "移動" : mode === "rotate" ? "回転" : "拡縮";
            return (
              <button
                key={mode}
                type="button"
                aria-label={label}
                aria-pressed={transformMode === mode}
                disabled={editorMode !== "edit"}
                onClick={() => onTransformModeChange(mode)}
                title={commandTitle(`${label}ギズモ`, `transform.${mode}`)}
                className={`flex size-7 items-center justify-center rounded border transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
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
            disabled={editorMode !== "edit"}
            onClick={onToggleTransformSpace}
            title={commandTitle("ギズモ座標系を切り替える", "transform.toggle-space")}
            className={`flex size-7 items-center justify-center rounded border disabled:cursor-not-allowed disabled:opacity-35 ${
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
          <select
            value={projection}
            disabled={editorMode !== "edit"}
            onChange={(event) => setProjection(event.currentTarget.value as ViewProjection)}
            aria-label="カメラ投影方式"
            title="Perspective / Ortho"
            className={`h-7 rounded border px-1.5 text-[11px] font-medium outline-none focus:border-violet-400 disabled:cursor-not-allowed disabled:opacity-50 ${
              editorMode === "play"
                ? "border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500"
                : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
            }`}
          >
            <option value="perspective">Perspective</option>
            <option value="orthographic">Ortho</option>
          </select>
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
            className={`h-7 rounded border px-1.5 text-[11px] font-semibold outline-none focus:border-violet-400 disabled:cursor-not-allowed disabled:opacity-50 ${
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
          {editorMode === "play" ? (
            <span className="hidden truncate text-xs text-zinc-400 xl:inline">
              {profileLabel}
            </span>
          ) : null}
        </div>
      </div>

      <div
        ref={viewportRef}
        tabIndex={editorMode === "play" && projectKind === "world" ? 0 : -1}
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
        onPointerCancel={() => {
          leftPointerGestureRef.current = null;
          rightPointerGestureRef.current = null;
        }}
        onDragEnterCapture={handleDragEnter}
        onDragOverCapture={handleDragOver}
        onDragLeave={handleDragLeave}
        onDropCapture={handleDrop}
        onContextMenu={openContextMenu}
      >
        <Canvas
          key={projection}
          orthographic={projection === "orthographic"}
          shadows="basic"
          dpr={[1, 1.5]}
          camera={{
            position: [7, 5, 7],
            ...(projection === "orthographic"
              ? { zoom: 70 }
              : { fov: sceneSettings.camera.fov }),
            near: sceneSettings.camera.near,
            far: sceneSettings.camera.far,
          }}
        >
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
          {displayProfile.showSceneLighting ? (
            <ambientLight
              color={sceneSettings.ambient.color}
              intensity={sceneSettings.ambient.intensity}
            />
          ) : null}
          {displayProfile.showEditorLighting ? (
            <directionalLight
              position={[7, 10, 6]}
              intensity={1.35}
              castShadow
              shadow-mapSize-width={1024}
              shadow-mapSize-height={1024}
            />
          ) : null}
          {sceneSettings.editor.gizmo.gridVisible ? (
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

          <OfficialXriftPreviewProvider
            withPhysics
            gravity={
              editorMode === "play" && projectKind === "world"
                ? [0, -9.81, 0]
                : [0, 0, 0]
            }
          >
            {preview.scene.rootEntityIds.map((entityId) => (
              <SceneEntityHierarchy
                key={`${entityId}:${
                  runtimeEntityRevisions?.[
                    preview.authoringEntityIdByEntityId[entityId] ?? entityId
                  ] ?? 0
                }`}
                entityId={entityId}
                scene={preview.scene}
                authoringEntityIdByEntityId={
                  preview.authoringEntityIdByEntityId
                }
                assets={assets}
                projectPath={projectPath}
                selectedEntityIds={selectedEntityIdSet}
                primaryEntityId={selectedEntityId}
                editable={editorMode === "edit"}
                playing={editorMode === "play"}
                physicsEnabled={editorMode === "play" && projectKind === "world"}
                runtimeEntityRevisions={runtimeEntityRevisions}
                transformMode={transformMode}
                transformSpace={transformSpace}
                gizmo={sceneSettings.editor.gizmo}
                onTransformCommit={onTransformCommit}
                onDraggingChange={(dragging) => {
                  transformDraggingRef.current = dragging;
                  setTransformDragging(dragging);
                }}
                transformDraggingRef={transformDraggingRef}
                materialDragActive={dragOverKind === "material"}
                materialDropTarget={readyMaterialDropTarget}
                displayMode={effectiveDisplayMode}
                displayProfile={displayProfile}
              />
            ))}
            {editorMode === "play" && projectKind === "world" ? (
              <WorldPlayController
                initialPosition={runtimeSpawn}
                isPressed={isPressed}
              />
            ) : null}
          </OfficialXriftPreviewProvider>

          <CameraControls
            editorMode={editorMode}
            projectKind={projectKind}
            transformDragging={transformDragging}
            frameSelectionRequest={frameSelectionRequest}
            exitFocusRequest={exitFocusRequest}
            frameEntityId={selectedEntityId}
            frameEntityName={
              selectedEntityId
                ? scene.entities[selectedEntityId]?.name ?? null
                : null
            }
            frameTarget={selectedTransform?.position}
            onFocusChange={onFocusChange}
          />
        </Canvas>

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

        {notice ? (
          <div
            className="pointer-events-none absolute bottom-2.5 left-1/2 z-10 max-w-[84%] -translate-x-1/2 rounded-md border border-zinc-700 bg-zinc-950/90 px-3 py-1.5 text-xs leading-4 text-zinc-100 shadow-lg"
            role="status"
            aria-live="polite"
          >
            {notice}
          </div>
        ) : null}
      </div>
    </section>
  );
}
