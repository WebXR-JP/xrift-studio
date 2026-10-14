import { isEnvironmentTextureAsset } from "./asset-manifest";
import type { PrototypeVisualProject } from "./prototype-project";
import { resolveSceneSettings } from "./scene-settings";
import { isSkyShaderMaterialAsset } from "./sky-shader";
import type { ChatgptBuiltinCandidate, ChatgptResourceContext } from "./chatgpt-resources";
import type { ChatgptSceneContext } from "../tauri";

const utf8Bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const boundedText = (value: string, limit: number) => [...value].slice(0, limit).join("");
const optionalAssetId = (value: string | undefined) => value?.trim() ? value : undefined;

/** Summarize the live Scene within the native input contract, selected first. */
export function collectChatgptSceneContext(bundle: PrototypeVisualProject, selectedEntityId?: string,
  conversation: ChatgptSceneContext["conversation"] = []): ChatgptSceneContext {
  const result: ChatgptSceneContext = { title: boundedText(bundle.project.metadata.title ?? bundle.project.metadata.name, 100),
    ...(selectedEntityId ? { selectedEntityId } : {}), entities: [] };
  const entities = Object.values(bundle.scene.entities).sort((a, b) => Number(b.id === selectedEntityId) - Number(a.id === selectedEntityId));
  for (const entity of entities) {
    if (result.entities.length >= 100) break;
    const transform = entity.components.find(component => component.type === "transform");
    if (!transform) continue;
    // A Scene can contain multiple Components of one type. The model needs
    // available types here; individual editable IDs are in the resource context.
    const summary = { id: entity.id, name: boundedText(entity.name, 80),
      components: [...new Set(entity.components.map(component => component.type))].slice(0, 32),
      position: [...transform.position], scale: [...transform.scale], rotation: transform.rotation.map(value => value * 180 / Math.PI) };
    result.entities.push(summary);
    // Rust serializes integral f64 values with a decimal suffix. Leave room
    // for those suffixes across the 100 × 9 Transform values in the native copy.
    if (utf8Bytes(result) > 14 * 1024) { result.entities.pop(); continue; }
  }
  if (!result.entities.some(entity => entity.id === selectedEntityId)) delete result.selectedEntityId;
  if (conversation.length) result.conversation = conversation;
  return result;
}

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
  const fits = () => utf8Bytes(result) <= 31 * 1024;
  // The catalog must not crowd out the selected Entity's components and assets.
  while (utf8Bytes(result) > 16 * 1024 && result.builtinCandidates.length) result.builtinCandidates.pop();
  for (const id of new Set(entityIds)) {
    for (const component of bundle.scene.entities[id]?.components ?? []) {
      const type = component.type;
      if (type !== "mesh" && type !== "audio-source" && type !== "collider") continue;
      result.components.push({ entityId: id, componentId: component.id, type: type === "mesh" || type === "audio-source" ? type : "collider",
        ...(type === "mesh" ? { modelAssetId: bundle.assets.assets[component.geometryAssetId]?.kind === "model" ? optionalAssetId(component.geometryAssetId) : undefined } : {}),
        ...(type === "audio-source" ? { audio: { audioAssetId: optionalAssetId(component.audioAssetId), enabled: component.enabled, volume: component.volume,
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
