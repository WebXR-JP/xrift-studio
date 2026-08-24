import { useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle, Search } from "lucide-react";
import {
  PARTICLE_AUTHORING_PRESETS,
  PARTICLE_PRESET_CATEGORY_LABELS,
  normalizeParticleProperties,
  type ParticleAuthoringPreset,
  type ParticlePresetCategory,
} from "../../lib/visual-editor";
import { ParticlePresetCatalogPreview } from "./ParticlePresetCatalogPreview";

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

  const selected =
    PARTICLE_AUTHORING_PRESETS.find((preset) => preset.id === selectedId) ??
    PARTICLE_AUTHORING_PRESETS[0];

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
      lifetime: `${config.startLifetime.min.toFixed(1)}〜${config.startLifetime.max.toFixed(1)}秒`,
      blending: config.renderer.blending === "additive" ? "加算" : "通常",
      shape:
        config.shape.type === "box"
          ? `箱 ${config.shape.size[0]} × ${config.shape.size[2]} m`
          : config.shape.type === "sphere"
            ? `球 半径 ${config.shape.radius} m`
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
          ? `「${result.assetName}」をSceneへ配置しました。放出量や色はAsset Inspectorで変えられます。`
          : `「${result.assetName}」をAssetsへ追加しました。Scene ViewへドラッグするとEntityになります。`,
      );
    } catch (reason) {
      setError(
        reason instanceof Error && reason.message.trim()
          ? reason.message
          : "Particleを追加できませんでした",
      );
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      <section
        className="flex min-w-0 flex-1 flex-col border-r border-slate-200"
        aria-label="Particle preset一覧"
      >
        <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2.5">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-xs font-semibold text-slate-900">Particle</h3>
              <p className="mt-0.5 text-[10px] leading-4 text-slate-500">
                炎、雪、桜などの粒です。追加後は普通のParticle Assetとして調整できます
              </p>
            </div>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">
              {PARTICLE_AUTHORING_PRESETS.length} presets
            </span>
          </div>
          <div className="flex items-center gap-2">
            <label className="relative min-w-0 flex-1">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-2 text-slate-400"
              />
              <span className="sr-only">Particleを検索</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="名前または説明で検索"
                className="h-8 w-full rounded-md border border-slate-300 bg-white pl-8 pr-3 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </label>
            <select
              value={category}
              onChange={(event) =>
                setCategory(
                  event.currentTarget.value as "all" | ParticlePresetCategory,
                )
              }
              aria-label="Particleのカテゴリ"
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
              <p>条件に合うParticleがありません</p>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5">
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
        <footer className="shrink-0 border-t border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
          カードは実際のParticleを同じrendererで動かしています。
        </footer>
      </section>

      <aside
        className="scrollbar-thin w-[350px] shrink-0 overflow-auto bg-white p-4"
        aria-label="選択したParticleの詳細"
      >
        {selected && summary ? (
          <div className="space-y-4">
            <ParticlePresetCatalogPreview
              preset={selected}
              className="aspect-[16/10] w-full overflow-hidden rounded-lg"
              detail
            />
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
              <SummaryRow label="寿命" value={summary.lifetime} />
              <SummaryRow label="放出形状" value={summary.shape} />
              <SummaryRow label="ブレンド" value={summary.blending} />
            </dl>

            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-2.5">
              <input
                type="checkbox"
                checked={placeInScene}
                onChange={(event) => setPlaceInScene(event.currentTarget.checked)}
                className="mt-0.5"
              />
              <span className="text-[11px] leading-4 text-slate-600">
                <span className="font-semibold text-slate-800">
                  追加後にSceneへ配置
                </span>
                <br />
                Particle Emitterを持つEntityを1件作ります。外すとAssetsへ追加するだけです。
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
              <p className="flex items-start gap-1.5 text-[11px] text-rose-700">
                <CircleAlert size={13} className="mt-0.5 shrink-0" />
                {error}
              </p>
            ) : null}

            <p className="text-[11px] leading-4 text-slate-500">
              粒の見た目はTexture Assetを割り当てると変わります。未指定のときは丸い光として描きます。
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Particleを選んでください</p>
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
