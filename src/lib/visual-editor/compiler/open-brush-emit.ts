import openBrushRuntimeSource from "../../../../packages/xrift-studio-runtime/src/open-brush/material-extension.ts?raw";
import openBrushPresetLoaderSource from "../../../../packages/xrift-studio-runtime/src/open-brush/preset-loader.ts?raw";
import openBrushPresetMaterialSource from "../../../../packages/xrift-studio-runtime/src/open-brush/preset-material.tsx?raw";
import openBrushMaterialPropertiesSource from "../../../../packages/xrift-studio-runtime/src/open-brush/material-properties.ts?raw";
import customShaderAttributesSource from "../../../../packages/xrift-studio-runtime/src/custom-shader-attributes.ts?raw";
import type { CompilerOverlayFile } from "./types";
import { SCRIPT_RUNTIME_DIRECTORY } from "./script-emit";

export const OPEN_BRUSH_RUNTIME_OVERLAY_PATH = `${SCRIPT_RUNTIME_DIRECTORY}/open-brush-runtime.ts`;

/**
 * Ships the editor's brush loader into the published world.
 *
 * Stock `three-icosa` builds a RawShaderMaterial whose GLSL still carries its
 * own `#version` directive, so the shader never compiles once three prepends
 * its prefix, and it corrupts the first brush's resources while loading the
 * second. Emitting the same module the viewport uses keeps a published world
 * rendering what its author previewed.
 */
export function createOpenBrushRuntimeOverlayFile(): CompilerOverlayFile {
  return {
    relativePath: OPEN_BRUSH_RUNTIME_OVERLAY_PATH,
    content: openBrushRuntimeSource,
    kind: "source",
    owner: "xrift-studio-compiler",
  };
}

/** Standalone brushes use the same preset, tint and geometry inputs as Edit. */
export function createOpenBrushPresetOverlayFiles(): CompilerOverlayFile[] {
  return [
    ["open-brush-preset-loader.ts", openBrushPresetLoaderSource],
    ["open-brush-preset-material.tsx", openBrushPresetMaterialSource],
    ["open-brush-material-properties.ts", openBrushMaterialPropertiesSource],
    ["custom-shader-attributes.ts", customShaderAttributesSource],
  ].map(([name, source]) => ({
    relativePath: `${SCRIPT_RUNTIME_DIRECTORY}/${name}`,
    content: source
      .replace(/"\.\/material-extension(?:\.js)?"/g, '"./open-brush-runtime"')
      .replace(/"\.\/material-properties(?:\.js)?"/g, '"./open-brush-material-properties"')
      .replace(/"\.\/preset-loader(?:\.js)?"/g, '"./open-brush-preset-loader"')
      .replace(/"\.\.\/custom-shader-attributes(?:\.js)?"/g, '"./custom-shader-attributes"'),
    kind: "source",
    owner: "xrift-studio-compiler",
  }));
}
