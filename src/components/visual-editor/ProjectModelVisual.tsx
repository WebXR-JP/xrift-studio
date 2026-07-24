import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  GLTFLoader,
  type GLTF,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  VRMLoaderPlugin,
  VRMUtils,
  type VRM,
} from "@pixiv/three-vrm";
import {
  Box3,
  AnimationMixer,
  BackSide,
  ClampToEdgeWrapping,
  Color,
  DoubleSide,
  FrontSide,
  Group,
  LinearFilter,
  LoopOnce,
  LoopRepeat,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  NoColorSpace,
  RepeatWrapping,
  ShaderMaterial,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector4,
  Vector3,
  type Material,
  type AnimationClip,
  type Object3D,
  type Texture,
} from "three";
import { tauri } from "../../lib/tauri";
import {
  normalizeMaterialProperties,
  applyCustomShaderSourceOverrides,
  bindCustomShaderGeometryAttributes,
  getKhrInteractivityOnStartAnimationIndices,
  hasCustomShaderEntrypoints,
  inspectCustomShaderUniforms,
  readCustomShaderAttributeBindings,
  detectOpenBrushGltfDocument,
  resolveOpenBrushEditorBrushBaseUrl,
  validateGltfNodeHierarchy,
  type AssetManifest,
  type AnimationComponent,
  type ClassicR3fMaterialShader,
  type MaterialAsset,
  type ModelPoseState,
} from "../../lib/visual-editor";
import {
  applyCoreMaterialPreviewTextures,
  refreshMaterialPreviewRender,
  useMaterialPreviewTextures,
  type CoreMaterialPreviewTextures,
} from "./material-texture-preview";
import {
  createOpenBrushPreviewExtension,
  markOpenBrushPbrFallback,
  normalizeOpenBrushGlslSource,
  readOpenBrushPbrFallback,
  type OpenBrushPbrFallbackInfo,
} from "../../lib/visual-editor/open-brush-preview-loader";
import { repairImportedObject3DHierarchy } from "../../lib/visual-editor/object3d-hierarchy";
import type { SceneViewportMaterialStyle } from "./scene-viewport-display";

export type ProjectModelMaterialAssignment = {
  slot: string;
  sourceMaterialIndex: number;
  sourceNodeIndex?: number;
  sourceNodeName?: string;
  material: MaterialAsset;
};

type ResolvedProjectModelMaterialAssignment =
  ProjectModelMaterialAssignment & {
    textures: CoreMaterialPreviewTextures;
    classicShaderTextures: Readonly<Record<string, Texture>>;
  };

type Props = {
  projectPath: string;
  sourceRelativePath: string;
  sourceHash?: string;
  importScale?: number;
  castShadow: boolean;
  receiveShadow: boolean;
  selected: boolean;
  assets: AssetManifest;
  assignedMaterials: readonly ProjectModelMaterialAssignment[];
  pose?: ModelPoseState;
  animation?: AnimationComponent;
  playing?: boolean;
  declaredInteractionAnimationIndices?: readonly number[];
  sourceNodeIndex?: number;
  sourceNodeName?: string;
  /** Scene View-only material override. It never changes the imported Asset. */
  viewportMaterialStyle?: SceneViewportMaterialStyle;
  /** Centers and scales one source node for a compact Asset Inspector preview. */
  fitPreview?: boolean;
  loadRevision?: number;
  onLoadStateChange?: (state: ProjectModelLoadState) => void;
  onMaterialRuntimeInfoChange?: (
    materials: readonly ProjectModelMaterialRuntimeInfo[],
  ) => void;
};

export type ProjectModelLoadState =
  | { status: "loading" }
  | {
      status: "ready";
      object: Object3D;
      animations: AnimationClip[];
      interactionAnimationIndices: number[];
    }
  | { status: "error"; message: string };

export type ProjectModelMaterialRuntimeInfo = {
  name: string;
  materialType: string;
  shaderKind: "raw" | "shader" | "standard" | "other";
  glslVersion?: string;
  vertexShader?: string;
  fragmentShader?: string;
  uniformNames: string[];
  textureNames: string[];
  resourcePaths: string[];
  attributeBindings: ReturnType<typeof readCustomShaderAttributeBindings>;
  uniformBindings: ReturnType<typeof inspectCustomShaderUniforms>;
  pbrFallback?: OpenBrushPbrFallbackInfo;
};

const MODEL_DATA_CACHE = new Map<string, Promise<string>>();
type ProjectModelData = {
  object: Object3D;
  animations: AnimationClip[];
  interactionAnimationIndices: number[];
};

const MODEL_OBJECT_CACHE = new Map<string, Promise<ProjectModelData>>();
const EMPTY_RESOLVED_MATERIALS: readonly ResolvedProjectModelMaterialAssignment[] =
  [];
const EMPTY_ANIMATION_INDICES: readonly number[] = [];

export function ProjectModelVisual({
  projectPath,
  sourceRelativePath,
  sourceHash,
  importScale = 1,
  castShadow,
  receiveShadow,
  selected,
  assets,
  assignedMaterials,
  pose,
  animation,
  playing = false,
  declaredInteractionAnimationIndices = EMPTY_ANIMATION_INDICES,
  sourceNodeIndex,
  sourceNodeName,
  viewportMaterialStyle = "scene",
  fitPreview = false,
  loadRevision = 0,
  onLoadStateChange,
  onMaterialRuntimeInfoChange,
}: Props) {
  const cacheKey = `${projectPath}\n${sourceRelativePath}\n${sourceHash ?? ""}\n${loadRevision}`;
  const [state, setState] = useState<ProjectModelLoadState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    const dataPromise =
      MODEL_DATA_CACHE.get(cacheKey) ??
      tauri.readProjectFileDataUrl(projectPath, sourceRelativePath);
    MODEL_DATA_CACHE.set(cacheKey, dataPromise);
    const promise =
      MODEL_OBJECT_CACHE.get(cacheKey) ??
      dataPromise
        .then(dataUrlToArrayBuffer)
        .then((buffer) => parseSelfContainedModel(buffer, sourceRelativePath));
    MODEL_OBJECT_CACHE.set(cacheKey, promise);

    void promise
      .then((data) => {
        if (!active) return;
        setState({ status: "ready", ...data });
      })
      .catch((error) => {
        MODEL_DATA_CACHE.delete(cacheKey);
        MODEL_OBJECT_CACHE.delete(cacheKey);
        if (active) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });

    return () => {
      active = false;
    };
  }, [cacheKey, projectPath, sourceRelativePath]);

  useEffect(() => {
    onLoadStateChange?.(state);
  }, [onLoadStateChange, state]);

  return (
    <ProjectModelMaterialTextureResolver
      assignments={assignedMaterials}
      assets={assets}
      projectPath={projectPath}
      resolved={EMPTY_RESOLVED_MATERIALS}
    >
      {(resolvedMaterials) => (
        <ProjectModelRender
          state={state}
          importScale={importScale}
          castShadow={castShadow}
          receiveShadow={receiveShadow}
          selected={selected}
          assignedMaterials={resolvedMaterials}
          pose={pose}
          animation={animation}
          playing={playing}
          declaredInteractionAnimationIndices={
            declaredInteractionAnimationIndices
          }
          sourceNodeIndex={sourceNodeIndex}
          sourceNodeName={sourceNodeName}
          viewportMaterialStyle={viewportMaterialStyle}
          fitPreview={fitPreview}
          onMaterialRuntimeInfoChange={onMaterialRuntimeInfoChange}
        />
      )}
    </ProjectModelMaterialTextureResolver>
  );
}

function ProjectModelMaterialTextureResolver({
  assignments,
  assets,
  projectPath,
  resolved,
  children,
}: {
  assignments: readonly ProjectModelMaterialAssignment[];
  assets: AssetManifest;
  projectPath: string;
  resolved: readonly ResolvedProjectModelMaterialAssignment[];
  children: (
    assignments: readonly ResolvedProjectModelMaterialAssignment[],
  ) => ReactNode;
}) {
  const [assignment, ...remaining] = assignments;
  if (!assignment) return children(resolved);
  return (
    <ProjectModelMaterialTextureSlot
      key={`${assignment.slot}:${assignment.material.id}`}
      assignment={assignment}
      remaining={remaining}
      assets={assets}
      projectPath={projectPath}
      resolved={resolved}
    >
      {children}
    </ProjectModelMaterialTextureSlot>
  );
}

function ProjectModelMaterialTextureSlot({
  assignment,
  remaining,
  assets,
  projectPath,
  resolved,
  children,
}: {
  assignment: ProjectModelMaterialAssignment;
  remaining: readonly ProjectModelMaterialAssignment[];
  assets: AssetManifest;
  projectPath: string;
  resolved: readonly ResolvedProjectModelMaterialAssignment[];
  children: (
    assignments: readonly ResolvedProjectModelMaterialAssignment[],
  ) => ReactNode;
}) {
  const textures = useMaterialPreviewTextures(
    assignment.material,
    assets,
    projectPath,
  );
  const classicShaderTextures = useClassicShaderTextures(
    assignment.material,
    assets,
    projectPath,
  );
  const nextResolved = useMemo(
    () => [
      ...resolved,
      { ...assignment, textures, classicShaderTextures },
    ],
    [assignment, classicShaderTextures, resolved, textures],
  );
  return (
    <ProjectModelMaterialTextureResolver
      assignments={remaining}
      assets={assets}
      projectPath={projectPath}
      resolved={nextResolved}
    >
      {children}
    </ProjectModelMaterialTextureResolver>
  );
}

function ProjectModelRender({
  state,
  importScale,
  castShadow,
  receiveShadow,
  selected,
  assignedMaterials,
  pose,
  animation,
  playing,
  declaredInteractionAnimationIndices,
  sourceNodeIndex,
  sourceNodeName,
  viewportMaterialStyle,
  fitPreview,
  onMaterialRuntimeInfoChange,
}: {
  state: ProjectModelLoadState;
  importScale: number;
  castShadow: boolean;
  receiveShadow: boolean;
  selected: boolean;
  assignedMaterials: readonly ResolvedProjectModelMaterialAssignment[];
  pose?: ModelPoseState;
  animation?: AnimationComponent;
  playing: boolean;
  declaredInteractionAnimationIndices: readonly number[];
  sourceNodeIndex?: number;
  sourceNodeName?: string;
  viewportMaterialStyle: SceneViewportMaterialStyle;
  fitPreview: boolean;
  onMaterialRuntimeInfoChange?: (
    materials: readonly ProjectModelMaterialRuntimeInfo[],
  ) => void;
}) {
  const readyObject = state.status === "ready" ? state.object : null;
  const animations = state.status === "ready" ? state.animations : [];
  const interactionAnimationIndices =
    state.status === "ready"
      ? (state.interactionAnimationIndices ?? EMPTY_ANIMATION_INDICES)
      : EMPTY_ANIMATION_INDICES;
  const renderedModel = useMemo(() => {
    if (!readyObject) return null;
    // Sanitize the cached source before SkeletonUtils.clone recurses through it.
    repairImportedObject3DHierarchy(readyObject);
    const source = clone(readyObject);
    repairImportedObject3DHierarchy(source);
    const sourceMaterials = collectSourceMaterials(source);
    const object = selectSourceModelNode(
      source,
      sourceNodeIndex,
      sourceNodeName,
    );
    applyStaticModelPose(object, pose);
    const selectionBounds = getModelSelectionBounds(object);
    const ownedMaterials = applyAssignedMaterialPreviews(
      object,
      assignedMaterials,
      sourceMaterials,
    );
    ownedMaterials.push(
      ...applySceneViewportMaterialStyle(object, viewportMaterialStyle),
    );
    return { object, ownedMaterials, selectionBounds };
  }, [
    assignedMaterials,
    pose,
    readyObject,
    sourceNodeIndex,
    sourceNodeName,
    viewportMaterialStyle,
  ]);
  const renderedObject = renderedModel?.object ?? null;
  const mixer = useMemo(
    () => (renderedObject ? new AnimationMixer(renderedObject) : null),
    [renderedObject],
  );
  const playbackClips = useMemo(() => {
    if (!playing) return [];
    const indices = new Set<number>();
    if (animation?.enabled && animation.autoplay && animations[0]) indices.add(0);
    interactionAnimationIndices.forEach((index) => indices.add(index));
    declaredInteractionAnimationIndices.forEach((index) => indices.add(index));
    return [...indices].flatMap((index) =>
      animations[index] ? [animations[index]] : [],
    );
  }, [
    animation?.autoplay,
    animation?.enabled,
    animations,
    declaredInteractionAnimationIndices,
    interactionAnimationIndices,
    playing,
  ]);
  const playbackActive = Boolean(
    mixer &&
      playbackClips.length > 0,
  );
  const invalidate = useThree((canvasState) => canvasState.invalidate);
  const materialRuntimeInfo = useMemo(
    () =>
      renderedModel?.ownedMaterials.map(inspectProjectModelMaterialRuntime) ?? [],
    [renderedModel],
  );

  useEffect(() => {
    onMaterialRuntimeInfoChange?.(materialRuntimeInfo);
  }, [materialRuntimeInfo, onMaterialRuntimeInfoChange]);

  useLayoutEffect(() => {
    refreshMaterialPreviewRender(
      renderedModel?.ownedMaterials,
      {},
      invalidate,
    );
  }, [invalidate, renderedModel]);

  useEffect(
    () => () => {
      renderedModel?.ownedMaterials.forEach((material) => material.dispose());
    },
    [renderedModel],
  );

  useEffect(() => {
    renderedObject?.traverse((child) => {
      const mesh = child as Object3D & {
        isMesh?: boolean;
        castShadow?: boolean;
        receiveShadow?: boolean;
      };
      if (!mesh.isMesh) return;
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
    });
  }, [castShadow, receiveShadow, renderedObject]);

  useEffect(() => {
    if (!mixer || !renderedObject || !playbackActive) {
      return;
    }
    const loop = animation?.loop ?? false;
    const actions = playbackClips.map((clip) => {
      const action = mixer.clipAction(clip);
      action.reset();
      action.clampWhenFinished = !loop;
      action.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1);
      action.play();
      return action;
    });
    invalidate();
    return () => {
      actions.forEach((action) => action.stop());
      mixer.stopAllAction();
      playbackClips.forEach((clip) => mixer.uncacheClip(clip));
      renderedObject.updateMatrixWorld(true);
      invalidate();
    };
  }, [
    animation?.loop,
    invalidate,
    mixer,
    playbackActive,
    playbackClips,
    renderedObject,
  ]);

  useFrame((frame, delta) => {
    if (playbackActive) mixer?.update(Math.min(delta, 0.1));
    renderedModel?.ownedMaterials.forEach((material) => {
      const shader = material as ShaderMaterial;
      const uniformName = material.userData.xriftAnimatedTimeUniform;
      if (
        typeof uniformName === "string" &&
        shader.uniforms?.[uniformName]
      ) {
        shader.uniforms[uniformName].value = frame.clock.getElapsedTime();
      }
    });
  });

  // Expanded node Entities already carry the source Model scale on their
  // generated glTF roots so child translations and geometry scale together.
  const modelScale =
    sourceNodeIndex === undefined &&
    sourceNodeName === undefined &&
    Number.isFinite(importScale)
    ? importScale
    : 1;

  if (renderedModel) {
    const previewScale = fitPreview
      ? 1.5 / Math.max(...renderedModel.selectionBounds.scale, 0.01)
      : 1;
    const previewOffset: [number, number, number] = fitPreview
      ? renderedModel.selectionBounds.position.map((value) => -value) as [
          number,
          number,
          number,
        ]
      : [0, 0, 0];
    return (
      <group scale={modelScale * previewScale}>
        <group position={previewOffset}>
          <primitive object={renderedModel.object} />
        </group>
        {selected ? (
          <ModelSelectionBounds bounds={renderedModel.selectionBounds} />
        ) : null}
      </group>
    );
  }

  return (
    <mesh
      castShadow={false}
      receiveShadow={false}
      userData={{
        loadError: state.status === "error" ? state.message : undefined,
      }}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial
        color={state.status === "error" ? "#fb7185" : "#94a3b8"}
        wireframe
        transparent
        opacity={state.status === "error" ? 0.9 : 0.55}
      />
    </mesh>
  );
}

/** Serializes the material actually attached by a custom preview adapter. */
export function inspectProjectModelMaterialRuntime(
  material: Material,
): ProjectModelMaterialRuntimeInfo {
  const shader = material as Material & {
    isRawShaderMaterial?: boolean;
    isShaderMaterial?: boolean;
    glslVersion?: unknown;
    vertexShader?: unknown;
    fragmentShader?: unknown;
    uniforms?: Record<string, { value?: unknown }>;
  };
  const uniformEntries = Object.entries(shader.uniforms ?? {});
  const textureNames = new Set<string>();
  uniformEntries.forEach(([uniformName, uniform]) => {
    collectMaterialTextureNames(uniform.value, uniformName, textureNames);
  });
  collectStandardMaterialTextureNames(material, textureNames);
  const pbrFallback = readOpenBrushPbrFallback(material);
  return {
    name: material.name,
    materialType: material.type,
    shaderKind: shader.isRawShaderMaterial
      ? "raw"
      : shader.isShaderMaterial
        ? "shader"
        : isMeshStandardMaterial(material)
          ? "standard"
          : "other",
    ...(shader.glslVersion === undefined || shader.glslVersion === null
      ? {}
      : { glslVersion: String(shader.glslVersion) }),
    ...(typeof shader.vertexShader === "string"
      ? { vertexShader: shader.vertexShader }
      : {}),
    ...(typeof shader.fragmentShader === "string"
      ? { fragmentShader: shader.fragmentShader }
      : {}),
    uniformNames: uniformEntries.map(([name]) => name).sort(),
    textureNames: [...textureNames].sort(),
    resourcePaths: readOpenBrushResourcePaths(material),
    attributeBindings: readCustomShaderAttributeBindings(material),
    uniformBindings: inspectCustomShaderUniforms(material),
    ...(pbrFallback ? { pbrFallback } : {}),
  };
}

function readOpenBrushResourcePaths(material: Material): string[] {
  const value = material.userData.xriftOpenBrushResourcePaths;
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function collectMaterialTextureNames(
  value: unknown,
  fallbackName: string,
  output: Set<string>,
): void {
  if (Array.isArray(value)) {
    value.forEach((entry) =>
      collectMaterialTextureNames(entry, fallbackName, output),
    );
    return;
  }
  if (!value || typeof value !== "object") return;
  const texture = value as { isTexture?: boolean; name?: string };
  if (texture.isTexture) output.add(texture.name?.trim() || fallbackName);
}

function collectStandardMaterialTextureNames(
  material: Material,
  output: Set<string>,
): void {
  const standard = material as Material & Record<string, unknown>;
  [
    "map",
    "metalnessMap",
    "roughnessMap",
    "normalMap",
    "aoMap",
    "emissiveMap",
    "alphaMap",
  ].forEach((slot) => collectMaterialTextureNames(standard[slot], slot, output));
}

/** Applies each authoring Material only to its original glTF material slot. */
export function applyAssignedMaterialPreviews(
  object: Object3D,
  assignments: readonly {
    sourceMaterialIndex: number;
    sourceNodeIndex?: number;
    material: MaterialAsset;
    textures?: CoreMaterialPreviewTextures;
    classicShaderTextures?: Readonly<Record<string, Texture>>;
    customShaderMaterial?: Material;
  }[],
  sourceMaterials: ReadonlyMap<number, Material> = collectSourceMaterials(object),
): Material[] {
  const globalAssignmentBySourceIndex = new Map(
    assignments
      .filter((assignment) => assignment.sourceNodeIndex === undefined)
      .map((assignment) => [assignment.sourceMaterialIndex, assignment]),
  );
  const nodeAssignmentByKey = new Map(
    assignments
      .filter(
        (assignment): assignment is typeof assignment & { sourceNodeIndex: number } =>
          assignment.sourceNodeIndex !== undefined,
      )
      .map((assignment) => [
        `${assignment.sourceNodeIndex}:${assignment.sourceMaterialIndex}`,
        assignment,
      ]),
  );
  const ownedMaterials: Material[] = [];
  object.traverse((child) => {
    const mesh = child as Object3D & {
      isMesh?: boolean;
      material?: Material | Material[];
    };
    if (!mesh.isMesh || !mesh.material) return;
    const createPreview = (source: Material): Material => {
      const sourceMaterialIndex = getSourceMaterialIndex(source);
      const sourceNodeIndex = findSourceNodeIndex(child);
      const assignment = sourceMaterialIndex === undefined
        ? undefined
        : (sourceNodeIndex === undefined
            ? undefined
            : nodeAssignmentByKey.get(
                `${sourceNodeIndex}:${sourceMaterialIndex}`,
              )) ?? globalAssignmentBySourceIndex.get(sourceMaterialIndex);
      if (!assignment) return source;
      const preview = createAssignedMaterialPreviewMaterial(
        source,
        assignment.material,
        assignment.textures,
        sourceMaterials,
        assignment.customShaderMaterial,
        assignment.classicShaderTextures,
        child.name,
      );
      if (assignment.material.shader?.kind === "openbrush") {
        const geometry = (mesh as typeof mesh & { geometry?: import("three").BufferGeometry }).geometry;
        if (geometry && (preview as { isShaderMaterial?: boolean }).isShaderMaterial) {
          if (!hasCustomShaderEntrypoints(preview)) {
            preview.dispose();
            const fallback = isMeshStandardMaterial(source)
              ? source.clone()
              : new MeshStandardMaterial({ name: source.name });
            markOpenBrushPbrFallback(fallback, {
              renderer: "gltf-pbr",
              reason: "shader-load-error",
              brushName: assignment.material.shader.brushName,
              message: "Vertex or fragment shader has no void main() entrypoint",
            });
            ownedMaterials.push(fallback);
            return fallback;
          }
          const bindings = bindCustomShaderGeometryAttributes(
            geometry,
            preview,
            assignment.material.shader.attributeBindings,
          );
          const missing = bindings.filter((binding) => binding.status === "missing");
          if (missing.length > 0) {
            preview.dispose();
            const fallback = isMeshStandardMaterial(source)
              ? source.clone()
              : new MeshStandardMaterial({ name: source.name });
            markOpenBrushPbrFallback(fallback, {
              renderer: "gltf-pbr",
              reason: "attribute-mismatch",
              brushName: assignment.material.shader.brushName,
              message: `Missing geometry attributes: ${missing.map((binding) => binding.shaderName).join(", ")}`,
            });
            ownedMaterials.push(fallback);
            return fallback;
          }
        }
      }
      ownedMaterials.push(preview);
      return preview;
    };
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(createPreview)
      : createPreview(mesh.material);
  });
  return ownedMaterials;
}

/**
 * Creates per-preview materials for Scene View diagnostics. Imported and
 * assigned materials remain untouched so changing a display mode never leaks
 * into another preview, the Asset manifest, or generated output.
 */
export function applySceneViewportMaterialStyle(
  object: Object3D,
  style: SceneViewportMaterialStyle,
): Material[] {
  if (style === "scene") return [];

  const ownedMaterials: Material[] = [];
  object.traverse((child) => {
    const mesh = child as Object3D & {
      isMesh?: boolean;
      material?: Material | Material[];
    };
    if (!mesh.isMesh || !mesh.material) return;
    const replace = (source: Material) => {
      const material = createSceneViewportMaterial(source, style);
      ownedMaterials.push(material);
      return material;
    };
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(replace)
      : replace(mesh.material);
  });
  return ownedMaterials;
}

function createSceneViewportMaterial(
  source: Material,
  style: Exclude<SceneViewportMaterialStyle, "scene">,
): MeshBasicMaterial {
  const sourceWithSurface = source as Material & {
    color?: Color;
    map?: MeshBasicMaterial["map"];
    alphaMap?: MeshBasicMaterial["alphaMap"];
    vertexColors?: boolean;
  };
  const material = new MeshBasicMaterial();
  material.name = `scene_view_${style}_${source.name || source.uuid}`;
  material.side = source.side;

  if (style === "unlit") {
    material.color.copy(sourceWithSurface.color ?? new Color("#94a3b8"));
    material.map = sourceWithSurface.map ?? null;
    material.alphaMap = sourceWithSurface.alphaMap ?? null;
    material.opacity = source.opacity;
    material.transparent = source.transparent;
    material.alphaTest = source.alphaTest;
    material.depthWrite = source.depthWrite;
    material.vertexColors = Boolean(sourceWithSurface.vertexColors);
  } else if (style === "wireframe") {
    material.color.set("#52606d");
    material.wireframe = true;
  } else if (style === "ghost") {
    material.color.set("#64748b");
    material.transparent = true;
    material.opacity = 0.16;
    material.depthWrite = false;
  } else {
    material.color.set("#0f766e");
    material.wireframe = true;
    material.transparent = true;
    material.opacity = 0.88;
    material.depthTest = false;
    material.depthWrite = false;
  }

  material.needsUpdate = true;
  return material;
}

/** Applies the saved per-Entity static pose without mutating the cached Model. */
export function applyStaticModelPose(
  object: Object3D,
  pose: ModelPoseState | undefined,
): void {
  if (!pose) return;
  object.traverse((child) => {
    const sourceNodeIndex = child.userData[
      PROJECT_MODEL_SOURCE_NODE_INDEX_USER_DATA_KEY
    ];
    const nodeOffset =
      typeof sourceNodeIndex === "number"
        ? pose.nodes?.[String(sourceNodeIndex)]
        : undefined;
    if (nodeOffset) {
      child.position.set(
        child.position.x + nodeOffset.position[0],
        child.position.y + nodeOffset.position[1],
        child.position.z + nodeOffset.position[2],
      );
      child.rotation.set(
        child.rotation.x + nodeOffset.rotation[0],
        child.rotation.y + nodeOffset.rotation[1],
        child.rotation.z + nodeOffset.rotation[2],
      );
      child.scale.set(
        child.scale.x * nodeOffset.scale[0],
        child.scale.y * nodeOffset.scale[1],
        child.scale.z * nodeOffset.scale[2],
      );
    }
    const bone = child as Object3D & { isBone?: boolean };
    const rotation = bone.isBone && child.name ? pose.bones[child.name] : undefined;
    if (rotation?.every(Number.isFinite)) {
      child.rotation.set(
        child.rotation.x + rotation[0],
        child.rotation.y + rotation[1],
        child.rotation.z + rotation[2],
      );
    }
    const mesh = child as Object3D & {
      morphTargetDictionary?: Record<string, number>;
      morphTargetInfluences?: number[];
    };
    if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;
    Object.entries(pose.morphTargets).forEach(([key, weight]) => {
      const index = mesh.morphTargetDictionary?.[key];
      if (
        index === undefined ||
        !Number.isFinite(weight) ||
        weight < 0 ||
        weight > 1
      ) {
        return;
      }
      mesh.morphTargetInfluences![index] = weight;
    });
  });
  object.updateMatrixWorld(true);
}

function findSourceNodeIndex(object: Object3D): number | undefined {
  let current: Object3D | null = object;
  while (current) {
    const value = current.userData[
      PROJECT_MODEL_SOURCE_NODE_INDEX_USER_DATA_KEY
    ];
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
      return value;
    }
    current = current.parent;
  }
  return undefined;
}

/**
 * Compatibility helper that applies one override to every material. The GLTF
 * cache and textures stay shared/read-only while per-preview material state is
 * independently disposable.
 */
export function applyAssignedMaterialPreview(
  object: Object3D,
  assignedMaterial: MaterialAsset,
  assignedTextures: CoreMaterialPreviewTextures = {},
): Material[] {
  const ownedMaterials: Material[] = [];
  object.traverse((child) => {
    const mesh = child as Object3D & {
      isMesh?: boolean;
      material?: Material | Material[];
    };
    if (!mesh.isMesh || !mesh.material) return;
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((source) => {
        const preview = createAssignedMaterialPreviewMaterial(
          source,
          assignedMaterial,
          assignedTextures,
        );
        ownedMaterials.push(preview);
        return preview;
      });
      return;
    }
    const preview = createAssignedMaterialPreviewMaterial(
      mesh.material,
      assignedMaterial,
      assignedTextures,
    );
    mesh.material = preview;
    ownedMaterials.push(preview);
  });
  return ownedMaterials;
}

export function createAssignedMaterialPreviewMaterial(
  source: Material,
  assignedMaterial: MaterialAsset,
  assignedTextures: CoreMaterialPreviewTextures = {},
  sourceMaterials: ReadonlyMap<number, Material> = new Map(),
  customShaderMaterial?: Material,
  classicShaderTextures: Readonly<Record<string, Texture>> = {},
  meshName = "",
): Material {
  if (assignedMaterial.shader?.kind === "openbrush") {
    const preset = sourceMaterials.get(
      assignedMaterial.shader.sourceMaterialIndex,
    );
    const preview = (customShaderMaterial ?? preset ?? source).clone();
    const overrides = assignedMaterial.shader.sourceOverrides;
    applyCustomShaderSourceOverrides(
      preview,
      overrides
        ? {
            ...(overrides.vertexShader !== undefined
              ? {
                  vertexShader: normalizeOpenBrushGlslSource(
                    overrides.vertexShader,
                  ),
                }
              : {}),
            ...(overrides.fragmentShader !== undefined
              ? {
                  fragmentShader: normalizeOpenBrushGlslSource(
                    overrides.fragmentShader,
                  ),
                }
              : {}),
          }
        : undefined,
    );
    applyOpenBrushMaterialAssetProperties(
      preview,
      assignedMaterial,
      assignedTextures,
    );
    preview.name = `material_${assignedMaterial.shader.brushName}`;
    preview.needsUpdate = true;
    return preview;
  }
  if (assignedMaterial.shader?.kind === "classic-r3f") {
    return createClassicR3fMaterial(
      assignedMaterial.shader,
      classicShaderTextures,
      meshName,
    );
  }
  const preview = isMeshStandardMaterial(source)
    ? source.clone()
    : new MeshStandardMaterial({ name: source.name });
  const properties = normalizeMaterialProperties(
    assignedMaterial.properties as unknown as Parameters<
      typeof normalizeMaterialProperties
    >[0],
  );
  const pbr = properties.pbrMetallicRoughness;
  preview.color.setRGB(
    pbr.baseColorFactor[0],
    pbr.baseColorFactor[1],
    pbr.baseColorFactor[2],
  );
  preview.metalness = pbr.metallicFactor;
  preview.roughness = pbr.roughnessFactor;
  preview.emissive.setRGB(
    properties.emissiveFactor[0],
    properties.emissiveFactor[1],
    properties.emissiveFactor[2],
  );
  preview.emissiveIntensity =
    properties.extensions.KHR_materials_emissive_strength?.emissiveStrength ??
    1;
  preview.opacity =
    properties.alphaMode === "OPAQUE" ? 1 : pbr.baseColorFactor[3];
  preview.transparent = properties.alphaMode === "BLEND";
  preview.alphaTest =
    properties.alphaMode === "MASK" ? properties.alphaCutoff : 0;
  preview.depthWrite = properties.alphaMode !== "BLEND";
  preview.side = properties.doubleSided ? DoubleSide : FrontSide;
  applyCoreMaterialPreviewTextures(preview, properties, assignedTextures);
  resetSourcePhysicalEffects(preview);
  preview.needsUpdate = true;
  return preview;
}

export function createClassicR3fMaterial(
  shader: ClassicR3fMaterialShader,
  textures: Readonly<Record<string, Texture>>,
  meshName: string,
): ShaderMaterial {
  const normalizedMeshName = meshName.toLocaleLowerCase();
  const variant =
    shader.variants.find(
      (candidate) =>
        candidate.meshNameIncludes &&
        normalizedMeshName.includes(
          candidate.meshNameIncludes.toLocaleLowerCase(),
        ),
    ) ??
    shader.variants.find((candidate) => !candidate.meshNameIncludes) ??
    shader.variants[0];
  const uniforms = Object.fromEntries(
    Object.entries(shader.uniforms).map(([name, uniform]) => {
      if (uniform.kind === "texture") {
        return [name, { value: textures[name] ?? null }];
      }
      if (uniform.kind === "color") {
        return [name, { value: new Color(uniform.value) }];
      }
      if (uniform.kind === "vector") {
        const value =
          uniform.value.length === 2
            ? new Vector2(uniform.value[0], uniform.value[1])
            : uniform.value.length === 3
              ? new Vector3(
                  uniform.value[0],
                  uniform.value[1],
                  uniform.value[2],
                )
              : new Vector4(
                  uniform.value[0],
                  uniform.value[1],
                  uniform.value[2],
                  uniform.value[3],
                );
        return [name, { value }];
      }
      return [name, { value: uniform.value }];
    }),
  );
  const material = new ShaderMaterial({
    name: `${shader.sourceModulePath}:${variant.name}`,
    vertexShader: shader.vertexShader,
    fragmentShader: shader.fragmentShader,
    uniforms,
    defines: { ...variant.defines },
    side:
      variant.side === "back"
        ? BackSide
        : variant.side === "double"
          ? DoubleSide
          : FrontSide,
    transparent: variant.transparent,
    depthWrite: variant.depthWrite,
  });
  if (shader.animatedTimeUniform) {
    material.userData.xriftAnimatedTimeUniform = shader.animatedTimeUniform;
  }
  material.needsUpdate = true;
  return material;
}

function useClassicShaderTextures(
  material: MaterialAsset,
  assets: AssetManifest,
  projectPath: string,
): Readonly<Record<string, Texture>> {
  const shader =
    material.shader?.kind === "classic-r3f" ? material.shader : undefined;
  const [textures, setTextures] = useState<Readonly<Record<string, Texture>>>(
    {},
  );
  const signature = shader
    ? Object.entries(shader.uniforms)
        .flatMap(([name, uniform]) =>
          uniform.kind === "texture"
            ? [`${name}:${uniform.textureAssetId}`]
            : [],
        )
        .sort()
        .join("|")
    : "";

  useEffect(() => {
    if (!shader || !signature) {
      setTextures({});
      return;
    }
    let active = true;
    const loaded: Texture[] = [];
    void Promise.all(
      Object.entries(shader.uniforms).flatMap(([uniformName, uniform]) => {
        if (uniform.kind !== "texture") return [];
        const asset = assets.assets[uniform.textureAssetId];
        if (
          asset?.kind !== "texture" ||
          asset.source.kind !== "project"
        ) {
          return [];
        }
        return [
          tauri
            .readProjectFileDataUrl(projectPath, asset.source.relativePath)
            .then((dataUrl) => new TextureLoader().loadAsync(dataUrl))
            .then((texture) => {
              loaded.push(texture);
              texture.colorSpace =
                uniform.colorSpace === "srgb"
                  ? SRGBColorSpace
                  : NoColorSpace;
              texture.generateMipmaps = uniform.generateMipmaps ?? false;
              texture.magFilter =
                uniform.filter === "nearest" ? NearestFilter : LinearFilter;
              texture.minFilter =
                uniform.filter === "nearest" ? NearestFilter : LinearFilter;
              texture.wrapS =
                uniform.wrapS === "clamp-to-edge"
                  ? ClampToEdgeWrapping
                  : RepeatWrapping;
              texture.wrapT =
                uniform.wrapT === "clamp-to-edge"
                  ? ClampToEdgeWrapping
                  : RepeatWrapping;
              texture.needsUpdate = true;
              return [uniformName, texture] as const;
            }),
        ];
      }),
    )
      .then((entries) => {
        if (active) setTextures(Object.fromEntries(entries));
      })
      .catch(() => {
        if (active) setTextures({});
      });
    return () => {
      active = false;
      loaded.forEach((texture) => texture.dispose());
    };
  }, [assets, projectPath, shader, signature]);

  return textures;
}

/**
 * Keeps the ordinary Material Asset controls meaningful for OpenBrush too.
 * Texture Assets feed the brush sampler uniforms, while base color and
 * roughness become safe, opt-in uniforms when the brush shader exposes the
 * corresponding inputs.
 */
export function applyOpenBrushMaterialAssetProperties(
  material: Material,
  assignedMaterial: MaterialAsset,
  textures: CoreMaterialPreviewTextures,
): void {
  if (assignedMaterial.shader?.kind !== "openbrush") return;
  const shader = material as Material & {
    uniforms?: Record<string, { value: unknown }>;
    fragmentShader?: string;
    needsUpdate?: boolean;
  };
  const properties = normalizeMaterialProperties(
    assignedMaterial.properties as unknown as Parameters<
      typeof normalizeMaterialProperties
    >[0],
  );
  const uniforms = shader.uniforms;
  if (!uniforms) return;
  for (const [uniformName, texture] of Object.entries(
    textures.shaderUniforms ?? {},
  )) {
    if (uniforms[uniformName]) uniforms[uniformName].value = texture;
  }
  if (uniforms.u_Shininess) {
    uniforms.u_Shininess.value = 1 - properties.pbrMetallicRoughness.roughnessFactor;
  }
  if (uniforms.u_Cutoff && properties.alphaMode === "MASK") {
    uniforms.u_Cutoff.value = properties.alphaCutoff;
  }
  const factor = properties.pbrMetallicRoughness.baseColorFactor;
  const varyingDeclaration = "in vec4 v_color;";
  const varyingIndex = shader.fragmentShader?.indexOf(varyingDeclaration) ?? -1;
  if (varyingIndex < 0 || !shader.fragmentShader) return;
  if (!uniforms.xriftBaseColorFactor) {
    uniforms.xriftBaseColorFactor = { value: new Vector4(...factor) };
    const bodyStart = varyingIndex + varyingDeclaration.length;
    const shaderHeader = shader.fragmentShader.slice(0, bodyStart);
    const shaderBody = shader.fragmentShader
      .slice(bodyStart)
      .replace(/\bv_color\b/g, "(v_color * xriftBaseColorFactor)");
    // Keep the vertex/fragment varying name identical. Renaming only the
    // fragment input makes WebGL reject the linked shader program.
    shader.fragmentShader = `${shaderHeader}\nuniform vec4 xriftBaseColorFactor;${shaderBody}`;
  } else if (uniforms.xriftBaseColorFactor.value instanceof Vector4) {
    uniforms.xriftBaseColorFactor.value.set(...factor);
  } else {
    uniforms.xriftBaseColorFactor.value = new Vector4(...factor);
  }
  shader.needsUpdate = true;
}

function collectSourceMaterials(object: Object3D): Map<number, Material> {
  const materials = new Map<number, Material>();
  object.traverse((child) => {
    const mesh = child as Object3D & {
      isMesh?: boolean;
      material?: Material | Material[];
    };
    if (!mesh.isMesh || !mesh.material) return;
    const entries = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of entries) {
      const sourceMaterialIndex = getSourceMaterialIndex(material);
      if (
        sourceMaterialIndex !== undefined &&
        !materials.has(sourceMaterialIndex)
      ) {
        materials.set(sourceMaterialIndex, material);
      }
    }
  });
  return materials;
}

function isMeshStandardMaterial(
  material: Material,
): material is MeshStandardMaterial {
  return (material as MeshStandardMaterial).isMeshStandardMaterial === true;
}

function resetSourcePhysicalEffects(material: MeshStandardMaterial): void {
  const physical = material as MeshStandardMaterial & {
    isMeshPhysicalMaterial?: boolean;
    anisotropy: number;
    clearcoat: number;
    dispersion: number;
    iridescence: number;
    sheen: number;
    thickness: number;
    transmission: number;
  };
  if (!physical.isMeshPhysicalMaterial) return;
  physical.anisotropy = 0;
  physical.clearcoat = 0;
  physical.dispersion = 0;
  physical.iridescence = 0;
  physical.sheen = 0;
  physical.thickness = 0;
  physical.transmission = 0;
}

export type ModelSelectionBoundsValue = {
  position: [number, number, number];
  scale: [number, number, number];
};

/**
 * Resolves bounds in the model container's local coordinates. An attached
 * Object3D is cloned first so Entity and import-scale ancestors cannot leak
 * into Box3's world-space calculation and be applied twice by the bounds mesh.
 */
export function getModelSelectionBounds(
  object: Object3D,
): ModelSelectionBoundsValue {
  const localObject = object.parent ? clone(object) : object;
  localObject.updateMatrixWorld(true);
  const box = new Box3().setFromObject(localObject);
  if (box.isEmpty()) {
    return {
      position: [0, 0, 0],
      scale: [1, 1, 1],
    };
  }
  const center = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  return {
    position: [center.x, center.y, center.z],
    scale: [
      Math.max(size.x * 1.02, 0.01),
      Math.max(size.y * 1.02, 0.01),
      Math.max(size.z * 1.02, 0.01),
    ],
  };
}

function ModelSelectionBounds({
  bounds,
}: {
  bounds: ModelSelectionBoundsValue;
}) {
  return (
    <mesh position={bounds.position} scale={bounds.scale}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial
        color="#a78bfa"
        wireframe
        transparent
        opacity={0.7}
        depthTest={false}
      />
    </mesh>
  );
}

async function dataUrlToArrayBuffer(dataUrl: string): Promise<ArrayBuffer> {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error("Model data could not be decoded");
  return response.arrayBuffer();
}

type GltfResourceDocument = {
  buffers?: Array<{ uri?: unknown }>;
  images?: Array<{ uri?: unknown }>;
  nodes?: unknown[];
  extensions?: Record<string, unknown>;
  meshes?: Array<{
    primitives?: Array<{ material?: unknown }>;
  }>;
};

export const PROJECT_MODEL_SOURCE_MATERIAL_INDEX_USER_DATA_KEY =
  "xriftSourceMaterialIndex";
export const PROJECT_MODEL_SOURCE_NODE_INDEX_USER_DATA_KEY =
  "xriftSourceNodeIndex";

function tagSourceMaterialIndices(
  gltf: GLTF,
  document?: GltfResourceDocument,
): void {
  gltf.scene.traverse((child) => {
    const mesh = child as Object3D & {
      isMesh?: boolean;
      material?: Material | Material[];
    };
    const sourceNodeIndex = gltf.parser.associations.get(child)?.nodes;
    if (
      typeof sourceNodeIndex === "number" &&
      Number.isInteger(sourceNodeIndex) &&
      sourceNodeIndex >= 0
    ) {
      child.userData[PROJECT_MODEL_SOURCE_NODE_INDEX_USER_DATA_KEY] =
        sourceNodeIndex;
    }
    if (!mesh.isMesh || !mesh.material) return;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    const meshIndex = gltf.parser.associations.get(mesh)?.meshes;
    const primitiveMaterials =
      typeof meshIndex === "number" && Number.isInteger(meshIndex)
        ? document?.meshes?.[meshIndex]?.primitives
            ?.map((primitive) => primitive.material)
            .filter(
              (index): index is number =>
                typeof index === "number" && Number.isInteger(index) && index >= 0,
            ) ?? []
        : [];
    for (const [materialOrder, material] of materials.entries()) {
      const sourceMaterialIndex =
        gltf.parser.associations.get(material)?.materials ??
        primitiveMaterials[materialOrder] ??
        (materials.length === 1 ? primitiveMaterials[0] : undefined);
      if (
        sourceMaterialIndex === undefined ||
        !Number.isInteger(sourceMaterialIndex) ||
        sourceMaterialIndex < 0
      ) {
        continue;
      }
      material.userData[PROJECT_MODEL_SOURCE_MATERIAL_INDEX_USER_DATA_KEY] =
        sourceMaterialIndex;
    }
  });
}

/** Keeps one authored glTF node while its Transform lives on the Scene Entity. */
export function selectSourceModelNode(
  root: Object3D,
  sourceNodeIndex: number | undefined,
  sourceNodeName?: string,
): Object3D {
  if (sourceNodeIndex === undefined && !sourceNodeName) return root;
  let selected: Object3D | undefined;
  root.traverse((candidate) => {
    if (
      selected === undefined &&
      (sourceNodeIndex !== undefined
        ? candidate.userData[PROJECT_MODEL_SOURCE_NODE_INDEX_USER_DATA_KEY] ===
          sourceNodeIndex
        : candidate.name === sourceNodeName)
    ) {
      selected = candidate;
    }
  });
  if (!selected) {
    const missing = new Group();
    missing.name =
      sourceNodeIndex !== undefined
        ? `Missing glTF node ${sourceNodeIndex}`
        : `Missing OBJ node ${sourceNodeName}`;
    if (sourceNodeIndex !== undefined) {
      missing.userData.xriftMissingSourceNodeIndex = sourceNodeIndex;
    }
    return missing;
  }
  for (const child of [...selected.children]) {
    if (
      typeof child.userData[PROJECT_MODEL_SOURCE_NODE_INDEX_USER_DATA_KEY] ===
      "number"
    ) {
      selected.remove(child);
    }
  }
  selected.removeFromParent();
  selected.position.set(0, 0, 0);
  selected.quaternion.identity();
  selected.scale.set(1, 1, 1);
  selected.updateMatrix();
  selected.updateMatrixWorld(true);
  return selected;
}

function tagObjMaterialIndices(object: Object3D): void {
  const sourceIndexByMaterial = new Map<Material, number>();
  object.traverse((child) => {
    const mesh = child as Object3D & {
      isMesh?: boolean;
      material?: Material | Material[];
    };
    if (!mesh.isMesh || !mesh.material) return;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    materials.forEach((material) => {
      let index = sourceIndexByMaterial.get(material);
      if (index === undefined) {
        index = sourceIndexByMaterial.size;
        sourceIndexByMaterial.set(material, index);
      }
      material.userData[PROJECT_MODEL_SOURCE_MATERIAL_INDEX_USER_DATA_KEY] = index;
    });
  });
}

function getSourceMaterialIndex(material: Material): number | undefined {
  const value =
    material.userData[PROJECT_MODEL_SOURCE_MATERIAL_INDEX_USER_DATA_KEY];
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

async function parseSelfContainedModel(
  buffer: ArrayBuffer,
  sourceRelativePath: string,
): Promise<ProjectModelData> {
  const format = modelFormat(sourceRelativePath);
  if (!format) throw new Error("GLB、glTF、OBJまたはVRMのみ表示できます");

  const bytes = new Uint8Array(buffer);
  if (format === "obj") {
    const object = new OBJLoader().parse(new TextDecoder().decode(bytes));
    tagObjMaterialIndices(object);
    return { object, animations: [], interactionAnimationIndices: [] };
  }

  const source = format === "gltf" ? new TextDecoder().decode(bytes) : buffer;
  const document = parseGltfDocument(bytes, format);
  const hierarchyIssue = validateGltfNodeHierarchy(document.nodes)[0];
  if (hierarchyIssue) {
    throw new Error(`モデルのHierarchyを読み取れません: ${hierarchyIssue.message}`);
  }
  const openBrush = detectOpenBrushGltfDocument(document);
  if (hasExternalResources(document, openBrush !== undefined)) {
    throw new Error(
      "外部ファイルを参照するglTFは表示できません。GLBまたは自己完結glTFを使用してください",
    );
  }

  return new Promise<ProjectModelData>((resolve, reject) => {
    const loader = new GLTFLoader();
    if (format === "vrm") {
      loader.register((parser) => new VRMLoaderPlugin(parser));
    }
    if (openBrush) {
      loader.register(
        (parser) =>
          createOpenBrushPreviewExtension(
            parser,
            resolveOpenBrushEditorBrushBaseUrl(),
          ),
      );
    }
    loader.parse(
      source,
      "",
      (gltf) => {
        const vrm = gltf.userData.vrm as VRM | undefined;
        if (vrm) VRMUtils.rotateVRM0(vrm);
        repairImportedObject3DHierarchy(gltf.scene);
        tagSourceMaterialIndices(gltf, document);
        resolve({
          object: gltf.scene,
          animations: gltf.animations,
          interactionAnimationIndices:
            getKhrInteractivityOnStartAnimationIndices(
              document.extensions?.KHR_interactivity,
            ),
        });
      },
      (error) => reject(error),
    );
  });
}

function modelFormat(
  sourceRelativePath: string,
): "glb" | "gltf" | "obj" | "vrm" | null {
  const lowerPath = sourceRelativePath.toLowerCase();
  if (lowerPath.endsWith(".glb")) return "glb";
  if (lowerPath.endsWith(".gltf")) return "gltf";
  if (lowerPath.endsWith(".obj")) return "obj";
  if (lowerPath.endsWith(".vrm")) return "vrm";
  return null;
}

function parseGltfDocument(
  bytes: Uint8Array,
  format: "glb" | "gltf" | "vrm",
): GltfResourceDocument {
  const text =
    format === "gltf"
      ? new TextDecoder().decode(bytes)
      : readGlbJsonChunk(bytes);
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("glTF JSONが不正です");
  }
  return parsed as GltfResourceDocument;
}

function readGlbJsonChunk(bytes: Uint8Array): string {
  if (bytes.byteLength < 20) throw new Error("GLBヘッダーが不正です");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) {
    throw new Error("GLB識別子が不正です");
  }
  if (view.getUint32(4, true) !== 2) {
    throw new Error("glTF 2.0のGLBのみ表示できます");
  }
  const declaredLength = view.getUint32(8, true);
  const chunkLength = view.getUint32(12, true);
  const chunkType = view.getUint32(16, true);
  if (
    declaredLength !== bytes.byteLength ||
    chunkType !== 0x4e4f534a ||
    chunkLength > declaredLength - 20
  ) {
    throw new Error("GLB JSONチャンクが不正です");
  }
  return new TextDecoder()
    .decode(bytes.subarray(20, 20 + chunkLength))
    .replace(/[\u0000\u0020]+$/g, "");
}

function hasExternalResources(
  document: GltfResourceDocument,
  allowExternalImages = false,
): boolean {
  const resourceSets = allowExternalImages
    ? [document.buffers]
    : [document.buffers, document.images];
  return resourceSets.some((entries) =>
    entries?.some(
      (entry) =>
        typeof entry.uri === "string" &&
        entry.uri.trim().length > 0 &&
        !entry.uri.trim().toLowerCase().startsWith("data:"),
    ),
  );
}
