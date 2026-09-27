import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { directRelativeModuleImports } from "./world-runtime-shell-imports.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(
  repoRoot,
  "packages",
  "xrift-studio-runtime",
  "src",
  "schema.ts",
);
const webUploadPath = path.join(
  repoRoot,
  "src",
  "lib",
  "visual-editor",
  "web-upload.ts",
);
const compilerPath = path.join(
  repoRoot,
  "src",
  "lib",
  "visual-editor",
  "compiler",
  "compile.ts",
);
const shellBuilderPath = path.join(repoRoot, "scripts", "build-world-runtime-shell.mjs");
const manifestPath = path.join(
  repoRoot,
  "public",
  "xrift-runtime-shell",
  "shell-manifest.json",
);

const schema = await fs.readFile(schemaPath, "utf8");
const expected = schema.match(
  /XRIFT_RUNTIME_CONTRACT_VERSION\s*=\s*[\r\n\s]*"([^"]+)"/,
)?.[1];
if (!expected) {
  throw new Error(`Runtime contract version is missing from ${schemaPath}`);
}
const webUpload = await fs.readFile(webUploadPath, "utf8");
const compiler = await fs.readFile(compilerPath, "utf8");
const shellBuilder = await fs.readFile(shellBuilderPath, "utf8");
const required = webUpload.match(
  /REQUIRED_RUNTIME_SHELL_CONTRACT\s*=\s*[\r\n\s]*"([^"]+)"/,
)?.[1];
if (required !== expected) {
  throw new Error(
    `Runtime contract constants disagree. schema=${expected} web-upload=${required ?? "missing"}`,
  );
}
const uploadedManifest = webUpload.match(/const RUNTIME_MANIFEST_PATH = "([^"]+)"/)?.[1];
const compiledManifest = compiler.match(/const PUBLISHED_RUNTIME_MANIFEST_FILE = "([^"]+)"/)?.[1];
if (!uploadedManifest || uploadedManifest !== compiledManifest) {
  throw new Error(
    `Web upload and compiler manifest paths differ. upload=${uploadedManifest ?? "missing"} compiler=${compiledManifest ?? "missing"}`,
  );
}
const shellManifestUrl = `new URL("./${uploadedManifest}", import.meta.url)`;
if (!shellBuilder.includes(shellManifestUrl)) {
  throw new Error(`Runtime shell source must load the uploaded ${uploadedManifest} from the world root`);
}
if (!shellBuilder.includes('<XriftWorld manifest={MANIFEST_URL} physics="inherit" />')) {
  throw new Error("Runtime shell source must inherit the XRift player Physics provider");
}

let manifest;
try {
  manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
} catch (error) {
  throw new Error(
    `Runtime shell manifest could not be read: ${manifestPath}\n${error instanceof Error ? error.message : String(error)}`,
  );
}
if (manifest.runtimeContract !== expected) {
  throw new Error(
    `Runtime shell is stale. expected=${expected} detected=${manifest.runtimeContract ?? "missing"}. Run node scripts/build-world-runtime-shell.mjs before release.`,
  );
}
const studioPackage = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"));
const worldComponentsVersion = studioPackage.dependencies["@xrift/world-components"];
if (manifest.worldComponentsVersion !== worldComponentsVersion) {
  throw new Error(
    `Runtime shell Components differ from the editor. expected=${worldComponentsVersion} detected=${manifest.worldComponentsVersion ?? "missing"}. Rebuild the runtime shell.`,
  );
}
const runtimeInstallation = await fs.readFile(path.join(repoRoot, "src-tauri/src/runtime_installation.rs"), "utf8");
const cliVersion = runtimeInstallation.match(/pub const XRIFT_CLI_VERSION:\s*&str\s*=\s*"(\d+\.\d+\.\d+)"/)?.[1];
if (!cliVersion || manifest.cliVersion !== cliVersion) {
  throw new Error(`Runtime shell CLI differs from setup. expected=${cliVersion ?? "missing"} detected=${manifest.cliVersion ?? "missing"}`);
}
if (manifest.entry !== "remoteEntry.js") {
  throw new Error(`Runtime shell entry must be remoteEntry.js (detected ${manifest.entry ?? "missing"})`);
}
if (!Array.isArray(manifest.files) || !manifest.files.includes("remoteEntry.js")) {
  throw new Error("Runtime shell manifest does not list remoteEntry.js");
}
const exposedWorldFiles = manifest.files.filter((file) => /^__federation_expose_World-[^/]+\.js$/.test(file));
if (exposedWorldFiles.length !== 1) {
  throw new Error(`Runtime shell must contain one exposed World chunk (detected ${exposedWorldFiles.length})`);
}
const exposedWorld = await fs.readFile(
  path.join(repoRoot, "public", "xrift-runtime-shell", exposedWorldFiles[0]),
  "utf8",
);
if (!exposedWorld.includes(shellManifestUrl)) {
  throw new Error(`Bundled Runtime shell must load the uploaded ${uploadedManifest} from the world root`);
}
const mountProps = exposedWorld.match(/\bjsx\w*\(XriftWorld,\s*\{([^}]+)\}\)/)?.[1];
if (!mountProps || !/\bmanifest:\s*MANIFEST_URL\b/.test(mountProps) || !/\bphysics:\s*["']inherit["']/.test(mountProps)) {
  throw new Error("Bundled Runtime shell must mount XriftWorld in the XRift player Physics provider");
}
const shellFiles = new Set(manifest.files);
const modules = manifest.files.filter((entry) => entry.endsWith(".js")).sort();
if (!manifest.dependencies || typeof manifest.dependencies !== "object" || Array.isArray(manifest.dependencies)) {
  throw new Error("Runtime shell manifest must declare direct module dependencies");
}
if (JSON.stringify(Object.keys(manifest.dependencies).sort()) !== JSON.stringify(modules)) {
  throw new Error("Runtime shell dependency map must contain every listed JS file exactly once");
}
for (const file of modules) {
  const source = await fs.readFile(path.join(repoRoot, "public", "xrift-runtime-shell", file), "utf8");
  const directImports = directRelativeModuleImports(file, source);
  if (JSON.stringify(manifest.dependencies[file]) !== JSON.stringify(directImports)) {
    throw new Error(`Runtime shell dependency map differs from compiled imports: ${file}`);
  }
  for (const dependency of directImports) {
    if (!shellFiles.has(dependency)) {
      throw new Error(`Runtime shell is missing a direct module dependency: ${file} -> ${dependency}`);
    }
  }
}
const digest = createHash("sha256");
for (const file of [...manifest.files].sort()) {
  digest.update(file);
  digest.update(await fs.readFile(path.join(repoRoot, "public", "xrift-runtime-shell", file)));
}
const version = digest.digest("hex").slice(0, 12);
if (manifest.version !== version) {
  throw new Error(`Runtime shell content differs from its manifest version. expected=${version} detected=${manifest.version ?? "missing"}`);
}
process.stdout.write(`Runtime shell contract ready: ${expected}\n`);
