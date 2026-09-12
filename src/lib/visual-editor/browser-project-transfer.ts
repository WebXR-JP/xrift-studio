import { unzipSync, zipSync, type Zippable } from "three/examples/jsm/libs/fflate.module.js";
import { assetManifestCodec, visualProjectDocumentCodec } from "./serialization";
import { parseVisualProjectFiles, serializeVisualProjectDocuments, type VisualProjectDocuments } from "./persistence";
import { createDocumentId } from "./document-id";
import { validateBrowserRelativePath } from "../browser-project-storage";

export const BROWSER_PROJECT_ARCHIVE_MAX_BYTES = 256 * 1024 * 1024;
const MAX_ENTRIES = 20_000;
const PROJECT_MANIFEST = "xrift-studio.project.json";
const PACKAGE_MANIFEST = ".xrift-studio/package-manifest.json";
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function checkedPath(path: string): string {
  return validateBrowserRelativePath(path);
}

function checkFileTree(files: ReadonlyMap<string, Uint8Array>): void {
  for (const path of files.keys()) {
    checkedPath(path);
    const parts = path.split("/");
    for (let index = 1; index < parts.length; index++) {
      const parent = parts.slice(0, index).join("/");
      if (files.has(parent)) throw new Error(`ファイルとフォルダーの名前が重複しています: ${parent}`);
    }
  }
}

function archiveFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|\x00-\x1f]/g, "-").replace(/^[. ]+|[. ]+$/g, "").slice(0, 96) || "xrift-project";
}

function textFile(files: ReadonlyMap<string, Uint8Array>, path: string): string {
  const bytes = files.get(checkedPath(path));
  if (!bytes) throw new Error(`プロジェクトのファイルが見つかりません: ${path}`);
  return decoder.decode(bytes);
}

/** Uses the same codecs and on-disk layout as the desktop project reader. */
export function parseBrowserProjectFiles(files: ReadonlyMap<string, Uint8Array>): VisualProjectDocuments {
  checkFileTree(files);
  const projectJson = textFile(files, PROJECT_MANIFEST);
  const parsedProject = visualProjectDocumentCodec.parse(projectJson);
  if (!parsedProject.ok) throw new Error("XRift Studioのビジュアルプロジェクトを読み取れません。");
  const project = parsedProject.document;
  const assetManifestJson = textFile(files, project.assetManifestPath);
  const parsedAssets = assetManifestCodec.parse(assetManifestJson);
  if (!parsedAssets.ok) throw new Error("プロジェクトのAssetsを読み取れません。");
  const prefabDocuments = Object.values(parsedAssets.document.assets)
    .filter((asset) => asset.kind === "template" && asset.templateType === "prefab" && asset.source.kind === "project")
    .map((asset) => {
      if (asset.source.kind !== "project") throw new Error("Prefabのファイルを確認してください。");
      return { relativePath: asset.source.relativePath, content: textFile(files, asset.source.relativePath) };
    });
  return parseVisualProjectFiles({
    projectJson,
    assetManifestJson,
    sceneDocuments: Object.values(project.scenePaths).map((relativePath) => ({ relativePath, content: textFile(files, relativePath) })),
    prefabDocuments,
  });
}

/** Overlay current documents without dropping other scenes, source files or assets. */
export function browserProjectDocumentFiles(documents: VisualProjectDocuments): Map<string, Uint8Array> {
  const serialized = serializeVisualProjectDocuments(documents);
  return new Map([
    [PROJECT_MANIFEST, encoder.encode(serialized.projectJson)],
    [documents.project.assetManifestPath, encoder.encode(serialized.assetManifestJson)],
    ...[...serialized.sceneDocuments, ...serialized.prefabDocuments].map((file): [string, Uint8Array] => [checkedPath(file.relativePath), encoder.encode(file.content)]),
  ]);
}

/** ZIP is the desktop's existing portable format; no new project schema is introduced. */
export async function createBrowserProjectArchive(documents: VisualProjectDocuments, storedFiles: ReadonlyMap<string, Uint8Array>): Promise<{ blob: Blob; fileName: string; fileCount: number }> {
  const files = new Map(storedFiles);
  const { lastPublication: _publication, ...unpublishedProject } = documents.project;
  for (const [path, bytes] of browserProjectDocumentFiles({ ...documents, project: unpublishedProject })) files.set(path, bytes);
  files.delete(PACKAGE_MANIFEST);
  files.delete(".xrift/world.json");
  files.delete(".xrift/item.json");
  for (const path of files.keys()) {
    checkedPath(path);
    if (path.split("/").some((part) => [".cache", "node_modules", ".git", "dist", ".xrift-studio-cache"].includes(part))) files.delete(path);
  }
  checkFileTree(files);
  for (const asset of Object.values(documents.assets.assets)) {
    if (asset.source.kind === "project" && !files.has(checkedPath(asset.source.relativePath))) {
      throw new Error(`素材「${asset.name}」のファイルがありません。素材を取り込み直してから書き出してください。`);
    }
  }
  const totalBytes = [...files.values()].reduce((sum, bytes) => sum + bytes.byteLength, 0);
  if (totalBytes > BROWSER_PROJECT_ARCHIVE_MAX_BYTES || files.size + 1 > MAX_ENTRIES) {
    throw new Error("ブラウザ版では展開後256 MB・20,000ファイルまで書き出せます。大きな素材を減らして再試行してください。");
  }
  const inventory = [];
  for (const [path, bytes] of files) {
    const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
    const sha256 = [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    inventory.push({ path, size: bytes.byteLength, sha256 });
  }
  files.set(PACKAGE_MANIFEST, encoder.encode(JSON.stringify({ format: "xrift-studio-package", formatVersion: 1, files: inventory }, null, 2)));
  const folderName = archiveFileName(documents.project.metadata.name);
  const zipFiles: Zippable = Object.create(null);
  for (const [path, bytes] of files) zipFiles[`${folderName}/${path}`] = bytes;
  // Imported GLB/images are already compressed. STORE avoids a second large
  // compression buffer and worker startup on memory-constrained tablets.
  const archive = zipSync(zipFiles, { level: 0 });
  if (archive.byteLength > BROWSER_PROJECT_ARCHIVE_MAX_BYTES) {
    throw new Error("ZIPが256 MBを超えました。大きな素材を減らしてから書き出してください。");
  }
  return { blob: new Blob([new Uint8Array(archive)], { type: "application/zip" }), fileName: `${folderName}.zip`, fileCount: files.size };
}

export async function readBrowserProjectArchive(file: File): Promise<{ documents: VisualProjectDocuments; files: Map<string, Uint8Array> }> {
  if (file.size > BROWSER_PROJECT_ARCHIVE_MAX_BYTES) throw new Error("ブラウザ版で開けるZIPは256 MBまでです。大きなプロジェクトはデスクトップ版で開いてください。");
  const names = new Set<string>();
  let unpackedBytes = 0;
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: (entry) => {
      const path = entry.name.endsWith("/") ? entry.name.slice(0, -1) : entry.name;
      checkedPath(path);
      if (names.has(entry.name)) throw new Error("ZIPに同じ名前のファイルが複数あります。");
      names.add(entry.name);
      unpackedBytes += entry.originalSize;
      if (!Number.isSafeInteger(unpackedBytes) || unpackedBytes > BROWSER_PROJECT_ARCHIVE_MAX_BYTES || names.size > MAX_ENTRIES) {
        throw new Error("展開後256 MB・20,000ファイルを超えるZIPはデスクトップ版で開いてください。");
      }
      return !entry.name.endsWith("/");
    },
  });
  const manifests = Object.keys(entries).filter((path) => path === PROJECT_MANIFEST || (path.endsWith(`/${PROJECT_MANIFEST}`) && path.split("/").length === 2));
  if (manifests.length !== 1) throw new Error("XRift Studioで書き出したビジュアルプロジェクトのZIPを選んでください。");
  const prefix = manifests[0].slice(0, -PROJECT_MANIFEST.length);
  const files = new Map<string, Uint8Array>();
  for (const [path, bytes] of Object.entries(entries)) {
    if (!path.startsWith(prefix)) throw new Error("複数のプロジェクトを含むZIPは開けません。");
    files.set(checkedPath(path.slice(prefix.length)), bytes);
  }
  const documents = parseBrowserProjectFiles(files);
  const { lastPublication: _publication, ...project } = documents.project;
  documents.project = { ...project, projectId: createDocumentId("project") };
  files.delete(PACKAGE_MANIFEST);
  files.delete(".xrift/world.json");
  files.delete(".xrift/item.json");
  for (const [path, bytes] of browserProjectDocumentFiles(documents)) files.set(path, bytes);
  return { documents, files };
}
