import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type {
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
};

type TauriInternals = {
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
  const scenario = new URLSearchParams(window.location.search).get("scenario");
  let runtimeReady = scenario !== "setup";
  let nextPid = 4100;

  const state: ReleaseE2EState = {
    calls: [],
    shellCommands: [],
    uploadAttempts: [],
    unhandledCommands: [],
    projects: initialProjects.map(copyProject),
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
            nodeVersion: runtimeReady ? "v24.0.0" : "",
          };
        case "runtime_paths":
          return { ...runtimePaths };
        case "runtime_status":
          return {
            ready: runtimeReady,
            nodeInstalled: runtimeReady,
            xriftInstalled: runtimeReady,
            paths: { ...runtimePaths },
          } satisfies RuntimeStatus;
        case "setup_runtime":
          runtimeReady = true;
          return {
            ready: true,
            nodeInstalled: true,
            xriftInstalled: true,
            paths: { ...runtimePaths },
          } satisfies RuntimeStatus;
        case "sandbox_env":
          return {
            XRIFT_E2E: "1",
          };
        case "ensure_dir":
          return null;
        case "list_projects":
          return state.projects.map(copyProject);
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
        case "save_visual_project": {
          const projectPath = stringArg(payload, "projectPath");
          visualDocuments.set(
            projectPath,
            payload.request as VisualProjectWriteRequest,
          );
          const project = state.projects.find(
            (candidate) => candidate.path === projectPath,
          );
          if (project) project.modifiedAtMs = Date.now();
          return null;
        }
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
        case "complete_xrift_mcp_request":
        case "kill_pid_tree":
          return null;
        case "read_image_data_url":
          throw new Error("Release E2E fixture does not contain binary files");
        case "check_xrift_latest":
          return "0.43.0";
        case "update_xrift":
          return null;
        case "detect_xrift_mcp_clients":
          return [];
        case "detect_xrift_ollama":
          return {
            installed: false,
            version: null,
            launchSupported: false,
            models: [],
            message: "Release E2EではOllamaを起動しません",
          };
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
            stdout = "0.43.0";
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
    window.__TAURI_INTERNALS__.convertFileSrc = (
      filePath: string,
      protocol = "asset",
    ) => `${protocol}://localhost/${encodeURIComponent(filePath)}`;
  }
}
