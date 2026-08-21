import { XriftClient } from "@xrift/sdk";
import type { CompilerPublicationMetadata, ProjectKind } from "../tauri";
import { tauri } from "../tauri";
import { collectDistUploadFiles } from "./dist-upload-files";
import {
  COMPILER_WORLD_COMPONENTS_PACKAGE_SPEC,
  CommandSpawnError,
  xrift,
  type LogLine,
  type RunResult,
} from "../xrift-cli";
import type {
  VisualCompileResult,
  VisualCompilerDocuments,
} from "./compiler";
import { compileVisualProject, compilerStagingDirectoryName } from "./compiler";
import { resolveLocalBasisTranscoderPath } from "./basis-transcoder";

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
  /**
   * Uploads the built `dist/` with `@xrift/sdk` instead of `xrift upload`.
   *
   * Optional because the CLI keeps its own credential from `xrift login`,
   * while the SDK takes a token directly. Without one the CLI path still
   * runs, so supplying a token is what opts a desktop publish into the same
   * upload implementation the browser uses.
   */
  token?: string;
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

/**
 * A failed CLI step, carrying its full output so the UI can show the reason
 * instead of a fragment of it.
 */
export class PublishCommandError extends Error {
  /** Full sanitized CLI output. Empty when the command printed nothing. */
  readonly detail: string;

  constructor(failure: PublishCommandFailure) {
    super(failure.summary);
    this.name = "PublishCommandError";
    this.detail = failure.detail;
  }
}

export type PublishCommandFailure = {
  /** One line naming the step that failed, plus a recovery action if known. */
  summary: string;
  /** Full sanitized CLI output, for verbatim display. */
  detail: string;
};

function assertSucceeded(
  result: RunResult,
  operation: string,
  privatePaths: string[] = [],
): void {
  if (result.code === 0) return;
  throw new PublishCommandError(
    formatPublishCommandFailure(operation, result, privatePaths),
  );
}

/**
 * Produces a safe, actionable error from both CLI output streams.
 *
 * The output is kept whole. An earlier version showed only the last six lines,
 * which silently discarded the verdict whenever a tool closed with a usage hint
 * — `xrift check` ends its rejection with an example config, so the reason a
 * world was refused never reached the author. Choosing which lines matter is
 * the reader's job, not this function's.
 */
export function formatPublishCommandFailure(
  operation: string,
  result: Pick<RunResult, "stdout" | "stderr">,
  privatePaths: string[] = [],
): PublishCommandFailure {
  const detail = [result.stderr, result.stdout]
    .map((value) => value.trim())
    .filter(Boolean)
    .join("\n");
  const safeDetail = detail ? sanitizePublishFailure(detail, privatePaths) : "";
  const recovery = publishCommandRecovery(operation, safeDetail).trim();
  const headline = publishFailureHeadline(safeDetail);
  return {
    summary: recovery
      ? `${operation}に失敗しました。${recovery}`
      : headline
        ? `${operation}に失敗しました: ${headline}`
        : safeDetail
          ? `${operation}に失敗しました。下のCLI出力を確認してください。`
          : `${operation}に失敗しました。`,
    detail: safeDetail,
  };
}

/**
 * Names the failure in the CLI's own words.
 *
 * Command line tools mark their verdict lines, so the first marked line is the
 * reason — far better than a summary that only says to go read the output.
 * Position is never used to guess: an unmarked output yields no headline and
 * the reader is pointed at the full log instead.
 */
function publishFailureHeadline(detail: string): string | undefined {
  const marked = detail
    .split("\n")
    .map((line) => line.trim())
    .find((line) => PUBLISH_FAILURE_MARKER.test(line));
  if (!marked) return undefined;
  const stripped = marked.replace(PUBLISH_FAILURE_MARKER, "").trim();
  if (!stripped) return undefined;
  return stripped.length > PUBLISH_FAILURE_HEADLINE_MAX_CHARS
    ? `${stripped.slice(0, PUBLISH_FAILURE_HEADLINE_MAX_CHARS)}…`
    : stripped;
}

const PUBLISH_FAILURE_MARKER = /^(?:[✗×✖❌]|Error:|error:|ERROR:)\s*/;
const PUBLISH_FAILURE_HEADLINE_MAX_CHARS = 200;

/**
 * Puts the build's own errors back into a failed check.
 *
 * `xrift check --build` runs the world's build internally and, when it fails,
 * reports `Command failed: npm run build` without the compiler output. The
 * author is then told to read a build log that was never shown. Re-running the
 * same build in the same staging directory recovers the real Vite and
 * TypeScript diagnostics, which is the only thing that says which Scene, Asset
 * or Script is at fault.
 *
 * The check's own output stays first: it holds the verdict, and the build
 * output is the evidence behind it.
 */
async function withRecoveredBuildOutput(
  checked: RunResult,
  stagingPath: string,
  onLog: (line: LogLine) => void,
  signal: AbortSignal,
  report: (progress: VisualPublishPipelineProgress) => void,
): Promise<Pick<RunResult, "stdout" | "stderr">> {
  const combined = `${checked.stderr}\n${checked.stdout}`;
  if (!BUILD_FAILURE_MARKER.test(combined)) return checked;
  if (signal.aborted) return checked;
  // Re-running the build takes as long as the build did. Without this the
  // dialog sits on "checking" with nothing moving, which reads as a hang.
  report({
    stage: "checking",
    label: "ビルドエラーを取得しています",
    detail: "失敗したビルドをもう一度実行して、原因の出力を集めます。",
    percent: 70,
    cancelSafe: false,
  });
  let rebuilt: RunResult;
  try {
    rebuilt = await xrift.runCompilerStagingBuild(stagingPath, onLog);
  } catch {
    // Best effort. A build that cannot even be spawned leaves the original
    // verdict in place rather than replacing it with our failure to look into
    // it.
    return checked;
  }
  const buildOutput = [rebuilt.stderr, rebuilt.stdout]
    .map((value) => value.trim())
    .filter(Boolean)
    .join("\n");
  if (!buildOutput) return checked;
  return {
    stdout: `${checked.stdout}\n\n${BUILD_OUTPUT_SEPARATOR}\n${buildOutput}`,
    stderr: checked.stderr,
  };
}

/** How the CLI reports a failed build without saying what failed. */
const BUILD_FAILURE_MARKER = /command failed:\s*npm\s+run\s+build/i;

/** Names the recovered section, so the recovery text can point at it. */
export const BUILD_OUTPUT_SEPARATOR = "--- npm run build ---";

function publishCommandRecovery(operation: string, detail?: string): string {
  if (
    operation === "XRiftテンプレートの作成" &&
    /downloading template|failed to download template/i.test(detail ?? "")
  ) {
    return "テンプレートを取得できませんでした。ネットワーク接続、GitHubへのアクセス、プロキシ設定を確認してから再試行してください。\n";
  }
  if (
    /^(World|Item)の検査$/.test(operation) &&
    BUILD_FAILURE_MARKER.test(detail ?? "")
  ) {
    return `公開用ステージングのビルドが失敗しました。下の「${BUILD_OUTPUT_SEPARATOR}」以降にコンパイラの出力があります。該当するScene・Asset・Scriptを修正してから再試行してください。\n`;
  }
  return "";
}

/**
 * Redacts a failure on its way out of the publish pipeline, without flattening
 * it.
 *
 * The pipeline used to rebuild every error as a plain `Error`, which threw away
 * the CLI output a `PublishCommandError` was carrying. The dialog renders that
 * output under the summary, so the flattening is why every message that said
 * "read the output below" pointed at a panel that was never rendered. The class
 * is preserved here and redaction is re-run against the paths discovered since
 * the error was raised.
 */
export function redactPublishFailure(
  error: unknown,
  privatePaths: string[],
): Error {
  if (error instanceof PublishCommandError) {
    return new PublishCommandError({
      summary: sanitizePublishFailure(error.message, privatePaths),
      detail: sanitizePublishFailure(error.detail, privatePaths),
    });
  }
  const detail = sanitizePublishFailure(
    error instanceof Error ? error.message : String(error),
    privatePaths,
  );
  return new Error(detail || "XRiftへのアップロード処理に失敗しました。");
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
  // Redaction only. This function used to also keep the last 8 lines, which
  // made it silently decide what the author was allowed to read — a CLI that
  // closes with a usage hint had its verdict dropped here. How much to show is
  // the display's call; the bound below only stops an unbounded CLI dump from
  // entering React state.
  return lines.join("\n").slice(0, SANITIZED_FAILURE_MAX_CHARS);
}

const SANITIZED_FAILURE_MAX_CHARS = 20_000;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Bundled compiler asset encoding returned no data")),
    );
    reader.addEventListener("error", () =>
      reject(
        reader.error ??
          new Error("Bundled compiler asset encoding failed"),
      ),
    );
    reader.readAsDataURL(blob);
  });
}

async function loadCompilerBundledAssetOverlays(
  compilation: VisualCompileResult,
  signal: AbortSignal,
) {
  return Promise.all(
    compilation.stagingPlan.bundledAssetCopyPlan.map(async (entry) => {
      throwIfAborted(signal);
      const sourceDirectory =
        entry.source === "three-basis"
          ? resolveLocalBasisTranscoderPath()
          : "";
      const response = await fetch(
        `${sourceDirectory}${encodeURIComponent(entry.sourceFileName)}`,
        { signal },
      );
      if (!response.ok) {
        throw new Error(
          `公開用KTX2変換ファイルを読み込めませんでした (${response.status})`,
        );
      }
      return {
        targetRelativePath: entry.targetRelativePath,
        dataUrl: await blobToDataUrl(await response.blob()),
      };
    }),
  );
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

  const binaryOverlayFiles = await loadCompilerBundledAssetOverlays(
    compilation,
    signal,
  );
  let staged: Awaited<ReturnType<typeof tauri.applyCompilerStaging>>;
  try {
    staged = await tauri.applyCompilerStaging(
      authoringProjectPath,
      compilation.stagingPlan.stagingDirectoryName,
      compilation.stagingPlan.overlayFiles.map((file) => ({
        relativePath: file.relativePath,
        content: file.content,
      })),
      binaryOverlayFiles,
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
  throwIfAborted(signal);
  report({
    stage: "compiling",
    // Not "dependencies for the staging project": that named the mechanism and
    // read like a fault report. What the author needs to know is that this is a
    // normal step and that the first run is the slow one.
    label: "公開の準備をしています",
    detail: "必要なライブラリを取得します。初回は数分かかることがあります。",
    percent: 52,
    cancelSafe: false,
  });
  const installed = await xrift.installCompilerStagingDependencies(
    staged.projectPath,
    // The official template pins its own older @xrift/world-components range.
    // Install Studio's version over it so the published world builds and runs
    // against the same Components and Hooks that Play used.
    [
      ...compilation.stagingPlan.runtimePackageSpecs,
      COMPILER_WORLD_COMPONENTS_PACKAGE_SPEC,
    ],
    onLog,
  );
  assertSucceeded(installed, "公開の準備", [
    authoringProjectPath,
    staged.projectPath,
  ]);
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
  token,
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
    if (checked.code !== 0) {
      throw new PublishCommandError(
        formatPublishCommandFailure(
          `${kind === "world" ? "World" : "Item"}の検査`,
          await withRecoveredBuildOutput(
            checked,
            stagingPath,
            safeLog,
            signal,
            report,
          ),
          privatePaths,
        ),
      );
    }

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

    if (token) {
      return await uploadStagedProjectWithSdk({
        token,
        kind,
        stagingPath,
        authoringProjectPath: resolvedAuthoringPath,
        stagingDirectoryName: compilation.stagingPlan.stagingDirectoryName,
        documents,
        report,
        onLog: safeLog,
        signal,
      });
    }

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
    throw redactPublishFailure(error, privatePaths);
  }
}

/**
 * Uploads a CLI-built staging project through `@xrift/sdk`.
 *
 * The CLI still scaffolds the template and runs `buildCommand`; only the
 * transfer moves to the SDK, so the desktop and browser paths compute
 * `contentHash` with one implementation instead of two.
 *
 * The result is recorded through `persistCompilerPublicationResult`, which
 * repeats the owner and advancement checks the CLI path relies on. Those run
 * after the bytes are already stored, so a failure there means "uploaded but
 * unrecorded" — the message says so rather than inviting a retry that would
 * publish a second time.
 */
async function uploadStagedProjectWithSdk(input: {
  token: string;
  kind: ProjectKind;
  stagingPath: string;
  authoringProjectPath: string;
  stagingDirectoryName: string;
  documents: VisualCompilerDocuments;
  report: (progress: VisualPublishPipelineProgress) => void;
  onLog: (line: LogLine) => void;
  signal: AbortSignal;
}): Promise<XriftUploadResult> {
  if (input.kind !== "world") {
    throw new Error(
      "SDKでのアップロードは現在ワールドのみ対応しています。アイテムはトークンを指定せずCLI経路で公開してください。",
    );
  }

  const config = parseStagedXriftConfig(
    await tauri.readTextFile(input.stagingPath, "xrift.json"),
    input.kind,
  );

  input.report({
    stage: "uploading",
    label: "ビルド結果を読み込んでいます",
    detail: `${config.distDir} を収集します。`,
    percent: 80,
    cancelSafe: true,
  });
  const collected = await collectDistUploadFiles(
    input.stagingPath,
    config.distDir,
    config.ignore,
    input.signal,
  );
  input.onLog({
    kind: "info",
    text: `dist: ${collected.files.length} files, ${(collected.totalBytes / 1024 / 1024).toFixed(2)} MB (ignored ${collected.ignoredPaths.length})`,
    ts: Date.now(),
  });

  const client = new XriftClient({ token: input.token });
  const uploaded = await client.worlds.upload(collected.files, {
    name: config.title,
    description: config.description,
    thumbnailPath: config.thumbnailPath,
    physics: config.physics,
    camera: config.camera,
    onProgress: (progress) =>
      input.report({
        stage: "uploading",
        label: "XRiftへワールドを送信しています",
        detail: progress.currentFile,
        percent:
          84 + Math.round((progress.completed / Math.max(1, progress.total)) * 12),
        cancelSafe: false,
      }),
  });

  input.report({
    stage: "processing",
    label: "公開先IDを保存しています",
    percent: 97,
    cancelSafe: false,
  });

  let metadata: CompilerPublicationMetadata;
  try {
    metadata = await tauri.persistCompilerPublicationResult(
      input.authoringProjectPath,
      input.stagingDirectoryName,
      uploaded.worldId,
      new Date().toISOString(),
    );
  } catch (error) {
    throw new Error(
      `XRiftへの送信は完了しましたが、公開先IDをプロジェクトへ保存できませんでした。重複を避けるため再アップロードせず、XRiftのワールド一覧で状態を確認してください (worldId: ${uploaded.worldId}): ${error}`,
    );
  }

  return compactResult({
    worldId: uploaded.worldId,
    contentId: uploaded.worldId,
    versionId: uploaded.versionId,
    versionNumber: uploaded.versionNumber,
    contentHash: uploaded.contentHash,
    uploadedAt: metadata.lastUploadedAt,
  });
}

/**
 * Reads the staged `xrift.json` the compiler wrote and the CLI template owns.
 *
 * The upload has to send the same name, ignore rules and physics the CLI would
 * have sent, and those live in this file rather than in the Studio documents.
 */
export function parseStagedXriftConfig(
  source: string,
  kind: ProjectKind,
): {
  distDir: string;
  title: string;
  description?: string;
  thumbnailPath?: string;
  ignore: string[];
  physics?: { gravity?: number; allowInfiniteJump?: boolean };
  camera?: { near?: number; far?: number };
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("公開用ステージングのxrift.jsonを解析できませんでした。");
  }
  const root = parsed as Record<string, unknown> | null;
  const section = root?.[kind];
  if (!section || typeof section !== "object") {
    throw new Error(
      `公開用ステージングのxrift.jsonに"${kind}"の設定がありません。`,
    );
  }
  const record = section as Record<string, unknown>;
  const rawDist = typeof record.distDir === "string" ? record.distDir : "./dist";
  return {
    // "./dist" and "dist/" both mean the same directory to the CLI.
    distDir: rawDist.replace(/^\.\//, "").replace(/\/+$/, "") || "dist",
    title: typeof record.title === "string" && record.title ? record.title : "Untitled",
    description:
      typeof record.description === "string" ? record.description : undefined,
    thumbnailPath:
      typeof record.thumbnailPath === "string" ? record.thumbnailPath : undefined,
    ignore: Array.isArray(record.ignore)
      ? record.ignore.filter((entry): entry is string => typeof entry === "string")
      : [],
    physics: isPlainRecord(record.physics)
      ? (record.physics as { gravity?: number; allowInfiniteJump?: boolean })
      : undefined,
    camera: isPlainRecord(record.camera)
      ? (record.camera as { near?: number; far?: number })
      : undefined,
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

/**
 * The marker Tauri puts on the one publish failure an author can resolve.
 *
 * A previous upload was marked started but never advanced the publication
 * sidecar, so Studio cannot tell whether the world reached XRift. It refuses to
 * retry on its own — that could publish the same world twice — and every later
 * publish stops at the same point until someone resolves it.
 */
export const XRIFT_UPLOAD_ATTEMPT_UNRESOLVED = "XRIFT_UPLOAD_ATTEMPT_UNRESOLVED";

export function isUnresolvedXriftUploadAttempt(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return message.includes(XRIFT_UPLOAD_ATTEMPT_UNRESOLVED);
}

/**
 * Clears a stale upload attempt so publishing can be tried again.
 *
 * This is the author's decision, not Studio's: it is only safe once they have
 * checked XRift and seen that the previous attempt did not land. Tauri still
 * refuses if the staging publication moved after the attempt started, so this
 * can never erase the record of an upload that actually completed.
 *
 * The staging directory is derived from the project identity rather than from a
 * fresh compile, because a project stuck in this state cannot reach the point
 * where a compile would hand back the name.
 */
export async function clearStaleXriftUploadAttempt(
  authoringProjectPath: string,
  projectId: string,
  projectKind: ProjectKind,
): Promise<void> {
  await tauri.clearCompilerUploadAttempt(
    authoringProjectPath,
    compilerStagingDirectoryName(projectId, projectKind),
  );
}
