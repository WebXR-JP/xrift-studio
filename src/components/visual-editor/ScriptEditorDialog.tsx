import Editor from "@monaco-editor/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { editor as MonacoEditor } from "monaco-editor";

import type { ScriptAsset } from "../../lib/visual-editor/asset-manifest";
import type { ScriptRuntimeReport } from "../../lib/visual-editor/scripting/runtime-report";
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
  runtime: ScriptRuntimeReport;
  onSave: (source: string) => Promise<void> | void;
  onClose: () => void;
};

export function ScriptEditorDialog({
  asset,
  source,
  loading,
  error,
  playing,
  runtime,
  onSave,
  onClose,
}: ScriptEditorDialogProps) {
  const [draft, setDraft] = useState(source);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [apiGuideOpen, setApiGuideOpen] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const observedFailureRevisionRef = useRef(runtime.failureRevision);
  const loadedSourceRef = useRef(source);
  const monacoEditorRef =
    useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    if (loadedSourceRef.current === source) return;
    loadedSourceRef.current = source;
    setDraft(source);
  }, [source]);

  useEffect(() => {
    const editor = monacoEditorRef.current;
    if (!loading && editor && editor.getValue() !== draft) {
      editor.setValue(draft);
      layoutMonacoWhenVisible(editor);
    }
  }, [draft, loading]);

  useEffect(() => {
    const editor = monacoEditorRef.current;
    if (editor) layoutMonacoWhenVisible(editor);
  }, [apiGuideOpen]);

  useEffect(() => {
    if (runtime.failureRevision > observedFailureRevisionRef.current) {
      setConsoleOpen(true);
    }
    observedFailureRevisionRef.current = runtime.failureRevision;
  }, [runtime.failureRevision]);

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
  const HelpIcon = EDITOR_ICONS.help;

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
            onClick={() => setConsoleOpen((open) => !open)}
            aria-controls="script-runtime-console"
            aria-expanded={consoleOpen}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium shadow-sm ${
              consoleOpen
                ? "border-slate-400 bg-slate-100 text-slate-800"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            Console
            {runtime.failures.length > 0 ? (
              <span className="rounded-full bg-rose-600 px-1.5 text-[9px] font-bold text-white">
                {runtime.failures.length}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setApiGuideOpen((open) => !open)}
            aria-controls="script-api-guide"
            aria-expanded={apiGuideOpen}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium shadow-sm ${
              apiGuideOpen
                ? "border-brand-300 bg-brand-50 text-brand-700"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <HelpIcon size={13} aria-hidden="true" />
            APIガイド
          </button>
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

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          {loading ? (
            <p className="p-4 text-xs text-slate-500">読み込み中…</p>
          ) : (
            <Editor
              height="100%"
              language="typescript"
              path={`file:///${asset.source.relativePath}`}
              theme="vs"
              value={draft}
              onMount={(editor) => {
                // The source arrives in the same render that replaces the
                // loading state. Seed Monaco explicitly so its path-backed
                // model cannot retain the initial empty value.
                monacoEditorRef.current = editor;
                if (editor.getValue() !== source) editor.setValue(source);
                layoutMonacoWhenVisible(editor);
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
        {apiGuideOpen ? <ScriptApiGuide /> : null}
      </div>

      {consoleOpen ? <ScriptRuntimeConsole runtime={runtime} /> : null}

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

function ScriptRuntimeConsole({ runtime }: { runtime: ScriptRuntimeReport }) {
  const empty =
    runtime.compileErrors.length === 0 &&
    runtime.failures.length === 0 &&
    runtime.logs.length === 0;
  return (
    <section
      id="script-runtime-console"
      aria-label="Script Console"
      className="h-36 shrink-0 overflow-y-auto border-t border-slate-700 bg-slate-950 px-3 py-2 font-mono text-[10px] text-slate-200"
    >
      <div className="mb-1 flex items-center gap-2 text-slate-400">
        <span>runtime: {runtime.status}</span>
        <span>logs: {runtime.logs.length}</span>
      </div>
      {empty ? (
        <p className="text-slate-500">
          ctx.log(...) の出力と実行エラーがここに表示されます。
        </p>
      ) : null}
      {runtime.compileErrors.map((entry, index) => (
        <p
          key={`compile:${entry.assetId}:${index}`}
          className="whitespace-pre-wrap text-amber-300"
        >
          [compile] {entry.assetName}: {entry.message}
        </p>
      ))}
      {runtime.failures.map((entry, index) => (
        <p
          key={`failure:${entry.componentId}:${index}`}
          className="whitespace-pre-wrap text-rose-300"
        >
          [{entry.phase}] {entry.scriptName} / {entry.entityId}: {entry.message}
          {entry.stopped ? " (stopped)" : ""}
        </p>
      ))}
      {runtime.logs.map((entry, index) => (
        <p
          key={`log:${entry.componentId}:${index}`}
          className="whitespace-pre-wrap text-slate-200"
        >
          [log] {entry.scriptName}: {entry.values.join(" ")}
        </p>
      ))}
    </section>
  );
}

function ScriptApiGuide() {
  return (
    <aside
      id="script-api-guide"
      aria-label="Scripting APIガイド"
      className="w-[340px] max-w-[44%] shrink-0 overflow-y-auto border-l border-slate-200 bg-slate-50"
    >
      <div className="border-b border-slate-200 bg-white px-3 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold text-slate-800">Scripting API</h3>
          <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[9px] font-semibold text-brand-700">
            Play
          </span>
        </div>
        <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
          Inspectorの値、Texture、Entity内のMaterialをPlay中に操作できます。
        </p>
      </div>

      <div className="space-y-4 p-3">
        <section>
          <h4 className="text-[11px] font-bold text-slate-700">
            Inspectorへ値を公開
          </h4>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
            propertyの変更は次のフレームから
            <code className="mx-0.5 text-slate-700">ctx.props</code>
            に反映されます。
          </p>
          <GuideCode>{`props: {
  speed: prop.number({ label: "回転速度", default: 1 }),
  texture: prop.asset({ kind: "texture" }),
},
start(ctx) {
  return { update(dt) {
    ctx.object3d.rotation.y += ctx.props.speed * dt;
  }};
}`}</GuideCode>
        </section>

        <section>
          <h4 className="text-[11px] font-bold text-slate-700">
            Textureを読み込む
          </h4>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
            Asset propertyで選んだTextureだけを安全に読み込めます。
          </p>
          <GuideCode>{`void ctx.assets
  .loadTexture(ctx.props.texture, {
    colorSpace: "srgb",
    wrapS: "repeat",
    wrapT: "repeat",
  })
  .then((texture) => {
    if (texture) {
      texture.repeat.set(2, 2);
      ctx.materials.setTexture("baseColor", texture);
    }
  })
  .catch((error) => ctx.log("Texture error", error));`}</GuideCode>
        </section>

        <section>
          <h4 className="text-[11px] font-bold text-slate-700">
            Materialを変える
          </h4>
          <div className="mt-2 flex flex-wrap gap-1">
            {[
              "setColor",
              "setOpacity",
              "setEmissive",
              "setMetalness",
              "setRoughness",
              "setTexture",
            ].map((method) => (
              <code
                key={method}
                className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] text-slate-600"
              >
                {method}
              </code>
            ))}
          </div>
          <GuideCode>{`ctx.materials.setColor(ctx.props.tint);
ctx.materials.setOpacity(0.8);
ctx.materials.setEmissive("#ff6600", 2);
ctx.materials.setMetalness(0.2);
ctx.materials.setRoughness(0.7);`}</GuideCode>
        </section>

        <section className="rounded-lg border border-sky-200 bg-sky-50 p-2.5">
          <h4 className="text-[10px] font-bold text-sky-800">
            変更はruntime-only
          </h4>
          <p className="mt-1 text-[10px] leading-relaxed text-sky-700">
            Material Asset自体は上書きしません。Scriptの再起動・Stop時に元へ戻り、
            読み込んだTextureも自動で破棄されます。
          </p>
        </section>
      </div>
    </aside>
  );
}

function GuideCode({ children }: { children: string }) {
  return (
    <pre className="mt-2 overflow-x-auto rounded-md border border-slate-200 bg-slate-900 p-2 text-[9px] leading-relaxed text-slate-100">
      <code>{children}</code>
    </pre>
  );
}

function layoutMonacoWhenVisible(
  editor: MonacoEditor.IStandaloneCodeEditor,
): void {
  const applyLayout = () => {
    if (!editor.getDomNode()?.isConnected) return;
    editor.layout();
    editor.render(true);
  };
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      applyLayout();
    });
  });
  window.setTimeout(applyLayout, 100);
}
