/**
 * GLB models bundled with the app for `SceneRecipe` "model" parts.
 *
 * Each entry pins the exact bytes a recipe expects: `assetId` is the same
 * deterministic id `asset-import.ts` would derive from the file (kind +
 * filename + content hash), computed up front so `ensureBuiltinModelAsset`
 * can check whether the current project already has it without any I/O.
 *
 * Unlike `BUNDLED_STARTER_ASSETS` (starter-templates.ts), these are imported
 * into an already-open project, not laid down while a new project is
 * created, so they carry no `projectRelativePath` of their own -- the import
 * pipeline picks a content-addressed one.
 */
export type BuiltinRecipeModelDefinition = {
  /** Stable key `SceneRecipePart` (kind: "model") parts reference. */
  modelId: string;
  /** Deterministic id: `model-${safeIdSegment(fileName without extension)}-${sha256.slice(0,12)}`. */
  assetId: string;
  /** Served from the app's own public/ directory, alongside starter-assets/. */
  publicPath: string;
  fileName: string;
  sha256: string;
  byteLength: number;
  displayName: string;
  /**
   * Half the model's longest dimension in meters, at scale [1,1,1] -- a
   * hand-authored camera-framing hint (same spirit as recipeFraming's 0.2
   * particle/light fallback), not a computed bounding box. The GLB is the
   * source of truth for actual geometry; this only keeps catalog card
   * framing from over- or under-zooming before the model has loaded.
   */
  approxRadius: number;
  /** Recorded for THIRD_PARTY_ASSETS.md-style provenance; these are original, not third-party. */
  provenance: string;
};

export const BUILTIN_RECIPE_MODELS: readonly BuiltinRecipeModelDefinition[] = [
  {
    modelId: "torch",
    assetId: "model-torch-86a17324dc60",
    publicPath: "/visual-editor/recipe-assets/torch.glb",
    fileName: "torch.glb",
    sha256:
      "86a17324dc6016eb8d1a990658dd825532078c9a8a128112c12ba048a918c330",
    byteLength: 607588,
    displayName: "松明",
    approxRadius: 0.6,
    provenance:
      "Codex image_gen (gpt-image-2) reference image + img2threejs procedural reconstruction (stylized, flat-shaded, project-original)",
  },
  {
    modelId: "bench",
    assetId: "model-bench-46300fa6215e",
    publicPath: "/visual-editor/recipe-assets/bench.glb",
    fileName: "bench.glb",
    sha256:
      "46300fa6215e3803e91b4e6adb0b00870245b5ec2092d4672c25d057d0a550dd",
    byteLength: 1957836,
    displayName: "ベンチ",
    approxRadius: 0.8,
    provenance:
      "Codex image_gen (gpt-image-2) reference image + img2threejs procedural reconstruction (stylized, flat-shaded, project-original)",
  },
  {
    modelId: "stoneLantern",
    assetId: "model-stone-lantern-d7e90cb234a1",
    publicPath: "/visual-editor/recipe-assets/stone-lantern.glb",
    fileName: "stone-lantern.glb",
    sha256:
      "d7e90cb234a17b8000550cb585b7a4b4b3a1fddce27528fa558ba67a27f54ee7",
    byteLength: 6447252,
    displayName: "石灯籠",
    approxRadius: 0.75,
    provenance:
      "Codex image_gen (gpt-image-2) reference image + img2threejs procedural reconstruction (stylized, flat-shaded, project-original)",
  },
  {
    modelId: "tree",
    assetId: "model-tree-308af9d6be9d",
    publicPath: "/visual-editor/recipe-assets/tree.glb",
    fileName: "tree.glb",
    sha256:
      "308af9d6be9d18fca160b4d390b228ec81d691d0b85404900615e27cc0ee0c53",
    byteLength: 7709528,
    displayName: "木",
    approxRadius: 1.1,
    provenance:
      "Codex image_gen (gpt-image-2) reference image + img2threejs procedural reconstruction (stylized, flat-shaded, project-original)",
  },
  {
    modelId: "streetLight",
    assetId: "model-street-light-c524ee6799c7",
    publicPath: "/visual-editor/recipe-assets/street-light.glb",
    fileName: "street-light.glb",
    sha256:
      "c524ee6799c7f92ced4e53074e40ff3bc98fe833a89140ca8089d11cb7c28cc8",
    byteLength: 16700,
    displayName: "街灯",
    approxRadius: 1.7,
    provenance:
      "Hand-authored Three.js geometry (project-original, no reference image or external generator)",
  },
  {
    modelId: "rockA",
    assetId: "model-rock-a-5c69a1e02b87",
    publicPath: "/visual-editor/recipe-assets/rock-a.glb",
    fileName: "rock-a.glb",
    sha256:
      "5c69a1e02b87f9e1adea39475b0607ecb3b7e291e4bb22472324f998769f392a",
    byteLength: 8952,
    displayName: "岩A",
    approxRadius: 0.55,
    provenance:
      "Hand-authored Three.js geometry (project-original, no reference image or external generator)",
  },
  {
    modelId: "rockB",
    assetId: "model-rock-b-bbe51e12d578",
    publicPath: "/visual-editor/recipe-assets/rock-b.glb",
    fileName: "rock-b.glb",
    sha256:
      "bbe51e12d578a311ba5ac070316b0a08d6e30afd06c8822c399e9bbe734935fe",
    byteLength: 8948,
    displayName: "岩B",
    approxRadius: 0.5,
    provenance:
      "Hand-authored Three.js geometry (project-original, no reference image or external generator)",
  },
  {
    modelId: "brazier",
    assetId: "model-brazier-b37eab4ba4b3",
    publicPath: "/visual-editor/recipe-assets/brazier.glb",
    fileName: "brazier.glb",
    sha256:
      "b37eab4ba4b341b3beae5dfcbe272ebb20c06fa9f5db11c45fb2d6d5b20cfcea",
    byteLength: 8980,
    displayName: "かがり火の鉢",
    approxRadius: 0.45,
    provenance:
      "Hand-authored Three.js geometry (project-original, no reference image or external generator)",
  },
  {
    modelId: "lantern",
    assetId: "model-lantern-896454119ac9",
    publicPath: "/visual-editor/recipe-assets/lantern.glb",
    fileName: "lantern.glb",
    sha256:
      "896454119ac9fae898433b74f3e7d0346b7f235df5b0819ec12f039cc461370f",
    byteLength: 11748,
    displayName: "提灯",
    approxRadius: 0.2,
    provenance:
      "Hand-authored Three.js geometry (project-original, no reference image or external generator)",
  },
  {
    modelId: "candelabra",
    assetId: "model-candelabra-c7125c4387cf",
    publicPath: "/visual-editor/recipe-assets/candelabra.glb",
    fileName: "candelabra.glb",
    sha256:
      "c7125c4387cfc91455580c002319bf173d91e422e9f3d1463c867ba2f39428d9",
    byteLength: 21568,
    displayName: "燭台",
    approxRadius: 0.3,
    provenance:
      "Hand-authored Three.js geometry (project-original, no reference image or external generator)",
  },
  {
    modelId: "bambooStalk",
    assetId: "model-bamboo-stalk-1c4d94a7cb11",
    publicPath: "/visual-editor/recipe-assets/bamboo-stalk.glb",
    fileName: "bamboo-stalk.glb",
    sha256:
      "1c4d94a7cb117b45dbe46d6835455ae2089edb84ba1af0560b0d2b88fd68c53e",
    byteLength: 40924,
    displayName: "竹",
    approxRadius: 1.6,
    provenance:
      "Hand-authored Three.js geometry (project-original, no reference image or external generator)",
  },
  {
    modelId: "stump",
    assetId: "model-stump-8c4734728e49",
    publicPath: "/visual-editor/recipe-assets/stump.glb",
    fileName: "stump.glb",
    sha256:
      "8c4734728e49ea5cf45aae9b6df776438e5db858f2363e4709f0a156c2ec8d14",
    byteLength: 36260,
    displayName: "切り株",
    approxRadius: 0.46,
    provenance:
      "Hand-authored Three.js geometry (project-original, no reference image or external generator)",
  },
  {
    modelId: "log",
    assetId: "model-log-6bb298856a65",
    publicPath: "/visual-editor/recipe-assets/log.glb",
    fileName: "log.glb",
    sha256:
      "6bb298856a654c9cad8741f351f660e673cb9c8953303e82c39f14ae108a032e",
    byteLength: 9168,
    displayName: "薪",
    approxRadius: 0.43,
    provenance:
      "Hand-authored Three.js geometry (project-original, no reference image or external generator)",
  },
  {
    modelId: "bush",
    assetId: "model-bush-786140fee313",
    publicPath: "/visual-editor/recipe-assets/bush.glb",
    fileName: "bush.glb",
    sha256:
      "786140fee3133f6aac333f70001c25b7a855bfa4109df7b3ad7b89f4b5f9f14a",
    byteLength: 26516,
    displayName: "茂み",
    approxRadius: 0.4,
    provenance:
      "Hand-authored Three.js geometry (project-original, no reference image or external generator)",
  },
  {
    modelId: "pillar",
    assetId: "model-pillar-e1b16b8f3f08",
    publicPath: "/visual-editor/recipe-assets/pillar.glb",
    fileName: "pillar.glb",
    sha256:
      "e1b16b8f3f088fca51773a2e137b78034b7fcb0b9c42384a78070ea5dbb1e871",
    byteLength: 11144,
    displayName: "石柱",
    approxRadius: 1.6,
    provenance:
      "Hand-authored Three.js geometry (project-original, no reference image or external generator)",
  },
  {
    modelId: "stairs",
    assetId: "model-stairs-1adc222a9080",
    publicPath: "/visual-editor/recipe-assets/stairs.glb",
    fileName: "stairs.glb",
    sha256:
      "1adc222a90806db593ac380f66b2e6573f4378ac51c56b949ce5f7b6b5dcf91f",
    byteLength: 18732,
    displayName: "階段",
    approxRadius: 1.1,
    provenance:
      "Hand-authored Three.js geometry (project-original, no reference image or external generator)",
  },
  {
    modelId: "wall",
    assetId: "model-wall-a08e2586e825",
    publicPath: "/visual-editor/recipe-assets/wall.glb",
    fileName: "wall.glb",
    sha256:
      "a08e2586e82579a63a0b0c9cfcaf35289b0bd08edf233c31e56956ceffbe4e0d",
    byteLength: 24228,
    displayName: "塀",
    approxRadius: 2.6,
    provenance:
      "Hand-authored Three.js geometry (project-original, no reference image or external generator)",
  },
  {
    modelId: "wellFrame",
    assetId: "model-well-frame-ad14bf1629ed",
    publicPath: "/visual-editor/recipe-assets/well-frame.glb",
    fileName: "well-frame.glb",
    sha256:
      "ad14bf1629ed290423aa6c17c1aed600e3df366564280f40327f0de672fe457d",
    byteLength: 11012,
    displayName: "井戸の屋根",
    approxRadius: 0.95,
    provenance:
      "Hand-authored Three.js geometry (project-original, no reference image or external generator)",
  },
  {
    modelId: "pier",
    assetId: "model-pier-63e595a4556b",
    publicPath: "/visual-editor/recipe-assets/pier.glb",
    fileName: "pier.glb",
    sha256:
      "63e595a4556b5047bba801c0cf5dabb37a114771dac99c0ab92174f5a1cd35b2",
    byteLength: 30768,
    displayName: "桟橋",
    approxRadius: 1.2,
    provenance:
      "Hand-authored Three.js geometry (project-original, no reference image or external generator)",
  },
  {
    modelId: "table",
    assetId: "model-table-006c45dbc7a2",
    publicPath: "/visual-editor/recipe-assets/table.glb",
    fileName: "table.glb",
    sha256:
      "006c45dbc7a2b619b16623949331fbeb4ec11a6a8efa2e1a2b90c6e022e8ad6a",
    byteLength: 14376,
    displayName: "テーブル",
    approxRadius: 0.85,
    provenance:
      "Hand-authored Three.js geometry (project-original, no reference image or external generator)",
  },
  {
    modelId: "stool",
    assetId: "model-stool-c656cb6dc82f",
    publicPath: "/visual-editor/recipe-assets/stool.glb",
    fileName: "stool.glb",
    sha256:
      "c656cb6dc82f69c1c9ea8aa687343692b1acca94ea651bb01e09f50bfe3e5c11",
    byteLength: 7692,
    displayName: "丸椅子",
    approxRadius: 0.25,
    provenance:
      "Hand-authored Three.js geometry (project-original, no reference image or external generator)",
  },
  {
    modelId: "magicCircle",
    assetId: "model-magic-circle-028dc11cee1f",
    publicPath: "/visual-editor/recipe-assets/magic-circle.glb",
    fileName: "magic-circle.glb",
    sha256:
      "028dc11cee1fa3ece600cf22ba9499462922c7570f8c7f8733521c5dfa5bf113",
    byteLength: 14164,
    displayName: "魔法陣",
    approxRadius: 0.8,
    provenance:
      "Hand-authored Three.js geometry (project-original, no reference image or external generator)",
  },
  {
    modelId: "warpPillar",
    assetId: "model-warp-pillar-7f9f9bd6d3a2",
    publicPath: "/visual-editor/recipe-assets/warp-pillar.glb",
    fileName: "warp-pillar.glb",
    sha256:
      "7f9f9bd6d3a2a92225ed4d69f7bb3839f551c762657a6663c829a0cf6a600509",
    byteLength: 6880,
    displayName: "ワープの柱",
    approxRadius: 1.6,
    provenance:
      "Hand-authored Three.js geometry (project-original, no reference image or external generator)",
  },
  {
    modelId: "snowman",
    assetId: "model-snowman-a0c6b14c79d6",
    publicPath: "/visual-editor/recipe-assets/snowman.glb",
    fileName: "snowman.glb",
    sha256:
      "a0c6b14c79d644e8e9b3f786f4020a0786fc04db62fb72baa3952bd9ae29c40e",
    byteLength: 56796,
    displayName: "雪だるま",
    approxRadius: 0.55,
    provenance:
      "Hand-authored Three.js geometry (project-original, no reference image or external generator)",
  },
  {
    modelId: "door",
    assetId: "model-door-146099ac4f87",
    publicPath: "/visual-editor/recipe-assets/door.glb",
    fileName: "door.glb",
    sha256:
      "146099ac4f8730f765ee86e3e4b1b5e0b4454118798604337d5e8702b40b638e",
    byteLength: 18456,
    displayName: "ドア",
    approxRadius: 1.05,
    provenance:
      "Hand-authored Three.js geometry (project-original, no reference image or external generator)",
  },
  {
    modelId: "window",
    assetId: "model-window-7d8ec97d6c90",
    publicPath: "/visual-editor/recipe-assets/window.glb",
    fileName: "window.glb",
    sha256:
      "7d8ec97d6c90a57a217a3371a20f4e06674146a312eed232e3c3c5c0f1a5e9e2",
    byteLength: 28108,
    displayName: "窓",
    approxRadius: 0.7,
    provenance:
      "Hand-authored Three.js geometry (project-original, no reference image or external generator)",
  },
  {
    modelId: "floorPanel",
    assetId: "model-floor-panel-3354a6907dfe",
    publicPath: "/visual-editor/recipe-assets/floor-panel.glb",
    fileName: "floor-panel.glb",
    sha256:
      "3354a6907dfe11f1971e8c7a2e354c3f7bafd6135937d222f76d4bf774792c3e",
    byteLength: 17976,
    displayName: "床パネル",
    approxRadius: 1.4,
    provenance:
      "Hand-authored Three.js geometry (project-original, no reference image or external generator)",
  },
  {
    modelId: "wallPanel",
    assetId: "model-wall-panel-5de024a40101",
    publicPath: "/visual-editor/recipe-assets/wall-panel.glb",
    fileName: "wall-panel.glb",
    sha256:
      "5de024a40101008168377fb03f6d480e230047089d41c06b74783b7d52d59598",
    byteLength: 7596,
    displayName: "壁パネル",
    approxRadius: 1.4,
    provenance:
      "Hand-authored Three.js geometry (project-original, no reference image or external generator)",
  },
  {
    modelId: "recordingStudio",
    assetId: "model-recording-studio-cc638574d435",
    publicPath: "/visual-editor/recipe-assets/recording-studio.glb",
    fileName: "recording-studio.glb",
    sha256:
      "cc638574d4356502a93221006c45b30506ae5b554c642d0ab66c61ecc48aba8d",
    byteLength: 3702596,
    displayName: "収録スタジオ",
    approxRadius: 2.05,
    provenance:
      "Blender procedural modeling by XRift Studio (project-original geometry). Embedded PBR textures are Poly Haven CC0-1.0; see THIRD_PARTY_ASSETS.md",
  },
];

export function getBuiltinRecipeModel(
  modelId: string,
): BuiltinRecipeModelDefinition | undefined {
  return BUILTIN_RECIPE_MODELS.find((definition) => definition.modelId === modelId);
}
