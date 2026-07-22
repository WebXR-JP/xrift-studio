import { createPrototypeProject } from "./prototype-project";
import {
  createUnityPackageImportPlan,
  parseUnityYamlText,
  UNITY_HIERARCHY_MAX_DEPTH,
} from "./unity-package-import";

const UNITY_SCENE_FIXTURE = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!1 &1
GameObject:
  m_Name: Imported Root
  m_IsActive: 1
--- !u!4 &4
Transform:
  m_GameObject: {fileID: 1}
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalPosition: {x: 1, y: 2, z: 3}
  m_LocalScale: {x: 1, y: 1, z: 1}
  m_Father: {fileID: 0}
--- !u!33 &33
MeshFilter:
  m_GameObject: {fileID: 1}
  m_Mesh: {fileID: 10202}
--- !u!23 &23
MeshRenderer:
  m_GameObject: {fileID: 1}
  m_Enabled: 1
  m_CastShadows: 1
  m_ReceiveShadows: 1
  m_Materials: []
--- !u!65 &65
BoxCollider:
  m_GameObject: {fileID: 1}
  m_Enabled: 1
  m_IsTrigger: 0
  m_Size: {x: 2, y: 4, z: 6}
  m_Center: {x: 0, y: 1, z: 0}
--- !u!1 &2
GameObject:
  m_Name: Child Light
  m_IsActive: 1
--- !u!4 &5
Transform:
  m_GameObject: {fileID: 2}
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalPosition: {x: 0, y: 1, z: 2}
  m_LocalScale: {x: 1, y: 1, z: 1}
  m_Father: {fileID: 4}
--- !u!108 &108
Light:
  m_GameObject: {fileID: 2}
  m_Enabled: 1
  m_Type: 2
  m_Color: {r: 1, g: 0.5, b: 0.25, a: 1}
  m_Intensity: 2
  m_Range: 12
--- !u!114 &114
MonoBehaviour:
  m_GameObject: {fileID: 2}
  m_Enabled: 1
  m_Script: {fileID: 11500000, guid: abcdefabcdefabcdefabcdefabcdefab, type: 3}
`;

export async function runUnityPackageImportFixture(): Promise<void> {
  const parsed = parseUnityYamlText(UNITY_SCENE_FIXTURE, "Fixture.unity");
  assert(parsed.objects.length === 9, "Unity YAML object count changed");
  assert(
    parsed.objects.some((object) => object.classId === "114"),
    "MonoBehaviour class ID must remain inspectable",
  );

  const bundle = createPrototypeProject("world", "unity-import-fixture");
  const source = new TextEncoder().encode(UNITY_SCENE_FIXTURE);
  const plan = await createUnityPackageImportPlan({
    fileName: "Fixture.unity",
    bytes: source,
    bundle,
  });
  assert(plan.canCommit, "Standalone Unity scene should be convertible");
  assert(plan.result.prefabCount === 1, "Unity scene should create one Prefab");
  assert(plan.result.entityCount === 2, "Unity hierarchy should keep both GameObjects");
  assert(
    plan.diagnostics.some((diagnostic) => diagnostic.code === "unity-csharp-not-converted"),
    "MonoBehaviour must report the explicit no-C#-conversion boundary",
  );

  const imported = Object.values(plan.scene.entities).filter((entity) =>
    ["Imported Root", "Child Light"].includes(entity.name),
  );
  const root = imported.find((entity) => entity.name === "Imported Root");
  const child = imported.find((entity) => entity.name === "Child Light");
  assert(Boolean(root && child), "Converted entities are missing");
  assert(child?.parentId === root?.id, "Unity Transform parenting was not rebuilt");
  const transform = root?.components.find((component) => component.type === "transform");
  assert(
    transform?.type === "transform" && transform.position[2] === -3,
    "Unity left-handed Z coordinate was not converted",
  );
  assert(
    root?.components.some((component) => component.type === "mesh"),
    "Unity built-in Cube should map to an XRift primitive",
  );
  assert(
    child?.components.some((component) => component.type === "light"),
    "Unity Light should remain authorable",
  );
  const prefab = Object.values(plan.prefabs).find(
    (candidate) => candidate.importMetadata?.sourcePath === "Fixture.unity",
  );
  assert(
    prefab?.importMetadata?.csharpConversion === "not-attempted",
    "Prefab provenance must persist the C# conversion policy",
  );

  const packagePlan = await createUnityPackageImportPlan({
    fileName: "Fixture.unitypackage",
    bytes: await unityPackageFixtureBytes(UNITY_SCENE_FIXTURE),
    bundle: createPrototypeProject("world", "unity-package-fixture"),
  });
  assert(packagePlan.canCommit, "gzip tar UnityPackage should be readable");
  assert(
    Object.values(packagePlan.prefabs).some(
      (candidate) => candidate.importMetadata?.sourcePath === "Assets/Fixture.unity",
    ),
    "UnityPackage pathname must survive extraction",
  );

  const cyclicPlan = await createUnityPackageImportPlan({
    fileName: "Cycle.prefab",
    bytes: new TextEncoder().encode(UNITY_CYCLIC_HIERARCHY_FIXTURE),
    bundle: createPrototypeProject("world", "unity-cycle-fixture"),
  });
  const cycleRoot = Object.values(cyclicPlan.scene.entities).find(
    (entity) => entity.name === "Cycle Root",
  );
  const cycleChild = Object.values(cyclicPlan.scene.entities).find(
    (entity) => entity.name === "Cycle Child",
  );
  const cycleDescendant = Object.values(cyclicPlan.scene.entities).find(
    (entity) => entity.name === "Cycle Descendant",
  );
  assert(
    cycleChild?.parentId === null &&
      cycleRoot?.parentId === cycleChild.id &&
      cycleDescendant?.parentId === cycleChild.id,
    "Cycle repair detached a non-cyclic Unity descendant",
  );

  const deepPlan = await createUnityPackageImportPlan({
    fileName: "Deep.prefab",
    bytes: new TextEncoder().encode(
      unityDeepHierarchyFixture(UNITY_HIERARCHY_MAX_DEPTH + 1),
    ),
    bundle: createPrototypeProject("world", "unity-deep-hierarchy-fixture"),
  });
  assert(
    deepPlan.diagnostics.some(
      (diagnostic) => diagnostic.code === "unity-hierarchy-too-deep",
    ),
    "Overly deep Unity hierarchy was not reported before entering the editor",
  );
  assert(
    !Object.values(deepPlan.scene.entities).some((entity) =>
      entity.name.startsWith("Deep Entity"),
    ),
    "Overly deep Unity hierarchy reached the editor Scene",
  );
}

const UNITY_CYCLIC_HIERARCHY_FIXTURE = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!1 &1
GameObject:
  m_Name: Cycle Root
  m_IsActive: 1
--- !u!4 &11
Transform:
  m_GameObject: {fileID: 1}
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalPosition: {x: 0, y: 0, z: 0}
  m_LocalScale: {x: 1, y: 1, z: 1}
  m_Father: {fileID: 22}
--- !u!1 &2
GameObject:
  m_Name: Cycle Child
  m_IsActive: 1
--- !u!4 &22
Transform:
  m_GameObject: {fileID: 2}
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalPosition: {x: 0, y: 0, z: 0}
  m_LocalScale: {x: 1, y: 1, z: 1}
  m_Father: {fileID: 33}
--- !u!1 &3
GameObject:
  m_Name: Cycle Descendant
  m_IsActive: 1
--- !u!4 &33
Transform:
  m_GameObject: {fileID: 3}
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalPosition: {x: 0, y: 0, z: 0}
  m_LocalScale: {x: 1, y: 1, z: 1}
  m_Father: {fileID: 22}
`;

function unityDeepHierarchyFixture(depth: number): string {
  const lines = ["%YAML 1.1", "%TAG !u! tag:unity3d.com,2011:"];
  for (let index = 0; index < depth; index += 1) {
    const gameObjectId = index * 2 + 1;
    const transformId = gameObjectId + 1;
    const parentTransformId = index === 0 ? 0 : transformId - 2;
    lines.push(
      `--- !u!1 &${gameObjectId}`,
      "GameObject:",
      `  m_Name: Deep Entity ${index}`,
      "  m_IsActive: 1",
      `--- !u!4 &${transformId}`,
      "Transform:",
      `  m_GameObject: {fileID: ${gameObjectId}}`,
      "  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}",
      "  m_LocalPosition: {x: 0, y: 0, z: 0}",
      "  m_LocalScale: {x: 1, y: 1, z: 1}",
      `  m_Father: {fileID: ${parentTransformId}}`,
    );
  }
  return lines.join("\n");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function unityPackageFixtureBytes(scene: string): Promise<Uint8Array> {
  const guid = "0123456789abcdef0123456789abcdef";
  const tar = createTar([
    [`${guid}/pathname`, new TextEncoder().encode("Assets/Fixture.unity")],
    [`${guid}/asset`, new TextEncoder().encode(scene)],
  ]);
  const stream = new Blob([tar.buffer as ArrayBuffer])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function createTar(entries: Array<[string, Uint8Array]>): Uint8Array {
  const blocks: Uint8Array[] = [];
  for (const [name, content] of entries) {
    const header = new Uint8Array(512);
    writeAscii(header, 0, 100, name);
    writeAscii(header, 100, 8, "0000644\0");
    writeAscii(header, 108, 8, "0000000\0");
    writeAscii(header, 116, 8, "0000000\0");
    writeAscii(header, 124, 12, `${content.byteLength.toString(8).padStart(11, "0")}\0`);
    writeAscii(header, 136, 12, "00000000000\0");
    header.fill(32, 148, 156);
    header[156] = 48;
    writeAscii(header, 257, 6, "ustar\0");
    writeAscii(header, 263, 2, "00");
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    writeAscii(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
    blocks.push(header, content);
    const padding = (512 - (content.byteLength % 512)) % 512;
    if (padding) blocks.push(new Uint8Array(padding));
  }
  blocks.push(new Uint8Array(1024));
  const total = blocks.reduce((sum, block) => sum + block.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const block of blocks) {
    result.set(block, offset);
    offset += block.byteLength;
  }
  return result;
}

function writeAscii(
  target: Uint8Array,
  offset: number,
  length: number,
  value: string,
): void {
  const bytes = new TextEncoder().encode(value);
  target.set(bytes.subarray(0, length), offset);
}
