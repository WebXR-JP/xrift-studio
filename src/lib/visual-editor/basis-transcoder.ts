/**
 * Public directory emitted by the local Three.js Basis Vite plugin.
 *
 * Keep this value synchronized with LOCAL_THREE_BASIS_DIRECTORY in
 * scripts/vite-local-three-basis.ts.
 */
export const LOCAL_BASIS_TRANSCODER_DIRECTORY =
  "visual-editor/vendor/three-basis";

export const LOCAL_BASIS_TRANSCODER_FILES = [
  "basis_transcoder.js",
  "basis_transcoder.wasm",
  "README.md",
] as const;

export type LocalBasisTranscoderFileName =
  (typeof LOCAL_BASIS_TRANSCODER_FILES)[number];

/**
 * Public directory copied into compiler-owned Classic JSX staging projects.
 *
 * This path is relative to XRift's runtime `baseUrl`, matching the other
 * compiler-managed public assets.
 */
export const PUBLISHED_BASIS_TRANSCODER_DIRECTORY =
  "xrift-studio/vendor/three-basis";

/**
 * Returns the directory URL expected by Three.js KTX2Loader.
 *
 * Vite's BASE_URL keeps the same helper valid for the root-based Tauri app and
 * for builds hosted below a path prefix.
 */
export function resolveLocalBasisTranscoderPath(
  baseUrl: string = import.meta.env?.BASE_URL ?? "/",
): string {
  const normalizedBase = baseUrl.trim() || "/";
  const baseWithTrailingSlash = normalizedBase.endsWith("/")
    ? normalizedBase
    : `${normalizedBase}/`;
  return `${baseWithTrailingSlash}${LOCAL_BASIS_TRANSCODER_DIRECTORY}/`;
}
