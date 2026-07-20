import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Edges, OrbitControls, TransformControls } from "@react-three/drei";
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
  Color,
  DoubleSide,
  EquirectangularReflectionMapping,
  Euler,
  Plane,
  PerspectiveCamera,
  Raycaster,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
  type Group,
  type Object3D,
  type Texture,
} from "three";
import {
  BUILTIN_PRIMITIVE_CREATION_CATALOG,
  XRIFT_COMPONENT_SCHEMA_IDS,
  getBuiltinPrefabRecipe,
  getBuiltinPrimitiveCreation,
  getMaterialAssignmentTarget,
  getMaterialAsset,
  getPrimaryMaterialAssetId,
  getTransform,
  normalizeProjectRelativePath,
  resolveSceneSettings,
  type AssetManifest,
  type MeshComponent,
  type ModelAsset,
  type PrefabDocument,
  type PrimitiveGeometry,
  type SceneComponent,
  type SceneDocument,
  type SceneEntity,
  type SceneSettings,
  type TransformPatch,
  type TextureAsset,
  type Vec3,
  type VisualProjectKind,
} from "../../lib/visual-editor";
import { commandTitle, EDITOR_ICONS } from "./editor-icons";
import { ParticleEmitterVisual } from "./ParticleEmitterVisual";
import { ProjectModelVisual } from "./ProjectModelVisual";
import {
  readProjectTextureDataUrl,
  useCoreMaterialPreviewTextures,
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
const EDIT_CAMERA_TARGET: [number, number, number] = [0, 0.7, 0];

function isTransformControlsObject(object: Object3D): boolean {
  let current: Object3D | null = object;
  while (current) {
    if ((current as Object3D & { isTransformControls?: boolean }).isTransformControls) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function isTransformControlsPointerEvent(
  intersections: readonly { object: Object3D }[],
): boolean {
  return intersections.some(({ object }) => isTransformControlsObject(object));
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

function MeshVisual({
  component,
  assets,
  selected,
  materialDropHighlighted,
  projectPath,
}: {
  component: MeshComponent;
  assets: AssetManifest;
  selected: boolean;
  materialDropHighlighted: boolean;
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
  const materialAssetId = getPrimaryMaterialAssetId(component);
  const material = materialAssetId
    ? getMaterialAsset(assets, materialAssetId)
    : undefined;
  const materialTextures = useCoreMaterialPreviewTextures(
    material,
    assets,
    projectPath,
  );
  const projectModelSource =
    geometry?.kind === "model"
      ? resolveProjectModelSource(geometry, projectPath)
      : undefined;

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
        assignedMaterial={material}
        assignedTextures={materialTextures}
      />
    );
  }

  if (primitive) {
    const pbr = material?.properties.pbrMetallicRoughness;
    const alphaMode = material?.properties.alphaMode ?? "OPAQUE";
    const opacity =
      alphaMode === "OPAQUE"
        ? 1
        : (pbr?.baseColorFactor[3] ?? material?.properties.opacity ?? 1);
    const normalScale = material?.properties.normalTexture?.scale ?? 1;
    return (
      <mesh
        castShadow={component.castShadow}
        receiveShadow={component.receiveShadow}
      >
        <PrimitiveGeometryView primitive={primitive} />
        <meshStandardMaterial
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
        {selected || materialDropHighlighted ? (
          <Edges
            color={materialDropHighlighted ? "#38bdf8" : "#a78bfa"}
            scale={1.015}
            threshold={12}
          />
        ) : null}
      </mesh>
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
          color={materialDropHighlighted ? "#38bdf8" : "#a78bfa"}
          scale={1.02}
        />
      ) : null}
    </mesh>
  );
}

function LightVisual({
  component,
  selected,
}: {
  component: Extract<SceneComponent, { type: "light" }>;
  selected: boolean;
}) {
  if (!component.enabled) return null;

  return (
    <>
      {component.lightType === "ambient" ? (
        <ambientLight color={component.color} intensity={component.intensity} />
      ) : component.lightType === "point" ? (
        <pointLight
          color={component.color}
          intensity={component.intensity}
          castShadow={component.castShadow}
        />
      ) : (
        <directionalLight
          color={component.color}
          intensity={component.intensity}
          castShadow={component.castShadow}
        />
      )}
      <mesh scale={selected ? 1.15 : 1}>
        <sphereGeometry args={[0.16, 18, 12]} />
        <meshBasicMaterial
          color={selected ? "#c4b5fd" : component.color}
        />
      </mesh>
      <mesh position={[0, -0.35, 0]} rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[0.18, 0.42, 16]} />
        <meshBasicMaterial color={selected ? "#8b5cf6" : "#fbbf24"} />
      </mesh>
    </>
  );
}

function SpawnPointVisual({ selected }: { selected: boolean }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.45, 0.055, 8, 32]} />
        <meshBasicMaterial color={selected ? "#c4b5fd" : "#22d3ee"} />
      </mesh>
      <mesh position={[0, 0.45, 0]}>
        <coneGeometry args={[0.18, 0.5, 16]} />
        <meshBasicMaterial color={selected ? "#8b5cf6" : "#06b6d4"} />
      </mesh>
    </group>
  );
}

function MirrorComponentVisual({
  size,
  color,
  selected,
}: {
  size: readonly [number, number];
  color?: string;
  selected: boolean;
}) {
  return (
    <mesh>
      <planeGeometry args={[size[0], size[1]]} />
      <meshStandardMaterial
        color={selected ? "#a78bfa" : color ?? "#bae6fd"}
        metalness={0.7}
        roughness={0.18}
        transparent
        opacity={0.72}
        side={DoubleSide}
      />
      <Edges color={selected ? "#8b5cf6" : "#38bdf8"} />
    </mesh>
  );
}

function PortalComponentVisual({ selected }: { selected: boolean }) {
  const primary = selected ? "#8b5cf6" : "#6366f1";
  const glow = selected ? "#c4b5fd" : "#67e8f9";
  return (
    <group position={[0, 1.15, 0]}>
      <mesh>
        <torusGeometry args={[0.82, 0.1, 14, 48]} />
        <meshStandardMaterial
          color={primary}
          emissive={primary}
          emissiveIntensity={0.55}
          metalness={0.35}
          roughness={0.28}
        />
      </mesh>
      <mesh position={[0, 0, -0.025]}>
        <circleGeometry args={[0.72, 48]} />
        <meshBasicMaterial color={glow} transparent opacity={0.28} />
      </mesh>
      <mesh position={[0, -1.05, 0]}>
        <cylinderGeometry args={[0.72, 0.88, 0.22, 32]} />
        <meshStandardMaterial color="#334155" roughness={0.72} />
      </mesh>
    </group>
  );
}

function ScreenComponentVisual({
  width,
  selected,
}: {
  width: number;
  selected: boolean;
}) {
  const height = Math.max(0.4, width * 9 / 16);
  return (
    <group>
      <mesh>
        <boxGeometry args={[width, height, 0.08]} />
        <meshStandardMaterial
          color={selected ? "#ddd6fe" : "#0f172a"}
          emissive={selected ? "#7c3aed" : "#0284c7"}
          emissiveIntensity={selected ? 0.22 : 0.12}
          roughness={0.38}
        />
        <Edges color={selected ? "#8b5cf6" : "#64748b"} />
      </mesh>
    </group>
  );
}

function BoardComponentVisual({ selected }: { selected: boolean }) {
  return (
    <group position={[0, 1.2, 0]}>
      <mesh>
        <boxGeometry args={[2.4, 1.45, 0.1]} />
        <meshStandardMaterial
          color={selected ? "#ede9fe" : "#f8fafc"}
          roughness={0.76}
        />
        <Edges color={selected ? "#8b5cf6" : "#94a3b8"} />
      </mesh>
      <mesh position={[0, -1.05, 0]}>
        <cylinderGeometry args={[0.08, 0.1, 0.7, 12]} />
        <meshStandardMaterial color="#64748b" roughness={0.68} />
      </mesh>
    </group>
  );
}

function VideoSphereComponentVisual({
  radius,
  selected,
}: {
  radius: number;
  selected: boolean;
}) {
  return (
    <mesh>
      <sphereGeometry args={[Math.max(radius, 0.5), 36, 20, 0, Math.PI]} />
      <meshStandardMaterial
        color={selected ? "#c4b5fd" : "#0f172a"}
        emissive={selected ? "#7c3aed" : "#0369a1"}
        emissiveIntensity={0.16}
        transparent
        opacity={0.28}
        wireframe={!selected}
        side={DoubleSide}
      />
    </mesh>
  );
}

function xriftVec(
  component: Extract<SceneComponent, { type: "xrift-component" }>,
  property: string,
  size: 2 | 3,
  fallback: number[],
): number[] {
  const value = component.properties[property];
  return Array.isArray(value) &&
    value.length === size &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
    ? (value as number[])
    : fallback;
}

function xriftNumber(
  component: Extract<SceneComponent, { type: "xrift-component" }>,
  property: string,
  fallback: number,
): number {
  const value = component.properties[property];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function xriftColor(
  component: Extract<SceneComponent, { type: "xrift-component" }>,
  property: string,
  fallback: number,
): string {
  const value = Math.max(
    0,
    Math.min(0xffffff, Math.round(xriftNumber(component, property, fallback))),
  );
  return `#${value.toString(16).padStart(6, "0")}`;
}

function BuiltinPrefabComponentVisual({
  component,
  selected,
}: {
  component: Extract<SceneComponent, { type: "xrift-component" }>;
  selected: boolean;
}) {
  if (!component.enabled || component.authoring?.source !== "builtin-prefab") {
    return null;
  }
  const recipe = getBuiltinPrefabRecipe(component.authoring.recipeId);
  if (!recipe) return null;
  switch (recipe.visual.kind) {
    case "spawn-point":
      return <SpawnPointVisual selected={selected} />;
    case "mirror":
      return (
        <MirrorComponentVisual
          size={recipe.visual.size}
          color={xriftColor(component, "color", 0xb5b5b5)}
          selected={selected}
        />
      );
    case "portal":
      return <PortalComponentVisual selected={selected} />;
    case "tag-board":
      return <BoardComponentVisual selected={selected} />;
    case "screen":
      return (
        <ScreenComponentVisual
          width={recipe.visual.width}
          selected={selected}
        />
      );
  }
}

function XriftComponentVisual({
  component,
  selected,
}: {
  component: Extract<SceneComponent, { type: "xrift-component" }>;
  selected: boolean;
}) {
  if (!component.enabled) return null;
  if (component.authoring?.source === "builtin-prefab") {
    return (
      <BuiltinPrefabComponentVisual component={component} selected={selected} />
    );
  }

  const position = xriftVec(component, "position", 3, [0, 0, 0]) as Vec3;
  const rotation = xriftVec(component, "rotation", 3, [0, 0, 0]) as Vec3;
  let visual: ReactNode = null;

  switch (component.schemaId) {
    case XRIFT_COMPONENT_SCHEMA_IDS.spawnPoint:
      visual = <SpawnPointVisual selected={selected} />;
      break;
    case XRIFT_COMPONENT_SCHEMA_IDS.mirror: {
      const size = xriftVec(component, "size", 2, [3, 2]) as [number, number];
      visual = (
        <MirrorComponentVisual
          size={size}
          color={xriftColor(component, "color", 0xb5b5b5)}
          selected={selected}
        />
      );
      break;
    }
    case XRIFT_COMPONENT_SCHEMA_IDS.portal:
      visual = <PortalComponentVisual selected={selected} />;
      break;
    case XRIFT_COMPONENT_SCHEMA_IDS.videoScreen: {
      const scale = xriftVec(component, "scale", 2, [16 / 9 * 3, 3]);
      visual = (
        <ScreenComponentVisual width={Math.max(scale[0] ?? 4, 0.4)} selected={selected} />
      );
      break;
    }
    case XRIFT_COMPONENT_SCHEMA_IDS.videoPlayer:
    case XRIFT_COMPONENT_SCHEMA_IDS.liveVideoPlayer:
    case XRIFT_COMPONENT_SCHEMA_IDS.screenShareDisplay:
      visual = (
        <ScreenComponentVisual
          width={Math.max(xriftNumber(component, "width", 4), 0.4)}
          selected={selected}
        />
      );
      break;
    case XRIFT_COMPONENT_SCHEMA_IDS.tagBoard:
      visual = <BoardComponentVisual selected={selected} />;
      break;
    case XRIFT_COMPONENT_SCHEMA_IDS.video180Sphere:
      visual = (
        <VideoSphereComponentVisual
          radius={xriftNumber(component, "radius", 5)}
          selected={selected}
        />
      );
      break;
    default:
      return null;
  }

  return (
    <group position={position} rotation={rotation}>
      {visual}
    </group>
  );
}

function ComponentVisual({
  component,
  assets,
  selected,
  materialDragActive,
  materialDropHighlighted,
  projectPath,
}: {
  component: SceneComponent;
  assets: AssetManifest;
  selected: boolean;
  materialDragActive: boolean;
  materialDropHighlighted: boolean;
  projectPath?: string;
}) {
  switch (component.type) {
    case "transform":
      return null;
    case "mesh":
      return (
        <group userData={{ meshComponentId: component.id }}>
          <MeshVisual
            component={component}
            assets={assets}
            selected={materialDragActive ? materialDropHighlighted : selected}
            materialDropHighlighted={materialDropHighlighted}
            projectPath={projectPath}
          />
        </group>
      );
    case "collider":
      if (!component.enabled || !selected || component.shape !== "box") {
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
            color="#22c55e"
            wireframe
            transparent
            opacity={0.9}
            depthTest={false}
          />
        </mesh>
      );
    case "light":
      return <LightVisual component={component} selected={selected} />;
    case "spawn-point":
      return component.enabled ? (
        <SpawnPointVisual selected={selected} />
      ) : null;
    case "particle-emitter": {
      const asset = assets.assets[component.particleAssetId];
      return component.enabled && asset?.kind === "particle" ? (
        <ParticleEmitterVisual asset={asset} selected={selected} />
      ) : null;
    }
    case "xrift-component":
      return (
        <XriftComponentVisual
          component={component}
          selected={selected}
        />
      );
  }
}

function EntityObject({
  entity,
  authoringEntityId,
  assets,
  selected,
  editable,
  transformMode,
  transformSpace,
  gizmo,
  projectPath,
  onSelect,
  onTransformCommit,
  onDraggingChange,
  transformDraggingRef,
  materialDragActive,
  materialDropTarget,
  children,
}: {
  entity: SceneEntity;
  authoringEntityId: string;
  assets: AssetManifest;
  selected: boolean;
  editable: boolean;
  transformMode: TransformMode;
  transformSpace: TransformSpace;
  gizmo: SceneSettings["editor"]["gizmo"];
  projectPath?: string;
  onSelect: (entityId: string) => void;
  onTransformCommit: (entityId: string, patch: TransformPatch) => void;
  onDraggingChange: (dragging: boolean) => void;
  transformDraggingRef: { current: boolean };
  materialDragActive: boolean;
  materialDropTarget: MaterialDropReadyTarget | null;
  children?: ReactNode;
}) {
  const objectRef = useRef<Group>(null!);
  const transform = getTransform(entity);

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
        onPointerDown={
          editable
            ? (event) => {
                event.stopPropagation();
                if (
                  transformDraggingRef.current ||
                  isTransformControlsPointerEvent(event.intersections)
                ) {
                  return;
                }
                onSelect(authoringEntityId);
              }
            : undefined
        }
      >
        {entity.components.map((component) => (
          <ComponentVisual
            key={component.id}
            component={component}
            assets={assets}
            selected={selected}
            materialDragActive={materialDragActive}
            materialDropHighlighted={
              materialDropTarget?.entityId === authoringEntityId &&
              materialDropTarget.meshComponentId === component.id
            }
            projectPath={projectPath}
          />
        ))}
        {children}
      </group>
      {selected &&
      editable &&
      transform &&
      entity.id === authoringEntityId ? (
        <TransformControls
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

type SceneDropResolver = (clientX: number, clientY: number) => SceneDropHit;

function entityDropMetadata(object: Object3D): {
  authoringEntityId: string;
  renderedEntityId: string;
  meshComponentId: string;
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
      meshComponentId !== null &&
      typeof authoringEntityId === "string" &&
      typeof renderedEntityId === "string"
    ) {
      return { authoringEntityId, renderedEntityId, meshComponentId };
    }
    current = current.parent;
  }
  return null;
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

  useLayoutEffect(() => {
    resolverRef.current = (clientX, clientY) => {
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
        const metadata = entityDropMetadata(intersection.object);
        if (!metadata) continue;
        authoringEntityId = metadata.authoringEntityId;
        renderedEntityId = metadata.renderedEntityId;
        meshComponentId = metadata.meshComponentId;
        break;
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
  }, [camera, gl, groundHit, groundPlane, pointer, raycaster, resolverRef, scene]);

  return null;
}

function SceneEntityHierarchy({
  entityId,
  scene,
  authoringEntityIdByEntityId,
  assets,
  selectedEntityId,
  editable,
  transformMode,
  transformSpace,
  gizmo,
  projectPath,
  onSelect,
  onTransformCommit,
  onDraggingChange,
  transformDraggingRef,
  materialDragActive,
  materialDropTarget,
  ancestors = new Set<string>(),
}: {
  entityId: string;
  scene: SceneDocument;
  authoringEntityIdByEntityId: Readonly<Record<string, string>>;
  assets: AssetManifest;
  selectedEntityId: string | null;
  editable: boolean;
  transformMode: TransformMode;
  transformSpace: TransformSpace;
  gizmo: SceneSettings["editor"]["gizmo"];
  projectPath?: string;
  onSelect: (entityId: string) => void;
  onTransformCommit: (entityId: string, patch: TransformPatch) => void;
  onDraggingChange: (dragging: boolean) => void;
  transformDraggingRef: { current: boolean };
  materialDragActive: boolean;
  materialDropTarget: MaterialDropReadyTarget | null;
  ancestors?: ReadonlySet<string>;
}) {
  const entity = scene.entities[entityId];
  if (!entity || ancestors.has(entityId)) return null;
  const authoringEntityId =
    authoringEntityIdByEntityId[entityId] ?? entityId;
  const nextAncestors = new Set(ancestors);
  nextAncestors.add(entityId);

  return (
    <EntityObject
      entity={entity}
      authoringEntityId={authoringEntityId}
      assets={assets}
      projectPath={projectPath}
      selected={selectedEntityId === authoringEntityId}
      editable={editable}
      transformMode={transformMode}
      transformSpace={transformSpace}
      gizmo={gizmo}
      onSelect={onSelect}
      onTransformCommit={onTransformCommit}
      onDraggingChange={onDraggingChange}
      transformDraggingRef={transformDraggingRef}
      materialDragActive={materialDragActive}
      materialDropTarget={materialDropTarget}
    >
      {entity.children.map((childId) => (
        <SceneEntityHierarchy
          key={childId}
          entityId={childId}
          scene={scene}
          authoringEntityIdByEntityId={authoringEntityIdByEntityId}
          assets={assets}
          selectedEntityId={selectedEntityId}
          editable={editable}
          transformMode={transformMode}
          transformSpace={transformSpace}
          gizmo={gizmo}
          projectPath={projectPath}
          onSelect={onSelect}
          onTransformCommit={onTransformCommit}
          onDraggingChange={onDraggingChange}
          transformDraggingRef={transformDraggingRef}
          materialDragActive={materialDragActive}
          materialDropTarget={materialDropTarget}
          ancestors={nextAncestors}
        />
      ))}
    </EntityObject>
  );
}

function CameraControls({
  editorMode,
  projectKind,
  transformDragging,
  frameSelectionRequest,
  frameTarget,
}: {
  editorMode: EditorMode;
  projectKind: VisualProjectKind;
  transformDragging: boolean;
  frameSelectionRequest: number;
  frameTarget?: Vec3;
}) {
  const camera = useThree((state) => state.camera);
  const controlsRef = useRef<ElementRef<typeof OrbitControls>>(null!);
  const previousMode = useRef<EditorMode>(editorMode);
  const savedEditPosition = useRef(new Vector3(7, 5, 7));
  const savedEditTarget = useRef(new Vector3(...EDIT_CAMERA_TARGET));

  useLayoutEffect(() => {
    const previous = previousMode.current;
    const controls = controlsRef.current;
    if (previous === "edit" && editorMode === "play") {
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
  }, [camera, editorMode]);

  useLayoutEffect(() => {
    const controls = controlsRef.current;
    if (
      editorMode !== "edit" ||
      !controls ||
      !frameTarget ||
      frameSelectionRequest === 0
    ) {
      return;
    }
    const target = new Vector3(...frameTarget);
    const offset = camera.position.clone().sub(controls.target);
    if (offset.lengthSq() < 0.01) offset.set(4, 3, 4);
    offset.setLength(Math.max(2.5, Math.min(8, offset.length())));
    controls.target.copy(target);
    camera.position.copy(target.clone().add(offset));
    controls.update();
  }, [camera, editorMode, frameSelectionRequest, frameTarget]);

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
      maxDistance={30}
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
  const playerRef = useRef<Group>(null);
  const playerPosition = useMemo(
    () => new Vector3(initialPosition[0], initialPosition[1], initialPosition[2]),
    [initialPosition],
  );
  const movement = useMemo(() => new Vector3(), []);
  const desiredCameraPosition = useMemo(() => new Vector3(), []);

  useFrame(({ camera }, delta) => {
    movement.set(0, 0, 0);
    if (isPressed("w") || isPressed("arrowup")) movement.z -= 1;
    if (isPressed("s") || isPressed("arrowdown")) movement.z += 1;
    if (isPressed("a") || isPressed("arrowleft")) movement.x -= 1;
    if (isPressed("d") || isPressed("arrowright")) movement.x += 1;

    if (movement.lengthSq() > 0) {
      movement.normalize().multiplyScalar(3.2 * Math.min(delta, 0.05));
      playerPosition.add(movement);
    }
    if (playerRef.current) playerRef.current.position.copy(playerPosition);

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
    <group ref={playerRef} position={initialPosition}>
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
    </group>
  );
}

function findRuntimeSpawn(scene: SceneDocument): Vec3 {
  for (const entity of Object.values(scene.entities)) {
    if (!entity.components.some((component) => component.type === "spawn-point")) {
      continue;
    }
    const transform = getTransform(entity);
    if (transform) return [...transform.position];
  }
  return [0, 0, 2.5];
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
  return /\.(?:glb|gltf)$/i.test(relativePath) ? relativePath : undefined;
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
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKYBOX_FRAGMENT_SHADER = `
  uniform vec3 uTopColor;
  uniform vec3 uBottomColor;
  uniform float uOffset;
  uniform float uExponent;
  uniform float uExposure;
  varying vec3 vDirection;
  void main() {
    float t = clamp(vDirection.y * 0.5 + 0.5 + uOffset, 0.0, 1.0);
    t = pow(t, max(uExponent, 0.01));
    gl_FragColor = vec4(mix(uBottomColor, uTopColor, t) * uExposure, 1.0);
  }
`;

function useSceneSkyboxTexture(
  assets: AssetManifest,
  imageAssetId: string | undefined,
  projectPath: string | undefined,
): Texture | null {
  const asset = imageAssetId ? assets.assets[imageAssetId] : undefined;
  const textureAsset =
    asset?.kind === "texture" && asset.source.kind === "project"
      ? (asset as TextureAsset & {
          source: { kind: "project"; relativePath: string };
        })
      : undefined;
  const textureKey = textureAsset
    ? [
        projectPath ?? "",
        textureAsset.id,
        textureAsset.sourceHash ?? "",
        textureAsset.source.relativePath,
        textureAsset.importSettings.flipY,
      ].join("\\n")
    : "";
  const [texture, setTexture] = useState<Texture | null>(null);

  useEffect(() => {
    let active = true;
    let ownedTexture: Texture | null = null;
    setTexture(null);
    if (!projectPath || !textureAsset) {
      return () => {
        active = false;
      };
    }

    void readProjectTextureDataUrl(projectPath, textureAsset)
      .then((dataUrl) => new TextureLoader().loadAsync(dataUrl))
      .then((nextTexture) => {
        nextTexture.name = `${textureAsset.name} (skybox)`;
        nextTexture.colorSpace = SRGBColorSpace;
        nextTexture.flipY = textureAsset.importSettings.flipY;
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
  }, [projectPath, textureAsset, textureKey]);

  return texture;
}

function ImageSkyboxPreview({
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
    scene.background = texture;
    scene.environment = texture;
    scene.backgroundIntensity = settings.exposure;
    scene.environmentIntensity = settings.exposure;
    scene.backgroundRotation.set(0, rotation, 0);
    scene.environmentRotation.set(0, rotation, 0);

    return () => {
      scene.background = previousBackground;
      scene.environment = previousEnvironment;
      scene.backgroundIntensity = previousBackgroundIntensity;
      scene.environmentIntensity = previousEnvironmentIntensity;
      scene.backgroundRotation.copy(previousBackgroundRotation);
      scene.environmentRotation.copy(previousEnvironmentRotation);
    };
  }, [scene, settings.exposure, settings.rotationDegrees, texture]);
  return null;
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
    settings.enabled ? settings.imageAssetId : undefined,
    projectPath,
  );
  if (!settings.enabled) return null;
  if (imageTexture) {
    return <ImageSkyboxPreview texture={imageTexture} settings={settings} />;
  }
  const materialKey = [
    settings.topColor,
    settings.bottomColor,
    settings.offset,
    settings.exponent,
    settings.exposure,
  ].join(":");
  return (
    <mesh scale={100} frustumCulled={false} renderOrder={-1}>
      <sphereGeometry args={[1, 32, 20]} />
      <shaderMaterial
        key={materialKey}
        side={BackSide}
        depthWrite={false}
        vertexShader={SKYBOX_VERTEX_SHADER}
        fragmentShader={SKYBOX_FRAGMENT_SHADER}
        uniforms={{
          uTopColor: { value: new Color(settings.topColor) },
          uBottomColor: { value: new Color(settings.bottomColor) },
          uOffset: { value: settings.offset },
          uExponent: { value: settings.exponent },
          uExposure: { value: settings.exposure },
        }}
      />
    </mesh>
  );
}

function EditorCameraSettings({
  settings,
}: {
  settings: SceneSettings["camera"];
}) {
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    camera.near = settings.near;
    camera.far = settings.far;
    camera.fov = settings.fov;
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
  editorMode,
  transformMode,
  transformSpace,
  notice,
  onSelect,
  onTransformCommit,
  onDropPrimitive,
  onDropMaterial,
  onDropBuiltinPrefab,
  onDropSceneAsset,
  onCreatePrimitive,
  frameSelectionRequest,
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
  editorMode: EditorMode;
  transformMode: TransformMode;
  transformSpace: TransformSpace;
  notice: string | null;
  onSelect: (selection: EditorSelection) => void;
  onTransformCommit: (entityId: string, patch: TransformPatch) => void;
  onDropPrimitive: (creationId: string, position: Vec3) => void;
  onDropMaterial: (
    entityId: string,
    materialAssetId: string,
    meshComponentId: string,
  ) => void;
  onDropBuiltinPrefab: (recipeId: string, position: Vec3) => void;
  onDropSceneAsset: (assetId: string, position: Vec3) => void;
  onCreatePrimitive: (creationId: string) => void;
  frameSelectionRequest: number;
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
  const preview = useMemo(
    () => createSceneViewportPreview(scene, assets, prefabs),
    [assets, prefabs, scene],
  );
  const sceneSettings = useMemo(
    () => resolveSceneSettings(scene.settings),
    [scene.settings],
  );
  const runtimeSpawn = useMemo(
    () => findRuntimeSpawn(preview.scene),
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
  const selectedTransform = selectedEntityId
    ? getTransform(scene, selectedEntityId)
    : undefined;

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
    if (event.button === 2) {
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
          : dragOverKind === "builtin-prefab"
            ? `${dragOverLabel ?? "XRift Component"}を配置`
            : dragOverKind === "scene-asset"
              ? `${dragOverLabel ?? "Model / Prefab / Particle"}をSceneへ配置`
        : "CreateメニューからPrimitiveを追加";

  return (
    <section
      className="relative flex min-h-0 flex-col overflow-hidden bg-zinc-950"
      aria-labelledby="scene-view-heading"
    >
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-zinc-700 bg-zinc-900 px-3">
        <div className="flex items-center gap-2">
          <h2
            id="scene-view-heading"
            className="text-[12px] font-semibold text-zinc-100"
          >
            Scene View
          </h2>
          <span className="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-xs font-medium text-zinc-300">
            Perspective
          </span>
        </div>
        <span className="text-xs text-zinc-400">
          {editorMode === "edit" ? "編集モード" : profileLabel}
        </span>
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
          rightPointerGestureRef.current = null;
        }}
        onDragEnterCapture={handleDragEnter}
        onDragOverCapture={handleDragOver}
        onDragLeave={handleDragLeave}
        onDropCapture={handleDrop}
        onContextMenu={openContextMenu}
      >
        <Canvas
          shadows="basic"
          dpr={[1, 1.5]}
          camera={{
            position: [7, 5, 7],
            fov: sceneSettings.camera.fov,
            near: sceneSettings.camera.near,
            far: sceneSettings.camera.far,
          }}
          onPointerMissed={() => {
            if (editorMode === "edit" && !transformDraggingRef.current) {
              onSelect(null);
            }
          }}
        >
          <color attach="background" args={[sceneSettings.editor.backgroundColor]} />
          {sceneSettings.fog.enabled ? (
            <fog
              attach="fog"
              args={[
                sceneSettings.fog.color,
                sceneSettings.fog.near,
                sceneSettings.fog.far,
              ]}
            />
          ) : null}
          <SceneSkyboxPreview
            settings={sceneSettings.skybox}
            assets={assets}
            projectPath={projectPath}
          />
          <EditorCameraSettings settings={sceneSettings.camera} />
          <ambientLight
            color={sceneSettings.ambient.color}
            intensity={sceneSettings.ambient.intensity}
          />
          <directionalLight
            position={[7, 10, 6]}
            intensity={1.35}
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
          />
          <mesh
            position={[0, -0.025, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
          >
            <planeGeometry args={[60, 60]} />
            <meshStandardMaterial color="#202024" roughness={1} />
          </mesh>
          {sceneSettings.editor.gizmo.gridVisible ? (
            <gridHelper
              args={[
                sceneSettings.editor.gizmo.gridSize,
                sceneSettings.editor.gizmo.gridDivisions,
                "#52525b",
                "#2d2d33",
              ]}
              position={[0, 0.005, 0]}
            />
          ) : null}

          <SceneDropProjectionBridge resolverRef={dropResolverRef} />

          {preview.scene.rootEntityIds.map((entityId) => (
            <SceneEntityHierarchy
              key={entityId}
              entityId={entityId}
              scene={preview.scene}
              authoringEntityIdByEntityId={
                preview.authoringEntityIdByEntityId
              }
              assets={assets}
              projectPath={projectPath}
              selectedEntityId={selectedEntityId}
              editable={editorMode === "edit"}
              transformMode={transformMode}
              transformSpace={transformSpace}
              gizmo={sceneSettings.editor.gizmo}
              onSelect={(entityId) =>
                onSelect({ kind: "entity", id: entityId })
              }
              onTransformCommit={onTransformCommit}
              onDraggingChange={(dragging) => {
                transformDraggingRef.current = dragging;
                setTransformDragging(dragging);
              }}
              transformDraggingRef={transformDraggingRef}
              materialDragActive={dragOverKind === "material"}
              materialDropTarget={readyMaterialDropTarget}
            />
          ))}

          <CameraControls
            editorMode={editorMode}
            projectKind={projectKind}
            transformDragging={transformDragging}
            frameSelectionRequest={frameSelectionRequest}
            frameTarget={selectedTransform?.position}
          />
          {editorMode === "play" && projectKind === "world" ? (
            <WorldPlayController
              initialPosition={runtimeSpawn}
              isPressed={isPressed}
            />
          ) : null}
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

        <div className="pointer-events-none absolute left-2.5 top-2.5 z-10 max-w-[80%] rounded-md border border-zinc-700/80 bg-zinc-950/85 px-2.5 py-1.5 text-xs leading-4 text-zinc-200 shadow-lg backdrop-blur">
          {editorMode === "edit" ? (
            <span>
              Entity選択 / {transformMode === "translate" ? "移動" : transformMode === "rotate" ? "回転" : "拡縮"}ギズモ / PrimitiveはCreateから追加
            </span>
          ) : (
            <span>{profileGuide}</span>
          )}
        </div>

        {modelProxyVisible ? (
          <div className="pointer-events-none absolute right-2.5 top-2.5 z-10 rounded border border-amber-700/60 bg-amber-950/75 px-2 py-1 text-xs text-amber-200">
            Model proxy preview
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
