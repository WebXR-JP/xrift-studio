import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Code2,
  Eye,
  Image as ImageIcon,
  Lightbulb,
  LocateFixed,
  Palette,
  Radar,
  RotateCw,
  Sparkles,
  Volume2,
  Waves,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  createScriptTemplateSource,
  DEFAULT_SCRIPT_TEMPLATE_ID,
  getScriptTemplate,
  SCRIPT_TEMPLATE_CATALOG,
} from "../../lib/visual-editor";

export type ScriptTemplateCreateRequest = {
  templateId: string;
  name: string;
  attachToSelectedEntity: boolean;
};

const CATEGORY_LABELS = {
  basic: "基本",
  movement: "移動",
  appearance: "見た目",
  particle: "Particle",
  media: "Asset",
  interaction: "イベント",
} as const;

const TEMPLATE_ICONS: Readonly<Record<string, LucideIcon>> = {
  blank: Code2,
  rotate: RotateCw,
  float: Waves,
  "follow-entity": LocateFixed,
  "material-pulse": Palette,
  "light-flicker": Lightbulb,
  "texture-scroll": ImageIcon,
  "particle-control": Sparkles,
  "model-display": Box,
  "audio-source-control": Volume2,
  "proximity-event": Radar,
  "event-light": Lightbulb,
  "event-visibility": Eye,
};

export function ScriptTemplateDialog({
  open,
  folderName,
  selectedEntityName,
  onClose,
  onCreate,
}: {
  open: boolean;
  folderName: string;
  selectedEntityName?: string;
  onClose: () => void;
  onCreate: (request: ScriptTemplateCreateRequest) => Promise<boolean>;
}) {
  const [templateId, setTemplateId] = useState(DEFAULT_SCRIPT_TEMPLATE_ID);
  const [name, setName] = useState("Spinner");
  const [attach, setAttach] = useState(Boolean(selectedEntityName));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const template =
    getScriptTemplate(templateId) ??
    getScriptTemplate(DEFAULT_SCRIPT_TEMPLATE_ID)!;

  useEffect(() => {
    if (!open) return;
    const initial =
      getScriptTemplate(DEFAULT_SCRIPT_TEMPLATE_ID) ??
      SCRIPT_TEMPLATE_CATALOG[0];
    if (!initial) return;
    setTemplateId(initial.id);
    setName(initial.suggestedName);
    setAttach(Boolean(selectedEntityName));
    setBusy(false);
    setError(null);
  }, [open, selectedEntityName]);

  useEffect(() => {
    if (!open || busy) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose, open]);

  const sourcePreview = useMemo(
    () =>
      createScriptTemplateSource(template.id, name.trim() || template.suggestedName) ??
      "",
    [name, template],
  );

  if (!open) return null;

  const submit = async () => {
    const normalizedName = name.trim();
    if (!normalizedName) {
      setError("Script名を入力してください");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await onCreate({
        templateId: template.id,
        name: normalizedName,
        attachToSelectedEntity: attach && Boolean(selectedEntityName),
      });
      if (!created) {
        setError("Scriptを作成できませんでした。Editorの通知を確認してください");
        return;
      }
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Scriptを作成できませんでした",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-app-modal-backdrop
      role="presentation"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/35 p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        data-app-modal-surface
        role="dialog"
        aria-modal="true"
        aria-labelledby="script-template-title"
        className="flex h-[min(760px,calc(100dvh-1.5rem))] w-full max-w-[1120px] flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl"
      >
        <header data-app-modal-header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3">
          <div>
            <h2
              id="script-template-title"
              className="text-sm font-semibold text-slate-900"
            >
              Scriptを作成
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              テンプレートを選び、{folderName}へ作成します
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Script作成を閉じる"
            className="rounded-md p-1.5 text-slate-500 hover:bg-white hover:text-slate-900 disabled:opacity-40"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <div data-app-modal-body className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="max-h-48 min-h-0 overflow-y-auto border-b border-slate-200 bg-slate-50/70 p-3 md:max-h-none md:border-b-0 md:border-r">
            <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              テンプレート
            </div>
            <div className="space-y-1.5">
              {SCRIPT_TEMPLATE_CATALOG.map((candidate) => {
                const selected = candidate.id === template.id;
                const TemplateIcon = TEMPLATE_ICONS[candidate.id] ?? Code2;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setTemplateId(candidate.id);
                      setName(candidate.suggestedName);
                      setError(null);
                    }}
                    className={`flex w-full gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      selected
                        ? "border-violet-400 bg-violet-50 text-violet-950"
                        : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                        selected
                          ? "bg-violet-100 text-violet-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      <TemplateIcon size={16} aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="text-xs font-semibold">
                          {candidate.name}
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                          {CATEGORY_LABELS[candidate.category]}
                        </span>
                      </span>
                      <span className="mt-1 block text-[11px] leading-4 text-slate-500">
                        {candidate.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="flex min-h-0 flex-col">
            <div className="grid shrink-0 gap-3 border-b border-slate-200 p-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-700">
                  Script名
                </span>
                <input
                  value={name}
                  onChange={(event) => {
                    setName(event.currentTarget.value);
                    setError(null);
                  }}
                  disabled={busy}
                  maxLength={100}
                  autoFocus
                  className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-100"
                />
              </label>
              <div>
                <span className="mb-1 block text-xs font-semibold text-slate-700">
                  作成後
                </span>
                <label
                  className={`flex h-9 items-center gap-2 rounded-md border px-3 text-xs ${
                    selectedEntityName
                      ? "border-slate-300 bg-white text-slate-700"
                      : "border-slate-200 bg-slate-100 text-slate-400"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={attach}
                    disabled={!selectedEntityName || busy}
                    onChange={(event) => setAttach(event.currentTarget.checked)}
                  />
                  {selectedEntityName
                    ? `「${selectedEntityName}」へScript Componentを追加`
                    : "Entityを選択すると同時に追加できます"}
                </label>
              </div>
              <div className="md:col-span-2 flex flex-wrap gap-2 text-[11px] text-slate-600">
                <span className="rounded bg-slate-100 px-2 py-1">
                  保存先: {folderName}
                </span>
                {template.requiredComponents.map((component) => (
                  <span
                    key={component}
                    className="rounded bg-amber-50 px-2 py-1 text-amber-800"
                  >
                    必要: {component}
                  </span>
                ))}
                {template.requiredAssetKinds.map((kind) => (
                  <span
                    key={kind}
                    className="rounded bg-sky-50 px-2 py-1 text-sky-800"
                  >
                    {kind} AssetをInspectorで設定
                  </span>
                ))}
                {template.entityReferenceCount > 0 ? (
                  <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-800">
                    Entity参照をInspectorで設定
                  </span>
                ) : null}
              </div>
            </div>

            <div className="min-h-0 flex-1 bg-slate-950 p-4">
              <div className="mb-2 flex items-center justify-between text-[11px]">
                <span className="font-semibold text-slate-200">Source preview</span>
                <span className="text-slate-400">
                  {template.language === "tsx" ? "TypeScript JSX" : "TypeScript"}
                </span>
              </div>
              <pre className="scrollbar-thin h-[calc(100%-26px)] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-900 p-4 font-mono text-[12px] leading-5 text-slate-200">
                {sourcePreview}
              </pre>
            </div>
          </main>
        </div>

        <footer data-app-modal-footer className="flex shrink-0 flex-col gap-3 border-t border-slate-200 bg-white px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-5 text-xs text-rose-700" role="status">
            {error}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || !name.trim()}
              className="flex items-center gap-2 rounded-md bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Code2 size={14} aria-hidden="true" />
              {busy ? "作成中…" : "作成して開く"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
