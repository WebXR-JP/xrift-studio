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
/** Where `build-world-runtime-shell.mjs` publishes the shell. */
export const DEFAULT_SHELL_BASE_URL = "./xrift-runtime-shell";
const SHELL_MANIFEST_FILE = "shell-manifest.json";

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
 * Rejects only what cannot be sent as a bearer token at all.
 *
 * Deliberately not a format check. Which prefixes exist, which character set a
 * key uses, and which scopes it carries are all XRift's to define and change,
 * and none of it is knowable from the string. Two earlier attempts to be
 * clever here — refusing API keys as read-only, then requiring a specific
 * prefix and charset — both rejected credentials that were perfectly able to
 * publish. A 401 or 403 from the server is authoritative; a guess here is not.
 *
 * Whitespace is still worth catching, because a token pasted with a stray
 * newline produces a malformed header rather than a clean rejection.
 */
export function assertUploadableToken(token: string): void {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new WebUploadUnsupportedError(
      "token-invalid",
      "トークンを入力してください。",
    );
  }
  if (/\s/.test(trimmed)) {
    throw new WebUploadUnsupportedError(
      "token-invalid",
      "トークンに空白や改行が含まれています。前後の余分な文字を取り除いてください。",
    );
  }
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

export type ShellManifest = {
  version: string;
  entry: string;
  files: string[];
};

/**
 * Fetches the prebuilt shell that ships alongside the web build.
 *
 * Kept separate from assembly so a caller can cache it: the shell is identical
 * for every world, so re-fetching ~6 MB per upload would be pure waste.
 */
export async function loadRuntimeShell(
  baseUrl: string = DEFAULT_SHELL_BASE_URL,
  signal?: AbortSignal,
): Promise<RuntimeShellFile[]> {
  const root = baseUrl.replace(/\/+$/, "");
  const response = await fetch(`${root}/${SHELL_MANIFEST_FILE}`, { signal });
  if (!response.ok) {
    throw new WebUploadUnsupportedError(
      "shell-missing",
      `ランタイムシェルを取得できませんでした (${response.status})。node scripts/build-world-runtime-shell.mjs で生成してください。`,
    );
  }

  const manifest = parseShellManifest(await response.json());
  const files: RuntimeShellFile[] = [];
  for (const path of manifest.files) {
    if (signal?.aborted) {
      throw new DOMException("The operation was aborted", "AbortError");
    }
    const file = await fetch(`${root}/${path}`, { signal });
    if (!file.ok) {
      throw new WebUploadUnsupportedError(
        "shell-missing",
        `ランタイムシェルのファイルを取得できませんでした: ${path} (${file.status})`,
      );
    }
    files.push({ path, data: new Uint8Array(await file.arrayBuffer()) });
  }
  return files;
}

export function parseShellManifest(value: unknown): ShellManifest {
  if (!value || typeof value !== "object") {
    throw new Error("ランタイムシェルの一覧が正しい形式ではありません。");
  }
  const record = value as Record<string, unknown>;
  const rawFiles = Array.isArray(record.files) ? record.files : [];
  const files = rawFiles
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.replace(/\\/g, "/").replace(/^\/+/, ""))
    // A listing that escapes its own directory would fetch arbitrary paths
    // from the hosting origin.
    .filter((entry) => entry && !entry.split("/").includes(".."));
  if (!files.includes(SHELL_ENTRY_PATH)) {
    throw new Error(
      `ランタイムシェルの一覧に ${SHELL_ENTRY_PATH} が含まれていません。`,
    );
  }
  return {
    version: typeof record.version === "string" ? record.version : "unknown",
    entry: SHELL_ENTRY_PATH,
    files,
  };
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
    if (error instanceof XriftNetworkError) {
      throw new Error(await describeNetworkFailure(error));
    }
    throw new Error(describeSdkError(error));
  }
}

export const XRIFT_API_ORIGIN = "https://api.xrift.net";

/**
 * Separates "XRift did not answer" from "the browser would not let us read
 * the answer".
 *
 * `fetch` reports both as `TypeError: Failed to fetch` with no detail, but the
 * remedies are opposite. A `no-cors` request still resolves when the host
 * responds, even though the body is opaque, so a success here proves XRift is
 * reachable and that CORS is what blocked the real request.
 *
 * XRift returns `Access-Control-Allow-Origin` only for its own origins, so any
 * other page — a local dev server, GitHub Pages — is refused. That is a
 * server-side allowlist, not something this code can work around.
 */
export async function describeNetworkFailure(
  error: XriftNetworkError,
): Promise<string> {
  let hostAnswered = false;
  try {
    await fetch(XRIFT_API_ORIGIN, {
      method: "GET",
      mode: "no-cors",
      signal: AbortSignal.timeout(8000),
    });
    hostAnswered = true;
  } catch {
    hostAnswered = false;
  }

  const origin =
    typeof location !== "undefined" ? location.origin : "このページ";

  if (hostAnswered) {
    return `XRiftのAPIは応答しましたが、${origin} からの読み取りを許可していないため結果を受け取れませんでした。XRiftは許可済みオリジンにだけ応答を返す設定になっています。このオリジンを許可リストへ追加してもらうか、中継サーバー経由での送信が必要です。アップロード処理自体は最後まで通っているため、この点だけが残っています。`;
  }
  return `XRiftへ接続できませんでした: ${redactToken(error.message)}。ネットワーク接続を確認してください。`;
}

/** Turns an SDK error into a message that says what to do next. */
export function describeSdkError(error: unknown): string {
  if (error instanceof XriftAuthError) {
    return "トークンが受け付けられませんでした。失効しているか、公開権限がない可能性があります。xrift login で取得し直してください。";
  }
  if (error instanceof XriftApiError) {
    // 403 from a scoped API key means the key was issued without the write
    // scope, which is fixed by reissuing it rather than by retrying.
    if (error.statusCode === 403) {
      return `このトークンにはワールドを公開する権限がありません (${redactToken(error.message)})。APIキーを使う場合は write:worlds スコープを付けて発行し直してください。`;
    }
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
