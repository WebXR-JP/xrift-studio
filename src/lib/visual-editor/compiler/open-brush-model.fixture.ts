import { normalizeModelImportSettings, type ModelAsset } from "../asset-manifest";
import { OPEN_BRUSH_EXTENSION_NAMES, OPEN_BRUSH_RUNTIME_PACKAGE } from "../open-brush";
import { createPrototypeProject } from "../prototype-project";
import { compileVisualProject } from "./compile";

export function compileNativeOpenBrushModelTypecheckWorld(mode: "model" | "node") {
  const prototype = createPrototypeProject("world", `fixture-native-open-brush-${mode}`);
  const model: ModelAsset = {
    id: "fixture-native-open-brush-model",
    name: "Native OpenBrush model",
    kind: "model",
    status: "ready",
    source: { kind: "project", relativePath: "assets/brush.glb" },
    importSettings: normalizeModelImportSettings({ mergeStaticMeshes: false }),
    materialSlots: [{ slot: "default", name: "Fire", sourceMaterialIndex: 0 }],
    importMetadata: {
      sourceFormat: "glb",
      byteLength: 1024,
      nodeCount: 1,
      meshCount: 1,
      primitiveCount: 1,
      bounds: {
        min: [-1, -1, -1], max: [1, 1, 1], center: [0, 0, 0],
        size: [2, 2, 2], boundingSphereRadius: Math.sqrt(3),
      },
      animations: [],
      extensionsUsed: [...OPEN_BRUSH_EXTENSION_NAMES],
      extensionsRequired: [],
      openBrush: {
        renderer: "three-icosa",
        rendererVersion: OPEN_BRUSH_RUNTIME_PACKAGE,
        extensionNames: [...OPEN_BRUSH_EXTENSION_NAMES],
        brushNames: ["Fire"],
      },
    },
  };
  prototype.assets.assets[model.id] = model;
  for (const entity of Object.values(prototype.scene.entities)) {
    for (const component of entity.components) {
      if (component.type !== "mesh") continue;
      component.geometry = {
        kind: "asset", assetId: model.id,
        ...(mode === "node" ? { sourceNodeIndex: 0 } : {}),
      };
      component.materialBindings = [];
    }
  }
  const result = compileVisualProject({
    project: prototype.project,
    scenes: { [prototype.scene.sceneId]: prototype.scene },
    assets: prototype.assets,
    prefabs: prototype.prefabs,
  });
  if (!result.canStage) {
    throw new Error(`Native OpenBrush ${mode} must compile: ${JSON.stringify(result.diagnostics)}`);
  }
  return result;
}
