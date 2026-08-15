import { filterFiles, getMimeType, type UploadFile } from "@xrift/sdk";
import { tauri } from "../tauri";

/**
 * Reads a built `dist/` from disk into the file set `@xrift/sdk` uploads.
 *
 * This is the desktop counterpart to the browser's in-memory assembly. Both
 * end at the same `UploadFile[]`, which is what lets one upload
 * implementation serve the CLI-built path and the browser path alike — and
 * what keeps `contentHash` identical between them.
 *
 * Reading goes through Tauri IPC rather than a Node fs call because this runs
 * in the webview. `@xrift/sdk/node`'s `uploadWorldFromDirectory` cannot be
 * used here for the same reason.
 */

/** Guards against pulling a runaway directory into memory. */
const MAX_TOTAL_BYTES = 512 * 1024 * 1024;
const MAX_FILE_COUNT = 5000;

export type DistCollectionResult = {
  files: UploadFile[];
  totalBytes: number;
  /** Paths dropped by the `ignore` rules, for the log. */
  ignoredPaths: string[];
};

export class DistCollectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DistCollectionError";
  }
}

/**
 * Collects `dist` under `projectPath`, applying `xrift.json`'s ignore rules.
 *
 * `ignorePatterns` comes from the caller rather than being read here so the
 * same rules the CLI would apply are visible at the call site.
 */
export async function collectDistUploadFiles(
  projectPath: string,
  distRelativePath: string,
  ignorePatterns: readonly string[],
  signal?: AbortSignal,
): Promise<DistCollectionResult> {
  const paths = await listFilesRecursively(projectPath, distRelativePath, signal);
  if (paths.length === 0) {
    throw new DistCollectionError(
      `${distRelativePath} にファイルがありません。ビルドが完了しているか確認してください。`,
    );
  }

  // Paths are matched relative to dist, matching how the CLI reads them.
  const relative = paths.map((path) => path.slice(distRelativePath.length + 1));
  const kept = new Set(filterFiles(relative, [...ignorePatterns]));
  const ignoredPaths = relative.filter((path) => !kept.has(path));

  if (kept.size > MAX_FILE_COUNT) {
    throw new DistCollectionError(
      `アップロード対象が${kept.size}件あり、上限の${MAX_FILE_COUNT}件を超えています。`,
    );
  }

  const files: UploadFile[] = [];
  let totalBytes = 0;
  for (const remotePath of [...kept].sort((left, right) =>
    left.localeCompare(right),
  )) {
    if (signal?.aborted) {
      throw new DOMException("The operation was aborted", "AbortError");
    }
    const data = await readFileBytes(
      projectPath,
      `${distRelativePath}/${remotePath}`,
    );
    totalBytes += data.byteLength;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new DistCollectionError(
        "アップロード対象の合計サイズが大きすぎます。distの内容を確認してください。",
      );
    }
    files.push({
      remotePath,
      size: data.byteLength,
      contentType: getMimeType(remotePath),
      data,
    });
  }

  return { files, totalBytes, ignoredPaths };
}

async function listFilesRecursively(
  projectPath: string,
  relativePath: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const found: string[] = [];
  const queue: string[] = [relativePath];
  while (queue.length > 0) {
    if (signal?.aborted) {
      throw new DOMException("The operation was aborted", "AbortError");
    }
    const current = queue.shift() as string;
    let entries: Awaited<ReturnType<typeof tauri.listFiles>>;
    try {
      entries = await tauri.listFiles(projectPath, current);
    } catch (error) {
      // A missing dist is the common case and deserves a clear message; any
      // other read failure is passed through.
      if (current === relativePath) {
        throw new DistCollectionError(
          `${relativePath} を読み取れませんでした。ビルドが完了しているか確認してください: ${error}`,
        );
      }
      throw error;
    }
    for (const entry of entries) {
      if (entry.isDir) queue.push(entry.rel);
      else found.push(entry.rel);
    }
  }
  return found;
}

async function readFileBytes(
  projectPath: string,
  relativePath: string,
): Promise<Uint8Array> {
  const dataUrl = await tauri.readProjectFileDataUrl(projectPath, relativePath);
  return decodeBase64DataUrl(dataUrl, relativePath);
}

/**
 * The IPC boundary hands back a data URL, so bytes arrive base64-encoded.
 *
 * `atob` is used rather than `fetch(dataUrl)` because a data URL fetch is
 * blocked by the webview's content security policy in packaged builds.
 */
export function decodeBase64DataUrl(
  dataUrl: string,
  relativePath: string,
): Uint8Array {
  const comma = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || comma < 0) {
    throw new DistCollectionError(
      `${relativePath} を読み取れませんでした（data URLではありません）。`,
    );
  }
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
