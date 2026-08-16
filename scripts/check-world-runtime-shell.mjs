import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
const required = webUpload.match(
  /REQUIRED_RUNTIME_SHELL_CONTRACT\s*=\s*[\r\n\s]*"([^"]+)"/,
)?.[1];
if (required !== expected) {
  throw new Error(
    `Runtime contract constants disagree. schema=${expected} web-upload=${required ?? "missing"}`,
  );
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
if (manifest.entry !== "remoteEntry.js") {
  throw new Error(`Runtime shell entry must be remoteEntry.js (detected ${manifest.entry ?? "missing"})`);
}
if (!Array.isArray(manifest.files) || !manifest.files.includes("remoteEntry.js")) {
  throw new Error("Runtime shell manifest does not list remoteEntry.js");
}
process.stdout.write(`Runtime shell contract ready: ${expected}\n`);
