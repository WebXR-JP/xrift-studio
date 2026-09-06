import { encodeToKTX2 } from "ktx2-encoder";
import { ktx2QualityLevel } from "./texture-conversion";

export type TextureEncodeRequest = {
  bytes: Uint8Array<ArrayBuffer>;
  options: { quality: number; generateMipmaps: boolean; srgb: boolean };
};

// One request per worker. The caller terminates it to release the WASM heap.
self.onmessage = async ({ data }: MessageEvent<TextureEncodeRequest>) => {
  try {
    const { bytes, options } = data;
    const encoded = await encodeToKTX2(bytes, {
      isUASTC: false,
      qualityLevel: ktx2QualityLevel(options.quality),
      compressionLevel: 2,
      generateMipmap: options.generateMipmaps,
      isPerceptual: options.srgb,
      isSetKTX2SRGBTransferFunc: options.srgb,
      isKTX2File: true,
      // Avoid allocating a second WebGL context just to decode an image.
      imageDecoder: async (buffer: Uint8Array) => {
        const bitmap = await createImageBitmap(new Blob([new Uint8Array(buffer)]));
        try {
          const { width, height } = bitmap;
          const canvas = new OffscreenCanvas(width, height);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("画像変換用のCanvasを作成できませんでした。");
          context.drawImage(bitmap, 0, 0);
          return { data: new Uint8Array(context.getImageData(0, 0, width, height).data.buffer), width, height };
        } finally {
          bitmap.close();
        }
      },
    });
    const result = new Uint8Array(encoded);
    if (!result.byteLength) throw new Error("KTX2圧縮の結果が空です。最大解像度を下げて再試行してください。");
    self.postMessage({ bytes: result }, { transfer: [result.buffer] });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
