#!/usr/bin/env node
/**
 * Renderer-free smoke test for the actual Hierarchy transfer source.
 * Normal use after dependency installation: node scripts/test-hierarchy-transfer.cjs
 * An already-installed compiler can be used via XRIFT_TYPESCRIPT_PATH.
 * This transpiles and executes the fixture; it does NOT replace pnpm typecheck.
 */
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
let ts;
try {
  if (process.env.XRIFT_TYPESCRIPT_PATH) ts = require(process.env.XRIFT_TYPESCRIPT_PATH);
  else { try { ts = require("typescript-test-api"); } catch { ts = require("typescript"); } }
} catch (error) {
  console.error("TypeScript is required. Install the project dependencies, or set XRIFT_TYPESCRIPT_PATH to an installed TypeScript package.");
  console.error(error.message);
  process.exit(1);
}
const previous = Module._extensions[".ts"];
Module._extensions[".ts"] = (module, fileName) => {
  const result = ts.transpileModule(fs.readFileSync(fileName, "utf8"), {
    fileName,
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
    reportDiagnostics: true,
  });
  const errors = (result.diagnostics || []).filter((entry) => entry.category === ts.DiagnosticCategory.Error);
  if (errors.length) {
    throw new Error(ts.formatDiagnostics(errors, {
      getCanonicalFileName: (name) => name,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => "\n",
    }));
  }
  module._compile(result.outputText, fileName);
};
(async () => {
  try {
    const fixture = require(path.resolve(__dirname, "../src/lib/visual-editor/hierarchy-transfer.fixture.ts"));
    const result = await fixture.runHierarchyTransferFixtureAssertions();
    console.log(JSON.stringify({ status: "passed", suite: "Hierarchy transfer", typescript: ts.version, ...result }, null, 2));
    const ux = require(path.resolve(__dirname, "../src/lib/visual-editor/editor-ux-cleanup.fixture.ts"));
    console.log(JSON.stringify({ status: "passed", suite: "Editor UX cleanup", ...ux.runEditorUxCleanupFixtureAssertions() }, null, 2));
  } finally {
    if (previous) Module._extensions[".ts"] = previous;
    else delete Module._extensions[".ts"];
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
