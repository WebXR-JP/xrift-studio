import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  LoaderCircle,
  RotateCcw,
  Search,
} from "lucide-react";
import {
  WATER_SHADER_CATALOG,
  WATER_SHADER_CATALOG_SOURCE_URL,
  WATER_SHADER_CATEGORIES,
  WATER_SHADER_PARAMETER_GROUPS,
  waterShaderCostLabel,
  applyWaterShaderParameters,
  defaultWaterShaderParameterValues,
  waterShaderCategoryLabel,
  type WaterShaderCatalogCategory,
  type WaterShaderCatalogEntry,
  type WaterShaderParameter,
  type ResolvedWind,
} from "../../lib/visual-editor";
import { tauri } from "../../lib/tauri";
import { WaterShaderCatalogPreview } from "./WaterShaderCatalogPreview";

export type WaterShaderInstallResult = {
  alreadyInstalled: boolean;
};

/**
 * The Water Shader shelf of the external resource store.
 *
 * Presets are tuned here before they land in the project, because the
 * wave shape is the reason to pick one preset over another. The same values
 * stay editable afterwards on the installed Material, so this panel is a
 * starting point rather than the only place the water can be changed.
 */
export function WaterShaderStore({
  disabledReason,
  wind,
  onAdd,
}: {
  disabledReason?: string | null;
  /** The scene wind, so a preset previews with the wind it will actually get. */
  wind: ResolvedWind;
  onAdd: (
    entry: WaterShaderCatalogEntry,
    parameterValues: Readonly<Record<string, number | string>>,
  ) => Promise<WaterShaderInstallResult>;
}) {
  const [query, setQuery] = useState("");
  const [sampleWind, setSampleWind] = useState(wind.speed <= 0);
  const [paused, setPaused] = useState(false);
  const previewWind = useMemo<ResolvedWind>(() => sampleWind
    ? { direction: wind.direction, speed: 1, turbulence: 0.25 }
    : wind, [sampleWind, wind]);
  const [category, setCategory] = useState<"all" | WaterShaderCatalogCategory>(
    "all",
  );
  const [selectedId, setSelectedId] = useState(WATER_SHADER_CATALOG[0]?.id ?? "");
  const [values, setValues] = useState<Record<string, number | string>>(() =>
    defaultWaterShaderParameterValues(WATER_SHADER_CATALOG[0]),
  );
  const [adding, setAdding] = useState(false);
  const [addedMessage, setAddedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected =
    WATER_SHADER_CATALOG.find((entry) => entry.id === selectedId) ??
    WATER_SHADER_CATALOG[0];
  const visible = useMemo(() => {
    const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return WATER_SHADER_CATALOG.filter(
      (entry) => category === "all" || entry.category === category,
    ).filter((entry) => {
      const text = [
        entry.label,
        entry.id,
        entry.description,
        ...entry.features,
        waterShaderCategoryLabel(entry.category),
      ]
        .join(" ")
        .toLocaleLowerCase();
      return tokens.every((token) => text.includes(token));
    });
  }, [category, query]);
  const previewShader = useMemo(
    () => (selected ? applyWaterShaderParameters(selected, values) : undefined),
    [selected, values],
  );
  const modified = useMemo(() => {
    if (!selected) return false;
    const defaults = defaultWaterShaderParameterValues(selected);
    return Object.entries(defaults).some(([name, value]) => values[name] !== value);
  }, [selected, values]);

  useEffect(() => {
    if (adding || !visible.length || visible.some((entry) => entry.id === selectedId)) return;
    setSelectedId(visible[0].id);
    setValues(defaultWaterShaderParameterValues(visible[0]));
    setAddedMessage(null); setError(null);
  }, [visible, selectedId, adding]);

  const selectEntry = (entry: WaterShaderCatalogEntry) => {
    if (adding) return;
    setSelectedId(entry.id);
    setValues(defaultWaterShaderParameterValues(entry));
    setAddedMessage(null);
    setError(null);
  };

  const addSelected = async () => {
    if (!selected || adding || disabledReason) return;
    setAdding(true);
    setAddedMessage(null);
    setError(null);
    try {
      const result = await onAdd(selected, values);
      setAddedMessage(
        [
          result.alreadyInstalled
            ? `「${selected.label}」のマテリアルを今の設定で更新しました。`
            : `「${selected.label}」をマテリアルとして追加しました。`,
          "板や地形に割り当ててください。波の高さや色はInspectorで調整できます。",
        ].join(""),
      );
    } catch (reason) {
      setError(
        reason instanceof Error && reason.message.trim()
          ? reason.message
          : "Water Shaderを追加できませんでした",
      );
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      <section
        className="flex min-w-0 flex-1 flex-col border-r border-slate-200"
        aria-label="Water Shader一覧"
      >
        <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2.5">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-xs font-semibold text-slate-900">Water Shader</h3>
              <p className="mt-0.5 text-[10px] leading-4 text-slate-500">
                外洋・浅瀬・荒天・夜光・絵画調。波と泡の表現から選べます
              </p>
            </div>
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-semibold text-sky-700">
              {WATER_SHADER_CATALOG.length} shaders
            </span>
          </div>
          <div className="flex items-center gap-2">
            <label className="relative min-w-0 flex-1">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-2 text-slate-400"
              />
              <span className="sr-only">Water Shaderを検索</span>
              <input
                value={query}
                disabled={adding}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="名前または説明で検索"
                className="h-8 w-full rounded-md border border-slate-300 bg-white pl-8 pr-3 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </label>
            <select
              value={category}
              disabled={adding}
              onChange={(event) =>
                setCategory(
                  event.currentTarget.value as "all" | WaterShaderCatalogCategory,
                )
              }
              aria-label="Water Shaderのカテゴリ"
              className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700"
            >
              <option value="all">すべて</option>
              {WATER_SHADER_CATEGORIES.map((entry) => (
                <option key={entry} value={entry}>
                  {waterShaderCategoryLabel(entry)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-auto p-3">
          {visible.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center text-xs text-slate-500">
              <Search size={22} />
              <p>条件に合うWater Shaderがありません</p>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5">
              {visible.map((entry) => {
                const active = entry.id === selected?.id;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    aria-pressed={active}
                    disabled={adding}
                    onClick={() => selectEntry(entry)}
                    className={`overflow-hidden rounded-lg border bg-white text-left transition ${
                      active
                        ? "border-brand-400 ring-2 ring-brand-100"
                        : "border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
                    }`}
                  >
                    <WaterShaderCatalogPreview
                      shader={entry.shader}
                      wind={previewWind}
                      className="aspect-[16/9] w-full"
                    />
                    <div className="p-2.5">
                      <p className="truncate text-xs font-semibold text-slate-800">
                        {entry.label}
                      </p>
                      <p className="mt-1 text-[10px] font-medium text-slate-500">
                        {waterShaderCategoryLabel(entry.category)} · {waterShaderCostLabel(entry.cost)}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-500">
                        {entry.features.join(" / ")}
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
        aria-label="選択したWater Shaderの詳細"
      >
        {selected && previewShader ? (
          <div className="space-y-4">
            <WaterShaderCatalogPreview
              shader={previewShader}
              wind={previewWind}
              className="aspect-[16/10] w-full rounded-lg"
              animated
              paused={paused}
            />
            <div className="space-y-2 text-[11px] text-slate-600">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={!paused} onChange={(event) => setPaused(!event.currentTarget.checked)} />
                アニメーションを表示
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={sampleWind} onChange={(event) => setSampleWind(event.currentTarget.checked)} />
                プレビューに風を適用
              </label>
              <p className="text-[10px] leading-4 text-slate-500">照明と水底は見本です。シーン設定は変更しません。</p>
              {wind.speed <= 0 ? <Notice tone="warning" text="シーンの風は停止中です。追加後の水面を動かすには、シーン設定の風を有効にしてください。" /> : null}
            </div>
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    {selected.label}
                  </h3>
                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-600">
                    {waterShaderCategoryLabel(selected.category)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void tauri.openUrl(WATER_SHADER_CATALOG_SOURCE_URL)}
                  title="シェーダーのソースを開く"
                  className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                >
                  <ExternalLink size={15} aria-hidden="true" />
                </button>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                {selected.description}
              </p>
              <p className="mt-2 text-[10px] text-slate-500">{waterShaderCostLabel(selected.cost)}（端末ごとのFPS保証ではありません）</p>
            </div>

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
                `${selected.label}をマテリアルへ追加`
              )}
            </button>

            <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-slate-700">
                  シェーダーの調整値
                </span>
                <button
                  type="button"
                  disabled={!modified || adding}
                  onClick={() => setValues(defaultWaterShaderParameterValues(selected))}
                  className="flex items-center gap-1 rounded border border-slate-300 bg-white px-1.5 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <RotateCcw size={11} aria-hidden="true" />
                  既定値へ戻す
                </button>
              </div>
              <div className="space-y-2.5">
                {WATER_SHADER_PARAMETER_GROUPS.map((group) => {
                  const parameters = selected.parameters.filter((parameter) => (parameter.group ?? "演出") === group);
                  if (!parameters.length) return null;
                  return (
                    <details key={group} open={group === "波・さざ波"} className="rounded border border-slate-200 bg-white">
                      <summary className="cursor-pointer px-2 py-2 text-[11px] font-semibold text-slate-700">{group}</summary>
                      <div className="space-y-2 p-2 pt-0">
                        {parameters.map((parameter) => (
                          <WaterShaderParameterField key={parameter.uniform} parameter={parameter}
                            value={values[parameter.uniform]} disabled={adding}
                            onChange={(next) => setValues((current) => ({ ...current, [parameter.uniform]: next }))} />
                        ))}
                      </div>
                    </details>
                  );
                })}
              </div>
            </div>


            <Notice text="板や地形に割り当てて使います。波の高さや色はInspectorで調整できます。" />
            <Notice text={selected.notes} />
            {selected.shader.variants[0]?.defines.WATER_SHORE ? <Notice tone="warning" text="寄せ波は「演出」で岸の位置・方角・幅を調整します。岩や地形には自動で合わせません。" /> : null}
            <Notice text="Gerstner波の基礎部分はMochie's Unity Shaders (MIT, (c) 2020 MochiesCode) を移植しています。" />

          </div>
        ) : null}
      </aside>
    </>
  );
}

function WaterShaderParameterField({
  parameter,
  value,
  disabled,
  onChange,
}: {
  parameter: WaterShaderParameter;
  value: number | string | undefined;
  disabled: boolean;
  onChange: (value: number | string) => void;
}) {
  if (parameter.kind === "color") {
    const color = typeof value === "string" ? value : "#ffffff";
    return (
      <div className="rounded border border-slate-200 bg-white p-2">
        <div className="flex items-center justify-between gap-2">
          <label
            className="text-[11px] font-semibold text-slate-700"
            htmlFor={`water-shader-${parameter.uniform}`}
          >
            {parameter.label}
          </label>
          <input
            id={`water-shader-${parameter.uniform}`}
            type="color"
            value={color}
            disabled={disabled}
            onChange={(event) => onChange(event.currentTarget.value)}
            className="h-7 w-12 rounded border border-slate-300 bg-white p-0.5 disabled:opacity-50"
          />
        </div>
        <p className="mt-1 text-[10px] leading-4 text-slate-500">{parameter.hint}</p>
        <p className="mt-0.5 font-mono text-[9px] text-slate-400">
          {parameter.uniform}
        </p>
      </div>
    );
  }

  const numeric = typeof value === "number" ? value : parameter.min;
  return (
    <div className="rounded border border-slate-200 bg-white p-2">
      <div className="flex items-center justify-between gap-2">
        <label
          className="text-[11px] font-semibold text-slate-700"
          htmlFor={`water-shader-${parameter.uniform}`}
        >
          {parameter.label}
        </label>
        <span className="font-mono text-[10px] text-slate-600">
          {formatParameterValue(numeric, parameter.step)}
        </span>
      </div>
      <input
        id={`water-shader-${parameter.uniform}`}
        type="range"
        min={parameter.min}
        max={parameter.max}
        step={parameter.step}
        value={numeric}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="mt-1.5 w-full accent-brand-600 disabled:opacity-50"
      />
      <p className="mt-1 text-[10px] leading-4 text-slate-500">{parameter.hint}</p>
      <p className="mt-0.5 font-mono text-[9px] text-slate-400">
        {parameter.uniform}
      </p>
    </div>
  );
}

function formatParameterValue(value: number, step: number): string {
  if (step >= 1) return String(Math.round(value));
  const decimals = Math.min(3, Math.max(0, Math.ceil(-Math.log10(step))));
  return value.toFixed(decimals);
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
