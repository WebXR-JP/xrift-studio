import {
  XriftApiError,
  XriftAuthError,
  XriftNetworkError,
  XriftClient,
  filterFiles,
  getMimeType,
  parseItemConfig,
  parseWorldConfig,
  type UploadFile,
  type WorldPermissions,
  type XriftConfig,
} from "@xrift/sdk";
import type { ProjectKind } from "../tauri";
import { mapWithConcurrency } from "../async-map";
import { compileVisualProject } from "./compiler";
import type { VisualCompilerDocuments } from "./compiler";
import { loadCompilerBundledAssetBytes } from "./compiler-bundled-assets";
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
 * The world root: a published world serves only the files directly under it,
 * so a manifest in a subdirectory answers 404 however the shell resolves it.
 */
const RUNTIME_MANIFEST_PATH = "xrift-runtime.json";
const THUMBNAIL_PATH = "thumbnail.png";
/** The shell fetches its manifest and Assets from its own published origin. */
const SHELL_NETWORK_RULE = "no-network-without-permission";
/** Module Federation entry the XRift player loads. */
export const SHELL_ENTRY_PATH = "remoteEntry.js";
/** Where `build-world-runtime-shell.mjs` publishes the shell. */
export const DEFAULT_SHELL_BASE_URL = "./xrift-runtime-shell";
const SHELL_MANIFEST_FILE = "shell-manifest.json";
/** The shell must be rebuilt when Runtime adapters change. */
export const REQUIRED_RUNTIME_SHELL_CONTRACT =
  "2026-10-21-openbrush-antialias-v1" as const;

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
  /** XRift API key or compatible bearer token. Never persist it. */
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
  /** Publishes a new version of this Item instead of creating one. */
  itemId?: string;
  /** Host persists a newly created target before upload continues. No token is included. */
  onRemoteCreated?: (id: string) => Promise<void>;
  report: (progress: VisualPublishPipelineProgress) => void;
  signal: AbortSignal;
};

export class WebUploadUnsupportedError extends Error {
  constructor(
    readonly code:
      | "kind-mismatch"
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
  return (await prepareWebUpload(request)).files;
}

/** Keep compiler permissions and declare the shell's same-origin runtime fetches. */
export function resolveWebRuntimePermissions(
  permissions: WorldPermissions | undefined,
): WorldPermissions {
  return {
    ...permissions,
    allowedCodeRules: [
      ...new Set([...(permissions?.allowedCodeRules ?? []), SHELL_NETWORK_RULE]),
    ].sort(),
  };
}

/** Validate the dependency graph extracted from the shell at build time. */
export function assertRuntimeShellDependencies(
  manifest: Pick<ShellManifest, "files" | "dependencies">,
): void {
  const paths = new Set(manifest.files);
  const jsPaths = manifest.files.filter((path) => path.endsWith(".js")).sort();
  const declaredPaths = Object.keys(manifest.dependencies).sort();
  if (jsPaths.join("\0") !== declaredPaths.join("\0")) {
    throw new Error("ランタイムシェルの依存一覧とJSファイルが一致しません。");
  }
  for (const [source, dependencies] of Object.entries(manifest.dependencies)) {
    if (!Array.isArray(dependencies) ||
      dependencies.some((dependency) => typeof dependency !== "string")) {
      throw new Error(`ランタイムシェルの依存一覧が不正です: ${source}`);
    }
    for (const dependency of dependencies) {
      if (!paths.has(dependency)) {
        throw new Error(
          `ランタイムシェルに依存ファイルがありません: ${source} → ${dependency}`,
        );
      }
    }
  }
}

async function prepareWebUpload(
  request: Pick<
    WebUploadRequest,
    "documents" | "readAssetBytes" | "shellFiles" | "thumbnail" | "signal"
  >,
): Promise<{ files: UploadFile[]; config: XriftConfig }> {
  const compilation = compileVisualProject(request.documents, {
    outputMode: "classic-runtime",
  });
  if (!compilation.canStage || !compilation.runtimeManifestFile) {
    throw new VisualCompilationError(compilation);
  }
  const configSource = compilation.overlayFiles.find(
    (file) => file.relativePath === "xrift.json",
  )?.content;
  if (!configSource) {
    throw new Error("公開用のxrift.jsonを生成できませんでした。");
  }
  // The desktop SDK path parses this same generated config. Keep its metadata,
  // security permissions and hash-affecting options aligned with that path.
  const config = request.documents.project.projectKind === "item"
    ? parseItemConfig(configSource)
    : parseWorldConfig(configSource);

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
  const shellPaths = new Set<string>();
  for (const file of request.shellFiles) {
    shellPaths.add(file.path);
    files.set(file.path, file.data);
  }
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
    // Publish the same asset bytes the editor renders, without applying recipes.
    const sourceBytes = await request.readAssetBytes(entry.sourceRelativePath);
    throwIfAborted(request.signal);
    files.set(targetPath, sourceBytes);
  }

  // The desktop staging path copies these from Studio's own bundle before
  // building. The runtime manifest names them at the world root, so omitting
  // even one font or decoder would leave an apparently uploaded world broken.
  const bundledFiles = await loadCompilerBundledAssetBytes(
    compilation.stagingPlan.bundledAssetCopyPlan,
    request.signal,
  );
  for (const file of bundledFiles) {
    throwIfAborted(request.signal);
    files.set(file.targetRelativePath.replace(/^public\//, ""), file.bytes);
  }

  if (request.thumbnail) files.set(THUMBNAIL_PATH, request.thumbnail);

  // The shell builder chooses the files needed by its federation graph. The
  // SDK's generic default ignore pattern matches every `__federation_shared_*`
  // path, including loader subpaths that the built World imports directly.
  // Applying it a second time here would silently remove those JS modules.
  const generatedPaths = [...files.keys()].filter((path) => !shellPaths.has(path));
  const keptGenerated = new Set(filterFiles(generatedPaths, config.ignore));
  return { config, files: [...files.entries()]
    .filter(([remotePath]) => shellPaths.has(remotePath) || keptGenerated.has(remotePath))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([remotePath, data]) => ({
      remotePath,
      size: data.byteLength,
      contentType: getMimeType(remotePath),
      data,
    })) };
}

export type ShellManifest = {
  version: string;
  runtimeContract: typeof REQUIRED_RUNTIME_SHELL_CONTRACT;
  entry: string;
  files: string[];
  dependencies: Record<string, string[]>;
  /** Module Federation surfaces verified by the builder. */
  modules: string[];
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
  kind: ProjectKind = "world",
  onProgress?: (completed: number, total: number) => void,
): Promise<RuntimeShellFile[]> {
  const root = baseUrl.replace(/\/+$/, "");
  const response = await fetch(`${root}/${SHELL_MANIFEST_FILE}`, {
    signal,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new WebUploadUnsupportedError(
      "shell-missing",
      `ランタイムシェルを取得できませんでした (${response.status})。node scripts/build-world-runtime-shell.mjsで生成してください。`,
    );
  }

  let manifest: ShellManifest;
  try {
    manifest = parseShellManifest(await response.json(), kind);
  } catch (error) {
    if (signal?.aborted) throwIfAborted(signal);
    throw new WebUploadUnsupportedError(
      "shell-missing",
      error instanceof Error
        ? error.message
        : "ランタイムシェルの契約を確認できませんでした。",
    );
  }
  let completed = 0;
  // Also stop in-flight siblings on failure so progress cannot update a closed
  // or failed dialog after this batch has already rejected.
  const batch = new AbortController();
  const abortBatch = () => batch.abort();
  if (signal?.aborted) abortBatch();
  signal?.addEventListener("abort", abortBatch, { once: true });
  try {
    const files = await mapWithConcurrency(manifest.files, 4, async (path): Promise<RuntimeShellFile> => {
      throwIfAborted(batch.signal);
      // Pin every file to the manifest version to avoid mixed shell revisions.
      const file = await fetch(
        `${root}/${path}?v=${encodeURIComponent(manifest.version)}`,
        { signal: batch.signal, cache: "no-store" },
      );
      if (!file.ok) {
        throw new WebUploadUnsupportedError(
          "shell-missing",
          `ランタイムシェルのファイルを取得できませんでした: ${path} (${file.status})`,
        );
      }
      const data = new Uint8Array(await file.arrayBuffer());
      throwIfAborted(batch.signal);
      assertRuntimeShellFileResponse(path, file, data);
      completed++;
      onProgress?.(completed, manifest.files.length);
      return { path, data };
    }, batch.signal);
    await assertRuntimeShellIntegrity(manifest, files);
    throwIfAborted(batch.signal);
    return files;
  } catch (error) {
    batch.abort();
    throw error;
  } finally {
    signal?.removeEventListener("abort", abortBatch);
  }
}

function assertRuntimeShellFileResponse(
  path: string,
  response: Response,
  data: Uint8Array,
): void {
  // Vite can return its SPA fallback with HTTP 200 for files created after the
  // dev server indexed public/. A CDN may then label those HTML bytes as JS.
  const prefix = new TextDecoder().decode(data.subarray(0, 256)).replace(/^\uFEFF/, "").trimStart();
  if (response.headers.get("content-type")?.toLowerCase().includes("text/html") ||
    /^<(?:!doctype\s+html|html\b|head\b|body\b)/i.test(prefix)) {
    throw new WebUploadUnsupportedError(
      "shell-missing",
      `ランタイムシェルのファイルがHTMLとして返されました: ${path}。開発サーバーを再起動するか、配信先のファイルを確認してください。`,
    );
  }
}

async function assertRuntimeShellIntegrity(
  manifest: ShellManifest,
  files: readonly RuntimeShellFile[],
): Promise<void> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new WebUploadUnsupportedError(
      "shell-missing",
      "ランタイムシェルの整合性を確認できません。HTTPSまたはlocalhostから開いてください。",
    );
  }
  const encoder = new TextEncoder();
  const parts = [...files]
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
    .map((file) => ({ path: encoder.encode(file.path), data: file.data }));
  const totalLength = parts.reduce(
    (length, part) => length + part.path.byteLength + part.data.byteLength,
    0,
  );
  const contents = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    contents.set(part.path, offset);
    offset += part.path.byteLength;
    contents.set(part.data, offset);
    offset += part.data.byteLength;
  }
  const digest = new Uint8Array(await subtle.digest("SHA-256", contents));
  const version = [...digest.subarray(0, 6)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  if (version !== manifest.version) {
    throw new WebUploadUnsupportedError(
      "shell-missing",
      `ランタイムシェルのファイルが一覧のバージョンと一致しません。開発サーバーを再起動するか、配信先のファイルを確認してください。(${manifest.version} / ${version})`,
    );
  }
}

export function parseShellManifest(value: unknown, kind: ProjectKind = "world"): ShellManifest {
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
  if (record.runtimeContract !== REQUIRED_RUNTIME_SHELL_CONTRACT) {
    throw new Error(
      `ランタイムシェルが古いため公開できません。要求契約 ${REQUIRED_RUNTIME_SHELL_CONTRACT}、検出値 ${typeof record.runtimeContract === "string" ? record.runtimeContract : "なし"}。node scripts/build-world-runtime-shell.mjsで再生成してください。`,
    );
  }
  if (!record.dependencies || typeof record.dependencies !== "object" ||
    Array.isArray(record.dependencies)) {
    throw new Error("ランタイムシェルの依存一覧がありません。");
  }
  const modules = Array.isArray(record.modules)
    ? record.modules.filter((entry): entry is string => typeof entry === "string")
    : ["./World"];
  const requiredModule = kind === "item" ? "./Item" : "./World";
  if (!modules.includes(requiredModule)) {
    throw new Error(`ランタイムシェルが${kind === "item" ? "アイテム" : "ワールド"}に対応していません。最新版のXRift Studioで開き直してください。`);
  }
  const manifest: ShellManifest = {
    version: typeof record.version === "string" ? record.version : "unknown",
    runtimeContract: REQUIRED_RUNTIME_SHELL_CONTRACT,
    entry: SHELL_ENTRY_PATH,
    files,
    dependencies: record.dependencies as Record<string, string[]>,
    modules,
  };
  assertRuntimeShellDependencies(manifest);
  return manifest;
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
  if (request.kind !== request.documents.project.projectKind ||
    (request.kind === "world" ? request.itemId : request.worldId)) {
    throw new WebUploadUnsupportedError(
      "kind-mismatch",
      "公開する作品の種類と送信先が一致しません。公開画面を開き直してください。",
    );
  }
  assertUploadableToken(request.token);

  throwIfAborted(request.signal);
  request.report({
    stage: "compiling",
    label: "シーンと素材を検証しています",
    detail: "ブラウザではビルドを行わないため、Runtime JSONとして書き出します。",
    percent: 14,
    cancelSafe: true,
  });

  let prepared: Awaited<ReturnType<typeof prepareWebUpload>>;
  try {
    prepared = await prepareWebUpload(request);
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
        "スクリプトを含む作品はブラウザ版から公開できません。デスクトップ版から公開してください。",
      );
    }
    throw error;
  }

  const contentLabel = request.kind === "item" ? "アイテム" : "ワールド";
  throwIfAborted(request.signal);
  request.report({
    stage: "uploading",
    label: `XRiftへ${contentLabel}を送信しています`,
    detail: `${prepared.files.length}個のファイルを送信します。`,
    percent: 40,
    cancelSafe: false,
  });

  const client = new XriftClient({ token: request.token });
  let destinationId = request.kind === "item" ? request.itemId : request.worldId;
  let createdRemotely = false;
  let transferringFiles = false;

  try {
    // Resolve the target separately so a rejection after creation is not
    // mistaken for a harmless auth failure and retried as another new work.
    if (!destinationId) {
      const created = request.kind === "item" ? await client.items.create() : await client.worlds.create();
      createdRemotely = true;
      destinationId = created.id;
      if (!destinationId?.trim()) throw new Error("XRiftから新しい公開先のIDを取得できませんでした。");
      await request.onRemoteCreated?.(destinationId);
    }
    const commonOptions = {
      name: prepared.config.name,
      description: prepared.config.description,
      thumbnailPath: request.thumbnail ? prepared.config.thumbnailPath : undefined,
      permissions: resolveWebRuntimePermissions(prepared.config.permissions),
      onProgress: (progress: { currentFile: string; completed: number; total: number }) => {
        transferringFiles = true;
        request.report({
          stage: "uploading",
          label: `XRiftへ${contentLabel}を送信しています`,
          detail: progress.currentFile,
          percent:
            40 +
            Math.round((progress.completed / Math.max(1, progress.total)) * 55),
          cancelSafe: false,
        });
      },
    };
    const result = prepared.config.type === "item"
      ? await client.items.upload(prepared.files, { ...commonOptions, itemId: destinationId })
      : await client.worlds.upload(prepared.files, {
        ...commonOptions, worldId: destinationId,
        physics: prepared.config.physics, camera: prepared.config.camera,
        outputBufferType: prepared.config.outputBufferType, items: prepared.config.items,
      });
    const id = "itemId" in result ? result.itemId : result.worldId;

    request.report({
      stage: "processing",
      label: "XRiftから結果を受け取っています",
      percent: 98,
      cancelSafe: false,
    });

    return {
      ...(request.kind === "item" ? { itemId: id } : { worldId: id }),
      contentId: id,
      versionId: result.versionId,
      versionNumber: result.versionNumber,
      contentHash: result.contentHash,
      uploadedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof XriftAuthError ||
      (error instanceof XriftApiError && (error.statusCode === 401 || error.statusCode === 403))) {
      if (!createdRemotely && !transferringFiles) {
        throw new WebUploadRejectedError(describeSdkError(error, request.kind, request.token));
      }
    }
    const target = destinationId ? ` ${contentLabel}ID: ${destinationId}` : "";
    throw new Error(`${describeSdkError(error, request.kind, request.token)}${target}`);
  }
}

/** A definitive 401/403 before creation or file transfer is safe to retry. */
export class WebUploadRejectedError extends Error {
  readonly retrySafe = true;
  constructor(message: string) {
    super(message);
    this.name = "WebUploadRejectedError";
  }
}

/** Turns an SDK error into a message that says what to do next. */
export function describeSdkError(error: unknown, kind: ProjectKind = "world", knownToken?: string): string {
  const label = kind === "item" ? "アイテム" : "ワールド";
  const scope = kind === "item" ? "write:items" : "write:worlds";
  if (error instanceof XriftAuthError) {
    return `APIキーが受け付けられませんでした。設定画面で有効なキーと${scope}権限を確認してください。`;
  }
  if (error instanceof XriftApiError) {
    // 403 from a scoped API key means the key was issued without the write
    // scope, which is fixed by reissuing it rather than by retrying.
    if (error.statusCode === 403) {
      return `このトークンには${label}を公開する権限がありません (${redactToken(error.message, knownToken)})。APIキーを使う場合は${scope}スコープを付けて発行し直してください。`;
    }
    return `XRiftがアップロードを拒否しました (${error.statusCode}): ${redactToken(error.message, knownToken)}`;
  }
  if (error instanceof XriftNetworkError) {
    // The SDK raises this when fetch itself failed, which the browser reports
    // as a bare "Failed to fetch" with no status, headers, or body. Nothing
    // available to this code can tell an unreachable host from a response the
    // browser refused to expose, so name both possibilities rather than
    // asserting one. The devtools console does carry the real reason.
    return `XRiftへ送信できませんでした: ${redactToken(error.message, knownToken)}。ネットワーク接続、またはブラウザがレスポンスを読み取れているか (CORS)を確認してください。詳しい理由はブラウザの開発者ツールのコンソールに表示されます。`;
  }
  if (error instanceof Error) return redactToken(error.message, knownToken);
  return redactToken(String(error), knownToken);
}

/** An API error body can echo the request, so never show it verbatim. */
export function redactToken(value: string, knownToken?: string): string {
  // Compatible bearer tokens do not necessarily use XRift's known prefixes.
  const sanitized = knownToken ? value.split(knownToken).join("[REDACTED]") : value;
  return sanitized
    .replace(/\bxrf_[A-Za-z0-9._-]+/g, "xrf_[REDACTED]")
    .replace(/\bxrift_sk_[A-Za-z0-9._-]+/g, "xrift_sk_[REDACTED]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(
      /([?&](?:X-Goog-Signature|X-Amz-Signature|Signature|token)=)[^&\s]+/gi,
      "$1[REDACTED]",
    );
}
