import { isRecord } from "../json-guards";
import { tauri, type ProjectKind } from "../tauri";
import { xrift, type LogLine } from "../xrift-cli";
import {
  compileVisualProject,
  type AssetCopyPlanEntry,
  type CompilerBundledAssetCopy,
  type CompilerDiagnostic,
  type VisualCompileResult,
  type VisualCompilerDocuments,
} from "./compiler";
import {
  COMPILER_WORLD_COMPONENTS_PACKAGE_SPEC,
  declaredVersionReaches,
  parsePackageSpec,
} from "./compiler/runtime-packages";
import { publishPermissionsJson } from "./compiler/publish-permissions";
import {
  loadCompilerBundledAssetFiles,
  type CompilerBundledAssetFile,
} from "./compiler-bundled-assets";
import { stableSerializeJson } from "./serialization";
import {
  assetBytesToDataUrl,
  convertPublishedTextureBytes,
  readProjectAssetBytes,
} from "./texture-processing";

/**
 * Adds a Visual project to an existing XRift Classic project.
 *
 * The export writes the same self-contained source the publish pipeline
 * stages and builds with the official CLI: a generated `World.tsx` / `Item.tsx`
 * plus the runtime modules it imports, all relocated under one directory the
 * Visual project owns. It deliberately does not depend on the
 * `xrift-studio-runtime` npm package. That package is not published, so an
 * export that imported it could be written but never built — `npm install`
 * failed with E404 and `xrift dev` stopped at the missing module. Emitted
 * source only needs what the official template already installs, plus the
 * packages the compiler names for Text and Open Brush.
 *
 * Everything the world serves goes to `public/` root. A published world serves
 * nothing below its root, so assets, decoders and fonts cannot live in a
 * per-export subdirectory even though the source can.
 */

export const CLASSIC_EXPORT_MANIFEST_FORMAT = "xrift-studio.classic-export" as const;
export const CLASSIC_EXPORT_MANIFEST_SCHEMA_VERSION = "1.1.0" as const;

export type ClassicExportIntegration = "component" | "replace-entry";
export type ClassicExportPackageManager = "npm" | "pnpm" | "yarn" | "bun";

export type ClassicExportTarget = {
  path: string;
  packageName: string;
  kind: ProjectKind;
  entryFile: "src/World.tsx" | "src/Item.tsx";
  packageManager: ClassicExportPackageManager;
  canInstallAutomatically: boolean;
};

export type ClassicExportProgress = {
  stage: "saving" | "compiling" | "writing" | "installing";
  label: string;
  detail?: string;
  percent: number;
};

export type ClassicExportPackageChange = {
  name: string;
  version: string;
  previous?: string;
};

export type ClassicExportResult = {
  targetPath: string;
  /** The file the author opens to reach the Scene: the entry or the bridge. */
  integrationFile: string;
  /** Directory that holds the generated Scene source and its runtime modules. */
  sceneDirectory: string;
  /** The generated `World.tsx` / `Item.tsx` inside `sceneDirectory`. */
  sceneSourceFile: string;
  packageInstallation: "installed" | "recorded" | "unchanged";
  packageChanges: ClassicExportPackageChange[];
  installCommand?: string;
  importSnippet?: string;
  /** Facts the author should know that did not stop the export. */
  notes: string[];
  diagnostics: CompilerDiagnostic[];
};

export class ClassicExportError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly diagnostics: CompilerDiagnostic[] = [],
  ) {
    super(message);
    this.name = "ClassicExportError";
  }
}

export type ClassicExportTextFile = { relativePath: string; content: string };

/**
 * Where a compilation lands inside an existing Classic project.
 *
 * Pure so the fixture can typecheck the relocated tree with the template's
 * compiler options, the same gate the publish staging goes through.
 */
export type ClassicExportFilePlan = {
  exportId: string;
  exportRoot: string;
  sceneDirectory: string;
  sceneSourceFile: string;
  bridgeFile: string;
  /** Generated sources, relocated under `sceneDirectory`. */
  sourceFiles: ClassicExportTextFile[];
  /** Author assets, copied to the target the compiler chose (`public/` root). */
  assetFiles: AssetCopyPlanEntry[];
  /** Decoder and font files Studio ships, at the fixed names loaders expect. */
  bundledFiles: CompilerBundledAssetCopy[];
  /** Provenance and other metadata, under `exportRoot`. */
  metadataFiles: ClassicExportTextFile[];
  /** Exact packages the generated source needs beyond the official template. */
  packageSpecs: string[];
  /** `xrift.json` fragment the author has to merge, when the world needs one. */
  xriftJsonPermissions?: string;
};

export async function inspectClassicExportTarget(
  targetPath: string,
  expectedKind: ProjectKind,
): Promise<ClassicExportTarget> {
  const normalized = targetPath.trim();
  if (!normalized) {
    throw new ClassicExportError(
      "target-required",
      "XRift Classicプロジェクトのフォルダーを選択してください。",
    );
  }
  const [packageSource, xriftSource, entries] = await Promise.all([
    readRequiredText(normalized, "package.json", "package.jsonが見つかりません。"),
    readRequiredText(normalized, "xrift.json", "xrift.jsonが見つかりません。"),
    tauri.listFiles(normalized, ""),
  ]);
  const packageJson = parseJsonRecord(
    packageSource,
    "package.jsonが有効なJSONではありません。",
  );
  parseJsonRecord(xriftSource, "xrift.jsonが有効なJSONではありません。");
  const entryFile =
    expectedKind === "world" ? "src/World.tsx" : "src/Item.tsx";
  await readRequiredText(
    normalized,
    entryFile,
    `${entryFile}がないため、${expectedKind === "world" ? "World" : "Item"}プロジェクトとして確認できません。`,
  );
  const rootNames = new Set(entries.map((entry) => entry.name));
  const packageManager: ClassicExportPackageManager = rootNames.has("pnpm-lock.yaml")
    ? "pnpm"
    : rootNames.has("yarn.lock")
      ? "yarn"
      : rootNames.has("bun.lock") || rootNames.has("bun.lockb")
        ? "bun"
        : "npm";
  return {
    path: normalized,
    packageName:
      typeof packageJson.name === "string" && packageJson.name.trim()
        ? packageJson.name
        : "XRift Classic Project",
    kind: expectedKind,
    entryFile,
    packageManager,
    canInstallAutomatically: packageManager === "npm",
  };
}

/**
 * Compiles the Visual project the way publish does and decides where each
 * generated file goes inside an existing Classic project.
 */
export function planClassicExportFiles(
  compilation: VisualCompileResult,
  projectId: string,
  projectKind: ProjectKind,
): ClassicExportFilePlan {
  const exportId = safeExportSegment(projectId);
  const exportRoot = `.xrift-studio/exports/${exportId}`;
  const sceneDirectory = `src/xrift-studio/${exportId}`;
  const entryName = projectKind === "world" ? "World" : "Item";
  const sceneSourceFile = `${sceneDirectory}/${entryName}.tsx`;
  const bridgeFile = `${sceneDirectory}/Scene.tsx`;
  const sourceFiles: ClassicExportTextFile[] = [];
  const metadataFiles: ClassicExportTextFile[] = [];
  for (const file of compilation.stagingPlan.overlayFiles) {
    const relativePath = file.relativePath.replace(/\\/g, "/");
    if (relativePath === "xrift.json") {
      // The target project's own xrift.json is the author's; only the
      // permissions the world needs are surfaced, below.
      continue;
    }
    if (relativePath.startsWith("src/")) {
      // The generated entry imports its runtime as `./xrift-studio/...` and
      // its scripts as `./scripts/...`, so the whole `src/` tree moves as one
      // block and every relative import stays valid.
      sourceFiles.push({
        relativePath: `${sceneDirectory}/${relativePath.slice("src/".length)}`,
        content: file.content,
      });
      continue;
    }
    if (relativePath.startsWith(".xrift-studio/")) {
      metadataFiles.push({
        relativePath: `${exportRoot}/${relativePath.slice(".xrift-studio/".length)}`,
        content: file.content,
      });
      continue;
    }
    // Anything else the compiler wants at the project root keeps its place.
    sourceFiles.push({ relativePath, content: file.content });
  }
  if (!sourceFiles.some((file) => file.relativePath === sceneSourceFile)) {
    throw new ClassicExportError(
      "compilation-entry-missing",
      `compilerが${entryName}.tsxを生成しませんでした。`,
      compilation.diagnostics,
    );
  }
  sourceFiles.push({
    relativePath: bridgeFile,
    content: generateBridgeSource(projectKind),
  });
  const permissions = publishPermissionsJson(compilation.publishPermissions);
  return {
    exportId,
    exportRoot,
    sceneDirectory,
    sceneSourceFile,
    bridgeFile,
    sourceFiles,
    assetFiles: compilation.stagingPlan.assetCopyPlan,
    bundledFiles: compilation.stagingPlan.bundledAssetCopyPlan,
    metadataFiles,
    packageSpecs: [
      ...compilation.stagingPlan.runtimePackageSpecs,
      COMPILER_WORLD_COMPONENTS_PACKAGE_SPEC,
    ],
    ...(Object.keys(permissions).length > 0
      ? { xriftJsonPermissions: JSON.stringify(permissions, null, 2) }
      : {}),
  };
}

export async function exportVisualProjectToClassic(input: {
  authoringProjectPath: string;
  target: ClassicExportTarget;
  documents: VisualCompilerDocuments;
  integration: ClassicExportIntegration;
  installDependencies: boolean;
  save: () => Promise<string | void>;
  report: (progress: ClassicExportProgress) => void;
  onLog: (line: LogLine) => void;
  /** Injectable so a fixture can supply decoder and font bytes without fetch. */
  loadBundledAssets?: (
    plan: readonly CompilerBundledAssetCopy[],
  ) => Promise<CompilerBundledAssetFile[]>;
}): Promise<ClassicExportResult> {
  if (input.authoringProjectPath.trim()) {
    assertSeparateProjects(input.authoringProjectPath, input.target.path);
  }
  input.report({
    stage: "saving",
    label: "制作データを保存しています",
    detail: "最新のSceneとAssetをClassicへ渡す準備をしています。",
    percent: 8,
  });
  const savedPath = await input.save();
  const authoringPath =
    typeof savedPath === "string" && savedPath.trim()
      ? savedPath
      : input.authoringProjectPath;
  if (!authoringPath.trim()) {
    throw new ClassicExportError(
      "authoring-save-required",
      "書き出す前にVisualプロジェクトを保存できませんでした。",
    );
  }
  assertSeparateProjects(authoringPath, input.target.path);

  input.report({
    stage: "compiling",
    label: "Sceneのソースを生成しています",
    detail: "公開時と同じ変換で、Classicプロジェクトがそのままビルドできるコードを作ります。",
    percent: 24,
  });
  // Same output mode as publish: the staged world is what `xrift check` builds,
  // so an export made of the same files builds in the same template.
  const compilation = compileVisualProject(input.documents, {
    outputMode: "classic-jsx",
  });
  if (!compilation.canStage) {
    throw new ClassicExportError(
      "compilation-blocked",
      "Classicへ書き出す前に修正が必要な項目があります。",
      compilation.diagnostics,
    );
  }
  const unsupported = compilation.assetCopyPlan.find(
    (entry) => !entry.supportedByCompiler,
  );
  if (unsupported) {
    throw new ClassicExportError(
      "asset-unsupported",
      `Asset「${unsupported.assetId}」はClassic向け変換に対応していません。`,
      compilation.diagnostics,
    );
  }
  const plan = planClassicExportFiles(
    compilation,
    input.documents.project.projectId,
    input.documents.project.projectKind,
  );
  const notes: string[] = [];
  const generatedFiles = new Set<string>();
  const previousManifest = await readPreviousExportManifest(
    input.target.path,
    plan.exportRoot,
  );

  // Bytes are gathered before anything is written, so a missing decoder or
  // font stops the export without leaving a half-written Scene behind.
  const bundledFiles = await (input.loadBundledAssets ?? loadCompilerBundledAssetFiles)(
    plan.bundledFiles,
  );

  input.report({
    stage: "writing",
    label: "Classicプロジェクトへ追加しています",
    detail:
      input.integration === "component"
        ? "既存のエントリーを保ち、XRift Studio Sceneを独立コンポーネントとして追加します。"
        : "既存エントリーをバックアップしてXRift Studio Sceneへ切り替えます。",
    percent: 46,
  });

  for (const file of plan.sourceFiles) {
    await tauri.writeTextFile(input.target.path, file.relativePath, file.content);
    generatedFiles.add(file.relativePath);
  }

  await Promise.all(
    plan.assetFiles.map(async (entry) => {
      // 未反映のTexture Import設定は書き出す画像にだけ適用する。制作データの
      // 原本は読むだけで、書き換えない。
      const conversion = entry.textureConversion;
      const dataUrl = conversion
        ? await assetBytesToDataUrl(
            await convertPublishedTextureBytes(
              await readProjectAssetBytes(authoringPath, entry.sourceRelativePath),
              conversion,
            ),
            conversion.mimeType,
          )
        : await tauri.readProjectFileDataUrl(authoringPath, entry.sourceRelativePath);
      await tauri.writeBinaryFile(input.target.path, entry.targetRelativePath, dataUrl);
      generatedFiles.add(entry.targetRelativePath);
    }),
  );

  // Decoders keep the names their loaders look for, so a Classic project that
  // already ships one is left alone rather than overwritten with Studio's copy.
  const existingPublicNames = await listExistingPublicNames(input.target.path);
  for (const file of bundledFiles) {
    const fileName = file.targetRelativePath.replace(/^public\//, "");
    const ownedBefore = previousManifest?.files.has(file.targetRelativePath) ?? false;
    if (existingPublicNames.has(fileName) && !ownedBefore) {
      notes.push(
        `public/${fileName}は既にあるため、そのまま使います。Studio同梱のファイルと差し替える場合は手動で置き換えてください。`,
      );
      continue;
    }
    await tauri.writeBinaryFile(input.target.path, file.targetRelativePath, file.dataUrl);
    generatedFiles.add(file.targetRelativePath);
  }

  let integrationFile = plan.bridgeFile;
  let importSnippet: string | undefined = generateImportSnippet(
    input.documents.project.projectKind,
    plan.exportId,
  );
  if (input.integration === "replace-entry") {
    const entrySource = await tauri.readTextFile(
      input.target.path,
      input.target.entryFile,
    );
    const backupFile = `${plan.exportRoot}/backups/${input.target.entryFile}`;
    await tauri.writeTextFile(input.target.path, backupFile, entrySource);
    await tauri.writeTextFile(
      input.target.path,
      input.target.entryFile,
      generateClassicEntrySource(input.documents.project.projectKind, plan.exportId),
    );
    generatedFiles.add(backupFile);
    generatedFiles.add(input.target.entryFile);
    integrationFile = input.target.entryFile;
    importSnippet = undefined;
  }

  for (const file of plan.metadataFiles) {
    await tauri.writeTextFile(input.target.path, file.relativePath, file.content);
    generatedFiles.add(file.relativePath);
  }

  if (plan.xriftJsonPermissions) {
    notes.push(
      `このSceneはxrift.jsonへ次の権限が必要です。既存のxrift.jsonへ追加してください。\n${plan.xriftJsonPermissions}`,
    );
  }

  // A file this export wrote last time and no longer produces (a removed
  // Asset, a runtime module the Scene stopped using) would otherwise ship with
  // the world forever. Only files the manifest recorded are touched; backups
  // of the author's entry are never removed.
  if (previousManifest) {
    for (const stale of previousManifest.files) {
      if (generatedFiles.has(stale)) continue;
      if (stale.startsWith(`${plan.exportRoot}/backups/`)) continue;
      if (stale === `${plan.exportRoot}/export-manifest.json`) continue;
      if (stale === input.target.entryFile) continue;
      try {
        await tauri.deletePath(input.target.path, stale);
      } catch {
        // Already gone, or the author moved it: neither needs to stop the export.
      }
    }
  }

  const packageState = await recordPackageDependencies(
    input.target.path,
    plan.packageSpecs,
    previousManifest?.runtimePackage,
    notes,
  );

  let packageInstallation: ClassicExportResult["packageInstallation"] =
    packageState.changes.length > 0 ? "recorded" : "unchanged";
  if (
    packageState.changes.length > 0 &&
    input.installDependencies &&
    input.target.canInstallAutomatically
  ) {
    input.report({
      stage: "installing",
      label: "依存packageをインストールしています",
      detail: "既存のnpm projectへ固定versionを追加します。",
      percent: 78,
    });
    const installed = await xrift.installClassicExportPackages(
      input.target.path,
      packageState.changes.map((change) => `${change.name}@${change.version}`),
      input.onLog,
    );
    if (installed.code !== 0) {
      throw new ClassicExportError(
        "package-install-failed",
        "依存packageをインストールできませんでした。生成内容とpackage.jsonの記録は保持しているため、ターミナルからinstallを再実行できます。",
        compilation.diagnostics,
      );
    }
    packageInstallation = "installed";
  }

  const manifestFile = `${plan.exportRoot}/export-manifest.json`;
  await tauri.writeTextFile(
    input.target.path,
    manifestFile,
    stableSerializeJson({
      format: CLASSIC_EXPORT_MANIFEST_FORMAT,
      schemaVersion: CLASSIC_EXPORT_MANIFEST_SCHEMA_VERSION,
      outputMode: "classic-jsx",
      sourceProjectId: input.documents.project.projectId,
      sourceProjectKind: input.documents.project.projectKind,
      integration: input.integration,
      compilerVersion: compilation.provenance.compilerVersion,
      sceneDirectory: plan.sceneDirectory,
      sceneSourceFile: plan.sceneSourceFile,
      packageSpecs: plan.packageSpecs,
      generatedAt: new Date().toISOString(),
      files: [...generatedFiles, manifestFile].sort(),
    }),
  );

  return {
    targetPath: input.target.path,
    integrationFile,
    sceneDirectory: plan.sceneDirectory,
    sceneSourceFile: plan.sceneSourceFile,
    packageInstallation,
    packageChanges: packageState.changes,
    ...(packageInstallation === "recorded"
      ? { installCommand: `${input.target.packageManager} install` }
      : {}),
    importSnippet,
    notes,
    diagnostics: compilation.diagnostics,
  };
}

type PreviousExportManifest = {
  files: Set<string>;
  runtimePackage?: string;
};

async function readPreviousExportManifest(
  targetPath: string,
  exportRoot: string,
): Promise<PreviousExportManifest | null> {
  let source: string;
  try {
    source = await tauri.readTextFile(targetPath, `${exportRoot}/export-manifest.json`);
  } catch {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(source);
    if (!isRecord(parsed) || parsed.format !== CLASSIC_EXPORT_MANIFEST_FORMAT) {
      return null;
    }
    const files = Array.isArray(parsed.files)
      ? parsed.files.filter((file): file is string => typeof file === "string")
      : [];
    return {
      files: new Set(files.map((file) => file.replace(/\\/g, "/"))),
      ...(typeof parsed.runtimePackage === "string"
        ? { runtimePackage: parsed.runtimePackage }
        : {}),
    };
  } catch {
    return null;
  }
}

async function listExistingPublicNames(targetPath: string): Promise<Set<string>> {
  try {
    const entries = await tauri.listFiles(targetPath, "public");
    return new Set(entries.filter((entry) => !entry.isDir).map((entry) => entry.name));
  } catch {
    return new Set();
  }
}

/**
 * Records what the generated source needs in the target's package.json.
 *
 * `@xrift/world-components` is only pinned when the declared range cannot
 * reach the version the source was compiled against; a template that already
 * declares `^0.47.0` is left as the author wrote it. The other specs are exact
 * requirements of the emitted modules and are written as such.
 */
async function recordPackageDependencies(
  targetPath: string,
  packageSpecs: readonly string[],
  previousRuntimePackage: string | undefined,
  notes: string[],
): Promise<{ changes: ClassicExportPackageChange[] }> {
  const packageSource = await tauri.readTextFile(targetPath, "package.json");
  const packageJson = parseJsonRecord(
    packageSource,
    "書き出し中にpackage.jsonを読み直せませんでした。",
  );
  const dependencies = isRecord(packageJson.dependencies)
    ? { ...packageJson.dependencies }
    : {};
  const devDependencies = isRecord(packageJson.devDependencies)
    ? packageJson.devDependencies
    : {};
  const changes: ClassicExportPackageChange[] = [];
  let dirty = false;

  for (const spec of packageSpecs) {
    const { name, version } = parsePackageSpec(spec);
    const declared = dependencies[name] ?? devDependencies[name];
    const declaredText = typeof declared === "string" ? declared : undefined;
    if (name === COMPILER_WORLD_COMPONENTS_NAME) {
      if (declaredVersionReaches(declaredText, version)) continue;
    } else if (declaredText === version) {
      continue;
    }
    dependencies[name] = version;
    dirty = true;
    changes.push({
      name,
      version,
      ...(declaredText ? { previous: declaredText } : {}),
    });
  }

  // An earlier build of this export recorded the unpublished runtime package.
  // Leaving it makes every `npm install` in the project fail with E404, so it
  // is dropped when it is exactly the one that export wrote.
  if (previousRuntimePackage) {
    try {
      const { name, version } = parsePackageSpec(previousRuntimePackage);
      if (dependencies[name] === version) {
        delete dependencies[name];
        dirty = true;
        notes.push(
          `以前の書き出しが記録した${name}は公開されていないpackageのため、package.jsonから外しました。`,
        );
      }
    } catch {
      // A manifest with an unreadable spec is not a reason to stop.
    }
  }

  if (dirty) {
    packageJson.dependencies = Object.fromEntries(
      Object.entries(dependencies).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    );
    await tauri.writeTextFile(
      targetPath,
      "package.json",
      `${JSON.stringify(packageJson, null, 2)}\n`,
    );
  }
  return { changes };
}

const COMPILER_WORLD_COMPONENTS_NAME = parsePackageSpec(
  COMPILER_WORLD_COMPONENTS_PACKAGE_SPEC,
).name;

/**
 * The stable name the author connects to. The generated entry keeps the
 * template's `World` / `Item` export so the file reads like any other Classic
 * source; this bridge gives it a name that cannot collide with the project's
 * own entry.
 */
function generateBridgeSource(kind: ProjectKind): string {
  const component = kind === "world" ? "World" : "Item";
  return `// XRift Studioが生成したSceneを、既存のClassic projectから読み込むための入口です。
// Sceneの本体は同じフォルダーの${component}.tsxにあります。
export { ${component} as XriftStudioScene } from "./${component}";
export type { ${component}Props as XriftStudioSceneProps } from "./${component}";
`;
}

export function generateClassicEntrySource(kind: ProjectKind, exportId: string): string {
  const component = kind === "world" ? "World" : "Item";
  const defaultExport = kind === "item" ? `\nexport default ${component};\n` : "";
  // The template's index.tsx re-exports `WorldProps` / `ItemProps` beside the
  // component, so the replacement entry has to keep both names or the
  // project's own tsc run fails.
  return `import {
  XriftStudioScene,
  type XriftStudioSceneProps,
} from "./xrift-studio/${exportId}/Scene";

export type ${component}Props = XriftStudioSceneProps;

export const ${component} = (props: ${component}Props) => <XriftStudioScene {...props} />;
${defaultExport}`;
}

function generateImportSnippet(kind: ProjectKind, exportId: string): string {
  const entry = kind === "world" ? "World.tsx" : "Item.tsx";
  return `// src/${entry}\nimport { XriftStudioScene } from "./xrift-studio/${exportId}/Scene";\n\n// JSX内へ追加\n<XriftStudioScene />`;
}

async function readRequiredText(
  projectPath: string,
  relativePath: string,
  message: string,
): Promise<string> {
  try {
    return await tauri.readTextFile(projectPath, relativePath);
  } catch {
    throw new ClassicExportError("target-file-missing", message);
  }
}

function parseJsonRecord(source: string, message: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(source);
    if (isRecord(parsed)) return parsed;
  } catch {
    // Use the same user-facing validation message for syntax and root shape.
  }
  throw new ClassicExportError("target-json-invalid", message);
}

function safeExportSegment(value: string): string {
  const safe = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return safe || "visual-project";
}

function assertSeparateProjects(authoringPath: string, targetPath: string): void {
  const normalize = (value: string) =>
    value.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  const authoring = normalize(authoringPath);
  const target = normalize(targetPath);
  if (
    !authoring ||
    !target ||
    authoring === target ||
    authoring.startsWith(`${target}/`) ||
    target.startsWith(`${authoring}/`)
  ) {
    throw new ClassicExportError(
      "project-overlap",
      "VisualプロジェクトとClassicプロジェクトは別のフォルダーを選択してください。",
    );
  }
}
