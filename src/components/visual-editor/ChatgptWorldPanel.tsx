import { useEffect, useRef, useState } from "react";
import { ArrowUp, Bot, ClipboardList, LoaderCircle, Square, UserRound } from "lucide-react";
import { tauri, type ChatgptAssetOptions, type ChatgptConnection, type ChatgptModel } from "../../lib/tauri";
import { CHATGPT_ALL_ASSETS, type ChatgptGeneration, type ChatgptGenerationMode } from "../../lib/visual-editor/chatgpt-generation";
import { ChatgptSessionBar, type ChatgptSessionActions } from "./ChatgptSessionBar";

const effortLabels: Record<string, string> = { none: "なし（速さ優先）", minimal: "最小（速さ優先）", low: "低（速さ優先）", medium: "中（標準）", high: "高（じっくり）", xhigh: "より高い", max: "最大" };
const preferredEffort = (model?: ChatgptModel) => ["low", "minimal", "medium", "high", "xhigh", "max", "none"].find(effort => model?.supportedReasoningEfforts?.includes(effort)) ?? "";

export function ChatgptWorldPanel({ onGenerate, onApplyPlan, onCancel, onRevert, disabledReason, generation, conversation = [], onSelectEntity, sessionActions, historyError, externallyBusy = false, draftScope = "default" }: {
  onGenerate: (model: string, prompt: string, options: ChatgptAssetOptions, mode?: ChatgptGenerationMode, reasoningEffort?: string) => Promise<void>;
  onApplyPlan?: (generationId: string) => Promise<void>;
  onCancel?: (generationId: string) => Promise<unknown>;
  onRevert?: (generationId: string) => Promise<unknown>;
  sessionActions?: ChatgptSessionActions;
  historyError?: string;
  externallyBusy?: boolean;
  draftScope?: string;
  disabledReason?: string;
  generation?: ChatgptGeneration | null;
  conversation?: readonly ChatgptGeneration[];
  onSelectEntity?: (entityId: string) => void;
}) {
  const [connection, setConnection] = useState<ChatgptConnection | null>(null);
  const [models, setModels] = useState<ChatgptModel[]>([]);
  const [model, setModel] = useState(generation?.model ?? "");
  const [reasoningEffort, setReasoningEffort] = useState<string | null>(generation?.reasoningEffort ?? null);
  const [mode, setMode] = useState<ChatgptGenerationMode>("build");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState<"loading" | "login" | "logout" | "generate" | "revert" | null>("loading");
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const running = useRef(false);
  const mounted = useRef(true);
  const conversationElement = useRef<HTMLDivElement>(null);
  const followingLatest = useRef(true);
  const modelAccount = useRef<string | null>(null);
  const modelLoading = useRef<{ account: string; epoch: number } | null>(null);
  const currentAccount = useRef<string | null>(null);
  const accountEpoch = useRef(0);
  const drafts = useRef(new Map<string, { prompt: string; model: string; reasoningEffort: string | null; mode: ChatgptGenerationMode }>());
  const previousScope = useRef(draftScope);
  const currentDraft = useRef({ prompt, model, reasoningEffort, mode });
  currentDraft.current = { prompt, model, reasoningEffort, mode };
  useEffect(() => {
    if (previousScope.current === draftScope) return;
    drafts.current.set(previousScope.current, currentDraft.current);
    previousScope.current = draftScope;
    // The first send creates a persistent chat from the initial draft.
    if (running.current && !drafts.current.has(draftScope)) return;
    const draft = drafts.current.get(draftScope);
    setPrompt(draft?.prompt ?? ""); setMode(draft?.mode ?? "build"); setReasoningEffort(draft?.reasoningEffort ?? null);
    if (draft?.model) setModel(draft.model);
    setError(null);
    while (drafts.current.size > 20) drafts.current.delete(drafts.current.keys().next().value!);
  }, [draftScope]);
  useEffect(() => { followingLatest.current = true; }, [draftScope]);
  useEffect(() => {
    const element = conversationElement.current;
    if (element && followingLatest.current) element.scrollTop = element.scrollHeight;
  }, [draftScope, generation?.generationId, generation?.status, generation?.progress.message, generation?.progress.recentEvents.length, error, statusError]);
  const selectedModel = models.find(item => item.slug === model);
  const supportedEfforts = selectedModel?.supportedReasoningEfforts ?? [];
  const effectiveEffort = reasoningEffort === "" ? "" : reasoningEffort && supportedEfforts.includes(reasoningEffort) ? reasoningEffort : preferredEffort(selectedModel);
  useEffect(() => {
    if (selectedModel) setReasoningEffort(current => current === "" || (current && selectedModel.supportedReasoningEfforts?.includes(current)) ? current : preferredEffort(selectedModel) || null);
  }, [selectedModel]);
  const sync = async (next: ChatgptConnection) => {
    if (!mounted.current) return;
    setConnection(next);
    const account = next.planUsageEnabled ? next.accountId ?? next.email ?? "active" : null;
    if (currentAccount.current !== account) {
      currentAccount.current = account; accountEpoch.current++;
      modelAccount.current = null; setModels([]); setModel(""); setConnectionError(null);
    }
    if (!account) { setModel(""); return; }
    const epoch = accountEpoch.current;
    if (next.connecting || next.restoring || modelAccount.current === account || (modelLoading.current?.account === account && modelLoading.current.epoch === epoch)) return;
    const loading = { account, epoch };
    modelLoading.current = loading;
    // Model discovery must not delay the connection poll or hide disconnects.
    void (async () => { try {
      const list = await tauri.chatgptModels();
      if (!mounted.current || currentAccount.current !== account || accountEpoch.current !== epoch) return;
      modelAccount.current = account;
      setModels(list); setModel(current => list.some(m => m.slug === current) ? current : list[0]?.slug ?? "");
      setConnectionError(list.length ? null : "利用できるモデルがありません。アカウントの接続状態を確認してください。");
    } catch (e) { if (mounted.current && currentAccount.current === account && accountEpoch.current === epoch) setConnectionError(e instanceof Error ? e.message : String(e)); }
    finally { if (modelLoading.current === loading) modelLoading.current = null; } })();
  };
  useEffect(() => {
    mounted.current = true;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const next = await tauri.chatgptStatus();
        if (!active) return;
        await sync(next);
        if (active) setStatusError(null);
      } catch (e) { if (active && mounted.current) setStatusError(e instanceof Error ? e.message : String(e)); }
      finally { if (active && mounted.current) { setBusy(current => current === "loading" ? null : current); timer = setTimeout(refresh, 2000); } }
    };
    void refresh();
    return () => { active = false; mounted.current = false; clearTimeout(timer); };
  }, []);
  const run = async (action: "login" | "logout" | "generate" | "revert", task: () => Promise<void>) => {
    if (running.current) return;
    running.current = true; setBusy(action); setError(null);
    try { await task(); }
    catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { running.current = false; if (mounted.current) setBusy(null); }
  };
  const generating = busy === "generate" || generation?.status === "running";
  const pending = busy !== null || Boolean(connection?.connecting || connection?.restoring) || generating || externallyBusy;
  const placed = generation?.progress.recentEvents.filter(event => event.phase === "placing" && event.name) ?? [];
  const alert = error ?? generation?.error ?? statusError ?? connectionError ?? connection?.error;
  const connecting = busy === "login" || Boolean(connection?.connecting);
  const restoring = busy === "loading" || Boolean(connection?.restoring);
  const showConnect = !connection?.signedIn;
  const connectAlert = error ?? statusError ?? connection?.error;
  const send = (request = prompt.trim()) => void run("generate", async () => { await onGenerate(model, request, { ...CHATGPT_ALL_ASSETS }, mode, effectiveEffort || undefined); if (mounted.current) setPrompt(""); });
  return <section aria-label="ワールド制作のチャット" className="flex min-h-0 flex-1 flex-col gap-3">
    <header className="flex shrink-0 items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 font-medium text-slate-800"><Bot size={16} aria-hidden="true" /><span>制作アシスタント</span></div>
      {connection?.signedIn ? <details className="relative">
        <summary aria-label="ChatGPTアカウント" title="ChatGPTアカウント" className="flex size-8 cursor-pointer list-none items-center justify-center rounded-full hover:bg-slate-100"><UserRound size={16} aria-hidden="true" /></summary>
        <div className="absolute right-0 top-9 z-10 w-60 space-y-2 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
          <p className="break-words text-slate-700">接続中：{connection.email ?? "ChatGPTアカウント"}</p>
          <p className="text-[11px] leading-4 text-slate-500">接続情報はOSの保護された領域に保存されます。</p>
          <button type="button" disabled={pending} onClick={() => void run("logout", async () => sync(await tauri.chatgptLogout()))} className="rounded px-1 py-1.5 underline underline-offset-2 disabled:opacity-50">接続を解除</button>
        </div>
      </details> : null}
    </header>
    {sessionActions ? <ChatgptSessionBar {...sessionActions} disabled={pending} /> : null}
    {historyError ? <p role="alert" className="shrink-0 text-[11px] leading-4 text-amber-800">{historyError}</p> : null}
    <div ref={conversationElement} onScroll={event => { const element = event.currentTarget; followingLatest.current = element.scrollHeight - element.clientHeight - element.scrollTop < 32; }} className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${showConnect ? "flex flex-col" : "space-y-3"}`} aria-label="制作の会話と結果">
      {showConnect ? <div className="my-auto flex shrink-0 flex-col items-center gap-2.5 px-2 py-4 text-center" aria-label="ChatGPTの接続">
        <div className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Bot size={21} aria-hidden="true" /></div>
        <h3 className="text-sm font-medium text-slate-800">Sceneの編集を一緒に</h3>
        <p className="max-w-sm leading-5 text-slate-500">小さな調整から相談して、<br />結果を見ながら進めましょう。</p>
        <button type="button" disabled={pending} onClick={() => void run("login", async () => { modelAccount.current = null; await sync(await tauri.chatgptLogin()); })} className="flex min-h-10 items-center justify-center gap-2 rounded-full bg-slate-900 px-5 py-2 font-medium text-white hover:bg-slate-700 disabled:opacity-60">
          {connecting || restoring ? <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
          {restoring ? "接続を確認中…" : connecting ? "接続中…" : "ChatGPTに接続"}
        </button>
        {restoring ? <p role="status" className="leading-5 text-slate-500">保存した接続を確認しています…</p> : connecting ? <p role="status" className="leading-5 text-slate-500">ブラウザで許可すると、この画面で編集を始められます。</p> : null}
        {connectAlert ? <p role="alert" className="w-full max-w-md break-words rounded-lg bg-rose-50 p-2.5 text-left leading-5 text-rose-700">{connectAlert}</p> : null}
      </div> : <>
      {conversation.filter(turn => turn.generationId !== generation?.generationId).map(turn => <div key={turn.generationId} className="space-y-2">
        <p className="ml-5 whitespace-pre-wrap break-words rounded-xl bg-slate-100 px-3 py-2.5 text-slate-800">{turn.prompt}</p>
        <p className="break-words leading-5 text-slate-500">{turn.progress.message}</p>
        {turn.plan ? <details className="rounded-lg border border-slate-200 p-2.5"><summary className="cursor-pointer text-slate-700">Plan：{turn.plan.title}</summary><p className="mt-2 whitespace-pre-wrap break-words leading-5">{turn.plan.description}</p><ol className="mt-2 space-y-1">{turn.plan.objects.map((object, index) => <li key={index} className="break-words">{object.name}（{object.shape}）{object.detail ? <p className="mt-1 text-[11px] leading-4 text-slate-500">{object.detail}</p> : null}</li>)}</ol></details> : null}
        {turn.error ? <p className="break-words text-rose-700">{turn.error}</p> : null}
      </div>)}
      {!generation ? <p className="leading-5 text-slate-500">今のSceneの編集を手伝います。小さな調整から依頼して、結果を見ながら進めましょう。</p> : <>
        <p className="ml-5 whitespace-pre-wrap break-words rounded-xl bg-slate-100 px-3 py-2.5 text-slate-800">{generation.prompt}</p>
        <div className="space-y-2 px-0.5">
          <p role="status" aria-live="polite" className="break-words leading-5 text-slate-700">{generation.cancelling ? "現在の処理を安全に終えて停止しています…" : generation.progress.message}</p>
          {generation.progress.total > 0 && generation.status !== "planned" ? <div className="space-y-1"><p className="text-[11px] text-slate-500">保存済み {generation.progress.completed} / {generation.progress.total}</p><progress aria-label="依頼の反映と保存" value={generation.progress.completed} max={generation.progress.total} className="h-1 w-full accent-brand-600" /></div> : null}
          {generation.plan ? <details open={generation.status === "planned"} className="rounded-lg border border-slate-200 p-2.5">
            <summary className="cursor-pointer font-medium text-slate-800">Plan：{generation.plan.title}</summary>
            <p className="mt-2 break-words leading-5 text-slate-500">{generation.plan.description}</p>
            {generation.plan.hasMore ? <p className="mt-2 break-words leading-5 text-slate-500">この後：{generation.plan.remainingWork || "結果を確認して、続きの作業を進めます。"}</p> : null}
            <ol className="mt-2 space-y-1" aria-label="依頼の作業結果">{generation.plan.objects.map((object, index) => {
              const event = placed[index];
              return <li key={index} className="flex min-w-0 items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1.5">
                <div className="min-w-0">{event?.entityId && onSelectEntity ? <button type="button" onClick={() => onSelectEntity(event.entityId!)} aria-label={`${object.name}をInspectorで表示`} className="min-w-0 break-words text-left text-brand-700 underline underline-offset-2">{object.name}</button> : <span className="min-w-0 break-words">{object.name}</span>}
                {object.detail ? <p className="mt-1 break-words text-[11px] leading-4 text-slate-500">{object.detail}</p> : null}</div>
                <span className="shrink-0 text-[11px] text-slate-500">{event ? "保存済み" : object.shape === "調整" ? "調整" : "追加"}</span>
              </li>;
            })}</ol>
            {generation.status === "planned" && onApplyPlan ? <button type="button" disabled={pending || Boolean(disabledReason)} onClick={() => void run("generate", () => onApplyPlan(generation.generationId))} className="mt-3 w-full rounded-md bg-brand-600 px-3 py-2 font-semibold text-white disabled:bg-slate-200 disabled:text-slate-500">Planを反映</button> : null}
            {generation.status === "planned" && onCancel ? <button type="button" disabled={pending} onClick={() => { void onCancel(generation.generationId).catch(e => setError(e instanceof Error ? e.message : String(e))); }} className="mt-1 w-full rounded-md px-3 py-2 text-slate-500 hover:bg-slate-50 disabled:opacity-50">Planを破棄</button> : null}
          </details> : null}
          {generation.progress.recentEvents.length > 0 ? <details><summary className="cursor-pointer text-[11px] text-slate-500">作業の記録</summary><ol className="mt-2 space-y-1 border-l border-slate-200 pl-2 text-[11px] leading-4">{generation.progress.recentEvents.map(event => <li key={event.sequence} className="break-words">{event.message}</li>)}</ol></details> : null}
          {(generation.status === "failed" || generation.status === "cancelled") && generation.projectId ? <p className="leading-5 text-slate-500">保存済みの変更は残っています。結果を確認して、次の依頼を送れます。</p> : null}
          {generation.status !== "running" && generation.status !== "planned" ? <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending || !connection?.planUsageEnabled || !selectedModel || Boolean(disabledReason)} title="Continue：このチャットの続きから進める" onClick={() => send(prompt.trim() || "このチャットの依頼の続きを進めてください。保存済みの変更を繰り返さず、未完了の作業だけを進めてください。完了済みなら追加せず状況を説明してください。")} className="rounded-md border border-slate-200 px-2.5 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-50">続ける</button>
            {generation.revertAvailable && !generation.revertedAt && onRevert ? <button type="button" disabled={pending || Boolean(disabledReason)} title="Revert：この依頼の変更を戻す" onClick={() => void run("revert", async () => { await onRevert(generation.generationId); })} className="rounded-md border border-slate-200 px-2.5 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-50">変更を戻す</button> : null}
          </div> : null}
        </div>
      </>}
      {connection?.restoring ? <p role="status">保存した接続を確認しています…</p> : connection?.connecting ? <p role="status">ブラウザで許可すると、接続状態が更新されます。</p> : null}
      {connection?.signedIn && !connection.planUsageEnabled ? <p className="text-amber-800">ChatGPTプランの利用許可がありません。接続を解除してから、再接続して許可してください。</p> : null}
      {alert ? <p role="alert" className="rounded-lg bg-rose-50 p-2.5 leading-5 text-rose-700">{alert}</p> : null}
      </>}
      {disabledReason ? <p className="leading-5 text-amber-800">{disabledReason}</p> : null}
    </div>
    <form onSubmit={e => { e.preventDefault(); if (!pending && connection?.planUsageEnabled && models.some(m => m.slug === model) && prompt.trim() && !disabledReason) send(); }} className="shrink-0 rounded-xl border border-slate-300 bg-white p-2.5 focus-within:border-slate-500">
      <textarea aria-label="ワールドへの依頼" value={prompt} maxLength={2000} disabled={pending} onChange={e => setPrompt(e.target.value)} rows={3} placeholder="このSceneで変えたいところ、追加したいもの" className="block w-full resize-none border-0 bg-transparent p-0 leading-5 text-slate-800 outline-none placeholder:text-slate-400" />
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
        <div className="flex min-w-0 flex-[1_1_16rem] items-center gap-1.5">
        <select aria-label="ワールド制作のモデル" disabled={pending || !models.length} value={model} onChange={e => setModel(e.target.value)} className="min-w-0 flex-1 rounded-full border-0 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
          {!models.length ? <option value="">{busy === "loading" ? "確認中…" : "モデル"}</option> : models.map(m => <option key={m.slug} value={m.slug}>{m.displayName}</option>)}
        </select>
        {connection?.planUsageEnabled ? <select aria-label="思考量" title="少なめの思考量で速さを優先、多めでじっくり検討します" disabled={pending || !supportedEfforts.length} value={effectiveEffort} onChange={e => setReasoningEffort(e.target.value)} className="min-w-0 max-w-[55%] flex-1 rounded-full border-0 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-60">
          <option value="">思考量：モデルの既定</option>
          {supportedEfforts.map(effort => <option key={effort} value={effort}>{effortLabels[effort] ?? effort}</option>)}
        </select> : null}
        </div>
        <button type="button" aria-pressed={mode === "plan"} disabled={pending} title="Planで内容を確認してから反映" onClick={() => setMode(current => current === "plan" ? "build" : "plan")} className={`flex items-center gap-1 rounded-full px-2 py-1.5 text-[11px] ${mode === "plan" ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-100"} disabled:opacity-50`}><ClipboardList size={13} aria-hidden="true" />Plan</button>
        <div className="ml-auto shrink-0">{generating && onCancel && generation?.status === "running" ? <button type="button" aria-label="制作を停止" title="制作を停止" disabled={generation.cancelling} onClick={() => { setError(null); void onCancel(generation.generationId).catch(e => setError(e instanceof Error ? e.message : String(e))); }} className="flex size-8 items-center justify-center rounded-full bg-slate-900 text-white disabled:opacity-50"><Square size={12} fill="currentColor" aria-hidden="true" /></button> : <button type="submit" aria-label="依頼を送信" title={mode === "plan" ? "Planを相談する" : "依頼を送信"} disabled={pending || !connection?.planUsageEnabled || !models.some(m => m.slug === model) || !prompt.trim() || Boolean(disabledReason)} className="flex size-8 items-center justify-center rounded-full bg-slate-900 text-white disabled:bg-slate-100 disabled:text-slate-400">{generating ? <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ArrowUp size={16} aria-hidden="true" />}</button>}</div>
      </div>
    </form>
    <p className="text-[10px] leading-4 text-slate-400">ChatGPTの利用枠を使用します。変更はこのワールドに保存されます。</p>
  </section>;
}
