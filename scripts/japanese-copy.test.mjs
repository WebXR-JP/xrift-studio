/** Japanese UI copy, current-name searches and serialized authoring contracts.
 * Run after pnpm install: node --test scripts/japanese-copy.test.mjs
 * Uses the pinned TypeScript compiler API for tests; no browser or network.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const ts = require('typescript-test-api');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const cache = new Map();
// Transpile and load the real, dependency-free authoring/runtime modules. No mocks.
function load(file) {
  file = path.resolve(root, file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const localRequire = name => {
    if (!name.startsWith('.')) return require(name);
    const full = path.resolve(path.dirname(file), name);
    const base = full.replace(/\.js$/, '');
    const resolved = [full, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]
      .find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (!resolved) throw new Error(`Cannot resolve ${name} from ${file}`);
    return load(resolved);
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: file })
    (localRequire, module, module.exports);
  return module.exports;
}
const editor = load('src/lib/visual-editor/interactivity-graph.ts');
const runtime = load('packages/xrift-studio-runtime/src/interactivity/engine.ts');
const properties = load('packages/xrift-studio-runtime/src/script/interaction-trigger.ts');
const materials = load('src/lib/visual-editor/material-extension-registry.ts');
const { matchesInteractivityOperation: matches } = load('src/lib/visual-editor/interactivity-search.ts');
const templates = editor.KHR_INTERACTIVITY_OPERATION_TEMPLATES;
const types = { bool: 0, int: 1, float: 2, float2: 3, float3: 4, float4: 5 };
const template = op => {
  const result = templates.find(entry => entry.op === op);
  assert.ok(result, `Missing operation: ${op}`);
  return result;
};

function withoutCopy(value) {
  if (Array.isArray(value)) return value.map(withoutCopy);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key, entry]) => !['label', 'reading', 'description', 'title', 'summary'].includes(key)
      && typeof entry !== 'function' && entry !== undefined)
    .map(([key, entry]) => [key, withoutCopy(entry)]));
  return value;
}
const digest = value => createHash('sha256').update(JSON.stringify(withoutCopy(value))).digest('hex');
// Captured from the unedited 0.9.25 archive. Intentional schema/default changes
// need a separate compatibility review before these snapshots are updated.
const contracts = {
  operations: ['efb38a08ee27d8547bad7fe1d77f1d98779080983a91920017ba59589cfd8d73',
    templates.map(entry => ({ ...entry, defaults: entry.createNode?.(types) }))],
  properties: ['dfe2f8867e93ffa01d79836b5a90da889c074d99a01f1801ae30580d934c2995',
    properties.XRIFT_INTERACTION_PROPERTIES],
  materials: ['06f28886e3bf32d820b66e291beb4973fe7cf138b60a646ba45cb5b440d7d2d7',
    materials.MATERIAL_EXTENSION_DESCRIPTORS],
};
for (const [name, [expected, value]] of Object.entries(contracts)) {
  test(`${name}: names, types, ports, options and defaults retain the original contract`, () => {
    assert.equal(digest(value), expected);
  });
}

test('all 45 nodes have short Japanese titles and complete descriptions', () => {
  assert.equal(templates.length, 45);
  for (const entry of templates) {
    assert.match(entry.label, /[ぁ-んァ-ヶ一-龠]/u, entry.op);
    assert.ok(entry.label.length <= 24, entry.label);
    assert.match(entry.description, /。$/, entry.op);
    assert.ok(entry.description.length <= 110, entry.op);
  }
});

test('current labels, descriptions, operation IDs, full-width and AND searches work', () => {
  for (const entry of templates) {
    assert.ok(matches(entry, entry.label), entry.label);
    assert.ok(matches(entry, entry.op), entry.op);
  }
  assert.ok(matches(template('flow/setDelay'), '待つ'));
  assert.ok(matches(template('math/add'), '足し算'));
  assert.ok(matches(template('xrift/setProperty'), '音量'));
  assert.ok(matches(template('flow/setDelay'), 'ＦＬＯＷ／ＳＥＴＤＥＬＡＹ'));
  assert.ok(matches(template('flow/setDelay'), '待つ　秒'));
  assert.ok(!matches(template('flow/setDelay'), '待つ 存在しない用語'));
  assert.ok(templates.every(entry => matches(entry, '  ')));
});

test('search has no alias table or extra vocabulary', () => {
  assert.doesNotMatch(read('src/lib/visual-editor/interactivity-search.ts'), /SEARCH_ALIASES|legacyNames/);
  const entry = { op: 'example/current', label: '現在の名前', description: '現在の説明です。' };
  assert.ok(matches(entry, '名前 説明'));
  assert.ok(!matches(entry, '存在しない別名'));
});

function graphBuilder() {
  const graph = { types: Object.keys(types).map(signature => ({ signature })),
    declarations: [], nodes: [], events: [] };
  const add = (op, patch = {}) => {
    const entry = template(op);
    const declaration = graph.declarations.push({ op, ...(entry.extension ? { extension: entry.extension } : {}) }) - 1;
    return graph.nodes.push({ declaration, ...entry.createNode?.(types), ...patch }) - 1;
  };
  const link = (from, output, to, input = 'in') => {
    graph.nodes[from].flows ??= {};
    graph.nodes[from].flows[output] = { node: to, socket: input };
  };
  const event = name => {
    const index = graph.events.push({ id: name }) - 1;
    return add('event/send', { configuration: { event: { value: [index] } } });
  };
  return { graph, add, link, event, extension: { graph: 0, graphs: [graph] } };
}

test('wait copy: out is immediate and done follows the requested delay', () => {
  const b = graphBuilder();
  const start = b.add('event/onStart');
  const wait = b.add('flow/setDelay', { values: { duration: { type: types.float, value: [3] } } });
  b.link(start, 'out', wait);
  b.link(wait, 'out', b.event('immediate'));
  b.link(wait, 'done', b.event('after-wait'));
  const result = editor.dryRunInteractivityGraph(b.extension, { horizonSeconds: 3 });
  assert.deepEqual(result.entries.filter(e => e.kind === 'event').map(e => [e.name, e.timeSeconds]),
    [['immediate', 0], ['after-wait', 3]]);
  assert.equal(result.issues.length, 0);
});

test('sequence copy: the next output does not wait for a pending delay', () => {
  const b = graphBuilder();
  const start = b.add('event/onStart');
  const sequence = b.add('flow/sequence');
  const wait = b.add('flow/setDelay');
  b.link(start, 'out', sequence);
  b.link(sequence, '0', wait);
  b.link(sequence, '1', b.event('next-output'));
  b.link(wait, 'done', b.event('delay-completed'));
  const result = editor.dryRunInteractivityGraph(b.extension, { horizonSeconds: 2 });
  assert.deepEqual(result.entries.filter(e => e.kind === 'event').map(e => [e.name, e.timeSeconds]),
    [['next-output', 0], ['delay-completed', 1]]);
  assert.equal(result.issues.length, 0);
});

test('loop copy: start 0 and end 3 produce exactly 0, 1, 2', () => {
  const b = graphBuilder();
  const start = b.add('event/onStart');
  const loop = b.add('flow/for');
  const event = b.event('iteration');
  b.graph.nodes[event].values = { index: { node: loop, socket: 'index' } };
  b.link(start, 'out', loop);
  b.link(loop, 'loopBody', event);
  const indexes = [];
  const engine = new runtime.InteractivityEngine(b.extension, {
    emitEvent: (_name, payload) => indexes.push(payload.get('index')?.data[0]),
  });
  engine.start();
  assert.deepEqual(indexes, [0, 1, 2]);
  assert.equal(engine.getIssues().length, 0);
});

test('the documented opening finishes at 12 seconds, with a white initial fade', () => {
  const b = graphBuilder();
  const action = (targetKind, property, value, seconds = 0) => {
    const index = b.add('xrift/setProperty');
    const descriptor = properties.getXriftInteractionProperty(targetKind, property);
    assert.ok(descriptor, `${targetKind}.${property}`);
    assert.ok(editor.configureInteractivityTriggerAction(b.graph, index,
      { entityId: targetKind, componentId: targetKind, targetKind, property }));
    assert.ok(editor.setInteractivityTriggerActionValue(b.graph, index, descriptor, value));
    assert.ok(editor.setInteractivityTriggerActionDuration(b.graph, index, seconds));
    return index;
  };
  const steps = [b.add('event/onStart'), action('scene', 'fadeColor', [1, 1, 1]),
    action('scene', 'fade', [1]), action('scene', 'fade', [0], 2),
    action('audio-source', 'playback', [0]), action('audio-source', 'volume', [1], 2),
    action('transform', 'position', [2, 0, 0], 3), action('light', 'intensity', [2], 1),
    action('audio-source', 'volume', [0], 4), action('scene', 'fade', [1], 4)];
  for (let i = 0; i < steps.length - 1; i++) {
    b.link(steps[i], [0, 1, 2, 4, 8].includes(i) ? 'out' : 'done', steps[i + 1]);
  }
  b.link(steps.at(-1), 'done', b.event('finished'));
  const result = editor.dryRunInteractivityGraph(b.extension, { horizonSeconds: 13 });
  const propertyEntries = result.entries.filter(e => e.kind === 'property');
  assert.deepEqual(propertyEntries.map(e => [e.timeSeconds, e.target.property, e.durationSeconds]), [
    [0, 'fadeColor', 0], [0, 'fade', 0], [0, 'fade', 2], [2, 'playback', 0],
    [2, 'volume', 2], [4, 'position', 3], [7, 'intensity', 1], [8, 'volume', 4], [8, 'fade', 4],
  ]);
  assert.deepEqual(propertyEntries[0].value.data, [1, 1, 1]);
  assert.equal(result.entries.find(e => e.kind === 'event' && e.name === 'finished')?.timeSeconds, 12);
  assert.equal(result.truncated, false);
  assert.equal(result.issues.length, 0);
});

test('material help uses glTF names and explains Alpha, Metallic and Roughness', () => {
  const source = read('src/components/visual-editor/AssetQuickEditor.tsx');
  assert.match(source, /label="Alpha"/);
  assert.match(source, /0で透明、1で不透明/);
  assert.match(source, /label="Metallic"/);
  assert.match(source, /1で金属の見た目/);
  assert.match(source, /反射がぼやけます/);
  assert.match(source, /title=\{extensionName\}/);
  for (const mode of ['OPAQUE', 'MASK', 'BLEND']) assert.ok(source.includes(`value="${mode}"`));
});

function jsxTextWithId(file, id) {
  const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
  let result;
  function visit(node) {
    if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some(attribute =>
      ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === 'id' &&
      attribute.initializer && ts.isStringLiteral(attribute.initializer) && attribute.initializer.text === id)) {
      result = node.children.filter(ts.isJsxText).map(child => child.text.trim()).join(' ');
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(result, `${file}: missing ${id}`);
  return result;
}

test('product pane labels remain Inspector, Hierarchy and Assets', () => {
  const base = 'src/components/visual-editor/';
  assert.equal(jsxTextWithId(`${base}InspectorPanel.tsx`, 'inspector-heading'), 'Inspector');
  assert.equal(jsxTextWithId(`${base}HierarchyPanel.tsx`, 'hierarchy-heading'), 'Hierarchy');
  assert.equal(jsxTextWithId(`${base}AssetsPanel.tsx`, 'assets-heading'), 'Assets');
  assert.match(read(`${base}InspectorPanel.tsx`), /Add Component/);
  assert.equal(template('xrift/setProperty').label, 'Entityの設定を変更');
  const source = read(`${base}VisualEditorPrototype.tsx`);
  for (const word of ['Inspectorの幅を変更', 'Hierarchyの幅を変更', 'Assetsの高さを変更'])
    assert.ok(source.includes(word), word);
});

test('empty selection states lead to actual panes without repeated explanations', () => {
  const inspector = read('src/components/visual-editor/InspectorPanel.tsx');
  assert.match(inspector, /Hierarchy、シーン、Assetsから編集するものを選んでください。/);
  const graph = read('src/components/visual-editor/InteractivityGraphEditor.tsx');
  assert.equal(graph.split('ノードを選ぶと、ここで設定を変更できます。').length - 1, 1);
  assert.doesNotMatch(graph, /ノードを選ぶと、色や時間などをここで設定できます。/);
});

test('node guidance names real nodes and preserves completion semantics', () => {
  const source = read('src/components/visual-editor/InteractionTriggerInspector.tsx');
  assert.ok(source.includes(`「${template('xrift/onInteract').label}」`));
  assert.match(template('flow/setDelay').description, /「出力」は待たず/);
  assert.match(template('flow/sequence').description, /完了は待ちません/);
  assert.match(read('src/components/visual-editor/InteractivityGraphEditor.tsx'), /未保存の変更は失われます/);
});

test('shorter help retains shared changes, numerical conditions and publication warnings', () => {
  const material = read('src/components/visual-editor/AssetQuickEditor.tsx');
  assert.match(material, /使用箇所すべてに反映/);
  assert.match(material, /Alpha ModeをBlendかMaskにします/);
  assert.match(material, /併用できない反射・透過の設定を解除/);
  const publishing = read('src/components/visual-editor/VisualUploadDialog.tsx');
  assert.match(publishing, /二重公開を防ぐ/);
  assert.match(publishing, /元画像は変更しません/);
  assert.match(read('src/components/visual-editor/ScriptEditorDialog.tsx'), /隔離環境で実行されるわけではありません/);
});

test('catalogs no longer expose preview implementation in permanent footers', () => {
  for (const name of ['SkyShaderStore', 'WaterShaderStore', 'GlowMaterialStore',
    'ParticlePresetStore', 'TerrainPresetStore', 'SceneRecipeStore', 'OfficialXriftComponentStore']) {
    const file = `src/components/visual-editor/${name}.tsx`;
    assert.doesNotMatch(read(file), /カードは実際|保存済みプレビューを表示しています|一覧はGLSLの描画/);
  }
});


test('built-in TSX code samples retain valid tags and syntax', () => {
  const file = 'src/lib/visual-editor/component-code-import.ts';
  const source = read(file);
  assert.ok(!source.includes('<メッシュ>'));
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  let samples = 0;
  function visit(node) {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      /<mesh\b/.test(node.text) && /\n/.test(node.text)) {
      samples++;
      const sample = ts.createSourceFile('sample.tsx', node.text, ts.ScriptTarget.Latest, true);
      assert.deepEqual(sample.parseDiagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, ' ')), []);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(samples >= 2, `Expected real TSX samples, found ${samples}`);
});

test('all guide pages resolve and their menu names match their headings', () => {
  const { pages: WIKI_PAGES } = JSON.parse(read('docs/guide/manifest.json'));
  for (const page of WIKI_PAGES) {
    const body = read(`docs/guide/${page.file}`);
    const heading = body.match(/^# (.+)$/m)?.[1];
    if (page.slug !== 'index') assert.equal(page.title, heading, page.file);
  }
});

test('user guides do not point at deleted documents or mistranslated brands', () => {
  const files = ['README.md', 'docs/README.md', 'docs/JAPANESE_WRITING.md',
    ...fs.readdirSync(path.join(root, 'docs/guide')).filter(f => f.endsWith('.md')).map(f => `docs/guide/${f}`)];
  for (const file of files) {
    const body = read(file).replace(/```[\s\S]*?```/g, '');
    assert.doesNotMatch(body, /開くブラシ|Tilt ブラシ|3D 3Dモデル|glTF Object 3Dモデル/, file);
    for (const match of body.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const href = match[1];
      if (/^(?:[a-z]+:|\/|#)/i.test(href)) continue;
      const local = decodeURIComponent(href.split(/[?#]/)[0]);
      assert.ok(fs.existsSync(path.resolve(root, path.dirname(file), local)), `${file}: ${href}`);
    }
  }
});

test('the complete existing runtime fixture still passes', () => {
  load('packages/xrift-studio-runtime/src/interactivity/engine.fixture.ts')
    .runInteractivityEngineFixtureAssertions();
});

test('an empty loop goes straight to completion without running its body', () => {
  for (const [startIndex, endIndex] of [[0, 0], [3, 1]]) {
    const b = graphBuilder();
    const start = b.add('event/onStart');
    const loop = b.add('flow/for', { values: {
      startIndex: { type: types.int, value: [startIndex] },
      endIndex: { type: types.int, value: [endIndex] },
    } });
    b.link(start, 'out', loop);
    b.link(loop, 'loopBody', b.event('body'));
    b.link(loop, 'completed', b.event('completed'));
    const result = editor.dryRunInteractivityGraph(b.extension);
    assert.deepEqual(result.entries.filter(e => e.kind === 'event').map(e => e.name), ['completed']);
    assert.equal(result.issues.length, 0);
  }
});

test('while rechecks the condition after the body updates a variable', () => {
  const b = graphBuilder();
  b.graph.variables = [{ type: types.int, value: [0] }];
  const start = b.add('event/onStart');
  const variable = b.add('variable/get', { configuration: { variable: { value: [0] } } });
  const condition = b.add('math/lt', { values: {
    a: { node: variable, socket: 'value' }, b: { type: types.int, value: [3] },
  } });
  const loop = b.add('flow/while', { values: { condition: { node: condition, socket: 'value' } } });
  const increment = b.add('math/add', { values: {
    a: { node: variable, socket: 'value' }, b: { type: types.int, value: [1] },
  } });
  const set = b.add('variable/set', { configuration: { variable: { value: [0] } },
    values: { '0': { node: increment, socket: 'value' } } });
  b.link(start, 'out', loop);
  b.link(loop, 'loopBody', set);
  b.link(set, 'out', b.event('body'));
  b.link(loop, 'completed', b.event('completed'));
  const result = editor.dryRunInteractivityGraph(b.extension);
  assert.deepEqual(result.entries.filter(e => e.kind === 'event').map(e => e.name),
    ['body', 'body', 'body', 'completed']);
  assert.equal(result.issues.length, 0);
});


test('technical IDs stay available without permanent explanatory rows', () => {
  const material = read('src/components/visual-editor/AssetQuickEditor.tsx');
  assert.match(material, /title=\{extensionName\}/);
  assert.doesNotMatch(material, /<summary[^>]*>仕様上の名前<\/summary>/);
  const graph = read('src/components/visual-editor/InteractivityGraphEditor.tsx');
  assert.match(graph, /title=\{selectedDeclaration.op\}/);
});

test('dynamic help keeps complete sentences and real export filenames', () => {
  const model = read('src/components/visual-editor/ModelAssetInspector.tsx');
  assert.match(model, /全\{animations.length\}本を同時にループ再生/);
  assert.match(model, /Entityへの追加は別途必要です/);
  const exported = read('src/components/visual-editor/ClassicExportDialog.tsx');
  assert.ok(exported.includes('"World.tsx" : "Item.tsx"'));
  assert.doesNotMatch(exported, /ワールド\.tsx|アイテム\.tsx/);
});

test('header-only component cards do not render an empty padded body', () => {
  const source = read('src/components/visual-editor/InspectorPanel.tsx');
  assert.ok(source.includes('children != null ? <div className="space-y-2 p-2.5">{children}</div> : null'));
  assert.doesNotMatch(source, /配置したプレハブです。/);
});


// English property names are presentation; Japanese remains the language of help.
test('all 11 material extensions keep their glTF name plus a Japanese reading', () => {
  const expected = {
    anisotropy: ['Anisotropy', 'アニソトロピー'],
    clearcoat: ['Clearcoat', 'クリアコート'],
    dispersion: ['Dispersion', 'ディスパージョン'],
    emissive_strength: ['Emissive Strength', 'エミッシブの強さ'],
    ior: ['IOR', '屈折率'],
    iridescence: ['Iridescence', 'イリデッセンス'],
    sheen: ['Sheen', 'シーン'],
    specular: ['Specular', 'スペキュラー'],
    transmission: ['Transmission', 'トランスミッション'],
    unlit: ['Unlit', 'アンリット'],
    volume: ['Volume', 'ボリューム'],
  };
  assert.equal(Object.keys(materials.MATERIAL_EXTENSION_DESCRIPTORS).length, 11);
  for (const [key, [label, reading]] of Object.entries(expected)) {
    const descriptor = materials.MATERIAL_EXTENSION_DESCRIPTORS[`KHR_materials_${key}`];
    assert.equal(descriptor.label, label);
    assert.equal(descriptor.reading, reading);
  }
});

function editorFunction(name) {
  const file = 'src/components/visual-editor/AssetQuickEditor.tsx';
  const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
  const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
  assert.ok(fn, name);
  return { ast, fn };
}

function jsxStringAttribute(node, name) {
  const attribute = node.attributes.properties.find(a => ts.isJsxAttribute(a) && a.name.text === name);
  return attribute?.initializer && ts.isStringLiteral(attribute.initializer) ? attribute.initializer.text : undefined;
}

function materialSection(title) {
  const { ast, fn } = editorFunction('StandardMaterialQuickEditor');
  let section;
  function visit(node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'EditorSection' &&
      jsxStringAttribute(node.openingElement, 'title') === title) section = node;
    ts.forEachChild(node, visit);
  }
  visit(fn);
  assert.ok(section, title);
  return section.getText(ast);
}

test('the material Inspector derives each extension heading from the shared registry', () => {
  const { ast, fn } = editorFunction('StandardMaterialQuickEditor');
  const names = [];
  function visit(node) {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(ast) === 'MaterialExtensionSection') {
      assert.equal(jsxStringAttribute(node, 'title'), undefined, 'Do not duplicate the registry label');
      names.push(jsxStringAttribute(node, 'extensionName'));
    }
    ts.forEachChild(node, visit);
  }
  visit(fn);
  assert.deepEqual(names.sort(), [...materials.MATERIAL_EXTENSION_NAMES].sort());
  const { fn: section } = editorFunction('MaterialExtensionSection');
  assert.match(section.getText(), /MATERIAL_EXTENSION_DESCRIPTORS\[extensionName\]/);
  assert.match(section.getText(), /flex-wrap/);
  assert.doesNotMatch(section.getText(), /truncate/);
});

test('Alpha Mode, Alpha, Cutoff and Opacity Map are together and precede material effects', () => {
  const section = materialSection('Alpha');
  for (const label of ['Alpha', 'Alpha Cutoff', 'Opacity Map'])
    assert.ok(section.includes(`label="${label}"`), label);
  assert.match(section, /Alpha Mode/);
  assert.match(section, /Opaque（不透明）/);
  assert.match(section, /Mask（切り抜き）/);
  assert.match(section, /Blend（半透明）/);
  assert.match(section, /Alphaがこの値未満の部分を切り抜きます/);
  assert.match(section, /MSAAが有効な環境/);
  assert.match(section, /asset.properties.blending === "normal"/);
  assert.ok(section.indexOf('Alpha Mode') < section.indexOf('label="Alpha"'));
  assert.doesNotMatch(materialSection('Rendering'), /value=\{asset.properties.alphaMode\}/);
  const source = editorFunction('StandardMaterialQuickEditor').fn.getText();
  assert.ok(source.indexOf('<EditorSection title="Alpha"') < source.indexOf('extensionName="KHR_materials_clearcoat"'));
});

test('material names stay consistent in the batch Inspector and node property lists', () => {
  const source = read('src/components/visual-editor/InspectorPanel.tsx');
  const batch = source.slice(source.indexOf('  if (allMaterials) {'), source.indexOf('  return <p', source.indexOf('  if (allMaterials) {')));
  for (const name of ['Base Color', 'Metallic', 'Roughness']) assert.ok(batch.includes(name), name);
  for (const [id, label] of Object.entries({ 'base-color': 'Base Color', metallic: 'Metallic', roughness: 'Roughness', emissive: 'Emissive' }))
    assert.equal(editor.KHR_INTERACTIVITY_MATERIAL_POINTER_PRESETS.find(p => p.id === id)?.label, label);
  for (const [name, label] of Object.entries({ baseColor: 'Base Color', emissive: 'Emissive', emissiveIntensity: 'Emissive Strength', opacity: 'Opacity' }))
    assert.equal(properties.getXriftInteractionProperty('material', name)?.label, label);
});

test('thin-film thickness and IOR are not described as bulk Volume settings', () => {
  const source = editorFunction('StandardMaterialQuickEditor').fn.getText();
  const film = source.slice(source.indexOf('extensionName="KHR_materials_iridescence"'));
  assert.match(film, /label="Thickness Min \(nm\)"/);
  assert.match(film, /label="Thickness Max \(nm\)"/);
  assert.match(film, /マップなしでは、この値を使います/);
  assert.match(film, /素材本体のIORとは別/);
  assert.match(source, /label="Attenuation Color"/);
  assert.match(source, /指定した距離を通った後の光の色/);
  assert.match(source, /label="Thickness"/);
  assert.match(source, /メッシュ内の距離/);
  assert.doesNotMatch(source, /label="吸収色"|title="厚みと吸収色"/);
});

test('the Emissive color picker is labeled Color, not Strength', () => {
  const section = materialSection('Emissive');
  assert.match(section, /Color\s*<span/);
  assert.match(section, /type="color"/);
  assert.doesNotMatch(section, /強さ/);
  assert.match(read('src/components/visual-editor/AssetQuickEditor.tsx'), /aria-label=\{`\$\{label\}のスライダー`\}/);
});

test('all 218 material value bindings, ranges and update callbacks are unchanged from v2', () => {
  const { ast, fn } = editorFunction('StandardMaterialQuickEditor');
  const printer = ts.createPrinter({ removeComments: true });
  const attributes = [];
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.initializer &&
      ['value', 'checked', 'min', 'max', 'step', 'disabled', 'readOnly', 'onChange', 'onToggle'].includes(node.name.getText(ast))) {
      attributes.push([node.name.getText(ast), printer.printNode(ts.EmitHint.Unspecified, node.initializer, ast)]);
    }
    ts.forEachChild(node, visit);
  }
  visit(fn);
  attributes.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  assert.equal(attributes.length, 218);
  assert.equal(createHash('sha256').update(JSON.stringify(attributes)).digest('hex'),
    '1125a33e180cf66ba1184bfc3043b9d780a9c78a8e6e07d164eb6111263abc69');
});

test('the material guide preserves cross-tool differences instead of inventing synonyms', () => {
  const guide = read('docs/guide/material-extensions.md') + read('docs/guide/transparent-materials.md');
  assert.match(guide, /Base ColorをDiffuse Colorに読み替えない/);
  assert.match(guide, /RoughnessとSmoothnessは増減の向きが逆/);
  assert.match(guide, /Alpha.*Transmission/);
  assert.match(guide, /単純な置換や同じ描画結果を保証するものではありません/);
  assert.doesNotMatch(read('docs/ux/editor.md'), /音源[^\n]*厚みと吸収色/);
  assert.equal(read('.agents/skills/japanese-writing/SKILL.md'), read('.claude/skills/japanese-writing/SKILL.md'));
});

// Scene, texture and rendering terms use established names, not invented synonyms.
test('Normal Map help separates visible shading from geometry and states the input format', () => {
  const source = editorFunction('StandardMaterialQuickEditor').fn.getText();
  assert.match(source, /label="Normal Map"\s+description="陰影で細かな凹凸を表します。メッシュの形や輪郭は変わりません。"/);
  assert.match(source, /上塗りの層に凹凸の陰影を加えます。下地のNormal Mapとは別の設定です。/);
  assert.equal((source.match(/inputHint="Tangent Space（接線空間）の画像を使用します。色補正なし（Linear）で読み込みます。"/g) ?? []).length, 2);
  assert.equal((source.match(/0で効果なし、1が標準です。負の値で凹凸の向きを反転します。/g) ?? []).length, 2);
  const guide = read('docs/guide/textures.md');
  assert.match(guide, /輪郭や衝突判定は変わりません/);
  assert.match(guide, /Occlusion Map.*画像/);
  assert.match(guide, /SSAO.*画面に映った形状/);
});

test('Normal Map format guidance agrees with actual linear texture-loading requests', () => {
  const source = read('src/components/visual-editor/material-texture-preview.ts');
  assert.match(source, /\["normalMap", properties.normalTexture, "linear"\]/);
  assert.match(source, /"clearcoatNormalMap",[\s\S]{0,300}?"linear"/);
  assert.match(source, /colorSpace === "srgb" \? SRGBColorSpace : NoColorSpace/);
});

test('texture help is visible and associated with the corresponding selector', () => {
  const source = editorFunction('TextureSlot').fn.getText();
  assert.match(source, /const helpId = useId\(\)/);
  assert.match(source, /<p id=\{helpId\}/);
  assert.match(source, /aria-describedby=\{inputHint \? `\$\{helpId\} \$\{helpId\}-format` : helpId\}/);
  assert.match(source, /aria-label=\{`\$\{label\}のテクスチャ`\}/);
});

test('scene property names are shared technical terms without changing their IDs', () => {
  const expected = {
    postprocessing: 'Post Processing', bloom: 'Bloom', bloomStrength: 'Bloom Strength',
    bloomRadius: 'Bloom Radius', bloomThreshold: 'Bloom Threshold', ao: 'SSAO',
    grading: 'Color Grading', fog: 'Fog', fogColor: 'Fog Color', fogNear: 'Fog Near',
    fogFar: 'Fog Far', ambient: 'Ambient Light', ambientColor: 'Ambient Light Color',
    ambientIntensity: 'Ambient Light Intensity', skybox: 'Skybox', skyboxIbl: 'IBL',
    skyboxExposure: 'Skybox Intensity', skyboxRotation: 'Skybox Rotation', skyboxImage: 'Skybox Texture',
  };
  for (const [name, label] of Object.entries(expected))
    assert.equal(properties.getXriftInteractionProperty('scene', name)?.label, label, name);
  assert.match(properties.getXriftInteractionProperty('scene', 'skyboxImage').description, /徐々に切り替えることはできません/);
  assert.match(properties.getXriftInteractionProperty('scene', 'postprocessing').description, /操作した人の画面だけ/);
});

test('Skybox, lighting and post-effect headings expose English names visibly', () => {
  const file = 'src/components/visual-editor/SceneSettingsPanel.tsx';
  const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
  const labels = new Map();
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(ast);
      if (['Section', 'PostEffectLayer'].includes(tag)) {
        const label = jsxStringAttribute(node, tag === 'Section' ? 'title' : 'label');
        if (label) labels.set(label, jsxStringAttribute(node, 'reading'));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  for (const [label, reading] of Object.entries({Skybox:'スカイボックス', Fog:'フォグ',
    'Ambient Light':'環境光', 'Post Processing':'ポストプロセス', SSAO:'スクリーンスペースAO',
    Bloom:'ブルーム', 'Color Grading':'カラーグレーディング'})) assert.equal(labels.get(label), reading);
  assert.match(read(file), /flex flex-wrap items-baseline/);
  assert.match(read(file), /label="上空の色"/); // Real colors remain natural Japanese.
  assert.match(read(file), /label="地平線の色"/);
});

test('Skybox Texture, Shader and IBL help refer to distinct settings and valid fallback paths', () => {
  const source = read('src/components/visual-editor/SceneSettingsPanel.tsx');
  assert.match(source, /Skybox Textureより優先して背景を描きます/);
  assert.match(source, /代わりにSkybox Textureまたはグラデーションを使います/);
  assert.match(source, /先にSkybox Textureを選んでください/);
  assert.match(source, /背景を非表示にしても使えます/);
  assert.match(source, /Skyboxの表示を切り替えます。IBLは別に設定します/);
  assert.match(source, /label="Intensity（明るさ）"/);
  assert.match(source, /label="Exposure（露出）"/);
  assert.match(source, /画面全体の明るさを調整します/);
});

test('Bloom guidance separates the threshold, intensity and spread, without promising illumination', () => {
  const source = read('src/components/visual-editor/SceneSettingsPanel.tsx');
  for (const name of ['Bloom Threshold', 'Bloom Strength', 'Bloom Radius']) assert.ok(source.includes(`ariaLabel="${name}"`), name);
  assert.match(source, /明るい部分の光をにじませます。周囲を照らす効果ではありません/);
  assert.match(properties.getXriftInteractionProperty('scene', 'bloomThreshold').description, /下げると、より暗い部分も対象/);
  assert.match(properties.getXriftInteractionProperty('scene', 'bloomStrength').description, /0で効果なし/);
  assert.match(properties.getXriftInteractionProperty('scene', 'bloomRadius').description, /広がり/);
  const primitives = read('src/lib/visual-editor/creation-catalog.ts');
  assert.equal((primitives.match(/周囲を照らすにはライトを追加してください。/g) ?? []).length, 3);
  assert.doesNotMatch(primitives, /エリアライト|間接照明/);
});

test('catalog actions, notices and current help agree on Skybox Shader and Water Shader', () => {
  const sky = read('src/components/visual-editor/SkyShaderStore.tsx');
  assert.match(sky, /"Skyboxに設定"/);
  assert.match(sky, /Skyboxに設定しました/);
  assert.match(sky, /追加後にSkyboxへ設定/);
  assert.doesNotMatch(sky, /空へ設定|空に設定/);
  const component = read('src/lib/visual-editor/component-registry.ts');
  assert.match(component, /label: "Skybox"/);
  assert.doesNotMatch(component, /label: "空の背景"/);
  const guide = read('docs/guide/sky-and-water.md');
  assert.match(guide, /\*\*Skyboxに設定\*\*/);
  assert.match(guide, /\*\*追加後にSkyboxへ設定\*\*/);
  assert.match(guide, /## 水面を作る/);
  assert.doesNotMatch(guide, /〇〇を空へ設定|背景は単色のまま/);
});

test('editor visibility guidance matches actual display and quality profiles', () => {
  const display = load('src/components/visual-editor/scene-viewport-display.ts');
  const quality = load('src/components/visual-editor/scene-viewport-quality.ts');
  assert.equal(display.getSceneViewportDisplayProfile('scene').showSkybox, true);
  for (const mode of ['unlit', 'wireframe', 'colliders'])
    assert.equal(display.getSceneViewportDisplayProfile(mode).showSkybox, false);
  assert.equal(quality.getSceneViewportQualityProfile('high').postprocessing, true);
  for (const mode of ['auto', 'low', 'half', 'quarter']) {
    assert.equal(quality.getSceneViewportQualityProfile(mode).postprocessing, false);
    assert.equal(quality.getSceneViewportQualityProfile(mode).shadows, false);
  }
  assert.match(read('docs/guide/sky-and-water.md'), /Skybox Shaderは編集中も表示されます/);
  assert.match(read('docs/guide/editor-basics.md'), /表示モードを\*\*シーン\*\*、描画品質を\*\*高品質\*\*/);
});

// Captured from v3; copy, layout and accessibility attributes are intentionally
// excluded. Changes to authored values/callbacks require a separate review.
for (const [file, count, hash] of [
  ['SceneSettingsPanel.tsx', 299, 'e1b0aad5d95ffad451aae1521209fb6a34d4f67cdb794176fbbfd02cd63f372f'],
  ['AssetQuickEditor.tsx', 383, '0ad87bd94c7ad2415b619a4a32db29cfbe50583a423cc12e66a1dff977a5b4e9'],
]) test(`${file}: all value bindings, ranges and update callbacks remain identical to v3`, () => {
  const ast = ts.createSourceFile(file, read(`src/components/visual-editor/${file}`), ts.ScriptTarget.Latest, true);
  const printer = ts.createPrinter({removeComments:true});
  const attributes = [];
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.initializer &&
      ['value','checked','min','max','step','scrubStep','disabled','readOnly','onChange','onToggle'].includes(node.name.getText(ast)))
      attributes.push([node.name.getText(ast), printer.printNode(ts.EmitHint.Unspecified, node.initializer, ast)]);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  attributes.sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  assert.equal(attributes.length, count);
  assert.equal(createHash('sha256').update(JSON.stringify(attributes)).digest('hex'), hash);
});

test('writing rules retain professional terms while keeping actions and explanations Japanese', () => {
  const guide = read('docs/JAPANESE_WRITING.md');
  for (const term of ['Normal Map','Skybox','IBL','Bloom','SSAO','Fog','Ambient Light','Color Grading']) assert.ok(guide.includes(term), term);
  assert.match(guide, /英語名をツールチップだけに隠さない/);
  assert.match(guide, /一般語まで機械的に英語へ置き換えない/);
  assert.match(guide, /Normal Mapと形状の変形/);
  assert.equal(read('.agents/skills/japanese-writing/SKILL.md'), read('.claude/skills/japanese-writing/SKILL.md'));
});
