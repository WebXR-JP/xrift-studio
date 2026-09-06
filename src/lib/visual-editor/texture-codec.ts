import {
  resolveTargetSize,
  type TextureConversion,
} from "./texture-conversion";
import type { TextureEncodeRequest } from "./texture-encoder.worker";

// Bound peak WASM memory even when multiple import/export callers overlap.
let encodingQueue: Promise<unknown> = Promise.resolve();

/**
 * Textureのバイト列を実際に作り直す処理をまとめる。
 *
 * Canvasとktx2-encoderしか使わないため、デスクトップの公開でもブラウザの
 * アップロードでも同じコードが動く。Tauri IPCへは依存させない。
 */

export function copyAssetBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", copyAssetBytes(bytes));
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function assetBytesToDataUrl(
  bytes: Uint8Array,
  mimeType: string,
): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("変換結果を保存形式へ変換できませんでした。")),
    );
    reader.addEventListener("error", () =>
      reject(reader.error ?? new Error("変換結果を保存形式へ変換できませんでした。")),
    );
    reader.readAsDataURL(new Blob([copyAssetBytes(bytes)], { type: mimeType }));
  });
}

/** Canvasで縮小と再エンコードをまとめて行う。maxSizeがnullなら解像度は保つ。 */
export async function renderImageBytes(
  bytes: Uint8Array,
  options: {
    maxSize: number | null;
    mimeType: string;
    quality?: number;
    powerOfTwo?: boolean;
  },
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const bitmap = await createImageBitmap(new Blob([copyAssetBytes(bytes)]));
  try {
    const { width, height } = resolveTargetSize(
      bitmap.width,
      bitmap.height,
      options.maxSize,
      options.powerOfTwo === true,
    );
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("画像変換用のCanvasを作成できませんでした。");
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result
            ? resolve(result)
            : reject(new Error("画像の変換結果をエンコードできませんでした。")),
        options.mimeType,
        options.quality,
      );
    });
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
  } finally {
    bitmap.close();
  }
}

export function encodeKtx2(
  bytes: Uint8Array,
  options: { quality: number; generateMipmaps: boolean; srgb: boolean },
): Promise<Uint8Array> {
  const task = encodingQueue.then(() => new Promise<Uint8Array>((resolve, reject) => {
    const worker = new Worker(new URL("./texture-encoder.worker.ts", import.meta.url), { type: "module" });
    const finish = (error?: string, result?: Uint8Array) => {
      clearTimeout(timeout);
      worker.terminate();
      if (error) reject(new Error(error));
      else if (result?.byteLength) resolve(result);
      else reject(new Error("KTX2圧縮の結果が空です。"));
    };
    const timeout = setTimeout(() => finish("KTX2圧縮が時間内に完了しませんでした。最大解像度を下げるか、WEBPを選んで再試行してください。"), 120_000);
    worker.onmessage = (event: MessageEvent<{ bytes?: Uint8Array; error?: string }>) => finish(event.data.error, event.data.bytes);
    worker.onerror = (event) => {
      event.preventDefault();
      finish(event.message || "KTX2圧縮を開始できませんでした。WEBPを選んで再試行してください。");
    };
    worker.onmessageerror = () => finish("KTX2圧縮の結果を受け取れませんでした。");
    try {
      const request: TextureEncodeRequest = { bytes: copyAssetBytes(bytes), options };
      worker.postMessage(request, [request.bytes.buffer]);
    } catch (error) {
      finish(error instanceof Error ? error.message : String(error));
    }
  }));
  encodingQueue = task.catch(() => undefined);
  return task;
}

/**
 * 計画した変換を、原本のバイト列へそのまま適用する。
 *
 * 原本ファイルには触れないので、公開・アップロード・書き出しのどの経路からでも
 * 「制作データはそのまま、配るものだけ軽くする」形で呼べる。
 */
export async function convertTextureBytes(
  sourceBytes: Uint8Array,
  conversion: TextureConversion,
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  // KTX2はBasis圧縮の前段なので、中間画像は可逆のPNGで渡して二重の劣化を避ける。
  const rendered = await renderImageBytes(sourceBytes, {
    maxSize: conversion.maxSize,
    powerOfTwo: conversion.powerOfTwo,
    mimeType: conversion.outputFormat === "ktx2" ? "image/png" : conversion.mimeType,
    quality:
      conversion.qualityApplies && conversion.outputFormat !== "ktx2"
        ? conversion.quality / 100
        : undefined,
  });
  if (conversion.outputFormat !== "ktx2") return rendered;
  return {
    bytes: await encodeKtx2(rendered.bytes, {
      quality: conversion.quality,
      generateMipmaps: conversion.generateMipmaps,
      srgb: conversion.srgb,
    }),
    width: rendered.width,
    height: rendered.height,
  };
}

/**
 * 出力側でだけ効くTexture変換を、原本のバイト列へ適用する。
 *
 * `conversion` が無いコピーは原本をそのまま配る。公開・アップロード・Classic
 * 書き出しのどれもこの1か所を通すので、経路によって配られる画像が変わらない。
 */
export async function convertPublishedTextureBytes(
  sourceBytes: Uint8Array,
  conversion: TextureConversion | undefined,
): Promise<Uint8Array> {
  if (!conversion) return sourceBytes;
  return (await convertTextureBytes(sourceBytes, conversion)).bytes;
}
