import catalog from "./chatgpt-editor-actions.json";
import type { ChatgptOperation, ChatgptResourceContext } from "./chatgpt-resources";
import { getXriftComponentDefinition, isSerializableJsonValue, validateXriftComponentFieldValue } from "./component-registry";
import type { JsonObject } from "./scene-document";
import type { PrototypeVisualProject } from "./prototype-project";
import { ChatgptPlanInputError } from "./chatgpt-plan-recovery";
import { normalizeChatgptSkyboxPatch } from "./chatgpt-skybox";
import { COMPONENT_PATCH_KEYS } from "./component-patch-contract";
import { EDITOR_COMPONENT_REGISTRY } from "./editor-session";
import type { SceneComponent } from "./scene-document";

export { default as CHATGPT_EDITOR_ACTIONS } from "./chatgpt-editor-actions.json";
export type ChatgptEditorAction =
  | { kind: "component-add"; entityId?: string; definitionId: string; name?: string; position?: [number, number, number]; propertiesJson?: string; enabled?: boolean }
  | { kind: "component-update"; entityId: string; componentId: string; propertiesJson?: string; enabled?: boolean }
  | { kind: "component-remove"; entityId: string; componentId: string }
  | { kind: "material-update"; candidateId: string; propertiesJson: string }
  | { kind: "scene-settings"; settingsJson: string }
  | { kind: "entity-delete"; entityId: string };

export function parseChatgptSceneSettings(value: string): JsonObject {
  const patch = parseChatgptComponentProperties(value);
  const sections = ["shadowMapType", "skybox", "fog", "ambient", "camera", "postprocessing", "vegetation", "physics", "editor"];
  if (!Object.keys(patch).length || Object.keys(patch).some(key => !sections.includes(key))) throw new ChatgptPlanInputError("Sceneで変更する設定を確認できません");
  const sky = patch.skybox;
  // Asset selection belongs to the existing candidate validation path.
  if (sky && typeof sky === "object" && !Array.isArray(sky) && ("imageAssetId" in sky || "materialAssetId" in sky)) throw new ChatgptPlanInputError("Skyboxの素材は利用できる候補から選んでください");
  return patch;
}

export function parseChatgptComponentProperties(value?: string): JsonObject {
  if (value === undefined) return {};
  if (typeof value !== "string" || value.length > 6000) throw new ChatgptPlanInputError("Componentの設定値を確認できません");
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new ChatgptPlanInputError("Componentの設定値はJSONオブジェクトで指定してください"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !isSerializableJsonValue(parsed)) throw new ChatgptPlanInputError("Componentの設定値は有限数値を含むJSONオブジェクトで指定してください");
  return parsed as JsonObject;
}

/** Material edits use the existing MCP patch shape without shader/asset creation. */
export function parseChatgptMaterialProperties(value: string): JsonObject {
  const patch = parseChatgptComponentProperties(value);
  const invalid = () => new ChatgptPlanInputError("Materialの色・質感・透過の設定値を確認してください");
  if (!Object.keys(patch).length || Object.keys(patch).some(key => !["pbrMetallicRoughness", "color", "roughness", "metalness", "opacity", "emissiveFactor", "alphaMode", "alphaCutoff", "doubleSided", "vertexColors", "blending", "depthWrite", "alphaToCoverage"].includes(key))) throw invalid();
  const unit = (number: unknown) => typeof number === "number" && Number.isFinite(number) && number >= 0 && number <= 1;
  if (patch.color !== undefined && (typeof patch.color !== "string" || !/^#(?:[a-f\d]{3}|[a-f\d]{6})$/iu.test(patch.color))) throw invalid();
  if (patch.roughness !== undefined && !unit(patch.roughness) || patch.metalness !== undefined && !unit(patch.metalness)) throw invalid();
  for (const key of ["opacity", "alphaCutoff"]) if (patch[key] !== undefined && !unit(patch[key])) throw invalid();
  for (const key of ["doubleSided", "vertexColors", "alphaToCoverage"]) if (patch[key] !== undefined && typeof patch[key] !== "boolean") throw invalid();
  for (const [key, choices] of [["alphaMode", ["OPAQUE", "MASK", "BLEND"]], ["blending", ["normal", "additive", "multiply", "subtractive"]], ["depthWrite", ["auto", "on", "off"]]] as const) if (patch[key] !== undefined && (typeof patch[key] !== "string" || !(choices as readonly string[]).includes(patch[key]))) throw invalid();
  if (patch.emissiveFactor !== undefined && (!Array.isArray(patch.emissiveFactor) || patch.emissiveFactor.length !== 3 || !patch.emissiveFactor.every(value => typeof value === "number" && Number.isFinite(value) && value >= 0))) throw invalid();
  if (patch.pbrMetallicRoughness !== undefined) {
    const pbr = patch.pbrMetallicRoughness;
    if (!pbr || typeof pbr !== "object" || Array.isArray(pbr) || !Object.keys(pbr).length || Object.keys(pbr).some(key => !["baseColorFactor", "roughnessFactor", "metallicFactor"].includes(key))) throw invalid();
    if (pbr.baseColorFactor !== undefined && (!Array.isArray(pbr.baseColorFactor) || pbr.baseColorFactor.length !== 4 || !pbr.baseColorFactor.every(unit))) throw invalid();
    if (pbr.roughnessFactor !== undefined && !unit(pbr.roughnessFactor) || pbr.metallicFactor !== undefined && !unit(pbr.metallicFactor)) throw invalid();
    if ((patch.color !== undefined || patch.opacity !== undefined) && pbr.baseColorFactor !== undefined || patch.roughness !== undefined && pbr.roughnessFactor !== undefined || patch.metalness !== undefined && pbr.metallicFactor !== undefined) throw invalid();
  }
  return patch;
}

function validateProperties(definitionId: string, properties: JsonObject) {
  const editorDefinition = EDITOR_COMPONENT_REGISTRY.find(definition => definition.id === definitionId);
  if (editorDefinition && editorDefinition.componentType !== "official-xrift") {
    const type = editorDefinition.componentType === "builtin-mesh" ? "mesh" : editorDefinition.componentType;
    validateBasicProperties(type, properties);
    return;
  }
  const definition = getXriftComponentDefinition(definitionId);
  if (!definition) throw new ChatgptPlanInputError("利用できる公式Componentを選んでください");
  for (const [name, value] of Object.entries(properties)) {
    const field = definition.fields.find(field => field.name === name);
    if (!field) throw new ChatgptPlanInputError(`${definition.label}.${name}は設定できません`);
    const failure = validateXriftComponentFieldValue(value, field);
    if (failure) throw new ChatgptPlanInputError(`${definition.label}.${name}: ${failure.message}`);
  }
}

function validateBasicProperties(type: SceneComponent["type"], properties: JsonObject) {
  const keys: readonly string[] = COMPONENT_PATCH_KEYS[type];
  const unsupported = Object.keys(properties).find(key => !keys.includes(key));
  if (unsupported) throw new ChatgptPlanInputError(`${type}.${unsupported}は設定できません`);
}

export function validateChatgptEditorAction(operation: Record<string, unknown>, resources: ChatgptResourceContext, entityIds: readonly string[]) {
  const spec = catalog.find(spec => spec.kind === operation.kind);
  if (!spec || typeof operation.kind !== "string" || !Object.prototype.hasOwnProperty.call(handlers, operation.kind)) return false;
  if (operation.kind === "scene-settings") {
    if (typeof operation.settingsJson !== "string") throw new ChatgptPlanInputError("Sceneの設定値を確認できません");
    parseChatgptSceneSettings(operation.settingsJson);
    return true;
  }
  if (operation.kind === "material-update") {
    if (typeof operation.candidateId !== "string" || !operation.candidateId.startsWith("project:") || !resources.projectAssets.some(asset => asset.kind === "material" && `project:${asset.id}` === operation.candidateId)) throw new ChatgptPlanInputError("編集するMaterialをプロジェクトの素材から選んでください");
    if (typeof operation.propertiesJson !== "string") throw new ChatgptPlanInputError("Materialの設定値を確認できません");
    parseChatgptMaterialProperties(operation.propertiesJson);
    return true;
  }
  if (operation.entityId !== undefined && (typeof operation.entityId !== "string" || !entityIds.includes(operation.entityId))) throw new ChatgptPlanInputError("操作対象のEntityを確認できません");
  if (operation.kind !== "component-add" && operation.entityId === undefined) throw new ChatgptPlanInputError("操作対象のEntityが必要です");
  if (operation.kind === "entity-delete") return true;
  const target = resources.components.find(component => component.entityId === operation.entityId && component.componentId === operation.componentId);
  if (operation.kind === "component-remove") {
    if (!target || target.type === "transform") throw new ChatgptPlanInputError("取り外すComponentを確認できません。TransformはEntityに必須です");
    return true;
  }
  if (operation.kind === "component-add" && !resources.componentDefinitions?.some(def => def.id === operation.definitionId)) throw new ChatgptPlanInputError("利用できるComponentを選んでください");
  if (operation.kind === "component-update" && !target) throw new ChatgptPlanInputError("設定するComponentを確認できません");
  if (operation.kind === "component-update" && target?.type !== "xrift-component") {
    validateBasicProperties(target!.type, parseChatgptComponentProperties(operation.propertiesJson as string | undefined));
    if (operation.propertiesJson === undefined && operation.enabled === undefined) throw new ChatgptPlanInputError("Componentで変更する設定がありません");
    return true;
  }
  const definitionId = operation.kind === "component-add" ? operation.definitionId : resources.components.find(component => component.entityId === operation.entityId && component.componentId === operation.componentId)?.definitionId;
  if (typeof definitionId !== "string") throw new ChatgptPlanInputError("公式Componentの定義を確認できません");
  validateProperties(definitionId, parseChatgptComponentProperties(operation.propertiesJson as string | undefined));
  if (operation.kind === "component-update" && operation.propertiesJson === undefined && operation.enabled === undefined) throw new ChatgptPlanInputError("Componentで変更する設定がありません");
  return true;
}

type Apply = (tool: "create_empty_entity" | "add_component" | "update_component" | "remove_component" | "update_transform" | "delete_entity" | "update_scene_settings" | "update_material_asset", args: Record<string, unknown>) => Record<string, unknown>;
/** Fixed handlers use the same Editor operations, validation and history as MCP. */
const handlers: { [K in ChatgptEditorAction["kind"]]: (operation: Extract<ChatgptEditorAction, { kind: K }>, bundle: PrototypeVisualProject, apply: Apply) => string | undefined } = {
  "material-update": (operation, bundle, apply) => {
    const assetId = operation.candidateId.startsWith("project:") ? operation.candidateId.slice(8) : "";
    if (!Object.prototype.hasOwnProperty.call(bundle.assets.assets, assetId) || bundle.assets.assets[assetId]?.kind !== "material") throw new ChatgptPlanInputError("編集するMaterialがプロジェクトにありません");
    apply("update_material_asset", { materialAssetId: assetId, patch: parseChatgptMaterialProperties(operation.propertiesJson) });
    return undefined;
  },
  "scene-settings": (operation, bundle, apply) => {
    const patch = parseChatgptSceneSettings(operation.settingsJson);
    if (patch.skybox && typeof patch.skybox === "object" && !Array.isArray(patch.skybox)) patch.skybox = normalizeChatgptSkyboxPatch(bundle, patch.skybox) as JsonObject;
    apply("update_scene_settings", patch);
    return undefined;
  },
  "entity-delete": (operation, _bundle, apply) => { apply("delete_entity", { entityId: operation.entityId }); return undefined; },
  "component-remove": (operation, _bundle, apply) => { apply("remove_component", { entityId: operation.entityId, componentId: operation.componentId }); return operation.entityId; },
  "component-add": (operation, bundle, apply) => {
    const definition = EDITOR_COMPONENT_REGISTRY.find(definition => definition.id === operation.definitionId);
    if (!definition || !definition.projectKinds.includes(bundle.project.projectKind)) throw new ChatgptPlanInputError("利用できるComponentを選んでください");
    const properties = parseChatgptComponentProperties(operation.propertiesJson);
    validateProperties(definition.id, properties);
    const entityId = operation.entityId ?? String(apply("create_empty_entity", { name: operation.name ?? definition.label }).entityId);
    const componentId = apply("add_component", { entityId, definitionId: definition.id }).componentId;
    if (Object.keys(properties).length || operation.enabled !== undefined) apply("update_component", { entityId, componentId, patch: { ...(definition.componentType === "official-xrift" ? { properties } : properties), ...(operation.enabled !== undefined ? { enabled: operation.enabled } : {}) } });
    if (operation.position) apply("update_transform", { entityId, position: operation.position });
    return entityId;
  },
  "component-update": (operation, bundle, apply) => {
    const component = bundle.scene.entities[operation.entityId]?.components.find(component => component.id === operation.componentId);
    if (!component) throw new ChatgptPlanInputError("設定するComponentを確認できません");
    const properties = parseChatgptComponentProperties(operation.propertiesJson);
    if (component.type === "xrift-component") validateProperties(component.schemaId, properties);
    else validateBasicProperties(component.type, properties);
    apply("update_component", { entityId: operation.entityId, componentId: operation.componentId, patch: { ...(component.type === "xrift-component" ? { properties } : properties), ...(operation.enabled !== undefined ? { enabled: operation.enabled } : {}) } });
    return operation.entityId;
  },
};

export function isChatgptEditorAction(operation: ChatgptOperation): operation is ChatgptEditorAction { return Object.prototype.hasOwnProperty.call(handlers, operation.kind); }
export function applyChatgptEditorAction(operation: ChatgptEditorAction, bundle: PrototypeVisualProject, apply: Apply) {
  // The discriminant and handler come from the same registry key.
  const handler = handlers[operation.kind] as (value: ChatgptEditorAction, bundle: PrototypeVisualProject, apply: Apply) => string | undefined;
  const checkedApply: Apply = (tool, args) => {
    const result = apply(tool, args);
    const error = Array.isArray(result.diagnostics) ? result.diagnostics.find(value => value && typeof value === "object" && value.severity === "error") : undefined;
    if (error) throw new ChatgptPlanInputError(typeof error.message === "string" ? error.message : "公式Componentの設定を確認してください");
    return result;
  };
  return handler(operation, bundle, checkedApply);
}
