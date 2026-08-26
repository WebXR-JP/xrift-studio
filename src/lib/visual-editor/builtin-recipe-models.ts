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
];

export function getBuiltinRecipeModel(
  modelId: string,
): BuiltinRecipeModelDefinition | undefined {
  return BUILTIN_RECIPE_MODELS.find((definition) => definition.modelId === modelId);
}
