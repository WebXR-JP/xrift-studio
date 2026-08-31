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

/** Returns the directory URL expected by Three.js KTX2Loader inside Studio. */
export function resolveLocalBasisTranscoderPath(
  baseUrl?: string,
): string {
  return resolveLocalVendorAssetPath("three-basis", baseUrl);
}
