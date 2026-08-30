import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Plugin } from "vite";
import {
  VENDOR_BUNDLES,
  type VendorBundleId,
} from "../src/lib/visual-editor/vendor-assets";

/**
 * KTX2 と Draco は、読み込みに Three.js が配る JavaScript / WebAssembly を
 * 必要とする。どちらも pin した Three.js から解決するので、loader と decoder の
 * 版が食い違わず、Studio も公開したワールドも CDN を必要としない。
 *
 * 配るディレクトリとファイル名は src/lib/visual-editor/vendor-assets.ts の
 * 表がひとつだけ持つ。ここはその表を実ファイルへ結び付けるだけにする。
 */
const require = createRequire(import.meta.url);

const bundleSourceDirectories: Record<VendorBundleId, string> = {
  "three-basis": dirname(
    require.resolve("three/examples/jsm/libs/basis/basis_transcoder.js"),
  ),
  "three-draco": dirname(
    require.resolve("three/examples/jsm/libs/draco/gltf/draco_decoder.js"),
  ),
};

/**
 * Draco の README は gltf/ ではなく親ディレクトリにある。ライセンス表記を
 * 落とさずに配るため、bundle ごとの例外をここで吸収する。
 */
function resolveSourcePath(id: VendorBundleId, fileName: string): string {
  const directory = bundleSourceDirectories[id];
  if (id === "three-draco" && fileName === "README.md") {
    return join(dirname(directory), fileName);
  }
  return join(directory, fileName);
}

const CONTENT_TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
  ".md": "text/markdown; charset=utf-8",
};

function contentTypeOf(fileName: string): string {
  const extension = fileName.slice(fileName.lastIndexOf("."));
  return CONTENT_TYPES[extension] ?? "application/octet-stream";
}

type VendorAsset = {
  requestPath: string;
  emitFileName: string;
  sourcePath: string;
  contentType: string;
};

const vendorAssets: VendorAsset[] = Object.values(VENDOR_BUNDLES).flatMap(
  (bundle) =>
    bundle.files.map((fileName) => ({
      requestPath: `/${bundle.localDirectory}/${fileName}`,
      emitFileName: `${bundle.localDirectory}/${fileName}`,
      sourcePath: resolveSourcePath(bundle.id, fileName),
      contentType: contentTypeOf(fileName),
    })),
);

export function localThreeVendorAssets(): Plugin {
  return {
    name: "xrift-local-three-vendor-assets",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(
          request.url ?? "/",
          "http://xrift-studio.local",
        ).pathname;
        // The Visual Editor can be served below a path prefix, so match the
        // trailing directory instead of the whole pathname.
        const asset = vendorAssets.find((candidate) =>
          pathname.endsWith(candidate.requestPath),
        );
        if (!asset) {
          next();
          return;
        }

        try {
          const source = await readFile(asset.sourcePath);
          response.statusCode = 200;
          response.setHeader("Content-Type", asset.contentType);
          response.setHeader("Content-Length", source.byteLength);
          response.setHeader("Cache-Control", "no-cache");
          response.end(source);
        } catch (error) {
          next(error);
        }
      });
    },
    async generateBundle() {
      for (const asset of vendorAssets) {
        this.emitFile({
          type: "asset",
          fileName: asset.emitFileName,
          source: await readFile(asset.sourcePath),
        });
      }
    },
  };
}
