import {
  AlertCircle,
  CheckCircle2,
  Eye,
  FolderOpen,
  GitBranch,
  LoaderCircle,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  DREI_R3F_IMPORT_SAMPLE,
  analyzeComponentCode,
  analyzeComponentProject,
  augmentClassicProjectVisualImportPlan,
  formatVramBytes,
  loadClassicProjectVisualImportSourceFromRepository,
  pickClassicProjectVisualImportSource,
  type ClassicProjectVisualImportPreview,
  type ClassicProjectVisualImportSource,
  type ComponentCodeImportPlan,
  type VisualProjectKind,
} from "../../lib/visual-editor";

type Props = {
  open: boolean;
  projectKind: VisualProjectKind;
  onClose: () => void;
  onPreparePreview: (
    plan: ComponentCodeImportPlan,
    classicSource: ClassicProjectVisualImportSource,
  ) => Promise<ClassicProjectVisualImportPreview>;
  onImport: (
    plan: ComponentCodeImportPlan,
    classicSource: ClassicProjectVisualImportSource | null,
    enterPlayAfterImport: boolean,
  ) => Promise<boolean>;
};

export function ComponentCodeImportDialog({
  open,
  projectKind,
  onClose,
  onPreparePreview,
  onImport,
}: Props) {
  const [code, setCode] = useState(DREI_R3F_IMPORT_SAMPLE);
  const [classicSource, setClassicSource] =
    useState<ClassicProjectVisualImportSource | null>(null);
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [classicLoading, setClassicLoading] = useState(false);
  const [classicLoadError, setClassicLoadError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [classicPreview, setClassicPreview] =
    useState<ClassicProjectVisualImportPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [enterPlayAfterImport, setEnterPlayAfterImport] = useState(true);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (classicLoading || previewLoading || importing) return;
      if (reviewing) {
        setReviewing(false);
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    classicLoading,
    importing,
    onClose,
    open,
    previewLoading,
    reviewing,
  ]);

  const plan = useMemo(
    () => {
      if (classicSource && code === classicSource.source) {
        return augmentClassicProjectVisualImportPlan(
          analyzeComponentProject({
            entryFile: classicSource.entryFile,
            modules: classicSource.modules,
            projectKind,
          }),
          classicSource,
        );
      }
      return analyzeComponentCode(code, projectKind);
    },
    [classicSource, code, projectKind],
  );
  const hasErrors = plan.diagnostics.some(
    (diagnostic) => diagnostic.severity === "error",
  );

  const pickClassicProject = async () => {
    if (classicLoading) return;
    setClassicLoading(true);
    setClassicLoadError(null);
    try {
      const selected = await pickClassicProjectVisualImportSource(projectKind);
      if (!selected) return;
      setCode(selected.source);
      setClassicSource(selected);
      setReviewing(false);
      setClassicPreview(null);
      setPreviewError(null);
    } catch (error) {
      setClassicLoadError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setClassicLoading(false);
    }
  };

  const loadClassicRepository = async () => {
    if (classicLoading || !repositoryUrl.trim()) return;
    setClassicLoading(true);
    setClassicLoadError(null);
    try {
      const selected =
        await loadClassicProjectVisualImportSourceFromRepository(
          repositoryUrl,
          projectKind,
        );
      setCode(selected.source);
      setClassicSource(selected);
      setReviewing(false);
      setClassicPreview(null);
      setPreviewError(null);
    } catch (error) {
      setClassicLoadError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setClassicLoading(false);
    }
  };

  if (!open) return null;

  const importPlan = async () => {
    if (importing || hasErrors || plan.nodes.length === 0) return;
    setImporting(true);
    try {
      if (await onImport(plan, classicSource, enterPlayAfterImport)) onClose();
    } finally {
      setImporting(false);
    }
  };

  const preparePreview = async () => {
    if (
      previewLoading ||
      hasErrors ||
      plan.nodes.length === 0
    ) {
      return;
    }
    if (!classicSource) {
      setClassicPreview(null);
      setPreviewError(null);
      setReviewing(true);
      return;
    }
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      setClassicPreview(await onPreparePreview(plan, classicSource));
    } catch (error) {
      // Static Scene conversion can still be reviewed when a native Asset
      // preflight is unavailable. Final import retries the same best-effort
      // preparation and skips only unreadable individual Assets.
      setClassicPreview(null);
      setPreviewError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setPreviewLoading(false);
      setReviewing(true);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="component-import-title"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-5 backdrop-blur-[2px]"
    >
      <div className="flex max-h-[min(860px,calc(100vh-40px))] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div>
            <h2 id="component-import-title" className="text-base font-semibold text-slate-950">
              R3F / Classicからインポート
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Drei / React Three FiberのTSX、または既存XRift Classic projectを安全なScene dataへ変換します。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={classicLoading || previewLoading || importing}
            aria-label="コンポーネント画面を閉じる"
            title="閉じる"
            className="rounded-md p-2 text-slate-500 hover:bg-white hover:text-slate-900 disabled:cursor-wait disabled:opacity-40"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {reviewing ? (
            <ImportPreviewHeader
              plan={plan}
              classicSource={classicSource}
              preview={classicPreview}
              onBack={() => setReviewing(false)}
            />
          ) : (
            <CodeConverter
              code={code}
              classicSource={classicSource}
              repositoryUrl={repositoryUrl}
              loading={classicLoading}
              error={classicLoadError}
              onRepositoryUrlChange={(value) => {
                setRepositoryUrl(value);
                setClassicLoadError(null);
              }}
              onLoadRepository={loadClassicRepository}
              onCodeChange={(nextCode) => {
                setCode(nextCode);
                setClassicSource(null);
                setClassicLoadError(null);
                setReviewing(false);
                setClassicPreview(null);
                setPreviewError(null);
              }}
              onPickClassicProject={pickClassicProject}
            />
          )}

          <AnalysisResult
            plan={plan}
            preview={reviewing ? classicPreview : null}
            previewError={reviewing ? previewError : null}
          />
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-5 py-3">
          {reviewing ? (
            <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] font-medium text-slate-700">
              <input
                type="checkbox"
                checked={enterPlayAfterImport}
                onChange={(event) =>
                  setEnterPlayAfterImport(event.currentTarget.checked)
                }
                disabled={importing}
                className="size-3.5 accent-violet-600"
              />
              インポート後、そのままPlayで確認
            </label>
          ) : (
            <div className="text-[11px] leading-4 text-slate-500">
              コードは実行せず、import graph、JSX構造、静的リテラルだけを変換します。
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (reviewing) setReviewing(false);
                else onClose();
              }}
            disabled={classicLoading || previewLoading || importing}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              {reviewing ? "内容を変更" : "キャンセル"}
            </button>
            <button
              type="button"
              disabled={
                classicLoading ||
                previewLoading ||
                importing ||
                hasErrors ||
                plan.nodes.length === 0
              }
              onClick={() => {
                if (!reviewing) {
                  void preparePreview();
                  return;
                }
                void importPlan();
              }}
              className="rounded-md bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {previewLoading
                ? "Asset寸法と容量を検査中…"
                : importing
                ? "AssetとSceneを変換中…"
                : reviewing
                  ? "プレビュー内容をインポート"
                  : "インポート内容をプレビュー"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function CodeConverter({
  code,
  classicSource,
  repositoryUrl,
  loading,
  error,
  onRepositoryUrlChange,
  onLoadRepository,
  onCodeChange,
  onPickClassicProject,
}: {
  code: string;
  classicSource: ClassicProjectVisualImportSource | null;
  repositoryUrl: string;
  loading: boolean;
  error: string | null;
  onRepositoryUrlChange: (value: string) => void;
  onLoadRepository: () => void;
  onCodeChange: (code: string) => void;
  onPickClassicProject: () => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">TSXを変換</h3>
          <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
            標準Geometry、R3F Light、Rapier RigidBody、Billboard、Reflector、Skyと公式XRift Componentに対応します。
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onPickClassicProject}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded border border-violet-300 bg-violet-50 px-2.5 py-1.5 text-[11px] font-semibold text-violet-700 hover:bg-violet-100 disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? (
              <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />
            ) : (
              <FolderOpen size={13} aria-hidden="true" />
            )}
            {loading ? "読み込み中" : "Classicプロジェクトを選択"}
          </button>
          <button
            type="button"
            onClick={() => onCodeChange(DREI_R3F_IMPORT_SAMPLE)}
            disabled={loading}
            className="rounded border border-slate-300 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            変換サンプルに戻す
          </button>
        </div>
      </div>
      {classicSource ? (
        <div className="mb-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] leading-4 text-sky-900">
          <span className="font-semibold">{classicSource.packageName}</span>
          <span className="ml-2">{classicSource.entryFile}</span>
          <span className="ml-2">{classicSource.modules.length} modules</span>
          <span className="mt-0.5 block break-all text-sky-700">
            {classicSource.repositoryUrl ?? classicSource.path}
          </span>
        </div>
      ) : null}
      <div className="mb-2 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-2">
        <GitBranch size={14} className="shrink-0 text-slate-500" aria-hidden="true" />
        <input
          value={repositoryUrl}
          onChange={(event) => onRepositoryUrlChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onLoadRepository();
            }
          }}
          disabled={loading}
          aria-label="Classic repository URL"
          placeholder="https://github.com/owner/repository.git または git@github.com:owner/repository.git"
          className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-[11px] text-slate-700 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
        />
        <button
          type="button"
          onClick={onLoadRepository}
          disabled={loading || !repositoryUrl.trim()}
          className="shrink-0 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          URLから解析
        </button>
      </div>
      {error ? (
        <div className="mb-2 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] leading-4 text-rose-800">
          <AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}
      <textarea
        value={code}
        onChange={(event) => onCodeChange(event.currentTarget.value)}
        spellCheck={false}
        aria-label="変換するTSXコード"
        className="min-h-72 w-full resize-y rounded-lg border border-slate-300 bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
      />
      <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-900">
        Classicでは検証済みentryからsrc内のlocal importを再帰的に読み、group、wrapper、Component境界をHierarchyへ保持します。hookやruntime stateは実行せず、動的な分岐・繰り返し・外部Assetは診断に残します。
      </p>
    </section>
  );
}

function ImportPreviewHeader({
  plan,
  classicSource,
  preview,
  onBack,
}: {
  plan: ComponentCodeImportPlan;
  classicSource: ClassicProjectVisualImportSource | null;
  preview: ClassicProjectVisualImportPreview | null;
  onBack: () => void;
}) {
  return (
    <section className="rounded-lg border border-violet-200 bg-violet-50 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white">
            <Eye size={17} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-violet-950">
              確定前プレビュー
            </h3>
            <p className="mt-1 text-[11px] leading-5 text-violet-900">
              まだSceneやAssetには書き込まれていません。変換件数、関連Asset、警告を確認してから確定できます。
            </p>
            {classicSource ? (
              <>
                <p className="mt-1 truncate font-mono text-[10px] text-violet-700">
                  {classicSource.packageName} · {classicSource.modules.length} modules · {plan.assetDependencies.length} assets
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {classicSource.inspection.skybox ? (
                    <PreviewChip label="Skybox" value="無限遠" />
                  ) : null}
                  {classicSource.inspection.audioSources.length > 0 ? (
                    <PreviewChip
                      label="環境音"
                      value={String(
                        classicSource.inspection.audioSources.length,
                      )}
                    />
                  ) : null}
                  {classicSource.inspection.customMaterials.length > 0 ? (
                    <PreviewChip
                      label="Custom Material"
                      value={String(
                        classicSource.inspection.customMaterials.length,
                      )}
                    />
                  ) : null}
                  {classicSource.inspection.customMaterials.some(
                    (material) =>
                      material.colliderSourceNodeNames.length > 0,
                  ) ? (
                    <PreviewChip
                      label="Collider部位"
                      value={String(
                        classicSource.inspection.customMaterials.reduce(
                          (count, material) =>
                            count +
                            material.colliderSourceNodeNames.length,
                          0,
                        ),
                      )}
                    />
                  ) : null}
                  {preview ? (
                    <PreviewChip
                      label="原本容量"
                      value={formatPreviewBytes(preview.totalSourceBytes)}
                    />
                  ) : null}
                  {preview && preview.estimatedTextureMemoryBytes > 0 ? (
                    <PreviewChip
                      label="Texture展開"
                      value={formatPreviewBytes(
                        preview.estimatedTextureMemoryBytes,
                      )}
                    />
                  ) : null}
                  {preview && preview.unavailableSourcePaths.length > 0 ? (
                    <PreviewChip
                      label="スキップ"
                      value={String(preview.unavailableSourcePaths.length)}
                    />
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 rounded border border-violet-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-violet-700 hover:bg-violet-100"
        >
          入力へ戻る
        </button>
      </div>
    </section>
  );
}

function PreviewChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded border border-violet-200 bg-white px-2 py-1 text-[10px] font-semibold text-violet-800">
      {label} {value}
    </span>
  );
}

function AnalysisResult({
  plan,
  preview,
  previewError,
}: {
  plan: ComponentCodeImportPlan;
  preview: ClassicProjectVisualImportPreview | null;
  previewError: string | null;
}) {
  return (
    <section className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-slate-800">変換結果</span>
        <span className="rounded bg-slate-100 px-2 py-1 text-slate-600">
          Entity {plan.summary.entityCount}
        </span>
        <span className="rounded bg-slate-100 px-2 py-1 text-slate-600">
          Primitive {plan.summary.primitiveCount}
        </span>
        <span className="rounded bg-amber-50 px-2 py-1 text-amber-700">
          Light {plan.summary.lightCount}
        </span>
        <span className="rounded bg-indigo-50 px-2 py-1 text-indigo-700">
          Rigid Body {plan.summary.rigidBodyCount}
        </span>
        <span className="rounded bg-sky-50 px-2 py-1 text-sky-700">
          Collider {plan.summary.colliderCount}
        </span>
        {plan.summary.textCount > 0 ? (
          <span className="rounded bg-fuchsia-50 px-2 py-1 text-fuchsia-700">
            Text / UI {plan.summary.textCount}
          </span>
        ) : null}
        {plan.summary.modelAssetCount > 0 ? (
          <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">
            Model {plan.summary.modelAssetCount}
          </span>
        ) : null}
        {plan.summary.textureAssetCount > 0 ? (
          <span className="rounded bg-cyan-50 px-2 py-1 text-cyan-700">
            Texture {plan.summary.textureAssetCount}
          </span>
        ) : null}
        {plan.summary.audioAssetCount > 0 ? (
          <span className="rounded bg-rose-50 px-2 py-1 text-rose-700">
            Audio {plan.summary.audioAssetCount}
          </span>
        ) : null}
        {plan.summary.unsupportedAssetCount > 0 ? (
          <span className="rounded bg-amber-50 px-2 py-1 text-amber-800">
            変換Asset {plan.summary.unsupportedAssetCount}
          </span>
        ) : null}
        <span className="rounded bg-violet-50 px-2 py-1 text-violet-700">
          XRift {plan.summary.xriftComponentCount}
        </span>
        {plan.summary.moduleCount > 1 ? (
          <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">
            Modules {plan.summary.moduleCount}
          </span>
        ) : null}
        {plan.summary.localComponentCount > 0 ? (
          <span className="rounded bg-indigo-50 px-2 py-1 text-indigo-700">
            Local {plan.summary.localComponentCount}
          </span>
        ) : null}
      </div>
      {preview ? <ClassicAssetSizePreview preview={preview} /> : null}
      {previewError ? (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-900">
          <AlertCircle
            size={13}
            className="mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <span>
            Assetの寸法・容量を確定前に検査できませんでした。Sceneの静的変換結果は確認でき、確定時に再試行して読み取れないAssetだけをスキップします:{" "}
            {previewError}
          </span>
        </div>
      ) : null}
      {plan.diagnostics.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {plan.diagnostics.map((diagnostic, index) => {
            const error = diagnostic.severity === "error";
            return (
              <div
                key={`${diagnostic.code}-${diagnostic.line ?? 0}-${index}`}
                className={`flex items-start gap-2 rounded px-2.5 py-2 text-[11px] leading-4 ${
                  error
                    ? "bg-rose-50 text-rose-800"
                    : diagnostic.severity === "warning"
                      ? "bg-amber-50 text-amber-800"
                      : "bg-sky-50 text-sky-800"
                }`}
              >
                {error ? (
                  <AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                ) : (
                  <CheckCircle2 size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                )}
                <span>
                  {diagnostic.sourcePath ? `${diagnostic.sourcePath}` : ""}
                  {diagnostic.sourcePath && diagnostic.line ? ":" : ""}
                  {diagnostic.line ? `L${diagnostic.line}: ` : diagnostic.sourcePath ? ": " : ""}
                  {diagnostic.message}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-700">
          <CheckCircle2 size={13} aria-hidden="true" />
          公式Componentとしてシーンへ追加できます。
        </p>
      )}
      {plan.assetDependencies.length > 0 ? (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-4 text-slate-700">
          <span className="font-semibold">同時に取り込むAsset</span>
          <span className="ml-2">
            {plan.assetDependencies.map((dependency) => dependency.fileName).join(" / ")}
          </span>
          <span className="mt-0.5 block text-slate-500">
            Repository全体の取得済みコピーから解決します。見つからないAssetだけをスキップし、読み込めるSceneとAssetは確定できます。
          </span>
        </div>
      ) : null}
    </section>
  );
}

function ClassicAssetSizePreview({
  preview,
}: {
  preview: ClassicProjectVisualImportPreview;
}) {
  const preflightWarnings = preview.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "warning",
  );
  return (
    <div className="mt-3 space-y-2 rounded-md border border-violet-200 bg-violet-50/60 p-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="font-semibold text-violet-950">
          Asset・空間サイズ検査
        </span>
        <span className="rounded bg-white px-2 py-1 text-violet-800">
          読込 {preview.availableAssetCount}
        </span>
        <span className="rounded bg-white px-2 py-1 text-violet-800">
          原本 {formatPreviewBytes(preview.totalSourceBytes)}
        </span>
        <span className="rounded bg-white px-2 py-1 text-violet-800">
          Texture展開 約
          {formatPreviewBytes(preview.estimatedTextureMemoryBytes)}
        </span>
        <span
          className={`rounded px-2 py-1 ${
            preflightWarnings.length > 0
              ? "bg-amber-100 text-amber-900"
              : "bg-emerald-100 text-emerald-800"
          }`}
        >
          {preflightWarnings.length > 0
            ? `注意 ${preflightWarnings.length}`
            : "サイズ注意なし"}
        </span>
      </div>

      {preview.models.length > 0 ? (
        <div className="space-y-1.5">
          {preview.models.map((model) => (
            <div
              key={`${model.sourcePath}-${model.componentName ?? "model"}`}
              className="rounded border border-violet-100 bg-white px-2.5 py-2 text-[10px] leading-4 text-slate-700"
            >
              <span className="font-semibold text-slate-900">
                {model.componentName ?? model.fileName}
              </span>
              <span className="ml-2">
                原寸 {formatDimensionVector(model.sourceSize)}
              </span>
              <span className="mx-1 text-slate-400">→</span>
              <span className="font-semibold text-violet-800">
                配置後 {formatDimensionVector(model.effectiveSize)}
              </span>
              <span className="ml-2 text-slate-500">
                Model {formatScaleValue(model.modelImportScale)} × Scene{" "}
                {formatScaleVector(model.placementScale)}
              </span>
              {model.colliderSourceNodeCount > 0 ? (
                <span className="ml-2 text-sky-700">
                  Collider {model.colliderSourceNodeCount}部位も同Scale
                </span>
              ) : null}
              {model.centerModel ? (
                <span className="ml-2 text-slate-500">中心補正あり</span>
              ) : null}
              {model.mirrorX ? (
                <span className="ml-2 text-slate-500">X反転を保持</span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-1 sm:grid-cols-2">
        {preview.assets.map((asset) => (
          <div
            key={asset.sourcePath}
            className="flex min-w-0 items-center justify-between gap-2 rounded bg-white px-2.5 py-1.5 text-[10px] text-slate-700"
          >
            <span className="min-w-0 truncate" title={asset.sourcePath}>
              <span className="mr-1 font-semibold uppercase text-slate-500">
                {asset.kind}
              </span>
              {asset.fileName}
            </span>
            <span className="shrink-0 text-slate-500">
              {asset.width && asset.height
                ? `${asset.width}×${asset.height}px · `
                : ""}
              {formatPreviewBytes(asset.byteLength)}
            </span>
          </div>
        ))}
      </div>

      {preview.unavailableSourcePaths.length > 0 ? (
        <p className="rounded bg-amber-50 px-2.5 py-2 text-[10px] leading-4 text-amber-900">
          読み取れないためスキップ:{" "}
          {preview.unavailableSourcePaths.join(" / ")}
        </p>
      ) : null}
      {preflightWarnings.length > 0 ? (
        <div className="space-y-1">
          {preflightWarnings.map((diagnostic, index) => (
            <p
              key={`${diagnostic.code}-${diagnostic.fileName}-${index}`}
              className="rounded bg-amber-50 px-2.5 py-2 text-[10px] leading-4 text-amber-900"
            >
              {diagnostic.fileName}: {diagnostic.message}
            </p>
          ))}
        </div>
      ) : null}
      <p className="text-[10px] leading-4 text-violet-800">
        Texture展開量はRGBAとmipmap、配置後寸法はModel boundsと親Scaleからの概算です。非uniform Scaleと回転が重なる場合は軸方向の目安になります。確定後はWorld全体のVRAM診断で既存Asset、Material参照、描画負荷も含めて確認できます。
      </p>
    </div>
  );
}

function formatDimensionVector(value: readonly number[]): string {
  return value.map(formatDimension).join(" × ");
}

function formatPreviewBytes(value: number): string {
  return value > 0 ? formatVramBytes(value) : "算出対象なし";
}

function formatDimension(value: number): string {
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}km`;
  if (value >= 1) return `${value.toFixed(2)}m`;
  return `${Math.round(value * 100)}cm`;
}

function formatScaleVector(value: readonly number[]): string {
  if (
    Math.abs(value[0] - value[1]) < 1e-6 &&
    Math.abs(value[1] - value[2]) < 1e-6
  ) {
    return formatScaleValue(value[0]);
  }
  return value.map(formatScaleValue).join(" × ");
}

function formatScaleValue(value: number): string {
  return `${Number(value.toFixed(3))}×`;
}
