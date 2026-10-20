// Isolated Editor fixtures use the same formal operations as Pi, without the retired plan engine.
import { createStarterVisualProject } from '../../src/lib/visual-editor/starter-templates.ts';
import { executeXriftMcpEditorTool } from '../../src/lib/visual-editor/mcp-editor-tools.ts';
export function createChatgptScaffold(plan, name) {
  const starter = createStarterVisualProject('world', 'blank', name);
  const entities = Object.fromEntries(Object.entries(starter.scene.entities).filter(([, entity]) => !entity.components.some(component => component.type === 'mesh')));
  return { ...starter, project: { ...starter.project, metadata: { ...starter.project.metadata, title: plan.title, description: plan.description } },
    scene: { ...starter.scene, entities, rootEntityIds: starter.scene.rootEntityIds.filter(id => id in entities) }, assets: { ...starter.assets, assets: {} } };
}
export function editorFixture(bundle) {
  let revision = 0;
  return (tool, args) => {
    const outcome = executeXriftMcpEditorTool({ bundle, sceneSelection: null, assetSelection: null, editorMode: 'edit', importBusy: false, revision, saveStatus: 'dirty' },
      { id: crypto.randomUUID(), tool, arguments: { projectId: bundle.project.projectId, sceneId: bundle.scene.sceneId, expectedRevision: revision, ...args } });
    bundle = outcome.bundle; revision += outcome.changed ? 1 : 0;
    return { bundle, ...outcome.result };
  };
}
export function editChatgptEntity(bundle, edit) {
  const apply = editorFixture(bundle);
  let result = { bundle, entityId: edit.entityId };
  if (edit.position || edit.scale || edit.rotation) result = apply('update_transform', { entityId: edit.entityId, ...(edit.position ? { position: edit.position } : {}), ...(edit.scale ? { scale: edit.scale } : {}), ...(edit.rotation ? { rotation: edit.rotation.map(value => value * Math.PI / 180) } : {}) });
  if (edit.name) result = apply('rename_entity', { entityId: edit.entityId, name: edit.name });
  return { ...result, entityId: edit.entityId };
}
export function placeTestModel(bundle, assetId, name, position, scale) {
  const apply = editorFixture(bundle);
  const placed = apply('place_asset', { assetId, name });
  return { ...apply('update_transform', { entityId: placed.entityId, position, scale }), entityId: placed.entityId };
}
