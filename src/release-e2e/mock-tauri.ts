import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import type {
  ChatgptConnection,
  ChatgptAssetOptions,
  XriftMcpEditorResponse,
  Project,
  ProjectKind,
  RuntimePaths,
  RuntimeStatus,
  VisualProjectFiles,
  VisualProjectWriteRequest,
} from "../lib/tauri";

type ReleaseE2ECall = {
  command: string;
  detail?: string;
};

export type ReleaseE2EState = {
  calls: ReleaseE2ECall[];
  shellCommands: string[];
  uploadAttempts: string[];
  unhandledCommands: string[];
  projects: Project[];
  chatgpt: ChatgptConnection;
  /** Isolated native-save controls for observing ChatGPT's incremental writes. */
  chatgptSaveGate: number | null;
  chatgptSaveFailAt: number | null;
  chatgptCreateGate: boolean;
  chatgptCreateWaiting: boolean;
  chatgptSavedSteps: Array<{ projectPath: string; projectId: string; entityNames: string[] }>;
  piGate: boolean;
  piWaiting: boolean;
  piScript: { tool: string; arguments: Record<string, unknown> }[] | null;
  piError: string | null;
  chatgptCancelledGenerations: string[];
  chatgptRequests: Array<{ generationId: string; options: ChatgptAssetOptions }>;
};

const piScopes = new Map<string, { projectId: string; sceneId: string }>();
const mcpResponses = new Map<string, (response: XriftMcpEditorResponse) => void>();
/** Uses the real App/Editor handlers, with only the native transport mocked. */
export async function callReleaseE2EMcp(tool: string, argumentsValue: Record<string, unknown> = {}, internalGenerationId?: string): Promise<XriftMcpEditorResponse> {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => { mcpResponses.delete(id); reject(new Error(`MCP fixture timeout: ${tool}`)); }, 30_000);
    mcpResponses.set(id, response => { clearTimeout(timeout); resolve(response); });
    void emit("xrift-mcp-editor-request", { id, tool, arguments: argumentsValue, clientName: "Release E2E", internalGenerationId, internalScope: internalGenerationId ? piScopes.get(internalGenerationId) : undefined }).catch(reject);
  });
}

type TauriInternals = {
  invoke?: (command: string, args?: Record<string, unknown>, options?: unknown) => Promise<unknown>;
  convertFileSrc?: (filePath: string, protocol?: string) => string;
  runCallback?: (id: number, payload: unknown) => void;
};

declare global {
  interface Window {
    __XRIFT_RELEASE_E2E__?: ReleaseE2EState;
    __TAURI_INTERNALS__?: TauriInternals;
  }
}

const PROJECTS_ROOT = "C:\\XRiftE2E\\projects";
const CLASSIC_WORLD_PATH = `${PROJECTS_ROOT}\\classic-world`;
const CLASSIC_ITEM_PATH = `${PROJECTS_ROOT}\\classic-item`;
const RECOMMENDED_XRIFT_VERSION = "0.25.0";
const NODE_VERSION = "24.21.0";

const runtimePaths: RuntimePaths = {
  appRoot: "C:\\XRiftE2E",
  runtimeDir: "C:\\XRiftE2E\\runtime",
  nodeDistDir: "C:\\XRiftE2E\\runtime\\node",
  nodeBinDir: "C:\\XRiftE2E\\runtime\\node",
  nodeExe: "C:\\XRiftE2E\\runtime\\node\\node.exe",
  npmCliJs: "C:\\XRiftE2E\\runtime\\node\\npm-cli.js",
  npmPrefix: "C:\\XRiftE2E\\runtime\\npm",
  npmCache: "C:\\XRiftE2E\\runtime\\cache",
  home: "C:\\XRiftE2E\\home",
  projectsRoot: PROJECTS_ROOT,
  xriftCmd: "C:\\XRiftE2E\\runtime\\xrift.cmd",
  xriftJs: "C:\\XRiftE2E\\runtime\\xrift.js",
};

const initialProjects: Project[] = [
  {
    name: "classic-world",
    path: CLASSIC_WORLD_PATH,
    kind: "world",
    format: "classic",
    title: "E2E Classic World",
    description: "リリース前確認用のクラシックワールド",
    modifiedAtMs: Date.parse("2026-07-20T10:00:00+09:00"),
    uploadedAt: null,
    publicationId: null,
  },
  {
    name: "classic-item",
    path: CLASSIC_ITEM_PATH,
    kind: "item",
    format: "classic",
    title: "E2E Classic Item",
    description: "リリース前確認用のクラシックアイテム",
    modifiedAtMs: Date.parse("2026-07-21T10:00:00+09:00"),
    uploadedAt: null,
    publicationId: null,
  },
];

const templateMetadata: Record<ProjectKind, Record<string, unknown>> = {
  world: {
    title: "サンプルワールド",
    description: "React Three FiberとRapierで作られたサンプルワールドです",
    thumbnailPath: "thumbnail.png",
    distDir: "./dist",
    buildCommand: "npm run build",
    physics: { gravity: 9.81, allowInfiniteJump: true },
    camera: { near: 0.1, far: 1000 },
  },
  item: {
    title: "Sample Item",
    description: "A sample item created with XRift item template",
    thumbnailPath: "thumbnail.png",
    distDir: "./dist",
    buildCommand: "npm run build",
    permissions: { allowedDomains: [], allowedCodeRules: [] },
  },
};

function classicFiles(kind: ProjectKind): Map<string, string> {
  return new Map([
    [
      "xrift.json",
      `${JSON.stringify({ [kind]: templateMetadata[kind] }, null, 2)}\n`,
    ],
    [
      "README.md",
      `# Release E2E ${kind === "world" ? "World" : "Item"}\n`,
    ],
  ]);
}

function copyProject(project: Project): Project {
  return { ...project };
}

function payloadRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return {};
  return payload as Record<string, unknown>;
}

function stringArg(
  payload: Record<string, unknown>,
  key: string,
  fallback = "",
): string {
  return typeof payload[key] === "string" ? payload[key] : fallback;
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function listFileEntries(
  files: Map<string, string>,
  requestedRelativePath: string,
) {
  const relativePath = toPosixPath(requestedRelativePath);
  const prefix = relativePath ? `${relativePath}/` : "";
  const entries = new Map<
    string,
    { name: string; rel: string; isDir: boolean; size: number | null }
  >();

  for (const [fileRelativePath, content] of files) {
    const normalized = toPosixPath(fileRelativePath);
    if (!normalized.startsWith(prefix)) continue;
    const remainder = normalized.slice(prefix.length);
    if (!remainder) continue;
    const [name, ...rest] = remainder.split("/");
    if (!name) continue;
    const rel = prefix ? `${relativePath}/${name}` : name;
    const isDir = rest.length > 0;
    entries.set(name, {
      name,
      rel,
      isDir,
      size: isDir ? null : content.length,
    });
  }

  return [...entries.values()].sort((left, right) => {
    if (left.isDir !== right.isDir) return left.isDir ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}

function projectFromVisualRequest(
  root: string,
  directoryName: string,
  request: VisualProjectWriteRequest,
): Project {
  const projectDocument = JSON.parse(request.projectJson) as {
    projectKind?: ProjectKind;
    metadata?: {
      name?: string;
      title?: string;
      description?: string;
    };
  };
  const kind = projectDocument.projectKind === "item" ? "item" : "world";
  return {
    name: directoryName,
    path: `${root}\\${directoryName}`,
    kind,
    format: "visual",
    title: projectDocument.metadata?.title || directoryName,
    description: projectDocument.metadata?.description || null,
    modifiedAtMs: Date.now(),
    uploadedAt: null,
    publicationId: null,
  };
}

function emitShellEvent(
  channelId: number,
  index: number,
  event: "Stdout" | "Stderr" | "Terminated" | "Error",
  payload: unknown,
) {
  queueMicrotask(() => {
    window.__TAURI_INTERNALS__?.runCallback?.(channelId, {
      index,
      message: { event, payload },
    });
  });
}

export function installReleaseE2EMock(): void {
  // Tauri 2 checks this flag, independently of the mocked IPC internals.
  Object.defineProperty(window, "isTauri", { value: true, configurable: true });
  const searchParams = new URLSearchParams(window.location.search);
  const scenario = searchParams.get("scenario");
  let saveFailuresRemaining = Math.max(
    0,
    Number.parseInt(searchParams.get("saveFailures") ?? "0", 10) || 0,
  );
  const firstSetup = scenario === "setup" || scenario === "setup-error";
  const cliUpdate = scenario?.startsWith("cli-update") ?? false;
  let nodeInstalled = !firstSetup && scenario !== "runtime-node-update";
  let xriftUpdateRequired = scenario?.startsWith("runtime-update") ?? false;
  let xriftVersion = firstSetup
    ? null
    : xriftUpdateRequired
      ? "0.24.4"
      : scenario === "runtime-newer" || scenario === "runtime-node-update"
        ? "0.26.0"
        : RECOMMENDED_XRIFT_VERSION;
  let setupFailuresRemaining = scenario === "runtime-update-error" ? 1 : 0;
  let updateFailuresRemaining = scenario === "cli-update-error" ? 1 : 0;
  const runtimeStatus = (): RuntimeStatus => ({
    ready: nodeInstalled && xriftVersion !== null && !xriftUpdateRequired,
    nodeInstalled,
    nodeVersion: NODE_VERSION,
    xriftInstalled: xriftVersion !== null,
    xriftVersion,
    recommendedXriftVersion: RECOMMENDED_XRIFT_VERSION,
    xriftUpdateRequired,
    paths: { ...runtimePaths },
  });
  let nextPid = 4100;

  const state: ReleaseE2EState = {
    calls: [],
    shellCommands: [],
    uploadAttempts: [],
    unhandledCommands: [],
    projects: initialProjects.map(copyProject),
    chatgpt: { signedIn: false, email: null, planUsageEnabled: false, connecting: false, error: null },
    chatgptSaveGate: null,
    chatgptSaveFailAt: null,
    chatgptCreateGate: false,
    chatgptCreateWaiting: false,
    chatgptSavedSteps: [],
    piGate: false,
    piWaiting: false,
    piScript: null,
    piError: null,
    chatgptCancelledGenerations: [],
    chatgptRequests: [],
  };
  const projectFiles = new Map<string, Map<string, string>>([
    [CLASSIC_WORLD_PATH, classicFiles("world")],
    [CLASSIC_ITEM_PATH, classicFiles("item")],
  ]);
  const thumbnails = new Map<string, string>();
  const visualDocuments = new Map<string, VisualProjectWriteRequest>();

  window.__XRIFT_RELEASE_E2E__ = state;
  window.__TAURI_OS_PLUGIN_INTERNALS__ = {
    platform: "windows",
    family: "windows",
    os_type: "windows",
    arch: "x86_64",
    version: "11",
    exe_extension: "exe",
    eol: "\r\n",
  };

  mockWindows("main");
  mockIPC(
    async (command, rawPayload) => {
      const payload = payloadRecord(rawPayload);
      state.calls.push({ command });

      switch (command) {
        case "get_versions":
          return {
            appVersion: "0.5.6",
            nodeVersion: nodeInstalled ? `v${NODE_VERSION}` : "",
          };
        case "runtime_paths":
          return { ...runtimePaths };
        case "runtime_status":
          return runtimeStatus();
        case "setup_runtime":
          await new Promise((resolve) => window.setTimeout(resolve, 500));
          if (scenario === "setup-error") {
            throw new Error(
              "Runtime install failed at C:\\Users\\release-e2e\\runtime; password=do-not-copy",
            );
          }
          if (setupFailuresRemaining > 0) {
            setupFailuresRemaining -= 1;
            throw new Error("CLIのダウンロードに失敗しました");
          }
          if (scenario === "runtime-update-incomplete") return runtimeStatus();
          nodeInstalled = true;
          if (xriftUpdateRequired || !xriftVersion) {
            xriftVersion = RECOMMENDED_XRIFT_VERSION;
          }
          xriftUpdateRequired = false;
          return runtimeStatus();
        case "sandbox_env":
          return {
            XRIFT_E2E: "1",
          };
        case "ensure_dir":
          return null;
        case "list_projects":
          return state.projects.map(copyProject);
        case "take_opened_project_archives":
          return [];
        case "delete_project": {
          const projectPath = stringArg(payload, "projectPath");
          state.projects = state.projects.filter(
            (project) => project.path !== projectPath,
          );
          projectFiles.delete(projectPath);
          visualDocuments.delete(projectPath);
          return null;
        }
        case "create_visual_project": {
          const root = stringArg(payload, "root", PROJECTS_ROOT);
          const directoryName = stringArg(payload, "directoryName");
          const request = payload.request as VisualProjectWriteRequest;
          if (directoryName.startsWith("chatgpt-world-")) {
            state.chatgptCreateWaiting = true;
            while (state.chatgptCreateGate) {
              await new Promise(resolve => window.requestAnimationFrame(resolve));
            }
            state.chatgptCreateWaiting = false;
          }
          const project = projectFromVisualRequest(root, directoryName, request);
          state.projects.push(project);
          visualDocuments.set(project.path, request);
          return copyProject(project);
        }
        case "read_visual_project": {
          const projectPath = stringArg(payload, "projectPath");
          const request = visualDocuments.get(projectPath);
          if (!request) throw new Error(`Visual project not found: ${projectPath}`);
          return {
            projectJson: request.projectJson,
            sceneDocuments: request.sceneDocuments,
            prefabDocuments: request.prefabDocuments,
            assetManifestJson: request.assetManifestJson,
          } satisfies VisualProjectFiles;
        }
        case "read_world_authoring":
          return null;
        case "save_visual_project": {
          if (saveFailuresRemaining > 0) {
            saveFailuresRemaining -= 1;
            throw new Error("E2E transient visual save failure");
          }
          const projectPath = stringArg(payload, "projectPath");
          const request = payload.request as VisualProjectWriteRequest;
          // The delay and failures affect only newly generated fixture Worlds.
          // Real Editor mutations and saving still run through the App handlers.
          if (/[/\\]chatgpt-world-/.test(projectPath)) {
            const entityNames = request.sceneDocuments.flatMap(file => {
              const scene = JSON.parse(file.content) as { entities: Record<string, { name: string }> };
              return Object.values(scene.entities).map(entity => entity.name);
            });
            const placedCount = entityNames.filter(name => ["広場", "ベンチ", "木"].includes(name)).length;
            await new Promise(resolve => window.setTimeout(resolve, 60));
            while (state.chatgptSaveGate !== null && placedCount === state.chatgptSaveGate) {
              await new Promise(resolve => window.requestAnimationFrame(resolve));
            }
            if (state.chatgptSaveFailAt !== null && placedCount >= state.chatgptSaveFailAt) {
              throw new Error("逐次配置の保存検証用エラー");
            }
            state.chatgptSavedSteps.push({ projectPath, projectId: JSON.parse(request.projectJson).projectId as string, entityNames });
          }
          visualDocuments.set(
            projectPath,
            request,
          );
          const project = state.projects.find(
            (candidate) => candidate.path === projectPath,
          );
          if (project) project.modifiedAtMs = Date.now();
          return null;
        }
        case "read_chatgpt_harness_context": {
          const fingerprint = stringArg(payload, "fingerprint");
          if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error("Invalid authoring context locator");
          return projectFiles.get(stringArg(payload, "projectPath"))?.get(`.cache/xrift-studio-harness/contexts/${fingerprint}.json`) ?? null;
        }
        case "write_chatgpt_harness_context": {
          const projectPath = stringArg(payload, "projectPath"), fingerprint = stringArg(payload, "fingerprint"), content = stringArg(payload, "content");
          if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error("Invalid authoring context locator");
          const relativePath = `.cache/xrift-studio-harness/contexts/${fingerprint}.json`;
          const files = projectFiles.get(projectPath) ?? new Map<string, string>(), previous = files.get(relativePath);
          if (previous !== undefined && previous !== content) throw new Error("Immutable authoring context already exists");
          files.set(relativePath, content); projectFiles.set(projectPath, files); return null;
        }
        case "read_script_source":
        case "read_text_file": {
          const projectPath = stringArg(payload, "projectPath");
          const relativePath = toPosixPath(stringArg(payload, "rel"));
          const content = projectFiles.get(projectPath)?.get(relativePath);
          if (content === undefined) {
            throw new Error(`File not found: ${relativePath}`);
          }
          return content;
        }
        case "write_text_file": {
          const projectPath = stringArg(payload, "projectPath");
          const relativePath = toPosixPath(stringArg(payload, "rel"));
          const content = stringArg(payload, "content");
          const files = projectFiles.get(projectPath) ?? new Map<string, string>();
          files.set(relativePath, content);
          projectFiles.set(projectPath, files);
          if (relativePath === "xrift.json") {
            const project = state.projects.find(
              (candidate) => candidate.path === projectPath,
            );
            if (project) {
              const parsed = JSON.parse(content) as Record<
                ProjectKind,
                { title?: string; description?: string }
              >;
              const metadata = parsed[project.kind];
              project.title = metadata?.title || project.name;
              project.description = metadata?.description || null;
              project.modifiedAtMs = Date.now();
            }
          }
          return null;
        }
        case "list_files": {
          const projectPath = stringArg(payload, "projectPath");
          const files = projectFiles.get(projectPath) ?? new Map<string, string>();
          return listFileEntries(files, stringArg(payload, "rel"));
        }
        case "read_thumbnail":
          return thumbnails.get(stringArg(payload, "projectPath")) ?? null;
        case "write_thumbnail":
          thumbnails.set(
            stringArg(payload, "projectPath"),
            stringArg(payload, "dataUrl"),
          );
          return null;
        case "write_binary_file":
        case "delete_path":
        case "rename_path":
        case "commit_visual_asset_import":
        case "open_visual_asset_location":
        case "set_xrift_mcp_editor_ready":
        case "kill_pid_tree":
          return null;
        case "complete_xrift_mcp_request": {
          const response = payload.response as XriftMcpEditorResponse;
          mcpResponses.get(response.id)?.(response);
          mcpResponses.delete(response.id);
          return null;
        }
        case "chatgpt_status":
          return { ...state.chatgpt };
        case "get_blender_status":
          return { available: false };
        case "chatgpt_login":
          state.chatgpt = { ...state.chatgpt, connecting: true, error: null };
          return { ...state.chatgpt };
        case "chatgpt_logout":
          if (state.chatgpt.connecting) throw new Error("ブラウザでの接続が終わってから解除してください");
          state.chatgpt = { signedIn: false, email: null, planUsageEnabled: false, connecting: false, error: null };
          return { ...state.chatgpt };
        case "chatgpt_models":
          if (!state.chatgpt.planUsageEnabled) throw new Error("ChatGPTプランの利用許可がありません");
          return [{ slug: "fixture-model", displayName: "検証用モデル" }];
        case "chatgpt_cancel_generation": {
          const generationId = stringArg(payload, "generationId");
          state.chatgptCancelledGenerations.push(generationId);
          return { generationId, cancelled: true };
        }
        case "chatgpt_pi_run": {
          const generationId = stringArg(payload, "generationId");
          piScopes.set(generationId, { projectId: stringArg(payload, "projectId"), sceneId: stringArg(payload, "sceneId") });
          const cancelled = () => state.chatgptCancelledGenerations.includes(generationId);
          const context = JSON.parse(stringArg(payload, "context"));
          const history = { sessionId: stringArg(payload, "historySessionId") || stringArg(payload, "sessionId") || generationId,
            leafId: `reply-${generationId}`, nodes: [{ id: `reply-${generationId}`, parentId: typeof payload.historyLeafId === "string" ? payload.historyLeafId : null, label: "AIの応答", canBranch: true }] };
          state.chatgptRequests.push({ generationId, options: context.options as ChatgptAssetOptions });
          state.piWaiting = true;
          try {
            while (state.piGate) {
              if (cancelled()) throw new Error("Piの検証用処理を停止しました");
              await new Promise(resolve => window.setTimeout(resolve, 25));
            }
            if (cancelled()) throw new Error("Piの検証用処理を停止しました");
            if (state.piError) throw new Error(state.piError);
            if (payload.mode === "plan") return { text: "", history, plan: { title: "Piの制作プラン", description: "家の本体と屋根を作り、正式な保存・検証・撮影で確認します" } };
            let index = 0;
            const channel = payload.onProgress as { id?: number } | string;
            const channelId = typeof channel === "string" ? Number(channel.split(":")[1]) : channel.id;
            const progress = (message: Record<string, unknown>) => {
              if (channelId !== undefined) window.__TAURI_INTERNALS__?.runCallback?.(channelId, { index: index++, message: { type: "progress", ...message } });
            };
            const steps = state.piScript ?? [
              { tool: "apply_r3f_scene", arguments: { name: "Piの家", source: 'export default function World(){return <group name="Piの家"><mesh key="body" name="家の本体" position={[0,1,0]}><boxGeometry args={[3,2,3]}/><meshStandardMaterial color="#b9986b"/></mesh><mesh key="roof" name="屋根" position={[0,2.6,0]} rotation={[0,Math.PI/4,0]}><boxGeometry args={[3.5,0.25,3.5]}/><meshStandardMaterial color="#704b40"/></mesh></group>}' } },
              { tool: "save_scene", arguments: {} },
              { tool: "get_project_health", arguments: {} },
              { tool: "set_scene_view_camera", arguments: { preset: "iso" } },
              { tool: "capture_scene_view", arguments: {} },
            ];
            for (const step of steps) {
              if (cancelled()) throw new Error("Piの検証用処理を停止しました");
              const before = await callReleaseE2EMcp("get_editor_context", {}, generationId);
              if (!before.ok) throw new Error(JSON.stringify(before.error));
              const current = before.result!;
              if (current.projectId !== payload.projectId || current.sceneId !== payload.sceneId) throw new Error("Sceneが変わりました");
              const operationId = crypto.randomUUID(), readOnly = step.tool.startsWith("get_");
              progress({ message: `${step.tool} を実行しています`, tool: step.tool, operationId, readOnly });
              const response = await callReleaseE2EMcp(step.tool, { projectId: current.projectId, sceneId: current.sceneId, expectedRevision: current.revision, ...step.arguments }, generationId);
              if (!response.ok) throw new Error(JSON.stringify(response.error));
              progress({ message: step.tool === "save_scene" ? "現在のSceneを保存しました" : `${step.tool} を確認しました`, tool: step.tool, operationId, readOnly,
                mutationBeforeFingerprint: response.result?.mutationBeforeFingerprint,
                changed: response.result?.revisionAfter !== undefined && response.result.revisionAfter !== response.result.revisionBefore,
                saved: step.tool === "save_scene" });
            }
            return { text: "Piの経路で編集・保存を確認しました（推論と画像レビューは別の試験で検証）", history };
          } finally { state.piWaiting = false; piScopes.delete(generationId); }
        }
        case "chatgpt_pi_delete_history":
          return null;
        case "save_debug_image":
          return "C:/XRiftE2E/debug-captures/pi-scene.png";
        case "read_image_data_url":
          throw new Error("Release E2E fixture does not contain binary files");
        case "check_xrift_latest":
          return cliUpdate ? "0.25.1" : RECOMMENDED_XRIFT_VERSION;
        case "update_xrift":
          await new Promise((resolve) => window.setTimeout(resolve, 500));
          if (updateFailuresRemaining > 0) {
            updateFailuresRemaining -= 1;
            throw new Error("CLIのダウンロードに失敗しました");
          }
          if (scenario !== "cli-update-incomplete") xriftVersion = "0.25.2";
          return null;
        case "detect_xrift_mcp_clients":
          return [];
        case "list_external_store_assets":
          return [];
        case "plugin:updater|check":
          return null;
        case "plugin:resources|close":
        case "plugin:opener|open_url":
        case "plugin:opener|open_path":
        case "plugin:shell|kill":
        case "plugin:shell|stdin_write":
          return null;
        case "plugin:os|locale":
          return "ja-JP";
        case "plugin:dialog|open":
          return null;
        case "plugin:shell|spawn": {
          const args = Array.isArray(payload.args)
            ? payload.args.filter(
                (value): value is string => typeof value === "string",
              )
            : [];
          const shellCommand = args.join(" ");
          const channelId =
            typeof (payload.onEvent as { id?: unknown } | undefined)?.id ===
            "number"
              ? (payload.onEvent as { id: number }).id
              : null;
          const pid = nextPid++;
          state.shellCommands.push(shellCommand);
          state.calls[state.calls.length - 1] = {
            command,
            detail: shellCommand,
          };

          if (/(^|\s)upload(\s|$)/i.test(shellCommand)) {
            state.uploadAttempts.push(shellCommand);
            throw new Error(
              "Release E2E safety boundary: XRift upload must not be executed",
            );
          }
          if (channelId === null) {
            throw new Error("Shell command did not provide an event channel");
          }

          const createIndex = args.indexOf("create");
          if (createIndex >= 0) {
            const kind = args[createIndex + 1] === "item" ? "item" : "world";
            const name = args[createIndex + 2] ?? `release-${kind}`;
            const projectPath = `${PROJECTS_ROOT}\\${name}`;
            if (
              !state.projects.some(
                (project) =>
                  project.name === name &&
                  project.kind === kind &&
                  project.format === "classic",
              )
            ) {
              state.projects.push({
                name,
                path: projectPath,
                kind,
                format: "classic",
                title: name,
                description: null,
                modifiedAtMs: Date.now(),
                uploadedAt: null,
                publicationId: null,
              });
              projectFiles.set(projectPath, classicFiles(kind));
            }
          }

          if (args.includes("run") && args.includes("dev")) {
            emitShellEvent(
              channelId,
              0,
              "Stdout",
              "Local: http://localhost:4173/",
            );
            return pid;
          }

          let stdout = "Command completed";
          if (args.includes("--version")) {
            stdout = xriftVersion ?? "";
          } else if (args.includes("whoami")) {
            stdout =
              "User: Release Tester\nID: 11111111-2222-4333-8444-555555555555";
          } else if (args.includes("check") && args.includes("item")) {
            stdout = "Item security check passed";
          } else if (createIndex >= 0) {
            stdout = "Project created";
          }
          emitShellEvent(channelId, 0, "Stdout", stdout);
          emitShellEvent(channelId, 1, "Terminated", {
            code: 0,
            signal: null,
          });
          return pid;
        }
        case "mark_compiler_upload_started":
          state.uploadAttempts.push(command);
          throw new Error(
            "Release E2E safety boundary: visual upload must not be executed",
          );
        default:
          state.unhandledCommands.push(command);
          return null;
      }
    },
    { shouldMockEvents: true },
  );

  if (window.__TAURI_INTERNALS__) {
    // event.js sends eventId while the bundled event mock removes args.id.
    // Normalize the fixture transport so StrictMode listeners are removed.
    const originalInvoke = window.__TAURI_INTERNALS__.invoke;
    if (originalInvoke) window.__TAURI_INTERNALS__.invoke = (command, args, options) => originalInvoke(command,
      command === "plugin:event|unlisten" && args ? { ...args, id: args.eventId ?? args.id } : args, options);
    window.__TAURI_INTERNALS__.convertFileSrc = (
      filePath: string,
      protocol = "asset",
    ) => `${protocol}://localhost/${encodeURIComponent(filePath)}`;
  }
}
