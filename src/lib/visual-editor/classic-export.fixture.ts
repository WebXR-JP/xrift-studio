import { tauri, type FsEntry } from "../tauri";
import { xrift } from "../xrift-cli";
import { createPrototypeProject } from "./prototype-project";
import {
  exportVisualProjectToClassic,
  inspectClassicExportTarget,
} from "./classic-export";

/**
 * Exercises the existing-project export boundary without touching the real
 * filesystem or invoking npm. The fixture intentionally covers both the safe
 * component mode and the explicitly destructive entry-switch mode.
 */
export async function runClassicExportFixtureAssertions(): Promise<void> {
  const targetPath = "C:/fixture/classic-world";
  const authoringPath = "C:/fixture/visual-world";
  const originalEntry = "export const World = () => <group name=\"hand-written\" />;\n";
  const files = new Map<string, string>([
    [key(targetPath, "package.json"), `${JSON.stringify({ name: "fixture-classic", private: true, dependencies: { react: "19.0.0" } }, null, 2)}\n`],
    [key(targetPath, "xrift.json"), "{}\n"],
    [key(targetPath, "src/World.tsx"), originalEntry],
  ]);
  const rootEntries: FsEntry[] = [
    { name: "package.json", rel: "package.json", isDir: false, size: 1 },
    { name: "xrift.json", rel: "xrift.json", isDir: false, size: 1 },
    { name: "src", rel: "src", isDir: true, size: null },
    { name: "package-lock.json", rel: "package-lock.json", isDir: false, size: 1 },
  ];
  const originalTauri = {
    readTextFile: tauri.readTextFile,
    writeTextFile: tauri.writeTextFile,
    listFiles: tauri.listFiles,
    readProjectFileDataUrl: tauri.readProjectFileDataUrl,
    writeBinaryFile: tauri.writeBinaryFile,
  };
  const originalInstall = xrift.installClassicExportPackages;
  let installCalls = 0;

  Object.assign(tauri, {
    readTextFile: async (projectPath: string, relativePath: string) => {
      const value = files.get(key(projectPath, relativePath));
      if (value === undefined) throw new Error(`Fixture file is missing: ${relativePath}`);
      return value;
    },
    writeTextFile: async (projectPath: string, relativePath: string, content: string) => {
      files.set(key(projectPath, relativePath), content);
    },
    listFiles: async () => rootEntries,
    readProjectFileDataUrl: async () => "data:application/octet-stream;base64,AA==",
    writeBinaryFile: async (projectPath: string, relativePath: string, dataUrl: string) => {
      files.set(key(projectPath, relativePath), dataUrl);
    },
  });
  Object.assign(xrift, {
    installClassicExportPackages: async () => {
      installCalls += 1;
      return { code: 0, stdout: "installed", stderr: "" };
    },
  });

  try {
    const prototype = createPrototypeProject("world", "Classic Export Fixture");
    const documents = {
      project: prototype.project,
      scenes: { [prototype.scene.sceneId]: prototype.scene },
      assets: prototype.assets,
      prefabs: prototype.prefabs,
    };
    const target = await inspectClassicExportTarget(targetPath, "world");
    assert(target.packageManager === "npm", "npm target was not detected");

    const componentResult = await exportVisualProjectToClassic({
      authoringProjectPath: authoringPath,
      target,
      documents,
      integration: "component",
      installDependencies: true,
      save: async () => authoringPath,
      report: () => undefined,
      onLog: () => undefined,
    });
    assert(
      files.get(key(targetPath, "src/World.tsx")) === originalEntry,
      "component mode modified the hand-written World entry",
    );
    assert(
      componentResult.importSnippet?.includes("<XriftStudioScene />"),
      "component mode did not return a connection snippet",
    );
    assert(
      files.get(key(targetPath, componentResult.runtimeManifestFile))?.includes(
        '"format": "xrift-studio.runtime"',
      ),
      "component mode did not write Runtime JSON",
    );
    const packageJson = JSON.parse(files.get(key(targetPath, "package.json")) ?? "{}");
    assert(
      packageJson.dependencies?.["xrift-studio-runtime"] === "0.1.0",
      "runtime dependency was not recorded",
    );
    assert(installCalls === 1, "npm install was not requested exactly once");

    const replaceResult = await exportVisualProjectToClassic({
      authoringProjectPath: authoringPath,
      target,
      documents,
      integration: "replace-entry",
      installDependencies: false,
      save: async () => authoringPath,
      report: () => undefined,
      onLog: () => undefined,
    });
    const rewrittenEntry = files.get(key(targetPath, "src/World.tsx")) ?? "";
    assert(
      rewrittenEntry.includes("XriftStudioScene"),
      "replace-entry mode did not connect the generated Scene",
    );
    const manifest = JSON.parse(
      files.get(
        key(
          targetPath,
          `.xrift-studio/exports/${safeSegment(prototype.project.projectId)}/export-manifest.json`,
        ),
      ) ?? "{}",
    );
    const backupPath = manifest.files?.find((file: unknown) =>
      typeof file === "string" && file.endsWith("/backups/src/World.tsx"),
    );
    assert(typeof backupPath === "string", "entry backup was not recorded in the manifest");
    assert(
      files.get(key(targetPath, backupPath)) === originalEntry,
      "entry backup does not contain the original World source",
    );
    assert(
      replaceResult.importSnippet === undefined,
      "replace-entry mode should not require a manual connection snippet",
    );
    assert(
      replaceResult.installCommand === "npm install",
      "record-only mode did not return the package manager follow-up command",
    );
  } finally {
    Object.assign(tauri, originalTauri);
    Object.assign(xrift, { installClassicExportPackages: originalInstall });
  }
}

function key(projectPath: string, relativePath: string): string {
  return `${projectPath.replace(/\\/g, "/").replace(/\/$/, "")}/${relativePath.replace(/^\/+/, "")}`;
}

function safeSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "visual-project";
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
