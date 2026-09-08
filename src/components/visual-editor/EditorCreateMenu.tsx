import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Mountain } from "lucide-react";
import type { BuiltinPrefabRecipe } from "../../lib/visual-editor/builtin-prefab-catalog";
import type { VisualProjectKind } from "../../lib/visual-editor/project-document";
import { TERRAIN_PRESETS } from "../../lib/visual-editor/terrain-presets";
import { getEntityCreationMenuEntries, type EntityCreationMenuEntry } from "../../lib/visual-editor/entity-creation-menu";
import { EntityCreationMenuContent } from "./EntityCreationMenuContent";

type Props = {
  open: boolean;
  readOnly: boolean;
  importBusy: boolean;
  projectKind: VisualProjectKind;
  builtinPrefabRecipes: readonly BuiltinPrefabRecipe[];
  onClose: () => void;
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
  const { open, onClose, projectKind, builtinPrefabRecipes } = props;
  const anchorRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 12, top: 12, maxHeight: 620 });
  const entries = useMemo(
    () => getEntityCreationMenuEntries(projectKind, builtinPrefabRecipes),
    [projectKind, builtinPrefabRecipes],
  );
  useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current?.getBoundingClientRect();
    if (!anchor) return;
    const below = Math.max(0, window.innerHeight - anchor.bottom - 16);
    const maxHeight = Math.min(620, below >= 200 ? below : window.innerHeight - 24);
    setPosition({
      left: Math.max(12, Math.min(anchor.left, window.innerWidth - 352)),
      top: below >= 200 ? anchor.bottom + 4 : Math.max(12, anchor.top - maxHeight - 4),
      maxHeight,
    });
    menuRef.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
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
      <div ref={menuRef} tabIndex={-1} style={position} role="menu" aria-label="Entityを追加" className="fixed z-[85] flex w-[340px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-xl">
        <header className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900">Entityを追加</header>
        <div className="min-h-0 overflow-y-auto p-1.5">
          <EntityCreationMenuContent entries={entries} disabled={disabled} onSelect={select} />
          <details className="mt-1 rounded border border-slate-200 text-xs">
            <summary className="cursor-pointer px-2 py-1.5 font-semibold text-slate-600">Terrain</summary>
            {[{ id: undefined, label: "Terrain" }, ...TERRAIN_PRESETS.map((preset) => ({ id: preset.id, label: `Terrain · ${preset.label}` }))].map((preset) => (
              <button key={preset.id ?? "flat"} type="button" disabled={disabled}
                onClick={() => { props.onCreateTerrain(preset.id); onClose(); }}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-violet-50 disabled:opacity-45">
                <Mountain size={14} />{preset.label}
              </button>
            ))}
            {props.terrainOverlapCount > 0 ? (
              <button type="button" disabled={disabled}
                onClick={() => { props.onArrangeTerrains(); onClose(); }}
                className="px-2 py-1.5 text-left">重なったTerrainを横へ並べ直す</button>
            ) : null}
          </details>
        </div>
      </div>
    </>, document.body) : null}
  </>;
}
