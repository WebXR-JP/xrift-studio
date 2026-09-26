import { compileVisualProject } from "./compiler/compile";
import { PublishModelTransformError } from "./compiler/download-plan";
import type { CompilerDiagnostic } from "./compiler/types";
import type { PrototypeVisualProject } from "./prototype-project";
import { estimateWorldVram } from "./vram-estimate";

export type PublishReviewRequest = {
  bundle: PrototypeVisualProject;
  scriptSources: Readonly<Record<string, string>>;
};

export function analyzePublishReview({ bundle, scriptSources }: PublishReviewRequest) {
  let diagnostics: CompilerDiagnostic[];
  try {
    diagnostics = compileVisualProject({
      project: bundle.project,
      scenes: { [bundle.scene.sceneId]: bundle.scene },
      assets: bundle.assets,
      prefabs: bundle.prefabs,
      scriptSources,
    }).diagnostics;
  } catch (error) {
    if (!(error instanceof PublishModelTransformError)) throw error;
    // Keep the actionable setting error in the normal review UI. The worker's
    // generic failure would otherwise ask the author to reload the application.
    diagnostics = [{
      severity: "blocking",
      code: "publish-only-model-transform-disabled",
      message: error.message,
      assetId: error.assetId,
      fieldPath: "importSettings.mergeStaticMeshes",
    }];
  }
  return {
    diagnostics,
    vramEstimate: estimateWorldVram(bundle),
  };
}

export type PublishReviewResult = ReturnType<typeof analyzePublishReview>;
export type PublishReviewResponse = { result: PublishReviewResult } | { failed: true };

export const PUBLISH_REVIEW_FAILURE: CompilerDiagnostic = {
  severity: "blocking",
  code: "visual-compiler-unavailable",
  message: "公開データを確認できませんでした。「戻る」で閉じて、公開画面を開き直してください。繰り返す場合は、制作データを保存してアプリを再読み込みしてください。",
};
