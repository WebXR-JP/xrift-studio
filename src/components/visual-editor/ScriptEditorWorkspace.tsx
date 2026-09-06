import { memo, useCallback, useMemo, useRef, useState } from "react";
import type { AssetManifest, ScriptAsset } from "../../lib/visual-editor/asset-manifest";
import { listScriptAssets } from "../../lib/visual-editor/scripting/script-files";
import { ScriptEditorDialog, type ScriptEditorDialogProps } from "./ScriptEditorDialog";

type Props = ScriptEditorDialogProps & {
  assets: AssetManifest;
  active: boolean;
  onOpen: (assetId: string) => void;
  onCreate: () => void;
  createDisabled?: boolean;
};

/** Shares the viewport tracks and tab strip with Scene View and Graph. */
export function ScriptEditorWorkspace({ assets, onOpen, onCreate, createDisabled, ...editor }: Props) {
  const [query, setQuery] = useState("");
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const callbacks = useRef({ onOpen, onSavingChange: editor.onSavingChange });
  callbacks.current = { onOpen, onSavingChange: editor.onSavingChange };
  const open = useCallback((id: string) => callbacks.current.onOpen(id), []);
  const savingChanged = useCallback((value: boolean) => {
    setSaving(value);
    callbacks.current.onSavingChange?.(value);
  }, []);
  const scripts = useMemo(() => listScriptAssets(assets).sort((a, b) =>
    a.source.relativePath.localeCompare(b.source.relativePath)), [assets]);
  const visibleScripts = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return scripts.filter((asset) => `${asset.name} ${asset.source.relativePath}`.toLocaleLowerCase().includes(search));
  }, [query, scripts]);

  return (
    <section
      aria-label="Script workspace"
      className={`absolute z-[75] min-h-0 flex-col overflow-hidden border-t border-slate-200 bg-white ${editor.active ? "flex" : "hidden"}`}
      style={{ top: "2.25rem", left: "var(--xrift-hierarchy-track, 0px)", right: "var(--xrift-inspector-track, 0px)", bottom: "var(--xrift-assets-track, 0px)" }}
    >
      <div className="flex h-8 shrink-0 items-center gap-3 border-b border-slate-200 bg-slate-50 px-3 text-[11px] text-slate-600">
        <button type="button" aria-expanded={explorerOpen} aria-controls="script-explorer" onClick={() => setExplorerOpen((value) => !value)} className="rounded px-1 py-0.5 hover:bg-slate-200 focus-visible:outline-2">
          Script一覧 {explorerOpen ? "を隠す" : "を表示"}
        </button>
        <span className="ml-auto">TypeScript{editor.playing ? " · Play中" : ""}</span>
      </div>
      <div className="flex min-h-0 flex-1">
        {explorerOpen ? (
          <aside id="script-explorer" aria-label="Script一覧" className="flex w-52 max-w-[35%] shrink-0 flex-col border-r border-slate-200 bg-slate-50">
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-[11px]">
              <span className="font-semibold text-slate-600">SCRIPTS · {scripts.length}</span>
              <button type="button" onClick={onCreate} disabled={createDisabled || saving} title={createDisabled ? "プロジェクトを保存し、Playを停止すると作成できます" : "新規Script"} className="ml-auto rounded px-1.5 py-1 text-brand-700 hover:bg-brand-50 disabled:opacity-40">新規Script</button>
            </div>
            <div className="px-2 pb-2">
              <input type="search" aria-label="Scriptを検索" placeholder="名前・パスで検索" value={query} onChange={(event) => setQuery(event.target.value)} className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-brand-500" />
            </div>
            <nav className="min-h-0 flex-1 overflow-y-auto" aria-label="Scriptファイル">
              {visibleScripts.map((asset) => <ScriptRow key={asset.id} asset={asset} selected={asset.id === editor.asset.id} disabled={saving} onOpen={open} />)}
              {visibleScripts.length === 0 ? <p className="px-3 py-4 text-xs text-slate-500">{scripts.length ? "一致するScriptはありません。検索語を変えてください。" : "Scriptはありません。「新規Script」から作成できます。"}</p> : null}
            </nav>
          </aside>
        ) : null}
        <ScriptEditorDialog {...editor} key={editor.asset.id} onSavingChange={savingChanged} />
      </div>
    </section>
  );
}

const ScriptRow = memo(function ScriptRow({ asset, selected, disabled, onOpen }: {
  asset: ScriptAsset; selected: boolean; disabled: boolean; onOpen: (id: string) => void;
}) {
  return (
    <button type="button" aria-current={selected ? "page" : undefined} disabled={disabled} onClick={() => onOpen(asset.id)} title={asset.source.relativePath} className={`flex w-full items-start gap-2 border-l-2 px-3 py-2 text-left focus-visible:outline-2 disabled:opacity-50 ${selected ? "border-brand-500 bg-brand-50 text-brand-800" : "border-transparent text-slate-700 hover:bg-slate-100"}`}>
      <span className="pt-0.5 font-mono text-[10px] text-slate-500">{asset.source.relativePath.endsWith(".tsx") ? "TSX" : "TS"}</span>
      <span className="min-w-0"><span className="block truncate text-xs font-medium">{asset.name}</span><span className="block truncate text-[10px] text-slate-500">{asset.source.relativePath}</span></span>
    </button>
  );
});
