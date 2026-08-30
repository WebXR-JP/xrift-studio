import type { ModelAsset, ModelImportMetadata } from "./asset-manifest";
import {
  planModelOptimization,
  type ModelOptimizationOptions,
} from "./model-optimization";

/**
 * Model最適化はMaterial SlotとNode構造を保つことが前提。索引が動く変換を
 * 足すとEntity側の割当が別のMaterialへ移るので、実行する処理の一覧を固定する。
 */
export function runModelOptimizationFixtureAssertions(): void {
  assertUnsupportedSources();
  assertPlannedSteps();
}

function assertUnsupportedSources(): void {
  const builtin = plan({}, { source: { kind: "builtin", key: "starter/cube" } });
  assert(!builtin.supported, "A built-in Model was offered for optimization");

  const missing = plan({}, { status: "missing" });
  assert(!missing.supported, "A missing Model was offered for optimization");

  const obj = plan({ sourceFormat: "obj" });
  assert(!obj.supported, "A non-GLB source was offered for optimization");

  const vrm = plan({ extensionsUsed: ["VRMC_vrm"] });
  assert(!vrm.supported, "A VRM was offered for automatic optimization");

  const unanalyzed = plan(null);
  assert(
    !unanalyzed.supported,
    "A Model without import metadata was offered for optimization",
  );
}

function assertPlannedSteps(): void {
  const both = plan({ animations: [] });
  assert(
    both.supported &&
      both.steps.join() === "weld,dedup-accessors,draco" &&
      !both.alreadyDraco,
    `Default optimization steps drifted: ${both.supported ? both.steps.join() : both.reason}`,
  );

  const animated = plan({
    animations: [{ name: "Idle", duration: 1, trackCount: 2 }],
  });
  assert(
    animated.supported && animated.steps.includes("resample-animations"),
    "A Model with animation clips did not plan keyframe resampling",
  );

  const meshOnly = plan({ animations: [] }, {}, {
    optimizeMeshes: true,
    compressWithDraco: false,
  });
  assert(
    meshOnly.supported && !meshOnly.steps.includes("draco"),
    "Draco ran even though it was not requested",
  );

  const dracoOnly = plan({ animations: [] }, {}, {
    optimizeMeshes: false,
    compressWithDraco: true,
  });
  assert(
    dracoOnly.supported && dracoOnly.steps.join() === "draco",
    "Deselecting Mesh optimization still planned mesh transforms",
  );

  // 圧縮済みGLBはMesh最適化のために展開されるので、書き戻す時に再圧縮する。
  // ここを外すと最適化のたびに配信サイズが増える。
  const alreadyDraco = plan({
    extensionsRequired: ["KHR_draco_mesh_compression"],
  });
  assert(
    alreadyDraco.supported &&
      alreadyDraco.alreadyDraco &&
      alreadyDraco.requiresDracoDecoder &&
      alreadyDraco.steps[alreadyDraco.steps.length - 1] === "draco",
    "An already compressed Model lost its Draco compression after mesh optimization",
  );

  const alreadyDracoMeshOff = plan(
    { extensionsRequired: ["KHR_draco_mesh_compression"] },
    {},
    { optimizeMeshes: false, compressWithDraco: true },
  );
  assert(
    alreadyDracoMeshOff.supported && alreadyDracoMeshOff.steps.length === 0,
    "A compressed Model with nothing to change was rewritten anyway",
  );

  const fresh = plan({ animations: [] });
  assert(
    fresh.supported && !fresh.requiresDracoDecoder,
    "An uncompressed source asked for a Draco decoder",
  );

  const nothing = plan({ animations: [] }, {}, {
    optimizeMeshes: false,
    compressWithDraco: false,
  });
  assert(
    nothing.supported && nothing.steps.length === 0,
    "An empty selection still planned work",
  );
}

function plan(
  metadata: Partial<ModelImportMetadata> | null,
  overrides: Partial<ModelAsset> = {},
  options: ModelOptimizationOptions = {
    optimizeMeshes: true,
    compressWithDraco: true,
  },
): ReturnType<typeof planModelOptimization> {
  const asset: ModelAsset = {
    id: "model-optimization-fixture",
    name: "Model Optimization Fixture",
    kind: "model",
    status: "ready",
    source: { kind: "project", relativePath: "assets/imported/models/a/b.glb" },
    importSettings: {
      scale: 1,
      generateColliders: false,
      optimizeMeshes: true,
      importAnimations: true,
    },
    materialSlots: [],
    importMetadata: metadata
      ? {
          sourceFormat: "glb",
          byteLength: 8 * 1024 * 1024,
          nodeCount: 4,
          meshCount: 2,
          primitiveCount: 2,
          bounds: {
            min: [0, 0, 0],
            max: [1, 1, 1],
            center: [0.5, 0.5, 0.5],
            size: [1, 1, 1],
            boundingSphereRadius: 1,
          },
          animations: [],
          extensionsUsed: [],
          extensionsRequired: [],
          ...metadata,
        }
      : undefined,
    ...overrides,
  };
  return planModelOptimization(asset, options);
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}
