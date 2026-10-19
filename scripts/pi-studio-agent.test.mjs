import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-pi-agent-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
test.after(() => server.close());
const { runStudioPiAgent, STUDIO_PI_TOOLS } = await server.ssrLoadModule("/src/lib/visual-editor/pi-studio-agent.ts");
const { assertPiCompletion } = await server.ssrLoadModule("/src/lib/visual-editor/pi-authoring-host.ts");
test("real Pi SDK executes iterative Studio tools and passes results into the next inference", async () => {
  const actions = [...STUDIO_PI_TOOLS], calls = [], transcripts = [], events = [];
  await runStudioPiAgent({ model: "isolated", prompt: "元の依頼", check() {}, onEvent: event => events.push(event.type),
    async decide(transcript) { transcripts.push(JSON.parse(transcript)); return actions[calls.length]; },
    async execute(tool) { calls.push(tool); return { observation: { revision: calls.length }, terminal: tool === "studio_finish" }; } });
  assert.deepEqual(calls, actions);
  assert.equal(transcripts.length, 4);
  assert.ok(transcripts[1].some(message => message.role === "toolResult" && message.content[0].text.includes('"revision":1')));
  assert.equal(events.filter(event => event === "tool_execution_start").length, 4);
  assert.equal(events.at(-1), "agent_end");
});
test("unknown tools, unbounded turns, transport failures and cancellation cannot complete", async () => {
  let executions = 0;
  const options = { model: "isolated", prompt: "request", check() {}, async execute() { executions++; return { observation: {} }; } };
  await assert.rejects(runStudioPiAgent({ ...options, decide: async () => "bash" }), /許可されていない/);
  assert.equal(executions, 0);
  await assert.rejects(runStudioPiAgent({ ...options, maxTurns: 2, decide: async () => "studio_context" }), /反復回数/);
  assert.equal(executions, 2);
  await assert.rejects(runStudioPiAgent({ ...options, decide: async () => { throw new Error("transport failed"); } }), /transport failed/);
  await assert.rejects(runStudioPiAgent({ ...options, check() { throw new Error("cancelled"); }, decide: async () => "studio_author" }), /cancelled/);
});
test("failed tool errors stay out of the subsequent native inference transcript", async () => {
  let decisions = 0;
  await assert.rejects(runStudioPiAgent({ model: "isolated", prompt: "request", check() {},
    async decide() { decisions++; return "studio_author"; },
    async execute() { throw new Error("private native diagnostic"); } }), /private native diagnostic/);
  assert.equal(decisions, 1);
});
test("completion rejects no-op counts, unsaved revisions and stale or rejected images", () => {
  const valid = { changed: true, current: "latest", saved: "latest", reviewed: "latest", approved: true };
  assert.doesNotThrow(() => assertPiCompletion(valid));
  for (const patch of [{ changed: false }, { saved: "old" }, { reviewed: "old" }, { approved: false }]) assert.throws(() => assertPiCompletion({ ...valid, ...patch }));
});
