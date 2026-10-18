import { getMaterialAsset } from "./asset-manifest";
import { getChatgptPlanningBlenderStatus } from "./chatgpt-blender-status";
import { chatgptCandidatePreview, chatgptChoicePreviews } from "./chatgpt-choice-previews";
import { chatgptMaterialSettingsDisplay, describeChatgptEntityEdit, sceneSettingsDisplay } from "./chatgpt-change-description";
import { isChatgptEditorAction, parseChatgptMaterialProperties, parseChatgptSceneSettings } from "./chatgpt-editor-actions";
import { MATERIAL_SHOWCASE_DEFINITIONS, materialShowcaseAssetId, getMaterialShowcaseAsset } from "./material-showcase-catalog";
import { ensureCatalogMaterialTextures } from "./asset-import-persistence";
import { applyExternalStoreInstallAndAnalyzeModel } from "./external-store";
import { parseChatgptWorldPlan, chatgptAssetRequests, type ChatgptWorldPlan } from "./chatgpt-world";
import { applyChatgptOperation, createChatgptScaffold, editChatgptEntity, placeChatgptObject, rebaseChatgptStep, type ChatgptGeneration, type ChatgptGenerationEvent, type ChatgptGenerationMode } from "./chatgpt-generation";
import { buildChatgptHarnessContext, chatgptHarnessSceneFingerprint } from "./chatgpt-harness-context";
import { createChatgptHarnessRun, type ChatgptHarnessRun, type ChatgptHarnessKind } from "./chatgpt-harness-runtime";


import { hasAuthoringRunOwner, readAuthoringState } from "./world-authoring";
import { prepareChatgptHarnessContext, restoreChatgptHarnessContext } from "./chatgpt-harness-context-archive";
import { createChatgptHarnessContextStore } from "./chatgpt-harness-context-tauri";

import { authoringActionFingerprint } from "./authoring-action";
import { authoringSceneProgressFingerprint } from "./authoring-scene-progress";
import { describeSkippedAuthoringChanges } from "./authoring-noop";

import { assertChatgptPlanCurrent, assertChatgptPlanningCurrent, ChatgptSceneConflictError, chatgptOperationDetail, chatgptOperationLabel, chatgptOperationProgress, chatgptPlanSnapshots, chatgptPlanningSnapshot } from "./chatgpt-plan-guards";
import { CHATGPT_SCENE_REPLAN_LIMIT, chatgptAgentConversation, chatgptSceneRetryConversation, type ChatgptSceneRetry } from "./chatgpt-live-scene";


import { ChatgptPlanInputError, isChatgptPlanInputError } from "./chatgpt-plan-recovery";
import { chatgptReferenceKey, type ChatgptResourceContext } from "./chatgpt-resources";
import { chatgptConversationContext, createChatgptSession, extendChatgptRevertCheckpoint, upsertChatgptSessionTurn } from "./chatgpt-sessions";
import { tauri, type ChatgptAssetOptions, type Project } from "../tauri";
import { createPreparedStarterVisualProjectOnDisk, prepareStarterVisualProject, type PrototypeVisualProject } from "../visual-editor";
import type { VisualEditorMcpProjectBridge } from "../../components/visual-editor/VisualEditorPrototype";
import type { ToastInput } from "../../components/Toast";
import type { ChatgptSession, ChatgptRevertCheckpoint } from "./chatgpt-sessions";

type HostRef<T> = { current: T };
type HostVisualSession = { bundle: PrototypeVisualProject; project: Project | null };
export type ChatgptPassRetry = { retry: ChatgptSceneRetry; target: "current" | "new"; sessionId?: string };
export type ChatgptAuthoringHost = {
  chatgptGenerationRef: HostRef<string | null>;
  mcpPublishActiveRef: HostRef<boolean>; mcpModelingActiveRef: HostRef<boolean>;
  visualSessionRef: HostRef<HostVisualSession | null>; projectsRoot: string | null;
  requireMcpProjectBridge: (tool: string) => VisualEditorMcpProjectBridge;
  mcpProjectBridgeRef: HostRef<VisualEditorMcpProjectBridge | null>;
  chatgptSessionsRef: HostRef<ChatgptSession[]>; selectedChatgptSessionIdRef: HostRef<string | undefined>;
  updateChatgptSessions: (sessions: ChatgptSession[], flush?: boolean) => void; selectChatgptSession: (id: string | undefined) => void;
  flushChatgptSessions: () => void;
  chatgptHarnessRunsRef: HostRef<Map<string, ChatgptHarnessRun>>;
  chatgptGenerationsRef: HostRef<Map<string, ChatgptGeneration>>;
  chatgptControlsRef: HostRef<Map<string, { cancelled: boolean }>>;
  chatgptPlansRef: HostRef<Map<string, { plan: ChatgptWorldPlan; snapshots: Record<string, string>; resources: ChatgptResourceContext; target: "current" | "new" }>>;
  chatgptRevertsRef: HostRef<Map<string, ChatgptRevertCheckpoint>>;
  setChatgptGeneration: (job: ChatgptGeneration | null) => void;
  recordChatgptGeneration: (job: ChatgptGeneration, flush?: boolean) => void;
  uniqueProjectDirectoryName: (root: string, name: string) => Promise<string>;
  setVisualCompilationFresh: (value: boolean) => void; setVisualThumbnailReadiness: (value: null) => void;
  setVisualSession: (value: HostVisualSession | null) => void;
  waitForMcpProjectBridge: (previous: VisualEditorMcpProjectBridge | null, expected?: { projectId: string; sceneId: string }, assertWaiting?: () => void) => Promise<VisualEditorMcpProjectBridge>;
  refreshProjects: () => Promise<void>; toast: (value: ToastInput) => void;
};

/** Scene/native adapters for the UI-independent authoring runtime. */
export function createChatgptAuthoringPass(host: ChatgptAuthoringHost) {
 const { chatgptGenerationRef, mcpPublishActiveRef, mcpModelingActiveRef, visualSessionRef, projectsRoot, requireMcpProjectBridge, chatgptSessionsRef, selectedChatgptSessionIdRef, updateChatgptSessions, selectChatgptSession, chatgptGenerationsRef, chatgptControlsRef, chatgptPlansRef, chatgptRevertsRef, setChatgptGeneration, recordChatgptGeneration, mcpProjectBridgeRef, uniqueProjectDirectoryName, setVisualCompilationFresh, setVisualThumbnailReadiness, setVisualSession, waitForMcpProjectBridge, refreshProjects, toast, flushChatgptSessions, chatgptHarnessRunsRef } = host;
 return async (model: string, prompt: string, options: ChatgptAssetOptions, generationId: string = crypto.randomUUID(), mode: ChatgptGenerationMode = "build", target: "current" | "new" = "current", approved?: ChatgptWorldPlan, reasoningEffort?: string, requestedSessionId?: string, sceneRetry?: ChatgptSceneRetry, attachedEntityIds: readonly string[] = [], attachedMaterialIds: readonly string[] = []): Promise<Project | null | ChatgptPassRetry> => {
    if (chatgptGenerationRef.current) throw new Error("制作の依頼を処理中です。完了するか停止してから、次の依頼を送ってください");
    if (mcpPublishActiveRef.current) throw new Error("公開を処理中です。完了してから制作の依頼を送ってください");
    if (mcpModelingActiveRef.current) throw new Error("モデルを作成しています。完了すると制作を続けられます");
    const sourceId = visualSessionRef.current?.bundle.project.projectId;
    if (!sourceId || !projectsRoot || !tauri.isAvailable()) throw new Error("デスクトップ版でワールドを開いてください");
    const sourceBridge = requireMcpProjectBridge("ChatGPTの制作チャット");
    const sourceSceneId = sourceBridge.currentBundle().scene.sceneId;
    if (sourceBridge.currentBundle().project.projectId !== sourceId) throw new Error("作品の切り替えが終わるまで依頼を保留します。対象のチャットから再開してください");
    if (sourceBridge.currentBundle().project.projectKind !== "world") throw new Error("ワールドのプロジェクトを開いてください");
    if (!sourceBridge.currentContext().canGenerate) throw new Error("Playを停止し、素材の読み込み完了を待ってから依頼を送ってください");
    const scopedSessions = chatgptSessionsRef.current.filter(session => session.projectId === sourceId && session.sceneId === sourceSceneId);
    let chatSession = scopedSessions.find(session => session.id === (requestedSessionId ?? selectedChatgptSessionIdRef.current)) ?? (requestedSessionId ? undefined : scopedSessions[0]);
    if (requestedSessionId && !chatSession) throw new Error("このSceneのチャットを選んでください");
    if (!chatSession) {
      chatSession = createChatgptSession(sourceId, sourceSceneId);
      updateChatgptSessions([chatSession, ...chatgptSessionsRef.current].slice(0, 20), true);
    }
    if (!sceneRetry) selectChatgptSession(chatSession.id);
    const sessionId = chatSession.id;
    const conversation = sceneRetry?.conversation ?? chatgptConversationContext(chatSession);
    const previousJob = chatgptGenerationsRef.current.get(generationId);
    const requestEntityIds = approved || sceneRetry ? previousJob?.attachedEntities?.map(entity => entity.id) ?? [] : [...new Set(attachedEntityIds)].slice(0, 100);
    const requestMaterialIds = approved || sceneRetry ? previousJob?.attachedMaterials?.map(material => material.id) ?? [] : [...new Set(attachedMaterialIds)].slice(0, 16);
    const completedBefore = sceneRetry?.completed ?? (approved ? previousJob?.progress.completed ?? 0 : 0);
    chatgptGenerationRef.current = generationId;
    const control = { cancelled: false };
    chatgptControlsRef.current.set(generationId, control);
    let job: ChatgptGeneration = { ...previousJob, generationId, sessionId, createdAt: previousJob?.createdAt ?? new Date().toISOString(), status: "running", mode, cancelling: false, error: undefined, model, reasoningEffort, prompt, options: { ...options }, sourceProjectId: sourceId, sourceSceneId, sceneId: sourceSceneId,
      
      attachedEntities: requestEntityIds.map(id => ({ id, name: sourceBridge.currentBundle().scene.entities[id]?.name ?? id })),
      attachedMaterials: requestMaterialIds.map(id => ({ id, name: sourceBridge.currentBundle().assets.assets[id]?.name ?? id })),
      progress: { phase: "planning", message: sceneRetry?.reason === "agent" ? "最新のSceneを見て、残りの変更を考えています" : sceneRetry?.reason === "clarification" ? "回答を基に、現在のSceneから制作内容を考えています" : sceneRetry?.reason === "plan-input" ? "利用できる素材と設定を確認し、制作の続きを考えています" : sceneRetry ? "手動編集を取り込み、現在のSceneから続きを考えています" : approved ? "確認した変更内容を反映する準備をしています" : "現在のSceneと制作に使う素材を確認しています", completed: completedBefore, total: completedBefore, recentEvents: sceneRetry || completedBefore > 0 ? previousJob?.progress.recentEvents ?? [] : [] } };
    const jobs = chatgptGenerationsRef.current;
    let run = chatgptHarnessRunsRef.current.get(generationId);
    if (!run) {
      run = createChatgptHarnessRun({ runId: generationId, snapshot: previousJob?.harness,
        onSnapshot: snapshot => {
          const current = jobs.get(generationId);
          if (!current) return;
          const next = { ...current, harness: snapshot, cancelling: current.cancelling || current.status === "running" && snapshot.phase === "stopping" };
          jobs.set(generationId, next); setChatgptGeneration(next); recordChatgptGeneration(next);
        },
        onAbort: async reason => {
          const active = chatgptControlsRef.current.get(generationId);
          if (active && reason === "user") active.cancelled = true;
          await tauri.chatgptCancelGeneration(generationId);
        },
      });
      chatgptHarnessRunsRef.current.set(generationId, run);
    }
    const harness = run;
    if (!jobs.has(generationId) && jobs.size >= 600) {
      const oldest = jobs.keys().next().value!;
      await chatgptHarnessRunsRef.current.get(oldest)?.stop("evicted");
      chatgptHarnessRunsRef.current.delete(oldest);
      jobs.delete(oldest); chatgptPlansRef.current.delete(oldest); chatgptRevertsRef.current.delete(oldest);
    }
    const report = (patch: Partial<ChatgptGeneration>, event?: Omit<ChatgptGenerationEvent, "sequence">) => {
      const snapshot = harness.snapshot();
      job = { ...job, ...patch, harness: snapshot,
        cancelling: (patch.status ?? job.status) === "running" && (control.cancelled || snapshot.phase === "stopping") };
      if (event) job = { ...job, progress: { ...job.progress, recentEvents: [...job.progress.recentEvents,
        { ...event, sequence: (job.progress.recentEvents[job.progress.recentEvents.length - 1]?.sequence ?? 0) + 1 }].slice(-128) } };
      jobs.set(generationId, job); setChatgptGeneration(job);
      recordChatgptGeneration(job, job.status !== "running");
    };
    const phase = (value: ChatgptGeneration["progress"]["phase"], message: string) => report({ progress: { ...job.progress, phase: value, message } }, { phase: value, message });
    report({}, { phase: "planning", message: job.progress.message });
    let createdProject: Project | null = null;
    let unlisten: (() => void) | undefined;
    let retryRequest: ChatgptSceneRetry | undefined;
    let failedStep: string | undefined;
    const checkCancelled = () => { if (control.cancelled) throw new Error("制作を停止しました。保存済みの変更は残っています"); harness.check(); };
    const dispatch = <T>(kind: ChatgptHarnessKind, label: string, work: () => Promise<T>, modelCalls = 0, write = false) =>
      harness.step(kind, label.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").slice(0, 160) || "制作工程", async () => { flushChatgptSessions(); checkCancelled(); return work(); }, { modelCalls, write });
    const prepareInput = async (packet: ReturnType<typeof buildChatgptHarnessContext>, path: string) => {
      const prepared = await dispatch("context", "制作入力を保存して照合", () => prepareChatgptHarnessContext(packet, createChatgptHarnessContextStore(path)));
      report({ contextRefs: [...(job.contextRefs ?? []).filter(ref => ref.fingerprint !== prepared.ref.fingerprint), prepared.ref].slice(-8) });
      flushChatgptSessions();
      return prepared;
    };
    const checkSource = () => {
      checkCancelled();
      if (visualSessionRef.current?.bundle.project.projectId !== sourceId || mcpProjectBridgeRef.current !== sourceBridge || sourceBridge.currentBundle().scene.sceneId !== sourceSceneId) throw new Error("開いている作品またはSceneが変わりました。依頼を反映せず停止しました");
      if (!sourceBridge.currentContext().canGenerate) throw new Error("Playまたは素材の読み込みが始まりました。停止してから再試行してください");
    };
    try {
      harness.beginPass(!sceneRetry ? previousJob ? "continue" : "initial" : sceneRetry.reason === "agent" ? "continue" : "repair");
      flushChatgptSessions();
      const sourcePath = visualSessionRef.current?.project?.path;
      if (sourcePath && hasAuthoringRunOwner(readAuthoringState(await dispatch("context", "制作の実行状態を確認", () => tauri.readWorldAuthoring(sourcePath, sourceSceneId))))) {
        throw new Error("MCPでワールドを制作中です。現在の制作を完了するか、cancel_world_authoringで停止してからChatGPTへ依頼してください");
      }
      if (!sceneRetry) sourceBridge.openChatgpt();
      const baseline = sourceBridge.currentBundle();
      if (requestEntityIds.some(id => !baseline.scene.entities[id])) throw new Error("添付したEntityが現在のSceneにありません。添付を確認して依頼を送り直してください");
      if (requestMaterialIds.some(id => baseline.assets.assets[id]?.kind !== "material" || baseline.assets.assets[id]?.status !== "ready")) throw new Error("添付したMaterialを現在の作品で利用できません。添付を確認して依頼を送り直してください");
      const planningSnapshot = chatgptPlanningSnapshot(baseline);
      const builtinCatalog = await import("./chatgpt-builtin-catalog");
      const previousPlan = chatgptPlansRef.current.get(generationId);
      const resourceBundle = target === "current" ? baseline : createChatgptScaffold({ title: "", description: "", objects: [] }, "new-world");
      const blender = options.models && options.modelSource !== "store" ? await dispatch("context", "Blenderの利用可否を確認", getChatgptPlanningBlenderStatus) : { available: false };
      const packet = buildChatgptHarnessContext(resourceBundle, {
        selectedEntityId: sourceBridge.currentContext().selectedEntityId, conversation: target === "current" || sceneRetry ? conversation : [],
        attachedEntityIds: requestEntityIds, attachedMaterialIds: requestMaterialIds,
        builtinCandidates: builtinCatalog.listChatgptBuiltinCandidates("world", prompt), blenderAvailable: blender.available,
        modelSource: options.modelSource ?? "auto",
      });
      const sceneContext = packet.scene;
      const resources: ChatgptResourceContext = approved && previousPlan ? previousPlan.resources : packet.resources;
      await dispatch("context", `制作入力 ${packet.fingerprint} / ${packet.contextBytes}B / 省略Entity ${packet.omittedEntities.count}・原本 ${packet.omittedSources.count}`, async () => undefined);
      unlisten = await tauri.onChatgptGenerationProgress(progress => {
        if (chatgptControlsRef.current.get(generationId) !== control || progress.generationId !== generationId || job.status !== "running") return;
        if (control.cancelled || harness.snapshot().phase === "stopping") { void tauri.chatgptCancelGeneration(generationId).catch(() => undefined); return; }
        if (job.progress.phase !== "planning") return;
        const message = progress.stage === "model" ? "利用できる制作環境を確認しています"
          : progress.stage === "catalog" ? "依頼に必要な素材を探しています"
          : progress.stage === "request" ? "制作プランの応答を待っています"
          : progress.stage === "receiving" && progress.message.startsWith("制作予定：") ? progress.message : undefined;
        if (message && message !== job.progress.message) report({ progress: { ...job.progress, message } });
      });
      checkCancelled();
      if (!sourcePath) throw new Error("作品を保存してからChatGPTへ依頼してください");
      const preparedInput = approved ? null : await prepareInput(packet, sourcePath);
      const result = preparedInput ? await dispatch("plan", "制作プランを生成", () => preparedInput.dispatch(verified => tauri.chatgptPlan(model, prompt, options, options.materials ? MATERIAL_SHOWCASE_DEFINITIONS.map(v => ({id: materialShowcaseAssetId(v.key), name: v.name, extension: v.extensionLabel})) : [], generationId, target === "current" || sceneRetry ? verified.scene : undefined, reasoningEffort, verified.resources), () => {
        checkSource(); if (target === "current") assertChatgptPlanningCurrent(sourceBridge.currentBundle(), planningSnapshot);
      }), 1) : null;
      checkCancelled();
      failedStep = "Planの検証";
      let plan: ChatgptWorldPlan;
      try { plan = approved ?? parseChatgptWorldPlan(result!.plan, result!.assetCandidates, options.materials, sceneContext.entities.map(e => e.id), resources); }
      catch (error) { throw new ChatgptPlanInputError(error instanceof Error ? error.message : String(error)); }
      failedStep = undefined;
      checkSource();
      if (!approved && target === "current") assertChatgptPlanningCurrent(sourceBridge.currentBundle(), planningSnapshot);
      const snapshots = approved ? previousPlan!.snapshots : chatgptPlanSnapshots(baseline, plan);
      assertChatgptPlanCurrent(sourceBridge.currentBundle(), plan, snapshots);
      failedStep = "Planの事前検証";
      {
        let draft = baseline;
        let dropped = 0;
        const keptEdits: NonNullable<ChatgptWorldPlan["edits"]> = [];
        for (const edit of plan.edits ?? []) {
          try {
            const changedEdit = editChatgptEntity(draft, edit);
            if (chatgptHarnessSceneFingerprint(changedEdit.bundle) === chatgptHarnessSceneFingerprint(draft)) { dropped++; continue; }
            draft = changedEdit.bundle; keptEdits.push(edit);
          } catch { keptEdits.push(edit); }
        }
        const keptOperations: NonNullable<ChatgptWorldPlan["operations"]> = [];
        for (const operation of plan.operations ?? []) {
          if (!isChatgptEditorAction(operation)) { keptOperations.push(operation); continue; }
          try {
            const changedOp = await applyChatgptOperation(draft, operation, new Map(), resources, sourcePath);
            if (chatgptHarnessSceneFingerprint(changedOp.bundle) === chatgptHarnessSceneFingerprint(draft)) { dropped++; continue; }
            draft = changedOp.bundle; keptOperations.push(operation);
          } catch { keptOperations.push(operation); }
        }
        if (dropped) {
          plan = { ...plan, edits: keptEdits, operations: keptOperations };
          if (!keptEdits.length && !keptOperations.length && !plan.objects.length) {
            throw new ChatgptPlanInputError(`指定された${dropped}件の変更はすべて現在のSceneと同じ値でした。設定の再指定ではなく、Entityや素材の配置などSceneが実際に変わる操作を指定してください`);
          }
          report({}, { phase: "planning", message: `現在のSceneと同じ変更${dropped}件を計画から外しました` });
        }
      }
      failedStep = undefined;
      const codeScene = plan.operations?.some(operation => operation.kind === "r3f-scene");
      report({ questionPreviews: chatgptChoicePreviews(plan.questions ?? [], resources, result?.assetCandidates), plan: approved && job.plan ? job.plan : { title: plan.title, description: plan.description, hasMore: plan.hasMore, remainingWork: plan.remainingWork, questions: plan.questions, objects: [...(plan.edits ?? []).map(v => ({ name: v.name ?? baseline.scene.entities[v.entityId]?.name ?? "Entity", shape: "調整" })), ...plan.objects.map(v => ({ name: v.name, shape: v.shape, preview: chatgptCandidatePreview(v.externalId ?? v.materialExternalId, resources, result?.assetCandidates) })), ...(plan.operations ?? []).map(operation => ({ name: chatgptOperationLabel(operation, baseline), shape: operation.kind === "entity-delete" || operation.kind === "component-remove" ? "削除" : operation.kind === "catalog" || (operation.kind === "blender-model" || operation.kind === "r3f-scene") && !operation.entityId || operation.kind === "component-add" && !operation.entityId ? "追加" : "調整", detail: chatgptOperationDetail(operation, resources, result?.assetCandidates, baseline), preview: chatgptCandidatePreview("candidateId" in operation ? operation.candidateId : undefined, resources, result?.assetCandidates), ...(operation.kind === "scene-settings" ? { sceneSettingsSections: (["skybox", "fog"] as const).filter(section => parseChatgptSceneSettings(operation.settingsJson)[section] !== undefined), settings: sceneSettingsDisplay(parseChatgptSceneSettings(operation.settingsJson), baseline) } : operation.kind === "skybox" ? { sceneSettingsSections: ["skybox"] as ("skybox" | "fog")[] } : operation.kind === "material-update" ? { materialAssetId: operation.candidateId.slice(8), settings: chatgptMaterialSettingsDisplay(parseChatgptMaterialProperties(operation.propertiesJson), getMaterialAsset(baseline.assets, operation.candidateId.slice(8)) ?? undefined) } : {}) }))] },
        progress: { ...job.progress, total: completedBefore + plan.objects.length + (plan.edits?.length ?? 0) + (plan.operations?.length ?? 0) } });
      if (!approved && job.plan) report({ plan: { ...job.plan, objects: job.plan.objects.map(object => ({ ...object, saved: false })) } });
      if (mode === "plan" || plan.questions?.length) {
        chatgptPlansRef.current.set(generationId, { plan, target, resources, snapshots });
        harness.pause();
        if (plan.questions?.length) {
          report({ status: "planned", nextActions: ["answer_chatgpt_questions", "cancel_chatgpt_generation"], progress: { ...job.progress, phase: "planned", message: "制作に必要な確認があります。選択肢を選ぶか、その他の内容を入力してください" } });
          return null;
        }
        report({ status: "planned", nextActions: ["apply_chatgpt_plan", "cancel_chatgpt_generation"], progress: { ...job.progress, phase: "planned", message: sceneRetry?.reconfirm ? sceneRetry.reason === "clarification" ? "回答を反映した変更内容です。確認してから反映してください" : sceneRetry.reason === "plan-input" ? "利用できる素材と設定に合わせて変更内容を見直しました。確認してから反映してください" : "手動編集を取り込んで変更内容を見直しました。確認してから反映してください" : "変更内容を確認してください。反映するまでSceneは変更されません" } });
        return null;
      }
      if (codeScene) {
        failedStep = "R3Fの事前検証";
        phase("preparing", "Sceneを変更する前に、生成コードを確認しています");
        const { validateChatgptR3fSource } = await import("./chatgpt-code-authoring");
        for (const operation of plan.operations ?? []) if (operation.kind === "r3f-scene") {
          await dispatch("prepare", "生成コードの構文と変換を確認", () => validateChatgptR3fSource(operation.source, resourceBundle.project.projectKind));
          checkSource();
        }
        assertChatgptPlanCurrent(sourceBridge.currentBundle(), plan, snapshots);
        failedStep = undefined;
      }
      phase("preparing", "依頼の反映前に、現在の作品を保存しています");
      const saveSource = async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          checkSource();
          const before = sourceBridge.currentBundle();
          if (!(await dispatch("save", "現在の作品を保存", sourceBridge.saveNow))) throw new Error("現在の作品を保存できませんでした。保存先を確認して再試行してください");
          checkSource();
          if (sourceBridge.currentBundle() === before) return before;
        }
        throw new ChatgptSceneConflictError("手動編集を保持し、現在のSceneから続きを考えます");
      };
      await saveSource();
      let project = visualSessionRef.current?.project;
      let targetBridge = sourceBridge;
      if (target === "new") {
      const name = await uniqueProjectDirectoryName(projectsRoot, `chatgpt-world-${Date.now()}`);
      const prepared = await dispatch("prepare", "新しいワールドを準備", () => prepareStarterVisualProject(createChatgptScaffold(plan, name)));
      project = await dispatch("write", "新しいワールドを保存", () => createPreparedStarterVisualProjectOnDisk(projectsRoot, name, prepared), 0, true);
      createdProject = project;
      for (const ref of job.contextRefs ?? []) {
        const archived = await dispatch("context", "制作入力を読み直し", () => restoreChatgptHarnessContext(ref, createChatgptHarnessContextStore(sourcePath)));
        await dispatch("write", "新しい作品へ制作入力を引き継ぎ", () => prepareChatgptHarnessContext(archived, createChatgptHarnessContextStore(project!.path)), 0, true);
      }
      checkSource();
      // Creating the new files is asynchronous; flush edits made during that
      // interval before the old Editor and its autosave timer are unmounted.
      const savedSource = await saveSource();
      checkSource();
      if (sourceBridge.currentBundle() !== savedSource) throw new Error("現在の作品が編集中です。操作を止めて再試行してください");
      const initial = prepared.plan;
      report({ projectId: initial.project.projectId, sceneId: initial.scene.sceneId, path: project.path, name: project.name,
        progress: { ...job.progress, projectId: initial.project.projectId } });
      // A separately requested world gets its own chat. Keep the source chat's
      // request/result too, so returning to either project preserves the record.
      const targetSession = createChatgptSession(initial.project.projectId, initial.scene.sceneId, plan.title);
      updateChatgptSessions([targetSession, ...chatgptSessionsRef.current].slice(0, 20), true);
      selectChatgptSession(targetSession.id);
      report({ sessionId: targetSession.id });
      setVisualCompilationFresh(false);
      setVisualThumbnailReadiness(null);
      const nextSession = { project, bundle: { project: initial.project, scene: initial.scene, assets: initial.assets, prefabs: initial.prefabs } };
      visualSessionRef.current = nextSession;
      setVisualSession(nextSession);
      targetBridge = await waitForMcpProjectBridge(sourceBridge, { projectId: initial.project.projectId, sceneId: initial.scene.sceneId }, checkCancelled);
      }
      if (!project) throw new Error("保存先を確認できませんでした");
      const targetId = targetBridge.currentBundle().project.projectId;
      const targetSceneId = targetBridge.currentBundle().scene.sceneId;
      report({ projectId: targetId, sceneId: targetSceneId, path: project.path, name: project.name, progress: { ...job.progress, projectId: targetId } });
      const checkTarget = (checkCancellation = true) => {
        if (checkCancellation) checkCancelled();
        if (visualSessionRef.current?.bundle.project.projectId !== targetId || mcpProjectBridgeRef.current !== targetBridge || targetBridge.currentBundle().scene.sceneId !== targetSceneId) throw new Error("開いている作品またはSceneが変わりました。保存済みの変更はプロジェクト一覧から確認できます");
        if (!targetBridge.currentContext().canGenerate) throw new Error("Playまたは素材の読み込みが始まったため依頼の反映を停止しました。保存済みのEntityは残っています");
      };
      checkTarget(); if (!sceneRetry) targetBridge.openChatgpt();
      const passStartFingerprint = authoringSceneProgressFingerprint(targetBridge.currentBundle());
      // Steps that recompute to the current Scene are processed but never
      // saved, and are reported once instead of as one save per step.
      const skippedChangeLabels: string[] = [];
      const flushSkippedChanges = () => {
        const message = describeSkippedAuthoringChanges(skippedChangeLabels);
        skippedChangeLabels.length = 0;
        if (message) report({ progress: { ...job.progress, message } }, { phase: "placing", message });
      };
      let expectedPlanSnapshots = target === "current" ? snapshots : chatgptPlanSnapshots(targetBridge.currentBundle(), plan);
      const commit = (expectedBundle: PrototypeVisualProject, nextBundle: PrototypeVisualProject, entityId?: string) => {
        checkTarget();
        const latest = targetBridge.currentBundle();
        nextBundle = rebaseChatgptStep(expectedBundle, nextBundle, latest);
        expectedBundle = latest;
        assertChatgptPlanCurrent(expectedBundle, plan, expectedPlanSnapshots);
        const nextFingerprint = chatgptHarnessSceneFingerprint(nextBundle);
        if (nextFingerprint === chatgptHarnessSceneFingerprint(expectedBundle)) return;
        harness.recordCommit(nextFingerprint);
        flushChatgptSessions();
        if (!targetBridge.applyGenerationStep({ expectedBundle, nextBundle, entityId })) throw new ChatgptSceneConflictError("反映中に作品が編集されました。編集内容を保ち、現在のSceneから制作を続けます");
        expectedPlanSnapshots = chatgptPlanSnapshots(nextBundle, plan);
        if (job.revertAvailable !== false) {
          try {
            chatgptRevertsRef.current.set(generationId, extendChatgptRevertCheckpoint(chatgptRevertsRef.current.get(generationId), expectedBundle, nextBundle));
            job.revertAvailable = true;
            while (chatgptRevertsRef.current.size > 8) {
              const expiredId = chatgptRevertsRef.current.keys().next().value!;
              chatgptRevertsRef.current.delete(expiredId);
              const expired = jobs.get(expiredId);
              if (expired) {
                const unavailable = { ...expired, revertAvailable: false }; jobs.set(expiredId, unavailable);
                if (unavailable.sessionId && chatgptSessionsRef.current.some(session => session.id === unavailable.sessionId)) updateChatgptSessions(upsertChatgptSessionTurn(chatgptSessionsRef.current, unavailable.sessionId, unavailable));
              }
            }
          } catch { chatgptRevertsRef.current.delete(generationId); job.revertAvailable = false; }
        }
      };
      const saveTarget = async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          checkTarget();
          const expected = chatgptHarnessSceneFingerprint(targetBridge.currentBundle());
          harness.observeScene(expected);
          if (!(await dispatch("save", "制作中のSceneを保存", targetBridge.saveNow))) throw new Error("作成中のワールドを保存できませんでした。保存先を確認し、Studioで保存を再試行してください");
          checkTarget();
          if (chatgptHarnessSceneFingerprint(targetBridge.currentBundle()) !== expected) continue;
          harness.recordSaved(expected);
          flushChatgptSessions();
          return;
        }
        throw new ChatgptSceneConflictError("保存中にSceneが変更されました。最新のSceneから制作を続けます");
      };
      const assetIds = new Map<string, string>();
      const requests = chatgptAssetRequests(plan);
      const savedPlanObject = (index: number, entityId?: string, settings?: NonNullable<ChatgptGeneration["plan"]>["objects"][number]["settings"]) => job.plan
        ? { ...job.plan, objects: job.plan.objects.map((object, objectIndex) => objectIndex === index ? { ...object, saved: true, ...(entityId ? { entityId } : {}), ...(settings ? { settings } : {}) } : object) } : undefined;
      const importNeeded = async (needed: typeof requests, name: string) => {
        for (const asset of needed) {
          const key = `${asset.providerId}:${asset.externalId}`;
          if (assetIds.has(key)) continue;
          phase("importing", `${name}に使う素材を取り込んでいます`);
          const before = targetBridge.currentBundle();
          assertChatgptPlanCurrent(before, plan, expectedPlanSnapshots);
          const choices = await dispatch("context", "素材の取り込み方法を確認", () => tauri.getExternalStoreAssetOptions(asset.providerId, asset.externalId));
          const resolution = [...choices.resolutions].sort((a,b) => (a.byteLength > 0 ? a.byteLength : Infinity) - (b.byteLength > 0 ? b.byteLength : Infinity))[0];
          if (choices.assetKind !== asset.kind || !resolution) throw new Error(`${name}に使えるサイズの素材がありません。別の素材で再試行してください`);
          checkTarget();
          const installed = await dispatch("write", "制作に使う素材を取り込み", () => tauri.installExternalStoreAsset(project.path, { providerId: asset.providerId, externalId: asset.externalId, resolution: resolution.id }), 0, true);
          const applied = await dispatch("prepare", "取り込んだ素材を解析", () => applyExternalStoreInstallAndAnalyzeModel(project.path, before.assets, installed));
          commit(before, { ...before, assets: applied.manifest });
          assetIds.set(key, applied.primaryAssetId);
        }
      };
      for (const [index, edit] of (plan.edits ?? []).entries()) {
        const before = targetBridge.currentBundle();
        const editLabel = describeChatgptEntityEdit(edit, before);
        assertChatgptPlanCurrent(before, plan, expectedPlanSnapshots);
        failedStep = `${before.scene.entities[edit.entityId]?.name ?? "Entity"}を調整`;
        const changed = editChatgptEntity(before, edit);
        if (chatgptHarnessSceneFingerprint(changed.bundle) === chatgptHarnessSceneFingerprint(before)) { failedStep = undefined; skippedChangeLabels.push(editLabel); report({ progress: { ...job.progress, completed: completedBefore + index + 1 } }); continue; }
        phase("placing", `${completedBefore + index + 1}/${job.progress.total} 変更中：${editLabel}`);
        failedStep = undefined;
        commit(before, changed.bundle, changed.entityId);
        const name = changed.bundle.scene.entities[changed.entityId].name;
        const savedMessage = `反映しました：${describeChatgptEntityEdit(edit, before, changed.bundle)}`;
        report({ plan: savedPlanObject(index, changed.entityId), progress: { ...job.progress, completed: completedBefore + index + 1, message: savedMessage } }, { phase: "placing", message: savedMessage, entityId: changed.entityId, name, saved: true });
        await new Promise(resolve => globalThis.setTimeout(resolve, 40));
      }
      for (const [index, value] of plan.objects.entries()) {
        checkTarget();
        const neededKeys = [value.materialExternalId ? chatgptReferenceKey(value.materialExternalId, "poly-haven") : undefined, value.externalId ? chatgptReferenceKey(value.externalId, value.shape === "audio" ? "otogura" : "poly-haven") : undefined];
        await importNeeded(requests.filter(asset => neededKeys.includes(`${asset.providerId}:${asset.externalId}`)), value.name);
        if (value.gltfMaterialId && !targetBridge.currentBundle().assets.assets[value.gltfMaterialId]) {
          phase("importing", `${value.name}のglTFマテリアルを取り込んでいます`);
          const before = targetBridge.currentBundle();
          const material = getMaterialShowcaseAsset(value.gltfMaterialId);
          if (!material) throw new Error(`${value.name}のglTFマテリアルが見つかりません`);
          const manifest = { ...before.assets, assets: { ...before.assets.assets, [material.id]: structuredClone(material) } };
          const withTextures = await dispatch("write", "Materialのテクスチャを保存", () => ensureCatalogMaterialTextures(project.path, manifest, material.properties), 0, true);
          if (!withTextures) throw new Error(`${value.name}のテクスチャを取り込めませんでした`);
          commit(before, { ...before, assets: withTextures });
        }
        phase("placing", `${index + 1 + (plan.edits?.length ?? 0)}/${job.progress.total}：${value.name}を配置しています`);
        const before = targetBridge.currentBundle();
        failedStep = `${value.name}を配置`;
        const placed = placeChatgptObject(before, value, assetIds);
        failedStep = undefined;
        commit(before, placed.bundle, placed.entityId);
        report({ plan: savedPlanObject((plan.edits?.length ?? 0) + index, placed.entityId), progress: { ...job.progress, completed: completedBefore + index + 1 + (plan.edits?.length ?? 0), message: `${value.name}を配置しました` } },
          { phase: "placing", message: `${value.name}を配置しました`, entityId: placed.entityId, name: value.name, saved: true });
        // Yield to the live Scene and Inspector so each placement is visible
        // before the next one. Saving happens once, after all steps.
        await new Promise(resolve => globalThis.setTimeout(resolve, 40));
      }
      const reviewModel = async (entityId: string, brief: import("./chatgpt-modeling").BlenderModelBrief, componentId?: string, expectedSnapshot?: string) => {
        failedStep = `${brief.name}の見た目の確認`;
        const { reviewChatgptModel } = await import("./chatgpt-model-quality");
        await dispatch("inspect", "保存したモデルの実像を確認", () => reviewChatgptModel({ model, generationId, prompt, brief, entityId, componentId, expectedSnapshot, projectPath: project.path, reasoningEffort, resources,
          currentBundle: targetBridge.currentBundle, checkCurrent: checkTarget, capture: (id, hash, check) => dispatch("capture", "モデルを撮影", () => targetBridge.captureModelViews(id, hash, check)),
          request: (label, work) => dispatch("model-review", label, work, 1),
          commit, progress: (message, saved) => report({ progress: { ...job.progress, phase: "importing", message } },
            { phase: "importing", message, entityId, name: brief.name, ...(saved ? { saved: true } : {}) }) }));
        failedStep = undefined;
      };
      const applyOperation = async (operation: NonNullable<ChatgptWorldPlan["operations"]>[number], index: number,
        modelBrief?: import("./chatgpt-modeling").BlenderModelBrief) => {
        checkTarget();
        const name = chatgptOperationLabel(operation, targetBridge.currentBundle());
        const candidateId = "candidateId" in operation ? operation.candidateId : undefined;
        await importNeeded(requests.filter(asset => `${asset.providerId}:${asset.externalId}` === candidateId), name);
        const before = targetBridge.currentBundle();
        const step = job.progress.completed + 1;
        const progressLabel = chatgptOperationProgress(operation, before, resources, result?.assetCandidates);
        if (!isChatgptEditorAction(operation)) phase("placing", `${step}/${job.progress.total} 変更中：${progressLabel}`);
        assertChatgptPlanCurrent(before, plan, expectedPlanSnapshots);
        failedStep = name;
        const changed = await dispatch("write", name.slice(0, 160), () => applyChatgptOperation(before, operation, assetIds, resources, project.path,
          { prompt, brief: modelBrief?.brief ?? [...prompt].slice(0, 1600).join("") }, { generationId, checkCurrent: checkTarget }), 0, true);
        if (chatgptHarnessSceneFingerprint(changed.bundle) === chatgptHarnessSceneFingerprint(before)) { failedStep = undefined; skippedChangeLabels.push(name); report({ progress: { ...job.progress, completed: step } }); return changed.entityId; }
        if (isChatgptEditorAction(operation)) phase("placing", `${step}/${job.progress.total} 変更中：${progressLabel}`);
        failedStep = undefined;
        commit(before, changed.bundle, changed.entityId);
        const savedMessage = `反映しました：${chatgptOperationProgress(operation, before, resources, result?.assetCandidates, changed.bundle)}`;
        const savedSettings = operation.kind === "scene-settings" ? sceneSettingsDisplay(parseChatgptSceneSettings(operation.settingsJson), before, changed.bundle)
          : operation.kind === "material-update" ? chatgptMaterialSettingsDisplay(parseChatgptMaterialProperties(operation.propertiesJson), getMaterialAsset(before.assets, operation.candidateId.slice(8)) ?? undefined, getMaterialAsset(changed.bundle.assets, operation.candidateId.slice(8)) ?? undefined) : undefined;
        const savedPlan = savedPlanObject((plan.edits?.length ?? 0) + plan.objects.length + index, changed.entityId, savedSettings);
        report({ plan: savedPlan, progress: { ...job.progress, completed: step, message: savedMessage } },
          { phase: "placing", message: savedMessage, entityId: changed.entityId, name, saved: true });
        await new Promise(resolve => globalThis.setTimeout(resolve, 40));
        return changed.entityId;
      };
      const operations = (plan.operations ?? []).map((operation, index) => ({ operation, index }));
      // Scene changes stay serial. Finished models arrive independently, so a
      // slow modeling worker does not hold up another worker's saved result.
      type DraftStep = (typeof operations)[number] & { operation: Extract<(typeof operations)[number]["operation"], { kind: "blender-model" }> & { model: import("./chatgpt-modeling").BlenderModelBrief } };
      const isDraft = (item: (typeof operations)[number]): item is DraftStep => item.operation.kind === "blender-model" && "brief" in item.operation.model;
      for (let cursor = 0; cursor < operations.length;) {
        const item = operations[cursor];
        if (!isDraft(item)) {
          const entityId = await applyOperation(item.operation, item.index);
          if (item.operation.kind === "blender-model" && entityId) await reviewModel(entityId,
            { name: item.operation.model.name, brief: [...prompt].slice(0, 1600).join("") }, item.operation.componentId);
          cursor++; continue;
        }
        const drafts: DraftStep[] = [];
        const targets = new Set<string>();
        // Keep dependent operations in their planned order. Only adjacent
        // models with independent targets may be applied as they finish.
        while (cursor < operations.length) {
          const candidate = operations[cursor];
          if (!isDraft(candidate) || (candidate.operation.entityId && targets.has(candidate.operation.entityId))) break;
          drafts.push(candidate);
          if (candidate.operation.entityId) targets.add(candidate.operation.entityId);
          cursor++;
        }
        const { streamChatgptModels } = await import("./chatgpt-model-stream");
        const { readBlenderEntityModelSource } = await import("./chatgpt-model-source");
        const contexts = await Promise.all(drafts.map(async ({ operation }) => {
          const previous = operation.entityId ? await readBlenderEntityModelSource(targetBridge.currentBundle(), operation.entityId, project.path, operation.componentId) : null;
          return { prompt, ...(previous ? { previous: previous.source.spec, ...(previous.source.originalPrompt ? { originalPrompt: previous.source.originalPrompt } : {}) } : {}) };
        }));
        checkTarget();
        assertChatgptPlanCurrent(targetBridge.currentBundle(), plan, expectedPlanSnapshots);
        phase("importing", `モデルを制作しています：${drafts.map(item => item.operation.model.name).join("、")}。完成したものから順に反映します`);
        failedStep = "モデルの詳細制作";
        const modelsToReview: { entityId: string; brief: import("./chatgpt-modeling").BlenderModelBrief; componentId?: string; expectedSnapshot: string }[] = [];
        const { chatgptModelSnapshot } = await import("./chatgpt-model-quality");
        await dispatch("model", "モデルの詳細を並行制作", async () => { for await (const ready of streamChatgptModels(model, drafts.map(item => item.operation.model), generationId, reasoningEffort, contexts)) {
          checkTarget();
          const { operation, index } = drafts[ready.index];
          const entityId = await applyOperation({ ...operation, model: ready.model }, index, operation.model);
          if (entityId) modelsToReview.push({ entityId, brief: operation.model, componentId: operation.componentId, expectedSnapshot: chatgptModelSnapshot(targetBridge.currentBundle(), entityId) });
          if (job.progress.completed < job.progress.total) phase("importing", "完成したモデルを反映しました。残りのモデルを制作しています");
          failedStep = "モデルの詳細制作";
        } }, drafts.length);
        // Release the parallel workers' native generation lease before asking
        // for a visual review under the same cancellable request.
        for (const authored of modelsToReview) await reviewModel(authored.entityId, authored.brief, authored.componentId, authored.expectedSnapshot);
        failedStep = undefined;
      }
      flushSkippedChanges();
      phase("saving", "反映した変更をまとめて保存しています");
      phase("saving", "ワールドの保存結果を確認しています");
      await saveTarget(); if (createdProject) await refreshProjects();
      checkTarget();
      const changed = planningSnapshot !== chatgptPlanningSnapshot(targetBridge.currentBundle());
      const appliedSteps = (plan.edits?.length ?? 0) + plan.objects.length + (plan.operations?.length ?? 0);
      const rounds = (job.agentRounds ?? 0) + 1;
      const keepGoing = appliedSteps > 0 && changed && rounds < 24;
      harness.recordProgress({ planFingerprint: authoringActionFingerprint("chatgpt-plan", plan), beforeFingerprint: passStartFingerprint,
        afterFingerprint: authoringSceneProgressFingerprint(targetBridge.currentBundle()), savedFingerprint: chatgptHarnessSceneFingerprint(targetBridge.currentBundle()),
        continuing: keepGoing });
      flushChatgptSessions();
      chatgptPlansRef.current.delete(generationId);
      if (keepGoing) {
        harness.finish({ fingerprint: chatgptHarnessSceneFingerprint(targetBridge.currentBundle()), hasMore: true });
        report({ agentRounds: rounds });
        retryRequest = { attempt: 0, completed: job.progress.completed, reason: "agent", reconfirm: false, conversation: chatgptAgentConversation(conversation, job) };
        phase("planning", "ここまでの変更を保存しました。最新のSceneを見て制作を続けます");
      } else {
        const finalFingerprint = chatgptHarnessSceneFingerprint(targetBridge.currentBundle());
        harness.finish({ fingerprint: finalFingerprint, checkpoint: completed => {
          recordChatgptGeneration({ ...job, harness: completed });
          flushChatgptSessions();
        } });
        report({ status: "completed", nextActions: ["get_editor_context", "capture_scene_view"],
          progress: { ...job.progress, phase: "completed", message: job.progress.total === 0 ? plan.description || "追加の変更はありません" : "依頼を反映して保存しました。Scene ViewとInspectorで確認できます" } },
          { phase: "completed", message: job.progress.total === 0 ? "Sceneの変更はありません" : "依頼した追加と調整を保存しました" });
        if (job.progress.total > 0) toast({ kind: "success", title: "依頼を反映しました", description: "Scene ViewとInspectorで結果を確認できます。" });
        return project;
      }
    } catch (error) {
      if (failedStep && isChatgptPlanInputError(error) && !control.cancelled) {
        try {
          checkCancelled();
          const bridge = mcpProjectBridgeRef.current;
          const current = bridge?.currentBundle();
          if (!bridge || !current || current.project.projectId !== (job.projectId ?? sourceId) || current.scene.sceneId !== (job.sceneId ?? sourceSceneId) || !bridge.currentContext().canGenerate) throw error;
          const attempt = sceneRetry?.attempt ?? 0;
          if (attempt < CHATGPT_SCENE_REPLAN_LIMIT) {
            retryRequest = { attempt: attempt + 1, completed: job.progress.completed, reason: "plan-input",
              conversation: chatgptSceneRetryConversation(conversation, job, `${failedStep}: ${error.message}`), reconfirm: Boolean(approved) || sceneRetry?.reconfirm === true };
            phase("planning", "保存した変更を保ち、利用できる素材と設定で制作の続きを考え直しています");
          } else error = new Error("素材や設定の組み合わせを自動で解決できなかったため、制作をいったん停止しました。保存済みの変更は残っています。次の依頼を送ると現在のSceneから再開できます");
        } catch (boundaryError) { error = boundaryError; }
      }
      if (error instanceof ChatgptSceneConflictError && target === "current" && !control.cancelled) {
        try {
          checkSource();
          const attempt = sceneRetry?.attempt ?? 0;
          if (attempt < CHATGPT_SCENE_REPLAN_LIMIT) {
            retryRequest = { attempt: attempt + 1, completed: job.progress.completed,
              conversation: chatgptSceneRetryConversation(conversation, job), reconfirm: Boolean(approved) || sceneRetry?.reconfirm === true };
            phase("planning", "手動編集を保持し、現在のSceneから未完了の作業を考え直しています");
          } else error = new Error("手動編集が続いたため制作をいったん停止しました。変更は保持されています。編集が落ち着いてから次の依頼を送ると、最新のSceneから再開できます");
        } catch (boundaryError) { error = boundaryError; }
      }
      if (!retryRequest) {
        if (control.cancelled) await harness.stop("user"); else await harness.fail();
        const message = error instanceof Error ? error.message : String(error);
        report({ status: control.cancelled ? "cancelled" : "failed", cancelling: false, error: control.cancelled ? undefined : message, nextActions: ["get_chatgpt_connection", "get_editor_context"],
          progress: { ...job.progress, phase: control.cancelled ? "cancelled" : "failed", message } }, { phase: control.cancelled ? "cancelled" : "failed", message });
        if (createdProject) await refreshProjects().catch(() => undefined);
        toast({ kind: control.cancelled ? "success" : "error", title: "制作を停止しました", description: message });
        throw error;
      }
    } finally {
      unlisten?.(); chatgptControlsRef.current.delete(generationId);
      if (chatgptGenerationRef.current === generationId) chatgptGenerationRef.current = null;
    }
    // Start a separate planning exchange only after the old native lease and
    // listeners are released. The same visible request keeps its saved results.
    return { retry: retryRequest!, target: createdProject ? "current" : target,
      sessionId: retryRequest!.reason === "plan-input" || retryRequest!.reason === "agent" ? job.sessionId : sessionId };
  };
}


/** One request owns one runtime across every plan, repair and continuation.
 * Each pass releases its native stream and Editor listener before the next. */
export function createChatgptAuthoringRunner(host: ChatgptAuthoringHost) {
  const pass = createChatgptAuthoringPass(host);
  return async (...initial: Parameters<typeof pass>): Promise<Project | null> => {
    initial[3] ??= crypto.randomUUID();
    const runId = initial[3];
    let request = initial;
    try {
      for (;;) {
        const result = await pass(...request);
        if (!result || !("retry" in result)) return result;
        const [model, prompt, options, generationId, mode = "build", , , reasoningEffort] = request;
        request = [model, prompt, options, generationId, result.retry.reconfirm ? "plan" : mode, result.target,
          undefined, reasoningEffort, result.sessionId, result.retry];
      }
    } finally {
      const run = host.chatgptHarnessRunsRef.current.get(runId);
      if (run && ["completed", "cancelled", "failed"].includes(run.snapshot().phase)) host.chatgptHarnessRunsRef.current.delete(runId);
    }
  };
}
