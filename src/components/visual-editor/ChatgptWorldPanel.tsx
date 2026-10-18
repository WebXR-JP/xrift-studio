import { ChatgptWorkLog, chatgptProgressIsRecorded, formatChatgptProgressMessage } from "./ChatgptWorkLog";
import type { AssetManifest, MaterialAssetPatch } from "../../lib/visual-editor/asset-manifest";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowUp, Bot, Copy, LoaderCircle, Plug, Square, Undo2, UserRound, X } from "lucide-react";
import { tauri, type BlenderStatus, type ChatgptAssetOptions, type ChatgptConnection, type ChatgptModel } from "../../lib/tauri";
import { getChatgptBlenderStatus } from "../../lib/visual-editor/chatgpt-blender-status";
import { CHATGPT_ALL_ASSETS, type ChatgptGeneration, type ChatgptGenerationMode } from "../../lib/visual-editor/chatgpt-generation";
import { ChatgptSessionBar, type ChatgptSessionActions } from "./ChatgptSessionBar";
import { useChatgptRequestQueue } from "./useChatgptRequestQueue";
import { createDocumentId } from "../../lib/visual-editor/document-id";
import type { ChatgptRequestScope } from "../../lib/visual-editor/chatgpt-request-queue";
import { chatgptOutputText } from "../../lib/visual-editor/chatgpt-output-copy";
import { CHATGPT_MAX_MATERIAL_ATTACHMENTS, chatgptAttachmentEntityIds, type ChatgptEntityReference } from "../../lib/visual-editor/chatgpt-attachments";
import { clearEditorDragData, hasEditorDragData, readEditorEntityIds, readEditorMaterialIds } from "./editor-drag-data";
import { ASSET_DRAG_MIME, ASSET_LIBRARY_ITEM_DRAG_MIME, ENTITIES_DRAG_MIME, ENTITY_DRAG_MIME, MATERIAL_DRAG_MIME, MATERIALS_DRAG_MIME } from "./types";
import { ChatgptChoiceThumbnail } from "./ChatgptChoiceThumbnail";
import { ChatgptQuestionForm } from "./ChatgptQuestionForm";
import { ChatgptPlanSettings } from "./ChatgptPlanSettings";
import type { ChatgptQuestionAnswer } from "../../lib/visual-editor/chatgpt-questions";
import { chatgptPromptSuggestions, type ChatgptPromptSuggestion } from "../../lib/visual-editor/chatgpt-prompt-suggestions";
import { parseChatgptComposerRequest } from "../../lib/visual-editor/chatgpt-goal";
import { ChatgptMaterialControls } from "./ChatgptMaterialControls";
import { ChatgptSceneControls, type ChatgptSceneSettingsPatch } from "./ChatgptSceneControls";
import type { SceneSettings } from "../../lib/visual-editor/scene-settings";
import { preferredChatgptReasoningEffort } from "../../lib/visual-editor/chatgpt-reasoning";

const effortLabels: Record<string, string> = { none: "なし（速さ優先）", minimal: "最小（速さ優先）", low: "低（速さ優先）", medium: "中（標準）", high: "高（じっくり）", xhigh: "より高い", max: "最大" };
const EMPTY_ENTITY_REFERENCES: readonly ChatgptEntityReference[] = [];
const ATTACHMENT_DRAG_MIMES = [ENTITY_DRAG_MIME, ENTITIES_DRAG_MIME, MATERIAL_DRAG_MIME, MATERIALS_DRAG_MIME, ASSET_DRAG_MIME, ASSET_LIBRARY_ITEM_DRAG_MIME];

export function ChatgptWorldPanel({ onGenerate, onApplyPlan, onAnswerQuestions, onCancel, onRevert, onClose, onOpenMcp, onMaterialChange, sceneSettings, onSceneSettingsChange, disabledReason, generation, conversation = [], onSelectEntity, sessionActions, historyError, assets, projectPath, externallyBusy = false, draftScope = "default", sceneScope = draftScope, entityReferences = EMPTY_ENTITY_REFERENCES, expanded = false, onExpandedChange }: {
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onMaterialChange?: (assetId: string, patch: MaterialAssetPatch) => void;
  sceneSettings?: SceneSettings;
  onSceneSettingsChange?: (patch: ChatgptSceneSettingsPatch) => void;
  onAnswerQuestions?: (generationId: string, answers: ChatgptQuestionAnswer[]) => Promise<void>;
  entityReferences?: readonly ChatgptEntityReference[];
  assets?: AssetManifest;
  projectPath?: string;
  onGenerate: (model: string, prompt: string, options: ChatgptAssetOptions, mode?: ChatgptGenerationMode, reasoningEffort?: string, expectedScope?: ChatgptRequestScope) => Promise<void>;
  onApplyPlan?: (generationId: string) => Promise<void>;
  onCancel?: (generationId: string) => Promise<unknown>;
  onRevert?: (generationId: string) => Promise<unknown>;
  onClose?: () => void;
  onOpenMcp?: () => void;
  sessionActions?: ChatgptSessionActions;
  historyError?: string;
  externallyBusy?: boolean;
  draftScope?: string;
  sceneScope?: string;
  disabledReason?: string;
  generation?: ChatgptGeneration | null;
  conversation?: readonly ChatgptGeneration[];
  onSelectEntity?: (entityId: string) => void;
}) {
  const [connection, setConnection] = useState<ChatgptConnection | null>(null);
  const [models, setModels] = useState<ChatgptModel[]>([]);
  const [model, setModel] = useState(generation?.model ?? "");
  const [reasoningEffort, setReasoningEffort] = useState<string | null>(generation?.reasoningEffort ?? null);
  const [modelSource, setModelSource] = useState<NonNullable<ChatgptAssetOptions["modelSource"]>>("auto");
  const [blenderStatus, setBlenderStatus] = useState<BlenderStatus | null>(null);
  const [blenderStatusError, setBlenderStatusError] = useState(false);
  const [blenderLoading, setBlenderLoading] = useState(true);
  const [prompt, setPrompt] = useState("");
  const promptElement = useRef<HTMLTextAreaElement>(null);
  const promptComposing = useRef(false);
  const suggestionsId = useId();
  const [dismissedSuggestions, setDismissedSuggestions] = useState(() => new Map<string, string>());
  const [attachedEntityIds, setAttachedEntityIds] = useState<string[]>([]);
  const [attachedMaterialIds, setAttachedMaterialIds] = useState<string[]>([]);
  const [entityDragOver, setEntityDragOver] = useState(false);
  const entityById = useMemo(() => new Map(entityReferences.map(entity => [entity.id, entity])), [entityReferences]);
  const materialById = useMemo(() => new Map(Object.values(assets?.assets ?? {}).filter(asset => asset.kind === "material").map(asset => [asset.id, asset])), [assets]);
  const attachmentScopeIds = useMemo(() => chatgptAttachmentEntityIds(entityReferences, attachedEntityIds), [entityReferences, attachedEntityIds]);
  const [busy, setBusy] = useState<"loading" | "login" | "logout" | "generate" | "revert" | null>("loading");
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const outputElement = useRef<HTMLDivElement>(null);
  const running = useRef(false);
  const mounted = useRef(true);
  const blenderEpoch = useRef(0);
  const conversationElement = useRef<HTMLDivElement>(null);
  const followingLatest = useRef(true);
  const modelAccount = useRef<string | null>(null);
  const modelLoading = useRef<{ account: string; epoch: number } | null>(null);
  const currentAccount = useRef<string | null>(null);
  const accountEpoch = useRef(0);
  const drafts = useRef(new Map<string, { prompt: string; attachedEntityIds: string[]; attachedMaterialIds: string[]; model: string; reasoningEffort: string | null; modelSource: NonNullable<ChatgptAssetOptions["modelSource"]> }>());
  const previousScope = useRef(draftScope);
  const currentDraft = useRef({ prompt, attachedEntityIds, attachedMaterialIds, model, reasoningEffort, modelSource });
  currentDraft.current = { prompt, attachedEntityIds, attachedMaterialIds, model, reasoningEffort, modelSource };
  useEffect(() => {
    if (previousScope.current === draftScope) return;
    drafts.current.set(previousScope.current, currentDraft.current);
    previousScope.current = draftScope;
    // The first send creates a persistent chat from the initial draft.
    if (queue.isInitialScopeAdoption() && !drafts.current.has(draftScope)) return;
    const draft = drafts.current.get(draftScope);
    promptComposing.current = false;
    setPrompt(draft?.prompt ?? ""); setReasoningEffort(draft?.reasoningEffort ?? null); setModelSource(draft?.modelSource ?? "auto");
    setAttachedEntityIds(draft?.attachedEntityIds ?? []); setAttachedMaterialIds(draft?.attachedMaterialIds ?? []); setEntityDragOver(false);
    if (draft?.model) setModel(draft.model);
    setError(null);
    while (drafts.current.size > 20) drafts.current.delete(drafts.current.keys().next().value!);
  }, [draftScope]);
  useEffect(() => { followingLatest.current = true; }, [draftScope]);
  const selectedModel = models.find(item => item.slug === model);
  const supportedEfforts = selectedModel?.supportedReasoningEfforts ?? [];
  const effectiveEffort = reasoningEffort === "" ? "" : reasoningEffort && supportedEfforts.includes(reasoningEffort) ? reasoningEffort : preferredChatgptReasoningEffort(selectedModel);
  useEffect(() => {
    if (selectedModel) setReasoningEffort(current => current === "" || (current && selectedModel.supportedReasoningEfforts?.includes(current)) ? current : preferredChatgptReasoningEffort(selectedModel) || null);
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
  const refreshBlenderStatus = async (refresh = false) => {
    const epoch = ++blenderEpoch.current;
    setBlenderStatusError(false); setBlenderLoading(true); setBlenderStatus(null);
    try { const next = await getChatgptBlenderStatus({ refresh }); if (mounted.current && blenderEpoch.current === epoch) setBlenderStatus(next); }
    catch { if (mounted.current && blenderEpoch.current === epoch) setBlenderStatusError(true); }
    finally { if (mounted.current && blenderEpoch.current === epoch) setBlenderLoading(false); }
  };
  useEffect(() => { void refreshBlenderStatus(); return () => { blenderEpoch.current++; }; }, []);
  const run = async (action: "login" | "logout" | "generate" | "revert", task: () => Promise<void>) => {
    if (running.current || queue.isDispatching()) return;
    running.current = true; setBusy(action); setError(null);
    try { await task(); }
    catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { running.current = false; if (mounted.current) setBusy(null); }
  };
  const dispatchBlockedReason = disabledReason ?? (externallyBusy ? "現在の処理が終わるまで送信を待っています。"
    : busy ? "現在の操作が終わるまで送信を待っています。"
    : connection?.connecting || connection?.restoring ? "ChatGPTの接続が完了すると送信します。"
    : !connection?.planUsageEnabled ? "ChatGPTに接続すると送信できます。"
    : generation?.status === "running" ? "前の依頼が完了すると順に送信します。"
    : generation?.status === "planned" ? "変更内容の反映または破棄を待っています。" : undefined);
  const queue = useChatgptRequestQueue({ scope: draftScope, sceneScope, generation, selectedModel: model,
    blockedReason: dispatchBlockedReason,
    modelProblem: (request, resolvedModel) => {
      if (!resolvedModel) return "使用するモデルを選ぶと送信できます。";
      if (request.attachedEntityIds?.some(id => !entityById.has(id))) return "添付したEntityが現在のSceneにありません。依頼を取り消し、添付を確認して送り直してください。";
      if (request.attachedMaterialIds?.some(id => materialById.get(id)?.status !== "ready")) return "添付したMaterialを利用できません。依頼を取り消し、現在のAssetsで添付を確認して送り直してください。";
      const available = models.find(item => item.slug === resolvedModel);
      if (!available) return "この依頼で選んだモデルを現在のアカウントで利用できません。送信設定を更新してください。";
      if (request.reasoningEffort && !available.supportedReasoningEfforts?.includes(request.reasoningEffort)) return "この依頼の思考量を現在のモデルで利用できません。送信設定を更新してください。";
      return undefined;
    },
    onDispatch: (request, resolvedModel, expectedScope) => onGenerate(resolvedModel, request.prompt, request.options, request.mode, request.reasoningEffort, expectedScope),
  });
  useEffect(() => {
    const element = conversationElement.current;
    if (element && followingLatest.current) {
      if (!connection?.signedIn) { element.scrollTop = 0; return; }
      const questions = generation?.status === "planned" && generation.plan?.questions?.length ? element.querySelector<HTMLElement>("[data-chatgpt-question-form]") : null;
      element.scrollTop = questions ? element.scrollTop + questions.getBoundingClientRect().top - element.getBoundingClientRect().top : element.scrollHeight;
    }
  }, [draftScope, generation?.generationId, generation?.status, generation?.progress.message, generation?.progress.recentEvents.length, error, statusError, copyNotice, queue.items.length, connection?.signedIn]);
  const generating = busy === "generate" || generation?.status === "running" || queue.dispatching;
  const pending = busy !== null || Boolean(connection?.connecting || connection?.restoring) || generating || externallyBusy;
  const waitingRequests = queue.items.filter(request => request.status !== "running");
  const choicesBusy = busy === "loading" || busy === "login" || busy === "logout" || Boolean(connection?.connecting || connection?.restoring);
  const awaitingQuestions = generation?.status === "planned" && Boolean(generation.plan?.questions?.length);
  const completedBeforePlan = Math.max(0, (generation?.progress.total ?? 0) - (generation?.plan?.objects.length ?? 0));
  const completedInPlan = Math.max(0, (generation?.progress.completed ?? 0) - completedBeforePlan);
  // Keep settings-only saves in order and discard saves from previous plans.
  // Taking the current saves from the end also tolerates trimmed event history.
  const savedEvents = generation?.progress.recentEvents.filter(event => event.saved === true) ?? [];
  const placed = completedInPlan ? savedEvents.slice(-completedInPlan) : [];
  const hasSavedResults = generation?.plan?.objects.some(object => typeof object.saved === "boolean");
  const canRevert = Boolean(generation && generation.status !== "running" && generation.status !== "planned" && generation.revertAvailable && !generation.revertedAt && onRevert);
  const alert = error ?? (queue.items.some(request => request.status === "failed") ? undefined : generation?.error) ?? statusError ?? connectionError ?? connection?.error;
  const connecting = busy === "login" || Boolean(connection?.connecting);
  const restoring = busy === "loading" || Boolean(connection?.restoring);
  const showConnect = !connection?.signedIn;
  const connectAlert = error ?? statusError ?? connection?.error;
  const composerRequest = parseChatgptComposerRequest(prompt);
  const canSubmit = Boolean(composerRequest.prompt);
  const suggestion = useMemo(() => chatgptPromptSuggestions({ generation, entities: entityReferences,
    materials: [...materialById.values()].filter(asset => asset.status === "ready"), attachedEntityIds, attachedMaterialIds,
    blenderAvailable: blenderStatus?.available,
  })[0], [generation, entityReferences, materialById, attachedEntityIds, attachedMaterialIds, blenderStatus?.available]);
  const suggestionContext = JSON.stringify([draftScope, generation?.generationId, generation?.status, generation?.revertedAt,
    attachedEntityIds, attachedMaterialIds, suggestion?.id]);
  const showSuggestions = Boolean(suggestion && !prompt.length && selectedModel && connection?.planUsageEnabled
    && !dispatchBlockedReason && !queue.items.length && !queue.dispatching && !awaitingQuestions && dismissedSuggestions.get(draftScope) !== suggestionContext
    && !attachedEntityIds.some(id => !entityById.has(id)) && !attachedMaterialIds.some(id => materialById.get(id)?.status !== "ready"));
  const dismissSuggestion = () => {
    setDismissedSuggestions(current => {
      const next = new Map(current); next.delete(draftScope); next.set(draftScope, suggestionContext);
      while (next.size > 20) next.delete(next.keys().next().value!);
      return next;
    });
    promptElement.current?.focus();
  };
  const insertSuggestion = (suggestion: ChatgptPromptSuggestion) => {
    setPrompt(suggestion.prompt); setError(null);
    if (suggestion.attachedEntityIds?.length) setAttachedEntityIds(current => [...new Set([...current, ...suggestion.attachedEntityIds!.filter(id => entityById.has(id))])].slice(0, 100));
    if (suggestion.attachedMaterialIds?.length) setAttachedMaterialIds(current => [...new Set([...current, ...suggestion.attachedMaterialIds!.filter(id => materialById.get(id)?.status === "ready")])].slice(0, CHATGPT_MAX_MATERIAL_ATTACHMENTS));
    requestAnimationFrame(() => { promptElement.current?.focus(); promptElement.current?.setSelectionRange(suggestion.prompt.length, suggestion.prompt.length); });
  };
  const send = (request = prompt.trim()) => {
    const parsed = parseChatgptComposerRequest(request);
    if (!parsed.prompt) return;
    queue.enqueue({ id: createDocumentId("chatgpt-request"), model, prompt: parsed.prompt, attachedEntityIds: [...attachedEntityIds], attachedMaterialIds: [...attachedMaterialIds], options: { ...CHATGPT_ALL_ASSETS, modelSource }, mode: parsed.mode, reasoningEffort: effectiveEffort || undefined });
    setPrompt(""); setAttachedEntityIds([]); setAttachedMaterialIds([]); setError(null);
  };
  const attach = (entityIds: string[], materialIds: string[] = []) => {
    const validEntities = entityIds.filter(id => entityById.has(id));
    const validMaterials = materialIds.filter(id => materialById.get(id)?.status === "ready");
    if (!validEntities.length && !validMaterials.length) {
      setError(materialIds.length ? "現在のAssetsで利用できるMaterialを添付してください。" : "このSceneにあるEntity、またはAssetsのMaterialを添付してください。");
      return;
    }
    if (validEntities.length) setAttachedEntityIds(current => [...new Set([...current, ...validEntities])].slice(0, 100));
    if (validMaterials.length) setAttachedMaterialIds(current => [...new Set([...current, ...validMaterials])].slice(0, CHATGPT_MAX_MATERIAL_ATTACHMENTS));
    setError(null);
  };
  const copyOutput = async () => {
    if (!outputElement.current) return;
    try {
      await navigator.clipboard.writeText(chatgptOutputText(outputElement.current));
      if (mounted.current) setCopyNotice("出力をコピーしました");
    } catch {
      if (mounted.current) setCopyNotice("コピーできませんでした。出力の文字を選択してコピーしてください。");
    }
  };
  const connectionControls = onOpenMcp ? <div role="group" aria-label="接続の操作" className="flex shrink-0 items-center gap-1">
    <button type="button" onClick={onOpenMcp} title="AIクライアントとのMCP接続設定を開く" className="flex min-h-8 items-center gap-1 rounded-full px-2 py-1.5 text-[11px] text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><Plug size={13} aria-hidden="true" /><span>MCP接続</span></button>
  </div> : null;
  return <section aria-label="ワールド制作のチャット" className={`flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto ${entityDragOver ? "rounded-lg ring-2 ring-brand-400" : ""}`}
    onDragOverCapture={event => {
      if (!ATTACHMENT_DRAG_MIMES.some(mime => hasEditorDragData(event.dataTransfer, mime))) return;
      event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "copy"; setEntityDragOver(true);
    }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setEntityDragOver(false); }}
    onDropCapture={event => {
      const entityIds = readEditorEntityIds(event.dataTransfer), materialIds = readEditorMaterialIds(event.dataTransfer);
      if (!entityIds.length && !materialIds.length && !ATTACHMENT_DRAG_MIMES.some(mime => hasEditorDragData(event.dataTransfer, mime))) return;
      event.preventDefault(); event.stopPropagation(); setEntityDragOver(false); clearEditorDragData(); attach(entityIds, materialIds);
    }}>
    <header className="flex shrink-0 items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 font-medium text-slate-800"><Bot size={16} aria-hidden="true" /><span>制作アシスタント</span></div>
      <div className="flex items-center gap-1">
      <button type="button" onClick={() => void copyOutput()} aria-label="出力をコピー" title="出力をコピー（変更内容・作業記録・案内・操作名を含む）" className="flex size-8 shrink-0 items-center justify-center rounded text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"><Copy size={15} aria-hidden="true" /></button>
      {connection?.signedIn ? <details className="relative">
        <summary aria-label="ChatGPTアカウント" title="ChatGPTアカウント" className="flex size-8 cursor-pointer list-none items-center justify-center rounded-full hover:bg-slate-100"><UserRound size={16} aria-hidden="true" /></summary>
        <div className="absolute right-0 top-9 z-10 w-60 space-y-2 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
          <p className="break-words text-slate-700">接続中：{connection.email ?? "ChatGPTアカウント"}</p>
          <p className="text-[11px] leading-4 text-slate-500">接続情報はOSの保護された領域に保存されます。</p>
          <button type="button" disabled={pending} onClick={() => void run("logout", async () => sync(await tauri.chatgptLogout()))} className="rounded px-1 py-1.5 underline underline-offset-2 disabled:opacity-50">接続を解除</button>
        </div>
      </details> : null}
      {onClose ? <button type="button" onClick={onClose} aria-label="制作チャットを閉じる" title="制作チャットを閉じる"
        className="flex min-h-8 items-center gap-1 rounded px-2 text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
        <X size={14} aria-hidden="true" /><span>閉じる</span>
      </button> : null}
      </div>
    </header>
    {onExpandedChange ? <div role="group" aria-label="制作チャットの表示" className="grid shrink-0 grid-cols-2 gap-1 rounded-lg bg-editor-subtle p-1">
      {[{ expanded: false, label: "Sceneを広く", title: "Scene Viewを広く表示し、Inspectorの上にチャットを戻す" },
        { expanded: true, label: "チャットを広く", title: "Scene Viewを小さくして、チャットを幅広く画面の高さまで表示する" }].map(option => <button
          key={option.label} type="button" aria-pressed={expanded === option.expanded} title={option.title}
          onClick={() => onExpandedChange(option.expanded)}
          className={`min-h-8 rounded-md px-2 py-1 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${expanded === option.expanded ? "bg-editor-surface text-editor-text shadow-sm" : "text-editor-muted hover:bg-editor-surface/60"}`}
        >{option.label}</button>)}
    </div> : null}
    {sessionActions ? <ChatgptSessionBar {...sessionActions} disabled={pending} /> : null}
    {copyNotice ? <p role="status" className="shrink-0 select-text text-[11px] leading-4 text-slate-600">{copyNotice}</p> : null}
    {historyError ? <p role="alert" className="shrink-0 text-[11px] leading-4 text-amber-800">{historyError}</p> : null}
    <div ref={outputElement} role="region" aria-label="コピーできる制作出力" tabIndex={0} className="flex min-h-24 flex-1 select-text flex-col gap-3 [&_button]:select-text [&_summary]:select-text"
      onKeyDown={event => {
        // Output selection/copying must not trigger Scene shortcuts.
        event.stopPropagation();
        if ((event.target as HTMLElement).closest("input, textarea, select, [contenteditable='true']")) return;
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
          event.preventDefault();
          const selection = window.getSelection(), range = document.createRange();
          range.selectNodeContents(event.currentTarget); selection?.removeAllRanges(); selection?.addRange(range);
        }
      }}>
    <div ref={conversationElement} onScroll={event => { const element = event.currentTarget; followingLatest.current = !connection?.signedIn || element.scrollHeight - element.clientHeight - element.scrollTop < 32; }} className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${showConnect ? "flex flex-col" : "space-y-3"}`} aria-label="制作の会話と結果">
      {showConnect ? <div className="my-auto flex shrink-0 flex-col items-center gap-2 px-2 py-2 text-center" aria-label="ChatGPTの接続">
        {!waitingRequests.length ? <div className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Bot size={21} aria-hidden="true" /></div> : null}
        {!waitingRequests.length ? <h3 className="text-sm font-medium text-slate-800">Sceneの編集を一緒に</h3> : null}
        {!waitingRequests.length ? <p className="max-w-sm leading-5 text-slate-500">小さな調整から相談して、<br />結果を見ながら進めましょう。</p> : null}
        <button type="button" disabled={pending} onClick={() => void run("login", async () => { modelAccount.current = null; await sync(await tauri.chatgptLogin()); })} className="flex min-h-10 items-center justify-center gap-2 rounded-full bg-slate-900 px-5 py-2 font-medium text-white hover:bg-slate-700 disabled:opacity-60">
          {connecting || restoring ? <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
          {restoring ? "接続を確認中…" : connecting ? "接続中…" : "ChatGPTに接続"}
        </button>
        {restoring ? <p role="status" className="leading-5 text-slate-500">保存した接続を確認しています…</p> : connecting ? <p role="status" className="leading-5 text-slate-500">ブラウザで許可すると、この画面で編集を始められます。</p> : null}
        {connectAlert ? <p role="alert" className="w-full max-w-md break-words rounded-lg bg-rose-50 p-2.5 text-left leading-5 text-rose-700">{connectAlert}</p> : null}
      </div> : <>
      {conversation.filter(turn => turn.generationId !== generation?.generationId).map(turn => <div key={turn.generationId} className="space-y-2">
        {turn.mode === "goal" ? <p className="text-[11px] font-medium text-slate-500">Goal · {turn.goal?.iteration ?? 1}回</p> : null}
        <p className="ml-5 whitespace-pre-wrap break-words rounded-xl bg-slate-100 px-3 py-2.5 text-slate-800">{turn.prompt}</p>
        {turn.attachedEntities?.length ? <p className="break-words text-[11px] text-slate-500">添付：{turn.attachedEntities.map(entity => entity.name).join("、")}（配下を優先）</p> : null}
        {turn.attachedMaterials?.length ? <p className="break-words text-[11px] text-slate-500">添付Material：{turn.attachedMaterials.map(material => material.name).join("、")}</p> : null}
        {!chatgptProgressIsRecorded(turn.progress.message, turn.progress.recentEvents) ? <p className="break-words leading-5 text-slate-500">{formatChatgptProgressMessage(turn.progress.message)}</p> : null}
        {turn.plan ? <div className="space-y-2">
          <p className="whitespace-pre-wrap break-words leading-5 text-slate-500">{turn.plan.description}</p>
          <ol className="space-y-1" aria-label="過去の依頼の作業結果">{turn.plan.objects.map((object, index) => <li key={index} className="min-w-0 rounded bg-slate-50 px-2 py-1.5">
            <p className="break-words text-slate-700">{object.name}{object.settings?.length ? null : `（${object.shape}）`}</p>
            {object.settings?.length ? <ChatgptPlanSettings settings={object.settings} /> : object.detail ? <p className="mt-1 break-words text-[11px] leading-4 text-slate-500">{object.detail}</p> : null}
            {object.preview ? <figure aria-label={`${object.preview.name}の素材プレビュー`} data-chatgpt-result-preview className="mt-2 aspect-video w-full max-w-72 overflow-hidden rounded-md"><ChatgptChoiceThumbnail preview={object.preview} assets={assets} projectPath={projectPath} /></figure> : null}
          </li>)}</ol>
        </div> : null}
        <ChatgptWorkLog events={turn.progress.recentEvents} currentMessage={turn.progress.message} />
        {turn.error ? <p className="break-words text-rose-700">{turn.error}</p> : null}
        {turn.clarifications?.length ? <details><summary className="cursor-pointer text-[11px] text-slate-500">確認した内容</summary><dl className="mt-2 space-y-2 text-[11px]">{turn.clarifications.map((item, index) => <div key={index}><dt className="break-words text-slate-500">{item.question}</dt><dd className="break-words text-slate-700">{item.answer}</dd></div>)}</dl></details> : null}
      </div>)}
      {!generation ? <p className="leading-5 text-slate-500">今のSceneの編集を手伝います。小さな調整から依頼して、結果を見ながら進めましょう。</p> : <>
        {generation.mode === "goal" ? <p aria-label="Goalの進行状況" className="text-[11px] font-medium text-slate-600">Goal · {generation.goal?.iteration ?? 1}回目{generation.status === "running" ? " · 制作と見直しを継続中" : ""}</p> : null}
        <p className="ml-5 whitespace-pre-wrap break-words rounded-xl bg-slate-100 px-3 py-2.5 text-slate-800">{generation.prompt}</p>
        {generation.attachedEntities?.length ? <p className="break-words text-[11px] text-slate-500">添付：{generation.attachedEntities.map(entity => entity.name).join("、")}（配下を優先）</p> : null}
        {generation.attachedMaterials?.length ? <p className="break-words text-[11px] text-slate-500">添付Material：{generation.attachedMaterials.map(material => material.name).join("、")}</p> : null}
        <div className="space-y-2 px-0.5">
          {generation.cancelling || !chatgptProgressIsRecorded(generation.progress.message, generation.progress.recentEvents) ? <p role="status" aria-live="polite" className="break-words leading-5 text-slate-700">{generation.cancelling ? "現在の処理を安全に終えて停止しています…" : formatChatgptProgressMessage(generation.progress.message)}</p> : null}
          {generation.clarifications?.length ? <details><summary className="cursor-pointer text-[11px] text-slate-500">確認した内容</summary><dl className="mt-2 space-y-2 text-[11px]">{generation.clarifications.map((item, index) => <div key={index}><dt className="break-words text-slate-500">{item.question}</dt><dd className="break-words text-slate-700">{item.answer}</dd></div>)}</dl></details> : null}

          {(generation.progress.total > 0 || canRevert) && generation.status !== "planned" ? <div role="group" aria-label="この依頼の保存と取り消し" className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-slate-500">{generation.revertedAt ? "変更を戻しました" : generation.mode === "goal" ? `保存済み ${generation.progress.completed}件` : `保存済み ${generation.progress.completed} / ${generation.progress.total}`}</p>
              {canRevert && onRevert ? <button type="button" disabled={pending || Boolean(disabledReason)} title="この依頼で反映したすべての変更を元に戻して保存します" onClick={() => void run("revert", async () => { await onRevert(generation.generationId); })} className="flex min-h-8 items-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-[11px] text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50"><Undo2 size={13} aria-hidden="true" />この依頼の変更を戻す</button> : null}
            </div>
            {!generation.revertedAt && generation.mode !== "goal" && generation.progress.total > 0 ? <progress aria-label="依頼の反映と保存" value={generation.progress.completed} max={generation.progress.total} className="h-1 w-full accent-brand-600" /> : null}
          </div> : null}
          {generation.plan ? <div className="space-y-2">
            <p className="break-words leading-5 text-slate-500">{generation.plan.description}</p>
          {generation.status === "planned" && generation.plan?.questions?.length && onAnswerQuestions ? <ChatgptQuestionForm key={generation.generationId + JSON.stringify(generation.plan.questions)} questions={generation.plan.questions} previews={generation.questionPreviews} assets={assets} projectPath={projectPath} disabled={pending || Boolean(disabledReason)} onAnswer={answers => { followingLatest.current = true; void run("generate", () => onAnswerQuestions(generation.generationId, answers)); }} /> : null}
            {generation.plan.hasMore ? <p className="mt-2 break-words leading-5 text-slate-500">この後：{generation.plan.remainingWork || "結果を確認して、続きの作業を進めます。"}</p> : null}
            <ol className="mt-2 space-y-1" aria-label="依頼の作業結果">{generation.plan.objects.map((object, index) => {
              const event = hasSavedResults ? object.saved ? { entityId: object.entityId } : undefined : placed[index];
              const material = object.materialAssetId ? materialById.get(object.materialAssetId) : undefined;
              const lastMaterialEdit = material && !generation.plan!.objects.slice(index + 1).some(item => item.materialAssetId === material.id);
              const sceneSections = (object.sceneSettingsSections ?? []).filter(section => !generation.plan!.objects.slice(index + 1).some(item => item.sceneSettingsSections?.includes(section)));
              return <li key={index} className="min-w-0 rounded bg-slate-50 px-2 py-1.5">
                <div className="flex min-w-0 items-center justify-between gap-2">
                <div className="min-w-0">{event?.entityId && onSelectEntity ? <button type="button" onClick={() => onSelectEntity(event.entityId!)} aria-label={`${object.name}をInspectorで表示`} className="min-w-0 break-words text-left text-brand-700 underline underline-offset-2">{object.name}</button> : <span className="min-w-0 break-words">{object.name}</span>}
                {!object.settings?.length && object.detail ? <p className="mt-1 break-words text-[11px] leading-4 text-slate-500">{object.detail}</p> : null}</div>
                <span className="shrink-0 text-[11px] text-slate-500">{event ? generation.revertedAt ? "取り消し済み" : "反映済み" : object.shape === "調整" ? "調整" : "追加"}</span>
                </div>
                {object.settings?.length ? <ChatgptPlanSettings settings={object.settings} /> : null}
                {object.preview ? <figure aria-label={`${object.preview.name}の素材プレビュー`} data-chatgpt-result-preview className="mt-2 aspect-video w-full max-w-72 overflow-hidden rounded-md"><ChatgptChoiceThumbnail preview={object.preview} assets={assets} projectPath={projectPath} /></figure> : null}
                {lastMaterialEdit && material.status === "ready" && generation.status === "completed" && !generation.revertedAt && onMaterialChange
                  ? <ChatgptMaterialControls key={material.id} material={material} onChange={onMaterialChange} disabled={pending || Boolean(disabledReason)} /> : null}
                {sceneSections.length && sceneSettings && assets && onSceneSettingsChange && generation.status === "completed" && !generation.revertedAt
                  ? <ChatgptSceneControls settings={sceneSettings} sections={sceneSections} assets={assets} onChange={onSceneSettingsChange} disabled={pending || Boolean(disabledReason)} /> : null}
              </li>;
            })}</ol>
            {generation.status === "planned" && !generation.plan.questions?.length && onApplyPlan ? <button type="button" disabled={pending || Boolean(disabledReason)} onClick={() => void run("generate", () => onApplyPlan(generation.generationId))} className="mt-3 w-full rounded-md bg-brand-600 px-3 py-2 font-semibold text-white disabled:bg-slate-200 disabled:text-slate-500">変更を反映</button> : null}
            {generation.status === "planned" && onCancel ? <button type="button" disabled={pending} onClick={() => { queue.pause("変更を破棄したため、送信待ちの依頼を保留しています。"); void onCancel(generation.generationId).catch(e => setError(e instanceof Error ? e.message : String(e))); }} className="mt-1 w-full rounded-md px-3 py-2 text-slate-500 hover:bg-slate-50 disabled:opacity-50">変更を破棄</button> : null}
          </div> : null}
          <ChatgptWorkLog events={generation.progress.recentEvents} currentMessage={generation.progress.message} />
          {(generation.status === "failed" || generation.status === "cancelled") && !generation.revertedAt && generation.projectId ? <p className="leading-5 text-slate-500">保存済みの変更は残っています。結果を確認して、次の依頼を送れます。</p> : null}
        </div>
      </>}
      {connection?.restoring ? <p role="status">保存した接続を確認しています…</p> : connection?.connecting ? <p role="status">ブラウザで許可すると、接続状態が更新されます。</p> : null}
      {connection?.signedIn && !connection.planUsageEnabled ? <p className="text-amber-800">ChatGPTプランの利用許可がありません。接続を解除してから、再接続して許可してください。</p> : null}
      {alert ? <p role="alert" className="rounded-lg bg-rose-50 p-2.5 leading-5 text-rose-700">{alert}</p> : null}
      </>}
      {disabledReason ? <p className="leading-5 text-amber-800">{disabledReason}</p> : null}
    {waitingRequests.length ? <section aria-label="送信待ちの依頼" className="shrink-0 space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2">
      <div className="flex items-center justify-between gap-2"><span className="text-[11px] text-slate-600">送信待ち {waitingRequests.length}件</span>
        {queue.pauseReason ? <button type="button" onClick={queue.resume} className="rounded px-2 py-1 text-[11px] text-brand-700 hover:bg-slate-100">{waitingRequests[0].status === "failed" ? "再試行" : "再開"}</button> : null}
      </div>
      <ol className={`${showConnect ? "max-h-12" : "max-h-32"} space-y-1 overflow-y-auto`}>{waitingRequests.map(request => <li key={request.id} className="flex items-start gap-2">
        <div className="min-w-0 flex-1"><p className="line-clamp-2 whitespace-pre-wrap break-words text-[11px] text-slate-700">{request.prompt}</p>
          {request.attachedEntityIds?.length ? <p className="break-words text-[11px] text-slate-500">添付：{request.attachedEntityIds.map(id => entityById.get(id)?.name ?? "削除されたEntity").join("、")}</p> : null}
          {request.attachedMaterialIds?.length ? <p className="break-words text-[11px] text-slate-500">添付Material：{request.attachedMaterialIds.map(id => materialById.get(id)?.name ?? "削除されたMaterial").join("、")}</p> : null}
          {request.error ? <p role="alert" className="break-words text-[11px] text-rose-700">{request.error}</p> : null}
          {(request.model && (!models.some(item => item.slug === request.model) || Boolean(request.reasoningEffort && !models.find(item => item.slug === request.model)?.supportedReasoningEfforts?.includes(request.reasoningEffort)))) || (request.options.modelSource === "blender" && !blenderStatus?.available) ? <button type="button" disabled={!selectedModel} onClick={() => queue.configure(request.id, model, effectiveEffort || undefined, { ...request.options, modelSource })} className="mt-1 rounded px-1 py-0.5 text-[11px] text-brand-700 disabled:opacity-50">送信設定を更新</button> : null}
        </div>
        <button type="button" aria-label="送信待ちの依頼を取り消す" title="送信待ちの依頼を取り消す" onClick={() => queue.cancel(request.id)} className="rounded p-1 text-slate-500 hover:bg-slate-200"><X size={13} aria-hidden="true" /></button>
      </li>)}</ol>
      {queue.blockedReason ? <p className="break-words text-[11px] leading-4 text-slate-500">{queue.blockedReason}</p> : null}
    </section> : null}
    </div>
    </div>
    {awaitingQuestions ? connectionControls : null}
    <form hidden={awaitingQuestions} onSubmit={e => { e.preventDefault(); if (canSubmit) send(); }} className="shrink-0 rounded-xl border border-slate-300 bg-white p-2.5 focus-within:border-slate-500">
      {composerRequest.mode === "goal" ? <p className="mb-2 text-[11px] leading-4 text-slate-600">Goal：目標に向けて制作と見直しを続けます。停止ボタンで終了できます。</p> : null}
      {showSuggestions && suggestion ? <div aria-label="入力候補" className="mb-2 flex min-w-0 items-center gap-2 text-[11px] text-slate-500">
        <span id={suggestionsId} className="min-w-0 flex-1 truncate" title={suggestion.prompt}>{suggestion.label}</span>
        <kbd className="shrink-0 rounded border border-slate-200 px-1 text-[10px]" aria-label="Tabで候補を入力">Tab</kbd>
        <button type="button" onClick={dismissSuggestion} aria-label="入力候補を閉じる" title="入力候補を閉じる"
          className="flex size-6 shrink-0 items-center justify-center rounded hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"><X size={13} aria-hidden="true" /></button>
      </div> : null}
      {attachedEntityIds.length || attachedMaterialIds.length ? <div className="mb-2 space-y-2">
      {attachedEntityIds.length ? <div aria-label="添付したEntity" className="space-y-1">
        <ul className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">{attachedEntityIds.map(id => <li key={id} className="flex max-w-full items-center gap-1 rounded-md border border-slate-200 bg-slate-50 py-1 pl-2 pr-1 text-[11px]">
          <span className="shrink-0 text-[10px] text-slate-400">Entity</span>
          <span className={`truncate ${entityById.has(id) ? "text-slate-700" : "text-rose-700"}`}>{entityById.get(id)?.name ?? "削除されたEntity"}</span>
          <button type="button" aria-label={`${entityById.get(id)?.name ?? "削除されたEntity"}の添付を外す`} onClick={() => setAttachedEntityIds(current => current.filter(value => value !== id))} className="shrink-0 rounded p-0.5 text-slate-500 hover:bg-slate-200"><X size={12} aria-hidden="true" /></button>
        </li>)}</ul>
        <p className="text-[10px] leading-4 text-slate-500">配下を含む{attachmentScopeIds.length}件を優先して参照します{attachmentScopeIds.length > 100 ? "（送信量に応じて一部を参照）" : ""}</p>
      </div> : null}
      {attachedMaterialIds.length ? <div aria-label="添付したMaterial" className="space-y-1">
        <ul className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">{attachedMaterialIds.map(id => <li key={id} className="flex max-w-full items-center gap-1 rounded-md border border-slate-200 bg-slate-50 py-1 pl-2 pr-1 text-[11px]">
          <span className="shrink-0 text-[10px] text-slate-400">Material</span>
          <span className={`truncate ${materialById.get(id)?.status === "ready" ? "text-slate-700" : "text-rose-700"}`}>{materialById.get(id)?.name ?? "削除されたMaterial"}</span>
          <button type="button" aria-label={`${materialById.get(id)?.name ?? "削除されたMaterial"}のMaterial添付を外す`} onClick={() => setAttachedMaterialIds(current => current.filter(value => value !== id))} className="shrink-0 rounded p-0.5 text-slate-500 hover:bg-slate-200"><X size={12} aria-hidden="true" /></button>
        </li>)}</ul>
        <p className="text-[10px] leading-4 text-slate-500">Material自体の設定を編集対象にします（最大{CHATGPT_MAX_MATERIAL_ATTACHMENTS}件）。</p>
      </div> : null}
      </div> : <p className="mb-1 text-[10px] leading-4 text-slate-400">EntityやMaterialをドロップして編集対象を添付</p>}
      <textarea ref={promptElement} aria-label="ワールドへの依頼" title="Enterで送信、Shift+Enterで改行" aria-describedby={showSuggestions ? suggestionsId : undefined}
        value={prompt} maxLength={2000} onChange={e => setPrompt(e.target.value)} onCompositionStart={() => { promptComposing.current = true; }} onCompositionEnd={() => { promptComposing.current = false; }} onBlur={() => { promptComposing.current = false; }}
        onPaste={event => { if (!event.clipboardData?.getData("text/plain").includes('"xrift-studio/editor-drag"')) return; const entityIds = readEditorEntityIds(event.clipboardData), materialIds = readEditorMaterialIds(event.clipboardData); if (entityIds.length || materialIds.length) { event.preventDefault(); attach(entityIds, materialIds); } }}
        onKeyDown={event => {
          if (promptComposing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
          if (showSuggestions && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
            if (event.key === "Tab" && suggestion) { event.preventDefault(); insertSuggestion(suggestion); return; }
            if (event.key === "Escape") {
              event.preventDefault(); event.stopPropagation(); dismissSuggestion(); return;
            }
          }
          if (event.key !== "Enter" || event.shiftKey) return;
          event.preventDefault();
          if (canSubmit) event.currentTarget.form?.requestSubmit();
        }} rows={3} placeholder={showSuggestions && suggestion ? suggestion.prompt : "このSceneで変えたいところ、追加したいもの"} className="block w-full resize-none border-0 bg-transparent p-0 leading-5 text-slate-800 outline-none placeholder:text-slate-400" />
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
        <div className="flex min-w-0 flex-[1_1_16rem] items-center gap-1.5">
        <select aria-label="ワールド制作のモデル" disabled={choicesBusy || !models.length} value={model} onChange={e => setModel(e.target.value)} className="min-w-0 flex-1 rounded-full border-0 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
          {!models.length ? <option value="">{busy === "loading" ? "確認中…" : "モデル"}</option> : models.map(m => <option key={m.slug} value={m.slug}>{m.displayName}</option>)}
        </select>
        {connection?.planUsageEnabled ? <select aria-label="思考量" title="少なめの思考量で速さを優先、多めでじっくり検討します" disabled={choicesBusy || !supportedEfforts.length} value={effectiveEffort} onChange={e => setReasoningEffort(e.target.value)} className="min-w-0 max-w-[55%] flex-1 rounded-full border-0 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-60">
          <option value="">思考量：モデルの既定</option>
          {supportedEfforts.map(effort => <option key={effort} value={effort}>{effortLabels[effort] ?? effort}</option>)}
        </select> : null}
        </div>
        <label className="flex items-center gap-1.5 rounded-full bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600">
          <input type="checkbox" aria-label="コード・Blenderで制作" title="コードで形状を組み立て、必要に応じてBlenderも使います。" checked={modelSource !== "store"} disabled={choicesBusy} onChange={event => setModelSource(event.target.checked ? "auto" : "store")} className="accent-slate-700" />コード・Blenderで制作
        </label>
        {connectionControls}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">{generating && onCancel && generation?.status === "running" ? <button type="button" aria-label="制作を停止" title="制作を停止" disabled={generation.cancelling} onClick={() => { queue.pause("制作を停止したため、送信待ちの依頼を保留しています。"); setError(null); void onCancel(generation.generationId).catch(e => setError(e instanceof Error ? e.message : String(e))); }} className="flex size-8 items-center justify-center rounded-full bg-slate-900 text-white disabled:opacity-50"><Square size={12} fill="currentColor" aria-hidden="true" /></button> : null}
        <button type="submit" aria-label="依頼を送信" title={dispatchBlockedReason || queue.dispatching ? "送信待ちへ追加" : "依頼を送信"} disabled={!canSubmit} className="flex size-8 items-center justify-center rounded-full bg-slate-900 text-white disabled:bg-slate-100 disabled:text-slate-400"><ArrowUp size={16} aria-hidden="true" /></button></div>
      </div>
      {!blenderStatus?.available ? <div className="mt-1 flex items-center justify-between gap-2 text-[10px] leading-4 text-slate-500"><span>{blenderLoading ? "Blenderを確認しています。コードでの制作は利用できます。" : blenderStatusError ? "Blenderを確認できませんでした。コードでの制作は利用できます。" : "Blenderは未導入です。コードでの制作は利用できます。"}</span>
        {!blenderLoading ? <button type="button" onClick={() => void refreshBlenderStatus(true)} className="shrink-0 rounded px-1 py-0.5 underline underline-offset-2">Blenderを再確認</button> : null}
      </div> : null}
    </form>
    <p className="text-[10px] leading-4 text-slate-400">ChatGPTの利用枠を使用します。変更はこのワールドに保存されます。</p>
  </section>;
}
