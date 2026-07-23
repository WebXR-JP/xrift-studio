import {
  OPEN_BRUSH_BRUSH_BASE_URL,
  OPEN_BRUSH_RENDERER,
  type OpenBrushMaterialShader,
} from "./open-brush";
import { openBrushCatalogThumbnailUrl } from "./catalog-thumbnails";

export type OpenBrushCatalogCategory =
  | "paint"
  | "light"
  | "effect"
  | "geometry";

export type OpenBrushCatalogEntry = {
  id: string;
  label: string;
  brushName: string;
  brushGuid: string;
  sourceMaterialIndex: number;
  sourceNodeName: string;
  category: OpenBrushCatalogCategory;
  description: string;
  thumbnailUrl: string;
  shader: OpenBrushMaterialShader;
};

export const OPEN_BRUSH_CATALOG_SOURCE_URL =
  "https://github.com/icosa-foundation/three-icosa/tree/1868251fbc9dbbfacf2230839d3d184fda8b4a63/examples";
export const OPEN_BRUSH_CATALOG_LICENSE_URL =
  "https://github.com/icosa-foundation/three-icosa/blob/1868251fbc9dbbfacf2230839d3d184fda8b4a63/LICENSE";
export const OPEN_BRUSH_CATALOG_GALLERY_URL =
  "/visual-editor/starter-assets/openbrush-all-brushes.glb";
export const OPEN_BRUSH_CATALOG_REVISION =
  "three-icosa@1868251fbc9dbbfacf2230839d3d184fda8b4a63";

const BRUSHES = [
  ["OilPaint", "f72ec0e7-a844-4e38-82e3-140c44772699"],
  ["Ink", "f5c336cf-5108-4b40-ade9-c687504385ab"],
  ["ThickPaint", "75b32cf0-fdd6-4d89-a64b-e2a00b247b0f"],
  ["WetPaint", "b67c0e81-ce6d-40a8-aeb0-ef036b081aa3"],
  ["Marker", "429ed64a-4e97-4466-84d3-145a861ef684"],
  ["TaperedMarker", "d90c6ad8-af0f-4b54-b422-e0f92abe1b3c"],
  ["DoubleTaperedMarker", "0d3889f3-3ede-470c-8af4-de4813306126"],
  ["Highlighter", "cf019139-d41c-4eb0-a1d0-5cf54b0a42f3"],
  ["Flat", "2d35bcf0-e4d8-452c-97b1-3311be063130"],
  ["TaperedFlat", "b468c1fb-f254-41ed-8ec9-57030bc5660c"],
  ["DoubleTaperedFlat", "0d3889f3-3ede-470c-8af4-f44813306126"],
  ["SoftHighlighter", "accb32f5-4509-454f-93f8-1df3fd31df1b"],
  ["Light", "2241cd32-8ba2-48a5-9ee7-2caef7e9ed62"],
  ["Fire", "cb92b597-94ca-4255-b017-0e3f42f12f9e"],
  ["Embers", "02ffb866-7fb2-4d15-b761-1012cefb1360"],
  ["Smoke", "70d79cca-b159-4f35-990c-f02193947fe8"],
  ["Rainbow", "ad1ad437-76e2-450d-a23a-e17f8310b960"],
  ["Stars", "0eb4db27-3f82-408d-b5a1-19ebd7d5b711"],
  ["VelvetInk", "d229d335-c334-495a-a801-660ac8a87360"],
  ["Waveform", "10201aa3-ebc2-42d8-84b7-2e63f6eeb8ab"],
  ["Splatter", "8dc4a70c-d558-4efd-a5ed-d4e860f40dc3"],
  ["DuctTape", "d0262945-853c-4481-9cbd-88586bed93cb"],
  ["Paper", "f1114e2e-eb8d-4fde-915a-6e653b54e9f5"],
  ["Snow", "d902ed8b-d0d1-476c-a8de-878a79e3a34c"],
  ["CoarseBristles", "1161af82-50cf-47db-9706-0c3576d43c43"],
  ["WigglyGraphite", "5347acf0-a8e2-47b6-8346-30c70719d763"],
  ["Electricity", "f6e85de3-6dcc-4e7f-87fd-cee8c3d25d51"],
  ["Streamers", "44bb800a-fbc3-4592-8426-94ecb05ddec3"],
  ["Hypercolor", "dce872c2-7b49-4684-b59b-c45387949c5c"],
  ["Bubbles", "89d104cd-d012-426b-b5b3-bbaee63ac43c"],
  ["NeonPulse", "b2ffef01-eaaa-4ab5-aa64-95a2c4f5dbc6"],
  ["CelVinyl", "700f3aa8-9a7c-2384-8b8a-ea028905dd8c"],
  ["HyperGrid", "6a1cf9f9-032c-45ec-9b6e-a6680bee32e9"],
  ["LightWire", "4391aaaa-df81-4396-9e33-31e4e4930b27"],
  ["ChromaticWave", "0f0ff7b2-a677-45eb-a7d6-0cd7206f4816"],
  ["Dots", "6a1cf9f9-032c-45ec-9b1d-a6680bee30f7"],
  ["Petal", "e0abbc80-0f80-e854-4970-8924a0863dcc"],
  ["Icing", "2f212815-f4d3-c1a4-681a-feeaf9c6dc37"],
  ["Toon", "4391385a-df73-4396-9e33-31e4e4930b27"],
  ["Wire", "4391385a-cf83-4396-9e33-31e4e4930b27"],
  ["Spikes", "cf7f0059-7aeb-53a4-2b67-c83d863a9ffa"],
  ["Lofted", "d381e0f5-3def-4a0d-8853-31e9200bcbda"],
  ["Disco", "4391aaaa-df73-4396-9e33-31e4e4930b27"],
  ["Comet", "1caa6d7d-f015-3f54-3a4b-8b5354d39f81"],
  ["ShinyHull", "faaa4d44-fcfb-4177-96be-753ac0421ba3"],
  ["MatteHull", "79348357-432d-4746-8e29-0e25c112e3aa"],
  ["UnlitHull", "a8fea537-da7c-4d4b-817f-24f074725d6d"],
  ["DiamondHull", "c8313697-2563-47fc-832e-290f4c04b901"],
] as const;

export const OPEN_BRUSH_CATALOG: readonly OpenBrushCatalogEntry[] = BRUSHES.map(
  ([brushName, brushGuid], sourceMaterialIndex) => {
    const category = categoryForIndex(sourceMaterialIndex);
    return {
      id: brushGuid,
      label: humanizeBrushName(brushName),
      brushName,
      brushGuid,
      sourceMaterialIndex,
      sourceNodeName: `brush_${brushName}_g0_b0`,
      category,
      description: `${openBrushCategoryLabel(category)}向けのOpen Brush公式ブラシです。専用shaderと実ストローク形状を保持します。`,
      thumbnailUrl: openBrushCatalogThumbnailUrl(brushGuid),
      shader: {
        kind: "openbrush",
        renderer: "three-icosa",
        rendererVersion: OPEN_BRUSH_RENDERER,
        brushName,
        brushGuid,
        brushBaseUrl: OPEN_BRUSH_BRUSH_BASE_URL,
        sourceMaterialIndex,
      },
    };
  },
);

export function openBrushCategoryLabel(
  category: OpenBrushCatalogCategory,
): string {
  if (category === "paint") return "ペイント";
  if (category === "light") return "光・ボリューム";
  if (category === "effect") return "エフェクト";
  return "立体・Hull";
}

function categoryForIndex(index: number): OpenBrushCatalogCategory {
  if (index <= 11) return "paint";
  if (index <= 19) return "light";
  if (index <= 37) return "effect";
  return "geometry";
}

function humanizeBrushName(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");
}
