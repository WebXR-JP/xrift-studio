import { useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle, Search } from "lucide-react";
import {
  TERRAIN_GRASS_PRESETS,
  TERRAIN_PRESETS,
  createTerrainFromPreset,
  generateTerrainGrassInstances,
  getTerrainGrassType,
  terrainHeightRange,
  type TerrainPreset,
} from "../../lib/visual-editor";
import { TerrainPresetCatalogPreview } from "./TerrainPresetCatalogPreview";

export type TerrainPresetInstallResult = {
  entityName: string;
};

/**
 * The Terrain shelf of the external resource store.
 *
 * A Terrain preset is not a Material or a Component — placing one adds an
 * Entity to the Scene. It belongs here anyway because it is the same act for
 * the author: pick a ready-made thing from a catalog and get it in the world.
 * What arrives is an ordinary Terrain, so every brush and every grass control
 * works on it the moment it lands.
 */
export function TerrainPresetStore({
  disabledReason,
  onAdd,
}: {
  disabledReason?: string | null;
  onAdd: (
    preset: TerrainPreset,
    grassPresetId: string | null,
  ) => Promise<TerrainPresetInstallResult>;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(TERRAIN_PRESETS[0]?.id ?? "");
  // undefined means "whatever the Terrain preset ships with"; a value overrides
  // it, and null places the Terrain bare.
  const [grassChoice, setGrassChoice] = useState<string | null | undefined>(
    undefined,
  );
  const [adding, setAdding] = useState(false);
  const [addedMessage, setAddedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected =
    TERRAIN_PRESETS.find((preset) => preset.id === selectedId) ??
    TERRAIN_PRESETS[0];
  const visible = useMemo(() => {
    const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return TERRAIN_PRESETS.filter((preset) => {
      const text = [preset.id, preset.label, preset.description]
        .join(" ")
        .toLocaleLowerCase();
      return tokens.every((token) => text.includes(token));
    });
  }, [query]);

  // What the author is actually agreeing to: the size, the relief and how many
  // blades it plants. A Terrain is the heaviest thing in this store, so the
  // numbers are shown rather than left to be discovered after placing it.
  const effectiveGrassId =
    grassChoice === undefined ? selected?.grassPresetId ?? null : grassChoice;
  const summary = useMemo(() => {
    if (!selected) return null;
    const terrain = createTerrainFromPreset(selected, effectiveGrassId);
    const range = terrainHeightRange(terrain);
    const layers = (terrain.grass ?? []).map((layer) => {
      const placement = generateTerrainGrassInstances(terrain, layer);
      return {
        id: layer.id,
        label: getTerrainGrassType(layer.typeId)?.label ?? layer.typeId,
        placed: placement.placed,
        clamped: placement.clampedByLimit,
      };
    });
    return {
      width: terrain.width,
      depth: terrain.depth,
      resolution: terrain.resolution,
      relief: range.max - range.min,
      layers,
      totalBlades: layers.reduce((sum, layer) => sum + layer.placed, 0),
    };
  }, [effectiveGrassId, selected]);

  const addSelected = async () => {
    if (!selected || adding || disabledReason) return;
    setAdding(true);
    setAddedMessage(null);
    setError(null);
    try {
      const result = await onAdd(selected, effectiveGrassId);
      setAddedMessage(
        `「${result.entityName}」をSceneへ追加しました。ブラシで彫り足したり、草の密度をInspectorで変えられます。`,
      );
    } catch (reason) {
      setError(
        reason instanceof Error && reason.message.trim()
          ? reason.message
          : "Terrainを追加できませんでした",
      );
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      <section
        className="flex min-w-0 flex-1 flex-col border-r border-slate-200"
        aria-label="Terrain preset一覧"
      >
        <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2.5">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-xs font-semibold text-slate-900">Terrain</h3>
              <p className="mt-0.5 text-[10px] leading-4 text-slate-500">
                形と草が入った地形です。追加後は普通のTerrainとして彫れます
              </p>
            </div>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
              {TERRAIN_PRESETS.length} terrains
            </span>
          </div>
          <label className="relative block">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-2 text-slate-400"
            />
            <span className="sr-only">Terrainを検索</span>
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
              <p>条件に合うTerrainがありません</p>
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
                      setGrassChoice(undefined);
                      setAddedMessage(null);
                      setError(null);
                    }}
                    className={`overflow-hidden rounded-lg border bg-white text-left transition ${
                      active
                        ? "border-brand-400 ring-2 ring-brand-100"
                        : "border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
                    }`}
                  >
                    <TerrainPresetCatalogPreview
                      preset={preset}
                      className="aspect-[16/10] w-full"
                    />
                    <div className="p-2.5">
                      <p className="truncate text-xs font-semibold text-slate-800">
                        {preset.label}
                      </p>
                      <p className="mt-1 text-[10px] font-medium text-slate-500">
                        {preset.width} × {preset.depth} m
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <footer className="shrink-0 border-t border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
          カードは実際の高さフィールドと草の配置をWebGLで描画しています。
        </footer>
      </section>

      <aside
        className="scrollbar-thin w-[350px] shrink-0 overflow-auto bg-white p-4"
        aria-label="選択したTerrainの詳細"
      >
        {selected ? (
          <div className="space-y-4">
            <TerrainPresetCatalogPreview
              preset={selected}
              className="aspect-[16/10] w-full rounded-lg"
              animated
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
                <dt className="text-slate-400">大きさ</dt>
                <dd className="text-slate-700">
                  {summary.width} × {summary.depth} m
                </dd>
                <dt className="text-slate-400">高さの差</dt>
                <dd className="text-slate-700">{summary.relief.toFixed(1)} m</dd>
                <dt className="text-slate-400">分割</dt>
                <dd className="text-slate-700">{summary.resolution} 分割</dd>
                <dt className="text-slate-400">草</dt>
                <dd className="text-slate-700">
                  {summary.layers.length === 0
                    ? "なし"
                    : `${summary.layers.length}層・約${summary.totalBlades.toLocaleString()}本`}
                </dd>
              </dl>
            ) : null}
            {summary && summary.layers.length > 0 ? (
              <ul className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-2.5 text-[11px] text-slate-600">
                {summary.layers.map((layer) => (
                  <li key={layer.id} className="flex justify-between gap-2">
                    <span>{layer.label}</span>
                    <span className="font-mono text-slate-500">
                      {layer.placed.toLocaleString()}
                      {layer.clamped ? "（上限）" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-700">
                草のセット
              </span>
              <select
                value={effectiveGrassId ?? ""}
                disabled={adding}
                onChange={(event) =>
                  setGrassChoice(event.currentTarget.value || null)
                }
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs disabled:bg-slate-100"
              >
                <option value="">草なし</option>
                {TERRAIN_GRASS_PRESETS.map((grass) => (
                  <option key={grass.id} value={grass.id}>
                    {grass.label}
                    {grass.id === selected.grassPresetId ? "（既定）" : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">
                {TERRAIN_GRASS_PRESETS.find(
                  (grass) => grass.id === effectiveGrassId,
                )?.description ?? "草を植えずに地形だけを置きます。"}
              </p>
            </label>
            <Notice text="追加するとSceneへTerrain Entityが1つ増えます。形はブラシで彫り足せ、草の密度や種類はInspectorで変えられます。" />
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
