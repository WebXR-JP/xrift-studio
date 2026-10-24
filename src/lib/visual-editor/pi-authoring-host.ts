import type { VisualEditorMcpProjectBridge } from "../../components/visual-editor/VisualEditorPrototype";
import type { ToastInput } from "../../components/Toast";
import { tauri, type ChatgptAssetOptions, type Project } from "../tauri";
import { createPreparedStarterVisualProjectOnDisk, prepareStarterVisualProject, type PrototypeVisualProject } from "../visual-editor";
import { createStarterVisualProject } from "./starter-templates";
import type { PiAuthoringRun as ChatgptGeneration, PiRunEvent as ChatgptGenerationEvent, PiMode as ChatgptGenerationMode } from "./pi-authoring";
import { chatgptPlanningSnapshot } from "./chatgpt-plan-guards";
import { hasAuthoringRunOwner, readAuthoringState } from "./world-authoring";
import { authoringSceneProgressFingerprint } from "./authoring-scene-progress";
import { chatgptConversationContext, createChatgptSession, extendChatgptRevertCheckpoint, piHistoryForSession, type ChatgptSession, type ChatgptRevertCheckpoint } from "./chatgpt-sessions";
import type { PiRunControl, PiStoredPlan, PiPlan, PiContinuation, PiContext, PiHistory, PiUsage } from "./pi-authoring";
type HostRef<T> = { current: T };
type HostVisualSession = { bundle: PrototypeVisualProject; project: Project | null };
export type PiAuthoringHost = {
  chatgptGenerationRef: HostRef<string | null>;
  mcpPublishActiveRef: HostRef<boolean>; mcpModelingActiveRef: HostRef<boolean>;
  visualSessionRef: HostRef<HostVisualSession | null>; projectsRoot: string | null;
  requireMcpProjectBridge: (tool: string) => VisualEditorMcpProjectBridge;
  mcpProjectBridgeRef: HostRef<VisualEditorMcpProjectBridge | null>;
  chatgptSessionsRef: HostRef<ChatgptSession[]>; selectedChatgptSessionIdRef: HostRef<string | undefined>;
  updateChatgptSessions: (sessions: ChatgptSession[], flush?: boolean) => void; selectChatgptSession: (id: string | undefined) => void;
  flushChatgptSessions: () => void;
  piRunsRef: HostRef<Map<string, PiRunControl>>;
  chatgptGenerationsRef: HostRef<Map<string, ChatgptGeneration>>;
  chatgptControlsRef: HostRef<Map<string, { cancelled: boolean }>>;
  chatgptPlansRef: HostRef<Map<string, PiStoredPlan>>;
  chatgptRevertsRef: HostRef<Map<string, ChatgptRevertCheckpoint>>;
  setChatgptGeneration: (job: ChatgptGeneration | null) => void;
  recordChatgptGeneration: (job: ChatgptGeneration, flush?: boolean) => void;
  uniqueProjectDirectoryName: (root: string, name: string) => Promise<string>;
  setVisualCompilationFresh: (value: boolean) => void; setVisualThumbnailReadiness: (value: null) => void;
  setVisualSession: (value: HostVisualSession | null) => void;
  waitForMcpProjectBridge: (previous: VisualEditorMcpProjectBridge | null, expected?: { projectId: string; sceneId: string }, assertWaiting?: () => void) => Promise<VisualEditorMcpProjectBridge>;
  refreshProjects: () => Promise<void>; toast: (value: ToastInput) => void;
};

/** Pi owns planning and repair. This adapter owns UI scope and saved history. */
export function createPiAuthoringRunner(host: PiAuthoringHost) {
  return async (model: string, prompt: string, options: ChatgptAssetOptions, generationId: string = crypto.randomUUID(), mode: ChatgptGenerationMode = "build", target: "current" | "new" = "current", approved?: PiPlan, reasoningEffort?: string, requestedSessionId?: string, continuation?: PiContinuation, attachedEntityIds: readonly string[] = [], attachedMaterialIds: readonly string[] = []): Promise<Project | null> => {
    if (host.chatgptGenerationRef.current || host.mcpPublishActiveRef.current || host.mcpModelingActiveRef.current) throw new Error("現在の処理が終わるか停止してから依頼してください");
    if (!tauri.isAvailable() || !host.projectsRoot) throw new Error("デスクトップ版でワールドを開いてください");
    const source = host.requireMcpProjectBridge("制作チャット");
    const scope = source.currentContext();
    if (!scope.canGenerate || source.currentBundle().project.projectKind !== "world") throw new Error("WorldをEditで開き、素材の読み込み完了を待ってください");
    const previous = host.chatgptGenerationsRef.current.get(generationId);
    const continuing = Boolean(continuation || approved);
    const completedBeforeResume = continuing ? previous?.progress.completed ?? 0 : 0;
    const accumulateUsage = (usage: PiUsage): PiUsage => Object.fromEntries(Object.entries(usage).map(([key, value]) =>
      [key, value + (previous?.usage?.[key as keyof PiUsage] ?? 0)])) as PiUsage;
    const stored = host.chatgptPlansRef.current.get(generationId);
    if (approved && (!stored || stored.snapshot !== chatgptPlanningSnapshot(source.currentBundle()))) throw new Error("プランの確認後にSceneが変わりました。現在のSceneからプランを作り直してください");
    const scoped = host.chatgptSessionsRef.current.filter(session => session.projectId === scope.projectId && session.sceneId === scope.sceneId);
    const sessionId = requestedSessionId ?? host.selectedChatgptSessionIdRef.current;
    let session = scoped.find(session => session.id === sessionId) ?? (requestedSessionId ? undefined : scoped[0]);
    if (requestedSessionId && !session) throw new Error("対象のSceneのチャットを選んでください");
    if (!session) { session = createChatgptSession(scope.projectId, scope.sceneId); host.updateChatgptSessions([session, ...host.chatgptSessionsRef.current].slice(0, 20), true); }
    host.selectChatgptSession(session.id);
    let bridge = source, project = host.visualSessionRef.current?.project ?? null, created: Project | null = null;
    let job: ChatgptGeneration = { ...previous, harness: undefined, contextRefs: undefined, goal: undefined, production: undefined, productionPass: undefined, productionNoProgressPasses: undefined, productionVisualReview: undefined, plan: undefined, nextActions: undefined, generationId, sessionId: session.id, createdAt: previous?.createdAt ?? new Date().toISOString(),
      status: "running", completionVerified: undefined, cancelling: false, error: undefined, assistantText: undefined, usage: previous?.usage, mode, model, prompt, options, reasoningEffort,
      sourceProjectId: previous?.sourceProjectId ?? scope.projectId, sourceSceneId: previous?.sourceSceneId ?? scope.sceneId, projectId: scope.projectId, sceneId: scope.sceneId,
      attachedEntities: previous?.attachedEntities ?? [...new Set(attachedEntityIds)].map(id => ({ id, name: source.currentBundle().scene.entities[id]?.name ?? id })),
      attachedMaterials: previous?.attachedMaterials ?? [...new Set(attachedMaterialIds)].map(id => ({ id, name: source.currentBundle().assets.assets[id]?.name ?? id })),
      progress: { phase: "planning", message: "現在のSceneと制作方法を確認しています", completed: completedBeforeResume, total: completedBeforeResume, recentEvents: previous?.progress.recentEvents ?? [] } };
    const control = { cancelled: false };
    host.chatgptGenerationRef.current = generationId;
    host.chatgptControlsRef.current.set(generationId, control);
    const stop = async () => { control.cancelled = true; await tauri.chatgptCancelGeneration(generationId); };
    host.piRunsRef.current.set(generationId, { stop });
    const report = (patch: Partial<ChatgptGeneration>, event?: Omit<ChatgptGenerationEvent, "sequence">, persist = true) => {
      job = { ...job, ...patch };
      if (event) job = { ...job, progress: { ...job.progress, recentEvents: [...job.progress.recentEvents, { ...event, sequence: (job.progress.recentEvents[job.progress.recentEvents.length - 1]?.sequence ?? 0) + 1 }].slice(-128) } };
      if (persist) host.recordChatgptGeneration(job, job.status !== "running");
      if (job.status === "completed") host.flushChatgptSessions();
      host.chatgptGenerationsRef.current.set(generationId, job); host.setChatgptGeneration(job);
    };
    const current = () => {
      if (control.cancelled) throw new Error("制作を停止しました。保存済みの変更は残っています");
      if (host.mcpProjectBridgeRef.current !== bridge || bridge.currentBundle().project.projectId !== job.projectId || bridge.currentBundle().scene.sceneId !== job.sceneId) throw new Error("開いている作品またはSceneが変わりました。保存済みの変更を保持して停止しました");
    };
    let watch: ReturnType<typeof setInterval> | undefined;
    const beforeOperations = new Map<string, PrototypeVisualProject>();
    let pendingChanges = 0, canRevert = completedBeforeResume === 0 || host.chatgptRevertsRef.current.has(generationId);
    try {
      report({}); host.flushChatgptSessions(); source.openChatgpt();
      const sourcePath = project?.path;
      if (sourcePath && hasAuthoringRunOwner(readAuthoringState(await tauri.readWorldAuthoring(sourcePath, scope.sceneId)))) throw new Error("MCPのワールド制作が進行中です。完了または停止してから依頼してください");
      current();
      if (job.attachedEntities?.some(entity => !source.currentBundle().scene.entities[entity.id]) || job.attachedMaterials?.some(material => source.currentBundle().assets.assets[material.id]?.kind !== "material")) throw new Error("添付したEntityまたはMaterialが現在のSceneにありません");
      if (mode !== "plan") {
        if (!(await source.saveNow())) throw new Error("現在の作品を保存できませんでした");
        current();
        if (target === "new") {
          const name = await host.uniqueProjectDirectoryName(host.projectsRoot, `pi-world-${Date.now()}`);
          const prepared = await prepareStarterVisualProject(createStarterVisualProject("world", "blank", name));
          current();
          created = await createPreparedStarterVisualProjectOnDisk(host.projectsRoot, name, prepared); project = created;
          current();
          const initial = prepared.plan;
          const targetSession = createChatgptSession(initial.project.projectId, initial.scene.sceneId);
          host.updateChatgptSessions([targetSession, ...host.chatgptSessionsRef.current].slice(0, 20), true);
          host.selectChatgptSession(targetSession.id);
          report({ piHistory: undefined, sessionId: targetSession.id, projectId: initial.project.projectId, sceneId: initial.scene.sceneId, path: project.path, name: project.name,
            progress: { ...job.progress, projectId: initial.project.projectId } });
          host.setVisualCompilationFresh(false); host.setVisualThumbnailReadiness(null);
          const nextSession = { bundle: initial, project };
          host.visualSessionRef.current = nextSession;
          host.setVisualSession(nextSession);
          bridge = await host.waitForMcpProjectBridge(source, { projectId: prepared.plan.project.projectId, sceneId: prepared.plan.scene.sceneId }, () => { if (control.cancelled) throw new Error("制作を停止しました"); });
          job = { ...job, projectId: bridge.currentBundle().project.projectId, sceneId: bridge.currentBundle().scene.sceneId };
          await host.refreshProjects();
        }
      }
      const expectedBridge = bridge;
      watch = setInterval(() => {
        if (control.cancelled || host.mcpProjectBridgeRef.current !== expectedBridge || bridge.currentBundle().project.projectId !== job.projectId || bridge.currentBundle().scene.sceneId !== job.sceneId) void stop().catch(() => {});
      }, 250);
      const planningSnapshot = chatgptPlanningSnapshot(bridge.currentBundle());
      const targetChat = host.chatgptSessionsRef.current.find(item => item.id === job.sessionId)!;
      const priorHistory = piHistoryForSession(targetChat);
      const pointer = priorHistory ?? targetChat.piBranch;
      const piHistory: PiHistory = priorHistory ?? { sessionId: pointer?.sessionId ?? job.sessionId!, leafId: pointer?.leafId ?? null, nodes: [] };
      const context: PiContext = { options, target, selectedEntityId: bridge.currentContext().selectedEntityId,
        attachedEntityIds: job.attachedEntities?.map(entity => entity.id), attachedMaterialIds: job.attachedMaterials?.map(material => material.id),
        continuation: continuation ?? (approved ? { kind: "approved_plan", plan: approved } : undefined),
        legacyConversation: !pointer ? chatgptConversationContext(session) : undefined };
      report({ piHistory });
      host.flushChatgptSessions();
      const result = await tauri.chatgptPiRun({ generationId, projectId: job.projectId!, sceneId: job.sceneId!, model, prompt, mode, reasoningEffort,
        sessionId: job.sessionId, historySessionId: piHistory.sessionId, historyLeafId: piHistory.leafId ?? undefined,
        context: JSON.stringify(context) }, event => {
        if (event.type === "history") { report({ piHistory: event.history }); return; }
        if (event.type === "input") {
          const previous = job.liveMessages ?? [];
          const next = { ...event.message, state: event.state };
          report({ liveMessages: (previous.some(message => message.id === next.id) ? previous.map(message => message.id === next.id ? next : message) : [...previous, next]) });
          return;
        }
        if (event.type === "usage") { report({ usage: accumulateUsage(event.usage) }, undefined, false); return; }
        if (control.cancelled) return;
        if (event.type === "preview") {
          const preview = event.preview;
          if (preview.source !== "blender" || preview.image?.mimeType !== "image/png" || !/^[A-Za-z0-9+/]+={0,2}$/.test(preview.image.data) || preview.image.data.length > 1_400_000
            || typeof preview.name !== "string" || preview.name.length > 80 || typeof preview.operationId !== "string" || !/^[a-zA-Z0-9_-]{1,160}$/.test(preview.operationId)
            || !Number.isSafeInteger(preview.sequence) || preview.sequence < 1 || !Number.isSafeInteger(preview.capturedAt) || preview.capturedAt < 0 || preview.capturedAt > 8_000_000_000_000_000
            || !Number.isInteger(preview.total) || preview.total < 1 || preview.total > 256 || !Number.isInteger(preview.completed) || preview.completed < 1 || preview.completed > preview.total) return;
          const previews = job.modelPreviews ?? [];
          if (previews.some(item => item.operationId === preview.operationId && item.sequence >= preview.sequence)) return;
          report({ modelPreviews: [...previews, preview].slice(-4) }, undefined, false);
          return;
        }
        if (event.type === "assistant") { report({ assistantText: event.text }, undefined, false); return; }
        if (event.type === "activity") {
          report({ progress: { ...job.progress, phase: event.phase, message: event.message } }, { phase: event.phase, message: event.message });
          return;
        }
        if (event.operationId && event.readOnly === false && event.changed === undefined && !event.saved) beforeOperations.set(event.operationId, bridge.currentBundle());
        if (event.changed) {
          pendingChanges++;
          const beforeStep = event.operationId ? beforeOperations.get(event.operationId) : undefined;
          if (!beforeStep || !event.mutationBeforeFingerprint || authoringSceneProgressFingerprint(beforeStep) !== event.mutationBeforeFingerprint) canRevert = false;
          if (canRevert) {
            try { host.chatgptRevertsRef.current.set(generationId, extendChatgptRevertCheckpoint(host.chatgptRevertsRef.current.get(generationId), beforeStep!, bridge.currentBundle())); }
            catch { canRevert = false; }
          }
          if (!canRevert) host.chatgptRevertsRef.current.delete(generationId);
          while (host.chatgptRevertsRef.current.size > 8) host.chatgptRevertsRef.current.delete(host.chatgptRevertsRef.current.keys().next().value!);
        }
        if (event.operationId && event.changed !== undefined) beforeOperations.delete(event.operationId);
        const completed = job.progress.completed + (event.saved ? pendingChanges : 0);
        if (event.saved) pendingChanges = 0;
        report({ revertAvailable: host.chatgptRevertsRef.current.has(generationId), progress: { ...job.progress, phase: event.saved ? "saving" : "placing", message: event.message, completed, total: completed + pendingChanges } },
          { phase: event.saved ? "saving" : "placing", message: event.message, saved: event.saved && completed > 0 });
      });
      current();
      job = { ...job, liveMessages: job.liveMessages?.map(message => message.state === "queued" ? { ...message, state: "unapplied" } : message), ...(result.history ? { piHistory: result.history } : {}), ...(result.usage ? { usage: accumulateUsage(result.usage) } : {}) };
      if (result.plan) {
        if (!result.plan.questions?.length && planningSnapshot !== chatgptPlanningSnapshot(bridge.currentBundle())) throw new Error("プラン作成中にSceneが変わりました。最新のSceneからプランを作り直してください");
        const plan: PiPlan = result.plan;
        host.chatgptPlansRef.current.set(generationId, { plan, snapshot: chatgptPlanningSnapshot(bridge.currentBundle()), target: created ? "current" : target });
        report({ status: "planned", plan, nextActions: [plan.questions?.length ? "answer_chatgpt_questions" : "apply_chatgpt_plan", "cancel_chatgpt_generation"],
          progress: { ...job.progress, phase: "planned", message: result.plan.description } });
        return null;
      }
      host.chatgptPlansRef.current.delete(generationId);
      report({ status: "completed", completionVerified: result.completionVerified === true, path: project?.path, name: project?.name, progress: { ...job.progress, phase: "completed", message: result.text || "応答が終わりました。Sceneを確認できます。" } });
      return project;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report({ status: control.cancelled ? "cancelled" : "failed", error: control.cancelled ? undefined : message,
        liveMessages: job.liveMessages?.map(message => message.state === "queued" ? { ...message, state: "unapplied" } : message),
        progress: { ...job.progress, phase: control.cancelled ? "cancelled" : "failed", message } });
      throw error;
    } finally {
      if (watch !== undefined) clearInterval(watch);
      host.piRunsRef.current.delete(generationId); host.chatgptControlsRef.current.delete(generationId);
      if (host.chatgptGenerationRef.current === generationId) host.chatgptGenerationRef.current = null;
    }
  };
}
