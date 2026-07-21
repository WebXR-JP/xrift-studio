import {
  normalizeMaterialProperties,
  normalizeTextureImportSettings,
  type AssetManifest,
  type MaterialAlphaMode,
  type MaterialAsset,
  type MaterialAssetPatch,
  type MaterialExtensionsPatch,
  type MaterialSlotDefinition,
  type MaterialTextureInfoPatch,
  type MaterialTextureTransformPatch,
  type NormalTextureInfoPatch,
  type OcclusionTextureInfoPatch,
  type TextureAsset,
  type TextureImportSettings,
  type TextureImportMetadata,
  type TextureSamplerSettings,
} from "./asset-manifest";
import {
  extractOpenBrushMaterialShader,
  type OpenBrushModelMetadata,
} from "./open-brush";

type JsonObject = Record<string, unknown>;
type GltfTextureInfoPatch = Exclude<
  MaterialTextureInfoPatch,
  string | null
>;

export type GltfJson = {
  asset?: { version?: unknown };
  materials?: JsonObject[];
  meshes?: Array<{ primitives?: Array<{ material?: unknown }> }>;
  nodes?: unknown[];
  animations?: Array<{ name?: unknown }>;
  buffers?: JsonObject[];
  bufferViews?: JsonObject[];
  images?: JsonObject[];
  textures?: JsonObject[];
  samplers?: JsonObject[];
  extensionsUsed?: unknown;
  extensionsRequired?: unknown;
};

export type GltfDerivedAssetWrite = {
  relativePath: string;
  mediaType: string;
  sha256: string;
  bytes: Uint8Array;
};

export type GltfDerivedAssetWarning = {
  code: string;
  message: string;
  fieldPath: string;
};

export type ExpandGltfAssetsInput = {
  json: GltfJson;
  modelBytes: Uint8Array;
  sourceFormat: "glb" | "gltf";
  modelAssetId: string;
  modelSourceHash: string;
  materialSlots: readonly MaterialSlotDefinition[];
  manifest?: AssetManifest;
  materialFolderId: string;
  textureFolderId: string;
  hashBytes: (bytes: Uint8Array) => Promise<string>;
  /** Retains three-icosa brush presets instead of treating them as PBR maps. */
  openBrush?: OpenBrushModelMetadata;
};

export type ExpandedGltfAssets = {
  materialAssets: MaterialAsset[];
  textureAssets: TextureAsset[];
  materialSlots: MaterialSlotDefinition[];
  writes: GltfDerivedAssetWrite[];
  warnings: GltfDerivedAssetWarning[];
};

type EmbeddedImage = {
  index: number;
  name: string;
  mediaType: TextureImportMetadata["mimeType"];
  extension: TextureImportMetadata["sourceFormat"];
  bytes: Uint8Array;
  hash: string;
  dimensions?: { width: number; height: number };
};

type ExpandedTexture = {
  asset: TextureAsset;
  sourceImageIndex: number;
  sourceTextureIndex: number;
};

/**
 * Expands embedded glTF materials and images into ordinary authoring Assets.
 * The function is filesystem-free; extracted image writes are returned to the
 * same atomic import transaction as the Model source and thumbnail.
 */
export async function expandGltfAssets(
  input: ExpandGltfAssetsInput,
): Promise<ExpandedGltfAssets> {
  const warnings: GltfDerivedAssetWarning[] = [];
  const images = input.openBrush ? [] : await extractImages(input, warnings);
  const textureExpansion = input.openBrush
    ? { textures: [], textureAssetIds: new Map<number, string>() }
    : expandTextures(input, images, warnings);
  const materialAssets = expandMaterials(
    input,
    textureExpansion.textureAssetIds,
    warnings,
  );
  const materialByIndex = new Map(
    materialAssets.map((asset) => [
      asset.importedFromModel?.sourceMaterialIndex,
      asset,
    ]),
  );
  const materialSlots = input.materialSlots.map((slot) => {
    const generated =
      slot.sourceMaterialIndex === undefined
        ? undefined
        : materialByIndex.get(slot.sourceMaterialIndex);
    if (!generated) return { ...slot };
    const currentBinding = slot.defaultMaterialAssetId
      ? input.manifest?.assets[slot.defaultMaterialAssetId]
      : undefined;
    const bindingIsGeneratedForThisModel =
      currentBinding?.kind === "material" &&
      currentBinding.importedFromModel?.modelAssetId === input.modelAssetId;
    return !slot.defaultMaterialAssetId || bindingIsGeneratedForThisModel
      ? { ...slot, defaultMaterialAssetId: generated.id }
      : { ...slot };
  });

  const writesByPath = new Map<string, GltfDerivedAssetWrite>();
  for (const image of images) {
    const relativePath = textureSourcePath(image);
    if (!writesByPath.has(relativePath)) {
      writesByPath.set(relativePath, {
        relativePath,
        mediaType: image.mediaType,
        sha256: image.hash,
        bytes: image.bytes.slice(),
      });
    }
  }

  return {
    materialAssets,
    textureAssets: textureExpansion.textures.map((entry) => entry.asset),
    materialSlots,
    writes: [...writesByPath.values()],
    warnings,
  };
}

async function extractImages(
  input: ExpandGltfAssetsInput,
  warnings: GltfDerivedAssetWarning[],
): Promise<EmbeddedImage[]> {
  const buffers = await resolveBuffers(input);
  const results: EmbeddedImage[] = [];
  for (const [index, candidate] of (input.json.images ?? []).entries()) {
    try {
      const decoded = await resolveImageBytes(candidate, input.json, buffers);
      const detected = detectImageFormat(decoded.bytes, decoded.mediaType);
      if (!detected) {
        warnings.push({
          code: "gltf-image-format-unsupported",
          message: `埋め込み画像 ${index + 1} の形式をAsset化できませんでした`,
          fieldPath: `images[${index}]`,
        });
        continue;
      }
      const hash = await input.hashBytes(decoded.bytes);
      results.push({
        index,
        name: stringValue(candidate.name) ?? `Texture ${index + 1}`,
        mediaType: detected.mediaType,
        extension: detected.extension,
        bytes: decoded.bytes,
        hash,
        ...(readImageDimensions(decoded.bytes, detected.extension) ?? {}),
      });
    } catch (error) {
      warnings.push({
        code: "gltf-image-extract-failed",
        message: `埋め込み画像 ${index + 1} を展開できませんでした: ${errorMessage(error)}`,
        fieldPath: `images[${index}]`,
      });
    }
  }
  return results;
}

async function resolveBuffers(
  input: ExpandGltfAssetsInput,
): Promise<Map<number, Uint8Array>> {
  const buffers = new Map<number, Uint8Array>();
  const glbBinary =
    input.sourceFormat === "glb" ? readGlbBinaryChunk(input.modelBytes) : undefined;
  for (const [index, buffer] of (input.json.buffers ?? []).entries()) {
    const uri = stringValue(buffer.uri);
    if (uri?.startsWith("data:")) {
      buffers.set(index, await decodeDataUri(uri));
    } else if (!uri && index === 0 && glbBinary) {
      buffers.set(index, glbBinary);
    }
  }
  if (glbBinary && !buffers.has(0)) buffers.set(0, glbBinary);
  return buffers;
}

async function resolveImageBytes(
  image: JsonObject,
  json: GltfJson,
  buffers: ReadonlyMap<number, Uint8Array>,
): Promise<{ bytes: Uint8Array; mediaType?: string }> {
  const uri = stringValue(image.uri);
  if (uri?.startsWith("data:")) {
    return {
      bytes: await decodeDataUri(uri),
      mediaType: dataUriMediaType(uri) ?? stringValue(image.mimeType),
    };
  }
  const bufferViewIndex = integerValue(image.bufferView);
  if (bufferViewIndex === undefined) {
    throw new Error("画像にdata URIまたはbufferViewがありません");
  }
  const view = json.bufferViews?.[bufferViewIndex];
  if (!view) throw new Error("画像のbufferViewが見つかりません");
  const bufferIndex = integerValue(view.buffer) ?? 0;
  const buffer = buffers.get(bufferIndex);
  if (!buffer) throw new Error("画像のbufferが見つかりません");
  const offset = nonNegativeIntegerValue(view.byteOffset) ?? 0;
  const length = nonNegativeIntegerValue(view.byteLength);
  if (length === undefined || offset + length > buffer.byteLength) {
    throw new Error("画像のbufferView範囲が不正です");
  }
  return {
    bytes: buffer.slice(offset, offset + length),
    mediaType: stringValue(image.mimeType),
  };
}

function expandTextures(
  input: ExpandGltfAssetsInput,
  images: readonly EmbeddedImage[],
  warnings: GltfDerivedAssetWarning[],
): { textures: ExpandedTexture[]; textureAssetIds: Map<number, string> } {
  const imageByIndex = new Map(images.map((image) => [image.index, image]));
  const existing = Object.values(input.manifest?.assets ?? {}).filter(
    (asset): asset is TextureAsset => asset.kind === "texture",
  );
  const textures: ExpandedTexture[] = [];
  const textureAssetIds = new Map<number, string>();
  const sharedByRecipe = new Map<string, TextureAsset>();
  const referencedImages = new Set<number>();

  for (const [textureIndex, texture] of (input.json.textures ?? []).entries()) {
    const imageIndex = integerValue(texture.source);
    const image = imageIndex === undefined ? undefined : imageByIndex.get(imageIndex);
    if (!image || imageIndex === undefined) {
      warnings.push({
        code: "gltf-texture-source-missing",
        message: `Texture ${textureIndex + 1} の画像をAsset化できませんでした`,
        fieldPath: `textures[${textureIndex}].source`,
      });
      continue;
    }
    referencedImages.add(imageIndex);
    const settings = textureSettings(input.json, texture);
    const recipeKey = `${image.hash}:${JSON.stringify(settings.sampler)}`;
    const shared = sharedByRecipe.get(recipeKey);
    if (shared) {
      textureAssetIds.set(textureIndex, shared.id);
      continue;
    }
    const expanded = createExpandedTexture(
      input,
      image,
      textureIndex,
      stringValue(texture.name) ?? image.name,
      settings,
      existing,
    );
    textures.push(expanded);
    sharedByRecipe.set(recipeKey, expanded.asset);
    textureAssetIds.set(textureIndex, expanded.asset.id);
  }

  for (const image of images) {
    if (referencedImages.has(image.index)) continue;
    const settings = normalizeTextureImportSettings();
    const recipeKey = `${image.hash}:${JSON.stringify(settings.sampler)}`;
    if (sharedByRecipe.has(recipeKey)) continue;
    const expanded = createExpandedTexture(
      input,
      image,
      -1,
      image.name,
      settings,
      existing,
    );
    textures.push(expanded);
    sharedByRecipe.set(recipeKey, expanded.asset);
  }

  return { textures, textureAssetIds };
}

function createExpandedTexture(
  input: ExpandGltfAssetsInput,
  image: EmbeddedImage,
  textureIndex: number,
  requestedName: string,
  settings: TextureImportSettings,
  existing: readonly TextureAsset[],
): ExpandedTexture {
  const previous = existing.find(
    (asset) =>
      asset.importedFromModel?.modelAssetId === input.modelAssetId &&
      asset.importedFromModel.sourceTextureIndex === textureIndex &&
      asset.importedFromModel.sourceImageIndex === image.index,
  );
  const sameRecipe = existing.find(
    (asset) =>
      asset.sourceHash === image.hash &&
      JSON.stringify(asset.importSettings.sampler) ===
        JSON.stringify(settings.sampler),
  );
  const reused = previous ?? sameRecipe;
  if (sameRecipe && !previous) {
    return {
      asset: sameRecipe,
      sourceImageIndex: image.index,
      sourceTextureIndex: textureIndex,
    };
  }
  const id =
    reused?.id ??
    `texture-${safeSegment(input.modelAssetId)}-${textureIndex >= 0 ? textureIndex : `image-${image.index}`}`;
  const importSettings =
    previous?.importedFromModel?.isUserOverridden
      ? previous.importSettings
      : settings;
  const asset: TextureAsset = {
    id,
    name: reused?.name ?? cleanName(requestedName, `Texture ${image.index + 1}`),
    kind: "texture",
    status: "ready",
    source: { kind: "project", relativePath: textureSourcePath(image) },
    sourceHash: image.hash,
    thumbnail: { status: "missing" },
    folderId: reused?.folderId ?? input.textureFolderId,
    ...(reused?.order === undefined ? {} : { order: reused.order }),
    importSettings,
    importMetadata: {
      sourceFormat: image.extension,
      mimeType: image.mediaType,
      byteLength: image.bytes.byteLength,
      ...(image.dimensions ?? {}),
    },
    importedFromModel: {
      modelAssetId: input.modelAssetId,
      sourceImageIndex: image.index,
      sourceTextureIndex: textureIndex,
      sourceHash: input.modelSourceHash,
      isUserOverridden:
        previous?.importedFromModel?.isUserOverridden ?? false,
    },
  };
  return { asset, sourceImageIndex: image.index, sourceTextureIndex: textureIndex };
}

function expandMaterials(
  input: ExpandGltfAssetsInput,
  textureAssetIds: ReadonlyMap<number, string>,
  warnings: GltfDerivedAssetWarning[],
): MaterialAsset[] {
  const existing = Object.values(input.manifest?.assets ?? {}).filter(
    (asset): asset is MaterialAsset => asset.kind === "material",
  );
  const slotByMaterialIndex = new Map(
    input.materialSlots
      .filter((slot) => slot.sourceMaterialIndex !== undefined)
      .map((slot) => [slot.sourceMaterialIndex as number, slot]),
  );

  return (input.json.materials ?? []).map((material, materialIndex) => {
    const slot = slotByMaterialIndex.get(materialIndex);
    const sourceName = cleanName(
      stringValue(material.name),
      `Material ${materialIndex + 1}`,
    );
    const previous = existing.find(
      (asset) =>
        asset.importedFromModel?.modelAssetId === input.modelAssetId &&
        (asset.importedFromModel.sourceSlotId === slot?.slot ||
          asset.importedFromModel.sourceMaterialIndex === materialIndex),
    );
    const provenance = {
      modelAssetId: input.modelAssetId,
      sourceMaterialIndex: materialIndex,
      sourceMaterialName: sourceName,
      sourceSlotId: slot?.slot ?? `material-${materialIndex}`,
      sourceHash: input.modelSourceHash,
      isUserOverridden:
        previous?.importedFromModel?.isUserOverridden ?? false,
    };
    if (previous?.importedFromModel?.isUserOverridden) {
      return { ...previous, importedFromModel: provenance };
    }
    const properties = normalizeMaterialProperties(
      materialPatch(
        material,
        materialIndex,
        textureAssetIds,
        warnings,
        Boolean(input.openBrush),
      ),
    );
    const shader = input.openBrush
      ? extractOpenBrushMaterialShader(input.json, materialIndex)
      : undefined;
    return {
      id:
        previous?.id ??
        `material-${safeSegment(input.modelAssetId)}-${materialIndex}`,
      name: previous?.name ?? sourceName,
      kind: "material",
      status: "ready",
      source: { kind: "document" },
      thumbnail: previous?.thumbnail ?? { status: "missing" },
      folderId: previous?.folderId ?? input.materialFolderId,
      ...(previous?.order === undefined ? {} : { order: previous.order }),
      properties,
      ...(shader ? { shader } : {}),
      importedFromModel: provenance,
    };
  });
}

function materialPatch(
  material: JsonObject,
  materialIndex: number,
  textureAssetIds: ReadonlyMap<number, string>,
  warnings: GltfDerivedAssetWarning[],
  ignoreTextures = false,
): MaterialAssetPatch {
  const pbr = objectValue(material.pbrMetallicRoughness) ?? {};
  const baseColorTexture = ignoreTextures
    ? undefined
    : textureInfo(
        pbr.baseColorTexture,
        textureAssetIds,
        `materials[${materialIndex}].pbrMetallicRoughness.baseColorTexture`,
        warnings,
      );
  const metallicRoughnessTexture = ignoreTextures
    ? undefined
    : textureInfo(
        pbr.metallicRoughnessTexture,
        textureAssetIds,
        `materials[${materialIndex}].pbrMetallicRoughness.metallicRoughnessTexture`,
        warnings,
      );
  const normal = ignoreTextures
    ? undefined
    : normalTextureInfo(
        material.normalTexture,
        textureAssetIds,
        `materials[${materialIndex}].normalTexture`,
        warnings,
      );
  const occlusion = ignoreTextures
    ? undefined
    : occlusionTextureInfo(
        material.occlusionTexture,
        textureAssetIds,
        `materials[${materialIndex}].occlusionTexture`,
        warnings,
      );
  const emissive = ignoreTextures
    ? undefined
    : textureInfo(
        material.emissiveTexture,
        textureAssetIds,
        `materials[${materialIndex}].emissiveTexture`,
        warnings,
      );
  const baseColorFactor = colorTuple(pbr.baseColorFactor, 4, [1, 1, 1, 1]);
  const emissiveFactor = colorTuple(material.emissiveFactor, 3, [0, 0, 0]);
  return {
    pbrMetallicRoughness: {
      baseColorFactor,
      metallicFactor: unitNumber(pbr.metallicFactor, 1),
      roughnessFactor: unitNumber(pbr.roughnessFactor, 1),
      ...(baseColorTexture ? { baseColorTexture } : {}),
      ...(metallicRoughnessTexture ? { metallicRoughnessTexture } : {}),
    },
    ...(normal ? { normalTexture: normal } : {}),
    ...(occlusion ? { occlusionTexture: occlusion } : {}),
    emissiveFactor,
    ...(emissive ? { emissiveTexture: emissive } : {}),
    alphaMode: alphaMode(material.alphaMode),
    alphaCutoff: nonNegativeNumber(material.alphaCutoff, 0.5),
    doubleSided: material.doubleSided === true,
    extensions: materialExtensions(
      objectValue(material.extensions),
      textureAssetIds,
      materialIndex,
      warnings,
    ),
  };
}

function materialExtensions(
  extensions: JsonObject | undefined,
  textureAssetIds: ReadonlyMap<number, string>,
  materialIndex: number,
  warnings: GltfDerivedAssetWarning[],
): MaterialExtensionsPatch {
  if (!extensions) return {};
  const result: MaterialExtensionsPatch = {};
  if (objectValue(extensions.KHR_materials_unlit)) {
    result.KHR_materials_unlit = {};
  }
  const emissiveStrength = objectValue(
    extensions.KHR_materials_emissive_strength,
  );
  if (emissiveStrength) {
    result.KHR_materials_emissive_strength = {
      emissiveStrength: nonNegativeNumber(emissiveStrength.emissiveStrength, 1),
    };
  }
  const ior = objectValue(extensions.KHR_materials_ior);
  if (ior) {
    result.KHR_materials_ior = {
      ior: nonNegativeNumber(ior.ior, 1.5),
    };
  }
  const transmission = objectValue(extensions.KHR_materials_transmission);
  if (transmission) {
    const transmissionTexture = textureInfo(
      transmission.transmissionTexture,
      textureAssetIds,
      `materials[${materialIndex}].extensions.KHR_materials_transmission.transmissionTexture`,
      warnings,
    );
    result.KHR_materials_transmission = {
      transmissionFactor: unitNumber(transmission.transmissionFactor, 0),
      ...(transmissionTexture ? { transmissionTexture } : {}),
    };
  }
  const clearcoat = objectValue(extensions.KHR_materials_clearcoat);
  if (clearcoat) {
    const clearcoatTexture = textureInfo(
      clearcoat.clearcoatTexture,
      textureAssetIds,
      `materials[${materialIndex}].extensions.KHR_materials_clearcoat.clearcoatTexture`,
      warnings,
    );
    const roughnessTexture = textureInfo(
      clearcoat.clearcoatRoughnessTexture,
      textureAssetIds,
      `materials[${materialIndex}].extensions.KHR_materials_clearcoat.clearcoatRoughnessTexture`,
      warnings,
    );
    const normalTexture = normalTextureInfo(
      clearcoat.clearcoatNormalTexture,
      textureAssetIds,
      `materials[${materialIndex}].extensions.KHR_materials_clearcoat.clearcoatNormalTexture`,
      warnings,
    );
    result.KHR_materials_clearcoat = {
      clearcoatFactor: unitNumber(clearcoat.clearcoatFactor, 0),
      clearcoatRoughnessFactor: unitNumber(
        clearcoat.clearcoatRoughnessFactor,
        0,
      ),
      ...(clearcoatTexture ? { clearcoatTexture } : {}),
      ...(roughnessTexture
        ? { clearcoatRoughnessTexture: roughnessTexture }
        : {}),
      ...(normalTexture ? { clearcoatNormalTexture: normalTexture } : {}),
    };
  }
  return result;
}

function textureInfo(
  value: unknown,
  textureAssetIds: ReadonlyMap<number, string>,
  path: string,
  warnings: GltfDerivedAssetWarning[],
): GltfTextureInfoPatch | undefined {
  const candidate = objectValue(value);
  if (!candidate) return undefined;
  const index = integerValue(candidate.index);
  const textureAssetId = index === undefined ? undefined : textureAssetIds.get(index);
  if (!textureAssetId) {
    warnings.push({
      code: "gltf-material-texture-missing",
      message: `${path} のTextureをAssetへ関連付けられませんでした`,
      fieldPath: `${path}.index`,
    });
    return undefined;
  }
  const transform = textureTransform(candidate);
  const transformSource = objectValue(
    objectValue(candidate.extensions)?.KHR_texture_transform,
  );
  return {
    textureAssetId,
    texCoord:
      nonNegativeIntegerValue(transformSource?.texCoord) ??
      nonNegativeIntegerValue(candidate.texCoord) ??
      0,
    ...(transform ? { transform } : {}),
  };
}

function normalTextureInfo(
  value: unknown,
  textureAssetIds: ReadonlyMap<number, string>,
  path: string,
  warnings: GltfDerivedAssetWarning[],
): NormalTextureInfoPatch | undefined {
  const base = textureInfo(value, textureAssetIds, path, warnings);
  const candidate = objectValue(value);
  return base
    ? { ...base, scale: finiteNumber(candidate?.scale, 1) }
    : undefined;
}

function occlusionTextureInfo(
  value: unknown,
  textureAssetIds: ReadonlyMap<number, string>,
  path: string,
  warnings: GltfDerivedAssetWarning[],
): OcclusionTextureInfoPatch | undefined {
  const base = textureInfo(value, textureAssetIds, path, warnings);
  const candidate = objectValue(value);
  return base
    ? { ...base, strength: unitNumber(candidate?.strength, 1) }
    : undefined;
}

function textureTransform(
  textureInfoValue: JsonObject,
): MaterialTextureTransformPatch | undefined {
  const extensions = objectValue(textureInfoValue.extensions);
  const transform = objectValue(extensions?.KHR_texture_transform);
  if (!transform) return undefined;
  const offset = numberTuple(transform.offset, 2, [0, 0]);
  const scale = numberTuple(transform.scale, 2, [1, 1]);
  return {
    offset,
    rotation: finiteNumber(transform.rotation, 0),
    scale,
  };
}

function textureSettings(json: GltfJson, texture: JsonObject): TextureImportSettings {
  const samplerIndex = integerValue(texture.sampler);
  const sampler =
    samplerIndex === undefined ? undefined : json.samplers?.[samplerIndex];
  return normalizeTextureImportSettings({
    sampler: {
      wrapS: wrapMode(sampler?.wrapS),
      wrapT: wrapMode(sampler?.wrapT),
      magFilter: magFilter(sampler?.magFilter),
      minFilter: minFilter(sampler?.minFilter),
    },
  });
}

function wrapMode(value: unknown): TextureSamplerSettings["wrapS"] {
  if (value === 33071) return "clamp-to-edge";
  if (value === 33648) return "mirrored-repeat";
  return "repeat";
}

function magFilter(value: unknown): TextureSamplerSettings["magFilter"] {
  return value === 9728 ? "nearest" : "linear";
}

function minFilter(value: unknown): TextureSamplerSettings["minFilter"] {
  switch (value) {
    case 9728:
      return "nearest";
    case 9729:
      return "linear";
    case 9984:
      return "nearest-mipmap-nearest";
    case 9985:
      return "linear-mipmap-nearest";
    case 9986:
      return "nearest-mipmap-linear";
    default:
      return "linear-mipmap-linear";
  }
}

function textureSourcePath(image: EmbeddedImage): string {
  return `assets/imported/textures/${image.hash.slice(0, 16)}/embedded.${image.extension === "jpeg" ? "jpg" : image.extension}`;
}

function detectImageFormat(
  bytes: Uint8Array,
  requestedMediaType?: string,
):
  | {
      mediaType: TextureImportMetadata["mimeType"];
      extension: TextureImportMetadata["sourceFormat"];
    }
  | undefined {
  if (hasBytes(bytes, [0x89, 0x50, 0x4e, 0x47])) {
    return { mediaType: "image/png", extension: "png" };
  }
  if (hasBytes(bytes, [0xff, 0xd8, 0xff])) {
    return { mediaType: "image/jpeg", extension: "jpeg" };
  }
  if (
    asciiAt(bytes, 0, "RIFF") &&
    asciiAt(bytes, 8, "WEBP")
  ) {
    return { mediaType: "image/webp", extension: "webp" };
  }
  if (
    hasBytes(bytes, [
      0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a,
      0x0a,
    ])
  ) {
    return { mediaType: "image/ktx2", extension: "ktx2" };
  }
  if (requestedMediaType === "image/png") {
    return { mediaType: "image/png", extension: "png" };
  }
  if (requestedMediaType === "image/jpeg") {
    return { mediaType: "image/jpeg", extension: "jpeg" };
  }
  if (requestedMediaType === "image/webp") {
    return { mediaType: "image/webp", extension: "webp" };
  }
  if (requestedMediaType === "image/ktx2") {
    return { mediaType: "image/ktx2", extension: "ktx2" };
  }
  return undefined;
}

function readImageDimensions(
  bytes: Uint8Array,
  format: TextureImportMetadata["sourceFormat"],
): { dimensions: { width: number; height: number } } | undefined {
  if (format === "png" && bytes.byteLength >= 24) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
      dimensions: {
        width: view.getUint32(16, false),
        height: view.getUint32(20, false),
      },
    };
  }
  if (format === "ktx2" && bytes.byteLength >= 28) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
      dimensions: {
        width: view.getUint32(20, true),
        height: view.getUint32(24, true),
      },
    };
  }
  return undefined;
}

function readGlbBinaryChunk(bytes: Uint8Array): Uint8Array | undefined {
  if (bytes.byteLength < 20) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const declaredLength = view.getUint32(8, true);
  let offset = 12;
  while (offset + 8 <= declaredLength && offset + 8 <= bytes.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = start + length;
    if (end > declaredLength || end > bytes.byteLength) return undefined;
    if (type === 0x004e4942) return bytes.slice(start, end);
    offset = end;
  }
  return undefined;
}

async function decodeDataUri(uri: string): Promise<Uint8Array> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error("data URIをデコードできませんでした");
  return new Uint8Array(await response.arrayBuffer());
}

function dataUriMediaType(uri: string): string | undefined {
  const match = /^data:([^;,]+)/i.exec(uri);
  return match?.[1]?.toLowerCase();
}

function alphaMode(value: unknown): MaterialAlphaMode {
  return value === "MASK" || value === "BLEND" ? value : "OPAQUE";
}

function colorTuple<const Length extends 3 | 4>(
  value: unknown,
  length: Length,
  fallback: Length extends 3 ? [number, number, number] : [number, number, number, number],
): Length extends 3 ? [number, number, number] : [number, number, number, number] {
  if (
    Array.isArray(value) &&
    value.length === length &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  ) {
    return value.map((entry) => Math.max(0, Math.min(1, Number(entry)))) as never;
  }
  return [...fallback] as never;
}

function numberTuple(
  value: unknown,
  length: 2,
  fallback: [number, number],
): [number, number] {
  return Array.isArray(value) &&
    value.length === length &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
    ? [Number(value[0]), Number(value[1])]
    : [...fallback];
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nonNegativeNumber(value: unknown, fallback: number): number {
  const number = finiteNumber(value, fallback);
  return number >= 0 ? number : fallback;
}

function unitNumber(value: unknown, fallback: number): number {
  return Math.max(0, Math.min(1, finiteNumber(value, fallback)));
}

function integerValue(value: unknown): number | undefined {
  return Number.isInteger(value) ? Number(value) : undefined;
}

function nonNegativeIntegerValue(value: unknown): number | undefined {
  const number = integerValue(value);
  return number !== undefined && number >= 0 ? number : undefined;
}

function objectValue(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function cleanName(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

function safeSegment(value: string): string {
  const normalized = value
    .trim()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized || "asset";
}

function hasBytes(bytes: Uint8Array, expected: readonly number[]): boolean {
  return expected.every((value, index) => bytes[index] === value);
}

function asciiAt(bytes: Uint8Array, offset: number, expected: string): boolean {
  return [...expected].every(
    (character, index) => bytes[offset + index] === character.charCodeAt(0),
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
