import { createChatgptAuthoringPass, type ChatgptAuthoringHost } from "./chatgpt-authoring-host";
import { runStudioPiAgent } from "./pi-studio-agent";
import { buildChatgptHarnessContext, chatgptHarnessSceneFingerprint } from "./chatgpt-harness-context";
import { authoringSceneProgressFingerprint } from "./authoring-scene-progress";
import { parseChatgptSceneReview } from "./authoring-criteria";
import { chatgptAgentConversation } from "./chatgpt-live-scene";
import { tauri, type Project } from "../tauri";

type Request = Parameters<ReturnType<typeof createChatgptAuthoringPass>>;
export function assertPiCompletion(evidence: { changed: boolean; current: string; saved?: string; reviewed?: string; approved: boolean }) {
  if (!evidence.changed) throw new Error("実際のSceneの変更がありません。操作件数だけでは制作を完了できません");
  if (evidence.current !== evidence.saved) throw new Error("最新のSceneが保存されていません");
  if (!evidence.approved || evidence.current !== evidence.reviewed) throw new Error("最新のSceneの画像確認と修正が必要です");
}

/** Each author tool delegates to the existing validated document/Editor/save
 * transaction. Pi selects subsequent reads, repairs and inspection explicitly. */
export async function runPiAuthoring(host: ChatgptAuthoringHost, initial: Request): Promise<Project | null> {
  initial[3] ??= crypto.randomUUID();
  const runId = initial[3], [model, prompt] = initial;
  const originalBridge = host.requireMcpProjectBridge("Piの制作");
  const originalProgress = authoringSceneProgressFingerprint(originalBridge.currentBundle());
  let bridge = originalBridge;
  let projectId = bridge.currentBundle().project.projectId, sceneId = bridge.currentBundle().scene.sceneId;
  let request = initial, committed = false, paused = false;
  let reviewed: string | undefined, approved = false;
  let contextRead = false, authored = false;
  let failure: unknown;
  const control = { cancelled: false };
  const job = () => host.chatgptGenerationsRef.current.get(runId);
  const run = () => host.chatgptHarnessRunsRef.current.get(runId);
  const pass = createChatgptAuthoringPass(host, true, () => { committed = true; reviewed = undefined; approved = false; });
  const check = () => {
    if (control.cancelled) throw new Error("制作を停止しました。保存済みの変更は残っています");
    if (failure) throw failure;
    if (!paused && authored && run()) run()!.check();
    if (host.mcpProjectBridgeRef.current !== bridge || host.visualSessionRef.current?.bundle.project.projectId !== projectId
      || bridge.currentBundle().scene.sceneId !== sceneId || !bridge.currentContext().canGenerate) throw new Error("作品、Sceneまたは編集状態が変わったため制作を停止しました。保存済みの変更は残っています");
  };
  const report = (message: string, status?: "completed" | "cancelled" | "failed") => {
    const current = job(); if (!current) return;
    const next = { ...current, harness: run()?.snapshot() ?? current.harness, ...(status ? { status, cancelling: false, error: status === "failed" ? message : undefined,
        nextActions: status === "completed" ? ["get_editor_context", "capture_scene_view"] : ["get_chatgpt_connection", "get_editor_context"] } : {}),
      progress: { ...current.progress, ...(status ? { phase: status } : {}), message } };
    host.chatgptGenerationsRef.current.set(runId, next); host.setChatgptGeneration(next); host.recordChatgptGeneration(next, Boolean(status)); host.flushChatgptSessions();
  };
  const packet = () => buildChatgptHarnessContext(bridge.currentBundle());
  try {
    await runStudioPiAgent({ model, prompt, check,
      decide: async (transcript) => {
        // Bootstrap establishes visible request ownership through the existing
        // host. Subsequent tool selection is inferred by the native model.
        if (!contextRead) return "studio_context";
        if (!authored) return "studio_author";
        report("最新のSceneと確認結果から、次の制作操作を考えています");
        return run()!.step("plan", "Piで次の制作操作を判断", () => tauri.chatgptAgentTurn(model, runId, transcript, initial[7]), { modelCalls: 1 });
      },
      execute: async tool => {
        check();
        if (tool === "studio_context") {
          contextRead = true;
          const bundle = bridge.currentBundle();
          // The author tool independently collects complete bounded planning
          // context. This observation helps Pi choose work without duplicating source.
          return { observation: { projectId, sceneId, fingerprint: chatgptHarnessSceneFingerprint(bundle),
            entities: Object.values(bundle.scene.entities).slice(0, 100).map(entity => ({ id: entity.id, name: entity.name })),
            entityCount: Object.keys(bundle.scene.entities).length, assets: Object.keys(bundle.assets.assets).length,
            saved: run()?.snapshot().savedFingerprint === chatgptHarnessSceneFingerprint(bundle), authored } };
        }
        if (tool === "studio_author") {
          reviewed = undefined; approved = false;
          // The pass owns the visible lock while it runs. Restore it between Pi
          // turns too, so Queue dispatch and cancellation retain the same owner.
          if (host.chatgptGenerationRef.current === runId) host.chatgptGenerationRef.current = null;
          let result: Awaited<ReturnType<typeof pass>>;
          try { result = await pass(...request); }
          catch (error) { failure = error; throw error; }
          finally {
            if (job()?.status === "running") { host.chatgptGenerationRef.current = runId; host.chatgptControlsRef.current.set(runId, control); }
          }
          authored = true;
          if (!result || !("retry" in result)) {
            paused = job()?.status === "planned";
            if (!paused) throw new Error("制作パスの終了状態を確認できませんでした");
            return { observation: { status: "awaiting-user" }, terminal: true };
          }
          bridge = host.requireMcpProjectBridge("Piの制作");
          projectId = bridge.currentBundle().project.projectId; sceneId = bridge.currentBundle().scene.sceneId;
          const [model, prompt, options, generationId, mode = "build", , , reasoningEffort] = request;
          request = [model, prompt, options, generationId, result.retry.reconfirm ? "plan" : mode, result.target, undefined, reasoningEffort, result.sessionId, result.retry];
          const fingerprint = chatgptHarnessSceneFingerprint(bridge.currentBundle());
          const saved = run()!.snapshot().savedFingerprint === fingerprint && !run()!.snapshot().dirty;
          const needsReplan = result.retry.reason !== "agent";
          return { observation: { status: needsReplan ? "replan-required" : saved ? "saved-pass" : "unsaved-pass",
            reason: result.retry.reason ?? "scene-conflict", saved,
            changed: committed && authoringSceneProgressFingerprint(bridge.currentBundle()) !== originalProgress,
            fingerprint, needsInspection: saved && !needsReplan } };
        }
        if (tool === "studio_inspect") {
          const runtime = run()!;
          const bundle = bridge.currentBundle(), fingerprint = chatgptHarnessSceneFingerprint(bundle);
          const checkRevision = () => { check(); if (bridge.currentBundle() !== bundle) throw new Error("画像確認中にSceneが変わりました。最新のSceneを再確認してください"); };
          report("保存済みのSceneを撮影し、元の依頼に沿って確認しています");
          // Re-save through the formal bridge and attest the same exact revision.
          runtime.observeScene(fingerprint);
          const saved = await runtime.step("save", "画像確認前に最新のSceneを保存", () => bridge.saveNow());
          checkRevision();
          if (!saved) throw new Error("画像確認前のSceneを保存できませんでした");
          runtime.recordSaved(fingerprint);
          const images = await runtime.step("capture", "Sceneを2方向から撮影", () => bridge.captureWorldViews(checkRevision));
          checkRevision();
          if (images.length < 2 || new Set(images.map(image => image.label)).size < 2) throw new Error("Sceneの2方向の画像を取得できませんでした");
          const criteria = ["元の依頼の範囲と条件を満たしている"];
          const input = packet();
          const review = parseChatgptSceneReview(await runtime.step("inspect", "最新の画像とSceneを確認", () => tauri.chatgptReviewScene(model, runId, prompt,
            { scope: "edit", detail: "focused", focus: "元の制作依頼の確認", criteria, maxPasses: 6 }, input.scene, input.resources, images, initial[7]), { modelCalls: 1 }), criteria);
          checkRevision();
          reviewed = fingerprint; approved = review.approved;
          runtime.recordInspection({ fingerprint, approved, views: images.length });
          // Reviewer observations feed the next bounded author pass as data.
          const current = job()!;
          request[9] = { attempt: 0, completed: current.progress.completed, reason: "agent", reconfirm: false,
            conversation: [...chatgptAgentConversation(request[9]?.conversation ?? [], current).slice(-4),
              { prompt: "最新のSceneの画像確認結果", result: `${review.summary}。残る作業：${review.remainingWork}` }] };
          report(review.approved ? "最新のSceneの画像確認を終えました" : "画像確認で残る修正を確認しました。制作を続けます");
          return { observation: { fingerprint, approved, summary: review.summary, remainingWork: review.remainingWork } };
        }
        const runtime = run()!;
        const fingerprint = chatgptHarnessSceneFingerprint(bridge.currentBundle());
        try { assertPiCompletion({ changed: committed && authoringSceneProgressFingerprint(bridge.currentBundle()) !== originalProgress,
          current: fingerprint, saved: runtime.snapshot().savedFingerprint, reviewed, approved }); }
        catch { return { observation: { status: "completion-rejected", changed: committed, needsLatestSavedInspection: true } }; }
        runtime.finish({ fingerprint, requireInspection: true, checkpoint: completed => {
          host.recordChatgptGeneration({ ...job()!, harness: completed }); host.flushChatgptSessions();
        } });
        // finish closes the lifecycle; check() must still allow terminal delivery.
        paused = true;
        report("依頼の変更を保存し、最新のSceneの画像確認を終えました。Scene Viewで確認できます", "completed");
        return { observation: { status: "completed", fingerprint }, terminal: true };
      },
    });
    return paused && job()?.status === "planned" ? null : host.visualSessionRef.current?.project ?? null;
  } catch (error) {
    const runtime = run();
    if (runtime && !["failed", "cancelled", "completed"].includes(runtime.snapshot().phase)) {
      if (control.cancelled) await runtime.stop("user"); else await runtime.fail();
    }
    const cancelled = control.cancelled || runtime?.snapshot().phase === "cancelled";
    report(error instanceof Error ? error.message : "制作を停止しました。保存済みの変更は残っています", cancelled ? "cancelled" : "failed");
    throw error;
  } finally {
    if (host.chatgptGenerationRef.current === runId) host.chatgptGenerationRef.current = null;
    host.chatgptControlsRef.current.delete(runId);
    const runtime = run();
    if (runtime && ["completed", "cancelled", "failed"].includes(runtime.snapshot().phase)) host.chatgptHarnessRunsRef.current.delete(runId);
  }
}
