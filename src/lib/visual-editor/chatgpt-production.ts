export type ChatgptProduction = {
  scope: "edit" | "model" | "environment" | "world";
  detail: "focused" | "balanced" | "overview";
  focus: string;
  criteria: string[];
  maxPasses: number;
};

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, limit: number): value is string => typeof value === "string" && Boolean(value.trim()) && [...value].length <= limit && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
const productionKeys = ["scope", "detail", "focus", "criteria", "maxPasses"];

/** Read-only compatibility for saved requests from the former execution loop. */
export function parseChatgptProduction(value: unknown): ChatgptProduction | undefined {
  if (value === undefined || value === null) return undefined;
  if (!record(value) || Object.keys(value).some(key => !productionKeys.includes(key))
    || typeof value.scope !== "string" || !["edit", "model", "environment", "world"].includes(value.scope)
    || typeof value.detail !== "string" || !["focused", "balanced", "overview"].includes(value.detail) || !text(value.focus, 160)
    || !Array.isArray(value.criteria) || value.criteria.length < 1 || value.criteria.length > 6
    || new Set(value.criteria).size !== value.criteria.length
    || !value.criteria.every(criterion => text(criterion, 240) && Boolean(criterion.trim()))
    || !Number.isInteger(value.maxPasses) || (value.maxPasses as number) < 1 || (value.maxPasses as number) > 6) {
    throw new Error("制作の範囲・細かさ・完了条件・回数の上限を確認できませんでした");
  }
  return { scope: value.scope as ChatgptProduction["scope"], detail: value.detail as ChatgptProduction["detail"],
    focus: value.focus, criteria: [...value.criteria] as string[], maxPasses: value.maxPasses as number };
}
