import catalog from "./visual-editor/transparent-textures.manifest.json";
import { createAssetImportTransactionId } from "./visual-editor/asset-import-transaction";
import type { ExternalStoreAsset, ExternalStoreAssetOptions, ExternalStoreInstallRequest, ExternalStoreInstallResult, VisualAssetImportWrite } from "./tauri";

export const TRANSPARENT_TEXTURES_PROVIDER_ID = "xrift-transparent-textures";
export const TRANSPARENT_TEXTURES_CATEGORIES = [...new Set(catalog.map(entry => entry.category))];
const SOURCE = "https://github.com/WebXR-JP/xrift-studio/tree/main/public/visual-editor/transparent-textures/v1";
export function transparentTextureUrl(id: string): string {
  if (!catalog.some(entry => entry.id === id)) throw new Error("透過画像が見つかりません。カタログから選び直してください。");
  return `${import.meta.env.BASE_URL}visual-editor/transparent-textures/v1/${id}.png`;
}
function definition(id: string) {
  const entry = catalog.find(entry => entry.id === id);
  if (!entry) throw new Error("透過画像が見つかりません。カタログから選び直してください。");
  return entry;
}
export async function listTransparentTextureAssets(): Promise<ExternalStoreAsset[]> {
  return catalog.map(entry => ({ providerId: TRANSPARENT_TEXTURES_PROVIDER_ID, externalId: entry.id,
    name: entry.name, description: entry.description, category: entry.category, tags: [...entry.tags],
    thumbnailUrl: transparentTextureUrl(entry.id), assetKind: "texture", maxResolution: [entry.width, entry.height],
    downloadCount: 0, authors: ["XRift Studio contributors / AI生成"], assetUrl: `${SOURCE}/${entry.id}.png`,
    licenseName: "MIT", licenseUrl: `${SOURCE}/LICENSE.txt` }));
}
export async function getTransparentTextureOptions(id: string): Promise<ExternalStoreAssetOptions> {
  const entry = definition(id);
  return { providerId: TRANSPARENT_TEXTURES_PROVIDER_ID, externalId: id, assetKind: "texture",
    resolutions: [{ id: "original", label: `${entry.width} × ${entry.height}・透過PNG`, byteLength: entry.byteLength, fileCount: 1, formats: [] }] };
}
export async function installTransparentTexture(projectPath: string, request: ExternalStoreInstallRequest,
  commit: (projectPath: string, transactionId: string, writes: VisualAssetImportWrite[]) => Promise<void>,
): Promise<ExternalStoreInstallResult> {
  if (request.providerId !== TRANSPARENT_TEXTURES_PROVIDER_ID || request.resolution !== "original" || request.format) throw new Error("透過画像の取り込み設定が不正です。原寸PNGを選び直してください。");
  const entry = definition(request.externalId);
  const response = await fetch(transparentTextureUrl(entry.id), { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error("同梱の透過画像を読み込めませんでした。もう一度追加してください。");
  const bytes = await response.arrayBuffer();
  const view = new Uint8Array(bytes);
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(byte => byte.toString(16).padStart(2, "0")).join("");
  if (bytes.byteLength !== entry.byteLength || hash !== entry.sha256 || ![137,80,78,71,13,10,26,10].every((byte, index) => view[index] === byte)) throw new Error("透過画像が同梱データと一致しません。アプリを更新して再試行してください。");
  const relativePath = `assets/imported/transparent-textures/${entry.id}-${entry.sha256}.png`;
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("透過画像を保存用に変換できませんでした"));
    reader.onerror = () => reject(reader.error ?? new Error("透過画像を読み取れませんでした"));
    reader.readAsDataURL(new Blob([bytes], { type: "image/png" }));
  });
  const licenseResponse = await fetch(`${import.meta.env.BASE_URL}visual-editor/transparent-textures/v1/LICENSE.txt`, { signal: AbortSignal.timeout(30_000) });
  if (!licenseResponse.ok) throw new Error("透過画像の利用条件を読み込めませんでした。もう一度追加してください。");
  const license = await licenseResponse.text();
  if (!license.startsWith("MIT License")) throw new Error("透過画像の利用条件を確認できませんでした");
  const licenseUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("利用条件を保存できませんでした"));
    reader.onerror = () => reject(reader.error);reader.readAsDataURL(new Blob([license], { type: "text/plain;charset=utf-8" }));
  });
  await commit(projectPath, createAssetImportTransactionId(TRANSPARENT_TEXTURES_PROVIDER_ID), [{ relativePath, dataUrl }, { relativePath: "assets/imported/transparent-textures/LICENSE.txt", dataUrl: licenseUrl }]);
  return { providerId: TRANSPARENT_TEXTURES_PROVIDER_ID, providerName: "透過画像", externalId: entry.id, name: entry.name,
    assetKind: "texture", resolution: "original", files: [{ role: "base-color", relativePath, byteLength: entry.byteLength, sha256: entry.sha256, format: "png" }],
    authors: ["XRift Studio contributors / AI生成"], assetUrl: `${SOURCE}/${entry.id}.png`, licenseName: "MIT", licenseUrl: `${SOURCE}/LICENSE.txt` };
}
