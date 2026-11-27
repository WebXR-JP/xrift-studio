export type AuthoringEvidenceInput = {
  currentFingerprint: string;
  savedFingerprint?: string | null;
  requiredViews: readonly string[];
  captures: readonly { view: string; fingerprint: string }[];
  review?: { fingerprint: string; approved: boolean; criteria?: readonly AuthoringCriterionVerdict[] };
  requiredCriteria?: readonly string[];
  pendingWrites?: boolean;
};
export type AuthoringEvidenceResult = { complete: boolean; reasons: string[] };

/** Shared by Studio ChatGPT and MCP. Render approval is evidence for exactly
 * the saved Scene it observed; it cannot approve a later or unsaved revision. */
export function checkAuthoringEvidence(input: AuthoringEvidenceInput): AuthoringEvidenceResult {
  const reasons: string[] = [];
  if (!input.currentFingerprint || input.savedFingerprint !== input.currentFingerprint) reasons.push("最新のSceneが保存されていません");
  if (input.pendingWrites) reasons.push("Sceneの変更または保存を処理中です");
  const missing = [...new Set(input.requiredViews)].filter(view => !input.captures.some(capture => capture.view === view && capture.fingerprint === input.currentFingerprint));
  if (missing.length) reasons.push(`最新のSceneの撮影が済んでいません: ${missing.join("、")}`);
  if (!input.review || input.review.fingerprint !== input.currentFingerprint) reasons.push("最新のSceneについて完成条件が確認されていません");
  else if (!input.review.approved) reasons.push("完成条件に未達成の項目があります");
  if (input.requiredCriteria?.length && !checkAuthoringCriteria(input.requiredCriteria, input.review?.criteria ?? []).complete) reasons.push("元の完成条件がすべて確認されていません");
  return { complete: reasons.length === 0, reasons };
}
import { checkAuthoringCriteria, type AuthoringCriterionVerdict } from "./authoring-criteria";
