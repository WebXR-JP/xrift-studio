/** Display labels and search terms only; stable schema/category IDs do not change. */
export const CREATION_CATEGORY_LABELS = {
  Entity: "Entity", Primitive: "基本形状", World: "ワールド・地形", Light: "ライト",
  UI: "文字・画像", Audio: "音声", Effect: "エフェクト", XRift: "XRift",
} as const;
export const COMPONENT_CATEGORY_LABELS = {
  core: "基本", rendering: "描画", physics: "物理・当たり判定",
  interaction: "操作・反応", media: "音声・映像", world: "ワールド", scripting: "スクリプト",
} as const;
/** Every whitespace-separated term must match; accepts full-width Latin input. */
export function matchesEditorMenuQuery(query: string, ...labels: readonly string[]): boolean {
  const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase().trim();
  const terms = normalize(query).split(/\s+/u).filter(Boolean);
  const haystack = labels.map(normalize).join(" ");
  return terms.every((term) => haystack.includes(term));
}
