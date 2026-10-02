import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useThree } from "@react-three/fiber";
import {
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  LinearMipmapNearestFilter,
  MirroredRepeatWrapping,
  NearestFilter,
  NearestMipmapLinearFilter,
  NearestMipmapNearestFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type Material,
  type MeshStandardMaterial,
  type Texture,
} from "three";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { tauri } from "../../lib/tauri";
import { materialSurfaceProps } from "../../lib/visual-editor/material-surface";
import { resolveLocalBasisTranscoderPath } from "../../lib/visual-editor/basis-transcoder";
import {
  getTextureAsset,
  getTextureSourceFormat,
  normalizeMaterialProperties,
  resolveOpenBrushBuiltinTextureUrl,
  type AssetManifest,
  type MaterialAsset,
  type MaterialProperties,
  type MaterialTextureInfo,
  type TextureAsset,
} from "../../lib/visual-editor";

export type MaterialPreviewTextures = {
  opacityMap?: Texture;
  baseColorMap?: Texture;
  metallicRoughnessMap?: Texture;
  normalMap?: Texture;
  occlusionMap?: Texture;
  emissiveMap?: Texture;
  anisotropyMap?: Texture;
  clearcoatMap?: Texture;
  clearcoatRoughnessMap?: Texture;
  clearcoatNormalMap?: Texture;
  iridescenceMap?: Texture;
  iridescenceThicknessMap?: Texture;
  sheenColorMap?: Texture;
  sheenRoughnessMap?: Texture;
  specularIntensityMap?: Texture;
  specularColorMap?: Texture;
  transmissionMap?: Texture;
  thicknessMap?: Texture;
  shadeMultiplyMap?: Texture;
  outlineWidthMultiplyMap?: Texture;
  shadingShiftMap?: Texture;
  matcapMap?: Texture;
  rimMultiplyMap?: Texture;
  uvAnimationMaskMap?: Texture;
  /** Sampler uniforms used by an optional custom material renderer. */
  shaderUniforms?: Record<string, Texture>;
};

/** Compatibility alias for existing Scene View consumers. */
export type CoreMaterialPreviewTextures = MaterialPreviewTextures;

export type MaterialPreviewTextureRole = Exclude<
  keyof MaterialPreviewTextures,
  "shaderUniforms"
>;

export type MaterialPreviewTextureLoadStatus = "loading" | "ready" | "error";

export type MaterialPreviewTextureStatuses = Partial<
  Record<MaterialPreviewTextureRole, MaterialPreviewTextureLoadStatus>
>;

export type MaterialPreviewTextureState = {
  textures: MaterialPreviewTextures;
  statuses: MaterialPreviewTextureStatuses;
};

export function resolveMaterialPreviewTextureDisplayStatus(
  asset: TextureAsset | undefined,
  loadStatus: MaterialPreviewTextureLoadStatus | undefined,
): MaterialPreviewTextureLoadStatus | undefined {
  if (!asset) return undefined;
  if (
    asset.status !== "ready" ||
    (asset.source.kind !== "project" &&
      (asset.source.kind !== "builtin" ||
        !resolveOpenBrushBuiltinTextureUrl(asset.source.key)))
  ) {
    return "error";
  }
  return loadStatus;
}

type PreviewTextureRequest = {
  role?: MaterialPreviewTextureRole;
  uniformName?: string;
  textureInfo: MaterialTextureInfo;
  asset: TextureAsset & {
    source:
      | { kind: "project"; relativePath: string }
      | { kind: "builtin"; key: string };
  };
  colorSpace: "srgb" | "linear";
};

const IMAGE_DATA_URL_CACHE = new Map<string, Promise<string>>();
const KTX2_TRANSCODER_PATH = resolveLocalBasisTranscoderPath();

export function useMaterialPreviewTextureState(
  material: MaterialAsset | undefined,
  assets: AssetManifest,
  projectPath: string | undefined,
): MaterialPreviewTextureState {
  const gl = useThree((state) => state.gl);
  const requests = useMemo(
    () => resolvePreviewTextureRequests(material, assets),
    [assets, material],
  );
  const requestKey = useMemo(
    () => JSON.stringify(requests.map(previewTextureRequestKey)),
    [requests],
  );
  const [state, setState] = useState<MaterialPreviewTextureState>({
    textures: {},
    statuses: {},
  });
  const sessionRef = useRef<ReturnType<typeof createMaterialPreviewTextureSession> | null>(null);

  useEffect(() => {
    const session = createMaterialPreviewTextureSession(async (request) => {
      if (!projectPath && request.asset.source.kind !== "builtin") {
        throw new Error("A project path is required to load this Texture");
      }
      const dataUrl = await readMaterialPreviewTextureUrl(projectPath ?? "", request.asset);
      let texture: Texture;
      if (getTextureSourceFormat(request.asset) === "ktx2") {
        const loader = new KTX2Loader()
          .setTranscoderPath(KTX2_TRANSCODER_PATH)
          .detectSupport(gl);
        try {
          texture = await loader.loadAsync(dataUrl);
        } finally {
          loader.dispose();
        }
      } else {
        texture = await new TextureLoader().loadAsync(dataUrl);
      }
      configureMaterialPreviewTexture(
        texture, request.asset, request.textureInfo, request.colorSpace,
        request.role ?? request.uniformName ?? "shader sampler",
      );
      return texture;
    }, setState);
    sessionRef.current = session;
    return () => {
      session.dispose();
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, [gl, projectPath]);

  useEffect(() => {
    sessionRef.current?.setRequests(requests);
  // Scalar edits reuse their Texture objects. Each changed slot loads on its
  // own; an Outline/Normal load must not remove a ready Base Color/Shade map.
  }, [gl, projectPath, requestKey]);

  return state;
}

/** Only inputs that configure a Texture belong in its resource identity. */
function previewTextureRequestKey(request: PreviewTextureRequest): string {
  return JSON.stringify({
    role: request.role,
    uniformName: request.uniformName,
    assetId: request.asset.id,
    sourceHash: request.asset.sourceHash,
    source: request.asset.source,
    sourceFormat: getTextureSourceFormat(request.asset),
    texCoord: request.textureInfo.texCoord,
    transform: request.textureInfo.transform,
    importSettings: request.asset.importSettings,
    colorSpace: request.colorSpace,
  });
}

/** Own each slot independently, including pending loads retired by a new edit. */
export function createMaterialPreviewTextureSession(
  load: (request: PreviewTextureRequest) => Promise<Texture>,
  onChange: (state: MaterialPreviewTextureState) => void,
) {
  type Entry = { request: PreviewTextureRequest; status: MaterialPreviewTextureLoadStatus; texture?: Texture };
  const entries = new Map<string, Entry>();
  let active = true;
  const publish = () => {
    if (!active) return;
    const textures: MaterialPreviewTextures = {};
    const statuses: MaterialPreviewTextureStatuses = {};
    for (const { request, status, texture } of entries.values()) {
      if (request.role) {
        statuses[request.role] = status;
        if (texture) textures[request.role] = texture;
      } else if (request.uniformName && texture) {
        (textures.shaderUniforms ??= {})[request.uniformName] = texture;
      }
    }
    onChange({ textures, statuses });
  };
  return {
    setRequests(requests: readonly PreviewTextureRequest[]) {
      if (!active) return;
      const requested = new Map(requests.map(request => [previewTextureRequestKey(request), request]));
      let changed = false;
      for (const [key, entry] of entries) {
        if (requested.has(key)) continue;
        entries.delete(key);
        entry.texture?.dispose();
        changed = true;
      }
      for (const [key, request] of requested) {
        if (entries.has(key)) continue;
        const entry: Entry = { request, status: "loading" };
        entries.set(key, entry);
        changed = true;
        void load(request).then(texture => {
          // A → B → A is a new request, even if the old A finishes last.
          if (!active || entries.get(key) !== entry) {
            texture.dispose();
            return;
          }
          entry.texture = texture;
          entry.status = "ready";
          publish();
        }, () => {
          if (!active || entries.get(key) !== entry) return;
          entry.status = "error";
          publish();
        });
      }
      if (changed || requests.length === 0) publish();
    },
    dispose() {
      active = false;
      for (const entry of entries.values()) entry.texture?.dispose();
      entries.clear();
    },
  };
}

export function useMaterialPreviewTextures(
  material: MaterialAsset | undefined,
  assets: AssetManifest,
  projectPath: string | undefined,
): MaterialPreviewTextures {
  return useMaterialPreviewTextureState(material, assets, projectPath).textures;
}

/** Compatibility name retained for existing Scene View consumers. */
export const useCoreMaterialPreviewTextures = useMaterialPreviewTextures;

/**
 * Three does not rebuild a Material's shader automatically when a map changes
 * between `undefined` and a loaded Texture. Keep both continuous Scene Views
 * and demand-rendered thumbnails in sync with asynchronous Texture loads.
 */
export function refreshMaterialPreviewRender(
  target: Material | readonly Material[] | null | undefined,
  textures: MaterialPreviewTextures,
  requestRender: () => void,
): void {
  for (const texture of Object.values(textures)) {
    if (texture) texture.needsUpdate = true;
  }
  const materials = Array.isArray(target) ? target : target ? [target] : [];
  for (const material of materials) material.needsUpdate = true;
  requestRender();
}

export function useMaterialPreviewRenderSync(
  materialRef: RefObject<Material | null>,
  textures: MaterialPreviewTextures,
): void {
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    refreshMaterialPreviewRender(materialRef.current, textures, invalidate);
  }, [invalidate, materialRef, textures]);
}

/** Applies only textures owned by the assigned Material preview. */
export function applyCoreMaterialPreviewTextures(
  target: MeshStandardMaterial,
  properties: MaterialProperties,
  textures: CoreMaterialPreviewTextures,
): void {
  target.map = textures.baseColorMap ?? null;
  target.metalnessMap = textures.metallicRoughnessMap ?? null;
  target.roughnessMap = textures.metallicRoughnessMap ?? null;
  target.normalMap = textures.normalMap ?? null;
  const normalScale = properties.normalTexture?.scale ?? 1;
  target.normalScale.set(normalScale, normalScale);
  target.aoMap = textures.occlusionMap ?? null;
  target.aoMapIntensity = properties.occlusionTexture?.strength ?? 1;
  target.emissiveMap = textures.emissiveMap ?? null;
  Object.assign(target, materialSurfaceProps(properties, textures.opacityMap));
  target.needsUpdate = true;
}

function resolvePreviewTextureRequests(
  material: MaterialAsset | undefined,
  assets: AssetManifest,
): PreviewTextureRequest[] {
  if (!material) return [];
  const properties = normalizeMaterialProperties(
    material.properties as unknown as Parameters<
      typeof normalizeMaterialProperties
    >[0],
  );
  const pbr = properties.pbrMetallicRoughness;
  const extensions = properties.extensions;
  const candidates: Array<
    [
      MaterialPreviewTextureRole,
      MaterialTextureInfo | undefined,
      "srgb" | "linear",
    ]
  > = [
    ["baseColorMap", pbr.baseColorTexture, "srgb"],
    ["opacityMap", properties.opacityTexture, "linear"],
    ["metallicRoughnessMap", pbr.metallicRoughnessTexture, "linear"],
    ["normalMap", properties.normalTexture, "linear"],
    ["occlusionMap", properties.occlusionTexture, "linear"],
    ["emissiveMap", properties.emissiveTexture, "srgb"],
    ["shadeMultiplyMap", extensions.VRMC_materials_mtoon?.shadeMultiplyTexture, "srgb"],
    ["outlineWidthMultiplyMap", extensions.VRMC_materials_mtoon?.outlineWidthMultiplyTexture, "linear"],
    ["shadingShiftMap", extensions.VRMC_materials_mtoon?.shadingShiftTexture, "linear"],
    ["matcapMap", extensions.VRMC_materials_mtoon?.matcapTexture, "srgb"],
    ["rimMultiplyMap", extensions.VRMC_materials_mtoon?.rimMultiplyTexture, "srgb"],
    ["uvAnimationMaskMap", extensions.VRMC_materials_mtoon?.uvAnimationMaskTexture, "linear"],
    [
      "anisotropyMap",
      extensions.KHR_materials_anisotropy?.anisotropyTexture,
      "linear",
    ],
    [
      "clearcoatMap",
      extensions.KHR_materials_clearcoat?.clearcoatTexture,
      "linear",
    ],
    [
      "clearcoatRoughnessMap",
      extensions.KHR_materials_clearcoat?.clearcoatRoughnessTexture,
      "linear",
    ],
    [
      "clearcoatNormalMap",
      extensions.KHR_materials_clearcoat?.clearcoatNormalTexture,
      "linear",
    ],
    [
      "iridescenceMap",
      extensions.KHR_materials_iridescence?.iridescenceTexture,
      "linear",
    ],
    [
      "iridescenceThicknessMap",
      extensions.KHR_materials_iridescence?.iridescenceThicknessTexture,
      "linear",
    ],
    [
      "sheenColorMap",
      extensions.KHR_materials_sheen?.sheenColorTexture,
      "srgb",
    ],
    [
      "sheenRoughnessMap",
      extensions.KHR_materials_sheen?.sheenRoughnessTexture,
      "linear",
    ],
    [
      "specularIntensityMap",
      extensions.KHR_materials_specular?.specularTexture,
      "linear",
    ],
    [
      "specularColorMap",
      extensions.KHR_materials_specular?.specularColorTexture,
      "srgb",
    ],
    [
      "transmissionMap",
      extensions.KHR_materials_transmission?.transmissionTexture,
      "linear",
    ],
    [
      "thicknessMap",
      extensions.KHR_materials_volume?.thicknessTexture,
      "linear",
    ],
  ];
  const requests: PreviewTextureRequest[] = candidates.flatMap(([
    role,
    textureInfo,
    colorSpace,
  ]) => {
    if (!textureInfo) return [];
    const asset = getTextureAsset(assets, textureInfo.textureAssetId);
    if (
      !asset ||
      (asset.source.kind !== "project" &&
        (asset.source.kind !== "builtin" ||
          !resolveOpenBrushBuiltinTextureUrl(asset.source.key)))
    ) {
      return [];
    }
    return [
      {
        role,
        textureInfo,
        asset: asset as PreviewTextureRequest["asset"],
        colorSpace,
      },
    ];
  });
  const shaderBindings =
    material.shader?.kind === "openbrush"
      ? (material.shader.textureBindings ?? {})
      : {};
  for (const [uniformName, binding] of Object.entries(shaderBindings)) {
    const asset = getTextureAsset(assets, binding.textureAssetId);
    if (
      !asset ||
      (asset.source.kind !== "project" &&
        (asset.source.kind !== "builtin" ||
          !resolveOpenBrushBuiltinTextureUrl(asset.source.key)))
    ) {
      continue;
    }
    requests.push({
      uniformName,
      textureInfo: { textureAssetId: asset.id, texCoord: 0 },
      asset: asset as PreviewTextureRequest["asset"],
      colorSpace: "linear",
    });
  }
  return requests;
}

/** Reads an imported project texture for editor-only Three previews. */
export async function readMaterialPreviewTextureUrl(
  projectPath: string,
  asset: PreviewTextureRequest["asset"],
): Promise<string> {
  if (asset.source.kind === "builtin") {
    const url = resolveOpenBrushBuiltinTextureUrl(asset.source.key);
    if (!url) throw new Error(`Unsupported builtin Texture: ${asset.source.key}`);
    return url;
  }
  const key = [
    projectPath,
    asset.id,
    asset.sourceHash ?? "",
    asset.source.relativePath,
  ].join("\n");
  const existing = IMAGE_DATA_URL_CACHE.get(key);
  if (existing) return existing;
  const pending = tauri.readImageDataUrl(projectPath, asset.source.relativePath);
  IMAGE_DATA_URL_CACHE.set(key, pending);
  try {
    return await pending;
  } catch (error) {
    IMAGE_DATA_URL_CACHE.delete(key);
    throw error;
  }
}

/** Compatibility name for existing project-only preview consumers. */
export const readProjectTextureDataUrl = readMaterialPreviewTextureUrl;

export function configureMaterialPreviewTexture(
  texture: Texture,
  asset: TextureAsset,
  textureInfo: MaterialTextureInfo,
  colorSpace: "srgb" | "linear",
  role = "material",
): void {
  const settings = asset.importSettings;
  texture.name = `${asset.name} (${role})`;
  texture.channel = textureInfo.texCoord;
  texture.colorSpace =
    colorSpace === "srgb" ? SRGBColorSpace : NoColorSpace;
  texture.flipY = settings.flipY;
  // KTX2 already contains its encoded mip levels. WebGL cannot generate new
  // mip levels for compressed textures, in either Edit or Play.
  texture.generateMipmaps =
    !("isCompressedTexture" in texture && texture.isCompressedTexture === true) &&
    settings.generateMipmaps;
  texture.wrapS = {
    "clamp-to-edge": ClampToEdgeWrapping,
    "mirrored-repeat": MirroredRepeatWrapping,
    repeat: RepeatWrapping,
  }[settings.sampler.wrapS];
  texture.wrapT = {
    "clamp-to-edge": ClampToEdgeWrapping,
    "mirrored-repeat": MirroredRepeatWrapping,
    repeat: RepeatWrapping,
  }[settings.sampler.wrapT];
  texture.magFilter = {
    linear: LinearFilter,
    nearest: NearestFilter,
  }[settings.sampler.magFilter];
  texture.minFilter = {
    linear: LinearFilter,
    "linear-mipmap-linear": LinearMipmapLinearFilter,
    "linear-mipmap-nearest": LinearMipmapNearestFilter,
    nearest: NearestFilter,
    "nearest-mipmap-linear": NearestMipmapLinearFilter,
    "nearest-mipmap-nearest": NearestMipmapNearestFilter,
  }[settings.sampler.minFilter];
  if (textureInfo.transform) {
    texture.offset.set(...textureInfo.transform.offset);
    texture.rotation = textureInfo.transform.rotation;
    texture.repeat.set(...textureInfo.transform.scale);
  } else {
    texture.offset.set(0, 0);
    texture.rotation = 0;
    texture.repeat.set(1, 1);
  }
  texture.needsUpdate = true;
}
