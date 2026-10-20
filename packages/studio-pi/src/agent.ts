import { InMemoryCredentialStore, InMemoryModelsStore, Type, type TSchema, type ModelThinkingLevel } from "@earendil-works/pi-ai";
import { createAgentSession, ModelRuntime, SettingsManager, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { openHistory, historySummary, recordFailedRun, type StoredSession } from "./history.js";
import { createStudioResources, type InstalledPackage } from "./resources.js";
import { studioUserMessage } from "./conversation.js";
import { observeSession } from "./events.js";
import { studioContextExtension } from "./context.js";
import type { PiContext, PiMode, PiResult, PiEvent } from "./protocol.js";
export type { PiResult, PiEvent } from "./protocol.js";

export type ToolSchema = { name: string; description: string; inputSchema: TSchema; readOnly: boolean };
export type PiInput = {
  token: string; model: string; reasoningEffort?: string; prompt: string; mode: PiMode;
  projectId: string; sceneId: string; context: string; tools: ToolSchema[];
  session?: StoredSession; packages?: InstalledPackage[]; resourceRoot?: string;
};
export type HostCall = (tool: string, args: Record<string, unknown>) => Promise<Record<string, any>>;
const define = <T extends TSchema>(tool: ToolDefinition<T>): ToolDefinition => tool as ToolDefinition;
const result = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }], details: {} });
const essential = new Set(["get_editor_context", "get_world_authoring_guide", "save_scene", "get_project_health", "capture_scene_view"]);
const prompt = `You are XRift Studio's Pi authoring agent. Work in Japanese.
Work directly on the user's outcome. Do not create producer, technical-lead, feature-lead or reviewer handoff stages, or require approval of routine implementation steps. Decide ordinary details yourself within the request. Ask only when a missing user decision materially changes the outcome. An explicit Plan request is read-only; normal build and goal requests already authorize the requested edits and verification.
Studio's official tools are registered directly. Use tool_search to load their schemas, or Pi's codemode with searchTools, describeTool and tools.<name>. Read get_editor_context and get_world_authoring_guide first. Batch independent reads when helpful; inspect the results before editing. Pi owns the model/tool loop, tool discovery, code execution, retries and compaction. There are no fixed specialists or Studio turn/call/time budgets.
Use exact Entity, Material and Component definitions. Never invent IDs, fields or paths. Every write needs the live expectedRevision; on STALE_REVISION read the current Scene and revise unfinished work. Preserve unrelated authored content. Only untouched starterEntityIds are disposable. Do not repeat successful edits or no-ops blindly.
Use apply_r3f_scene for static geometry, reading its existing source before updating. For Models, use actual catalog assets or get_modeling_tools and create_blender_model, inspect get_model_asset, place_asset, update_transform and get_entity_bounds as needed. Respect the chosen model source. Decide the steps and placement count from the request; there is no custom model-and-placement workflow. No arbitrary file access, shell, publishing, account changes or project switching.
In plan mode use only read tools, then studio_plan. Use studio_questions only for a consequential unresolved user decision; include just that decision and why it is needed, not a request to approve routine code or verification. If it arises after edits, save the current Scene first, then ask and retain the completed work. Continue in the same conversation after the answer. In build/goal continue working and checking the request. Save with save_scene, inspect get_project_health, then call capture_scene_view directly and judge the actual image. Capture and completion controls are model-only so their results cannot be hidden inside a codemode script. Other Studio tools return structured objects to codemode. Then studio_finish with completion criteria and evidence. A later edit invalidates earlier evidence. Ordinary text is not completion. Report runtime and multiplayer behavior that you could not verify. Conversation branching does not restore the Scene; live Studio state is authoritative.`;

/** Pi owns execution. This adapter only binds Studio tools and validates Studio evidence. */
export async function runStudioAgent(input: PiInput, host: HostCall, emit: (event: PiEvent) => void, signal?: AbortSignal, runtimeOverride?: ModelRuntime): Promise<PiResult> {
  const runtime = runtimeOverride ?? await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsStore: new InMemoryModelsStore(), modelsPath: null, refreshOnCreate: false });
  if (!runtimeOverride) {
    const known = runtime.getModel("openai", input.model) ?? runtime.getModel("openai-codex", input.model);
    runtime.registerProvider("xrift-chatgpt", { api: "openai-responses", baseUrl: "https://api.openai.com/v1", apiKey: input.token,
      models: [{ id: input.model, name: input.model, reasoning: true, thinkingLevelMap: { off: input.reasoningEffort === "none" ? "none" : null }, input: ["text", "image"],
        contextWindow: known?.contextWindow ?? 200_000, maxTokens: known?.maxTokens ?? 32_768,
        cost: known?.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] });
  }
  const model = runtime.getModel("xrift-chatgpt", input.model);
  if (!model) throw new Error("選択したモデルをPiで初期化できませんでした");
  const settings = SettingsManager.inMemory();
  const context = JSON.parse(input.context) as PiContext;
  const resources = await createStudioResources(input.mode === "plan" ? [] : input.packages, input.resourceRoot, settings, prompt, [studioContextExtension(input.prompt, context)]);
  try {
    const manager = await openHistory(input.session);
    const preferences = context.options;
    const available = input.tools.filter(tool => (input.mode !== "plan" || tool.readOnly)
      && (preferences?.modelSource !== "store" || !["apply_r3f_scene", "create_blender_model"].includes(tool.name)));
    let finished = false, wrote = false, completedText = "", completedFingerprint: string | undefined, plan: PiResult["plan"];
    let saved: string | undefined, image: string | undefined, health: string | undefined;
    const check = () => {
      if (signal?.aborted) throw new Error("制作を停止しました");
      if (finished || plan) throw new Error("この依頼は完了または確認待ちです");
    };
    const inScope = (context: Record<string, any>) => context.projectId === input.projectId && context.sceneId === input.sceneId && context.editorMode === "edit" && !context.importBusy;
    const studioTools: ToolDefinition[] = available.map(definition => ({ name: definition.name, label: definition.name, description: definition.description,
      parameters: definition.inputSchema, exposure: definition.name === "capture_scene_view" ? "model-only" : essential.has(definition.name) ? "direct" : "deferred",
      ...(definition.name === "capture_scene_view" ? {} : { outputSchema: Type.Record(Type.String(), Type.Any()) }),
      executionMode: definition.readOnly ? "parallel" : "sequential", annotations: { readOnlyHint: definition.readOnly },
      execute: async (operationId, args) => {
        check();
        const values = args as Record<string, unknown>;
        for (const [key, expected] of [["projectId", input.projectId], ["sceneId", input.sceneId]] as const) {
          if (values[key] !== undefined && values[key] !== expected) throw new Error("別の作品・Sceneへは操作できません");
        }
        emit({ type: "progress", operationId, tool: definition.name, readOnly: definition.readOnly, message: `${definition.name} を実行しています` });
        // Scope and revision checks happen at the authoritative Editor dispatch.
        let value: Record<string, any>;
        try { value = await host(definition.name, values); }
        catch (error) {
          emit({ type: "progress", operationId, tool: definition.name, readOnly: definition.readOnly, changed: false, message: `${definition.name} のエラーを確認しています` });
          throw error;
        }
        const changed = value.changed === true || typeof value.revisionAfter === "number" && value.revisionAfter !== value.revisionBefore;
        if (changed) { wrote = true; saved = image = health = undefined; }
        if (definition.name === "save_scene") saved = value.fingerprint;
        if (definition.name === "capture_scene_view") image = value.fingerprint;
        if (definition.name === "get_project_health") health = value.health?.status !== "error" && !(value.health?.issues ?? []).some((issue: any) => issue.severity === "blocking") ? value.fingerprint : undefined;
        emit({ type: "progress", operationId, tool: definition.name, readOnly: definition.readOnly, changed,
          saved: definition.name === "save_scene", mutationBeforeFingerprint: value.mutationBeforeFingerprint,
          message: definition.name === "save_scene" ? "現在のSceneを保存しました" : `${definition.name} を確認しました` });
        const { image: rendered, ...data } = value;
        return { content: [...result(data).content, ...(rendered?.data && rendered?.mimeType ? [{ type: "image" as const, data: rendered.data, mimeType: rendered.mimeType }] : [])],
          ...(definition.name === "capture_scene_view" ? {} : { structuredContent: data }), details: {} };
      } }));
    const controls: ToolDefinition[] = [
      define({ name: "studio_plan", label: "制作プラン", description: "Return a read-only plan for user review. This makes no edits.", exposure: "model-only", executionMode: "sequential",
        parameters: Type.Object({ title: Type.String({ minLength: 1, maxLength: 160 }), description: Type.String({ minLength: 1, maxLength: 8000 }) }),
        execute: async (_id, args) => { check(); if (input.mode !== "plan") throw new Error("制作中です。正式ツールで作業を進めてください"); plan = args; return result({ planned: true }); } }),
      define({ name: "studio_questions", label: "制作の確認", description: "Ask only a consequential unresolved user decision. Ordinary implementation and verification need no approval. After edits, save the current Scene before asking; retain all completed work for continuation.", exposure: "model-only", executionMode: "sequential",
        parameters: Type.Object({ title: Type.String({ minLength: 1, maxLength: 160 }), description: Type.String({ maxLength: 8000 }), questions: Type.Array(Type.Object({ question: Type.String({ minLength: 1, maxLength: 240 }), choices: Type.Array(Type.String({ minLength: 1, maxLength: 160 }), { minItems: 2, maxItems: 4 }) }), { minItems: 1, maxItems: 3 }) }),
        execute: async (_id, args) => {
          check();
          if (wrote) {
            const current = await host("get_editor_context", {});
            if (!inScope(current) || current.saveStatus !== "saved" || !saved || current.fingerprint !== saved) throw new Error("質問する前に、現在の変更をsave_sceneで保存してください。保存済みの作業を保持して回答を待ちます");
          }
          plan = args;
          return result({ waitingForAnswers: true });
        } }),
      define({ name: "studio_finish", label: "完成条件を確認", description: "Validate current saved Scene, successful Project Health, actual rendered image and each completion criterion. Later edits invalidate evidence.", exposure: "model-only", executionMode: "sequential",
        parameters: Type.Object({ summary: Type.String({ minLength: 1 }), criteria: Type.Array(Type.Object({ criterion: Type.String({ minLength: 1 }), passed: Type.Boolean(), reason: Type.String({ minLength: 1 }) }), { minItems: 1 }) }),
        execute: async (_id, args) => {
          check(); if (input.mode === "plan") throw new Error("studio_planでプランを返してください");
          const current = await host("get_editor_context", {});
          if (!inScope(current) || current.saveStatus !== "saved" || !saved || current.fingerprint !== saved || image !== saved || health !== saved || args.criteria.some(item => !item.passed)) throw new Error("完成条件を満たしていません。最新のSceneを保存し、整合性と描画画像を確認して修正してください");
          finished = true; completedFingerprint = current.fingerprint;
          completedText = [args.summary, ...args.criteria.map(item => `${item.criterion}：${item.reason}`)].join("\n");
          return result({ completed: true });
        } }),
    ];
    const names = new Set([...studioTools, ...controls].map(tool => tool.name));
    for (const extension of resources.loader.getExtensions().extensions) for (const name of extension.tools.keys()) {
      if (names.has(name) || ["read", "write", "edit", "bash", "powershell"].includes(name)) throw new Error(`Studioの操作と同名の拡張ツールは登録できません：${name}`);
    }
    const { session } = await createAgentSession({ modelRuntime: runtime, model, resourceLoader: resources.loader, settingsManager: settings, sessionManager: manager,
      noTools: "builtin", tools: ["+codemode", "+tool_search"], excludeTools: ["read", "write", "edit", "bash", "powershell", "find", "grep", "ls"],
      thinkingLevel: (input.reasoningEffort === "none" ? "off" : input.reasoningEffort || "off") as ModelThinkingLevel, customTools: [...studioTools, ...controls] });
    const stop = () => { void session.abort(); };
    signal?.addEventListener("abort", stop, { once: true });
    const observer = observeSession(session, names, emit);
    try {
      check();
      await session.bindExtensions({ mode: "print", onError: error => emit({ type: "progress", message: `拡張エラー：${error.error.slice(0, 500)}` }) });
      await session.prompt(studioUserMessage(input.prompt, context), { expandPromptTemplates: false });
      if (signal?.aborted) throw new Error("制作を停止しました");
      if (!finished && !plan) throw new Error("Piが完成確認を終えずに停止しました。保存済みの結果を確認して続けてください");
      if (finished) {
        const current = await host("get_editor_context", {});
        if (!inScope(current) || current.fingerprint !== completedFingerprint || current.saveStatus !== "saved") throw new Error("完成確認後にSceneが変わりました。最新の状態を確認してください");
      }
      return { text: completedText || session.getLastAssistantText() || "", usage: { ...observer.usage }, ...(plan ? { plan } : {}), ...(input.session ? { history: historySummary(manager, input.session.id) } : {}) };
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error).replaceAll(input.token, "[redacted]").slice(0, 1000);
      recordFailedRun(manager, message, studioUserMessage(input.prompt, context));
      throw error;
    } finally {
      signal?.removeEventListener("abort", stop);
      observer.dispose();
      const history = historySummary(manager, input.session?.id);
      if (history) emit({ type: "history", history });
      session.dispose();
    }
  } finally { await resources.dispose(); }
}
