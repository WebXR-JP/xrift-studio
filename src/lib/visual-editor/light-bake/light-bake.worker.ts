import { DataTexture, FloatType, LinearSRGBColorSpace, RGBAFormat } from "three";
import { EXRExporter } from "three/examples/jsm/exporters/EXRExporter.js";
import { encodeXriftLightmapData } from "../../../../packages/xrift-studio-runtime/src/lightmap-data";
import {
  bakeLightmapTexels,
  finishLightmap,
  LightBakeError,
  prepareLightBake,
  type LightBakeInput,
  type LightBakeLayoutOptions,
  type PreparedLightBake,
} from "./bake";
import type { AtlasRaster } from "./raster";
import { LightBakeTracer, type BakeScene, type BakeSettings } from "./tracer";

/**
 * ライトベイクをメインスレッドの外で走らせるWorker。
 *
 * 1テクセルに数百本のレイを飛ばす計算を画面と同じスレッドで走らせると、
 * 終わるまでエディターが固まる。Workerを複数立てて範囲を分けて焼く。
 */

export type LightBakeWorkerRaster = Pick<AtlasRaster, "size" | "triangle" | "barycentric" | "texels">;

export type LightBakeWorkerRequest =
  | { type: "prepare"; input: LightBakeInput; layout: LightBakeLayoutOptions }
  | { type: "init"; scene: BakeScene; raster: LightBakeWorkerRaster; settings: BakeSettings }
  | { type: "bake"; id: number; from: number; to: number }
  | { type: "finish"; baked: Float32Array; denoise: boolean };

export type LightBakeWorkerPrepared = {
  scene: BakeScene;
  raster: LightBakeWorkerRaster;
  /** 保存するUV2データ。 */
  data: Uint8Array;
  atlasSize: number;
  texelsPerMeter: number;
  stats: PreparedLightBake["stats"];
};

export type LightBakeWorkerResponse =
  | { type: "prepared"; prepared: LightBakeWorkerPrepared }
  | { type: "ready" }
  | { type: "baked"; id: number; from: number; to: number; data: Float32Array }
  | { type: "finished"; exr: Uint8Array; size: number }
  | { type: "error"; code: string; message: string };

let prepared: PreparedLightBake | null = null;
let tracer: LightBakeTracer | null = null;
let raster: LightBakeWorkerRaster | null = null;

const post = (response: LightBakeWorkerResponse, transfer: Transferable[] = []) => {
  (self as unknown as { postMessage(message: unknown, transfer: Transferable[]): void }).postMessage(
    response,
    transfer,
  );
};

async function handle(request: LightBakeWorkerRequest): Promise<void> {
  if (request.type === "prepare") {
    prepared = prepareLightBake(request.input, request.layout);
    post({
      type: "prepared",
      prepared: {
        scene: prepared.scene,
        raster: {
          size: prepared.raster.size,
          triangle: prepared.raster.triangle,
          barycentric: prepared.raster.barycentric,
          texels: prepared.raster.texels,
        },
        data: encodeXriftLightmapData(prepared.data),
        atlasSize: prepared.atlasSize,
        texelsPerMeter: prepared.texelsPerMeter,
        stats: prepared.stats,
      },
    });
    return;
  }
  if (request.type === "init") {
    raster = request.raster;
    tracer = new LightBakeTracer(request.scene, request.settings);
    post({ type: "ready" });
    return;
  }
  if (request.type === "bake") {
    if (!tracer || !raster) throw new Error("ベイクの準備が終わっていません。");
    const data = bakeLightmapTexels(tracer, raster, request.from, request.to);
    post({ type: "baked", id: request.id, from: request.from, to: request.to, data }, [data.buffer]);
    return;
  }
  if (!prepared) throw new Error("ベイクの準備が終わっていません。");
  const image = finishLightmap(prepared, request.baked, { denoise: request.denoise });
  const size = prepared.raster.size;
  const texture = new DataTexture(image, size, size, RGBAFormat, FloatType);
  texture.colorSpace = LinearSRGBColorSpace;
  // 半精度のEXRにする。負の値と1を超える明るさを、そのまま持てる。
  const exr = await new EXRExporter().parse(texture);
  texture.dispose();
  post({ type: "finished", exr, size }, [exr.buffer]);
}

self.onmessage = ({ data }: MessageEvent<LightBakeWorkerRequest>) => {
  handle(data).catch((error: unknown) => {
    post({
      type: "error",
      code: error instanceof LightBakeError ? error.code : "failed",
      message: error instanceof Error ? error.message : String(error),
    });
  });
};
