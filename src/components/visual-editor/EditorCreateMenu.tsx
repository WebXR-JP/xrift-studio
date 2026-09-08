import { useEffect, useMemo, useRef, useState } from "react";
import { Mountain } from "lucide-react";
import type { BuiltinPrefabRecipe } from "../../lib/visual-editor/builtin-prefab-catalog";
import type { VisualProjectKind } from "../../lib/visual-editor/project-document";
import { TERRAIN_PRESETS } from "../../lib/visual-editor/terrain-presets";
import { getEntityCreationMenuEntries, filterEntityCreationMenuEntries, type EntityCreationMenuEntry } from "../../lib/visual-editor/entity-creation-menu";
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
  const [searchQuery, setSearchQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const entries = useMemo(() => getEntityCreationMenuEntries(projectKind, builtinPrefabRecipes), [projectKind, builtinPrefabRecipes]);
  useEffect(() => {
    if (!open) { setSearchQuery(""); return; }
    inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (searchQuery) setSearchQuery("");
      else onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, searchQuery]);
  if (!open) return null;
  const disabled = props.readOnly || props.importBusy;
  const select = (entry: EntityCreationMenuEntry) => {
    if (entry.kind === "empty") props.onCreateEmpty();
    else if (entry.kind === "primitive") props.onCreatePrimitive(entry.actionId);
    else if (entry.kind === "component") props.onCreateComponentObject(entry.actionId);
    else if (entry.kind === "prefab") props.onPlaceBuiltinPrefab(entry.actionId);
    else props.onCreateXriftObject(entry.actionId);
    onClose();
  };
  const searching = Boolean(searchQuery.trim());
  const terrainVisible = !searching || searchQuery.trim().toLowerCase().split(/\s+/).every((term) => `terrain 地形 ${TERRAIN_PRESETS.map((preset) => preset.label).join(" ")}`.toLowerCase().includes(term));
  return <>
    <button type="button" tabIndex={-1} aria-hidden="true" onPointerDown={onClose} className="fixed inset-0 z-40 cursor-default bg-transparent" />
    <div role="menu" aria-label="Entityを追加" className="absolute left-0 top-8 z-50 flex max-h-[min(620px,calc(100vh-150px))] w-[340px] flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-xl">
      <header className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900">Entityを追加</header>
      <div className="border-b border-slate-200 p-2">
        <input ref={inputRef} type="search" aria-label="追加するEntityを検索" placeholder="Entityを検索…" value={searchQuery} onChange={(event) => setSearchQuery(event.currentTarget.value)} className="h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100" />
      </div>
      <div className="min-h-0 overflow-y-auto p-1.5">
        {searching && !filterEntityCreationMenuEntries(entries, searchQuery).length && !terrainVisible ? <p className="px-2 py-4 text-xs text-slate-500">一致するEntityはありません。</p> : null}
        <EntityCreationMenuContent entries={entries} searchQuery={searchQuery} disabled={disabled} onSelect={select} />
        {terrainVisible ? <details key={String(searching)} open={searching} className="mt-1 rounded border border-slate-200 text-xs">
          <summary className="cursor-pointer px-2 py-1.5 font-semibold text-slate-600">Terrain</summary>
          {[{ id: undefined, label: "Terrain" }, ...TERRAIN_PRESETS.map((preset) => ({ id: preset.id, label: `Terrain · ${preset.label}` }))].map((preset) => <button key={preset.id ?? "flat"} type="button" disabled={disabled} onClick={() => { props.onCreateTerrain(preset.id); onClose(); }} className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-violet-50 disabled:opacity-45"><Mountain size={14} />{preset.label}</button>)}
          {props.terrainOverlapCount > 0 ? <button type="button" disabled={disabled} onClick={() => { props.onArrangeTerrains(); onClose(); }} className="px-2 py-1.5 text-left">重なったTerrainを横へ並べ直す</button> : null}
        </details> : null}
      </div>
    </div>
  </>;
}
