import { useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle, Search } from "lucide-react";
import {
  SCENE_RECIPE_CATEGORY_LABELS,
  getSceneRecipesForProjectKind,
  type SceneRecipe,
  type SceneRecipeCategory,
  type VisualProjectKind,
} from "../../lib/visual-editor";
import { SceneRecipeCatalogPreview } from "./SceneRecipeCatalogPreview";

const CATEGORY_ORDER: readonly SceneRecipeCategory[] = [
  "light",
  "nature",
  "weather",
  "water",
  "structure",
  "furniture",
  "effect",
];

export type SceneRecipeInstallResult = {
  entityName: string;
  createdAssetCount: number;
};

/**
 * The assembled-set shelf.
 *
 * Everything here is made of parts the editor already has. What it sells is
 * the assembly: an author who wants a campfire should not have to know that a
 * campfire is two Particle Assets, a Point Light and eight stones before they
 * can have one. After placing, it is an ordinary Entity subtree — every stone,
 * the light and both emitters stay selectable and editable.
 */
export function SceneRecipeStore({
  projectKind,
  disabledReason,
  onAdd,
}: {
  projectKind: VisualProjectKind;
  disabledReason?: string | null;
  onAdd: (recipe: SceneRecipe) => Promise<SceneRecipeInstallResult>;
}) {
  const recipes = useMemo(
    () => getSceneRecipesForProjectKind(projectKind),
    [projectKind],
  );
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | SceneRecipeCategory>("all");
  const [selectedId, setSelectedId] = useState(recipes[0]?.id ?? "");
  const [adding, setAdding] = useState(false);
  const [addedMessage, setAddedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected =
    recipes.find((recipe) => recipe.id === selectedId) ?? recipes[0];

  const visible = useMemo(() => {
    const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return recipes
      .filter((recipe) => category === "all" || recipe.category === category)
      .filter((recipe) => {
        const text = [
          recipe.id,
          recipe.name,
          recipe.description,
          SCENE_RECIPE_CATEGORY_LABELS[recipe.category],
        ]
          .join(" ")
          .toLocaleLowerCase();
        return tokens.every((token) => text.includes(token));
      });
  }, [category, query, recipes]);

  // What the author is about to get, counted from the recipe rather than
  // written by hand: a set that quietly grows a part should say so.
  const contents = useMemo(() => {
    if (!selected) return null;
    const counts = { primitive: 0, model: 0, particle: 0, light: 0 };
    for (const part of selected.parts) counts[part.kind] += 1;
    return counts;
  }, [selected]);

  const addSelected = async () => {
    if (!selected || adding || disabledReason) return;
    setAdding(true);
    setAddedMessage(null);
    setError(null);
    try {
      const result = await onAdd(selected);
      setAddedMessage(
        `「${result.entityName}」をSceneへ配置しました。Particle Assetを${result.createdAssetCount}件追加しています。`,
      );
    } catch (reason) {
      setError(
        reason instanceof Error && reason.message.trim()
          ? reason.message
          : "3Dセットを追加できませんでした",
      );
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      <section
        className="flex min-w-0 flex-1 flex-col border-r border-slate-200"
        aria-label="3Dセット一覧"
      >
        <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2.5">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-xs font-semibold text-slate-900">3Dセット</h3>
              <p className="mt-0.5 text-[10px] leading-4 text-slate-500">
                組み立て済みの3Dオブジェクトです。置いたあとは中身を1つずつ編集できます
              </p>
            </div>
            <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-1 text-[10px] font-semibold text-orange-700">
              {recipes.length} sets
            </span>
          </div>
          <div className="flex items-center gap-2">
            <label className="relative min-w-0 flex-1">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-2 text-slate-400"
              />
              <span className="sr-only">3Dセットを検索</span>
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
                  event.currentTarget.value as "all" | SceneRecipeCategory,
                )
              }
              aria-label="3Dセットのカテゴリ"
              className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700"
            >
              <option value="all">すべて</option>
              {CATEGORY_ORDER.map((entry) => (
                <option key={entry} value={entry}>
                  {SCENE_RECIPE_CATEGORY_LABELS[entry]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-auto p-3">
          {visible.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center text-xs text-slate-500">
              <Search size={22} />
              <p>条件に合う3Dセットがありません</p>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2.5">
              {visible.map((recipe) => {
                const active = recipe.id === selected?.id;
                return (
                  <button
                    key={recipe.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setSelectedId(recipe.id);
                      setAddedMessage(null);
                      setError(null);
                    }}
                    className={`overflow-hidden rounded-lg border bg-white text-left transition ${
                      active
                        ? "border-brand-400 ring-2 ring-brand-100"
                        : "border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
                    }`}
                  >
                    <SceneRecipeCatalogPreview
                      recipe={recipe}
                      className="aspect-[16/10] w-full"
                    />
                    <div className="p-2.5">
                      <p className="truncate text-xs font-semibold text-slate-800">
                        {recipe.name}
                      </p>
                      <p className="mt-1 text-[10px] font-medium text-slate-500">
                        {SCENE_RECIPE_CATEGORY_LABELS[recipe.category]}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <footer className="shrink-0 border-t border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
          カードは配置されるものと同じ形状・Particle・ライトで描いた1フレームです。動きは右で確認できます。
        </footer>
      </section>

      <aside
        className="scrollbar-thin w-[350px] shrink-0 overflow-auto bg-white p-4"
        aria-label="選択した3Dセットの詳細"
      >
        {selected && contents ? (
          <div className="space-y-4">
            <SceneRecipeCatalogPreview
              recipe={selected}
              className="aspect-[16/10] w-full overflow-hidden rounded-lg"
              live
            />
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {selected.name}
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                {selected.description}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-5 text-slate-600">
              <p className="font-semibold text-slate-800">中身</p>
              <ul className="mt-1 space-y-0.5">
                {contents.primitive > 0 ? (
                  <li>形状 {contents.primitive} 個</li>
                ) : null}
                {contents.model > 0 ? (
                  <li>モデル {contents.model} 個</li>
                ) : null}
                {contents.particle > 0 ? (
                  <li>Particle {contents.particle} 種（Assetとして追加します）</li>
                ) : null}
                {contents.light > 0 ? <li>ライト {contents.light} 灯</li> : null}
              </ul>
            </div>

            <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-800">
              {selected.note}
            </p>

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
                `${selected.name}をSceneへ追加`
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
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            このプロジェクト種別で使える3Dセットがありません
          </p>
        )}
      </aside>
    </>
  );
}
