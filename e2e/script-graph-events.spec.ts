import { expect, test } from "@playwright/test";

test("ScriptとGraphは同じSceneで双方向に一度ずつ通知し、終了後は購読を残さない", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  const result = await page.evaluate(async () => {
    const runtimeUrl = "/packages/xrift-studio-runtime/src/script/scene-runtime.tsx";
    const engineUrl = "/packages/xrift-studio-runtime/src/interactivity/engine.ts";
    const runtime = await import(runtimeUrl) as typeof import("../packages/xrift-studio-runtime/src/script/scene-runtime");
    const { InteractivityEngine } = await import(engineUrl) as typeof import("../packages/xrift-studio-runtime/src/interactivity/engine");
    const scope = {};
    const errors: string[] = [];
    const script = runtime.createScriptGraphEvents(scope, () => true, (error) => errors.push(String(error)));
    let received = 0;
    script.graph.on("door.opened", () => { received++; });
    let foreign = 0;
    const other = runtime.createScriptGraphEvents({}, () => true, () => {});
    other.graph.on("door.opened", () => { foreign++; });
    const graph = { graphs: [{
      events: [{ id: "door.open" }, { id: "door.opened" }],
      declarations: [{ op: "event/receive" }, { op: "event/send" }],
      nodes: [
        { declaration: 0, configuration: { event: { value: [0] } }, flows: { out: { node: 1 } } },
        { declaration: 1, configuration: { event: { value: [1] } } },
      ],
    }] };
    const engine = new InteractivityEngine(graph, {
      emitEvent(name) { runtime.emitXriftSceneEvent(name, new Map(), scope); },
    }, { localEventDelivery: false });
    let delivered = 0;
    const queue = runtime.createXriftGraphEventQueue(scope, ["door.open", "door.open"], (name) => {
      delivered++;
      engine.receiveEvent(name);
    });
    engine.start();
    script.graph.emit("door.open");
    const beforeFlush = received;
    queue.flush();
    queue.flush();
    script.graph.on("async-error", async () => { throw new Error("async fixture"); });
    script.graph.emit("async-error");
    await Promise.resolve(); await Promise.resolve();
    const off = script.graph.on("door.opened", () => { received += 100; });
    off(); off();
    queue.dispose();
    script.graph.emit("door.open");
    queue.flush();
    script.dispose();
    runtime.emitXriftSceneEvent("door.opened", new Map(), scope);
    script.graph.on("door.opened", () => { received += 1000; });
    script.graph.emit("door.opened");
    engine.dispose(); other.dispose();
    return { beforeFlush, received, delivered, foreign, errors };
  });
  expect(result).toEqual({ beforeFlush: 0, received: 1, delivered: 1, foreign: 0, errors: ["Error: async fixture"] });
});

test("イベントの循環は次のフレームへ送り、Scriptの同期ループは停止できる", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  const result = await page.evaluate(async () => {
    const url = "/packages/xrift-studio-runtime/src/script/scene-runtime.tsx";
    const runtime = await import(url) as typeof import("../packages/xrift-studio-runtime/src/script/scene-runtime");
    const scope = {};
    let active = true;
    const errors: string[] = [];
    const script = runtime.createScriptGraphEvents(scope, () => active, (error) => { errors.push(String(error)); active = false; });
    let deliveries = 0;
    const queue = runtime.createXriftGraphEventQueue(scope, ["repeat"], () => {
      deliveries++;
      script.graph.emit("repeat");
    });
    script.graph.emit("repeat"); queue.flush();
    const firstFrame = deliveries;
    queue.flush();
    script.graph.on("loop", () => script.graph.emit("loop"));
    script.graph.emit("loop");
    queue.dispose(); script.dispose();
    return { firstFrame, deliveries, errors };
  });
  expect(result.firstFrame).toBe(1);
  expect(result.deliveries).toBe(2);
  expect(result.errors).toEqual(["Error: Graph event recursion limit exceeded"]);
});

test("公開用ScriptとGraphの出力は共通runtimeを含む", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  await page.evaluate(async () => {
    const url = "/src/lib/visual-editor/compiler/script-emit.fixture.ts";
    const fixture = await import(url) as { runScriptEmitFixtureAssertions(): void };
    fixture.runScriptEmitFixtureAssertions();
  });
});
