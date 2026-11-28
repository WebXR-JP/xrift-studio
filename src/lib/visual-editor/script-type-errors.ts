import type { AssetManifest } from "./asset-manifest";
import type { EmittedScriptLocation } from "./compiler/types";

/**
 * Ties the publish build's TypeScript errors back to the Script Assets that
 * caused them.
 *
 * Play only transpiles a Script, so a Script that runs in Play can still stop
 * the publish build, which typechecks every emitted file under `strict`. The
 * build reports those errors against the staged copy (`src/scripts/Script.tsx`),
 * a file the author never sees and whose name is derived from the Asset name,
 * so the raw output does not say which Script to open. The emitted copy only
 * has its import specifiers rewritten in place, which keeps every line where
 * the author wrote it; the line and column can therefore be reported as-is.
 */

/** One `error TSxxxx` line of `tsc` output, in either of its two formats. */
export type TypeScriptBuildDiagnostic = {
  /** Path as tsc printed it, with `/` separators. */
  file: string;
  line: number;
  column: number;
  /** For example `TS2352`. */
  code: string;
  /** The message, including tsc's indented continuation lines. */
  message: string;
};

/** A build type error located in a Script Asset the author wrote. */
export type ScriptTypeError = {
  assetId: string;
  /** The Asset's name, as the Assets panel shows it. */
  scriptName: string;
  /** The Script file inside the project, for example `scripts/script.tsx`. */
  sourcePath: string;
  line: number;
  column: number;
  code: string;
  message: string;
};

export type AttributedBuildTypeErrors = {
  scriptErrors: ScriptTypeError[];
  /** Errors in files Studio generated: a Studio bug, not the author's. */
  otherErrors: TypeScriptBuildDiagnostic[];
};

// `src/a.tsx(12,3): error TS2304: ...` (the default when output is not a TTY)
const PLAIN_DIAGNOSTIC = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;
// `src/a.tsx:12:3 - error TS2304: ...` (`--pretty`)
const PRETTY_DIAGNOSTIC = /^(.+?):(\d+):(\d+) - error (TS\d+): (.*)$/;
const ANSI_ESCAPE = /\u001b\[[0-9;]*m/g;
/** Keeps a pathological build log from producing a wall of text. */
const MAX_DIAGNOSTICS = 200;

export function parseTypeScriptBuildDiagnostics(
  output: string,
): TypeScriptBuildDiagnostic[] {
  const diagnostics: TypeScriptBuildDiagnostic[] = [];
  let current: TypeScriptBuildDiagnostic | null = null;
  for (const rawLine of output.replace(ANSI_ESCAPE, "").split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const match = PLAIN_DIAGNOSTIC.exec(line.trim()) ?? PRETTY_DIAGNOSTIC.exec(line.trim());
    if (match) {
      if (diagnostics.length >= MAX_DIAGNOSTICS) break;
      current = {
        file: match[1].trim().replace(/\\/g, "/"),
        line: Number(match[2]),
        column: Number(match[3]),
        code: match[4],
        message: match[5].trim(),
      };
      diagnostics.push(current);
      continue;
    }
    // tsc indents the rest of a message chain by two spaces. The pretty
    // format also prints a code frame, whose lines start with a line number
    // or a row of tildes; those are not part of the message.
    if (
      current &&
      /^\s{2,}\S/.test(line) &&
      !/^\s*\d+\s/.test(line) &&
      !/^\s*~+\s*$/.test(line)
    ) {
      current.message = `${current.message}\n${line.trim()}`;
      continue;
    }
    current = null;
  }
  return diagnostics;
}

/**
 * Splits build type errors into those in an author's Script and the rest.
 *
 * A diagnostic belongs to a Script when its path ends with the staged path the
 * compiler emitted that Script to. Matching the end keeps this independent of
 * whether tsc printed the path relative to the project or absolute.
 */
export function attributeBuildTypeErrors(
  diagnostics: readonly TypeScriptBuildDiagnostic[],
  scriptModules: readonly EmittedScriptLocation[],
  assets: AssetManifest,
): AttributedBuildTypeErrors {
  const scriptErrors: ScriptTypeError[] = [];
  const otherErrors: TypeScriptBuildDiagnostic[] = [];
  for (const diagnostic of diagnostics) {
    const file = diagnostic.file.toLowerCase();
    const emitted = scriptModules.find((entry) => {
      const staged = entry.relativePath.toLowerCase();
      return file === staged || file.endsWith(`/${staged}`);
    });
    const asset = emitted ? assets.assets[emitted.assetId] : undefined;
    if (!emitted || !asset || asset.kind !== "script") {
      otherErrors.push(diagnostic);
      continue;
    }
    scriptErrors.push({
      assetId: asset.id,
      scriptName: asset.name,
      sourcePath: asset.source.relativePath,
      line: diagnostic.line,
      column: diagnostic.column,
      code: diagnostic.code,
      message: diagnostic.message,
    });
  }
  return { scriptErrors, otherErrors };
}

/** How many errors the summary lists before pointing at the full output. */
const SUMMARY_ERROR_LIMIT = 5;

/**
 * The publish dialog's one-paragraph explanation of a Script type failure.
 *
 * It names the Script and the line first, because that is what the author has
 * to open, and says why Play did not catch it, because "it worked in Play" is
 * the first thing the author will think.
 */
export function formatScriptTypeErrorSummary(
  errors: readonly ScriptTypeError[],
): string {
  const listed = errors.slice(0, SUMMARY_ERROR_LIMIT).map((error) =>
    `・${describeScriptTypeErrorLocation(error)} ${error.code}: ${firstLine(error.message)}`,
  );
  const rest = errors.length - listed.length;
  return [
    `スクリプトに型エラーが${errors.length}件あるため、公開を止めました。Playは型を確かめずにスクリプトを実行するため、Playで動いていても公開時の型検査で止まることがあります。`,
    ...listed,
    ...(rest > 0 ? [`ほか${rest}件は下のCLI出力にあります。`] : []),
    "スクリプトを直してから、もう一度公開してください。",
  ].join("\n");
}

export function describeScriptTypeErrorLocation(error: ScriptTypeError): string {
  return `「${error.scriptName}」（${error.sourcePath}）${error.line}行${error.column}列`;
}

function firstLine(message: string): string {
  const line = message.split("\n")[0] ?? "";
  return line.length > 240 ? `${line.slice(0, 240)}…` : line;
}
