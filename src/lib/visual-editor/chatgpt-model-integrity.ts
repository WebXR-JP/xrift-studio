import type { PrototypeVisualProject } from "./prototype-project";
import { expandModelEntityHierarchy } from "./model-hierarchy";

const authored = (value: unknown) => JSON.stringify(value, (_key, item) =>
  typeof item === "number" && Number.isFinite(item) ? Number(item.toPrecision(12)) :
    item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);

/** A geometry recipe cannot silently replace Inspector overrides made before
 * the request. Later concurrent edits are also protected by Scene snapshots. */
export function assertBlenderModelSourceCurrent(bundle: PrototypeVisualProject, entityId: string, modelAssetId: string) {
  const model = bundle.assets.assets[modelAssetId];
  if (model?.kind !== "model" || !model.authoring) return;
  const message = "モデル内部やMaterialに手動編集があります。その編集を保つため形状の再制作を停止しました。元の版へ戻すか、変更対象を確認してください";
  for (const slot of model.materialSlots) {
    const material = slot.defaultMaterialAssetId ? bundle.assets.assets[slot.defaultMaterialAssetId] : undefined;
    if (material?.kind !== "material" || !material.importedFromModel || material.importedFromModel.modelAssetId !== model.id
      || material.importedFromModel.sourceHash !== model.sourceHash || material.importedFromModel.isUserOverridden) throw new Error(message);
  }
  const root = bundle.scene.entities[entityId];
  if (!root) throw new Error(message);
  const expectedBindings = model.materialSlots.flatMap(slot => slot.defaultMaterialAssetId ? [{ slot: slot.slot, materialAssetId: slot.defaultMaterialAssetId }] : []);
  for (const mesh of root.components.filter(component => component.type === "mesh")) {
    if (authored(mesh.materialBindings) !== authored(expectedBindings)) throw new Error(message);
  }
  const prefixes = [`${entityId}-model-node-`, `${entityId}-openbrush-node-`];
  const ownedNode = (id: string) => prefixes.some(prefix => id.startsWith(prefix) && /^\d+$/u.test(id.slice(prefix.length)));
  if (!Object.keys(bundle.scene.entities).some(ownedNode)) return;
  const expected = expandModelEntityHierarchy(bundle.scene, bundle.assets, model, entityId);
  for (const [id, entity] of Object.entries(expected.entities)) {
    if (ownedNode(id) && authored(entity) !== authored(bundle.scene.entities[id])) throw new Error(message);
  }
}
