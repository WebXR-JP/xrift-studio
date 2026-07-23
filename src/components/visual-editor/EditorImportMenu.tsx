import {
  ChevronDown,
  Code2,
  FileBox,
  Import,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function EditorImportMenu({
  disabledReason,
  onImportModel,
  onImportR3f,
}: {
  disabledReason?: string | null;
  onImportModel: () => void;
  onImportR3f: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={Boolean(disabledReason)}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        title={disabledReason ?? "Model、R3F、XRift Classicから取り込む"}
        className="flex items-center gap-1.5 rounded-md border border-editor-border bg-editor-surface px-3 py-1.5 text-xs font-semibold text-editor-text hover:bg-editor-subtle disabled:cursor-not-allowed disabled:opacity-45"
      >
        <Import size={13} aria-hidden="true" />
        Import
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-[70] mt-1.5 w-72 overflow-hidden rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl"
        >
          <MenuItem
            icon={FileBox}
            label="Model / 3Dアセット"
            description="GLB、glTF、OBJ、VRM、UnityPackageなど"
            onClick={() => {
              setOpen(false);
              onImportModel();
            }}
          />
          <MenuItem
            icon={Code2}
            label="R3F / Classicから変換"
            description="TSXを貼る、またはClassic projectを選択"
            onClick={() => {
              setOpen(false);
              onImportR3f();
            }}
          />
          <p className="mx-1 mt-1 border-t border-slate-100 px-2 pt-2 text-[10px] leading-4 text-slate-500">
            公式ComponentとOpen BrushはAssetsの「外部から追加」から選べます。
          </p>
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  description,
  onClick,
}: {
  icon: typeof FileBox;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-md px-2.5 py-2.5 text-left hover:bg-violet-50"
    >
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-violet-100 text-violet-700">
        <Icon size={16} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-slate-800">
          {label}
        </span>
        <span className="mt-0.5 block text-[10px] leading-4 text-slate-500">
          {description}
        </span>
      </span>
    </button>
  );
}
