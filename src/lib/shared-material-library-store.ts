import { createAssetImportTransactionId } from "./visual-editor/asset-import-transaction";
import { hasGlbContainerHeader, readGlbResponse } from "./glb-container";
import type { ExternalStoreAsset, ExternalStoreAssetOptions, ExternalStoreInstallRequest, ExternalStoreInstallResult, VisualAssetImportWrite } from "./tauri";

export const SHARED_MATERIAL_LIBRARY_PROVIDER_ID = "shared-material-library";
const ROOT = "https://shared-material-library.kkkkkkasdad.chatgpt.site";
const MAX_BYTES = 128 * 1024 * 1024;
type RecordValue = Record<string, unknown>;
type FileSpec = { filename: string; url: string; format: "glb" | "png"; size: number | null; sha256: string | null; animated: boolean; dataMap: boolean };
function record(value: unknown): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("素材庫の応答形式が不正です");
  return value as RecordValue;
}
function id(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new Error("素材庫の素材IDが不正です");
  return value;
}
function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("素材庫の件数・容量が不正です");
  return value;
}
function string(value: unknown, fallback = ""): string { return typeof value === "string" ? value : fallback; }
export function sharedLibraryUrl(value: unknown): string {
  const url = new URL(string(value));
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash
    || !/^shared-material-library(?:-[0-9]{2})?\.kkkkkkasdad\.chatgpt\.site$/.test(url.hostname)
    || !/^\/api\/v1\/download\/[A-Za-z0-9_.-]+\.(?:glb|png)$/.test(url.pathname)
    || !/^(?:\?v=[a-f0-9]+)?$/.test(url.search)) throw new Error("素材庫のURLが許可された配布先ではありません");
  return url.href;
}
async function read(response: Response, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.ok) throw new Error(`素材庫を取得できませんでした (${response.status})。再試行してください。`);
  if (!response.body || Number(response.headers.get("content-length")) > limit) throw new Error("素材庫の応答が大きすぎます");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("素材庫の応答が大きすぎます");
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
function fetchResponse(url: string, timeout = 30_000): Promise<Response> {
  return fetch(url, { mode: "cors", credentials: "omit", redirect: "error", signal: AbortSignal.timeout(timeout) });
}
async function json(path: string): Promise<RecordValue> {
  return record(JSON.parse(new TextDecoder().decode(await read(await fetchResponse(`${ROOT}/api/v1${path}`), 8 * 1024 * 1024))));
}
function files(value: unknown, kind: ExternalStoreAsset["assetKind"]): FileSpec[] {
  if (!Array.isArray(value)) throw new Error("素材庫のファイル一覧がありません");
  const result: FileSpec[] = [];
  for (const entry of value) {
    const file = record(entry);
    const format = string(file.format).toLowerCase();
    if (file.available !== true || !file.url || format !== (kind === "model" ? "glb" : "png")) continue;
    const filename = string(file.filename);
    if (!/^[A-Za-z0-9_-]+\.(?:glb|png)$/.test(filename)) throw new Error("素材庫のファイル名が不正です");
    const url = sharedLibraryUrl(file.url);
    if (new URL(url).pathname !== `/api/v1/download/${filename}` || !filename.endsWith(`.${format}`)) throw new Error("素材庫のファイル名とURLが一致しません");
    const size = file.size == null ? null : integer(file.size);
    if (size !== null && (size === 0 || (format !== "glb" && size > MAX_BYTES))) throw new Error("素材は128 MiB以下にしてください");
    const sha256 = file.sha256 == null ? null : string(file.sha256);
    if (sha256 !== null && !/^[a-f0-9]{64}$/.test(sha256)) throw new Error("素材庫のハッシュが不正です");
    if (result.some((item) => item.filename === filename)) throw new Error("素材庫のファイル名が重複しています");
    result.push({ filename, url, format: format as FileSpec["format"], size, sha256, animated: file.animated === true, dataMap: file.role === "mask" || (typeof file.map_type === "string" && !["basecolor", "base_color", "diffuse", "emissive"].includes(file.map_type)) });
  }
  return result;
}
function asset(value: unknown): ExternalStoreAsset {
  const item = record(value);
  const externalId = id(item.id);
  if (!["model", "texture", "mask"].includes(string(item.type))) throw new Error("素材庫の素材の種類が不正です");
  const license = item.license && typeof item.license === "object" ? record(item.license) : {};
  return {
    providerId: SHARED_MATERIAL_LIBRARY_PROVIDER_ID, externalId, name: string(item.name, externalId),
    description: string(item.description, item.metadata ? string(record(item.metadata).description) : ""), category: string(item.category),
    tags: [string(item.type), ...(Array.isArray(item.animations) ? item.animations.filter((x): x is string => typeof x === "string") : [])],
    thumbnailUrl: item.thumbnail ? sharedLibraryUrl(item.thumbnail) : "", assetKind: item.type === "model" ? "model" : "texture",
    downloadCount: 0, authors: [], assetUrl: `${ROOT}/api/v1/assets/${externalId}`,
    licenseName: typeof item.license === "string" ? item.license : string(license.name, string(license.id, "未指定")),
    licenseUrl: string(license.url),
  };
}
let cached: { expires: number; assets: ExternalStoreAsset[] } | undefined;
let loading: Promise<ExternalStoreAsset[]> | undefined;
/** The dialog searches locally; cache the paginated catalog for the API's five-minute TTL. */
export async function listSharedLibraryAssets(): Promise<ExternalStoreAsset[]> {
  if (cached && cached.expires > Date.now()) return cached.assets;
  if (loading) return loading;
  loading = (async () => {
    const assets: ExternalStoreAsset[] = [];
    const ids = new Set<string>();
    let total: number | undefined;
    for (let page = 1; page <= 500; page++) {
      const data = await json(`/assets?available=true&limit=100&page=${page}`);
      const count = integer(data.total);
      if (count > 50_000 || (total !== undefined && total !== count) || data.page !== page || data.limit !== 100
        || !Array.isArray(data.items) || data.items.length > 100 || integer(data.pages) !== Math.ceil(count / 100)) throw new Error("素材庫のページ情報が変わりました。再試行してください。");
      total = count;
      for (const item of data.items) {
        const mapped = asset(item);
        if (ids.has(mapped.externalId)) throw new Error("素材庫の素材IDが重複しています。再試行してください。");
        ids.add(mapped.externalId);
        if (files(record(item).files, mapped.assetKind).length) assets.push(mapped);
      }
      if (page >= integer(data.pages)) {
        if (ids.size !== total) throw new Error("素材庫の一覧が途中で終了しました。再試行してください。");
        cached = { expires: Date.now() + 300_000, assets };
        return assets;
      }
      if (!data.items.length) break;
    }
    throw new Error("素材庫の一覧を取得できませんでした。再試行してください。");
  })();
  try { return await loading; } finally { loading = undefined; }
}
async function detail(externalId: string) {
  const externalIdSafe = id(externalId);
  const info = await json(`/assets/${externalIdSafe}`);
  if (info.id !== externalIdSafe) throw new Error("素材庫の素材IDが一致しません");
  const metadata = asset(info);
  const response = await json(`/files/${externalIdSafe}`);
  if (response.id !== externalIdSafe) throw new Error("素材庫のファイル一覧のIDが一致しません");
  return { metadata, specs: files(response.files, metadata.assetKind) };
}
export async function getSharedLibraryAssetOptions(externalId: string): Promise<ExternalStoreAssetOptions> {
  const { metadata, specs } = await detail(externalId);
  return { providerId: SHARED_MATERIAL_LIBRARY_PROVIDER_ID, externalId: metadata.externalId, assetKind: metadata.assetKind,
    resolutions: specs.map((file) => ({ id: file.filename, label: `${file.filename}${file.animated ? "（アニメーションあり）" : ""}`, byteLength: file.size ?? 0, fileCount: 1, formats: [] })) };
}
export async function installSharedLibraryAsset(projectPath: string, request: ExternalStoreInstallRequest,
  commit: (projectPath: string, transactionId: string, writes: VisualAssetImportWrite[]) => Promise<void>,
): Promise<ExternalStoreInstallResult> {
  if (request.providerId !== SHARED_MATERIAL_LIBRARY_PROVIDER_ID || request.format) throw new Error("素材庫の取り込み設定が不正です");
  const { metadata, specs } = await detail(request.externalId);
  const spec = specs.find((file) => file.filename === request.resolution);
  if (!spec) throw new Error("選択した素材庫のファイルは配信されていません。選び直してください。");
  const response = await fetchResponse(spec.url, 120_000);
  const bytes = spec.format === "glb" ? await readGlbResponse(response, "ダウンロードした素材の形式が不正です") : await read(response, MAX_BYTES);
  if (spec.size !== null && spec.size !== bytes.byteLength) throw new Error("素材の容量が配布情報と一致しません");
  if (spec.format === "glb" ? !hasGlbContainerHeader(bytes)
    : bytes.length < 24 || ![137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)) throw new Error("ダウンロードした素材の形式が不正です");
  const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.buffer))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (spec.sha256 !== null && spec.sha256 !== sha256) throw new Error("素材のハッシュが配布情報と一致しません");
  const relativePath = `assets/imported/external/${SHARED_MATERIAL_LIBRARY_PROVIDER_ID}/${metadata.externalId}/${spec.filename.slice(0, -4)}.${sha256}.${spec.format}`;
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("素材を保存用に変換できませんでした"));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(new Blob([bytes], { type: spec.format === "glb" ? "model/gltf-binary" : "image/png" }));
  });
  await commit(projectPath, createAssetImportTransactionId(SHARED_MATERIAL_LIBRARY_PROVIDER_ID), [{ relativePath, dataUrl }]);
  return { providerId: SHARED_MATERIAL_LIBRARY_PROVIDER_ID, providerName: "素材庫", externalId: spec.filename.slice(0, -4),
    name: spec.animated ? `${metadata.name}（アニメーションあり）` : metadata.assetKind === "texture" ? `${metadata.name} · ${spec.filename}` : metadata.name, assetKind: metadata.assetKind, resolution: spec.filename,
    files: [{ role: metadata.assetKind === "model" ? "model" : (metadata.tags.includes("mask") || spec.dataMap) ? "mask" : "base-color", relativePath, byteLength: bytes.length, sha256, format: spec.format }],
    authors: metadata.authors, assetUrl: metadata.assetUrl, licenseName: metadata.licenseName, licenseUrl: metadata.licenseUrl };
}
