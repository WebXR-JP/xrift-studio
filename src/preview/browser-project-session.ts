import type { VisualProjectDocuments } from "../lib/visual-editor/persistence";
import type { PrototypeVisualProject } from "../lib/visual-editor/prototype-project";

type Archive = { blob: Blob; fileName: string; fileCount: number };
type SessionBackend = {
  acquire: (path: string) => Promise<() => void>;
  read: (path: string) => Promise<VisualProjectDocuments>;
  save: (path: string, documents: VisualProjectDocuments) => Promise<void>;
  files: (path: string) => Promise<Map<string, Uint8Array>>;
  archive: (documents: VisualProjectDocuments, files: Map<string, Uint8Array>) => Promise<Archive>;
};

/** A lease is held for the editor lifetime, including suspended Safari tabs. */
export async function acquireBrowserProjectLease(path: string): Promise<() => void> {
  if (!navigator.locks) {
    throw new Error("このブラウザでは安全に編集を開始できません。Safariなどのブラウザを最新版に更新してください。");
  }
  return new Promise((resolve, reject) => {
    void navigator.locks.request(`xrift-studio:${path}`, { mode: "exclusive", ifAvailable: true }, (lock) => {
      if (!lock) {
        reject(new Error("このプロジェクトは別のタブで編集中です。そちらで紹介ページへ戻るかタブを閉じてから、もう一度開いてください。"));
        return;
      }
      return new Promise<void>((release) => resolve(release));
    }).catch(reject);
  });
}

const browserBackend: SessionBackend = {
  acquire: acquireBrowserProjectLease,
  read: async (path) => (await import("../lib/visual-editor/persistence")).readVisualProjectFromDisk(path),
  save: async (path, documents) => (await import("../lib/visual-editor/persistence")).saveVisualProjectToDisk(path, documents),
  files: async (path) => (await import("../lib/browser-project-storage")).getBrowserProjectFiles(path),
  archive: async (documents, files) => (await import("../lib/visual-editor/browser-project-transfer")).createBrowserProjectArchive(documents, files),
};

export type BrowserProjectSession = Awaited<ReturnType<typeof openBrowserProjectSession>>;

/** Read after acquiring ownership; serialize autosave and export as one queue. */
export async function openBrowserProjectSession(path: string, backend: SessionBackend = browserBackend) {
  const release = await backend.acquire(path);
  let documents: VisualProjectDocuments;
  try { documents = await backend.read(path); }
  catch (error) { release(); throw error; }
  const initialBundle: PrototypeVisualProject = {
    project: documents.project,
    scene: documents.scenes[documents.project.entrySceneId],
    assets: documents.assets,
    prefabs: documents.prefabs,
  };
  let closed = false;
  let pending: Promise<unknown> = Promise.resolve();
  let closing: Promise<void> | undefined;
  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    if (closed) return Promise.reject(new Error("プロジェクトは閉じられています。現在のプロジェクトから操作し直してください。"));
    const result = pending.then(operation);
    // Failure is reported to its caller, but does not poison the next save.
    pending = result.catch(() => {});
    return result;
  };
  const save = async (bundle: PrototypeVisualProject) => {
    if (bundle.project.projectId !== documents.project.projectId) {
      throw new Error("保存するプロジェクトが一致しません。現在のプロジェクトを開き直してください。");
    }
    const next = {
      ...documents,
      project: bundle.project,
      scenes: { ...documents.scenes, [bundle.scene.sceneId]: bundle.scene },
      assets: bundle.assets,
      prefabs: bundle.prefabs,
    };
    await backend.save(path, next);
    documents = next;
  };
  return {
    path,
    initialBundle,
    save: (bundle: PrototypeVisualProject) => enqueue(async () => { await save(bundle); return path; }),
    export: (bundle: PrototypeVisualProject) => enqueue(async () => {
      await save(bundle);
      return backend.archive(documents, await backend.files(path));
    }),
    close: () => {
      closed = true;
      // Already accepted writes finish before a second tab may read the project.
      closing ??= pending.then(() => release());
      return closing;
    },
  };
}
