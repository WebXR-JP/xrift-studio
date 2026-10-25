import { useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle, Search } from "lucide-react";
import {
  PARTICLE_AUTHORING_PRESETS,
  PARTICLE_PRESET_CATEGORY_LABELS,
  normalizeParticleProperties,
  patchParticleProperties,
  type ParticlePropertiesPatch,
  type ParticleAuthoringPreset,
  type ParticlePresetCategory,
} from "../../lib/visual-editor";
import { ParticlePresetCatalogPreview } from "./ParticlePresetCatalogPreview";
import { ParticlePropertiesEditor } from "./ParticleAssetInspector";
import { getParticlePresetTexture } from "../../lib/visual-editor/particle-preset-textures";

export type ParticlePresetInstallResult = {
  assetName: string;
  placed: boolean;
};

const CATEGORY_ORDER: readonly ParticlePresetCategory[] = [
  "fire",
  "weather",
  "water",
  "nature",
  "effect",
];

/**
 * The Particle shelf of the external resource store.
 *
 * The presets already existed inside the Particle Inspector, which meant an
 * author had to create an empty Particle Asset and know a preset picker was
 * waiting there. Sky and Water are chosen before anything exists; this puts
 * Particles on the same footing, because "I want a campfire" is a decision made
 * before there is an Asset to configure.
 *
 * What lands is an ordinary Particle Asset. Every value stays editable in the
 * Inspector afterwards, so a preset is a starting point rather than a preset
 * the author is stuck inside.
 */
export function ParticlePresetStore({
  disabledReason,
  onAdd,
}: {
  disabledReason?: string | null;
  onAdd: (
    preset: ParticleAuthoringPreset,
    placeInScene: boolean,
  ) => Promise<ParticlePresetInstallResult>;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | ParticlePresetCategory>("all");
  const [selectedId, setSelectedId] = useState(
    PARTICLE_AUTHORING_PRESETS[0]?.id ?? "",
  );
  const [placeInScene, setPlaceInScene] = useState(true);
  const [adding, setAdding] = useState(false);
  const [addedMessage, setAddedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ParticlePropertiesPatch>>({});
  const [restartKey, setRestartKey] = useState(0);

  const basePreset =
    PARTICLE_AUTHORING_PRESETS.find((preset) => preset.id === selectedId) ??
    PARTICLE_AUTHORING_PRESETS[0];
  const selected = useMemo(() => basePreset ? {
    ...basePreset,
    properties: drafts[basePreset.id] ?? basePreset.properties,
  } : undefined, [basePreset, drafts]);
  const properties = useMemo(() => normalizeParticleProperties(selected?.properties), [selected]);
  const changeDraft = (patch: ParticlePropertiesPatch) => {
    if (!selected || adding || disabledReason) return;
    setDrafts((current) => ({
      ...current,
      [selected.id]: patchParticleProperties(normalizeParticleProperties(current[selected.id] ?? selected.properties), patch),
    }));
    setAddedMessage(null);
    setError(null);
  };

  const visible = useMemo(() => {
    const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return PARTICLE_AUTHORING_PRESETS.filter(
      (preset) => category === "all" || preset.category === category,
    ).filter((preset) => {
      const text = [
        preset.id,
        preset.name,
        preset.description,
        PARTICLE_PRESET_CATEGORY_LABELS[preset.category],
      ]
        .join(" ")
        .toLocaleLowerCase();
      return tokens.every((token) => text.includes(token));
    });
  }, [category, query]);

  // The numbers an author needs before placing: how many particles this will
  // ask the GPU for, and how long each one lives. Both drive cost, and both
  // are invisible in a preview that only shows the result.
  const summary = useMemo(() => {
    if (!selected) return null;
    const config = normalizeParticleProperties(selected.properties);
    return {
      maxParticles: config.maxParticles,
      rate: config.emission.rateOverTime,
      burstCount: config.emission.bursts.reduce((total, burst) => total + burst.count * burst.cycles, 0),
      lifetime: `${config.startLifetime.min.toFixed(1)}〜${config.startLifetime.max.toFixed(1)}秒`,
      blending: config.renderer.blending === "additive" ? "加算" : "通常",
      shape:
        config.shape.type === "box"
          ? `箱 ${config.shape.size[0]} × ${config.shape.size[2]} m`
          : config.shape.type === "sphere"
            ? `球半径 ${config.shape.radius} m`
            : config.shape.type === "cone"
              ? `円錐 ${config.shape.angle}度`
              : "一点",
    };
  }, [selected]);

  const addSelected = async () => {
    if (!selected || adding || disabledReason) return;
    setAdding(true);
    setAddedMessage(null);
    setError(null);
    try {
      const result = await onAdd(selected, placeInScene);
      setAddedMessage(
        result.placed
          ? `「${result.assetName}」をシーンへ配置しました`
          : `「${result.assetName}」をAssetsに追加しました。シーンへドラッグして配置できます。`,
      );
    } catch (reason) {
      setError(
        reason instanceof Error && reason.message.trim()
          ? reason.message
          : "パーティクルを追加できませんでした",
      );
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      <section
        className="flex min-w-0 flex-1 flex-col border-r border-slate-200"
        aria-label="パーティクルプリセット一覧"
      >
        <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2.5">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-xs font-semibold text-slate-900">パーティクル</h3>
              <p className="mt-0.5 text-[10px] leading-4 text-slate-500">
                炎、雪、花火などを選び、動く見本で色や量を調整して追加できます。
              </p>
            </div>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">
              {PARTICLE_AUTHORING_PRESETS.length} プリセット
            </span>
          </div>
          <div className="flex items-center gap-2">
            <label className="relative min-w-0 flex-1">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-2 text-slate-400"
              />
              <span className="sr-only">パーティクルを検索</span>
              <input
                disabled={adding}
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="名前または説明で検索"
                className="h-8 w-full rounded-md border border-slate-300 bg-white pl-8 pr-3 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </label>
            <select
              disabled={adding}
              value={category}
              onChange={(event) =>
                setCategory(
                  event.currentTarget.value as "all" | ParticlePresetCategory,
                )
              }
              aria-label="パーティクルのカテゴリ"
              className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700"
            >
              <option value="all">すべて</option>
              {CATEGORY_ORDER.map((entry) => (
                <option key={entry} value={entry}>
                  {PARTICLE_PRESET_CATEGORY_LABELS[entry]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-auto p-3">
          {visible.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center text-xs text-slate-500">
              <Search size={22} />
              <p>条件に合うパーティクルがありません</p>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5">
              {visible.map((preset) => {
                const active = preset.id === selected?.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={adding}
                    data-catalog-card
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
                    <ParticlePresetCatalogPreview
                      preset={preset}
                      className="aspect-[16/10] w-full"
                    />
                    <div className="p-2.5">
                      <p className="truncate text-xs font-semibold text-slate-800">
                        {preset.name}
                      </p>
                      <p className="mt-1 text-[10px] font-medium text-slate-500">
                        {PARTICLE_PRESET_CATEGORY_LABELS[preset.category]}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <aside
        className="scrollbar-thin w-[350px] shrink-0 overflow-auto bg-white p-4"
        aria-label="選択したパーティクルの詳細"
      >
        {selected && summary ? (
          <div className="space-y-4">
            <ParticlePresetCatalogPreview
              preset={selected}
              className="aspect-[16/10] w-full overflow-hidden rounded-lg"
              detail
              live
              restartKey={restartKey}
            />
            <button type="button" className="text-xs text-brand-600" onClick={() => setRestartKey((value) => value + 1)}>見本を再生し直す</button>
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {selected.name}
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                {selected.description}
              </p>
            </div>

            <dl className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px]">
              <SummaryRow label="最大数" value={`${summary.maxParticles} 粒`} />
              <SummaryRow label="放出" value={`毎秒 ${summary.rate} 粒`} />
              {summary.burstCount > 0 ? <SummaryRow label="Burstの合計" value={`${summary.burstCount} 粒${properties.looping ? " / ループ" : ""}`} /> : null}
              <SummaryRow label="寿命" value={summary.lifetime} />
              <SummaryRow label="放出形状" value={summary.shape} />
              <SummaryRow label="ブレンド" value={summary.blending} />
              <SummaryRow label="テクスチャ" value={getParticlePresetTexture(selected.id)?.name ?? "なし"} />
            </dl>

            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-2.5">
              <input
                disabled={adding}
                type="checkbox"
                checked={placeInScene}
                onChange={(event) => setPlaceInScene(event.currentTarget.checked)}
                className="mt-0.5"
              />
              <span className="text-[11px] leading-4 text-slate-600">
                <span className="font-semibold text-slate-800">
                  追加後にシーンへ配置
                </span>
                <br />
                放出用のEntityも配置します。オフにするとAssetsへの追加のみになります。
              </span>
            </label>

            <button
              type="button"
              onClick={addSelected}
              disabled={Boolean(disabledReason) || adding}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {adding ? (
                <>
                  <LoaderCircle size={13} className="animate-spin" />
                  追加中
                </>
              ) : (
                `${selected.name}を追加`
              )}
            </button>

            {disabledReason ? (
              <p className="text-[11px] text-slate-500">{disabledReason}</p>
            ) : null}
            {addedMessage ? (
              <p className="flex items-start gap-1.5 text-[11px] text-emerald-700">
                <CheckCircle2 size={13} className="mt-0.5 shrink-0" />
                {addedMessage}
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="flex items-start gap-1.5 text-[11px] text-rose-700">
                <CircleAlert size={13} className="mt-0.5 shrink-0" />
                {error}
              </p>
            ) : null}

            <p className="text-[11px] leading-4 text-slate-500">
              見本と同じテクスチャも追加して割り当てます。追加後はInspectorで変更できます。
            </p>
            <details key={selected.id}>
              <summary className="cursor-pointer text-xs font-semibold text-slate-800">追加前に設定を調整</summary>
              <div className="mt-3 space-y-3">
                <button
                  type="button"
                  disabled={adding || Boolean(disabledReason) || !drafts[selected.id]}
                  className="text-xs text-brand-600 disabled:opacity-50"
                  onClick={() => {
                    setDrafts((current) => { const next = { ...current }; delete next[selected.id]; return next; });
                    setAddedMessage(null);
                    setError(null);
                  }}
                >テンプレートの設定に戻す</button>
                <ParticlePropertiesEditor properties={properties} readOnly={adding || Boolean(disabledReason)} onChange={changeDraft} />
              </div>
            </details>
          </div>
        ) : (
          <p className="text-xs text-slate-500">パーティクルを選んでください</p>
        )}
      </aside>
    </>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-800">{value}</dd>
    </div>
  );
}
