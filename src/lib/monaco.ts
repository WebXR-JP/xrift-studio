import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

/**
 * Monaco is bundled with the app instead of loaded from jsdelivr.
 *
 * Two reasons: the editor has to work offline, and the TypeScript worker is
 * what transpiles Script Assets for Play. A cross-origin worker cannot be
 * constructed, so a CDN-loaded Monaco has no reachable `getEmitOutput`.
 * Self-hosting is also a prerequisite for ever setting a CSP, because a
 * `script-src` without jsdelivr would otherwise break the editor.
 */

declare global {
  // eslint-disable-next-line no-var
  var MonacoEnvironment: monaco.Environment | undefined;
}

let configured = false;

function configureMonacoEnvironment(): void {
  if (configured) return;
  configured = true;
  self.MonacoEnvironment = {
    getWorker(_workerId: string, label: string) {
      if (label === "typescript" || label === "javascript") return new tsWorker();
      if (label === "json") return new jsonWorker();
      if (label === "css" || label === "scss" || label === "less") {
        return new cssWorker();
      }
      if (label === "html" || label === "handlebars" || label === "razor") {
        return new htmlWorker();
      }
      return new editorWorker();
    },
  };
  loader.config({ monaco });
}

/**
 * Compiler options shared by every Monaco surface.
 *
 * `noEmit` stays false and `jsx` produces a real transform because the same
 * TypeScript worker both powers the Classic editor's language features and
 * emits JavaScript for Script Assets. Neither setting changes what the Classic
 * editor displays: it only reads and writes text, and its semantic diagnostics
 * are disabled separately.
 */
export const MONACO_TYPESCRIPT_COMPILER_OPTIONS: monaco.typescript.CompilerOptions =
  {
    target: monaco.typescript.ScriptTarget.Latest,
    allowNonTsExtensions: true,
    moduleResolution:
      monaco.typescript.ModuleResolutionKind.NodeJs,
    module: monaco.typescript.ModuleKind.ESNext,
    jsx: monaco.typescript.JsxEmit.ReactJSX,
    jsxImportSource: "react",
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    isolatedModules: true,
    noEmit: false,
    skipLibCheck: true,
    allowJs: true,
    typeRoots: ["node_modules/@types"],
  };

/**
 * Semantic validation stays off for the Classic editor: it opens arbitrary
 * project files whose dependencies are not resolvable in the browser, so
 * every import would be flagged. The Script editor turns it back on for its
 * own models once their type declarations are registered.
 */
const SHARED_DIAGNOSTICS_OPTIONS = {
  noSemanticValidation: true,
  noSyntacticValidation: false,
  noSuggestionDiagnostics: true,
} as const;

/**
 * All Monaco configuration lives here rather than in a `beforeMount` callback.
 * `@monaco-editor/react` types its callback argument with the pre-0.53 shape
 * where the TypeScript API hung off `languages.typescript`; in the bundled ESM
 * build that path is a deprecated stub and the real API is `monaco.typescript`.
 */
export function setupMonaco(): typeof monaco {
  configureMonacoEnvironment();
  monaco.typescript.typescriptDefaults.setCompilerOptions(
    MONACO_TYPESCRIPT_COMPILER_OPTIONS,
  );
  monaco.typescript.javascriptDefaults.setCompilerOptions(
    MONACO_TYPESCRIPT_COMPILER_OPTIONS,
  );
  monaco.typescript.typescriptDefaults.setDiagnosticsOptions(
    SHARED_DIAGNOSTICS_OPTIONS,
  );
  monaco.typescript.javascriptDefaults.setDiagnosticsOptions(
    SHARED_DIAGNOSTICS_OPTIONS,
  );
  return monaco;
}

export type MonacoTranspileResult =
  | { ok: true; javaScript: string }
  | { ok: false; message: string };

/**
 * Emits JavaScript for one in-memory module using Monaco's TypeScript worker.
 *
 * Syntactic diagnostics are reported instead of returning broken output, so a
 * malformed Script never reaches the module loader. Semantic diagnostics are
 * deliberately ignored here: a Script that references editor-provided globals
 * would otherwise fail to run before its type declarations are registered.
 */
export async function transpileTypeScriptModule(
  source: string,
  fileName: string,
): Promise<MonacoTranspileResult> {
  setupMonaco();
  const uri = monaco.Uri.parse(`inmemory://scripts/${fileName}`);
  const existing = monaco.editor.getModel(uri);
  const model =
    existing ?? monaco.editor.createModel(source, "typescript", uri);
  if (existing && existing.getValue() !== source) existing.setValue(source);
  try {
    const getWorker =
      await monaco.typescript.getTypeScriptWorker();
    const worker = await getWorker(uri);
    const syntactic = await worker.getSyntacticDiagnostics(uri.toString());
    const blocking = syntactic.find((diagnostic) => diagnostic.category === 1);
    if (blocking) {
      return {
        ok: false,
        message: formatDiagnostic(blocking, model),
      };
    }
    const output = await worker.getEmitOutput(uri.toString());
    const emitted = output.outputFiles.find((file) =>
      file.name.endsWith(".js"),
    );
    if (!emitted) {
      return { ok: false, message: "TypeScriptがJavaScriptを出力しませんでした" };
    }
    return { ok: true, javaScript: emitted.text };
  } finally {
    if (!existing) model.dispose();
  }
}

function formatDiagnostic(
  diagnostic: { start?: number; messageText: unknown },
  model: monaco.editor.ITextModel,
): string {
  const message =
    typeof diagnostic.messageText === "string"
      ? diagnostic.messageText
      : String(
          (diagnostic.messageText as { messageText?: unknown })?.messageText ??
            diagnostic.messageText,
        );
  if (diagnostic.start === undefined) return message;
  const position = model.getPositionAt(diagnostic.start);
  return `${position.lineNumber}:${position.column} ${message}`;
}
