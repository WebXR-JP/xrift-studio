import type { ModelAsset } from "../../lib/visual-editor/asset-manifest";

type Slots = ModelAsset["materialSlots"];
const NODE_SLOTS = new WeakMap<ModelAsset, { byIndex: Map<number, Slots>; byName: Map<string, Slots> }>();

/** A node expanded into an Entity needs only its own materials. Resolving the
 * entire model's slots per node creates N×M texture hooks and React subtrees. */
export function getModelNodeMaterialSlots(model: ModelAsset, nodeIndex?: number, nodeName?: string): Slots {
  if (nodeIndex === undefined && !nodeName) return model.materialSlots;
  const nodes = model.importMetadata?.nodes;
  if (!nodes) return model.materialSlots;
  let index = NODE_SLOTS.get(model);
  if (!index) {
    index = { byIndex: new Map(), byName: new Map() };
    const slotsBySourceIndex = new Map<number, Slots>();
    for (const slot of model.materialSlots) {
      if (slot.sourceMaterialIndex === undefined) continue;
      const slots = slotsBySourceIndex.get(slot.sourceMaterialIndex) ?? [];
      slots.push(slot);
      slotsBySourceIndex.set(slot.sourceMaterialIndex, slots);
    }
    for (const node of nodes) {
      const slots = node.sourceMaterialIndices.flatMap(id => slotsBySourceIndex.get(id) ?? []);
      index.byIndex.set(node.sourceNodeIndex, slots);
      if (!index.byName.has(node.name)) index.byName.set(node.name, slots);
    }
    NODE_SLOTS.set(model, index);
  }
  return (nodeIndex !== undefined ? index.byIndex.get(nodeIndex) : index.byName.get(nodeName!)) ?? model.materialSlots;
}
