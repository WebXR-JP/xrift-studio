import type { ExternalStoreAssetKind } from "../tauri";

/**
 * Sidebar sections for the external resource dialog. Providers are grouped by
 * what the user is trying to add, not by where the data comes from — the
 * badge and the detail pane carry license and origin.
 */
export const EXTERNAL_STORE_PROVIDER_GROUPS = [
  { id: "material-sites", label: "素材サイト" },
  { id: "sky-nature", label: "空と自然" },
  { id: "light-decoration", label: "光と演出" },
  { id: "world-features", label: "ワールド機能" },
] as const;

export type ExternalStoreProviderGroupId =
  (typeof EXTERNAL_STORE_PROVIDER_GROUPS)[number]["id"];

export type ExternalStoreProvider = {
  id: string;
  kind:
    | "remote-assets"
    | "open-brush"
    | "xrift-components"
    | "sky-shader"
    | "water-shader"
    | "terrain-preset"
    | "glow-material"
    | "particle-preset"
    | "scene-recipe";
  group: ExternalStoreProviderGroupId;
  name: string;
  badge: string;
  summary: string;
  homepageUrl: string;
  catalogKinds: readonly ExternalStoreAssetKind[];
  installableKinds: readonly ExternalStoreAssetKind[];
  authorFallback: string;
  attributionNote: string;
};

export const EXTERNAL_STORE_PROVIDERS = [
  {
    id: "poly-haven",
    kind: "remote-assets",
    group: "material-sites",
    name: "Poly Haven",
    badge: "CC0",
    summary: "空のHDRI・質感・小物モデルを探して追加",
    homepageUrl: "https://polyhaven.com",
    catalogKinds: ["hdri", "texture", "model"],
    installableKinds: ["hdri", "texture", "model"],
    authorFallback: "Poly Haven contributors",
    attributionNote: "API提供元を明示し、アセットにはCC0情報を保存します。",
  },
  {
    id: "ambient-cg",
    kind: "remote-assets",
    group: "material-sites",
    name: "ambientCG",
    badge: "CC0",
    summary: "床や壁の質感とHDRIを探して追加",
    homepageUrl: "https://ambientcg.com",
    catalogKinds: ["hdri", "texture", "model"],
    installableKinds: ["hdri", "texture"],
    authorFallback: "ambientCG contributors",
    attributionNote: "API提供元を明示し、アセットにはCC0情報を保存します。ModelはglTF対応後にインストールできます。",
  },
  {
    id: "otogura",
    kind: "remote-assets",
    group: "material-sites",
    name: "音蔵",
    badge: "フリー",
    summary: "効果音と環境音を探して追加",
    homepageUrl: "https://yushimatenjin.github.io/sound-generator/",
    catalogKinds: ["audio"],
    installableKinds: ["audio"],
    authorFallback: "音蔵 (おとぐら)",
    attributionNote:
      "Stable Audio 3 でローカル生成した音源です。ループ環境音は継ぎ目が出ないよう加工済みで、商用・改変を含め自由に使えます。",
  },
  {
    id: "xrift-sky-shaders",
    kind: "sky-shader",
    group: "sky-nature",
    name: "Skybox Shader",
    badge: "公式",
    summary: "星空や夕焼けの空を追加",
    homepageUrl: "https://github.com/WebXR-JP/xrift-studio",
    catalogKinds: [],
    installableKinds: [],
    authorFallback: "XRift Studio contributors",
    attributionNote:
      "画像ではなくGLSLで空を描くMaterialです。追加後もInspectorでuniformを編集できます。",
  },
  {
    id: "xrift-water-shaders",
    kind: "water-shader",
    group: "sky-nature",
    name: "Water Shader",
    badge: "公式",
    summary: "湖・海・セルルックの水面を追加",
    homepageUrl: "https://github.com/WebXR-JP/xrift-studio",
    catalogKinds: [],
    installableKinds: [],
    authorFallback: "XRift Studio contributors",
    attributionNote:
      "Gerstner波はMochie's Unity Shaders (MIT) を移植しています。波はScene設定のWindから駆動します。",
  },
  {
    id: "xrift-terrain-presets",
    kind: "terrain-preset",
    group: "sky-nature",
    name: "Terrain",
    badge: "公式",
    summary: "起伏と草の入った地形を追加",
    homepageUrl: "https://github.com/WebXR-JP/xrift-studio",
    catalogKinds: [],
    installableKinds: [],
    authorFallback: "XRift Studio contributors",
    attributionNote:
      "高さフィールドと草の配置規則から生成します。追加後は普通のTerrainとして彫れます。",
  },
  {
    id: "xrift-glow-materials",
    kind: "glow-material",
    group: "light-decoration",
    name: "発光オブジェクト",
    badge: "公式",
    summary: "ネオンのようにBloomで光る形を追加",
    homepageUrl: "https://github.com/WebXR-JP/xrift-studio",
    catalogKinds: [],
    installableKinds: [],
    authorFallback: "XRift Studio contributors",
    attributionNote:
      "発光するPBR Materialです。Scene設定のBloomが拾う明るさで置きます。形と色は別に選べます。",
  },
  {
    id: "xrift-particle-presets",
    kind: "particle-preset",
    group: "light-decoration",
    name: "Particle",
    badge: "公式",
    summary: "炎・雪・桜などのエフェクトを追加",
    homepageUrl: "https://github.com/WebXR-JP/xrift-studio",
    catalogKinds: [],
    installableKinds: [],
    authorFallback: "XRift Studio contributors",
    attributionNote:
      "追加後は普通のParticle Assetです。放出量、寿命、色、TextureをそのままInspectorで変えられます。",
  },
  {
    id: "xrift-scene-recipes",
    kind: "scene-recipe",
    group: "light-decoration",
    name: "3Dセット",
    badge: "公式",
    summary: "焚き火・家具など置くだけの3Dを追加",
    homepageUrl: "https://github.com/WebXR-JP/xrift-studio",
    catalogKinds: [],
    installableKinds: [],
    authorFallback: "XRift Studio contributors",
    attributionNote:
      "既存のPrimitive、Particle、Lightを組み合わせたEntityです。置いたあとは中身を1つずつ編集できます。",
  },
  {
    id: "open-brush",
    kind: "open-brush",
    group: "light-decoration",
    name: "Open Brush",
    badge: "公式",
    summary: "手描き風ブラシのMaterialを追加",
    homepageUrl: "https://openbrush.app",
    catalogKinds: [],
    installableKinds: [],
    authorFallback: "Icosa Foundation contributors",
    attributionNote: "検証済みのbrush GUIDとrenderer versionをMaterialへ保存します。",
  },
  {
    id: "xrift-components",
    kind: "xrift-components",
    group: "world-features",
    name: "Component",
    badge: "公式",
    summary: "Portal・Mirrorなどの機能を追加",
    homepageUrl: "https://github.com/WebXR-JP/xrift",
    catalogKinds: [],
    installableKinds: [],
    authorFallback: "WebXR-JP contributors",
    attributionNote: "公開package本体を同じrendererで描画します。",
  },
] as const satisfies readonly ExternalStoreProvider[];

export const DEFAULT_EXTERNAL_STORE_PROVIDER_ID = EXTERNAL_STORE_PROVIDERS[0].id;

export function getExternalStoreProvider(providerId: string): ExternalStoreProvider {
  return EXTERNAL_STORE_PROVIDERS.find((provider) => provider.id === providerId)
    ?? EXTERNAL_STORE_PROVIDERS[0];
}
