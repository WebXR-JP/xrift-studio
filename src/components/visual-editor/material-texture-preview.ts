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
import { tauri } from "../../lib/tauri";
import {
  getTextureAsset,
  normalizeMaterialProperties,
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
};

/** Compatibility alias for existing Scene View consumers. */
export type CoreMaterialPreviewTextures = MaterialPreviewTextures;

type PreviewTextureRole = keyof MaterialPreviewTextures;

type PreviewTextureRequest = {
  role: PreviewTextureRole;
  textureInfo: MaterialTextureInfo;
  asset: TextureAsset & { source: { kind: "project"; relativePath: string } };
  colorSpace: "srgb" | "linear";
};

const IMAGE_DATA_URL_CACHE = new Map<string, Promise<string>>();

export function useMaterialPreviewTextures(
  material: MaterialAsset | undefined,
  assets: AssetManifest,
  projectPath: string | undefined,
): MaterialPreviewTextures {
  const requests = useMemo(
    () => resolvePreviewTextureRequests(material, assets),
    [assets, material],
  );
  const requestKey = useMemo(
    () =>
      JSON.stringify(
        requests.map((request) => ({
          role: request.role,
          assetId: request.asset.id,
          sourceHash: request.asset.sourceHash ?? "",
          relativePath: request.asset.source.relativePath,
          textureInfo: request.textureInfo,
          importSettings: request.asset.importSettings,
          colorSpace: request.colorSpace,
        })),
      ),
    [requests],
  );
  const [textures, setTextures] = useState<MaterialPreviewTextures>({});

  useEffect(() => {
    let active = true;
    let ownedTextures: Texture[] = [];
    setTextures({});
    if (!projectPath || requests.length === 0) {
      return () => {
        active = false;
      };
    }

    void Promise.all(
      requests.map(async (request) => {
        try {
          const dataUrl = await readProjectTextureDataUrl(projectPath, request.asset);
          const texture = await new TextureLoader().loadAsync(dataUrl);
          configureMaterialPreviewTexture(
            texture,
            request.asset,
            request.textureInfo,
            request.colorSpace,
            request.role,
          );
          return { role: request.role, texture };
        } catch {
          return null;
        }
      }),
    ).then((loaded) => {
      const available = [];
      for (const entry of loaded) {
        if (entry) available.push(entry);
      }
      if (!active) {
        available.forEach((entry) => entry.texture.dispose());
        return;
      }
      ownedTextures = available.map((entry) => entry.texture);
      setTextures(
        Object.fromEntries(
          available.map((entry) => [entry.role, entry.texture]),
        ) as MaterialPreviewTextures,
      );
    });

    return () => {
      active = false;
      ownedTextures.forEach((texture) => texture.dispose());
      ownedTextures = [];
    };
  // Scalar Material edits must not clear and reload every unchanged Texture.
  // `requestKey` contains every source, slot, transform, sampler, and color-space
  // input that can change the owned Texture set.
  }, [projectPath, requestKey]);

  return textures;
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
    [PreviewTextureRole, MaterialTextureInfo | undefined, "srgb" | "linear"]
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
  return candidates.flatMap(([role, textureInfo, colorSpace]) => {
    if (!textureInfo) return [];
    const asset = getTextureAsset(assets, textureInfo.textureAssetId);
    if (!asset || asset.source.kind !== "project") return [];
    return [
      {
        role,
        textureInfo,
        asset: asset as PreviewTextureRequest["asset"],
        colorSpace,
      },
    ];
  });
}

/** Reads an imported project texture for editor-only Three previews. */
export async function readProjectTextureDataUrl(
  projectPath: string,
  asset: PreviewTextureRequest["asset"],
): Promise<string> {
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
