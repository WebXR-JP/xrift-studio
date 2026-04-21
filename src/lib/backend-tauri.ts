/**
 * Tauri backend implementation.
 * Wraps existing tauri.ts + xrift-cli.ts into the Backend interface.
 */

import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { tauri } from "./tauri";
import {
  xrift,
  openInVSCode as tauriOpenInVSCode,
  openTerminal as tauriOpenTerminal,
  startDevServer as tauriStartDevServer,
  clearCaches as tauriClearCaches,
} from "./xrift-cli";
import type { Backend, LogLine, RunResult, Whoami, DevHandle, Versions, RuntimeStatus } from "./backend";

export class TauriBackend implements Backend {
  getVersions(): Promise<Versions> {
    return tauri.getVersions();
  }

  runtimeStatus(): Promise<RuntimeStatus> {
    return tauri.runtimeStatus();
  }

  setupRuntime(): Promise<RuntimeStatus> {
    return tauri.setupRuntime();
  }

  checkXriftLatest(): Promise<string | null> {
    return tauri.checkXriftLatest();
  }

  async updateXrift(): Promise<void> {
    return tauri.updateXrift();
  }

  resetAppData(scope: "runtime" | "projects" | "all"): Promise<void> {
    return tauri.resetAppData(scope);
  }

  ensureDir(path: string): Promise<void> {
    return tauri.ensureDir(path);
  }

  listProjects(root: string) {
    return tauri.listProjects(root);
  }

  listFiles(projectPath: string, rel: string) {
    return tauri.listFiles(projectPath, rel);
  }

  readTextFile(projectPath: string, rel: string): Promise<string> {
    return tauri.readTextFile(projectPath, rel);
  }

  writeTextFile(projectPath: string, rel: string, content: string): Promise<void> {
    return tauri.writeTextFile(projectPath, rel, content);
  }

  readWorldFile(projectPath: string): Promise<string> {
    return tauri.readWorldFile(projectPath);
  }

  writeWorldFile(projectPath: string, content: string): Promise<void> {
    return tauri.writeWorldFile(projectPath, content);
  }

  readThumbnail(projectPath: string): Promise<string | null> {
    return tauri.readThumbnail(projectPath);
  }

  writeThumbnail(projectPath: string, dataUrl: string): Promise<void> {
    return tauri.writeThumbnail(projectPath, dataUrl);
  }

  readImageDataUrl(projectPath: string, rel: string): Promise<string> {
    return tauri.readImageDataUrl(projectPath, rel);
  }

  writeBinaryFile(projectPath: string, rel: string, dataUrl: string): Promise<void> {
    return tauri.writeBinaryFile(projectPath, rel, dataUrl);
  }

  deletePath(projectPath: string, rel: string): Promise<void> {
    return tauri.deletePath(projectPath, rel);
  }

  renamePath(projectPath: string, oldRel: string, newRel: string): Promise<void> {
    return tauri.renamePath(projectPath, oldRel, newRel);
  }

  convertFileSrc(path: string): string {
    return convertFileSrc(path);
  }

  async openUrl(url: string): Promise<void> {
    await openUrl(url);
  }

  openInVSCode(projectPath: string, onLog: (l: LogLine) => void): Promise<RunResult> {
    return tauriOpenInVSCode(projectPath, onLog);
  }

  openTerminal(projectPath: string, onLog: (l: LogLine) => void): Promise<void> {
    return tauriOpenTerminal(projectPath, onLog);
  }

  whoami(onLog: (l: LogLine) => void): Promise<Whoami | null> {
    return xrift.whoami(onLog);
  }

  login(onLog: (l: LogLine) => void): Promise<RunResult> {
    return xrift.login(onLog);
  }

  logout(onLog: (l: LogLine) => void): Promise<RunResult> {
    return xrift.logout(onLog);
  }

  clearCaches(): void {
    tauriClearCaches();
  }

  cliVersion(onLog: (l: LogLine) => void): Promise<string | null> {
    return xrift.version(onLog);
  }

  createWorld(root: string, name: string, onLog: (l: LogLine) => void): Promise<RunResult> {
    return xrift.createWorld(root, name, onLog);
  }

  upload(projectPath: string, onLog: (l: LogLine) => void): Promise<RunResult> {
    return xrift.upload(projectPath, onLog);
  }

  async startDevServer(
    projectPath: string,
    onLog: (l: LogLine) => void,
    onUrl: (url: string) => void,
  ): Promise<DevHandle> {
    const handle = await tauriStartDevServer(projectPath, onLog, onUrl);
    return { pid: handle.pid, stop: handle.stop };
  }

  onSetupProgress(callback: (payload: { step: string; percent: number; message: string }) => void): () => void {
    let unlisten: (() => void) | null = null;
    listen<{ step: string; percent: number; message: string }>("setup-progress", (event) => {
      callback(event.payload);
    }).then((un) => {
      unlisten = un;
    });
    return () => {
      unlisten?.();
    };
  }
}
