import { catalogMaterialTextures } from "../../lib/visual-editor/catalog-material-dependencies";
import { getMaterialShowcaseAsset } from "../../lib/visual-editor/material-showcase-catalog";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  MousePointerClick,
  Search,
} from "lucide-react";
import {
  SCENE_RECIPE_CATEGORY_LABELS,
  getSceneRecipesForProjectKind,
  type SceneRecipe,
  type VisualProjectKind,
} from "../../lib/visual-editor";
import { SceneRecipeCatalogPreview } from "./SceneRecipeCatalogPreview";

function recipeGroup(recipe: SceneRecipe): string {
  return recipe.group ?? (recipe.category === "tutorial" ? "基本のギミック" : SCENE_RECIPE_CATEGORY_LABELS[recipe.category]);
}
function usesTextures(recipe: SceneRecipe): boolean {
  return recipe.parts.some(part => {
    if ((part.kind !== "primitive" && part.kind !== "model") || !part.materialAssetId) return false;
    return catalogMaterialTextures(getMaterialShowcaseAsset(part.materialAssetId)?.properties).length > 0;
  });
}

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
  shelf = "models",
  disabledReason,
  onAdd,
}: {
  projectKind: VisualProjectKind;
  shelf?: "models" | "materials" | "gimmicks";
  disabledReason?: string | null;
  onAdd: (recipe: SceneRecipe) => Promise<SceneRecipeInstallResult>;
}) {
  const recipes = useMemo(
    () => getSceneRecipesForProjectKind(projectKind, shelf),
    [projectKind, shelf],
  );
  const title = shelf === "materials" ? "glTFマテリアル" : shelf === "gimmicks" ? "ギミック" : "3Dセット";
  const description = shelf === "materials" ? "反射・透過・Emissive・テクスチャの違いを、同じモデルで比較します。" : shelf === "gimmicks" ? "扉・照明・音・演出。操作と編集の手順が付いた、動くサンプルです。" : "家具や装飾など、組み立て済みの3Dを配置できます。";
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [texturesOnly, setTexturesOnly] = useState(false);
  const [selectedId, setSelectedId] = useState(recipes[0]?.id ?? "");
  const [adding, setAdding] = useState(false);
  const [addedMessage, setAddedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(() => {
    const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return recipes
      .filter((recipe) => !texturesOnly || usesTextures(recipe))
      .filter((recipe) => category === "all" || recipeGroup(recipe) === category)
      .filter((recipe) => {
        const text = [
          recipe.id,
          recipe.name,
          recipe.description,
          recipeGroup(recipe),
          ...(recipe.tags ?? []),
          usesTextures(recipe) ? "テクスチャ texture Normal Map ORM UV PBR" : "",
          SCENE_RECIPE_CATEGORY_LABELS[recipe.category],
        ]
          .join(" ")
          .toLocaleLowerCase();
        return tokens.every((token) => text.includes(token));
      });
  }, [category, query, recipes, texturesOnly]);
  // Never show a hidden selection when filters remove it.
  const selected = visible.find(recipe => recipe.id === selectedId) ?? visible[0];
  const groups = useMemo(() => [...new Set(recipes.map(recipeGroup))], [recipes]);
  useEffect(() => { setAddedMessage(null); setError(null); }, [selected?.id]);

  // What the author is about to get, counted from the recipe rather than
  // written by hand: a set that quietly grows a part should say so.
  const contents = useMemo(() => {
    if (!selected) return null;
    const counts = {
      primitive: 0,
      model: selected.assembly === "vehicle" ? 7 : 0,
      particle: selected.assembly === "vehicle" ? 1 : 0,
      light: 0,
      audio: 0,
      text: 0,
    };
    for (const part of selected.parts) {
      counts[part.kind] += 1;
      // An Audio Source riding on a shape is a sound the set brings, and the
      // list would be lying if it counted only the standalone ones.
      if (
        (part.kind === "primitive" || part.kind === "model") &&
        part.audio
      ) {
        counts.audio += 1;
      }
    }
    return { ...counts, graph: selected.behaviours?.length ?? 0 };
  }, [selected]);

  // The result lands under a full-height detail pane, so on a long lesson it
  // renders below the fold: the author presses 追加 and nothing they can see
  // changes. Bringing it into view is what makes the placement legible.
  const addedRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (addedMessage) {
      addedRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [addedMessage]);

  const addSelected = async () => {
    if (!selected || adding || disabledReason) return;
    setAdding(true);
    setAddedMessage(null);
    setError(null);
    try {
      const result = await onAdd(selected);
      setAddedMessage(
        result.createdAssetCount > 0
          ? `「${result.entityName}」をシーンへ配置し、素材を${result.createdAssetCount}件追加しました。`
          : `「${result.entityName}」をシーンへ配置しました。`,
      );
    } catch (reason) {
      setError(
        reason instanceof Error && reason.message.trim()
          ? reason.message
          : `${title}を追加できませんでした`,
      );
    } finally {
      setAdding(false);
    }
  };

  if (shelf === "gimmicks" && projectKind === "item") {
    return (
      <section className="min-w-0 flex-1 bg-white p-6" aria-label="ギミック一覧">
        <h3 className="text-base font-semibold text-slate-900">ギミックはワールド専用です</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          アイテムには追加できません。プロジェクト一覧からワールドを開き、
          「外部から追加」の「ギミック」を選んでください。
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          アイテムの質感を選ぶ場合は、カテゴリの「glTFマテリアル」を利用できます。
        </p>
      </section>
    );
  }

  return (
    <>
      <section
        className="flex min-w-0 flex-1 flex-col border-r border-slate-200"
        aria-label={`${title}一覧`}
      >
        <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2.5">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">{title}</h3>
              <p className="mt-1 text-[13px] leading-6 text-slate-600">
                {description}
              </p>
            </div>
            <span className="rounded-full border border-orange-200 bg-orange-50 whitespace-nowrap px-2.5 py-1 text-xs font-semibold text-orange-700">
              {recipes.length} 種類
            </span>
          </div>
          <div className="flex items-center gap-2">
            <label className="relative min-w-0 flex-1">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-2 text-slate-400"
              />
              <span className="sr-only">{title}を検索</span>
              <input
                value={query}
                disabled={adding}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder={shelf === "materials" ? "例：Emissive、布、ガラス、Normal Map" : "例：扉、音、カウントダウン"}
                className="h-9 w-full rounded-md border border-slate-300 bg-white pl-8 pr-3 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </label>
            <select
              value={category}
              disabled={adding}
              onChange={(event) => setCategory(event.currentTarget.value)}
              aria-label={`${title}のカテゴリ`}
              className="h-9 max-w-[180px] rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700"
            >
              <option value="all">すべて</option>
              {groups.map((entry) => (
                <option key={entry} value={entry}>{entry} ({recipes.filter(r => recipeGroup(r) === entry).length})</option>
              ))}
            </select>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            {shelf === "materials" ? <>
              <button type="button" disabled={adding} aria-pressed={category === "Emissive"}
                className="rounded-full border border-slate-300 px-2.5 py-1 hover:bg-slate-50 disabled:opacity-50"
                onClick={() => setCategory(category === "Emissive" ? "all" : "Emissive")}>Emissive / 発光</button>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={texturesOnly} disabled={adding}
                onChange={e => setTexturesOnly(e.currentTarget.checked)} />テクスチャ付き</label>
            </> : null}
            <span className="ml-auto" role="status" aria-live="polite">{visible.length} / {recipes.length} 種類</span>
            {query || category !== "all" || texturesOnly ? <button type="button" disabled={adding}
              className="text-brand-700 underline underline-offset-2" onClick={() => {setQuery("");setCategory("all");setTexturesOnly(false);}}>条件をリセット</button> : null}
          </div>
        </div>
        <div className="scene-recipe-list scrollbar-thin min-h-0 flex-1 overflow-auto p-3">
          {visible.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center text-xs text-slate-500">
              <Search size={22} />
              <p>条件に合う{title}がありません</p>
            </div>
          ) : (
            <div className="scene-recipe-grid grid gap-3">
              {visible.map((recipe) => {
                const active = recipe.id === selected?.id;
                return (
                  <button
                    key={recipe.id}
                    type="button"
                    data-testid="scene-recipe-card"
                    aria-label={recipe.name}
                    disabled={adding}
                    data-catalog-card
                    aria-pressed={active}
                    onClick={() => {
                      setSelectedId(recipe.id);
                      setAddedMessage(null);
                      setError(null);
                    }}
                    className={`overflow-hidden rounded-xl border bg-white text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-60 ${
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
                      <p className="min-h-10 text-[13px] font-semibold leading-5 text-slate-900">
                        {recipe.name}
                      </p>
                      <p className="mt-1 line-clamp-2 min-h-10 text-[13px] leading-6 text-slate-600">{recipe.description}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-medium text-slate-600">
                        <span className="rounded bg-slate-100 px-2 py-0.5">{recipeGroup(recipe)}</span>
                        {usesTextures(recipe) ? <span className="rounded bg-slate-100 px-2 py-0.5">テクスチャ付き</span> : null}
                        {recipe.comparisonLabels ? <span className="rounded bg-slate-100 px-2 py-0.5">左右で比較</span> : null}
                        {recipe.behaviours?.length ? <span className="rounded bg-slate-100 px-2 py-0.5">操作手順付き</span> : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <aside
        className="scrollbar-thin w-[38%] min-w-[300px] max-w-[440px] shrink-0 overflow-auto bg-white p-4"
        aria-label={`選択した${title}の詳細`}
      >
        {selected && contents ? (
          <div className="space-y-4">
            <SceneRecipeCatalogPreview
              key={selected.id}
              recipe={selected}
              className="aspect-[16/10] w-full overflow-hidden rounded-lg"
              live
            />
            <div>
              {selected.comparisonLabels ? <div className="mb-2 grid grid-cols-2 gap-2 text-center text-xs font-semibold text-slate-700">
                <span className="rounded bg-slate-100 px-2 py-1.5">左：{selected.comparisonLabels[0]}</span>
                <span className="rounded bg-slate-100 px-2 py-1.5">右：{selected.comparisonLabels[1]}</span>
              </div> : null}
              <p className="text-xs text-slate-500">ドラッグで回転できます。操作ギミックはシーンに追加してPlayで確認します。</p>
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {selected.name}
              </h3>
              <p className="mt-1 text-[13px] leading-6 text-slate-600">
                {selected.description}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-6 text-slate-600">
              <p className="font-semibold text-slate-800">中身</p>
              <ul className="mt-1 space-y-0.5">
                {selected.assembly ? <li>乗車・走行・タイヤ・煙の設定済みScript</li> : null}
                {contents.primitive > 0 ? (
                  <li>形状 {contents.primitive} 個</li>
                ) : null}
                {contents.model > 0 ? (
                  <li>モデル {contents.model} 個</li>
                ) : null}
                {contents.particle > 0 ? (
                  <li>パーティクル {contents.particle} 種（素材として追加します）</li>
                ) : null}
                {contents.light > 0 ? <li>ライト {contents.light} 灯</li> : null}
                {contents.audio > 0 ? (
                  <li>音 {contents.audio} 個（音源と音の素材を追加します）</li>
                ) : null}
                {contents.text > 0 ? <li>文字 {contents.text} 枚</li> : null}
                {contents.graph > 0 ? (
                  <li>
                    しかけ {contents.graph} 本（ノードグラフ素材として追加します）
                  </li>
                ) : null}
                {usesTextures(selected) ? <li>使用するPBRテクスチャもAssetsに追加します</li> : null}
              </ul>
            </div>

            {selected.behaviours?.length ? (
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs leading-6 text-slate-600">
                <p className="font-semibold text-slate-800">操作すると起きること</p>
                <ul className="mt-1 space-y-1">
                  {selected.behaviours.map((behaviour) => (
                    <li key={`${behaviour.host}-${behaviour.graphName}`} className="flex gap-1.5">
                      <MousePointerClick
                        size={13}
                        className="mt-0.5 shrink-0 text-slate-400"
                        aria-hidden
                      />
                      <span>{behaviour.summary}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {selected.lesson ? (
              <div className="rounded-lg border border-brand-200 bg-brand-50 p-3 text-xs leading-6 text-brand-900">
                <p className="font-semibold">このセットで分かること</p>
                <p className="mt-1">{selected.lesson.goal}</p>
                <ol className="mt-2 space-y-1.5">
                  {selected.lesson.steps.map((step, index) => (
                    <li key={step} className="flex gap-2">
                      <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[9px] font-semibold text-white">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs leading-5 text-amber-800">
              {selected.note}
            </p>

            <div className="sticky bottom-0 z-10 space-y-2 border-t border-slate-200 bg-white/95 py-3">
            <button
              type="button"
              onClick={addSelected}
              disabled={Boolean(disabledReason) || adding}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {adding ? (
                <>
                  <LoaderCircle size={13} className="animate-spin" />
                  モデル・素材・グラフを追加中…
                </>
              ) : (
                `${selected.name}をシーンへ追加`
              )}
            </button>

            {disabledReason ? (
              <p className="text-xs text-slate-500">{disabledReason}</p>
            ) : null}
            {addedMessage ? (
              <div
                ref={addedRef}
                role="status" aria-live="polite"
                className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs leading-6 text-emerald-800">
                <p className="flex items-start gap-1.5 font-semibold">
                  <CheckCircle2 size={13} className="mt-0.5 shrink-0" />
                  {addedMessage}
                </p>
                {selected.lesson ? (
                  // A lesson the author cannot read once the shelf closes is a
                  // note in a drawer. The steps stay here, and the shelf stays
                  // open for a set that has them, until the author closes it.
                  <p className="mt-1 pl-[18px]">
                    上の手順を見ながら、この画面を閉じてPlayを開始してください。
                  </p>
                ) : (
                  <p className="mt-1 pl-[18px]">
                    中身のEntityはHierarchyから個別に編集できます。
                  </p>
                )}
              </div>
            ) : null}
            {error ? (
              <p role="alert" className="flex items-start gap-1.5 text-xs text-rose-700">
                <CircleAlert size={13} className="mt-0.5 shrink-0" />
                {error}
              </p>
            ) : null}
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            条件に合う{title}がありません。検索条件をリセットしてください
          </p>
        )}
      </aside>
    </>
  );
}
