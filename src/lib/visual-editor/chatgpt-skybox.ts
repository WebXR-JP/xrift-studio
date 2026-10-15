import type { PrototypeVisualProject } from "./prototype-project";
import { resolveSceneSettings } from "./scene-settings";

/** Generated plans can request IBL for a procedural sky, which has no image.
 * Keep the sky edit usable without inventing or downloading an environment. */
export function normalizeChatgptSkyboxPatch(bundle: PrototypeVisualProject, patch: Record<string, unknown>): Record<string, unknown> {
  const imageAssetId = patch.imageAssetId === undefined
    ? resolveSceneSettings(bundle.scene.settings).skybox.imageAssetId
    : patch.imageAssetId;
  return patch.iblEnabled === true && !imageAssetId ? { ...patch, iblEnabled: false } : patch;
}
