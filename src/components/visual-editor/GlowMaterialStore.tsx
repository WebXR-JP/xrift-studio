import { useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle, Search } from "lucide-react";
import {
  DEFAULT_SCENE_SETTINGS,
  GLOW_MATERIAL_PRESETS,
  glowEmissiveStrength,
  tintRelativeLuminance,
  type GlowMaterialPreset,
} from "../../lib/visual-editor";
import { GlowMaterialCatalogPreview } from "./GlowMaterialCatalogPreview";

export type GlowMaterialInstallResult = {
  entityName: string;
};

/**
 * The glow shelf of the external resource store.
 *
 * Placing one adds a cube whose Material is emissive enough to bloom, which is
 * the cheapest lighting an author can add: no light count, no shadow map, just
 * a surface the compositor blooms. Like Terrain, it arrives as an ordinary
 * Entity, so the Transform, the Material and the Mesh all stay editable.
 */
export function GlowMaterialStore({
  disabledReason,
  bloomActive,
  onAdd,
}: {
  disabledReason?: string | null;
  /** Whether this scene will actually bloom, so the shelf can say if it will not. */
  bloomActive: boolean;
  onAdd: (preset: GlowMaterialPreset) => Promise<GlowMaterialInstallResult>;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(
    GLOW_MATERIAL_PRESETS[0]?.id ?? "",
  );
  const [adding, setAdding] = useState(false);
  const [addedMessage, setAddedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected =
    GLOW_MATERIAL_PRESETS.find((preset) => preset.id === selectedId) ??
    GLOW_MATERIAL_PRESETS[0];
  const visible = useMemo(() => {
    const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return GLOW_MATERIAL_PRESETS.filter((preset) => {
      const text = [preset.id, preset.label, preset.description]
        .join(" ")
        .toLocaleLowerCase();
      return tokens.every((token) => text.includes(token));
    });
  }, [query]);

  // What the author is agreeing to. A saturated tint needs a much higher
  // emissive strength to clear the same threshold, and that is worth seeing
  // before placing rather than wondering about afterwards.
  const summary = useMemo(() => {
    if (!selected) return null;
    const threshold = DEFAULT_SCENE_SETTINGS.postprocessing.bloom.threshold;
    return {
      strength: glowEmissiveStrength(selected.tint),
      luminance: tintRelativeLuminance(selected.tint),
      threshold,
    };
  }, [selected]);

  const addSelected = async () => {
    if (!selected || adding || disabledReason) return;
    setAdding(true);
    setAddedMessage(null);
    setError(null);
    try {
      const result = await onAdd(selected);
      setAddedMessage(
        `「${result.entityName}」をSceneへ追加しました。大きさはTransform、色や強さはMaterial Inspectorで変えられます。`,
      );
    } catch (reason) {
      setError(
        reason instanceof Error && reason.message.trim()
          ? reason.message
          : "光るキューブを追加できませんでした",
      );
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      <section
        className="flex min-w-0 flex-1 flex-col border-r border-slate-200"
        aria-label="光るMaterial一覧"
      >
        <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2.5">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-xs font-semibold text-slate-900">
                光るキューブ
              </h3>
              <p className="mt-0.5 text-[10px] leading-4 text-slate-500">
                Bloomで光って見えるMaterialです。手軽な間接照明として置けます
              </p>
            </div>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
              {GLOW_MATERIAL_PRESETS.length} materials
            </span>
          </div>
          <label className="relative block">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-2 text-slate-400"
            />
            <span className="sr-only">光るMaterialを検索</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="名前または説明で検索"
              className="h-8 w-full rounded-md border border-slate-300 bg-white pl-8 pr-3 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </label>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-auto p-3">
          {visible.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center text-xs text-slate-500">
              <Search size={22} />
              <p>条件に合うMaterialがありません</p>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2.5">
              {visible.map((preset) => {
                const active = preset.id === selected?.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setSelectedId(preset.id);
                      setAddedMessage(null);
                      setError(null);
                    }}
                    className={`overflow-hidden rounded-lg border bg-white text-left transition ${
                      active
                        ? "border-brand-400 ring-2 ring-brand-100"
                        : "border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
                    }`}
                  >
                    <GlowMaterialCatalogPreview
                      preset={preset}
                      className="aspect-[16/10] w-full"
                    />
                    <div className="p-2.5">
                      <p className="truncate text-xs font-semibold text-slate-800">
                        {preset.label}
                      </p>
                      <p className="mt-1 text-[10px] font-medium text-slate-500">
                        発光強度 {glowEmissiveStrength(preset.tint)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <footer className="shrink-0 border-t border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
          カードは実際のMaterialをWebGLで描画しています。Bloomの光り方は右の詳細で確認できます。
        </footer>
      </section>

      <aside
        className="scrollbar-thin w-[350px] shrink-0 overflow-auto bg-white p-4"
        aria-label="選択したMaterialの詳細"
      >
        {selected ? (
          <div className="space-y-4">
            <GlowMaterialCatalogPreview
              preset={selected}
              className="aspect-[16/10] w-full overflow-hidden rounded-lg"
              bloom
            />
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {selected.label}
              </h3>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                {selected.description}
              </p>
            </div>
            {summary ? (
              <dl className="grid grid-cols-[92px_1fr] gap-x-2 gap-y-1.5 text-xs">
                <dt className="text-slate-400">色</dt>
                <dd className="flex items-center gap-1.5 text-slate-700">
                  <span
                    aria-hidden="true"
                    className="inline-block h-3 w-3 rounded-sm border border-slate-300"
                    style={{ backgroundColor: selected.tint }}
                  />
                  <span className="font-mono">{selected.tint}</span>
                </dd>
                <dt className="text-slate-400">発光強度</dt>
                <dd className="text-slate-700">{summary.strength}</dd>
                <dt className="text-slate-400">Bloom閾値</dt>
                <dd className="text-slate-700">{summary.threshold}</dd>
              </dl>
            ) : null}
            <Notice text="発光強度は色ごとに決めています。同じ明るさに見えても、濃い色ほどBloomが拾う輝度は低いためです。" />
            {bloomActive ? null : (
              <Notice
                tone="warning"
                text="このSceneはポストエフェクトかBloomが無効なので、置いても光りません。Scene設定から有効にしてください。"
              />
            )}
            <Notice text="追加するとSceneへキューブEntityが1つ増えます。大きさはTransform、色や強さはMaterial Inspectorで変えられます。" />
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
                `${selected.label}のキューブをSceneへ追加`
              )}
            </button>
          </div>
        ) : null}
      </aside>
    </>
  );
}

function Notice({
  text,
  tone = "neutral",
}: {
  text: string;
  tone?: "neutral" | "warning";
}) {
  return (
    <p
      className={`rounded-md border px-2.5 py-2 text-xs leading-5 ${
        tone === "warning"
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-slate-200 bg-slate-50 text-slate-600"
      }`}
    >
      {text}
    </p>
  );
}
