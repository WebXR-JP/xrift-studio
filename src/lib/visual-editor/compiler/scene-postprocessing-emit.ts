import scenePostprocessingSource from "../../../../packages/xrift-studio-runtime/src/scene/postprocessing.tsx?raw";
import sceneRuntimeSource from "../../../../packages/xrift-studio-runtime/src/script/scene-runtime.tsx?raw";
import type { CompilerOverlayFile } from "./types";
import {
  rewriteRuntimeLocalImports,
  SCENE_RUNTIME_OVERLAY_PATH,
  SCRIPT_RUNTIME_DIRECTORY,
} from "./script-emit";

export const SCENE_POSTPROCESSING_OVERLAY_PATH = `${SCRIPT_RUNTIME_DIRECTORY}/scene-postprocessing.tsx`;

/**
 * The compositor the editor uses, shipped into the published world.
 *
 * Tone mapping, SSAO, Bloom and colour grading used to exist twice: once here
 * as a string template and once as the editor component. Two copies of a
 * pipeline that decides what a world looks like is how an author ends up
 * grading a Scene in the editor and publishing something that looks different.
 */
export function createScenePostprocessingOverlayFile(): CompilerOverlayFile {
  return {
    relativePath: SCENE_POSTPROCESSING_OVERLAY_PATH,
    // The compositor reads the Scene bridge, so a viewer's graph can turn the
    // passes on for that viewer alone. The staged world is flat, so the
    // package's `../script/scene-runtime.js` is rewritten to the overlay it
    // ships as — the same rewrite every other runtime module goes through.
    content: rewriteRuntimeLocalImports(scenePostprocessingSource),
    kind: "source",
    owner: "xrift-studio-compiler",
  };
}

/**
 * The Scene bridge the compositor imports.
 *
 * A world with post effects but no behavior graph still carries the compositor,
 * and the compositor now reads the bridge, so the bridge module ships with it
 * rather than only with the trigger runtime.
 */
export function createScenePostprocessingBridgeOverlayFile(): CompilerOverlayFile {
  return {
    relativePath: SCENE_RUNTIME_OVERLAY_PATH,
    content: rewriteRuntimeLocalImports(sceneRuntimeSource),
    kind: "source",
    owner: "xrift-studio-compiler",
  };
}