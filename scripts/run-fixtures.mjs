import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = process.argv.slice(2);
if (files.length === 0) {
  throw new Error("Usage: pnpm test:fixtures <path/to/module.fixture.ts> [...files]");
}

// Transform only the requested modules; do not load the app plugins, bind a
// port, or write release artifacts. This also works in a second worktree.
const server = await createServer({
  root,
  configFile: false,
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  for (const file of files) {
    const module = await server.ssrLoadModule(path.resolve(root, file));
    const suites = Object.entries(module).filter(([name, value]) =>
      /^run\w*(?:Fixture|Fixtures|FixtureAssertions|Assertions)$/.test(name) &&
      typeof value === "function",
    );
    if (suites.length === 0) throw new Error(`No fixture entry points found in ${file}`);
    for (const [name, run] of suites) {
      const started = performance.now();
      await run();
      console.log(`PASS ${file} :: ${name} (${Math.round(performance.now() - started)} ms)`);
    }
  }
} finally {
  await server.close();
}
