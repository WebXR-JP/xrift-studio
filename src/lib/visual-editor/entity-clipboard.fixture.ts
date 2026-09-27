import {
  copyEntityHierarchy,
  ENTITY_MIRROR_AXES,
  getEntityClipboardRoots,
  getEntityCopyDisabledReason,
  pasteEntityHierarchy,
  type EntityMirrorAxis,
} from "./entity-clipboard";
import {
  duplicateEntityHierarchy,
  createTransformComponent,
  createBoxColliderComponent,
  createScriptComponent,
  SCENE_DOCUMENT_SCHEMA_VERSION,
  type SceneDocument,
  type SceneEntity,
  type TransformComponent,
  type Vec3,
} from "./scene-document";
import { createEditorHistory, commitEditorHistory, undoEditorHistory, redoEditorHistory } from "./editor-history";
import {
  createXriftComponent,
  validateXriftComponents,
  XRIFT_COMPONENT_REGISTRY,
  XRIFT_COMPONENT_SCHEMA_IDS,
} from "./component-registry";

/** Actual document operations, with no renderer, OS clipboard or test-only model. */
export function runEntityClipboardFixtureAssertions(): void {
  assertCopiedRuntimeIdentifiers();
  const scene = fixtureScene();
  const before = JSON.stringify(scene);
  const clipboard = copyEntityHierarchy(scene, ["tree"]);
  assert(clipboard, "a complete tree can be copied");
  assertEqual(getEntityClipboardRoots(scene, ["leaf", "tree", "tree", "missing"]), ["tree"], "nested and duplicate roots are removed");
  assert(copyEntityHierarchy(scene, []) === null, "an empty selection does not overwrite the copy");
  assert(copyEntityHierarchy(scene, ["missing"]) === null, "a missing selection is rejected");

  const plain = pasteEntityHierarchy(scene, clipboard, null);
  assert(plain, "ordinary paste succeeds");
  const plainId = plain.rootEntityIds[0];
  assertEqual(transform(plain.scene, plainId).position, [2, 3, 4], "paste keeps position");
  assertEqual(transform(plain.scene, plainId).rotation, [0.2, 0.4, 0.6], "paste keeps rotation");
  assertEqual(transform(plain.scene, plainId).scale, [0.7, 0.8, 0.9], "paste keeps scale");
  assert(plain.scene.entities.tree === scene.entities.tree, "source identity is preserved");
  assert(plain.scene.entities.other === scene.entities.other, "unrelated entities are not recreated");
  assert(plainId !== "tree", "a new root ID is allocated");
  const insertedIds = new Set(plain.rootEntityIds);

  for (const [index, axis] of ENTITY_MIRROR_AXES.entries()) {
    const result = pasteEntityHierarchy(scene, clipboard, null, { mirrorAxis: axis });
    assert(result, `${axis} mirror succeeds`);
    const rootId = result.rootEntityIds[0];
    assert(!insertedIds.has(rootId), "each paste has fresh IDs");
    insertedIds.add(rootId);
    const mirrored = transform(result.scene, rootId);
    const expected: Vec3 = [0.7, 0.8, 0.9];
    expected[index] *= -1;
    assertEqual(mirrored.scale, expected, `${axis} changes only its own scale sign`);
    assertEqual(mirrored.position, [2, 3, 4], `${axis} does not move the object across the scene`);
    assertEqual(mirrored.rotation, [0.2, 0.4, 0.6], `${axis} does not rotate the object`);
    const childId = result.scene.entities[rootId].children[0];
    assert(childId !== "leaf", "children get their own IDs");
    assert(result.scene.entities[childId].parentId === rootId, "child points to copied parent");
    assertEqual(transform(result.scene, childId).scale, [1, 2, 3], "child is not reflected twice");
    const collider = result.scene.entities[rootId].components.find((component) => component.type === "collider");
    assert(collider?.shape === "box", "collider component is retained");
    assertEqual(collider.center, [0.1, 0, 0], "collider local center stays local");
    assertEqual(collider.halfExtents, [0.2, 0.3, 0.4], "collider dimensions are not negated");
    const script = result.scene.entities[rootId].components.find((component) => component.type === "script");
    assert(script?.type === "script", "script component is retained");
    assertEqual(script.entityReferences, [childId, "other"], "internal references are remapped; external ones are kept");
    assertEqual(script.properties, { amount: 3 }, "script properties are preserved");
    const roundTrip = JSON.parse(JSON.stringify(result.scene)) as SceneDocument;
    assertEqual(transform(roundTrip, rootId).scale, expected, "SceneDocument JSON preserves negative scale");
    const nextClipboard = copyEntityHierarchy(result.scene, [rootId]);
    assert(nextClipboard, "a mirrored tree can be copied");
    const restored = pasteEntityHierarchy(result.scene, nextClipboard, null, { mirrorAxis: axis });
    assert(restored, "a mirrored copy can be reflected again");
    assertEqual(transform(restored.scene, restored.rootEntityIds[0]).scale, [0.7, 0.8, 0.9], "reflecting twice restores the original signs");
    assertEqual(JSON.stringify(scene), before, "paste never mutates the source snapshot");
    assert(clipboard.scene === scene, "the copy still refers to the original immutable snapshot");
  }

  const nestedClipboard = copyEntityHierarchy(scene, ["tree", "leaf"]);
  assert(nestedClipboard, "nested selection can be copied");
  const nestedPaste = pasteEntityHierarchy(scene, nestedClipboard, "other", { mirrorAxis: "x" });
  assert(nestedPaste, "paste under an explicit parent succeeds");
  assert(nestedPaste.rootEntityIds.length === 1, "only the selected top-level root is pasted");
  assertEqual(nestedPaste.scene.entities.other.children, [nestedPaste.rootEntityIds[0]], "parent receives the copy exactly once");
  assert(nestedPaste.scene.rootEntityIds === scene.rootEntityIds, "nested paste does not change the scene root list");
  assertEqual(scene.entities.other.children, [], "the original parent's children remain unchanged");
  assert(pasteEntityHierarchy(scene, clipboard, "missing") === null, "a missing destination parent is rejected");
  assert(pasteEntityHierarchy(scene, clipboard, null, { mirrorAxis: "invalid" as EntityMirrorAxis }) === null, "unknown axes fail safely");

  const differentParents = copyEntityHierarchy(scene, ["leaf", "other"]);
  assert(differentParents, "disjoint roots can be copied");
  const duplicate = pasteEntityHierarchy(scene, differentParents, undefined);
  assert(duplicate, "duplicate preserves source parents");
  const [leafCopy, otherCopy] = duplicate.rootEntityIds;
  assert(duplicate.scene.entities[leafCopy].parentId === "tree", "nested duplicate keeps its original parent");
  assert(duplicate.scene.entities[otherCopy].parentId === null, "root duplicate remains at scene root");
  assertEqual(duplicate.scene.entities.tree.children, ["leaf", leafCopy], "duplicate appends to the original branch");
  const cleared: SceneDocument = { ...scene, rootEntityIds: [], entities: {} };
  const fallback = pasteEntityHierarchy(cleared, differentParents, undefined);
  assert(fallback, "copies with absent original parents can be pasted into another scene");
  assert(fallback.rootEntityIds.every((id) => fallback.scene.entities[id].parentId === null), "absent source parents fall back to the scene root");

  const modelScene = fixtureScene();
  modelScene.entities.leaf.modelNode = {
    modelEntityId: "tree", modelAssetId: "model-tree", sourceNodeIndex: 7,
    nodeType: "bone", sourceMaterialIndices: [], restPosition: [1, 0, 0],
    restRotation: [0, 0, 0], restScale: [1, 1, 1],
  };
  assert(getEntityCopyDisabledReason(modelScene, ["leaf"]) !== null, "shared model nodes explain why copying just the node cannot work");
  assert(copyEntityHierarchy(modelScene, ["leaf"]) === null, "shared bone nodes are not pasted as invisible orphan entities");
  assert(getEntityCopyDisabledReason(modelScene, ["tree"]) === null, "the owning model can be copied");
  const modelCopy = copyEntityHierarchy(modelScene, ["tree"]);
  assert(modelCopy, "complete animated model hierarchy can be copied");
  const modelPaste = pasteEntityHierarchy(modelScene, modelCopy, null, { mirrorAxis: "z" });
  assert(modelPaste, "complete animated model hierarchy can be mirrored");
  const modelRoot = modelPaste.rootEntityIds[0];
  const modelChild = modelPaste.scene.entities[modelPaste.scene.entities[modelRoot].children[0]];
  assert(modelChild.modelNode?.modelEntityId === modelRoot, "bone metadata points to the copied model, not the original");
  assertEqual(modelChild.modelNode?.restScale, [1, 1, 1], "bone rest scale is not edited");

  const brokenScene = fixtureScene();
  brokenScene.entities.tree.components = brokenScene.entities.tree.components.filter((component) => component.type !== "transform");
  const brokenCopy = copyEntityHierarchy(brokenScene, ["tree"]);
  assert(brokenCopy, "malformed authoring data may still be copied");
  assert(pasteEntityHierarchy(scene, brokenCopy, null, { mirrorAxis: "x" }) === null, "mirror requires a root Transform");
  const nonFiniteScene = fixtureScene();
  transform(nonFiniteScene, "tree").scale[1] = Number.NaN;
  const nonFiniteCopy = copyEntityHierarchy(nonFiniteScene, ["tree"]);
  assert(nonFiniteCopy, "malformed scale fixture is copied for validation");
  assert(pasteEntityHierarchy(scene, nonFiniteCopy, null, { mirrorAxis: "y" }) === null, "mirror rejects non-finite scale");

  const mirrored = pasteEntityHierarchy(scene, clipboard, null, { mirrorAxis: "x" });
  assert(mirrored, "history fixture can insert a mirror");
  const initial = createEditorHistory({ scene, selection: ["tree"] });
  const committed = commitEditorHistory(initial, { scene: mirrored.scene, selection: mirrored.rootEntityIds });
  assert(committed.past.length === 1, "insertion and selection are one history step");
  const undone = undoEditorHistory(committed);
  assert(undone.changed && undone.history.present.scene === scene, "Undo restores the exact original scene");
  assertEqual(undone.history.present.selection, ["tree"], "Undo restores the source selection");
  const redone = redoEditorHistory(undone.history);
  assert(redone.changed && redone.history.present.scene === mirrored.scene, "Redo restores the same copied entity IDs");
  assertEqual(redone.history.present.selection, mirrored.rootEntityIds, "Redo restores the copy selection");
  assertEqual(transform(redone.history.present.scene, mirrored.rootEntityIds[0]).scale, [-0.7, 0.8, 0.9], "Redo retains the reflection");
}

function assertCopiedRuntimeIdentifiers(): void {
  const scene = fixtureScene();
  const definitions = XRIFT_COMPONENT_REGISTRY.filter((definition) =>
    definition.fields.some((field) => field.uniqueWithinScene),
  );
  for (const definition of definitions) {
    const component = createXriftComponent(definition.schemaId, {
      componentId: definition.schemaId,
    });
    assert(component, "identifier fixture component can be created");
    scene.entities.tree.components.push(component);
  }
  const childInteractable = createXriftComponent(XRIFT_COMPONENT_SCHEMA_IDS.interactable, {
    // Component IDs need only be unique within the Entity.
    componentId: XRIFT_COMPONENT_SCHEMA_IDS.interactable,
    properties: { id: "leaf-button", interactionText: "Leaf button" },
  });
  assert(childInteractable, "child Interactable can be created");
  scene.entities.leaf.components.push(childInteractable);
  const before = JSON.stringify(scene);
  const clipboard = copyEntityHierarchy(scene, ["tree"]);
  assert(clipboard, "interactive hierarchy can be copied");
  let resultScene = scene;
  for (const mirrorAxis of [undefined, "x"] as const) {
    const pasted = pasteEntityHierarchy(resultScene, clipboard, null, { mirrorAxis });
    assert(pasted, "interactive hierarchy can be pasted repeatedly");
    resultScene = pasted.scene;
    const copied = resultScene.entities[pasted.rootEntityIds[0]];
    for (const definition of definitions) {
      const originalComponent = scene.entities.tree.components.find((component) =>
        component.type === "xrift-component" && component.schemaId === definition.schemaId,
      );
      const copiedComponent = copied.components.find((component) =>
        component.type === "xrift-component" && component.schemaId === definition.schemaId,
      );
      assert(originalComponent?.type === "xrift-component" && copiedComponent?.type === "xrift-component", "official components survive paste");
      for (const field of definition.fields) {
        if (field.uniqueWithinScene) {
          assert(copiedComponent.properties[field.name] !== originalComponent.properties[field.name], `${definition.schemaId}.${field.name} must receive a fresh identifier`);
        } else {
          assertEqual(copiedComponent.properties[field.name], originalComponent.properties[field.name], `${definition.schemaId}.${field.name} is preserved`);
        }
      }
    }
    assert(!validateXriftComponents(resultScene, "world").some((entry) => entry.code === "duplicate-xrift-identifier"), "paste and mirror must not add duplicate official runtime identifiers");
  }
  const duplicate = duplicateEntityHierarchy(scene, ["tree"], (kind, id) => `copy-${kind}-${id}`);
  assert(duplicate, "MCP hierarchy duplication succeeds");
  assert(!validateXriftComponents(duplicate.scene, "world").some((entry) => entry.code === "duplicate-xrift-identifier"), "MCP duplication also gives identifiers scoped to their owning Entity");
  assertEqual(JSON.stringify(scene), before, "identifier allocation never edits the original hierarchy");
}

function fixtureScene(): SceneDocument {
  const entity = (id: string, parentId: string | null, children: string[], scale: Vec3): SceneEntity => ({
    id, name: id, parentId, children, enabled: true,
    components: [createTransformComponent(`${id}-transform`, [2, 3, 4], [0.2, 0.4, 0.6], scale)],
  });
  const tree = entity("tree", null, ["leaf"], [0.7, 0.8, 0.9]);
  tree.components.push(createBoxColliderComponent("collider", { center: [0.1, 0, 0], halfExtents: [0.2, 0.3, 0.4] }));
  const script = createScriptComponent("script", "script-wind");
  assert(script, "fixture script can be created");
  tree.components.push({ ...script, properties: { amount: 3 }, entityReferences: ["leaf", "other"] });
  return {
    schemaVersion: SCENE_DOCUMENT_SCHEMA_VERSION, sceneId: "scene-clipboard", name: "Clipboard fixture",
    rootEntityIds: ["tree", "other"],
    entities: { tree, leaf: entity("leaf", "tree", [], [1, 2, 3]), other: entity("other", null, [], [1, 1, 1]) },
  };
}

function transform(scene: SceneDocument, id: string): TransformComponent {
  const component = scene.entities[id]?.components.find((entry) => entry.type === "transform");
  if (!component) throw new Error(`Missing Transform: ${id}`);
  return component;
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Entity clipboard: ${message}`);
}
function assertEqual(actual: unknown, expected: unknown, message: string): void {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${message}\nExpected ${JSON.stringify(expected)}\nReceived ${JSON.stringify(actual)}`);
}
