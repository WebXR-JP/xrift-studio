import React, { useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { App, applyDocumentTheme, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps';
import { OpenAIExtensions } from '@openai/mcp-extensions/app';
import BrowserEditorApp, { type BrowserStudioApi } from './BrowserEditorApp';
import { callTool } from '../packages/xrift-studio-cloud/worker';
import type { VisualEditorMcpProjectBridge } from './components/visual-editor/VisualEditorPrototype';
import type { PrototypeVisualProject } from './lib/visual-editor/prototype-project';
import { validateBundle, bundleHash } from './lib/visual-editor/chatgpt-project';
import type { VisualProjectDocuments } from './lib/visual-editor/persistence';
import { createBrowserProject, getBrowserProjectFiles, readStudioRecovery, writeStudioRecovery } from './lib/browser-project-storage';
import { parseStudioResult, verifyStudioResult, addReceipt, emptyRecovery, type StudioResult, type StudioRecovery, type StudioReceipt } from './lib/visual-editor/chatgpt-delivery';
import { browserProjectDocumentFiles, parseBrowserProjectFiles } from './lib/visual-editor/browser-project-transfer';
import { studioLaunchFromUrl, validateStudioProjectId } from './lib/browser-project-routing';
import './index.css';
import './preview.css';
const app = new App({ name: 'XRift Studio', version: '0.1.3' });
const extensions = new OpenAIExtensions(app);
type Result = StudioResult;
type Local = { path: string; documents: VisualProjectDocuments; revision: number };
function bundleFrom(documents: VisualProjectDocuments): PrototypeVisualProject {
  return { project: documents.project, scene: documents.scenes[documents.project.entrySceneId], assets: documents.assets, prefabs: documents.prefabs };
}
function Application() {
  const [local, setLocal] = useState<Local | null>(null);
  const current = useRef<Local | null>(null);
  const received = useRef<Promise<unknown>>(Promise.resolve());
  const [pending, setPending] = useState<Result | null>(null);
  const latestResult = useRef<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [notice, setNotice] = useState('ChatGPTに接続しています…');
  const [displayMode, setDisplayMode] = useState<string>('inline');
  const [displayModes, setDisplayModes] = useState<string[]>([]);
  const studio = useRef<BrowserStudioApi | null>(null);
  const operation = useRef(false);
  const bridge = useRef<VisualEditorMcpProjectBridge | null>(null);
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const recovery = useRef<StudioRecovery>(emptyRecovery());
  const recoveryWrites = useRef<Promise<void>>(Promise.resolve());
  const [checking, setChecking] = useState(false);
  const [receipt, setReceipt] = useState<StudioReceipt | null>(null);
  const initialized = useRef<Promise<void>>(Promise.resolve());
  const restoreError = useRef<string | null>(null);
  const applying = useRef(false);
  const mounted = useRef(true);
  function persist() {
    const snapshot = structuredClone(recovery.current);
    const task = recoveryWrites.current.then(() => writeStudioRecovery(snapshot));
    recoveryWrites.current = task.catch(() => {});
    return task;
  }
  async function remember(next: Local) {
    recovery.current.active = { path: next.path, projectId: next.documents.project.projectId,
      revision: next.revision, hash: await bundleHash(bundleFrom(next.documents)) };
    recovery.current.projects[next.documents.project.projectId] = { revision: next.revision, hash: recovery.current.active.hash };
    await persist();
  }
  async function resume(path: string) {
    const documents = parseBrowserProjectFiles(await getBrowserProjectFiles(path));
    const saved = recovery.current.projects[documents.project.projectId];
    const hash = await bundleHash(bundleFrom(documents));
    select({ path, documents, revision: saved ? saved.revision + (hash === saved.hash ? 0 : 1) : 0 });
    await remember(current.current!);
  }
  async function report(result: Result, status: StudioReceipt['status'], message: string, image?: string) {
    if (!result.operationId) return;
    const item: StudioReceipt = { operationId: result.operationId, projectId: result.bundle.project.projectId,
      revision: result.revision, hash: await bundleHash(result.bundle), status, message,
      at: new Date().toISOString(), reported: false };
    recovery.current = addReceipt(recovery.current, item); setReceipt(item); await persist();
    const sent = await app.sendMessage({ role: 'user', content: [
      { type: 'text', text: JSON.stringify({ ...(image ? { sceneCapture: { operationId: item.operationId, projectId: item.projectId, status: 'verified', revision: item.revision } } : {}), studioDelivery: { ...item, sceneId: result.bundle.scene.sceneId, saved: status === 'verified', rendered: status === 'verified', projectMatched: bridge.current?.currentBundle().project.projectId === result.bundle.project.projectId, activeProjectId: current.current?.documents.project.projectId ?? null, results: result.results },
        instruction: status === 'verified' ? 'この操作のStudioへの反映、ブラウザ保存、Scene Viewの取得を確認しました。画像を確認してから完了を報告してください。' : 'この操作は未完了です。反映確認済みとは報告しないでください。Studioを開き、保存された結果を再適用するかretry_worldで同じデータを再送してください。' }) },
      ...(image ? [{ type: 'image' as const, data: image, mimeType: 'image/png' }] : []),
    ] }, { timeout: 15000 });
    if (sent.isError) throw new Error('反映結果を会話へ送れませんでした。反映を再確認してください');
    item.reported = true; recovery.current = addReceipt(recovery.current, item); setReceipt({ ...item }); await persist();
  }
  async function verify(result: Result) {
    const selected = current.current;
    if (!selected) throw new Error('Studioの編集画面が開いていません');
    setChecking(true);
    try {
      const deadline = Date.now() + 15000;
      while (!bridge.current && Date.now() < deadline && mounted.current && current.current === selected) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (!bridge.current) throw new Error('エディターの起動を確認できませんでした');
      const frame = await verifyStudioResult(result, bridge.current, () => mounted.current && current.current?.path === selected.path && !operation.current);
      await report(result, 'verified', 'Studioへの反映とブラウザ保存を確認しました。', frame.data);
      if (latestResult.current?.operationId === result.operationId) {
        const next = recovery.current.queue.shift() ?? null;
        latestResult.current = next; setPending(next); recovery.current.pending = next; await persist();
      }
      setNotice(latestResult.current ? '前の編集の反映を確認しました。次のAIの結果を適用できます。' : 'Studioへの反映とブラウザ保存を確認しました。');
    } catch (error) {
      const message = error instanceof Error ? error.message : '反映を確認できませんでした';
      setNotice(`反映は未完了です。${message}。「反映を再確認」から再試行できます。`);
      // A report transport failure must not replace a real verified receipt with a false apply failure.
      if (recovery.current.history.find(item => item.operationId === result.operationId)?.status !== 'verified') {
        try { await report(result, 'failed', message); } catch { /* Keep the pending result and unsent receipt. */ }
      }
    } finally { setChecking(false); applying.current = false; }
  }
  function select(next: Local) { current.current = next; setLocal(next); }
  async function context(next: Local, bundle = bundleFrom(next.documents)) {
    await app.updateModelContext({ content: [{ type: 'text', text: `編集対象: ${bundle.project.metadata.name}。edit_worldへこのbundleとrevisionを内部で引き継いでください。以後は直前のツール結果を使ってEditorの表示確認を待たずに追編集できます。データ編集、ブラウザ保存、画面反映、画像受信を区別してください。Sitesには作品を保存せず、素材のバイト列は含みません。` }], structuredContent: { bundle: validateBundle(bundle), revision: next.revision, projectId: bundle.project.projectId, studioHistory: recovery.current.history } });
  }
  async function captureSceneViewForConversation(operationId?: string) {
    const editor = bridge.current;
    if (!editor) throw new Error('Scene Viewを開いてからもう一度実行してください');
    const selected = current.current;
    const hash = await bundleHash(editor.currentBundle());
    const result = await editor.captureSceneView();
    if (!result.ok) throw new Error(result.message);
    if (!selected || current.current?.path !== selected.path || bridge.current !== editor || await bundleHash(editor.currentBundle()) !== hash) throw new Error('撮影中に編集対象が変更されました。もう一度撮影してください');
    const comma = result.dataUrl.indexOf(',');
    if (comma < 0) throw new Error('Scene Viewの画像形式が不正です');
    const data = result.dataUrl.slice(comma + 1);
    const sent = await app.sendMessage({
      role: 'user',
      content: [
        { type: 'image', data, mimeType: 'image/png' },
        { type: 'text', text: JSON.stringify({ sceneCapture: { operationId, status: 'verified', projectId: current.current?.documents.project.projectId, sceneId: current.current?.documents.project.entrySceneId, revision: current.current?.revision, capturedAt: new Date().toISOString() }, instruction: 'XRift Studioの現在のScene Viewです。画像を確認してから結果を報告してください。ワールド変更の反映確認とは別の画像取得結果です。' }) },
      ],
    }, { timeout: 15000 });
    if (sent.isError) throw new Error('Scene Viewを会話へ送れませんでした');
    setNotice('現在のScene Viewを会話に送りました。');
  }
  async function adopt(result: Result) {
    if (result.operationId) {
      latestResult.current = result; setPending(result); recovery.current.pending = result; await persist();
    }
    if (result.operationId) {
      recovery.current.operations ??= {}; recovery.current.operations[result.operationId] = result;
      const ids = Object.keys(recovery.current.operations); for (const id of ids.slice(0, Math.max(0, ids.length - 20))) delete recovery.current.operations[id];
      await persist();
    }
    const b = validateBundle(result.bundle);
    if (!studio.current) throw new Error('Studioが接続されていません。プラグインを開き直してください');
    bridge.current = null;
    const path = await studio.current.apply(b);
    const documents = parseBrowserProjectFiles(await getBrowserProjectFiles(path));
    select({ path, documents, revision: result.revision });
    await remember(current.current!);
    if (result.operationId) {
      setNotice('データを適用しました。Studioへの反映を確認しています…');
      applying.current = true;
      operation.current = false;
      // The editor mounts after select; confirmation waits for its real bridge and Scene View.
      await verify(result);
    } else { setNotice('作品をブラウザに保存しました。'); }
  }
  async function applyResult(result: Result) {
    applying.current = true; setChecking(true);
    const previous = recovery.current.history.find(item => item.operationId === result.operationId);
    if (previous?.status === 'verified' && previous.reported && current.current && await bundleHash(bridge.current?.currentBundle() ?? bundleFrom(current.current.documents)) !== previous.hash) throw new Error('この操作はすでに反映済みです。その後の編集を巻き戻さず、現在のScene Viewを確認してください');
        const editing = bridge.current?.currentBundle() ?? (current.current ? bundleFrom(current.current.documents) : null);
        if (editing && await bundleHash(editing) === await bundleHash(result.bundle)) { operation.current = false; applying.current = true; await verify(result); return; }
        const differs = editing && (editing.project.projectId !== result.bundle.project.projectId || !result.baseHash || await bundleHash(editing) !== result.baseHash);
        if (bridge.current && !(await bridge.current.saveNow())) throw new Error('保存できませんでした。プロジェクトを書き出してから再試行してください');
        await writes.current;
        if (differs && current.current && editing?.project.projectId === result.bundle.project.projectId) {
          const files = await getBrowserProjectFiles(current.current.path);
          const documents = parseBrowserProjectFiles(files);
          documents.project = { ...documents.project, projectId: `project-${crypto.randomUUID()}`, metadata: { ...documents.project.metadata, name: `${documents.project.metadata.name}（AI適用前）` } };
          for (const [path, bytes] of browserProjectDocumentFiles(documents)) files.set(path, bytes);
          parseBrowserProjectFiles(files);
          await createBrowserProject(files, { activate: false });
        }
        await adopt(result);
  }
  async function accept(data: Record<string, unknown>) {
    if (!data.bundle) return;
    const result = parseStudioResult(data);
    const waiting = latestResult.current;
    if (waiting && result.operationId !== waiting.operationId &&
        result.bundle.project.projectId === waiting.bundle.project.projectId &&
        result.revision > waiting.revision && result.baseHash === await bundleHash(waiting.bundle)) {
      // A later conversation edit is valid even when the earlier image report
      // was unavailable. Keep the old operation recoverable without blocking it.
      recovery.current.operations ??= {};
      if (waiting.operationId) recovery.current.operations[waiting.operationId] = waiting;
      latestResult.current = null;
      recovery.current.pending = null;
      setPending(null);
    }
    const previous = recovery.current.history.find(item => item.operationId === result.operationId);
    if (previous && previous.hash !== await bundleHash(result.bundle)) throw new Error('同じ操作IDで異なる編集データを受信しました');
    if (latestResult.current && result.operationId !== latestResult.current.operationId) {
      if (recovery.current.queue.length >= 32) throw new Error('未完了の編集が多いため、このデータは会話から再送してください');
      if (!recovery.current.queue.some(item => item.operationId === result.operationId)) recovery.current.queue.push(result);
      await persist();
      try { await report(result, 'waiting', '前の編集の反映を待っています。'); } catch { /* Keep queue. */ }
      return;
    }
    latestResult.current = result;
    recovery.current.pending = result; setPending(result); await persist();
    if (operation.current || applying.current) {
      setNotice('AIのデータを受信しました。Studioへの反映は未完了です。「AIの結果を適用」を押してください。');
      try { await report(result, 'waiting', 'Studioへの適用操作を待っています。'); } catch { /* Pending result remains recoverable. */ }
    } else await applyResult(result);
  }
  async function run(action: () => Promise<void>) {
    if (operation.current || applying.current || !connected) return;
    operation.current = true; setBusy(true);
    try { await writes.current; await action(); }
    catch (error) { applying.current = false; setChecking(false); setNotice(error instanceof Error ? error.message : '操作に失敗しました'); }
    finally { operation.current = false; setBusy(false); }
  }
  const lastDeepLink = useRef<string | null>(null);
  const hostReady = useRef(false);
  const entryCreated = useRef(false);
  const initialArguments = useRef<Record<string, unknown>>({});
  const initialResultReceived = useRef(false);
  async function startNewEntry(name = '新しいワールド') {
    if (latestResult.current || applying.current) throw new Error('未完了のAI編集が残っています。反映を再確認してから新しい作品を作成してください。');
    if (!studio.current) throw new Error('Studioが接続されていません。プラグインを開き直してください');
    if (!name.trim() || name.length > 80) throw new Error('プロジェクト名は1〜80文字で指定してください。');
    await writes.current;
    await studio.current.create(name.trim());
    const projectId = current.current?.documents.project.projectId;
    if (!projectId) throw new Error('作成した作品の保存先を確認できませんでした。');
    await openTarget(projectId);
    await context(current.current!);
    setNotice('新しいワールドをブラウザに保存し、エディターを開きました。');
  }
  async function openTarget(projectId: string) {
    validateStudioProjectId(projectId);
    if (latestResult.current && current.current?.documents.project.projectId !== projectId) throw new Error('AIの編集が未完了です。反映を再確認してから作品を切り替えてください');
    if (!studio.current) throw new Error('Studioが接続されていません。プラグインを開き直してください');
    await writes.current;
    await studio.current.openProject(projectId);
    const deadline = Date.now() + 15000;
    while (mounted.current && Date.now() < deadline && (!bridge.current || current.current?.documents.project.projectId !== projectId)) await new Promise(resolve => setTimeout(resolve, 100));
    if (!bridge.current || bridge.current.currentBundle().project.projectId !== projectId || current.current?.documents.project.projectId !== projectId) throw new Error('指定した作品の起動を確認できませんでした。作品一覧から開き直してください');
    setNotice('指定した作品を開きました。');
  }
  async function openDeepLink() {
    const url = extensions.deepLink.getCurrent()?.url;
    if (!url) return false;
    const launch = studioLaunchFromUrl(url);
    // ChatGPT also supplies its global entry URL as a deep link. It does not
    // select a project, so allow the entry's normal new/resume action to run.
    if (launch.kind === 'library') return false;
    if (url === lastDeepLink.current) return true;
    lastDeepLink.current = url;
    if (launch.kind === 'new') await accept(await callTool('create_world', { name: launch.name }) as Record<string, unknown>);
    else if (launch.kind === 'project') await openTarget(launch.projectId);
    return true;
  }
  const setup = useRef(false);
  React.useEffect(() => {
    if (setup.current) return; setup.current = true;
    initialized.current = (async () => {
      recovery.current = await readStudioRecovery<StudioRecovery>() ?? emptyRecovery();
      recovery.current.projects ??= {}; recovery.current.queue ??= [];
      if (recovery.current.pending) { latestResult.current = parseStudioResult(recovery.current.pending); setPending(latestResult.current); }
      setReceipt(recovery.current.history[recovery.current.history.length - 1] ?? null);
    })().catch(error => {
      // A locked or damaged saved project must not disable the host connection
      // or trap every later tool result in the rejected startup promise.
      restoreError.current = error instanceof Error ? error.message : '直前の作品を再開できませんでした';
      current.current = null; setLocal(null); bridge.current = null;
      setNotice(`直前の作品を再開できませんでした。${restoreError.current}。一覧から別の作品を開くか、編集中のタブを閉じて開き直してください。`);
    });
    app.ontoolinput = params => { initialArguments.current = params.arguments as Record<string, unknown>; };
    app.ontoolresult = result => {
      initialResultReceived.current = true;
      if (result.isError) { setNotice(result.content?.find(c => c.type === 'text')?.text ?? '接続に失敗しました'); return; }
      const data = (result.structuredContent ?? {}) as Record<string, unknown>;
      received.current = received.current.then(async () => {
        await initialized.current;
        if (data.localProjects === true) {
          // A deep link already selects/creates its target during host startup.
          // Do not create a second project from the global entry's default result.
          const deepUrl = extensions.deepLink.getCurrent()?.url;
          if (data.launch === 'new' && (!deepUrl || studioLaunchFromUrl(deepUrl).kind === 'library')) {
            if (entryCreated.current) entryCreated.current = false;
            else await accept(await callTool('create_world', {}) as Record<string, unknown>);
          }
          return;
        }
        if (data.studioCommand) { await command(data.studioCommand as Record<string, unknown>); return; }
        if (data.captureSceneView === true) {
          if (data.bundle) { await accept(data); return; }
          await captureSceneViewForConversation(typeof data.operationId === 'string' ? data.operationId : undefined);
          return;
        }
        await accept(data);
      }).catch(async (e: Error) => {
        applying.current = false; setChecking(false);
        setNotice(`反映は未完了です。${e.message}`);
        if (data.studioCommand) {
          const command = data.studioCommand as Record<string, unknown>;
          try { await app.sendMessage({ role: 'user', content: [{ type: 'text', text: JSON.stringify({ studioCommand: { operationId: command.operationId, requestId: command.requestId, status: 'failed', message: e.message, recoverable: true, activeProjectId: current.current?.documents.project.projectId ?? null, projectMatched: !!command.projectId && command.projectId === bridge.current?.currentBundle().project.projectId }, instruction: '編集は未完了です。エラーを説明し、Studioの状態を確認してから再試行してください。' }) }] }); } catch { /* Keep failure visible in Studio. */ }
        }
        if (data.bundle) { try { await report(parseStudioResult(data), 'failed', e.message); } catch { /* Preserve recovery data. */ } }
        else if (data.captureSceneView) { try { await app.sendMessage({ role: 'user', content: [{ type: 'text', text: JSON.stringify({ sceneCapture: { operationId: data.operationId, status: 'failed', message: e.message }, instruction: 'Scene Viewの取得は未完了です。Studioで作品を開いてからcapture_scene_viewで再試行してください。' }) }] }, { timeout: 15000 }); } catch { /* Keep failure visible in Studio. */ } }
      });
    };
    const theme = () => { const host = app.getHostContext(); setDisplayMode(host?.displayMode ?? 'inline'); setDisplayModes(host?.availableDisplayModes ?? []); if (host?.theme) applyDocumentTheme(host.theme); if (host?.styles?.variables) applyHostStyleVariables(host.styles.variables); };
    app.addEventListener('hostcontextchanged', () => {
      if (!hostReady.current) return;
      received.current = received.current.then(() => openDeepLink()).catch((error: Error) => setNotice(error.message));
    });
    app.addEventListener('hostcontextchanged', theme);
    app.onclose = () => { setConnected(false); setNotice('ChatGPTとの接続が切れました。プラグインを開き直して、未完了の編集を再確認してください。'); };
    const restored = initialized.current;
    initialized.current = (async () => {
      await app.connect(); theme(); await restored; hostReady.current = true; setConnected(true);
      setNotice(restoreError.current ? `直前の作品を再開できませんでした。${restoreError.current}。一覧から別の作品を開くか、編集中のタブを閉じて開き直してください。` : recovery.current.pending ? '未完了のAI編集が残っています。反映を再確認してください。' : current.current ? 'ブラウザに保存した直前の編集を再開しました。' : '会話でワールドの制作を頼むか、作品ファイルを取り込んでください。');
      try {
        if (await openDeepLink()) { /* Explicit project/new links take priority. */ }
        else if (document.documentElement.hasAttribute('data-studio-new-entry') && !initialResultReceived.current && initialArguments.current.mode === undefined && initialArguments.current.projectId === undefined) {
          // The app-only new entry does not necessarily send a tool result.
          // Use the same creation action as the ordinary browser editor.
          entryCreated.current = true;
          await startNewEntry(typeof initialArguments.current.name === 'string' ? initialArguments.current.name : undefined);
        } else {
          const active = recovery.current.active;
          if (active) await openTarget(active.projectId);
          if (current.current) setNotice('ブラウザに保存した直前の編集を再開しました。');
        }
      } catch (error) { setNotice(error instanceof Error ? error.message : '指定した作品を開けませんでした'); }
      const host = app.getHostContext();
      if (window.matchMedia('(max-width: 767px)').matches && host?.availableDisplayModes?.includes('inline') && host.displayMode === 'fullscreen') { try { await app.requestDisplayMode({ mode: 'inline' }); } catch { /* Display mode does not affect the MCP connection. */ } }
    })().catch((e: Error) => { setConnected(false); setNotice(`接続または再開を確認できません。${e.message}`); });
    return () => { mounted.current = false; };
  }, []);
  async function command(command: Record<string, unknown>) {
    const name = command.name;
    if (name === 'open_project') {
      if (latestResult.current || applying.current) throw new Error('AIの編集が未完了です。反映を再確認してから作品を切り替えてください');
      const projectId = String(command.projectId);
      await openTarget(projectId);
      const sent = await app.sendMessage({ role: 'user', content: [{ type: 'text', text: JSON.stringify({ studioContext: { connected: true, activeProjectId: current.current?.documents.project.projectId, projectId, projectMatched: bridge.current?.currentBundle().project.projectId === projectId, status: 'opened' }, requestId: command.requestId }) }] });
      if (sent.isError) throw new Error('作品を開いた結果を会話に送れませんでした');
      return;
    }
    if (name === 'get_editor_context' || name === 'get_operation_status') {
      const active = current.current;
      const result = name === 'get_operation_status' ? { operationId: command.operationId, receipt: recovery.current.history.find(item => item.operationId === command.operationId) ?? null, recoverable: !!recovery.current.operations?.[String(command.operationId)] } : { connected: true, mode: 'edit', projectId: active?.documents.project.projectId ?? null, sceneId: active?.documents.project.entrySceneId ?? null, revision: active?.revision ?? null, hash: active ? await bundleHash(bridge.current?.currentBundle() ?? bundleFrom(active.documents)) : null, bundle: active ? validateBundle(bridge.current?.currentBundle() ?? bundleFrom(active.documents)) : null };
      const requested = name === 'get_operation_status' ? recovery.current.operations?.[String(command.operationId)]?.bundle.project.projectId : active?.documents.project.projectId;
      const studioState = { connected: hostReady.current, activeProjectId: active?.documents.project.projectId ?? null, projectMatched: !!requested && requested === active?.documents.project.projectId && requested === bridge.current?.currentBundle().project.projectId };
      await app.sendMessage({ role: 'user', content: [{ type: 'text', text: JSON.stringify({ studioContext: { ...result, ...studioState, canCreateProject: true, canEditProject: !!active, editorReady: !!bridge.current }, instruction: active ? 'この作品への編集を続けられます。新規制作の依頼はcreate_worldで別の作品を作成してください。' : '新規制作は可能です。activeProjectIdがnullでもcreate_worldをすぐ呼び、自動作成・反映確認まで続けてください。手動で作品を開くよう依頼して止まらないでください。既存作品への編集だけはprojectIdで対象を確認してください。', requestId: command.requestId }) }] }); return;
    }
    if (name === 'retry_world') {
      const result = recovery.current.operations?.[String(command.operationId)] ?? recovery.current.pending;
      if (!result || result.operationId !== command.operationId) throw new Error('再送データがこのブラウザにありません。元の結果をretry_worldで再送してください');
      await accept(result as unknown as Record<string, unknown>); return;
    }
    if (name !== 'edit_world') throw new Error('未対応のStudio操作です');
    const active = current.current;
    if (!active) throw new Error('会話内の最新のbundleとrevisionをedit_worldへ引き継いでください。新規制作はcreate_worldで開始できます');
    if (command.projectId && command.projectId !== active.documents.project.projectId) throw new Error('編集対象が異なります。対象の作品を開いてください');
    if (bridge.current && !(await bridge.current.saveNow())) throw new Error('最新の編集を保存できませんでした');
    await writes.current;
    const latest = current.current!;
    const additionsOnly = Array.isArray(command.operations) && command.operations.every(raw => raw && typeof raw === 'object' && ['create_primitive', 'create_entity', 'create_material'].includes((raw as { tool: string }).tool));
    if (command.expectedRevision !== undefined && command.expectedRevision !== latest.revision && !additionsOnly) throw new Error('revision_conflict: 最新状態をget_editor_contextで確認して再試行してください');
    const result = await callTool('edit_world', { ...command, bundle: bridge.current?.currentBundle() ?? bundleFrom(latest.documents), revision: latest.revision });
    await accept(result as Record<string, unknown>);
  }
  async function saved(path: string, bundle: PrototypeVisualProject) {
    if (current.current?.path !== path) await resume(path);
    const snapshot = current.current;
    if (!snapshot) throw new Error('編集対象がありません');
    const task = writes.current.then(async () => {
      const latest = current.current;
      if (!latest || latest.path !== snapshot.path || path !== latest.path) throw new Error('編集対象が切り替わりました');
      const documents = { ...latest.documents, project: bundle.project, scenes: { ...latest.documents.scenes, [bundle.scene.sceneId]: bundle.scene }, assets: bundle.assets, prefabs: bundle.prefabs };
      const changed = await bundleHash(bundle) !== await bundleHash(bundleFrom(latest.documents));
      current.current = { ...latest, documents, revision: latest.revision + (changed ? 1 : 0) };
      await remember(current.current);
      // Model context is opt-in via the toolbar; local saves do not send documents to the server.
    });
    writes.current = task.catch(() => {}); await task;
  }
  const displayedReceipt = receipt && (pending ? receipt.operationId === pending.operationId : receipt.projectId === current.current?.documents.project.projectId && receipt.hash === recovery.current.active?.hash) ? receipt : null;
  const stateLabel = !connected ? '未接続' : checking ? '確認中' : displayedReceipt?.status === 'failed' ? '反映失敗' : pending && displayedReceipt?.status === 'verified' && !displayedReceipt.reported ? '未報告' : pending ? '反映未完了' : displayedReceipt?.status === 'verified' ? '反映済み' : '接続済み';
  const controls = <div className="flex items-center gap-1">{displayModes.includes(displayMode === 'fullscreen' ? 'inline' : 'fullscreen') && <button className="min-h-9 rounded-md px-2 text-xs hover:bg-editor-subtle" onClick={() => { void app.requestDisplayMode({ mode: displayMode === 'fullscreen' ? 'inline' : 'fullscreen' }).then(result => setDisplayMode(result.mode)).catch(() => setNotice('画面を切り替えられませんでした。ChatGPTの戻る操作を使ってください。')); }}>{displayMode === 'fullscreen' ? '会話へ戻る' : 'エディターを広げる'}</button>}<details className="relative shrink-0 text-xs text-editor-text">
    <summary className="flex min-h-9 cursor-pointer list-none items-center rounded-md px-3 font-medium hover:bg-editor-subtle" aria-label={`ChatGPT ${stateLabel}`}>ChatGPT · {stateLabel}</summary>
    <div className={`absolute right-0 z-50 w-80 max-w-[90vw] rounded-lg border border-editor-border bg-editor-surface p-3 shadow-lg ${local ? 'bottom-full mb-2' : 'top-full mt-2'}`}>
      <p role="status" className="mb-3 break-words text-xs text-editor-muted">{notice}</p>
      {displayedReceipt && <p className="mb-3 text-xs text-editor-muted">{displayedReceipt.status === 'verified' ? displayedReceipt.reported ? '反映確認済み・報告済み' : '反映確認済み・会話へ未報告' : displayedReceipt.status === 'failed' ? '反映失敗' : '適用待ち'} / revision {displayedReceipt.revision}</p>}
      {pending && <button className="mb-2 min-h-10 w-full rounded-md bg-violet-600 px-3 text-white disabled:opacity-50" disabled={busy || checking || !connected} onClick={() => void run(async () => {
        const result = latestResult.current; if (result) await applyResult(result);
      })}>{displayedReceipt?.status === 'failed' || displayedReceipt?.status === 'verified' && !displayedReceipt.reported ? '反映を再確認' : 'AIの結果を適用'}</button>}
      {local && <button className="min-h-10 w-full rounded-md border border-editor-border px-3 hover:bg-editor-subtle disabled:opacity-50" disabled={busy || checking || !connected} onClick={() => void run(async () => {
        if (bridge.current && !(await bridge.current.saveNow())) throw new Error('保存できませんでした');
        await writes.current; const next = current.current; if (!next) return;
        await context(next, bridge.current?.currentBundle()); setNotice('編集対象を会話に渡しました。変更内容を入力してください。');
      })}>会話に編集対象を渡す</button>}
    </div>
  </details></div>;
  return <>
    <BrowserEditorApp host={{
      controls, busy: checking,
      onReady: api => { studio.current = api; },
      onBridge: value => { bridge.current = value; },
      onSaved: saved,
      onProjectChange: async path => {
        if (path) { await resume(path); setNotice('ブラウザに保存した作品を開きました。'); }
        else { current.current = null; setLocal(null); bridge.current = null; recovery.current.active = null; await persist(); }
      },
    }} />
  </>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<Application />);
