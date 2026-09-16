import { useEditorDevice } from "./useEditorDevice";
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { BuiltinPrefabRecipe } from "../../lib/visual-editor/builtin-prefab-catalog";
import type { VisualProjectKind } from "../../lib/visual-editor/project-document";
import { getEntityCreationMenuEntries, type EntityCreationMenuEntry } from "../../lib/visual-editor/entity-creation-menu";
import { EditorCreationMenuSections } from "./EditorCreationMenuSections";
import { EditorMenuGroup, handleEditorMenuKeyDown } from "./EditorMenu";

type Props = {
  open: boolean;
  readOnly: boolean;
  importBusy: boolean;
  projectKind: VisualProjectKind;
  builtinPrefabRecipes: readonly BuiltinPrefabRecipe[];
  onClose: () => void;
  onOpenExternalStore?: () => void;
  onImportFile?: () => void;
  importDisabledReason?: string | null;
  onCreateEmpty: () => void;
  onCreatePrimitive: (creationId: string) => void;
  onCreateTerrain: (presetId?: string, grassPresetId?: string | null) => void;
  /** Pairs of Terrains sharing ground. Zero hides the repair entry. */
  terrainOverlapCount: number;
  onArrangeTerrains: () => void;
  onPlaceBuiltinPrefab: (recipeId: string) => void;
  onCreateXriftObject: (definitionId: string) => void;
  onCreateComponentObject: (definitionId: string) => void;
};

export function EditorCreateMenu(props: Props) {
  const { primaryTouch, viewportHeight } = useEditorDevice();
  const { open, onClose, projectKind, builtinPrefabRecipes } = props;
  const anchorRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const entries = useMemo(
    () => getEntityCreationMenuEntries(projectKind, builtinPrefabRecipes),
    [projectKind, builtinPrefabRecipes],
  );
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!open || !menu) return;
    const anchor = anchorRef.current?.getBoundingClientRect();
    if (!anchor) return;
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const placeMenu = () => {
      const height = viewportHeight ?? window.innerHeight;
      const bounds = menu.getBoundingClientRect();
      const top = anchor.bottom + 4 + bounds.height <= height - 12
        ? anchor.bottom + 4 : Math.max(12, anchor.top - bounds.height - 4);
      menu.style.left = `${Math.max(12, Math.min(anchor.left, window.innerWidth - bounds.width - 12))}px`;
      menu.style.top = `${Math.min(top, Math.max(12, height - bounds.height - 12))}px`;
    };
    placeMenu();
    menu.focus({ preventScroll: true });
    const observer = new ResizeObserver(placeMenu);
    observer.observe(menu);
    return () => observer.disconnect();
  }, [open, viewportHeight]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
      triggerRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
    };
  }, [open, onClose]);
  const disabled = props.readOnly || props.importBusy;
  const select = (entry: EntityCreationMenuEntry) => {
    if (entry.kind === "empty") props.onCreateEmpty();
    else if (entry.kind === "primitive") props.onCreatePrimitive(entry.actionId);
    else if (entry.kind === "component") props.onCreateComponentObject(entry.actionId);
    else if (entry.kind === "prefab") props.onPlaceBuiltinPrefab(entry.actionId);
    else props.onCreateXriftObject(entry.actionId);
    onClose();
  };
  return <>
    <span ref={anchorRef} className="absolute left-0 top-full" />
    {open ? createPortal(<>
      <button type="button" tabIndex={-1} aria-hidden="true" onPointerDown={onClose} className="fixed inset-0 z-[84] cursor-default bg-transparent" />
      <div ref={menuRef} tabIndex={-1} style={{ maxHeight: Math.min(620, (viewportHeight ?? window.innerHeight) - 24) }}
        role="menu" data-touch={primaryTouch || undefined} aria-label="Entityを追加" onKeyDown={handleEditorMenuKeyDown}
        className="editor-add-menu fixed z-[85] flex w-72 max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-md border border-slate-300 bg-white shadow-xl">
        <header className="px-3 py-1 text-[11px] leading-4 text-slate-500">追加</header>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-1">
          <EditorMenuGroup>
            <EditorCreationMenuSections entries={entries} disabled={disabled} onSelect={select}
              onCreateTerrain={projectKind === "world" ? (presetId) => { props.onCreateTerrain(presetId); onClose(); } : undefined}
              terrainOverlapCount={props.terrainOverlapCount}
              onArrangeTerrains={() => { props.onArrangeTerrains(); onClose(); }}
              onOpenExternalStore={props.onOpenExternalStore ? () => { onClose(); props.onOpenExternalStore?.(); } : undefined}
              onImportFile={props.onImportFile ? () => { onClose(); props.onImportFile?.(); } : undefined}
              importDisabledReason={props.importDisabledReason}
            />
          </EditorMenuGroup>
        </div>
      </div>
    </>, document.body) : null}
  </>;
}
