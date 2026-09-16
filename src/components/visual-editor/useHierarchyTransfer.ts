import { useCallback, useEffect, useRef, useState } from "react";
import { createHierarchyTransfer, getHierarchyClipboard, setHierarchyClipboard, type HierarchyImportPlan } from "../../lib/visual-editor/hierarchy-transfer";
import { prepareStoredHierarchy } from "../../lib/visual-editor/hierarchy-transfer-io";
import type { PrototypeVisualProject } from "../../lib/visual-editor/prototype-project";
import type { HierarchyTransferCurrent, HierarchyTransferSession } from "./HierarchyTransferDialog";

type Options = {
  projectId: string;
  getCurrent: () => HierarchyTransferCurrent;
  canStart: () => boolean;
  beforeRead: () => Promise<void>;
  setBusy: (busy: boolean) => void;
  onCommit: (expected: PrototypeVisualProject, plan: HierarchyImportPlan) => void;
  onNotice: (message: string) => void;
};

/** Session-scoped clipboard; archive bytes are captured before a project closes. */
export function useHierarchyTransfer(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const generation = useRef(0);
  const locked = useRef(false);
  const [session, setSession] = useState<HierarchyTransferSession | null>(null);
  useEffect(() => {
    generation.current++;
    locked.current = false;
    setSession(null);
    latest.current.setBusy(false);
    return () => { generation.current++; locked.current = false; };
  }, [options.projectId]);
  const close = useCallback(() => {
    generation.current++;
    locked.current = false;
    setSession(null);
    latest.current.setBusy(false);
  }, []);
  const begin = useCallback(async (mode: "copy" | "import" | "export" | "paste", requestedEntityId?: string) => {
    if (locked.current || !latest.current.canStart()) {
      latest.current.onNotice("動作確認や取り込みを終えてから操作してください。");
      return;
    }
    const clipboard = mode === "paste" ? getHierarchyClipboard() : null;
    if (mode === "paste" && !clipboard) { latest.current.onNotice("先にHierarchyのEntityをコピーしてください。別のウィンドウでは.xriftstudioを使って受け渡せます。"); return; }
    locked.current = true;
    latest.current.setBusy(true);
    const token = ++generation.current;
    let opened = false;
    latest.current.onNotice(mode === "copy" ? "選択したEntityと素材をコピーしています…" : "受け渡すデータを準備しています…");
    try {
      await latest.current.beforeRead();
      if (generation.current !== token) return;
      const current = latest.current.getCurrent();
      if (!current.editable) throw new Error("動作確認を停止してから操作してください。");
      if (requestedEntityId && !current.selectedIds.includes(requestedEntityId)) current.selectedIds = [requestedEntityId];
      if ((mode === "copy" || mode === "export") && !current.selectedIds.length) throw new Error("HierarchyでEntityを選択してください。");
      if (mode === "copy") {
        const prepared = await prepareStoredHierarchy(createHierarchyTransfer(current.bundle, current.selectedIds), current.projectPath);
        if (generation.current !== token) return;
        if (latest.current.getCurrent().bundle !== current.bundle) throw new Error("編集中のシーンが更新されました。コピーし直してください。");
        setHierarchyClipboard(prepared);
        latest.current.onNotice(`${Object.keys(prepared.bundle.scene.entities).length}件のEntityと素材をコピーしました。別のワールド・アイテムにも貼り付けられます。${prepared.warnings.length ? "貼り付け時に注意事項を表示します。" : ""}`);
      } else {
        setSession({ mode, current, ...(clipboard ? { clipboard } : {}) });
        opened = true;
      }
    } catch (error) {
      if (generation.current === token) latest.current.onNotice(error instanceof Error ? error.message : String(error));
    } finally {
      if (!opened && generation.current === token) { locked.current = false; latest.current.setBusy(false); }
    }
  }, []);
  return {
    session, close,
    copy: useCallback((id?: string) => { void begin("copy", id); }, [begin]),
    paste: useCallback(() => { void begin("paste"); }, [begin]),
    openImport: useCallback(() => { void begin("import"); }, [begin]),
    openExport: useCallback((id?: string) => { void begin("export", id); }, [begin]),
    getCurrent: useCallback(() => latest.current.getCurrent(), []),
    commit: useCallback((expected: PrototypeVisualProject, plan: HierarchyImportPlan) => latest.current.onCommit(expected, plan), []),
  };
}
