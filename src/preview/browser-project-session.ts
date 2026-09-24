import type { VisualProjectDocuments } from "../lib/visual-editor/persistence";
import type { PrototypeVisualProject } from "../lib/visual-editor/prototype-project";
import type { VisualPublicationRecord } from "../lib/visual-editor/project-document";
import type { XriftUploadResult } from "../lib/visual-editor/publish";
import { latestBrowserPublication } from "../lib/browser-project-storage";

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
  let latestPublication = documents.project.lastPublication;
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
    if (bundle.project.projectKind !== documents.project.projectKind) {
      throw new Error("保存するプロジェクトの種類が一致しません。現在のプロジェクトを開き直してください。");
    }
    const currentPublication = latestBrowserPublication(
      documents.project.projectKind,
      documents.project.lastPublication,
      latestPublication,
    );
    const lastPublication = latestBrowserPublication(
      documents.project.projectKind,
      currentPublication,
      bundle.project.lastPublication,
    );
    // A remote result is authoritative even if its manifest write failed once.
    latestPublication = lastPublication;
    const updatedAt = Date.parse(documents.project.metadata.updatedAt) > Date.parse(bundle.project.metadata.updatedAt)
      ? documents.project.metadata.updatedAt
      : bundle.project.metadata.updatedAt;
    const next = {
      ...documents,
      project: {
        ...bundle.project,
        metadata: { ...bundle.project.metadata, updatedAt },
        lastPublication,
      },
      scenes: { ...documents.scenes, [bundle.scene.sceneId]: bundle.scene },
      assets: bundle.assets,
      prefabs: bundle.prefabs,
    };
    await backend.save(path, next);
    documents = next;
  };
  const recordPublication = (bundle: PrototypeVisualProject, result: XriftUploadResult) => enqueue(async (): Promise<PrototypeVisualProject> => {
    if (bundle.project.projectId !== documents.project.projectId || bundle.project.projectKind !== documents.project.projectKind) {
      throw new Error("公開するプロジェクトが一致しません。現在のプロジェクトを開き直してください。");
    }
    if (documents.project.projectKind !== "world" || result.itemId) {
      throw new Error("この公開結果はワールドのプロジェクトへ保存できません。");
    }
    const worldId = (result.worldId ?? result.contentId)?.trim();
    if (!worldId) throw new Error("XRiftからワールドIDを取得できませんでした。公開結果を確認してください。");
    const publication: VisualPublicationRecord = {
      ...result,
      worldId,
      contentId: result.contentId?.trim() ?? worldId,
      uploadedAt: result.uploadedAt ?? new Date().toISOString(),
    };
    if (!Number.isFinite(Date.parse(publication.uploadedAt))) {
      throw new Error("XRiftから受け取った公開日時を確認できませんでした。");
    }
    const known = latestBrowserPublication("world", documents.project.lastPublication, latestPublication);
    const lastPublication = latestBrowserPublication("world", known, publication);
    if (!lastPublication) throw new Error("公開結果を保存できませんでした。もう一度保存してください。");
    // Keep the result in memory before writing. A later Save can retry storing
    // the successful remote target without issuing another upload.
    latestPublication = lastPublication;
    const updatedAt = Date.parse(documents.project.metadata.updatedAt) >= Date.parse(lastPublication.uploadedAt)
      ? documents.project.metadata.updatedAt
      : lastPublication.uploadedAt;
    const next: VisualProjectDocuments = {
      ...documents,
      project: {
        ...documents.project,
        metadata: { ...documents.project.metadata, updatedAt },
        lastPublication,
      },
    };
    await backend.save(path, next);
    documents = next;
    return {
      project: next.project,
      scene: next.scenes[next.project.entrySceneId],
      assets: next.assets,
      prefabs: next.prefabs,
    };
  });
  return {
    path,
    initialBundle,
    save: (bundle: PrototypeVisualProject) => enqueue(async () => { await save(bundle); return path; }),
    recordPublication,
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
