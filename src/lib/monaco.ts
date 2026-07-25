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
 * Two reasons: the editor has to work offline, and both the editing worker and
 * the Play-time `transpileModule` compiler must use one bundled TypeScript
 * version. A cross-origin worker cannot be constructed reliably. Self-hosting
 * is also a prerequisite for ever setting a CSP, because a `script-src`
 * without jsdelivr would otherwise break the editor.
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
 * options feed Monaco language features and the direct Play-time compiler.
 * Neither setting changes what the Classic editor displays: it only reads and
 * writes text, and its semantic diagnostics are disabled separately.
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

type TypeScriptServicesModule = typeof import(
  "monaco-editor/esm/vs/language/typescript/lib/typescriptServices.js"
);

let typeScriptServicesPromise: Promise<TypeScriptServicesModule> | undefined;

function loadTypeScriptServices(): Promise<TypeScriptServicesModule> {
  typeScriptServicesPromise ??= import(
    "monaco-editor/esm/vs/language/typescript/lib/typescriptServices.js"
  );
  return typeScriptServicesPromise;
}

/**
 * Emits JavaScript for one in-memory module using Monaco's bundled TypeScript.
 *
 * The language-service worker remains dedicated to Monaco editing. Starting
 * that worker and synchronizing a disposable model for every Script made cold
 * Play take tens of seconds in the desktop app. `transpileModule` uses the same
 * bundled compiler and syntactic diagnostics without a worker round trip.
 * Semantic diagnostics stay in the Script editor, where host declarations are
 * registered.
 */
export async function transpileTypeScriptModule(
  source: string,
  fileName: string,
): Promise<MonacoTranspileResult> {
  try {
    const { typescript } = await loadTypeScriptServices();
    const output = typescript.transpileModule(source, {
      compilerOptions: MONACO_TYPESCRIPT_COMPILER_OPTIONS,
      fileName,
      reportDiagnostics: true,
    });
    const blocking = output.diagnostics?.find(
      (diagnostic) => diagnostic.category === 1,
    );
    if (blocking) {
      return {
        ok: false,
        message: formatTranspileDiagnostic(typescript, blocking),
      };
    }
    if (!output.outputText) {
      return { ok: false, message: "TypeScriptがJavaScriptを出力しませんでした" };
    }
    return { ok: true, javaScript: output.outputText };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "TypeScript compilerを読み込めませんでした",
    };
  }
}

function formatTranspileDiagnostic(
  typescript: TypeScriptServicesModule["typescript"],
  diagnostic: {
    start?: number;
    messageText: unknown;
    file?: {
      getLineAndCharacterOfPosition(position: number): {
        line: number;
        character: number;
      };
    };
  },
): string {
  const message = typescript.flattenDiagnosticMessageText(
    diagnostic.messageText,
    "\n",
  );
  if (diagnostic.start === undefined || !diagnostic.file) return message;
  const position = diagnostic.file.getLineAndCharacterOfPosition(
    diagnostic.start,
  );
  return `${position.line + 1}:${position.character + 1} ${message}`;
}
