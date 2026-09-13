import { useCallback, useEffect, useRef, useState } from "react";
import { tauri } from "../../lib/tauri";
import type { PrototypeVisualProject } from "../../lib/visual-editor/prototype-project";
import { applySpatialCaptureModels, type ApplySpatialModelsResult } from "../../lib/visual-editor/value-up/spatial-xr/apply-spatial-models";
import { nativeRoomToCapture } from "../../lib/visual-editor/value-up/spatial-xr/native-room";

export type OpenXrRoomImportPhase = "idle" | "acquiring" | "cancelling" | "saving";

export type OpenXrRoomImportOutcome =
  | { status: "success"; message: string; entityIds: string[]; skippedCount: number; warnings: string[] }
  | { status: "cancelled"; message: string }
  | { status: "error"; message: string };

type OpenXrRoomImportJob = {
  requestId: string;
  cancelled: boolean;
  phase: OpenXrRoomImportPhase;
};

type Options = {
  projectId: string;
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
  const [outcome, setOutcome] = useState<OpenXrRoomImportOutcome | null>(null);

  useEffect(() => {
    mounted.current = true;
    setOutcome(null);
    return () => {
      mounted.current = false;
      const job = active.current;
      if (!job) return;
      job.cancelled = true;
      if (job.phase === "acquiring") {
        void tauri.cancelOpenXrRoomCapture(job.requestId).catch(() => undefined);
      }
    };
  }, [options.projectId]);

  const capture = useCallback(async (): Promise<void> => {
    if (active.current) return;
    if (!mounted.current || !optionsRef.current.canImport()) {
      if (mounted.current) setOutcome({
        status: "error",
        message: "Playを停止し、素材の処理が終わってから部屋を取り込んでください。",
      });
      return;
    }
    const projectId = optionsRef.current.projectId;
    const before = optionsRef.current.getBundle();
    const playGeneration = optionsRef.current.getPlayGeneration();
    const job: OpenXrRoomImportJob = {
      requestId: crypto.randomUUID(),
      cancelled: false,
      phase: "acquiring",
    };
    active.current = job;
    setOutcome(null);
    setPhase(job.phase);
    const assertCurrent = () => {
      if (!mounted.current || job.cancelled || active.current !== job
        || optionsRef.current.projectId !== projectId) {
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
      const message = `部屋の形状を${result.applied.length}件追加しました。`;
      optionsRef.current.commit(result, message);
      setOutcome({
        status: "success",
        message,
        entityIds: result.applied.map(({ entityId }) => entityId),
        skippedCount: result.skipped.length,
        warnings: room.warnings,
      });
    } catch (cause) {
      if (mounted.current && optionsRef.current.projectId === projectId) {
        setOutcome(job.cancelled
          ? { status: "cancelled", message: "取得を取り消しました。シーンへの追加はありません。" }
          : { status: "error", message: cause instanceof Error ? cause.message : String(cause) });
      }
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
    // Local cancellation always prevents Scene commit. Keep the cancelling
    // phase until acquisition settles, even if native cancellation is delayed.
    await tauri.cancelOpenXrRoomCapture(job.requestId).catch(() => undefined);
  }, []);

  return { phase, outcome, capture, cancel };
}
