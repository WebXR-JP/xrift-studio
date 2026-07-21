import { instantiateSceneAsset, isScenePlaceableAsset } from "./asset-placement";
import {
  getBuiltinPrefabRecipe,
  instantiateBuiltinPrefab,
} from "./builtin-prefab-catalog";
import { BUILTIN_PRIMITIVE_CREATION_IDS } from "./creation-catalog";
import { createDocumentId } from "./document-id";
import {
  addEditorComponent,
  createEmptyEntity as createEmptySceneEntity,
  deleteEntityHierarchy,
} from "./editor-session";
import {
  assignMaterialToMeshSlots,
  assignMaterialToPrimaryMeshSlot,
} from "./material-assignment";
import type { PrototypeVisualProject } from "./prototype-project";
import {
  addBuiltinPrimitiveEntity,
  duplicateEntityHierarchy,
  renameEntity as renameEntityInScene,
  updateEntityTransform,
  type SceneDocument,
  type SceneEntity,
  type Vec3,
} from "./scene-document";
import { resolveSceneSettings, type SceneFogSettings } from "./scene-settings";

export const XRIFT_MCP_EDITOR_TOOLS = [
  "get_editor_context",
  "list_assets",
  "update_scene_settings",
  "place_asset",
  "list_entities",
  "create_primitive",
  "place_builtin_prefab",
  "add_component",
  "update_transform",
  "set_material",
  "rename_entity",
  "duplicate_entity",
  "delete_entity",
  "create_empty_entity",
] as const;

export type XriftMcpEditorToolName = (typeof XRIFT_MCP_EDITOR_TOOLS)[number];

export type XriftMcpEditorRequest = {
  id: string;
  tool: XriftMcpEditorToolName;
  arguments: Record<string, unknown>;
};

export type XriftMcpEditorSelection = {
  kind: "entity";
  id: string;
} | null;

export type XriftMcpEditorContext = {
  bundle: PrototypeVisualProject;
  sceneSelection: XriftMcpEditorSelection;
  assetSelection: string | null;
  editorMode: "edit" | "play";
  importBusy: boolean;
  revision: number;
  saveStatus: "dirty" | "saving" | "saved" | "error" | "unavailable";
  now?: () => string;
};

export type XriftMcpEditorToolOutcome = {
  changed: boolean;
  bundle: PrototypeVisualProject;
  sceneSelection: XriftMcpEditorSelection;
  assetSelection: string | null;
  result: Record<string, unknown>;
  activity: string;
};

export class XriftMcpEditorToolError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "XriftMcpEditorToolError";
    this.code = code;
    this.details = details;
  }
}

export function executeXriftMcpEditorTool(
  context: XriftMcpEditorContext,
  request: XriftMcpEditorRequest,
): XriftMcpEditorToolOutcome {
  switch (request.tool) {
    case "get_editor_context":
      return readEditorContext(context);
    case "list_assets":
      return listAssets(context, request.arguments);
    case "update_scene_settings":
      return updateSceneSettings(context, request.arguments);
    case "place_asset":
      return placeAsset(context, request.arguments);
    case "list_entities":
      return listEntities(context);
    case "create_primitive":
      return createPrimitive(context, request.arguments);
    case "place_builtin_prefab":
      return placeBuiltinPrefab(context, request.arguments);
    case "add_component":
      return addComponent(context, request.arguments);
    case "update_transform":
      return updateTransform(context, request.arguments);
    case "set_material":
      return setMaterial(context, request.arguments);
    case "rename_entity":
      return renameEntity(context, request.arguments);
    case "duplicate_entity":
      return duplicateEntity(context, request.arguments);
    case "delete_entity":
      return deleteEntity(context, request.arguments);
    case "create_empty_entity":
      return createEmptyEntity(context, request.arguments);
  }
}

function readEditorContext(
  context: XriftMcpEditorContext,
): XriftMcpEditorToolOutcome {
  const sceneSettings = resolveSceneSettings(context.bundle.scene.settings);
  const selectedEntity = context.sceneSelection
    ? context.bundle.scene.entities[context.sceneSelection.id]
    : undefined;
  const selectedAsset = context.assetSelection
    ? context.bundle.assets.assets[context.assetSelection]
    : undefined;
  return unchanged(context, {
    projectId: context.bundle.project.projectId,
    projectName: context.bundle.project.metadata.name,
    projectKind: context.bundle.project.projectKind,
    sceneId: context.bundle.scene.sceneId,
    sceneName: context.bundle.scene.name,
    revision: context.revision,
    editorMode: context.editorMode,
    importBusy: context.importBusy,
    saveStatus: context.saveStatus,
    sceneSettings: {
      fog: sceneSettings.fog,
    },
    selectedEntity: selectedEntity
      ? { id: selectedEntity.id, name: selectedEntity.name }
      : null,
    selectedAsset: selectedAsset
      ? { id: selectedAsset.id, name: selectedAsset.name, kind: selectedAsset.kind }
      : null,
  }, "Editor contextを取得しました");
}

function listAssets(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  const query = optionalString(argumentsValue.query)?.toLocaleLowerCase();
  const kind = optionalString(argumentsValue.kind);
  const assets = Object.values(context.bundle.assets.assets)
    .filter((asset) => !query || asset.name.toLocaleLowerCase().includes(query))
    .filter((asset) => !kind || asset.kind === kind)
    .map((asset) => ({
      id: asset.id,
      name: asset.name,
      kind: asset.kind,
      status: asset.status,
      placeable: isScenePlaceableAsset(asset),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return unchanged(context, { assets, count: assets.length }, "Asset一覧を取得しました");
}

function updateSceneSettings(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const fogPatch = recordValue(argumentsValue.fog, "fog");
  const currentSettings = resolveSceneSettings(context.bundle.scene.settings);
  const fog = applyFogPatch(currentSettings.fog, fogPatch);
  if (sameFog(currentSettings.fog, fog)) {
    return unchanged(
      context,
      {
        projectId: context.bundle.project.projectId,
        sceneId: context.bundle.scene.sceneId,
        revision: context.revision,
        fog,
      },
      "Fog設定はすでに指定された状態です",
    );
  }

  const bundle = touchProject(context, {
    ...context.bundle,
    scene: {
      ...context.bundle.scene,
      settings: { ...currentSettings, fog },
    },
  });
  return {
    changed: true,
    bundle,
    sceneSelection: context.sceneSelection,
    assetSelection: context.assetSelection,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      fog,
    },
    activity: fog.enabled ? "AIがFogを更新しました" : "AIがFogを無効にしました",
  };
}

function placeAsset(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const assetId = requiredString(argumentsValue.assetId, "assetId");
  const position = optionalVec3(argumentsValue.position, "position") ?? [0, 0, 0];
  const parentEntityId = optionalNullableString(
    argumentsValue.parentEntityId,
    "parentEntityId",
  );
  const placement = instantiateSceneAsset(
    context.bundle.scene,
    context.bundle.assets,
    context.bundle.prefabs,
    assetId,
    { position, parentEntityId },
  );
  if (!placement.placed) {
    throw new XriftMcpEditorToolError(
      placement.reason === "asset-missing" ? "ASSET_NOT_FOUND" : "ASSET_NOT_PLACEABLE",
      placementFailureMessage(placement.reason),
      { assetId, reason: placement.reason },
    );
  }
  const bundle = touchProject(context, {
    ...context.bundle,
    scene: placement.scene,
  });
  return {
    changed: true,
    bundle,
    sceneSelection: { kind: "entity", id: placement.entityId },
    assetSelection: null,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      entityId: placement.entityId,
      assetId,
      assetName: placement.assetName,
      position,
      parentEntityId,
    },
    activity: `AIが「${placement.assetName}」をSceneへ配置しました`,
  };
}

function listEntities(context: XriftMcpEditorContext): XriftMcpEditorToolOutcome {
  const entities = Object.values(context.bundle.scene.entities)
    .map((entity) => ({
      id: entity.id,
      name: entity.name,
      parentId: entity.parentId,
      children: entity.children,
      enabled: entity.enabled,
      components: entity.components,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return unchanged(context, { entities, count: entities.length }, "Entity一覧を取得しました");
}

function createPrimitive(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const shape = requiredEnum(
    argumentsValue.shape,
    "shape",
    ["box", "sphere", "cylinder", "cone", "plane"] as const,
  );
  const position = optionalVec3(argumentsValue.position, "position");
  const requestedMaterialAssetId = optionalString(argumentsValue.materialAssetId);
  const materialAssetId =
    requestedMaterialAssetId ??
    Object.values(context.bundle.assets.assets).find((asset) => asset.kind === "material")?.id;
  if (!materialAssetId) {
    throw new XriftMcpEditorToolError(
      "NO_MATERIAL_AVAILABLE",
      "Projectに割り当てられるMaterialがありません",
    );
  }
  const placement = addBuiltinPrimitiveEntity(
    context.bundle.scene,
    context.bundle.assets,
    BUILTIN_PRIMITIVE_CREATION_IDS[shape],
    materialAssetId,
    position,
  );
  if (!placement) {
    throw new XriftMcpEditorToolError(
      "INVALID_ARGUMENT",
      "指定されたMaterialでPrimitiveを作成できません",
      { materialAssetId },
    );
  }
  const bundle = touchProject(context, { ...context.bundle, scene: placement.scene });
  return {
    changed: true,
    bundle,
    sceneSelection: { kind: "entity", id: placement.entityId },
    assetSelection: null,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      entityId: placement.entityId,
      shape,
      materialAssetId,
      position,
    },
    activity: `AIが${shape}を作成しました`,
  };
}

function placeBuiltinPrefab(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const recipeId = requiredString(argumentsValue.recipeId, "recipeId");
  const position = optionalVec3(argumentsValue.position, "position");
  const recipe = getBuiltinPrefabRecipe(recipeId);
  if (!recipe) {
    throw new XriftMcpEditorToolError(
      "RECIPE_NOT_FOUND",
      "指定されたPrefab recipeが見つかりません",
      { recipeId },
    );
  }
  const projectKind = context.bundle.project.projectKind;
  if (!recipe.projectKinds.includes(projectKind)) {
    throw new XriftMcpEditorToolError(
      "PROJECT_KIND_MISMATCH",
      `このPrefabは${projectKind} projectでは配置できません`,
      { recipeId, projectKind },
    );
  }
  const placement = instantiateBuiltinPrefab(
    context.bundle.scene,
    projectKind,
    recipeId,
    position,
  );
  if (!placement) {
    throw new XriftMcpEditorToolError(
      "PLACEMENT_FAILED",
      "Prefabを配置できませんでした",
      { recipeId },
    );
  }
  const bundle = touchProject(context, { ...context.bundle, scene: placement.scene });
  return {
    changed: true,
    bundle,
    sceneSelection: { kind: "entity", id: placement.entityId },
    assetSelection: null,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      entityId: placement.entityId,
      recipeId,
      recipeName: placement.recipe.name,
      position,
    },
    activity: `AIが「${placement.recipe.name}」をSceneへ配置しました`,
  };
}

function addComponent(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const entityId = requiredString(argumentsValue.entityId, "entityId");
  const definitionId = requiredString(argumentsValue.definitionId, "definitionId");
  const result = addEditorComponent(
    context.bundle.scene,
    context.bundle.assets,
    entityId,
    definitionId,
    context.bundle.project.projectKind,
  );
  if (!result.added) {
    throw new XriftMcpEditorToolError(
      addComponentFailureCode(result.reason),
      addComponentFailureMessage(result.reason),
      { entityId, definitionId, reason: result.reason },
    );
  }
  const bundle = touchProject(context, { ...context.bundle, scene: result.scene });
  return {
    changed: true,
    bundle,
    sceneSelection: { kind: "entity", id: entityId },
    assetSelection: null,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      entityId,
      definitionId,
      componentId: result.componentId,
    },
    activity: `AIが${definitionId}をEntityへ追加しました`,
  };
}

function updateTransform(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const entityId = requiredString(argumentsValue.entityId, "entityId");
  requireEntity(context.bundle.scene, entityId);
  const position = optionalVec3(argumentsValue.position, "position");
  const rotation = optionalVec3(argumentsValue.rotation, "rotation");
  const scale = optionalVec3(argumentsValue.scale, "scale");
  const componentId = optionalString(argumentsValue.componentId);
  if (!position && !rotation && !scale) {
    invalidArgument("position, rotation, scale", "少なくとも1つ");
  }
  const scene = updateEntityTransform(
    context.bundle.scene,
    entityId,
    { position, rotation, scale },
    componentId,
  );
  if (scene === context.bundle.scene) {
    return unchanged(
      context,
      {
        projectId: context.bundle.project.projectId,
        sceneId: context.bundle.scene.sceneId,
        revision: context.revision,
        entityId,
      },
      "Transformはすでに指定された状態です",
    );
  }
  const bundle = touchProject(context, { ...context.bundle, scene });
  return {
    changed: true,
    bundle,
    sceneSelection: { kind: "entity", id: entityId },
    assetSelection: context.assetSelection,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      entityId,
      position,
      rotation,
      scale,
    },
    activity: "AIがTransformを更新しました",
  };
}

function setMaterial(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const entityId = requiredString(argumentsValue.entityId, "entityId");
  const materialAssetId = requiredString(argumentsValue.materialAssetId, "materialAssetId");
  const slot = optionalString(argumentsValue.slot);
  const meshComponentId = optionalString(argumentsValue.meshComponentId);
  const outcome = slot
    ? assignMaterialToMeshSlots(
        context.bundle.scene,
        context.bundle.assets,
        entityId,
        materialAssetId,
        [slot],
        meshComponentId,
      )
    : assignMaterialToPrimaryMeshSlot(
        context.bundle.scene,
        context.bundle.assets,
        entityId,
        materialAssetId,
        meshComponentId,
      );
  if (!outcome.applied) {
    if (outcome.reason === "unchanged") {
      return unchanged(
        context,
        {
          projectId: context.bundle.project.projectId,
          sceneId: context.bundle.scene.sceneId,
          revision: context.revision,
          entityId,
          materialAssetId,
        },
        "Materialはすでに指定された状態です",
      );
    }
    throw new XriftMcpEditorToolError(
      setMaterialFailureCode(outcome.reason),
      setMaterialFailureMessage(outcome.reason),
      { entityId, materialAssetId, slot, reason: outcome.reason },
    );
  }
  const bundle = touchProject(context, { ...context.bundle, scene: outcome.scene });
  return {
    changed: true,
    bundle,
    sceneSelection: { kind: "entity", id: entityId },
    assetSelection: context.assetSelection,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      entityId,
      materialAssetId,
      slots: "slots" in outcome ? outcome.slots : [outcome.slot],
    },
    activity: "AIがMaterialを割り当てました",
  };
}

function renameEntity(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const entityId = requiredString(argumentsValue.entityId, "entityId");
  const name = requiredString(argumentsValue.name, "name");
  requireEntity(context.bundle.scene, entityId);
  const scene = renameEntityInScene(context.bundle.scene, entityId, name);
  if (scene === context.bundle.scene) {
    return unchanged(
      context,
      {
        projectId: context.bundle.project.projectId,
        sceneId: context.bundle.scene.sceneId,
        revision: context.revision,
        entityId,
        name,
      },
      "Entity名はすでに指定された状態です",
    );
  }
  const bundle = touchProject(context, { ...context.bundle, scene });
  return {
    changed: true,
    bundle,
    sceneSelection: { kind: "entity", id: entityId },
    assetSelection: context.assetSelection,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      entityId,
      name,
    },
    activity: `AIがEntityを「${name}」に改名しました`,
  };
}

function duplicateEntity(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const entityId = requiredString(argumentsValue.entityId, "entityId");
  const parentEntityId = optionalNullableString(argumentsValue.parentEntityId, "parentEntityId");
  const position = optionalVec3(argumentsValue.position, "position");
  requireEntity(context.bundle.scene, entityId);
  if (parentEntityId !== null) {
    requireEntity(context.bundle.scene, parentEntityId);
  }
  const duplication = duplicateEntityHierarchy(
    context.bundle.scene,
    [entityId],
    (kind) => createDocumentId(kind),
    parentEntityId,
  );
  if (!duplication) {
    throw new XriftMcpEditorToolError(
      "DUPLICATE_FAILED",
      "Entityを複製できませんでした",
      { entityId, parentEntityId },
    );
  }
  const newEntityId = duplication.clone.rootEntityIds[0];
  const scene = position
    ? updateEntityTransform(duplication.scene, newEntityId, { position })
    : duplication.scene;
  const bundle = touchProject(context, { ...context.bundle, scene });
  return {
    changed: true,
    bundle,
    sceneSelection: { kind: "entity", id: newEntityId },
    assetSelection: null,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      sourceEntityId: entityId,
      entityId: newEntityId,
      parentEntityId,
      position,
    },
    activity: "AIがEntityを複製しました",
  };
}

function deleteEntity(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const entityId = requiredString(argumentsValue.entityId, "entityId");
  const scene = deleteEntityHierarchy(context.bundle.scene, [entityId]);
  if (scene === context.bundle.scene) {
    throw new XriftMcpEditorToolError(
      "ENTITY_NOT_FOUND",
      "指定されたEntityが見つかりません",
      { entityId },
    );
  }
  const wasSelected = context.sceneSelection?.id === entityId;
  const bundle = touchProject(context, { ...context.bundle, scene });
  return {
    changed: true,
    bundle,
    sceneSelection: wasSelected ? null : context.sceneSelection,
    assetSelection: context.assetSelection,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      entityId,
    },
    activity: "AIがEntityを削除しました",
  };
}

function createEmptyEntity(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): XriftMcpEditorToolOutcome {
  assertWritableContext(context, argumentsValue);
  const name = optionalString(argumentsValue.name) ?? "Empty Entity";
  const parentEntityId = optionalNullableString(argumentsValue.parentEntityId, "parentEntityId");
  if (parentEntityId !== null) {
    requireEntity(context.bundle.scene, parentEntityId);
  }
  const created = createEmptySceneEntity(context.bundle.scene, parentEntityId, name);
  if (!created) {
    throw new XriftMcpEditorToolError(
      "PARENT_NOT_FOUND",
      "指定された親Entityが見つかりません",
      { parentEntityId },
    );
  }
  const bundle = touchProject(context, { ...context.bundle, scene: created.scene });
  return {
    changed: true,
    bundle,
    sceneSelection: { kind: "entity", id: created.entityId },
    assetSelection: null,
    result: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      revisionBefore: context.revision,
      revisionAfter: context.revision + 1,
      entityId: created.entityId,
      name,
      parentEntityId,
    },
    activity: "AIが空のEntityを作成しました",
  };
}

function assertWritableContext(
  context: XriftMcpEditorContext,
  argumentsValue: Record<string, unknown>,
): void {
  if (context.editorMode !== "edit") {
    throw new XriftMcpEditorToolError(
      "EDITOR_READ_ONLY",
      "Playを停止してからAI編集を実行してください",
    );
  }
  if (context.importBusy) {
    throw new XriftMcpEditorToolError(
      "EDITOR_BUSY",
      "Asset Importの完了後にAI編集を再試行してください",
    );
  }
  const projectId = requiredString(argumentsValue.projectId, "projectId");
  const sceneId = requiredString(argumentsValue.sceneId, "sceneId");
  const expectedRevision = requiredInteger(
    argumentsValue.expectedRevision,
    "expectedRevision",
  );
  if (projectId !== context.bundle.project.projectId) {
    throw new XriftMcpEditorToolError(
      "PROJECT_MISMATCH",
      "現在開いているProjectと要求されたProjectが一致しません",
      { currentProjectId: context.bundle.project.projectId },
    );
  }
  if (sceneId !== context.bundle.scene.sceneId) {
    throw new XriftMcpEditorToolError(
      "SCENE_MISMATCH",
      "現在開いているSceneと要求されたSceneが一致しません",
      { currentSceneId: context.bundle.scene.sceneId },
    );
  }
  if (expectedRevision !== context.revision) {
    throw new XriftMcpEditorToolError(
      "STALE_REVISION",
      "Sceneが更新されています。最新のEditor contextを取得してください",
      { expectedRevision, currentRevision: context.revision },
    );
  }
}

function applyFogPatch(
  current: SceneFogSettings,
  patch: Record<string, unknown>,
): SceneFogSettings {
  for (const key of Object.keys(patch)) {
    if (!new Set(["enabled", "color", "near", "far"]).has(key)) {
      throw new XriftMcpEditorToolError(
        "INVALID_ARGUMENT",
        `fog.${key}は変更できません`,
      );
    }
  }
  const next: SceneFogSettings = { ...current };
  if (patch.enabled !== undefined) {
    if (typeof patch.enabled !== "boolean") invalidArgument("fog.enabled", "boolean");
    next.enabled = patch.enabled;
  }
  if (patch.color !== undefined) {
    if (typeof patch.color !== "string" || !/^#[0-9a-f]{6}$/i.test(patch.color)) {
      invalidArgument("fog.color", "#rrggbb");
    }
    next.color = patch.color.toLowerCase();
  }
  if (patch.near !== undefined) next.near = finiteNumber(patch.near, "fog.near", 0);
  if (patch.far !== undefined) next.far = finiteNumber(patch.far, "fog.far", 0.001);
  if (next.far <= next.near) {
    throw new XriftMcpEditorToolError(
      "INVALID_ARGUMENT",
      "fog.farはfog.nearより大きい値にしてください",
    );
  }
  return next;
}

function unchanged(
  context: XriftMcpEditorContext,
  result: Record<string, unknown>,
  activity: string,
): XriftMcpEditorToolOutcome {
  return {
    changed: false,
    bundle: context.bundle,
    sceneSelection: context.sceneSelection,
    assetSelection: context.assetSelection,
    result,
    activity,
  };
}

function touchProject(
  context: XriftMcpEditorContext,
  bundle: PrototypeVisualProject,
): PrototypeVisualProject {
  return {
    ...bundle,
    project: {
      ...bundle.project,
      metadata: {
        ...bundle.project.metadata,
        updatedAt: context.now?.() ?? new Date().toISOString(),
      },
    },
  };
}

function sameFog(left: SceneFogSettings, right: SceneFogSettings): boolean {
  return (
    left.enabled === right.enabled &&
    left.color === right.color &&
    left.near === right.near &&
    left.far === right.far
  );
}

function placementFailureMessage(reason: string): string {
  switch (reason) {
    case "asset-missing":
      return "指定されたAssetが見つかりません";
    case "parent-missing":
      return "配置先のEntityが見つかりません";
    case "prefab-document-missing":
    case "prefab-empty":
      return "Prefab documentを読み込めないため配置できません";
    default:
      return "指定されたAssetはSceneへ配置できません";
  }
}

function requireEntity(scene: SceneDocument, entityId: string): SceneEntity {
  const entity = scene.entities[entityId];
  if (!entity) {
    throw new XriftMcpEditorToolError(
      "ENTITY_NOT_FOUND",
      "指定されたEntityが見つかりません",
      { entityId },
    );
  }
  return entity;
}

function addComponentFailureCode(reason?: string): string {
  switch (reason) {
    case "entity-missing":
      return "ENTITY_NOT_FOUND";
    case "definition-missing":
      return "DEFINITION_NOT_FOUND";
    case "project-kind":
      return "PROJECT_KIND_MISMATCH";
    case "duplicate":
      return "DUPLICATE_COMPONENT";
    case "dependency-missing":
      return "DEPENDENCY_MISSING";
    default:
      return "COMPONENT_NOT_ADDED";
  }
}

function addComponentFailureMessage(reason?: string): string {
  switch (reason) {
    case "entity-missing":
      return "指定されたEntityが見つかりません";
    case "definition-missing":
      return "指定されたComponentの定義が見つかりません";
    case "project-kind":
      return "このComponentは現在のProject種別では追加できません";
    case "duplicate":
      return "同じComponentが既に追加されています";
    case "dependency-missing":
      return "依存する条件が満たされていないため追加できません";
    default:
      return "Componentを追加できませんでした";
  }
}

function setMaterialFailureCode(reason: string): string {
  switch (reason) {
    case "entity-missing":
      return "ENTITY_NOT_FOUND";
    case "mesh-missing":
      return "MESH_NOT_FOUND";
    case "material-missing":
      return "MATERIAL_NOT_FOUND";
    case "slot-missing":
      return "SLOT_NOT_FOUND";
    default:
      return "MATERIAL_NOT_APPLIED";
  }
}

function setMaterialFailureMessage(reason: string): string {
  switch (reason) {
    case "entity-missing":
      return "指定されたEntityが見つかりません";
    case "mesh-missing":
      return "指定されたEntityにMeshがありません";
    case "material-missing":
      return "指定されたMaterial Assetが見つかりません";
    case "slot-missing":
      return "指定されたMaterial slotが見つかりません";
    default:
      return "Materialを割り当てられませんでした";
  }
}

function recordValue(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalidArgument(name, "object");
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) invalidArgument(name, "non-empty string");
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredEnum<T extends string>(
  value: unknown,
  name: string,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    invalidArgument(name, allowed.join(" | "));
  }
  return value as T;
}

function optionalNullableString(value: unknown, name: string): string | null {
  if (value === undefined || value === null) return null;
  return requiredString(value, name);
}

function requiredInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    invalidArgument(name, "non-negative integer");
  }
  return value;
}

function optionalVec3(value: unknown, name: string): Vec3 | undefined {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))
  ) {
    invalidArgument(name, "[x, y, z]");
  }
  return [value[0] as number, value[1] as number, value[2] as number];
}

function finiteNumber(value: unknown, name: string, minimum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    invalidArgument(name, `number >= ${minimum}`);
  }
  return value;
}

function invalidArgument(name: string, expected: string): never {
  throw new XriftMcpEditorToolError(
    "INVALID_ARGUMENT",
    `${name}は${expected}で指定してください`,
  );
}
