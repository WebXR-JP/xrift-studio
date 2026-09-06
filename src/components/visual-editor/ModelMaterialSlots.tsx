import { memo, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { AssetManifest, ModelAsset, ModelAssetPatch } from "../../lib/visual-editor";

const PAGE_SIZE = 20;
type Props = {
  asset: ModelAsset;
  assets: AssetManifest;
  readOnly: boolean;
  onChange: (patch: ModelAssetPatch) => void;
  onOpenMaterial: (id: string) => void;
};

export function ModelMaterialSlots(props: Props) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const Icon = expanded ? ChevronDown : ChevronRight;
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <button type="button" aria-expanded={expanded} aria-controls={contentId}
        onClick={() => setExpanded(value => !value)}
        className="flex min-h-8 w-full items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300">
        <Icon size={14} aria-hidden="true" />
        Material Slots ({props.asset.materialSlots.length})
      </button>
      <div id={contentId}>
        {expanded ? <SlotList key={props.asset.id} {...props} /> : null}
      </div>
    </section>
  );
}

function SlotList({ asset, assets, readOnly, onChange, onOpenMaterial }: Props) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const actions = useRef({ onChange, onOpenMaterial });
  actions.current = { onChange, onOpenMaterial };
  const materials = useMemo(() => Object.values(assets.assets)
    .filter(candidate => candidate.kind === "material")
    .sort((a, b) => a.name.localeCompare(b.name, "ja")), [assets.assets]);
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return asset.materialSlots.filter(slot =>
      `${slot.name} ${slot.slot}`.toLocaleLowerCase().includes(search));
  }, [asset.materialSlots, query]);
  const lastPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const start = currentPage * PAGE_SIZE;
  const fallback = asset.importMetadata?.openBrush ? "OpenBrush Brush Shader" : "Model内のMaterial";
  return (
    <div className="space-y-2 border-t border-slate-200 p-2">
      <p className="text-[11px] text-slate-500">Model全体の既定Material。Entity側の割当が優先されます。</p>
      {asset.materialSlots.length > PAGE_SIZE || query ? (
        <input aria-label="マテリアルスロットを検索" placeholder="スロット名で検索" value={query}
          onChange={event => { setQuery(event.currentTarget.value); setPage(0); }}
          className="h-7 w-full rounded border border-slate-300 px-2 text-xs" />
      ) : null}
      {filtered.slice(start, start + PAGE_SIZE).map(slot => (
        <SlotRow key={slot.slot} slot={slot} materials={materials} readOnly={readOnly}
          selected={slot.defaultMaterialAssetId ? assets.assets[slot.defaultMaterialAssetId] : undefined}
          fallback={fallback} actions={actions} />
      ))}
      {filtered.length === 0 ? <p className="py-2 text-xs text-slate-500">{query ? "一致するスロットはありません。検索語を変えてください。" : "マテリアルスロットはありません。"}</p> : null}
      {filtered.length > PAGE_SIZE ? (
        <nav aria-label="マテリアルスロットのページ" className="flex items-center justify-between gap-2 text-xs">
          <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="h-7 rounded border px-2 disabled:opacity-40">前へ</button>
          <span role="status">{start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} / {filtered.length}件</span>
          <button type="button" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)} className="h-7 rounded border px-2 disabled:opacity-40">次へ</button>
        </nav>
      ) : null}
    </div>
  );
}

const SlotRow = memo(function SlotRow({ slot, materials, selected, readOnly, fallback, actions }: {
  slot: ModelAsset["materialSlots"][number];
  materials: Extract<AssetManifest["assets"][string], { kind: "material" }>[];
  selected: AssetManifest["assets"][string] | undefined;
  readOnly: boolean;
  fallback: string;
  actions: React.RefObject<Pick<Props, "onChange" | "onOpenMaterial">>;
}) {
  const missing = Boolean(slot.defaultMaterialAssetId && selected?.kind !== "material");
  return (
    <div className={`border-b border-slate-100 pb-2 ${missing ? "bg-rose-50" : ""}`}>
      <p className="mb-1 truncate text-[11px] font-medium text-slate-700" title={`${slot.name} · ${slot.slot}${slot.sourceMaterialIndex !== undefined ? ` · Source #${slot.sourceMaterialIndex}` : ""}`}>{slot.name}</p>
      <div className="flex min-w-0 gap-1">
        <select aria-label={`${slot.name}のマテリアル`} value={slot.defaultMaterialAssetId ?? ""} disabled={readOnly}
          onChange={event => actions.current.onChange({ materialSlotBindings: { [slot.slot]: event.currentTarget.value || null } })}
          className="h-7 min-w-0 flex-1 rounded border border-slate-300 bg-white px-1 text-xs disabled:opacity-50">
          <option value="">{fallback}</option>
          {missing ? <option value={slot.defaultMaterialAssetId}>Missing: {slot.defaultMaterialAssetId}</option> : null}
          {materials.map(material => <option key={material.id} value={material.id}>{material.name}</option>)}
        </select>
        <button type="button" disabled={selected?.kind !== "material"} onClick={() => selected?.kind === "material" && actions.current.onOpenMaterial(selected.id)}
          aria-label={`${slot.name}のマテリアルを開く`} className="h-7 shrink-0 rounded border border-slate-300 px-2 text-xs disabled:opacity-40">開く</button>
      </div>
    </div>
  );
});
