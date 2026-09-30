import React, { lazy, Suspense, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { App, applyDocumentTheme, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps';
import { OpenAIExtensions } from '@openai/mcp-extensions/app';
import { VisualEditorErrorBoundary } from './components/visual-editor/VisualEditorErrorBoundary';
import type { VisualEditorMcpProjectBridge } from './components/visual-editor/VisualEditorPrototype';
import type { PrototypeVisualProject } from './lib/visual-editor/prototype-project';
import type { VisualProjectDocuments } from './lib/visual-editor/persistence';
import { createBrowserProject, getBrowserProjectFiles, deleteBrowserProject } from './lib/browser-project-storage';
import './index.css';
import './preview.css';
const Editor = lazy(() => import('./components/visual-editor/VisualEditorPrototype').then((m) => ({ default: m.VisualEditorPrototype })));
const app = new App({ name: 'XRift Studio', version: '0.1.0' });
new OpenAIExtensions(app);
type World = { id: string; name: string; revision: number };
type Session = { id: string; revision: number; state: { documents: VisualProjectDocuments; files: Record<string, string> } };
function bytes(base64: string) { return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)); }
function base64(data: Uint8Array) {
  let text = '';
  for (let i = 0; i < data.length; i += 32768) text += String.fromCharCode(...data.subarray(i, i + 32768));
  return btoa(text);
}
async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await app.callServerTool({ name, arguments: args });
  if (result.isError) throw new Error(result.content?.find((c) => c.type === 'text')?.text ?? '操作に失敗しました');
  return result.structuredContent as Record<string, unknown>;
}
function Application() {
  const [worlds, setWorlds] = useState<World[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [projectPath, setProjectPath] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [notice, setNotice] = useState('ChatGPTに接続しています…');
  const [name, setName] = useState('');
  const revision = useRef(0);
  const operation = useRef(false);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const conflict = useRef(false);
  const bridge = useRef<VisualEditorMcpProjectBridge | null>(null);
  const path = useRef<string | undefined>(undefined);
  async function adopt(next: Session) {
    // Never remount the editor on an unsolicited model tool result: unsaved edits must survive.
    const local = await createBrowserProject(new Map(Object.entries(next.state.files).map(([name, data]) => [name, bytes(data)])), { activate: false });
    const previous = path.current;
    path.current = local; revision.current = next.revision; conflict.current = false;
    setProjectPath(local); setSession(next);
    if (previous) await deleteBrowserProject(previous);
    setNotice('編集内容を会話で伝えられます。最新のAI編集は「読み直す」で表示します。');
  }
  async function accept(data: Record<string, unknown>) {
    if (Array.isArray(data.worlds)) setWorlds(data.worlds as World[]);
    else if (data.state && typeof data.id === 'string' && typeof data.revision === 'number') {
      if (path.current) { setNotice('AIの編集結果があります。保存後に「読み直す」で確認してください。'); return; }
      await adopt(data as unknown as Session);
    }
  }
  async function run(action: () => Promise<void>) {
    if (operation.current || !connected) return;
    operation.current = true; setBusy(true);
    try { await saveQueue.current; await action(); }
    catch (error) { setNotice(error instanceof Error ? error.message : '操作に失敗しました'); }
    finally { operation.current = false; setBusy(false); }
  }
  const setup = useRef(false);
  React.useEffect(() => {
    if (setup.current) return; setup.current = true;
    app.ontoolresult = (result) => {
      if (result.isError) { setNotice(result.content?.find((c) => c.type === 'text')?.text ?? '接続に失敗しました'); return; }
      void accept((result.structuredContent ?? {}) as Record<string, unknown>).catch((e: Error) => setNotice(e.message));
    };
    const theme = () => {
      const context = app.getHostContext();
      if (context?.theme) applyDocumentTheme(context.theme);
      if (context?.styles?.variables) applyHostStyleVariables(context.styles.variables);
    };
    app.addEventListener('hostcontextchanged', theme);
    void app.connect().then(async () => {
      setConnected(true); theme();
      setNotice('ワールドを選ぶか、プロジェクトファイルを取り込んでください。');
      const host = app.getHostContext();
      if (host?.availableDisplayModes?.includes('fullscreen') && host.displayMode !== 'fullscreen') await app.requestDisplayMode({ mode: 'fullscreen' });
    }).catch((e: Error) => setNotice(e.message));
  }, []);
  async function save(bundle: PrototypeVisualProject) {
    if (!session || !path.current) throw new Error('編集対象がありません');
    const id = session.id; const local = path.current;
    const task = saveQueue.current.then(async () => {
      if (conflict.current) throw new Error('別の編集が保存されています。書き出してから読み直してください');
      const { serializeVisualProjectDocuments } = await import('./lib/visual-editor/persistence');
      const { saveBrowserVisualProject } = await import('./lib/browser-project-storage');
      const documents = { ...session.state.documents, project: bundle.project, scenes: { ...session.state.documents.scenes, [bundle.scene.sceneId]: bundle.scene }, assets: bundle.assets, prefabs: bundle.prefabs };
      await saveBrowserVisualProject(local, serializeVisualProjectDocuments(documents));
      const files = await getBrowserProjectFiles(local);
      try {
        const result = await call('save_world', { id, expectedRevision: revision.current, bundle, files: Object.fromEntries([...files].map(([name, data]) => [name, base64(data)])) });
        revision.current = result.revision as number;
      } catch (error) {
        if (error instanceof Error && error.message.includes('STALE_REVISION')) conflict.current = true;
        throw error;
      }
    });
    saveQueue.current = task.catch(() => {});
    await task;
    return local;
  }
  async function download(bundle?: PrototypeVisualProject) {
    if (!session || !path.current) return;
    // Export current local editor state even when a cloud save conflicts.
    const files = await getBrowserProjectFiles(path.current);
    const documents = bundle ? { ...session.state.documents, project: bundle.project, scenes: { ...session.state.documents.scenes, [bundle.scene.sceneId]: bundle.scene }, assets: bundle.assets, prefabs: bundle.prefabs } : session.state.documents;
    const { createBrowserProjectArchive } = await import('./lib/visual-editor/browser-project-transfer');
    const archive = await createBrowserProjectArchive(documents, files);
    const url = URL.createObjectURL(archive.blob); const link = document.createElement('a');
    link.href = url; link.download = archive.fileName; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  const toolbar = <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white p-3 text-sm text-zinc-900">
    <button disabled={busy || !connected} onClick={() => void run(async () => {
      if (session) {
        if (conflict.current) {
          if (!window.confirm('手元の編集を閉じて、クラウドの最新版を開きます。必要な編集は先に書き出してください。')) return;
        } else if (bridge.current && !(await bridge.current.saveNow())) { throw new Error('保存できませんでした。手元の編集を書き出してから読み直してください'); }
        await adopt(await call('read_world', { id: session.id }) as unknown as Session);
      }
      else await accept(await call('list_worlds'));
    })}>読み直す</button>
    {session && <button disabled={busy} onClick={() => void run(() => download(bridge.current?.currentBundle()))}>手元の編集を書き出す</button>}
    {session && <button disabled={busy} onClick={() => void run(async () => {
      const context = await call('get_world_context', { id: session.id });
      await app.updateModelContext({ content: [{ type: 'text', text: `編集するXRift Studioのワールド: ${session.state.documents.project.metadata.name}` }], structuredContent: context });
      setNotice('編集対象を会話に渡しました。変更したい内容を入力してください。');
    })}>会話に編集対象を渡す</button>}
    <span role="status" aria-live="polite">{busy ? '処理しています…' : notice}</span>
  </div>;
  if (session && projectPath) {
    const d = session.state.documents;
    const initialBundle = { project: d.project, scene: d.scenes[d.project.entrySceneId], assets: d.assets, prefabs: d.prefabs };
    return <div className="flex h-[100dvh] flex-col">{toolbar}<div className="relative min-h-0 flex-1"><VisualEditorErrorBoundary key={projectPath} featureName="ビジュアルエディター" onBack={() => { setSession(null); }}><Suspense fallback={<p>エディターを準備しています…</p>}><Editor key={projectPath} projectKind={d.project.projectKind} projectName={d.project.metadata.name} projectPath={projectPath} initialBundle={initialBundle} onSave={save} onRegisterMcpProjectBridge={(value) => { bridge.current = value; }} onProjectExport={download} backLabel="プロジェクト" onBack={() => void run(async () => {
      setSession(null); setProjectPath(undefined); const previous = path.current; path.current = undefined;
      if (previous) await deleteBrowserProject(previous);
      await accept(await call('list_worlds'));
    })} /></Suspense></VisualEditorErrorBoundary></div></div>;
  }
  return <main className="min-h-[100dvh] bg-zinc-50 text-zinc-900">{toolbar}<div className="mx-auto max-w-4xl p-5"><h1 className="mb-5 text-2xl font-semibold">XRift Studio</h1><form className="mb-4 flex flex-wrap gap-3" onSubmit={(e) => { e.preventDefault(); void run(async () => { await adopt(await call('create_world', { name }) as unknown as Session); }); }}><input className="rounded border p-3" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} aria-label="ワールド名" placeholder="ワールド名"/><button disabled={busy || !connected} className="rounded bg-zinc-900 px-4 py-3 text-white">新しく作る</button></form><label className="mb-6 block">プロジェクトを取り込む（.xriftstudio / ZIP、8 MBまで）<input className="mt-2 block max-w-full" type="file" accept=".xriftstudio,.zip" disabled={busy || !connected} onChange={(event) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    void run(async () => { if (file.size > 8 * 1024 * 1024) throw new Error('8 MB以内のプロジェクトを選んでください'); await adopt(await call('import_project', { name: file.name, base64: base64(new Uint8Array(await file.arrayBuffer())) }) as unknown as Session); });
  }}/></label><div className="grid gap-3 sm:grid-cols-2">{worlds.map((world) => <button className="rounded-xl border bg-white p-5 text-left" disabled={busy || !connected} key={world.id} onClick={() => void run(async () => { await adopt(await call('read_world', { id: world.id }) as unknown as Session); })}>{world.name}</button>)}</div></div></main>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<Application />);
