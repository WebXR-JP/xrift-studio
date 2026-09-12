import { Inflate, strFromU8, zipSync, type Zippable } from "three/examples/jsm/libs/fflate.module.js";
import { assetManifestCodec, visualProjectDocumentCodec } from "./serialization";
import { parseVisualProjectFiles, serializeVisualProjectDocuments, type VisualProjectDocuments } from "./persistence";
import { createDocumentId } from "./document-id";
import { validateBrowserRelativePath } from "../browser-project-storage";
import { PROJECT_PACKAGE_MIME_TYPE, projectPackageFileName } from "../project-package";

export const BROWSER_PROJECT_ARCHIVE_MAX_BYTES = 256 * 1024 * 1024;
const MAX_ENTRIES = 20_000;
const PROJECT_MANIFEST = "xrift-studio.project.json";
const PACKAGE_MANIFEST = ".xrift-studio/package-manifest.json";
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = (value >>> 8) ^ crcTable[(value ^ byte) & 255];
  return (value ^ 0xffffffff) >>> 0;
}

/**
 * Native exports use per-entry ZIP64 sizes even when the footer is ZIP32.
 * Three's unzipSync misses those sizes and does not verify CRCs. Read the
 * directory first, then bound actual Deflate output as well as declared sizes.
 */
function readArchiveEntries(data: Uint8Array): Map<string, Uint8Array> {
  const invalid = () => new Error("プロジェクトファイルが破損しているか、対応していないZIP形式です。");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const range = (offset: number, length: number) => {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > data.length) throw invalid();
  };
  const u16 = (offset: number) => { range(offset, 2); return view.getUint16(offset, true); };
  const u32 = (offset: number) => { range(offset, 4); return view.getUint32(offset, true); };
  const u64 = (offset: number) => {
    const value = u32(offset) + u32(offset + 4) * 0x100000000;
    if (!Number.isSafeInteger(value)) throw invalid();
    return value;
  };
  let footer = data.length - 22;
  while (footer >= Math.max(0, data.length - 65557)) {
    if (u32(footer) === 0x06054b50 && footer + 22 + u16(footer + 20) === data.length) break;
    footer--;
  }
  if (footer < Math.max(0, data.length - 65557)) throw invalid();
  if (u16(footer + 4) !== 0 || u16(footer + 6) !== 0 || u16(footer + 8) !== u16(footer + 10)) throw invalid();
  let count = u16(footer + 10);
  let directorySize = u32(footer + 12);
  let directoryStart = u32(footer + 16);
  let directoryLimit = footer;
  if (count === 0xffff || directorySize === 0xffffffff || directoryStart === 0xffffffff) {
    if (u32(footer - 20) !== 0x07064b50 || u32(footer - 16) !== 0 || u32(footer - 4) !== 1) throw invalid();
    const zip64 = u64(footer - 12);
    if (u32(zip64) !== 0x06064b50 || u64(zip64 + 4) < 44 || zip64 + 12 + u64(zip64 + 4) !== footer - 20 ||
        u32(zip64 + 16) !== 0 || u32(zip64 + 20) !== 0 || u64(zip64 + 24) !== u64(zip64 + 32)) throw invalid();
    count = u64(zip64 + 32);
    directorySize = u64(zip64 + 40);
    directoryStart = u64(zip64 + 48);
    directoryLimit = zip64;
  }
  if (count > MAX_ENTRIES) throw new Error("20,000ファイルを超えるZIPはデスクトップ版で開いてください。");
  range(directoryStart, directorySize);
  if (directoryStart + directorySize > directoryLimit) throw invalid();
  const entries: { name: string; originalSize: number; size: number; offset: number; end: number; compression: number; crc: number }[] = [];
  const names = new Set<string>();
  let unpackedBytes = 0;
  let cursor = directoryStart;
  for (let index = 0; index < count; index++) {
    if (u32(cursor) !== 0x02014b50) throw invalid();
    range(cursor, 46);
    const flags = u16(cursor + 8);
    const compression = u16(cursor + 10);
    const nameLength = u16(cursor + 28);
    const extraStart = cursor + 46 + nameLength;
    const extraEnd = extraStart + u16(cursor + 30);
    const next = extraEnd + u16(cursor + 32);
    if (next > directoryStart + directorySize || flags & 0x2041 || ![0, 8].includes(compression)) throw invalid();
    const rawName = data.subarray(cursor + 46, extraStart);
    const name = flags & 0x800 ? decoder.decode(rawName) : strFromU8(rawName, true);
    const path = checkedPath(name.endsWith("/") ? name.slice(0, -1) : name);
    if (names.has(path)) throw new Error("ZIPに同じ名前のファイルやフォルダーが複数あります。");
    names.add(path);
    let size = u32(cursor + 20);
    let originalSize = u32(cursor + 24);
    let localOffset = u32(cursor + 42);
    let disk = u16(cursor + 34);
    const needsZip64 = size === 0xffffffff || originalSize === 0xffffffff || localOffset === 0xffffffff || disk === 0xffff;
    let foundZip64 = false;
    for (let extra = extraStart; extra < extraEnd;) {
      if (extra + 4 > extraEnd) throw invalid();
      const end = extra + 4 + u16(extra + 2);
      if (end > extraEnd) throw invalid();
      if (u16(extra) === 1 && needsZip64) {
        if (foundZip64) throw invalid();
        foundZip64 = true;
        let field = extra + 4;
        const next64 = () => { if (field + 8 > end) throw invalid(); const value = u64(field); field += 8; return value; };
        if (originalSize === 0xffffffff) originalSize = next64();
        if (size === 0xffffffff) size = next64();
        if (localOffset === 0xffffffff) localOffset = next64();
        if (disk === 0xffff) { if (field + 4 > end) throw invalid(); disk = u32(field); }
      }
      extra = end;
    }
    if ((needsZip64 && !foundZip64) || disk !== 0) throw invalid();
    unpackedBytes += originalSize;
    if (!Number.isSafeInteger(unpackedBytes) || unpackedBytes > BROWSER_PROJECT_ARCHIVE_MAX_BYTES) throw new Error("展開後256 MBを超えるZIPはデスクトップ版で開いてください。");
    if ((compression === 0 && size !== originalSize) || (name.endsWith("/") && originalSize !== 0)) throw invalid();
    if (u32(localOffset) !== 0x04034b50 || u16(localOffset + 6) !== flags || u16(localOffset + 8) !== compression || u16(localOffset + 26) !== nameLength) throw invalid();
    range(localOffset + 30, nameLength);
    if (rawName.some((byte, i) => byte !== data[localOffset + 30 + i])) throw invalid();
    const offset = localOffset + 30 + nameLength + u16(localOffset + 28);
    const end = offset + size;
    range(offset, size);
    if (end > directoryStart) throw invalid();
    entries.push({ name, originalSize, size, offset, end, compression, crc: u32(cursor + 16) });
    cursor = next;
  }
  if (cursor !== directoryStart + directorySize) throw invalid();
  const files = new Map<string, Uint8Array>();
  for (const entry of entries) {
    let bytes: Uint8Array;
    if (entry.compression === 0) bytes = data.subarray(entry.offset, entry.end);
    else {
      bytes = new Uint8Array(entry.originalSize);
      let written = 0;
      const inflater = new Inflate((chunk) => {
        if (written + chunk.length > entry.originalSize) throw invalid();
        bytes.set(chunk, written);
        written += chunk.length;
      });
      // A small compressed chunk bounds temporary allocation even when the
      // advertised uncompressed size has been forged (Deflate expansion bomb).
      for (let offset = entry.offset; offset < entry.end; offset += 4096) {
        const end = Math.min(offset + 4096, entry.end);
        inflater.push(data.subarray(offset, end), end === entry.end);
      }
      if (!entry.size || written !== entry.originalSize) throw invalid();
    }
    if (crc32(bytes) !== entry.crc) throw invalid();
    if (!entry.name.endsWith("/")) files.set(entry.name, bytes);
  }
  return files;
}

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
  for (const asset of Object.values(parsedAssets.document.assets)) {
    if (asset.source.kind === "project" && !files.has(checkedPath(asset.source.relativePath))) {
      throw new Error(`素材「${asset.name}」のファイルが見つかりません: ${asset.source.relativePath}`);
    }
  }
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
  const fileName = projectPackageFileName(documents.project.metadata.name);
  const folderName = fileName.slice(0, -".xriftstudio".length);
  const zipFiles: Zippable = Object.create(null);
  for (const [path, bytes] of files) zipFiles[`${folderName}/${path}`] = bytes;
  // Imported GLB/images are already compressed. STORE avoids a second large
  // compression buffer and worker startup on memory-constrained tablets.
  const archive = zipSync(zipFiles, { level: 0 });
  if (archive.byteLength > BROWSER_PROJECT_ARCHIVE_MAX_BYTES) {
    throw new Error("プロジェクトファイルが256 MBを超えました。大きな素材を減らしてから書き出してください。");
  }
  return { blob: new Blob([new Uint8Array(archive)], { type: PROJECT_PACKAGE_MIME_TYPE }), fileName, fileCount: files.size };
}

export async function readBrowserProjectArchive(file: File): Promise<{ documents: VisualProjectDocuments; files: Map<string, Uint8Array> }> {
  if (file.size > BROWSER_PROJECT_ARCHIVE_MAX_BYTES) throw new Error("ブラウザ版で開けるプロジェクトファイルは256 MBまでです。大きなプロジェクトはデスクトップ版で開いてください。");
  const entries = readArchiveEntries(new Uint8Array(await file.arrayBuffer()));
  const manifests = [...entries.keys()].filter((path) => path === PROJECT_MANIFEST || (path.endsWith(`/${PROJECT_MANIFEST}`) && path.split("/").length === 2));
  if (manifests.length !== 1) throw new Error("XRift Studioで書き出したビジュアルプロジェクト（.xriftstudioまたは.zip）を選んでください。");
  const prefix = manifests[0].slice(0, -PROJECT_MANIFEST.length);
  const files = new Map<string, Uint8Array>();
  for (const [path, bytes] of entries) {
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
