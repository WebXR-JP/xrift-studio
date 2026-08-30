import type { AssetManifest } from "../asset-manifest";
import type { VendorBundleId } from "../vendor-assets";
import type { PrefabDocument } from "../prefab-document";
import type { VisualProjectDocument, VisualProjectKind } from "../project-document";
import type { SceneDocument } from "../scene-document";
import type { CompilationProvenance } from "../serialization";
import type { ResolvedPublishPermissions } from "./publish-permissions";
import type { TextureConversion } from "../texture-conversion";

export const VISUAL_COMPILER_VERSION = "0.6.0" as const;

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
  /**
   * Script Asset source text keyed by Asset id.
   *
   * Passed in rather than read here so compilation stays synchronous and
   * fixture-testable; the caller owns the file reads.
   */
  scriptSources?: Readonly<Record<string, string>>;
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
  purpose: "texture" | "skybox" | "model" | "audio" | "particle" | "prefab" | "other";
  supportedByCompiler: boolean;
  /**
   * 出力時にだけ適用するTextureの変換。
   *
   * 最大解像度・圧縮のImport設定は、制作データの原本を書き換えずに公開結果へ
   * 反映する。ここに値があるコピーは、原本をそのまま複製せず、この内容で
   * 作り直した画像を `targetRelativePath` へ書く。
   */
  textureConversion?: TextureConversion;
};

export type RequiredPublicationFileCopy = {
  purpose: "thumbnail";
  sourceRelativePath: "public/thumbnail.png";
  targetRelativePath: "public/thumbnail.png";
};

export type CompilerBundledAssetCopy =
  | {
      /**
       * A decoder file Studio ships (KTX2 transcoder, Draco decoder), copied so
       * the published world never fetches one from a CDN it cannot reach.
       */
      source: VendorBundleId;
      sourceFileName: string;
      targetRelativePath: string;
    }
  | {
      /** A Text font file Studio ships, copied so the world never downloads it. */
      source: "text-fonts";
      sourceFileName: string;
      targetRelativePath: string;
    };

export type CompilerStagingPlan = {
  owner: "xrift-studio-compiler";
  /** Passed to `xrift create`; never points at the visual authoring project. */
  templateKind: VisualProjectKind;
  stagingDirectoryName: string;
  overlayFiles: CompilerOverlayFile[];
  assetCopyPlan: AssetCopyPlanEntry[];
  /** Static files owned by the Studio bundle rather than the author project. */
  bundledAssetCopyPlan: CompilerBundledAssetCopy[];
  /** Exact packages installed only in the compiler-owned staging project. */
  runtimePackageSpecs: string[];
  /** Required XRift publication files are verified separately from user Assets. */
  requiredPublicationFiles: RequiredPublicationFileCopy[];
};

export type VisualCompileResult = {
  targetKind: VisualProjectKind;
  canStage: boolean;
  diagnostics: CompilerDiagnostic[];
  overlayFiles: CompilerOverlayFile[];
  assetCopyPlan: AssetCopyPlanEntry[];
  provenance: CompilationProvenance;
  provenanceFile: CompilerOverlayFile;
  runtimeManifestFile?: CompilerOverlayFile;
  stagingPlan: CompilerStagingPlan;
  /**
   * Platform permissions this world declares, and why. Absent when the world
   * publishes with every security check enforced.
   */
  publishPermissions?: ResolvedPublishPermissions;
};

export type VisualCompilerOptions = {
  /** Injectable to make fixtures byte-for-byte deterministic. */
  generatedAt?: string;
  /** Keeps desktop publish on generated JSX until the npm runtime is available. */
  outputMode?: "classic-jsx" | "classic-runtime";
};
