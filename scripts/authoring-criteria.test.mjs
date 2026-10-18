import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-authoring-criteria-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
test.after(() => server.close());
const { checkAuthoringCriteria, parseChatgptSceneReview } = await server.ssrLoadModule("/src/lib/visual-editor/authoring-criteria.ts");
const { checkAuthoringEvidence } = await server.ssrLoadModule("/src/lib/visual-editor/authoring-evidence.ts");
const required = ["家の扉が道につながる", "通路の幅が人の大きさに合う"];
const verdicts = () => required.map(criterion => ({ criterion, passed: true, reason: "スポーン画像と俯瞰画像、最新Transformを照合しました" }));
const review = () => ({ approved: true, summary: "家と道の関係を確認しました", remainingWork: "", criteria: verdicts() });

test("completion binds every exact original criterion and its concrete observed verdict", () => {
  const value = review(), parsed = parseChatgptSceneReview(value, required);
  assert.equal(parsed.approved, true); assert.deepEqual(parsed.criteria, value.criteria);
  value.criteria[0].reason = "later mutation"; assert.notEqual(parsed.criteria[0].reason, "later mutation");
  assert.equal(checkAuthoringCriteria(required, parsed.criteria).complete, true);
  const partial = review(); partial.approved = false; partial.criteria[1].passed = false; partial.criteria[1].reason = "通路の幅を画像とTransformで確認できませんでした"; partial.remainingWork = "通路の幅を確認できる配置に直す";
  assert.equal(parseChatgptSceneReview(partial, required).approved, false);
  assert.deepEqual(checkAuthoringCriteria(required, partial.criteria).unchecked, [required[1]]);
});

test("omitted, substituted, duplicate and reordered criteria never inherit a global approved flag", () => {
  for (const mutate of [value => value.criteria.pop(), value => value.criteria.reverse(), value => value.criteria[1].criterion = "内装を追加する",
    value => value.criteria[1] = { ...value.criteria[0] }, value => value.criteria[0].passed = false, value => value.criteria[0].reason = " ",
    value => value.criteria[0].reason = "a".repeat(601), value => value.criteria[0].extra = true, value => delete value.criteria]) {
    const value = review(); mutate(value); assert.throws(() => parseChatgptSceneReview(value, required));
  }
  assert.throws(() => parseChatgptSceneReview(review(), [required[0], required[0]]));
  const allPassed = review(); allPassed.approved = false; allPassed.remainingWork = "主観的な装飾を増やす";
  assert.throws(() => parseChatgptSceneReview(allPassed, required));
});

test("Studio and MCP require the same criterion evidence for the current saved Scene", () => {
  const input = { currentFingerprint: "scene", savedFingerprint: "scene", requiredViews: ["spawn", "iso"],
    captures: ["spawn", "iso"].map(view => ({ view, fingerprint: "scene" })), requiredCriteria: required,
    review: { fingerprint: "scene", approved: true, criteria: verdicts() } };
  assert.equal(checkAuthoringEvidence(input).complete, true);
  assert.equal(checkAuthoringEvidence({ ...input, review: { fingerprint: "scene", approved: true } }).complete, false);
  assert.equal(checkAuthoringEvidence({ ...input, review: { ...input.review, criteria: input.review.criteria.slice(0, 1) } }).complete, false);
  assert.equal(checkAuthoringEvidence({ ...input, currentFingerprint: "changed" }).complete, false);
});
