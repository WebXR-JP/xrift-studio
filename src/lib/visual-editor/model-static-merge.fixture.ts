import {
  BoxGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  SkinnedMesh,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  collectStaticMergeExclusions,
  modelStaticMergeRuntimeSource,
} from "./model-static-merge";
import {
  SCENE_DOCUMENT_SCHEMA_VERSION,
  createMeshColliderComponent,
  createMeshComponent,
  createTransformComponent,
  type SceneDocument,
  type SceneEntity,
} from "./scene-document";

/**
 * 結合が「まとめてはいけないものまでまとめる」ことを防ぐ。
 *
 * 動くNodeを混ぜると位置が固定されてアニメーションが止まり、作者がNode単位で
 * 付けたMaterialやColliderは、まとめた瞬間に行き先を失う。生成コードをそのまま
 * 評価して、除外が効いていることと三角形が保たれることを確かめる。
 */
export function runModelStaticMergeFixtureAssertions(): void {
  assertExclusionPlan();
  assertMergeBehaviour();
}

function assertExclusionPlan(): void {
  const modelEntityId = "entity-model";
  const mesh = createMeshComponent("component-mesh", "model-asset", [
    { slot: "body", materialAssetId: "material-a" },
    { slot: "detail", materialAssetId: "material-b", sourceNodeIndex: 7 },
  ]);
  const withPose = {
    ...mesh,
    modelPose: {
      bones: {},
      morphTargets: {},
      nodes: {
        "3": {
          position: [0, 1, 0] as [number, number, number],
          rotation: [0, 0, 0] as [number, number, number],
          scale: [1, 1, 1] as [number, number, number],
        },
      },
    },
  };
  const node = (index: number, extra: Partial<SceneEntity>): SceneEntity => ({
    id: `node-${index}`,
    name: `Node ${index}`,
    parentId: modelEntityId,
    children: [],
    enabled: true,
    components: [createTransformComponent(`node-${index}-transform`)],
    modelNode: {
      modelEntityId,
      modelAssetId: "model-asset",
      sourceNodeIndex: index,
      nodeType: "mesh",
      sourceMaterialIndices: [0],
      restPosition: [0, 0, 0],
      restRotation: [0, 0, 0],
      restScale: [1, 1, 1],
    },
    ...extra,
  });
  const scene: SceneDocument = {
    schemaVersion: SCENE_DOCUMENT_SCHEMA_VERSION,
    sceneId: "scene-merge-fixture",
    name: "merge fixture",
    rootEntityIds: [modelEntityId],
    entities: {
      [modelEntityId]: {
        id: modelEntityId,
        name: "Model",
        parentId: null,
        children: [],
        enabled: true,
        components: [createTransformComponent("model-transform"), withPose],
      },
      "node-1": node(1, {}),
      "node-2": node(2, { enabled: false }),
      "node-4": node(4, {
        components: [
          createTransformComponent("node-4-transform"),
          createMeshColliderComponent("node-4-collider", { meshMode: "trimesh" }),
        ],
      }),
    },
  };
  const excluded = collectStaticMergeExclusions(scene, modelEntityId, withPose);
  assert(
    JSON.stringify(excluded) === JSON.stringify([2, 3, 4, 7]),
    `Merge exclusions were wrong: ${JSON.stringify(excluded)}`,
  );
  assert(
    !excluded.includes(1),
    "A plain Model node with nothing authored on it must stay mergeable",
  );
}

function assertMergeBehaviour(): void {
  const shared = new MeshBasicMaterial({ name: "Grass" });
  const other = new MeshBasicMaterial({ name: "Rock" });
  const root = new Group();
  const triangleCount = (object: Object3D): number => {
    let total = 0;
    object.traverse((child) => {
      const mesh = child as Mesh & { isMesh?: boolean };
      if (!mesh.isMesh) return;
      const index = mesh.geometry.getIndex();
      total += index
        ? index.count / 3
        : mesh.geometry.getAttribute("position").count / 3;
    });
    return total;
  };
  const addMesh = (
    name: string,
    material: MeshBasicMaterial,
    nodeIndex: number,
    x: number,
  ): Mesh => {
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), material);
    mesh.name = name;
    mesh.position.set(x, 0, 0);
    mesh.userData.xriftSourceNodeIndex = nodeIndex;
    root.add(mesh);
    return mesh;
  };
  for (let index = 0; index < 6; index += 1) {
    addMesh(`Grass_${index}`, shared, 10 + index, index);
  }
  addMesh("Rock_0", other, 20, 0);
  addMesh("Rock_1", other, 21, 1);
  // 作者が触ったNodeと、animationが動かすNodeは残さなければならない。
  const authored = addMesh("Grass_authored", shared, 30, 9);
  const animatedParent = new Object3D();
  animatedParent.userData.xriftSourceNodeIndex = 40;
  const animatedChild = new Mesh(new BoxGeometry(1, 1, 1), shared);
  animatedChild.userData.xriftSourceNodeIndex = 41;
  animatedParent.add(animatedChild);
  root.add(animatedParent);
  const skinned = new SkinnedMesh(new BoxGeometry(1, 1, 1), shared);
  skinned.userData.xriftSourceNodeIndex = 50;
  root.add(skinned);

  const before = triangleCount(root);
  const merge = new Function(
    "Matrix4",
    "Mesh",
    "mergeGeometries",
    `${modelStaticMergeRuntimeSource({ typed: false })}\nreturn xriftMergeStaticModelMeshes;`,
  )(Matrix4, Mesh, mergeGeometries) as (
    root: Object3D,
    parserJson: unknown,
    excluded: readonly number[],
  ) => void;

  merge(
    root,
    { nodes: [], animations: [{ channels: [{ target: { node: 40 } }] }] },
    [30],
  );

  assert(
    triangleCount(root) === before,
    `Merging changed the triangle count: ${before} -> ${triangleCount(root)}`,
  );
  const names = root.children.map((child) => child.name);
  assert(
    names.includes("xrift-merged-Grass") && names.includes("xrift-merged-Rock"),
    `Merged meshes were not created: ${names.join(",")}`,
  );
  assert(
    !names.includes("Grass_0") && !names.includes("Rock_0"),
    "Merged source meshes were left in the scene",
  );
  assert(
    root.children.includes(authored),
    "A Node the author configured must not be merged away",
  );
  assert(
    animatedChild.parent === animatedParent,
    "A Node under an animated Node must not be merged away",
  );
  assert(
    root.children.includes(skinned),
    "A Skinned Mesh must not be merged away",
  );
  const merged = root.children.find(
    (child) => child.name === "xrift-merged-Grass",
  ) as Mesh;
  assert(
    merged.userData.xriftMergedFrom === 6,
    `The merged mesh should report its 6 sources, got ${merged.userData.xriftMergedFrom}`,
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Model static merge fixture failed: ${message}`);
}
