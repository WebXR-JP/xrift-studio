import { isEnvironmentTextureAsset } from "./asset-manifest";
import type { PrototypeVisualProject } from "./prototype-project";
import { resolveSceneSettings } from "./scene-settings";
import { isSkyShaderMaterialAsset } from "./sky-shader";
import type { ChatgptBuiltinCandidate, ChatgptResourceContext } from "./chatgpt-resources";

/** A bounded description of usable resources; never sends file paths or bytes. */
export function collectChatgptSceneResources(bundle: PrototypeVisualProject, entityIds: readonly string[], builtinCandidates: ChatgptBuiltinCandidate[]): ChatgptResourceContext {
  const sky = resolveSceneSettings(bundle.scene.settings).skybox;
  const result: ChatgptResourceContext = {
    projectAssets: [], builtinCandidates: [], components: [],
    sceneSettings: { skybox: { enabled: sky.enabled, iblEnabled: sky.iblEnabled, imageAssetId: sky.imageAssetId,
      materialAssetId: sky.materialAssetId, rotationDegrees: sky.rotationDegrees, exposure: sky.exposure } },
  };
  // Reserve space for every shelf before large projects contribute resources.
  for (const candidate of builtinCandidates.slice(0, 128)) result.builtinCandidates.push({ ...candidate,
    name: [...candidate.name].slice(0, 80).join(""), description: [...candidate.description].slice(0, 160).join("") });
  const fits = () => new TextEncoder().encode(JSON.stringify(result)).byteLength <= 31 * 1024;
  // The catalog must not crowd out the selected Entity's components and assets.
  while (new TextEncoder().encode(JSON.stringify(result)).byteLength > 16 * 1024 && result.builtinCandidates.length) result.builtinCandidates.pop();
  for (const id of entityIds) {
    for (const component of bundle.scene.entities[id]?.components ?? []) {
      const type = component.type;
      if (type !== "mesh" && type !== "audio-source" && type !== "collider") continue;
      result.components.push({ entityId: id, componentId: component.id, type: type === "mesh" || type === "audio-source" ? type : "collider",
        ...(type === "mesh" ? { modelAssetId: component.geometryAssetId } : {}),
        ...(type === "audio-source" ? { audio: { audioAssetId: component.audioAssetId, enabled: component.enabled, volume: component.volume,
          loop: component.loop, spatial: component.spatial, autoplay: component.autoplay } } : {}) });
      if (result.components.length > 128 || !fits()) { result.components.pop(); break; }
    }
  }
  const referenced = new Set(result.components.flatMap(component => [component.modelAssetId, component.audio?.audioAssetId]).concat([sky.imageAssetId, sky.materialAssetId]));
  for (const asset of Object.values(bundle.assets.assets).sort((a, b) => Number(referenced.has(b.id)) - Number(referenced.has(a.id)))) {
    if (asset.status !== "ready") continue;
    const kind = isEnvironmentTextureAsset(asset) || asset.kind === "skybox" ? "hdri" : asset.kind;
    if (kind !== "model" && kind !== "material" && kind !== "audio" && kind !== "hdri") continue;
    result.projectAssets.push({ id: asset.id, kind, name: [...asset.name].slice(0, 80).join(""),
      ...(isSkyShaderMaterialAsset(asset) ? { skyboxMaterial: true } : {}) });
    if (result.projectAssets.length > 128 || !fits()) { result.projectAssets.pop(); break; }
  }
  return result;
}
