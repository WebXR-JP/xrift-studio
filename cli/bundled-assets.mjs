import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { VENDOR_BUNDLES } from "../src/lib/visual-editor/vendor-assets.ts";

/**
 * Resolves the files Studio ships with a converted Classic project: the KTX2
 * transcoder and Draco decoder from the pinned `three`, and the Text fonts from
 * the pinned `@fontsource` packages.
 *
 * Same sources as scripts/vite-local-three-vendor.ts and
 * scripts/vite-local-text-fonts.ts, which serve them to the editor, so a
 * converted world reads exactly the decoder Studio rendered with. A world that
 * is missing one of these does not fail at convert time but at load time, in
 * the author's browser, as a 404 the platform reports as a broken world.
 */
const require = createRequire(import.meta.url);

const bundleSourceDirectories = {
  "three-basis": () =>
    dirname(require.resolve("three/examples/jsm/libs/basis/basis_transcoder.js")),
  "three-draco": () =>
    dirname(require.resolve("three/examples/jsm/libs/draco/gltf/draco_decoder.js")),
};

export function resolveBundledAssetSource(entry) {
  if (entry.source === "text-fonts") {
    // The font id is the `@fontsource` package name; the file name already
    // carries family, subset and weight (see text-font-catalog.ts).
    const fontId = entry.sourceFileName.replace(/-(japanese|latin)-\d+-normal\.woff$/, "");
    const packageJsonPath = require.resolve(`@fontsource/${fontId}/package.json`);
    return join(dirname(packageJsonPath), "files", entry.sourceFileName);
  }
  const resolveDirectory = bundleSourceDirectories[entry.source];
  if (!resolveDirectory || !VENDOR_BUNDLES[entry.source]) {
    throw new Error(`Unknown bundled asset source: ${entry.source}`);
  }
  const directory = resolveDirectory();
  // Draco の README は gltf/ ではなく親ディレクトリにある。
  if (entry.source === "three-draco" && entry.sourceFileName === "README.md") {
    return join(dirname(directory), entry.sourceFileName);
  }
  return join(directory, entry.sourceFileName);
}
