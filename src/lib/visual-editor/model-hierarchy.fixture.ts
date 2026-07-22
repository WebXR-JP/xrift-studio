import {
  ASSET_MANIFEST_SCHEMA_VERSION,
  type AssetManifest,
  type ModelAsset,
} from "./asset-manifest";
import { instantiateSceneAsset } from "./asset-placement";
import {
  extractGltfModelNodeHierarchy,
  hasModelNodeHierarchy,
} from "./model-hierarchy";
import { SCENE_DOCUMENT_SCHEMA_VERSION } from "./scene-document";

export function runModelHierarchyFixtureAssertions(): void {
  const nodes = extractGltfModelNodeHierarchy({
    scene: 0,
    scenes: [{ nodes: [0] }, { nodes: [2] }],
    meshes: [{ primitives: [{ material: 0 }] }],
    nodes: [
      { name: "Ward", children: [1] },
      { name: "nishitoda_5chome", mesh: 0, translation: [1, 2, 3] },
      { name: "Unused scene node", mesh: 0 },
    ],
  });
  assert(nodes.length === 2, "Nodes outside the selected glTF scene were retained");
  assert(
    nodes[1]?.name === "nishitoda_5chome" &&
      nodes[1]?.parentSourceNodeIndex === 0,
    "Selected glTF node hierarchy was not extracted",
  );
  const repairedNodes = extractGltfModelNodeHierarchy({
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { children: [1, 2] },
      { children: [2] },
      { children: [0] },
    ],
  });
  assert(
    repairedNodes[0]?.childSourceNodeIndices.join(",") === "1,2" &&
      repairedNodes[1]?.childSourceNodeIndices.length === 0 &&
      repairedNodes[2]?.childSourceNodeIndices.length === 0 &&
      repairedNodes[2]?.parentSourceNodeIndex === 0,
    "Malformed duplicate or cyclic glTF links reached Model metadata",
  );
  assert(
    extractGltfModelNodeHierarchy({
      scene: 0,
      scenes: [{ nodes: [0] }],
      skins: [{}],
      meshes: [{ primitives: [] }],
      nodes: [{ mesh: 0, skin: 0 }],
    }).length === 0,
    "Skinned Models must remain one Entity for bind-pose playback",
  );

  const model: ModelAsset = {
    id: "model-hierarchy-fixture",
    name: "Town",
    kind: "model",
    status: "ready",
    source: { kind: "project", relativePath: "assets/town.glb" },
    importSettings: {
      scale: 0.01,
      generateColliders: false,
      optimizeMeshes: false,
      importAnimations: true,
    },
    materialSlots: [],
    importMetadata: {
      sourceFormat: "glb",
      byteLength: 1,
      nodeCount: 3,
      meshCount: 1,
      primitiveCount: 1,
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
      nodes,
    },
  };
  assert(hasModelNodeHierarchy(model), "Model node hierarchy is missing");
  const manifest: AssetManifest = {
    schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
    assets: { [model.id]: model },
  };
  const placement = instantiateSceneAsset(
    {
      schemaVersion: SCENE_DOCUMENT_SCHEMA_VERSION,
      sceneId: "scene-model-hierarchy-fixture",
      name: "Model hierarchy fixture",
      rootEntityIds: [],
      entities: {},
    },
    manifest,
    {},
    model.id,
  );
  assert(placement.placed, "Model hierarchy fixture could not be placed");
  if (!placement.placed) return;
  const placedRoot = placement.scene.entities[placement.entityId];
  const sourceRoot = placement.scene.entities[placedRoot.children[0]];
  const sourceChild = placement.scene.entities[sourceRoot?.children[0]];
  assert(sourceRoot?.name === "Ward", "Model root node was not expanded");
  assert(sourceChild?.name === "nishitoda_5chome", "Model child node was not expanded");
  assert(
    sourceChild?.parentId === sourceRoot.id,
    "Model node parent-child relationship was not retained",
  );
  const sourceRootTransform = sourceRoot.components.find(
    (component) => component.type === "transform",
  );
  const sourceChildTransform = sourceChild.components.find(
    (component) => component.type === "transform",
  );
  assert(
    JSON.stringify(sourceRootTransform?.scale) ===
      JSON.stringify([0.01, 0.01, 0.01]) &&
      JSON.stringify(sourceChildTransform?.position) ===
        JSON.stringify([1, 2, 3]),
    "Model import scale must wrap root geometry and child translations once",
  );
  assert(
    sourceChild.components.some(
      (component) =>
        component.type === "mesh" &&
        component.geometry?.kind === "asset" &&
        component.geometry.sourceNodeIndex === 1,
    ),
    "Expanded Model Mesh did not retain its source node index",
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Model hierarchy fixture failed: ${message}`);
}
