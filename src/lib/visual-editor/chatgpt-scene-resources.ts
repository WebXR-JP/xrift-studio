import { isEnvironmentTextureAsset } from "./asset-manifest";
import type { PrototypeVisualProject } from "./prototype-project";
import { resolveSceneSettings } from "./scene-settings";
import { isSkyShaderMaterialAsset } from "./sky-shader";
import type { ChatgptBuiltinCandidate, ChatgptResourceContext } from "./chatgpt-resources";
import type { ChatgptSceneContext } from "../tauri";
import { chatgptAttachmentEntityIds } from "./chatgpt-attachments";
import { listXriftComponentDefinitions } from "./component-registry";
import type { JsonValue, SceneComponent } from "./scene-document";
import { EDITOR_COMPONENT_REGISTRY, addEditorComponent, createEmptyEntity } from "./editor-session";
import { COMPONENT_PATCH_KEYS } from "./component-patch-contract";
import { CHATGPT_MAX_VISUAL_CHOICES } from "./chatgpt-questions";

const utf8Bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const boundedText = (value: string, limit: number) => [...value].slice(0, limit).join("");
const optionalAssetId = (value: string | undefined) => value?.trim() ? value : undefined;

/** Read the real Editor defaults without changing the author's Scene. */
function basicComponentDefinitions(bundle: PrototypeVisualProject): NonNullable<ChatgptResourceContext["componentDefinitions"]> {
  const empty = createEmptyEntity(bundle.scene)!;
  const firstByType = new Map<SceneComponent["type"], string>();
  return EDITOR_COMPONENT_REGISTRY.filter(definition => definition.componentType !== "official-xrift"
    && definition.componentType !== "transform" && definition.componentType !== "script"
    && definition.projectKinds.includes(bundle.project.projectKind)).map(definition => {
    const type = definition.componentType === "builtin-mesh" ? "mesh" : definition.componentType as SceneComponent["type"];
    const created = addEditorComponent(empty.scene, bundle.assets, empty.entityId, definition.id, bundle.project.projectKind);
    const sample = created.scene.entities[empty.entityId].components.find(component => component.id === created.componentId) as unknown as Record<string, JsonValue> | undefined;
    const fieldsFrom = firstByType.get(type);
    if (!fieldsFrom) firstByType.set(type, definition.id);
    return { id: definition.id, label: definition.label, description: definition.id === "physics.mesh-collider" ? "Mesh Rendererが必要" : "update_component patch",
      ...(fieldsFrom ? { fieldsFrom } : {}),
      fields: (fieldsFrom ? [] : COMPONENT_PATCH_KEYS[type]).map(name => ({ name, kind: sample?.[name] !== undefined ? Array.isArray(sample[name]) ? "array" : typeof sample[name] : "json", ...(sample?.[name] !== undefined ? { defaultValue: sample[name] } : {}) })) };
  });
}

/** Summarize attachments and descendants first, then selection and surroundings. */
export function collectChatgptSceneContext(bundle: PrototypeVisualProject, selectedEntityId?: string,
  conversation: ChatgptSceneContext["conversation"] = [], attachedEntityIds: readonly string[] = []): ChatgptSceneContext {
  const result: ChatgptSceneContext = { title: boundedText(bundle.project.metadata.title ?? bundle.project.metadata.name, 100),
    ...(selectedEntityId ? { selectedEntityId } : {}), entities: [] };
  const all = Object.values(bundle.scene.entities);
  const priority = chatgptAttachmentEntityIds(all, attachedEntityIds);
  const attachedRoots = new Set(attachedEntityIds.slice(0, 100));
  if (attachedRoots.size) result.attachedEntityIds = [];
  const orderedIds = [...new Set([...priority, ...(selectedEntityId ? [selectedEntityId] : []), ...all.map(entity => entity.id)])];
  const entities = orderedIds.map(id => bundle.scene.entities[id]).filter(Boolean);
  for (const entity of entities) {
    if (result.entities.length >= 100) break;
    const transform = entity.components.find(component => component.type === "transform");
    if (!transform) continue;
    // A Scene can contain multiple Components of one type. The model needs
    // available types here; individual editable IDs are in the resource context.
    const summary = { id: entity.id, name: boundedText(entity.name, 80), ...(entity.parentId ? { parentId: entity.parentId } : {}),
      components: [...new Set(entity.components.map(component => component.type))].slice(0, 32),
      position: [...transform.position], scale: [...transform.scale], rotation: transform.rotation.map(value => value * 180 / Math.PI) };
    result.entities.push(summary);
    if (attachedRoots.has(entity.id)) result.attachedEntityIds!.push(entity.id);
    // Rust serializes integral f64 values with a decimal suffix. Leave room
    // for those suffixes across the 100 × 9 Transform values in the native copy.
    if (utf8Bytes(result) > 14 * 1024) { result.entities.pop(); if (attachedRoots.has(entity.id)) result.attachedEntityIds!.pop(); continue; }
  }
  if (!result.entities.some(entity => entity.id === selectedEntityId)) delete result.selectedEntityId;
  const included = new Set(result.entities.map(entity => entity.id));
  for (const entity of result.entities) if (entity.parentId && !included.has(entity.parentId)) delete entity.parentId;
  if (!result.attachedEntityIds?.length) delete result.attachedEntityIds;
  if (conversation.length) result.conversation = conversation;
  return result;
}

/** A bounded description of usable resources; never sends file paths or bytes. */
export function collectChatgptSceneResources(bundle: PrototypeVisualProject, entityIds: readonly string[], builtinCandidates: ChatgptBuiltinCandidate[], attachedMaterialIds: readonly string[] = []): ChatgptResourceContext {
  const sky = resolveSceneSettings(bundle.scene.settings).skybox;
  const result: ChatgptResourceContext = {
    currentSettingsJson: JSON.stringify(resolveSceneSettings(bundle.scene.settings)),
    projectAssets: [], builtinCandidates: [], components: [],
    componentDefinitions: [...listXriftComponentDefinitions(bundle.project.projectKind).map(definition => ({ id: definition.schemaId, label: definition.label, description: boundedText(definition.description, 80),
      fields: definition.fields.map(field => ({ name: field.name, kind: field.kind, required: field.required, description: boundedText(field.description, 40), ...(field.defaultValue !== undefined ? { defaultValue: field.defaultValue } : {}), ...(field.nestedDefaults ? { nestedDefaults: field.nestedDefaults } : {}), ...(field.uniqueWithinScene ? { uniqueWithinScene: true } : {}), ...(field.format ? { format: field.format } : {}),
        ...(field.range ? { range: field.range } : {}), ...(field.enumValues ? { enumValues: [...field.enumValues] } : {}), ...(field.jsonObjectProperties ? { jsonObjectProperties: field.jsonObjectProperties } : {}) } as Record<string, JsonValue>)) })), ...basicComponentDefinitions(bundle)],
    sceneSettings: { skybox: { enabled: sky.enabled, iblEnabled: sky.iblEnabled, imageAssetId: sky.imageAssetId,
      materialAssetId: sky.materialAssetId, rotationDegrees: sky.rotationDegrees, exposure: sky.exposure } },
  };
  // Keep every official field/type even when its prose would crowd out the
  // catalog. Definitions are static documentation, not the author's assets.
  if (utf8Bytes(result) > 12 * 1024) for (const definition of result.componentDefinitions ?? []) for (const field of definition.fields) delete field.description;
  // Reserve space for every shelf before large projects contribute resources.
  const firstByShelf = new Map<string, ChatgptBuiltinCandidate>();
  for (const candidate of builtinCandidates) if (!firstByShelf.has(candidate.providerId)) firstByShelf.set(candidate.providerId, candidate);
  // A broad visual selection needs to remain available even when its shelf
  // appears later in the relevance-ranked catalog.
  const firstChoices = [...firstByShelf.values(),
    ...builtinCandidates.filter(candidate => candidate.actions.includes("skybox")).slice(0, CHATGPT_MAX_VISUAL_CHOICES),
    ...builtinCandidates.filter(candidate => candidate.actions.includes("material") && !candidate.actions.includes("skybox")).slice(0, CHATGPT_MAX_VISUAL_CHOICES)];
  const firstIds = new Set(firstChoices.map(candidate => candidate.candidateId));
  const balancedCandidates = [...new Map(firstChoices.map(candidate => [candidate.candidateId, candidate])).values(), ...builtinCandidates.filter(candidate => !firstIds.has(candidate.candidateId))];
  for (const candidate of balancedCandidates.slice(0, 128)) result.builtinCandidates.push({ ...candidate,
    name: [...candidate.name].slice(0, 80).join(""), description: [...candidate.description].slice(0, 160).join("") });
  const fits = (reservedBytes = 0) => utf8Bytes(result) <= 31 * 1024 - reservedBytes;
  // The catalog must not crowd out the selected Entity's components and assets.
  while (utf8Bytes(result) > 24 * 1024 && result.builtinCandidates.length > firstIds.size) result.builtinCandidates.pop();
  // Include every attached Material before surrounding Components and Assets.
  // Only authoring values are sent; shader source and files stay in the project.
  const attached = new Set(attachedMaterialIds.slice(0, 16));
  for (const id of attached) {
    const asset = bundle.assets.assets[id];
    if (asset?.kind !== "material" || asset.status !== "ready") continue;
    const p = asset.properties;
    const propertiesJson = JSON.stringify({ pbrMetallicRoughness: {
      baseColorFactor: p.pbrMetallicRoughness.baseColorFactor, metallicFactor: p.pbrMetallicRoughness.metallicFactor, roughnessFactor: p.pbrMetallicRoughness.roughnessFactor,
    }, emissiveFactor: p.emissiveFactor, alphaMode: p.alphaMode, alphaCutoff: p.alphaCutoff, doubleSided: p.doubleSided,
      vertexColors: p.vertexColors, alphaToCoverage: p.alphaToCoverage, blending: p.blending, depthWrite: p.depthWrite });
    result.projectAssets.push({ id, kind: "material", name: boundedText(asset.name, 80), attached: true, propertiesJson,
      ...(isSkyShaderMaterialAsset(asset) ? { skyboxMaterial: true } : {}) });
  }
  while (utf8Bytes(result) > 24 * 1024 && result.builtinCandidates.length > firstIds.size) result.builtinCandidates.pop();
  // Leave room for the author's resources after surrounding Components. A
  // larger visual catalog must not fill the snapshot before Assets are read.
  const assetReserve = Math.min(3 * 1024, utf8Bytes(Object.values(bundle.assets.assets)
    .filter(asset => asset.status === "ready" && (["model", "material", "audio", "skybox"].includes(asset.kind) || isEnvironmentTextureAsset(asset))
      && !result.projectAssets.some(included => included.id === asset.id))
    .slice(0, Math.max(0, 8 - result.projectAssets.length)).map(asset => ({ id: asset.id, kind: asset.kind, name: boundedText(asset.name, 80) }))));
  // Attached targets and current values take priority over reference prose.
  // Keep catalog IDs/actions and every Component field/type/default intact.
  if (!fits(assetReserve)) for (const candidate of result.builtinCandidates) {
    candidate.name = boundedText(candidate.name, 32);
    candidate.description = boundedText(candidate.description, 48);
  }
  if (!fits(assetReserve)) for (const candidate of result.builtinCandidates) {
    candidate.name = boundedText(candidate.name, 16);
    candidate.description = "";
  }
  if (!fits(assetReserve)) for (const definition of result.componentDefinitions ?? []) {
    definition.description = "";
    for (const field of definition.fields) delete field.description;
  }
  if (!fits(assetReserve)) for (const candidate of result.builtinCandidates) candidate.name = boundedText(candidate.name, 8);
  if (!fits(assetReserve)) for (const asset of result.projectAssets) asset.name = boundedText(asset.name, 24);
  // Even maximal Unicode labels must leave exact IDs, attached appearance
  // values and every Component field available to the native planner.
  if (!fits(assetReserve)) {
    for (const candidate of result.builtinCandidates) candidate.name = boundedText(candidate.name, 4);
    for (const asset of result.projectAssets) asset.name = boundedText(asset.name, 4);
  }
  for (const id of new Set(entityIds)) {
    for (const component of bundle.scene.entities[id]?.components ?? []) {
      const type = component.type;
      if (type === "animation") continue;
      const definition = EDITOR_COMPONENT_REGISTRY.find(definition => (definition.componentType === type
        || type === "mesh" && definition.componentType === "builtin-mesh")
        && (type !== "light" || definition.lightType === component.lightType)
        && (type !== "collider" || definition.id === (component.shape === "box" ? "physics.box-collider" : "physics.mesh-collider")));
      const basicProperties = type !== "xrift-component" ? Object.fromEntries(COMPONENT_PATCH_KEYS[type].filter(key => key in component)
        .map(key => [key, (component as unknown as Record<string, JsonValue>)[key]])) : undefined;
      result.components.push({ entityId: id, componentId: component.id, type,
        ...(type !== "xrift-component" ? { ...(definition ? { definitionId: definition.id } : {}), enabled: component.enabled,
          ...(JSON.stringify(basicProperties).length <= 1200 ? { propertiesJson: JSON.stringify(basicProperties) } : {}) } : {}),
        ...(type === "xrift-component" ? { definitionId: component.schemaId, enabled: component.enabled, ...(JSON.stringify(component.properties).length <= 1200 ? { propertiesJson: JSON.stringify(component.properties) } : {}) } : {}),
        ...(type === "mesh" ? { modelAssetId: bundle.assets.assets[component.geometryAssetId]?.kind === "model" ? optionalAssetId(component.geometryAssetId) : undefined } : {}),
        ...(type === "audio-source" ? { audio: { audioAssetId: optionalAssetId(component.audioAssetId), enabled: component.enabled, volume: component.volume,
          loop: component.loop, spatial: component.spatial, autoplay: component.autoplay } } : {}) });
      if (result.components.length > 128 || !fits(assetReserve)) { result.components.pop(); break; }
    }
  }
  const referenced = new Set(result.components.flatMap(component => [component.modelAssetId, component.audio?.audioAssetId]).concat([sky.imageAssetId, sky.materialAssetId]));
  for (const asset of Object.values(bundle.assets.assets).sort((a, b) => Number(referenced.has(b.id)) - Number(referenced.has(a.id)))) {
    if (result.projectAssets.some(included => included.id === asset.id)) continue;
    if (asset.status !== "ready") continue;
    const kind = isEnvironmentTextureAsset(asset) || asset.kind === "skybox" ? "hdri" : asset.kind;
    if (kind !== "model" && kind !== "material" && kind !== "audio" && kind !== "hdri") continue;
    result.projectAssets.push({ id: asset.id, kind, name: [...asset.name].slice(0, 80).join(""),
      ...(isSkyShaderMaterialAsset(asset) ? { skyboxMaterial: true } : {}) });
    if (result.projectAssets.length > 128 || !fits()) { result.projectAssets.pop(); break; }
  }
  return result;
}
