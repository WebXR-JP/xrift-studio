import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  LoaderCircle,
  Search,
  Store,
  X,
} from "lucide-react";
import {
  tauri,
  type ExternalStoreAsset,
  type ExternalStoreAssetOptions,
  type ExternalStoreInstallResult,
} from "../../lib/tauri";
import { formatFileSize } from "./editor-utils";

type StoreKindFilter = "all" | "hdri" | "texture" | "model";

export function ExternalAssetStoreDialog({
  open,
  projectPath,
  disabledReason,
  onClose,
  onInstalled,
}: {
  open: boolean;
  projectPath?: string;
  disabledReason?: string | null;
  onClose: () => void;
  onInstalled: (
    result: ExternalStoreInstallResult,
    applySkybox: boolean,
  ) => void;
}) {
  const [assets, setAssets] = useState<ExternalStoreAsset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<StoreKindFilter>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<ExternalStoreAssetOptions | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [resolution, setResolution] = useState("");
  const [applySkybox, setApplySkybox] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [installedName, setInstalledName] = useState<string | null>(null);

  useEffect(() => {
    if (!open || assets.length > 0) return;
    let active = true;
    setLoading(true);
    setError(null);
    void tauri
      .listExternalStoreAssets("poly-haven")
      .then((items) => {
        if (!active) return;
        setAssets(items);
        setSelectedId(items.find((item) => item.assetKind !== "model")?.externalId ?? null);
      })
      .catch((reason: unknown) => {
        if (active) setError(errorMessage(reason, "Poly Havenの一覧を取得できませんでした"));
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [assets.length, open]);

  const selected = assets.find((asset) => asset.externalId === selectedId);
  useEffect(() => {
    if (!open || !selected || selected.assetKind === "model") {
      setOptions(null);
      setResolution("");
      return;
    }
    let active = true;
    setOptionsLoading(true);
    setOptions(null);
    setError(null);
    void tauri
      .getExternalStoreAssetOptions(selected.providerId, selected.externalId)
      .then((next) => {
        if (!active) return;
        setOptions(next);
        const preferred = next.resolutions.find((entry) => entry.id === "2k") ?? next.resolutions[0];
        setResolution(preferred?.id ?? "");
      })
      .catch((reason: unknown) => {
        if (active) setError(errorMessage(reason, "ダウンロード情報を取得できませんでした"));
      })
      .finally(() => active && setOptionsLoading(false));
    return () => {
      active = false;
    };
  }, [open, selected]);

  const visibleAssets = useMemo(() => {
    const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return assets
      .filter((asset) => kind === "all" || asset.assetKind === kind)
      .filter((asset) => {
        const text = [asset.name, asset.description, asset.category, ...asset.tags]
          .join(" ")
          .toLocaleLowerCase();
        return tokens.every((token) => text.includes(token));
      })
      .slice(0, 120);
  }, [assets, kind, query]);
  const selectedResolution = options?.resolutions.find((entry) => entry.id === resolution);

  const install = async () => {
    if (!projectPath || !selected || !resolution || installing || disabledReason) return;
    setInstalling(true);
    setError(null);
    setInstalledName(null);
    try {
      const result = await tauri.installExternalStoreAsset(projectPath, {
        providerId: selected.providerId,
        externalId: selected.externalId,
        resolution,
      });
      onInstalled(result, result.assetKind === "hdri" && applySkybox);
      setInstalledName(result.name);
    } catch (reason) {
      setError(errorMessage(reason, "アセットをインストールできませんでした"));
    } finally {
      setInstalling(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-5" role="dialog" aria-modal="true" aria-labelledby="external-store-title">
      <div className="flex h-[min(760px,92vh)] w-[min(1180px,96vw)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-2xl">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5">
          <div className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><Store size={17} aria-hidden="true" /></span>
            <div>
              <h2 id="external-store-title" className="text-sm font-semibold text-slate-900">外部リソースを追加</h2>
              <p className="text-[11px] text-slate-500">Poly HavenからCC0アセットをプロジェクトへ追加します</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={installing} aria-label="外部ストアを閉じる" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40"><X size={17} /></button>
        </header>

        <div className="flex min-h-0 flex-1">
          <section className="flex min-w-0 flex-1 flex-col border-r border-slate-200" aria-label="Poly Havenアセット一覧">
            <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 py-2.5">
              <label className="relative min-w-0 flex-1">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-2 text-slate-400" />
                <span className="sr-only">Poly Havenを検索</span>
                <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="名前、カテゴリ、タグで検索" className="h-8 w-full rounded-md border border-slate-300 bg-white pl-8 pr-3 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
              </label>
              <select value={kind} onChange={(event) => setKind(event.currentTarget.value as StoreKindFilter)} className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700">
                <option value="all">すべて</option><option value="hdri">Skybox / HDRI</option><option value="texture">Material / Texture</option><option value="model">Model</option>
              </select>
            </div>
            <div className="scrollbar-thin min-h-0 flex-1 overflow-auto p-3">
              {loading ? <StoreState icon={<LoaderCircle className="animate-spin" size={22} />} text="Poly Havenから読み込んでいます" /> : null}
              {!loading && visibleAssets.length === 0 ? <StoreState icon={<Search size={22} />} text="条件に合うアセットがありません" /> : null}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5">
                {visibleAssets.map((asset) => (
                  <button key={asset.externalId} type="button" onClick={() => { setSelectedId(asset.externalId); setInstalledName(null); }} aria-pressed={selectedId === asset.externalId} className={`overflow-hidden rounded-lg border bg-white text-left transition ${selectedId === asset.externalId ? "border-brand-400 ring-2 ring-brand-100" : "border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"}`}>
                    <div className="aspect-square bg-slate-100"><img src={asset.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover" /></div>
                    <div className="p-2.5"><p className="truncate text-xs font-semibold text-slate-800">{asset.name}</p><p className="mt-1 text-[10px] font-medium text-slate-500">{kindLabel(asset.assetKind)}</p></div>
                  </button>
                ))}
              </div>
            </div>
            <footer className="shrink-0 border-t border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">Powered by <button type="button" onClick={() => void tauri.openUrl("https://polyhaven.com")} className="font-semibold text-brand-700 hover:underline">Poly Haven</button>。API提供元を明示し、アセットにはCC0情報を保存します。</footer>
          </section>

          <aside className="scrollbar-thin w-[340px] shrink-0 overflow-auto bg-white p-4" aria-label="選択したアセットの詳細">
            {selected ? (
              <div className="space-y-4">
                <img src={selected.thumbnailUrl} alt={`${selected.name}のプレビュー`} className="aspect-[16/10] w-full rounded-lg bg-slate-100 object-cover" />
                <div><div className="flex items-start justify-between gap-2"><h3 className="text-base font-semibold text-slate-900">{selected.name}</h3><button type="button" onClick={() => void tauri.openUrl(selected.assetUrl)} title="Poly Havenで開く" className="rounded p-1.5 text-slate-500 hover:bg-slate-100"><ExternalLink size={15} /></button></div><p className="mt-1 text-xs leading-5 text-slate-600">{selected.description}</p></div>
                <dl className="grid grid-cols-[76px_1fr] gap-x-2 gap-y-1.5 text-xs"><dt className="text-slate-400">提供元</dt><dd className="font-medium text-slate-700">Poly Haven</dd><dt className="text-slate-400">作者</dt><dd className="text-slate-700">{selected.authors.join("、") || "Poly Haven contributors"}</dd><dt className="text-slate-400">ライセンス</dt><dd><button type="button" onClick={() => void tauri.openUrl(selected.licenseUrl)} className="font-medium text-brand-700 hover:underline">{selected.licenseName}</button></dd><dt className="text-slate-400">カテゴリ</dt><dd className="text-slate-700">{selected.category || "未分類"}</dd></dl>
                {selected.assetKind === "model" ? <Notice text="Modelの直接インストールは次の対応項目です。現在はSkyboxとMaterialを追加できます。" /> : (
                  <>
                    <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-700">解像度</span><select value={resolution} disabled={optionsLoading || installing} onChange={(event) => setResolution(event.currentTarget.value)} className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs disabled:bg-slate-100"><option value="">選択してください</option>{options?.resolutions.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}・{formatFileSize(entry.byteLength)}・{entry.fileCount}ファイル</option>)}</select>{optionsLoading ? <p className="mt-1 text-[11px] text-slate-500">利用可能なファイルを確認中です</p> : null}{selectedResolution ? <p className="mt-1 text-[11px] text-slate-500">ダウンロード目安 {formatFileSize(selectedResolution.byteLength)}</p> : null}</label>
                    {selected.assetKind === "hdri" ? <label className="flex items-start gap-2 rounded-md bg-slate-50 p-2.5 text-xs text-slate-700"><input type="checkbox" checked={applySkybox} onChange={(event) => setApplySkybox(event.currentTarget.checked)} className="mt-0.5" /><span><span className="block font-semibold">インストール後にSkyboxへ設定</span><span className="mt-0.5 block text-[11px] text-slate-500">後からAssetsのSkyboxをScene Viewへドロップして変更できます。</span></span></label> : <Notice text="Diffuse、Normal、ARMをTextureとして保存し、参照済みMaterialを作成します。" />}
                  </>
                )}
                {!projectPath ? <Notice tone="warning" text="先にプロジェクトを保存すると外部アセットを追加できます。" /> : null}
                {disabledReason ? <Notice tone="warning" text={disabledReason} /> : null}
                {error ? <div className="flex gap-2 rounded-md border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800" role="alert"><CircleAlert size={15} className="shrink-0" /><span>{error}</span></div> : null}
                {installedName ? <div className="flex gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800" role="status"><CheckCircle2 size={15} className="shrink-0" /><span>「{installedName}」を追加しました。Assetsで選択されています。</span></div> : null}
                {selected.assetKind !== "model" ? <button type="button" disabled={!projectPath || !resolution || installing || optionsLoading || Boolean(disabledReason)} onClick={() => void install()} className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-45">{installing ? <><LoaderCircle size={16} className="animate-spin" />ダウンロード中</> : selected.assetKind === "hdri" && applySkybox ? "インストールしてSkyboxに設定" : "プロジェクトへインストール"}</button> : null}
              </div>
            ) : <StoreState icon={<Store size={22} />} text="アセットを選択してください" />}
          </aside>
        </div>
      </div>
    </div>
  );
}

function StoreState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center text-xs text-slate-500">{icon}<p>{text}</p></div>;
}

function Notice({ text, tone = "neutral" }: { text: string; tone?: "neutral" | "warning" }) {
  return <p className={`rounded-md border px-2.5 py-2 text-xs leading-5 ${tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-600"}`}>{text}</p>;
}

function kindLabel(kind: ExternalStoreAsset["assetKind"]): string {
  if (kind === "hdri") return "Skybox / HDRI";
  if (kind === "texture") return "Material / Texture";
  return "Model";
}

function errorMessage(reason: unknown, fallback: string): string {
  return typeof reason === "string" && reason.trim()
    ? reason
    : reason instanceof Error && reason.message.trim()
      ? reason.message
      : fallback;
}
