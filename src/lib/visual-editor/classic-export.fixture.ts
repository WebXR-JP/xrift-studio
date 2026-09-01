import { tauri, type FsEntry } from "../tauri";
import { xrift } from "../xrift-cli";
import { createPrototypeProject } from "./prototype-project";
import { createStagedTypecheckWorldDocuments } from "./compiler/staged-world.fixture";
import { COMPILER_WORLD_COMPONENTS_PACKAGE_SPEC } from "./compiler/runtime-packages";
import {
  CLASSIC_EXPORT_MANIFEST_FORMAT,
  exportVisualProjectToClassic,
  inspectClassicExportTarget,
} from "./classic-export";

/**
 * Exercises the existing-project export boundary without touching the real
 * filesystem or invoking npm. The fixture intentionally covers both the safe
 * component mode and the explicitly destructive entry-switch mode, plus the
 * facts that made earlier exports unbuildable: a dependency on the unpublished
 * runtime package, and decoders and fonts that were never copied.
 */
export async function runClassicExportFixtureAssertions(): Promise<void> {
  const targetPath = "C:/fixture/classic-world";
  const authoringPath = "C:/fixture/visual-world";
  const originalEntry = "export const World = () => <group name=\"hand-written\" />;\n";
  const files = new Map<string, string>([
    [key(targetPath, "package.json"), `${JSON.stringify({ name: "fixture-classic", private: true, dependencies: { react: "19.0.0", "@xrift/world-components": "^0.47.0" } }, null, 2)}\n`],
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
    deletePath: tauri.deletePath,
  };
  const originalInstall = xrift.installClassicExportPackages;
  const installRequests: string[][] = [];
  const deleted: string[] = [];

  Object.assign(tauri, {
    readTextFile: async (projectPath: string, relativePath: string) => {
      const value = files.get(key(projectPath, relativePath));
      if (value === undefined) throw new Error(`Fixture file is missing: ${relativePath}`);
      return value;
    },
    writeTextFile: async (projectPath: string, relativePath: string, content: string) => {
      files.set(key(projectPath, relativePath), content);
    },
    listFiles: async (projectPath: string, rel: string) => {
      if (rel === "") return rootEntries;
      const prefix = `${key(projectPath, rel)}/`;
      return [...files.keys()]
        .filter((path) => path.startsWith(prefix))
        .map((path) => path.slice(prefix.length))
        .filter((name) => !name.includes("/"))
        .map((name) => ({ name, rel: `${rel}/${name}`, isDir: false, size: 1 }));
    },
    readProjectFileDataUrl: async () => "data:application/octet-stream;base64,AA==",
    writeBinaryFile: async (projectPath: string, relativePath: string, dataUrl: string) => {
      files.set(key(projectPath, relativePath), dataUrl);
    },
    deletePath: async (projectPath: string, relativePath: string) => {
      const path = key(projectPath, relativePath);
      if (!files.has(path)) throw new Error("path does not exist");
      files.delete(path);
      deleted.push(relativePath);
    },
  });
  Object.assign(xrift, {
    installClassicExportPackages: async (_path: string, specs: readonly string[]) => {
      installRequests.push([...specs]);
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
      loadBundledAssets: async () => [],
    });
    assert(
      files.get(key(targetPath, "src/World.tsx")) === originalEntry,
      "component mode modified the hand-written World entry",
    );
    assert(
      componentResult.importSnippet?.includes("<XriftStudioScene />"),
      "component mode did not return a connection snippet",
    );
    const exportId = safeSegment(prototype.project.projectId);
    assert(
      componentResult.sceneSourceFile === `src/xrift-studio/${exportId}/World.tsx`,
      `generated Scene source is not in the export's own directory: ${componentResult.sceneSourceFile}`,
    );
    const sceneSource = files.get(key(targetPath, componentResult.sceneSourceFile)) ?? "";
    assert(
      sceneSource.includes("export const World") && sceneSource.includes("<group"),
      "component mode did not write the compiled JSX Scene",
    );
    assert(
      !sceneSource.includes("xrift-studio-runtime"),
      "the exported Scene must not import the unpublished runtime package",
    );
    assert(
      files.has(key(targetPath, `src/xrift-studio/${exportId}/xrift-studio/light-runtime.tsx`)),
      "the Light runtime module the Scene imports was not relocated beside it",
    );
    const bridge = files.get(key(targetPath, componentResult.integrationFile)) ?? "";
    assert(
      bridge.includes('export { World as XriftStudioScene } from "./World"'),
      "the bridge does not re-export the generated Scene",
    );
    const packageJson = JSON.parse(files.get(key(targetPath, "package.json")) ?? "{}");
    assert(
      packageJson.dependencies?.["xrift-studio-runtime"] === undefined,
      "the export must not record the unpublished runtime package",
    );
    assert(
      packageJson.dependencies?.["@xrift/world-components"] === "^0.47.0",
      "a world-components range that already reaches the compiler's version was rewritten",
    );
    assert(
      componentResult.packageInstallation === "unchanged" && installRequests.length === 0,
      "a primitive-only Scene needs nothing installed, so npm must not run",
    );
    const manifest = JSON.parse(
      files.get(key(targetPath, `.xrift-studio/exports/${exportId}/export-manifest.json`)) ?? "{}",
    );
    assert(
      manifest.format === CLASSIC_EXPORT_MANIFEST_FORMAT &&
        manifest.outputMode === "classic-jsx" &&
        Array.isArray(manifest.files) &&
        manifest.files.includes(componentResult.sceneSourceFile),
      "the export manifest does not record the generated Scene",
    );

    const replaceResult = await exportVisualProjectToClassic({
      authoringProjectPath: authoringPath,
      target,
      documents,
      integration: "replace-entry",
      installDependencies: false,
      save: async () => authoringPath,
      report: () => undefined,
      onLog: () => undefined,
      loadBundledAssets: async () => [],
    });
    const rewrittenEntry = files.get(key(targetPath, "src/World.tsx")) ?? "";
    assert(
      rewrittenEntry.includes("XriftStudioScene") &&
        rewrittenEntry.includes("export type WorldProps"),
      "replace-entry mode must connect the generated Scene and keep WorldProps for the template's index.tsx",
    );
    const replaceManifest = JSON.parse(
      files.get(key(targetPath, `.xrift-studio/exports/${exportId}/export-manifest.json`)) ?? "{}",
    );
    const backupPath = replaceManifest.files?.find((file: unknown) =>
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
      deleted.length === 0,
      `re-exporting the same Scene must not delete files it still generates, deleted ${deleted.join(", ")}`,
    );

    // A richer world: Text pulls in a font and the troika package, a Script
    // emits its own module under scripts/, and a texture is copied to the
    // world root. Everything the Scene imports has to land beside it.
    const richDocuments = createStagedTypecheckWorldDocuments();
    const richExportId = safeSegment(richDocuments.project.projectId);
    files.set(
      key(targetPath, "package.json"),
      `${JSON.stringify({ name: "fixture-classic", private: true, dependencies: { react: "19.0.0", "@xrift/world-components": "^0.43.0", "xrift-studio-runtime": "0.1.0" } }, null, 2)}\n`,
    );
    files.set(
      key(targetPath, `.xrift-studio/exports/${richExportId}/export-manifest.json`),
      JSON.stringify({
        format: CLASSIC_EXPORT_MANIFEST_FORMAT,
        schemaVersion: "1.0.0",
        runtimePackage: "xrift-studio-runtime@0.1.0",
        files: [
          `public/xrift-studio/${richExportId}/runtime.json`,
          `.xrift-studio/exports/${richExportId}/export-manifest.json`,
        ],
      }),
    );
    files.set(key(targetPath, `public/xrift-studio/${richExportId}/runtime.json`), "{}");
    files.set(key(targetPath, "public/draco_decoder.wasm"), "author-owned");
    const bundledRequests: string[] = [];
    const richResult = await exportVisualProjectToClassic({
      authoringProjectPath: authoringPath,
      target,
      documents: richDocuments,
      integration: "component",
      installDependencies: true,
      save: async () => authoringPath,
      report: () => undefined,
      onLog: () => undefined,
      loadBundledAssets: async (plan) =>
        plan.map((entry) => {
          bundledRequests.push(entry.targetRelativePath);
          return {
            targetRelativePath: entry.targetRelativePath,
            dataUrl: `data:application/octet-stream;base64,${btoa(entry.sourceFileName)}`,
          };
        }),
    });
    const richScene = files.get(key(targetPath, richResult.sceneSourceFile)) ?? "";
    assert(
      richScene.includes('from "./xrift-studio/script-host"') &&
        files.has(key(targetPath, `src/xrift-studio/${richExportId}/xrift-studio/script-host.tsx`)),
      "the Script host the Scene imports was not relocated beside it",
    );
    const scriptModule = [...files.keys()].find((path) =>
      path.startsWith(`${key(targetPath, `src/xrift-studio/${richExportId}/scripts/`)}`),
    );
    assert(scriptModule !== undefined, "the emitted Script module was not relocated under scripts/");
    assert(
      (files.get(scriptModule) ?? "").includes('from "../xrift-studio/script-api"'),
      "the relocated Script module no longer reaches the script API by relative import",
    );
    assert(
      bundledRequests.some((path) => /^public\/[^/]+\.woff$/.test(path)),
      `the Text font was not requested for the world root, got ${bundledRequests.join(", ")}`,
    );
    assert(
      bundledRequests.every((path) => files.has(key(targetPath, path))),
      "a bundled font was requested but not written",
    );
    assert(
      [...files.keys()].some((path) =>
        path.startsWith(`${key(targetPath, "public/xrift-studio-")}`) && path.endsWith(".png"),
      ),
      "the texture was not copied to the world root",
    );
    assert(
      !files.has(key(targetPath, `public/xrift-studio/${richExportId}/runtime.json`)) &&
        deleted.includes(`public/xrift-studio/${richExportId}/runtime.json`),
      "a file the previous export wrote and this one no longer produces was left behind",
    );
    assert(
      files.get(key(targetPath, "public/draco_decoder.wasm")) === "author-owned",
      "an author-owned file at a bundled decoder name was overwritten",
    );
    const richPackageJson = JSON.parse(files.get(key(targetPath, "package.json")) ?? "{}");
    assert(
      richPackageJson.dependencies?.["xrift-studio-runtime"] === undefined,
      "the unpublished runtime package recorded by an earlier export was not removed",
    );
    assert(
      richPackageJson.dependencies?.["@xrift/world-components"] === "0.47.0",
      "a world-components range below the compiler's version was not pinned",
    );
    assert(
      typeof richPackageJson.dependencies?.["troika-three-text"] === "string",
      "the Text runtime's troika dependency was not recorded",
    );
    const lastInstall = installRequests[installRequests.length - 1] ?? [];
    assert(
      richResult.packageInstallation === "installed" &&
        lastInstall.includes(COMPILER_WORLD_COMPONENTS_PACKAGE_SPEC) &&
        lastInstall.some((spec) => spec.startsWith("troika-three-text@")),
      `npm install did not receive the changed packages, got ${lastInstall.join(", ")}`,
    );
    assert(
      richResult.notes.some((note) => note.includes("xrift-studio-runtime")),
      "removing the stale runtime dependency was not reported to the author",
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
