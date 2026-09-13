import { addDefaultParticleAsset, getParticleAuthoringPreset } from "../particle-system";
import { VEHICLE_WHEEL_SCRIPT_ID, VEHICLE_SMOKE_SCRIPT_ID, VEHICLE_SMOKE_ASSET_ID, VEHICLE_WHEEL_SOURCE, VEHICLE_SMOKE_SOURCE } from "./vehicle-effects-scripts";
import { tauri } from "../../tauri";
import { createScriptAsset, createScriptRelativePath } from "./script-files";
import { addScriptAsset } from "./script-files";
import { createScriptTemplateSource } from "./script-templates";
import { WORLD_SEAT_SCRIPT_ID } from "./world-asset-hierarchy";
import type { AssetManifest } from "../asset-manifest";
import { ensureBuiltinModelAsset } from "../asset-import-persistence";
import models from "./world-asset-model-definitions.json";

/** Uses the ordinary, content-addressed Model import pipeline. */
export async function ensureWorldAssetModels(projectPath: string, manifest: AssetManifest, templateId: string): Promise<AssetManifest> {
  let next = manifest;
  const definitions = templateId === "vehicle" ? [models.vehicle, models.seat, models.wheel] : templateId === "seat" ? [models.seat] : [];
  for (const definition of definitions) {
    const imported = await ensureBuiltinModelAsset(projectPath, next, definition);
    if (!imported || imported.assets[definition.assetId]?.kind !== "model") {
      throw new Error(`${definition.displayName}を取り込めませんでした`);
    }
    next = imported;
  }
  if (templateId === "vehicle" && !next.assets[WORLD_SEAT_SCRIPT_ID]) {
    const path = createScriptRelativePath("Seat Behavior", next, [], "tsx");
    const asset = createScriptAsset(WORLD_SEAT_SCRIPT_ID, "Seat Behavior", path, null, "tsx");
    await tauri.writeTextFile(projectPath, path, createScriptTemplateSource("seat", "Seat Behavior")!);
    next = addScriptAsset(next, asset);
  }
  if (templateId === "vehicle") {
    for (const [id, name, source] of [
      [VEHICLE_WHEEL_SCRIPT_ID, "Wheel Motion", VEHICLE_WHEEL_SOURCE],
      [VEHICLE_SMOKE_SCRIPT_ID, "Vehicle Exhaust", VEHICLE_SMOKE_SOURCE],
    ]) {
      if (next.assets[id!]) continue;
      const path = createScriptRelativePath(name!, next, [], "ts");
      await tauri.writeTextFile(projectPath, path, source!);
      next = addScriptAsset(next, createScriptAsset(id!, name!, path));
    }
    next = addDefaultParticleAsset(next, { id: VEHICLE_SMOKE_ASSET_ID, name: "車の排気煙",
      properties: { ...getParticleAuthoringPreset("smoke")!.properties,
        maxParticles: 32, prewarm: false, simulationSpace: "local", startLifetime: { min: 0.5, max: 1.2 },
        startSize: { min: 0.08, max: 0.16 }, emission: { rateOverTime: 0, bursts: [] },
        shape: { type: "cone", radius: 0.05, angle: 12 },
      },
    }).manifest;
  }
  return next;
}

/** Merge only newly imported assets, preserving concurrent edits to existing ones. */
export function mergeWorldAssetModels(latest: AssetManifest, before: AssetManifest, imported: AssetManifest): AssetManifest {
  const additions = Object.fromEntries(Object.entries(imported.assets).filter(([id]) => !before.assets[id] && !latest.assets[id]));
  const folders = Object.fromEntries(Object.entries(imported.folders ?? {}).filter(([id]) => !before.folders?.[id] && !latest.folders?.[id]));
  return { ...latest, assets: { ...latest.assets, ...additions }, folders: { ...latest.folders, ...folders } };
}
