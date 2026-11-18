import type { LightBakeInput, LightBakeLayoutOptions, PreparedLightBake } from "./bake";
import type {
  LightBakeWorkerPrepared,
  LightBakeWorkerRequest,
  LightBakeWorkerResponse,
} from "./light-bake.worker";
import { BAKE_TEXEL_STRIDE, type BakeSettings } from "./tracer";

/**
 * ライトベイクを複数のWorkerへ配って走らせる。
 *
 * 準備（UV2の生成と配置）は1つのWorkerで行い、テクセルを焼く処理は範囲を
 * 分けて全Workerへ配る。進み具合を返し、途中で止められる。
 */

export type LightBakeProgress = {
  phase: "preparing" | "baking" | "finishing";
  /** 0..1 */
  fraction: number;
  /** 焼くテクセルの総数。準備が終わるまでは0。 */
  texelCount: number;
};

export type LightBakeOutput = {
  /** ライトマップ画像（EXR）。 */
  exr: Uint8Array;
  /** UV2データ。 */
  data: Uint8Array;
  size: number;
  texelsPerMeter: number;
  stats: PreparedLightBake["stats"];
  durationMs: number;
};

export class LightBakeCancelledError extends Error {
  constructor() {
    super("ライトベイクを中止しました。");
    this.name = "LightBakeCancelledError";
  }
}

export class LightBakeFailedError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "LightBakeFailedError";
  }
}

/** 1回の依頼で焼くテクセル数。小さいほど進み具合が細かく出て、中止も早く効く。 */
const BATCH_TEXELS = 2048;

function workerCountFor(triangleCount: number): number {
  const cores =
    typeof navigator !== "undefined" && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 4;
  // 画面の描画に1コア残す。SceneはWorkerごとに写しを持つので、三角形が多い
  // ときはメモリを優先してWorkerを減らす。
  const byCores = Math.max(1, Math.min(8, cores - 1));
  const byMemory = triangleCount > 2_000_000 ? 2 : triangleCount > 500_000 ? 4 : 8;
  return Math.min(byCores, byMemory);
}

export function startLightBake(
  input: LightBakeInput,
  options: {
    layout: LightBakeLayoutOptions;
    settings: BakeSettings;
    denoise: boolean;
  },
  onProgress: (progress: LightBakeProgress) => void,
): { promise: Promise<LightBakeOutput>; cancel(): void } {
  const workers: Worker[] = [];
  let cancelled = false;
  let rejectRun: ((error: Error) => void) | null = null;
  const createWorker = () => {
    const worker = new Worker(new URL("./light-bake.worker.ts", import.meta.url), {
      type: "module",
    });
    workers.push(worker);
    return worker;
  };
  const terminate = () => {
    for (const worker of workers) worker.terminate();
    workers.length = 0;
  };

  /** Workerへ依頼を一つ送り、対応する返事を待つ。 */
  const request = <Type extends LightBakeWorkerResponse["type"]>(
    worker: Worker,
    message: LightBakeWorkerRequest,
    expected: Type,
    transfer: Transferable[] = [],
  ) =>
    new Promise<Extract<LightBakeWorkerResponse, { type: Type }>>((resolve, reject) => {
      const onMessage = ({ data }: MessageEvent<LightBakeWorkerResponse>) => {
        if (data.type === "error") {
          cleanup();
          reject(new LightBakeFailedError(data.code, data.message));
        } else if (data.type === expected) {
          cleanup();
          resolve(data as Extract<LightBakeWorkerResponse, { type: Type }>);
        }
      };
      const onError = (event: ErrorEvent) => {
        cleanup();
        reject(new LightBakeFailedError("worker", event.message || "ライトベイクの処理が止まりました。"));
      };
      const cleanup = () => {
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
      };
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
      worker.postMessage(message, transfer);
    });

  const run = async (): Promise<LightBakeOutput> => {
    const started = performance.now();
    onProgress({ phase: "preparing", fraction: 0, texelCount: 0 });
    const first = createWorker();
    const { prepared } = await request(
      first,
      { type: "prepare", input, layout: options.layout },
      "prepared",
    );
    if (cancelled) throw new LightBakeCancelledError();
    const texelCount = prepared.raster.texels.length;

    const count = Math.min(
      workerCountFor(prepared.stats.triangleCount),
      Math.max(1, Math.ceil(texelCount / BATCH_TEXELS)),
    );
    while (workers.length < count) createWorker();
    await Promise.all(
      workers.map((worker) =>
        request(
          worker,
          {
            type: "init",
            scene: prepared.scene,
            raster: prepared.raster,
            settings: options.settings,
          },
          "ready",
        ),
      ),
    );
    if (cancelled) throw new LightBakeCancelledError();

    const baked = new Float32Array(texelCount * BAKE_TEXEL_STRIDE);
    let next = 0;
    let done = 0;
    let batchId = 0;
    onProgress({ phase: "baking", fraction: 0, texelCount });
    // 各Workerが、手が空くたびに次の範囲を取りに来る。速いWorkerほど多く焼く。
    const drain = async (worker: Worker): Promise<void> => {
      while (next < texelCount) {
        if (cancelled) throw new LightBakeCancelledError();
        const from = next;
        const to = Math.min(texelCount, from + BATCH_TEXELS);
        next = to;
        const result = await request(
          worker,
          { type: "bake", id: batchId++, from, to },
          "baked",
        );
        baked.set(result.data, from * BAKE_TEXEL_STRIDE);
        done += to - from;
        onProgress({ phase: "baking", fraction: done / texelCount, texelCount });
      }
    };
    await Promise.all(workers.map(drain));
    if (cancelled) throw new LightBakeCancelledError();

    onProgress({ phase: "finishing", fraction: 1, texelCount });
    const finished = await request(
      first,
      { type: "finish", baked, denoise: options.denoise },
      "finished",
      [baked.buffer],
    );
    return {
      exr: finished.exr,
      data: (prepared as LightBakeWorkerPrepared).data,
      size: finished.size,
      texelsPerMeter: prepared.texelsPerMeter,
      stats: prepared.stats,
      durationMs: performance.now() - started,
    };
  };

  const promise = new Promise<LightBakeOutput>((resolve, reject) => {
    rejectRun = reject;
    run().then(resolve, reject);
  }).finally(terminate);

  return {
    promise,
    cancel() {
      if (cancelled) return;
      cancelled = true;
      // 焼いている途中のWorkerは返事を待たずに止める。
      terminate();
      rejectRun?.(new LightBakeCancelledError());
    },
  };
}
