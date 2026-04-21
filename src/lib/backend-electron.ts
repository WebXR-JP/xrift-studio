/**
 * Electron backend implementation.
 * Communicates with the main process via preload-exposed IPC.
 */

import type {
  Backend,
  DevHandle,
  FsEntry,
  LogLine,
  Project,
  RunResult,
  RuntimeStatus,
  Versions,
  Whoami,
} from "./backend";

// The preload script exposes `window.electronAPI`
declare global {
  interface Window {
    electronAPI: {
      getVersions(): Promise<Versions>;
      getProjectsRoot(): Promise<string>;
      ensureDir(path: string): Promise<void>;
      listProjects(root: string): Promise<Project[]>;
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
      getFileUrl(absolutePath: string): string;
      openUrl(url: string): Promise<void>;
      openInVSCode(projectPath: string): Promise<RunResult>;
      openTerminal(projectPath: string): Promise<void>;
      startDevServer(projectPath: string): Promise<{ pid: number }>;
      stopDevServer(pid: number): Promise<void>;
      onDevServerLog(callback: (line: LogLine) => void): () => void;
      onDevServerUrl(callback: (url: string) => void): () => void;
      resetAppData(scope: "runtime" | "projects" | "all"): Promise<void>;
    };
  }
}

const api = () => window.electronAPI;

export class ElectronBackend implements Backend {
  async getVersions(): Promise<Versions> {
    return api().getVersions();
  }

  async runtimeStatus(): Promise<RuntimeStatus> {
    const projectsRoot = await api().getProjectsRoot();
    return {
      ready: true,
      paths: { projectsRoot },
    };
  }

  async resetAppData(scope: "runtime" | "projects" | "all"): Promise<void> {
    return api().resetAppData(scope);
  }

  async ensureDir(path: string): Promise<void> {
    return api().ensureDir(path);
  }

  async listProjects(root: string): Promise<Project[]> {
    return api().listProjects(root);
  }

  async listFiles(projectPath: string, rel: string): Promise<FsEntry[]> {
    return api().listFiles(projectPath, rel);
  }

  async readTextFile(projectPath: string, rel: string): Promise<string> {
    return api().readTextFile(projectPath, rel);
  }

  async writeTextFile(projectPath: string, rel: string, content: string): Promise<void> {
    return api().writeTextFile(projectPath, rel, content);
  }

  async readWorldFile(projectPath: string): Promise<string> {
    return api().readWorldFile(projectPath);
  }

  async writeWorldFile(projectPath: string, content: string): Promise<void> {
    return api().writeWorldFile(projectPath, content);
  }

  async readThumbnail(projectPath: string): Promise<string | null> {
    return api().readThumbnail(projectPath);
  }

  async writeThumbnail(projectPath: string, dataUrl: string): Promise<void> {
    return api().writeThumbnail(projectPath, dataUrl);
  }

  async readImageDataUrl(projectPath: string, rel: string): Promise<string> {
    return api().readImageDataUrl(projectPath, rel);
  }

  async writeBinaryFile(projectPath: string, rel: string, dataUrl: string): Promise<void> {
    return api().writeBinaryFile(projectPath, rel, dataUrl);
  }

  async deletePath(projectPath: string, rel: string): Promise<void> {
    return api().deletePath(projectPath, rel);
  }

  async renamePath(projectPath: string, oldRel: string, newRel: string): Promise<void> {
    return api().renamePath(projectPath, oldRel, newRel);
  }

  convertFileSrc(path: string): string {
    return api().getFileUrl(path);
  }

  async openUrl(url: string): Promise<void> {
    return api().openUrl(url);
  }

  async openInVSCode(projectPath: string, onLog: (l: LogLine) => void): Promise<RunResult> {
    onLog({ kind: "info", text: `$ code ${projectPath}`, ts: Date.now() });
    return api().openInVSCode(projectPath);
  }

  async openTerminal(projectPath: string, onLog: (l: LogLine) => void): Promise<void> {
    onLog({ kind: "info", text: `$ terminal  (cwd: ${projectPath})`, ts: Date.now() });
    return api().openTerminal(projectPath);
  }

  async whoami(_onLog: (l: LogLine) => void): Promise<Whoami | null> {
    // Stub — will be replaced with SDK token-based auth in PR2
    return null;
  }

  async login(_onLog: (l: LogLine) => void): Promise<RunResult> {
    // Stub
    return { code: 1, stdout: "", stderr: "Not implemented — use API token (PR2)" };
  }

  async logout(_onLog: (l: LogLine) => void): Promise<RunResult> {
    // Stub
    return { code: 0, stdout: "", stderr: "" };
  }

  async createWorld(_root: string, _name: string, onLog: (l: LogLine) => void): Promise<RunResult> {
    // Stub — will use SDK in PR2
    onLog({ kind: "stderr", text: "World creation not yet implemented", ts: Date.now() });
    return { code: 1, stdout: "", stderr: "Not implemented" };
  }

  async upload(_projectPath: string, onLog: (l: LogLine) => void): Promise<RunResult> {
    // Stub — will use SDK in PR2
    onLog({ kind: "stderr", text: "Upload not yet implemented", ts: Date.now() });
    return { code: 1, stdout: "", stderr: "Not implemented" };
  }

  async startDevServer(
    projectPath: string,
    onLog: (l: LogLine) => void,
    onUrl: (url: string) => void,
  ): Promise<DevHandle> {
    onLog({ kind: "info", text: `$ npm run dev  (cwd: ${projectPath})`, ts: Date.now() });

    const unsubLog = api().onDevServerLog((line) => onLog(line));
    const unsubUrl = api().onDevServerUrl((url) => onUrl(url));

    const { pid } = await api().startDevServer(projectPath);

    return {
      pid,
      stop: async () => {
        unsubLog();
        unsubUrl();
        await api().stopDevServer(pid);
      },
    };
  }
}
