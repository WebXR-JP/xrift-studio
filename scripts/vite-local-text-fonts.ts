import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Plugin } from "vite";

import {
  TEXT_FONT_CATALOG,
  TEXT_FONT_DIRECTORY,
  TEXT_FONT_PACKAGE_VERSION,
  textFontFileName,
} from "../packages/xrift-studio-runtime/src/text-font-catalog";

/**
 * Serves and emits the Text component's font files from the pinned
 * `@fontsource` dependency.
 *
 * A published world may not download its font: the platform's security check
 * rejects a bundle that reaches the network without a declared permission, and
 * the permission cannot be narrowed to a host because the URL is built per font
 * and weight. Shipping the files makes both Studio and the world read them
 * same-origin, so the whole declaration goes away.
 *
 * Studio and a published world use the same relative directory, so a world's
 * copies are made from what is served here rather than from a second source.
 */
const require = createRequire(import.meta.url);

type TextFontAsset = {
  fileName: string;
  sourcePath: string;
};

function textFontAssets(): TextFontAsset[] {
  return TEXT_FONT_CATALOG.flatMap((font) => {
    const packageJsonPath = require.resolve(`@fontsource/${font.id}/package.json`);
    // The catalog names the revision the licence note and the docs describe.
    // Reading the installed one here means a dependency bump cannot leave them
    // describing a file Studio no longer ships.
    const installedVersion = (
      JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version: string }
    ).version;
    if (installedVersion !== TEXT_FONT_PACKAGE_VERSION) {
      throw new Error(
        `@fontsource/${font.id} is installed at ${installedVersion} but TEXT_FONT_PACKAGE_VERSION says ${TEXT_FONT_PACKAGE_VERSION}. ` +
          "Update packages/xrift-studio-runtime/src/text-font-catalog.ts and THIRD_PARTY_ASSETS.md together with the dependency.",
      );
    }
    const filesDirectory = join(dirname(packageJsonPath), "files");
    return font.weights.map((weight) => {
      const fileName = textFontFileName(font, weight);
      return { fileName, sourcePath: join(filesDirectory, fileName) };
    });
  });
}

export function localTextFontAssets(): Plugin {
  const assets = textFontAssets();
  return {
    name: "xrift-local-text-font-assets",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(
          request.url ?? "/",
          "http://xrift-studio.local",
        ).pathname;
        const requestPrefix = `/${TEXT_FONT_DIRECTORY}/`;
        const requestPrefixIndex = pathname.lastIndexOf(requestPrefix);
        if (requestPrefixIndex < 0) {
          next();
          return;
        }

        const requestedFileName = pathname.slice(
          requestPrefixIndex + requestPrefix.length,
        );
        const asset = assets.find(
          (candidate) => candidate.fileName === requestedFileName,
        );
        if (!asset) {
          next();
          return;
        }

        try {
          const source = await readFile(asset.sourcePath);
          response.statusCode = 200;
          response.setHeader("Content-Type", "font/woff");
          response.setHeader("Content-Length", source.byteLength);
          response.setHeader("Cache-Control", "no-cache");
          response.end(source);
        } catch (error) {
          next(error);
        }
      });
    },
    async generateBundle() {
      for (const asset of assets) {
        this.emitFile({
          type: "asset",
          fileName: `${TEXT_FONT_DIRECTORY}/${asset.fileName}`,
          source: await readFile(asset.sourcePath),
        });
      }
    },
  };
}
