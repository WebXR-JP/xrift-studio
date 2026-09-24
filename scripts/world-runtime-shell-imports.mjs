import path from "node:path";
import ts from "typescript-test-api";

/**
 * Vite emits direct ESM imports alongside federation fallbacks. The latter
 * are loaded through variable URLs only when a host does not provide a shared
 * package; the former are unconditional and must ship with the World.
 */
export function directRelativeModuleImports(filePath, source) {
  const parsed = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  if (parsed.parseDiagnostics.length > 0) {
    throw new Error(`Cannot parse generated shell module ${filePath}: ${parsed.parseDiagnostics[0].messageText}`);
  }

  const references = new Set();
  const add = (specifier) => {
    if (!specifier.startsWith("./") && !specifier.startsWith("../")) return;
    const target = path.posix.normalize(
      path.posix.join(path.posix.dirname(filePath), specifier),
    );
    if (target === ".." || target.startsWith("../") || path.posix.isAbsolute(target)) {
      throw new Error(`Generated shell module ${filePath} imports outside dist: ${specifier}`);
    }
    references.add(target);
  };
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
    ) {
      add(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])
    ) {
      add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return [...references].sort();
}
