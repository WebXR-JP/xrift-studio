import {
  XriftApiError,
  XriftAuthError,
  XriftNetworkError,
  XriftClient,
  getMimeType,
  type UploadFile,
} from "@xrift/sdk";
import type { ProjectKind } from "../tauri";
import { compileVisualProject } from "./compiler";
import type { VisualCompilerDocuments } from "./compiler";
import { VisualCompilationError, type XriftUploadResult } from "./publish";
import type { VisualPublishPipelineProgress } from "./publish";

/**
 * Browser upload path.
 *
 * The desktop path (`publishVisualProject`) shells out to the official CLI: it
 * stages an XRift template on disk, runs `npm run build`, then `xrift upload`.
 * None of that exists in a browser, so this path instead uses `@xrift/sdk`,
 * which is fetch-based and works unchanged in both Node and the browser.
 *
 * The trade-off is that nothing here compiles TypeScript. The world is
 * published as data using the compiler's `classic-runtime` output — a
 * `runtime.json` describing the Scene plus its Assets — which is why a
 * prebuilt runtime shell has to be supplied alongside it. See
 * `resolveVisualUploadEnvironment` in `upload.ts` for the branch itself.
 */

/**
 * Where `runtime.json` sits inside the published bundle.
 *
 * The shell resolves this against its own `import.meta.url`, not the page, so
 * the path is relative to wherever XRift stored the world's files.
 */
const RUNTIME_MANIFEST_PATH = "xrift/runtime.json";
const THUMBNAIL_PATH = "thumbnail.png";
/** Module Federation entry the XRift player loads. */
export const SHELL_ENTRY_PATH = "remoteEntry.js";

/**
 * One file of the prebuilt runtime shell.
 *
 * An XRift world is a Module Federation remote: the official template builds
 * `dist/remoteEntry.js` exposing `./World`, and XRift's player loads that,
 * supplying react/three/@xrift/world-components as shared singletons. Studio
 * cannot produce a federated bundle in a browser, so the shell comes from a
 * one-time build of the template (`scripts/build-world-runtime-shell.mjs`).
 *
 * Without it the upload succeeds and the world renders nothing, so
 * `assembleWebUploadFiles` refuses to proceed when it is absent.
 */
export type RuntimeShellFile = {
  /** Bundle-relative path, e.g. `index.html`. */
  path: string;
  data: Uint8Array;
};

export type WebUploadRequest = {
  kind: ProjectKind;
  documents: VisualCompilerDocuments;
  /** XRift CLI token. Only `xrf_` tokens may publish. */
  token: string;
  /**
   * Reads one Asset's bytes.
   *
   * Supplied by the host because the browser has no project directory: the
   * desktop build reads from disk over IPC, while a web host resolves from
   * whatever store it keeps Assets in.
   */
  readAssetBytes: (sourceRelativePath: string) => Promise<Uint8Array>;
  shellFiles: readonly RuntimeShellFile[];
  thumbnail?: Uint8Array;
  /** Publishes a new version of this world instead of creating one. */
  worldId?: string;
  report: (progress: VisualPublishPipelineProgress) => void;
  signal: AbortSignal;
};

export class WebUploadUnsupportedError extends Error {
  constructor(
    readonly code:
      | "item-unsupported"
      | "shell-missing"
      | "scripts-unsupported"
      | "token-invalid",
    message: string,
  ) {
    super(message);
    this.name = "WebUploadUnsupportedError";
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("The operation was aborted", "AbortError");
  }
}

/**
 * Only `xrf_` CLI tokens can publish.
 *
 * XRift's Public API v1 defines `read:worlds`, `read:users` and
 * `read:instances` and no write scope, so an `xrift_sk_` API key authenticates
 * but cannot upload. Checking the prefix here turns that into an immediate,
 * explicable refusal instead of a 401 after the bundle has been assembled.
 */
export function assertUploadableToken(token: string): void {
  const trimmed = token.trim();
  if (/^xrf_[A-Za-z0-9._-]{8,}$/.test(trimmed)) return;
  if (/^xrift_sk_/.test(trimmed)) {
    throw new WebUploadUnsupportedError(
      "token-invalid",
      "APIキー (xrift_sk_) では公開できません。Public API v1のスコープは読み取り専用のため、xrift login で取得したCLIトークン (xrf_) を使ってください。",
    );
  }
  throw new WebUploadUnsupportedError(
    "token-invalid",
    "トークンの形式が正しくありません。xrift login で取得した xrf_ で始まるCLIトークンを入力してください。",
  );
}

/**
 * Builds the file set to upload from compiler output plus the runtime shell.
 *
 * Kept separate from the network call so the layout can be asserted without
 * touching XRift.
 */
export async function assembleWebUploadFiles(
  request: Pick<
    WebUploadRequest,
    "documents" | "readAssetBytes" | "shellFiles" | "thumbnail" | "signal"
  >,
): Promise<UploadFile[]> {
  const compilation = compileVisualProject(request.documents, {
    outputMode: "classic-runtime",
  });
  if (!compilation.canStage || !compilation.runtimeManifestFile) {
    throw new VisualCompilationError(compilation);
  }

  if (request.shellFiles.length === 0) {
    throw new WebUploadUnsupportedError(
      "shell-missing",
      "ブラウザ版はビルド済みランタイムシェルを必要とします。シェルが同梱されていないため、アップロードを開始できません。",
    );
  }
  // `remoteEntry.js` is what XRift loads; a shell without it is not a world.
  // The template's own build emits an index.html too, but that is only for
  // local preview and carries nothing XRift reads.
  if (!request.shellFiles.some((file) => file.path === SHELL_ENTRY_PATH)) {
    throw new WebUploadUnsupportedError(
      "shell-missing",
      `ランタイムシェルに ${SHELL_ENTRY_PATH} がありません。XRiftはModule Federationのremoteとして読み込むため、このままでは公開できません。`,
    );
  }

  const files = new Map<string, Uint8Array>();
  for (const file of request.shellFiles) files.set(file.path, file.data);

  files.set(
    RUNTIME_MANIFEST_PATH,
    new TextEncoder().encode(compilation.runtimeManifestFile.content),
  );

  for (const entry of compilation.assetCopyPlan) {
    throwIfAborted(request.signal);
    if (!entry.supportedByCompiler) {
      throw new Error(
        `Asset「${entry.assetId}」はXRift向け変換に対応していません。`,
      );
    }
    // Compiler targets are rooted at `public/`, which the template's build
    // would normally flatten into the bundle root.
    const targetPath = entry.targetRelativePath.replace(/^public\//, "");
    files.set(targetPath, await request.readAssetBytes(entry.sourceRelativePath));
  }

  if (request.thumbnail) files.set(THUMBNAIL_PATH, request.thumbnail);

  return [...files.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([remotePath, data]) => ({
      remotePath,
      size: data.byteLength,
      contentType: getMimeType(remotePath),
      data,
    }));
}

/**
 * Compiles, assembles and uploads a Visual project straight from the browser.
 *
 * Progress is reported with the same stage vocabulary the desktop pipeline
 * uses, so one dialog can render either path. `checking` never appears here:
 * there is no `xrift check --build` without a local build.
 */
export async function uploadVisualProjectFromWeb(
  request: WebUploadRequest,
): Promise<XriftUploadResult> {
  if (request.kind !== "world") {
    throw new WebUploadUnsupportedError(
      "item-unsupported",
      "ブラウザ版はワールドの公開のみ対応しています。アイテムはデスクトップ版から公開してください。",
    );
  }
  assertUploadableToken(request.token);

  throwIfAborted(request.signal);
  request.report({
    stage: "compiling",
    label: "SceneとAssetを検証しています",
    detail: "ブラウザではビルドを行わないため、Runtime JSONとして書き出します。",
    percent: 14,
    cancelSafe: true,
  });

  let files: UploadFile[];
  try {
    files = await assembleWebUploadFiles(request);
  } catch (error) {
    // A Script-bearing project fails compilation with a dedicated diagnostic;
    // translating it here keeps the reason actionable in the dialog.
    if (
      error instanceof VisualCompilationError &&
      error.result.diagnostics.some(
        (diagnostic) => diagnostic.code === "script-unsupported-runtime-output",
      )
    ) {
      throw new WebUploadUnsupportedError(
        "scripts-unsupported",
        "Scriptを含むワールドはブラウザ版から公開できません。Runtime JSONがScriptを表現できないため、デスクトップ版から公開してください。",
      );
    }
    throw error;
  }

  throwIfAborted(request.signal);
  request.report({
    stage: "uploading",
    label: "XRiftへワールドを送信しています",
    detail: `${files.length}個のファイルを送信します。`,
    percent: 40,
    cancelSafe: false,
  });

  const client = new XriftClient({ token: request.token });

  try {
    const result = await client.worlds.upload(files, {
      worldId: request.worldId,
      name: request.documents.project.metadata.title,
      description: request.documents.project.metadata.description,
      thumbnailPath: request.thumbnail ? THUMBNAIL_PATH : undefined,
      onProgress: (progress) => {
        request.report({
          stage: "uploading",
          label: "XRiftへワールドを送信しています",
          detail: progress.currentFile,
          percent:
            40 +
            Math.round((progress.completed / Math.max(1, progress.total)) * 55),
          cancelSafe: false,
        });
      },
    });

    request.report({
      stage: "processing",
      label: "XRiftから結果を受け取っています",
      percent: 98,
      cancelSafe: false,
    });

    return {
      worldId: result.worldId,
      contentId: result.worldId,
      versionId: result.versionId,
      versionNumber: result.versionNumber,
      contentHash: result.contentHash,
      uploadedAt: new Date().toISOString(),
    };
  } catch (error) {
    throw new Error(describeSdkError(error));
  }
}

/** Turns an SDK error into a message that says what to do next. */
export function describeSdkError(error: unknown): string {
  if (error instanceof XriftAuthError) {
    return "トークンが受け付けられませんでした。失効しているか、公開権限がない可能性があります。xrift login で取得し直してください。";
  }
  if (error instanceof XriftApiError) {
    return `XRiftがアップロードを拒否しました (${error.statusCode}): ${redactToken(error.message)}`;
  }
  if (error instanceof XriftNetworkError) {
    return `XRiftへ接続できませんでした: ${redactToken(error.message)}`;
  }
  if (error instanceof Error) return redactToken(error.message);
  return redactToken(String(error));
}

/** An API error body can echo the request, so never show it verbatim. */
export function redactToken(value: string): string {
  return value
    .replace(/\bxrf_[A-Za-z0-9._-]+/g, "xrf_[REDACTED]")
    .replace(/\bxrift_sk_[A-Za-z0-9._-]+/g, "xrift_sk_[REDACTED]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(
      /([?&](?:X-Goog-Signature|X-Amz-Signature|Signature|token)=)[^&\s]+/gi,
      "$1[REDACTED]",
    );
}
