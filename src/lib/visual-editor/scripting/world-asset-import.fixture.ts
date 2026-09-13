import { ASSET_MANIFEST_SCHEMA_VERSION, type AssetManifest } from "../asset-manifest";
import { createAssetImportPlan, commitAssetImportPlan } from "../asset-import";
import { mergeWorldAssetModels } from "./world-asset-import";
import models from "./world-asset-model-definitions.json";

/** Supply the bundled GLB bytes so the real importer and folder expansion are tested. */
export async function runWorldAssetImportFixtureAssertions(bytes: { vehicle: Uint8Array; seat: Uint8Array; wheel: Uint8Array }): Promise<void> {
  const before: AssetManifest = { schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION, assets: {} };
  let imported = before;
  for (const kind of ["vehicle", "seat", "wheel"] as const) {
    const definition = models[kind];
    const plan = await createAssetImportPlan({ fileName: definition.fileName, bytes: bytes[kind], existingManifest: imported });
    if (!plan.canCommit || plan.asset?.id !== definition.assetId) throw new Error(`Invalid bundled ${kind} import`);
    if (plan.asset.kind !== "model" || plan.asset.materialSlots.length !== ({ vehicle: 3, seat: 1, wheel: 2 }[kind])) throw new Error(`${kind} has unexpected material slots`);
    imported = await commitAssetImportPlan(imported, plan, async () => {});
  }
  const merged = mergeWorldAssetModels(before, before, imported);
  for (const asset of Object.values(merged.assets)) {
    if (asset.folderId && !merged.folders?.[asset.folderId]) throw new Error(`${asset.id}: missing imported folder`);
  }
  if (Object.values(merged.assets).filter(asset => asset.kind === "model").length !== 3) throw new Error("All models must be ordinary Assets");
  const second = mergeWorldAssetModels(merged, before, imported);
  if (Object.keys(second.assets).length !== Object.keys(merged.assets).length) throw new Error("Repeated placement duplicated Assets");
  const model = merged.assets[models.vehicle.assetId]!;
  const edited = { ...merged, assets: { ...merged.assets, [model.id]: { ...model, name: "Edited vehicle" } } };
  if (mergeWorldAssetModels(edited, before, imported).assets[model.id]?.name !== "Edited vehicle") throw new Error("Import overwrote an existing edit");
}
