import type { CompilerPublicationMetadata, ProjectKind } from "../tauri";
import { tauri } from "../tauri";
import {
  CommandSpawnError,
  xrift,
  type LogLine,
  type RunResult,
} from "../xrift-cli";
import type {
  VisualCompileResult,
  VisualCompilerDocuments,
} from "./compiler";
import { compileVisualProject } from "./compiler";

export type VisualPublishPipelineStage =
  | "saving"
  | "compiling"
  | "checking"
  | "uploading"
  | "processing";

export type VisualPublishPipelineProgress = {
  stage: VisualPublishPipelineStage;
  label: string;
  detail?: string;
  percent?: number;
  cancelSafe: boolean;
  thumbnailStaging?: {
    state: "verified";
    sha256: string;
  };
};

export type XriftUploadResult = {
  /** Official identifier returned by WorldsApi.upload. */
  worldId?: string;
  /** Official identifier returned by ItemsApi.upload. */
  itemId?: string;
  /** Backward-compatible generic identifier. Mirrors worldId/itemId when needed. */
  contentId?: string;
  versionId?: string;
  versionNumber?: number;
  contentHash?: string;
  status?: string;
  /** Timestamp persisted by the official CLI sidecar after upload. */
  uploadedAt?: string;
  /** Present only when the CLI explicitly returns a URL. */
  url?: string;
};

export type PublishVisualProjectRequest = {
  /** Existing project path. Unsaved sessions may obtain it from `save`. */
  authoringProjectPath?: string | null;
  kind: ProjectKind;
  documents: VisualCompilerDocuments;
  save: () => Promise<string | void>;
  report: (progress: VisualPublishPipelineProgress) => void;
  onLog: (line: LogLine) => void;
  signal: AbortSignal;
};

export class VisualCompilationError extends Error {
  readonly result: VisualCompileResult;

  constructor(result: VisualCompileResult) {
    const blocking = result.diagnostics.filter(
      (diagnostic) => diagnostic.severity === "blocking",
    );
    super(
      blocking.length > 0
        ? `変換を止める問題が${blocking.length}件あります。Inspectorで修正してください。`
        : "XRift向けの変換結果を作成できませんでした。",
    );
    this.name = "VisualCompilationError";
    this.result = result;
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("The operation was aborted", "AbortError");
  }
}

function assertSucceeded(
  result: RunResult,
  operation: string,
  privatePaths: string[] = [],
): void {
  if (result.code === 0) return;
  const detail = [result.stderr, result.stdout]
    .map((value) => value.trim())
    .find(Boolean);
  const safeDetail = detail
    ? sanitizePublishFailure(detail, privatePaths)
    : undefined;
  throw new Error(
    safeDetail
      ? `${operation}に失敗しました: ${safeDetail}`
      : `${operation}に失敗しました。`,
  );
}

/** Keeps actionable CLI diagnostics while preventing credentials and local paths from reaching the UI. */
export function sanitizePublishFailure(
  value: string,
  privatePaths: string[] = [],
): string {
  let safe = value
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(
      /\b(authorization|access[_-]?token|refresh[_-]?token|api[_-]?key)\b\s*[:=]\s*[^\s,;]+/gi,
      "$1=[REDACTED]",
    )
    .replace(
      /([?&](?:access[_-]?token|refresh[_-]?token|token|api[_-]?key)=)[^&#\s]+/gi,
      "$1[REDACTED]",
    )
    .replace(
      /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
      "[REDACTED]",
    )
    .replace(/https?:\/\/[^\s/@:]+:[^\s/@]+@/gi, (match) => {
      const scheme = match.slice(0, match.indexOf("://") + 3);
      return `${scheme}[REDACTED]@`;
    });

  for (const privatePath of privatePaths) {
    const normalized = privatePath.trim();
    if (!normalized) continue;
    safe = safe.replace(new RegExp(escapeRegExp(normalized), "gi"), "[project]");
    safe = safe.replace(
      new RegExp(escapeRegExp(normalized.replace(/\\/g, "/")), "gi"),
      "[project]",
    );
  }

  // A native/CLI error can include a path that was not known before the
  // operation started (for example a temporary directory). Keep it out of UI
  // and Logs while retaining the surrounding actionable message.
  safe = safe
    .replace(/file:\/{2,3}[A-Za-z]:[\\/][^\r\n"'<>|]+/gi, "[local path]")
    .replace(/\\\\[^\r\n"'<>|]+/g, "[local path]")
    .replace(/\b[A-Za-z]:[\\/][^\r\n"'<>|]+/g, "[local path]")
    .replace(
      /\/(?:Users|home|root|tmp|private\/(?:tmp|var)|var\/(?:folders|tmp)|workspace)\/[^\r\n"'<>|]+/g,
      "[local path]",
    );

  const lines = safe
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(-8).join("\n").slice(0, 1800);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function materializeVisualCompilation(
  authoringProjectPath: string,
  compilation: VisualCompileResult,
  onLog: (line: LogLine) => void,
  signal: AbortSignal,
  report: (progress: VisualPublishPipelineProgress) => void,
): Promise<string> {
  if (!compilation.canStage) throw new VisualCompilationError(compilation);
  const unsupportedCopy = compilation.stagingPlan.assetCopyPlan.find(
    (entry) => !entry.supportedByCompiler,
  );
  if (unsupportedCopy) {
    throw new Error(
      `Asset「${unsupportedCopy.assetId}」はXRift向け変換に対応していません。`,
    );
  }

  throwIfAborted(signal);
  report({
    stage: "compiling",
    label: "変換先を準備しています",
    detail: "制作データとは分離された一時プロジェクトを用意します。",
    percent: 28,
    cancelSafe: true,
  });
  const paths = await tauri.prepareCompilerStaging(
    authoringProjectPath,
    compilation.stagingPlan.stagingDirectoryName,
  );

  throwIfAborted(signal);
  report({
    stage: "compiling",
    label: "XRiftプロジェクトへ変換しています",
    detail: "XRift公式テンプレートへSceneとAssetを反映しています。",
    percent: 42,
    cancelSafe: false,
  });
  const created = await xrift.createCompilerStagingTemplate(
    {
      compilerOwnedRoot: paths.rootPath,
      kind: compilation.stagingPlan.templateKind,
      directoryName: compilation.stagingPlan.stagingDirectoryName,
    },
    onLog,
  );
  assertSucceeded(created, "XRiftテンプレートの作成", [
    authoringProjectPath,
    paths.rootPath,
  ]);

  let staged: Awaited<ReturnType<typeof tauri.applyCompilerStaging>>;
  try {
    staged = await tauri.applyCompilerStaging(
      authoringProjectPath,
      compilation.stagingPlan.stagingDirectoryName,
      compilation.stagingPlan.overlayFiles.map((file) => ({
        relativePath: file.relativePath,
        content: file.content,
      })),
      compilation.stagingPlan.assetCopyPlan.map((entry) => ({
        sourceRelativePath: entry.sourceRelativePath,
        targetRelativePath: entry.targetRelativePath,
      })),
      compilation.stagingPlan.requiredPublicationFiles,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("required publication thumbnail")) {
      throw new Error(
        "公開用サムネイルをステージングへコピーして検証できませんでした。public/thumbnail.pngを設定し直してから再試行してください。",
      );
    }
    throw error;
  }
  const thumbnail = staged.requiredPublicationFiles.find(
    (file) => file.purpose === "thumbnail",
  );
  if (!thumbnail) {
    throw new Error(
      "公開用サムネイルのステージング検証結果を確認できないため、アップロードを停止しました。",
    );
  }
  if (compilation.stagingPlan.runtimePackageSpecs.length > 0) {
    const includesOpenBrushRuntime =
      compilation.stagingPlan.runtimePackageSpecs.includes(
        "three-icosa@0.4.2-alpha.18",
      );
    throwIfAborted(signal);
    report({
      stage: "compiling",
      label: includesOpenBrushRuntime
        ? "OpenBrush描画ランタイムを準備しています"
        : "XRift Studio描画ランタイムを準備しています",
      detail: includesOpenBrushRuntime
        ? "汎用Runtimeとthree-icosaを公開用の一時プロジェクトへ追加します。"
        : "汎用Runtimeを公開用の一時プロジェクトへ追加します。",
      percent: 52,
      cancelSafe: false,
    });
    const installed = await xrift.installCompilerRuntimePackages(
      staged.projectPath,
      compilation.stagingPlan.runtimePackageSpecs,
      onLog,
    );
    assertSucceeded(installed, "描画ランタイムの準備", [
      authoringProjectPath,
      staged.projectPath,
    ]);
  }
  report({
    stage: "compiling",
    label: "サムネイルを公開用ステージングへコピー済み",
    detail: "コピー元とコピー先のSHA-256が一致しました。",
    percent: 56,
    cancelSafe: true,
    thumbnailStaging: {
      state: "verified",
      sha256: thumbnail.sha256,
    },
  });
  return staged.projectPath;
}

export async function publishVisualProject({
  authoringProjectPath,
  kind,
  documents,
  save,
  report,
  onLog,
  signal,
}: PublishVisualProjectRequest): Promise<XriftUploadResult> {
  const privatePaths = [authoringProjectPath?.trim() ?? ""].filter(Boolean);
  const safeLog = (line: LogLine) => {
    const text = sanitizePublishFailure(line.text, privatePaths);
    onLog({ ...line, text: text || "CLI出力を安全のため非表示にしました。" });
  };

  try {
    throwIfAborted(signal);
    report({
      stage: "saving",
      label: "制作データを保存しています",
      percent: 8,
      cancelSafe: true,
    });
    const savedProjectPath = await save();
    const resolvedAuthoringPath =
      typeof savedProjectPath === "string" && savedProjectPath.trim()
        ? savedProjectPath
        : authoringProjectPath?.trim();
    if (!resolvedAuthoringPath) {
      throw new Error("アップロード前にビジュアルプロジェクトを保存できませんでした。");
    }
    privatePaths.push(resolvedAuthoringPath);

    throwIfAborted(signal);
    report({
      stage: "compiling",
      label: "SceneとAssetを検証しています",
      percent: 18,
      cancelSafe: true,
    });
    const compilation = compileVisualProject(documents);
    const stagingPath = await materializeVisualCompilation(
      resolvedAuthoringPath,
      compilation,
      safeLog,
      signal,
      report,
    );
    privatePaths.push(stagingPath);

    throwIfAborted(signal);
    report({
      stage: "checking",
      label: "XRiftの検査を実行しています",
      detail: `公式CLIで${kind === "world" ? "World" : "Item"}をビルドし、問題がないか確認します。`,
      percent: 66,
      cancelSafe: false,
    });
    const checked =
      kind === "world"
        ? await xrift.checkWorld(stagingPath, safeLog)
        : await xrift.checkItem(stagingPath, safeLog);
    assertSucceeded(
      checked,
      `${kind === "world" ? "World" : "Item"}の検査`,
      privatePaths,
    );

    throwIfAborted(signal);
    report({
      stage: "uploading",
      label: `XRiftへ${kind === "world" ? "ワールド" : "アイテム"}を送信しています`,
      percent: 78,
      cancelSafe: false,
    });
    await tauri.markCompilerUploadStarted(
      resolvedAuthoringPath,
      compilation.stagingPlan.stagingDirectoryName,
    );
    let uploaded: Awaited<ReturnType<typeof xrift.upload>>;
    try {
      uploaded = await xrift.upload(stagingPath, kind, safeLog, true);
    } catch (uploadError) {
      if (uploadError instanceof CommandSpawnError) {
        try {
          await tauri.clearCompilerUploadAttempt(
            resolvedAuthoringPath,
            compilation.stagingPlan.stagingDirectoryName,
          );
        } catch (clearError) {
          throw new Error(
            `XRift CLIを開始できず、試行状態も安全に解除できませんでした: ${clearError}`,
          );
        }
      }
      throw uploadError;
    }
    const uploadOutput = `${uploaded.stdout}\n${uploaded.stderr}`;
    if (didXriftUploadStopBeforeRemoteTransfer(uploadOutput)) {
      try {
        await tauri.clearCompilerUploadAttempt(
          resolvedAuthoringPath,
          compilation.stagingPlan.stagingDirectoryName,
        );
      } catch (clearError) {
        throw new Error(
          `XRiftの送信開始を確認できず、試行状態も安全に解除できませんでした。重複を避けるため再アップロードせずログを確認してください: ${clearError}`,
        );
      }
    }
    assertSucceeded(uploaded, "XRiftへのアップロード", privatePaths);
    if (didXriftUploadStopBeforeRemoteTransfer(uploadOutput)) {
      throw new Error(
        "XRift CLIはファイル送信を開始しませんでした。生成結果とログを確認してから再試行してください。",
      );
    }

    report({
      stage: "processing",
      label: "XRiftから結果を受け取っています",
      percent: 96,
      cancelSafe: false,
    });
    let publicationMetadata: CompilerPublicationMetadata;
    try {
      publicationMetadata = await tauri.persistCompilerPublicationMetadata(
        resolvedAuthoringPath,
        compilation.stagingPlan.stagingDirectoryName,
      );
    } catch (metadataError) {
      throw new Error(
        `XRiftへの送信は完了しましたが、公開先IDをプロジェクトへ保存できませんでした。重複を避けるため再アップロードせずログを確認してください: ${metadataError}`,
      );
    }

    const parsed = parseXriftUploadResult(uploadOutput);
    const parsedKindId = kind === "world" ? parsed.worldId : parsed.itemId;
    if (parsedKindId && parsedKindId !== publicationMetadata.id) {
      throw new Error(
        "XRiftの出力IDと保存された公開先IDが一致しません。重複を避けるため再アップロードせずログを確認してください。",
      );
    }
    return compactResult({
      ...parsed,
      worldId: kind === "world" ? publicationMetadata.id : parsed.worldId,
      itemId: kind === "item" ? publicationMetadata.id : parsed.itemId,
      contentId: parsed.contentId ?? publicationMetadata.id,
      uploadedAt: publicationMetadata.lastUploadedAt,
    });
  } catch (error) {
    if (
      error instanceof VisualCompilationError ||
      (error instanceof DOMException && error.name === "AbortError")
    ) {
      throw error;
    }
    const detail = sanitizePublishFailure(
      error instanceof Error ? error.message : String(error),
      privatePaths,
    );
    throw new Error(detail || "XRiftへのアップロード処理に失敗しました。");
  }
}

export function didXriftUploadStopBeforeRemoteTransfer(output: string): boolean {
  const clean = output.replace(/\u001b\[[0-9;]*m/g, "");
  return (
    /no\s+files\s+found\s+to\s+upload/i.test(clean) ||
    /build\s+failed[\s\S]*command\s+failed:\s*npm\s+run\s+build/i.test(clean)
  );
}

export function parseXriftUploadResult(output: string): XriftUploadResult {
  const clean = output.replace(/\u001b\[[0-9;]*m/g, "").trim();
  const jsonObjects = extractJsonObjects(clean);
  for (let index = jsonObjects.length - 1; index >= 0; index -= 1) {
    try {
      const value = JSON.parse(jsonObjects[index]) as unknown;
      const parsed = readUploadObject(value);
      if (Object.keys(parsed).length > 0) return parsed;
    } catch {
      // Human-readable CLI output is handled below.
    }
  }

  const worldId = labelledString(clean, ["world id", "worldId"]);
  const itemId = labelledString(clean, ["item id", "itemId"]);
  const explicitContentId = labelledString(clean, ["content id", "contentId"]);
  return compactResult({
    worldId,
    itemId,
    contentId: explicitContentId ?? worldId ?? itemId,
    versionId: labelledString(clean, ["version id", "versionId"]),
    versionNumber:
      labelledNumber(clean, ["version number", "versionNumber"]) ??
      completedUploadVersion(clean),
    contentHash: labelledString(clean, ["content hash", "contentHash"]),
    status: labelledString(clean, ["status"]),
    url: explicitUrl(clean),
  });
}

function extractJsonObjects(value: string): string[] {
  const candidates = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{") && line.endsWith("}"));
  let start = -1;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') {
      quoted = true;
      continue;
    }
    if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        candidates.push(value.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return [...new Set(candidates)];
}

function readUploadObject(value: unknown): XriftUploadResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const sources = collectUploadRecords(record);
  const worldId = stringFieldFrom(sources, ["worldId", "world_id"]);
  const itemId = stringFieldFrom(sources, ["itemId", "item_id"]);
  const explicitContentId = stringFieldFrom(sources, ["contentId", "content_id"]);
  return compactResult({
    worldId,
    itemId,
    contentId: explicitContentId ?? worldId ?? itemId,
    versionId: stringFieldFrom(sources, ["versionId", "version_id"]),
    versionNumber: numberFieldFrom(sources, ["versionNumber", "version_number"]),
    contentHash: stringFieldFrom(sources, ["contentHash", "content_hash", "hash"]),
    status: stringFieldFrom(sources, ["status"]),
    url: urlFieldFrom(sources, ["url", "contentUrl", "content_url"]),
  });
}

function collectUploadRecords(
  root: Record<string, unknown>,
): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  const queue: unknown[] = [root];
  const visited = new Set<object>();
  while (queue.length > 0 && records.length < 32) {
    const candidate = queue.shift();
    if (!candidate || typeof candidate !== "object" || visited.has(candidate)) {
      continue;
    }
    visited.add(candidate);
    if (Array.isArray(candidate)) {
      queue.push(...candidate);
      continue;
    }
    const record = candidate as Record<string, unknown>;
    records.push(record);
    queue.push(...Object.values(record));
  }
  return records;
}

function stringFieldFrom(
  sources: Record<string, unknown>[],
  keys: string[],
): string | undefined {
  for (const source of sources) {
    const value = stringField(source, keys);
    if (value) return value;
  }
  return undefined;
}

function numberFieldFrom(
  sources: Record<string, unknown>[],
  keys: string[],
): number | undefined {
  for (const source of sources) {
    const value = numberField(source, keys);
    if (value !== undefined) return value;
  }
  return undefined;
}

function urlFieldFrom(
  sources: Record<string, unknown>[],
  keys: string[],
): string | undefined {
  for (const source of sources) {
    const value = urlField(source, keys);
    if (value) return value;
  }
  return undefined;
}

function stringField(
  source: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function numberField(
  source: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && /^\d+$/.test(value.trim())) {
      return Number(value);
    }
  }
  return undefined;
}

function urlField(
  source: Record<string, unknown>,
  keys: string[],
): string | undefined {
  const value = stringField(source, keys);
  return value && /^https?:\/\/\S+$/i.test(value) ? value : undefined;
}

function labelledString(output: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = output.match(
      new RegExp(`${escaped}\\s*[:：=]\\s*["']?([A-Za-z0-9._:-]+)`, "i"),
    );
    if (match?.[1]) return match[1];
  }
  return undefined;
}

function labelledNumber(output: string, labels: string[]): number | undefined {
  const value = labelledString(output, labels);
  return value && /^\d+$/.test(value) ? Number(value) : undefined;
}

function completedUploadVersion(output: string): number | undefined {
  const value = output.match(
    /(?:world|item)\s+upload\s+complete\s*\(\s*version\s*:\s*(\d+)\s*\)/i,
  )?.[1];
  return value ? Number(value) : undefined;
}

function explicitUrl(output: string): string | undefined {
  const labelled = output.match(/(?:url|link)\s*[:=]\s*(https?:\/\/\S+)/i)?.[1];
  return labelled?.replace(/[),.;]+$/, "");
}

function compactResult(result: XriftUploadResult): XriftUploadResult {
  return Object.fromEntries(
    Object.entries(result).filter(([, value]) => value !== undefined),
  ) as XriftUploadResult;
}
