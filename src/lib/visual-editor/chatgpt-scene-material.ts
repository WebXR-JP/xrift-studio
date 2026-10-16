import type { PrototypeVisualProject } from "./prototype-project";
import { getMaterialAssignmentTarget } from "./material-assignment";
import { ChatgptPlanInputError } from "./chatgpt-plan-recovery";

/** Enumerate actual editable slots, including model-node overrides. */
export function chatgptSceneMaterialTargets(bundle: PrototypeVisualProject) {
  return Object.values(bundle.scene.entities).flatMap(entity => {
    const owner = entity.modelNode ? bundle.scene.entities[entity.modelNode.modelEntityId] : entity;
    return (owner?.components ?? []).filter(component => component.type === "mesh").flatMap(mesh => {
      const target = getMaterialAssignmentTarget(bundle.scene, bundle.assets, entity.id, mesh.id);
      return target.ready ? target.slots.map(slot => ({ entityId: entity.id, meshComponentId: target.meshId, slot: slot.slot })) : [];
    });
  });
}

export function applyChatgptSceneMaterial(bundle: PrototypeVisualProject, materialAssetId: string,
  apply: (args: { entityId: string; meshComponentId: string; slot: string; materialAssetId: string }) => unknown) {
  const targets = chatgptSceneMaterialTargets(bundle);
  if (!targets.length) throw new ChatgptPlanInputError("Materialを一括変更できるMesh RendererがSceneにありません");
  for (const target of targets) apply({ ...target, materialAssetId });
}
