import { commitBrowserAssetImport } from "./browser-project-storage";
import { createAssetImportTransactionId } from "./visual-editor/asset-import-transaction";
import type {
  ExternalStoreAsset,
  ExternalStoreAssetOptions,
  ExternalStoreInstallRequest,
  ExternalStoreInstallResult,
} from "./tauri";

const API_ROOT = "https://yushimatenjin.github.io/sound-generator/api/v1";
const SITE_ROOT = "https://yushimatenjin.github.io/sound-generator";
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const MAX_AUDIO_BYTES = 128 * 1024 * 1024;

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function string(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function assetId(value: string): string {
  const id = value.trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw new Error("音蔵のアセットIDが不正です");
  }
  return id;
}

async function fetchJson(path: string): Promise<JsonRecord> {
  const response = await fetch(`${API_ROOT}${path}`, {
    credentials: "omit",
    mode: "cors",
    redirect: "error",
  });
  if (!response.ok) throw new Error(`音蔵APIがエラーを返しました (${response.status})`);
  const declaredSize = Number(response.headers.get("content-length"));
  if (declaredSize > MAX_JSON_BYTES) throw new Error("音蔵の応答が大きすぎます");
  const body = await response.text();
  if (body.length > MAX_JSON_BYTES) throw new Error("音蔵の応答が大きすぎます");
  const parsed: unknown = JSON.parse(body);
  const data = record(parsed);
  if (!data) throw new Error("音蔵の応答形式が不正です");
  return data;
}

function catalogAsset(id: string, value: JsonRecord): ExternalStoreAsset {
  const authors = record(value.authors);
  return {
    providerId: "otogura",
    externalId: id,
    name: string(value.name, id),
    description: string(value.description),
    category: strings(value.categories)[0] ?? "",
    tags: strings(value.tags),
    thumbnailUrl: `${API_ROOT}/thumb/${id}.png`,
    assetKind: "audio",
    maxResolution: null,
    polycount: null,
    dimensionsMm: null,
    downloadCount: typeof value.download_count === "number" ? value.download_count : 0,
    authors: authors ? Object.keys(authors) : ["音蔵"],
    assetUrl: `${API_ROOT}/thumb/${id}.png`,
    licenseName: string(value.license, "Free to use"),
    licenseUrl: string(value.license_url),
  };
}

export async function listBrowserOtoguraAssets(): Promise<ExternalStoreAsset[]> {
  const catalog = await fetchJson("/assets.json");
  return Object.entries(catalog)
    .filter(([id, value]) => /^[A-Za-z0-9_-]{1,128}$/.test(id) && record(value))
    .map(([id, value]) => catalogAsset(id, record(value)!))
    .sort((a, b) => a.name.localeCompare(b.name));
}

type AudioSpec = { url: string; size: number };

async function audioSpec(id: string): Promise<AudioSpec> {
  const file = await fetchJson(`/files/${id}.json`);
  const src = record(record(file.audio)?.src);
  const ogg = record(src?.ogg);
  const url = string(ogg?.url);
  const size = ogg?.size;
  const expectedPaths = [
    `/sound-generator/processed/medium/${id}.ogg`,
    `/sound-generator/music/${id}.ogg`,
  ];
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("音蔵のダウンロードURLが不正です");
  }
  if (
    parsed.origin !== "https://yushimatenjin.github.io" ||
    !expectedPaths.includes(parsed.pathname) ||
    parsed.search || parsed.hash ||
    parsed.username || parsed.password
  ) {
    throw new Error("音蔵のダウンロードURLが許可された配布先ではありません");
  }
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 1 || size > MAX_AUDIO_BYTES) {
    throw new Error("音蔵の音源サイズが許可範囲外です");
  }
  return { url: parsed.href, size };
}

export async function getBrowserOtoguraAssetOptions(
  externalId: string,
): Promise<ExternalStoreAssetOptions> {
  const id = assetId(externalId);
  const spec = await audioSpec(id);
  return {
    providerId: "otogura",
    externalId: id,
    assetKind: "audio",
    resolutions: [{
      id: "src",
      label: "OGG",
      byteLength: spec.size,
      fileCount: 1,
      formats: [],
    }],
  };
}

async function readAudio(response: Response): Promise<Uint8Array<ArrayBuffer>> {
  const declaredSize = Number(response.headers.get("content-length"));
  if (declaredSize > MAX_AUDIO_BYTES) throw new Error("音源が128 MiBを超えています");
  if (!response.body) throw new Error("音源を読み取れませんでした");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_AUDIO_BYTES) throw new Error("音源が128 MiBを超えています");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (bytes.byteLength < 32 || String.fromCharCode(...bytes.subarray(0, 4)) !== "OggS") {
    throw new Error("ダウンロードした音源がOGG形式ではありません");
  }
  return bytes;
}

function dataUrl(bytes: Uint8Array): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error("音源を保存用に変換できませんでした"));
    reader.onerror = () => reject(reader.error ?? new Error("音源を保存用に変換できませんでした"));
    reader.readAsDataURL(new Blob([new Uint8Array(bytes)], { type: "audio/ogg" }));
  });
}

export async function installBrowserOtoguraAsset(
  projectPath: string,
  request: ExternalStoreInstallRequest,
): Promise<ExternalStoreInstallResult> {
  const id = assetId(request.externalId);
  if (request.providerId !== "otogura" || request.resolution !== "src" || request.format) {
    throw new Error("音蔵の取り込み設定が不正です");
  }
  const catalog = await fetchJson("/assets.json");
  const metadata = record(catalog[id]);
  if (!metadata) throw new Error("音蔵にアセットが見つかりません");
  const spec = await audioSpec(id);
  const response = await fetch(spec.url, {
    credentials: "omit",
    mode: "cors",
    redirect: "error",
  });
  if (!response.ok) throw new Error(`音源をダウンロードできませんでした (${response.status})`);
  const bytes = await readAudio(response);
  if (bytes.byteLength !== spec.size) throw new Error("音源のサイズが配布情報と一致しません");
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer);
  const sha256 = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const relativePath = `assets/imported/external/otogura/${id}/${id}.ogg`;
  await commitBrowserAssetImport(projectPath, createAssetImportTransactionId("otogura"), [{
    relativePath,
    dataUrl: await dataUrl(bytes),
  }]);
  const authors = record(metadata.authors);
  return {
    providerId: "otogura",
    providerName: "音蔵",
    externalId: id,
    name: string(metadata.name, id),
    assetKind: "audio",
    resolution: "src",
    files: [{ role: "audio", relativePath, byteLength: bytes.byteLength, sha256, format: "ogg" }],
    authors: authors ? Object.keys(authors) : ["音蔵"],
    assetUrl: `${SITE_ROOT}/`,
    licenseName: string(metadata.license, "Free to use"),
    licenseUrl: string(metadata.license_url),
  };
}
