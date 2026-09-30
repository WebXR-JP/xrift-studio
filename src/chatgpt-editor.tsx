import React, { lazy, Suspense, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { App, applyDocumentTheme, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps';
import { OpenAIExtensions } from '@openai/mcp-extensions/app';
import { VisualEditorErrorBoundary } from './components/visual-editor/VisualEditorErrorBoundary';
import type { VisualEditorMcpProjectBridge } from './components/visual-editor/VisualEditorPrototype';
import type { PrototypeVisualProject } from './lib/visual-editor/prototype-project';
import { validateBundle, bundleHash } from './lib/visual-editor/chatgpt-project';
import type { VisualProjectDocuments } from './lib/visual-editor/persistence';
import { serializeVisualProjectDocuments } from './lib/visual-editor/persistence';
import { createBrowserProject, getBrowserProjectFiles, listBrowserProjects, saveBrowserVisualProject, type BrowserStoredProject } from './lib/browser-project-storage';
import { browserProjectDocumentFiles, parseBrowserProjectFiles, readBrowserProjectArchive, createBrowserProjectArchive } from './lib/visual-editor/browser-project-transfer';
import './index.css';
import './preview.css';
const Editor = lazy(() => import('./components/visual-editor/VisualEditorPrototype').then(m => ({ default: m.VisualEditorPrototype })));
const app = new App({ name: 'XRift Studio', version: '0.1.1' });
new OpenAIExtensions(app);
type Result = { bundle: PrototypeVisualProject; revision: number; baseHash: string | null };
type Local = { path: string; documents: VisualProjectDocuments; revision: number };
async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await app.callServerTool({ name, arguments: args });
  if (result.isError) throw new Error(result.content?.find(c => c.type === 'text')?.text ?? '操作に失敗しました');
  return result.structuredContent as Record<string, unknown>;
}
function bundleFrom(documents: VisualProjectDocuments): PrototypeVisualProject {
  return { project: documents.project, scene: documents.scenes[documents.project.entrySceneId], assets: documents.assets, prefabs: documents.prefabs };
}
function Application() {
  const [projects, setProjects] = useState<BrowserStoredProject[]>([]);
  const [local, setLocal] = useState<Local | null>(null);
  const current = useRef<Local | null>(null);
  const [generation, setGeneration] = useState(0);
  const received = useRef<Promise<unknown>>(Promise.resolve());
  const [pending, setPending] = useState<Result | null>(null);
  const latestResult = useRef<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [notice, setNotice] = useState('ChatGPTに接続しています…');
  const [name, setName] = useState('');
  const operation = useRef(false);
  const bridge = useRef<VisualEditorMcpProjectBridge | null>(null);
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  function select(next: Local) { current.current = next; setLocal(next); setGeneration(value => value + 1); bridge.current = null; }
  async function context(next: Local, bundle = bundleFrom(next.documents)) {
    await app.updateModelContext({ content: [{ type: 'text', text: `編集対象: ${bundle.project.metadata.name}。このbundleとrevisionをedit_worldに渡してください。素材のバイト列は含みません。` }], structuredContent: { bundle: validateBundle(bundle), revision: next.revision } });
  }
  async function adopt(result: Result) {
    const b = validateBundle(result.bundle);
    const existing = current.current;
    if (existing && b.project.projectId === existing.documents.project.projectId) {
      const documents = { ...existing.documents, project: b.project, assets: b.assets, prefabs: b.prefabs, scenes: { ...existing.documents.scenes, [b.scene.sceneId]: b.scene } };
      const files = await getBrowserProjectFiles(existing.path);
      for (const [path, bytes] of browserProjectDocumentFiles(documents)) files.set(path, bytes);
      // Validate source references before replacing anything; keep every other scene and source file.
      parseBrowserProjectFiles(files);
      await saveBrowserVisualProject(existing.path, serializeVisualProjectDocuments(documents));
      select({ path: existing.path, documents, revision: result.revision });
    } else {
      const documents = { project: b.project, assets: b.assets, prefabs: b.prefabs, scenes: { [b.scene.sceneId]: b.scene } };
      const files = browserProjectDocumentFiles(documents);
      parseBrowserProjectFiles(files);
      select({ path: await createBrowserProject(files, { activate: false }), documents, revision: result.revision });
    }
    latestResult.current = null; setPending(null);
    setNotice('AIの結果を開きました。作品はこのブラウザに保存されます。');
  }
  async function accept(data: Record<string, unknown>) {
    if (!data.bundle) return;
    if (!Number.isSafeInteger(data.revision) || (data.revision as number) < 0 || !(data.baseHash === null || typeof data.baseHash === 'string')) throw new Error('AIの結果が不正です');
    const result: Result = { bundle: validateBundle(data.bundle), revision: data.revision as number, baseHash: data.baseHash as string | null };
    latestResult.current = result;
    if (current.current || operation.current) {
      setPending(result); setNotice('AIの編集結果があります。「AIの結果を開く」で確認できます。');
    } else await adopt(result);
  }
  async function run(action: () => Promise<void>) {
    if (operation.current || !connected) return;
    operation.current = true; setBusy(true);
    try { await writes.current; await action(); }
    catch (error) { setNotice(error instanceof Error ? error.message : '操作に失敗しました'); }
    finally { operation.current = false; setBusy(false); }
  }
  const setup = useRef(false);
  React.useEffect(() => {
    if (setup.current) return; setup.current = true;
    app.ontoolresult = result => {
      if (result.isError) { setNotice(result.content?.find(c => c.type === 'text')?.text ?? '接続に失敗しました'); return; }
      received.current = received.current.then(() => accept((result.structuredContent ?? {}) as Record<string, unknown>)).catch((e: Error) => setNotice(e.message));
    };
    const theme = () => { const host = app.getHostContext(); if (host?.theme) applyDocumentTheme(host.theme); if (host?.styles?.variables) applyHostStyleVariables(host.styles.variables); };
    app.addEventListener('hostcontextchanged', theme);
    void app.connect().then(async () => {
      setConnected(true); theme(); setProjects(await listBrowserProjects());
      setNotice('会話でワールドの制作を頼むか、作品ファイルを取り込んでください。');
      const host = app.getHostContext();
      if (host?.availableDisplayModes?.includes('fullscreen') && host.displayMode !== 'fullscreen') await app.requestDisplayMode({ mode: 'fullscreen' });
    }).catch((e: Error) => setNotice(e.message));
  }, []);
  async function save(bundle: PrototypeVisualProject) {
    const snapshot = current.current;
    if (!snapshot) throw new Error('編集対象がありません');
    const task = writes.current.then(async () => {
      const latest = current.current;
      if (!latest || latest.path !== snapshot.path) throw new Error('編集対象が切り替わりました');
      const documents = { ...latest.documents, project: bundle.project, scenes: { ...latest.documents.scenes, [bundle.scene.sceneId]: bundle.scene }, assets: bundle.assets, prefabs: bundle.prefabs };
      await saveBrowserVisualProject(latest.path, serializeVisualProjectDocuments(documents));
      current.current = { ...latest, documents, revision: latest.revision + 1 };
      // Model context is opt-in via the toolbar; local saves do not send documents to the server.
    });
    writes.current = task.catch(() => {}); await task; return snapshot.path;
  }
  async function download(bundle?: PrototypeVisualProject) {
    const next = current.current; if (!next) return;
    const documents = bundle ? { ...next.documents, project: bundle.project, assets: bundle.assets, prefabs: bundle.prefabs, scenes: { ...next.documents.scenes, [bundle.scene.sceneId]: bundle.scene } } : next.documents;
    const archive = await createBrowserProjectArchive(documents, await getBrowserProjectFiles(next.path));
    const url = URL.createObjectURL(archive.blob); const link = document.createElement('a'); link.href = url; link.download = archive.fileName; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function back() {
    if (bridge.current && !(await bridge.current.saveNow())) throw new Error('保存できませんでした。作品を書き出してください');
    await writes.current; current.current = null; bridge.current = null; setLocal(null); setProjects(await listBrowserProjects());
  }
  const toolbar = <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white p-3 text-sm text-zinc-900">
    {pending && <button disabled={busy || !connected} onClick={() => void run(async () => {
      const result = latestResult.current; if (!result) return;
      const editing = bridge.current?.currentBundle() ?? (current.current ? bundleFrom(current.current.documents) : null);
      const differs = editing && (editing.project.projectId !== result.bundle.project.projectId || !result.baseHash || await bundleHash(editing) !== result.baseHash);
      if (differs && !window.confirm('手元の編集とAIの結果が異なります。手元の編集を保存してからAIの結果を開きます。同じ作品の場合、現在のSceneはAIの結果に置き換わります。必要なら先に書き出してください。')) return;
      if (bridge.current && !(await bridge.current.saveNow())) throw new Error('保存できませんでした。作品を書き出してから再試行してください');
      await writes.current; await adopt(result);
    })}>AIの結果を開く</button>}
    {local && <button disabled={busy || !connected} onClick={() => void run(() => download(bridge.current?.currentBundle()))}>作品を書き出す</button>}
    {local && <button disabled={busy || !connected} onClick={() => void run(async () => {
      if (bridge.current && !(await bridge.current.saveNow())) throw new Error('保存できませんでした');
      await writes.current; const next = current.current; if (!next) return;
      await context(next, bridge.current?.currentBundle()); setNotice('編集データを会話に渡しました。変更内容を入力してください。');
    })}>会話に編集対象を渡す</button>}
    <span role="status" aria-live="polite">{busy ? '処理しています…' : notice}</span>
  </div>;
  if (local) {
    const d = local.documents;
    return <div className="flex h-[100dvh] flex-col">{toolbar}<div className="relative min-h-0 flex-1"><VisualEditorErrorBoundary key={local.path + ':' + generation} featureName="ビジュアルエディター" onBack={() => void run(back)}><Suspense fallback={<p>エディターを準備しています…</p>}><Editor key={local.path + ':' + generation} projectKind={d.project.projectKind} projectName={d.project.metadata.name} projectPath={local.path} initialBundle={bundleFrom(d)} onSave={save} onRegisterMcpProjectBridge={value => { bridge.current = value; }} onProjectExport={download} backLabel="プロジェクト" onBack={() => void run(back)} /></Suspense></VisualEditorErrorBoundary></div></div>;
  }
  return <main className="min-h-[100dvh] bg-zinc-50 text-zinc-900">{toolbar}<div className="mx-auto max-w-4xl p-5"><h1 className="mb-5 text-2xl font-semibold">XRift Studio</h1><p className="mb-4">作品はこのブラウザに保存します。別の端末へ移すときは作品を書き出してください。</p><form className="mb-4 flex flex-wrap gap-3" onSubmit={event => { event.preventDefault(); void run(async () => { await adopt(await call('create_world', { name }) as unknown as Result); }); }}><input className="rounded border p-3" required maxLength={80} value={name} onChange={event => setName(event.target.value)} aria-label="ワールド名" placeholder="ワールド名"/><button disabled={busy || !connected} className="rounded bg-zinc-900 px-4 py-3 text-white">新しく作る</button></form><label className="mb-6 block">プロジェクトを取り込む（.xriftstudio / ZIP）<input className="mt-2 block max-w-full" type="file" accept=".xriftstudio,.zip" disabled={busy || !connected} onChange={event => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    void run(async () => {
      const imported = await readBrowserProjectArchive(file);
      select({ path: await createBrowserProject(imported.files, { activate: false }), documents: imported.documents, revision: 0 });
      setNotice('取り込みました。AIで編集するときは「会話に編集対象を渡す」を押してください。');
    });
  }}/></label><div className="grid gap-3 sm:grid-cols-2">{projects.map(project => <button className="rounded-xl border bg-white p-5 text-left" disabled={busy || !connected} key={project.path} onClick={() => void run(async () => { const documents = parseBrowserProjectFiles(await getBrowserProjectFiles(project.path)); select({ path: project.path, documents, revision: 0 }); setNotice('ブラウザに保存した作品を開きました。'); })}>{project.name}</button>)}</div></div></main>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<Application />);
