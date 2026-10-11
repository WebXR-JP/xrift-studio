import test from "node:test";
import assert from "node:assert/strict";
import { validatePlan, parsePlan, planningPrompt, executePlan } from "./world-once.mjs";

const plan = {
  title: "夜の休憩所",
  description: "焚き火のある小さな庭",
  objects: [
    { name: "地面", shape: "box", position: [0,-0.1,0], scale: [10,0.2,10] },
    { name: "オブジェ", shape: "cone", position: [1,0.5,0], scale: [0.5,1,0.5], rotation: [0,90,0] }
  ]
};

test("parses bounded world plan", () => {
  assert.equal(validatePlan(plan).objects.length, 2);
  assert.match(planningPrompt("秋の公園"), /秋の公園/);
  assert.equal(parsePlan(JSON.stringify(plan)).title, "夜の休憩所");
});

test("rejects unknown model-generated instructions, invalid vectors and excessive entities", () => {
  assert.throws(() => validatePlan({ ...plan, command: "publish_project" }), /metadata/);
  assert.throws(() => validatePlan({ ...plan, objects: [{ ...plan.objects[0], shape: "shell" }] }), /Invalid object/);
  assert.throws(() => validatePlan({ ...plan, objects: [{ ...plan.objects[0], position: [1,Infinity,3] }] }), /finite/);
  assert.throws(() => validatePlan({ ...plan, objects: Array(33).fill(plan.objects[0]) }), /number/);
});

test("creates only a new project; checks revision on every write", async () => {
  let revision = 5;
  let serial = 0;
  const calls = [];
  const call = async (tool, args) => {
    calls.push({ tool, args });
    if (tool === "create_project") return { ok: true, result: { projectId: "only-new-world" } };
    if (tool === "get_editor_context") return { ok: true, result: {
      projectId: "only-new-world", sceneId: "scene1", revision, editorMode: "edit", saveStatus: "saved"
    }};
    if (tool === "capture_scene_view") return { ok: true, result: {} };
    assert.equal(args.projectId, "only-new-world");
    assert.equal(args.sceneId, "scene1");
    assert.equal(args.expectedRevision, revision);
    revision += 1;
    if (tool === "create_primitive") return { result: { entityId: "ent" + ++serial } };
    return { result: {} };
  };
  const result = await executePlan({ name: "new-world-001", plan, call });
  assert.equal(result.objects, 2);
  assert.equal(result.successfulWrites, 7);
  assert.deepEqual(calls[0], { tool: "create_project", args: { name: "new-world-001", templateId: "blank" } });
  assert.ok(!calls.some(x => x.tool === "open_project" || x.tool === "publish_project"));
  const rotation = calls.find(x => x.tool === "update_transform" && x.args.rotation);
  assert.equal(rotation.args.rotation[1], Math.PI / 2);
  assert.equal(result.screenshotReceived, false);
  assert.equal(result.saveStatus, "saved");
});

test("stops on project creation failure without changing an existing project", async () => {
  const calls = [];
  await assert.rejects(executePlan({
    name: "exists-123", plan, call: async (tool) => { calls.push(tool); throw new Error("PROJECT_EXISTS"); }
  }), /PROJECT_EXISTS/);
  assert.deepEqual(calls, ["create_project"]);
});

test("stops if another project opens mid-session", async () => {
  let reads = 0;
  const call = async tool => {
    if (tool === "get_editor_context") {
      return { result: { projectId: ++reads === 1 ? "own" : "foreign", sceneId: "scene", revision: reads, editorMode: "edit" } };
    }
    return { result: {} };
  };
  await assert.rejects(executePlan({ name: "world-new-01", plan, call }), /switched projects/);
});
