import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useThree } from "@react-three/fiber";
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
  DoubleSide,
  FrontSide,
  Group,
  MeshStandardMaterial,
  Vector3,
  type Material,
  type Object3D,
} from "three";
import { tauri } from "../../lib/tauri";
import {
  normalizeMaterialProperties,
  applyCustomShaderSourceOverrides,
  bindCustomShaderGeometryAttributes,
  hasCustomShaderEntrypoints,
  inspectCustomShaderUniforms,
  readCustomShaderAttributeBindings,
  detectOpenBrushGltfDocument,
  resolveOpenBrushEditorBrushBaseUrl,
  type AssetManifest,
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

export type ProjectModelMaterialAssignment = {
  slot: string;
  sourceMaterialIndex: number;
  material: MaterialAsset;
};

type ResolvedProjectModelMaterialAssignment =
  ProjectModelMaterialAssignment & {
    textures: CoreMaterialPreviewTextures;
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
  sourceNodeIndex?: number;
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
  | { status: "ready"; object: Object3D }
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
const MODEL_OBJECT_CACHE = new Map<string, Promise<Object3D>>();
const EMPTY_RESOLVED_MATERIALS: readonly ResolvedProjectModelMaterialAssignment[] =
  [];

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
  sourceNodeIndex,
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
      .then((object) => {
        if (!active) return;
        setState({ status: "ready", object });
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
          sourceNodeIndex={sourceNodeIndex}
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
  const nextResolved = useMemo(
    () => [...resolved, { ...assignment, textures }],
    [assignment, resolved, textures],
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
  sourceNodeIndex,
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
  sourceNodeIndex?: number;
  fitPreview: boolean;
  onMaterialRuntimeInfoChange?: (
    materials: readonly ProjectModelMaterialRuntimeInfo[],
  ) => void;
}) {
  const readyObject = state.status === "ready" ? state.object : null;
  const renderedModel = useMemo(() => {
    if (!readyObject) return null;
    const source = clone(readyObject);
    const sourceMaterials = collectSourceMaterials(source);
    const object = selectSourceModelNode(source, sourceNodeIndex);
    applyStaticModelPose(object, pose);
    const selectionBounds = getModelSelectionBounds(object);
    const ownedMaterials = applyAssignedMaterialPreviews(
      object,
      assignedMaterials,
      sourceMaterials,
    );
    return { object, ownedMaterials, selectionBounds };
  }, [assignedMaterials, pose, readyObject, sourceNodeIndex]);
  const renderedObject = renderedModel?.object ?? null;
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

  const modelScale = Number.isFinite(importScale) ? importScale : 1;

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
    material: MaterialAsset;
    textures?: CoreMaterialPreviewTextures;
    customShaderMaterial?: Material;
  }[],
  sourceMaterials: ReadonlyMap<number, Material> = collectSourceMaterials(object),
): Material[] {
  const assignmentBySourceIndex = new Map(
    assignments.map((assignment) => [
      assignment.sourceMaterialIndex,
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
      const assignment =
        sourceMaterialIndex === undefined
          ? undefined
          : assignmentBySourceIndex.get(sourceMaterialIndex);
      if (!assignment) return source;
      const preview = createAssignedMaterialPreviewMaterial(
        source,
        assignment.material,
        assignment.textures,
        sourceMaterials,
        assignment.customShaderMaterial,
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

/** Applies the saved per-Entity static pose without mutating the cached Model. */
export function applyStaticModelPose(
  object: Object3D,
  pose: ModelPoseState | undefined,
): void {
  if (!pose) return;
  object.traverse((child) => {
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
    preview.name = `material_${assignedMaterial.shader.brushName}`;
    return preview;
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
): Object3D {
  if (sourceNodeIndex === undefined) return root;
  let selected: Object3D | undefined;
  root.traverse((candidate) => {
    if (
      selected === undefined &&
      candidate.userData[PROJECT_MODEL_SOURCE_NODE_INDEX_USER_DATA_KEY] ===
        sourceNodeIndex
    ) {
      selected = candidate;
    }
  });
  if (!selected) {
    const missing = new Group();
    missing.name = `Missing glTF node ${sourceNodeIndex}`;
    missing.userData.xriftMissingSourceNodeIndex = sourceNodeIndex;
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
): Promise<Object3D> {
  const format = modelFormat(sourceRelativePath);
  if (!format) throw new Error("GLB、glTF、OBJまたはVRMのみ表示できます");

  const bytes = new Uint8Array(buffer);
  if (format === "obj") {
    const object = new OBJLoader().parse(new TextDecoder().decode(bytes));
    tagObjMaterialIndices(object);
    return object;
  }

  const source = format === "gltf" ? new TextDecoder().decode(bytes) : buffer;
  const document = parseGltfDocument(bytes, format);
  const openBrush = detectOpenBrushGltfDocument(document);
  if (hasExternalResources(document, openBrush !== undefined)) {
    throw new Error(
      "外部ファイルを参照するglTFは表示できません。GLBまたは自己完結glTFを使用してください",
    );
  }

  return new Promise<Object3D>((resolve, reject) => {
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
        tagSourceMaterialIndices(gltf, document);
        resolve(gltf.scene);
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
