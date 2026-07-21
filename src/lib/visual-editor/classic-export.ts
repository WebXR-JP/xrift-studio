import { tauri, type ProjectKind } from "../tauri";
import { xrift, type LogLine } from "../xrift-cli";
import {
  compileVisualProject,
  type CompilerDiagnostic,
  type VisualCompilerDocuments,
} from "./compiler";
import { stableSerializeJson } from "./serialization";

const RUNTIME_PACKAGE_SPEC = "xrift-studio-runtime@0.1.0" as const;

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

export type ClassicExportResult = {
  targetPath: string;
  integrationFile: string;
  runtimeManifestFile: string;
  packageInstallation: "installed" | "recorded";
  installCommand?: string;
  importSnippet?: string;
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

export async function exportVisualProjectToClassic(input: {
  authoringProjectPath: string;
  target: ClassicExportTarget;
  documents: VisualCompilerDocuments;
  integration: ClassicExportIntegration;
  installDependencies: boolean;
  save: () => Promise<string | void>;
  report: (progress: ClassicExportProgress) => void;
  onLog: (line: LogLine) => void;
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
    label: "Runtime JSONを生成しています",
    detail: "編集用データから実行に必要なSceneとAssetだけを取り出します。",
    percent: 24,
  });
  const compilation = compileVisualProject(input.documents, {
    outputMode: "classic-runtime",
  });
  if (!compilation.canStage || !compilation.runtimeManifestFile) {
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
      `Asset「${unsupported.assetId}」はRuntime exportに対応していません。`,
      compilation.diagnostics,
    );
  }

  const exportId = safeExportSegment(input.documents.project.projectId);
  const exportRoot = `.xrift-studio/exports/${exportId}`;
  const publicRoot = `public/xrift-studio/${exportId}`;
  const runtimeManifestFile = `${publicRoot}/runtime.json`;
  const componentFile = `src/xrift-studio/${exportId}/Scene.tsx`;
  const runtimeUrl = `/xrift-studio/${exportId}/runtime.json`;
  const generatedFiles: string[] = [];

  input.report({
    stage: "writing",
    label: "Classicプロジェクトへ追加しています",
    detail:
      input.integration === "component"
        ? "既存のエントリーを保ち、XRift Studio Sceneを独立コンポーネントとして追加します。"
        : "既存エントリーをバックアップしてXRift Studio Sceneへ切り替えます。",
    percent: 46,
  });

  await tauri.writeTextFile(
    input.target.path,
    runtimeManifestFile,
    compilation.runtimeManifestFile.content,
  );
  generatedFiles.push(runtimeManifestFile);

  await Promise.all(
    compilation.assetCopyPlan.map(async (entry) => {
      const suffix = entry.targetRelativePath.replace(/^public\/xrift\//, "");
      const targetRelativePath = `${publicRoot}/${suffix}`;
      const dataUrl = await tauri.readProjectFileDataUrl(
        authoringPath,
        entry.sourceRelativePath,
      );
      await tauri.writeBinaryFile(input.target.path, targetRelativePath, dataUrl);
      generatedFiles.push(targetRelativePath);
    }),
  );

  const componentSource = generateClassicBridgeSource(
    input.documents.project.projectKind,
    runtimeUrl,
  );
  await tauri.writeTextFile(input.target.path, componentFile, componentSource);
  generatedFiles.push(componentFile);

  let integrationFile = componentFile;
  let importSnippet: string | undefined = generateImportSnippet(
    input.documents.project.projectKind,
    exportId,
  );
  if (input.integration === "replace-entry") {
    const entrySource = await tauri.readTextFile(
      input.target.path,
      input.target.entryFile,
    );
    const backupFile = `${exportRoot}/backups/${input.target.entryFile}`;
    await tauri.writeTextFile(input.target.path, backupFile, entrySource);
    await tauri.writeTextFile(
      input.target.path,
      input.target.entryFile,
      generateClassicEntrySource(input.documents.project.projectKind, exportId),
    );
    generatedFiles.push(backupFile, input.target.entryFile);
    integrationFile = input.target.entryFile;
    importSnippet = undefined;
  }

  await tauri.writeTextFile(
    input.target.path,
    `${exportRoot}/compiler-provenance.json`,
    compilation.provenanceFile.content,
  );
  generatedFiles.push(`${exportRoot}/compiler-provenance.json`);

  const packageSource = await tauri.readTextFile(input.target.path, "package.json");
  const packageJson = parseJsonRecord(
    packageSource,
    "書き出し中にpackage.jsonを読み直せませんでした。",
  );
  const dependencies = isRecord(packageJson.dependencies)
    ? { ...packageJson.dependencies }
    : {};
  dependencies["xrift-studio-runtime"] = "0.1.0";
  packageJson.dependencies = Object.fromEntries(
    Object.entries(dependencies).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
  await tauri.writeTextFile(
    input.target.path,
    "package.json",
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );

  let packageInstallation: ClassicExportResult["packageInstallation"] =
    "recorded";
  if (input.installDependencies && input.target.canInstallAutomatically) {
    input.report({
      stage: "installing",
      label: "Runtime packageをインストールしています",
      detail: "既存のnpm projectへ固定versionを追加します。",
      percent: 78,
    });
    const installed = await xrift.installClassicExportPackages(
      input.target.path,
      compilation.stagingPlan.runtimePackageSpecs.length > 0
        ? compilation.stagingPlan.runtimePackageSpecs
        : [RUNTIME_PACKAGE_SPEC],
      input.onLog,
    );
    if (installed.code !== 0) {
      const packageIsUnavailable = /(?:E404|not found)/i.test(
        `${installed.stdout}\n${installed.stderr}`,
      );
      throw new ClassicExportError(
        "package-install-failed",
        packageIsUnavailable
          ? "xrift-studio-runtime@0.1.0はnpmへまだ公開されていません。生成内容と依存関係は保持しているため、パッケージ公開後にinstallを再実行できます。"
          : "Runtime packageをインストールできませんでした。生成内容は保持しているため、ターミナルからinstallを再実行できます。",
        compilation.diagnostics,
      );
    }
    packageInstallation = "installed";
  }

  const manifestFile = `${exportRoot}/export-manifest.json`;
  await tauri.writeTextFile(
    input.target.path,
    manifestFile,
    stableSerializeJson({
      format: "xrift-studio.classic-export",
      schemaVersion: "1.0.0",
      sourceProjectId: input.documents.project.projectId,
      sourceProjectKind: input.documents.project.projectKind,
      integration: input.integration,
      runtimePackage: RUNTIME_PACKAGE_SPEC,
      generatedAt: new Date().toISOString(),
      files: [...generatedFiles, manifestFile].sort(),
    }),
  );

  return {
    targetPath: input.target.path,
    integrationFile,
    runtimeManifestFile,
    packageInstallation,
    ...(packageInstallation === "recorded"
      ? { installCommand: `${input.target.packageManager} install` }
      : {}),
    importSnippet,
    diagnostics: compilation.diagnostics,
  };
}

function generateClassicBridgeSource(kind: ProjectKind, runtimeUrl: string): string {
  const runtimeComponent = kind === "world" ? "XriftWorld" : "XriftItem";
  return `import { ${runtimeComponent} } from "xrift-studio-runtime/react-three-fiber";

export const XriftStudioScene = () => (
  <${runtimeComponent} manifest="${runtimeUrl}" />
);
`;
}

function generateClassicEntrySource(kind: ProjectKind, exportId: string): string {
  const component = kind === "world" ? "World" : "Item";
  const defaultExport = kind === "item" ? `\nexport default ${component};\n` : "";
  return `import { XriftStudioScene } from "./xrift-studio/${exportId}/Scene";

export const ${component} = () => <XriftStudioScene />;${defaultExport}`;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
