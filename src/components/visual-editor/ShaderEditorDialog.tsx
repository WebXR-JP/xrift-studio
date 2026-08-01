import Editor from "@monaco-editor/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ShaderAssetStage } from "../../lib/visual-editor";
import type { editor as MonacoEditor } from "monaco-editor";
import { setupMonaco } from "../../lib/monaco";
import { EDITOR_ICONS } from "./editor-icons";

setupMonaco();

export type ShaderEditorDialogProps = {
  title: string;
  stage: ShaderAssetStage;
  sourcePath?: string;
  source: string;
  loading: boolean;
  error: string | null;
  onSave: (source: string) => Promise<void> | void;
  onDirtyChange?: (dirty: boolean) => void;
  onClose: () => void;
};

/** Docked GLSL editor shared by imported Shader Assets and Material sources. */
export function ShaderEditorDialog({
  title,
  stage,
  sourcePath,
  source,
  loading,
  error,
  onSave,
  onDirtyChange,
  onClose,
}: ShaderEditorDialogProps) {
  const [draft, setDraft] = useState(source);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const loadedSourceRef = useRef(source);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    if (loadedSourceRef.current === source) return;
    loadedSourceRef.current = source;
    setDraft(source);
  }, [source]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!loading && editor && editor.getValue() !== draft) {
      editor.setValue(draft);
      editor.layout();
    }
  }, [draft, loading]);

  const isDirty = draft !== loadedSourceRef.current;

  useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  const save = useCallback(async () => {
    if (!isDirty || saving || loading) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(draft);
      loadedSourceRef.current = draft;
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : "GLSLを保存できませんでした",
      );
    } finally {
      setSaving(false);
    }
  }, [draft, isDirty, loading, onSave, saving]);

  const requestClose = useCallback(() => {
    if (!isDirty) {
      onClose();
      return;
    }
    if (window.confirm("保存していないGLSL変更があります。破棄して閉じますか。")) {
      onClose();
    }
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
      aria-label={`GLSL editor: ${title}`}
    >
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-200 bg-slate-50 px-3">
        <h2 className="truncate text-sm font-bold">{title}</h2>
        <span className="shrink-0 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
          {stage}
        </span>
        <span className="truncate text-[11px] text-slate-500">
          {sourcePath ?? "Material内のShader"}
        </span>
        {isDirty ? (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
            title="未保存の変更があります"
          />
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
            aria-label="GLSL editorを閉じる"
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
          <p className="p-4 text-xs text-slate-500">GLSLを読み込んでいます…</p>
        ) : (
          <Editor
            height="100%"
            language="cpp"
            path={`file:///${sourcePath ?? `material-${stage}.glsl`}`}
            theme="vs"
            value={draft}
            onMount={(editor) => {
              editorRef.current = editor;
              if (editor.getValue() !== source) editor.setValue(source);
              editor.layout();
            }}
            onChange={(value) => setDraft(value ?? "")}
            options={{
              fontSize: 13,
              minimap: { enabled: false },
              automaticLayout: true,
              scrollBeyondLastLine: false,
              tabSize: 2,
              wordWrap: "on",
              padding: { top: 12 },
            }}
          />
        )}
      </div>

      <footer className="shrink-0 border-t border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
        GLSLの保存後、参照しているMaterialのプレビューとScene Viewへ反映されます。
      </footer>
    </section>
  );
}
