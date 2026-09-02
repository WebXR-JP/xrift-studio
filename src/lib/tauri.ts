import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";

export type ProjectKind = "world" | "item";
export type ProjectFormat = "classic" | "visual";

export type Project = {
  name: string;
  path: string;
  kind: ProjectKind;
  format: ProjectFormat;
  title: string | null;
  description: string | null;
  modifiedAtMs: number | null;
  uploadedAt: string | null;
  publicationId: string | null;
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

export type VisualDocumentFile = {
  relativePath: string;
  content: string;
};

export type VisualProjectFiles = {
  projectJson: string;
  sceneDocuments: VisualDocumentFile[];
  /** Empty for projects created before prefab document persistence. */
  prefabDocuments: VisualDocumentFile[];
  assetManifestJson: string;
};

export type VisualBinaryDocumentWrite = {
  /** Normalized project-relative path. Data URLs are transport-only. */
  relativePath: string;
  dataUrl: string;
};

export type VisualProjectWriteRequest = VisualProjectFiles & {
  binaryDocuments?: VisualBinaryDocumentWrite[];
};

export type CompilerStagingPaths = {
  rootPath: string;
  projectPath: string;
};

export type CompilerOverlayWrite = {
  relativePath: string;
  content: string;
};

export type CompilerAssetCopy = {
  sourceRelativePath: string;
  targetRelativePath: string;
};

export type CompilerBinaryOverlayWrite = {
  targetRelativePath: string;
  dataUrl: string;
};

export type CompilerRequiredPublicationFileCopy = CompilerAssetCopy & {
  purpose: "thumbnail";
};

export type CompilerRequiredPublicationFileVerification =
  CompilerRequiredPublicationFileCopy & {
    sha256: string;
  };

export type CompilerStagingResult = {
  projectPath: string;
  requiredPublicationFiles: CompilerRequiredPublicationFileVerification[];
};

export type CompilerPublicationMetadata = {
  id: string;
  createdAt: string;
  lastUploadedAt: string;
};

export type VisualAssetImportWrite = {
  relativePath: string;
  dataUrl: string;
};

export type LocalTextureImportSource = {
  fileName: string;
  mimeType: string;
  byteLength: number;
  dataUrl: string;
};

export type LocalAudioImportSource = {
  fileName: string;
  mimeType: string;
  byteLength: number;
  dataUrl: string;
};

export type LocalFontImportSource = {
  fileName: string;
  mimeType: string;
  byteLength: number;
  dataUrl: string;
};

export type LocalModelImportSource = {
  fileName: string;
  mimeType: string;
  byteLength: number;
  dataUrl: string;
};

export type LocalShaderImportSource = {
  fileName: string;
  byteLength: number;
  source: string;
};

export type ExternalStoreAssetKind = "hdri" | "texture" | "model" | "audio";
export type ExternalStoreFileFormat = "hdr" | "exr";

export type ExternalStoreAsset = {
  providerId: string;
  externalId: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  thumbnailUrl: string;
  assetKind: ExternalStoreAssetKind;
  maxResolution?: [number, number];
  downloadCount: number;
  authors: string[];
  assetUrl: string;
  licenseName: string;
  licenseUrl: string;
};

export type ExternalStoreResolution = {
  id: string;
  label: string;
  byteLength: number;
  fileCount: number;
  formats: ExternalStoreFormatOption[];
};

export type ExternalStoreFormatOption = {
  id: ExternalStoreFileFormat;
  label: string;
  byteLength: number;
  fileCount: number;
};

export type ExternalStoreAssetOptions = {
  providerId: string;
  externalId: string;
  assetKind: ExternalStoreAssetKind;
  resolutions: ExternalStoreResolution[];
};

export type ExternalStoreInstallRequest = {
  providerId: string;
  externalId: string;
  resolution: string;
  format?: ExternalStoreFileFormat;
};

export type ExternalStoreInstalledFile = {
  role: "environment" | "base-color" | "normal" | "arm" | "model" | "audio";
  relativePath: string;
  byteLength: number;
  sha256: string;
  format: string;
};

export type ExternalStoreInstallResult = {
  providerId: string;
  providerName: string;
  externalId: string;
  name: string;
  assetKind: ExternalStoreAssetKind;
  resolution: string;
  files: ExternalStoreInstalledFile[];
  authors: string[];
  assetUrl: string;
  licenseName: string;
  licenseUrl: string;
};

export type XriftMcpClientId =
  | "codex"
  | "claude-code"
  | "claude-desktop"
  | "opencode"
  | "cursor"
  | "antigravity";

export type XriftMcpClientStatus = {
  id: XriftMcpClientId;
  label: string;
  installed: boolean;
  registered: boolean;
  needsUpdate: boolean;
  message: string;
};

export type XriftOllamaIntegrationId = Extract<
  XriftMcpClientId,
  "codex" | "claude-code" | "opencode"
>;

export type XriftOllamaModelStatus = {
  name: string;
};

export type XriftOllamaStatus = {
  installed: boolean;
  serverReachable: boolean;
  version: string | null;
  launchSupported: boolean;
  models: XriftOllamaModelStatus[];
  message: string;
};

export type XriftOllamaConfigurationResult = {
  integrationId: XriftOllamaIntegrationId;
  integrationLabel: string;
  model: string;
  message: string;
};

export type RecordingFileHandle = {
  id: string;
  path: string;
  directory: string;
};

export type RecordingFileSummary = {
  path: string;
  bytesWritten: number;
  metadataPath: string | null;
};

export type XriftMcpEditorRequestEvent = {
  id: string;
  clientName: string;
  tool: string;
  arguments: Record<string, unknown>;
};

export type XriftMcpEditorErrorResponse = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type XriftMcpEditorResponse = {
  id: string;
  ok: boolean;
  result?: Record<string, unknown>;
  error?: XriftMcpEditorErrorResponse;
};

export type ScriptTrustProjectInput = {
  projectPath: string;
  projectId: string;
};

export type NativeScriptTrustFingerprint = {
  sourceSha256: string;
  language: "ts" | "tsx";
  contractVersion: string;
  modulePolicyVersion: string;
  allowRemoteModules: false;
};

export type ScriptTrustProjectScope = {
  canonicalProjectPath: string;
  projectId: string;
};

export type ScriptTrustApprovalCheck = {
  fingerprint: NativeScriptTrustFingerprint;
  approved: boolean;
  approvedAtUnixMs: number | null;
};

export type ScriptTrustStatusResult = {
  project: ScriptTrustProjectScope;
  checks: ScriptTrustApprovalCheck[];
  approvedCount: number;
  pendingCount: number;
  storedApprovalCount: number;
  allApproved: boolean;
  storeSchemaVersion: number;
};

export type ScriptTrustMutationResult = {
  project: ScriptTrustProjectScope;
  checks: ScriptTrustApprovalCheck[];
  changedCount: number;
};

export const tauri = {
  isAvailable: () => isTauri(),
  selectDirectory: (title: string, defaultPath?: string) =>
    openDialog({
      title,
      directory: true,
      multiple: false,
      recursive: true,
      ...(defaultPath ? { defaultPath } : {}),
    }),
  openPath: (path: string) => openPath(path),
  openUrl: (url: string) => openUrl(url),
  saveScreenshot: async (dataUrl: string) => {
    if (!isTauri()) return null;
    const path = await saveDialog({
      title: "XRift Studioの画面を保存",
      defaultPath: "xrift-studio-support.png",
      filters: [{ name: "PNG画像", extensions: ["png"] }],
    });
    if (!path) return null;
    await invoke<void>("save_screenshot", { path, dataUrl });
    return path;
  },
  saveVideo: async (dataUrl: string) => {
    if (!isTauri()) return null;
    const path = await saveDialog({
      title: "XRift Studioのデバッグ動画を保存",
      defaultPath: "xrift-studio-debug.webm",
      filters: [{ name: "WebM動画", extensions: ["webm"] }],
    });
    if (!path) return null;
    await invoke<void>("save_video", { path, dataUrl });
    return path;
  },
  saveDebugVideo: (dataUrl: string, label = "scene-view") =>
    invoke<string>("save_debug_video", { dataUrl, label }),
  saveDebugImage: (dataUrl: string, label = "scene-view") =>
    invoke<string>("save_debug_image", { dataUrl, label }),
  /** Where recordings land unless the author picked a folder. */
  recordingDefaultDirectory: () =>
    invoke<string>("recording_default_directory"),
  /**
   * Opens a new, never-overwriting file for one take. The native side chooses
   * the final name when the requested one already exists.
   */
  beginRecordingFile: (request: {
    directory: string | null;
    fileStem: string;
    extension: "webm" | "mp4";
  }) => invoke<RecordingFileHandle>("recording_begin_file", { request }),
  /**
   * Streams one encoder chunk into an open recording. The bytes travel as the
   * raw request body rather than as JSON, so an hour-long take never passes
   * through base64.
   */
  appendRecordingChunk: (id: string, chunk: Uint8Array) =>
    invoke<number>("recording_append_chunk", chunk, {
      headers: { "x-xrift-recording-id": id },
    }),
  finishRecordingFile: (id: string, metadata: Record<string, unknown> | null) =>
    invoke<RecordingFileSummary>("recording_finish_file", { id, metadata }),
  abortRecordingFile: (id: string) =>
    invoke<RecordingFileSummary>("recording_abort_file", { id }),
  getVersions: () => invoke<Versions>("get_versions"),
  runtimePaths: () => invoke<RuntimePaths>("runtime_paths"),
  runtimeStatus: () => invoke<RuntimeStatus>("runtime_status"),
  setupRuntime: () => invoke<RuntimeStatus>("setup_runtime"),
  sandboxEnv: () => invoke<Record<string, string>>("sandbox_env"),
  ensureDir: (path: string) => invoke<void>("ensure_dir", { path }),
  listProjects: (root: string) =>
    invoke<Project[]>("list_projects", { root }),
  deleteProject: (root: string, projectPath: string) =>
    invoke<void>("delete_project", { root, projectPath }),
  createVisualProject: (
    root: string,
    directoryName: string,
    request: VisualProjectWriteRequest,
  ) =>
    invoke<Project>("create_visual_project", {
      root,
      directoryName,
      request,
    }),
  readVisualProject: (projectPath: string) =>
    invoke<VisualProjectFiles>("read_visual_project", { projectPath }),
  saveVisualProject: (
    projectPath: string,
    request: VisualProjectWriteRequest,
  ) => invoke<void>("save_visual_project", { projectPath, request }),
  prepareCompilerStaging: (
    authoringProjectPath: string,
    directoryName: string,
  ) =>
    invoke<CompilerStagingPaths>("prepare_compiler_staging", {
      authoringProjectPath,
      directoryName,
    }),
  applyCompilerStaging: (
    authoringProjectPath: string,
    directoryName: string,
    overlayFiles: CompilerOverlayWrite[],
    binaryOverlayFiles: CompilerBinaryOverlayWrite[],
    assetCopies: CompilerAssetCopy[],
    requiredPublicationFiles: CompilerRequiredPublicationFileCopy[],
  ) =>
    invoke<CompilerStagingResult>("apply_compiler_staging", {
      authoringProjectPath,
      directoryName,
      overlayFiles,
      binaryOverlayFiles,
      assetCopies,
      requiredPublicationFiles,
    }),
  persistCompilerPublicationMetadata: (
    authoringProjectPath: string,
    directoryName: string,
  ) =>
    invoke<CompilerPublicationMetadata>("persist_compiler_publication_metadata", {
      authoringProjectPath,
      directoryName,
    }),
  markCompilerUploadStarted: (
    authoringProjectPath: string,
    directoryName: string,
  ) =>
    invoke<void>("mark_compiler_upload_started", {
      authoringProjectPath,
      directoryName,
    }),
  clearCompilerUploadAttempt: (
    authoringProjectPath: string,
    directoryName: string,
  ) =>
    invoke<void>("clear_compiler_upload_attempt", {
      authoringProjectPath,
      directoryName,
    }),
  commitVisualAssetImport: (
    projectPath: string,
    transactionId: string,
    writes: VisualAssetImportWrite[],
  ) =>
    invoke<void>("commit_visual_asset_import", {
      projectPath,
      transactionId,
      writes,
    }),
  readLocalTextureImportSource: (sourcePath: string) =>
    invoke<LocalTextureImportSource>("read_local_texture_import_source", {
      sourcePath,
    }),
  readLocalAudioImportSource: (sourcePath: string) =>
    invoke<LocalAudioImportSource>("read_local_audio_import_source", {
      sourcePath,
    }),
  readLocalFontImportSource: (sourcePath: string) =>
    invoke<LocalFontImportSource>("read_local_font_import_source", {
      sourcePath,
    }),
  readLocalModelImportSource: (sourcePath: string) =>
    invoke<LocalModelImportSource>("read_local_model_import_source", {
      sourcePath,
    }),
  readLocalShaderImportSource: (sourcePath: string) =>
    invoke<LocalShaderImportSource>("read_local_shader_import_source", {
      sourcePath,
    }),
  openVisualAssetLocation: (
    projectPath: string,
    sourceRelativePath?: string,
  ) =>
    invoke<void>("open_visual_asset_location", {
      projectPath,
      sourceRelativePath: sourceRelativePath ?? null,
    }),
  listExternalStoreAssets: (providerId: string) =>
    invoke<ExternalStoreAsset[]>("list_external_store_assets", { providerId }),
  getExternalStoreAssetOptions: (providerId: string, externalId: string) =>
    invoke<ExternalStoreAssetOptions>("get_external_store_asset_options", {
      providerId,
      externalId,
    }),
  installExternalStoreAsset: (
    projectPath: string,
    request: ExternalStoreInstallRequest,
  ) =>
    invoke<ExternalStoreInstallResult>("install_external_store_asset", {
      projectPath,
      request,
    }),
  readWorldFile: (projectPath: string) =>
    invoke<string>("read_world_file", { projectPath }),
  writeWorldFile: (projectPath: string, content: string) =>
    invoke<void>("write_world_file", { projectPath, content }),
  cloneClassicProjectRepository: (repositoryUrl: string) =>
    invoke<string>("clone_classic_project_repository", { repositoryUrl }),
  readTextFile: (projectPath: string, rel: string) =>
    invoke<string>("read_text_file", { projectPath, rel }),
  /** Reads a regular UTF-8 .ts/.tsx file with the native 8 MiB limit. */
  readScriptSource: (projectPath: string, rel: string) =>
    invoke<string>("read_script_source", { projectPath, rel }),
  writeTextFile: (projectPath: string, rel: string, content: string) =>
    invoke<void>("write_text_file", { projectPath, rel, content }),
  getScriptTrustStatus: (
    project: ScriptTrustProjectInput,
    fingerprints: readonly NativeScriptTrustFingerprint[],
  ) =>
    invoke<ScriptTrustStatusResult>("get_script_trust_status", {
      project,
      fingerprints,
    }),
  approveScriptTrustFingerprintsForUi: (
    project: ScriptTrustProjectInput,
    fingerprints: readonly NativeScriptTrustFingerprint[],
  ) =>
    invoke<ScriptTrustMutationResult>(
      "approve_script_trust_fingerprint_for_ui",
      { project, fingerprints },
    ),
  revokeScriptTrustFingerprints: (
    project: ScriptTrustProjectInput,
    fingerprints: readonly NativeScriptTrustFingerprint[],
  ) =>
    invoke<ScriptTrustMutationResult>("revoke_script_trust_fingerprints", {
      project,
      fingerprints,
    }),
  readThumbnail: (projectPath: string) =>
    invoke<string | null>("read_thumbnail", { projectPath }),
  writeThumbnail: (projectPath: string, dataUrl: string) =>
    invoke<void>("write_thumbnail", { projectPath, dataUrl }),
  readImageDataUrl: (projectPath: string, rel: string) =>
    invoke<string>("read_image_data_url", { projectPath, rel }),
  readAudioDataUrl: (projectPath: string, rel: string) =>
    invoke<string>("read_audio_data_url", { projectPath, rel }),
  /** Reads a validated project-relative binary as a data URL (models included). */
  readProjectFileDataUrl: (projectPath: string, rel: string) =>
    invoke<string>("read_image_data_url", { projectPath, rel }),
  killPidTree: (pid: number) => invoke<void>("kill_pid_tree", { pid }),
  listFiles: (projectPath: string, rel: string) =>
    invoke<FsEntry[]>("list_files", { projectPath, rel }),
  /**
   * Records a publication id reported by `@xrift/sdk` instead of by the CLI.
   * Applies the same owner and advancement checks as the CLI path.
   */
  persistCompilerPublicationResult: (
    authoringProjectPath: string,
    directoryName: string,
    publicationId: string,
    uploadedAt: string,
  ) =>
    invoke<CompilerPublicationMetadata>("persist_compiler_publication_result", {
      authoringProjectPath,
      directoryName,
      publicationId,
      uploadedAt,
    }),
  writeBinaryFile: (projectPath: string, rel: string, dataUrl: string) =>
    invoke<void>("write_binary_file", { projectPath, rel, dataUrl }),
  deletePath: (projectPath: string, rel: string) =>
    invoke<void>("delete_path", { projectPath, rel }),
  renamePath: (projectPath: string, oldRel: string, newRel: string) =>
    invoke<void>("rename_path", { projectPath, oldRel, newRel }),
  resetAppData: (scope: "runtime" | "projects" | "all") =>
    invoke<void>("reset_app_data", { scope }),
  relaunchApp: () => relaunch(),
  checkXriftLatest: () => invoke<string | null>("check_xrift_latest"),
  updateXrift: () => invoke<void>("update_xrift"),
  detectXriftMcpClients: () =>
    invoke<XriftMcpClientStatus[]>("detect_xrift_mcp_clients"),
  registerXriftMcpClient: (clientId: XriftMcpClientId) =>
    invoke<XriftMcpClientStatus>("register_xrift_mcp_client", { clientId }),
  detectXriftOllama: () =>
    invoke<XriftOllamaStatus>("detect_xrift_ollama"),
  configureXriftOllama: (
    integrationId: XriftOllamaIntegrationId,
    model: string,
  ) =>
    invoke<XriftOllamaConfigurationResult>("configure_xrift_ollama", {
      integrationId,
      model,
    }),
  completeXriftMcpRequest: (response: XriftMcpEditorResponse) =>
    invoke<void>("complete_xrift_mcp_request", { response }),
  setXriftMcpEditorReady: (ready: boolean) =>
    invoke<void>("set_xrift_mcp_editor_ready", { ready }),
  onXriftMcpEditorRequest: (
    handler: (request: XriftMcpEditorRequestEvent) => void,
  ): Promise<UnlistenFn> =>
    listen<XriftMcpEditorRequestEvent>("xrift-mcp-editor-request", (event) =>
      handler(event.payload),
    ),
};
