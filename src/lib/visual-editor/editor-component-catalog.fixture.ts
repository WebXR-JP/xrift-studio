import { getEditorComponentMenuDefinitions, getEditorComponentDisabledReason, EDITOR_COMPONENT_REGISTRY } from "./editor-session";
import type { SceneEntity } from "./scene-document";

export function runEditorComponentCatalogFixtureAssertions(): void {
  const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(`Component catalog: ${message}`); };
  const entity: SceneEntity = { id: "root", name: "Root", enabled: true, parentId: null, children: [], components: [] };
  const all = getEditorComponentMenuDefinitions();
  for (const kind of ["world", "item"] as const) {
    assert(getEditorComponentMenuDefinitions(kind).every(definition => all.includes(definition)), "catalog includes both project kinds");
  }
  const worldOnly = EDITOR_COMPONENT_REGISTRY.find(definition => !definition.projectKinds.includes("item") && definition.projectKinds.includes("world"));
  assert(Boolean(worldOnly), "world-only definition exists for regression");
  if (worldOnly) assert(getEditorComponentDisabledReason(entity, worldOnly.id, "item") === "ワールドでのみ使用できます", "incompatible entry explains project constraint");
  assert(getEditorComponentDisabledReason(entity, "physics.mesh-collider", "item")?.includes("必要"), "mesh dependency remains enforced");
  assert(getEditorComponentDisabledReason(undefined, "physics.mesh-collider", "item") === "Entityを選択", "empty selection gets actionable reason");
}
