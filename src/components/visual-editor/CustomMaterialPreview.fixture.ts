import {
  BUILTIN_ASSET_IDS,
  createPrototypeProject,
  getMaterialAsset,
  type MaterialAsset,
  type ModelAsset,
} from "../../lib/visual-editor";
import { resolveCustomMaterialPreviewSource } from "./CustomMaterialPreview";

export function runCustomMaterialPreviewFixtureAssertions(): void {
  const project = createPrototypeProject("world", "custom-material-preview");
  const fallback = getMaterialAsset(
    project.assets,
    BUILTIN_ASSET_IDS.material.orange,
  );
  assert(fallback, "Material fixture is missing");

  const model: ModelAsset = {
    id: "openbrush-model",
    name: "OpenBrush Model",
    kind: "model",
    status: "ready",
    source: { kind: "project", relativePath: "Assets/openbrush.glb" },
    sourceHash: "fixture-source-hash",
    importSettings: {
      scale: 1,
      generateColliders: false,
      optimizeMeshes: false,
      importAnimations: false,
    },
    materialSlots: [
      {
        slot: "material-6",
        name: "brush_DoubleTaperedMarker",
        sourceMaterialIndex: 6,
      },
    ],
    importMetadata: {
      sourceFormat: "glb",
      byteLength: 128,
      nodeCount: 1,
      meshCount: 1,
      primitiveCount: 1,
      bounds: {
        min: [-1, -1, -1],
        max: [1, 1, 1],
        center: [0, 0, 0],
        size: [2, 2, 2],
        boundingSphereRadius: 1.75,
      },
      animations: [],
      extensionsUsed: ["GOOGLE_tilt_brush_material"],
      extensionsRequired: [],
      openBrush: {
        renderer: "three-icosa",
        rendererVersion: "three-icosa@fixture",
        extensionNames: ["GOOGLE_tilt_brush_material"],
        brushNames: ["DoubleTaperedMarker"],
        nodes: [
          {
            sourceNodeIndex: 12,
            name: "brush_DoubleTaperedMarker",
            childSourceNodeIndices: [],
            meshIndex: 4,
            sourceMaterialIndices: [6],
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
          },
        ],
      },
    },
  };
  const material: MaterialAsset = {
    ...fallback,
    id: "openbrush-material-6",
    name: "brush_DoubleTaperedMarker",
    shader: {
      kind: "openbrush",
      renderer: "three-icosa",
      rendererVersion: "three-icosa@fixture",
      brushName: "DoubleTaperedMarker",
      brushGuid: "fixture-guid",
      brushBaseUrl: "https://example.invalid/brushes/",
      sourceMaterialIndex: 6,
    },
    importedFromModel: {
      modelAssetId: model.id,
      sourceMaterialIndex: 6,
      sourceMaterialName: materialName(6),
      sourceSlotId: "material-6",
      sourceHash: model.sourceHash!,
      isUserOverridden: false,
    },
  };
  const manifest = {
    ...project.assets,
    assets: {
      ...project.assets.assets,
      [model.id]: model,
      [material.id]: material,
    },
  };

  const resolved = resolveCustomMaterialPreviewSource(material, manifest);
  assert(
    resolved.status === "ready" &&
      resolved.source.sourceMaterialIndex === 6 &&
      resolved.source.sourceNodeIndex === 12 &&
      resolved.source.sourceRelativePath === "Assets/openbrush.glb",
    "OpenBrush Material did not resolve its decomposed source node preview",
  );

  const orphan = resolveCustomMaterialPreviewSource(
    { ...material, importedFromModel: undefined },
    manifest,
  );
  assert(
    orphan.status === "unavailable" && orphan.reason.includes("元のOpenBrush"),
    "An orphan custom Material did not explain how to restore its preview",
  );
}

function materialName(index: number): string {
  return `brush fixture ${index}`;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
