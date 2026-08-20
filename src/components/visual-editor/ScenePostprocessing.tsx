/**
 * The scene compositor lives in the runtime package so the editor, the catalog
 * previews and a published world all mount the same one. Re-exported here
 * because that is where every editor caller already imports it from.
 */
export {
  ScenePostprocessing,
  type XriftScenePostprocessingSettings,
} from "../../../packages/xrift-studio-runtime/src/scene/postprocessing";
