import type { PrototypeVisualProject } from './visual-editor/prototype-project';
import type { VisualProjectDocuments } from './visual-editor/persistence';
import { openBrowserProjectSession } from '../preview/browser-project-session';

/** Save a Studio document without mounting the Editor. Source bytes remain local. */
export async function saveBrowserStudioProject(input: PrototypeVisualProject): Promise<string> {
  // The ordinary editor may exceed the conversation transport's 1 MB limit.
  // Both backends validate the actual document files when saving/opening them.
  const bundle = input;
  const [storage, transfer] = await Promise.all([import('./browser-project-storage'), import('./visual-editor/browser-project-transfer')]);
  const matches = (await storage.listBrowserProjects()).filter(project => project.projectId === bundle.project.projectId);
  if (matches.length > 1) throw new Error('同じプロジェクトIDの作品が複数あります。作品一覧から対象を開いてください。');
  if (!matches.length) {
    const documents: VisualProjectDocuments = { project: bundle.project, scenes: { [bundle.scene.sceneId]: bundle.scene }, assets: bundle.assets, prefabs: bundle.prefabs };
    return storage.createBrowserProject(transfer.browserProjectDocumentFiles(documents), { activate: false });
  }
  // The normal browser editor and ChatGPT use the same lease, serializer and
  // save queue. An open editor's owner must save through its existing session.
  const session = await openBrowserProjectSession(matches[0].path);
  try { await session.save(bundle); return session.path; }
  finally { await session.close(); }
}
