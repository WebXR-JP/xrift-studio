import { compileVisualProject } from "./compiler/compile";
import type { CompilerDiagnostic } from "./compiler/types";
import type { PrototypeVisualProject } from "./prototype-project";
import { summarizeTexturePublishConversions } from "./texture-conversion";
import { estimateWorldVram } from "./vram-estimate";

export type PublishReviewRequest = {
  bundle: PrototypeVisualProject;
  scriptSources: Readonly<Record<string, string>>;
};

export function analyzePublishReview({ bundle, scriptSources }: PublishReviewRequest) {
  return {
    diagnostics: compileVisualProject({
      project: bundle.project,
      scenes: { [bundle.scene.sceneId]: bundle.scene },
      assets: bundle.assets,
      prefabs: bundle.prefabs,
      scriptSources,
    }).diagnostics,
    vramEstimate: estimateWorldVram(bundle),
    textureConversions: summarizeTexturePublishConversions(bundle.assets),
  };
}

export type PublishReviewResult = ReturnType<typeof analyzePublishReview>;
export type PublishReviewResponse = { result: PublishReviewResult } | { failed: true };

export const PUBLISH_REVIEW_FAILURE: CompilerDiagnostic = {
  severity: "blocking",
  code: "visual-compiler-unavailable",
  message: "公開データを確認できませんでした。「戻る」で閉じて、公開画面を開き直してください。繰り返す場合は、制作データを保存してアプリを再読み込みしてください。",
};
