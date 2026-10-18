import type { PrototypeVisualProject } from "./prototype-project";
import type { SceneAsset } from "./asset-manifest";
import { chatgptAttachmentEntityIds } from "./chatgpt-attachments";
import { createStarterVisualProject } from "./starter-templates";

/** These are placeholders in the blank World, not author-created content. */
const disposableStarterIds = ["starter-floor", "starter-box"] as const;
type Baseline = { id: string; entity: string; assets: [string, string][] };
let baseline: Baseline[] | undefined;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value)
    .filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

function authoredAsset(asset: SceneAsset | undefined): string {
  if (!asset) return canonical(null);
  const { thumbnail: _thumbnail, ...authored } = asset;
  return canonical(authored);
}

function blankBaseline(): Baseline[] {
  if (baseline) return baseline;
  const blank = createStarterVisualProject("world", "blank");
  baseline = disposableStarterIds.map(id => {
    const entity = blank.scene.entities[id];
    const assetIds = new Set(entity.components.flatMap(component => component.type === "mesh"
      ? [component.geometryAssetId, ...(component.geometry?.kind === "asset" ? [component.geometry.assetId] : []),
        ...component.materialBindings.map(binding => binding.materialAssetId)] : []));
    return { id, entity: canonical(entity), assets: [...assetIds].map(assetId => [assetId, authoredAsset(blank.assets.assets[assetId])]) };
  });
  return baseline;
}

/** An ID/name alone never proves that an Entity can be replaced. Compare the
 * complete blank Entity and its authored dependencies, and protect attachments
 * and incoming Scene references. Light and Spawn are not disposable props. */
export function untouchedChatgptStarterEntityIds(bundle: PrototypeVisualProject, attachedEntityIds: readonly string[] = []): string[] {
  if (bundle.project.projectKind !== "world") return [];
  const entities = Object.values(bundle.scene.entities);
  const attached = new Set(chatgptAttachmentEntityIds(entities, attachedEntityIds));
  const referenced = new Set<string>();
  for (const entity of entities) {
    if (entity.modelNode) referenced.add(entity.modelNode.modelEntityId);
    for (const component of entity.components) {
      if (component.type === "script" || component.type === "xrift-component" || component.type === "interaction-trigger") {
        for (const id of component.entityReferences) referenced.add(id);
      }
    }
  }
  return blankBaseline().filter(entry => {
    const entity = bundle.scene.entities[entry.id];
    return entity !== undefined && !attached.has(entry.id) && !referenced.has(entry.id)
      && canonical(entity) === entry.entity
      && bundle.scene.rootEntityIds.filter(id => id === entry.id).length === 1
      && !entities.some(other => other.parentId === entry.id || other.children.includes(entry.id))
      && entry.assets.every(([id, expected]) => authoredAsset(bundle.assets.assets[id]) === expected);
  }).map(entry => entry.id);
}
