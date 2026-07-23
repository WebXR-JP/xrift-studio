import {
  AlertCircle,
  CheckCircle2,
  FolderOpen,
  LoaderCircle,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  DREI_R3F_IMPORT_SAMPLE,
  analyzeComponentCode,
  analyzeComponentProject,
  pickClassicProjectVisualImportSource,
  type ClassicProjectVisualImportSource,
  type ComponentCodeImportPlan,
  type VisualProjectKind,
} from "../../lib/visual-editor";

type Props = {
  open: boolean;
  projectKind: VisualProjectKind;
  onClose: () => void;
  onImport: (
    plan: ComponentCodeImportPlan,
    classicSource: ClassicProjectVisualImportSource | null,
  ) => Promise<boolean>;
};

export function ComponentCodeImportDialog({
  open,
  projectKind,
  onClose,
  onImport,
}: Props) {
  const [code, setCode] = useState(DREI_R3F_IMPORT_SAMPLE);
  const [classicSource, setClassicSource] =
    useState<ClassicProjectVisualImportSource | null>(null);
  const [classicLoading, setClassicLoading] = useState(false);
  const [classicLoadError, setClassicLoadError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  const plan = useMemo(
    () =>
      classicSource && code === classicSource.source
        ? analyzeComponentProject({
            entryFile: classicSource.entryFile,
            modules: classicSource.modules,
            projectKind,
          })
        : analyzeComponentCode(code, projectKind),
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
      if (await onImport(plan, classicSource)) onClose();
    } finally {
      setImporting(false);
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
            aria-label="コンポーネント画面を閉じる"
            title="閉じる"
            className="rounded-md p-2 text-slate-500 hover:bg-white hover:text-slate-900"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <CodeConverter
            code={code}
            classicSource={classicSource}
            loading={classicLoading}
            error={classicLoadError}
            onCodeChange={(nextCode) => {
              setCode(nextCode);
              setClassicSource(null);
              setClassicLoadError(null);
            }}
            onPickClassicProject={pickClassicProject}
          />

          <AnalysisResult plan={plan} />
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <div className="text-[11px] leading-4 text-slate-500">
            コードは実行せず、import graph、JSX構造、静的リテラルだけを変換します。
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              キャンセル
            </button>
            <button
              type="button"
              disabled={
                classicLoading || importing || hasErrors || plan.nodes.length === 0
              }
              onClick={() => void importPlan()}
              className="rounded-md bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {importing
                ? "AssetとSceneを変換中…"
                : `${plan.summary.entityCount}件を変換して追加`}
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
  loading,
  error,
  onCodeChange,
  onPickClassicProject,
}: {
  code: string;
  classicSource: ClassicProjectVisualImportSource | null;
  loading: boolean;
  error: string | null;
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
            {classicSource.path}
          </span>
        </div>
      ) : null}
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

function AnalysisResult({ plan }: { plan: ComponentCodeImportPlan }) {
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
            Sceneへ追加する前にStudio Asset IDへ変換し、参照元Entityへ接続します。
          </span>
        </div>
      ) : null}
    </section>
  );
}
