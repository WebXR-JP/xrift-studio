/**
 * Where recorded bytes go.
 *
 * A take can run for hours, so the chunks never accumulate in memory: each one
 * is appended to the file as soon as the encoder hands it over. The desktop
 * sink streams into a file the Rust side opened; the memory sink exists so the
 * same controller runs in a plain browser, where the only place to put a video
 * is a download.
 */

import { tauri } from "../tauri";

export type RecordingSinkOpenRequest = {
  fileStem: string;
  extension: "webm" | "mp4";
  /** null means the default directory the native side chooses. */
  directory: string | null;
  /**
   * `container`: chunks are the encoded video. `ffmpeg-frames`: chunks are
   * JPEG frames at `frameRate`, for the native side to hand to FFmpeg.
   */
  encoder: "container" | "ffmpeg-frames";
  frameRate: number;
};

export type RecordingSinkOpenResult = {
  path: string;
  directory: string;
};

export type RecordingSinkCloseResult = {
  path: string | null;
  metadataPath: string | null;
  bytesWritten: number;
};

export type RecordingSink = {
  open(request: RecordingSinkOpenRequest): Promise<RecordingSinkOpenResult>;
  append(chunk: Uint8Array): Promise<void>;
  /** Finishes the file and writes the sidecar next to it. */
  close(metadata: Record<string, unknown>): Promise<RecordingSinkCloseResult>;
  /** Keeps what was written so far and releases the file. */
  abort(): Promise<RecordingSinkCloseResult>;
};

export function createTauriRecordingSink(): RecordingSink {
  let fileId: string | null = null;
  let path: string | null = null;
  return {
    async open(request) {
      const handle = await tauri.beginRecordingFile(request);
      fileId = handle.id;
      path = handle.path;
      return { path: handle.path, directory: handle.directory };
    },
    async append(chunk) {
      if (!fileId) throw new Error("録画ファイルが開かれていません");
      await tauri.appendRecordingChunk(fileId, chunk);
    },
    async close(metadata) {
      if (!fileId) return { path, metadataPath: null, bytesWritten: 0 };
      const id = fileId;
      fileId = null;
      const summary = await tauri.finishRecordingFile(id, metadata);
      return {
        path: summary.path,
        metadataPath: summary.metadataPath,
        bytesWritten: summary.bytesWritten,
      };
    },
    async abort() {
      if (!fileId) return { path, metadataPath: null, bytesWritten: 0 };
      const id = fileId;
      fileId = null;
      try {
        const summary = await tauri.abortRecordingFile(id);
        return {
          path: summary.path,
          metadataPath: null,
          bytesWritten: summary.bytesWritten,
        };
      } catch {
        return { path, metadataPath: null, bytesWritten: 0 };
      }
    },
  };
}

/**
 * Browser fallback. Everything stays in memory, so the controller caps the
 * length of a take that uses it; the point is that the same code path can be
 * exercised outside the desktop app, not to record for an hour in a tab.
 */
export function createMemoryRecordingSink(): RecordingSink {
  const chunks: Uint8Array[] = [];
  let fileName = "recording.webm";
  let mimeType = "video/webm";
  let bytes = 0;
  const finish = (): RecordingSinkCloseResult => {
    if (typeof document === "undefined" || chunks.length === 0) {
      return { path: null, metadataPath: null, bytesWritten: bytes };
    }
    const blob = new Blob(chunks as BlobPart[], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return { path: fileName, metadataPath: null, bytesWritten: bytes };
  };
  return {
    async open(request) {
      fileName = `${request.fileStem}.${request.extension}`;
      mimeType = request.extension === "mp4" ? "video/mp4" : "video/webm";
      chunks.length = 0;
      bytes = 0;
      return { path: fileName, directory: "download" };
    },
    async append(chunk) {
      chunks.push(chunk);
      bytes += chunk.byteLength;
    },
    async close() {
      return finish();
    },
    async abort() {
      return finish();
    },
  };
}

export function createDefaultRecordingSink(): RecordingSink {
  return tauri.isAvailable()
    ? createTauriRecordingSink()
    : createMemoryRecordingSink();
}
