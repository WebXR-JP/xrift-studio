import { VEHICLE_WHEEL_POSITIONS, VEHICLE_WHEEL_SCRIPT_ID, VEHICLE_SMOKE_SCRIPT_ID, VEHICLE_SMOKE_ASSET_ID } from "./vehicle-effects-scripts";
import type { AssetManifest } from "../asset-manifest";
import { createDocumentId } from "../document-id";
import { createEmptyEntity } from "../editor-session";
import { createParticleEmitterComponent, createMeshComponent, createScriptComponent, type SceneDocument, type Vec3 } from "../scene-document";
import models from "./world-asset-model-definitions.json";

export const WORLD_SEAT_SCRIPT_ID = "script-xrift-seat-hierarchy-v1";

/** Materialized authoring data: models remain selectable without executing any Script. */
export function createWorldAssetHierarchy(scene: SceneDocument, assets: AssetManifest, rootId: string, templateId: string): SceneDocument {
  if (templateId !== "vehicle" && templateId !== "seat") return scene;
  let next = scene;
  function model(name: string, modelId: string, position: Vec3, driver?: boolean, effectScriptId?: string) {
    const asset = assets.assets[modelId];
    if (asset?.kind !== "model") throw new Error(`${name}のModel Assetがありません`);
    const created = createEmptyEntity(next, rootId, name);
    if (!created) throw new Error("モデルの配置先がありません");
    next = created.scene;
    const entity = next.entities[created.entityId]!;
    const components = entity.components.map(component => component.type === "transform" ? { ...component, position } : component);
    components.push(createMeshComponent(createDocumentId("component-mesh"), asset.id,
      asset.materialSlots.flatMap(slot => slot.defaultMaterialAssetId ? [{ slot: slot.slot, materialAssetId: slot.defaultMaterialAssetId }] : [])));
    if (driver !== undefined) {
      if (assets.assets[WORLD_SEAT_SCRIPT_ID]?.kind !== "script") throw new Error("Seatスクリプトがありません");
      const script = createScriptComponent(createDocumentId("component-script"), WORLD_SEAT_SCRIPT_ID)!;
      script.properties = { instanceId: "seat", driver };
      components.push(script);
    }
    if (effectScriptId) components.push(createScriptComponent(createDocumentId("component-script"), effectScriptId)!);
    next = { ...next, entities: { ...next.entities, [entity.id]: { ...entity, components } } };
  }
  if (templateId === "vehicle") {
    VEHICLE_WHEEL_POSITIONS.forEach((position, index) => model(["左前タイヤ", "右前タイヤ", "左後タイヤ", "右後タイヤ"][index]!, models.wheel.assetId, [...position], undefined, VEHICLE_WHEEL_SCRIPT_ID));
    const smoke = createEmptyEntity(next, rootId, "排気煙")!;
    next = smoke.scene;
    const emitter = next.entities[smoke.entityId]!;
    next = { ...next, entities: { ...next.entities, [emitter.id]: { ...emitter,
      components: [
        ...emitter.components.map(component => component.type === "transform" ? { ...component, position: [0, 0.4, 1.45] as Vec3 } : component),
        createParticleEmitterComponent(createDocumentId("component-particle"), VEHICLE_SMOKE_ASSET_ID)!,
        createScriptComponent(createDocumentId("component-script"), VEHICLE_SMOKE_SCRIPT_ID)!,
      ],
    } } };
    model("車体", models.vehicle.assetId, [0, 0, 0]);
    model("運転席", models.seat.assetId, [-0.4, 0.85, 0.05], true);
    model("同乗席", models.seat.assetId, [0.4, 0.85, 0.05], false);
  } else {
    model("座席モデル", models.seat.assetId, [0, 0, 0]);
  }
  return next;
}
