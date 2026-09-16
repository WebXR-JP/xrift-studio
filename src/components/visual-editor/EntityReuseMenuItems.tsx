import { useRef, useState } from "react";
import { ChevronDown, Copy, FileOutput, ClipboardPaste } from "lucide-react";
import { ENTITY_CONTEXT_ITEM_CLASS } from "./EntityPasteMenuItems";

export type EntityReuseActions = {
  disabledReason?: string | null;
  pasteAvailable: boolean;
  onCreatePrefab?: (entityId?: string) => void;
  onExport: (entityId?: string) => void;
  onCopy: (entityId?: string) => void;
  onPaste: () => void;
};

/** Asset-inclusive transfer is explicit; ordinary copy/paste stays immediate. */
export function EntityReuseMenuItems({ actions, entityId, onClose, selectionCount }: {
  actions: EntityReuseActions; entityId: string | null; selectionCount: number; onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const reason = actions.disabledReason;
  const execute = (callback: () => void) => { onClose(); callback(); };
  return <div onKeyDown={(event) => {
    if (event.key === "ArrowRight" && event.target === trigger.current) {
      event.preventDefault(); event.stopPropagation(); setOpen(true);
    } else if (open && (event.key === "ArrowLeft" || event.key === "Escape")) {
      event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus();
    }
  }}>
    <div role="separator" className="my-1 border-t border-slate-200" />
    <button ref={trigger} type="button" role="menuitem" aria-expanded={open}
      onClick={() => setOpen((value) => !value)} title="選んだEntityを再利用素材にするか、別のワールド・アイテムへ渡します"
      className={ENTITY_CONTEXT_ITEM_CLASS}>
      <FileOutput size={14} aria-hidden="true" /><span className="flex-1">再利用・書き出し</span>
      <ChevronDown size={12} aria-hidden="true" className={open ? "rotate-180" : ""} />
    </button>
    {open ? <div className="ml-2 border-l border-slate-200 pl-1">
      {entityId ? <>
        {actions.onCreatePrefab ? <button type="button" role="menuitem"
          disabled={Boolean(reason) || selectionCount !== 1}
          title={reason ?? (selectionCount !== 1 ? "Prefabにする親Entityを1件選んでください" : "同じプロジェクトのAssetsへ再利用素材として保存します")}
          className={ENTITY_CONTEXT_ITEM_CLASS} onClick={() => execute(() => actions.onCreatePrefab?.(entityId))}>
          <Copy size={14} aria-hidden="true" />再利用素材（Prefab）を作成
        </button> : null}
        <button type="button" role="menuitem" disabled={Boolean(reason)}
          title={reason ?? "選択した部分と必要な素材を.xriftstudioに書き出します"}
          className={ENTITY_CONTEXT_ITEM_CLASS} onClick={() => execute(() => actions.onExport(entityId))}>
          <FileOutput size={14} aria-hidden="true" />.xriftstudioで書き出す
        </button>
        <button type="button" role="menuitem" disabled={Boolean(reason)}
          title={reason ?? "素材も含めてコピーします。同じタブ・ウィンドウ内の別プロジェクトへ渡せます"}
          className={ENTITY_CONTEXT_ITEM_CLASS} onClick={() => execute(() => actions.onCopy(entityId))}>
          <Copy size={14} aria-hidden="true" />素材ごとコピー
        </button>
      </> : null}
      <button type="button" role="menuitem" disabled={Boolean(reason) || !actions.pasteAvailable}
        title={reason ?? (actions.pasteAvailable ? "素材ごとコピーしたEntityを、確認して追加します" : "先に「素材ごとコピー」を実行してください")}
        className={ENTITY_CONTEXT_ITEM_CLASS} onClick={() => execute(actions.onPaste)}>
        <ClipboardPaste size={14} aria-hidden="true" />素材ごと貼り付け
      </button>
    </div> : null}
  </div>;
}
