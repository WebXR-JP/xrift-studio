import {
  useEffect,
  useLayoutEffect,
  useMemo,
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
import {
  getTextureAsset,
  normalizeMaterialProperties,
  resolveOpenBrushBuiltinTextureUrl,
  type AssetManifest,
  type MaterialAsset,
  type MaterialProperties,
  type MaterialTextureInfo,
  type TextureAsset,
} from "../../lib/visual-editor";

export type MaterialPreviewTextures = {
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
const KTX2_TRANSCODER_PATH =
  "https://cdn.jsdelivr.net/gh/pmndrs/drei-assets@master/basis/";

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
    () =>
      JSON.stringify(
        requests.map((request) => ({
          role: request.role ?? `uniform:${request.uniformName ?? ""}`,
          assetId: request.asset.id,
          sourceHash: request.asset.sourceHash ?? "",
          source:
            request.asset.source.kind === "project"
              ? request.asset.source.relativePath
              : request.asset.source.key,
          textureInfo: request.textureInfo,
          importSettings: request.asset.importSettings,
          colorSpace: request.colorSpace,
        })),
      ),
    [requests],
  );
  const [state, setState] = useState<MaterialPreviewTextureState>({
    textures: {},
    statuses: {},
  });

  useEffect(() => {
    let active = true;
    let ownedTextures: Texture[] = [];
    if (requests.length === 0) {
      setState({ textures: {}, statuses: {} });
      return () => {
        active = false;
      };
    }
    const initialStatus: MaterialPreviewTextureLoadStatus = projectPath
      ? "loading"
      : "error";
    setState({
      textures: {},
      statuses: Object.fromEntries(
        requests.flatMap((request) =>
          request.role ? [[request.role, initialStatus] as const] : [],
        ),
      ) as MaterialPreviewTextureStatuses,
    });
    if (!projectPath) {
      return () => {
        active = false;
      };
    }

    void Promise.all(
      requests.map(async (request) => {
        try {
          const dataUrl = await readMaterialPreviewTextureUrl(projectPath, request.asset);
          const texture =
            request.asset.importMetadata?.sourceFormat === "ktx2"
              ? await new KTX2Loader()
                  .setTranscoderPath(KTX2_TRANSCODER_PATH)
                  .detectSupport(gl)
                  .loadAsync(dataUrl)
              : await new TextureLoader().loadAsync(dataUrl);
          configureMaterialPreviewTexture(
            texture,
            request.asset,
            request.textureInfo,
            request.colorSpace,
            request.role ?? request.uniformName ?? "shader sampler",
          );
          return { ...request, texture, status: "ready" as const };
        } catch {
          return { ...request, status: "error" as const };
        }
      }),
    ).then((loaded) => {
        const available: Array<PreviewTextureRequest & { texture: Texture }> = [];
      for (const entry of loaded) {
        if (entry.status === "ready") available.push(entry);
      }
      if (!active) {
        available.forEach((entry) => entry.texture.dispose());
        return;
      }
      ownedTextures = available.map((entry) => entry.texture);
        const shaderUniforms: Record<string, Texture> = {};
        const textures: MaterialPreviewTextures = {};
        for (const entry of available) {
          if (entry.uniformName) shaderUniforms[entry.uniformName] = entry.texture;
          else if (entry.role) textures[entry.role] = entry.texture;
        }
        if (Object.keys(shaderUniforms).length > 0) {
          textures.shaderUniforms = shaderUniforms;
        }
        setState({
          textures,
          statuses: Object.fromEntries(
            loaded.flatMap((entry) =>
              entry.role ? [[entry.role, entry.status] as const] : [],
            ),
          ) as MaterialPreviewTextureStatuses,
        });
    });

    return () => {
      active = false;
      ownedTextures.forEach((texture) => texture.dispose());
      ownedTextures = [];
    };
  // Scalar Material edits must not clear and reload every unchanged Texture.
  // `requestKey` contains every source, slot, transform, sampler, and color-space
  // input that can change the owned Texture set.
  }, [gl, projectPath, requestKey]);

  return state;
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
  target.alphaMap = null;
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
    ["metallicRoughnessMap", pbr.metallicRoughnessTexture, "linear"],
    ["normalMap", properties.normalTexture, "linear"],
    ["occlusionMap", properties.occlusionTexture, "linear"],
    ["emissiveMap", properties.emissiveTexture, "srgb"],
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
  const shaderBindings = material.shader?.textureBindings ?? {};
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
  texture.generateMipmaps = settings.generateMipmaps;
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
