import scenePostprocessingSource from "../../../../packages/xrift-studio-runtime/src/scene/postprocessing.tsx?raw";
import type { CompilerOverlayFile } from "./types";
import { SCRIPT_RUNTIME_DIRECTORY } from "./script-emit";

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
    content: scenePostprocessingSource,
    kind: "source",
    owner: "xrift-studio-compiler",
  };
}