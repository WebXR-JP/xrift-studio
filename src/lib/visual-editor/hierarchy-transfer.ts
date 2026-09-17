import type { AssetManifest } from "./asset-manifest";
import type { PrototypeVisualProject } from "./prototype-project";
import type { RegisteredSceneComponent, SceneDocument, SceneEntity, TransformComponent } from "./scene-document";
import { getXriftComponentDefinition } from "./component-registry";
import { createDocumentId } from "./document-id";
import { resolvePrefabInstances } from "./compiler/prefab-resolver";
import { validateBrowserRelativePath } from "../browser-project-storage";
import { hierarchyMatrixTransform, hierarchyTransformMatrix, hierarchyWorldMatrix, inverseHierarchyMatrix, multiplyHierarchyMatrices } from "./hierarchy-transform";

export const HIERARCHY_TRANSFER_MANIFEST = ".xrift-studio/hierarchy-transfer.json";
export const HIERARCHY_TRANSFER_MAX_BYTES = 256 * 1024 * 1024;
export const HIERARCHY_TRANSFER_MAX_FILES = 512;
export type HierarchyPlacement = "world" | "local" | "origin";
export type HierarchyTransfer = { bundle: PrototypeVisualProject; warnings: string[] };
export type PreparedHierarchyTransfer = HierarchyTransfer & { files: Map<string, Uint8Array> };
export type HierarchyImportPlan = {
  bundle: PrototypeVisualProject;
  rootEntityIds: string[];
  files: Map<string, Uint8Array>;
  warnings: string[];
  entityIdMap: Record<string, string>;
  assetIdMap: Record<string, string>;
};

const SPECIAL_ENTITIES = new Set(["__xrift_scene__", "__xrift_self__", "__xrift_player__"]);
const ID_FIELDS = /(?:AssetId|TextureId)$/;
const TEXT_FIELDS = new Set(["name", "text", "content", "label", "description", "url", "vertexShader", "fragmentShader", "sourceModulePath"]);
const hasOwn = (object: object, key: string): boolean => Object.prototype.hasOwnProperty.call(object, key);
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

/** Enumerate true roots once, even when both an ancestor and its child are selected. */
export function hierarchySelectionRoots(scene: SceneDocument, ids: readonly string[]): string[] {
  const selected = new Set(ids);
  for (const id of selected) if (!hasOwn(scene.entities, id)) throw new Error(`Entityが見つかりません: ${id}`);
  const rootCache = new Map<string, string | null>();
  const selectedRoot = (id: string): string | null => {
    const chain: string[] = [];
    const visited = new Set<string>();
    let cursor: string | null = id;
    while (cursor !== null && !rootCache.has(cursor)) {
      if (visited.has(cursor)) throw new Error("Hierarchyが循環しています。");
      visited.add(cursor);
      if (!hasOwn(scene.entities, cursor)) throw new Error(`親Entityが見つかりません: ${cursor}`);
      chain.push(cursor);
      cursor = scene.entities[cursor].parentId;
    }
    let root = cursor === null ? null : rootCache.get(cursor)!;
    for (const ancestor of chain.reverse()) {
      if (root === null && selected.has(ancestor)) root = ancestor;
      rootCache.set(ancestor, root);
    }
    return rootCache.get(id) ?? null;
  };
  const roots = [...selected].filter((id) => selectedRoot(id) === id);
  if (selected.size && !roots.length) throw new Error("Hierarchyの親子関係を確認してください。");
  return roots;
}

function selectedEntities(scene: SceneDocument, roots: readonly string[]): Record<string, SceneEntity> {
  const entities: Record<string, SceneEntity> = Object.create(null);
  const stack = roots.map((id) => ({ id, parentId: scene.entities[id]?.parentId }));
  let count = 0;
  while (stack.length) {
    const { id, parentId } = stack.pop()!;
    const entity = scene.entities[id];
    if (!entity || entity.parentId !== parentId || hasOwn(entities, id)) throw new Error("Hierarchyの親子関係が不正です。");
    entities[id] = structuredClone(entity);
    if (++count > 20_000) throw new Error("一度に受け渡せるEntityは20,000件までです。");
    for (const childId of entity.children) stack.push({ id: childId, parentId: id });
  }
  return entities;
}

function visit(value: unknown, visitor: (key: string, value: unknown, owner: Record<string, unknown>) => void): void {
  const pending: unknown[] = [value];
  let visited = 0;
  while (pending.length) {
    const current = pending.pop();
    if (++visited > 1_000_000) throw new Error("受け渡すデータが複雑すぎます。選択範囲を減らしてください。");
    if (Array.isArray(current)) { for (const item of current) pending.push(item); continue; }
    if (!isRecord(current)) continue;
    // Declarations may precede properties in JSON. Rewrite properties while
    // their declared IDs still refer to the source, then process typed fields.
    const keys = Object.keys(current);
    if (keys.includes("properties")) visitor("properties", current.properties, current);
    for (const key of keys) {
      if (key !== "properties") visitor(key, current[key], current);
      if (!TEXT_FIELDS.has(key) && key !== "importedFromModel") pending.push(current[key]);
    }
  }
}

export function collectHierarchyAssetReferences(value: unknown): Set<string> {
  const ids = new Set<string>();
  visit(value, (key, child, owner) => {
    // Ignore this provenance field only; do not remove a real dependency that
    // another field already added to the same set.
    if (key === "geometryAssetId" && owner.type === "mesh" && isRecord(owner.geometry) && owner.geometry.kind !== "asset") return;
    if (key === "sourceModelAssetId" && owner.kind === "classic-r3f") return;
    if ((ID_FIELDS.test(key) || key === "assetId") && typeof child === "string" && child) ids.add(child);
    if (key === "assetReferences" && Array.isArray(child)) for (const id of child) if (typeof id === "string" && id) ids.add(id);
    // KHR_interactivity action configuration stores Asset IDs in value arrays.
    if (key === "asset" && isRecord(child) && Array.isArray(child.value)) for (const id of child.value) if (typeof id === "string" && id) ids.add(id);
  });
  return ids;
}

function remapPropertyReferences(value: unknown, mapping: ReadonlyMap<string, string>, key = ""): unknown {
  if (TEXT_FIELDS.has(key)) return value;
  if (typeof value === "string") return mapping.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => remapPropertyReferences(item, mapping));
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, remapPropertyReferences(item, mapping, name)]));
}

/** Only typed reference fields and explicitly declared property references are rewritten. Never rewrite code or labels. */
function rewriteAssetReferences<T>(value: T, mapping: ReadonlyMap<string, string>): T {
  const result = structuredClone(value);
  visit(result, (key, child, owner) => {
    if ((ID_FIELDS.test(key) || key === "assetId") && typeof child === "string") owner[key] = mapping.get(child) ?? child;
    if (key === "assetReferences" && Array.isArray(child)) owner[key] = child.map((id) => typeof id === "string" ? mapping.get(id) ?? id : id);
    if (key === "asset" && isRecord(child) && Array.isArray(child.value)) child.value = child.value.map((id) => typeof id === "string" ? mapping.get(id) ?? id : id);
    if (key === "properties" && Array.isArray(owner.assetReferences)) {
      // The Component's declaration is authoritative for custom property names.
      const declared = new Map(owner.assetReferences.filter((id): id is string => typeof id === "string").map((id) => [id, mapping.get(id) ?? id]));
      owner[key] = remapPropertyReferences(child, declared);
    }
  });
  return result;
}

function rewriteEntityReferences<T>(value: T, entityIds: ReadonlyMap<string, string>, componentIds: ReadonlyMap<string, string>, warnings: Set<string>, ownerName: string): T {
  const result = structuredClone(value);
  const missing = new Set<string>();
  const mappedIds = new Set(entityIds.values());
  const resolve = (id: string): string => {
    if (!id || SPECIAL_ENTITIES.has(id) || mappedIds.has(id)) return id;
    const replacement = entityIds.get(id);
    if (replacement !== undefined) return replacement;
    missing.add(id);
    return "";
  };
  // Properties can use arbitrary names when entityReferences declares them.
  visit(result, (key, child, owner) => {
    if (key === "properties" && Array.isArray(owner.entityReferences)) {
      const map = new Map(owner.entityReferences.filter((id): id is string => typeof id === "string").map((id) => [id, resolve(id)]));
      owner[key] = remapPropertyReferences(child, map);
    }
    if (key === "entityReferences" && Array.isArray(child)) owner[key] = child.map((id) => typeof id === "string" ? resolve(id) : id).filter(Boolean);
    if (/EntityId$/.test(key) && key !== "sourceEntityId" && typeof child === "string") owner[key] = resolve(child);
    if (key === "entityId" && typeof child === "string") owner[key] = resolve(child);
    // Rewrite action Component IDs in the scope of the original target Entity.
    if (key === "configuration" && isRecord(child)) {
      const entity = isRecord(child.entity) && Array.isArray(child.entity.value) ? child.entity.value[0] : undefined;
      const component = isRecord(child.component) && Array.isArray(child.component.value) ? child.component.value[0] : undefined;
      if (typeof entity === "string") {
        if (typeof component === "string" && isRecord(child.component)) child.component.value = [componentIds.get(`${entity}/${component}`) ?? component];
        (child.entity as Record<string, unknown>).value = [resolve(entity)];
      }
    }
  });
  if (missing.size) {
    warnings.add(`「${ownerName}」は選択外のEntityを参照しています。追加後に参照先を設定してください。`);
    if (isRecord(result) && "enabled" in result) (result as Record<string, unknown>).enabled = false;
  }
  return result;
}

/** Build an editable snapshot, not a published/flattened model. Scene settings and publication IDs never travel. */
export function createHierarchyTransfer(source: PrototypeVisualProject, ids: readonly string[], placement: HierarchyPlacement = "world"): HierarchyTransfer {
  const roots = hierarchySelectionRoots(source.scene, ids);
  if (!roots.length) throw new Error("書き出すEntityを選択してください。");
  const entities = selectedEntities(source.scene, roots);
  for (const entity of Object.values(entities)) {
    if (entity.modelNode && !entities[entity.modelNode.modelEntityId]) throw new Error(`「${entity.name}」はModel内部のEntityです。Model本体を選択してください。`);
  }
  for (const root of roots) {
    const entity = entities[root];
    entity.parentId = null;
    if (placement !== "local" && source.scene.entities[root].parentId !== null) {
      const transform = entity.components.find((component): component is TransformComponent => component.type === "transform");
      if (transform) Object.assign(transform, hierarchyMatrixTransform(hierarchyWorldMatrix(source.scene, root)));
    }
  }
  if (placement === "origin") {
    const pivot = entities[roots[0]].components.find((component): component is TransformComponent => component.type === "transform")?.position ?? [0, 0, 0];
    const offset = [...pivot];
    for (const root of roots) {
      const transform = entities[root].components.find((component): component is TransformComponent => component.type === "transform");
      if (transform) transform.position = [transform.position[0] - offset[0], transform.position[1] - offset[1], transform.position[2] - offset[2]];
    }
  }
  const scene: SceneDocument = { schemaVersion: source.scene.schemaVersion, sceneId: createDocumentId("scene"), name: roots.length === 1 ? entities[roots[0]].name : `${source.scene.name} の選択`, rootEntityIds: roots, entities };
  const hasPrefab = Object.values(entities).some((entity) => entity.components.some((component) => component.type === "prefab-instance"));
  const resolved = hasPrefab ? resolvePrefabInstances(scene, source.assets, source.prefabs) : { scene, diagnostics: [], referencedPrefabAssetIds: [] };
  const blocked = resolved.diagnostics.filter((diagnostic) => diagnostic.severity === "blocking");
  if (blocked.length) throw new Error(blocked.map((diagnostic) => diagnostic.message).join("\n"));
  const warnings = new Set(resolved.diagnostics.map((diagnostic) => diagnostic.message));
  if (resolved.referencedPrefabAssetIds.length) warnings.add("Prefabは現在の内容を展開して受け渡します。元Prefabとの同期は引き継ぎません。");
  // The runtime resolver intentionally skips disabled Prefabs. Never silently
  // lose an editable instance that the user could enable again after transfer.
  if (Object.values(resolved.scene.entities).some((entity) => entity.components.some((component) => component.type === "prefab-instance"))) {
    throw new Error("無効なPrefab、または無効な親の中のPrefabが含まれています。有効にするか展開してから書き出してください。");
  }
  const assetIds = new Set<string>();
  const pending = [...collectHierarchyAssetReferences(Object.values(resolved.scene.entities))];
  const assets: AssetManifest = { schemaVersion: source.assets.schemaVersion, assets: Object.create(null) };
  while (pending.length) {
    const id = pending.pop()!;
    if (assetIds.has(id)) continue;
    const asset = source.assets.assets[id];
    if (!asset) throw new Error(`参照している素材が見つかりません: ${id}`);
    if (asset.kind === "template") throw new Error(`「${asset.name}」は実行時に参照するTemplateです。Hierarchyへ展開してから選択してください。`);
    if (asset.status !== "ready") throw new Error(`素材「${asset.name}」を取り込み直してから書き出してください。`);
    assetIds.add(id);
    assets.assets[id] = structuredClone(asset);
    if (assets.assets[id].thumbnail) assets.assets[id].thumbnail = { status: "missing" };
    for (const reference of collectHierarchyAssetReferences(asset)) pending.push(reference);
  }
  const folders = source.assets.folders ?? {};
  const folderIds = new Set<string>();
  for (const asset of Object.values(assets.assets)) {
    let id = asset.folderId;
    const seen = new Set<string>();
    while (id) {
      if (seen.has(id) || !folders[id]) throw new Error("Assetsのフォルダー構成を確認してください。");
      seen.add(id); folderIds.add(id); id = folders[id].parentId;
    }
    if ((asset.kind === "material" || asset.kind === "texture") && asset.importedFromModel && !assetIds.has(asset.importedFromModel.modelAssetId)) delete asset.importedFromModel;
    if (asset.kind === "material" && asset.shader?.kind === "classic-r3f" && asset.shader.sourceModelAssetId && !assetIds.has(asset.shader.sourceModelAssetId)) delete asset.shader.sourceModelAssetId;
  }
  if (folderIds.size) assets.folders = Object.fromEntries([...folderIds].map((id) => [id, structuredClone(folders[id])]));
  const entityMap = new Map(Object.keys(resolved.scene.entities).map((id) => [id, id]));
  const componentMap = new Map(Object.values(resolved.scene.entities).flatMap((entity) => entity.components.map((component) => [`${entity.id}/${component.id}`, component.id] as const)));
  for (const entity of Object.values(resolved.scene.entities)) {
    entity.components = entity.components.filter((component) => component.type !== "prefab-instance").map((component) => {
      const next = rewriteEntityReferences(component, entityMap, componentMap, warnings, entity.name);
      // A fragment is also a normal project archive. Opening that archive must
      // not execute imported code in Edit mode before the user can inspect it.
      if (next.type === "script" && next.runIn === "play-and-edit") {
        next.runIn = "play";
        warnings.add("Editでも動くScriptはPlayのみへ変更しました。内容を確認してから実行してください。");
      }
      return next;
    });
  }
  for (const [id, asset] of Object.entries(assets.assets)) {
    if (asset.kind === "interactivity") assets.assets[id] = rewriteEntityReferences(asset, entityMap, componentMap, warnings, asset.name);
    if (asset.kind === "script") warnings.add("Scriptのソースは変更しません。コードに直接書いたEntity ID・Asset ID・外部URLは追加後に確認してください。");
  }
  const now = new Date().toISOString();
  const { lastPublication: _publication, ...project } = source.project;
  return { bundle: {
    project: { ...project, projectId: createDocumentId("project"), entrySceneId: scene.sceneId, scenePaths: { [scene.sceneId]: "scenes/hierarchy.scene.json" }, assetManifestPath: "assets/manifest.json", metadata: { ...project.metadata, name: scene.name, title: scene.name, createdAt: now, updatedAt: now } },
    scene: resolved.scene, assets, prefabs: {},
  }, warnings: [...warnings] };
}

export function hierarchyTransferMetadata(transfer: HierarchyTransfer): Uint8Array {
  return encoder.encode(JSON.stringify({ format: "xrift-studio-hierarchy", formatVersion: 1, sourceProjectKind: transfer.bundle.project.projectKind, warnings: transfer.warnings }, null, 2));
}

export function readHierarchyTransferWarnings(files: ReadonlyMap<string, Uint8Array>): string[] {
  const bytes = files.get(HIERARCHY_TRANSFER_MANIFEST);
  if (!bytes) return [];
  if (bytes.byteLength > 1024 * 1024) throw new Error("Hierarchyの情報が大きすぎます。");
  const metadata: unknown = JSON.parse(decoder.decode(bytes));
  if (!isRecord(metadata) || metadata.format !== "xrift-studio-hierarchy" || metadata.formatVersion !== 1 || !Array.isArray(metadata.warnings) || metadata.warnings.length > 20_000 || !metadata.warnings.every((message) => typeof message === "string" && message.length <= 4096)) throw new Error("このHierarchyファイルのバージョンには対応していません。");
  return metadata.warnings as string[];
}

function sourcePaths(assets: AssetManifest): Set<string> {
  const paths = new Set<string>();
  for (const asset of Object.values(assets.assets)) {
    visit(asset, (key, child, owner) => {
      if (key === "relativePath" && owner.kind === "project" && typeof child === "string") paths.add(validateBrowserRelativePath(child));
      if (key === "derivedPath" && typeof child === "string") paths.add(validateBrowserRelativePath(child));
    });
  }
  return paths;
}

function relativeDependency(from: string, uri: string): string {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/|\\)/i.test(uri)) throw new Error(`外部ファイルの参照を取り込めません: ${uri}`);
  const parts = from.split("/").slice(0, -1);
  for (const part of decodeURIComponent(uri).split("/")) {
    if (part === "." || part === "") continue;
    if (part === "..") { if (!parts.length) throw new Error("素材の参照がプロジェクトの外を指しています。"); parts.pop(); }
    else parts.push(part);
  }
  return validateBrowserRelativePath(parts.join("/"));
}

/** Collect bytes before changing the destination. Paths remain relative under one namespaced import directory. */
export async function prepareHierarchyTransferFiles(transfer: HierarchyTransfer, read: (path: string) => Promise<Uint8Array>): Promise<PreparedHierarchyTransfer> {
  const files = new Map<string, Uint8Array>();
  const pending = [...sourcePaths(transfer.bundle.assets)];
  let total = 0;
  while (pending.length) {
    const path = validateBrowserRelativePath(pending.pop()!);
    if (files.has(path)) continue;
    if (files.size >= HIERARCHY_TRANSFER_MAX_FILES) throw new Error("一度に受け渡せる素材ファイルは512件までです。選択範囲を減らしてください。");
    let bytes: Uint8Array;
    try { bytes = new Uint8Array(await read(path)); } catch { throw new Error(`素材のファイルを読み込めません: ${path}`); }
    if (bytes.length === 0 || bytes.length > 128 * 1024 * 1024) throw new Error(`素材は1ファイル128 MB以下にしてください: ${path}`);
    total += bytes.length;
    if (total > HIERARCHY_TRANSFER_MAX_BYTES) throw new Error("素材の合計が256 MBを超えています。選択範囲を減らしてください。");
    files.set(path, bytes);
    if (/\.gltf$/i.test(path)) {
      const gltf: unknown = JSON.parse(decoder.decode(bytes));
      if (!isRecord(gltf)) throw new Error(`glTFを読み込めません: ${path}`);
      for (const collection of [gltf.buffers, gltf.images]) if (Array.isArray(collection)) for (const item of collection) {
        if (isRecord(item) && typeof item.uri === "string" && !item.uri.startsWith("data:")) pending.push(relativeDependency(path, item.uri));
      }
    }
    if (/\.obj$/i.test(path)) for (const line of decoder.decode(bytes).split(/\r?\n/)) {
      const match = /^\s*mtllib\s+(.+?)\s*$/.exec(line);
      if (match) pending.push(relativeDependency(path, match[1]));
    }
    if (/\.mtl$/i.test(path)) for (const line of decoder.decode(bytes).split(/\r?\n/)) {
      const match = /^\s*(?:map_\w+|bump|disp|decal|refl)\s+(.+?)\s*$/i.exec(line);
      if (match) {
        if (match[1].startsWith("-")) throw new Error("オプション付きMTLはGLBに変換してから書き出してください。");
        pending.push(relativeDependency(path, match[1]));
      }
    }
    // Script runtime supports registered bare modules only. Project-relative
    // imports are already rejected by its contract; do not guess or execute code.
  }
  return { ...transfer, files };
}

/** Fresh IDs and a fresh managed directory on every paste: no accidental merging or overwrite. */
export function planHierarchyImport(target: PrototypeVisualProject, prepared: PreparedHierarchyTransfer, options: { parentId?: string | null; placement?: HierarchyPlacement } = {}): HierarchyImportPlan {
  const parentId = options.parentId ?? null;
  if (parentId !== null && !hasOwn(target.scene.entities, parentId)) throw new Error("追加先のEntityが見つかりません。選び直してください。");
  const source = prepared.bundle;
  const warnings = new Set(prepared.warnings);
  const entityIdMap = Object.fromEntries(Object.keys(source.scene.entities).map((id) => [id, createDocumentId("entity")]));
  const entityMap = new Map(Object.entries(entityIdMap));
  const assetIdMap = Object.fromEntries(Object.keys(source.assets.assets).map((id) => [id, createDocumentId("asset")]));
  const assetMap = new Map(Object.entries(assetIdMap));
  const componentMap = new Map(Object.values(source.scene.entities).flatMap((entity) => entity.components.map((component) => [`${entity.id}/${component.id}`, createDocumentId("component")] as const)));
  const folderMap = new Map(Object.keys(source.assets.folders ?? {}).map((id) => [id, createDocumentId("folder")]));
  const importFolderId = createDocumentId("folder");
  const prefix = `assets/imported/${createDocumentId("hierarchy")}`;
  const pathMap = new Map([...prepared.files.keys()].map((path) => [path, validateBrowserRelativePath(`${prefix}/${validateBrowserRelativePath(path)}`)]));
  const files = new Map([...prepared.files].map(([path, bytes]) => [pathMap.get(path)!, bytes]));
  const assets = { ...target.assets.assets };
  for (const asset of Object.values(source.assets.assets)) {
    let next = rewriteAssetReferences(asset, assetMap);
    if (next.kind === "interactivity") next = rewriteEntityReferences(next, entityMap, componentMap, warnings, asset.name);
    next.id = assetMap.get(asset.id)!;
    next.folderId = asset.folderId ? folderMap.get(asset.folderId) ?? importFolderId : importFolderId;
    if ((next.kind === "material" || next.kind === "texture") && next.importedFromModel) next.importedFromModel.modelAssetId = assetMap.get(next.importedFromModel.modelAssetId) ?? next.importedFromModel.modelAssetId;
    visit(next, (key, child, owner) => {
      if ((key === "relativePath" && owner.kind === "project") || key === "derivedPath") {
        if (typeof child !== "string" || !pathMap.has(child)) throw new Error(`素材のファイルが不足しています: ${String(child)}`);
        owner[key] = pathMap.get(child)!;
      }
    });
    assets[next.id] = next;
  }
  const entities: Record<string, SceneEntity> = { ...target.scene.entities };
  const rootSet = new Set(source.scene.rootEntityIds);
  const parentInverse = parentId && (options.placement ?? "world") === "world" ? inverseHierarchyMatrix(hierarchyWorldMatrix(target.scene, parentId)) : null;
  const firstTransform = source.scene.entities[source.scene.rootEntityIds[0]]?.components.find((component): component is TransformComponent => component.type === "transform");
  const pivot = firstTransform?.position ?? [0, 0, 0];
  for (const entity of Object.values(source.scene.entities)) {
    const id = entityMap.get(entity.id)!;
    const next = rewriteAssetReferences(entity, assetMap);
    next.id = id;
    next.parentId = rootSet.has(entity.id) ? parentId : entityMap.get(entity.parentId!) ?? null;
    next.children = entity.children.map((child) => entityMap.get(child)!);
    if (next.modelNode) next.modelNode.modelEntityId = entityMap.get(entity.modelNode!.modelEntityId)!;
    next.components = next.components.map((component): RegisteredSceneComponent => {
      const mapped = rewriteEntityReferences(component, entityMap, componentMap, warnings, entity.name);
      mapped.id = componentMap.get(`${entity.id}/${component.id}`)!;
      // Imported scripts must not run in Edit mode before their author can review them.
      if (mapped.type === "script" && mapped.runIn === "play-and-edit") { mapped.runIn = "play"; warnings.add("Editでも動くScriptはPlayのみへ変更しました。内容を確認してから実行してください。"); }
      if (mapped.type === "xrift-component") {
        const definition = getXriftComponentDefinition(mapped.schemaId);
        if (!definition || !definition.allowedProjectKinds.includes(target.project.projectKind)) {
          mapped.enabled = false;
          warnings.add(`「${entity.name}」の${definition?.label ?? mapped.schemaId}は追加先で使えないため無効にしました。設定は保持しています。`);
        }
        for (const field of definition?.fields ?? []) {
          if (field.uniqueWithinScene && typeof mapped.properties[field.name] === "string") {
            mapped.properties[field.name] = createDocumentId("imported");
          }
        }
      }
      if (mapped.type === "spawn-point") mapped.target = target.project.projectKind === "world" ? "player" : "item-preview";
      return mapped;
    });
    if (rootSet.has(entity.id)) {
      const transform = next.components.find((component): component is TransformComponent => component.type === "transform");
      if (transform && parentInverse) Object.assign(transform, hierarchyMatrixTransform(multiplyHierarchyMatrices(parentInverse, hierarchyTransformMatrix(transform))));
      if (transform && options.placement === "origin") transform.position = [transform.position[0] - pivot[0], transform.position[1] - pivot[1], transform.position[2] - pivot[2]];
    }
    entities[id] = next;
  }
  const rootEntityIds = source.scene.rootEntityIds.map((id) => entityMap.get(id)!);
  if (parentId) entities[parentId] = { ...entities[parentId], children: [...entities[parentId].children, ...rootEntityIds] };
  const folders = { ...target.assets.folders };
  if (Object.keys(source.assets.assets).length) folders[importFolderId] = { id: importFolderId, name: source.project.metadata.title || "読み込んだ素材", parentId: null, order: Object.keys(folders).length };
  for (const folder of Object.values(source.assets.folders ?? {})) {
    const id = folderMap.get(folder.id)!;
    folders[id] = { ...folder, id, parentId: folder.parentId ? folderMap.get(folder.parentId) ?? importFolderId : importFolderId };
  }
  return { bundle: {
    ...target,
    project: { ...target.project, metadata: { ...target.project.metadata, updatedAt: new Date().toISOString() } },
    scene: { ...target.scene, rootEntityIds: parentId ? target.scene.rootEntityIds : [...target.scene.rootEntityIds, ...rootEntityIds], entities },
    assets: { ...target.assets, assets, folders },
  }, rootEntityIds, files, warnings: [...warnings], entityIdMap, assetIdMap };
}

// Session clipboard deliberately lives outside React. It survives opening another
// world/item, but contains a byte snapshot rather than paths into a closed project.
let clipboard: PreparedHierarchyTransfer | null = null;
export function getHierarchyClipboard(): PreparedHierarchyTransfer | null { return clipboard; }
export function setHierarchyClipboard(value: PreparedHierarchyTransfer | null): void { clipboard = value; }

/** Explicit Item/World export conversion, with the same compatibility rules as import. */
export function withHierarchyProjectKind(prepared: PreparedHierarchyTransfer, projectKind: "world" | "item"): PreparedHierarchyTransfer {
  if (prepared.bundle.project.projectKind === projectKind) return prepared;
  const source = prepared.bundle;
  const target: PrototypeVisualProject = {
    ...source, project: { ...source.project, projectKind },
    scene: { ...source.scene, rootEntityIds: [], entities: {} },
    assets: { schemaVersion: source.assets.schemaVersion, assets: {} }, prefabs: {},
  };
  const plan = planHierarchyImport(target, prepared, { placement: "local" });
  return { bundle: plan.bundle, files: plan.files, warnings: plan.warnings };
}
