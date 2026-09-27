import { matchesEditorSearch } from "../../lib/visual-editor/editor-menu-search";
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
  /** Uses the creation catalog shared with Hierarchy's blank-space menu. */
  renderCreation?: (close: () => void, searchQuery: string) => ReactNode;
  onImportHierarchy?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hasResults, setHasResults] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (open) setHasResults(Boolean(menuRef.current?.querySelector('[role="menuitem"]')));
  }, [open, query, renderCreation]);

  const closeAfterAction = () => {
    setOpen(false);
    setQuery("");
    rootRef.current?.closest("details")?.removeAttribute("open");
  };

  useEffect(() => {
    const projectMenu = rootRef.current?.closest("details");
    const resetWhenClosed = () => { if (!projectMenu?.open) setOpen(false); };
    projectMenu?.addEventListener("toggle", resetWhenClosed);
    return () => projectMenu?.removeEventListener("toggle", resetWhenClosed);
  }, []);

  useEffect(() => {
    if (!open) return;
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
            <span className="sr-only">素材・作成するEntityを検索</span>
            <input ref={searchRef} type="search" value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") { event.preventDefault(); event.stopPropagation(); menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus(); }
                if (event.key === "Escape" && query) { event.preventDefault(); event.stopPropagation(); setQuery(""); }
              }}
              placeholder="名前や用途で検索…"
              className="h-8 w-full rounded border border-slate-300 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </label>
          <EditorMenuGroup>
            {renderCreation?.(closeAfterAction, query)}
            {renderCreation && !query.trim() ? <div className="my-1 border-t border-slate-200" role="separator" /> : null}
            <MenuItem query={query} icon={FileBox} label="3Dモデル / 3Dアセット"
              description="GLB、glTF、OBJ、VRM、UnityPackageなど"
              onClick={() => { closeAfterAction(); onImportModel(); }} />
            <MenuItem query={query} icon={Code2} label="R3F / コードプロジェクトから変換"
              description="TSXを貼り付けるか、コードプロジェクトを選びます。"
              onClick={() => { closeAfterAction(); onImportR3f(); }} />
            {onImportHierarchy ? <MenuItem query={query} icon={Import}
              label=".xriftstudioから追加"
              description="別のワールド・アイテムのHierarchyを部分インポート。今のシーンは置き換えません。"
              onClick={() => { closeAfterAction(); onImportHierarchy(); }} /> : null}
            {onOpenExternalStore ? (
              <MenuItem query={query} icon={Store} label="外部から追加"
                description="3Dセット、マテリアル、ギミック、公式Componentなど"
                onClick={() => { closeAfterAction(); onOpenExternalStore(); }} />
            ) : null}
          </EditorMenuGroup>
          {query.trim() && !hasResults ? <p role="status" className="p-3 text-xs leading-5 text-slate-500">該当する項目はありません。別の名前や用途で検索してください。</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({ icon: Icon, label, description, onClick, query = "" }: {
  query?: string;
  icon: typeof FileBox;
  label: string;
  description: string;
  onClick: () => void;
}) {
  if (!matchesEditorSearch(query, label, description)) return null;
  return (
    <button type="button" role="menuitem" title={description} onClick={onClick} className={EDITOR_MENU_ROW_CLASS}>
      <Icon size={14} className="shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}
