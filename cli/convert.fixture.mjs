import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { convertVisualProject, ConvertError } from "./convert.mjs";
import { createPrototypeProject } from "../src/lib/visual-editor/prototype-project.ts";
import {
  assetManifestCodec,
  sceneDocumentCodec,
  visualProjectDocumentCodec,
} from "../src/lib/visual-editor/serialization.ts";
import { XriftThreeLoader } from "../packages/xrift-studio-runtime/src/three/index.ts";
import { runStarterTemplateFixtureAssertions } from "../src/lib/visual-editor/starter-templates.fixture.ts";
import { runVisualCompilerFixtureAssertions } from "../src/lib/visual-editor/compiler/fixture.ts";

const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "xrift-studio-convert-"));
const previousXriftBin = process.env.XRIFT_STUDIO_XRIFT_BIN;
try {
  const visualRoot = path.join(fixtureRoot, "visual-world");
  const classicRoot = path.join(fixtureRoot, "classic-world");
  const prototype = createPrototypeProject("world", "Runtime Fixture");
  await mkdir(path.join(visualRoot, "scenes"), { recursive: true });
  await mkdir(path.join(visualRoot, "assets"), { recursive: true });
  await mkdir(path.join(visualRoot, "public"), { recursive: true });
  await writeFile(
    path.join(visualRoot, "xrift-studio.project.json"),
    visualProjectDocumentCodec.serialize(prototype.project),
  );
  await writeFile(
    path.join(visualRoot, "scenes", "main.scene.json"),
    sceneDocumentCodec.serialize(prototype.scene),
  );
  await writeFile(
    path.join(visualRoot, "assets", "assets.json"),
    assetManifestCodec.serialize(prototype.assets),
  );
  await writeFile(path.join(visualRoot, "public", "thumbnail.png"), "thumbnail");

  process.env.XRIFT_STUDIO_XRIFT_BIN = await createFakeXrift(fixtureRoot);
  const dryRun = await convertVisualProject({
    source: visualRoot,
    out: classicRoot,
    dryRun: true,
    update: false,
    cliVersion: "fixture",
  });
  assert(dryRun.status === "ready", "dry-run must report a writable export");
  assert(
    dryRun.plannedFiles.includes("public/xrift/runtime.json"),
    "dry-run must include Runtime JSON",
  );

  const converted = await convertVisualProject({
    source: visualRoot,
    out: classicRoot,
    dryRun: false,
    update: false,
    cliVersion: "fixture",
  });
  assert(converted.status === "succeeded", "convert must succeed");
  const runtime = JSON.parse(
    await readFile(path.join(classicRoot, "public", "xrift", "runtime.json"), "utf8"),
  );
  assert(runtime.format === "xrift-studio.runtime", "runtime format is incorrect");
  const loaded = await new XriftThreeLoader().parse(runtime);
  assert(loaded.entities.size === 4, "Three loader did not create all fixture entities");
  const worldSource = await readFile(path.join(classicRoot, "src", "World.tsx"), "utf8");
  assert(
    worldSource.includes("xrift-studio-runtime/react-three-fiber") &&
      worldSource.includes('/xrift/runtime.json'),
    "Classic adapter is not using xrift-studio-runtime",
  );
  const packageJson = JSON.parse(
    await readFile(path.join(classicRoot, "package.json"), "utf8"),
  );
  assert(
    packageJson.dependencies?.["xrift-studio-runtime"] === "0.1.0",
    "Classic package is missing the runtime dependency",
  );

  const updated = await convertVisualProject({
    source: visualRoot,
    out: classicRoot,
    dryRun: false,
    update: true,
    cliVersion: "fixture",
  });
  assert(updated.status === "succeeded", "owned export update must succeed");

  await writeFile(path.join(classicRoot, "src", "World.tsx"), "// user edit\n");
  let modifiedRejected = false;
  try {
    await convertVisualProject({
      source: visualRoot,
      out: classicRoot,
      dryRun: true,
      update: true,
      cliVersion: "fixture",
    });
  } catch (error) {
    modifiedRejected =
      error instanceof ConvertError && error.code === "update-file-modified";
  }
  assert(modifiedRejected, "--update must reject a modified Classic export");
  runVisualCompilerFixtureAssertions();
  runStarterTemplateFixtureAssertions();
  process.stdout.write("convert/runtime fixture passed\n");
} finally {
  if (previousXriftBin === undefined) {
    delete process.env.XRIFT_STUDIO_XRIFT_BIN;
  } else {
    process.env.XRIFT_STUDIO_XRIFT_BIN = previousXriftBin;
  }
  await rm(fixtureRoot, { recursive: true, force: true });
}

async function createFakeXrift(root) {
  const scriptPath = path.join(root, "fake-xrift.mjs");
  await writeFile(
    scriptPath,
    `import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const [command, kind, name] = process.argv.slice(2);
if (command !== "create" || !["world", "item"].includes(kind) || !name) process.exit(2);
const root = path.join(process.cwd(), name);
await mkdir(path.join(root, "src"), { recursive: true });
await mkdir(path.join(root, "public"), { recursive: true });
await writeFile(path.join(root, "package.json"), JSON.stringify({ name, private: true, type: "module", scripts: { build: "vite build" }, dependencies: { react: "^19.0.0", three: "^0.185.0" } }, null, 2) + "\\n");
await writeFile(path.join(root, "xrift.json"), "{}\\n");
await writeFile(path.join(root, "src", kind === "world" ? "World.tsx" : "Item.tsx"), "export {};\\n");
await writeFile(path.join(root, "README.md"), "# Fixture\\n");
`,
  );
  if (process.platform === "win32") {
    const wrapper = path.join(root, "fake-xrift.cmd");
    await writeFile(wrapper, `@echo off\r\n"${process.execPath}" "${scriptPath}" %*\r\n`);
    return wrapper;
  }
  const wrapper = path.join(root, "fake-xrift");
  await writeFile(wrapper, `#!/bin/sh\nexec "${process.execPath}" "${scriptPath}" "$@"\n`);
  await chmod(wrapper, 0o755);
  return wrapper;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
