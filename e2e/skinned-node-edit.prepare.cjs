const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
process.env.XRIFT_TYPESCRIPT_PATH = "typescript-test-api";
const fixtureHooks = fs.readFileSync("scripts/run-authoring-fixtures.cjs", "utf8");
eval(fixtureHooks.slice(0, fixtureHooks.indexOf("(async () => {")));

function childWeightedAvatar(bytes) {
  const result = Uint8Array.from(bytes);
  const header = new DataView(result.buffer);
  if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(16, true) !== 0x4e4f534a) throw new Error("Expected the original VRM GLB fixture");
  const jsonLength = header.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(result.subarray(20, 20 + jsonLength)).trim());
  if (json.nodes[0].name !== "hips" || json.nodes[1].name !== "spine" || json.skins[0].joints.length !== 1 || json.skins[0].joints[0] !== 0) {
    throw new Error("The source avatar skin structure changed");
  }
  const binaryOffset = 28 + jsonLength;
  const originalBinary = result.subarray(binaryOffset, binaryOffset + json.buffers[0].byteLength);
  const binary = new Uint8Array(originalBinary.byteLength + 128);
  binary.set(originalBinary);
  const jointsAccessor = json.accessors[json.meshes[0].primitives[0].attributes.JOINTS_0];
  const jointView = json.bufferViews[jointsAccessor.bufferView];
  if (jointsAccessor.componentType !== 5123 || jointsAccessor.type !== "VEC4") throw new Error("The original joint accessor changed");
  const jointData = new DataView(binary.buffer);
  for (let vertex = 0; vertex < jointsAccessor.count; vertex++) {
    const offset = jointView.byteOffset + (jointsAccessor.byteOffset ?? 0) + vertex * 8;
    if (jointData.getUint16(offset, true) !== 0) throw new Error("The original skin weight changed");
    jointData.setUint16(offset, 1, true);
  }
  // Both the hips parent and spine child are real Skin joints. The body uses
  // the spine, so editing either bone deforms the same actual SkinnedMesh.
  const inverseAccessor = json.accessors[json.skins[0].inverseBindMatrices];
  const inverseView = json.bufferViews[inverseAccessor.bufferView];
  const identity = originalBinary.subarray(inverseView.byteOffset, inverseView.byteOffset + 64);
  binary.set(identity, originalBinary.byteLength);
  binary.set(identity, originalBinary.byteLength + 64);
  inverseAccessor.bufferView = json.bufferViews.length;
  inverseAccessor.count = 2;
  json.bufferViews.push({ buffer: 0, byteOffset: originalBinary.byteLength, byteLength: 128 });
  json.buffers[0].byteLength = binary.byteLength;
  json.skins[0].joints = [0, 1];
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const newJsonLength = Math.ceil(encoded.byteLength / 4) * 4;
  const newBinaryLength = Math.ceil(binary.byteLength / 4) * 4;
  const glb = new Uint8Array(28 + newJsonLength + newBinaryLength);
  const outputHeader = new DataView(glb.buffer);
  outputHeader.setUint32(0, 0x46546c67, true);
  outputHeader.setUint32(4, 2, true);
  outputHeader.setUint32(8, glb.byteLength, true);
  outputHeader.setUint32(12, newJsonLength, true);
  outputHeader.setUint32(16, 0x4e4f534a, true);
  glb.fill(0x20, 20, 20 + newJsonLength);
  glb.set(encoded, 20);
  outputHeader.setUint32(20 + newJsonLength, newBinaryLength, true);
  outputHeader.setUint32(24 + newJsonLength, 0x004e4942, true);
  glb.set(binary, 28 + newJsonLength);
  return glb;
}
(async () => {
  const module = await import(pathToFileURL(path.resolve("src/lib/visual-editor/compiler/vrm-avatar.fixture.ts")).href);
  const directory = path.resolve(".guide-review/skinned-node-fixtures");
  fs.mkdirSync(directory, { recursive: true });
  for (const version of ["0", "1"]) {
    const bytes = module.createVrmAvatarFixtureBytes(version, "sphere");
    fs.writeFileSync(path.join(directory, `avatar-${version}.vrm`), bytes);
    fs.writeFileSync(path.join(directory, `avatar-${version}-posed.vrm`), childWeightedAvatar(bytes));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
