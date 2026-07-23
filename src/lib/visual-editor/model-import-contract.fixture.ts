import {
  ASSET_MANIFEST_SCHEMA_VERSION,
  createDefaultMaterialAsset,
  updateModelAsset,
  type AssetManifest,
  type ModelAsset,
  type ModelImportMetadata,
} from "./asset-manifest";
import {
  ASSET_IMPORT_MAX_MODEL_HIERARCHY_DEPTH,
  commitAssetImportPlan,
  createAssetImportPlan,
  type AssetImportPlan,
} from "./asset-import";
import {
  reconcileModelMaterialSlots,
  validateModelAssetContract,
  validateModelImportMetadata,
} from "./model-import-contract";
import { assetManifestCodec } from "./serialization";
import { extractGltfModelNodeHierarchy } from "./model-hierarchy";

/** Filesystem-free contract assertions for Model import and reimport. */
export async function runModelImportContractFixtureAssertions(): Promise<void> {
  const extractedNodes = extractGltfModelNodeHierarchy({
    scene: 0,
    scenes: [{ nodes: [0] }, { nodes: [2] }],
    meshes: [{ primitives: [{ material: 0 }] }],
    nodes: [
      { name: "Ward", children: [1] },
      { name: "nishitoda_5chome", mesh: 0, translation: [1, 2, 3] },
      { name: "Unused scene node", mesh: 0 },
    ],
  });
  assert(extractedNodes.length === 2,
    "Nodes outside the selected glTF scene were retained");
  assert(extractedNodes[1]?.name === "nishitoda_5chome" &&
    extractedNodes[1]?.parentSourceNodeIndex === 0,
  "Selected glTF node hierarchy was not extracted");

  const materialBody = requiredMaterial("material-body", "Body Material");
  const materialGlass = requiredMaterial("material-glass", "Glass Material");
  const original = modelAsset({
    sourceHash: "a".repeat(64),
    materialSlots: [
      {
        slot: "authoring-body",
        name: "Body",
        sourceMaterialIndex: 0,
        defaultMaterialAssetId: materialBody.id,
      },
      {
        slot: "authoring-glass",
        name: "Glass",
        sourceMaterialIndex: 1,
        defaultMaterialAssetId: materialGlass.id,
      },
    ],
  });
  const manifest: AssetManifest = {
    schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
    assets: {
      [original.id]: original,
      [materialBody.id]: materialBody,
      [materialGlass.id]: materialGlass,
    },
  };

  const reordered = reconcileModelMaterialSlots(
    [
      { name: "Glass", sourceMaterialIndex: 0 },
      { name: "Body", sourceMaterialIndex: 1 },
      { name: "Emission", sourceMaterialIndex: 2 },
    ],
    original.materialSlots,
  );
  assert(reordered[0].slot === "authoring-glass", "Reordered Glass slot lost its identity");
  assert(reordered[1].slot === "authoring-body", "Reordered Body slot lost its identity");
  assert(
    reordered[0].defaultMaterialAssetId === materialGlass.id &&
      reordered[1].defaultMaterialAssetId === materialBody.id,
    "Reimport discarded existing Material bindings",
  );
  assert(reordered[2].slot === "material-2", "New slot ID is not deterministic");

  const renamed = reconcileModelMaterialSlots(
    [{ name: "Renamed Body", sourceMaterialIndex: 0 }],
    original.materialSlots,
  );
  assert(renamed.length === 1, "Removed source slot remained after reimport");
  assert(renamed[0].slot === "authoring-body", "Renamed source slot lost index identity");
  assert(
    renamed[0].defaultMaterialAssetId === materialBody.id,
    "Renamed source slot lost its Material binding",
  );
  assertThrows(
    () =>
      reconcileModelMaterialSlots([
        { name: "A", sourceMaterialIndex: 0 },
        { name: "B", sourceMaterialIndex: 0 },
      ]),
    "Duplicated discovered Material indices were accepted",
  );

  const updated = updateModelAsset(manifest, original.id, {
    importSettings: {
      scale: Number.NaN,
      generateColliders: false,
      importAnimations: false,
    },
    materialSlotBindings: {
      "authoring-body": materialGlass.id,
      "authoring-glass": null,
      missing: materialBody.id,
    },
  });
  const updatedModel = updated.assets[original.id];
  assert(updatedModel.kind === "model", "Model updater changed the Asset kind");
  assert(updatedModel.importSettings.scale === 1, "Invalid Model scale replaced the fallback");
  assert(!updatedModel.importSettings.generateColliders, "Collider import flag was not updated");
  assert(!updatedModel.importSettings.importAnimations, "Animation import flag was not updated");
  assert(
    updatedModel.materialSlots[0].defaultMaterialAssetId === materialGlass.id,
    "Model slot binding was not updated",
  );
  assert(
    updatedModel.materialSlots[1].defaultMaterialAssetId === undefined,
    "Model slot binding was not removed",
  );

  const roundTrip = assetManifestCodec.parse(assetManifestCodec.serialize(updated));
  assert(roundTrip.ok, "Valid Model metadata did not survive Asset Manifest serialization");
  if (roundTrip.ok) {
    const parsed = roundTrip.document.assets[original.id];
    assert(parsed.kind === "model", "Round-tripped Model changed kind");
    assert(parsed.importMetadata?.sourceFormat === "glb", "sourceFormat was lost");
    assert(parsed.importMetadata?.nodeCount === 7, "nodeCount was lost");
    assert(parsed.importMetadata?.meshCount === 3, "meshCount was lost");
    assert(parsed.importMetadata?.animations[0]?.name === "Idle", "Animation name was lost");
    assert(parsed.importMetadata?.bounds.size[0] === 2, "Model-local bounds were lost");
    assert(parsed.importMetadata?.nodes?.[1]?.name === "nishitoda_5chome",
      "Model node hierarchy was lost");
  }

  const invalidMetadata = {
    ...metadata(),
    bounds: { ...metadata().bounds, center: [Number.NaN, 1, 0] },
  };
  assert(
    validateModelImportMetadata(invalidMetadata).some(
      (candidate) => candidate.path.endsWith("bounds.center"),
    ),
    "Non-finite Model-local bounds were not rejected",
  );
  const cyclicMetadata = metadata();
  cyclicMetadata.nodes = [
    {
      ...cyclicMetadata.nodes![0],
      parentSourceNodeIndex: 1,
      childSourceNodeIndices: [1],
    },
    {
      ...cyclicMetadata.nodes![1],
      parentSourceNodeIndex: 0,
      childSourceNodeIndices: [0],
    },
  ];
  assert(
    validateModelImportMetadata(cyclicMetadata).some(
      (candidate) => candidate.code === "cycle",
    ),
    "Cyclic retained Model metadata was not rejected",
  );
  const invalidAsset = {
    ...original,
    importMetadata: { ...metadata(), nodeCount: Number.POSITIVE_INFINITY },
  };
  assert(
    validateModelAssetContract(invalidAsset).some(
      (candidate) => candidate.path.endsWith("nodeCount"),
    ),
    "Non-finite Model metadata was not rejected",
  );
  const invalidSerialized = JSON.parse(
    assetManifestCodec.serialize(manifest),
  ) as {
    assets: Record<
      string,
      { importMetadata?: { bounds?: { center?: unknown[] } } }
    >;
  };
  const serializedCenter =
    invalidSerialized.assets[original.id].importMetadata?.bounds?.center;
  if (!serializedCenter) throw new Error("Fixture serialized bounds are missing");
  serializedCenter[0] = null;
  const invalidParse = assetManifestCodec.parse(
    JSON.stringify(invalidSerialized),
  );
  assert(
    !invalidParse.ok &&
      invalidParse.issues.some((candidate) =>
        candidate.path.endsWith("importMetadata.bounds.center"),
      ),
    "Asset Manifest parser accepted invalid Model-local bounds",
  );

  const sameHashPlan: AssetImportPlan = {
    transactionId: "asset-import-aaaaaaaaaaaaaaaaaaaa",
    sourceHash: original.sourceHash!,
    replacesAssetId: original.id,
    classification: {
      kind: "model",
      format: "glb",
      mimeType: "model/gltf-binary",
      extension: "glb",
    },
    asset: {
      ...original,
      importMetadata: { ...metadata(), nodeCount: 8 },
    },
    writes: [],
    diagnostics: [],
    canCommit: true,
  };
  let sameHashCommitCount = 0;
  const sameHashResult = await commitAssetImportPlan(
    manifest,
    sameHashPlan,
    async () => {
      sameHashCommitCount += 1;
    },
  );
  const sameHashModel = sameHashResult.assets[original.id];
  assert(sameHashCommitCount === 0, "Unchanged source bytes were written again");
  assert(
    sameHashModel.kind === "model" &&
      sameHashModel.importMetadata?.nodeCount === 8,
    "Same-hash reinspection did not refresh derived metadata",
  );

  const replacementSourcePath =
    "assets/imported/models/bbbbbbbbbbbbbbbb/sample.glb";
  const replacement: ModelAsset = {
    ...original,
    source: {
      kind: "project",
      relativePath: replacementSourcePath,
    },
    sourceHash: "b".repeat(64),
    materialSlots: reordered,
    importMetadata: {
      ...metadata(),
      nodeCount: 9,
      meshCount: 4,
      primitiveCount: 5,
      animations: [
        { name: "Idle", duration: 2, trackCount: 4, sourceAnimationIndex: 0 },
        { name: "Wave", duration: 1.25, trackCount: 3, sourceAnimationIndex: 1 },
      ],
    },
  };
  const plan: AssetImportPlan = {
    transactionId: "asset-import-bbbbbbbbbbbbbbbbbbbb",
    sourceHash: replacement.sourceHash!,
    replacesAssetId: original.id,
    classification: {
      kind: "model",
      format: "glb",
      mimeType: "model/gltf-binary",
      extension: "glb",
    },
    asset: replacement,
    writes: [
      {
        relativePath: replacementSourcePath,
        purpose: "source",
        mediaType: "model/gltf-binary",
        sha256: replacement.sourceHash,
        payload: { encoding: "bytes", bytes: new Uint8Array([1, 2, 3]) },
      },
    ],
    diagnostics: [],
    canCommit: true,
  };
  let commitCount = 0;
  const committed = await commitAssetImportPlan(manifest, plan, async () => {
    commitCount += 1;
  });
  const committedModel = committed.assets[original.id];
  assert(commitCount === 1, "Model reimport did not use one atomic commit");
  assert(committedModel.kind === "model", "Reimport changed the Asset kind");
  assert(committedModel.id === original.id, "Reimport changed the Asset ID");
  assert(committedModel.order === original.order, "Reimport changed the Asset order");
  assert(
    committedModel.importMetadata?.animations[1]?.name === "Wave",
    "Reimport metadata was not committed",
  );

  const rejectedPlan: AssetImportPlan = {
    ...plan,
    sourceHash: "c".repeat(64),
    asset: {
      ...replacement,
      sourceHash: "c".repeat(64),
      importMetadata: { ...metadata(), meshCount: Number.NaN },
    },
  };
  let rejectedCommitCount = 0;
  await assertRejects(
    () =>
      commitAssetImportPlan(manifest, rejectedPlan, async () => {
        rejectedCommitCount += 1;
      }),
    "Invalid metadata reached the atomic file commit",
  );
  assert(rejectedCommitCount === 0, "Invalid metadata wrote source files");

  const deeplyNestedNodes = Array.from(
    { length: ASSET_IMPORT_MAX_MODEL_HIERARCHY_DEPTH + 1 },
    (_, index) =>
      index < ASSET_IMPORT_MAX_MODEL_HIERARCHY_DEPTH
        ? { children: [index + 1] }
        : {},
  );
  const deepHierarchyPlan = await createAssetImportPlan({
    fileName: "too-deep.vrm",
    mimeType: "model/vrm",
    bytes: glbJsonBytes({ asset: { version: "2.0" }, nodes: deeplyNestedNodes }),
  });
  assert(
    !deepHierarchyPlan.canCommit &&
      deepHierarchyPlan.diagnostics.some(
        (diagnostic) => diagnostic.code === "gltf-node-hierarchy-too-deep",
      ),
    "Deep VRM node hierarchy reached GLTFLoader instead of being rejected",
  );

  const externalBinary = new Uint8Array(44);
  new Float32Array(externalBinary.buffer, 0, 9).set([
    0, 0, 0, 1, 0, 0, 0, 1, 0,
  ]);
  new Uint16Array(externalBinary.buffer, 36, 3).set([0, 1, 2]);
  const externalGltf = new TextEncoder().encode(
    JSON.stringify({
      asset: { version: "2.0" },
      buffers: [{ uri: "triangle.bin", byteLength: externalBinary.byteLength }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 },
        { buffer: 0, byteOffset: 36, byteLength: 6, target: 34963 },
      ],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 3,
          type: "VEC3",
          min: [0, 0, 0],
          max: [1, 1, 0],
        },
        { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
      ],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
      nodes: [{ mesh: 0 }],
      scenes: [{ nodes: [0] }],
      scene: 0,
    }),
  );
  const externalGltfPlan = await createAssetImportPlan({
    fileName: "triangle.gltf",
    mimeType: "model/gltf+json",
    bytes: externalGltf,
    preferredKind: "model",
    companionFiles: [
      { relativePath: "triangle.bin", bytes: externalBinary },
    ],
  });
  assert(
    externalGltfPlan.canCommit &&
      externalGltfPlan.asset?.kind === "model" &&
      externalGltfPlan.asset.source.kind === "project" &&
      externalGltfPlan.asset.source.relativePath.endsWith(".glb"),
    "Multi-file glTF was not normalized to a self-contained GLB",
  );
}

function glbJsonBytes(value: unknown): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(value));
  const paddedLength = Math.ceil(json.byteLength / 4) * 4;
  const bytes = new Uint8Array(20 + paddedLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, paddedLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(json, 20);
  bytes.fill(0x20, 20 + json.byteLength);
  return bytes;
}

function modelAsset(
  overrides: Partial<ModelAsset> = {},
): ModelAsset {
  return {
    id: "model-fixture",
    name: "Fixture Model",
    kind: "model",
    status: "ready",
    source: {
      kind: "project",
      relativePath: "assets/imported/models/aaaaaaaaaaaaaaaa/sample.glb",
    },
    sourceHash: "a".repeat(64),
    thumbnail: { status: "missing" },
    folderId: null,
    order: 4,
    importSettings: {
      scale: 1,
      generateColliders: true,
      optimizeMeshes: false,
      importAnimations: true,
    },
    materialSlots: [],
    importMetadata: metadata(),
    ...overrides,
  };
}

function metadata(): ModelImportMetadata {
  return {
    sourceFormat: "glb",
    byteLength: 4096,
    nodeCount: 7,
    meshCount: 3,
    primitiveCount: 4,
    bounds: {
      min: [-1, 0, -2],
      max: [1, 2, 2],
      center: [0, 1, 0],
      size: [2, 2, 4],
      boundingSphereRadius: 2.44948974,
    },
    animations: [
      { name: "Idle", duration: 2, trackCount: 4, sourceAnimationIndex: 0 },
    ],
    nodes: [
      {
        sourceNodeIndex: 0,
        name: "Ward",
        childSourceNodeIndices: [1],
        sourceMaterialIndices: [],
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      {
        sourceNodeIndex: 1,
        name: "nishitoda_5chome",
        parentSourceNodeIndex: 0,
        childSourceNodeIndices: [],
        meshIndex: 0,
        sourceMaterialIndices: [0],
        position: [1, 2, 3],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
    ],
    extensionsUsed: ["KHR_materials_clearcoat"],
    extensionsRequired: ["KHR_materials_clearcoat"],
  };
}

function requiredMaterial(id: string, name: string) {
  const asset = createDefaultMaterialAsset({ id, name });
  if (!asset) throw new Error(`Fixture Material could not be created: ${id}`);
  return asset;
}

function assertThrows(operation: () => void, message: string): void {
  try {
    operation();
  } catch {
    return;
  }
  throw new Error(message);
}

async function assertRejects(
  operation: () => Promise<unknown>,
  message: string,
): Promise<void> {
  try {
    await operation();
  } catch {
    return;
  }
  throw new Error(message);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
