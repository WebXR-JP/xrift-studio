import {
  collectMtlTexturePaths,
  collectObjMaterialLibraries,
  planModelCompanionBatch,
  type ModelCompanionBatchFile,
} from "./model-companion-batch";

/** Filesystem-free checks for sidecar grouping inside one import batch. */
export async function runModelCompanionBatchFixtureAssertions(): Promise<void> {
  await assertGltfSidecarsAreGrouped();
  await assertUnreferencedFilesStayStandalone();
  await assertObjResolvesTexturesThroughMtl();
  await assertSingleFileBatchIsUntouched();
  assertMtlOptionFlagsAreIgnored();
  assertMultipleMaterialLibrariesAreCollected();
}

async function assertGltfSidecarsAreGrouped(): Promise<void> {
  const gltf = JSON.stringify({
    asset: { version: "2.0" },
    buffers: [{ uri: "scene.bin", byteLength: 4 }],
    images: [
      { uri: "textures/base.png" },
      { uri: "data:image/png;base64,AAAA" },
    ],
  });
  const plan = await planModelCompanionBatch([
    textFile("export/scene.gltf", gltf),
    textFile("export/scene.bin", ""),
    textFile("export/textures/base.png", ""),
  ]);
  assert(
    plan.consumedPaths.length === 2,
    `glTF sidecars were not consumed: ${JSON.stringify(plan.consumedPaths)}`,
  );
  assert(
    plan.companionsByModelPath["export/scene.gltf"]?.length === 2,
    "glTF companions were not attached to the model entry",
  );
  assert(
    !plan.consumedPaths.some((path) => path.endsWith(".gltf")),
    "The model itself must never be consumed as its own companion",
  );
}

async function assertUnreferencedFilesStayStandalone(): Promise<void> {
  const gltf = JSON.stringify({
    asset: { version: "2.0" },
    buffers: [{ uri: "scene.bin", byteLength: 4 }],
  });
  const plan = await planModelCompanionBatch([
    textFile("scene.gltf", gltf),
    textFile("scene.bin", ""),
    textFile("unrelated-logo.png", ""),
  ]);
  assert(
    plan.consumedPaths.length === 1 &&
      plan.consumedPaths[0] === "scene.bin",
    `An unreferenced image was swallowed as a companion: ${JSON.stringify(
      plan.consumedPaths,
    )}`,
  );
}

async function assertObjResolvesTexturesThroughMtl(): Promise<void> {
  const plan = await planModelCompanionBatch([
    textFile("crate/crate.obj", "mtllib crate.mtl\nv 0 0 0\n"),
    textFile(
      "crate/crate.mtl",
      "newmtl body\nmap_Kd -s 1 1 1 maps/crate-diffuse.png\n",
    ),
    textFile("crate/maps/crate-diffuse.png", ""),
  ]);
  assert(
    plan.consumedPaths.length === 2,
    `OBJ did not resolve its MTL and texture: ${JSON.stringify(
      plan.consumedPaths,
    )}`,
  );
  assert(
    plan.consumedPaths.includes("crate/maps/crate-diffuse.png"),
    "MTL texture paths must resolve relative to the MTL file",
  );
}

async function assertSingleFileBatchIsUntouched(): Promise<void> {
  const plan = await planModelCompanionBatch([
    textFile("scene.gltf", "{}"),
  ]);
  assert(
    plan.consumedPaths.length === 0 &&
      Object.keys(plan.companionsByModelPath).length === 0,
    "A single-file batch must keep the existing import behaviour",
  );
}

function assertMtlOptionFlagsAreIgnored(): void {
  const paths = collectMtlTexturePaths(
    "map_Kd -o 0 0 0 -s 1 1 1 wood.png\nbump -bm 0.2 wood-normal.png\n",
  );
  assert(
    paths.length === 2 &&
      paths[0] === "wood.png" &&
      paths[1] === "wood-normal.png",
    `MTL option flags leaked into texture paths: ${JSON.stringify(paths)}`,
  );
}

function assertMultipleMaterialLibrariesAreCollected(): void {
  const libraries = collectObjMaterialLibraries(
    "mtllib body.mtl glass.mtl\nmtllib decal.mtl\n",
  );
  assert(
    libraries.length === 3,
    `A multi-name mtllib line was not expanded: ${JSON.stringify(libraries)}`,
  );
}

function textFile(path: string, source: string): ModelCompanionBatchFile {
  return { path, readText: async () => source };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
