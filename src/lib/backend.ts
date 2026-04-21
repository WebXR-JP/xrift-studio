/**
 * Platform-agnostic backend interface.
 * Both Tauri and Electron implementations conform to this contract.
 */

export type Project = {
  name: string;
  path: string;
  title: string | null;
  description: string | null;
};

export type FsEntry = {
  name: string;
  rel: string;
  isDir: boolean;
  size: number | null;
};

export type Versions = {
  appVersion: string;
  nodeVersion: string;
};

export type RuntimePaths = {
  appRoot: string;
  runtimeDir: string;
  nodeDistDir: string;
  nodeBinDir: string;
  nodeExe: string;
  npmCliJs: string;
  npmPrefix: string;
  npmCache: string;
  home: string;
  projectsRoot: string;
  xriftCmd: string;
  xriftJs: string;
};

export type RuntimeStatus = {
  ready: boolean;
  nodeInstalled: boolean;
  xriftInstalled: boolean;
  paths: RuntimePaths;
};

export type LogKind = "stdout" | "stderr" | "info" | "exit";
export type LogLine = { kind: LogKind; text: string; ts: number };

export type RunResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export type Whoami = {
  raw: string;
  displayName: string | null;
  id: string | null;
};

export type DevHandle = {
  pid: number;
  stop: () => Promise<void>;
};

export interface Backend {
  // Runtime
  getVersions(): Promise<Versions>;
  runtimeStatus(): Promise<RuntimeStatus>;
  setupRuntime(): Promise<RuntimeStatus>;
  checkXriftLatest(): Promise<string | null>;
  updateXrift(): Promise<void>;
  resetAppData(scope: "runtime" | "projects" | "all"): Promise<void>;

  // Projects
  ensureDir(path: string): Promise<void>;
  listProjects(root: string): Promise<Project[]>;

  // File operations
  listFiles(projectPath: string, rel: string): Promise<FsEntry[]>;
  readTextFile(projectPath: string, rel: string): Promise<string>;
  writeTextFile(projectPath: string, rel: string, content: string): Promise<void>;
  readWorldFile(projectPath: string): Promise<string>;
  writeWorldFile(projectPath: string, content: string): Promise<void>;
  readThumbnail(projectPath: string): Promise<string | null>;
  writeThumbnail(projectPath: string, dataUrl: string): Promise<void>;
  readImageDataUrl(projectPath: string, rel: string): Promise<string>;
  writeBinaryFile(projectPath: string, rel: string, dataUrl: string): Promise<void>;
  deletePath(projectPath: string, rel: string): Promise<void>;
  renamePath(projectPath: string, oldRel: string, newRel: string): Promise<void>;

  // Convert a local file path to a URL loadable by the renderer
  convertFileSrc(path: string): string;

  // Shell / external
  openUrl(url: string): Promise<void>;
  openInVSCode(projectPath: string, onLog: (l: LogLine) => void): Promise<RunResult>;
  openTerminal(projectPath: string, onLog: (l: LogLine) => void): Promise<void>;

  // Auth
  whoami(onLog: (l: LogLine) => void): Promise<Whoami | null>;
  login(onLog: (l: LogLine) => void): Promise<RunResult>;
  logout(onLog: (l: LogLine) => void): Promise<RunResult>;
  clearCaches(): void;

  // CLI version
  cliVersion(onLog: (l: LogLine) => void): Promise<string | null>;

  // World operations
  createWorld(root: string, name: string, onLog: (l: LogLine) => void): Promise<RunResult>;
  upload(projectPath: string, onLog: (l: LogLine) => void): Promise<RunResult>;

  // Dev server
  startDevServer(
    projectPath: string,
    onLog: (l: LogLine) => void,
    onUrl: (url: string) => void,
  ): Promise<DevHandle>;

  // Event listeners (for setup progress etc.)
  onSetupProgress?(callback: (payload: { step: string; percent: number; message: string }) => void): () => void;
}

// Singleton backend instance - set at app startup
let _backend: Backend | null = null;

export function setBackend(b: Backend) {
  _backend = b;
}

export function getBackend(): Backend {
  if (!_backend) throw new Error("Backend not initialized. Call setBackend() first.");
  return _backend;
}
