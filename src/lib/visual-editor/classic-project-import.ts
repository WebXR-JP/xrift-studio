import { tauri, type ProjectKind } from "../tauri";
import {
  inspectClassicExportTarget,
  type ClassicExportTarget,
} from "./classic-export";
import type { ComponentCodeImportSourceModule } from "./component-code-import";
import {
  commitAssetImportPlan,
  createAssetImportPlan,
  type AssetImportDiagnostic,
  type AssetImportPlan,
} from "./asset-import";
import type { AssetManifest } from "./asset-manifest";
import type {
  ComponentCodeImportAssetDependency,
  ComponentCodeImportPlan,
} from "./component-code-import";
import { convertDracoGeometryToGlb } from "./draco-import";
import type { ThreeModelCompanionFile } from "./three-model-converter";

export type ClassicProjectVisualImportSource = ClassicExportTarget & {
  source: string;
  modules: ComponentCodeImportSourceModule[];
};

export type ClassicProjectVisualAssetImportPreparation = {
  plans: AssetImportPlan[];
  manifest: AssetManifest;
  assetIdBySourcePath: Record<string, string>;
  diagnostics: AssetImportDiagnostic[];
};

const MAX_SOURCE_MODULES = 256;
const MAX_SOURCE_MODULE_BYTES = 1024 * 1024;
const MAX_SOURCE_GRAPH_BYTES = 4 * 1024 * 1024;
const SOURCE_MODULE_PATTERN = /\.(?:[cm]?[jt]sx?)$/i;
const MAX_COMPANION_FILES = 512;
const MAX_COMPANION_BYTES = 128 * 1024 * 1024;
const MODEL_COMPANION_PATTERN =
  /\.(?:bin|mtl|png|jpe?g|webp|avif|gif|bmp|svg|tga|tif|tiff|dds|ktx2?|hdr|exr|dat|ldr|mpd)$/i;

/**
 * Reads the validated XRift entry and a bounded set of source modules. Imported
 * source is later parsed by the non-evaluating JSX converter; no dependency
 * installation or project code execution happens at this boundary.
 */
export async function loadClassicProjectVisualImportSource(
  projectPath: string,
  expectedKind: ProjectKind,
): Promise<ClassicProjectVisualImportSource> {
  const target = await inspectClassicExportTarget(projectPath, expectedKind);
  const modules = await readClassicSourceModules(target.path);
  const source =
    modules.find((module) => module.path === target.entryFile)?.source ??
    (await tauri.readTextFile(target.path, target.entryFile));
  if (!modules.some((module) => module.path === target.entryFile)) {
    modules.unshift({ path: target.entryFile, source });
  }
  return { ...target, source, modules };
}

export async function pickClassicProjectVisualImportSource(
  expectedKind: ProjectKind,
): Promise<ClassicProjectVisualImportSource | null> {
  if (!tauri.isAvailable()) {
    throw new Error(
      "Classicプロジェクトのフォルダー読み込みはデスクトップ版で利用できます。",
    );
  }
  const selected = await tauri.selectDirectory(
    `XRift Classic ${expectedKind === "world" ? "World" : "Item"}プロジェクトを選択`,
  );
  const projectPath = Array.isArray(selected) ? selected[0] : selected;
  if (typeof projectPath !== "string" || !projectPath.trim()) return null;
  return loadClassicProjectVisualImportSource(projectPath, expectedKind);
}

/**
 * Reads only asset dependencies discovered by the static TSX analysis and
 * prepares normal Studio import transactions. No target project files are
 * written until the caller commits every returned plan atomically.
 */
export async function prepareClassicProjectVisualAssetImports(input: {
  source: ClassicProjectVisualImportSource;
  componentPlan: ComponentCodeImportPlan;
  existingManifest: AssetManifest;
}): Promise<ClassicProjectVisualAssetImportPreparation> {
  const plans: AssetImportPlan[] = [];
  const assetIdBySourcePath: Record<string, string> = {};
  const diagnostics: AssetImportDiagnostic[] = [];
  let workingManifest = input.existingManifest;

  for (const dependency of input.componentPlan.assetDependencies) {
    const prepared = await prepareClassicDependency(
      input.source,
      dependency,
      workingManifest,
    );
    diagnostics.push(...prepared.diagnostics);
    if (!prepared.plan?.canCommit || !prepared.plan.asset) continue;
    plans.push(prepared.plan);
    assetIdBySourcePath[dependency.sourcePath] = prepared.plan.asset.id;
    workingManifest = await commitAssetImportPlan(
      workingManifest,
      prepared.plan,
      async () => undefined,
    );
  }

  return {
    plans,
    manifest: workingManifest,
    assetIdBySourcePath,
    diagnostics,
  };
}

async function prepareClassicDependency(
  source: ClassicProjectVisualImportSource,
  dependency: ComponentCodeImportAssetDependency,
  existingManifest: AssetManifest,
): Promise<{ plan?: AssetImportPlan; diagnostics: AssetImportDiagnostic[] }> {
  if (dependency.kind === "unsupported" && !/\.drc$/i.test(dependency.sourcePath)) {
    return {
      diagnostics: [
        {
          severity: "blocking",
          code: "classic-asset-format-unsupported",
          fileName: dependency.fileName,
          message: `${dependency.sourcePath}はStudioで変換できないAsset形式です。`,
        },
      ],
    };
  }

  let dataUrl: string;
  try {
    dataUrl = await tauri.readProjectFileDataUrl(
      source.path,
      dependency.sourcePath,
    );
  } catch (error) {
    return {
      diagnostics: [
        {
          severity: "blocking",
          code: "classic-asset-read-failed",
          fileName: dependency.fileName,
          message: `${dependency.sourcePath}をClassicプロジェクトから読み取れませんでした: ${errorMessage(error)}`,
        },
      ],
    };
  }

  try {
    const decoded = decodeDataUrl(dataUrl);
    const draco = /\.drc$/i.test(dependency.sourcePath);
    const companionFiles =
      !draco && dependency.kind === "model"
        ? await readClassicModelCompanions(
            source.path,
            dependency.sourcePath,
          )
        : undefined;
    const bytes = draco
      ? await convertDracoGeometryToGlb(decoded.bytes)
      : decoded.bytes;
    const fileName = draco
      ? dependency.fileName.replace(/\.drc$/i, ".glb")
      : dependency.fileName;
    const plan = await createAssetImportPlan({
      fileName,
      bytes,
      mimeType: draco ? "model/gltf-binary" : decoded.mimeType,
      displayName: dependency.fileName.replace(/\.[^.]+$/, ""),
      existingManifest,
      preferredKind:
        dependency.kind === "unsupported" ? undefined : dependency.kind,
      companionFiles,
    });
    return { plan, diagnostics: plan.diagnostics };
  } catch (error) {
    return {
      diagnostics: [
        {
          severity: "blocking",
          code: "classic-asset-convert-failed",
          fileName: dependency.fileName,
          message: `${dependency.sourcePath}をVisual Assetへ変換できませんでした: ${errorMessage(error)}`,
        },
      ],
    };
  }
}

async function readClassicModelCompanions(
  projectPath: string,
  modelSourcePath: string,
): Promise<ThreeModelCompanionFile[]> {
  const normalizedSource = modelSourcePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = normalizedSource.split("/").filter(Boolean);
  const sourceDirectory = segments.slice(0, -1).join("/");
  const scanRoot = segments[0] === "public" ? "public" : sourceDirectory;
  if (!scanRoot) return [];

  const candidates: Array<{ rel: string; size: number }> = [];
  const pending = [scanRoot];
  let totalBytes = 0;
  while (pending.length > 0) {
    const directory = pending.shift();
    if (!directory) continue;
    for (const entry of await tauri.listFiles(projectPath, directory)) {
      if (entry.isDir) {
        pending.push(entry.rel);
        continue;
      }
      const rel = entry.rel.replace(/\\/g, "/");
      if (rel === normalizedSource || !MODEL_COMPANION_PATTERN.test(rel)) continue;
      const size = entry.size ?? 0;
      totalBytes += size;
      if (
        candidates.length >= MAX_COMPANION_FILES ||
        totalBytes > MAX_COMPANION_BYTES
      ) {
        throw new Error(
          `モデル依存ファイルが上限（${MAX_COMPANION_FILES}件 / ${MAX_COMPANION_BYTES / 1024 / 1024} MB）を超えています`,
        );
      }
      candidates.push({ rel, size });
    }
  }

  return Promise.all(
    candidates.map(async ({ rel }) => {
      const decoded = decodeDataUrl(
        await tauri.readProjectFileDataUrl(projectPath, rel),
      );
      return {
        relativePath: rel,
        bytes: decoded.bytes,
        mimeType: decoded.mimeType,
      };
    }),
  );
}

function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mimeType: string } {
  const separator = dataUrl.indexOf(",");
  if (separator < 0) throw new Error("data URLが壊れています。 ");
  const header = dataUrl.slice(0, separator);
  const mimeType = header.match(/^data:([^;,]+)/i)?.[1] ?? "application/octet-stream";
  const payload = dataUrl.slice(separator + 1);
  const decoded = header.includes(";base64")
    ? atob(payload)
    : decodeURIComponent(payload);
  return {
    mimeType,
    bytes: Uint8Array.from(decoded, (character) => character.charCodeAt(0)),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readClassicSourceModules(
  projectPath: string,
): Promise<ComponentCodeImportSourceModule[]> {
  const sourceEntries: Array<{ path: string; size: number }> = [];
  const pending = ["src"];
  while (pending.length > 0) {
    const directory = pending.shift();
    if (!directory) continue;
    const entries = await tauri.listFiles(projectPath, directory);
    for (const entry of entries) {
      if (entry.isDir) {
        pending.push(entry.rel);
        continue;
      }
      if (!SOURCE_MODULE_PATTERN.test(entry.rel)) continue;
      const size = entry.size ?? 0;
      if (size > MAX_SOURCE_MODULE_BYTES) {
        throw new Error(
          `${entry.rel}が大きすぎます。1 moduleあたり1 MB以下にしてください。`,
        );
      }
      sourceEntries.push({ path: entry.rel.replace(/\\/g, "/"), size });
      if (sourceEntries.length > MAX_SOURCE_MODULES) {
        throw new Error(
          `src内のsource moduleが${MAX_SOURCE_MODULES}件を超えています。変換対象を分けてください。`,
        );
      }
    }
  }
  const totalBytes = sourceEntries.reduce((total, entry) => total + entry.size, 0);
  if (totalBytes > MAX_SOURCE_GRAPH_BYTES) {
    throw new Error("srcのsource module合計が4 MBを超えています。変換対象を分けてください。");
  }
  return Promise.all(
    sourceEntries.map(async (entry) => ({
      path: entry.path,
      source: await tauri.readTextFile(projectPath, entry.path),
    })),
  );
}
