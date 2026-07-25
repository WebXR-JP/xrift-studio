import Editor from "@monaco-editor/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ScriptAsset } from "../../lib/visual-editor/asset-manifest";
import { extractScriptContract } from "../../lib/visual-editor/scripting/script-contract";
import { setupMonaco } from "../../lib/monaco";
import { EDITOR_ICONS } from "./editor-icons";

setupMonaco();

/**
 * Docked Script editor.
 *
 * Follows the Interactivity graph editor precedent: an overlay that leaves the
 * left of the Scene View visible so behaviour can be watched while it is
 * edited. Unlike the rest of the Inspector this stays usable during Play,
 * because a Script source is a project file and saving it does not change
 * Entity placement. See MI-69 and MI-72.
 */

export type ScriptEditorDialogProps = {
  asset: ScriptAsset;
  source: string;
  loading: boolean;
  error: string | null;
  playing: boolean;
  onSave: (source: string) => Promise<void> | void;
  onClose: () => void;
};

export function ScriptEditorDialog({
  asset,
  source,
  loading,
  error,
  playing,
  onSave,
  onClose,
}: ScriptEditorDialogProps) {
  const [draft, setDraft] = useState(source);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const loadedSourceRef = useRef(source);

  useEffect(() => {
    if (loadedSourceRef.current === source) return;
    loadedSourceRef.current = source;
    setDraft(source);
  }, [source]);

  const isDirty = draft !== loadedSourceRef.current;
  const contract = useMemo(() => extractScriptContract(draft), [draft]);

  const save = useCallback(async () => {
    if (!isDirty || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(draft);
      loadedSourceRef.current = draft;
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : "Scriptを保存できませんでした",
      );
    } finally {
      setSaving(false);
    }
  }, [draft, isDirty, onSave, saving]);

  const requestClose = useCallback(() => {
    if (!isDirty) {
      onClose();
      return;
    }
    const keep = window.confirm(
      "保存していない変更があります。破棄して閉じますか。",
    );
    if (keep) onClose();
  }, [isDirty, onClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [requestClose, save]);

  const SaveIcon = EDITOR_ICONS.save;
  const CloseIcon = EDITOR_ICONS.close;

  return (
    <section
      className="absolute bottom-6 left-[clamp(260px,26vw,440px)] right-6 top-20 z-[75] flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-300 bg-white text-slate-900 shadow-2xl"
      aria-label={`Script editor: ${asset.name}`}
    >
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-200 bg-slate-50 px-3">
        <h2 className="truncate text-sm font-bold">{asset.name}</h2>
        <span className="truncate text-[11px] text-slate-500">
          {asset.source.relativePath}
        </span>
        {isDirty ? (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
            title="未保存の変更があります"
          />
        ) : null}
        {playing ? (
          <span className="shrink-0 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
            Play中: 保存すると該当Entityだけ再起動します
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!isDirty || saving || loading}
            className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
          >
            <SaveIcon size={13} aria-hidden="true" />
            {saving ? "保存中" : "保存 (⌘/Ctrl+S)"}
          </button>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Script editorを閉じる"
            className="rounded-md border border-slate-300 bg-white p-1 text-slate-600 hover:bg-slate-50"
          >
            <CloseIcon size={14} aria-hidden="true" />
          </button>
        </div>
      </header>

      {error || saveError ? (
        <p className="border-b border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error ?? saveError}
        </p>
      ) : null}

      <div className="min-h-0 flex-1">
        {loading ? (
          <p className="p-4 text-xs text-slate-500">読み込み中…</p>
        ) : (
          <Editor
            height="100%"
            language="typescript"
            path={`file:///${asset.source.relativePath}`}
            theme="vs"
            value={draft}
            onChange={(value) => setDraft(value ?? "")}
            options={{
              fontSize: 13,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              tabSize: 2,
              wordWrap: "on",
              padding: { top: 12 },
            }}
          />
        )}
      </div>

      <footer className="shrink-0 border-t border-slate-200 bg-slate-50 px-3 py-2">
        {contract.issues.length > 0 ? (
          <ul className="space-y-0.5">
            {contract.issues.slice(0, 3).map((issue, index) => (
              <li key={index} className="text-[11px] text-amber-700">
                {issue.message}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-slate-500">
            {contract.props.length > 0
              ? `${contract.name}: property ${contract.props
                  .map((entry) => entry.name)
                  .join(", ")}`
              : `${contract.name || "Script"}: propertyの宣言はありません`}
          </p>
        )}
      </footer>
    </section>
  );
}
