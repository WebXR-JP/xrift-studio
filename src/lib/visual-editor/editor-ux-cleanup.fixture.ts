import { matchesEditorMenuQuery, CREATION_CATEGORY_LABELS } from "./editor-menu-search";
import { collectAuthoringDiagnostics } from "./authoring-diagnostics";
import type { PrototypeVisualProject } from "./prototype-project";
import type { TransformComponent } from "./scene-document";

export function runEditorUxCleanupFixtureAssertions(): { assertions: number } {
  let assertions = 0;
  const assert = (condition: unknown, message: string) => { assertions++; if (!condition) throw new Error(`Editor UX: ${message}`); };
  assert(matchesEditorMenuQuery(" ｃｕｂｅ ", "Cube"), "full-width, case and whitespace normalize");
  assert(matchesEditorMenuQuery("ライト point", "Point Light", CREATION_CATEGORY_LABELS.Light), "each term searches categories and labels");
  assert(!matchesEditorMenuQuery("light unknown", "Point Light"), "all terms must match");
  assert(matchesEditorMenuQuery("", "Cube"), "empty query keeps entries");
  assert(matchesEditorMenuQuery(".*", "literal .*"), "search terms are not regular expressions");
  const transform: TransformComponent = { id: "t", type: "transform", enabled: true, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
  const bundle: PrototypeVisualProject = {
    project: { schemaVersion: "0.1.0", projectId: "test", projectKind: "item", metadata: { name: "test", title: "Test", description: "", createdAt: "2026-09-16T00:00:00Z", updatedAt: "2026-09-16T00:00:00Z" }, entrySceneId: "s", scenePaths: { s: "scenes/s.scene.json" }, assetManifestPath: "assets/manifest.json" },
    scene: { schemaVersion: "0.1.0", sceneId: "s", name: "Test", rootEntityIds: ["root"], entities: { root: { id: "root", name: "Root", enabled: true, parentId: null, children: [], components: [transform] } } },
    assets: { schemaVersion: "0.1.0", assets: {} }, prefabs: {},
  };
  const before = JSON.stringify(bundle);
  assert(collectAuthoringDiagnostics(bundle).length === 0, "healthy empty item has no heuristic errors");
  assert(JSON.stringify(bundle) === before, "inspection never edits the document");
  transform.scale[0] = -1;
  assert(collectAuthoringDiagnostics(bundle).length === 0, "negative scale for mirrored paste is valid");
  transform.scale[1] = 0;
  assert(collectAuthoringDiagnostics(bundle).some(issue => issue.code === "scale-zero" && issue.entityId === "root"), "zero scale links to entity");
  transform.position[0] = Number.NaN;
  assert(collectAuthoringDiagnostics(bundle).some(issue => issue.code === "transform-invalid"), "non-finite transform is invalid");
  transform.scale = [1, 1, 1]; transform.position[0] = 0;
  bundle.scene.entities.root.components.push({ id: "m", type: "mesh", enabled: true, geometryAssetId: "lost-model", geometry: { kind: "asset", assetId: "lost-model" }, materialBindings: [], castShadow: true, receiveShadow: true });
  assert(collectAuthoringDiagnostics(bundle).some(issue => issue.code === "asset-reference-missing" && issue.componentId === "m"), "broken geometry reference points to component");
  bundle.scene.entities.root.components.pop();
  bundle.scene.entities.root.parentId = "root";
  assert(collectAuthoringDiagnostics(bundle).some(issue => issue.code === "hierarchy-cycle"), "cycles terminate and report");
  bundle.scene.entities.root.parentId = null;
  bundle.scene.rootEntityIds.push("ghost");
  assert(collectAuthoringDiagnostics(bundle).some(issue => issue.code === "root-missing"), "missing root diagnosed");
  bundle.scene.rootEntityIds.pop();
  const stable = JSON.stringify(bundle);
  collectAuthoringDiagnostics(bundle);
  assert(stable === JSON.stringify(bundle), "diagnostics remain read-only after problems");
  return { assertions };
}
