import { tauri } from "../tauri";
import type { ChatgptAuthoringHost } from "./chatgpt-authoring-host";
import { createChatgptAuthoringRunner } from "./chatgpt-authoring-host";
import { createChatgptSession, sanitizeChatgptHistoryText } from "./chatgpt-sessions";
import { createStarterVisualProject } from "./starter-templates";
import { createPreparedStarterVisualProjectOnDisk, prepareStarterVisualProject } from "../visual-editor";
import type { ChatgptGeneration } from "./chatgpt-generation";
import { hasAuthoringRunOwner, readAuthoringState } from "./world-authoring";

/** All new requests use Pi. The old adapter only applies already stored legacy plans. */
export function createPiAuthoringRunner(host: ChatgptAuthoringHost) {
  const legacy = createChatgptAuthoringRunner(host);
  return async (...args: Parameters<typeof legacy>) => {
    const [model, prompt, options, suppliedId, mode = "build", target = "current", approved, reasoningEffort, requestedSessionId, , entityIds = [], materialIds = []] = args;
    if (approved) return legacy(...args);
    if (host.chatgptGenerationRef.current || host.mcpPublishActiveRef.current || host.mcpModelingActiveRef.current) throw new Error("現在の処理が終わってから制作を依頼してください");
    if (!tauri.isAvailable() || !host.projectsRoot) throw new Error("デスクトップ版でワールドを開いてください");
    let bridge = host.requireMcpProjectBridge("Piによる制作");
    if (!bridge.currentContext().canGenerate) throw new Error("Playと素材の読み込みが終わってから制作を依頼してください");
    const source = bridge.currentBundle();
    const sourceProjectId = source.project.projectId, sourceSceneId = source.scene.sceneId;
    const generationId = suppliedId ?? crypto.randomUUID();
    const control = { cancelled: false };
    host.chatgptGenerationRef.current = generationId;
    host.chatgptControlsRef.current.set(generationId, control);
    let session = host.chatgptSessionsRef.current.find(value => value.id === (requestedSessionId ?? host.selectedChatgptSessionIdRef.current)
      && value.projectId === sourceProjectId && value.sceneId === sourceSceneId);
    if (requestedSessionId && !session) {
      host.chatgptGenerationRef.current = null; host.chatgptControlsRef.current.delete(generationId);
      throw new Error("このSceneのチャットを選んでください");
    }
    if (!session) {
      session = createChatgptSession(sourceProjectId, sourceSceneId);
      host.updateChatgptSessions([session, ...host.chatgptSessionsRef.current].slice(0, 20), true);
    }
    host.selectChatgptSession(session.id);
    let job: ChatgptGeneration = {
      engine: "pi", generationId, sessionId: session.id, createdAt: new Date().toISOString(), status: "running",
      mode, model, reasoningEffort: reasoningEffort || "medium", prompt, options,
      sourceProjectId, sourceSceneId, sceneId: sourceSceneId,
      attachedEntities: entityIds.map(id => ({ id, name: source.scene.entities[id]?.name ?? id })),
      attachedMaterials: materialIds.map(id => ({ id, name: source.assets.assets[id]?.name ?? id })),
      progress: { phase: "planning", message: "現在のSceneを確認しています", completed: 0, total: 0, recentEvents: [] },
    };
    const report = (patch: Partial<ChatgptGeneration>, message?: string, saved = false) => {
      job = { ...job, ...patch };
      if (message) job = { ...job, progress: { ...job.progress, message,
        recentEvents: [...job.progress.recentEvents, { sequence: (job.progress.recentEvents[job.progress.recentEvents.length - 1]?.sequence ?? 0) + 1,
          phase: job.progress.phase, message, saved }].slice(-128) } };
      host.chatgptGenerationsRef.current.set(generationId, job);
      host.setChatgptGeneration(job); host.recordChatgptGeneration(job, job.status !== "running");
    };
    report({});
    let before = source;
    try {
      const sourceBridge = bridge;
      const assertSource = () => {
        if (host.mcpProjectBridgeRef.current !== sourceBridge || sourceBridge.currentContext().projectId !== sourceProjectId
          || sourceBridge.currentContext().sceneId !== sourceSceneId) throw new Error("制作対象のSceneが切り替わりました");
      };
      const sourcePath = host.visualSessionRef.current?.project?.path;
      if (sourcePath && hasAuthoringRunOwner(readAuthoringState(await tauri.readWorldAuthoring(sourcePath, sourceSceneId)))) {
        throw new Error("MCPでワールドを制作中です。完了するか停止してから制作を依頼してください");
      }
      assertSource();
      if (!await bridge.saveNow()) throw new Error("制作前の保存を完了できませんでした");
      if (target === "new") {
        const name = await host.uniqueProjectDirectoryName(host.projectsRoot, `chatgpt-world-${Date.now()}`);
        const prepared = await prepareStarterVisualProject(createStarterVisualProject("world", "blank", name));
        const project = await createPreparedStarterVisualProjectOnDisk(host.projectsRoot, name, prepared);
        if (control.cancelled) throw new Error("制作を停止しました。作成済みのワールドはLibraryに保持されています");
        assertSource();
        if (!await sourceBridge.saveNow()) throw new Error("元のSceneの保存を完了できませんでした");
        assertSource();
        const initial = prepared.plan;
        const next = { project, bundle: { project: initial.project, scene: initial.scene, assets: initial.assets, prefabs: initial.prefabs } };
        host.visualSessionRef.current = next; host.setVisualCompilationFresh(false); host.setVisualThumbnailReadiness(null);
        host.setVisualSession(next);
        bridge = await host.waitForMcpProjectBridge(bridge, { projectId: initial.project.projectId, sceneId: initial.scene.sceneId });
        session = createChatgptSession(initial.project.projectId, initial.scene.sceneId);
        host.updateChatgptSessions([session, ...host.chatgptSessionsRef.current].slice(0, 20), true);
        host.selectChatgptSession(session.id);
        report({ sessionId: session.id, projectId: initial.project.projectId, sceneId: initial.scene.sceneId, path: project.path, name: project.name });
        await host.refreshProjects();
      }
      before = bridge.currentBundle();
      const scope = bridge.currentContext();
      if (control.cancelled) throw new Error("制作を停止しました");
      const result = await tauri.runPiAgent({
        generationId, sessionId: session.id, projectId: scope.projectId, sceneId: scope.sceneId,
        model, mode, reasoningEffort: reasoningEffort || "medium",
        prompt: prompt + "\n依頼で指定されたEntity IDs: " + JSON.stringify(entityIds)
          + "\n依頼で指定されたMaterial IDs: " + JSON.stringify(materialIds)
          + "\n素材の方針: " + JSON.stringify(options),
      }, event => {
        if (job.status !== "running") return;
        if (event.type === "tool_start") {
          report({ progress: { ...job.progress, phase: event.tool === "save_project" ? "saving" : "placing" } },
            `Studio: ${event.tool}`);
        } else if (event.type === "tool_end") {
          // Only document changes count, not reads, saves, or no-op attempts.
          const changed = event.changed === true;
          report({ progress: { ...job.progress, completed: job.progress.completed + Number(changed),
            total: job.progress.total + Number(changed) } },
            `${event.ok ? "確認しました" : "修正が必要です"}: ${event.tool}`, false);
        }
      });
      if (control.cancelled) throw new Error("制作を停止しました。保存済みの変更は保持されています");
      if (bridge.currentContext().projectId !== scope.projectId || bridge.currentContext().sceneId !== scope.sceneId) throw new Error("対象のSceneが切り替わりました");
      const description = sanitizeChatgptHistoryText(result.summary, 2000);
      if (mode === "plan") {
        report({ status: "planned", plan: { title: "制作プラン", description, objects: [] },
          progress: { ...job.progress, phase: "planned" } }, description);
      } else {
        if (!result.completed) throw new Error("完成条件の確認が終わっていません");
        if (!await bridge.saveNow()) throw new Error("最終保存を完了できませんでした");
        report({ status: "completed", plan: { title: "制作結果", description, objects: [] },
          progress: { ...job.progress, phase: "completed" } }, description, true);
      }
      return host.visualSessionRef.current?.project ?? null;
    } catch (error) {
      const message = sanitizeChatgptHistoryText(error instanceof Error ? error.message : String(error));
      report({ status: control.cancelled ? "cancelled" : "failed", cancelling: false, error: control.cancelled ? undefined : message,
        progress: { ...job.progress, phase: control.cancelled ? "cancelled" : "failed" } }, message);
      throw error;
    } finally {
      const after = bridge.currentBundle();
      if (after !== before && after.project.projectId === before.project.projectId && after.scene.sceneId === before.scene.sceneId) {
        host.chatgptRevertsRef.current.set(generationId, { before, after });
        report({ revertAvailable: true });
      }
      // Drain normal autosave even on model failure/cancellation; never switch or overwrite another Scene.
      if (host.mcpProjectBridgeRef.current === bridge) await bridge.saveNow().catch(() => undefined);
      host.chatgptControlsRef.current.delete(generationId);
      if (host.chatgptGenerationRef.current === generationId) host.chatgptGenerationRef.current = null;
      host.flushChatgptSessions();
    }
  };
}
