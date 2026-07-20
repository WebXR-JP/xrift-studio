import {
  ASSET_MANIFEST_SCHEMA_VERSION,
  isValidAssetFolderName,
  normalizeMaterialProperties,
  type AssetManifest,
} from "./asset-manifest";
import { normalizeParticleProperties } from "./particle-system";
import {
  PREFAB_DOCUMENT_SCHEMA_VERSION,
  type PrefabDocument,
} from "./prefab-document";
import {
  VISUAL_PROJECT_SCHEMA_VERSION,
  type VisualProjectDocument,
  type VisualProjectKind,
} from "./project-document";
import {
  COLLIDER_FIT_MODES,
  COLLIDER_MESH_MODES,
  SCENE_DOCUMENT_SCHEMA_VERSION,
  type SceneDocument,
} from "./scene-document";

export type DocumentValidationIssue = {
  path: string;
  code: string;
  message: string;
};

export type ParseDocumentResult<Document> =
  | { ok: true; document: Document; issues: [] }
  | { ok: false; issues: DocumentValidationIssue[] };

export type VisualDocumentCodec<Document> = {
  serialize(document: Document): string;
  parse(json: string): ParseDocumentResult<Document>;
};

export const assetManifestCodec: VisualDocumentCodec<AssetManifest> = {
  serialize: stableSerializeJson,
  parse: parseAssetManifestJson,
};

export const sceneDocumentCodec: VisualDocumentCodec<SceneDocument> = {
  serialize: stableSerializeJson,
  parse: (json) => parseTypedDocument(json, validateSceneDocument),
};

export const prefabDocumentCodec: VisualDocumentCodec<PrefabDocument> = {
  serialize: stableSerializeJson,
  parse: (json) => parseTypedDocument(json, validatePrefabDocument),
};

export const visualProjectDocumentCodec: VisualDocumentCodec<VisualProjectDocument> = {
  serialize: stableSerializeJson,
  parse: (json) => parseTypedDocument(json, validateVisualProjectDocument),
};

export function stableSerializeJson(value: unknown): string {
  return `${JSON.stringify(sortJsonValue(value), null, 2)}\n`;
}

export function parseAssetManifestJson(
  json: string,
): ParseDocumentResult<AssetManifest> {
  const parsed = parseJson(json);
  if (!parsed.ok) return parsed;
  const issues = validateAssetManifest(parsed.value);
  if (issues.length > 0) return { ok: false, issues };

  const manifest = parsed.value as AssetManifest;
  const assets = Object.fromEntries(
    Object.entries(manifest.assets).map(([id, asset]) => [
      id,
      asset.kind === "material"
        ? {
            ...asset,
            properties: normalizeMaterialProperties(
              asset.properties as unknown as Parameters<
                typeof normalizeMaterialProperties
              >[0],
            ),
          }
        : asset.kind === "particle"
          ? {
              ...asset,
              properties: normalizeParticleProperties(asset.properties),
            }
          : asset,
    ]),
  );
  return { ok: true, document: { ...manifest, assets }, issues: [] };
}

export function validateAssetManifest(value: unknown): DocumentValidationIssue[] {
  const issues: DocumentValidationIssue[] = [];
  if (!isRecord(value)) {
    return [issue("$", "type", "AssetManifest must be an object")];
  }
  if (value.schemaVersion !== ASSET_MANIFEST_SCHEMA_VERSION) {
    issues.push(issue("$.schemaVersion", "schema-version", "Unsupported AssetManifest schema"));
  }
  if (!isRecord(value.assets)) {
    issues.push(issue("$.assets", "type", "assets must be a record"));
    return issues;
  }
  if (value.folders !== undefined && !isRecord(value.folders)) {
    issues.push(issue("$.folders", "type", "folders must be a record"));
  }

  const folderIds = new Set(Object.keys(isRecord(value.folders) ? value.folders : {}));
  if (isRecord(value.folders)) {
    for (const [id, candidate] of Object.entries(value.folders)) {
      const path = `$.folders.${id}`;
      if (!isRecord(candidate)) {
        issues.push(issue(path, "type", "folder must be an object"));
        continue;
      }
      if (candidate.id !== id || !isValidAssetFolderName(candidate.name)) {
        issues.push(issue(path, "folder", "folder id/name is invalid"));
      }
      if (
        candidate.parentId !== null &&
        (typeof candidate.parentId !== "string" || !folderIds.has(candidate.parentId))
      ) {
        issues.push(issue(`${path}.parentId`, "reference", "parent folder is missing"));
      }
      if (!Number.isInteger(candidate.order) || Number(candidate.order) < 0) {
        issues.push(issue(`${path}.order`, "range", "folder order must be a non-negative integer"));
      }
    }
  }

  const validKinds = new Set([
    "primitive",
    "model",
    "material",
    "texture",
    "particle",
    "template",
  ]);
  const prefabPaths = new Map<string, string>();
  const projectSourcePaths = new Map<string, string[]>();
  for (const [id, candidate] of Object.entries(value.assets)) {
    const path = `$.assets.${id}`;
    if (!isRecord(candidate)) {
      issues.push(issue(path, "type", "asset must be an object"));
      continue;
    }
    if (candidate.id !== id || typeof candidate.name !== "string" || !candidate.name.trim()) {
      issues.push(issue(path, "asset", "asset id/name is invalid"));
    }
    if (!validKinds.has(String(candidate.kind))) {
      issues.push(issue(`${path}.kind`, "enum", "unknown asset kind"));
    }
    if (candidate.kind === "material") {
      validateMaterialAsset(candidate, path, value.assets, issues);
    }
    if (
      candidate.folderId !== undefined &&
      candidate.folderId !== null &&
      (typeof candidate.folderId !== "string" || !folderIds.has(candidate.folderId))
    ) {
      issues.push(issue(`${path}.folderId`, "reference", "asset folder is missing"));
    }
    if (isRecord(candidate.source) && candidate.source.kind === "project") {
      if (typeof candidate.source.relativePath !== "string") {
        issues.push(issue(`${path}.source.relativePath`, "path", "project asset path is required"));
      } else {
        const owners = projectSourcePaths.get(candidate.source.relativePath) ?? [];
        projectSourcePaths.set(candidate.source.relativePath, [...owners, id]);
      }
    }

    const isPrefab = candidate.templateType === "prefab" || "prefabPath" in candidate;
    if (isPrefab) {
      const prefabPath = candidate.prefabPath;
      if (
        candidate.kind !== "template" ||
        candidate.templateType !== "prefab" ||
        typeof prefabPath !== "string" ||
        !isPrefabDocumentPath(prefabPath) ||
        candidate.templatePath !== prefabPath ||
        !isRecord(candidate.source) ||
        candidate.source.kind !== "project" ||
        candidate.source.relativePath !== prefabPath
      ) {
        issues.push(
          issue(
            path,
            "prefab-asset",
            "Prefab asset paths must agree and stay under prefabs/**.prefab.json",
          ),
        );
      } else if (prefabPaths.has(prefabPath)) {
        issues.push(issue(`${path}.prefabPath`, "duplicate", "Prefab path is already used"));
      } else {
        prefabPaths.set(prefabPath, id);
      }
    }
  }
  for (const [prefabPath, assetId] of prefabPaths) {
    const owners = projectSourcePaths.get(prefabPath) ?? [];
    if (owners.length !== 1 || owners[0] !== assetId) {
      issues.push(
        issue(
          `$.assets.${assetId}.prefabPath`,
          "collision",
          "Prefab path is also used by another manifest asset",
        ),
      );
    }
  }
  return issues;
}

const SUPPORTED_MATERIAL_EXTENSIONS = new Set([
  "KHR_materials_anisotropy",
  "KHR_materials_clearcoat",
  "KHR_materials_dispersion",
  "KHR_materials_emissive_strength",
  "KHR_materials_ior",
  "KHR_materials_iridescence",
  "KHR_materials_sheen",
  "KHR_materials_specular",
  "KHR_materials_transmission",
  "KHR_materials_unlit",
  "KHR_materials_volume",
]);

function validateMaterialAsset(
  asset: Record<string, unknown>,
  path: string,
  assets: Record<string, unknown>,
  issues: DocumentValidationIssue[],
): void {
  if (!isRecord(asset.properties)) {
    issues.push(issue(`${path}.properties`, "type", "material properties must be an object"));
    return;
  }
  const properties = asset.properties;
  if (properties.extensions === undefined) return;
  if (!isRecord(properties.extensions)) {
    issues.push(
      issue(`${path}.properties.extensions`, "type", "material extensions must be an object"),
    );
    return;
  }

  const extensions = properties.extensions;
  const extensionNames = Object.keys(extensions);
  for (const extensionName of extensionNames) {
    const extensionPath = `${path}.properties.extensions.${extensionName}`;
    if (!SUPPORTED_MATERIAL_EXTENSIONS.has(extensionName)) {
      issues.push(
        issue(
          extensionPath,
          "unsupported-extension",
          `Material extension is not supported by this editor: ${extensionName}`,
        ),
      );
      continue;
    }
    const extension = extensions[extensionName];
    if (!isRecord(extension)) {
      issues.push(issue(extensionPath, "type", "material extension must be an object"));
      continue;
    }
    validateMaterialExtension(
      extensionName,
      extension,
      extensionPath,
      assets,
      issues,
    );
  }

  if (
    "KHR_materials_unlit" in extensions &&
    extensionNames.some((name) => name !== "KHR_materials_unlit")
  ) {
    issues.push(
      issue(
        `${path}.properties.extensions.KHR_materials_unlit`,
        "extension-conflict",
        "KHR_materials_unlit cannot be combined with lighting material extensions",
      ),
    );
  }
  if (
    "KHR_materials_volume" in extensions &&
    !("KHR_materials_transmission" in extensions)
  ) {
    issues.push(
      issue(
        `${path}.properties.extensions.KHR_materials_volume`,
        "extension-dependency",
        "KHR_materials_volume requires KHR_materials_transmission",
      ),
    );
  }
  if (
    "KHR_materials_dispersion" in extensions &&
    !("KHR_materials_volume" in extensions)
  ) {
    issues.push(
      issue(
        `${path}.properties.extensions.KHR_materials_dispersion`,
        "extension-dependency",
        "KHR_materials_dispersion requires KHR_materials_volume",
      ),
    );
  }
}

function validateMaterialExtension(
  extensionName: string,
  extension: Record<string, unknown>,
  path: string,
  assets: Record<string, unknown>,
  issues: DocumentValidationIssue[],
): void {
  const texture = (key: string, normal = false) =>
    validateMaterialTextureInfo(
      extension[key],
      `${path}.${key}`,
      assets,
      issues,
      normal,
    );
  const unit = (key: string) =>
    validateOptionalNumber(extension, key, path, issues, isUnitNumber, "from 0 to 1");
  const nonNegative = (key: string) =>
    validateOptionalNumber(
      extension,
      key,
      path,
      issues,
      isNonNegativeNumber,
      "a finite non-negative number",
    );

  switch (extensionName) {
    case "KHR_materials_anisotropy":
      validateKnownKeys(
        extension,
        ["anisotropyStrength", "anisotropyRotation", "anisotropyTexture"],
        path,
        issues,
      );
      unit("anisotropyStrength");
      validateOptionalNumber(
        extension,
        "anisotropyRotation",
        path,
        issues,
        isFiniteNumber,
        "a finite number in radians",
      );
      texture("anisotropyTexture");
      break;
    case "KHR_materials_clearcoat":
      validateKnownKeys(
        extension,
        [
          "clearcoatFactor",
          "clearcoatTexture",
          "clearcoatRoughnessFactor",
          "clearcoatRoughnessTexture",
          "clearcoatNormalTexture",
        ],
        path,
        issues,
      );
      unit("clearcoatFactor");
      unit("clearcoatRoughnessFactor");
      texture("clearcoatTexture");
      texture("clearcoatRoughnessTexture");
      texture("clearcoatNormalTexture", true);
      break;
    case "KHR_materials_dispersion":
      validateKnownKeys(extension, ["dispersion"], path, issues);
      nonNegative("dispersion");
      break;
    case "KHR_materials_emissive_strength":
      validateKnownKeys(extension, ["emissiveStrength"], path, issues);
      nonNegative("emissiveStrength");
      break;
    case "KHR_materials_ior":
      validateKnownKeys(extension, ["ior"], path, issues);
      validateOptionalNumber(
        extension,
        "ior",
        path,
        issues,
        (value) => isFiniteNumber(value) && (value === 0 || value >= 1),
        "0 or a finite number greater than or equal to 1",
      );
      break;
    case "KHR_materials_iridescence": {
      validateKnownKeys(
        extension,
        [
          "iridescenceFactor",
          "iridescenceTexture",
          "iridescenceIor",
          "iridescenceThicknessMinimum",
          "iridescenceThicknessMaximum",
          "iridescenceThicknessTexture",
        ],
        path,
        issues,
      );
      unit("iridescenceFactor");
      validateOptionalNumber(
        extension,
        "iridescenceIor",
        path,
        issues,
        (value) => isFiniteNumber(value) && value >= 1,
        "a finite number greater than or equal to 1",
      );
      nonNegative("iridescenceThicknessMinimum");
      nonNegative("iridescenceThicknessMaximum");
      const minimum = extension.iridescenceThicknessMinimum;
      const maximum = extension.iridescenceThicknessMaximum;
      if (
        isNonNegativeNumber(minimum) &&
        isNonNegativeNumber(maximum) &&
        maximum < minimum
      ) {
        issues.push(
          issue(
            `${path}.iridescenceThicknessMaximum`,
            "range",
            "iridescence thickness maximum must not be below its minimum",
          ),
        );
      }
      texture("iridescenceTexture");
      texture("iridescenceThicknessTexture");
      break;
    }
    case "KHR_materials_sheen":
      validateKnownKeys(
        extension,
        [
          "sheenColorFactor",
          "sheenColorTexture",
          "sheenRoughnessFactor",
          "sheenRoughnessTexture",
        ],
        path,
        issues,
      );
      validateOptionalColor3(
        extension,
        "sheenColorFactor",
        path,
        issues,
        isUnitColor3,
        "three numbers from 0 to 1",
      );
      unit("sheenRoughnessFactor");
      texture("sheenColorTexture");
      texture("sheenRoughnessTexture");
      break;
    case "KHR_materials_specular":
      validateKnownKeys(
        extension,
        [
          "specularFactor",
          "specularTexture",
          "specularColorFactor",
          "specularColorTexture",
        ],
        path,
        issues,
      );
      unit("specularFactor");
      validateOptionalColor3(
        extension,
        "specularColorFactor",
        path,
        issues,
        isNonNegativeColor3,
        "three finite non-negative numbers",
      );
      texture("specularTexture");
      texture("specularColorTexture");
      break;
    case "KHR_materials_transmission":
      validateKnownKeys(
        extension,
        ["transmissionFactor", "transmissionTexture"],
        path,
        issues,
      );
      unit("transmissionFactor");
      texture("transmissionTexture");
      break;
    case "KHR_materials_unlit":
      validateKnownKeys(extension, [], path, issues);
      break;
    case "KHR_materials_volume":
      validateKnownKeys(
        extension,
        [
          "thicknessFactor",
          "thicknessTexture",
          "attenuationDistance",
          "attenuationColor",
        ],
        path,
        issues,
      );
      nonNegative("thicknessFactor");
      validateOptionalNumber(
        extension,
        "attenuationDistance",
        path,
        issues,
        (value) => isFiniteNumber(value) && value > 0,
        "a finite number greater than 0, or omitted for infinity",
      );
      validateOptionalColor3(
        extension,
        "attenuationColor",
        path,
        issues,
        isUnitColor3,
        "three numbers from 0 to 1",
      );
      texture("thicknessTexture");
      break;
  }
}

function validateKnownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  issues: DocumentValidationIssue[],
): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      issues.push(
        issue(
          `${path}.${key}`,
          "unsupported-property",
          `Material extension property is not supported: ${key}`,
        ),
      );
    }
  }
}

function validateOptionalNumber(
  value: Record<string, unknown>,
  key: string,
  path: string,
  issues: DocumentValidationIssue[],
  predicate: (value: unknown) => boolean,
  expected: string,
): void {
  if (!(key in value)) return;
  if (!predicate(value[key])) {
    issues.push(issue(`${path}.${key}`, "range", `${key} must be ${expected}`));
  }
}

function validateOptionalColor3(
  value: Record<string, unknown>,
  key: string,
  path: string,
  issues: DocumentValidationIssue[],
  predicate: (value: unknown) => boolean,
  expected: string,
): void {
  if (!(key in value)) return;
  if (!predicate(value[key])) {
    issues.push(issue(`${path}.${key}`, "range", `${key} must contain ${expected}`));
  }
}

function validateMaterialTextureInfo(
  value: unknown,
  path: string,
  assets: Record<string, unknown>,
  issues: DocumentValidationIssue[],
  normal: boolean,
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    issues.push(issue(path, "type", "texture info must be an object"));
    return;
  }
  validateKnownKeys(
    value,
    normal ? ["textureAssetId", "texCoord", "scale"] : ["textureAssetId", "texCoord"],
    path,
    issues,
  );
  if (typeof value.textureAssetId !== "string" || !value.textureAssetId.trim()) {
    issues.push(issue(`${path}.textureAssetId`, "reference", "texture asset id is required"));
  } else {
    const referenced = assets[value.textureAssetId];
    if (!isRecord(referenced) || referenced.kind !== "texture") {
      issues.push(
        issue(`${path}.textureAssetId`, "reference", "referenced texture asset is missing"),
      );
    }
  }
  if (!Number.isInteger(value.texCoord) || Number(value.texCoord) < 0) {
    issues.push(
      issue(`${path}.texCoord`, "range", "texture coordinate must be a non-negative integer"),
    );
  }
  if (normal && !isFiniteNumber(value.scale)) {
    issues.push(issue(`${path}.scale`, "range", "normal texture scale must be finite"));
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isUnitNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isUnitColor3(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every(isUnitNumber);
}

function isNonNegativeColor3(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(isNonNegativeNumber)
  );
}

export function validateSceneDocument(value: unknown): DocumentValidationIssue[] {
  const issues = validateEntityDocument(
    value,
    SCENE_DOCUMENT_SCHEMA_VERSION,
    "SceneDocument",
    true,
  );
  validateSceneColliderComponents(value, issues);
  return issues;
}

export function validatePrefabDocument(value: unknown): DocumentValidationIssue[] {
  const issues = validateEntityDocument(
    value,
    PREFAB_DOCUMENT_SCHEMA_VERSION,
    "PrefabDocument",
    false,
  );
  if (!isRecord(value)) return issues;
  if (typeof value.prefabId !== "string" || !value.prefabId.trim()) {
    issues.push(issue("$.prefabId", "required", "prefabId is required"));
  }
  if (typeof value.name !== "string" || !value.name.trim()) {
    issues.push(issue("$.name", "required", "Prefab name is required"));
  }
  if (!isUniqueStringArray(value.rootEntityIds, false)) {
    issues.push(
      issue(
        "$.rootEntityIds",
        "reference",
        "rootEntityIds must be a non-empty unique string array",
      ),
    );
  }
  if (!isRecord(value.source)) {
    issues.push(issue("$.source", "type", "Prefab source is required"));
  } else {
    if (typeof value.source.sceneId !== "string" || !value.source.sceneId.trim()) {
      issues.push(issue("$.source.sceneId", "required", "source sceneId is required"));
    }
    if (!isUniqueStringArray(value.source.rootEntityIds, false)) {
      issues.push(
        issue(
          "$.source.rootEntityIds",
          "reference",
          "source rootEntityIds must be a non-empty unique string array",
        ),
      );
    }
  }
  if (!isRecord(value.entities) || !Array.isArray(value.rootEntityIds)) return issues;

  const rootIds = new Set(value.rootEntityIds.filter((id): id is string => typeof id === "string"));
  const componentIds = new Set<string>();
  for (const [entityId, candidate] of Object.entries(value.entities)) {
    const path = `$.entities.${entityId}`;
    if (!isRecord(candidate)) continue;
    if (candidate.id !== entityId) {
      issues.push(issue(`${path}.id`, "id", "entity id must match its record key"));
    }
    const isRoot = rootIds.has(entityId);
    const parent =
      typeof candidate.parentId === "string" ? value.entities[candidate.parentId] : undefined;
    const parentHasChild =
      isRecord(parent) &&
      Array.isArray(parent.children) &&
      parent.children.includes(entityId);
    if (
      (isRoot && candidate.parentId !== null) ||
      (!isRoot &&
        (typeof candidate.parentId !== "string" || !parent || !parentHasChild))
    ) {
      issues.push(issue(`${path}.parentId`, "reference", "entity parent is invalid"));
    }
    if (!isUniqueStringArray(candidate.children, true)) {
      issues.push(issue(`${path}.children`, "reference", "children must be unique entity ids"));
    } else {
      for (const childId of candidate.children) {
        const child = value.entities[childId];
        if (!isRecord(child) || child.parentId !== entityId || childId === entityId) {
          issues.push(issue(`${path}.children`, "reference", `child link is invalid: ${childId}`));
        }
      }
    }
    if (!Array.isArray(candidate.components)) {
      issues.push(issue(`${path}.components`, "type", "components must be an array"));
      continue;
    }
    for (const [index, component] of candidate.components.entries()) {
      const componentPath = `${path}.components.${index}`;
      if (!isRecord(component) || typeof component.id !== "string" || !component.id.trim()) {
        issues.push(issue(componentPath, "id", "component id is required"));
      } else if (componentIds.has(component.id)) {
        issues.push(issue(`${componentPath}.id`, "duplicate", "component id is duplicated"));
      } else {
        componentIds.add(component.id);
      }
      if (isRecord(component)) validatePrefabComponentShape(component, componentPath, issues);
    }
  }
  const pending = [...rootIds];
  const reachable = new Set<string>();
  while (pending.length > 0) {
    const entityId = pending.pop()!;
    if (reachable.has(entityId)) {
      issues.push(issue("$.entities", "cycle", `Prefab hierarchy contains a cycle: ${entityId}`));
      break;
    }
    reachable.add(entityId);
    const entity = value.entities[entityId];
    if (isRecord(entity) && Array.isArray(entity.children)) {
      pending.push(...entity.children.filter((id): id is string => typeof id === "string"));
    }
  }
  if (reachable.size !== Object.keys(value.entities).length) {
    issues.push(issue("$.entities", "reference", "Prefab contains unreachable entities"));
  }
  return issues;
}

export function validateVisualProjectDocument(
  value: unknown,
): DocumentValidationIssue[] {
  if (!isRecord(value)) return [issue("$", "type", "VisualProjectDocument must be an object")];
  const issues: DocumentValidationIssue[] = [];
  if (value.schemaVersion !== VISUAL_PROJECT_SCHEMA_VERSION) {
    issues.push(issue("$.schemaVersion", "schema-version", "Unsupported project schema"));
  }
  if (value.projectKind !== "world" && value.projectKind !== "item") {
    issues.push(issue("$.projectKind", "enum", "projectKind must be world or item"));
  }
  if (typeof value.projectId !== "string" || !value.projectId.trim()) {
    issues.push(issue("$.projectId", "required", "projectId is required"));
  }
  if (!isRecord(value.scenePaths) || typeof value.assetManifestPath !== "string") {
    issues.push(issue("$", "paths", "scenePaths and assetManifestPath are required"));
  }
  if (value.lastPublication !== undefined) {
    if (!isRecord(value.lastPublication)) {
      issues.push(issue("$.lastPublication", "type", "lastPublication must be an object"));
    } else {
      if (
        typeof value.lastPublication.uploadedAt !== "string" ||
        !Number.isFinite(Date.parse(value.lastPublication.uploadedAt))
      ) {
        issues.push(
          issue(
            "$.lastPublication.uploadedAt",
            "date",
            "lastPublication.uploadedAt must be an ISO date",
          ),
        );
      }
      if (
        value.lastPublication.url !== undefined &&
        (typeof value.lastPublication.url !== "string" ||
          !/^https?:\/\//i.test(value.lastPublication.url))
      ) {
        issues.push(
          issue(
            "$.lastPublication.url",
            "url",
            "lastPublication.url must be an HTTP(S) URL returned by XRift",
          ),
        );
      }
      for (const field of [
        "worldId",
        "itemId",
        "contentId",
        "versionId",
        "contentHash",
        "status",
      ] as const) {
        const fieldValue = value.lastPublication[field];
        if (
          fieldValue !== undefined &&
          (typeof fieldValue !== "string" || !fieldValue.trim())
        ) {
          issues.push(
            issue(
              `$.lastPublication.${field}`,
              "type",
              `lastPublication.${field} must be a non-empty string`,
            ),
          );
        }
      }
      if (
        value.lastPublication.versionNumber !== undefined &&
        (!Number.isInteger(value.lastPublication.versionNumber) ||
          Number(value.lastPublication.versionNumber) < 0)
      ) {
        issues.push(
          issue(
            "$.lastPublication.versionNumber",
            "range",
            "lastPublication.versionNumber must be a non-negative integer",
          ),
        );
      }
    }
  }
  return issues;
}

export type SourceDocumentHash = {
  path: string;
  sha256: string;
};

export type CompilationProvenance = {
  sourceDocuments: SourceDocumentHash[];
  compilerVersion: string;
  targetKind: VisualProjectKind;
  generatedAt: string;
};

export type CompilationArtifactMetadata = {
  provenance: CompilationProvenance;
  outputPath: string;
};

export function isCompilationStale(
  provenance: CompilationProvenance,
  current: {
    sourceDocuments: SourceDocumentHash[];
    compilerVersion: string;
    targetKind: VisualProjectKind;
  },
): boolean {
  if (
    provenance.compilerVersion !== current.compilerVersion ||
    provenance.targetKind !== current.targetKind ||
    provenance.sourceDocuments.length !== current.sourceDocuments.length
  ) {
    return true;
  }
  const hashes = new Map(
    provenance.sourceDocuments.map((document) => [document.path, document.sha256]),
  );
  return current.sourceDocuments.some(
    (document) => hashes.get(document.path) !== document.sha256,
  );
}

function parseTypedDocument<Document>(
  json: string,
  validate: (value: unknown) => DocumentValidationIssue[],
): ParseDocumentResult<Document> {
  const parsed = parseJson(json);
  if (!parsed.ok) return parsed;
  const issues = validate(parsed.value);
  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, document: parsed.value as Document, issues: [] };
}

function parseJson(
  json: string,
): { ok: true; value: unknown; issues: [] } | { ok: false; issues: DocumentValidationIssue[] } {
  try {
    return { ok: true, value: JSON.parse(json) as unknown, issues: [] };
  } catch {
    return { ok: false, issues: [issue("$", "json", "Invalid JSON")] };
  }
}

function validateEntityDocument(
  value: unknown,
  schemaVersion: string,
  label: string,
  needsSceneId: boolean,
): DocumentValidationIssue[] {
  if (!isRecord(value)) return [issue("$", "type", `${label} must be an object`)];
  const issues: DocumentValidationIssue[] = [];
  if (value.schemaVersion !== schemaVersion) {
    issues.push(issue("$.schemaVersion", "schema-version", `Unsupported ${label} schema`));
  }
  if (needsSceneId && (typeof value.sceneId !== "string" || !value.sceneId.trim())) {
    issues.push(issue("$.sceneId", "required", "sceneId is required"));
  }
  if (!Array.isArray(value.rootEntityIds) || !isRecord(value.entities)) {
    issues.push(issue("$", "entities", "rootEntityIds and entities are required"));
    return issues;
  }
  for (const rootId of value.rootEntityIds) {
    if (typeof rootId !== "string" || !value.entities[rootId]) {
      issues.push(issue("$.rootEntityIds", "reference", "root entity is missing"));
    }
  }
  return issues;
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortJsonValue(entry)]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUniqueStringArray(value: unknown, allowEmpty: boolean): value is string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) return false;
  return value.every((entry) => typeof entry === "string" && entry.length > 0) &&
    new Set(value).size === value.length;
}

function isPrefabDocumentPath(value: string): boolean {
  return (
    /^prefabs\/(?:[^/]+\/)*[^/]+\.prefab\.json$/.test(value) &&
    !value.includes("..") &&
    !value.includes("\\")
  );
}

function validatePrefabComponentShape(
  component: Record<string, unknown>,
  path: string,
  issues: DocumentValidationIssue[],
): void {
  if (typeof component.type !== "string") {
    issues.push(issue(`${path}.type`, "required", "component type is required"));
    return;
  }
  if (component.type === "mesh") {
    if (!Array.isArray(component.materialBindings)) {
      issues.push(issue(`${path}.materialBindings`, "type", "materialBindings must be an array"));
    } else if (
      component.materialBindings.some(
        (binding) =>
          !isRecord(binding) ||
          typeof binding.materialAssetId !== "string" ||
          !binding.materialAssetId,
      )
    ) {
      issues.push(issue(`${path}.materialBindings`, "reference", "material binding is invalid"));
    }
    if (
      isRecord(component.geometry) &&
      component.geometry.kind === "asset" &&
      (typeof component.geometry.assetId !== "string" || !component.geometry.assetId)
    ) {
      issues.push(issue(`${path}.geometry.assetId`, "reference", "geometry asset is invalid"));
    }
  } else if (component.type === "collider") {
    validateColliderComponentShape(component, path, issues);
  } else if (
    component.type === "particle-emitter" &&
    (typeof component.particleAssetId !== "string" || !component.particleAssetId)
  ) {
    issues.push(issue(`${path}.particleAssetId`, "reference", "particle asset is invalid"));
  } else if (component.type === "prefab-instance") {
    if (typeof component.prefabAssetId !== "string" || !component.prefabAssetId) {
      issues.push(issue(`${path}.prefabAssetId`, "reference", "Prefab asset is invalid"));
    }
    if (typeof component.sourceEntityId !== "string" || !component.sourceEntityId) {
      issues.push(issue(`${path}.sourceEntityId`, "reference", "Prefab source entity is invalid"));
    }
  } else if (component.type === "xrift-component") {
    if (!isUniqueStringArray(component.assetReferences, true)) {
      issues.push(issue(`${path}.assetReferences`, "reference", "assetReferences are invalid"));
    }
    if (!isUniqueStringArray(component.entityReferences, true)) {
      issues.push(issue(`${path}.entityReferences`, "reference", "entityReferences are invalid"));
    }
    if (component.authoring !== undefined) {
      if (
        !isRecord(component.authoring) ||
        component.authoring.source !== "builtin-prefab" ||
        typeof component.authoring.recipeId !== "string" ||
        !component.authoring.recipeId.trim() ||
        component.authoring.readOnly !== true
      ) {
        issues.push(
          issue(
            `${path}.authoring`,
            "type",
            "XRift component authoring metadata is invalid",
          ),
        );
      }
    }
  }
}

function validateSceneColliderComponents(
  value: unknown,
  issues: DocumentValidationIssue[],
): void {
  if (!isRecord(value) || !isRecord(value.entities)) return;
  for (const [entityId, entity] of Object.entries(value.entities)) {
    if (!isRecord(entity) || !Array.isArray(entity.components)) continue;
    for (const [index, component] of entity.components.entries()) {
      if (!isRecord(component) || component.type !== "collider") continue;
      validateColliderComponentShape(
        component,
        `$.entities.${entityId}.components.${index}`,
        issues,
      );
    }
  }
}

function validateColliderComponentShape(
  component: Record<string, unknown>,
  path: string,
  issues: DocumentValidationIssue[],
): void {
  if (typeof component.enabled !== "boolean") {
    issues.push(
      issue(`${path}.enabled`, "type", "Collider enabled must be a boolean"),
    );
  }
  if (component.shape !== "box" && component.shape !== "mesh") {
    issues.push(issue(`${path}.shape`, "enum", "Collider shape must be box or mesh"));
  }
  if (typeof component.isTrigger !== "boolean") {
    issues.push(issue(`${path}.isTrigger`, "type", "Collider trigger must be a boolean"));
  }
  if (
    typeof component.friction !== "number" ||
    !Number.isFinite(component.friction) ||
    component.friction < 0
  ) {
    issues.push(
      issue(
        `${path}.friction`,
        "range",
        "Collider friction must be a finite non-negative number",
      ),
    );
  }
  if (
    typeof component.restitution !== "number" ||
    !Number.isFinite(component.restitution) ||
    component.restitution < 0 ||
    component.restitution > 1
  ) {
    issues.push(
      issue(
        `${path}.restitution`,
        "range",
        "Collider restitution must be a finite number from 0 to 1",
      ),
    );
  }

  if (component.shape === "box") {
    if (!isFiniteNumberVec3(component.center)) {
      issues.push(
        issue(
          `${path}.center`,
          "type",
          "Box Collider center must be a finite vec3",
        ),
      );
    }
    if (!isFiniteNumberVec3(component.halfExtents)) {
      issues.push(
        issue(
          `${path}.halfExtents`,
          "type",
          "Box Collider halfExtents must be a finite vec3",
        ),
      );
    } else if (component.halfExtents.some((entry) => entry <= 0)) {
      issues.push(
        issue(
          `${path}.halfExtents`,
          "range",
          "Box Collider halfExtents must be positive",
        ),
      );
    }
    if (!isStringEnumValue(component.fitMode, COLLIDER_FIT_MODES)) {
      issues.push(
        issue(
          `${path}.fitMode`,
          "enum",
          "Box Collider fitMode must be manual or auto",
        ),
      );
    }
  } else if (component.shape === "mesh") {
    if (component.fitMode !== "auto") {
      issues.push(
        issue(
          `${path}.fitMode`,
          "enum",
          "Mesh Collider fitMode must be auto",
        ),
      );
    }
    if (!isStringEnumValue(component.meshMode, COLLIDER_MESH_MODES)) {
      issues.push(
        issue(
          `${path}.meshMode`,
          "enum",
          "Mesh Collider meshMode must be convex or trimesh",
        ),
      );
    }
  }
}

function isFiniteNumberVec3(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(
      (entry) => typeof entry === "number" && Number.isFinite(entry),
    )
  );
}

function isStringEnumValue(
  value: unknown,
  allowed: readonly string[],
): value is string {
  return typeof value === "string" && allowed.includes(value);
}

function issue(path: string, code: string, message: string): DocumentValidationIssue {
  return { path, code, message };
}
