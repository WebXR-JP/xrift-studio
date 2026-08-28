/**
 * MP3 ambience bundled with the app for `SceneRecipe` "audio" parts.
 *
 * Same contract as `BUILTIN_RECIPE_MODELS` (builtin-recipe-models.ts): the
 * audio lands in an already-open project through the normal import pipeline,
 * so the definition only pins the exact bytes the recipe expects. `assetId`
 * is the deterministic id `asset-import.ts` derives from the file
 * (`audio-${safeIdSegment(fileName without extension)}-${sha256.slice(0,12)}`)
 * and is computed up front so `ensureBuiltinRecipeAudioAsset` can check
 * whether the project already has the source without any I/O.
 */
export type BuiltinRecipeAudioDefinition = {
  /** Stable key `SceneRecipePart` (kind: "audio") parts reference. */
  audioId: string;
  /** Deterministic id: `audio-${safeIdSegment(fileName without extension)}-${sha256.slice(0,12)}`. */
  assetId: string;
  /** Served from the app's own public/ directory, alongside recipe-assets/. */
  publicPath: string;
  fileName: string;
  sha256: string;
  byteLength: number;
  displayName: string;
  /** Recorded for THIRD_PARTY_ASSETS.md-style provenance; these are project-original. */
  provenance: string;
};

const SUMMER_AMBIENCE_PROVENANCE =
  "XRift Studio original ambience (Suno-generated instrumental field-recording style, project-original)";

export const BUILTIN_RECIPE_AUDIO: readonly BuiltinRecipeAudioDefinition[] = [
  {
    audioId: "summerCicadas",
    assetId: "audio-summer-cicadas-2f3426a810bf",
    publicPath: "/visual-editor/recipe-assets/summer-cicadas.mp3",
    fileName: "summer-cicadas.mp3",
    sha256:
      "2f3426a810bf377e52dba4af49652445b9d015541740ab306b4c5e2a00a58144",
    byteLength: 32119,
    displayName: "セミの声 (夏・昼)",
    provenance: SUMMER_AMBIENCE_PROVENANCE,
  },
  {
    audioId: "summerRiver",
    assetId: "audio-summer-river-2f3426a810bf",
    publicPath: "/visual-editor/recipe-assets/summer-river.mp3",
    fileName: "summer-river.mp3",
    sha256:
      "2f3426a810bf377e52dba4af49652445b9d015541740ab306b4c5e2a00a58144",
    byteLength: 32119,
    displayName: "川のせせらぎ (夏)",
    provenance: SUMMER_AMBIENCE_PROVENANCE,
  },
  {
    audioId: "summerNight",
    assetId: "audio-summer-night-2f3426a810bf",
    publicPath: "/visual-editor/recipe-assets/summer-night.mp3",
    fileName: "summer-night.mp3",
    sha256:
      "2f3426a810bf377e52dba4af49652445b9d015541740ab306b4c5e2a00a58144",
    byteLength: 32119,
    displayName: "夜の虫の声 (夏)",
    provenance: SUMMER_AMBIENCE_PROVENANCE,
  },
];

export function getBuiltinRecipeAudio(
  audioId: string,
): BuiltinRecipeAudioDefinition | undefined {
  return BUILTIN_RECIPE_AUDIO.find((definition) => definition.audioId === audioId);
}