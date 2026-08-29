import { useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle, Search } from "lucide-react";
import {
  DEFAULT_SCENE_SETTINGS,
  GLOW_FIXTURE_SHAPES,
  GLOW_MATERIAL_PRESETS,
  getGlowMaterialPreset,
  glowEmissiveStrength,
  type GlowFixtureShape,
  type GlowMaterialPreset,
} from "../../lib/visual-editor";
import { GlowMaterialCatalogPreview } from "./GlowMaterialCatalogPreview";

export type GlowMaterialInstallResult = {
  entityName: string;
};

/**
 * The glow shelf of the external resource store.
 *
 * A fixture is a shape plus an emissive Material bright enough to bloom, which
 * is the cheapest lighting an author can add: no light count, no shadow map,
 * just a surface the compositor blooms. Shape and colour are chosen separately
 * so four shapes and four tints stay four decisions rather than sixteen cards.
 * Like Terrain, what lands is an ordinary Entity, so the Transform, the
 * Material and the Mesh all stay editable.
 */
export function GlowMaterialStore({
  disabledReason,
  bloomActive,
  onAdd,
}: {
  disabledReason?: string | null;
  /** Whether this scene will actually bloom, so the shelf can say if it will not. */
  bloomActive: boolean;
  onAdd: (
    shape: GlowFixtureShape,
    preset: GlowMaterialPreset,
  ) => Promise<GlowMaterialInstallResult>;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(GLOW_FIXTURE_SHAPES[0]?.id ?? "");
  // undefined means "whatever the shape reads best in"; a value overrides it.
  const [tintChoice, setTintChoice] = useState<string | undefined>(undefined);
  const [adding, setAdding] = useState(false);
  const [addedMessage, setAddedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected =
    GLOW_FIXTURE_SHAPES.find((shape) => shape.id === selectedId) ??
    GLOW_FIXTURE_SHAPES[0];
  const tint =
    getGlowMaterialPreset(tintChoice ?? selected?.defaultTintId ?? "") ??
    GLOW_MATERIAL_PRESETS[0];
  const visible = useMemo(() => {
    const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return GLOW_FIXTURE_SHAPES.filter((shape) => {
      const text = [shape.id, shape.label, shape.description]
        .join(" ")
        .toLocaleLowerCase();
      return tokens.every((token) => text.includes(token));
    });
  }, [query]);

  // What the author is agreeing to. A saturated tint needs a much higher
  // emissive strength to clear the same threshold, and that is worth seeing
  // before placing rather than wondering about afterwards.
  const summary = useMemo(
    () => ({
      strength: glowEmissiveStrength(tint.tint),
      threshold: DEFAULT_SCENE_SETTINGS.postprocessing.bloom.threshold,
    }),
    [tint],
  );

  const addSelected = async () => {
    if (!selected || adding || disabledReason) return;
    setAdding(true);
    setAddedMessage(null);
    setError(null);
    try {
      const result = await onAdd(selected, tint);
      setAddedMessage(
        `「${result.entityName}」をSceneへ追加しました。大きさはTransform、色や強さはMaterial Inspectorで変えられます。`,
      );
    } catch (reason) {
      setError(
        reason instanceof Error && reason.message.trim()
          ? reason.message
          : "照明を追加できませんでした",
      );
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      <section
        className="flex min-w-0 flex-1 flex-col border-r border-slate-200"
        aria-label="発光オブジェクト一覧"
      >
        <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2.5">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-xs font-semibold text-slate-900">
                発光オブジェクト
              </h3>
              <p className="mt-0.5 text-[10px] leading-4 text-slate-500">
                ネオンのようにBloomで光るオブジェクトです。ライトを増やさずに置けます
              </p>
            </div>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
              {GLOW_FIXTURE_SHAPES.length} fixtures
            </span>
          </div>
          <label className="relative block">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-2 text-slate-400"
            />
            <span className="sr-only">発光オブジェクトを検索</span>
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
              <p>条件に合う照明がありません</p>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2.5">
              {visible.map((shape) => {
                const active = shape.id === selected?.id;
                const cardTint =
                  getGlowMaterialPreset(shape.defaultTintId) ??
                  GLOW_MATERIAL_PRESETS[0];
                return (
                  <button
                    key={shape.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setSelectedId(shape.id);
                      setTintChoice(undefined);
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
                      preset={cardTint}
                      shape={shape}
                      className="aspect-[16/10] w-full"
                    />
                    <div className="p-2.5">
                      <p className="truncate text-xs font-semibold text-slate-800">
                        {shape.label}
                      </p>
                      <p className="mt-1 text-[10px] font-medium text-slate-500">
                        {cardTint.label}
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
        aria-label="選択した照明の詳細"
      >
        {selected ? (
          <div className="space-y-4">
            <GlowMaterialCatalogPreview
              preset={tint}
              shape={selected}
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
            <label className="block text-xs">
              <span className="mb-1 block font-semibold text-slate-700">色</span>
              <select
                value={tint.id}
                disabled={adding}
                onChange={(event) => setTintChoice(event.currentTarget.value)}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs disabled:bg-slate-100"
              >
                {GLOW_MATERIAL_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                    {preset.id === selected.defaultTintId ? "（既定）" : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">
                {tint.description}
              </p>
            </label>
            <dl className="grid grid-cols-[92px_1fr] gap-x-2 gap-y-1.5 text-xs">
              <dt className="text-slate-400">色コード</dt>
              <dd className="flex items-center gap-1.5 text-slate-700">
                <span
                  aria-hidden="true"
                  className="inline-block h-3 w-3 rounded-sm border border-slate-300"
                  style={{ backgroundColor: tint.tint }}
                />
                <span className="font-mono">{tint.tint}</span>
              </dd>
              <dt className="text-slate-400">発光強度</dt>
              <dd className="text-slate-700">{summary.strength}</dd>
              <dt className="text-slate-400">Bloom閾値</dt>
              <dd className="text-slate-700">{summary.threshold}</dd>
            </dl>
            <Notice text="発光強度は色ごとに決めています。同じ明るさに見えても、濃い色ほどBloomが拾う輝度は低いためです。" />
            {bloomActive ? null : (
              <Notice
                tone="warning"
                text="このSceneはポストエフェクトかBloomが無効なので、置いても光りません。Scene設定から有効にしてください。"
              />
            )}
            <Notice text="追加するとSceneへEntityが1つ増えます。大きさや向きはTransform、色や強さはMaterial Inspectorで変えられます。" />
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
                `${selected.label}をSceneへ追加`
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
