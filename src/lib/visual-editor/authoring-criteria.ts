export type AuthoringCriterionVerdict = { criterion: string; passed: boolean; reason: string };
export type ChatgptSceneReview = { approved: boolean; summary: string; remainingWork: string; criteria: AuthoringCriterionVerdict[] };

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, limit: number, empty = false): value is string => typeof value === "string" && (empty || Boolean(value.trim()))
  && [...value].length <= limit && !/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u.test(value);

/** Exact original criteria are the review contract; neither omitted criteria
 * nor a replacement set may turn a partial result into a completed world. */
export function checkAuthoringCriteria(required: readonly string[], verdicts: readonly AuthoringCriterionVerdict[]): { complete: boolean; unchecked: string[] } {
  const valid = required.length > 0 && new Set(required).size === required.length && verdicts.length === required.length
    && verdicts.every((verdict, index) => object(verdict) && verdict.criterion === required[index] && typeof verdict.passed === "boolean" && text(verdict.reason, 5000));
  const unchecked = required.filter((criterion, index) => !valid || verdicts[index]?.criterion !== criterion || verdicts[index]?.passed !== true);
  return { complete: valid && unchecked.length === 0, unchecked };
}

export function parseChatgptSceneReview(value: unknown, required: readonly string[]): ChatgptSceneReview {
  if (!object(value) || Object.keys(value).some(key => !["approved", "summary", "remainingWork", "criteria"].includes(key))
    || typeof value.approved !== "boolean" || !text(value.summary, 600) || !text(value.remainingWork, 1200, true)
    || !Array.isArray(value.criteria) || value.criteria.some(verdict => !object(verdict)
      || Object.keys(verdict).some(key => !["criterion", "passed", "reason"].includes(key))
      || !text(verdict.criterion, 240) || typeof verdict.passed !== "boolean" || !text(verdict.reason, 600))) throw new Error("ワールドの完成条件ごとの見直し結果を確認できませんでした");
  const criteria = value.criteria as AuthoringCriterionVerdict[];
  const gate = checkAuthoringCriteria(required, criteria);
  if (criteria.length !== required.length || criteria.some((verdict, index) => verdict.criterion !== required[index])
    || value.approved !== gate.complete || value.approved && value.remainingWork !== "" || !value.approved && !value.remainingWork.trim()) {
    throw new Error("元の完成条件を一件ずつ確認し、すべて満たす場合だけ完成と判断してください");
  }
  return { approved: value.approved, summary: value.summary, remainingWork: value.remainingWork, criteria: criteria.map(verdict => ({ ...verdict })) };
}
