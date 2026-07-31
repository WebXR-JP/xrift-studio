const STRICT_MODE_FORBIDDEN_BINDINGS = new Set([
  "arguments",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "eval",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "null",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

/**
 * Bridge modules use strict ESM bindings. Keep names that are both valid
 * identifiers and legal bindings; `default` is emitted separately.
 */
export function isSafeScriptModuleNamedExport(name: string): boolean {
  return (
    /^[A-Za-z_$][\w$]*$/.test(name) &&
    !STRICT_MODE_FORBIDDEN_BINDINGS.has(name)
  );
}

/**
 * Vite wraps CommonJS dependencies such as React in an ESM namespace whose
 * named values may live under `default`. Merge both shapes so JSX and hooks
 * resolve the same way in development and production.
 */
export function collectScriptModuleNamedExportNames(
  namespace: Readonly<Record<string, unknown>>,
): string[] {
  const names = new Set(Object.keys(namespace));
  const fallback = namespace.default;
  if (
    fallback !== null &&
    (typeof fallback === "object" || typeof fallback === "function")
  ) {
    Object.keys(fallback).forEach((name) => names.add(name));
  }
  return [...names].filter(isSafeScriptModuleNamedExport).sort();
}

export function createScriptModuleBridgeSource(
  registryGlobal: string,
  specifier: string,
  namespace: Readonly<Record<string, unknown>>,
): string {
  const names = collectScriptModuleNamedExportNames(namespace);
  const declarations = names.map(
    (name, index) =>
      `const __xriftScriptExport${index} = __xriftScriptRead(${JSON.stringify(name)});`,
  );
  const exports =
    names.length > 0
      ? [
          "export {",
          ...names.map(
            (name, index) =>
              `  __xriftScriptExport${index} as ${name}${index === names.length - 1 ? "" : ","}`,
          ),
          "};",
        ]
      : [];

  return [
    `const __xriftScriptNamespace = globalThis[${JSON.stringify(registryGlobal)}][${JSON.stringify(specifier)}];`,
    "const __xriftScriptDefault = __xriftScriptNamespace.default ?? __xriftScriptNamespace;",
    "const __xriftScriptRead = (name) => Object.prototype.hasOwnProperty.call(__xriftScriptNamespace, name)",
    "  ? __xriftScriptNamespace[name]",
    "  : __xriftScriptDefault[name];",
    ...declarations,
    ...exports,
    "export default __xriftScriptDefault;",
  ].join("\n");
}
