import { analyzeComponentCode, applyComponentCodeImportPlan, type ComponentCodeImportNode } from "./component-code-import";
import type { PrototypeVisualProject } from "./prototype-project";
import type { SceneComponent, SceneEntity } from "./scene-document";
import type { MaterialAsset } from "./asset-manifest";
import { createEmptyEntity } from "./editor-session";
import { sha256Utf8 } from "./compiler/hash";
import { ChatgptPlanInputError } from "./chatgpt-plan-recovery";
import { ChatgptSceneConflictError } from "./chatgpt-plan-guards";
import { isR3fSceneAuthoring, r3fManagedEntityId, R3F_SCENE_MAX_NODES, type R3fSceneAuthoring } from "./r3f-scene-source";
import { validateR3fStaticSource } from "./r3f-static-source";
import { getXriftComponentDefinition } from "./component-registry";

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) : record(value)
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)])) : value;
const equal = (a: unknown, b: unknown) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const cleanAsset = (asset: MaterialAsset) => { const { thumbnail: _thumbnail, ...rest } = asset; return rest; };

/** Three-way field merge: persistent Inspector changes are retained as overrides. */
function mergeValue(previous: unknown, generated: unknown, current: unknown): unknown {
  if (equal(previous, current)) return structuredClone(generated);
  if (equal(previous, generated)) return structuredClone(current);
  if (record(previous) && record(generated) && record(current)) {
    const result: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(previous), ...Object.keys(generated), ...Object.keys(current)])) {
      const value = mergeValue(previous[key], generated[key], current[key]);
      if (value !== undefined) result[key] = value;
    }
    return result;
  }
  if (Array.isArray(previous) && Array.isArray(generated) && Array.isArray(current)
    && previous.length === generated.length && previous.length === current.length && previous.every(value => typeof value === "number")) {
    return previous.map((value, index) => mergeValue(value, generated[index], current[index]));
  }
  return structuredClone(current);
}

function explicitKeyCounts(nodes: ComponentCodeImportNode[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const node of nodes) if (node.sourceKey && node.sourceKey !== "$xrift-geometry") counts.set(node.sourceKey, (counts.get(node.sourceKey) ?? 0) + 1);
  return counts;
}

/** Canonical keys remain fixed once saved, including their historical parent
 * path. Only globally unique explicit JSX keys can anchor a move to that key. */
function stableNodeKeys(nodes: ComponentCodeImportNode[], anchors: ReadonlyMap<string, string> = new Map()): Map<string, string> {
  const keys = new Map<string, string>(), used = new Set<string>();
  const reserved = new Set(nodes.flatMap(node => node.sourceKey && anchors.has(node.sourceKey) ? [anchors.get(node.sourceKey)!] : []));
  for (const node of nodes) {
    const parent = node.parentPlanNodeId ? keys.get(node.parentPlanNodeId) : "";
    const ownKey = node.sourceKey ?? node.name;
    const anchor = node.sourceKey ? anchors.get(node.sourceKey) : undefined;
    let key = anchor ?? `${parent}/${JSON.stringify(ownKey)}`;
    // A newly inserted wrapper may occupy an anchor's historical path. Give
    // that scoped node a distinct path instead of taking the saved identity.
    if (anchor === undefined && reserved.has(key)) key = `${parent}/$xrift-scope/${JSON.stringify(ownKey)}`;
    if (parent === undefined || !ownKey || used.has(key) || key.length > 2048) throw new ChatgptPlanInputError(`R3Fの部品「${node.name}」に、同じ親の中で重複しないnameかkeyを付けてください`);
    keys.set(node.planNodeId, key); used.add(key);
  }
  return keys;
}

function previousIdentityKeys(previous: R3fSceneAuthoring | undefined, projectKind: PrototypeVisualProject["project"]["projectKind"]): Map<string, string> {
  const anchors = new Map<string, string>();
  if (!previous) return anchors;
  for (const [key, node] of Object.entries(previous.nodes)) if (node.identityKey) anchors.set(node.identityKey, key);
  // Version 1 originals saved before identityKey existed still contain their
  // exact source. Recover only an explicit key whose scoped node is owned by
  // that original; names alone never establish identity across parents.
  const previousNodes = analyzeComponentCode(previous.source, projectKind).nodes;
  const counts = explicitKeyCounts(previousNodes);
  const keys = stableNodeKeys(previousNodes, anchors);
  for (const node of previousNodes) if (node.sourceKey && counts.get(node.sourceKey) === 1) {
    const key = keys.get(node.planNodeId)!;
    if (previous.nodes[key]) anchors.set(node.sourceKey, key);
  }
  return anchors;
}

function remapEntity(entity: SceneEntity, node: ComponentCodeImportNode, id: string, parentId: string | null, ids: ReadonlyMap<string, string>, materialIds: ReadonlyMap<string, string>, baseline?: SceneEntity): SceneEntity {
  const counts = new Map<string, number>();
  return { ...entity, id, parentId, children: entity.children.map(child => ids.get(child)!), components: entity.components.map(component => {
    const index = counts.get(component.type) ?? 0; counts.set(component.type, index + 1);
    const next = structuredClone(component);
    const priorComponent = baseline?.components.filter(item => item.type === component.type)[index];
    next.id = priorComponent?.id ?? `${id}-${component.type}-${index}`;
    if (next.type === "mesh") next.materialBindings = next.materialBindings.map(binding => ({ ...binding, materialAssetId: materialIds.get(binding.materialAssetId) ?? binding.materialAssetId }));
    if (next.type === "xrift-component") {
      const declared = node.xriftComponents.find(item => item.schemaId === next.schemaId)?.properties ?? {};
      for (const field of getXriftComponentDefinition(next.schemaId)?.fields ?? []) if (field.uniqueWithinScene && declared[field.name] === undefined) {
        const previous = priorComponent?.type === "xrift-component" && priorComponent.schemaId === next.schemaId ? priorComponent.properties[field.name] : undefined;
        const hash = sha256Utf8(`${id}:${next.schemaId}:${field.name}`);
        next.properties[field.name] = previous ?? `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
      }
    }
    return next;
  }) };
}

function mergeEntity(previous: SceneEntity, generated: SceneEntity, current: SceneEntity, overriddenMaterials: ReadonlySet<string>): SceneEntity {
  const { components: _oldComponents, children: _oldChildren, ...oldFields } = previous;
  const { components: _newComponents, children: _newChildren, ...newFields } = generated;
  const { components: _currentComponents, children: _currentChildren, ...currentFields } = current;
  const result = mergeValue(oldFields, newFields, currentFields) as SceneEntity;
  const oldById = new Map(previous.components.map(component => [component.id, component]));
  const currentById = new Map(current.components.map(component => [component.id, component]));
  const newById = new Map(generated.components.map(component => [component.id, component]));
  const components: SceneComponent[] = [];
  for (const component of generated.components) {
    const old = oldById.get(component.id), actual = currentById.get(component.id);
    if (old && !actual) continue; // An author explicitly removed this Component.
    let merged = old && actual ? mergeValue(old, component, actual) as SceneComponent : structuredClone(component);
    if (merged.type === "mesh" && actual?.type === "mesh" && actual.materialBindings.some(binding => overriddenMaterials.has(binding.materialAssetId))) {
      merged = { ...merged, materialBindings: structuredClone(actual.materialBindings) };
    }
    components.push(merged);
  }
  for (const actual of current.components) if (!newById.has(actual.id)) {
    const old = oldById.get(actual.id);
    if (old?.type === "mesh" && (!equal(old, actual) || old.materialBindings.some(binding => overriddenMaterials.has(binding.materialAssetId))
      || !equal(previous.components.find(component => component.type === "transform"), current.components.find(component => component.type === "transform"))
      || !equal(previous.children, current.children) || current.components.some(component => !oldById.has(component.id)))) {
      throw new ChatgptSceneConflictError(`「${current.name}」の形状構成が変わるため、手動編集した形状・Transform・Material・子Entity・Componentを保持して制作を停止しました`);
    }
    if (!old || !equal(old, actual)) components.push(structuredClone(actual));
  }
  result.components = components;
  result.children = []; // Rebuilt from merged parent IDs, preserving manual children.
  return result;
}

/** Validate generated code before any earlier step can modify the Scene. */
export async function validateChatgptR3fSource(source: string, projectKind: PrototypeVisualProject["project"]["projectKind"]) {
  try { await validateR3fStaticSource(source); }
  catch (error) { throw new ChatgptPlanInputError(`R3Fのコードを確認してください: ${error instanceof Error ? error.message : String(error)}`); }
  const plan = analyzeComponentCode(source, projectKind);
  const diagnostic = plan.diagnostics.find(item => item.severity !== "info");
  if (diagnostic) throw new ChatgptPlanInputError(`${diagnostic.line ? `${diagnostic.line}行目: ` : ""}${diagnostic.message}`);
  if (!plan.nodes.length || plan.nodes.length > R3F_SCENE_MAX_NODES) throw new ChatgptPlanInputError(`R3Fは1回で1〜${R3F_SCENE_MAX_NODES}個のEntityになる範囲で制作してください`);
  if (plan.assetDependencies.length) throw new ChatgptPlanInputError("R3F内から外部ファイルを参照せず、配置済みの素材は通常の素材操作で追加してください");
  for (const node of plan.nodes) if (node.kind === "primitive" && !node.material) throw new ChatgptPlanInputError(`「${node.name}」の形状に、colorを指定したMaterialを付けてください`);
  return plan;
}

/** One bounded, atomic in-memory Scene update. No source code is executed and
 * no partial import reaches the Editor if parsing or conversion fails. */
export async function applyChatgptR3fScene(bundle: PrototypeVisualProject, operation: {
  kind: "r3f-scene"; name: string; source: string; entityId?: string;
}, options: { prompt?: string; checkCurrent?: () => void } = {}): Promise<{ bundle: PrototypeVisualProject; entityId: string }> {
  const check = () => options.checkCurrent?.();
  check();
  const plan = await validateChatgptR3fSource(operation.source, bundle.project.projectKind);
  check();
  let working = bundle;
  let root = operation.entityId ? bundle.scene.entities[operation.entityId] : undefined;
  if (operation.entityId && (!root?.codeAuthoring || !isR3fSceneAuthoring(root.codeAuthoring))) throw new ChatgptPlanInputError("R3Fの制作原本を持つEntityを指定してください");
  const previous = root?.codeAuthoring;
  if (previous && root) {
    const owned = new Set(Object.values(previous.nodes).map(node => node.entityId));
    const referencedMaterials = new Set<string>();
    for (const [key, node] of Object.entries(previous.nodes)) {
      const baseline = JSON.parse(node.baseline) as SceneEntity;
      if (node.entityId !== r3fManagedEntityId(root.id, key) || baseline.parentId !== root.id && !owned.has(baseline.parentId ?? "")
        || baseline.children.some(id => !owned.has(id))) throw new ChatgptSceneConflictError("R3Fの部品と制作原本の対応が一致しません。現在のSceneを保持して停止しました");
      for (const component of baseline.components) if (component.type === "mesh") for (const binding of component.materialBindings) referencedMaterials.add(binding.materialAssetId);
    }
    for (const [id, json] of Object.entries(previous.materials)) {
      const baseline = JSON.parse(json) as MaterialAsset;
      if (baseline.id !== id || baseline.kind !== "material" || !record(baseline.properties)
        || !referencedMaterials.has(id) && id !== `asset-r3f-${sha256Utf8(`${root.id}:${JSON.stringify(stable(baseline.properties))}`).slice(0, 28)}`) {
        throw new ChatgptSceneConflictError("R3FのMaterialと制作原本の対応が一致しません。現在の素材を保持して停止しました");
      }
    }
  }
  if (previous?.source === operation.source) return { bundle, entityId: root!.id };
  const anchors = previousIdentityKeys(previous, bundle.project.projectKind);
  const keyCounts = explicitKeyCounts(plan.nodes);
  for (const key of anchors.keys()) if ((keyCounts.get(key) ?? 0) > 1) throw new ChatgptPlanInputError(`R3Fのkey「${key}」が複数の部品に使われています。既存の部品を維持できるよう、一意なkeyにしてください`);
  const keys = stableNodeKeys(plan.nodes, anchors);
  if (!root) {
    const created = createEmptyEntity(bundle.scene, null, operation.name);
    if (!created) throw new ChatgptPlanInputError("R3Fの配置先を作成できませんでした");
    working = { ...bundle, scene: created.scene }; root = working.scene.entities[created.entityId];
  }
  const rootId = root.id;
  // Exclude author-owned Materials from matching by color. A material with a
  // custom Shader/texture must never be substituted for a generated PBR value.
  const filteredAssets = { ...bundle.assets, assets: Object.fromEntries(Object.entries(bundle.assets.assets).filter(([, asset]) => asset.kind !== "material")) };
  const imported = applyComponentCodeImportPlan({ scene: { ...bundle.scene, rootEntityIds: [], entities: {} }, assets: filteredAssets, projectKind: bundle.project.projectKind, plan });
  const error = imported.diagnostics.find(item => item.severity !== "info");
  if (error || imported.entityIds.length !== plan.nodes.length) throw new ChatgptPlanInputError(error?.message ?? "R3Fの全ての部品を変換できませんでした");
  check();
  const entityIds = new Map<string, string>();
  for (let index = 0; index < plan.nodes.length; index++) {
    const key = keys.get(plan.nodes[index].planNodeId)!;
    entityIds.set(imported.entityIds[index], previous?.nodes[key]?.entityId ?? r3fManagedEntityId(rootId, key));
  }
  const assets = { ...working.assets.assets };
  const materialIds = new Map<string, string>();
  const generatedMaterials: Record<string, string> = {};
  const overriddenMaterials = new Set<string>();
  for (const [id, baseline] of Object.entries(previous?.materials ?? {})) {
    const actual = assets[id];
    if (actual?.kind === "material" && !equal(cleanAsset(actual), JSON.parse(baseline))) overriddenMaterials.add(id);
  }
  for (const material of Object.values(imported.assets.assets)) {
    if (material.kind !== "material") continue;
    const id = `asset-r3f-${sha256Utf8(`${rootId}:${JSON.stringify(stable(material.properties))}`).slice(0, 28)}`;
    materialIds.set(material.id, id);
    const next: MaterialAsset = { ...material, id, name: [...`${operation.name}: ${material.name}`].slice(0, 80).join(""), folderId: null };
    generatedMaterials[id] = JSON.stringify(cleanAsset(next));
    const actual = assets[id];
    if (actual && !previous?.materials[id]) {
      // A previous palette may have left this root's Material in Assets for a
      // Prefab or another Scene. Reuse it only when its rendering data matches
      // the canonical generated value; never overwrite an edited old palette.
      const reusable = actual.kind === "material" && equal(cleanAsset(actual), {
        ...cleanAsset(next), name: actual.name, folderId: actual.folderId, source: actual.source,
      });
      if (!reusable) throw new ChatgptSceneConflictError("R3Fの保存先Materialが既に使われています。現在の素材を保持して停止しました");
      generatedMaterials[id] = JSON.stringify(cleanAsset(actual as MaterialAsset));
      continue;
    }
    if (!actual || !overriddenMaterials.has(id)) assets[id] = next;
  }
  const entities = { ...working.scene.entities };
  const nodes: R3fSceneAuthoring["nodes"] = {};
  const hidden = new Set<string>();
  for (let index = 0; index < plan.nodes.length; index++) {
    const node = plan.nodes[index], key = keys.get(node.planNodeId)!, source = imported.scene.entities[imported.entityIds[index]];
    const id = entityIds.get(source.id)!, parentId = source.parentId ? entityIds.get(source.parentId)! : rootId;
    const old = previous?.nodes[key];
    const generated = remapEntity(source, node, id, parentId, entityIds, materialIds, old ? JSON.parse(old.baseline) as SceneEntity : undefined);
    if (old && !bundle.scene.entities[id] || hidden.has(parentId)) hidden.add(id);
    nodes[key] = { entityId: id, baseline: JSON.stringify(generated), ...(node.sourceKey && keyCounts.get(node.sourceKey) === 1 ? { identityKey: node.sourceKey } : {}) };
    if (hidden.has(id)) continue;
    const actual = bundle.scene.entities[id];
    if (actual && !old) throw new ChatgptSceneConflictError("R3Fの保存先Entityが既に使われています。手動編集を保持して停止しました");
    entities[id] = old && actual ? mergeEntity(JSON.parse(old.baseline) as SceneEntity, generated, actual, overriddenMaterials) : generated;
  }
  const wanted = new Set(Object.values(nodes).map(node => node.entityId));
  for (const node of Object.values(previous?.nodes ?? {})) if (!wanted.has(node.entityId)) {
    const actual = entities[node.entityId];
    if (!actual) continue;
    if (!equal(actual, JSON.parse(node.baseline))) throw new ChatgptSceneConflictError(`「${actual.name}」は手動編集されています。削除せず、その内容を保って制作を停止しました`);
    delete entities[node.entityId];
  }
  // Reconstruct hierarchy from the merged parent IDs. Current order wins for
  // existing children; newly generated children append in code order.
  const children = new Map<string, string[]>();
  for (const entity of Object.values(entities)) if (entity.parentId) {
    if (!entities[entity.parentId]) throw new ChatgptSceneConflictError("手動編集した子Entityの親を削除できません。現在の階層を保持して停止しました");
    const list = children.get(entity.parentId) ?? []; list.push(entity.id); children.set(entity.parentId, list);
  }
  for (const entity of Object.values(entities)) {
    const desired = children.get(entity.id) ?? [];
    const currentOrder = working.scene.entities[entity.id]?.children ?? [];
    const ordered = [...currentOrder.filter(id => desired.includes(id)), ...desired.filter(id => !currentOrder.includes(id))];
    if (!equal(entity.children, ordered)) entities[entity.id] = { ...entity, children: ordered };
  }
  const authoring: R3fSceneAuthoring = { version: 1, source: operation.source, originalPrompt: previous?.originalPrompt ?? options.prompt ?? "", revision: (previous?.revision ?? 0) + 1, nodes, materials: generatedMaterials };
  for (const [id, baseline] of Object.entries(previous?.materials ?? {})) if (!(id in generatedMaterials)) {
    const used = Object.values(entities).some(entity => entity.components.some(component => component.type === "mesh" && component.materialBindings.some(binding => binding.materialAssetId === id)));
    if (used) authoring.materials[id] = baseline;
    // Other Scenes and Prefabs can reuse this Asset. The current bundle does
    // not contain every Scene, so code regeneration never deletes Materials.
  }
  const visualRoot = { ...entities[rootId] }; delete visualRoot.codeAuthoring;
  const previousRoot = { ...bundle.scene.entities[rootId] }; delete previousRoot.codeAuthoring;
  const beforeEntities = { ...bundle.scene.entities, [rootId]: previousRoot };
  const afterEntities = { ...entities, [rootId]: visualRoot };
  if (previous && equal(beforeEntities, afterEntities) && equal(bundle.assets.assets, assets)) return { bundle, entityId: rootId };
  if (!isR3fSceneAuthoring(authoring)) throw new ChatgptPlanInputError("R3Fの制作原本が保存上限を超えています。制作する部品を減らしてください");
  entities[rootId] = { ...entities[rootId], codeAuthoring: authoring };
  const roots = [...working.scene.rootEntityIds.filter(id => entities[id] && !entities[id].parentId)];
  for (const entity of Object.values(entities)) if (!entity.parentId && !roots.includes(entity.id)) roots.push(entity.id);
  check();
  return { bundle: { ...working, scene: { ...working.scene, entities, rootEntityIds: roots }, assets: { ...working.assets, assets } }, entityId: rootId };
}
