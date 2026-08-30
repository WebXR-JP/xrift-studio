import {
  VENDOR_BUNDLES,
  resolveLocalVendorAssetPath,
} from "./vendor-assets";

/**
 * KTX2向けの別名。実体は `vendor-assets.ts` の bundle 表で、decoder を要する
 * 形式はすべてそこに並ぶ。ここは KTX2 だけを見る呼び出し側のための入口。
 */
export const LOCAL_BASIS_TRANSCODER_DIRECTORY =
  VENDOR_BUNDLES["three-basis"].localDirectory;

export const LOCAL_BASIS_TRANSCODER_FILES =
  VENDOR_BUNDLES["three-basis"].files;

export type LocalBasisTranscoderFileName =
  (typeof LOCAL_BASIS_TRANSCODER_FILES)[number];

/**
 * Public directory copied into compiler-owned staging projects.
 *
 * This path is relative to XRift's runtime `baseUrl`, matching the other
 * compiler-managed public assets.
 */
export const PUBLISHED_BASIS_TRANSCODER_DIRECTORY =
  VENDOR_BUNDLES["three-basis"].publishedDirectory;

/** Returns the directory URL expected by Three.js KTX2Loader inside Studio. */
export function resolveLocalBasisTranscoderPath(
  baseUrl?: string,
): string {
  return resolveLocalVendorAssetPath("three-basis", baseUrl);
}
