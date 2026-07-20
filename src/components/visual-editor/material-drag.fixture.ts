import {
  assignMaterialToMeshSlots,
  assignMaterialToPrimaryMeshSlot,
  commitEditorHistory,
  createEditorHistory,
  createPrototypeProject,
  getMaterialAssignmentTarget,
  getMesh,
  redoEditorHistory,
  type ModelAsset,
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

  const sourceMesh = getMesh(meshEntity);
  assert(sourceMesh, "Multi-slot fixture Mesh is missing");
  const secondaryMesh = {
    ...sourceMesh,
    id: `${sourceMesh.id}-secondary`,
    materialBindings: [],
  };
  const multiMeshScene = {
    ...project.scene,
    entities: {
      ...project.scene.entities,
      [meshEntity.id]: {
        ...meshEntity,
        components: [...meshEntity.components, secondaryMesh],
      },
    },
  };
  const exactTarget = getMaterialAssignmentTarget(
    multiMeshScene,
    project.assets,
    meshEntity.id,
    secondaryMesh.id,
  );
  assert(
    exactTarget.ready && exactTarget.meshId === secondaryMesh.id,
    "Material target did not preserve the raycast Mesh component id",
  );
  const exactAssignment = assignMaterialToPrimaryMeshSlot(
    multiMeshScene,
    project.assets,
    meshEntity.id,
    replacement.id,
    secondaryMesh.id,
  );
  assert(
    exactAssignment.applied,
    "Exact Mesh component Material assignment was rejected",
  );
  assert(
    getMesh(exactAssignment.scene.entities[meshEntity.id], sourceMesh.id)
      ?.materialBindings.some(
        (binding) => binding.materialAssetId === replacement.id,
      ) !== true,
    "Exact Mesh assignment changed the first Mesh on the Entity",
  );
  assert(
    getMesh(exactAssignment.scene.entities[meshEntity.id], secondaryMesh.id)
      ?.materialBindings.some(
        (binding) => binding.materialAssetId === replacement.id,
      ) === true,
    "Exact Mesh assignment did not change the raycast Mesh",
  );
  const disabledMultiMeshScene = {
    ...multiMeshScene,
    entities: {
      ...multiMeshScene.entities,
      [meshEntity.id]: {
        ...multiMeshScene.entities[meshEntity.id],
        components: multiMeshScene.entities[meshEntity.id].components.map(
          (component) =>
            component.id === secondaryMesh.id && component.type === "mesh"
              ? { ...component, enabled: false }
              : component,
        ),
      },
    },
  };
  const disabledTarget = getMaterialAssignmentTarget(
    disabledMultiMeshScene,
    project.assets,
    meshEntity.id,
    secondaryMesh.id,
  );
  assert(
    !disabledTarget.ready && disabledTarget.reason === "mesh-missing",
    "Disabled Mesh was exposed as a Material drop target",
  );
  const disabledAssignment = assignMaterialToPrimaryMeshSlot(
    disabledMultiMeshScene,
    project.assets,
    meshEntity.id,
    replacement.id,
    secondaryMesh.id,
  );
  assert(
    !disabledAssignment.applied &&
      disabledAssignment.reason === "mesh-missing" &&
      disabledAssignment.scene === disabledMultiMeshScene,
    "Disabled Mesh accepted a Material assignment",
  );
  const missingComponentAssignment = assignMaterialToPrimaryMeshSlot(
    multiMeshScene,
    project.assets,
    meshEntity.id,
    replacement.id,
    "missing-mesh-component",
  );
  assert(
    !missingComponentAssignment.applied &&
      missingComponentAssignment.reason === "mesh-missing" &&
      missingComponentAssignment.scene === multiMeshScene,
    "Missing Mesh component fell back to the first Mesh",
  );
  const multiSlotModel: ModelAsset = {
    id: "fixture-model-multi-slot",
    name: "Multi Slot Model",
    kind: "model",
    status: "ready",
    source: { kind: "project", relativePath: "assets/models/multi-slot.glb" },
    importSettings: {
      scale: 1,
      generateColliders: true,
      optimizeMeshes: false,
      importAnimations: true,
    },
    materialSlots: [
      { slot: "material-0", name: "Body", sourceMaterialIndex: 0 },
      { slot: "material-1", name: "Trim", sourceMaterialIndex: 1 },
    ],
  };
  const multiSlotScene = {
    ...project.scene,
    entities: {
      ...project.scene.entities,
      [meshEntity.id]: {
        ...meshEntity,
        components: meshEntity.components.map((component) =>
          component.id === sourceMesh.id && component.type === "mesh"
            ? {
                ...component,
                geometryAssetId: multiSlotModel.id,
                geometry: { kind: "asset" as const, assetId: multiSlotModel.id },
                materialBindings: [],
              }
            : component,
        ),
      },
    },
  };
  const multiSlotAssets = {
    ...project.assets,
    assets: {
      ...project.assets.assets,
      [multiSlotModel.id]: multiSlotModel,
    },
  };
  const target = getMaterialAssignmentTarget(
    multiSlotScene,
    multiSlotAssets,
    meshEntity.id,
    sourceMesh.id,
  );
  assert(
    target.ready && target.slots.length === 2,
    "Multi-slot Material target did not expose both slots",
  );
  const allSlots = assignMaterialToMeshSlots(
    multiSlotScene,
    multiSlotAssets,
    meshEntity.id,
    replacement.id,
    ["material-0", "material-1"],
    sourceMesh.id,
  );
  assert(allSlots.applied, "Multi-slot Material assignment was rejected");
  const assignedSlots = getMesh(allSlots.scene.entities[meshEntity.id])
    ?.materialBindings.filter(
      (binding) => binding.materialAssetId === replacement.id,
    )
    .map((binding) => binding.slot)
    .sort();
  assert(
    assignedSlots?.join(",") === "material-0,material-1",
    "Multi-slot assignment did not update every selected slot",
  );
  const invalidSlot = assignMaterialToMeshSlots(
    multiSlotScene,
    multiSlotAssets,
    meshEntity.id,
    replacement.id,
    ["material-0", "missing-slot"],
    sourceMesh.id,
  );
  assert(
    !invalidSlot.applied &&
      invalidSlot.reason === "slot-missing" &&
      invalidSlot.scene === multiSlotScene,
    "Invalid slot selection partially changed the Scene",
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
