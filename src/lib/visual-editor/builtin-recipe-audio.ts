/**
 * WAV files bundled with the app for `SceneRecipe` "audio" parts.
 *
 * Mirrors `builtin-recipe-models.ts`: `assetId` is the deterministic id
 * `asset-import.ts` derives from the file (kind + filename + content hash),
 * precomputed so `ensureBuiltinAudioAsset` can tell whether the open project
 * already has the sound without any I/O.
 *
 * Every sample is synthesized by `scripts/generate-recipe-audio.mjs` rather
 * than sourced, so the tutorial sets ship a working Audio Source with no
 * third-party licence attached to it. Re-running that script must reproduce
 * these exact bytes; a change to the synthesis is a change to `sha256` and
 * `byteLength` here.
 */
export type BuiltinRecipeAudioDefinition = {
  /** Stable key a `SceneRecipe` part references. */
  audioId: string;
  /** `audio-${fileName without extension}-${sha256.slice(0, 12)}`. */
  assetId: string;
  /** Served from the app's own public/ directory. */
  publicPath: string;
  fileName: string;
  sha256: string;
  byteLength: number;
  displayName: string;
  durationSeconds: number;
  /** What the sound is for, shown in the set's contents list. */
  description: string;
  /** True when the file's end meets its start, so a looping source is silent-seamed. */
  loopable: boolean;
};

export const BUILTIN_RECIPE_AUDIO: readonly BuiltinRecipeAudioDefinition[] = [
  {
    audioId: "pressChime",
    assetId: "audio-press-chime-6b3aa6142919",
    publicPath: "/visual-editor/recipe-assets/audio/press-chime.wav",
    fileName: "press-chime.wav",
    sha256:
      "6b3aa614291997f00818a892eb13ef08fe790b2467e741c5a2351f8b13c62155",
    byteLength: 39734,
    displayName: "ボタンの音",
    durationSeconds: 0.9,
    description: "押したときに鳴る、短いベルの音",
    loopable: false,
  },
  {
    audioId: "softClick",
    assetId: "audio-soft-click-a5e9489b1f0f",
    publicPath: "/visual-editor/recipe-assets/audio/soft-click.wav",
    fileName: "soft-click.wav",
    sha256:
      "a5e9489b1f0fe73cffa39a0747b31305dc53090465903ddcecdb440b6d011132",
    byteLength: 7100,
    displayName: "スイッチの音",
    durationSeconds: 0.16,
    description: "スイッチを入れたときのカチッという音",
    loopable: false,
  },
  {
    audioId: "ambientHum",
    assetId: "audio-ambient-hum-d4337c78ec9f",
    publicPath: "/visual-editor/recipe-assets/audio/ambient-hum.wav",
    fileName: "ambient-hum.wav",
    sha256:
      "d4337c78ec9fc27c3757ae6487eb5986b8a248af3c065db02c56890c414c0356",
    byteLength: 176444,
    displayName: "環境音のループ",
    durationSeconds: 4,
    description: "つなぎ目のない4秒のループ。流しっぱなしの環境音に",
    loopable: true,
  },
  {
    audioId: "doorSlide",
    assetId: "audio-door-slide-460d8601d311",
    publicPath: "/visual-editor/recipe-assets/audio/door-slide.wav",
    fileName: "door-slide.wav",
    sha256:
      "460d8601d3119e8eda7e116c328b17f66cf59f5a65871e4d28e3450515ef7c69",
    byteLength: 48554,
    displayName: "扉が動く音",
    durationSeconds: 1.1,
    description: "扉がスライドして止まるまでの音",
    loopable: false,
  },
];

export function getBuiltinRecipeAudio(
  audioId: string,
): BuiltinRecipeAudioDefinition | undefined {
  return BUILTIN_RECIPE_AUDIO.find(
    (definition) => definition.audioId === audioId,
  );
}
