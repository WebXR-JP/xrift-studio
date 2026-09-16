import type { PrototypeVisualProject } from "./prototype-project";
import { validateXriftComponents } from "./component-registry";
import { collectHierarchyAssetReferences } from "./hierarchy-transfer";

export type AuthoringDiagnostic = {
  severity: "error" | "warning";
  code: string;
  message: string;
  entityId?: string;
  assetId?: string;
  componentId?: string;
};

/** Local, explicit document inspection. Does not read files, execute scripts or send events. */
export function collectAuthoringDiagnostics(bundle: PrototypeVisualProject): AuthoringDiagnostic[] {
  const result: AuthoringDiagnostic[] = [];
  const { scene, assets } = bundle;
  const visited = new Set<string>();
  const add = (issue: AuthoringDiagnostic) => { if (result.length < 1000) result.push(issue); };
  const refs = (value: unknown, context: Pick<AuthoringDiagnostic, "entityId" | "assetId" | "componentId">) => {
    try {
      for (const id of collectHierarchyAssetReferences(value)) {
        if (!Object.prototype.hasOwnProperty.call(assets.assets, id)) add({ ...context, severity: "error", code: "asset-reference-missing", message: `参照しているAssetが見つかりません：${id}` });
      }
    } catch {
      add({ ...context, severity: "warning", code: "inspection-limit", message: "データが複雑なため、一部の参照を確認できませんでした。" });
    }
  };
  for (const asset of Object.values(assets.assets)) {
    if (asset.status === "missing" || asset.status === "invalid") add({ severity: "warning", code: `asset-${asset.status}`, assetId: asset.id,
      message: asset.status === "missing" ? `「${asset.name}」の元ファイルが見つかりません。再インポートしてください。` : `「${asset.name}」を読み込めません。Assetsの設定を確認してください。` });
    // Provenance and thumbnails are not rendering dependencies.
    refs(asset, { assetId: asset.id });
  }
  refs(scene.settings, {});
  for (const root of scene.rootEntityIds) {
    if (!scene.entities[root]) add({ severity: "error", code: "root-missing", message: `シーン直下のEntityが見つかりません：${root}` });
  }
  const roots = new Set(scene.rootEntityIds);
  for (const entity of Object.values(scene.entities)) {
    const context = { entityId: entity.id };
    const parent = entity.parentId ? scene.entities[entity.parentId] : undefined;
    if (entity.parentId && !parent) add({ ...context, severity: "error", code: "parent-missing", message: `「${entity.name}」の親Entityが見つかりません。` });
    if ((parent && !parent.children.includes(entity.id)) || (!entity.parentId && !roots.has(entity.id))) add({ ...context, severity: "error", code: "hierarchy-link", message: `「${entity.name}」の親子関係が一致していません。` });
    const uniqueChildren = new Set<string>();
    for (const child of entity.children) {
      if (uniqueChildren.has(child) || !scene.entities[child] || scene.entities[child].parentId !== entity.id) add({ ...context, severity: "error", code: "child-link", message: `「${entity.name}」の子Entityの参照が不正です：${child}` });
      uniqueChildren.add(child);
    }
    // Completed parent chains are cached, avoiding quadratic scans on deep hierarchies.
    const chain = new Set<string>();
    let cursor: string | null = entity.id;
    while (cursor && !visited.has(cursor) && scene.entities[cursor]) {
      if (chain.has(cursor)) { add({ ...context, severity: "error", code: "hierarchy-cycle", message: `「${entity.name}」の親子関係が循環しています。` }); break; }
      chain.add(cursor); cursor = scene.entities[cursor].parentId;
    }
    for (const id of chain) visited.add(id);
    refs(entity.modelNode, context);
    const componentIds = new Set<string>();
    for (const component of entity.components) {
      const located = { ...context, componentId: component.id };
      if (componentIds.has(component.id)) add({ ...located, severity: "error", code: "component-id-duplicate", message: `「${entity.name}」でComponentのIDが重複しています。` });
      componentIds.add(component.id);
      refs(component, located);
      if (component.type === "transform") {
        if ([...component.position, ...component.rotation, ...component.scale].some((value) => !Number.isFinite(value))) add({ ...located, severity: "error", code: "transform-invalid", message: `「${entity.name}」のTransformに不正な数値があります。` });
        else if (component.scale.some((value) => Math.abs(value) < 0.000001)) add({ ...located, severity: "warning", code: "scale-zero", message: `「${entity.name}」のScaleがほぼ0です。表示・当たり判定・親子の移動を確認してください。` });
      }
      if (component.type === "collider" && component.enabled === false) add({ ...located, severity: "warning", code: "collider-disabled", message: `「${entity.name}」のColliderが無効です。当たり判定を使う場合は有効にしてください。` });
    }
  }
  for (const issue of validateXriftComponents(scene, bundle.project.projectKind)) {
    add({ severity: issue.severity, code: issue.code, message: issue.message, entityId: issue.entityId, componentId: issue.componentId });
  }
  if (result.length === 1000) result.push({ severity: "warning", code: "result-limit", message: "先頭1,000件を表示しています。問題を修正してから確認し直してください。" });
  return result.sort((a, b) => Number(a.severity === "warning") - Number(b.severity === "warning"));
}
