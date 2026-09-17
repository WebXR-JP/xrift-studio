/** Shared matching for authoring menus. No search history or telemetry is stored. */
export function matchesEditorSearch(query: string, ...values: Array<string | undefined>): boolean {
  const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase();
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  const text = normalize(values.filter(Boolean).join(" "));
  return terms.every((term) => text.includes(term));
}

export const ENTITY_CREATION_GROUP_LABELS = {
  Entity: "Entity", Primitive: "基本形状", World: "ワールド", Light: "ライト",
  UI: "UI", Audio: "音声", Effect: "エフェクト", XRift: "XRift",
} as const;

export const COMPONENT_CATEGORY_LABELS = {
  core: "基本", rendering: "描画", physics: "物理", interaction: "操作",
  media: "音声・画像", world: "ワールド", scripting: "スクリプト",
} as const;
