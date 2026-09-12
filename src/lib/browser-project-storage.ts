import type { FsEntry, ProjectKind, VisualAssetImportWrite, VisualProjectFiles, VisualProjectWriteRequest } from "./tauri";
import { isValidAssetImportPath, isValidAssetImportTransactionId } from "./visual-editor/asset-import-transaction";

const PROJECT_PREFIX = "browser-project://";
const PROJECT_MANIFEST = "xrift-studio.project.json";
const DATABASE_NAME = "xrift-studio-browser-projects";
const FILES = "files";
const SETTINGS = "settings";
const MAX_FILE_BYTES = 128 * 1024 * 1024;
const MAX_TRANSACTION_BYTES = 320 * 1024 * 1024;
type StoredFile = { projectPath: string; relativePath: string; bytes: Uint8Array };
export type BrowserStoredProject = { path: string; name: string; title: string; kind: ProjectKind; modifiedAt: string };
let databasePromise: Promise<IDBDatabase> | undefined;

/** Browser paths are explicit; they never make native IPC or authentication available. */
export function isBrowserProjectPath(path: string | undefined): boolean {
  return typeof path === "string" && /^browser-project:\/\/[A-Za-z0-9-]+$/.test(path);
}

function validateProjectPath(path: string): void {
  if (!isBrowserProjectPath(path)) throw new Error("ブラウザのプロジェクトを確認できません。");
}

export function validateBrowserRelativePath(path: string): string {
  if (!path || path.length > 1024 || path !== path.trim() || /[\\:\x00-\x1f\x7f]/.test(path) ||
      path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`プロジェクト内のファイルパスが不正です: ${path}`);
  }
  return path;
}

function database(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("このブラウザではプロジェクトを保存できません。Safariの通常のタブで開いてください。"));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, 1);
    let settled = false;
    request.onupgradeneeded = () => {
      const files = request.result.createObjectStore(FILES, { keyPath: ["projectPath", "relativePath"] });
      files.createIndex("projectPath", "projectPath", { unique: false });
      request.result.createObjectStore(SETTINGS);
    };
    request.onsuccess = () => {
      const db = request.result;
      if (settled) { db.close(); return; }
      settled = true;
      db.onversionchange = () => { db.close(); databasePromise = undefined; };
      // Browsers can close IndexedDB connections independently of this tab.
      // A later save must open a new connection instead of reusing a closed one.
      db.onclose = () => { databasePromise = undefined; };
      resolve(db);
    };
    request.onerror = () => { settled = true; reject(request.error ?? new Error("ブラウザの保存領域を開けません。")); };
    request.onblocked = () => { settled = true; reject(new Error("ほかのXRift Studioのタブを閉じてから、もう一度開いてください。")); };
  }).catch((error: unknown) => { databasePromise = undefined; throw error; });
  return databasePromise;
}

/** Callbacks enqueue IDB requests synchronously: no awaited work may expire a Safari transaction. */
async function transaction<T>(
  mode: IDBTransactionMode,
  run: (files: IDBObjectStore, settings: IDBObjectStore, result: (value: T) => void, fail: (error: Error) => void) => void,
): Promise<T> {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction([FILES, SETTINGS], mode);
    let result: T;
    let failure: Error | undefined;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failure ?? tx.error ?? new Error("保存できませんでした。端末の空き容量を確認してください。"));
    tx.onerror = () => { /* onabort reports the final transaction failure. */ };
    const fail = (error: Error) => { failure = error; tx.abort(); };
    try { run(tx.objectStore(FILES), tx.objectStore(SETTINGS), (value) => { result = value; }, fail); }
    catch (error) { fail(error instanceof Error ? error : new Error(String(error))); }
  });
}

/** Creates a separate project. Failed imports leave the previous project and restore pointer intact. */
export async function createBrowserProject(
  files: ReadonlyMap<string, Uint8Array> = new Map(),
  { activate = true }: { activate?: boolean } = {},
): Promise<string> {
  const projectPath = `${PROJECT_PREFIX}${crypto.randomUUID()}`;
  const entries = [...files].map(([relativePath, bytes]) => ({
    projectPath, relativePath: validateBrowserRelativePath(relativePath), bytes: new Uint8Array(bytes),
  }));
  await transaction<void>("readwrite", (store, settings) => {
    for (const entry of entries) store.add(entry);
    if (activate) settings.put(projectPath, "last-project");
  });
  return projectPath;
}

export async function restoreBrowserProject(): Promise<string | null> {
  return transaction<string | null>("readonly", (_files, settings, result) => {
    const request = settings.get("last-project");
    request.onsuccess = () => result(isBrowserProjectPath(request.result) ? request.result : null);
  });
}

/** Previous imports remain accessible. Scan keys first so the picker never loads models into memory. */
export async function listBrowserProjects(): Promise<BrowserStoredProject[]> {
  const { visualProjectDocumentCodec } = await import("./visual-editor/serialization");
  return transaction("readonly", (files, _settings, done) => {
    const projects: BrowserStoredProject[] = [];
    const cursorRequest = files.openKeyCursor();
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        done(projects.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt)));
        return;
      }
      const key = cursor.primaryKey as [string, string];
      if (key[1] === PROJECT_MANIFEST && isBrowserProjectPath(key[0])) {
        const request = files.get(key);
        request.onsuccess = () => {
          try {
            const file = request.result as StoredFile;
            const parsed = visualProjectDocumentCodec.parse(new TextDecoder("utf-8", { fatal: true }).decode(file.bytes));
            if (parsed.ok) {
              const { metadata, projectKind } = parsed.document;
              projects.push({ path: file.projectPath, name: metadata.name, title: metadata.title, kind: projectKind, modifiedAt: metadata.updatedAt });
            }
          } catch { /* An unreadable manifest must not hide the other saved projects. */ }
        };
      }
      cursor.continue();
    };
  });
}

export async function activateBrowserProject(projectPath: string): Promise<void> {
  await readBrowserVisualProject(projectPath);
  await transaction<void>("readwrite", (_files, settings) => { settings.put(projectPath, "last-project"); });
}

/** Reads one coherent snapshot, including imported binaries, for the desktop archive. */
export async function getBrowserProjectFiles(projectPath: string): Promise<Map<string, Uint8Array>> {
  validateProjectPath(projectPath);
  return transaction("readonly", (files, _settings, result) => {
    const request = files.index("projectPath").getAll(projectPath);
    request.onsuccess = () => result(new Map((request.result as StoredFile[]).map((file) => [file.relativePath, file.bytes])));
  });
}

export async function readBrowserFile(projectPath: string, relativePath: string): Promise<Uint8Array> {
  validateProjectPath(projectPath);
  validateBrowserRelativePath(relativePath);
  return transaction("readonly", (files, _settings, result, fail) => {
    const request = files.get([projectPath, relativePath]);
    request.onsuccess = () => {
      const file = request.result as StoredFile | undefined;
      if (file) result(file.bytes);
      else fail(new Error(`プロジェクトのファイルが見つかりません: ${relativePath}`));
    };
  });
}

export async function readBrowserTextFile(projectPath: string, relativePath: string): Promise<string> {
  return new TextDecoder("utf-8", { fatal: true }).decode(await readBrowserFile(projectPath, relativePath));
}

export async function writeBrowserTextFile(projectPath: string, relativePath: string, content: string): Promise<void> {
  await writeBrowserFiles(projectPath, new Map([[relativePath, new TextEncoder().encode(content)]]));
}

async function writeBrowserFiles(projectPath: string, writes: ReadonlyMap<string, Uint8Array>): Promise<void> {
  validateProjectPath(projectPath);
  for (const path of writes.keys()) validateBrowserRelativePath(path);
  await transaction<void>("readwrite", (files, settings) => {
    for (const [relativePath, bytes] of writes) files.put({ projectPath, relativePath, bytes } satisfies StoredFile);
    settings.put(projectPath, "last-project");
  });
}

export async function readBrowserFileDataUrl(projectPath: string, relativePath: string): Promise<string> {
  const bytes = await readBrowserFile(projectPath, relativePath);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("素材を読み込めません。"));
    reader.onerror = () => reject(reader.error ?? new Error("素材を読み込めません。"));
    reader.readAsDataURL(new Blob([new Uint8Array(bytes).buffer], { type: fileMimeType(relativePath) }));
  });
}

function fileMimeType(path: string): string {
  const extension = path.toLowerCase().split(".").pop() ?? "";
  return ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", avif: "image/avif", svg: "image/svg+xml", glb: "model/gltf-binary", gltf: "model/gltf+json", vrm: "model/gltf-binary", json: "application/json", wav: "audio/wav", mp3: "audio/mpeg", ogg: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf", ktx2: "image/ktx2" } as Record<string, string>)[extension] ?? "application/octet-stream";
}

function decodeDataUrl(dataUrl: string): Uint8Array {
  const match = /^data:[^,]*;base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl);
  if (!match || match[1].length > Math.ceil(MAX_FILE_BYTES / 3) * 4) throw new Error("asset import payload size is invalid");
  const binary = atob(match[1]);
  if (binary.length > MAX_FILE_BYTES) throw new Error("asset import payload size is invalid");
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function writeBrowserBinaryFile(projectPath: string, relativePath: string, dataUrl: string): Promise<void> {
  await writeBrowserFiles(projectPath, new Map([[relativePath, decodeDataUrl(dataUrl)]]));
}

/** Matches desktop atomic import rules, including content-addressed no-overwrite semantics. */
export async function commitBrowserAssetImport(projectPath: string, transactionId: string, writes: VisualAssetImportWrite[]): Promise<void> {
  validateProjectPath(projectPath);
  if (!isValidAssetImportTransactionId(transactionId)) throw new Error("invalid asset import transaction id");
  if (!writes.length || writes.length > 512) throw new Error("asset import transaction has an invalid write count");
  const decoded = new Map<string, Uint8Array>();
  let total = 0;
  for (const write of writes) {
    const path = validateBrowserRelativePath(write.relativePath);
    if (!isValidAssetImportPath(path)) throw new Error("outside the managed Asset folders");
    if (decoded.has(path)) throw new Error("asset import transaction contains duplicate targets");
    const bytes = decodeDataUrl(write.dataUrl);
    if (!bytes.length) throw new Error("asset import payload size is invalid");
    total += bytes.length;
    if (total > MAX_TRANSACTION_BYTES) throw new Error("asset import transaction is too large");
    decoded.set(path, bytes);
  }
  await transaction<void>("readwrite", (files, settings, _result, fail) => {
    for (const [relativePath, bytes] of decoded) {
      const request = files.get([projectPath, relativePath]);
      request.onsuccess = () => {
        const previous = request.result as StoredFile | undefined;
        if (previous && (previous.bytes.length !== bytes.length || previous.bytes.some((byte, index) => byte !== bytes[index]))) {
          fail(new Error(`asset import target has different content: ${relativePath}`));
        } else if (!previous) files.add({ projectPath, relativePath, bytes } satisfies StoredFile);
      };
    }
    settings.put(projectPath, "last-project");
  });
}

export async function saveBrowserVisualProject(projectPath: string, request: VisualProjectWriteRequest): Promise<void> {
  validateProjectPath(projectPath);
  const { parseVisualProjectFiles } = await import("./visual-editor/persistence");
  const documents = parseVisualProjectFiles(request);
  const writes = new Map<string, Uint8Array>();
  const add = (relativePath: string, bytes: Uint8Array) => {
    validateBrowserRelativePath(relativePath);
    if (writes.has(relativePath)) throw new Error(`保存先が重複しています: ${relativePath}`);
    writes.set(relativePath, bytes);
  };
  for (const file of [
    { relativePath: PROJECT_MANIFEST, content: request.projectJson },
    { relativePath: documents.project.assetManifestPath, content: request.assetManifestJson },
    ...request.sceneDocuments, ...(request.prefabDocuments ?? []),
  ]) add(file.relativePath, new TextEncoder().encode(file.content));
  for (const file of request.binaryDocuments ?? []) add(file.relativePath, decodeDataUrl(file.dataUrl));
  await transaction<void>("readwrite", (files, settings, _result, fail) => {
    const previous = files.get([projectPath, PROJECT_MANIFEST]);
    previous.onsuccess = () => {
      try {
        if (previous.result) {
          const manifest = JSON.parse(new TextDecoder().decode((previous.result as StoredFile).bytes));
          if (manifest.projectId !== documents.project.projectId) throw new Error("保存中にプロジェクトIDを変更することはできません。");
        }
        for (const [relativePath, bytes] of writes) files.put({ projectPath, relativePath, bytes } satisfies StoredFile);
        settings.put(projectPath, "last-project");
      } catch (error) { fail(error instanceof Error ? error : new Error(String(error))); }
    };
  });
}

export async function readBrowserVisualProject(projectPath: string): Promise<VisualProjectFiles> {
  validateProjectPath(projectPath);
  const { visualProjectDocumentCodec, assetManifestCodec } = await import("./visual-editor/serialization");
  // Only document records are read; large models stay in IndexedDB until requested by the viewport.
  const result = await transaction<VisualProjectFiles>("readonly", (files, _settings, done, fail) => {
    const result: VisualProjectFiles = { projectJson: "", assetManifestJson: "", sceneDocuments: [], prefabDocuments: [] };
    done(result);
    const read = (relativePath: string, receive: (content: string) => void) => {
      validateBrowserRelativePath(relativePath);
      const request = files.get([projectPath, relativePath]);
      request.onsuccess = () => {
        try {
          if (!request.result) throw new Error(`プロジェクトのファイルが見つかりません: ${relativePath}`);
          receive(new TextDecoder("utf-8", { fatal: true }).decode((request.result as StoredFile).bytes));
        } catch (error) { fail(error instanceof Error ? error : new Error(String(error))); }
      };
    };
    read(PROJECT_MANIFEST, (content) => {
      result.projectJson = content;
      const project = visualProjectDocumentCodec.parse(content);
      if (!project.ok) throw new Error("プロジェクトの形式を確認できません。");
      for (const relativePath of Object.values(project.document.scenePaths)) read(relativePath, (content) => result.sceneDocuments.push({ relativePath, content }));
      read(project.document.assetManifestPath, (content) => {
        result.assetManifestJson = content;
        const assets = assetManifestCodec.parse(content);
        if (!assets.ok) throw new Error("Assetsの形式を確認できません。");
        for (const asset of Object.values(assets.document.assets)) {
          if (asset.kind === "template" && asset.templateType === "prefab" && "prefabPath" in asset && typeof asset.prefabPath === "string") {
            const relativePath = asset.prefabPath;
            read(relativePath, (content) => result.prefabDocuments.push({ relativePath, content }));
          }
        }
      });
    });
  });
  const { parseVisualProjectFiles } = await import("./visual-editor/persistence");
  parseVisualProjectFiles(result);
  return result;
}

export async function listBrowserFiles(projectPath: string, relativePath: string): Promise<FsEntry[]> {
  validateProjectPath(projectPath);
  if (relativePath && relativePath !== ".") validateBrowserRelativePath(relativePath);
  const prefix = relativePath && relativePath !== "." ? `${relativePath}/` : "";
  return transaction("readonly", (files, _settings, done) => {
    const entries = new Map<string, FsEntry>();
    const request = files.index("projectPath").openCursor(projectPath);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) { done([...entries.values()].sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name))); return; }
      const file = cursor.value as StoredFile;
      if (file.relativePath.startsWith(prefix)) {
        const parts = file.relativePath.slice(prefix.length).split("/");
        entries.set(parts[0], { name: parts[0], rel: `${prefix}${parts[0]}`, isDir: parts.length > 1, size: parts.length > 1 ? null : file.bytes.length });
      }
      cursor.continue();
    };
  });
}

export async function deleteBrowserPath(projectPath: string, relativePath: string): Promise<void> {
  validateProjectPath(projectPath);
  validateBrowserRelativePath(relativePath);
  await transaction<void>("readwrite", (files) => {
    files.delete([projectPath, relativePath]);
    // Bound the descendant keys by the character immediately after "/".
    // Cleanup must not clone every imported model/texture just to inspect paths.
    const request = files.openKeyCursor(IDBKeyRange.bound(
      [projectPath, `${relativePath}/`],
      [projectPath, `${relativePath}0`],
      false,
      true,
    ));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      files.delete(cursor.primaryKey);
      cursor.continue();
    };
  });
}
