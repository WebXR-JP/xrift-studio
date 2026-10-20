import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
rmSync(path.join(root, "packages/studio-pi/dist"), { recursive: true, force: true });
const build = spawnSync(process.execPath, [path.join(root, "node_modules/typescript/bin/tsc"), "-p", "packages/studio-pi/tsconfig.json"], { cwd: root, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);
const source = path.join(root, "packages/studio-pi");
const destination = path.join(root, "src-tauri/resources/pi");
rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
cpSync(path.join(source, "package.json"), path.join(destination, "package.json"));
cpSync(path.join(source, "dist"), path.join(destination, "dist"), { recursive: true });
// Materialize the installed, lockfile-selected dependency graph as ordinary
// Node packages. No network resolution, install scripts or platform symlinks.
const installed = new Map();
function dependency(base, name) {
  let current = base;
  while (true) {
    const candidate = path.join(current, "node_modules", name);
    if (existsSync(path.join(candidate, "package.json"))) return realpathSync(candidate);
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}
function installDependencies(from, to) {
  const manifest = JSON.parse(readFileSync(path.join(from, "package.json"), "utf8"));
  const names = new Set([...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.optionalDependencies ?? {}), ...Object.keys(manifest.peerDependencies ?? {})]);
  for (const name of names) {
    const origin = dependency(from, name);
    if (!origin) {
      if (manifest.dependencies?.[name] && !manifest.optionalDependencies?.[name]) throw new Error(`Missing locked Pi dependency: ${name}`);
      continue;
    }
    let ancestor = to, found = false;
    while (ancestor.startsWith(destination)) {
      const existing = path.join(ancestor, "node_modules", name);
      if (installed.has(existing)) { found = installed.get(existing) === origin; break; }
      if (ancestor === destination) break;
      ancestor = path.dirname(ancestor);
    }
    if (found) continue;
    const hoisted = path.join(destination, "node_modules", name);
    const target = installed.has(hoisted) ? path.join(to, "node_modules", name) : hoisted;
    if (installed.get(target) === origin) continue;
    if (installed.has(target)) throw new Error(`Conflicting Pi dependency: ${name}`);
    installed.set(target, origin);
    cpSync(origin, target, { recursive: true, filter: entry => path.relative(origin, entry).split(path.sep)[0] !== "node_modules" });
    installDependencies(origin, target);
  }
}
installDependencies(source, destination);
console.log(`Prepared Pi runtime (${installed.size} locked packages)`);
