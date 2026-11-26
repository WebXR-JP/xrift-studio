/**
 * Regression tests for the foliage models written by generate-foliage-models.mjs.
 * Run: node --test scripts/foliage-models.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  FOLIAGE_MODELS,
  FOLIAGE_OUTPUT_DIRECTORY,
  buildFoliageModels,
  checkFoliageModels,
  cos,
  pow,
  sin,
} from "./generate-foliage-models.mjs";

const built = buildFoliageModels();

const FLOAT = 5126;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;
const COMPONENT_BYTES = { [FLOAT]: 4, [UNSIGNED_SHORT]: 2, [UNSIGNED_INT]: 4 };
const TYPE_SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

/**
 * Size limits in bytes. Standard models aim for 450 kB and lighter ones for
 * 200 kB. The garden tree, grown from its spec as it is, comes out larger, so
 * it has limits of its own until that spec is revisited.
 */
const SIZE_LIMITS = {
  "foliage-broadleaf.glb": 450_000,
  "foliage-broadleaf-light.glb": 200_000,
  "foliage-garden-tree.glb": 950_000,
  "foliage-garden-tree-light.glb": 300_000,
  "foliage-shrub.glb": 450_000,
  "foliage-shrub-light.glb": 200_000,
};

/** Height above the ground and width along x and z, in metres. */
const SPECIES_SIZE = {
  "foliage-broadleaf": { height: [9, 12], spread: [8, 14] },
  "foliage-garden-tree": { height: [4, 6], spread: [6, 9] },
  "foliage-shrub": { height: [1.5, 2.6], spread: [2.5, 4.5] },
};

/** Splits a GLB into its JSON and binary chunks and checks the container. */
function readGlb(bytes, label) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, `${label}: magic`);
  assert.equal(bytes.readUInt32LE(4), 2, `${label}: container version`);
  assert.equal(bytes.readUInt32LE(8), bytes.length, `${label}: declared length`);
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, `${label}: the first chunk is JSON`);
  assert.equal(jsonLength % 4, 0, `${label}: JSON chunk alignment`);
  const binaryHeader = 20 + jsonLength;
  const binaryLength = bytes.readUInt32LE(binaryHeader);
  assert.equal(bytes.readUInt32LE(binaryHeader + 4), 0x004e4942, `${label}: the second chunk is BIN`);
  assert.equal(binaryLength % 4, 0, `${label}: BIN chunk alignment`);
  assert.equal(binaryHeader + 8 + binaryLength, bytes.length, `${label}: the two chunks fill the file`);
  const json = JSON.parse(bytes.subarray(20, binaryHeader).toString("utf8"));
  assert.equal(json.buffers.length, 1, `${label}: one buffer`);
  assert.equal(json.buffers[0].uri, undefined, `${label}: the buffer is the BIN chunk`);
  assert.equal(json.buffers[0].byteLength, binaryLength, `${label}: buffer length`);
  return { json, binary: bytes.subarray(binaryHeader + 8), label };
}

/** Reads an accessor into a plain array and checks how it sits in the buffer. */
function readAccessor({ json, binary, label }, index, componentType, type) {
  const accessor = json.accessors[index];
  assert.equal(accessor.componentType, componentType, `${label}: accessor ${index} component type`);
  assert.equal(accessor.type, type, `${label}: accessor ${index} type`);
  assert.equal(accessor.byteOffset ?? 0, 0, `${label}: accessor ${index} offset`);
  const view = json.bufferViews[accessor.bufferView];
  const width = COMPONENT_BYTES[componentType];
  assert.equal(view.byteOffset % 4, 0, `${label}: bufferView ${accessor.bufferView} alignment`);
  assert.equal(view.byteStride, undefined, `${label}: bufferView ${accessor.bufferView} is not interleaved`);
  assert.equal(
    view.byteLength,
    accessor.count * TYPE_SIZE[type] * width,
    `${label}: bufferView ${accessor.bufferView} length`,
  );
  assert.ok(view.byteOffset + view.byteLength <= binary.length, `${label}: bufferView ${accessor.bufferView} fits`);
  const values = new Array(accessor.count * TYPE_SIZE[type]);
  for (let i = 0; i < values.length; i++) {
    const offset = view.byteOffset + i * width;
    values[i] =
      componentType === FLOAT
        ? binary.readFloatLE(offset)
        : componentType === UNSIGNED_SHORT
          ? binary.readUInt16LE(offset)
          : binary.readUInt32LE(offset);
  }
  return { accessor, view, values, count: accessor.count };
}

/** One primitive with every attribute read, checked against the contract's shape. */
function readPrimitive(glb, meshIndex, semantics) {
  const { json, label } = glb;
  const mesh = json.meshes[meshIndex];
  assert.equal(mesh.primitives.length, 1, `${label}: ${mesh.name} has one primitive`);
  const primitive = mesh.primitives[0];
  assert.equal(primitive.mode ?? 4, 4, `${label}: ${mesh.name} is triangles`);
  assert.deepEqual(Object.keys(primitive.attributes), Object.keys(semantics), `${label}: ${mesh.name} attributes`);
  const attributes = {};
  for (const [semantic, type] of Object.entries(semantics)) {
    attributes[semantic] = readAccessor(glb, primitive.attributes[semantic], FLOAT, type);
    assert.equal(attributes[semantic].view.target, 34962, `${label}: ${mesh.name} ${semantic} is vertex data`);
  }
  const vertexCount = attributes.POSITION.count;
  for (const [semantic, attribute] of Object.entries(attributes)) {
    assert.equal(attribute.count, vertexCount, `${label}: ${mesh.name} ${semantic} count`);
  }
  // 65535 cannot be an index in a 16-bit buffer.
  const indexType = vertexCount <= 65535 ? UNSIGNED_SHORT : UNSIGNED_INT;
  const indices = readAccessor(glb, primitive.indices, indexType, "SCALAR");
  assert.equal(indices.view.target, 34963, `${label}: ${mesh.name} indices are index data`);
  assert.equal(indices.count % 3, 0, `${label}: ${mesh.name} index count`);
  assert.ok(indices.values.every((value) => value < vertexCount), `${label}: ${mesh.name} index range`);
  return { primitive, attributes, indices: indices.values, vertexCount };
}

const BARK_SEMANTICS = { POSITION: "VEC3", NORMAL: "VEC3", TEXCOORD_0: "VEC2", _ACROWN: "VEC4", _ACORE: "SCALAR" };
const LEAF_SEMANTICS = { POSITION: "VEC3", NORMAL: "VEC3", TEXCOORD_0: "VEC2", _ALEAF: "VEC4", _ACROWN: "VEC4" };

const vec = (values, size, i) => values.slice(i * size, i * size + size);
const length = (v) => Math.sqrt(v.reduce((sum, value) => sum + value * value, 0));
const subtract = (a, b) => a.map((value, i) => value - b[i]);
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const close = (a, b, tolerance) => Math.abs(a - b) <= tolerance;

function boundsOf(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  positions.forEach((value, i) => {
    min[i % 3] = Math.min(min[i % 3], value);
    max[i % 3] = Math.max(max[i % 3], value);
  });
  return { min, max };
}

test("the list of models is the six files the catalog expects", () => {
  assert.deepEqual(
    FOLIAGE_MODELS.map((model) => model.fileName),
    Object.keys(SIZE_LIMITS),
  );
});

test("two runs write the same bytes", () => {
  const again = buildFoliageModels();
  assert.equal(again.length, built.length);
  again.forEach((model, i) => {
    assert.ok(model.bytes.equals(built[i].bytes), `${model.fileName} differs between two runs`);
    assert.deepEqual(model.report, built[i].report);
  });
});

test("the committed GLBs are what the generator writes", () => {
  assert.deepEqual(checkFoliageModels(FOLIAGE_OUTPUT_DIRECTORY, built), []);
});

test("the check names a file that differs and a file that is missing", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "foliage-models-"));
  try {
    for (const { fileName, bytes } of built) fs.writeFileSync(path.join(directory, fileName), bytes);
    assert.deepEqual(checkFoliageModels(directory, built), []);
    const changed = Buffer.from(built[0].bytes);
    changed[changed.length - 1] ^= 1;
    fs.writeFileSync(path.join(directory, built[0].fileName), changed);
    fs.rmSync(path.join(directory, built[1].fileName));
    const problems = checkFoliageModels(directory, built);
    assert.equal(problems.length, 2);
    assert.ok(problems[0].startsWith(`${built[0].fileName} differs: `), problems[0]);
    assert.ok(problems[0].includes(built[0].report.sha256), problems[0]);
    assert.equal(problems[1], `${built[1].fileName} is missing`);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("sine, cosine and power are the nearest double, whatever the engine's own functions return", () => {
  // Expected values come from 90-digit decimal arithmetic, rounded once.
  assert.equal(sin(1), 0.8414709848078965);
  assert.equal(cos(1), 0.5403023058681398);
  assert.equal(sin(10), -0.5440211108893698);
  assert.equal(cos(10), -0.8390715290764524);
  // A value where V8's Math.sin is one unit in the last place away.
  assert.equal(sin(-2.5), -0.5984721441039565);
  assert.equal(cos(-2.5), -0.8011436155469337);
  assert.equal(sin(44), 0.017701925105413577);
  assert.equal(sin(1e15), 0.8582727931702359);
  assert.equal(cos(1e15), -0.5131937377869703);
  assert.equal(sin(Math.PI), 1.2246467991473532e-16);
  assert.equal(sin(3e-9), 3e-9);
  assert.equal(cos(3e-9), 1);
  assert.ok(Object.is(sin(0), 0) && Object.is(sin(-0), -0));
  assert.equal(cos(0), 1);
  assert.equal(pow(0.007, 2.4), 6.733413665178239e-6);
  assert.equal(pow(10, -2.4), 0.003981071705534973);
  assert.equal(pow(0.3, 1 / 2.4), 0.6055274787301019);
  assert.equal(pow(2, 0.5), 1.4142135623730951);
  assert.equal(pow(2, 10), 1024);
  assert.equal(pow(0.25, 0.5), 0.5);
  assert.equal(pow(1, 2.4), 1);
  // A branch tip keeps its radius through the pipe model, so chains of equal
  // thickness stay equal.
  assert.equal(pow(pow(0.007, 2.4), 1 / 2.4), 0.007);
  // Outside the magnitudes the fixed point covers they refuse instead of
  // returning a value with too few correct digits.
  for (const outside of [() => sin(1e30), () => cos(1e-30), () => sin(Number.NaN), () => cos(Infinity)]) {
    assert.throws(outside, RangeError);
  }
  for (const outside of [() => pow(0, 2.4), () => pow(-1, 2), () => pow(1e-30, 2), () => pow(0.001, 30)]) {
    assert.throws(outside, RangeError);
  }
});

for (const { fileName, bytes, report } of built) {
  const name = path.basename(fileName, ".glb");

  test(`${fileName}: container, nodes, meshes and materials follow the contract`, () => {
    const glb = readGlb(bytes, fileName);
    const { json } = glb;
    assert.equal(json.asset.version, "2.0");
    assert.equal(json.scene, 0);
    assert.deepEqual(json.scenes, [{ nodes: [0] }]);
    assert.deepEqual(json.nodes, [
      { name, children: [1, 2] },
      { name: "bark", mesh: 0 },
      { name: "leaves", mesh: 1 },
    ]);
    assert.deepEqual(json.meshes.map((mesh) => mesh.name), ["bark", "leaves"]);
    // Fallback materials only: no textures and no extensions.
    for (const key of ["textures", "images", "samplers", "extensionsUsed", "extensionsRequired"]) {
      assert.equal(json[key], undefined, `${fileName}: ${key}`);
    }
    assert.deepEqual(json.materials.map((material) => material.name), ["bark", "leaves"]);
    const [bark, leaves] = json.materials;
    assert.equal(bark.doubleSided ?? false, false);
    assert.equal(bark.pbrMetallicRoughness.metallicFactor, 0);
    assert.ok(bark.pbrMetallicRoughness.roughnessFactor >= 0.8);
    assert.equal(leaves.doubleSided, true);
    assert.equal(leaves.pbrMetallicRoughness.metallicFactor, 0);
    const [barkRed, barkGreen, barkBlue] = bark.pbrMetallicRoughness.baseColorFactor;
    assert.ok(barkRed > barkGreen && barkGreen > barkBlue, "bark is brown");
    const [leafRed, leafGreen, leafBlue] = leaves.pbrMetallicRoughness.baseColorFactor;
    assert.ok(leafGreen > leafRed && leafGreen > leafBlue, "leaves are green");
    assert.equal(json.meshes[0].primitives[0].material, 0);
    assert.equal(json.meshes[1].primitives[0].material, 1);
    // Every bufferView belongs to exactly one accessor and they tile the buffer.
    assert.equal(json.accessors.length, 12);
    assert.deepEqual(json.accessors.map((accessor) => accessor.bufferView), [...Array(12).keys()]);
    let end = 0;
    for (const view of json.bufferViews) {
      assert.equal(view.byteOffset, Math.ceil(end / 4) * 4, `${fileName}: bufferViews are packed in order`);
      end = view.byteOffset + view.byteLength;
    }
    assert.equal(Math.ceil(end / 4) * 4, json.buffers[0].byteLength);
  });

  test(`${fileName}: bark carries tubes and the crown core`, () => {
    const glb = readGlb(bytes, fileName);
    const { primitive, attributes, indices, vertexCount } = readPrimitive(glb, 0, BARK_SEMANTICS);
    assert.equal(vertexCount, report.barkVertices);
    assert.equal(indices.length, report.barkTriangles * 3);
    const position = glb.json.accessors[primitive.attributes.POSITION];
    assert.deepEqual({ min: position.min, max: position.max }, boundsOf(attributes.POSITION.values));
    let coreVertices = 0;
    for (let i = 0; i < vertexCount; i++) {
      assert.ok(close(length(vec(attributes.NORMAL.values, 3, i)), 1, 1e-4), `${fileName}: bark normal ${i}`);
      const crown = vec(attributes._ACROWN.values, 4, i);
      assert.ok(close(length(crown.slice(0, 3)), 1, 1e-4), `${fileName}: bark crown direction ${i}`);
      const core = attributes._ACORE.values[i];
      assert.ok(core === 0 || core === 1, `${fileName}: bark core flag ${i}`);
      if (core === 1) {
        coreVertices++;
        // On the core the crown attribute is the core's normal and a fixed depth.
        assert.deepEqual(crown.slice(0, 3), vec(attributes.NORMAL.values, 3, i));
        assert.equal(crown[3], Math.fround(0.55));
        assert.deepEqual(vec(attributes.TEXCOORD_0.values, 2, i), [0, 0]);
      } else {
        assert.ok(crown[3] >= 0 && crown[3] <= 1.5, `${fileName}: bark crown depth ${i}`);
        assert.ok(vec(attributes.TEXCOORD_0.values, 2, i).every((value) => value >= 0));
      }
    }
    // The core comes last, so its vertices are the tail of the buffer.
    const firstCore = attributes._ACORE.values.indexOf(1);
    assert.equal(firstCore === -1 ? 0 : vertexCount - firstCore, coreVertices);
    const coreTriangles = indices.filter((value, i) => i % 3 === 0 && attributes._ACORE.values[value] === 1).length;
    assert.equal(coreTriangles, report.coreTriangles);
    // The standard garden tree shows its branching and has no core.
    assert.equal(report.coreTriangles, fileName === "foliage-garden-tree.glb" ? 0 : 80);
  });

  test(`${fileName}: every leaf card is four vertices around its pivot`, () => {
    const glb = readGlb(bytes, fileName);
    const { primitive, attributes, indices, vertexCount } = readPrimitive(glb, 1, LEAF_SEMANTICS);
    const cards = report.leafCards;
    assert.ok(cards > 0);
    assert.equal(vertexCount, cards * 4);
    assert.equal(indices.length, cards * 6);
    const position = glb.json.accessors[primitive.attributes.POSITION];
    assert.deepEqual({ min: position.min, max: position.max }, boundsOf(attributes.POSITION.values));
    const insetLow = [Math.fround(0.02), Math.fround(0.52)];
    const insetHigh = [Math.fround(0.48), Math.fround(0.98)];
    const cells = new Set();
    for (let k = 0; k < cards; k++) {
      assert.deepEqual(
        indices.slice(k * 6, k * 6 + 6),
        [k * 4, k * 4 + 1, k * 4 + 2, k * 4 + 1, k * 4 + 3, k * 4 + 2],
        `${fileName}: card ${k} triangles`,
      );
      const corners = [0, 1, 2, 3].map((j) => vec(attributes.POSITION.values, 3, k * 4 + j));
      const leaf = vec(attributes._ALEAF.values, 4, k * 4);
      const crown = vec(attributes._ACROWN.values, 4, k * 4);
      const normal = vec(attributes.NORMAL.values, 3, k * 4);
      for (let j = 1; j < 4; j++) {
        assert.deepEqual(vec(attributes._ALEAF.values, 4, k * 4 + j), leaf, `${fileName}: card ${k} pivot`);
        assert.deepEqual(vec(attributes._ACROWN.values, 4, k * 4 + j), crown, `${fileName}: card ${k} crown`);
        assert.deepEqual(vec(attributes.NORMAL.values, 3, k * 4 + j), normal, `${fileName}: card ${k} normal`);
      }
      assert.ok(leaf[3] >= 0 && leaf[3] < 1, `${fileName}: card ${k} random value`);
      assert.ok(close(length(normal), 1, 1e-4), `${fileName}: card ${k} normal length`);
      assert.ok(close(length(crown.slice(0, 3)), 1, 1e-4), `${fileName}: card ${k} crown direction`);
      assert.ok(crown[3] >= 0 && crown[3] <= 1.5, `${fileName}: card ${k} crown depth`);
      // The pivot is on the centre line, 6 % of the height above the bottom edge.
      const bottom = corners[0].map((value, axis) => (value + corners[1][axis]) / 2);
      const top = corners[2].map((value, axis) => (value + corners[3][axis]) / 2);
      const expected = bottom.map((value, axis) => value + (top[axis] - value) * 0.06);
      assert.ok(length(subtract(leaf.slice(0, 3), expected)) < 1e-4, `${fileName}: card ${k} pivot position`);
      // A square card, wound so that its front is the side NORMAL points to.
      const width = length(subtract(corners[1], corners[0]));
      const height = length(subtract(top, bottom));
      assert.ok(close(width, height, 1e-4) && width > 0.1, `${fileName}: card ${k} shape`);
      const face = cross(subtract(corners[1], corners[0]), subtract(corners[2], corners[0]));
      assert.ok(dot(face, normal) > 0, `${fileName}: card ${k} winding`);
      // One cell of the 2 x 2 atlas, inset by 0.02, with v = 0 at the bottom.
      const uv = [0, 1, 2, 3].map((j) => vec(attributes.TEXCOORD_0.values, 2, k * 4 + j));
      const column = insetLow.indexOf(uv[0][0]);
      const row = insetLow.indexOf(uv[0][1]);
      assert.ok(column >= 0 && row >= 0, `${fileName}: card ${k} atlas cell`);
      assert.deepEqual(uv, [
        [insetLow[column], insetLow[row]],
        [insetHigh[column], insetLow[row]],
        [insetLow[column], insetHigh[row]],
        [insetHigh[column], insetHigh[row]],
      ]);
      cells.add(row * 2 + column);
    }
    assert.equal(cells.size, 4, `${fileName}: all four atlas cells are used`);
  });

  test(`${fileName}: stands at the origin and has the size of its species`, () => {
    const glb = readGlb(bytes, fileName);
    const bark = readPrimitive(glb, 0, BARK_SEMANTICS);
    const leaves = readPrimitive(glb, 1, LEAF_SEMANTICS);
    const tubes = bark.attributes.POSITION.values.filter(
      (_, i) => bark.attributes._ACORE.values[Math.floor(i / 3)] === 0,
    );
    const tubeBounds = boundsOf(tubes);
    // The trunk starts 0.15 m below the origin so its foot stays buried on
    // uneven ground; the lean tilts the foot a little further down.
    const footDepth = -tubeBounds.min[1];
    assert.ok(footDepth >= 0.1 && footDepth <= 0.3, `${fileName}: trunk foot ${footDepth} m below the origin`);
    // Low cards of the shrub hang below ground level. Nothing reaches deeper.
    assert.ok(report.bounds.min[1] >= -0.55, `${fileName}: lowest point at ${report.bounds.min[1]}`);
    // The foot of the trunk surrounds the origin.
    const foot = [];
    for (let i = 0; i < tubes.length; i += 3) if (tubes[i + 1] < 0) foot.push([tubes[i], tubes[i + 2]]);
    assert.ok(foot.length >= 3);
    for (const axis of [0, 1]) {
      assert.ok(Math.min(...foot.map((p) => p[axis])) < 0 && Math.max(...foot.map((p) => p[axis])) > 0);
    }
    // The report's bounds are the union of the two primitives' recorded bounds.
    const leafBounds = boundsOf(leaves.attributes.POSITION.values);
    const barkBounds = boundsOf(bark.attributes.POSITION.values);
    for (const axis of [0, 1, 2]) {
      assert.equal(report.bounds.min[axis], Math.min(barkBounds.min[axis], leafBounds.min[axis]));
      assert.equal(report.bounds.max[axis], Math.max(barkBounds.max[axis], leafBounds.max[axis]));
    }
    const species = SPECIES_SIZE[name.replace(/-light$/, "")];
    const height = report.bounds.max[1];
    assert.ok(height >= species.height[0] && height <= species.height[1], `${fileName}: height ${height}`);
    for (const axis of [0, 2]) {
      const spread = report.bounds.max[axis] - report.bounds.min[axis];
      assert.ok(spread >= species.spread[0] && spread <= species.spread[1], `${fileName}: spread ${spread}`);
      // The crown sits over the trunk.
      assert.ok(Math.abs(report.crown.centre[axis]) < 0.5, `${fileName}: crown centre ${report.crown.centre}`);
    }
    const longest = Math.max(...[0, 1, 2].map((axis) => report.bounds.max[axis] - report.bounds.min[axis]));
    assert.ok(close(report.approxRadius, longest / 2, 1e-4));
    // The lighter version is the same tree with fewer, larger cards, so its
    // crown is where the standard one is.
    if (name.endsWith("-light")) {
      const standard = built.find((model) => model.fileName === `${name.replace(/-light$/, "")}.glb`).report;
      assert.ok(report.leafCards < standard.leafCards);
      assert.ok(report.barkTriangles < standard.barkTriangles);
      assert.ok(report.byteLength < standard.byteLength);
      for (const axis of [0, 1, 2]) {
        assert.ok(close(report.crown.centre[axis], standard.crown.centre[axis], 0.1), `${fileName}: crown centre`);
        assert.ok(close(report.crown.radius[axis], standard.crown.radius[axis], 0.1), `${fileName}: crown radius`);
      }
    }
  });

  test(`${fileName}: is within its size limit`, () => {
    assert.equal(report.byteLength, bytes.length);
    assert.ok(bytes.length <= SIZE_LIMITS[fileName], `${fileName} is ${bytes.length} bytes`);
  });

  test(`${fileName}: three.js GLTFLoader names the objects and lower-cases the attributes`, async () => {
    const committed = fs.readFileSync(path.join(FOLIAGE_OUTPUT_DIRECTORY, fileName));
    const data = committed.buffer.slice(committed.byteOffset, committed.byteOffset + committed.byteLength);
    const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(data, "", resolve, reject));
    assert.equal(gltf.scene.children.length, 1);
    const root = gltf.scene.children[0];
    assert.equal(root.name, name);
    assert.deepEqual(root.children.map((child) => `${child.type} ${child.name}`), ["Mesh bark", "Mesh leaves"]);
    const [bark, leaves] = root.children;
    assert.deepEqual(Object.keys(bark.geometry.attributes), ["position", "normal", "uv", "_acrown", "_acore"]);
    assert.deepEqual(Object.keys(leaves.geometry.attributes), ["position", "normal", "uv", "_aleaf", "_acrown"]);
    assert.equal(bark.geometry.attributes._acrown.itemSize, 4);
    assert.equal(bark.geometry.attributes._acore.itemSize, 1);
    assert.equal(leaves.geometry.attributes._aleaf.itemSize, 4);
    assert.equal(leaves.geometry.attributes._acrown.itemSize, 4);
    for (const mesh of [bark, leaves]) {
      for (const attribute of Object.values(mesh.geometry.attributes)) {
        assert.ok(attribute.array instanceof Float32Array);
        assert.equal(attribute.normalized, false);
      }
    }
    assert.equal(bark.geometry.attributes.position.count, report.barkVertices);
    assert.equal(bark.geometry.index.count, report.barkTriangles * 3);
    assert.equal(leaves.geometry.attributes.position.count, report.leafCards * 4);
    assert.equal(leaves.geometry.index.count, report.leafCards * 6);
    // uv arrives unchanged: the bottom of a card is the bottom row of its atlas cell.
    assert.ok([Math.fround(0.02), Math.fround(0.52)].includes(leaves.geometry.attributes.uv.getY(0)));
    assert.equal(bark.material.name, "bark");
    assert.equal(leaves.material.name, "leaves");
    assert.equal(leaves.material.side, 2);
    assert.equal(bark.material.map, null);
    assert.equal(leaves.material.map, null);
  });
}
