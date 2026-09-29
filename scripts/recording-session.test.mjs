import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { createServer } from "vite";

// Run the real controller through Vite's development TS loader. The encoder
// and sink are controlled so stop/read/write races are deterministic.
const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true }, appType: "custom" });
const { recordingSession } = await server.ssrLoadModule("/src/lib/recording/recording-session.ts");
const { createTauriRecordingSink } = await server.ssrLoadModule("/src/lib/recording/recording-sink.ts");
const { tauri } = await server.ssrLoadModule("/src/lib/tauri.ts");
const Store = recordingSession.constructor;
after(() => server.close());

let recorder;
let stoppedTracks;
class Encoder {
  static isTypeSupported() { return true; }
  state = "inactive";
  constructor() { recorder = this; }
  start() { this.state = "recording"; }
  stop() { this.state = "inactive"; this.onstop?.(); }
  emit(read) { this.ondataavailable?.({ data: { size: 1, arrayBuffer: read } }); }
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
function sink(overrides = {}) {
  const writes = [];
  let closes = 0;
  let aborts = 0;
  return {
    writes,
    get closes() { return closes; },
    get aborts() { return aborts; },
    async open() { return { path: "/fixture/take.webm", directory: "/fixture" }; },
    async append(bytes) { writes.push([...bytes]); },
    async close() { closes++; return { path: "/fixture/take.webm", metadataPath: null, bytesWritten: writes.length }; },
    async abort() { aborts++; return { path: "/fixture/take.webm", metadataPath: null, bytesWritten: writes.length }; },
    ...overrides,
  };
}
beforeEach(() => {
  stoppedTracks = 0;
  globalThis.window = { setTimeout, clearTimeout, setInterval, clearInterval, localStorage: { getItem() { return null; }, setItem() {} } };
  globalThis.document = {
    createElement() {
      const track = { stop() { stoppedTracks++; } };
      return {
        width: 100, height: 100,
        getContext() { return { fillRect() {}, drawImage() {} }; },
        captureStream() { return { getVideoTracks() { return [track]; }, getTracks() { return [track]; } }; },
        toBlob(callback) { callback(new Blob([new Uint8Array([7])])); },
      };
    },
  };
  globalThis.MediaRecorder = Encoder;
});

test("stop waits for slow final blob reads and keeps encoder chunk order", async () => {
  const store = new Store();
  const output = sink();
  await store.startRecording({ sink: output });
  const read = deferred();
  recorder.emit(() => read.promise);
  recorder.emit(async () => new Uint8Array([2]).buffer);
  const stop = store.stopRecording();
  await new Promise((resolve) => setImmediate(resolve));
  const earlyCloses = output.closes;
  read.resolve(new Uint8Array([1]).buffer);
  const result = await stop;
  assert.equal(earlyCloses, 0);
  assert.equal(result.snapshot.status, "completed");
  assert.deepEqual(output.writes, [[1], [2]]);
  assert.equal(output.closes, 1);
});

test("read failure plus failed abort still settles stop and permits another take", async () => {
  const store = new Store();
  await store.startRecording({ sink: sink({ async abort() { throw new Error("abort failed"); } }) });
  recorder.emit(async () => { throw new Error("blob unreadable"); });
  const result = await store.stopRecording();
  assert.equal(result.snapshot.status, "failed");
  assert.match(result.snapshot.message, /blob unreadable/);
  assert.equal((await store.startRecording({ sink: sink() })).started, true);
  await store.stopRecording();
});

test("append failure and repeated onstop close the partial file only once", async () => {
  const store = new Store();
  const output = sink({ async append() { throw new Error("disk full"); } });
  await store.startRecording({ sink: output });
  recorder.emit(async () => new Uint8Array([1]).buffer);
  const stop = store.stopRecording();
  recorder.onstop();
  const result = await stop;
  assert.equal(result.snapshot.status, "failed");
  assert.match(result.snapshot.message, /disk full/);
  assert.equal(output.aborts, 1);
});

test("close failure releases the sink and allows a new take", async () => {
  const store = new Store();
  const output = sink({ async close() { throw new Error("sync failed"); } });
  await store.startRecording({ sink: output });
  recorder.emit(async () => new Uint8Array([1]).buffer);
  const result = await store.stopRecording();
  assert.equal(result.snapshot.status, "failed");
  assert.equal(output.aborts, 1);
  assert.equal((await store.startRecording({ sink: sink() })).started, true);
  await store.stopRecording();
});

test("constructor failure stops capture tracks even if abort fails", async () => {
  class BrokenEncoder extends Encoder { constructor() { throw new Error("encoder unavailable"); } }
  globalThis.MediaRecorder = BrokenEncoder;
  const store = new Store();
  const result = await store.startRecording({ sink: sink({ async abort() { throw new Error("abort failed"); } }) });
  assert.equal(result.started, false);
  assert.match(result.message, /encoder unavailable/);
  assert.equal(stoppedTracks, 1);
});

test("FFmpeg fallback works without MediaRecorder or captureStream", async () => {
  delete globalThis.MediaRecorder;
  window.__TAURI_INTERNALS__ = {};
  const support = tauri.recordingEncoderSupport;
  tauri.recordingEncoderSupport = async () => ({ ffmpeg: true });
  const create = document.createElement;
  document.createElement = () => { const canvas = create(); delete canvas.captureStream; return canvas; };
  const store = new Store();
  const output = sink();
  store.registerSource({ width: 100, height: 100 });
  try {
    assert.equal((await store.startRecording({ sink: output })).started, true);
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal((await store.stopRecording()).snapshot.status, "completed");
    assert.ok(output.writes.length > 0);
  } finally {
    tauri.recordingEncoderSupport = support;
  }
});

test("native sink retains the handle for abort when finish fails", async () => {
  const original = { begin: tauri.beginRecordingFile, finish: tauri.finishRecordingFile, abort: tauri.abortRecordingFile };
  let aborted;
  tauri.beginRecordingFile = async () => ({ id: "fixture-id", path: "/fixture/take.webm", directory: "/fixture" });
  tauri.finishRecordingFile = async () => { throw new Error("finish failed"); };
  tauri.abortRecordingFile = async (id) => { aborted = id; return { path: "/fixture/take.webm", bytesWritten: 1 }; };
  try {
    const output = createTauriRecordingSink();
    await output.open({});
    await assert.rejects(output.close({}), /finish failed/);
    await output.abort();
    assert.equal(aborted, "fixture-id");
  } finally {
    Object.assign(tauri, { beginRecordingFile: original.begin, finishRecordingFile: original.finish, abortRecordingFile: original.abort });
  }
});

test("a flush timeout reports failure and keeps the partial recording", async () => {
  const store = new Store();
  let writes = 0;
  const output = sink({ async append() { if (++writes === 2) await new Promise(() => {}); } });
  await store.startRecording({ sink: output });
  recorder.emit(async () => new Uint8Array([1]).buffer);
  recorder.emit(async () => new Uint8Array([2]).buffer);
  window.setTimeout = (callback, delay) => setTimeout(callback, delay === 20_000 ? 5 : delay);
  const result = await store.stopRecording({ reason: "duration limit" });
  assert.equal(result.snapshot.status, "failed");
  assert.match(result.snapshot.message, /時間内/);
  assert.equal(result.snapshot.path, "/fixture/take.webm");
  assert.equal(output.aborts, 1);
  assert.equal(output.closes, 0);
});

test("frame-stream ticks do not send frames ahead of the wall clock", async () => {
  delete globalThis.MediaRecorder;
  window.__TAURI_INTERNALS__ = {};
  const support = tauri.recordingEncoderSupport;
  tauri.recordingEncoderSupport = async () => ({ ffmpeg: true });
  const store = new Store();
  const output = sink();
  const originalNow = Date.now;
  try {
    const now = originalNow();
    await store.startRecording({ sink: output, now });
    Date.now = () => now;
    store.sendDueFrames(store.active, new Uint8Array([1]));
    assert.equal(store.active.framesSent, 0);
    Date.now = () => now + 40;
    store.sendDueFrames(store.active, new Uint8Array([1]));
    store.sendDueFrames(store.active, new Uint8Array([1]));
    assert.equal(store.active.framesSent, 1);
    Date.now = originalNow;
    await store.stopRecording();
    assert.deepEqual(output.writes, [[1]]);
  } finally {
    Date.now = originalNow;
    tauri.recordingEncoderSupport = support;
  }
});

test("frame-stream stop saves the JPEG already being encoded", async () => {
  delete globalThis.MediaRecorder;
  window.__TAURI_INTERNALS__ = {};
  const support = tauri.recordingEncoderSupport;
  tauri.recordingEncoderSupport = async () => ({ ffmpeg: true });
  const read = deferred();
  const create = document.createElement;
  document.createElement = () => {
    const canvas = create();
    canvas.toBlob = (callback) => callback({ arrayBuffer: () => read.promise });
    return canvas;
  };
  const store = new Store();
  const output = sink();
  const originalNow = Date.now;
  store.registerSource({ width: 100, height: 100 });
  try {
    const now = originalNow();
    await store.startRecording({ sink: output, now });
    Date.now = () => now + 40;
    store.frameStreamTick(store.active);
    const stopping = store.stopRecording();
    await new Promise((resolve) => setImmediate(resolve));
    read.resolve(new Uint8Array([9]).buffer);
    const result = await stopping;
    assert.equal(result.snapshot.status, "completed");
    assert.deepEqual(output.writes, [[9]]);
  } finally {
    Date.now = originalNow;
    tauri.recordingEncoderSupport = support;
  }
});

test("file reveal preserves POSIX and Windows paths and directory opening uses the checked command", async () => {
  const calls = [];
  window.__TAURI_INTERNALS__ = { async invoke(command, args) { calls.push({ command, args }); } };
  for (const path of ["/fixture/XRift Studio/動画.webm", "C:\\Users\\User\\Videos\\take.mp4"]) {
    await tauri.revealItemInDir(path);
    assert.deepEqual(calls.at(-1), { command: "plugin:opener|reveal_item_in_dir", args: { paths: [path] } });
  }
  await tauri.openDirectory("/fixture/project");
  assert.deepEqual(calls.at(-1), { command: "open_directory", args: { path: "/fixture/project" } });
});

test("browser links open synchronously without treating noopener's null as failure", async () => {
  const calls = [];
  window.location = { href: "https://studio.example/" };
  window.open = (...args) => { calls.push(args); return null; };
  const opened = tauri.openUrl("https://docs.xrift.net/");
  assert.equal(calls.length, 1);
  await opened;
  await assert.rejects(tauri.openUrl("javascript:alert(1)"));
  assert.equal(calls.length, 1);
});
