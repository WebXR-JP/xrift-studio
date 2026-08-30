/**
 * Deterministic assertions for the behavior graph interpreter.
 *
 * These are written against raw canonical JSON rather than against the Editor's
 * builders on purpose: the engine's contract is with published documents, and a
 * document written by another tool has to run the same way.
 */

import { InteractivityEngine } from "./engine.js";
import { dryRunInteractivityGraph } from "./schedule.js";
import { walkOnStart } from "../interactivity-adapter.js";
import type { InteractivityHost } from "./host.js";
import { asNumber, type InteractivityValue } from "./value.js";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type NodeSpec = {
  values?: Record<string, unknown>;
  configuration?: Record<string, { value: unknown[] }>;
  flows?: Record<string, { node: number; socket?: string }>;
};

class GraphBuilder {
  private readonly types: { signature: string }[] = [];
  private readonly declarations: { op: string; extension?: string }[] = [];
  private readonly nodes: (NodeSpec & { declaration: number })[] = [];
  private readonly variables: { type: number; value: unknown[] }[] = [];
  private readonly events: { id: string }[] = [];

  type(signature: string): number {
    const existing = this.types.findIndex((entry) => entry.signature === signature);
    if (existing >= 0) return existing;
    this.types.push({ signature });
    return this.types.length - 1;
  }

  float(value: number): { type: number; value: number[] } {
    return { type: this.type("float"), value: [value] };
  }

  int(value: number): { type: number; value: number[] } {
    return { type: this.type("int"), value: [value] };
  }

  bool(value: boolean): { type: number; value: boolean[] } {
    return { type: this.type("bool"), value: [value] };
  }

  variable(signature: string, value: unknown[]): number {
    this.variables.push({ type: this.type(signature), value });
    return this.variables.length - 1;
  }

  event(id: string): number {
    this.events.push({ id });
    return this.events.length - 1;
  }

  node(op: string, spec: NodeSpec = {}): number {
    let declaration = this.declarations.findIndex((entry) => entry.op === op);
    if (declaration < 0) {
      this.declarations.push(
        op.startsWith("xrift/")
          ? { op, extension: "XRIFT_studio_interaction" }
          : { op },
      );
      declaration = this.declarations.length - 1;
    }
    this.nodes.push({ declaration, ...spec });
    return this.nodes.length - 1;
  }

  connect(from: number, socket: string, to: number, inputSocket?: string): void {
    const node = this.nodes[from];
    if (!node) throw new Error(`connect from a node that does not exist: ${from}`);
    node.flows = {
      ...(node.flows ?? {}),
      [socket]: { node: to, ...(inputSocket ? { socket: inputSocket } : {}) },
    };
  }

  setValue(node: number, socket: string, value: unknown): void {
    const target = this.nodes[node];
    if (!target) throw new Error(`value on a node that does not exist: ${node}`);
    target.values = { ...(target.values ?? {}), [socket]: value };
  }

  build(): unknown {
    return {
      graph: 0,
      graphs: [
        {
          types: this.types,
          declarations: this.declarations,
          nodes: this.nodes,
          ...(this.variables.length > 0 ? { variables: this.variables } : {}),
          ...(this.events.length > 0 ? { events: this.events } : {}),
        },
      ],
    };
  }
}

type RecordedWrite = { time: number; property: string; value: InteractivityValue };

function recordingHost(sink: RecordedWrite[], engine: () => InteractivityEngine): InteractivityHost {
  const state = new Map<string, InteractivityValue>();
  return {
    readProperty: (target) => state.get(target.property) ?? null,
    writeProperty: (target, value) => {
      state.set(target.property, value);
      sink.push({ time: engine().currentTime, property: target.property, value });
      return true;
    },
  };
}

/** Deterministic assertions for the KHR_interactivity execution engine. */
export function runInteractivityEngineFixtureAssertions(): void {
  // A wait followed by a start lands on the wait's duration, and the immediate
  // `out` socket does not wait at all.
  {
    const builder = new GraphBuilder();
    const start = builder.node("event/onStart");
    const delay = builder.node("flow/setDelay", {
      values: { duration: builder.float(1.5) },
    });
    const late = builder.node("animation/start", {
      values: { animation: builder.int(0) },
    });
    const immediate = builder.node("animation/start", {
      values: { animation: builder.int(1) },
    });
    builder.connect(start, "out", delay);
    builder.connect(delay, "done", late);
    builder.connect(delay, "out", immediate);
    const cues = walkOnStart(builder.build()).cues;
    assert(cues.length === 2, "flow/setDelay did not schedule both flow outputs");
    assert(
      cues.find((cue) => cue.animationIndex === 1)?.delaySeconds === 0,
      "flow/setDelay delayed the `out` socket, which continues immediately",
    );
    assert(
      Math.abs(
        (cues.find((cue) => cue.animationIndex === 0)?.delaySeconds ?? 0) - 1.5,
      ) < 1e-6,
      "flow/setDelay did not carry its duration to the `done` socket",
    );
  }

  // A flow cycle is a loop, not an error: play, wait, come back, three times.
  {
    const builder = new GraphBuilder();
    const start = builder.node("event/onStart");
    const gate = builder.node("flow/doN", { values: { n: builder.int(3) } });
    const play = builder.node("animation/start", {
      values: { animation: builder.int(0) },
    });
    const delay = builder.node("flow/setDelay", {
      values: { duration: builder.float(1) },
    });
    builder.connect(start, "out", gate);
    builder.connect(gate, "out", play);
    builder.connect(play, "out", delay);
    builder.connect(delay, "done", gate);
    const cues = walkOnStart(builder.build()).cues;
    assert(cues.length === 3, `a three-times loop played ${cues.length} times`);
    const times = cues.map((cue) => Math.round(cue.delaySeconds * 1000) / 1000);
    assert(
      times[0] === 0 && times[1] === 1 && times[2] === 2,
      `a one-second loop played at ${times.join(", ")}`,
    );
  }

  // Playing for a fixed time and stopping is a start and a stop on one clip.
  {
    const builder = new GraphBuilder();
    const start = builder.node("event/onStart");
    const wait = builder.node("flow/setDelay", {
      values: { duration: builder.float(2) },
    });
    const play = builder.node("animation/start", {
      values: { animation: builder.int(0) },
    });
    const hold = builder.node("flow/setDelay", {
      values: { duration: builder.float(3) },
    });
    const stop = builder.node("animation/stop", {
      values: { animation: builder.int(0) },
    });
    builder.connect(start, "out", wait);
    builder.connect(wait, "done", play);
    builder.connect(play, "out", hold);
    builder.connect(hold, "done", stop);
    const cues = walkOnStart(builder.build()).cues;
    assert(cues.length === 1, "a timed playback produced more than one cue");
    assert(cues[0]?.delaySeconds === 2, "a timed playback started at the wrong time");
    assert(cues[0]?.stopSeconds === 5, "a timed playback did not record its stop");
  }

  // A stop reached at the same moment as its start cancels the playback.
  {
    const builder = new GraphBuilder();
    const start = builder.node("event/onStart");
    const play = builder.node("animation/start", {
      values: { animation: builder.int(0) },
    });
    const stop = builder.node("animation/stop", {
      values: { animation: builder.int(0) },
    });
    builder.connect(start, "out", play);
    builder.connect(play, "out", stop);
    assert(
      walkOnStart(builder.build()).cues.length === 0,
      "animation/stop did not cancel the start it directly follows",
    );
  }

  // A branch reads a computed condition, which the static walk could not do.
  {
    const builder = new GraphBuilder();
    const speed = builder.variable("float", [4]);
    const start = builder.node("event/onStart");
    const read = builder.node("variable/get", {
      configuration: { variable: { value: [speed] } },
    });
    const compare = builder.node("math/gt", {
      values: { a: { node: read, socket: "value" }, b: builder.float(1) },
    });
    const branch = builder.node("flow/branch", {
      values: { condition: { node: compare, socket: "value" } },
    });
    const whenTrue = builder.node("animation/start", {
      values: { animation: builder.int(0) },
    });
    const whenFalse = builder.node("animation/start", {
      values: { animation: builder.int(1) },
    });
    builder.connect(start, "out", branch);
    builder.connect(branch, "true", whenTrue);
    builder.connect(branch, "false", whenFalse);
    const cues = walkOnStart(builder.build()).cues;
    assert(
      cues.length === 1 && cues[0]?.animationIndex === 0,
      "a branch on a computed condition did not take the matching side",
    );
  }

  // `variable/set` runs and the chain continues through it.
  {
    const builder = new GraphBuilder();
    const counter = builder.variable("int", [0]);
    const start = builder.node("event/onStart");
    const write = builder.node("variable/set", {
      configuration: { variable: { value: [counter] } },
      values: { value: builder.int(7) },
    });
    const read = builder.node("variable/get", {
      configuration: { variable: { value: [counter] } },
    });
    const play = builder.node("animation/start", {
      values: { animation: { node: read, socket: "value" } },
    });
    builder.connect(start, "out", write);
    builder.connect(write, "out", play);
    const cues = walkOnStart(builder.build()).cues;
    assert(
      cues.length === 1 && cues[0]?.animationIndex === 7,
      "the chain did not continue through variable/set with the value it wrote",
    );
  }

  // `flow/sequence` runs its outputs in socket order, not in wiring order.
  {
    const builder = new GraphBuilder();
    const start = builder.node("event/onStart");
    const sequence = builder.node("flow/sequence");
    const first = builder.node("animation/start", {
      values: { animation: builder.int(0) },
    });
    const second = builder.node("animation/start", {
      values: { animation: builder.int(1) },
    });
    const third = builder.node("animation/start", {
      values: { animation: builder.int(2) },
    });
    builder.connect(start, "out", sequence);
    builder.connect(sequence, "2", third);
    builder.connect(sequence, "0", first);
    builder.connect(sequence, "1", second);
    const run = dryRunInteractivityGraph(builder.build());
    const order = run.entries
      .filter((entry) => entry.kind === "animation-start")
      .map((entry) => (entry.kind === "animation-start" ? entry.animationIndex : -1));
    assert(
      order.join(",") === "0,1,2",
      `flow/sequence ran its outputs as ${order.join(",")}`,
    );
  }

  // `flow/waitAll` holds until every wired input has arrived.
  {
    const builder = new GraphBuilder();
    const start = builder.node("event/onStart");
    const sequence = builder.node("flow/sequence");
    const shortWait = builder.node("flow/setDelay", {
      values: { duration: builder.float(1) },
    });
    const longWait = builder.node("flow/setDelay", {
      values: { duration: builder.float(4) },
    });
    const join = builder.node("flow/waitAll");
    const play = builder.node("animation/start", {
      values: { animation: builder.int(0) },
    });
    builder.connect(start, "out", sequence);
    builder.connect(sequence, "0", shortWait);
    builder.connect(sequence, "1", longWait);
    builder.connect(shortWait, "done", join, "0");
    builder.connect(longWait, "done", join, "1");
    builder.connect(join, "completed", play);
    const cues = walkOnStart(builder.build()).cues;
    assert(cues.length === 1, "flow/waitAll did not run its completion exactly once");
    assert(
      cues[0]?.delaySeconds === 4,
      `flow/waitAll completed at ${cues[0]?.delaySeconds ?? "never"} instead of the longest wait`,
    );
  }

  // A timed property write moves the value across the duration.
  {
    const builder = new GraphBuilder();
    const start = builder.node("event/onStart");
    const write = builder.node("xrift/setProperty", {
      configuration: {
        entity: { value: ["entity-1"] },
        component: { value: ["light-1"] },
        targetKind: { value: ["light"] },
        property: { value: ["intensity"] },
      },
      values: { value: builder.float(1), duration: builder.float(2) },
    });
    builder.connect(start, "out", write);
    const writes: RecordedWrite[] = [];
    let engine: InteractivityEngine | null = null;
    engine = new InteractivityEngine(
      builder.build(),
      recordingHost(writes, () => {
        if (!engine) throw new Error("engine read before it was constructed");
        return engine;
      }),
    );
    engine.start();
    for (let step = 0; step < 60; step += 1) engine.update(1 / 30);
    assert(writes.length > 10, "a timed property write produced no intermediate values");
    const halfway = writes.find((entry) => entry.time >= 1);
    assert(
      halfway !== undefined && Math.abs(asNumber(halfway.value) - 0.5) < 0.1,
      "a timed property write did not reach its halfway value on time",
    );
    const last = writes[writes.length - 1];
    assert(
      last !== undefined && Math.abs(asNumber(last.value) - 1) < 1e-6,
      "a timed property write did not land exactly on its target",
    );
  }

  // A cycle among values is reported instead of running forever.
  {
    const builder = new GraphBuilder();
    const start = builder.node("event/onStart");
    const left = builder.node("math/add");
    const right = builder.node("math/add");
    builder.setValue(left, "a", { node: right, socket: "value" });
    builder.setValue(right, "a", { node: left, socket: "value" });
    const play = builder.node("animation/start", {
      values: { animation: { node: left, socket: "value" } },
    });
    builder.connect(start, "out", play);
    const run = walkOnStart(builder.build());
    assert(
      run.issues.some((issue) => issue.reason === "value-cycle"),
      "a value cycle was not reported",
    );
  }

  // An operation this runtime does not implement stops the chain.
  {
    const builder = new GraphBuilder();
    const start = builder.node("event/onStart");
    const unknown = builder.node("vendor/doSomething");
    const play = builder.node("animation/start", {
      values: { animation: builder.int(0) },
    });
    builder.connect(start, "out", unknown);
    builder.connect(unknown, "out", play);
    const run = walkOnStart(builder.build());
    assert(run.cues.length === 0, "the walk continued past an unimplemented operation");
    assert(
      run.issues.some((issue) => issue.reason === "unsupported-operation"),
      "an unimplemented operation was skipped without being reported",
    );
  }

  // Two graph fragments compose through a named event rather than a variable.
  {
    const builder = new GraphBuilder();
    const opened = builder.event("door-opened");
    const start = builder.node("event/onStart");
    const wait = builder.node("flow/setDelay", {
      values: { duration: builder.float(2) },
    });
    const send = builder.node("event/send", {
      configuration: { event: { value: [opened] } },
    });
    const receive = builder.node("event/receive", {
      configuration: { event: { value: [opened] } },
    });
    const play = builder.node("animation/start", {
      values: { animation: builder.int(3) },
    });
    builder.connect(start, "out", wait);
    builder.connect(wait, "done", send);
    builder.connect(receive, "out", play);
    const cues = walkOnStart(builder.build()).cues;
    assert(
      cues.length === 1 && cues[0]?.animationIndex === 3,
      "event/send did not reach the matching event/receive",
    );
    assert(
      cues[0]?.delaySeconds === 2,
      "an event delivered at the wrong time",
    );
  }

  // `event/onTick` runs every frame and can read the elapsed time.
  {
    const builder = new GraphBuilder();
    const elapsed = builder.variable("float", [0]);
    const tick = builder.node("event/onTick");
    const store = builder.node("variable/set", {
      configuration: { variable: { value: [elapsed] } },
      values: { value: { node: tick, socket: "timeSinceStart" } },
    });
    builder.connect(tick, "out", store);
    const engine = new InteractivityEngine(builder.build(), {});
    engine.start();
    for (let step = 0; step < 30; step += 1) engine.update(0.1);
    assert(
      Math.abs(engine.currentTime - 3) < 1e-6,
      `the engine clock reached ${engine.currentTime} instead of 3`,
    );
    assert(
      engine.getTrace().length > 0,
      "event/onTick produced no trace entries",
    );
  }

  // The interaction entry point is separate from the start entry point.
  {
    const builder = new GraphBuilder();
    const onInteract = builder.node("xrift/onInteract");
    const write = builder.node("xrift/setProperty", {
      configuration: {
        entity: { value: ["entity-1"] },
        component: { value: [""] },
        targetKind: { value: ["entity"] },
        property: { value: ["enabled"] },
      },
      values: { value: { type: 0, value: [true] } },
    });
    builder.connect(onInteract, "out", write);
    const extension = builder.build();
    const idle = dryRunInteractivityGraph(extension);
    assert(
      idle.entries.length === 0,
      "an interaction graph acted without anyone interacting",
    );
    const interacted = dryRunInteractivityGraph(extension, { entry: "interact" });
    assert(
      interacted.entries.some((entry) => entry.kind === "property"),
      "an interaction graph did nothing when interacted with",
    );
  }

  // An interaction can now wait, which the previous trigger walk could not.
  {
    const builder = new GraphBuilder();
    const onInteract = builder.node("xrift/onInteract");
    const wait = builder.node("flow/setDelay", {
      values: { duration: builder.float(3) },
    });
    const write = builder.node("xrift/setProperty", {
      configuration: {
        entity: { value: ["entity-1"] },
        component: { value: [""] },
        targetKind: { value: ["entity"] },
        property: { value: ["enabled"] },
      },
      values: { value: { type: 0, value: [false] } },
    });
    builder.connect(onInteract, "out", wait);
    builder.connect(wait, "done", write);
    const run = dryRunInteractivityGraph(builder.build(), { entry: "interact" });
    const written = run.entries.find((entry) => entry.kind === "property");
    assert(
      written !== undefined && Math.abs(written.timeSeconds - 3) < 1e-6,
      "a delayed interaction did not write after its wait",
    );
  }
}
