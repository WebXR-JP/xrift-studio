import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript-test-api";

/** Only the isolated shell template resolves the pinned readable distribution. */
export function withReadableVrmAlias(source) {
  const parsed = ts.createSourceFile("vite.config.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const exported = parsed.statements.find(ts.isExportAssignment);
  const config = exported && ts.isCallExpression(exported.expression)
    && exported.expression.arguments.length === 1 ? exported.expression.arguments[0] : undefined;
  const property = (object, key) => object?.properties.find(entry => ts.isPropertyAssignment(entry)
    && (ts.isIdentifier(entry.name) || ts.isStringLiteral(entry.name)) && entry.name.text === key);
  const resolve = config && ts.isObjectLiteralExpression(config) ? property(config, "resolve")?.initializer : undefined;
  const aliases = resolve && ts.isObjectLiteralExpression(resolve) ? property(resolve, "alias")?.initializer : undefined;
  const pathImport = parsed.statements.some(statement => ts.isImportDeclaration(statement)
    && ts.isStringLiteral(statement.moduleSpecifier) && ["node:path", "path"].includes(statement.moduleSpecifier.text)
    && statement.importClause?.name?.text === "path");
  if (!aliases || !ts.isObjectLiteralExpression(aliases) || !pathImport
    || aliases.properties.some(entry => !ts.isPropertyAssignment(entry) || ts.isSpreadAssignment(entry)
      || ts.isComputedPropertyName(entry.name) || entry.name.text === "@pixiv/three-vrm")) {
    throw new Error("The official shell template must declare path and an explicit resolve.alias object without a three-vrm override");
  }
  const insertion = aliases.getStart(parsed) + 1;
  return `${source.slice(0, insertion)} '@pixiv/three-vrm': path.resolve(__dirname, './src/xrift-studio/three-vrm-readable.js'),${source.slice(insertion)}`;
}

export async function copyReadableVrm(repoRoot, projectDir) {
  const target = path.join(projectDir, "src", "xrift-studio");
  await fs.mkdir(target, { recursive: true });
  for (const filename of ["three-vrm-readable.js", "three-vrm-readable.d.ts", "three-vrm-readable.LICENSE"]) {
    await fs.copyFile(path.join(repoRoot, "packages", "xrift-studio-runtime", "src", "vendor", filename), path.join(target, filename));
  }
}
