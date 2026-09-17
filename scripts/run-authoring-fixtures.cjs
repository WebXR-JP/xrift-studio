#!/usr/bin/env node
/** Execute actual TS modules without the renderer. Node 22.15+ and TypeScript required. */
const fs = require("node:fs");
const path = require("node:path");
const { fileURLToPath, pathToFileURL } = require("node:url");
const { registerHooks } = require("node:module");
let ts;
try { ts = require(process.env.XRIFT_TYPESCRIPT_PATH || "typescript"); }
catch { console.error("Install TypeScript or set XRIFT_TYPESCRIPT_PATH to an installed compiler."); process.exit(1); }
if (!registerHooks) { console.error("Node 22.15 or newer is required for this standalone runner."); process.exit(1); }
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if ((specifier.startsWith(".") || specifier.startsWith("/")) && context.parentURL?.startsWith("file:")) {
      const url = new URL(specifier, context.parentURL);
      const file = fileURLToPath(url);
      for (const candidate of [file, `${file}.ts`, `${file}.tsx`, `${file}.js`, path.join(file, "index.ts")]) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("file:") && /\.tsx?$/.test(url)) {
      const fileName = fileURLToPath(url);
      const result = ts.transpileModule(fs.readFileSync(fileName, "utf8"), {
        fileName, reportDiagnostics: true,
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
      });
      const errors = (result.diagnostics || []).filter((entry) => entry.category === ts.DiagnosticCategory.Error);
      if (errors.length) throw new Error(ts.formatDiagnostics(errors, { getCanonicalFileName: (name) => name, getCurrentDirectory: () => process.cwd(), getNewLine: () => "\n" }));
      return { format: "module", source: result.outputText, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
const suites = {
  hierarchy: ["hierarchy-transfer.fixture.ts", "runHierarchyTransferFixtureAssertions"],
  authoring: ["authoring-workflow.fixture.ts", "runAuthoringWorkflowFixtureAssertions"],
};
(async () => {
  try {
    for (const key of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(suites)) {
      if (!suites[key]) throw new Error(`Unknown suite: ${key}`);
      const [file, entry] = suites[key];
      const fixture = await import(pathToFileURL(path.resolve(__dirname, "../src/lib/visual-editor", file)).href);
      const result = await fixture[entry]();
      console.log(JSON.stringify({ status: "passed", suite: key, typescript: ts.version, ...result }, null, 2));
    }
  } finally { hooks.deregister(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
