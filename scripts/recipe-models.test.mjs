/** Focused, dependency-free asset/catalog regression tests.
 * Run: node --experimental-strip-types --test scripts/recipe-models.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { disposeCatalogModel } from '../src/components/visual-editor/dispose-catalog-model.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const manifest = JSON.parse(read('docs/asset-refresh/manifest.json'));
const catalog = read('src/lib/visual-editor/builtin-recipe-models.ts');
const definitions = vm.runInNewContext(catalog.match(/BUILTIN_RECIPE_MODELS[^=]*= (\[[\s\S]*?\n\]);/)[1]);
const recipes = read('src/lib/visual-editor/scene-recipe-catalog.ts');

function recipe(name) {
  const literal = recipes.match(new RegExp(`const ${name}: SceneRecipe = (\\{[\\s\\S]*?\\n\\});`))[1];
  return vm.runInNewContext(`(${literal})`, { SCENE_RECIPE_IDS: { campfire: 'campfire', fountain: 'fountain', well: 'well' } });
}

test('all 32 actual GLBs match pinned metadata and content-derived asset IDs', () => {
  assert.equal(manifest.length, 32);
  assert.equal(definitions.length, 32);
  assert.equal(new Set(definitions.map((d) => d.modelId)).size, 32);
  for (const definition of definitions) {
    const buffer = fs.readFileSync(path.join(root, 'public', definition.publicPath));
    const hash = createHash('sha256').update(buffer).digest('hex');
    assert.equal(hash, definition.sha256, definition.fileName);
    assert.equal(buffer.length, definition.byteLength, definition.fileName);
    const gltf = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString('utf8'));
    const positions = gltf.meshes.flatMap(mesh => mesh.primitives.map(primitive => gltf.accessors[primitive.attributes.POSITION]));
    for (const axis of [0, 1, 2]) {
      assert.equal(definition.bounds.min[axis], Math.min(...positions.map(accessor => accessor.min[axis])));
      assert.equal(definition.bounds.max[axis], Math.max(...positions.map(accessor => accessor.max[axis])));
    }
    assert.equal(definition.assetId, `model-${path.basename(definition.fileName, '.glb')}-${hash.slice(0, 12)}`);
    const item = manifest.find((d) => d.modelId === definition.modelId);
    assert.equal(item?.sha256, hash);
    assert.ok(buffer.length < 1_000_000, `${definition.fileName} exceeds 1 MB`);
  }
});

test('every literal recipe model reference exists in the updated catalog', () => {
  const ids = new Set(definitions.map((d) => d.modelId));
  for (const match of recipes.matchAll(/\bmodelId:\s*"([^"]+)"/g)) {
    assert.ok(ids.has(match[1]), `Unknown model ${match[1]}`);
  }
});

test('campfire uses its GLB with bounded flame, smoke and ember capacities', () => {
  const value = recipe('CAMPFIRE');
  assert.equal(value.parts.filter((p) => p.kind === 'model')[0].modelId, 'campfireBase');
  assert.equal(value.parts.filter((p) => p.kind === 'primitive').length, 0);
  const particles = value.parts.filter((p) => p.kind === 'particle');
  assert.equal(particles.reduce((sum, p) => sum + p.overrides.maxParticles, 0), 152);
  assert.ok(value.parts.filter((p) => p.kind === 'light').every((p) => !p.light.castShadow));
});

test('fountain replaces primitive ring and locates the 80-particle jet at its nozzle', () => {
  const value = recipe('FOUNTAIN');
  assert.equal(value.parts.length, 2);
  assert.equal(value.parts[0].modelId, 'fountain');
  assert.equal(value.parts[1].overrides.maxParticles, 80);
  assert.equal(value.parts[1].position[1], 1.05);
  assert.match(value.note, /静的なGLB/);
});

test('well uses a hollow stone basin alongside the existing stable roof model ID', () => {
  const value = recipe('WELL');
  assert.equal(value.parts.map((p) => p.modelId).join(','), 'wellBasin,wellFrame');
});

test('catalog disposal releases shared geometry, materials, textures and bitmaps once', () => {
  let geometryCalls = 0, materialCalls = 0, textureCalls = 0, bitmapCalls = 0;
  const geometry = { dispose: () => geometryCalls++ };
  const image = { close: () => bitmapCalls++ };
  const textureA = { isTexture: true, image, dispose: () => textureCalls++ };
  const textureB = { isTexture: true, image, dispose: () => textureCalls++ };
  const material = { map: textureA, normalMap: textureB, arbitraryValue: 1, dispose: () => materialCalls++ };
  const object = { traverse: (visit) => [{}, { geometry, material }, { geometry, material: [material] }].forEach(visit) };
  disposeCatalogModel(object);
  assert.equal(geometryCalls, 1);
  assert.equal(materialCalls, 1);
  assert.equal(textureCalls, 2);
  assert.equal(bitmapCalls, 1);
});

test('non-bitmap textures and objects without meshes can be disposed safely', () => {
  const material = { map: { isTexture: true, image: { width: 256 }, dispose() {} }, dispose() {} };
  assert.doesNotThrow(() => disposeCatalogModel({ traverse: (visit) => [{}, { material }].forEach(visit) }));
});

test('preview code waits for model loads and releases late-completing GLB loads', () => {
  const frame = read('src/components/visual-editor/CatalogPreviewFrame.tsx');
  const preview = read('src/components/visual-editor/SceneRecipeCatalogPreview.tsx');
  assert.match(frame, /assetLoads\.pending\.size > 0 \|\| assetLoads\.failed/);
  assert.match(preview, /if \(cancelled\) \{\s*disposeCatalogModel\(gltf\.scene\)/);
  assert.match(preview, /if \(loaded\) disposeCatalogModel\(loaded\)/);
  assert.match(preview, /\?v=\$\{definition\.sha256\.slice\(0, 12\)\}/);
});
