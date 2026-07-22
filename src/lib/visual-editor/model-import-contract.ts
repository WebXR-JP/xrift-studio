import {
  isValidMaterialSlotDefinition,
  normalizeProjectRelativePath,
  type MaterialSlotDefinition,
  type ModelAsset,
  type SceneAsset,
} from "./asset-manifest";
import { isOpenBrushModelMetadata } from "./open-brush";

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
  if (
    value.sourceFormat !== "glb" &&
    value.sourceFormat !== "gltf" &&
    value.sourceFormat !== "obj" &&
    value.sourceFormat !== "vrm"
  ) {
    issues.push(
      issue(
        `${path}.sourceFormat`,
        "enum",
        "Model sourceFormat must be glb, gltf, obj or vrm",
      ),
    );
  }
  if (
    value.sourceFileName !== undefined &&
    (typeof value.sourceFileName !== "string" ||
      !value.sourceFileName.trim() ||
      value.sourceFileName.includes("/") ||
      value.sourceFileName.includes("\\"))
  ) {
    issues.push(
      issue(
        `${path}.sourceFileName`,
        "file-name",
        "Model sourceFileName must be a leaf file name",
      ),
    );
  }
  validatePositiveInteger(value.byteLength, `${path}.byteLength`, issues);
  for (const field of ["nodeCount", "meshCount", "primitiveCount"] as const) {
    validateNonNegativeInteger(value[field], `${path}.${field}`, issues);
  }
  validateModelBounds(value.bounds, `${path}.bounds`, issues);
  validateAnimations(value.animations, `${path}.animations`, issues);
  validateNamedModelParts(value.bones, `${path}.bones`, issues);
  validateNamedModelParts(value.morphTargets, `${path}.morphTargets`, issues);
  validateModelNodes(
    value.nodes,
    value.nodeCount,
    value.meshCount,
    `${path}.nodes`,
    issues,
  );
  if (
    value.vrmVersion !== undefined &&
    value.vrmVersion !== "0" &&
    value.vrmVersion !== "1"
  ) {
    issues.push(
      issue(
        `${path}.vrmVersion`,
        "enum",
        "VRM version must be 0 or 1",
      ),
    );
  }
  if (value.sourceFormat !== "vrm" && value.vrmVersion !== undefined) {
    issues.push(
      issue(
        `${path}.vrmVersion`,
        "consistency",
        "VRM version is only valid for a VRM source",
      ),
    );
  }
  if (value.sourceFormat === "vrm" && value.vrmVersion === undefined) {
    issues.push(
      issue(
        `${path}.vrmVersion`,
        "required",
        "A VRM source requires a parsed VRM version",
      ),
    );
  }
  validateUniqueStrings(value.extensionsUsed, `${path}.extensionsUsed`, issues);
  validateUniqueStrings(
    value.extensionsRequired,
    `${path}.extensionsRequired`,
    issues,
  );
  if (
    value.openBrush !== undefined &&
    !isOpenBrushModelMetadata(value.openBrush)
  ) {
    issues.push(
      issue(
        `${path}.openBrush`,
        "type",
        "OpenBrush metadata must describe a three-icosa renderer and brush list",
      ),
    );
  }
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
  if (
    extension !== "glb" &&
    extension !== "gltf" &&
    extension !== "obj" &&
    extension !== "vrm"
  ) {
    issues.push(
      issue(
        `${path}.source.relativePath`,
        "extension",
        "Model source path must end in .glb, .gltf, .obj or .vrm",
      ),
    );
    return;
  }
  if (
    (extension === "glb" ||
      extension === "gltf" ||
      extension === "obj" ||
      extension === "vrm") &&
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

function validateNamedModelParts(
  value: unknown,
  path: string,
  issues: ModelImportContractIssue[],
): void {
  // Older manifests did not persist pose targets.
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    issues.push(issue(path, "type", "Model pose target metadata must be an array"));
    return;
  }
  const keys = new Set<string>();
  value.forEach((candidate, index) => {
    const targetPath = `${path}.${index}`;
    if (!isRecord(candidate)) {
      issues.push(issue(targetPath, "type", "Model pose target must be an object"));
      return;
    }
    if (typeof candidate.key !== "string" || !candidate.key.trim()) {
      issues.push(issue(`${targetPath}.key`, "required", "Model pose target key is required"));
    } else if (keys.has(candidate.key)) {
      issues.push(issue(`${targetPath}.key`, "duplicate", "Model pose target key is duplicated"));
    } else {
      keys.add(candidate.key);
    }
    if (typeof candidate.name !== "string" || !candidate.name.trim()) {
      issues.push(issue(`${targetPath}.name`, "required", "Model pose target name is required"));
    }
    if (
      candidate.humanoidName !== undefined &&
      (typeof candidate.humanoidName !== "string" || !candidate.humanoidName.trim())
    ) {
      issues.push(
        issue(
          `${targetPath}.humanoidName`,
          "type",
          "VRM humanoid bone name must be a non-empty string",
        ),
      );
    }
  });
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

function validateModelNodes(
  value: unknown,
  nodeCount: unknown,
  meshCount: unknown,
  path: string,
  issues: ModelImportContractIssue[],
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    issues.push(issue(path, "type", "Model nodes must be an array"));
    return;
  }
  const sourceNodeIndices = new Set<number>();
  value.forEach((candidate, index) => {
    const targetPath = `${path}.${index}`;
    if (!isRecord(candidate)) {
      issues.push(issue(targetPath, "type", "Model node must be an object"));
      return;
    }
    if (
      !Number.isInteger(candidate.sourceNodeIndex) ||
      Number(candidate.sourceNodeIndex) < 0 ||
      (Number.isInteger(nodeCount) && Number(candidate.sourceNodeIndex) >= Number(nodeCount))
    ) {
      issues.push(issue(
        `${targetPath}.sourceNodeIndex`,
        "reference",
        "Model node source index is outside nodeCount",
      ));
    } else if (sourceNodeIndices.has(Number(candidate.sourceNodeIndex))) {
      issues.push(issue(
        `${targetPath}.sourceNodeIndex`,
        "unique",
        "Model node source indices must be unique",
      ));
    } else {
      sourceNodeIndices.add(Number(candidate.sourceNodeIndex));
    }
    if (typeof candidate.name !== "string" || !candidate.name.trim()) {
      issues.push(issue(`${targetPath}.name`, "required", "Model node name is required"));
    }
    if (
      candidate.parentSourceNodeIndex !== undefined &&
      (!Number.isInteger(candidate.parentSourceNodeIndex) ||
        Number(candidate.parentSourceNodeIndex) < 0 ||
        (Number.isInteger(nodeCount) &&
          Number(candidate.parentSourceNodeIndex) >= Number(nodeCount)))
    ) {
      issues.push(issue(
        `${targetPath}.parentSourceNodeIndex`,
        "reference",
        "Model node parent index is outside nodeCount",
      ));
    }
    validateModelNodeIndexArray(
      candidate.childSourceNodeIndices,
      nodeCount,
      `${targetPath}.childSourceNodeIndices`,
      issues,
    );
    if (
      candidate.meshIndex !== undefined &&
      (!Number.isInteger(candidate.meshIndex) ||
        Number(candidate.meshIndex) < 0 ||
        (Number.isInteger(meshCount) && Number(candidate.meshIndex) >= Number(meshCount)))
    ) {
      issues.push(issue(
        `${targetPath}.meshIndex`,
        "reference",
        "Model node mesh index is outside meshCount",
      ));
    }
    if (
      candidate.skinIndex !== undefined &&
      (!Number.isInteger(candidate.skinIndex) ||
        Number(candidate.skinIndex) < 0)
    ) {
      issues.push(issue(
        `${targetPath}.skinIndex`,
        "reference",
        "Model node skin index must be a non-negative integer",
      ));
    }
    if (
      candidate.isBone !== undefined &&
      typeof candidate.isBone !== "boolean"
    ) {
      issues.push(issue(
        `${targetPath}.isBone`,
        "type",
        "Model node isBone must be a boolean",
      ));
    }
    validateModelNodeIndexArray(
      candidate.sourceMaterialIndices,
      undefined,
      `${targetPath}.sourceMaterialIndices`,
      issues,
    );
    for (const field of ["position", "rotation", "scale"] as const) {
      if (!isFiniteVec3(candidate[field])) {
        issues.push(issue(
          `${targetPath}.${field}`,
          "finite-vec3",
          `Model node ${field} must contain three finite numbers`,
        ));
      }
    }
  });

  const declaredIndices = new Set(
    value.flatMap((candidate) =>
      isRecord(candidate) && Number.isInteger(candidate.sourceNodeIndex)
        ? [Number(candidate.sourceNodeIndex)]
        : [],
    ),
  );
  const parentByChild = new Map<number, number>();
  value.forEach((candidate, index) => {
    if (!isRecord(candidate)) return;
    const targetPath = `${path}.${index}`;
    const sourceNodeIndex = Number(candidate.sourceNodeIndex);
    const parentSourceNodeIndex = Number(candidate.parentSourceNodeIndex);
    if (
      Number.isInteger(candidate.parentSourceNodeIndex) &&
      !declaredIndices.has(parentSourceNodeIndex)
    ) {
      issues.push(issue(
        `${targetPath}.parentSourceNodeIndex`,
        "reference",
        "Model node parent is not retained in this scene",
      ));
    }
    if (
      Number.isInteger(candidate.parentSourceNodeIndex) &&
      parentSourceNodeIndex === sourceNodeIndex
    ) {
      issues.push(issue(
        `${targetPath}.parentSourceNodeIndex`,
        "cycle",
        "Model node cannot be its own parent",
      ));
    }
    if (Array.isArray(candidate.childSourceNodeIndices)) {
      candidate.childSourceNodeIndices.forEach((childIndex, childOffset) => {
        const normalizedChildIndex = Number(childIndex);
        if (Number.isInteger(childIndex) && !declaredIndices.has(normalizedChildIndex)) {
          issues.push(issue(
            `${targetPath}.childSourceNodeIndices.${childOffset}`,
            "reference",
            "Model node child is not retained in this scene",
          ));
          return;
        }
        if (!Number.isInteger(childIndex)) return;
        if (normalizedChildIndex === sourceNodeIndex) {
          issues.push(issue(
            `${targetPath}.childSourceNodeIndices.${childOffset}`,
            "cycle",
            "Model node cannot contain itself",
          ));
          return;
        }
        const previousParent = parentByChild.get(normalizedChildIndex);
        if (previousParent !== undefined && previousParent !== sourceNodeIndex) {
          issues.push(issue(
            `${targetPath}.childSourceNodeIndices.${childOffset}`,
            "unique-parent",
            "Model node cannot have multiple parents",
          ));
        } else {
          parentByChild.set(normalizedChildIndex, sourceNodeIndex);
        }
      });
    }
  });

  value.forEach((candidate, index) => {
    if (!isRecord(candidate) || !Number.isInteger(candidate.sourceNodeIndex)) return;
    const sourceNodeIndex = Number(candidate.sourceNodeIndex);
    const linkedParent = parentByChild.get(sourceNodeIndex);
    const declaredParent = Number.isInteger(candidate.parentSourceNodeIndex)
      ? Number(candidate.parentSourceNodeIndex)
      : undefined;
    if (linkedParent !== declaredParent) {
      issues.push(issue(
        `${path}.${index}.parentSourceNodeIndex`,
        "hierarchy",
        "Model node parent and child links must match",
      ));
    }
  });

  const visitState = new Map<number, 0 | 1 | 2>();
  let reportedCycle = false;
  for (const start of declaredIndices) {
    if (visitState.get(start) === 2) continue;
    const pending: Array<{ nodeIndex: number; leaving: boolean }> = [
      { nodeIndex: start, leaving: false },
    ];
    while (pending.length > 0) {
      const frame = pending.pop()!;
      if (frame.leaving) {
        visitState.set(frame.nodeIndex, 2);
        continue;
      }
      if (visitState.get(frame.nodeIndex) === 1) {
        if (!reportedCycle) {
          issues.push(issue(path, "cycle", "Model node hierarchy must be acyclic"));
          reportedCycle = true;
        }
        continue;
      }
      if (visitState.get(frame.nodeIndex) === 2) continue;
      visitState.set(frame.nodeIndex, 1);
      pending.push({ nodeIndex: frame.nodeIndex, leaving: true });
      const parent = parentByChild.get(frame.nodeIndex);
      if (parent !== undefined) {
        pending.push({ nodeIndex: parent, leaving: false });
      }
    }
  }
}

function validateModelNodeIndexArray(
  value: unknown,
  upperBound: unknown,
  path: string,
  issues: ModelImportContractIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push(issue(path, "type", "Model node indices must be an array"));
    return;
  }
  const seen = new Set<number>();
  value.forEach((entry, index) => {
    if (
      !Number.isInteger(entry) ||
      Number(entry) < 0 ||
      (Number.isInteger(upperBound) && Number(entry) >= Number(upperBound))
    ) {
      issues.push(issue(`${path}.${index}`, "reference", "Model node index is invalid"));
      return;
    }
    if (seen.has(Number(entry))) {
      issues.push(issue(`${path}.${index}`, "unique", "Model node indices must be unique"));
      return;
    }
    seen.add(Number(entry));
  });
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
