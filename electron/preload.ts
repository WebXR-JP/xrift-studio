import { contextBridge, ipcRenderer } from "electron";

type LogLine = { kind: string; text: string; ts: number };

contextBridge.exposeInMainWorld("electronAPI", {
  getVersions: () => ipcRenderer.invoke("get-versions"),
  getProjectsRoot: () => ipcRenderer.invoke("get-projects-root"),
  ensureDir: (path: string) => ipcRenderer.invoke("ensure-dir", path),
  listProjects: (root: string) => ipcRenderer.invoke("list-projects", root),
  listFiles: (projectPath: string, rel: string) =>
    ipcRenderer.invoke("list-files", projectPath, rel),
  readTextFile: (projectPath: string, rel: string) =>
    ipcRenderer.invoke("read-text-file", projectPath, rel),
  writeTextFile: (projectPath: string, rel: string, content: string) =>
    ipcRenderer.invoke("write-text-file", projectPath, rel, content),
  readWorldFile: (projectPath: string) =>
    ipcRenderer.invoke("read-world-file", projectPath),
  writeWorldFile: (projectPath: string, content: string) =>
    ipcRenderer.invoke("write-world-file", projectPath, content),
  readThumbnail: (projectPath: string) =>
    ipcRenderer.invoke("read-thumbnail", projectPath),
  writeThumbnail: (projectPath: string, dataUrl: string) =>
    ipcRenderer.invoke("write-thumbnail", projectPath, dataUrl),
  readImageDataUrl: (projectPath: string, rel: string) =>
    ipcRenderer.invoke("read-image-data-url", projectPath, rel),
  writeBinaryFile: (projectPath: string, rel: string, dataUrl: string) =>
    ipcRenderer.invoke("write-binary-file", projectPath, rel, dataUrl),
  deletePath: (projectPath: string, rel: string) =>
    ipcRenderer.invoke("delete-path", projectPath, rel),
  renamePath: (projectPath: string, oldRel: string, newRel: string) =>
    ipcRenderer.invoke("rename-path", projectPath, oldRel, newRel),
  getFileUrl: (absolutePath: string) => `atom://local-file/${encodeURIComponent(absolutePath)}`,
  openUrl: (url: string) => ipcRenderer.invoke("open-url", url),
  openInVSCode: (projectPath: string) =>
    ipcRenderer.invoke("open-in-vscode", projectPath),
  openTerminal: (projectPath: string) =>
    ipcRenderer.invoke("open-terminal", projectPath),
  startDevServer: (projectPath: string) =>
    ipcRenderer.invoke("start-dev-server", projectPath),
  stopDevServer: (pid: number) =>
    ipcRenderer.invoke("stop-dev-server", pid),
  onDevServerLog: (callback: (line: LogLine) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, line: LogLine) => callback(line);
    ipcRenderer.on("dev-server-log", handler);
    return () => ipcRenderer.removeListener("dev-server-log", handler);
  },
  onDevServerUrl: (callback: (url: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, url: string) => callback(url);
    ipcRenderer.on("dev-server-url", handler);
    return () => ipcRenderer.removeListener("dev-server-url", handler);
  },
  resetAppData: (scope: string) => ipcRenderer.invoke("reset-app-data", scope),
});
