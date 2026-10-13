#!/usr/bin/env node
/** Prepare real Classic artifacts using synthetic assets, never a user project. */
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { spawn } = require("node:child_process");
const { createHash } = require("node:crypto");
const { registerHooks } = require("node:module");
const assert = require("node:assert/strict");

const workspace = fs.realpathSync(path.resolve(__dirname, ".."));
const cache = path.join(workspace, "node_modules/.cache/xrift-studio/classic-mtoon-export");
const completedPath = path.join(cache, "completed.json");
const defaultCliVersion = "0.25.0";
const templateRepository = "WebXR-JP/xrift-world-template";
const defaultTemplateCommit = "e8b22b78a51cf83748a2019c80e2b639bb137dff";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const log = message => console.log(`[classic-mtoon-export] ${message}`);
const load = relative => import(pathToFileURL(path.resolve(workspace, relative)).href);

function contained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

// Check existing ancestors as well: a cache symlink must not redirect writes.
function checkedPath(root, relative = "") {
  const absolute = path.resolve(root, relative);
  assert(contained(workspace, root) && contained(root, absolute), `Path outside isolated fixture: ${absolute}`);
  let ancestor = workspace;
  for (const segment of path.relative(workspace, absolute).split(path.sep).filter(Boolean)) {
    ancestor = path.join(ancestor, segment);
    try { assert(!fs.lstatSync(ancestor).isSymbolicLink(), `Symlink in fixture path: ${ancestor}`); }
    catch (error) { if (error.code === "ENOENT") break; throw error; }
  }
  return absolute;
}

function parseOptions() {
  const options = { cli: process.env.XRIFT_CLASSIC_CLI_ENTRY, cliVersion: defaultCliVersion, templateCommit: defaultTemplateCommit };
  const names = { "--cli": "cli", "--cli-version": "cliVersion", "--template-commit": "templateCommit" };
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index++) {
    const name = names[args[index]];
    assert(name && args[index + 1] && !args[index + 1].startsWith("--"), `Invalid argument: ${args[index]}`);
    options[name] = args[++index];
  }
  assert(options.cli, "Specify --cli <installed @xrift/cli/dist/index.js> or XRIFT_CLASSIC_CLI_ENTRY.");
  assert(/^\d+\.\d+\.\d+$/.test(options.cliVersion), "--cli-version must be an exact stable version.");
  assert(/^[a-f0-9]{40}$/i.test(options.templateCommit), "--template-commit must be a full Git commit SHA.");
  return options;
}

async function prepare() {
  checkedPath(workspace, path.relative(workspace, cache));
  await fsp.mkdir(cache, { recursive: true });
  checkedPath(cache);
  // A second preparation must not invalidate an active run or overwrite its gate.
  const lockPath = checkedPath(cache, "prepare.lock");
  const lock = await fsp.open(lockPath, "wx");
  let completionTemporary;
  let hooks;
  const environmentNames = ["XRIFT_TYPESCRIPT_PATH", "XRIFT_STUDIO_XRIFT_BIN", "XRIFT_CLASSIC_NODE", "XRIFT_CLASSIC_CLI_ENTRY", "XRIFT_CLASSIC_TEMPLATE", "XRIFT_CLASSIC_DOWNLOAD_CACHE", "PATH"];
  const originalEnvironment = Object.fromEntries(environmentNames.map(name => [name, process.env[name]]));
  try {
    // Failure anywhere below cannot leave an old result looking like this run passed.
    await fsp.rm(checkedPath(cache, "completed.json"), { force: true });
    const options = parseOptions();
    assert(registerHooks, "Node.js 22.15 or newer is required.");
    const typescript = require("typescript-test-api");
    assert(typeof typescript.transpileModule === "function", "Install the repository's locked dependencies first.");
    const cliEntry = fs.realpathSync(path.resolve(options.cli));
    assert(fs.statSync(cliEntry).isFile() && path.basename(cliEntry) === "index.js" && path.basename(path.dirname(cliEntry)) === "dist", "--cli must name the official dist/index.js entry.");
    const cliPackage = JSON.parse(await fsp.readFile(path.join(path.dirname(cliEntry), "../package.json"), "utf8"));
    assert.equal(cliPackage.name, "@xrift/cli");
    assert.equal(cliPackage.version, options.cliVersion, "Installed CLI differs from --cli-version.");

    process.env.XRIFT_TYPESCRIPT_PATH = "typescript-test-api";
    // Reuse the existing TypeScript/?raw loader without running its fixture suites.
    const hookSource = await fsp.readFile(path.join(workspace, "scripts/run-authoring-fixtures.cjs"), "utf8");
    const entryOffset = hookSource.indexOf("(async () => {");
    assert(entryOffset > 0, "The standalone fixture loader changed; review this harness.");
    hooks = eval(`${hookSource.slice(0, entryOffset)}\nhooks;`);

    const runRoot = await fsp.mkdtemp(checkedPath(cache, "run-"));
    const inRun = (root, relative = "") => {
      assert(contained(runRoot, path.resolve(root)), "Only this run's synthetic projects may be accessed.");
      return checkedPath(path.resolve(root), relative);
    };
    const writeFixture = async (root, relative, bytes) => {
      const absolute = inRun(root, relative);
      await fsp.mkdir(path.dirname(absolute), { recursive: true });
      await fsp.writeFile(inRun(root, relative), bytes);
    };
    const template = `${templateRepository}#${options.templateCommit.toLowerCase()}`;
    const downloadCache = inRun(runRoot, "template-download-cache");
    await fsp.mkdir(downloadCache);
    const runCli = args => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [cliEntry, ...args, "--template", template], {
        cwd: inRun(runRoot), windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, TMP: downloadCache, TEMP: downloadCache, TMPDIR: downloadCache, XDG_CACHE_HOME: downloadCache },
      });
      child.stdout.on("data", chunk => process.stdout.write(chunk));
      child.stderr.on("data", chunk => process.stderr.write(chunk));
      child.once("error", reject);
      child.once("close", code => code === 0 ? resolve() : reject(new Error(`Official CLI exited ${code}`)));
    });

    const [{ MTOON_EXPORT_TEXTURE_ROLES, createMToonExportFixtureDocuments },
      { serializeVisualProjectDocuments }, { compileVisualProject },
      { convertVisualProject, EXPORT_MANIFEST_PATH },
      { inspectClassicExportTarget, exportVisualProjectToClassic, planClassicExportFiles },
      { resolveBundledAssetSource }, { tauri },
      { parsePackageSpec, declaredVersionReaches, COMPILER_WORLD_COMPONENTS_PACKAGE_SPEC }] = await Promise.all([
      load("src/lib/visual-editor/compiler/mtoon-export.fixture.ts"), load("src/lib/visual-editor/persistence.ts"),
      load("src/lib/visual-editor/compiler/index.ts"), load("cli/convert.mjs"),
      load("src/lib/visual-editor/classic-export.ts"), load("cli/bundled-assets.mjs"), load("src/lib/tauri.ts"),
      load("src/lib/visual-editor/compiler/runtime-packages.ts"),
    ]);
    const png = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64"));
    const { documents, binaryFiles } = await createMToonExportFixtureDocuments(Object.fromEntries(MTOON_EXPORT_TEXTURE_ROLES.map(role => [role, png])));
    const authoring = path.join(runRoot, "authoring");
    const serialized = serializeVisualProjectDocuments(documents);
    await writeFixture(authoring, "xrift-studio.project.json", serialized.projectJson);
    await writeFixture(authoring, documents.project.assetManifestPath, serialized.assetManifestJson);
    for (const file of [...serialized.sceneDocuments, ...serialized.prefabDocuments]) await writeFixture(authoring, file.relativePath, file.content);
    for (const [relative, bytes] of binaryFiles) await writeFixture(authoring, relative, bytes);
    await writeFixture(authoring, "public/thumbnail.png", png);
    await writeFixture(runRoot, "README.txt", "Synthetic validation fixtures: two generated VRM humanoids and ten white PNG textures. No user assets or credentials. Actual CLI/Classic conversion and filesystem writes; no dependency installation, build, authentication or upload.\n");
    const compilation = compileVisualProject(documents, { outputMode: "classic-jsx" });
    assert(compilation.canStage, JSON.stringify(compilation.diagnostics));
    assert.equal(compilation.stagingPlan.assetCopyPlan.length, 12);
    const plan = planClassicExportFiles(compilation, documents.project.projectId, "world");

    // Converter's executable adapter only forwards its fixed create arguments.
    // Paths go through quoted environment values, not interpolated shell code.
    process.env.XRIFT_CLASSIC_NODE = process.execPath;
    process.env.XRIFT_CLASSIC_CLI_ENTRY = cliEntry;
    process.env.XRIFT_CLASSIC_TEMPLATE = template;
    process.env.XRIFT_CLASSIC_DOWNLOAD_CACHE = downloadCache;
    const wrapperName = process.platform === "win32" ? "xrift-classic-fixture.cmd" : "xrift-classic-fixture.sh";
    const wrapperSource = process.platform === "win32"
      ? '@echo off\r\nsetlocal DisableDelayedExpansion\r\nset "TEMP=%XRIFT_CLASSIC_DOWNLOAD_CACHE%"\r\nset "TMP=%XRIFT_CLASSIC_DOWNLOAD_CACHE%"\r\nset "XDG_CACHE_HOME=%XRIFT_CLASSIC_DOWNLOAD_CACHE%"\r\n"%XRIFT_CLASSIC_NODE%" "%XRIFT_CLASSIC_CLI_ENTRY%" %* --template "%XRIFT_CLASSIC_TEMPLATE%"\r\nexit /b %errorlevel%\r\n'
      : '#!/bin/sh\nexport TMPDIR="$XRIFT_CLASSIC_DOWNLOAD_CACHE" XDG_CACHE_HOME="$XRIFT_CLASSIC_DOWNLOAD_CACHE"\nexec "$XRIFT_CLASSIC_NODE" "$XRIFT_CLASSIC_CLI_ENTRY" "$@" --template "$XRIFT_CLASSIC_TEMPLATE"\n';
    await writeFixture(runRoot, wrapperName, wrapperSource);
    if (process.platform === "win32") {
      // A fixed executable name avoids cmd.exe path parsing when checkout has spaces.
      process.env.PATH = `${runRoot}${path.delimiter}${process.env.PATH || ""}`;
      process.env.XRIFT_STUDIO_XRIFT_BIN = wrapperName;
    } else {
      await fsp.chmod(inRun(runRoot, wrapperName), 0o700);
      process.env.XRIFT_STUDIO_XRIFT_BIN = inRun(runRoot, wrapperName);
    }
    const cliOutput = path.join(runRoot, "cli-convert");
    log(`CLI ${cliPackage.version}; template ${template}; converting with --skip-install`);
    const report = await convertVisualProject({ source: authoring, out: cliOutput, cliVersion: cliPackage.version, onProgress: log });
    assert.equal(report.status, "succeeded", JSON.stringify(report));
    const classicOutput = path.join(runRoot, "existing-classic");
    await runCli(["create", "world", "existing-classic", "--skip-install", "-y"]);

    // Adapt IPC transport to real isolated FS; retain production export logic.
    Object.assign(tauri, {
      readTextFile: (root, relative) => fsp.readFile(inRun(root, relative), "utf8"),
      writeTextFile: writeFixture,
      listFiles: async (root, relative) => Promise.all((await fsp.readdir(inRun(root, relative), { withFileTypes: true })).map(async entry => ({
        name: entry.name, rel: relative ? `${relative}/${entry.name}` : entry.name, isDir: entry.isDirectory(),
        size: entry.isDirectory() ? null : (await fsp.stat(inRun(root, path.join(relative, entry.name)))).size,
      }))),
      readProjectFileDataUrl: async (root, relative) => `data:application/octet-stream;base64,${(await fsp.readFile(inRun(root, relative))).toString("base64")}`,
      writeBinaryFile: (root, relative, dataUrl) => writeFixture(root, relative, Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64")),
      deletePath: (root, relative) => fsp.rm(inRun(root, relative), { force: true }),
    });
    const target = await inspectClassicExportTarget(classicOutput, "world");
    const exported = await exportVisualProjectToClassic({
      authoringProjectPath: authoring, target, documents, integration: "replace-entry", installDependencies: false,
      save: async () => authoring, report: progress => log(`${progress.stage}: ${progress.percent}%`), onLog: line => log(String(line)),
      loadBundledAssets: async entries => Promise.all(entries.map(async entry => ({ targetRelativePath: entry.targetRelativePath,
        dataUrl: `data:application/octet-stream;base64,${(await fsp.readFile(resolveBundledAssetSource(entry))).toString("base64")}`,
      }))),
    });
    assert.notEqual(exported.packageInstallation, "installed");

    const outputs = [
      { root: cliOutput, kind: "cli-convert", manifest: EXPORT_MANIFEST_PATH, source: "src/World.tsx" },
      { root: classicOutput, kind: "classic-replace-entry", manifest: `${plan.exportRoot}/export-manifest.json`, source: plan.sceneSourceFile },
    ];
    const verification = [];
    for (const output of outputs) {
      assert.match(await fsp.readFile(inRun(output.root, "src/index.tsx"), "utf8"), /World/);
      const generatedSource = await fsp.readFile(inRun(output.root, output.source), "utf8");
      assert.match(generatedSource, /MToon/);
      const manifest = JSON.parse(await fsp.readFile(inRun(output.root, output.manifest), "utf8"));
      assert.equal(manifest.sourceProjectId, documents.project.projectId);
      assert.equal(manifest.targetKind ?? manifest.sourceProjectKind, "world");
      assert(Array.isArray(manifest.files) && manifest.files.length > 0);
      for (const file of manifest.files) {
        const relative = typeof file === "string" ? file : file.path;
        const bytes = await fsp.readFile(inRun(output.root, relative));
        if (typeof file === "object") assert.equal(sha(bytes), file.sha256, `${output.kind} manifest integrity ${relative}`);
      }
      const packageJson = JSON.parse(await fsp.readFile(inRun(output.root, "package.json"), "utf8"));
      const dependencies = { ...packageJson.devDependencies, ...packageJson.dependencies };
      for (const spec of plan.packageSpecs) {
        const { name, version } = parsePackageSpec(spec);
        if (spec === COMPILER_WORLD_COMPONENTS_PACKAGE_SPEC) assert(declaredVersionReaches(dependencies[name], version));
        else assert.equal(dependencies[name], version, `${output.kind} dependency ${name}`);
      }
      for (const entry of compilation.stagingPlan.assetCopyPlan) assert.equal(
        sha(await fsp.readFile(inRun(output.root, entry.targetRelativePath))), sha(await fsp.readFile(inRun(authoring, entry.sourceRelativePath))), `${output.kind} source asset ${entry.targetRelativePath}`);
      for (const entry of compilation.stagingPlan.bundledAssetCopyPlan) assert.equal(
        sha(await fsp.readFile(inRun(output.root, entry.targetRelativePath))), sha(await fsp.readFile(resolveBundledAssetSource(entry))), `${output.kind} bundled asset ${entry.targetRelativePath}`);
      // Existing Classic exports intentionally keep that project's publication thumbnail.
      if (output.kind === "cli-convert") for (const entry of compilation.stagingPlan.requiredPublicationFiles) assert.equal(
        sha(await fsp.readFile(inRun(output.root, entry.targetRelativePath))), sha(await fsp.readFile(inRun(authoring, entry.sourceRelativePath))), `${output.kind} publication file ${entry.targetRelativePath}`);
      const sourcePlan = output.kind === "cli-convert" ? compilation.stagingPlan.overlayFiles : [...plan.sourceFiles, ...plan.metadataFiles];
      for (const file of sourcePlan) {
        const bytes = await fsp.readFile(inRun(output.root, file.relativePath), "utf8");
        if (output.kind === "cli-convert" && file.relativePath === "xrift.json") {
          const actual = JSON.parse(bytes), expected = JSON.parse(file.content);
          for (const pattern of expected.world.ignore) assert(actual.world.ignore.includes(pattern));
          delete actual.world.ignore; delete expected.world.ignore;
          assert.deepEqual(actual, expected, "CLI preserves compiled configuration and template exclusions");
        } else if (file.relativePath.endsWith("/compiler-provenance.json")) {
          const actual = JSON.parse(bytes), expected = JSON.parse(file.content);
          assert(Number.isFinite(Date.parse(actual.generatedAt)));
          delete actual.generatedAt; delete expected.generatedAt;
          assert.deepEqual(actual, expected, `${output.kind} compiler provenance/source hashes`);
        } else assert.equal(bytes, file.content, `${output.kind} generated file ${file.relativePath}`);
      }
      verification.push({ kind: output.kind, assetCount: compilation.stagingPlan.assetCopyPlan.length,
        decoderCount: compilation.stagingPlan.bundledAssetCopyPlan.length, sourceCount: sourcePlan.length,
        manifest: output.manifest, generatedSourceHash: sha(generatedSource) });
      log(`Verified ${output.kind}: ${verification.at(-1).assetCount} assets; ${sourcePlan.length} emitted files`);
    }
    assert.equal(verification[0].generatedSourceHash, verification[1].generatedSourceHash);
    const completion = { syntheticValidationFixture: true, preparedAt: new Date().toISOString(), runRoot,
      cliVersion: cliPackage.version, cliEntryHash: sha(await fsp.readFile(cliEntry)), templateRepository,
      templateCommit: options.templateCommit.toLowerCase(), sourceProjectId: documents.project.projectId,
      outputs: outputs.map(({ root, kind }) => ({ root, kind })), verification };
    completionTemporary = checkedPath(cache, `completed-${process.pid}.tmp`);
    await fsp.writeFile(completionTemporary, JSON.stringify(completion, null, 2) + "\n", { flag: "wx" });
    await fsp.rename(completionTemporary, checkedPath(cache, "completed.json"));
    completionTemporary = undefined;
    log(`Ready: ${completedPath}`);
  } catch (error) {
    await fsp.rm(checkedPath(cache, "completed.json"), { force: true });
    if (completionTemporary) await fsp.rm(checkedPath(cache, path.basename(completionTemporary)), { force: true });
    throw error;
  } finally {
    hooks?.deregister();
    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    await lock.close();
    await fsp.rm(checkedPath(cache, "prepare.lock"), { force: true });
  }
}

if (process.argv.slice(2).includes("--help")) {
  console.log("Usage: node scripts/prepare-classic-mtoon-exports.cjs --cli <installed @xrift/cli/dist/index.js> [--cli-version 0.25.0] [--template-commit <40-character SHA>]\nCLI path may also be set with XRIFT_CLASSIC_CLI_ENTRY. Requires Node 22.15+, locked repository dependencies and GitHub network access. Uses synthetic assets and --skip-install; never builds, authenticates or uploads. A successful run writes node_modules/.cache/xrift-studio/classic-mtoon-export/completed.json; a failed run removes the previous gate.");
} else prepare().catch(error => { console.error(error); process.exitCode = 1; });
