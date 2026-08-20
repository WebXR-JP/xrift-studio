import openBrushRuntimeSource from "../../../../packages/xrift-studio-runtime/src/open-brush/material-extension.ts?raw";
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
