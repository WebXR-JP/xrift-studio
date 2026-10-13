import test from "node:test";
import assert from "node:assert/strict";
import { executePlan, readOptions, runJson, planningPrompt } from "./world-once.mjs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const plan = { title: "テスト", description: "隔離したテスト", objects: [
  { name: "地面", shape: "plane", position: [0,0,0], scale: [12,12,1] }
] };

function editor({ onRead = () => {}, screenshot = {} } = {}) {
  let revision = 0, reads = 0;
  const calls = [];
  const context = { projectId: "new", sceneId: "scene", editorMode: "edit", saveStatus: "saved", revision };
  return { calls, context, call: async (tool, args) => {
    calls.push({ tool, args });
    if (tool === "create_project") return { ok: true, result: { created: true, projectId: "new", sceneId: "scene" } };
    if (tool === "get_editor_context") {
      context.revision = revision;
      onRead(++reads, context);
      return { ok: true, result: { ...context } };
    }
    if (tool === "capture_scene_view") return { ok: true, result: { ...context, image: { mimeType: "image/png", data: "fixture-png" }, ...screenshot } };
    assert.equal(args.expectedRevision, revision);
    const revisionBefore = revision++;
    return { ok: true, result: { revisionBefore, revisionAfter: revision, entityId: "entity" } };
  } };
}

test("waits for debounced save of the final revision before capture", async () => {
  const instance = editor({ onRead(read, ctx) { ctx.saveStatus = read < 8 ? "saving" : "saved"; } });
  let waits = 0;
  const result = await executePlan({ name: "test-world", plan, call: instance.call, sleep: async () => { waits++; } });
  assert.ok(waits > 0);
  assert.equal(result.saveConfirmed, true);
  assert.equal(result.screenshotReceived, true);
  const transform = instance.calls.find(c => c.tool === "update_transform").args;
  assert.deepEqual(transform.scale, [12,12,1]);
  assert.equal(transform.rotation, undefined);
  assert.match(planningPrompt("床"), /LOCAL axes/);
});

test("save failures and timeouts are reported without claiming persistence", async () => {
  for (const saveStatus of ["error", "unavailable", "saving"]) {
    const instance = editor({ onRead(read, ctx) { ctx.saveStatus = saveStatus; } });
    let waits = 0;
    const result = await executePlan({ name: "test-world", plan, call: instance.call, sleep: async () => { waits++; } });
    assert.equal(result.saveStatus, saveStatus);
    assert.equal(result.saveConfirmed, false);
    assert.ok(waits <= 29);
  }
});

test("stops on an explicit failed MCP write before counting or proceeding", async () => {
  const instance = editor();
  const call = (tool, args) => tool === "update_project_metadata"
    ? { ok: false, error: { message: "STALE_REVISION" }, result: {} }
    : instance.call(tool, args);
  await assert.rejects(executePlan({ name: "test-world", plan, call }), /update_project_metadata: STALE_REVISION.*successfulWrites=0/);
  assert.ok(!instance.calls.some(c => c.tool === "create_primitive"));
});

test("stops on concurrent edits between a write and context refresh", async () => {
  const instance = editor({ onRead(read, ctx) { if (read === 2) ctx.revision++; } });
  await assert.rejects(executePlan({ name: "test-world", plan, call: instance.call }), /changed concurrently/);
  assert.ok(!instance.calls.some(c => c.tool === "create_primitive"));
});

test("a different scene at final verification cannot be accepted or captured", async () => {
  const instance = editor({ onRead(read, ctx) { if (read === 6) ctx.sceneId = "foreign-scene"; } });
  await assert.rejects(executePlan({ name: "test-world", plan, call: instance.call }), /switched projects or scenes/);
  assert.ok(!instance.calls.some(c => c.tool === "capture_scene_view"));
});

test("does not count paths or stale/foreign screenshot data as PNG receipt", async () => {
  for (const screenshot of [{ revision: 0 }, { sceneId: "foreign" }, { image: { path: "/unverified.png", mimeType: "image/png" } }]) {
    const instance = editor({ screenshot });
    const result = await executePlan({ name: "test-world", plan, call: instance.call });
    assert.equal(result.screenshotReceived, false);
    assert.match(result.screenshotError, /does not match|No PNG/);
  }
});

test("checks scene revision again after capture", async () => {
  const instance = editor({ onRead(read, ctx) { if (read === 7) ctx.revision++; } });
  await assert.rejects(executePlan({ name: "test-world", plan, call: instance.call }), /changed during verification/);
});

test("invalid CLI options fail before inference or editor actions", () => {
  const base = ["--name", "test-world", "--plan-file", "plan.json", "--dry-run", "true"];
  assert.equal(readOptions(base).name, "test-world");
  for (const args of [
    [...base, "--prompt", "ambiguous"], [...base, "--name", "other"],
    ["--name", "../unsafe", "--prompt", "fixture", "--dry-run", "true"],
    ["--name", "test-world", "--prompt", "fixture", "--dry-run", "typo"],
    ["--name", "test-world", "--prompt", "fixture"]
  ]) assert.throws(() => readOptions(args), /exactly one|Duplicate|ASCII|true or false|sidecar/);
});

test("child JSON output preserves Japanese split across byte writes", async () => {
  const code = `const bytes = Buffer.from(JSON.stringify({ok:true,result:{title:'秋の公園'}}));
    let i=0; function write(){if(i<bytes.length){process.stdout.write(bytes.subarray(i,i+1));i++;setTimeout(write,1);}} write();`;
  const result = await runJson(process.execPath, ["-e", code], {}, 5000);
  assert.equal(result.result.title, "秋の公園");
});

test("child timeout and output bounds reject without awaiting an uncooperative child", async () => {
  const code = 'process.on("SIGTERM",()=>{}); process.stdout.write("started"); setInterval(()=>{},1000);';
  await assert.rejects(runJson(process.execPath, ["-e", code], {}, 100), /timed out/);
  await assert.rejects(runJson(process.execPath, ["-e", 'process.stdout.write("x".repeat(200));'], {}, 5000, 100), /too large/);
  await assert.rejects(runJson(process.execPath, ["-e", 'process.stdout.write("null");'], {}), /invalid response/);
});

test("plan-file CLI dry run works without login and rejects a directory sidecar", async t => {
  const directory = await mkdtemp(join(tmpdir(), "xrift-world-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "plan.json");
  await writeFile(file, JSON.stringify(plan));
  const cli = fileURLToPath(new URL("./world-once.mjs", import.meta.url));
  const args = [cli, "--name", "test-world", "--plan-file", file];
  const result = await runJson(process.execPath, [...args, "--dry-run", "true"], {});
  assert.equal(result.dryRun, true);
  assert.equal(result.plan.objects[0].name, "地面");
  // This must fail before account lookup or inference.
  const { spawnSync } = await import("node:child_process");
  const child = spawnSync(process.execPath, [cli, "--name", "test-world", "--prompt", "fixture", "--sidecar", directory], { input: "{}", encoding: "utf8" });
  assert.equal(child.status, 1);
  assert.match(child.stderr, /executable file/);
});

test("large screenshot JSON is accepted with its dedicated output budget", async () => {
  const code = 'process.stdout.write(JSON.stringify({ok:true,result:{image:{data:"x".repeat(2100000)}}}));';
  const result = await runJson(process.execPath, ["-e", code], {}, 5000, 32000000);
  assert.equal(result.result.image.data.length, 2100000);
});
