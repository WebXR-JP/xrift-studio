import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Plugin } from "vite";

/**
 * KTX2Loader requires the JavaScript and WebAssembly files produced by Basis
 * Universal. Resolve them from the pinned Three.js dependency so the loader and
 * transcoder always stay on the same version and Studio never needs a CDN.
 */
export const LOCAL_THREE_BASIS_DIRECTORY =
  "visual-editor/vendor/three-basis";

const require = createRequire(import.meta.url);
const basisDirectory = dirname(
  require.resolve("three/examples/jsm/libs/basis/basis_transcoder.js"),
);

const basisAssets = [
  {
    fileName: "basis_transcoder.js",
    sourcePath: join(basisDirectory, "basis_transcoder.js"),
    contentType: "text/javascript; charset=utf-8",
  },
  {
    fileName: "basis_transcoder.wasm",
    sourcePath: join(basisDirectory, "basis_transcoder.wasm"),
    contentType: "application/wasm",
  },
  {
    fileName: "README.md",
    sourcePath: join(basisDirectory, "README.md"),
    contentType: "text/markdown; charset=utf-8",
  },
] as const;

export function localThreeBasisAssets(): Plugin {
  return {
    name: "xrift-local-three-basis-assets",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(
          request.url ?? "/",
          "http://xrift-studio.local",
        ).pathname;
        const requestPrefix = `/${LOCAL_THREE_BASIS_DIRECTORY}/`;
        const requestPrefixIndex = pathname.lastIndexOf(requestPrefix);
        if (requestPrefixIndex < 0) {
          next();
          return;
        }

        const requestedFileName = pathname.slice(
          requestPrefixIndex + requestPrefix.length,
        );
        const asset = basisAssets.find(
          (candidate) => candidate.fileName === requestedFileName,
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
      for (const asset of basisAssets) {
        this.emitFile({
          type: "asset",
          fileName: `${LOCAL_THREE_BASIS_DIRECTORY}/${asset.fileName}`,
          source: await readFile(asset.sourcePath),
        });
      }
    },
  };
}
