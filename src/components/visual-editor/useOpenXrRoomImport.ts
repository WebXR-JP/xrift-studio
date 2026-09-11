import { useCallback, useEffect, useRef, useState } from "react";
import { tauri } from "../../lib/tauri";
import type { PrototypeVisualProject } from "../../lib/visual-editor/prototype-project";
import { applySpatialCaptureModels, type ApplySpatialModelsResult } from "../../lib/visual-editor/value-up/spatial-xr/apply-spatial-models";
import { nativeRoomToCapture } from "../../lib/visual-editor/value-up/spatial-xr/native-room";

export type OpenXrRoomImportPhase = "idle" | "acquiring" | "cancelling" | "saving";

type OpenXrRoomImportJob = {
  requestId: string;
  cancelled: boolean;
  phase: OpenXrRoomImportPhase;
};

type Options = {
  getBundle: () => PrototypeVisualProject;
  canImport: () => boolean;
  getPlayGeneration: () => number;
  save: () => Promise<string | undefined>;
  commit: (result: ApplySpatialModelsResult, message: string) => void;
};

/** Own acquisition through Scene commit, including waits for project/asset saves. */
export function useOpenXrRoomImport(options: Options) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const mounted = useRef(false);
  const active = useRef<OpenXrRoomImportJob | null>(null);
  const [phase, setPhase] = useState<OpenXrRoomImportPhase>("idle");

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const job = active.current;
      if (!job) return;
      job.cancelled = true;
      if (job.phase === "acquiring") {
        void tauri.cancelOpenXrRoomCapture(job.requestId).catch(() => undefined);
      }
    };
  }, []);

  const capture = useCallback(async (): Promise<string> => {
    if (active.current) throw new Error("部屋の取り込みが進行中です。");
    if (!mounted.current || !optionsRef.current.canImport()) {
      throw new Error("Playと素材の取り込みを停止してから部屋を取得してください。");
    }
    const before = optionsRef.current.getBundle();
    const playGeneration = optionsRef.current.getPlayGeneration();
    const job: OpenXrRoomImportJob = {
      requestId: crypto.randomUUID(),
      cancelled: false,
      phase: "acquiring",
    };
    active.current = job;
    setPhase(job.phase);
    const assertCurrent = () => {
      if (!mounted.current || job.cancelled || active.current !== job) {
        throw new Error("部屋の取り込みを取り消しました。");
      }
      if (optionsRef.current.getBundle() !== before
        || optionsRef.current.getPlayGeneration() !== playGeneration
        || !optionsRef.current.canImport()) {
        throw new Error("取り込み中に編集状態が変わりました。編集を保持しました。再取得してください。");
      }
    };
    try {
      const room = await tauri.captureOpenXrRoom(job.requestId);
      assertCurrent();
      const document = nativeRoomToCapture(room);
      job.phase = "saving";
      setPhase(job.phase);
      const path = await optionsRef.current.save();
      assertCurrent();
      if (!path) throw new Error("プロジェクトを保存できませんでした。保存先を確認して再試行してください。");
      const result = await applySpatialCaptureModels(path, before, document, { assertCurrent });
      assertCurrent();
      if (!result.applied.length) throw new Error("配置できる部屋の形状がありませんでした。");
      const warnings = room.warnings.length ? ` ${room.warnings.join(" / ")}` : "";
      const message = `部屋の${result.applied.length}件を配置、${result.skipped.length}件をスキップしました。Hierarchyで選択したEntityの寸法・向き・床位置を確認してください。${warnings}`;
      optionsRef.current.commit(result, message);
      return message;
    } finally {
      if (active.current === job) {
        active.current = null;
        if (mounted.current) setPhase("idle");
      }
    }
  }, []);

  const cancel = useCallback(async () => {
    const job = active.current;
    if (!job || job.phase !== "acquiring") return;
    job.cancelled = true;
    job.phase = "cancelling";
    setPhase(job.phase);
    // Even if the native cancellation fails, this job can no longer commit.
    await tauri.cancelOpenXrRoomCapture(job.requestId);
  }, []);

  return { phase, capture, cancel };
}
