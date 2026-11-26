import {
  createDefaultMaterialAsset,
  type MaterialAsset,
} from "./asset-manifest";
import type {
  ClassicR3fMaterialShader,
  ClassicR3fShaderUniform,
} from "./custom-shader-contract";
import {
  FOLIAGE_FRAGMENT_SHADER,
  FOLIAGE_LEAVES_DEFINE,
  FOLIAGE_LEAVES_MESH_NAME,
  FOLIAGE_VERTEX_SHADER,
} from "./foliage-shader-core";
import { getFoliageTexture } from "./foliage-textures";

/**
 * The foliage Material: bark and wind-blown leaves for the bundled trees.
 *
 * It is an ordinary Custom Shader Material once it is in a project, so an
 * author can retint the leaves or still the sway in the Inspector. The trees
 * themselves are scene recipes (`scene-recipe-catalog.ts`); this is the
 * Material every one of them wears.
 */
export type FoliageShaderParameterGroup = "葉" | "樹皮" | "風" | "光";
export type FoliageShaderParameter = {
  uniform: string;
  label: string;
  hint: string;
  group: FoliageShaderParameterGroup;
} & (
  | { kind: "number"; min: number; max: number; step: number }
  | { kind: "color" }
);
export type FoliageShaderCatalogEntry = {
  id: string;
  label: string;
  description: string;
  notes: string;
  parameters: readonly FoliageShaderParameter[];
  shader: ClassicR3fMaterialShader;
};

export const FOLIAGE_SHADER_CATALOG_REVISION = "xrift-studio-foliage-shaders@1";
export const FOLIAGE_SHADER_CATALOG_SOURCE_URL = "https://github.com/WebXR-JP/xrift-studio";
export const FOLIAGE_SHADER_CATALOG_AUTHOR = "XRift Studio contributors";
export const FOLIAGE_SHADER_PROVIDER_ID = "xrift-foliage-shaders";

function number(
  uniform: string, label: string, hint: string, group: FoliageShaderParameterGroup,
  min: number, max: number, step: number,
): FoliageShaderParameter {
  return { uniform, label, hint, group, kind: "number", min, max, step };
}
function color(
  uniform: string, label: string, hint: string, group: FoliageShaderParameterGroup,
): FoliageShaderParameter {
  return { uniform, label, hint, group, kind: "color" };
}

const PARAMETERS: readonly FoliageShaderParameter[] = [
  color("uLeafTint", "葉の色み", "葉の画像に掛ける色です。白で画像の色のままになります。", "葉"),
  number("uColorVariation", "色のばらつき", "葉の束ごと、木ごとの色の違いです。0で全部同じ色になります。", "葉", 0, 1, 0.01),
  number("uAlphaCutoff", "切り抜きのしきい値", "葉の画像のAがこの値より小さい所を描きません。上げると葉が細くなります。", "葉", 0.05, 0.95, 0.01),
  number("uTranslucency", "透ける光", "太陽を背にした葉が明るく透ける強さです。", "葉", 0, 2, 0.01),
  number("uCrownShading", "茂みの丸み", "1に近いほど、茂み全体を丸い塊として陰影を付けます。0では板1枚ずつの向きで付けます。", "葉", 0, 1, 0.01),
  number("uInnerShade", "奥の暗さ", "茂みの奥にある葉と枝を暗くする強さです。", "葉", 0, 1, 0.01),
  color("uBarkTint", "樹皮の色み", "樹皮の画像に掛ける色です。白で画像の色のままになります。", "樹皮"),
  color("uMossColor", "苔の色", "上を向いた面と根元に付く苔の色です。", "樹皮"),
  number("uMoss", "苔の量", "0で苔が付きません。", "樹皮", 0, 1, 0.01),
  number("uBump", "樹皮の凹凸", "樹皮の画像のAに入っている高さから付ける凹凸の強さです。", "樹皮", 0, 3, 0.01),
  number("uSway", "枝の揺れ", "シーンの風に対する、幹と枝の揺れの倍率です。葉も同じ値で揺れるので、枝から離れません。", "風", 0, 3, 0.01),
  number("uFlutter", "葉のそよぎ", "シーンの風に対する、葉1束ごとのそよぎの倍率です。", "風", 0, 3, 0.01),
  number("uFill", "空からの光", "ライトや環境光がないシーンでも木が真っ黒にならないように足す光です。", "光", 0, 1, 0.01),
];

function texture(key: "leaves" | "bark"): ClassicR3fShaderUniform {
  return {
    kind: "texture",
    textureAssetId: getFoliageTexture(key).assetId,
    colorSpace: "srgb",
    // A leaf cut-out and a tiling bark both shimmer at a distance unless the
    // picture is read at the size it is drawn.
    generateMipmaps: true,
    filter: "linear",
    // A trunk and a card are mostly seen at a slant, where mip levels alone
    // turn the picture to mush.
    anisotropy: 4,
    wrapS: "repeat",
    wrapT: "repeat",
  };
}

const UNIFORMS: Record<string, ClassicR3fShaderUniform> = {
  // Driven by the Scene: the clock, the wind contract and the lighting
  // contract. The values here are what a preview without a Scene draws with.
  uTime: { kind: "number", value: 0 },
  uWindDirection: { kind: "vector", value: [1, 0] },
  uWindSpeed: { kind: "number", value: 0.8 },
  uWindTurbulence: { kind: "number", value: 0.35 },
  uSunDirection: { kind: "vector", value: [0.45, 0.8, 0.4] },
  uSunColor: { kind: "color", value: "#fff4e3" },
  uSunIntensity: { kind: "number", value: 3 },
  uAmbientColor: { kind: "color", value: "#ffffff" },
  uAmbientIntensity: { kind: "number", value: 0.6 },
  uLeafMap: texture("leaves"),
  uBarkMap: texture("bark"),
  uLeafTint: { kind: "color", value: "#ffffff" },
  uColorVariation: { kind: "number", value: 1 },
  uAlphaCutoff: { kind: "number", value: 0.5 },
  uTranslucency: { kind: "number", value: 0.9 },
  uCrownShading: { kind: "number", value: 0.6 },
  uInnerShade: { kind: "number", value: 0.78 },
  uBarkTint: { kind: "color", value: "#ffffff" },
  uMossColor: { kind: "color", value: "#55682b" },
  uMoss: { kind: "number", value: 0.85 },
  uBump: { kind: "number", value: 1 },
  uSway: { kind: "number", value: 1 },
  uFlutter: { kind: "number", value: 1 },
  uFill: { kind: "number", value: 0.12 },
};

export const FOLIAGE_SHADER_CATALOG: readonly FoliageShaderCatalogEntry[] = [
  {
    id: "broadleaf",
    label: "広葉樹の葉と樹皮",
    description:
      "同梱の木のモデルに着ける、樹皮と葉のマテリアルです。葉はシーンの風にそよぎ、太陽を背にすると明るく透けます。",
    notes:
      "同梱の木のモデル専用です。モデルの頂点に入っている、茂みの形と葉の付け根の情報を読みます。ほかのモデルに着けても正しく描けません。",
    parameters: PARAMETERS,
    shader: {
      kind: "classic-r3f",
      sourceModulePath: "studio://foliage-shader/broadleaf",
      vertexShader: FOLIAGE_VERTEX_SHADER,
      fragmentShader: FOLIAGE_FRAGMENT_SHADER,
      uniforms: UNIFORMS,
      variants: [
        // The fallback is the bark: any mesh that is not named as leaves.
        { name: "bark", defines: {}, side: "front", transparent: false, depthWrite: true },
        {
          name: "leaves",
          meshNameIncludes: FOLIAGE_LEAVES_MESH_NAME,
          defines: { [FOLIAGE_LEAVES_DEFINE]: "1" },
          // A leaf card is seen from both of its faces.
          side: "double",
          transparent: false,
          depthWrite: true,
        },
      ],
      animatedTimeUniform: "uTime",
    },
  },
];

/** The Material Asset id a recipe names to put this Material on a tree. */
export function foliageMaterialAssetId(entryId: string): string {
  return `foliage-shader-${entryId}-material`;
}

export const FOLIAGE_BROADLEAF_MATERIAL_ASSET_ID = foliageMaterialAssetId("broadleaf");

function createFoliageMaterialAsset(entry: FoliageShaderCatalogEntry): MaterialAsset {
  const material = createDefaultMaterialAsset({
    id: foliageMaterialAssetId(entry.id),
    name: entry.label,
    folderId: null,
  });
  if (!material) throw new Error(`Foliage Material could not be created: ${entry.id}`);
  return {
    ...material,
    // A deep copy: the Material in a project is the author's to edit, and an
    // edit must not reach the catalog or another project.
    shader: structuredClone(entry.shader) as ClassicR3fMaterialShader,
    attribution: {
      providerId: FOLIAGE_SHADER_PROVIDER_ID,
      providerName: "XRift公式 草木シェーダー",
      externalId: entry.id,
      assetUrl: FOLIAGE_SHADER_CATALOG_SOURCE_URL,
      licenseName: "MIT",
      licenseUrl: `${FOLIAGE_SHADER_CATALOG_SOURCE_URL}/blob/main/LICENSE`,
      authors: [FOLIAGE_SHADER_CATALOG_AUTHOR],
    },
    sourceHash: `${FOLIAGE_SHADER_CATALOG_REVISION}:${entry.id}`,
  };
}

/**
 * The foliage Material with this Asset id, built on demand.
 *
 * Resolvable by id but absent from the seed list, like the showcase
 * Materials: a project gets it when a tree is placed and not before.
 */
export function getFoliageMaterialAsset(assetId: string): MaterialAsset | undefined {
  const entry = FOLIAGE_SHADER_CATALOG.find(
    (candidate) => foliageMaterialAssetId(candidate.id) === assetId,
  );
  return entry ? createFoliageMaterialAsset(entry) : undefined;
}
