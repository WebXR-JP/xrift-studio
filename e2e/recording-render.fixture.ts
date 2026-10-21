import { recordingSession } from '../src/lib/recording/recording-session';
import type { RecordingSink } from '../src/lib/recording/recording-sink';

/** Real canvas capture and MediaRecorder; only file storage stays in memory. */
export async function recordMovingCanvas() {
  const Store = recordingSession.constructor as new () => typeof recordingSession;
  const store = new Store();
  const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
  document.body.append(canvas);
  const context = canvas.getContext('2d')!;
  const detach = store.registerSource(canvas);
  const chunks: Uint8Array[] = [];
  let metadata: Record<string, unknown> = {};
  const finish = () => ({ path: '/isolated/moving.webm', metadataPath: null, bytesWritten: chunks.reduce((sum, chunk) => sum + chunk.length, 0) });
  const sink: RecordingSink = {
    async open() { return { path: '/isolated/moving.webm', directory: '/isolated' }; },
    async append(bytes) { chunks.push(bytes); },
    async close(value) { metadata = value; return finish(); },
    async abort() { return finish(); },
  };
  const started = await store.startRecording({ sink, profile: { aspectRatio: '16:9', shortEdge: 720, frameRate: 30 } });
  if (!started.started) throw new Error(started.message);
  try {
    const start = performance.now();
    await new Promise<void>(resolve => {
      const frame = (now: number) => {
        context.fillStyle = '#102030'; context.fillRect(0, 0, 1280, 720);
        context.fillStyle = '#fff'; context.fillRect(((now - start) * .3) % 1200, 200, 80, 320);
        store.pumpFrame(now);
        if (now - start >= 2400) resolve(); else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  } finally { await store.stopRecording(); detach(); canvas.remove(); }
  const blob = new Blob(chunks as BlobPart[], { type: 'video/webm' });
  const dataUrl = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(blob); });
  return { metadata, state: store.getState().snapshot, dataUrl };
}
