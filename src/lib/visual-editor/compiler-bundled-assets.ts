import { resolveTextFontDirectoryUrl } from "../../../packages/xrift-studio-runtime/src/text-font-catalog";
import type { CompilerBundledAssetCopy } from "./compiler";
import { resolveLocalVendorAssetPath, VENDOR_BUNDLES } from "./vendor-assets";

export type CompilerBundledAssetFile = {
  targetRelativePath: string;
  dataUrl: string;
};

/**
 * Reads the files Studio ships that a compiled world has to carry: the KTX2
 * transcoder, the Draco decoder and the Text fonts.
 *
 * They are fetched from the same URLs Studio's own viewport loads them from,
 * so a publish and a Classic export copy exactly the bytes the editor renders
 * with. Shared by the publish staging and the Classic export so the two never
 * resolve a decoder from different places.
 */
export async function loadCompilerBundledAssetFiles(
  plan: readonly CompilerBundledAssetCopy[],
  signal?: AbortSignal,
): Promise<CompilerBundledAssetFile[]> {
  return Promise.all(
    plan.map(async (entry) => {
      if (signal?.aborted) {
        throw new DOMException("The operation was aborted", "AbortError");
      }
      const sourceDirectory =
        entry.source === "text-fonts"
          ? resolveTextFontDirectoryUrl()
          : resolveLocalVendorAssetPath(entry.source);
      const response = await fetch(
        `${sourceDirectory}${encodeURIComponent(entry.sourceFileName)}`,
        { signal },
      );
      if (!response.ok) {
        throw new Error(
          entry.source === "text-fonts"
            ? `公開用フォントファイルを読み込めませんでした (${response.status})`
            : `公開用${VENDOR_BUNDLES[entry.source].label}を読み込めませんでした (${response.status})`,
        );
      }
      return {
        targetRelativePath: entry.targetRelativePath,
        dataUrl: await blobToDataUrl(await response.blob()),
      };
    }),
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Bundled compiler asset encoding returned no data")),
    );
    reader.addEventListener("error", () =>
      reject(
        reader.error ??
          new Error("Bundled compiler asset encoding failed"),
      ),
    );
    reader.readAsDataURL(blob);
  });
}
