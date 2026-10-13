import type { SceneDocument } from "./scene-document";
export const MAX_WORLD_ITEM_IDS = 50;

/** Code projects declare their Item IDs explicitly; do not silently discard invalid entries. */
export function parseWorldItemIdsInput(input: string): string[] {
  const ids = input.split(/[,\r\n]+/).map((value) => value.trim()).filter(Boolean);
  for (const id of ids) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new Error("Item IDにはUUIDを入力してください。URLではなく、末尾のIDを指定します。");
    }
  }
  const unique = [...new Set(ids.map((id) => id.toLowerCase()))];
  if (unique.length > MAX_WORLD_ITEM_IDS) throw new Error(`ワールドに登録できるItem IDは${MAX_WORLD_ITEM_IDS}種類までです。`);
  return unique;
}

/** The expanded entry Scene is the source of world.items for both output modes. */
export function collectWorldItemIds(scene: SceneDocument | null): string[] {
  if (!scene) return [];
  const ids = new Set<string>();
  const visited = new Set<string>();
  const pending = [...scene.rootEntityIds];
  while (pending.length) {
    const entityId = pending.pop()!;
    if (visited.has(entityId)) continue;
    visited.add(entityId);
    const entity = scene.entities[entityId];
    if (!entity) continue;
    pending.push(...entity.children);
    for (const component of entity.components) {
      if (component.type !== "xrift-component" || component.schemaId !== "xrift.item") continue;
      const id = component.properties.itemId;
      if (typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) ids.add(id.toLowerCase());
    }
  }
  return [...ids].sort();
}
