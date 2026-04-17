import { invoke } from "@tauri-apps/api/core";

export type Project = {
  name: string;
  path: string;
  title: string | null;
  description: string | null;
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

export const tauri = {
  getVersions: () => invoke<Versions>("get_versions"),
  runtimePaths: () => invoke<RuntimePaths>("runtime_paths"),
  runtimeStatus: () => invoke<RuntimeStatus>("runtime_status"),
  setupRuntime: () => invoke<RuntimeStatus>("setup_runtime"),
  sandboxEnv: () => invoke<Record<string, string>>("sandbox_env"),
  ensureDir: (path: string) => invoke<void>("ensure_dir", { path }),
  listProjects: (root: string) =>
    invoke<Project[]>("list_projects", { root }),
  readWorldFile: (projectPath: string) =>
    invoke<string>("read_world_file", { projectPath }),
  writeWorldFile: (projectPath: string, content: string) =>
    invoke<void>("write_world_file", { projectPath, content }),
  readTextFile: (projectPath: string, rel: string) =>
    invoke<string>("read_text_file", { projectPath, rel }),
  writeTextFile: (projectPath: string, rel: string, content: string) =>
    invoke<void>("write_text_file", { projectPath, rel, content }),
  readThumbnail: (projectPath: string) =>
    invoke<string | null>("read_thumbnail", { projectPath }),
  writeThumbnail: (projectPath: string, dataUrl: string) =>
    invoke<void>("write_thumbnail", { projectPath, dataUrl }),
  readImageDataUrl: (projectPath: string, rel: string) =>
    invoke<string>("read_image_data_url", { projectPath, rel }),
  killPidTree: (pid: number) => invoke<void>("kill_pid_tree", { pid }),
  listFiles: (projectPath: string, rel: string) =>
    invoke<FsEntry[]>("list_files", { projectPath, rel }),
  writeBinaryFile: (projectPath: string, rel: string, dataUrl: string) =>
    invoke<void>("write_binary_file", { projectPath, rel, dataUrl }),
  deletePath: (projectPath: string, rel: string) =>
    invoke<void>("delete_path", { projectPath, rel }),
  renamePath: (projectPath: string, oldRel: string, newRel: string) =>
    invoke<void>("rename_path", { projectPath, oldRel, newRel }),
};
