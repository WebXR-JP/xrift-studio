import { Euler, Quaternion } from "three";
import { parseDocument } from "yaml";
import {
  addDefaultMaterialAsset,
  getModelAsset,
  type AssetFolder,
  type AssetManifest,
  type MaterialAssetPatch,
  type ModelAsset,
  type SceneAsset,
} from "./asset-manifest";
import {
  commitAssetImportPlan,
  createAssetImportPlan,
  sha256AssetBytes,
  type AssetImportPlan,
} from "./asset-import";
import { createDocumentId } from "./document-id";
import {
  addPrefabAsset,
  createPrefabDocument,
  type PrefabDocument,
  type PrefabImportMetadata,
} from "./prefab-document";
import { BUILTIN_ASSET_IDS, type PrototypeVisualProject } from "./prototype-project";
import {
  createBoxColliderComponent,
  createMeshColliderComponent,
  createMeshComponent,
  createTransformComponent,
  type AudioSourceComponent,
  type LightComponent,
  type RegisteredSceneComponent,
  type SceneDocument,
  type SceneEntity,
  type Vec3,
} from "./scene-document";
import { resolveSceneSettings, type SceneSettings } from "./scene-settings";

export const UNITY_PACKAGE_MAX_COMPRESSED_BYTES = 256 * 1024 * 1024;
export const UNITY_PACKAGE_MAX_EXPANDED_BYTES = 768 * 1024 * 1024;
export const UNITY_PACKAGE_MAX_ENTRIES = 20_000;

export type UnityImportDiagnostic = {
  severity: "blocking" | "warning";
  code: string;
  message: string;
  sourcePath?: string;
};

export type UnityImportResult = {
  prefabCount: number;
  entityCount: number;
  assetCount: number;
  materialCount: number;
  warningCount: number;
};

export type UnityPackageImportPlan = {
  canCommit: boolean;
  sourceName: string;
  sourceHash: string;
  /** Includes the new logical Unity folders, but no planned file assets yet. */
  assetCommitBaseManifest: AssetManifest;
  assetPlans: AssetImportPlan[];
  scene: SceneDocument;
  assets: AssetManifest;
  prefabs: Record<string, PrefabDocument>;
  selectedAssetId?: string;
  diagnostics: UnityImportDiagnostic[];
  result: UnityImportResult;
};

export type CreateUnityPackageImportPlanInput = {
  fileName: string;
  bytes: ArrayBuffer | Uint8Array;
  bundle: PrototypeVisualProject;
  parentFolderId?: string | null;
  onProgress?: (progress: number, message: string) => void;
};

type UnityPackageEntry = {
  guid: string;
  path: string;
  asset?: Uint8Array;
  meta?: Uint8Array;
};

type UnityYamlObject = {
  classId: string;
  fileId: string;
  typeName: string;
  data: Record<string, unknown>;
};

type ParsedUnityDocument = {
  objects: UnityYamlObject[];
  diagnostics: UnityImportDiagnostic[];
};

type ConvertedUnityDocument = {
  entities: Record<string, SceneEntity>;
  rootEntityIds: string[];
  settings?: SceneSettings;
  componentClassCounts: Record<string, number>;
  unsupportedComponentClassIds: string[];
  diagnostics: UnityImportDiagnostic[];
};

const SUPPORTED_PACKAGE_ASSET = /\.(glb|gltf|obj|vrm|png|jpe?g|webp|ktx2)$/i;
const UNITY_DOCUMENT = /\.(unity|prefab)$/i;
const UNITY_MATERIAL = /\.mat$/i;
const UNITY_GUID = /^[0-9a-f]{32}$/i;

export function isUnityImportFileName(fileName: string): boolean {
  return /\.(unitypackage|unity|prefab)$/i.test(fileName.trim());
}

export async function createUnityPackageImportPlan(
  input: CreateUnityPackageImportPlanInput,
): Promise<UnityPackageImportPlan> {
  const diagnostics: UnityImportDiagnostic[] = [];
  const sourceName = leafName(input.fileName) || "Unity Import";
  const bytes = ownedBytes(input.bytes);
  let sourceHash = "";
  reportProgress(input, 8, "Unityパッケージを展開しています");

  if (bytes.byteLength === 0 || bytes.byteLength > UNITY_PACKAGE_MAX_COMPRESSED_BYTES) {
    diagnostics.push({
      severity: "blocking",
      code: bytes.byteLength === 0 ? "unity-source-empty" : "unity-source-too-large",
      message:
        bytes.byteLength === 0
          ? "空のUnityファイルは取り込めません"
          : "Unityパッケージは256 MB以下にしてください",
    });
    return blockedUnityPlan(input, sourceName, diagnostics);
  }

  sourceHash = await sha256AssetBytes(bytes);

  let entries: UnityPackageEntry[];
  try {
    entries = /\.unitypackage$/i.test(sourceName)
      ? await readUnityPackage(bytes)
      : [
          {
            guid: `standalone-${sourceHash}`,
            path: sourceName,
            asset: bytes,
          },
        ];
  } catch (error) {
    diagnostics.push({
      severity: "blocking",
      code: "unity-package-invalid",
      message: `Unityパッケージを展開できませんでした: ${errorMessage(error)}`,
    });
    return blockedUnityPlan(input, sourceName, diagnostics);
  }

  if (entries.length === 0) {
    diagnostics.push({
      severity: "blocking",
      code: "unity-package-empty",
      message: "Unityパッケージに復元できるファイルがありません",
    });
    return blockedUnityPlan(input, sourceName, diagnostics);
  }

  reportProgress(input, 24, "アセットとScene参照を調べています");
  const relevantPaths = entries
    .filter((entry) =>
      SUPPORTED_PACKAGE_ASSET.test(entry.path) ||
      UNITY_DOCUMENT.test(entry.path) ||
      UNITY_MATERIAL.test(entry.path),
    )
    .map((entry) => entry.path);
  const folderPlan = createUnityFolderPlan(
    input.bundle.assets,
    sourceName,
    relevantPaths,
    input.parentFolderId ?? null,
  );
  const assetCommitBaseManifest: AssetManifest = {
    ...input.bundle.assets,
    folders: folderPlan.folders,
  };
  let assets = assetCommitBaseManifest;
  const assetPlans: AssetImportPlan[] = [];
  const guidToAssetId = new Map<string, string>();
  let selectedAssetId: string | undefined;

  const unsupportedExtensions = countUnsupportedAssetExtensions(entries);
  if (unsupportedExtensions.size > 0) {
    const summary = [...unsupportedExtensions.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, 8)
      .map(([extension, count]) => `${extension} ${count}件`)
      .join("、");
    diagnostics.push({
      severity: "warning",
      code: "unity-assets-preserved-but-not-converted",
      message: `${summary} は参照を解析しましたが、XRift用モデル／テクスチャには変換していません`,
    });
  }

  for (const entry of entries.filter(
    (candidate) => candidate.asset && SUPPORTED_PACKAGE_ASSET.test(candidate.path),
  )) {
    const plan = await createAssetImportPlan({
      fileName: leafName(entry.path),
      displayName: displayName(entry.path),
      bytes: entry.asset!,
      mimeType: mimeTypeForPath(entry.path),
      folderId: folderPlan.folderIdForPath(entry.path),
      existingManifest: assets,
    });
    const duplicate = Object.values(assets.assets).find(
      (asset) =>
        asset.sourceHash === plan.sourceHash &&
        asset.kind === plan.asset?.kind,
    );
    if (duplicate) {
      guidToAssetId.set(entry.guid, duplicate.id);
      selectedAssetId = duplicate.id;
      diagnostics.push({
        severity: "warning",
        code: "unity-asset-duplicate",
        message: `「${entry.path}」は同じ内容の既存アセットを再利用しました`,
        sourcePath: entry.path,
      });
      continue;
    }
    if (!plan.canCommit || !plan.asset) {
      diagnostics.push(
        ...plan.diagnostics.map((diagnostic) => ({
          severity: "warning" as const,
          code: `unity-${diagnostic.code}`,
          message: diagnostic.message,
          sourcePath: entry.path,
        })),
      );
      continue;
    }
    assets = await commitAssetImportPlan(assets, plan, async () => undefined);
    assetPlans.push(plan);
    guidToAssetId.set(entry.guid, plan.asset.id);
    selectedAssetId = plan.asset.id;
  }

  reportProgress(input, 52, "Unity Materialを変換しています");
  let materialCount = 0;
  for (const entry of entries.filter(
    (candidate) => candidate.asset && UNITY_MATERIAL.test(candidate.path),
  )) {
    const sourceHash = await sha256AssetBytes(entry.asset!);
    const duplicate = Object.values(assets.assets).find(
      (asset) => asset.kind === "material" && asset.sourceHash === sourceHash,
    );
    if (duplicate) {
      guidToAssetId.set(entry.guid, duplicate.id);
      selectedAssetId = duplicate.id;
      continue;
    }
    const parsed = parseUnityYamlText(
      new TextDecoder().decode(entry.asset),
      entry.path,
    );
    diagnostics.push(...parsed.diagnostics);
    const materialObject = parsed.objects.find(
      (candidate) => candidate.typeName === "Material" || candidate.classId === "21",
    );
    if (!materialObject) {
      diagnostics.push({
        severity: "warning",
        code: "unity-material-unreadable",
        message: `Material「${entry.path}」のプロパティを読み取れませんでした`,
        sourcePath: entry.path,
      });
      continue;
    }
    const materialId = createDocumentId("asset-unity-material");
    const added = addDefaultMaterialAsset(assets, {
      id: materialId,
      name: asString(materialObject.data.m_Name) || displayName(entry.path),
      folderId: folderPlan.folderIdForPath(entry.path),
      properties: unityMaterialProperties(materialObject.data, guidToAssetId, assets),
    });
    if (!added.added) continue;
    const material = added.manifest.assets[materialId];
    assets = {
      ...added.manifest,
      assets: {
        ...added.manifest.assets,
        [materialId]: { ...material, sourceHash } as SceneAsset,
      },
    };
    guidToAssetId.set(entry.guid, materialId);
    selectedAssetId = materialId;
    materialCount += 1;
  }

  const yamlEntries = entries.filter(
    (entry) => entry.asset && UNITY_DOCUMENT.test(entry.path),
  );
  let scene = input.bundle.scene;
  let prefabs = { ...input.bundle.prefabs };
  let prefabCount = 0;
  let entityCount = 0;

  reportProgress(input, 68, "Scene階層とComponentを再構築しています");
  for (const entry of yamlEntries) {
    const sourceHash = await sha256AssetBytes(entry.asset!);
    const existingPrefab = Object.values(prefabs).find(
      (prefab) => prefab.importMetadata?.sourceHash === sourceHash,
    );
    if (existingPrefab) {
      const existingAsset = Object.values(assets.assets).find(
        (asset) =>
          asset.kind === "template" &&
          asset.templateType === "prefab" &&
          "prefabPath" in asset &&
          typeof asset.prefabPath === "string" &&
          asset.prefabPath.endsWith(`/${existingPrefab.prefabId}.prefab.json`),
      );
      if (existingAsset) selectedAssetId = existingAsset.id;
      diagnostics.push({
        severity: "warning",
        code: "unity-prefab-duplicate",
        message: `「${entry.path}」は変換済みPrefabを再利用しました`,
        sourcePath: entry.path,
      });
      continue;
    }

    const parsed = parseUnityYamlText(
      new TextDecoder().decode(entry.asset),
      entry.path,
    );
    diagnostics.push(...parsed.diagnostics);
    const converted = convertUnityDocument(
      parsed.objects,
      entry.path,
      scene,
      assets,
      guidToAssetId,
      /\.unity$/i.test(entry.path),
    );
    diagnostics.push(...converted.diagnostics);
    if (converted.rootEntityIds.length === 0) continue;

    scene = {
      ...scene,
      ...(converted.settings ? { settings: converted.settings } : {}),
      rootEntityIds: [...scene.rootEntityIds, ...converted.rootEntityIds],
      entities: { ...scene.entities, ...converted.entities },
    };
    const prefabId = createDocumentId("prefab-unity");
    const prefabName = displayName(entry.path);
    const created = createPrefabDocument(scene, assets, {
      prefabId,
      name: prefabName,
      sourceRootEntityIds: converted.rootEntityIds,
    });
    if (!created) {
      diagnostics.push({
        severity: "warning",
        code: "unity-prefab-create-failed",
        message: `「${entry.path}」のPrefabを作成できませんでした`,
        sourcePath: entry.path,
      });
      continue;
    }
    const prefabPath = `prefabs/${prefabId}.prefab.json`;
    const prefabAssetId = createDocumentId("asset-unity-prefab");
    const added = addPrefabAsset(assets, {
      id: prefabAssetId,
      name: prefabName,
      prefabPath,
    });
    if (!added.added) continue;
    const importMetadata: PrefabImportMetadata = {
      sourceFormat: "unity-yaml",
      sourceName,
      sourcePath: entry.path,
      sourceHash,
      componentClassCounts: converted.componentClassCounts,
      unsupportedComponentClassIds: converted.unsupportedComponentClassIds,
      csharpConversion: "not-attempted",
    };
    prefabs[prefabId] = { ...created.document, importMetadata };
    assets = added.manifest;
    selectedAssetId = prefabAssetId;
    prefabCount += 1;
    entityCount += converted.rootEntityIds.reduce(
      (total, rootId) => total + hierarchySize(converted.entities, rootId),
      0,
    );
  }

  const assetCount = assetPlans.reduce(
    (total, plan) => total + 1 + (plan.derivedAssets?.length ?? 0),
    0,
  );
  const hasUsefulResult =
    prefabCount > 0 || assetCount > 0 || materialCount > 0 || Boolean(selectedAssetId);
  if (!hasUsefulResult) {
    diagnostics.push({
      severity: "blocking",
      code: "unity-no-convertible-content",
      message:
        "GameObject階層、GLB / glTF、対応Texture、Materialのいずれも変換できませんでした",
    });
  }
  reportProgress(input, 100, hasUsefulResult ? "Unity Importの準備ができました" : "変換対象がありません");

  return {
    canCommit:
      hasUsefulResult && !diagnostics.some((diagnostic) => diagnostic.severity === "blocking"),
    sourceName,
    sourceHash,
    assetCommitBaseManifest,
    assetPlans,
    scene,
    assets,
    prefabs,
    selectedAssetId,
    diagnostics,
    result: {
      prefabCount,
      entityCount,
      assetCount,
      materialCount,
      warningCount: diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length,
    },
  };
}

async function readUnityPackage(input: Uint8Array): Promise<UnityPackageEntry[]> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("この環境はgzip展開に対応していません");
  }
  const stream = new Blob([input.buffer as ArrayBuffer])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > UNITY_PACKAGE_MAX_EXPANDED_BYTES) {
      await reader.cancel();
      throw new Error("展開後のサイズが768 MBを超えています");
    }
    chunks.push(value);
  }
  const tarBytes = new Uint8Array(total);
  let writeOffset = 0;
  for (const chunk of chunks) {
    tarBytes.set(chunk, writeOffset);
    writeOffset += chunk.byteLength;
  }
  return parseUnityPackageTar(tarBytes);
}

function parseUnityPackageTar(tarBytes: Uint8Array): UnityPackageEntry[] {
  const files = new Map<string, Uint8Array>();
  let offset = 0;
  let entryCount = 0;
  while (offset + 512 <= tarBytes.byteLength) {
    const header = tarBytes.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    entryCount += 1;
    if (entryCount > UNITY_PACKAGE_MAX_ENTRIES * 4) {
      throw new Error("tarエントリ数が上限を超えています");
    }
    const name = tarText(header.subarray(0, 100));
    const prefix = tarText(header.subarray(345, 500));
    const path = prefix ? `${prefix}/${name}` : name;
    const storedChecksum = tarOctal(header.subarray(148, 156));
    const calculatedChecksum = header.reduce(
      (sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte),
      0,
    );
    if (storedChecksum !== calculatedChecksum) {
      throw new Error(`tarヘッダーのチェックサムが一致しません: ${path || "unknown"}`);
    }
    const size = tarOctal(header.subarray(124, 136));
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    if (!Number.isSafeInteger(size) || size < 0 || dataEnd > tarBytes.byteLength) {
      throw new Error(`tarエントリが不正です: ${path || "unknown"}`);
    }
    const type = header[156];
    if ((type === 0 || type === 48) && path) {
      files.set(path.replace(/\\/g, "/"), tarBytes.slice(dataStart, dataEnd));
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }

  const grouped = new Map<string, UnityPackageEntry>();
  for (const [tarPath, content] of files) {
    const segments = tarPath.split("/").filter(Boolean);
    if (segments.length !== 2 || !UNITY_GUID.test(segments[0])) continue;
    const [guid, kind] = segments;
    const current = grouped.get(guid) ?? { guid, path: "" };
    if (kind === "pathname") {
      current.path = safeUnityLogicalPath(new TextDecoder().decode(content));
    } else if (kind === "asset") {
      current.asset = content;
    } else if (kind === "asset.meta") {
      current.meta = content;
    }
    grouped.set(guid, current);
  }
  if (grouped.size > UNITY_PACKAGE_MAX_ENTRIES) {
    throw new Error("Unityアセット数が上限を超えています");
  }
  return [...grouped.values()]
    .filter((entry) => entry.path)
    .sort((left, right) => left.path.localeCompare(right.path));
}

function tarText(bytes: Uint8Array): string {
  const zero = bytes.indexOf(0);
  return new TextDecoder("utf-8").decode(zero >= 0 ? bytes.subarray(0, zero) : bytes).trim();
}

function tarOctal(bytes: Uint8Array): number {
  const value = tarText(bytes).replace(/^0+/, "") || "0";
  if (!/^[0-7]+$/.test(value)) throw new Error("tarサイズが8進数ではありません");
  return Number.parseInt(value, 8);
}

function safeUnityLogicalPath(value: string): string {
  const normalized = value.replace(/\0/g, "").trim().replace(/\\/g, "/");
  const segments = normalized.split("/");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[a-z]:/i.test(normalized) ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("Unityパッケージに安全でないpathnameがあります");
  }
  return segments.join("/");
}

export function parseUnityYamlText(
  source: string,
  sourcePath = "Unity YAML",
): ParsedUnityDocument {
  const diagnostics: UnityImportDiagnostic[] = [];
  const normalized = source.replace(/\r\n?/g, "\n");
  const header = /^--- !u!(\d+) &(-?\d+)(?: stripped)?\s*$/gm;
  const matches = [...normalized.matchAll(header)];
  const objects: UnityYamlObject[] = [];
  if (matches.length === 0) {
    return {
      objects,
      diagnostics: [
        {
          severity: "warning",
          code: "unity-yaml-header-missing",
          message: `「${sourcePath}」はUnity text serialization形式ではありません`,
          sourcePath,
        },
      ],
    };
  }

  matches.forEach((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? normalized.length;
    const body = normalized.slice(start, end).replace(
      /(\bfileID\s*:\s*)(-?\d+)/g,
      '$1"$2"',
    );
    try {
      const document = parseDocument(body, {
        prettyErrors: false,
        strict: false,
        uniqueKeys: false,
      });
      const root = document.toJS({ maxAliasCount: 0 }) as unknown;
      if (!isRecord(root)) return;
      const [typeName, data] = Object.entries(root).find(([, value]) => isRecord(value)) ?? [];
      if (!typeName || !isRecord(data)) return;
      objects.push({
        classId: match[1],
        fileId: match[2],
        typeName,
        data,
      });
    } catch (error) {
      diagnostics.push({
        severity: "warning",
        code: "unity-yaml-document-invalid",
        message: `「${sourcePath}」のUnity object ${match[2]}を読めませんでした: ${errorMessage(error)}`,
        sourcePath,
      });
    }
  });
  return { objects, diagnostics };
}

function convertUnityDocument(
  objects: readonly UnityYamlObject[],
  sourcePath: string,
  currentScene: SceneDocument,
  assets: AssetManifest,
  guidToAssetId: ReadonlyMap<string, string>,
  applySceneSettings: boolean,
): ConvertedUnityDocument {
  const diagnostics: UnityImportDiagnostic[] = [];
  const gameObjects = objects.filter(
    (object) => object.classId === "1" || object.typeName === "GameObject",
  );
  const transforms = objects.filter(
    (object) =>
      object.classId === "4" ||
      object.classId === "224" ||
      object.typeName === "Transform" ||
      object.typeName === "RectTransform",
  );
  const transformByGameObject = new Map<string, UnityYamlObject>();
  const gameObjectByTransform = new Map<string, string>();
  for (const transform of transforms) {
    const gameObjectId = unityReference(transform.data.m_GameObject).fileId;
    if (!gameObjectId) continue;
    transformByGameObject.set(gameObjectId, transform);
    gameObjectByTransform.set(transform.fileId, gameObjectId);
  }

  const importScope = createDocumentId("unity");
  const entityIdByGameObject = new Map<string, string>();
  gameObjects.forEach((gameObject) => {
    entityIdByGameObject.set(
      gameObject.fileId,
      `${importScope}-entity-${safeIdPart(gameObject.fileId)}`,
    );
  });
  const componentsByGameObject = new Map<string, UnityYamlObject[]>();
  const componentClassCounts: Record<string, number> = {};
  for (const object of objects) {
    const gameObjectId = unityReference(object.data.m_GameObject).fileId;
    if (!gameObjectId || !entityIdByGameObject.has(gameObjectId)) continue;
    const list = componentsByGameObject.get(gameObjectId) ?? [];
    list.push(object);
    componentsByGameObject.set(gameObjectId, list);
    componentClassCounts[object.classId] = (componentClassCounts[object.classId] ?? 0) + 1;
  }

  const handledClassIds = new Set(["4", "20", "23", "33", "64", "65", "82", "108", "135", "136", "137", "224"]);
  const unsupportedComponentClassIds = Object.keys(componentClassCounts)
    .filter((classId) => !handledClassIds.has(classId))
    .sort((left, right) => Number(left) - Number(right));
  if (componentClassCounts["114"]) {
    diagnostics.push({
      severity: "warning",
      code: "unity-csharp-not-converted",
      message: `MonoBehaviour ${componentClassCounts["114"]}件は保持対象を記録し、C#からJavaScriptへの変換は行いません`,
      sourcePath,
    });
  }
  const otherUnsupported = unsupportedComponentClassIds.filter((classId) => classId !== "114");
  if (otherUnsupported.length > 0) {
    diagnostics.push({
      severity: "warning",
      code: "unity-components-unsupported",
      message: `未対応のUnity Component class ID: ${otherUnsupported.slice(0, 12).join("、")}${otherUnsupported.length > 12 ? " ほか" : ""}`,
      sourcePath,
    });
  }

  const entities: Record<string, SceneEntity> = {};
  let skippedMeshCount = 0;
  let approximatedColliderCount = 0;
  for (const gameObject of gameObjects) {
    const entityId = entityIdByGameObject.get(gameObject.fileId)!;
    const transform = transformByGameObject.get(gameObject.fileId);
    const parentTransformId = transform
      ? unityReference(transform.data.m_Father).fileId
      : undefined;
    const parentGameObjectId = parentTransformId
      ? gameObjectByTransform.get(parentTransformId)
      : undefined;
    const parentId = parentGameObjectId
      ? entityIdByGameObject.get(parentGameObjectId) ?? null
      : null;
    const components: RegisteredSceneComponent[] = [
      createTransformComponent(
        `${importScope}-transform-${safeIdPart(transform?.fileId ?? gameObject.fileId)}`,
        unityPosition(transform?.data.m_LocalPosition),
        unityRotation(transform?.data.m_LocalRotation),
        unityScale(transform?.data.m_LocalScale),
      ),
    ];
    const unityComponents = componentsByGameObject.get(gameObject.fileId) ?? [];
    const meshFilter = unityComponents.find(
      (component) => component.classId === "33" || component.typeName === "MeshFilter",
    );
    const renderer = unityComponents.find(
      (component) =>
        component.classId === "23" ||
        component.classId === "137" ||
        component.typeName === "MeshRenderer" ||
        component.typeName === "SkinnedMeshRenderer",
    );
    const meshReference = unityReference(
      renderer?.classId === "137" ? renderer.data.m_Mesh : meshFilter?.data.m_Mesh,
    );
    const geometryAssetId = unityMeshAssetId(meshReference, guidToAssetId, assets);
    if (geometryAssetId) {
      const model = getModelAsset(assets, geometryAssetId);
      const materialAssetIds = asArray(renderer?.data.m_Materials)
        .map(unityReference)
        .map((reference) => reference.guid && guidToAssetId.get(reference.guid))
        .filter((id): id is string => Boolean(id && assets.assets[id]?.kind === "material"));
      const bindings = meshMaterialBindings(model, materialAssetIds, assets);
      components.push(
        createMeshComponent(
          `${importScope}-mesh-${safeIdPart(renderer?.fileId ?? meshFilter?.fileId ?? gameObject.fileId)}`,
          geometryAssetId,
          bindings,
          {
            castShadow: unityShadowEnabled(renderer?.data.m_CastShadows, true),
            receiveShadow: unityBoolean(renderer?.data.m_ReceiveShadows, true),
          },
        ),
      );
    } else if (meshFilter || renderer?.classId === "137") {
      skippedMeshCount += 1;
    }

    for (const component of unityComponents) {
      const componentId = `${importScope}-component-${safeIdPart(component.fileId)}`;
      if (component.classId === "65") {
        const size = unityVector3(component.data.m_Size, [1, 1, 1]);
        components.push(
          createBoxColliderComponent(componentId, {
            enabled: unityBoolean(component.data.m_Enabled, true),
            isTrigger: unityBoolean(component.data.m_IsTrigger, false),
            center: unityPosition(component.data.m_Center),
            halfExtents: size.map((entry) => Math.max(Math.abs(entry) / 2, 0.0001)) as Vec3,
          }),
        );
      } else if (component.classId === "135") {
        const radius = Math.max(unityNumber(component.data.m_Radius, 0.5), 0.0001);
        components.push(
          createBoxColliderComponent(componentId, {
            enabled: unityBoolean(component.data.m_Enabled, true),
            isTrigger: unityBoolean(component.data.m_IsTrigger, false),
            center: unityPosition(component.data.m_Center),
            halfExtents: [radius, radius, radius],
          }),
        );
        approximatedColliderCount += 1;
      } else if (component.classId === "136") {
        const radius = Math.max(unityNumber(component.data.m_Radius, 0.5), 0.0001);
        const height = Math.max(unityNumber(component.data.m_Height, radius * 2), radius * 2);
        const direction = Math.round(unityNumber(component.data.m_Direction, 1));
        const extents: Vec3 = [radius, radius, radius];
        extents[Math.max(0, Math.min(2, direction))] = height / 2;
        components.push(
          createBoxColliderComponent(componentId, {
            enabled: unityBoolean(component.data.m_Enabled, true),
            isTrigger: unityBoolean(component.data.m_IsTrigger, false),
            center: unityPosition(component.data.m_Center),
            halfExtents: extents,
          }),
        );
        approximatedColliderCount += 1;
      } else if (component.classId === "64" && geometryAssetId) {
        components.push(
          createMeshColliderComponent(componentId, {
            enabled: unityBoolean(component.data.m_Enabled, true),
            isTrigger: unityBoolean(component.data.m_IsTrigger, false),
            meshMode: unityBoolean(component.data.m_Convex, false) ? "convex" : "trimesh",
          }),
        );
      } else if (component.classId === "108") {
        components.push(unityLightComponent(componentId, component.data));
      } else if (component.classId === "82") {
        components.push(unityAudioSourceComponent(componentId, component.data));
      }
    }

    entities[entityId] = {
      id: entityId,
      name: asString(gameObject.data.m_Name) || "Unity GameObject",
      parentId,
      children: [],
      enabled: unityBoolean(gameObject.data.m_IsActive, true),
      components,
    };
  }

  repairUnityHierarchy(entities, diagnostics, sourcePath);
  const rootEntityIds = Object.values(entities)
    .filter((entity) => entity.parentId === null)
    .map((entity) => entity.id);
  if (skippedMeshCount > 0) {
    diagnostics.push({
      severity: "warning",
      code: "unity-mesh-source-unsupported",
      message: `${skippedMeshCount}件のMesh Rendererは対応モデルを解決できず、GameObject階層のみ再構築しました`,
      sourcePath,
    });
  }
  if (approximatedColliderCount > 0) {
    diagnostics.push({
      severity: "warning",
      code: "unity-collider-approximated",
      message: `Sphere / Capsule Collider ${approximatedColliderCount}件をBox Colliderで近似しました`,
      sourcePath,
    });
  }
  if (gameObjects.length === 0) {
    diagnostics.push({
      severity: "warning",
      code: "unity-gameobjects-missing",
      message: `「${sourcePath}」に再構築できるGameObjectがありません`,
      sourcePath,
    });
  }

  return {
    entities,
    rootEntityIds,
    ...(applySceneSettings
      ? { settings: unitySceneSettings(objects, currentScene.settings) }
      : {}),
    componentClassCounts,
    unsupportedComponentClassIds,
    diagnostics,
  };
}

function repairUnityHierarchy(
  entities: Record<string, SceneEntity>,
  diagnostics: UnityImportDiagnostic[],
  sourcePath: string,
): void {
  for (const entity of Object.values(entities)) {
    if (entity.parentId && !entities[entity.parentId]) entity.parentId = null;
  }
  for (const entity of Object.values(entities)) {
    const visited = new Set([entity.id]);
    let parentId = entity.parentId;
    while (parentId) {
      if (visited.has(parentId)) {
        entity.parentId = null;
        diagnostics.push({
          severity: "warning",
          code: "unity-hierarchy-cycle",
          message: `「${entity.name}」の循環した親参照をScene Rootへ戻しました`,
          sourcePath,
        });
        break;
      }
      visited.add(parentId);
      parentId = entities[parentId]?.parentId ?? null;
    }
  }
  Object.values(entities).forEach((entity) => {
    entity.children = [];
  });
  for (const entity of Object.values(entities)) {
    if (entity.parentId) entities[entity.parentId]?.children.push(entity.id);
  }
}

function unityMeshAssetId(
  reference: ReturnType<typeof unityReference>,
  guidToAssetId: ReadonlyMap<string, string>,
  assets: AssetManifest,
): string | undefined {
  if (reference.guid) {
    const assetId = guidToAssetId.get(reference.guid);
    if (
      assetId &&
      (assets.assets[assetId]?.kind === "model" || assets.assets[assetId]?.kind === "primitive")
    ) {
      return assetId;
    }
  }
  const builtin: Record<string, string> = {
    "10202": BUILTIN_ASSET_IDS.geometry.box,
    "10206": BUILTIN_ASSET_IDS.geometry.cylinder,
    "10207": BUILTIN_ASSET_IDS.geometry.sphere,
    "10208": BUILTIN_ASSET_IDS.geometry.cylinder,
    "10209": BUILTIN_ASSET_IDS.geometry.plane,
    "10210": BUILTIN_ASSET_IDS.geometry.plane,
  };
  return reference.fileId ? builtin[reference.fileId] : undefined;
}

function meshMaterialBindings(
  model: ModelAsset | undefined,
  materialAssetIds: readonly string[],
  assets: AssetManifest,
): Array<{ slot: string; materialAssetId: string }> {
  const fallback = BUILTIN_ASSET_IDS.material.slate;
  if (model?.materialSlots.length) {
    return model.materialSlots.map((slot, index) => ({
      slot: slot.slot,
      materialAssetId:
        materialAssetIds[index] ?? slot.defaultMaterialAssetId ?? fallback,
    }));
  }
  const materialAssetId =
    materialAssetIds.find((id) => assets.assets[id]?.kind === "material") ?? fallback;
  return [{ slot: "default", materialAssetId }];
}

function unityLightComponent(id: string, data: Record<string, unknown>): LightComponent {
  const unityType = Math.round(unityNumber(data.m_Type, 2));
  const lightType: LightComponent["lightType"] =
    unityType === 0
      ? "spot"
      : unityType === 1
        ? "directional"
        : unityType === 3 || unityType === 4 || unityType === 5
          ? "rectArea"
          : "point";
  const range = Math.max(unityNumber(data.m_Range, 10), 0);
  return {
    id,
    type: "light",
    enabled: unityBoolean(data.m_Enabled, true),
    lightType,
    color: unityColorHex(data.m_Color, "#ffffff"),
    intensity: Math.max(unityNumber(data.m_Intensity, 1), 0),
    castShadow: unityNumber(asRecord(data.m_Shadows)?.m_Type, 0) > 0,
    ...(lightType === "point" || lightType === "spot"
      ? { distance: range, decay: 2 }
      : {}),
    ...(lightType === "spot"
      ? {
          angle: Math.max(0.001, (unityNumber(data.m_SpotAngle, 30) * Math.PI) / 360),
          penumbra: 0.1,
        }
      : {}),
    ...(lightType === "rectArea"
      ? {
          width: Math.max(unityNumber(asRecord(data.m_AreaSize)?.x, 1), 0.001),
          height: Math.max(unityNumber(asRecord(data.m_AreaSize)?.y, 1), 0.001),
        }
      : {}),
  };
}

function unityAudioSourceComponent(
  id: string,
  data: Record<string, unknown>,
): AudioSourceComponent {
  return {
    id,
    type: "audio-source",
    enabled: unityBoolean(data.m_Enabled, true),
    sourceUrl: "",
    volume: clamp(unityNumber(data.m_Volume, 1), 0, 1),
    loop: unityBoolean(data.Loop ?? data.m_Loop, false),
    autoplay: unityBoolean(data.PlayOnAwake ?? data.m_PlayOnAwake, true),
    spatial: unityNumber(data.m_SpatialBlend, 0) > 0,
    refDistance: Math.max(unityNumber(data.m_MinDistance, 1), 0.0001),
    rolloffFactor: 1,
    maxDistance: Math.max(unityNumber(data.m_MaxDistance, 500), 0.0001),
  };
}

function unitySceneSettings(
  objects: readonly UnityYamlObject[],
  current: SceneDocument["settings"],
): SceneSettings {
  const settings = resolveSceneSettings(current);
  const renderSettings = objects.find(
    (object) => object.classId === "104" || object.typeName === "RenderSettings",
  )?.data;
  const camera = objects.find(
    (object) => object.classId === "20" || object.typeName === "Camera",
  )?.data;
  if (!renderSettings && !camera) return settings;
  const cameraNear = camera
    ? Math.max(
        unityNumber(
          camera.near_clip_plane,
          unityNumber(camera.m_NearClipPlane, settings.camera.near),
        ),
        0.0001,
      )
    : settings.camera.near;
  const cameraFar = camera
    ? Math.max(
        unityNumber(
          camera.far_clip_plane,
          unityNumber(camera.m_FarClipPlane, settings.camera.far),
        ),
        cameraNear + 0.0001,
      )
    : settings.camera.far;
  return {
    ...settings,
    fog: renderSettings
      ? {
          ...settings.fog,
          enabled: unityBoolean(renderSettings.m_Fog, settings.fog.enabled),
          color: unityColorHex(renderSettings.m_FogColor, settings.fog.color),
          near: Math.max(unityNumber(renderSettings.m_LinearFogStart, settings.fog.near), 0),
          far: Math.max(
            unityNumber(renderSettings.m_LinearFogEnd, settings.fog.far),
            unityNumber(renderSettings.m_LinearFogStart, settings.fog.near) + 0.001,
          ),
        }
      : settings.fog,
    ambient: renderSettings
      ? {
          color: unityColorHex(renderSettings.m_AmbientSkyColor, settings.ambient.color),
          intensity: Math.max(
            unityNumber(renderSettings.m_AmbientIntensity, settings.ambient.intensity),
            0,
          ),
        }
      : settings.ambient,
    camera: camera
      ? {
          near: cameraNear,
          far: cameraFar,
          fov: clamp(unityNumber(camera.field_of_view, unityNumber(camera.m_FieldOfView, settings.camera.fov)), 1, 179),
        }
      : settings.camera,
  };
}

function unityMaterialProperties(
  data: Record<string, unknown>,
  guidToAssetId: ReadonlyMap<string, string>,
  assets: AssetManifest,
): MaterialAssetPatch {
  const saved = asRecord(data.m_SavedProperties) ?? {};
  const colorValue =
    unitySavedProperty(saved.m_Colors, ["_BaseColor", "_Color"]) ??
    data.m_Color;
  const color = unityColor(colorValue, [1, 1, 1, 1]);
  const metallic = clamp(
    unityNumber(unitySavedProperty(saved.m_Floats, ["_Metallic"]), 0),
    0,
    1,
  );
  const smoothness = clamp(
    unityNumber(
      unitySavedProperty(saved.m_Floats, ["_Smoothness", "_Glossiness"]),
      0.5,
    ),
    0,
    1,
  );
  const cutoff = clamp(
    unityNumber(unitySavedProperty(saved.m_Floats, ["_Cutoff"]), 0.5),
    0,
    1,
  );
  const mainTexture = unityTextureAssetId(
    unitySavedProperty(saved.m_TexEnvs, ["_BaseMap", "_MainTex"]),
    guidToAssetId,
    assets,
  );
  const normalTexture = unityTextureAssetId(
    unitySavedProperty(saved.m_TexEnvs, ["_BumpMap"]),
    guidToAssetId,
    assets,
  );
  const emissionColor = unityColor(
    unitySavedProperty(saved.m_Colors, ["_EmissionColor"]),
    [0, 0, 0, 1],
  );
  const emissionTexture = unityTextureAssetId(
    unitySavedProperty(saved.m_TexEnvs, ["_EmissionMap"]),
    guidToAssetId,
    assets,
  );
  const renderType = asString(data.stringTagMap && asRecord(data.stringTagMap)?.RenderType);
  const transparent = color[3] < 0.999 || /transparent/i.test(renderType);
  const cutout = /cutout/i.test(renderType);
  return {
    pbrMetallicRoughness: {
      baseColorFactor: color,
      metallicFactor: metallic,
      roughnessFactor: 1 - smoothness,
      ...(mainTexture ? { baseColorTexture: mainTexture } : {}),
    },
    ...(normalTexture ? { normalTexture } : {}),
    emissiveFactor: [emissionColor[0], emissionColor[1], emissionColor[2]],
    ...(emissionTexture ? { emissiveTexture: emissionTexture } : {}),
    alphaMode: transparent ? "BLEND" : cutout ? "MASK" : "OPAQUE",
    alphaCutoff: cutoff,
    doubleSided: unityNumber(unitySavedProperty(saved.m_Floats, ["_Cull"]), 2) === 0,
  };
}

function unitySavedProperty(
  collection: unknown,
  propertyNames: readonly string[],
): unknown {
  for (const entry of asArray(collection)) {
    if (!isRecord(entry)) continue;
    for (const propertyName of propertyNames) {
      if (propertyName in entry) return entry[propertyName];
    }
  }
  return undefined;
}

function unityTextureAssetId(
  value: unknown,
  guidToAssetId: ReadonlyMap<string, string>,
  assets: AssetManifest,
): string | undefined {
  const textureEnvironment = asRecord(value);
  const reference = unityReference(textureEnvironment?.m_Texture ?? value);
  const assetId = reference.guid ? guidToAssetId.get(reference.guid) : undefined;
  return assetId && assets.assets[assetId]?.kind === "texture" ? assetId : undefined;
}

type UnityFolderPlan = {
  folders: Record<string, AssetFolder>;
  folderIdForPath: (path: string) => string | null;
};

function createUnityFolderPlan(
  manifest: AssetManifest,
  sourceName: string,
  paths: readonly string[],
  requestedParentId: string | null,
): UnityFolderPlan {
  const folders = { ...(manifest.folders ?? {}) };
  const parentId = requestedParentId && folders[requestedParentId]
    ? requestedParentId
    : null;
  const rootId = createDocumentId("folder-unity");
  folders[rootId] = {
    id: rootId,
    name: `${displayName(sourceName)} (Unity)`,
    parentId,
    order: nextFolderOrder(folders, parentId),
  };
  const idsByPath = new Map<string, string>([["", rootId]]);
  for (const path of paths) {
    const directory = unityDirectory(path);
    const segments = directory ? directory.split("/") : [];
    let logical = "";
    let currentParentId = rootId;
    for (const segment of segments) {
      logical = logical ? `${logical}/${segment}` : segment;
      const existing = idsByPath.get(logical);
      if (existing) {
        currentParentId = existing;
        continue;
      }
      const id = createDocumentId("folder-unity-path");
      folders[id] = {
        id,
        name: segment,
        parentId: currentParentId,
        order: nextFolderOrder(folders, currentParentId),
      };
      idsByPath.set(logical, id);
      currentParentId = id;
    }
  }
  return {
    folders,
    folderIdForPath: (path) => idsByPath.get(unityDirectory(path)) ?? rootId,
  };
}

function unityDirectory(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  if (/^(assets|packages)$/i.test(segments[0] ?? "")) segments.shift();
  segments.pop();
  return segments.join("/");
}

function nextFolderOrder(
  folders: Readonly<Record<string, AssetFolder>>,
  parentId: string | null,
): number {
  return (
    Math.max(
      -1,
      ...Object.values(folders)
        .filter((folder) => folder.parentId === parentId)
        .map((folder) => folder.order),
    ) + 1
  );
}

function countUnsupportedAssetExtensions(
  entries: readonly UnityPackageEntry[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (!entry.asset || SUPPORTED_PACKAGE_ASSET.test(entry.path)) continue;
    if (UNITY_DOCUMENT.test(entry.path) || UNITY_MATERIAL.test(entry.path)) continue;
    const extension = extensionOf(entry.path);
    if (!["fbx", "dae", "blend", "wav", "mp3", "ogg", "tga", "psd"].includes(extension)) {
      continue;
    }
    const label = `.${extension}`;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return counts;
}

function unityPosition(value: unknown): Vec3 {
  const [x, y, z] = unityVector3(value, [0, 0, 0]);
  return [x, y, -z];
}

function unityScale(value: unknown): Vec3 {
  const scale = unityVector3(value, [1, 1, 1]);
  return scale.map((entry) => (Math.abs(entry) < 0.0001 ? 0.0001 : entry)) as Vec3;
}

function unityRotation(value: unknown): Vec3 {
  const rotation = asRecord(value);
  if (!rotation) return [0, 0, 0];
  const quaternion = new Quaternion(
    -unityNumber(rotation.x, 0),
    -unityNumber(rotation.y, 0),
    unityNumber(rotation.z, 0),
    unityNumber(rotation.w, 1),
  );
  if (quaternion.lengthSq() < 0.000001) return [0, 0, 0];
  quaternion.normalize();
  const euler = new Euler().setFromQuaternion(quaternion, "XYZ");
  return [euler.x, euler.y, euler.z];
}

function unityVector3(value: unknown, fallback: Vec3): Vec3 {
  const vector = asRecord(value);
  if (!vector) return [...fallback];
  return [
    unityNumber(vector.x, fallback[0]),
    unityNumber(vector.y, fallback[1]),
    unityNumber(vector.z, fallback[2]),
  ];
}

function unityColor(value: unknown, fallback: [number, number, number, number]): [number, number, number, number] {
  const color = asRecord(value);
  if (!color) return [...fallback];
  return [
    clamp(unityNumber(color.r, fallback[0]), 0, 1),
    clamp(unityNumber(color.g, fallback[1]), 0, 1),
    clamp(unityNumber(color.b, fallback[2]), 0, 1),
    clamp(unityNumber(color.a, fallback[3]), 0, 1),
  ];
}

function unityColorHex(value: unknown, fallback: string): string {
  const [r, g, b] = unityColor(value, hexToColor(fallback));
  return `#${[r, g, b]
    .map((channel) => Math.round(channel * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

function hexToColor(value: string): [number, number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match) return [1, 1, 1, 1];
  return [
    Number.parseInt(match[1].slice(0, 2), 16) / 255,
    Number.parseInt(match[1].slice(2, 4), 16) / 255,
    Number.parseInt(match[1].slice(4, 6), 16) / 255,
    1,
  ];
}

function unityReference(value: unknown): { fileId?: string; guid?: string } {
  const reference = asRecord(value);
  if (!reference) return {};
  const fileId = asString(reference.fileID);
  const rawGuid = asString(reference.guid).toLowerCase();
  const guid = UNITY_GUID.test(rawGuid) && !/^0+$/.test(rawGuid) ? rawGuid : undefined;
  return {
    ...(fileId && fileId !== "0" ? { fileId } : {}),
    ...(guid ? { guid } : {}),
  };
}

function unityShadowEnabled(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return unityNumber(value, fallback ? 1 : 0) !== 0;
}

function unityBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    if (value === "1" || value.toLowerCase() === "true") return true;
    if (value === "0" || value.toLowerCase() === "false") return false;
  }
  return fallback;
}

function unityNumber(value: unknown, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function asString(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hierarchySize(entities: Record<string, SceneEntity>, rootId: string): number {
  const visited = new Set<string>();
  const pending = [rootId];
  while (pending.length > 0) {
    const id = pending.pop()!;
    if (visited.has(id)) continue;
    const entity = entities[id];
    if (!entity) continue;
    visited.add(id);
    pending.push(...entity.children);
  }
  return visited.size;
}

function mimeTypeForPath(path: string): string {
  switch (extensionOf(path)) {
    case "glb":
      return "model/gltf-binary";
    case "gltf":
      return "model/gltf+json";
    case "obj":
      return "model/obj";
    case "vrm":
      return "model/vrm";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "ktx2":
      return "image/ktx2";
    default:
      return "application/octet-stream";
  }
}

function extensionOf(path: string): string {
  const leaf = leafName(path);
  const index = leaf.lastIndexOf(".");
  return index >= 0 ? leaf.slice(index + 1).toLowerCase() : "";
}

function leafName(path: string): string {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "";
}

function displayName(path: string): string {
  const leaf = leafName(path);
  return leaf.replace(/\.[^.]+$/, "") || leaf || "Unity Import";
}

function safeIdPart(value: string): string {
  return value.replace(/[^a-z0-9_-]/gi, "_").slice(0, 80) || "0";
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function ownedBytes(input: ArrayBuffer | Uint8Array): Uint8Array {
  const source = input instanceof Uint8Array ? input : new Uint8Array(input);
  const result = new Uint8Array(source.byteLength);
  result.set(source);
  return result;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function reportProgress(
  input: CreateUnityPackageImportPlanInput,
  progress: number,
  message: string,
): void {
  try {
    input.onProgress?.(progress, message);
  } catch {
    // Rendering progress cannot change a validated conversion plan.
  }
}

function blockedUnityPlan(
  input: CreateUnityPackageImportPlanInput,
  sourceName: string,
  diagnostics: UnityImportDiagnostic[],
): UnityPackageImportPlan {
  return {
    canCommit: false,
    sourceName,
    sourceHash: "",
    assetCommitBaseManifest: input.bundle.assets,
    assetPlans: [],
    scene: input.bundle.scene,
    assets: input.bundle.assets,
    prefabs: input.bundle.prefabs,
    diagnostics,
    result: {
      prefabCount: 0,
      entityCount: 0,
      assetCount: 0,
      materialCount: 0,
      warningCount: diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length,
    },
  };
}
