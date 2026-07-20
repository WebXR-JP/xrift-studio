import { useEffect, useMemo, useState } from "react";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  Box3,
  DoubleSide,
  FrontSide,
  MeshStandardMaterial,
  Vector3,
  type Material,
  type Object3D,
} from "three";
import { tauri } from "../../lib/tauri";
import {
  normalizeMaterialProperties,
  type MaterialAsset,
} from "../../lib/visual-editor";
import {
  applyCoreMaterialPreviewTextures,
  type CoreMaterialPreviewTextures,
} from "./material-texture-preview";

type Props = {
  projectPath: string;
  sourceRelativePath: string;
  sourceHash?: string;
  importScale?: number;
  castShadow: boolean;
  receiveShadow: boolean;
  selected: boolean;
  assignedMaterial?: MaterialAsset;
  assignedTextures?: CoreMaterialPreviewTextures;
};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; object: Object3D }
  | { status: "error"; message: string };

const MODEL_DATA_CACHE = new Map<string, Promise<string>>();

export function ProjectModelVisual({
  projectPath,
  sourceRelativePath,
  sourceHash,
  importScale = 1,
  castShadow,
  receiveShadow,
  selected,
  assignedMaterial,
  assignedTextures,
}: Props) {
  const cacheKey = `${projectPath}\n${sourceRelativePath}\n${sourceHash ?? ""}`;
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    const promise =
      MODEL_DATA_CACHE.get(cacheKey) ??
      tauri.readProjectFileDataUrl(projectPath, sourceRelativePath);
    MODEL_DATA_CACHE.set(cacheKey, promise);

    void promise
      .then(dataUrlToArrayBuffer)
      .then((buffer) => parseSelfContainedModel(buffer, sourceRelativePath))
      .then((object) => {
        if (!active) return;
        setState({ status: "ready", object });
      })
      .catch((error) => {
        MODEL_DATA_CACHE.delete(cacheKey);
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

  const readyObject = state.status === "ready" ? state.object : null;
  const renderedModel = useMemo(() => {
    if (!readyObject) return null;
    const object = clone(readyObject);
    const selectionBounds = getModelSelectionBounds(object);
    const ownedMaterials = assignedMaterial
      ? applyAssignedMaterialPreview(
          object,
          assignedMaterial,
          assignedTextures,
        )
      : [];
    return { object, ownedMaterials, selectionBounds };
  }, [assignedMaterial, assignedTextures, readyObject]);
  const renderedObject = renderedModel?.object ?? null;

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
    return (
      <group scale={modelScale}>
        <primitive object={renderedModel.object} />
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

/**
 * Clones every model material before applying the authoring override. The GLTF
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
): MeshStandardMaterial {
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
};

async function parseSelfContainedModel(
  buffer: ArrayBuffer,
  sourceRelativePath: string,
): Promise<Object3D> {
  const format = modelFormat(sourceRelativePath);
  if (!format) throw new Error("GLBまたはglTFのみ表示できます");

  const bytes = new Uint8Array(buffer);
  const source = format === "glb" ? buffer : new TextDecoder().decode(bytes);
  const document = parseGltfDocument(bytes, format);
  if (hasExternalResources(document)) {
    throw new Error(
      "外部ファイルを参照するglTFは表示できません。GLBまたは自己完結glTFを使用してください",
    );
  }

  return new Promise<Object3D>((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.parse(
      source,
      "",
      (gltf) => resolve(gltf.scene),
      (error) => reject(error),
    );
  });
}

function modelFormat(sourceRelativePath: string): "glb" | "gltf" | null {
  const lowerPath = sourceRelativePath.toLowerCase();
  if (lowerPath.endsWith(".glb")) return "glb";
  if (lowerPath.endsWith(".gltf")) return "gltf";
  return null;
}

function parseGltfDocument(
  bytes: Uint8Array,
  format: "glb" | "gltf",
): GltfResourceDocument {
  const text =
    format === "glb"
      ? readGlbJsonChunk(bytes)
      : new TextDecoder().decode(bytes);
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

function hasExternalResources(document: GltfResourceDocument): boolean {
  return [document.buffers, document.images].some((entries) =>
    entries?.some(
      (entry) =>
        typeof entry.uri === "string" &&
        entry.uri.trim().length > 0 &&
        !entry.uri.trim().toLowerCase().startsWith("data:"),
    ),
  );
}
