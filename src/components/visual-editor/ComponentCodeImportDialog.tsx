import { AlertCircle, CheckCircle2, Code2, Library, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  DREI_R3F_IMPORT_SAMPLE,
  XRIFT_COMPONENT_API_SOURCE,
  XRIFT_COMPONENT_API_VERSION,
  analyzeComponentCode,
  createOfficialXriftComponentSample,
  listXriftComponentDefinitions,
  type ComponentCodeImportPlan,
  type VisualProjectKind,
  type XriftComponentDefinition,
} from "../../lib/visual-editor";
import { OfficialXriftComponentThumbnail } from "./OfficialXriftComponentThumbnail";

type Props = {
  open: boolean;
  projectKind: VisualProjectKind;
  onClose: () => void;
  onImport: (plan: ComponentCodeImportPlan) => boolean;
};

type DialogTab = "official" | "code";

export function ComponentCodeImportDialog({
  open,
  projectKind,
  onClose,
  onImport,
}: Props) {
  const definitions = useMemo(
    () => listXriftComponentDefinitions(projectKind),
    [projectKind],
  );
  const initialDefinition =
    definitions.find((definition) => definition.importName === "Portal") ??
    definitions[0];
  const [tab, setTab] = useState<DialogTab>("official");
  const [selectedSchemaId, setSelectedSchemaId] = useState(
    initialDefinition?.schemaId ?? "",
  );
  const [code, setCode] = useState(DREI_R3F_IMPORT_SAMPLE);

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

  useEffect(() => {
    if (
      definitions.length > 0 &&
      !definitions.some((definition) => definition.schemaId === selectedSchemaId)
    ) {
      setSelectedSchemaId(initialDefinition?.schemaId ?? definitions[0].schemaId);
    }
  }, [definitions, initialDefinition?.schemaId, selectedSchemaId]);

  const selectedDefinition = definitions.find(
    (definition) => definition.schemaId === selectedSchemaId,
  );
  const officialCode = selectedDefinition
    ? createOfficialXriftComponentSample(selectedDefinition.importName)
    : "";
  const activeCode = tab === "official" ? officialCode : code;
  const plan = useMemo(
    () => analyzeComponentCode(activeCode, projectKind),
    [activeCode, projectKind],
  );
  const hasErrors = plan.diagnostics.some(
    (diagnostic) => diagnostic.severity === "error",
  );

  if (!open) return null;

  const importPlan = () => {
    if (hasErrors || plan.nodes.length === 0) return;
    if (onImport(plan)) onClose();
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
              XRift公式コンポーネント
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              公開パッケージ {XRIFT_COMPONENT_API_VERSION} のComponentを追加するか、Drei / React Three FiberのTSXを安全に変換します。
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

        <div className="flex shrink-0 items-center gap-1 border-b border-slate-200 px-5 pt-3">
          <TabButton
            active={tab === "official"}
            icon={Library}
            label="公式カタログ"
            onClick={() => setTab("official")}
          />
          <TabButton
            active={tab === "code"}
            icon={Code2}
            label="Drei / R3F 変換"
            onClick={() => setTab("code")}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {tab === "official" ? (
            <OfficialCatalog
              definitions={definitions}
              selected={selectedDefinition}
              code={officialCode}
              onSelect={(definition) => setSelectedSchemaId(definition.schemaId)}
            />
          ) : (
            <CodeConverter code={code} onCodeChange={setCode} />
          )}

          <AnalysisResult plan={plan} />
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <div className="text-[11px] leading-4 text-slate-500">
            <a
              href={XRIFT_COMPONENT_API_SOURCE}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-violet-700 underline decoration-violet-200 underline-offset-2"
            >
              WebXR-JP 公式ソース
            </a>
            <span className="ml-2">コードは実行せず、リテラル値だけを変換します。</span>
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
              disabled={hasErrors || plan.nodes.length === 0}
              onClick={importPlan}
              className="rounded-md bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {tab === "official"
                ? `${selectedDefinition?.label ?? "Component"}を追加`
                : `${plan.summary.entityCount}件を変換して追加`}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function OfficialCatalog({
  definitions,
  selected,
  code,
  onSelect,
}: {
  definitions: readonly XriftComponentDefinition[];
  selected?: XriftComponentDefinition;
  code: string;
  onSelect: (definition: XriftComponentDefinition) => void;
}) {
  return (
    <div>
      {selected ? (
        <section className="grid gap-4 rounded-lg border border-violet-200 bg-violet-50/45 p-4 md:grid-cols-[220px_minmax(0,1fr)]">
          <OfficialXriftComponentThumbnail definition={selected} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-950">{selected.label}</h3>
              <span className="rounded-full border border-violet-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                @{XRIFT_COMPONENT_API_VERSION}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-600">{selected.description}</p>
            <pre className="mt-3 max-h-32 overflow-auto rounded-md border border-slate-800 bg-slate-950 p-3 text-[10px] leading-4 text-slate-200">
              <code>{code}</code>
            </pre>
          </div>
        </section>
      ) : null}

      <section className="mt-5">
        <div className="mb-2 flex items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">公式Component一覧</h3>
            <p className="mt-0.5 text-[11px] text-slate-500">
              ワールド／アイテム内へ配置できる公式Componentを全件表示しています。
            </p>
          </div>
          <span className="text-xs font-medium tabular-nums text-slate-500">
            {definitions.length} components
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {definitions.map((definition) => {
            const active = definition.schemaId === selected?.schemaId;
            return (
              <button
                key={definition.schemaId}
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(definition)}
                className={`rounded-lg border p-2 text-left transition-colors ${
                  active
                    ? "border-violet-500 bg-violet-50 ring-2 ring-violet-100"
                    : "border-slate-200 bg-white hover:border-violet-300 hover:bg-slate-50"
                }`}
              >
                <OfficialXriftComponentThumbnail definition={definition} />
                <span className="mt-2 block truncate text-xs font-semibold text-slate-800">
                  {definition.label}
                </span>
                <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
                  {definition.category}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-4 text-slate-600">
          `DevEnvironment` は公式のローカル開発用wrapperです。Sceneへ配置せず、XRiftのdev entryでStudioが管理します。
        </div>
      </section>
    </div>
  );
}

function CodeConverter({
  code,
  onCodeChange,
}: {
  code: string;
  onCodeChange: (code: string) => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">TSXを変換</h3>
          <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
            Box / Sphere / Cylinder / Cone / Plane、Billboard、Reflector、Skyと公式XRift Componentに対応します。
          </p>
        </div>
        <button
          type="button"
          onClick={() => onCodeChange(DREI_R3F_IMPORT_SAMPLE)}
          className="shrink-0 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
        >
          変換サンプルに戻す
        </button>
      </div>
      <textarea
        value={code}
        onChange={(event) => onCodeChange(event.currentTarget.value)}
        spellCheck={false}
        aria-label="変換するTSXコード"
        className="min-h-72 w-full resize-y rounded-lg border border-slate-300 bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
      />
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
        <span className="rounded bg-violet-50 px-2 py-1 text-violet-700">
          XRift {plan.summary.xriftComponentCount}
        </span>
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
                  {diagnostic.line ? `L${diagnostic.line}: ` : ""}
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
    </section>
  );
}

function TabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Library;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold ${
        active
          ? "border-violet-600 text-violet-700"
          : "border-transparent text-slate-500 hover:text-slate-800"
      }`}
    >
      <Icon size={14} aria-hidden="true" />
      {label}
    </button>
  );
}
