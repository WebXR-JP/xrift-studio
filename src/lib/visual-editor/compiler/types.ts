import type { AssetManifest } from "../asset-manifest";
import type { PrefabDocument } from "../prefab-document";
import type { VisualProjectDocument, VisualProjectKind } from "../project-document";
import type { SceneDocument } from "../scene-document";
import type { CompilationProvenance } from "../serialization";

export const VISUAL_COMPILER_VERSION = "0.5.0" as const;

export type VisualCompilerDocuments = {
  project: VisualProjectDocument;
  scenes: Record<string, SceneDocument>;
  assets: AssetManifest;
  /**
   * Optional only for callers authored before Prefab persistence existed.
   * A referenced Prefab still produces a blocking missing-document diagnostic;
   * new callers should always pass the complete record.
   */
  prefabs?: Record<string, PrefabDocument>;
};

export type CompilerDiagnosticSeverity = "blocking" | "warning";

export type CompilerDiagnostic = {
  severity: CompilerDiagnosticSeverity;
  code: string;
  message: string;
  sceneId?: string;
  prefabId?: string;
  entityId?: string;
  componentId?: string;
  assetId?: string;
  fieldPath?: string;
};

export type CompilerOverlayFile = {
  relativePath: string;
  content: string;
  kind: "source" | "metadata";
  owner: "xrift-studio-compiler";
};

export type AssetCopyPlanEntry = {
  assetId: string;
  sourceRelativePath: string;
  targetRelativePath: string;
  purpose: "texture" | "model" | "particle" | "prefab" | "other";
  supportedByCompiler: boolean;
};

export type CompilerStagingPlan = {
  owner: "xrift-studio-compiler";
  /** Passed to `xrift create`; never points at the visual authoring project. */
  templateKind: VisualProjectKind;
  stagingDirectoryName: string;
  overlayFiles: CompilerOverlayFile[];
  assetCopyPlan: AssetCopyPlanEntry[];
};

export type VisualCompileResult = {
  targetKind: VisualProjectKind;
  canStage: boolean;
  diagnostics: CompilerDiagnostic[];
  overlayFiles: CompilerOverlayFile[];
  assetCopyPlan: AssetCopyPlanEntry[];
  provenance: CompilationProvenance;
  provenanceFile: CompilerOverlayFile;
  stagingPlan: CompilerStagingPlan;
};

export type VisualCompilerOptions = {
  /** Injectable to make fixtures byte-for-byte deterministic. */
  generatedAt?: string;
};
