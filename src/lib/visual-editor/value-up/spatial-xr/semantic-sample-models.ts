import type { SemanticPrefabCandidate } from "./semantic-prefab-resolver";

export type SpatialSemanticSampleModel = SemanticPrefabCandidate & { modelId: string; assetId: string; publicPath: string; fileName: string; sha256: string; byteLength: number; displayName: string; approxRadius: number; bounds: { min: readonly [number, number, number]; max: readonly [number, number, number] }; provenance: string; };

const provenance = "XRift Studio project-owned semantic sample GLB generated for Quest/WebXR Scene Understanding fallback. Captured scene geometry remains preferred when available.";

export const SPATIAL_SEMANTIC_SAMPLE_MODELS: readonly SpatialSemanticSampleModel[] = [
  {
    id: "spatial-sample.ceiling", modelId: "spatial-sample.ceiling", assetId: "model-ceiling-1950951f0087", name: "天井", displayName: "天井",
    semanticLabels: ["CEILING", "ceiling"], nominalSize: [4.0, 0.03, 4.0], styleTags: ["spatial", "quest", "semantic-sample"],
    publicPath: "/visual-editor/spatial-samples/ceiling.glb", fileName: "ceiling.glb", sha256: "1950951f00873005e113cbcca8eca64b380cca39797cfa19d187eff138f388ac", byteLength: 1492, approxRadius: 2.0,
    bounds: { min: [-2.0, 0, -2.0], max: [2.0, 0.03, 2.0] }, provenance,
  },
  {
    id: "spatial-sample.door-frame", modelId: "spatial-sample.door-frame", assetId: "model-door-frame-1a3563725cef", name: "ドア枠", displayName: "ドア枠",
    semanticLabels: ["DOOR_FRAME", "door"], nominalSize: [1.0, 2.1, 0.12], styleTags: ["spatial", "quest", "semantic-sample"],
    publicPath: "/visual-editor/spatial-samples/door-frame.glb", fileName: "door-frame.glb", sha256: "1a3563725cefd39584d82a2a6810fca65b8c74083d5b140123e3b9fe2be4e170", byteLength: 2380, approxRadius: 1.05,
    bounds: { min: [-0.5, 0, -0.06], max: [0.5, 2.1, 0.06] }, provenance,
  },
  {
    id: "spatial-sample.floor", modelId: "spatial-sample.floor", assetId: "model-floor-52beb7a94074", name: "床", displayName: "床",
    semanticLabels: ["FLOOR", "floor"], nominalSize: [4.0, 0.03, 4.0], styleTags: ["spatial", "quest", "semantic-sample"],
    publicPath: "/visual-editor/spatial-samples/floor.glb", fileName: "floor.glb", sha256: "52beb7a940742463af002d0c685ef25f7931d713b7d4ac386ca2651ac6b41ce4", byteLength: 1484, approxRadius: 2.0,
    bounds: { min: [-2.0, 0, -2.0], max: [2.0, 0.03, 2.0] }, provenance,
  },
  {
    id: "spatial-sample.invisible-wall-face", modelId: "spatial-sample.invisible-wall-face", assetId: "model-invisible-wall-face-85fbf45d0d25", name: "不可視壁", displayName: "不可視壁",
    semanticLabels: ["INVISIBLE_WALL_FACE", "invisible-wall"], nominalSize: [4.0, 2.5, 0.03], styleTags: ["spatial", "quest", "semantic-sample"],
    publicPath: "/visual-editor/spatial-samples/invisible-wall-face.glb", fileName: "invisible-wall-face.glb", sha256: "85fbf45d0d25f6b11218145c20e2050ed91799e94a1f1435645e26b30f856476", byteLength: 1552, approxRadius: 2.0,
    bounds: { min: [-2.0, 0, -0.015], max: [2.0, 2.5, 0.015] }, provenance,
  },
  {
    id: "spatial-sample.wall-art", modelId: "spatial-sample.wall-art", assetId: "model-wall-art-0c8335448d76", name: "壁面アート", displayName: "壁面アート",
    semanticLabels: ["WALL_ART", "wall-art"], nominalSize: [1.2, 0.8, 0.05], styleTags: ["spatial", "quest", "semantic-sample"],
    publicPath: "/visual-editor/spatial-samples/wall-art.glb", fileName: "wall-art.glb", sha256: "0c8335448d7669a566e9f367922e3653411963d0a049b676cb8c4a4ac616e305", byteLength: 1552, approxRadius: 0.6,
    bounds: { min: [-0.6, 0, -0.025], max: [0.6, 0.8, 0.025] }, provenance,
  },
  {
    id: "spatial-sample.wall-face", modelId: "spatial-sample.wall-face", assetId: "model-wall-face-adcec0f59742", name: "壁", displayName: "壁",
    semanticLabels: ["WALL_FACE", "wall"], nominalSize: [4.0, 2.5, 0.03], styleTags: ["spatial", "quest", "semantic-sample"],
    publicPath: "/visual-editor/spatial-samples/wall-face.glb", fileName: "wall-face.glb", sha256: "adcec0f5974232976f644b53fcf5e924ae0605ca10363405a5b609a411bb8b3a", byteLength: 1504, approxRadius: 2.0,
    bounds: { min: [-2.0, 0, -0.015], max: [2.0, 2.5, 0.015] }, provenance,
  },
  {
    id: "spatial-sample.window-frame", modelId: "spatial-sample.window-frame", assetId: "model-window-frame-dfada3bbdfc8", name: "窓枠", displayName: "窓枠",
    semanticLabels: ["WINDOW_FRAME", "window"], nominalSize: [1.4, 1.2, 0.1], styleTags: ["spatial", "quest", "semantic-sample"],
    publicPath: "/visual-editor/spatial-samples/window-frame.glb", fileName: "window-frame.glb", sha256: "dfada3bbdfc807f72a7ace796d77f367231ab5b2f5ba97fd08b67fad2558dbd4", byteLength: 2688, approxRadius: 0.7,
    bounds: { min: [-0.7, 0, -0.05], max: [0.7, 1.2, 0.05] }, provenance,
  },
  {
    id: "spatial-sample.couch", modelId: "spatial-sample.couch", assetId: "model-couch-787acedb8e37", name: "ソファ", displayName: "ソファ",
    semanticLabels: ["COUCH", "couch"], nominalSize: [2.0, 0.9, 0.85], styleTags: ["spatial", "quest", "semantic-sample"],
    publicPath: "/visual-editor/spatial-samples/couch.glb", fileName: "couch.glb", sha256: "787acedb8e37e960d2c87e67b71d0ff1860dd0bbc16d269ea11b18ccf696de80", byteLength: 2956, approxRadius: 1.0,
    bounds: { min: [-1.0, 0, -0.425], max: [1.0, 0.9, 0.425] }, provenance,
  },
  {
    id: "spatial-sample.table", modelId: "spatial-sample.table", assetId: "model-table-fad417ecae38", name: "テーブル", displayName: "テーブル",
    semanticLabels: ["TABLE", "table"], nominalSize: [1.4, 0.75, 0.8], styleTags: ["spatial", "quest", "semantic-sample"],
    publicPath: "/visual-editor/spatial-samples/table.glb", fileName: "table.glb", sha256: "fad417ecae38afce149dd1123f137c3cb4132f7d18eb74c43ca8f8f33abd2a04", byteLength: 2992, approxRadius: 0.7,
    bounds: { min: [-0.7, 0, -0.4], max: [0.7, 0.75, 0.4] }, provenance,
  },
  {
    id: "spatial-sample.bed", modelId: "spatial-sample.bed", assetId: "model-bed-cf43958591e9", name: "ベッド", displayName: "ベッド",
    semanticLabels: ["BED", "bed"], nominalSize: [2.0, 0.55, 1.4], styleTags: ["spatial", "quest", "semantic-sample"],
    publicPath: "/visual-editor/spatial-samples/bed.glb", fileName: "bed.glb", sha256: "cf43958591e965e8619a5f678fb355b6b05073adc8afc06d64bc1d8ab8e396dd", byteLength: 2284, approxRadius: 1.0,
    bounds: { min: [-1.0, 0, -0.7], max: [1.0, 0.55, 0.7] }, provenance,
  },
  {
    id: "spatial-sample.lamp", modelId: "spatial-sample.lamp", assetId: "model-lamp-24d3e80310e0", name: "ランプ", displayName: "ランプ",
    semanticLabels: ["LAMP", "lamp"], nominalSize: [0.45, 1.6, 0.45], styleTags: ["spatial", "quest", "semantic-sample"],
    publicPath: "/visual-editor/spatial-samples/lamp.glb", fileName: "lamp.glb", sha256: "24d3e80310e033409519a897da983040b9a75a790a3c56b55ee0b3a105af1c41", byteLength: 6252, approxRadius: 0.8,
    bounds: { min: [-0.225, 0, -0.225], max: [0.225, 1.6, 0.225] }, provenance,
  },
  {
    id: "spatial-sample.plant", modelId: "spatial-sample.plant", assetId: "model-plant-495649c620fa", name: "植物", displayName: "植物",
    semanticLabels: ["PLANT", "plant"], nominalSize: [0.65, 1.2, 0.65], styleTags: ["spatial", "quest", "semantic-sample"],
    publicPath: "/visual-editor/spatial-samples/plant.glb", fileName: "plant.glb", sha256: "495649c620fa5b9ed6746a902a9cd9802cf8b4287c7e01ba42daf7c9cb4e31b6", byteLength: 17100, approxRadius: 0.6,
    bounds: { min: [-0.325, 0, -0.325], max: [0.325, 1.2, 0.325] }, provenance,
  },
  {
    id: "spatial-sample.screen", modelId: "spatial-sample.screen", assetId: "model-screen-f08c48fa306a", name: "スクリーン", displayName: "スクリーン",
    semanticLabels: ["SCREEN", "screen"], nominalSize: [1.4, 0.85, 0.08], styleTags: ["spatial", "quest", "semantic-sample"],
    publicPath: "/visual-editor/spatial-samples/screen.glb", fileName: "screen.glb", sha256: "f08c48fa306a4aecf9d7eb83b8e9304e43e37a5da95eda792963f338e7c87f52", byteLength: 1544, approxRadius: 0.7,
    bounds: { min: [-0.7, 0, -0.04], max: [0.7, 0.85, 0.04] }, provenance,
  },
  {
    id: "spatial-sample.storage", modelId: "spatial-sample.storage", assetId: "model-storage-b0d05abf8dbb", name: "収納", displayName: "収納",
    semanticLabels: ["STORAGE", "storage"], nominalSize: [1.2, 1.8, 0.5], styleTags: ["spatial", "quest", "semantic-sample"],
    publicPath: "/visual-editor/spatial-samples/storage.glb", fileName: "storage.glb", sha256: "b0d05abf8dbbbf50719b054070c832f0a889af0b1608153e2a43c7119a351987", byteLength: 2836, approxRadius: 0.9,
    bounds: { min: [-0.6, 0, -0.25], max: [0.6, 1.8, 0.25] }, provenance,
  },
  {
    id: "spatial-sample.global-mesh", modelId: "spatial-sample.global-mesh", assetId: "model-global-mesh-abe1c69c65c0", name: "ルームメッシュ", displayName: "ルームメッシュ",
    semanticLabels: ["GLOBAL_MESH", "global-mesh"], nominalSize: [4.0, 2.5, 4.0], styleTags: ["spatial", "quest", "semantic-sample"],
    publicPath: "/visual-editor/spatial-samples/global-mesh.glb", fileName: "global-mesh.glb", sha256: "abe1c69c65c01b94c903c0733c22dc7c6f60c4638d2585b02197819be36b1baa", byteLength: 3104, approxRadius: 2.0,
    bounds: { min: [-2.0, 0, -2.0], max: [2.0, 2.5, 2.0] }, provenance,
  },
  {
    id: "spatial-sample.other", modelId: "spatial-sample.other", assetId: "model-other-4dacde59962b", name: "その他の物体", displayName: "その他の物体",
    semanticLabels: ["OTHER", "other"], nominalSize: [0.8, 0.8, 0.8], styleTags: ["spatial", "quest", "semantic-sample"],
    publicPath: "/visual-editor/spatial-samples/other.glb", fileName: "other.glb", sha256: "4dacde59962b792bc730c637e1a9e846a9bffcb0a53e3d9c053bd2ff797b053a", byteLength: 1532, approxRadius: 0.4,
    bounds: { min: [-0.4, 0, -0.4], max: [0.4, 0.8, 0.4] }, provenance,
  },
  {
    id: "spatial-sample.desk", modelId: "spatial-sample.desk", assetId: "model-desk-9739eec13b91", name: "デスク", displayName: "デスク",
    semanticLabels: ["DESK", "desk"], nominalSize: [1.4, 0.75, 0.7], styleTags: ["spatial", "quest", "semantic-sample"],
    publicPath: "/visual-editor/spatial-samples/desk.glb", fileName: "desk.glb", sha256: "9739eec13b91b1a8dd5315d0a94f9a6a3fcef41a542fa98f84a6a2a6258281b3", byteLength: 3044, approxRadius: 0.7,
    bounds: { min: [-0.7, 0, -0.35], max: [0.7, 0.75, 0.35] }, provenance,
  },
  {
    id: "spatial-sample.chair", modelId: "spatial-sample.chair", assetId: "model-chair-62cc696f80ad", name: "椅子", displayName: "椅子",
    semanticLabels: ["CHAIR", "chair"], nominalSize: [0.55, 0.9, 0.55], styleTags: ["spatial", "quest", "semantic-sample"],
    publicPath: "/visual-editor/spatial-samples/chair.glb", fileName: "chair.glb", sha256: "62cc696f80adc4a5102a1e90d0e834ae5b45ecd37b68f8538406f33370b931f9", byteLength: 3616, approxRadius: 0.45,
    bounds: { min: [-0.275, 0, -0.275], max: [0.275, 0.9, 0.275] }, provenance,
  },
  {
    id: "spatial-sample.opening", modelId: "spatial-sample.opening", assetId: "model-opening-f5720608c3d2", name: "開口部", displayName: "開口部",
    semanticLabels: ["OPENING", "opening"], nominalSize: [1.2, 2.1, 0.03], styleTags: ["spatial", "quest", "semantic-sample"],
    publicPath: "/visual-editor/spatial-samples/opening.glb", fileName: "opening.glb", sha256: "f5720608c3d20777bc90804d1cc1b610f4968d889e8ba946dc2be63359d75b97", byteLength: 1508, approxRadius: 1.05,
    bounds: { min: [-0.6, 0, -0.015], max: [0.6, 2.1, 0.015] }, provenance,
  },
] as const;

export function findSpatialSemanticSample(label: string): SpatialSemanticSampleModel | undefined { const normalized = label.trim().toLowerCase().replace(/_/g, "-"); return SPATIAL_SEMANTIC_SAMPLE_MODELS.find((model) => model.semanticLabels.some((value) => value.toLowerCase().replace(/_/g, "-") === normalized)); }
