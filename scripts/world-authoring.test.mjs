import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
// Keep this test runnable on the project's Node 20 minimum as well as Node 24.
const source = await readFile(new URL('../src/lib/visual-editor/world-authoring.ts', import.meta.url), 'utf8');
const compiled = await transformWithOxc(source, 'world-authoring.ts');
const { authoringFingerprint, authoringStatus, changeAuthoringState, readAuthoringState } =
  await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`);

const begin = () => changeAuthoringState(null, 'begin_world_authoring', {
  blueprint: 'A courtyard with a tree visible from the entrance.', criteria: ['Tree visible', 'Within budget'],
}, 'scene-a');
const capture = (state, view, fingerprint = 'scene-a') => changeAuthoringState(state, 'capture_scene_view', {
  authoringView: view, path: `/captures/${view}.png`,
}, fingerprint);
const review = (state, criterion, passed = true) => changeAuthoringState(state, 'review_world_authoring', {
  criterion, passed, reason: 'Both views show the tree; measured metrics are within the blueprint budget.',
  captureIds: [state.captures.spawn.id, state.captures.iso.id],
}, 'scene-a');

test('goals and review state survive JSON persistence and reconnection', () => {
  const state = readAuthoringState(JSON.parse(JSON.stringify(begin())));
  assert.equal(state.blueprint, begin().blueprint);
  assert.deepEqual(authoringStatus(state, 'scene-a').missingViews, ['spawn', 'iso']);
  assert.throws(() => changeAuthoringState(state, 'begin_world_authoring', {}, 'scene-a'), /保存済み/);
});

test('completion requires both current views and every successful review', () => {
  let state = begin();
  assert.throws(() => changeAuthoringState(state, 'complete_world_authoring', {}, 'scene-a'), /未確認/);
  state = capture(capture(state, 'spawn'), 'iso');
  state = review(state, 'Tree visible');
  state = review(state, 'Within budget', false);
  assert.throws(() => changeAuthoringState(state, 'complete_world_authoring', {}, 'scene-a'), /Within budget/);
  state = review(state, 'Within budget');
  state = changeAuthoringState(state, 'complete_world_authoring', {}, 'scene-a');
  assert.equal(authoringStatus(state, 'scene-a').completed, true);
  const resumed = readAuthoringState(JSON.parse(JSON.stringify(state)));
  assert.equal(authoringStatus(resumed, 'scene-b').completed, false);
  assert.deepEqual(authoringStatus(resumed, 'scene-b').uncheckedCriteria, state.criteria);
});

test('recapturing invalidates reviews even when scene content stays the same', () => {
  let state = capture(capture(begin(), 'spawn'), 'iso');
  state = review(review(state, 'Tree visible'), 'Within budget');
  const oldIds = [state.captures.spawn.id, state.captures.iso.id];
  state = capture(state, 'spawn');
  assert.equal(authoringStatus(state, 'scene-a').uncheckedCriteria.length, 2);
  assert.throws(() => changeAuthoringState(state, 'review_world_authoring', {
    criterion: 'Tree visible', passed: true, reason: 'ok', captureIds: oldIds,
  }, 'scene-a'), /最新/);
});

test('malformed goals, views, reviews and stored state fail explicitly', () => {
  assert.throws(() => readAuthoringState({ version: 99 }), /形式/);
  assert.throws(() => changeAuthoringState(null, 'begin_world_authoring', { blueprint: 'x', criteria: ['x', 'x'] }, 'a'));
  assert.throws(() => capture(begin(), 'fake'));
  assert.throws(() => changeAuthoringState(begin(), 'review_world_authoring', {
    criterion: 'Tree visible', passed: true, reason: 'without images', captureIds: [],
  }, 'scene-a'));
});

test('content fingerprints survive restart and change with scene content', async () => {
  const scene = { entities: { tree: { position: [0, 0, 0] } } };
  assert.equal(await authoringFingerprint(scene), await authoringFingerprint(JSON.parse(JSON.stringify(scene))));
  assert.notEqual(await authoringFingerprint(scene), await authoringFingerprint({ entities: {} }));
  assert.equal(await authoringFingerprint({ a: 1, b: { x: 2, y: 3 } }),
    await authoringFingerprint({ b: { y: 3, x: 2 }, a: 1 }));
  assert.equal(await authoringFingerprint({ color: 0.1 + 0.2 }), await authoringFingerprint({ color: 0.3 }));
  assert.notEqual(await authoringFingerprint({ position: 1e-9 }), await authoringFingerprint({ position: 2e-9 }));
});
