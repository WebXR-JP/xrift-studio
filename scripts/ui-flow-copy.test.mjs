/** Everyday UI copy contracts. Run: node --test scripts/ui-flow-copy.test.mjs
 * Reads the real source and executes the dependency-free progress formatter.
 * These checks do not replace rendering, browser, or native-app tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript-test-api');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const visual = 'src/components/visual-editor/';
const parse = file => ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
function findAll(source, predicate) {
  const result = [];
  function visit(node) { if (predicate(node)) result.push(node); ts.forEachChild(node, visit); }
  visit(source);
  return result;
}
function attr(node, name) {
  return node.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText() === name)?.initializer;
}
function dependencyFreeModule(file) {
  const code = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports }, { filename: file });
  return module.exports;
}

test('setup progress IDs have readable labels, including safe unknown-ID fallback', () => {
  const { setupProgressLabel } = dependencyFreeModule('src/lib/setup-progress.ts');
  const expected = {
    download: 'ダウンロード中', extract: '展開中', 'npm-install': 'インストール中',
    'xrift-update': 'アップデート中', 'node-cached': 'Node.jsを確認',
    'xrift-cached': 'XRift CLIを確認', done: '完了',
  };
  for (const [step, label] of Object.entries(expected)) assert.equal(setupProgressLabel(step), label);
  for (const step of [undefined, '', 'future-step', 'toString', '__proto__', 'constructor']) {
    assert.equal(setupProgressLabel(step), '準備中');
  }
  const setup = read('src/components/SetupView.tsx');
  assert.match(setup, /setupProgressLabel\(progress\?\.step\)/);
  assert.match(setup, /setupProgressLabel\(l\.step\)/);
  assert.doesNotMatch(setup, /\{progress\?\.step\s*\?\?|\[\{l\.step\}\]/);
});

test('the first screen offers visual editing without implying publishing needs no setup', () => {
  const setup = read('src/components/SetupView.tsx');
  assert.match(setup, /セットアップせずに作り始める/);
  assert.match(setup, /XRiftに公開するときに準備できます/);
  assert.match(setup, /アプリ専用のフォルダーにインストール/);
  assert.doesNotMatch(setup, /システムには影響しません|ワンクリックで始め/);
});

test('project naming rules are visible before typing and linked to the unchanged validator', () => {
  const file = 'src/components/NewProjectDialog.tsx';
  const source = parse(file);
  const input = findAll(source, n => ts.isJsxSelfClosingElement(n) && n.tagName.getText() === 'input')
    .find(n => attr(n, 'value')?.getText() === '{name}');
  assert.ok(input);
  assert.equal(attr(input, 'aria-describedby')?.text, 'new-project-name-hint');
  assert.equal(attr(input, 'aria-invalid')?.getText(), '{name.length > 0 && !valid}');
  const helper = findAll(source, n => ts.isJsxElement(n))
    .find(n => attr(n.openingElement, 'id')?.text === 'new-project-name-hint');
  assert.ok(helper);
  assert.ok(ts.isJsxElement(helper.parent) || ts.isJsxFragment(helper.parent),
    'The hint is not conditionally hidden until invalid');
  assert.match(helper.getText(), /半角の英小文字・数字・ハイフン/);
  assert.ok(read(file).includes('const valid = /^[a-z0-9][a-z0-9-]*$/.test(name);'));
});

test('audio volume has the correct label and retains its numeric range and update callback', () => {
  const source = parse(`${visual}InspectorPanel.tsx`);
  const fields = findAll(source, n => ts.isJsxSelfClosingElement(n) && n.tagName.getText() === 'ColliderNumberField')
    .filter(n => attr(n, 'value')?.getText() === '{component.volume}');
  assert.equal(fields.length, 1);
  const field = fields[0];
  assert.equal(attr(field, 'label')?.text, '音量');
  assert.equal(attr(field, 'min')?.getText(), '{0}');
  assert.equal(attr(field, 'max')?.getText(), '{1}');
  assert.equal(attr(field, 'step')?.getText(), '{0.05}');
  assert.equal(attr(field, 'onChange')?.getText(), '{(volume) => onChange({ volume })}');
  assert.doesNotMatch(read(`${visual}InspectorPanel.tsx`), /label="厚みと吸収色"/);
  assert.match(read('src/lib/visual-editor/material-extension-registry.ts'), /Volume/);
});

test('local file addition and publishing are distinct, in both editor entry points', () => {
  const tree = read('src/components/FileTree.tsx');
  assert.match(tree, /件のファイルを追加しました/);
  assert.doesNotMatch(tree, /アップロード/);
  for (const file of ['src/components/EditorView.tsx', `${visual}VisualEditorPrototype.tsx`]) {
    const text = read(file);
    assert.match(text, /XRiftへ公開/);
    assert.match(text, /Play/);
    assert.match(text, /プロジェクト一覧/);
  }
  assert.match(read('docs/wiki/classic-editor.md'), /Play \/ XRiftへ公開/);
});

test('project-transfer labels do not promise a remote Git fork or retained publication ID', () => {
  const library = read('src/components/ProjectLibrary.tsx');
  assert.match(library, /ZIPから取り込む/);
  assert.match(library, /リポジトリの内容をコピーして始める/);
  assert.doesNotMatch(library, /fork/);
  const transfer = read('src/components/ProjectTransferDialogs.tsx');
  assert.match(transfer, /Git の履歴は持ち込みません/);
  assert.match(transfer, /取り込んだプロジェクトは未公開になります/);
});

test('instructions refer to actual prefab-update and model-revert buttons', () => {
  const asset = read(`${visual}AssetQuickEditor.tsx`);
  assert.match(asset, /編集後は「プレハブに反映」を押してください/);
  assert.match(asset, />\s*プレハブに反映\s*</);
  assert.match(read('src/lib/visual-editor/model-optimization.ts'), /「原本のGLBに戻す」/);
  assert.match(read(`${visual}ModelAssetInspector.tsx`), /revertLabel="原本のGLBに戻す"/);
});

test('the publish flow keeps uncertainty, duplicate-publication safeguards and non-destructive image wording', () => {
  const dialog = read(`${visual}VisualUploadDialog.tsx`);
  for (const text of [
    '前回の公開結果が不明です。二重公開を防ぐため、送信を止めています。',
    '公開されていないことを確認できた場合に限り',
    '未公開を確認して送信保留を解除',
    'XRiftへの送信開始後は、結果を確認するまで閉じられません。',
    '編集にもこの設定を適用', '元画像は変更しません。',
  ]) assert.ok(dialog.includes(text), text);
  assert.doesNotMatch(dialog, /ステージング|原本にもこの設定/);
  assert.match(read('src-tauri/src/lib.rs'), /公開されていないことを確認できた場合に限り/);
  const guide = read('docs/wiki/publishing.md');
  assert.match(guide, /公開されていないことを確認できた場合に限り/);
  assert.doesNotMatch(guide, /重複して作ることはありません/);
});

test('mixed implementation vocabulary stays out of AI connection and recording labels', () => {
  const ai = read(`${visual}AiConnectionPanel.tsx`);
  assert.doesNotMatch(ai, /対象client|client情報|local model|ローカルmodel|構成するAI|先にinstall|modelを構成/);
  assert.match(ai, /モデルのダウンロードやAIクライアントの起動は行いません/);
  const recording = read(`${visual}RecordingPanel.tsx`);
  assert.match(recording, /プロジェクトフォルダーに保存します/);
  assert.match(recording, /録画サイズ/);
  assert.doesNotMatch(recording, /制作中のワールド内に保存/);
});

test('glow presets are not mislabeled as light sources or a second Hierarchy', () => {
  const glow = read(`${visual}GlowMaterialStore.tsx`);
  assert.match(glow, /aria-label="発光Entity一覧"/);
  assert.match(glow, /条件に合う発光Entityがありません/);
  assert.doesNotMatch(glow, /発光Hierarchy|照明/);
  assert.match(glow, /Post ProcessingとBloomを有効にしてください/);
});

test('texture-quality fallback describes the level, rather than concatenating a whole sentence', () => {
  const text = read(`${visual}AssetQuickEditor.tsx`);
  assert.ok(text.includes('${nearest.label}に近い設定です'));
  assert.ok(!text.includes('${nearest.hint}に近い設定です'));
});

test('recovery and reset documentation matches current controls without dropping loss warnings', () => {
  const boundary = read(`${visual}VisualEditorErrorBoundary.tsx`);
  for (const label of ['エディターを再表示', 'プロジェクト一覧に戻る', 'ヘルプと報告']) {
    assert.ok(boundary.includes(label), label);
  }
  const reset = read('src/components/AboutModal.tsx');
  assert.match(reset, /ランタイムをリセット/);
  assert.match(reset, /すべてのプロジェクトを削除/);
  assert.match(read('docs/wiki/data-and-reset.md'), /完全リセットは元に戻せません/);
});

test('broken literal translations do not return to user-facing source', () => {
  const forbidden = [
    '素材を素材へ追加', '設定で設定', 'コード編集 Repository URL', '同種のentry',
    '発光Hierarchy', '動作確認 Mode', 'マテリアル copy編集中', '大きさを引いて調整',
    '影を落とすを有効', 'ノード scripts/build-world-runtime-shell.mjs',
  ];
  function scan(dir) {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const relative = path.join(dir, entry.name);
      if (entry.isDirectory()) scan(relative);
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        const text = read(relative);
        for (const bad of forbidden) assert.ok(!text.includes(bad), `${relative}: ${bad}`);
      }
    }
  }
  scan('src');
});
