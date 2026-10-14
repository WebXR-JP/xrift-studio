import { createAssetImportTransactionId } from "./visual-editor/asset-import-transaction";
import { hasGlbContainerHeader, readGlbResponse } from "./glb-container";
import type {
  ExternalStoreAsset,
  ExternalStoreAssetOptions,
  ExternalStoreInstallRequest,
  ExternalStoreInstallResult,
  VisualAssetImportWrite,
} from "./tauri";

export const AI_LOWPOLY_PROPS_PROVIDER_ID = "ai-lowpoly-props";
const SITE_ROOT = "https://apps.n-jelly.com/ai-lowpoly-props";
const API_ROOT = `${SITE_ROOT}/api/v1`;
const LICENSE_URL = "https://creativecommons.org/publicdomain/zero/1.0/";
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const MAX_CATALOG_ASSETS = 50_000;

type JsonRecord = Record<string, unknown>;
type FileSpec = { url: string; size: number | null; sha256: string | null };
type CommitImport = (
  projectPath: string,
  transactionId: string,
  writes: VisualAssetImportWrite[],
) => Promise<void>;

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("AI LOWPOLY PROPSの応答形式が不正です");
  }
  return value as JsonRecord;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function assetId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new Error("AI LOWPOLY PROPSのモデルIDが不正です");
  }
  return value;
}

function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("AI LOWPOLY PROPSの件数・容量が不正です");
  }
  return value;
}

function hash(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error("AI LOWPOLY PROPSのハッシュが不正です");
  }
  return value;
}

async function readBounded(response: Response, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(response.headers.get("content-length")) > limit || !response.body) {
    throw new Error("AI LOWPOLY PROPSのファイル容量が許可範囲外です");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("AI LOWPOLY PROPSのファイル容量が許可範囲外です");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

class CatalogChangedError extends Error {}

async function fetchJson(path: string): Promise<JsonRecord> {
  const response = await fetch(`${API_ROOT}${path}`, {
    credentials: "omit", mode: "cors", redirect: "error", signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 409) throw new CatalogChangedError();
  if (!response.ok) throw new Error(`AI LOWPOLY PROPS APIを取得できませんでした (${response.status})。再試行してください。`);
  return record(JSON.parse(new TextDecoder().decode(await readBounded(response, MAX_JSON_BYTES))));
}

function fileSpec(value: unknown, id: string, folder: "assets" | "previews"): FileSpec {
  const file = record(value);
  if (typeof file.url !== "string") throw new Error("モデルの配布URLがありません");
  const url = new URL(file.url);
  const extension = folder === "assets" ? "glb" : "(?:webp|png|jpe?g)";
  if (
    url.origin !== "https://apps.n-jelly.com" || url.username || url.password || url.search || url.hash
    || !new RegExp(`^/ai-lowpoly-props/${folder}/${id}(?:\\.[a-f0-9]{12,64})?\\.${extension}$`).test(url.pathname)
  ) {
    throw new Error("モデルのURLがAI LOWPOLY PROPSの配布先ではありません");
  }
  const size = file.size === null ? null : integer(file.size);
  if (folder === "assets" && size !== null && size < 20) {
    throw new Error("モデルの容量が不正です");
  }
  return { url: url.href, size, sha256: file.sha256 === null ? null : hash(file.sha256) };
}

function catalogAsset(value: unknown): ExternalStoreAsset {
  const model = record(value);
  const id = assetId(model.id);
  const dimensions = model.dimensions_m;
  const preview = Array.isArray(model.previews) ? model.previews[0] : undefined;
  return {
    providerId: AI_LOWPOLY_PROPS_PROVIDER_ID,
    externalId: id,
    name: typeof model.name_ja === "string" && model.name_ja ? model.name_ja : String(model.name_en ?? id),
    description: typeof model.name_en === "string" ? model.name_en : "",
    category: "ローポリモデル",
    tags: strings(model.tags),
    searchKeywords: [...strings(model.keywords_ja), ...strings(model.keywords_en)],
    thumbnailUrl: preview ? fileSpec(preview, id, "previews").url : "",
    assetKind: "model",
    maxResolution: null,
    polycount: model.triangles === null ? null : integer(model.triangles),
    // The shared metadata uses width/depth/height, matching authored Blender X/Y/Z.
    // Do not swap these axes or transform the downloaded Y-up glTF.
    dimensionsMm: Array.isArray(dimensions) && dimensions.length === 3
      && dimensions.every((item) => typeof item === "number" && Number.isFinite(item) && item >= 0)
      ? dimensions.map((item: number) => item * 1000) as [number, number, number] : null,
    downloadCount: 0,
    authors: ["AI LOWPOLY PROPS"],
    assetUrl: `${SITE_ROOT}/#library`,
    licenseName: "CC0-1.0",
    licenseUrl: LICENSE_URL,
  };
}

/** Load every page before exposing the catalog so local search includes unrevealed models. */
export async function listAiLowpolyPropsAssets(): Promise<ExternalStoreAsset[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const assets: ExternalStoreAsset[] = [];
    const ids = new Set<string>();
    let version: string | undefined;
    let total: number | undefined;
    let offset = 0;
    try {
      while (true) {
        const query = new URLSearchParams({ limit: "100", offset: String(offset), include: "previews,keywords" });
        if (version) query.set("catalog_version", version);
        const page = await fetchJson(`/assets?${query}`);
        const pageVersion = hash(page.catalog_version);
        if (version && pageVersion !== version) throw new CatalogChangedError();
        version = pageVersion;
        const pageTotal = integer(page.total);
        if (pageTotal > MAX_CATALOG_ASSETS || (total !== undefined && total !== pageTotal)
          || integer(page.offset) !== offset || !Array.isArray(page.items) || page.items.length > 100) {
          throw new Error("AI LOWPOLY PROPSのページ情報が不正です");
        }
        total = pageTotal;
        for (const item of page.items) {
          const asset = catalogAsset(item);
          if (ids.has(asset.externalId)) throw new Error("AI LOWPOLY PROPSのモデルIDが重複しています");
          ids.add(asset.externalId);
          assets.push(asset);
        }
        if (page.next_offset === null) {
          if (assets.length !== total) throw new Error("AI LOWPOLY PROPSの一覧が途中で終了しました");
          return assets;
        }
        const next = integer(page.next_offset);
        if (next !== offset + page.items.length || next <= offset || next >= total) {
          throw new Error("AI LOWPOLY PROPSの次ページが不正です");
        }
        offset = next;
      }
    } catch (error) {
      if (!(error instanceof CatalogChangedError)) throw error;
    }
  }
  throw new Error("モデル一覧が更新されました。再試行してください。");
}

async function modelSpec(id: string): Promise<FileSpec> {
  const result = await fetchJson(`/files/${id}`);
  if (result.id !== id) throw new Error("GLBのモデルIDが一致しません");
  const file = Array.isArray(result.files) ? result.files.find((item) => record(item).format === "glb") : undefined;
  if (!file) throw new Error("GLBファイルが見つかりません");
  return fileSpec(file, id, "assets");
}

export async function getAiLowpolyPropsAssetOptions(externalId: string): Promise<ExternalStoreAssetOptions> {
  const id = assetId(externalId);
  const spec = await modelSpec(id);
  return {
    providerId: AI_LOWPOLY_PROPS_PROVIDER_ID, externalId: id, assetKind: "model",
    resolutions: [{ id: "src", label: "GLB（オリジナル）", byteLength: spec.size ?? 0, fileCount: 1, formats: [] }],
  };
}

function dataUrl(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("GLBを保存用に変換できませんでした"));
    reader.onerror = () => reject(reader.error ?? new Error("GLBを保存用に変換できませんでした"));
    reader.readAsDataURL(new Blob([bytes], { type: "model/gltf-binary" }));
  });
}

/** Browser and desktop use the existing atomic import adapter supplied by tauri.ts. */
export async function installAiLowpolyPropsAsset(
  projectPath: string, request: ExternalStoreInstallRequest, commit: CommitImport,
): Promise<ExternalStoreInstallResult> {
  const id = assetId(request.externalId);
  if (request.providerId !== AI_LOWPOLY_PROPS_PROVIDER_ID || request.resolution !== "src" || request.format) {
    throw new Error("AI LOWPOLY PROPSの取り込み設定が不正です");
  }
  const info = await fetchJson(`/info/${id}`);
  if (info.id !== id || record(info.asset_license).id !== "CC0-1.0") {
    throw new Error("モデルのID・CC0ライセンスを確認できませんでした");
  }
  const metadata = catalogAsset(info);
  // Use detail's download so file, license and metadata share one catalog revision.
  const file = Array.isArray(info.downloads) ? info.downloads.find((item) => record(item).format === "glb") : undefined;
  if (!file) throw new Error("GLBファイルが見つかりません");
  const spec = fileSpec(file, id, "assets");
  const response = await fetch(spec.url, {
    credentials: "omit", mode: "cors", redirect: "error", signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`GLBをダウンロードできませんでした (${response.status})`);
  const bytes = await readGlbResponse(response, "ダウンロードしたモデルがGLB形式ではありません");
  if (spec.size !== null && bytes.byteLength !== spec.size) throw new Error("GLBの容量が配布情報と一致しません");
  if (!hasGlbContainerHeader(bytes)) {
    throw new Error("ダウンロードしたモデルがGLB形式ではありません");
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer);
  const sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (spec.sha256 !== null && sha256 !== spec.sha256) throw new Error("GLBのハッシュが配布情報と一致しません");
  const relativePath = `assets/imported/external/${AI_LOWPOLY_PROPS_PROVIDER_ID}/${id}/${id}.${sha256}.glb`;
  await commit(projectPath, createAssetImportTransactionId(AI_LOWPOLY_PROPS_PROVIDER_ID), [{
    relativePath, dataUrl: await dataUrl(bytes),
  }]);
  return {
    providerId: AI_LOWPOLY_PROPS_PROVIDER_ID, providerName: "AI LOWPOLY PROPS", externalId: id,
    name: metadata.name, assetKind: "model", resolution: "src",
    files: [{ role: "model", relativePath, byteLength: bytes.byteLength, sha256, format: "glb" }],
    authors: metadata.authors, assetUrl: metadata.assetUrl, licenseName: "CC0-1.0", licenseUrl: LICENSE_URL,
  };
}

/** Match API's NFKC/case/kana normalization and space/comma-separated AND keywords. */
export function matchesAiLowpolyPropsQuery(asset: ExternalStoreAsset, query: string): boolean {
  const normalize = (value: string) => value.normalize("NFKC").toLowerCase()
    .replace(/[ァ-ヶ]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60));
  const text = normalize([asset.externalId, asset.name, asset.description, ...asset.tags, ...(asset.searchKeywords ?? [])].join(" "));
  return normalize(query).split(/[\s,]+/).filter(Boolean).every((token) => text.includes(token));
}
