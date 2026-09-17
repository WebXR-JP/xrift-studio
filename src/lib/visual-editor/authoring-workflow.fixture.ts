import { matchesEditorSearch } from "./editor-menu-search";
import { createPrototypeProject } from "./prototype-project";
import { getDiscoverableXriftGroups } from "./component-discovery";
import { getXriftComponentMenuGroups } from "./component-registry";
import { withHierarchyProjectKind, createHierarchyTransfer, prepareHierarchyTransferFiles, planHierarchyImport, collectHierarchyAssetReferences } from "./hierarchy-transfer";
import { createBuiltinPrimitiveMeshComponent, createTransformComponent, type SceneEntity } from "./scene-document";
import { getBuiltinPrimitiveCreation } from "./creation-catalog";

export async function runAuthoringWorkflowFixtureAssertions() {
  let assertions = 0;
  const assert = (condition: unknown, name: string) => { assertions++; if (!condition) throw new Error(`Authoring workflow: ${name}`); };
  const equal = (a: unknown, b: unknown, name: string) => assert(JSON.stringify(a) === JSON.stringify(b), name);
  const source = createPrototypeProject("world", "確認用ワールド");
  assert(matchesEditorSearch("ＣＵＢＥ", "cube"), "NFKC full width");
  assert(matchesEditorSearch(" point　 ライト ", "Point Light", "ライト"), "AND terms separated by full width space");
  assert(!matchesEditorSearch("Point 音声", "Point Light ライト"), "all terms required");
  assert(matchesEditorSearch("  ", undefined), "blank query shows catalog");
  const root: SceneEntity = { id: "cube-root", name: "Cube", enabled: true, parentId: null, children: [], components: [createTransformComponent("transform")] };
  const cube = getBuiltinPrimitiveCreation("builtin-primitive/box");
  assert(Boolean(cube), "real Cube registry entry");
  root.components.push(createBuiltinPrimitiveMeshComponent("mesh", cube!, []));
  const fragment = { ...source, scene: { ...source.scene, entities: { [root.id]: root }, rootEntityIds: [root.id] } };
  assert(!collectHierarchyAssetReferences(root).has("builtin-primitive/box"), "inline geometry is not a missing Asset");
  const transfer = createHierarchyTransfer(fragment, [root.id]);
  const ready = await prepareHierarchyTransferFiles(transfer, async () => { throw new Error("inline Cube unexpectedly read a file"); });
  const sourceSnapshot = JSON.stringify(ready.bundle);
  const itemExport = withHierarchyProjectKind(ready, "item");
  assert(itemExport.bundle.project.projectKind === "item", "export as standalone Item");
  equal(JSON.stringify(ready.bundle), sourceSnapshot, "Item conversion leaves source snapshot unchanged");
  assert(withHierarchyProjectKind(itemExport, "item") === itemExport, "no unnecessary ID changes without conversion");
  const imported = planHierarchyImport(createPrototypeProject("item", "受け取り"), ready);
  assert(imported.rootEntityIds.length === 1, "primitive reusable in Item");
  assert(imported.bundle.project.projectKind === "item", "reuse keeps destination kind");
  const definitions = getDiscoverableXriftGroups().flatMap((group) => group.components);
  const ids = definitions.map((definition) => definition.schemaId);
  equal(ids.length, new Set(ids).size, "no duplicate Component in union");
  for (const kind of ["world", "item"] as const) {
    for (const group of getXriftComponentMenuGroups(kind)) for (const definition of group.components) assert(ids.includes(definition.schemaId), `discover ${kind}:${definition.label}`);
  }
  const worldOnly = definitions.find((definition) => definition.allowedProjectKinds.includes("world") && !definition.allowedProjectKinds.includes("item"));
  assert(Boolean(worldOnly), "catalog contains project-specific definitions");
  return { assertions };
}
