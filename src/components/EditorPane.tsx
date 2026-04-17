import Editor, { type BeforeMount } from "@monaco-editor/react";

type Language = "typescript" | "json" | "markdown" | "plaintext" | "css" | "html";

type Props = {
  language: Language;
  filename: string;
  content: string;
  isDirty: boolean;
  loading: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onSave: () => void;
};

const beforeMount: BeforeMount = (monaco) => {
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.Latest,
    allowNonTsExtensions: true,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    jsx: monaco.languages.typescript.JsxEmit.Preserve,
    jsxImportSource: "react",
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    isolatedModules: true,
    noEmit: true,
    skipLibCheck: true,
    allowJs: true,
    typeRoots: ["node_modules/@types"],
  });
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntacticValidation: false,
    noSuggestionDiagnostics: true,
  });
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntacticValidation: false,
    noSuggestionDiagnostics: true,
  });
};

export function EditorPane({
  language,
  filename,
  content,
  isDirty,
  loading,
  error,
  onChange,
  onSave,
}: Props) {
  return (
    <section className="flex flex-1 min-h-0 flex-col bg-white">
      <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-700">{filename}</span>
          {isDirty && (
            <span
              className="h-1.5 w-1.5 rounded-full bg-amber-500"
              title="未保存の変更があります"
            />
          )}
          {loading && <span className="text-[10px] text-zinc-400">読み込み中…</span>}
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={!isDirty || loading}
          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-40"
        >
          保存 (⌘/Ctrl+S)
        </button>
      </div>
      <div className="flex-1 min-h-0">
        {error ? (
          <div className="m-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        ) : (
          <Editor
            height="100%"
            language={language}
            theme="vs"
            value={content}
            onChange={(v) => onChange(v ?? "")}
            beforeMount={beforeMount}
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
    </section>
  );
}
