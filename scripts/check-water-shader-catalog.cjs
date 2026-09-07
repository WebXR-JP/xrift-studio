/* Catalog integrity/export check using the installed Vite toolchain. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');

// Use the same TypeScript transform and module resolution as the application.
// TypeScript 7 no longer exposes the legacy transpileModule API.
async function main() {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  let catalog;
  try {
    catalog = await server.ssrLoadModule('/src/lib/visual-editor/water-shader-catalog.ts');
  } finally {
    await server.close();
  }
const entries = catalog.WATER_SHADER_CATALOG;
assert.equal(entries.length, 21);
assert.equal(new Set(entries.map(e => e.id)).size, entries.length);
assert.equal(new Set(entries.map(e => e.category)).size, 8);
let controls = 0;
for (const entry of entries) {
  assert(entry.features.length >= 2);
  assert(entry.notes.length > 0);
  assert.equal(entry.shader.animatedTimeUniform, 'uTime');
  assert.equal(entry.shader.uniforms.uWaveDisplacement.value, 0, 'An ordinary Plane must remain safe');
  assert.equal(entry.shader.variants[0].transparent, true);
  assert.equal(entry.shader.variants[0].depthWrite, false);
  assert(entry.shader.vertexShader.includes('normalMatrix * normal'));
  assert(entry.shader.fragmentShader.includes('#include <fog_fragment>'));
  assert(entry.shader.fragmentShader.includes('uTime * max(uWindSpeed, 0.0) * max(uWaveSpeed, 0.0)'));
  const names = new Set();
  for (const parameter of entry.parameters) {
    assert(!names.has(parameter.uniform), `Duplicate control: ${entry.id}/${parameter.uniform}`);
    names.add(parameter.uniform);
    const uniform = entry.shader.uniforms[parameter.uniform];
    assert(uniform, `Missing ${entry.id}/${parameter.uniform}`);
    assert.equal(uniform.kind, parameter.kind);
    assert(entry.shader.fragmentShader.includes(parameter.uniform));
    if (parameter.kind === 'number') {
      assert(Number.isFinite(uniform.value));
      assert(uniform.value >= parameter.min && uniform.value <= parameter.max,
        `${entry.id}/${parameter.uniform}=${uniform.value} outside ${parameter.min}..${parameter.max}`);
      assert(parameter.step > 0 && parameter.max > parameter.min);
    } else assert(/^#[a-f0-9]{6}$/i.test(uniform.value));
    controls++;
  }
  for (const define of Object.keys(entry.shader.variants[0].defines)) {
    assert(entry.shader.fragmentShader.includes(`#ifdef ${define}`), `${define} is unused`);
  }
  const original = JSON.stringify(entry);
  const changed = catalog.applyWaterShaderParameters(entry, {
    uWaveLayers: 99, uDeepColor: '#0A1B2C', uWaveHeight: NaN,
    uFoamAmount: -99, uOpacity: Infinity, uNotAUniform: 99, uDetailQuality: 0.8,
  });
  assert.equal(changed.uniforms.uWaveLayers.value, 4);
  assert.equal(changed.uniforms.uDeepColor.value, '#0a1b2c');
  assert.equal(changed.uniforms.uFoamAmount.value, 0);
  assert.equal(changed.uniforms.uDetailQuality.value, 1);
  assert.equal(changed.uniforms.uWaveHeight.value, entry.shader.uniforms.uWaveHeight.value);
  assert.equal(changed.uniforms.uOpacity.value, entry.shader.uniforms.uOpacity.value);
  assert.equal(changed.uniforms.uNotAUniform, undefined);
  assert.equal(JSON.stringify(entry), original, 'Catalog was mutated');
}
for (const id of ['calm-lake', 'ocean-waves', 'stylized-toon']) assert(catalog.getWaterShaderCatalogEntry(id));
assert.equal(catalog.getWaterShaderCatalogEntry('missing'), undefined);
const programs = new Set(entries.map(e => JSON.stringify(e.shader.variants[0].defines))).size;
assert(programs >= 12, 'Catalog became colour-only variations');
const report = { status: 'passed', presets: entries.length, categories: 8, featurePrograms: programs,
  parameterBindings: controls, checks: ['stable IDs', 'schema/ranges', 'parameter sanitizing', 'no catalog mutation',
    'wind/time declaration', 'safe Plane defaults', 'shader feature bindings', 'fog chunks'],
  scope: 'Catalog/TypeScript syntax only. Run browser GLSL and full application checks separately.' };
console.log(JSON.stringify(report, null, 2));
const outIndex = process.argv.indexOf('--export');
if (outIndex >= 0) {
  const output = path.resolve(process.argv[outIndex + 1]);
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'catalog.json'), JSON.stringify({ revision: catalog.WATER_SHADER_CATALOG_REVISION, entries }, null, 2));
  fs.writeFileSync(path.join(output, 'catalog-check.json'), JSON.stringify(report, null, 2));
  const template = fs.readFileSync(path.join(root, 'dev/water-shaders/lab.template.html'), 'utf8');
  const lab = fs.readFileSync(path.join(root, 'dev/water-shaders/lab.js'), 'utf8');
  const data = JSON.stringify({ revision: catalog.WATER_SHADER_CATALOG_REVISION, entries }).replace(/</g, '\\u003c');
  fs.writeFileSync(path.join(output, 'preview.html'), template.replace('__CATALOG_JSON__', data).replace('__LAB_JS__', lab));

  for (const entry of entries) {
    const directory = path.join(output, 'shaders', entry.id);
    fs.mkdirSync(directory, { recursive: true });
    const defines = Object.entries(entry.shader.variants[0].defines).map(([name, value]) => `#define ${name} ${value}\n`).join('');
    fs.writeFileSync(path.join(directory, 'water.vert'), defines + entry.shader.vertexShader);
    fs.writeFileSync(path.join(directory, 'water.frag'), defines + entry.shader.fragmentShader);
    fs.writeFileSync(path.join(directory, 'material.shader.json'), JSON.stringify(entry.shader, null, 2));
  }
}

}
main().catch((error) => { console.error(error); process.exitCode = 1; });
