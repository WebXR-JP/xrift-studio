import { listBrowserProjects, type BrowserStoredProject } from './browser-project-storage';

export function validateStudioProjectId(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/.test(value)) throw new Error('プロジェクトIDが不正です。作品一覧から開いてください。');
  return value;
}

/** The same route is understood by static hosting and the ChatGPT deep-link adapter. */
export function studioProjectRoute(projectId: string): string {
  return `/editor/${encodeURIComponent(validateStudioProjectId(projectId))}`;
}

export function studioProjectIdFromUrl(value: string): string | null {
  const url = new URL(value, 'https://studio.invalid');
  const query = url.searchParams.get('project');
  const route = url.hash.startsWith('#/editor/') ? url.hash.slice(1) : url.pathname;
  const match = route.match(/\/editor\/([^/]+)\/?$/);
  if (query !== null) return validateStudioProjectId(query);
  if (!match) return null;
  return validateStudioProjectId(decodeURIComponent(match[1]));
}

/** editor.html stays directly addressable on GitHub Pages without a rewrite rule. */
export function browserProjectEditorUrl(projectId: string | null, baseUrl: string): string {
  const url = new URL(baseUrl);
  url.pathname = url.pathname.replace(/\/editor\/[^/]+\/?$/, '/editor.html');
  if (!url.pathname.endsWith('/chatgpt.html')) url.pathname = url.pathname.replace(/[^/]*$/, 'editor.html');
  url.searchParams.delete('kind');
  url.searchParams.delete('project');
  url.hash = '';
  if (projectId) url.searchParams.set('project', validateStudioProjectId(projectId));
  return url.href;
}

export function findStudioProject(projectId: string, projects: readonly BrowserStoredProject[]): BrowserStoredProject {
  validateStudioProjectId(projectId);
  const matches = projects.filter(project => project.projectId === projectId);
  if (!matches.length) throw new Error('このプロジェクトがこのブラウザに見つかりません。作品一覧から開くか、.xriftstudioファイルを取り込んでください。');
  if (matches.length > 1) throw new Error('同じプロジェクトIDの作品が複数保存されています。作品一覧から対象を選んでください。');
  return matches[0];
}

export async function resolveStudioProject(projectId: string): Promise<BrowserStoredProject> {
  return findStudioProject(projectId, await listBrowserProjects());
}

/** Importing a copy must not make an existing project's direct URL ambiguous. */
export async function prepareStudioProjectImport(files: ReadonlyMap<string, Uint8Array>): Promise<Map<string, Uint8Array>> {
  const { parseBrowserProjectFiles, browserProjectDocumentFiles } = await import('./visual-editor/browser-project-transfer');
  const documents = parseBrowserProjectFiles(files);
  const copy = new Map(files);
  if ((await listBrowserProjects()).some(project => project.projectId === documents.project.projectId)) {
    documents.project = { ...documents.project, projectId: `project-${crypto.randomUUID()}` };
    for (const [path, bytes] of browserProjectDocumentFiles(documents)) copy.set(path, bytes);
  }
  return copy;
}
