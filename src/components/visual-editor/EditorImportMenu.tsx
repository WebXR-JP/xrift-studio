import { matchesEditorMenuQuery } from "../../lib/visual-editor/editor-menu-search";
import { ChevronDown, Code2, FileBox, Import, Store } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { EDITOR_MENU_ROW_CLASS, EditorMenuGroup, handleEditorMenuKeyDown } from "./EditorMenu";

export function EditorImportMenu({
  disabledReason,
  onImportModel,
  onImportR3f,
  onOpenExternalStore,
  renderCreation,
  onImportHierarchy,
}: {
  disabledReason?: string | null;
  onImportModel: () => void;
  onImportR3f: () => void;
  onOpenExternalStore?: () => void;
  onImportHierarchy?: () => void;
  /** Uses the central creation catalog, including the current search query. */
  renderCreation?: (close: () => void, query: string) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [noResults, setNoResults] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const matches = (...labels: string[]) => matchesEditorMenuQuery(query, ...labels);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    setNoResults(Boolean(open && query.trim() && !menuRef.current?.querySelector('[role="menuitem"]')));
  }, [open, query]);

  const closeAfterAction = () => {
    setOpen(false);
    rootRef.current?.closest("details")?.removeAttribute("open");
  };

  useEffect(() => {
    const projectMenu = rootRef.current?.closest("details");
    const resetWhenClosed = () => { if (!projectMenu?.open) setOpen(false); };
    projectMenu?.addEventListener("toggle", resetWhenClosed);
    return () => projectMenu?.removeEventListener("toggle", resetWhenClosed);
  }, []);

  useEffect(() => {
    if (!open) { setQuery(""); return; }
    searchRef.current?.focus();
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="editor-import-menu relative"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.preventDefault();
        event.stopPropagation();
        if (query) { setQuery(""); searchRef.current?.focus(); return; }
        setOpen(false);
        triggerRef.current?.focus();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={Boolean(disabledReason)}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown") return;
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        title={disabledReason ?? "Entityの作成、ファイルの読み込み、外部の素材やギミックの追加"}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-editor-border bg-editor-surface px-3 text-xs font-semibold text-editor-text hover:bg-editor-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-45"
      >
        <Import size={16} aria-hidden="true" />
        素材を追加
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="素材を追加"
          onKeyDown={handleEditorMenuKeyDown}
          className="absolute left-0 top-full z-[70] mt-1.5 max-h-[60dvh] w-72 max-w-[calc(100vw-24px)] overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl"
        >
          <label className="sticky top-0 z-10 mb-1 block bg-white p-1">
            <span className="sr-only">追加する素材を検索</span>
            <input ref={searchRef} type="search" value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== "ArrowDown") return;
                event.preventDefault();
                menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
              }}
              placeholder="基本形状・ライト・ギミックなどを検索"
              className="h-8 w-full rounded border border-slate-300 px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400" />
          </label>
          <EditorMenuGroup>
            {renderCreation?.(closeAfterAction, query)}
            {renderCreation ? <div className="my-1 border-t border-slate-200" role="separator" /> : null}
            {matches("3Dモデル / 3Dアセット", "ファイル GLB glTF OBJ VRM UnityPackage") ? <MenuItem icon={FileBox} label="3Dモデル / 3Dアセット"
              description="GLB、glTF、OBJ、VRM、UnityPackageなど"
              onClick={() => { closeAfterAction(); onImportModel(); }} /> : null}
            {matches("R3F / コードプロジェクトから変換", "TSX") ? <MenuItem icon={Code2} label="R3F / コードプロジェクトから変換"
              description="TSXを貼り付けるか、コードプロジェクトを選びます。"
              onClick={() => { closeAfterAction(); onImportR3f(); }} /> : null}
            {onImportHierarchy && matches(".xriftstudioから追加", "再利用 Hierarchy 読み込み インポート ファイル") ? (
              <MenuItem icon={FileBox} label=".xriftstudioから追加"
                description="今のシーンを置き換えず、ファイルから選んだEntityと素材を追加します。"
                onClick={() => { closeAfterAction(); onImportHierarchy(); }} />
            ) : null}
            {onOpenExternalStore && matches("外部から追加", "3Dセット マテリアル ギミック Vehicle Seat 乗り物 公式 Component") ? (
              <MenuItem icon={Store} label="外部から追加"
                description="3Dセット、マテリアル、ギミック、公式Componentなど"
                onClick={() => { closeAfterAction(); onOpenExternalStore(); }} />
            ) : null}
          </EditorMenuGroup>
          {noResults ? <p role="status" className="px-2 py-3 text-xs leading-5 text-slate-500">一致する項目がありません。検索語を変えるか、消してください。</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({ icon: Icon, label, description, onClick }: {
  icon: typeof FileBox;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button type="button" role="menuitem" title={description} onClick={onClick} className={EDITOR_MENU_ROW_CLASS}>
      <Icon size={14} className="shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}
