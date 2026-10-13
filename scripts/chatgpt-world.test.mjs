import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
const { parseChatgptWorldPlan, buildChatgptWorld } = await server.ssrLoadModule("/src/lib/visual-editor/chatgpt-world.ts");
test.after(() => server.close());
const input = { title: "秋の公園", description: "木とベンチのある広場", objects: [
  { name: "地面", shape: "plane", position: [0,0,0], scale: [12,12,1] },
  { name: "ベンチ", shape: "box", position: [2,0.5,1], scale: [2,1,0.5], rotation: [0,90,0] }
] };
test("native output becomes a separately identified regular Editor document set", () => {
  const original = JSON.stringify(input);
  const a = buildChatgptWorld(parseChatgptWorldPlan(original), "test-world-a");
  const b = buildChatgptWorld(parseChatgptWorldPlan(original), "test-world-b");
  assert.notEqual(a.project.projectId, b.project.projectId);
  assert.equal(a.project.metadata.title, "秋の公園");
  const entities = Object.values(a.scene.entities);
  for (const name of ["地面", "ベンチ"]) assert.ok(entities.some(v => v.name === name));
  const plane = entities.find(v => v.name === "地面");
  const bench = entities.find(v => v.name === "ベンチ");
  const transform = e => e.components.find(c => c.type === "transform");
  assert.deepEqual(transform(plane).scale, [12,12,1]);
  assert.equal(transform(plane).rotation[0], -Math.PI / 2);
  assert.equal(transform(bench).rotation[1], Math.PI / 2);
  assert.deepEqual(transform(bench).position, [2,0.5,1]);
  assert.equal(JSON.stringify(input), original);
});
test("rejects arbitrary instructions and bounded-data violations before creating documents", () => {
  for (const raw of [
    { ...input, tool: "delete_project" },
    { ...input, objects: [{ ...input.objects[0], shape: "script" }] },
    { ...input, objects: [{ ...input.objects[0], position: [0,null,0] }] },
    { ...input, objects: [{ ...input.objects[0], scale: [-1,1,1] }] },
    { ...input, objects: Array(33).fill(input.objects[0]) },
  ]) assert.throws(() => parseChatgptWorldPlan(JSON.stringify(raw)));
  assert.throws(() => parseChatgptWorldPlan("not JSON"));
  assert.throws(() => parseChatgptWorldPlan("x".repeat(100001)));
});
