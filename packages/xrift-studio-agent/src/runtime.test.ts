import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAssistantMessageEventStream, type AssistantMessage, type TranscriptContext } from "@earendil-works/pi-ai";
import { createStudioTools, ReviewGate, runAgent, toolContent, type AgentInput, type StudioResult } from "./runtime.js";

const tools = ["get_editor_context", "save_project", "get_project_health", "capture_scene_view", "apply_r3f_scene"]
  .map(name => ({ name, description: name, inputSchema: { type: "object" } }));
const input = (dir: string): AgentInput => ({ model: "gpt-6.1-sol", accessToken: "fixture-secret-token",
  thinkingLevel: "medium", prompt: "小さな家を作って", projectId: "p", sceneId: "s",
  sessionDir: dir, cwd: dir, tools, instructions: "Use Studio tools.", mode: "build" });
const good = (result: Record<string, unknown>): StudioResult => ({ ok: true, result });
const image = { data: "aW1hZ2U=", mimeType: "image/png" };

test("completion requires healthy, saved, actual images of the latest revision", () => {
  const gate = new ReviewGate();
  gate.observe("get_editor_context", {}, good({ revision: 1 }));
  gate.observe("save_project", {}, good({ revision: 1, saved: true }));
  gate.observe("get_project_health", {}, good({ health: { status: "ready" } }));
  gate.observe("capture_scene_view", { authoringView: "spawn" }, good({ revision: 1, image }));
  assert.throws(() => gate.assertReady());
  gate.observe("capture_scene_view", { authoringView: "iso" }, good({ revision: 1, image }));
  assert.doesNotThrow(() => gate.assertReady());
  gate.observe("update_transform", {}, good({ revisionBefore: 1, revisionAfter: 2 }));
  assert.throws(() => gate.assertReady(), "an edit invalidates every previous review");
});

test("failed captures and invalid documents never satisfy review", () => {
  const gate = new ReviewGate();
  gate.observe("get_editor_context", {}, good({ revision: 1 }));
  gate.observe("save_project", {}, good({ revision: 1, saved: true }));
  gate.observe("get_project_health", {}, good({ health: { status: "error" } }));
  for (const authoringView of ["spawn", "iso"]) gate.observe("capture_scene_view", { authoringView }, { ok: false });
  assert.throws(() => gate.assertReady());
  assert.equal(toolContent(good({ image }))[1].type, "image", "pixels reach the model as an image block");
});

test("model cannot call unregistered tools or target a different Scene", async () => {
  let called = 0;
  const registered = createStudioTools(input("unused"), async () => { called++; return good({}); }, new ReviewGate(), () => {});
  const execute = registered.find(tool => tool.name === "studio_execute")!;
  const context = {} as Parameters<typeof execute.execute>[4];
  await assert.rejects(execute.execute("1", { tool: "publish_project", arguments: {} }, undefined, undefined, context));
  await assert.rejects(execute.execute("2", { tool: "save_project", arguments: { sceneId: "other" } }, undefined, undefined, context));
  assert.equal(called, 0);
});

test("real Pi SDK loop sends official results and images back, then persists without credentials", async () => {
  const dir = await mkdtemp(join(tmpdir(), "studio-pi-test-"));
  const seen: string[] = [], contexts: TranscriptContext[] = [];
  const actions = [
    ["studio_execute", { tool: "get_editor_context", arguments: {} }],
    ["studio_execute", { tool: "apply_r3f_scene", arguments: { expectedRevision: 1, source: "fixture static source" } }],
    ["studio_execute", { tool: "save_project", arguments: { expectedRevision: 2 } }],
    ["studio_execute", { tool: "get_project_health", arguments: {} }],
    ["studio_execute", { tool: "capture_scene_view", arguments: { authoringView: "spawn" } }],
    ["studio_execute", { tool: "capture_scene_view", arguments: { authoringView: "iso" } }],
    ["studio_complete", { summary: "家を作成して検証しました", criteria: [{ criterion: "家がある", evidence: "Sceneと2方向の画像を確認", passed: true }] }],
  ] as const;
  let revision = 1, step = 0;
  try {
    const result = await runAgent(input(dir), async (tool, args) => {
      seen.push(tool);
      if (tool === "apply_r3f_scene") return good({ revisionBefore: revision, revisionAfter: ++revision });
      if (tool === "save_project") return good({ revision, saved: true });
      if (tool === "get_project_health") return good({ health: { status: "ready" } });
      if (tool === "capture_scene_view") return good({ revision, image, view: args.authoringView });
      return good({ revision, projectId: "p", sceneId: "s" });
    }, () => {}, new AbortController().signal, runtime => runtime.registerProvider("openai", {
      api: "openai-responses",
      streamSimple(model, context) {
        contexts.push(structuredClone(context));
        assert.ok(step < actions.length, "SDK must terminate after accepted completion");
        const [name, args] = actions[step++];
        const message: AssistantMessage = { role: "assistant", api: model.api, provider: model.provider, model: model.id,
          content: [{ type: "toolCall", id: "call-" + step, name, arguments: structuredClone(args) }],
          stopReason: "toolUse", timestamp: Date.now(),
          usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
        const stream = createAssistantMessageEventStream();
        queueMicrotask(() => { stream.push({ type: "start", partial: message }); stream.push({ type: "done", reason: "toolUse", message }); });
        return stream;
      },
    }));
    assert.equal(result.completed, true);
    assert.equal(seen.filter(name => name === "capture_scene_view").length, 2);
    assert.ok(JSON.stringify(contexts).includes('"type":"image"'));
    assert.ok(!JSON.stringify(contexts).includes("fixture-secret-token"));
    const sessionFile = (await readdir(dir)).find(name => name.endsWith(".jsonl"));
    assert.ok(sessionFile);
    assert.ok(!(await readFile(join(dir, sessionFile), "utf8")).includes("fixture-secret-token"));
    assert.ok(!JSON.stringify(contexts[0]).includes('"name":"bash"'), "shell is not exposed");
  } finally { await rm(dir, { recursive: true, force: true }); }
});
