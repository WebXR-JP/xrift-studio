import {
  isValidMaterialSlotDefinition,
  normalizeProjectRelativePath,
  type MaterialSlotDefinition,
  type ModelAsset,
  type SceneAsset,
} from "./asset-manifest";

export type ModelImportContractIssue = {
  path: string;
  code: string;
  message: string;
};

export type DiscoveredModelMaterialSlot = {
  name: string;
  sourceMaterialIndex: number;
};

/**
 * Reconciles source material slots with the previous import. Stable authoring
 * slot IDs and default Material bindings survive source reordering and rename
 * operations whenever either source name or source index still identifies the
 * slot. Removed slots disappear; new slots receive deterministic IDs.
 */
export function reconcileModelMaterialSlots(
  discovered: readonly DiscoveredModelMaterialSlot[],
  previous: readonly MaterialSlotDefinition[] = [],
): MaterialSlotDefinition[] {
  assertDiscoveredSlots(discovered);
  const incoming = [...discovered].sort(
    (left, right) => left.sourceMaterialIndex - right.sourceMaterialIndex,
  );
  const reusable = previous
    .filter(isValidMaterialSlotDefinition)
    .map((slot) => ({ ...slot }));
  const unused = new Set(reusable.map((_, index) => index));
  const reservedIds = new Set(reusable.map((slot) => slot.slot));
  const emittedIds = new Set<string>();

  return incoming.map((slot) => {
    const matchedIndex = findReusableSlot(slot, reusable, unused);
    if (matchedIndex !== undefined) {
      unused.delete(matchedIndex);
      const matched = reusable[matchedIndex];
      emittedIds.add(matched.slot);
      return {
        slot: matched.slot,
        name: slot.name,
        sourceMaterialIndex: slot.sourceMaterialIndex,
        ...(matched.defaultMaterialAssetId
          ? { defaultMaterialAssetId: matched.defaultMaterialAssetId }
          : {}),
      };
    }

    const baseId = `material-${slot.sourceMaterialIndex}`;
    const stableId = nextSlotId(baseId, reservedIds, emittedIds);
    emittedIds.add(stableId);
    return {
      slot: stableId,
      name: slot.name,
      sourceMaterialIndex: slot.sourceMaterialIndex,
    };
  });
}

/** Validates the persisted Model Asset contract without mutating input. */
export function validateModelAssetContract(
  value: unknown,
  assets?: Readonly<Record<string, SceneAsset | unknown>>,
  path = "$",
): ModelImportContractIssue[] {
  if (!isRecord(value)) {
    return [issue(path, "type", "Model Asset must be an object")];
  }
  const issues: ModelImportContractIssue[] = [];
  if (value.kind !== "model") {
    issues.push(issue(`${path}.kind`, "enum", "Model Asset kind must be model"));
  }
  if (
    value.status !== "ready" &&
    value.status !== "missing" &&
    value.status !== "invalid"
  ) {
    issues.push(issue(`${path}.status`, "enum", "Model Asset status is invalid"));
  }
  if (
    value.sourceHash !== undefined &&
    (typeof value.sourceHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.sourceHash))
  ) {
    issues.push(
      issue(
        `${path}.sourceHash`,
        "hash",
        "Imported Model sourceHash must be a lowercase SHA-256",
      ),
    );
  }
  validateModelThumbnail(value.thumbnail, value.sourceHash, `${path}.thumbnail`, issues);
  if (!isRecord(value.importSettings)) {
    issues.push(
      issue(
        `${path}.importSettings`,
        "type",
        "Model importSettings must be an object",
      ),
    );
  } else {
    if (!isPositiveFinite(value.importSettings.scale)) {
      issues.push(
        issue(
          `${path}.importSettings.scale`,
          "range",
          "Model import scale must be a positive finite number",
        ),
      );
    }
    for (const field of [
      "generateColliders",
      "optimizeMeshes",
      "importAnimations",
    ] as const) {
      if (typeof value.importSettings[field] !== "boolean") {
        issues.push(
          issue(
            `${path}.importSettings.${field}`,
            "type",
            `Model importSettings.${field} must be a boolean`,
          ),
        );
      }
    }
  }

  validateMaterialSlots(value.materialSlots, assets, `${path}.materialSlots`, issues);
  if (value.importMetadata !== undefined) {
    issues.push(
      ...validateModelImportMetadata(
        value.importMetadata,
        `${path}.importMetadata`,
      ),
    );
  }
  validateModelSourceMetadataConsistency(value, path, issues);
  return issues;
}

/** Validates derived source facts before they can enter a manifest commit. */
export function validateModelImportMetadata(
  value: unknown,
  path = "$",
): ModelImportContractIssue[] {
  if (!isRecord(value)) {
    return [issue(path, "type", "Model import metadata must be an object")];
  }
  const issues: ModelImportContractIssue[] = [];
  if (value.sourceFormat !== "glb" && value.sourceFormat !== "gltf") {
    issues.push(
      issue(
        `${path}.sourceFormat`,
        "enum",
        "Model sourceFormat must be glb or gltf",
      ),
    );
  }
  validatePositiveInteger(value.byteLength, `${path}.byteLength`, issues);
  for (const field of ["nodeCount", "meshCount", "primitiveCount"] as const) {
    validateNonNegativeInteger(value[field], `${path}.${field}`, issues);
  }
  validateModelBounds(value.bounds, `${path}.bounds`, issues);
  validateAnimations(value.animations, `${path}.animations`, issues);
  validateUniqueStrings(value.extensionsUsed, `${path}.extensionsUsed`, issues);
  validateUniqueStrings(
    value.extensionsRequired,
    `${path}.extensionsRequired`,
    issues,
  );
  if (
    Array.isArray(value.extensionsUsed) &&
    Array.isArray(value.extensionsRequired)
  ) {
    const used = new Set(value.extensionsUsed);
    value.extensionsRequired.forEach((extension, index) => {
      if (typeof extension === "string" && !used.has(extension)) {
        issues.push(
          issue(
            `${path}.extensionsRequired.${index}`,
            "reference",
            "A required extension must also appear in extensionsUsed",
          ),
        );
      }
    });
  }
  return issues;
}

export function isValidModelAssetContract(value: unknown): value is ModelAsset {
  return validateModelAssetContract(value).length === 0;
}

function findReusableSlot(
  incoming: DiscoveredModelMaterialSlot,
  previous: readonly MaterialSlotDefinition[],
  unused: ReadonlySet<number>,
): number | undefined {
  const normalizedName = materialNameKey(incoming.name);
  const exact = findFirstIndex(previous, unused, (slot) =>
    slot.sourceMaterialIndex === incoming.sourceMaterialIndex &&
    materialNameKey(slot.name) === normalizedName,
  );
  if (exact !== undefined) return exact;

  const nameMatches = findIndices(previous, unused, (slot) =>
    materialNameKey(slot.name) === normalizedName,
  );
  if (nameMatches.length === 1) return nameMatches[0];

  return findFirstIndex(previous, unused, (slot) =>
    slot.sourceMaterialIndex === incoming.sourceMaterialIndex,
  );
}

function findFirstIndex(
  slots: readonly MaterialSlotDefinition[],
  unused: ReadonlySet<number>,
  predicate: (slot: MaterialSlotDefinition) => boolean,
): number | undefined {
  for (const index of [...unused].sort((left, right) => left - right)) {
    if (predicate(slots[index])) return index;
  }
  return undefined;
}

function findIndices(
  slots: readonly MaterialSlotDefinition[],
  unused: ReadonlySet<number>,
  predicate: (slot: MaterialSlotDefinition) => boolean,
): number[] {
  return [...unused]
    .sort((left, right) => left - right)
    .filter((index) => predicate(slots[index]));
}

function nextSlotId(
  baseId: string,
  reserved: ReadonlySet<string>,
  emitted: ReadonlySet<string>,
): string {
  if (!reserved.has(baseId) && !emitted.has(baseId)) return baseId;
  let suffix = 2;
  while (
    reserved.has(`${baseId}-${suffix}`) ||
    emitted.has(`${baseId}-${suffix}`)
  ) {
    suffix += 1;
  }
  return `${baseId}-${suffix}`;
}

function assertDiscoveredSlots(
  discovered: readonly DiscoveredModelMaterialSlot[],
): void {
  const indices = new Set<number>();
  for (const slot of discovered) {
    if (!slot.name.trim()) {
      throw new Error("Discovered Model material slot name is empty");
    }
    if (
      !Number.isInteger(slot.sourceMaterialIndex) ||
      slot.sourceMaterialIndex < 0 ||
      indices.has(slot.sourceMaterialIndex)
    ) {
      throw new Error("Discovered Model material index is invalid or duplicated");
    }
    indices.add(slot.sourceMaterialIndex);
  }
}

function validateMaterialSlots(
  value: unknown,
  assets: Readonly<Record<string, SceneAsset | unknown>> | undefined,
  path: string,
  issues: ModelImportContractIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push(issue(path, "type", "Model materialSlots must be an array"));
    return;
  }
  const slotIds = new Set<string>();
  const sourceIndices = new Set<number>();
  value.forEach((candidate, index) => {
    const slotPath = `${path}.${index}`;
    if (!isRecord(candidate)) {
      issues.push(issue(slotPath, "type", "Model material slot must be an object"));
      return;
    }
    if (typeof candidate.slot !== "string" || !candidate.slot.trim()) {
      issues.push(issue(`${slotPath}.slot`, "required", "Material slot ID is required"));
    } else if (slotIds.has(candidate.slot)) {
      issues.push(issue(`${slotPath}.slot`, "duplicate", "Material slot ID is duplicated"));
    } else {
      slotIds.add(candidate.slot);
    }
    if (typeof candidate.name !== "string" || !candidate.name.trim()) {
      issues.push(issue(`${slotPath}.name`, "required", "Material slot name is required"));
    }
    if (
      !Number.isInteger(candidate.sourceMaterialIndex) ||
      Number(candidate.sourceMaterialIndex) < 0
    ) {
      issues.push(
        issue(
          `${slotPath}.sourceMaterialIndex`,
          "range",
          "Model material source index must be a non-negative integer",
        ),
      );
    } else if (sourceIndices.has(Number(candidate.sourceMaterialIndex))) {
      issues.push(
        issue(
          `${slotPath}.sourceMaterialIndex`,
          "duplicate",
          "Model material source index is duplicated",
        ),
      );
    } else {
      sourceIndices.add(Number(candidate.sourceMaterialIndex));
    }
    if (candidate.defaultMaterialAssetId !== undefined) {
      if (
        typeof candidate.defaultMaterialAssetId !== "string" ||
        !candidate.defaultMaterialAssetId.trim()
      ) {
        issues.push(
          issue(
            `${slotPath}.defaultMaterialAssetId`,
            "reference",
            "Default Material Asset ID must be a non-empty string",
          ),
        );
      } else if (assets) {
        const referencedAsset = assets[candidate.defaultMaterialAssetId];
        if (isRecord(referencedAsset) && referencedAsset.kind === "material") {
          return;
        }
        issues.push(
          issue(
            `${slotPath}.defaultMaterialAssetId`,
            "reference",
            "Default Material Asset is missing",
          ),
        );
      }
    }
  });
}

function validateModelBounds(
  value: unknown,
  path: string,
  issues: ModelImportContractIssue[],
): void {
  if (!isRecord(value)) {
    issues.push(issue(path, "type", "Model local bounds must be an object"));
    return;
  }
  const vectors = ["min", "max", "center", "size"] as const;
  for (const field of vectors) {
    if (!isFiniteVec3(value[field])) {
      issues.push(
        issue(
          `${path}.${field}`,
          "range",
          `Model bounds ${field} must contain three finite numbers`,
        ),
      );
    }
  }
  if (!isNonNegativeFinite(value.boundingSphereRadius)) {
    issues.push(
      issue(
        `${path}.boundingSphereRadius`,
        "range",
        "Model bounding sphere radius must be finite and non-negative",
      ),
    );
  }
  if (
    !isFiniteVec3(value.min) ||
    !isFiniteVec3(value.max) ||
    !isFiniteVec3(value.center) ||
    !isFiniteVec3(value.size)
  ) {
    return;
  }
  for (let axis = 0; axis < 3; axis += 1) {
    if (value.min[axis] > value.max[axis]) {
      issues.push(issue(`${path}.min.${axis}`, "range", "Model bounds min exceeds max"));
    }
    const expectedSize = value.max[axis] - value.min[axis];
    const expectedCenter = (value.max[axis] + value.min[axis]) / 2;
    if (!nearlyEqual(value.size[axis], expectedSize)) {
      issues.push(issue(`${path}.size.${axis}`, "consistency", "Model bounds size is inconsistent"));
    }
    if (!nearlyEqual(value.center[axis], expectedCenter)) {
      issues.push(issue(`${path}.center.${axis}`, "consistency", "Model bounds center is inconsistent"));
    }
  }
}

function validateAnimations(
  value: unknown,
  path: string,
  issues: ModelImportContractIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push(issue(path, "type", "Model animations must be an array"));
    return;
  }
  const sourceIndices = new Set<number>();
  value.forEach((candidate, index) => {
    const animationPath = `${path}.${index}`;
    if (!isRecord(candidate)) {
      issues.push(issue(animationPath, "type", "Model animation must be an object"));
      return;
    }
    if (typeof candidate.name !== "string" || !candidate.name.trim()) {
      issues.push(issue(`${animationPath}.name`, "required", "Animation name is required"));
    }
    if (!isNonNegativeFinite(candidate.duration)) {
      issues.push(issue(`${animationPath}.duration`, "range", "Animation duration must be finite"));
    }
    validateNonNegativeInteger(candidate.trackCount, `${animationPath}.trackCount`, issues);
    if (candidate.sourceAnimationIndex !== undefined) {
      if (
        !Number.isInteger(candidate.sourceAnimationIndex) ||
        Number(candidate.sourceAnimationIndex) < 0 ||
        sourceIndices.has(Number(candidate.sourceAnimationIndex))
      ) {
        issues.push(
          issue(
            `${animationPath}.sourceAnimationIndex`,
            "range",
            "Animation source index must be unique and non-negative",
          ),
        );
      } else {
        sourceIndices.add(Number(candidate.sourceAnimationIndex));
      }
    }
  });
}

function validateUniqueStrings(
  value: unknown,
  path: string,
  issues: ModelImportContractIssue[],
): void {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string" || !entry.trim())
  ) {
    issues.push(issue(path, "type", "Extension names must be non-empty strings"));
    return;
  }
  if (new Set(value).size !== value.length) {
    issues.push(issue(path, "duplicate", "Extension names must be unique"));
  }
}

function validateModelSourceMetadataConsistency(
  asset: Record<string, unknown>,
  path: string,
  issues: ModelImportContractIssue[],
): void {
  if (!isRecord(asset.source)) {
    issues.push(issue(`${path}.source`, "type", "Model source must be an object"));
    return;
  }
  if (asset.source.kind === "builtin") {
    if (typeof asset.source.key !== "string" || !asset.source.key.trim()) {
      issues.push(issue(`${path}.source.key`, "required", "Builtin Model key is required"));
    }
    return;
  }
  if (asset.source.kind === "document") return;
  if (asset.source.kind !== "project") {
    issues.push(issue(`${path}.source.kind`, "enum", "Model source kind is invalid"));
    return;
  }
  if (
    typeof asset.source.relativePath !== "string" ||
    normalizeProjectRelativePath(asset.source.relativePath) !==
      asset.source.relativePath
  ) {
    issues.push(
      issue(
        `${path}.source.relativePath`,
        "path",
        "Model project source path must be relative and normalized",
      ),
    );
    return;
  }
  const sourceHashIsPresent =
    typeof asset.sourceHash === "string" && asset.sourceHash.length > 0;
  if (!isRecord(asset.importMetadata)) {
    if (sourceHashIsPresent) {
      issues.push(
        issue(
          `${path}.importMetadata`,
          "required",
          "An imported Model with sourceHash requires importMetadata",
        ),
      );
    }
    return;
  }
  const extension = asset.source.relativePath.split(".").pop()?.toLowerCase();
  if (extension !== "glb" && extension !== "gltf") {
    issues.push(
      issue(
        `${path}.source.relativePath`,
        "extension",
        "Model source path must end in .glb or .gltf",
      ),
    );
    return;
  }
  if (
    (extension === "glb" || extension === "gltf") &&
    asset.importMetadata.sourceFormat !== extension
  ) {
    issues.push(
      issue(
        `${path}.importMetadata.sourceFormat`,
        "consistency",
        "Model sourceFormat does not match the source path extension",
      ),
    );
  }
}

function validateModelThumbnail(
  value: unknown,
  sourceHash: unknown,
  path: string,
  issues: ModelImportContractIssue[],
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    issues.push(issue(path, "type", "Model thumbnail must be an object"));
    return;
  }
  if (value.status === "missing") return;
  if (value.status !== "generated" && value.status !== "stale") {
    issues.push(issue(`${path}.status`, "enum", "Model thumbnail status is invalid"));
    return;
  }
  if (
    typeof value.derivedPath !== "string" ||
    normalizeProjectRelativePath(value.derivedPath) !== value.derivedPath
  ) {
    issues.push(issue(`${path}.derivedPath`, "path", "Thumbnail path is invalid"));
  }
  if (typeof value.sourceHash !== "string" || !/^[a-f0-9]{64}$/.test(value.sourceHash)) {
    issues.push(issue(`${path}.sourceHash`, "hash", "Thumbnail sourceHash is invalid"));
  }
  if (typeof value.rendererVersion !== "string" || !value.rendererVersion.trim()) {
    issues.push(issue(`${path}.rendererVersion`, "required", "Thumbnail rendererVersion is required"));
  }
  if (
    value.status === "generated" &&
    typeof sourceHash === "string" &&
    value.sourceHash !== sourceHash
  ) {
    issues.push(
      issue(
        `${path}.sourceHash`,
        "consistency",
        "Generated thumbnail must match the current Model sourceHash",
      ),
    );
  }
}

function validatePositiveInteger(
  value: unknown,
  path: string,
  issues: ModelImportContractIssue[],
): void {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    issues.push(issue(path, "range", "Value must be a positive integer"));
  }
}

function validateNonNegativeInteger(
  value: unknown,
  path: string,
  issues: ModelImportContractIssue[],
): void {
  if (!Number.isInteger(value) || Number(value) < 0) {
    issues.push(issue(path, "range", "Value must be a non-negative integer"));
  }
}

function materialNameKey(value: string): string {
  return value.trim().normalize("NFKC").toLocaleLowerCase();
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isFiniteVec3(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  );
}

function nearlyEqual(left: number, right: number): boolean {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= 1e-5 * scale;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function issue(
  path: string,
  code: string,
  message: string,
): ModelImportContractIssue {
  return { path, code, message };
}
