/**
 * Import specifier handling for Script Assets.
 *
 * Pure string logic with no browser, React, Three.js or Tauri dependency, so
 * the same rules drive Play, the compiler's diagnostics, and fixtures.
 *
 * Bare specifiers resolve to the module instances the app already holds. A
 * second copy of three would break `instanceof` and React Three Fiber
 * reconciliation, so a script can never pull its own. See docs/SCRIPTING.md.
 */

export const SCRIPT_MODULE_SPECIFIERS = [
  "xrift:script",
  "three",
  "react",
  "react/jsx-runtime",
  "@react-three/fiber",
  "@react-three/drei",
  "@react-three/rapier",
  "@xrift/world-components",
] as const;

export type ScriptModuleSpecifier = (typeof SCRIPT_MODULE_SPECIFIERS)[number];

const ALLOWED = new Set<string>(SCRIPT_MODULE_SPECIFIERS);

export function isAllowedScriptSpecifier(
  specifier: string,
): specifier is ScriptModuleSpecifier {
  return ALLOWED.has(specifier);
}

/** A network module. Permitted in Play behind opt-in, never in published output. */
export function isRemoteScriptSpecifier(specifier: string): boolean {
  return /^https?:\/\//i.test(specifier);
}

export function isRelativeScriptSpecifier(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

/**
 * Matches the specifier of a static import/export, or a dynamic `import(...)`
 * with a literal argument.
 *
 * Only ever applied to TypeScript's own emit, which normalises every module
 * binding into these forms, so a hand-rolled scan is enough and avoids
 * shipping a parser. Template literals and computed specifiers do not appear
 * in the emit and are deliberately left alone.
 */
const SPECIFIER_PATTERN =
  /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\bexport\s*\*\s*from\s*)(["'])([^"']+)\2/g;

export type ScriptSpecifierUse = {
  specifier: string;
  /** Byte offset of the specifier text, for line/column reporting. */
  index: number;
};

export function collectScriptSpecifiers(source: string): ScriptSpecifierUse[] {
  const uses: ScriptSpecifierUse[] = [];
  for (const match of source.matchAll(SPECIFIER_PATTERN)) {
    const specifier = match[3];
    if (specifier === undefined || match.index === undefined) continue;
    uses.push({ specifier, index: match.index + match[1]!.length + 1 });
  }
  return uses;
}

export type ScriptSpecifierResolution =
  | { kind: "resolved"; url: string }
  | { kind: "rejected"; reason: ScriptSpecifierRejection };

export type ScriptSpecifierRejection =
  | "unknown-module"
  | "remote-not-allowed"
  | "relative-not-supported";

export type RewriteScriptSpecifiersResult = {
  source: string;
  rejected: { specifier: string; reason: ScriptSpecifierRejection }[];
};

/**
 * Replaces every module specifier using `resolve`.
 *
 * Rejected specifiers are reported rather than thrown so the caller can show
 * all of them at once instead of one per attempt.
 */
export function rewriteScriptSpecifiers(
  source: string,
  resolve: (specifier: string) => ScriptSpecifierResolution,
): RewriteScriptSpecifiersResult {
  const rejected: { specifier: string; reason: ScriptSpecifierRejection }[] = [];
  const seen = new Set<string>();
  const rewritten = source.replace(
    SPECIFIER_PATTERN,
    (whole, prefix: string, quote: string, specifier: string) => {
      const resolution = resolve(specifier);
      if (resolution.kind === "rejected") {
        if (!seen.has(specifier)) {
          seen.add(specifier);
          rejected.push({ specifier, reason: resolution.reason });
        }
        return whole;
      }
      return `${prefix}${quote}${resolution.url}${quote}`;
    },
  );
  return { source: rewritten, rejected };
}

export function describeScriptSpecifierRejection(
  specifier: string,
  reason: ScriptSpecifierRejection,
): string {
  if (reason === "remote-not-allowed") {
    return `${specifier} はネットワークからのmoduleです。プロジェクト設定でリモートimportを許可すると Play で使えます。公開はできません。`;
  }
  if (reason === "relative-not-supported") {
    return `${specifier} は他のfileへの参照です。Script間のimportにはまだ対応していません。`;
  }
  return `${specifier} は使用できないmoduleです。使えるのは ${SCRIPT_MODULE_SPECIFIERS.join(", ")} です。`;
}
