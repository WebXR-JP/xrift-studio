import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  compileVisualProject,
  VISUAL_COMPILER_VERSION,
} from "../src/lib/visual-editor/compiler/index.ts";
import {
  assetManifestCodec,
  prefabDocumentCodec,
  sceneDocumentCodec,
  stableSerializeJson,
  visualProjectDocumentCodec,
} from "../src/lib/visual-editor/serialization.ts";

export const EXPORT_MANIFEST_PATH = ".xrift-studio/export-manifest.json";
export const EXPORT_MANIFEST_SCHEMA_VERSION = "1.0.0";

export class ConvertError extends Error {
  constructor(code, message, details = []) {
    super(message);
    this.name = "ConvertError";
    this.code = code;
    this.details = details;
  }
}

export async function convertVisualProject(options) {
  const source = await loadVisualProject(options.source);
  const outputRoot = path.resolve(options.out);
  assertSeparateRoots(source.root, outputRoot);
  const outputPolicy = await inspectOutput(outputRoot, {
    update: options.update,
    projectId: source.documents.project.projectId,
    targetKind: source.documents.project.projectKind,
  });

  const compilation = compileVisualProject(source.documents, {
    outputMode: "classic-runtime",
  });
  const diagnostics = [
    ...source.diagnostics,
    ...compilation.diagnostics,
    ...(await validateCopyInputs(source.root, compilation)),
  ];
  const blocked = diagnostics.some((diagnostic) => diagnostic.severity === "blocking");
  const plannedFiles = [
    ...compilation.stagingPlan.overlayFiles.map((file) => file.relativePath),
    ...compilation.stagingPlan.assetCopyPlan.map((entry) => entry.targetRelativePath),
    ...compilation.stagingPlan.requiredPublicationFiles.map(
      (entry) => entry.targetRelativePath,
    ),
    EXPORT_MANIFEST_PATH,
  ].sort();
  const baseReport = {
    command: "convert",
    status: blocked ? "blocked" : options.dryRun ? "ready" : "running",
    dryRun: options.dryRun,
    update: options.update,
    sourceRoot: source.root,
    outputRoot,
    projectId: source.documents.project.projectId,
    targetKind: compilation.targetKind,
    compilerVersion: VISUAL_COMPILER_VERSION,
    diagnostics,
    plannedFiles,
    actions: [
      `create-classic-${compilation.targetKind}-template`,
      "write-compiler-overlay",
      "copy-assets",
      "copy-thumbnail",
      "write-export-manifest",
      options.update ? "replace-owned-export" : "commit-new-export",
    ],
  };

  if (blocked || options.dryRun) return baseReport;

  options.onProgress?.(
    `Classic ${compilation.targetKind} projectを一時フォルダへ生成しています`,
  );
  const stagedProject = await materializeClassicProject({
    source,
    compilation,
    outputRoot,
    cliVersion: options.cliVersion,
    onProgress: options.onProgress,
  });

  try {
    await commitStagedProject(stagedProject, outputRoot, outputPolicy);
  } catch (error) {
    await rm(stagedProject.container, { recursive: true, force: true }).catch(
      () => undefined,
    );
    throw error;
  }

  return {
    ...baseReport,
    status: "succeeded",
  };
}

export async function loadVisualProject(sourceInput) {
  const requested = path.resolve(sourceInput);
  let requestedStat;
  try {
    requestedStat = await lstat(requested);
  } catch {
    throw new ConvertError(
      "visual-project-not-found",
      `Visual Projectが見つかりません: ${requested}`,
    );
  }
  if (requestedStat.isSymbolicLink()) {
    throw new ConvertError(
      "visual-project-symlink",
      "Visual Projectの入力にシンボリックリンクは使用できません",
    );
  }

  let root;
  let manifestPath;
  if (requestedStat.isDirectory()) {
    root = await realpath(requested);
    manifestPath = path.join(root, "xrift-studio.project.json");
  } else if (
    requestedStat.isFile() &&
    path.basename(requested) === "xrift-studio.project.json"
  ) {
    root = await realpath(path.dirname(requested));
    manifestPath = requested;
  } else {
    throw new ConvertError(
      "visual-project-input-invalid",
      "入力にはVisual Projectのフォルダまたはxrift-studio.project.jsonを指定してください",
    );
  }

  const project = await readDocument(
    root,
    "xrift-studio.project.json",
    visualProjectDocumentCodec,
    "Visual Project manifest",
  );
  const assets = await readDocument(
    root,
    project.assetManifestPath,
    assetManifestCodec,
    "Asset Manifest",
  );
  const scenes = {};
  const prefabs = {};
  const diagnostics = [];

  for (const [sceneId, relativePath] of Object.entries(project.scenePaths).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    try {
      scenes[sceneId] = await readDocument(
        root,
        relativePath,
        sceneDocumentCodec,
        `Scene ${sceneId}`,
      );
    } catch (error) {
      appendLoadDiagnostic(diagnostics, error, {
        code: "scene-load-failed",
        sceneId,
        fieldPath: `scenePaths.${sceneId}`,
      });
    }
  }

  for (const asset of Object.values(assets.assets).sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    if (
      asset.kind !== "template" ||
      asset.templateType !== "prefab" ||
      typeof asset.prefabPath !== "string"
    ) {
      continue;
    }
    try {
      const prefab = await readDocument(
        root,
        asset.prefabPath,
        prefabDocumentCodec,
        `Prefab ${asset.id}`,
      );
      prefabs[prefab.prefabId] = prefab;
    } catch (error) {
      appendLoadDiagnostic(diagnostics, error, {
        code: "prefab-load-failed",
        assetId: asset.id,
        fieldPath: "prefabPath",
      });
    }
  }

  return {
    root,
    manifestPath,
    diagnostics,
    documents: { project, scenes, assets, prefabs },
  };
}

async function readDocument(root, relativePath, codec, label) {
  const filePath = await resolveContainedFile(root, relativePath, label);
  let json;
  try {
    json = await readFile(filePath, "utf8");
  } catch {
    throw new ConvertError(
      "document-read-failed",
      `${label}を読み込めません: ${relativePath}`,
    );
  }
  const parsed = codec.parse(json);
  if (!parsed.ok) {
    throw new ConvertError(
      "document-invalid",
      `${label}が無効です: ${relativePath}`,
      parsed.issues.map((issue) => ({
        severity: "blocking",
        code: issue.code,
        message: issue.message,
        fieldPath: issue.path,
      })),
    );
  }
  return parsed.document;
}

async function validateCopyInputs(root, compilation) {
  const diagnostics = [];
  for (const entry of compilation.stagingPlan.assetCopyPlan) {
    try {
      await resolveContainedFile(root, entry.sourceRelativePath, `Asset ${entry.assetId}`);
    } catch (error) {
      appendLoadDiagnostic(diagnostics, error, {
        code: "asset-source-missing",
        assetId: entry.assetId,
        fieldPath: "source.relativePath",
      });
    }
  }
  for (const entry of compilation.stagingPlan.requiredPublicationFiles) {
    try {
      await resolveContainedFile(root, entry.sourceRelativePath, entry.purpose);
    } catch (error) {
      appendLoadDiagnostic(diagnostics, error, {
        code: "required-publication-file-missing",
        fieldPath: entry.sourceRelativePath,
      });
    }
  }
  return diagnostics;
}

function appendLoadDiagnostic(diagnostics, error, context) {
  diagnostics.push({
    severity: "blocking",
    code: context.code,
    message: error instanceof Error ? error.message : String(error),
    sceneId: context.sceneId,
    assetId: context.assetId,
    fieldPath: context.fieldPath,
  });
  if (error instanceof ConvertError) {
    diagnostics.push(...error.details);
  }
}

async function inspectOutput(outputRoot, expected) {
  const parent = path.dirname(outputRoot);
  let parentStat;
  try {
    parentStat = await stat(parent);
  } catch {
    throw new ConvertError(
      "output-parent-missing",
      `出力先の親フォルダがありません: ${parent}`,
    );
  }
  if (!parentStat.isDirectory()) {
    throw new ConvertError(
      "output-parent-invalid",
      `出力先の親がフォルダではありません: ${parent}`,
    );
  }

  let outputStat;
  try {
    outputStat = await lstat(outputRoot);
  } catch {
    if (expected.update) {
      throw new ConvertError(
        "update-target-missing",
        "--updateには既存のXRift Studio export先が必要です",
      );
    }
    return { exists: false, replaceExisting: false };
  }
  if (outputStat.isSymbolicLink() || !outputStat.isDirectory()) {
    throw new ConvertError(
      "output-target-invalid",
      "出力先はシンボリックリンクではないフォルダを指定してください",
    );
  }

  const entries = await readdir(outputRoot);
  if (!expected.update) {
    if (entries.length === 0) {
      return { exists: true, replaceExisting: true };
    }
    if (entries.includes("package.json") || entries.includes("xrift.json")) {
      throw new ConvertError(
        "classic-project-collision",
        "出力先にpackage.jsonまたはxrift.jsonがあります。既存Classic Projectへの混在はできません",
      );
    }
    throw new ConvertError(
      "output-not-empty",
      "出力先は空ではありません。新しい空フォルダを指定してください",
    );
  }

  const manifest = await readExportManifest(outputRoot);
  if (
    manifest.sourceProjectId !== expected.projectId ||
    manifest.targetKind !== expected.targetKind
  ) {
    throw new ConvertError(
      "update-owner-mismatch",
      "既存exportは別のVisual Projectまたは成果物種別から生成されています",
    );
  }
  await verifyExportIntegrity(outputRoot, manifest);
  return { exists: true, replaceExisting: true, manifest };
}

async function readExportManifest(outputRoot) {
  let json;
  try {
    json = await readFile(
      path.join(outputRoot, ...EXPORT_MANIFEST_PATH.split("/")),
      "utf8",
    );
  } catch {
    throw new ConvertError(
      "update-manifest-missing",
      "--updateはXRift Studioが生成したexport先だけに使用できます",
    );
  }
  let manifest;
  try {
    manifest = JSON.parse(json);
  } catch {
    throw new ConvertError(
      "update-manifest-invalid",
      "export-manifest.jsonが有効なJSONではありません",
    );
  }
  if (
    manifest?.schemaVersion !== EXPORT_MANIFEST_SCHEMA_VERSION ||
    !Array.isArray(manifest.files)
  ) {
    throw new ConvertError(
      "update-manifest-version",
      "export-manifest.jsonの形式がこのCLIに対応していません",
    );
  }
  return manifest;
}

async function verifyExportIntegrity(outputRoot, manifest) {
  const currentFiles = await listRegularFiles(outputRoot, {
    exclude: new Set([EXPORT_MANIFEST_PATH]),
  });
  const recorded = [...manifest.files].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
  if (
    currentFiles.length !== recorded.length ||
    currentFiles.some((entry, index) => entry.relativePath !== recorded[index]?.path)
  ) {
    throw new ConvertError(
      "update-files-changed",
      "前回export後にファイルの追加または削除があります。--updateは未改変のexportだけを更新できます",
    );
  }
  for (let index = 0; index < currentFiles.length; index += 1) {
    const current = currentFiles[index];
    const hash = await sha256File(current.absolutePath);
    if (hash !== recorded[index].sha256) {
      throw new ConvertError(
        "update-file-modified",
        `前回export後に変更されたファイルがあります: ${current.relativePath}`,
      );
    }
  }
}

async function materializeClassicProject({
  source,
  compilation,
  outputRoot,
  cliVersion,
  onProgress,
}) {
  const outputParent = path.dirname(outputRoot);
  const container = await mkdtemp(path.join(outputParent, ".xrift-studio-convert-"));
  const projectName = "classic-project";
  const projectRoot = path.join(container, projectName);
  try {
    await runXriftCreate(
      compilation.targetKind,
      projectName,
      container,
      onProgress,
    );
    const created = await stat(projectRoot).catch(() => null);
    if (!created?.isDirectory()) {
      throw new ConvertError(
        "classic-template-missing",
        "xrift createがClassic Projectを生成しませんでした",
      );
    }
    await rejectSymlinks(projectRoot);

    for (const file of compilation.stagingPlan.overlayFiles) {
      const target = resolveOutputPath(projectRoot, file.relativePath);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.content, "utf8");
    }
    for (const entry of compilation.stagingPlan.assetCopyPlan) {
      const from = await resolveContainedFile(
        source.root,
        entry.sourceRelativePath,
        `Asset ${entry.assetId}`,
      );
      const target = resolveOutputPath(projectRoot, entry.targetRelativePath);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(from, target);
    }
    for (const entry of compilation.stagingPlan.requiredPublicationFiles) {
      const from = await resolveContainedFile(
        source.root,
        entry.sourceRelativePath,
        entry.purpose,
      );
      const target = resolveOutputPath(projectRoot, entry.targetRelativePath);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(from, target);
    }
    await applyRuntimePackages(
      projectRoot,
      compilation.stagingPlan.runtimePackageSpecs,
    );

    const outputFiles = await listRegularFiles(projectRoot);
    const files = [];
    for (const file of outputFiles) {
      files.push({ path: file.relativePath, sha256: await sha256File(file.absolutePath) });
    }
    const exportManifest = {
      schemaVersion: EXPORT_MANIFEST_SCHEMA_VERSION,
      sourceProjectId: source.documents.project.projectId,
      targetKind: compilation.targetKind,
      compilerVersion: VISUAL_COMPILER_VERSION,
      cliVersion,
      generatedAt: new Date().toISOString(),
      sourceDocuments: compilation.provenance.sourceDocuments,
      files,
    };
    const manifestTarget = resolveOutputPath(projectRoot, EXPORT_MANIFEST_PATH);
    await mkdir(path.dirname(manifestTarget), { recursive: true });
    await writeFile(manifestTarget, stableSerializeJson(exportManifest), "utf8");
    onProgress?.("生成物とprovenanceを検証しました");
    return { container, projectRoot };
  } catch (error) {
    await rm(container, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

async function runXriftCreate(kind, projectName, cwd, onProgress) {
  const executable =
    process.env.XRIFT_STUDIO_XRIFT_BIN ||
    (process.platform === "win32" ? "xrift.cmd" : "xrift");
  const args = [
    "create",
    kind,
    projectName,
    "--skip-install",
    "-y",
  ];
  onProgress?.(`$ xrift ${args.join(" ")}`);
  await new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(
        process.platform === "win32"
          ? process.env.ComSpec || "cmd.exe"
          : executable,
        process.platform === "win32"
          ? ["/d", "/s", "/c", executable, ...args]
          : args,
        {
          cwd,
          env: process.env,
          shell: false,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
    } catch (error) {
      reject(
        new ConvertError(
          "xrift-create-unavailable",
          `xrift createを開始できません: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      return;
    }
    const stderr = [];
    child.stdout.on("data", (chunk) => onProgress?.(chunk.toString().trimEnd()));
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr.push(text);
      onProgress?.(text.trimEnd());
    });
    child.on("error", (error) => {
      reject(
        new ConvertError(
          "xrift-create-unavailable",
          `xrift createを開始できません: ${error.message}`,
        ),
      );
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        const summary = stderr.join("").trim().slice(-800);
        reject(
          new ConvertError(
            "xrift-create-failed",
            `xrift createが終了コード${code ?? "unknown"}で失敗しました${summary ? `: ${summary}` : ""}`,
          ),
        );
      }
    });
  });
}

async function applyRuntimePackages(projectRoot, packageSpecs) {
  if (packageSpecs.length === 0) return;
  const packagePath = path.join(projectRoot, "package.json");
  let packageJson;
  try {
    packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  } catch {
    throw new ConvertError(
      "classic-package-invalid",
      "xrift createが生成したpackage.jsonを読み込めません",
    );
  }
  const dependencies = { ...(packageJson.dependencies ?? {}) };
  for (const spec of packageSpecs) {
    const splitAt = spec.lastIndexOf("@");
    if (splitAt <= 0 || splitAt === spec.length - 1) {
      throw new ConvertError(
        "runtime-package-invalid",
        `compiler runtime package指定が無効です: ${spec}`,
      );
    }
    dependencies[spec.slice(0, splitAt)] = spec.slice(splitAt + 1);
  }
  packageJson.dependencies = Object.fromEntries(
    Object.entries(dependencies).sort(([left], [right]) => left.localeCompare(right)),
  );
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
}

async function commitStagedProject(staged, outputRoot, outputPolicy) {
  let backupPath = null;
  try {
    if (outputPolicy.replaceExisting) {
      backupPath = path.join(
        path.dirname(outputRoot),
        `.xrift-studio-backup-${path.basename(outputRoot)}-${process.pid}-${Date.now()}`,
      );
      await rename(outputRoot, backupPath);
    }
    await rename(staged.projectRoot, outputRoot);
  } catch (error) {
    if (backupPath) {
      const outputExists = await lstat(outputRoot).then(() => true).catch(() => false);
      if (!outputExists) await rename(backupPath, outputRoot).catch(() => undefined);
    }
    throw new ConvertError(
      "output-commit-failed",
      `生成先への切り替えに失敗しました: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  await rm(staged.container, { recursive: true, force: true });
  if (backupPath) {
    await rm(backupPath, { recursive: true, force: true });
  }
}

async function resolveContainedFile(root, relativePath, label) {
  assertSafeRelativePath(relativePath, label);
  const lexicalPath = path.resolve(root, ...relativePath.replaceAll("\\", "/").split("/"));
  if (!isContainedPath(root, lexicalPath)) {
    throw new ConvertError(
      "path-escape",
      `${label}のpathがVisual Project外を指しています: ${relativePath}`,
    );
  }
  let fileStat;
  try {
    fileStat = await lstat(lexicalPath);
  } catch {
    throw new ConvertError("file-missing", `${label}がありません: ${relativePath}`);
  }
  if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
    throw new ConvertError(
      "file-type-invalid",
      `${label}は通常ファイルである必要があります: ${relativePath}`,
    );
  }
  const resolved = await realpath(lexicalPath);
  if (!isContainedPath(root, resolved)) {
    throw new ConvertError(
      "path-escape",
      `${label}がシンボリックリンク経由でVisual Project外を指しています`,
    );
  }
  return resolved;
}

function resolveOutputPath(root, relativePath) {
  assertSafeRelativePath(relativePath, "生成ファイル");
  const target = path.resolve(root, ...relativePath.replaceAll("\\", "/").split("/"));
  if (!isContainedPath(root, target)) {
    throw new ConvertError(
      "compiler-output-escape",
      `compilerの出力pathが生成先外を指しています: ${relativePath}`,
    );
  }
  return target;
}

function assertSafeRelativePath(value, label) {
  const normalized = String(value).replaceAll("\\", "/");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.includes("://") ||
    normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new ConvertError(
      "path-invalid",
      `${label}のpathはproject-relativeである必要があります: ${value}`,
    );
  }
}

function assertSeparateRoots(sourceRoot, outputRoot) {
  if (
    isContainedPath(sourceRoot, outputRoot) ||
    isContainedPath(outputRoot, sourceRoot)
  ) {
    throw new ConvertError(
      "source-output-overlap",
      "Visual ProjectとClassic Projectの出力先は重ならないフォルダにしてください",
    );
  }
}

function isContainedPath(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function rejectSymlinks(root) {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    if (entry.isSymbolicLink()) {
      throw new ConvertError(
        "template-symlink",
        `Classic templateにシンボリックリンクが含まれています: ${entry.name}`,
      );
    }
    if (entry.isDirectory()) await rejectSymlinks(absolute);
  }
}

async function listRegularFiles(root, options = {}) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.relative(root, absolutePath).replaceAll(path.sep, "/");
      if (entry.isSymbolicLink()) {
        throw new ConvertError(
          "export-symlink",
          `exportにシンボリックリンクが含まれています: ${relativePath}`,
        );
      }
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile() && !options.exclude?.has(relativePath)) {
        files.push({ relativePath, absolutePath });
      }
    }
  }
  await visit(root);
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function sha256File(filePath) {
  const bytes = await readFile(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}

export function defaultOutputPathForSource(source) {
  return path.join(process.cwd(), `${path.basename(path.resolve(source))}-classic`);
}

export function platformTempRoot() {
  return os.tmpdir();
}
