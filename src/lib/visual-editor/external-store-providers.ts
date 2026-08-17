import type { ExternalStoreAssetKind } from "../tauri";

export type ExternalStoreProvider = {
  id: string;
  kind:
    | "remote-assets"
    | "open-brush"
    | "xrift-components"
    | "sky-shader"
    | "water-shader";
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
    name: "Poly Haven",
    badge: "CC0",
    summary: "HDRI・マテリアル・モデルを探す",
    homepageUrl: "https://polyhaven.com",
    catalogKinds: ["hdri", "texture", "model"],
    installableKinds: ["hdri", "texture", "model"],
    authorFallback: "Poly Haven contributors",
    attributionNote: "API提供元を明示し、アセットにはCC0情報を保存します。",
  },
  {
    id: "ambient-cg",
    kind: "remote-assets",
    name: "ambientCG",
    badge: "CC0",
    summary: "HDRI・マテリアルを追加、モデルを探す",
    homepageUrl: "https://ambientcg.com",
    catalogKinds: ["hdri", "texture", "model"],
    installableKinds: ["hdri", "texture"],
    authorFallback: "ambientCG contributors",
    attributionNote: "API提供元を明示し、アセットにはCC0情報を保存します。ModelはglTF対応後にインストールできます。",
  },
  {
    id: "open-brush",
    kind: "open-brush",
    name: "Open Brush",
    badge: "Official",
    summary: "公式ブラシMaterialを追加",
    homepageUrl: "https://openbrush.app",
    catalogKinds: [],
    installableKinds: [],
    authorFallback: "Icosa Foundation contributors",
    attributionNote: "検証済みのbrush GUIDとrenderer versionをMaterialへ保存します。",
  },
  {
    id: "xrift-sky-shaders",
    kind: "sky-shader",
    name: "空 Shader",
    badge: "Official",
    summary: "星空などの空Shaderを追加",
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
    name: "Water Shader",
    badge: "Official",
    summary: "湖・海・セルルックの水を追加",
    homepageUrl: "https://github.com/WebXR-JP/xrift-studio",
    catalogKinds: [],
    installableKinds: [],
    authorFallback: "XRift Studio contributors",
    attributionNote:
      "Gerstner波はMochie's Unity Shaders (MIT) を移植しています。波はScene設定のWindから駆動します。",
  },
  {
    id: "xrift-components",
    kind: "xrift-components",
    name: "XRift公式 Component",
    badge: "Official",
    summary: "公式Component一覧から追加",
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
