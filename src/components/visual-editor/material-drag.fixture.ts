import {
  assignMaterialToPrimaryMeshSlot,
  commitEditorHistory,
  createEditorHistory,
  createPrototypeProject,
  getMesh,
  redoEditorHistory,
  undoEditorHistory,
} from "../../lib/visual-editor";
import { writeAssetCardDragData } from "./asset-card-drag";
import {
  clearEditorDragData,
  hasEditorDragData,
  readEditorDragData,
} from "./editor-drag-data";
import {
  ASSET_LIBRARY_ITEM_DRAG_MIME,
  MATERIAL_DRAG_MIME,
  TEXTURE_DRAG_MIME,
} from "./types";

/** Regression coverage for Tauri WebView payload fallback and undoable drops. */
export function runMaterialDragFixtureAssertions(): void {
  const project = createPrototypeProject("world", "material-drag-fixture");
  const materials = Object.values(project.assets.assets).filter(
    (asset) => asset.kind === "material",
  );
  const material = materials[0];
  assert(material, "Material fixture asset is missing");

  const nativeTransfer = new FakeDataTransfer();
  writeAssetCardDragData(nativeTransfer as unknown as DataTransfer, material);
  assert(
    hasEditorDragData(
      nativeTransfer as unknown as DataTransfer,
      MATERIAL_DRAG_MIME,
    ),
    "Material MIME was not advertised",
  );
  assert(
    readEditorDragData(
      nativeTransfer as unknown as DataTransfer,
      MATERIAL_DRAG_MIME,
    ) === material.id,
    "Material MIME did not preserve its asset id",
  );
  assert(
    readEditorDragData(
      nativeTransfer as unknown as DataTransfer,
      ASSET_LIBRARY_ITEM_DRAG_MIME,
    ) === material.id,
    "Material drag lost its Asset Browser move intent",
  );
  clearEditorDragData();
  assert(
    readEditorDragData(
      nativeTransfer as unknown as DataTransfer,
      MATERIAL_DRAG_MIME,
    ) === material.id,
    "Versioned text fallback was not independently readable",
  );

  const webViewTransfer = new FakeDataTransfer(true);
  writeAssetCardDragData(webViewTransfer as unknown as DataTransfer, material);
  clearEditorDragData();
  assert(
    hasEditorDragData(
      webViewTransfer as unknown as DataTransfer,
      MATERIAL_DRAG_MIME,
    ) &&
      readEditorDragData(
        webViewTransfer as unknown as DataTransfer,
        MATERIAL_DRAG_MIME,
      ) === material.id,
    "text/plain fallback failed when custom MIME writes were rejected",
  );
  clearEditorDragData();

  const texture = Object.values(project.assets.assets).find(
    (asset) => asset.kind === "texture",
  );
  assert(texture, "Texture fixture asset is missing");
  const textureTransfer = new FakeDataTransfer(true);
  writeAssetCardDragData(textureTransfer as unknown as DataTransfer, texture);
  clearEditorDragData();
  assert(
    hasEditorDragData(
      textureTransfer as unknown as DataTransfer,
      TEXTURE_DRAG_MIME,
    ) &&
      readEditorDragData(
        textureTransfer as unknown as DataTransfer,
        TEXTURE_DRAG_MIME,
      ) === texture.id,
    "Texture MIME was not recoverable from the WebView fallback payload",
  );
  clearEditorDragData();

  const meshEntity = Object.values(project.scene.entities).find((entity) =>
    Boolean(getMesh(entity)),
  );
  assert(meshEntity, "Mesh fixture Entity is missing");
  const currentMaterialId = getMesh(meshEntity)?.materialBindings[0]
    ?.materialAssetId;
  const replacement = materials.find(
    (candidate) => candidate.id !== currentMaterialId,
  );
  assert(replacement, "Replacement Material fixture is missing");

  const assignment = assignMaterialToPrimaryMeshSlot(
    project.scene,
    project.assets,
    meshEntity.id,
    replacement.id,
  );
  assert(assignment.applied, "Material drop did not update the Mesh IR");
  const unchanged = assignMaterialToPrimaryMeshSlot(
    assignment.scene,
    project.assets,
    meshEntity.id,
    replacement.id,
  );
  assert(
    !unchanged.applied && unchanged.reason === "unchanged",
    "Repeated Material assignment did not report unchanged",
  );
  const nonMeshEntity = Object.values(project.scene.entities).find(
    (entity) => !getMesh(entity),
  );
  assert(nonMeshEntity, "Non-Mesh fixture Entity is missing");
  const noMesh = assignMaterialToPrimaryMeshSlot(
    project.scene,
    project.assets,
    nonMeshEntity.id,
    replacement.id,
  );
  assert(
    !noMesh.applied && noMesh.reason === "mesh-missing",
    "Non-Mesh Material target was not rejected",
  );
  let history = createEditorHistory(project.scene);
  history = commitEditorHistory(history, assignment.scene);
  assert(history.past.length === 1, "Material assignment was not committed once");
  const assignedMesh = getMesh(history.present.entities[meshEntity.id]);
  assert(
    assignedMesh?.materialBindings.some(
      (binding) =>
        binding.slot === assignment.slot &&
        binding.materialAssetId === replacement.id,
    ),
    "Committed history snapshot does not contain the Material binding",
  );

  const undone = undoEditorHistory(history);
  assert(undone.changed, "Material assignment could not be undone");
  const undoneMesh = getMesh(undone.history.present.entities[meshEntity.id]);
  assert(
    !undoneMesh?.materialBindings.some(
      (binding) =>
        binding.slot === assignment.slot &&
        binding.materialAssetId === replacement.id,
    ),
    "Undo kept the assigned Material binding",
  );
  const redone = redoEditorHistory(undone.history);
  assert(
    redone.changed &&
      getMesh(redone.history.present.entities[meshEntity.id])?.materialBindings.some(
        (binding) => binding.materialAssetId === replacement.id,
      ),
    "Redo did not restore the assigned Material binding",
  );
}

class FakeDataTransfer {
  private readonly values = new Map<string, string>();

  constructor(private readonly rejectCustomMime = false) {}

  get types(): string[] {
    return [...this.values.keys()];
  }

  getData(type: string): string {
    return this.values.get(type.toLowerCase()) ?? "";
  }

  setData(type: string, value: string): void {
    const normalized = type.toLowerCase();
    if (this.rejectCustomMime && normalized !== "text/plain") {
      throw new Error("custom MIME rejected by fixture WebView");
    }
    this.values.set(normalized, value);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
