import { useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Brush,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  Search,
  Store,
  X,
} from "lucide-react";
import {
  tauri,
  type ExternalStoreAsset,
  type ExternalStoreAssetOptions,
  type ExternalStoreFileFormat,
  type ExternalStoreInstallResult,
} from "../../lib/tauri";
import {
  OPEN_BRUSH_CATALOG,
  OPEN_BRUSH_CATALOG_LICENSE_URL,
  OPEN_BRUSH_CATALOG_SOURCE_URL,
  openBrushCategoryLabel,
  type OpenBrushCatalogCategory,
  type OpenBrushCatalogEntry,
  type VisualProjectKind,
  type XriftComponentDefinition,
} from "../../lib/visual-editor";
import {
  DEFAULT_EXTERNAL_STORE_PROVIDER_ID,
  EXTERNAL_STORE_PROVIDERS,
  getExternalStoreProvider,
  type ExternalStoreProvider,
} from "../../lib/visual-editor/external-store-providers";
import { formatFileSize } from "./editor-utils";
import { OfficialXriftComponentStore } from "./OfficialXriftComponentStore";
import { OpenBrushCatalogPreview } from "./OpenBrushCatalogPreview";

type StoreKindFilter = "all" | ExternalStoreAsset["assetKind"];

export function ExternalAssetStoreDialog({
  open,
  projectPath,
  projectKind,
  disabledReason,
  onClose,
  onInstalled,
  onAddOpenBrush,
  onAddOfficialComponent,
}: {
  open: boolean;
  projectPath?: string;
  projectKind: VisualProjectKind;
  disabledReason?: string | null;
  onClose: () => void;
  onInstalled: (
    result: ExternalStoreInstallResult,
    applySkybox: boolean,
  ) => void;
  onAddOpenBrush: (
    entry: OpenBrushCatalogEntry,
  ) => Promise<{ alreadyInstalled: boolean }>;
  onAddOfficialComponent: (
    definition: XriftComponentDefinition,
  ) => Promise<boolean>;
}) {
  const [providerId, setProviderId] = useState<string>(DEFAULT_EXTERNAL_STORE_PROVIDER_ID);
  const provider = getExternalStoreProvider(providerId);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [assets, setAssets] = useState<ExternalStoreAsset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<StoreKindFilter>("all");
  const [loading, setLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [options, setOptions] = useState<ExternalStoreAssetOptions | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [resolution, setResolution] = useState("");
  const [fileFormat, setFileFormat] = useState<ExternalStoreFileFormat | "">("");
  const [applySkybox, setApplySkybox] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [installedName, setInstalledName] = useState<string | null>(null);

  useEffect(() => {
    if (!open || provider.kind !== "remote-assets") {
      setLoading(false);
      setAssets([]);
      setSelectedId(null);
      return;
    }
    let active = true;
    setLoading(true);
    setCatalogError(null);
    setDetailError(null);
    setAssets([]);
    setSelectedId(null);
    setOptions(null);
    setResolution("");
    setFileFormat("");
    void tauri
      .listExternalStoreAssets(provider.id)
      .then((items) => {
        if (!active) return;
        setAssets(items);
        const firstInstallable = items.find((item) => canInstall(provider, item.assetKind));
        setSelectedId(firstInstallable?.externalId ?? items[0]?.externalId ?? null);
      })
      .catch((reason: unknown) => {
        if (active) {
          setCatalogError(
            errorMessage(reason, `${provider.name}の一覧を取得できませんでした`),
          );
        }
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [catalogRevision, open, provider]);

  const selected = assets.find((asset) => asset.externalId === selectedId);
  const selectedIsInstallable = selected
    ? canInstall(provider, selected.assetKind)
    : false;

  useEffect(() => {
    if (
      !open ||
      provider.kind !== "remote-assets" ||
      !selected ||
      !selectedIsInstallable
    ) {
      setOptions(null);
      setResolution("");
      setFileFormat("");
      return;
    }
    let active = true;
    setOptionsLoading(true);
    setOptions(null);
    setDetailError(null);
    void tauri
      .getExternalStoreAssetOptions(selected.providerId, selected.externalId)
      .then((next) => {
        if (!active) return;
        setOptions(next);
        const preferred = next.resolutions.find((entry) => entry.id === "2k")
          ?? next.resolutions[0];
        setResolution(preferred?.id ?? "");
        setFileFormat(
          preferred?.formats.find((entry) => entry.id === "hdr")?.id
            ?? preferred?.formats[0]?.id
            ?? "",
        );
      })
      .catch((reason: unknown) => {
        if (active) {
          setDetailError(errorMessage(reason, "ダウンロード情報を取得できませんでした"));
        }
      })
      .finally(() => active && setOptionsLoading(false));
    return () => {
      active = false;
    };
  }, [open, provider.kind, selected, selectedIsInstallable]);

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
  const selectedFormat = selectedResolution?.formats.find((entry) => entry.id === fileFormat);

  const selectProvider = (nextProviderId: string) => {
    if (installing || nextProviderId === provider.id) return;
    setProviderId(nextProviderId);
    setQuery("");
    setKind("all");
    setInstalledName(null);
    setApplySkybox(true);
  };

  const selectResolution = (nextResolution: string) => {
    setResolution(nextResolution);
    const next = options?.resolutions.find((entry) => entry.id === nextResolution);
    setFileFormat((current) =>
      next?.formats.some((entry) => entry.id === current)
        ? current
        : next?.formats.find((entry) => entry.id === "hdr")?.id
          ?? next?.formats[0]?.id
          ?? "",
    );
  };

  const install = async () => {
    if (
      !projectPath
      || !selected
      || !selectedIsInstallable
      || !resolution
      || (selected.assetKind === "hdri" && !fileFormat)
      || installing
      || disabledReason
    ) return;
    setInstalling(true);
    setDetailError(null);
    setInstalledName(null);
    try {
      const result = await tauri.installExternalStoreAsset(projectPath, {
        providerId: selected.providerId,
        externalId: selected.externalId,
        resolution,
        ...(selected.assetKind === "hdri"
          ? { format: fileFormat as ExternalStoreFileFormat }
          : {}),
      });
      onInstalled(result, result.assetKind === "hdri" && applySkybox);
      const environmentFormat = result.files.find((entry) => entry.role === "environment")?.format;
      setInstalledName(
        environmentFormat
          ? `${result.name} (${environmentFormat.toUpperCase()})`
          : result.name,
      );
    } catch (reason) {
      setDetailError(errorMessage(reason, "アセットをインストールできませんでした"));
    } finally {
      setInstalling(false);
    }
  };

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="external-store-title"
    >
      <div className="flex h-[min(760px,92vh)] w-[min(1320px,96vw)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-2xl">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5">
          <div className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
              <Store size={17} aria-hidden="true" />
            </span>
            <div>
              <h2 id="external-store-title" className="text-sm font-semibold text-slate-900">
                外部リソースを追加
              </h2>
              <p className="text-[11px] text-slate-500">
                配布元を選び、外部アセットをプロジェクトへ追加します
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={installing}
            aria-label="外部リソースを閉じる"
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
          >
            <X size={17} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <nav
            className="flex w-52 shrink-0 flex-col border-r border-slate-200 bg-slate-50"
            aria-label="外部リソース集"
          >
            <div className="border-b border-slate-200 px-3 py-3">
              <p className="text-xs font-semibold text-slate-800">リソース集</p>
              <p className="mt-0.5 text-[10px] leading-4 text-slate-500">配布元ごとに一覧を切り替えます</p>
            </div>
            <div className="space-y-1.5 p-2">
              {EXTERNAL_STORE_PROVIDERS.map((entry) => {
                const selectedProvider = entry.id === provider.id;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    disabled={installing}
                    onClick={() => selectProvider(entry.id)}
                    aria-pressed={selectedProvider}
                    className={`flex w-full items-start gap-2.5 rounded-lg border px-2.5 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      selectedProvider
                        ? "border-brand-300 bg-white text-slate-900 shadow-sm ring-1 ring-brand-100"
                        : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-white"
                    }`}
                  >
                    <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md ${selectedProvider ? "bg-brand-50 text-brand-700" : "bg-slate-200 text-slate-500"}`}>
                      <ProviderIcon kind={entry.kind} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-1">
                        <span className="truncate text-xs font-semibold">{entry.name}</span>
                        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">
                          {entry.badge}
                        </span>
                      </span>
                      <span className="mt-1 block text-[10px] leading-4 text-slate-500">
                        {entry.summary}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-auto border-t border-slate-200 px-3 py-3 text-[10px] leading-4 text-slate-500">
              選択したリソース集のカタログ、利用条件、提供元情報を表示します。
            </p>
          </nav>

          {provider.kind === "open-brush" ? (
            <OpenBrushStore
              disabledReason={disabledReason}
              onAdd={onAddOpenBrush}
            />
          ) : provider.kind === "xrift-components" ? (
            <OfficialXriftComponentStore
              projectKind={projectKind}
              disabledReason={disabledReason}
              onAdd={onAddOfficialComponent}
            />
          ) : (
            <>
          <section
            className="flex min-w-0 flex-1 flex-col border-r border-slate-200"
            aria-label={`${provider.name}のアセット一覧`}
          >
            <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2.5">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-800">{provider.name}</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    {installableKindsLabel(provider)}をプロジェクトへ追加できます
                  </p>
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-600">
                  {provider.badge}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <label className="relative min-w-0 flex-1">
                  <Search size={14} className="pointer-events-none absolute left-2.5 top-2 text-slate-400" />
                  <span className="sr-only">{provider.name}を検索</span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.currentTarget.value)}
                    placeholder="名前、カテゴリ、タグで検索"
                    className="h-8 w-full rounded-md border border-slate-300 bg-white pl-8 pr-3 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  />
                </label>
                <select
                  value={kind}
                  onChange={(event) => setKind(event.currentTarget.value as StoreKindFilter)}
                  aria-label="アセット種別"
                  className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700"
                >
                  <option value="all">すべて</option>
                  {provider.catalogKinds.map((entry) => (
                    <option key={entry} value={entry}>{kindLabel(entry)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="scrollbar-thin min-h-0 flex-1 overflow-auto p-3">
              {loading ? (
                <StoreState
                  icon={<LoaderCircle className="animate-spin" size={22} />}
                  text={`${provider.name}から読み込んでいます`}
                />
              ) : null}
              {!loading && catalogError ? (
                <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center" role="alert">
                  <CircleAlert size={22} className="text-rose-500" />
                  <p className="max-w-sm text-xs leading-5 text-rose-700">{catalogError}</p>
                  <button
                    type="button"
                    onClick={() => setCatalogRevision((value) => value + 1)}
                    className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <RefreshCw size={13} aria-hidden="true" />
                    再試行
                  </button>
                </div>
              ) : null}
              {!loading && !catalogError && visibleAssets.length === 0 ? (
                <StoreState icon={<Search size={22} />} text="条件に合うアセットがありません" />
              ) : null}
              {!loading && !catalogError ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2.5">
                  {visibleAssets.map((asset) => (
                    <button
                      key={asset.externalId}
                      type="button"
                      onClick={() => {
                        setSelectedId(asset.externalId);
                        setInstalledName(null);
                      }}
                      aria-pressed={selectedId === asset.externalId}
                      className={`overflow-hidden rounded-lg border bg-white text-left transition ${
                        selectedId === asset.externalId
                          ? "border-brand-400 ring-2 ring-brand-100"
                          : "border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
                      }`}
                    >
                      <div className="aspect-square bg-slate-100">
                        <img
                          src={asset.thumbnailUrl}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="p-2.5">
                        <p className="truncate text-xs font-semibold text-slate-800">{asset.name}</p>
                        <p className="mt-1 text-[10px] font-medium text-slate-500">
                          {kindLabel(asset.assetKind)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <footer className="shrink-0 border-t border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
              Powered by{" "}
              <button
                type="button"
                onClick={() => void tauri.openUrl(provider.homepageUrl)}
                className="font-semibold text-brand-700 hover:underline"
              >
                {provider.name}
              </button>
              。{provider.attributionNote}
            </footer>
          </section>

          <aside
            className="scrollbar-thin w-[330px] shrink-0 overflow-auto bg-white p-4"
            aria-label="選択したアセットの詳細"
          >
            {selected ? (
              <div className="space-y-4">
                <img
                  src={selected.thumbnailUrl}
                  alt={`${selected.name}のプレビュー`}
                  className="aspect-[16/10] w-full rounded-lg bg-slate-100 object-cover"
                />
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-semibold text-slate-900">{selected.name}</h3>
                    <button
                      type="button"
                      onClick={() => void tauri.openUrl(selected.assetUrl)}
                      title={`${provider.name}で開く`}
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                    >
                      <ExternalLink size={15} />
                    </button>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{selected.description}</p>
                </div>
                <dl className="grid grid-cols-[76px_1fr] gap-x-2 gap-y-1.5 text-xs">
                  <dt className="text-slate-400">提供元</dt>
                  <dd className="font-medium text-slate-700">{provider.name}</dd>
                  <dt className="text-slate-400">作者</dt>
                  <dd className="text-slate-700">
                    {selected.authors.join("、") || provider.authorFallback}
                  </dd>
                  <dt className="text-slate-400">ライセンス</dt>
                  <dd>
                    <button
                      type="button"
                      onClick={() => void tauri.openUrl(selected.licenseUrl)}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {selected.licenseName}
                    </button>
                  </dd>
                  <dt className="text-slate-400">カテゴリ</dt>
                  <dd className="text-slate-700">{selected.category || "未分類"}</dd>
                </dl>
                {!selectedIsInstallable ? (
                  <Notice
                    text={`${kindLabel(selected.assetKind)}の直接インストールには対応していません。現在は${installableKindsLabel(provider)}を追加できます。`}
                  />
                ) : (
                  <>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-slate-700">解像度</span>
                      <select
                        value={resolution}
                        disabled={optionsLoading || installing}
                        onChange={(event) => selectResolution(event.currentTarget.value)}
                        className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs disabled:bg-slate-100"
                      >
                        <option value="">選択してください</option>
                        {options?.resolutions.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.label}
                            {selected.assetKind === "hdri"
                              ? `・${entry.formats.map((format) => format.label).join(" / ")}`
                              : `・${formatFileSize(entry.byteLength)}・${entry.fileCount}ファイル`}
                          </option>
                        ))}
                      </select>
                      {optionsLoading ? (
                        <p className="mt-1 text-[11px] text-slate-500">利用可能なファイルを確認中です</p>
                      ) : null}
                    </label>
                    {selected.assetKind === "hdri" ? (
                      <>
                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold text-slate-700">ファイル形式</span>
                          <select
                            value={fileFormat}
                            disabled={optionsLoading || installing || !selectedResolution}
                            onChange={(event) => setFileFormat(event.currentTarget.value as ExternalStoreFileFormat)}
                            className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs disabled:bg-slate-100"
                          >
                            <option value="">選択してください</option>
                            {selectedResolution?.formats.map((entry) => (
                              <option key={entry.id} value={entry.id}>
                                {entry.label}・{formatFileSize(entry.byteLength)}
                              </option>
                            ))}
                          </select>
                          {selectedFormat ? (
                            <p className="mt-1 text-[11px] text-slate-500">
                              ダウンロード目安 {formatFileSize(selectedFormat.byteLength)}。{selectedFormat.label}を環境Texture Assetとして保存します。
                            </p>
                          ) : null}
                        </label>
                        <label className="flex items-start gap-2 rounded-md bg-slate-50 p-2.5 text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={applySkybox}
                            onChange={(event) => setApplySkybox(event.currentTarget.checked)}
                            className="mt-0.5"
                          />
                          <span>
                            <span className="block font-semibold">インストール後にSkyboxへ設定</span>
                            <span className="mt-0.5 block text-[11px] text-slate-500">
                              HDRとEXRはどちらもTexture Assetになり、Flip Yなどを編集できます。後からScene Viewへドロップして変更できます。
                            </span>
                          </span>
                        </label>
                      </>
                    ) : selected.assetKind === "model" ? (
                      <>
                        <p className="text-[11px] text-slate-500">
                          ダウンロード目安 {selectedResolution ? formatFileSize(selectedResolution.byteLength) : "—"}
                        </p>
                        <Notice text="glTF本体・bin・Textureを検証し、参照切れを防ぐ自己完結glTF Model Assetとして保存します。" />
                      </>
                    ) : (
                      <>
                        <p className="text-[11px] text-slate-500">
                          ダウンロード目安 {selectedResolution ? formatFileSize(selectedResolution.byteLength) : "—"}
                        </p>
                        <Notice text="Diffuse、Normal、ARMをTextureとして保存し、参照済みMaterialを作成します。" />
                      </>
                    )}
                  </>
                )}
                {!projectPath ? (
                  <Notice tone="warning" text="先にプロジェクトを保存すると外部アセットを追加できます。" />
                ) : null}
                {disabledReason ? <Notice tone="warning" text={disabledReason} /> : null}
                {detailError ? (
                  <div
                    className="flex gap-2 rounded-md border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800"
                    role="alert"
                  >
                    <CircleAlert size={15} className="shrink-0" />
                    <span>{detailError}</span>
                  </div>
                ) : null}
                {installedName ? (
                  <div
                    className="flex gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800"
                    role="status"
                  >
                    <CheckCircle2 size={15} className="shrink-0" />
                    <span>「{installedName}」を追加しました。Assetsで選択されています。</span>
                  </div>
                ) : null}
                {selectedIsInstallable ? (
                  <button
                    type="button"
                    disabled={
                      !projectPath
                      || !resolution
                      || (selected.assetKind === "hdri" && !fileFormat)
                      || installing
                      || optionsLoading
                      || Boolean(disabledReason)
                    }
                    onClick={() => void install()}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {installing ? (
                      <>
                        <LoaderCircle size={16} className="animate-spin" />
                        ダウンロード中
                      </>
                    ) : selected.assetKind === "hdri" && applySkybox ? (
                      `${fileFormat.toUpperCase()}をインストールしてSkyboxに設定`
                    ) : (
                      "プロジェクトへインストール"
                    )}
                  </button>
                ) : null}
              </div>
            ) : (
              <StoreState icon={<Store size={22} />} text="アセットを選択してください" />
            )}
          </aside>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function OpenBrushStore({
  disabledReason,
  onAdd,
}: {
  disabledReason?: string | null;
  onAdd: (
    entry: OpenBrushCatalogEntry,
  ) => Promise<{ alreadyInstalled: boolean }>;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | OpenBrushCatalogCategory>(
    "all",
  );
  const [selectedId, setSelectedId] = useState(
    OPEN_BRUSH_CATALOG[0]?.id ?? "",
  );
  const [adding, setAdding] = useState(false);
  const [addedMessage, setAddedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const visible = useMemo(() => {
    const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return OPEN_BRUSH_CATALOG.filter(
      (entry) => category === "all" || entry.category === category,
    ).filter((entry) => {
      const text = [
        entry.label,
        entry.brushName,
        entry.brushGuid,
        openBrushCategoryLabel(entry.category),
      ]
        .join(" ")
        .toLocaleLowerCase();
      return tokens.every((token) => text.includes(token));
    });
  }, [category, query]);
  const selected =
    OPEN_BRUSH_CATALOG.find((entry) => entry.id === selectedId) ??
    OPEN_BRUSH_CATALOG[0];

  const addSelected = async () => {
    if (!selected || adding || disabledReason) return;
    setAdding(true);
    setAddedMessage(null);
    setError(null);
    try {
      const result = await onAdd(selected);
      setAddedMessage(
        result.alreadyInstalled
          ? `「${selected.label}」は追加済みです。Assetsで選択しました。`
          : `「${selected.label}」をMaterialとして追加しました。`,
      );
    } catch (reason) {
      setError(errorMessage(reason, "Open Brush Materialを追加できませんでした"));
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      <section
        className="flex min-w-0 flex-1 flex-col border-r border-slate-200"
        aria-label="Open Brush Material一覧"
      >
        <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2.5">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-xs font-semibold text-slate-900">
                Open Brush Material
              </h3>
              <p className="mt-0.5 text-[10px] leading-4 text-slate-500">
                検証済み48ブラシを専用shaderのMaterialとして追加できます
              </p>
            </div>
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-semibold text-sky-700">
              {OPEN_BRUSH_CATALOG.length} brushes
            </span>
          </div>
          <div className="flex items-center gap-2">
            <label className="relative min-w-0 flex-1">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-2 text-slate-400"
              />
              <span className="sr-only">Open Brushを検索</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="ブラシ名またはGUIDで検索"
                className="h-8 w-full rounded-md border border-slate-300 bg-white pl-8 pr-3 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </label>
            <select
              value={category}
              onChange={(event) =>
                setCategory(
                  event.currentTarget.value as
                    | "all"
                    | OpenBrushCatalogCategory,
                )
              }
              aria-label="Open Brushカテゴリ"
              className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700"
            >
              <option value="all">すべて</option>
              {(["paint", "light", "effect", "geometry"] as const).map(
                (entry) => (
                  <option key={entry} value={entry}>
                    {openBrushCategoryLabel(entry)}
                  </option>
                ),
              )}
            </select>
          </div>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-auto p-3">
          {visible.length === 0 ? (
            <StoreState
              icon={<Search size={22} />}
              text="条件に合うブラシがありません"
            />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(145px,1fr))] gap-2.5">
              {visible.map((entry) => {
                const active = entry.id === selected?.id;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setSelectedId(entry.id);
                      setAddedMessage(null);
                      setError(null);
                    }}
                    className={`overflow-hidden rounded-lg border bg-white text-left transition ${
                      active
                        ? "border-brand-400 ring-2 ring-brand-100"
                        : "border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
                    }`}
                  >
                    <div className="flex aspect-[16/9] items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950 to-cyan-950 text-cyan-100">
                      <Brush size={26} aria-hidden="true" />
                    </div>
                    <div className="p-2.5">
                      <p className="truncate text-xs font-semibold text-slate-800">
                        {entry.label}
                      </p>
                      <p className="mt-1 text-[10px] font-medium text-slate-500">
                        {openBrushCategoryLabel(entry.category)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <footer className="shrink-0 border-t border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
          一覧は軽量表示し、選択中の1件だけを右側の共有プレビューで実描画します。
        </footer>
      </section>

      <aside
        className="scrollbar-thin w-[350px] shrink-0 overflow-auto bg-white p-4"
        aria-label="選択したOpen Brush Materialの詳細"
      >
        {selected ? (
          <div className="space-y-4">
            <OpenBrushCatalogPreview
              entry={selected}
              className="aspect-[16/10] w-full rounded-lg"
            />
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    {selected.label}
                  </h3>
                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-700">
                    {openBrushCategoryLabel(selected.category)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void tauri.openUrl(OPEN_BRUSH_CATALOG_SOURCE_URL)}
                  title="three-icosa公式ソースを開く"
                  className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                >
                  <ExternalLink size={15} aria-hidden="true" />
                </button>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                {selected.description}
              </p>
            </div>
            <dl className="grid grid-cols-[76px_1fr] gap-x-2 gap-y-1.5 text-xs">
              <dt className="text-slate-400">Brush</dt>
              <dd className="font-medium text-slate-700">
                {selected.brushName}
              </dd>
              <dt className="text-slate-400">GUID</dt>
              <dd className="break-all font-mono text-[10px] text-slate-600">
                {selected.brushGuid}
              </dd>
              <dt className="text-slate-400">Renderer</dt>
              <dd className="text-slate-700">
                {selected.shader.rendererVersion}
              </dd>
              <dt className="text-slate-400">License</dt>
              <dd>
                <button
                  type="button"
                  onClick={() =>
                    void tauri.openUrl(OPEN_BRUSH_CATALOG_LICENSE_URL)
                  }
                  className="font-medium text-brand-700 hover:underline"
                >
                  Apache-2.0
                </button>
              </dd>
            </dl>
            <Notice text="追加後はMaterial Assetとして保持し、PrimitiveやOpen Brush Meshへ割り当てられます。GUIDとrenderer versionも保存します。" />
            {disabledReason ? (
              <Notice tone="warning" text={disabledReason} />
            ) : null}
            {error ? (
              <div
                className="flex gap-2 rounded-md border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800"
                role="alert"
              >
                <CircleAlert size={15} className="shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}
            {addedMessage ? (
              <div
                className="flex gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800"
                role="status"
              >
                <CheckCircle2 size={15} className="shrink-0" />
                <span>{addedMessage}</span>
              </div>
            ) : null}
            <button
              type="button"
              disabled={adding || Boolean(disabledReason)}
              onClick={() => void addSelected()}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {adding ? (
                <>
                  <LoaderCircle size={16} className="animate-spin" />
                  追加中
                </>
              ) : (
                `${selected.label}をMaterialへ追加`
              )}
            </button>
          </div>
        ) : null}
      </aside>
    </>
  );
}

function ProviderIcon({ kind }: { kind: ExternalStoreProvider["kind"] }) {
  if (kind === "open-brush") return <Brush size={14} aria-hidden="true" />;
  if (kind === "xrift-components") {
    return <Boxes size={14} aria-hidden="true" />;
  }
  return <Store size={14} aria-hidden="true" />;
}

function StoreState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center text-xs text-slate-500">
      {icon}
      <p>{text}</p>
    </div>
  );
}

function Notice({ text, tone = "neutral" }: { text: string; tone?: "neutral" | "warning" }) {
  return (
    <p className={`rounded-md border px-2.5 py-2 text-xs leading-5 ${
      tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-slate-200 bg-slate-50 text-slate-600"
    }`}>
      {text}
    </p>
  );
}

function canInstall(
  provider: ExternalStoreProvider,
  kind: ExternalStoreAsset["assetKind"],
): boolean {
  return provider.installableKinds.some((entry) => entry === kind);
}

function installableKindsLabel(provider: ExternalStoreProvider): string {
  return provider.installableKinds.map(kindLabel).join("、");
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
