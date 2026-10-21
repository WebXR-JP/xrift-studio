// Compile a real node-specific MToon override for the brush render regression.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
process.env.XRIFT_TYPESCRIPT_PATH = 'typescript-test-api';
const fixtureHooks = fs.readFileSync('scripts/run-authoring-fixtures.cjs', 'utf8');
eval(fixtureHooks.slice(0, fixtureHooks.indexOf('(async () => {')));
(async () => {
  const { createPrototypeProject } = await import(pathToFileURL(path.resolve('src/lib/visual-editor/prototype-project.ts')).href);
  const { normalizeMaterialProperties, normalizeModelImportSettings } = await import(pathToFileURL(path.resolve('src/lib/visual-editor/asset-manifest.ts')).href);
  const { compileVisualProject } = await import(pathToFileURL(path.resolve('src/lib/visual-editor/compiler/compile.ts')).href);
  const p = createPrototypeProject('world', 'openbrush-material-overrides');
  const material = { id: 'brush-toon', name: 'Green MToon', kind: 'material', status: 'ready', source: { kind: 'document' }, properties: normalizeMaterialProperties({ doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0, 1, 0, 1] }, extensions: { VRMC_materials_mtoon: { shadeColorFactor: [0, 1, 0], outlineWidthMode: 'none' } } }) };
  const model = { id: 'brush-model', name: 'Repeated DiamondHull', kind: 'model', status: 'ready', source: { kind: 'project', relativePath: 'assets/brush.glb' }, importSettings: normalizeModelImportSettings({ mergeStaticMeshes: false }), materialSlots: [0, 1].map(i => ({ slot: `material-${i}`, name: 'DiamondHull (Instance)', sourceMaterialIndex: i })), importMetadata: { sourceFormat: 'glb', byteLength: 1024, nodeCount: 3, meshCount: 2, primitiveCount: 2, bounds: { min: [-1, -1, 0], max: [1, 1, 0], center: [0, 0, 0], size: [2, 2, 0], boundingSphereRadius: 2 }, animations: [], extensionsUsed: [], extensionsRequired: [], openBrush: { renderer: 'three-icosa', rendererVersion: 'three-icosa@0.4.2-alpha.18', extensionNames: [], brushNames: ['DiamondHull'] } } };
  Object.assign(p.assets.assets, { [material.id]: material, [model.id]: model });
  for (const entity of Object.values(p.scene.entities)) for (const component of entity.components) if (component.type === 'mesh') {
    component.geometry = { kind: 'asset', assetId: model.id };
    component.materialBindings = [{ slot: 'material-0', sourceNodeIndex: 0, materialAssetId: material.id }];
  }
  const output = compileVisualProject({ project: p.project, assets: p.assets, scenes: { [p.scene.sceneId]: p.scene }, prefabs: p.prefabs });
  if (!output.canStage) throw new Error(JSON.stringify(output.diagnostics));
  const directory = path.resolve('node_modules/.cache/xrift-studio/openbrush-material-overrides');
  for (const file of output.overlayFiles) {
    if (!/\.(ts|tsx|js)$/.test(file.relativePath)) continue;
    let source = file.content;
    if (file.relativePath === 'src/World.tsx') {
      const properties = /^const MTOON_PROPERTIES_brush_toon_.*;$/m.exec(source)?.[0];
      const component = /^const CompiledMaterial_brush_toon_[\s\S]*?^};/m.exec(source)?.[0];
      const props = /^type CompiledMaterialProps = .*;$/m.exec(source)?.[0];
      const injection = /^const injectModelMaterials_\w+ = [\s\S]*?^ {8}};/m.exec(source)?.[0];
      const loader = /^class CompiledOpenBrushGLTFLoader extends GLTFLoader [\s\S]*?^}/m.exec(source)?.[0];
      if (!properties || !component || !props || !injection || !loader) throw new Error('Missing generated brush override declarations');
      const injectionName = /^const (\w+)/.exec(injection)[1];
      source = 'import { XriftMToonMaterial, type MToonSurfaceProperties } from "./xrift-studio/mtoon-material";\nimport { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";\nimport { createOpenBrushMaterialExtension } from "./xrift-studio/open-brush-runtime";\nimport type { FC } from "react";\nimport type { Object3D } from "three";\n' + [properties, props, component, injection, loader].join('\n');
      source += `\nexport { ${injectionName} as injectPublishedMaterials, CompiledOpenBrushGLTFLoader };\nexport const toonAsset = ${JSON.stringify(material)};\n`;
    }
    const target = path.join(directory, file.relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, source);
  }
  console.log('Prepared generated Open Brush node override');
})().catch(error => { console.error(error); process.exitCode = 1; });
