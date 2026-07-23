import { createDefaultParticleAsset } from "./particle-system";
import { BUILTIN_ASSET_IDS, createPrototypeProject } from "./prototype-project";
import { createTextureAsset } from "./asset-manifest";
import {
  executeXriftMcpEditorTool,
  XriftMcpEditorToolError,
  type XriftMcpEditorContext,
} from "./mcp-editor-tools";

export function runXriftMcpEditorToolFixtures(): void {
  const initial = createPrototypeProject("world", "mcp-fixture");
  const particle = createDefaultParticleAsset({
    id: "asset-mcp-particle",
    name: "MCP Fireflies",
  });
  assert(particle, "Particle fixture could not be created");
  const texture = createTextureAsset({
    id: "asset-mcp-texture",
    name: "MCP Grid",
    source: { kind: "document" },
    importSettings: {},
  });
  assert(texture, "Texture fixture could not be created");
  const bundle = {
    ...initial,
    assets: {
      ...initial.assets,
      assets: {
        ...initial.assets.assets,
        [particle.id]: particle,
        [texture.id]: texture,
      },
    },
  };
  const context: XriftMcpEditorContext = {
    bundle,
    sceneSelection: null,
    assetSelection: null,
    editorMode: "edit",
    importBusy: false,
    revision: 4,
    saveStatus: "saved",
    now: () => "2026-07-21T00:00:00.000Z",
  };

  const fogResult = executeXriftMcpEditorTool(context, {
    id: "fixture-fog",
    tool: "update_scene_settings",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: 4,
      fog: { enabled: false },
    },
  });

  const editorContext = executeXriftMcpEditorTool(context, {
    id: "fixture-context",
    tool: "get_editor_context",
    arguments: {},
  });
  assert(
    typeof (editorContext.result.sceneSettings as { fog?: unknown })?.fog ===
      "object",
    "Editor context should expose current Fog settings",
  );
  assert(fogResult.changed, "Fog edit should change the bundle");
  assert(
    fogResult.bundle.scene.settings?.fog.enabled === false,
    "Fog edit should disable Fog",
  );
  assert(
    context.bundle.scene.settings?.fog.enabled !== false,
    "Fog edit must not mutate the input bundle",
  );

  const placed = executeXriftMcpEditorTool(
    { ...context, bundle: fogResult.bundle, revision: 5 },
    {
      id: "fixture-place",
      tool: "place_asset",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: 5,
        assetId: particle.id,
        position: [2, 1, -3],
      },
    },
  );
  assert(placed.changed, "Asset placement should change the bundle");
  assert(placed.sceneSelection, "Placed Entity should become selected");
  assert(
    placed.bundle.scene.entities[placed.sceneSelection.id]?.components.some(
      (component) =>
        component.type === "particle-emitter" &&
        component.particleAssetId === particle.id,
    ),
    "Placed Entity should reference the requested Asset",
  );

  let staleCode: string | undefined;
  try {
    executeXriftMcpEditorTool(context, {
      id: "fixture-stale",
      tool: "update_scene_settings",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: 3,
        fog: { enabled: false },
      },
    });
  } catch (error) {
    staleCode = error instanceof XriftMcpEditorToolError ? error.code : undefined;
  }
  assert(staleCode === "STALE_REVISION", "Stale write should be rejected");

  let current: XriftMcpEditorContext = { ...context, bundle: placed.bundle, revision: 6 };

  const entityList = executeXriftMcpEditorTool(current, {
    id: "fixture-list-entities",
    tool: "list_entities",
    arguments: {},
  });
  const listedEntities = entityList.result.entities as Array<{ id: string }>;
  assert(
    listedEntities.some((entity) => entity.id === placed.sceneSelection?.id),
    "list_entities should include the previously placed Entity",
  );

  const primitiveCreated = executeXriftMcpEditorTool(current, {
    id: "fixture-create-primitive",
    tool: "create_primitive",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      shape: "box",
      materialAssetId: BUILTIN_ASSET_IDS.material.blue,
      position: [1, 1, 1],
    },
  });
  assert(primitiveCreated.changed, "create_primitive should change the bundle");
  const primitiveId = primitiveCreated.sceneSelection?.id;
  assert(typeof primitiveId === "string", "create_primitive should select the new Entity");
  assert(
    primitiveCreated.bundle.scene.entities[primitiveId as string]?.components.some(
      (component) => component.type === "mesh",
    ),
    "Created primitive should have a Mesh component",
  );
  current = { ...current, bundle: primitiveCreated.bundle, revision: current.revision + 1 };

  const componentAdded = executeXriftMcpEditorTool(current, {
    id: "fixture-add-component",
    tool: "add_component",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      entityId: primitiveId,
      definitionId: "xrift.interactable",
    },
  });
  assert(componentAdded.changed, "add_component should change the bundle");
  assert(
    componentAdded.bundle.scene.entities[primitiveId as string]?.components.some(
      (component) =>
        component.type === "xrift-component" && component.schemaId === "xrift.interactable",
    ),
    "Entity should gain an Interactable component",
  );
  current = { ...current, bundle: componentAdded.bundle, revision: current.revision + 1 };

  const transformUpdated = executeXriftMcpEditorTool(current, {
    id: "fixture-update-transform",
    tool: "update_transform",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      entityId: primitiveId,
      position: [9, 9, 9],
    },
  });
  assert(transformUpdated.changed, "update_transform should change the bundle");
  current = { ...current, bundle: transformUpdated.bundle, revision: current.revision + 1 };

  const materialSet = executeXriftMcpEditorTool(current, {
    id: "fixture-set-material",
    tool: "set_material",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      entityId: primitiveId,
      materialAssetId: BUILTIN_ASSET_IDS.material.orange,
    },
  });
  assert(materialSet.changed, "set_material should change the bundle");
  current = { ...current, bundle: materialSet.bundle, revision: current.revision + 1 };

  const materialUpdated = executeXriftMcpEditorTool(current, {
    id: "fixture-update-material",
    tool: "update_material_asset",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      materialAssetId: BUILTIN_ASSET_IDS.material.orange,
      patch: {
        pbrMetallicRoughness: {
          roughnessFactor: 0.4,
          baseColorTexture: { textureAssetId: texture.id, texCoord: 0 },
        },
      },
    },
  });
  assert(materialUpdated.changed, "update_material_asset should change the Material");
  current = {
    ...current,
    bundle: materialUpdated.bundle,
    revision: current.revision + 1,
  };

  const textureTransformUpdated = executeXriftMcpEditorTool(current, {
    id: "fixture-material-tiling",
    tool: "set_material_texture_transform",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      materialAssetId: BUILTIN_ASSET_IDS.material.orange,
      slot: "baseColor",
      scale: [3, 2],
      offset: [0.25, 0],
    },
  });
  assert(
    JSON.stringify(
      (
        textureTransformUpdated.result.texture as {
          transform?: { scale?: number[] };
        }
      ).transform?.scale,
    ) === JSON.stringify([3, 2]),
    "Material tiling should be authored as KHR_texture_transform scale",
  );
  current = {
    ...current,
    bundle: textureTransformUpdated.bundle,
    revision: current.revision + 1,
  };

  const renamed = executeXriftMcpEditorTool(current, {
    id: "fixture-rename",
    tool: "rename_entity",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      entityId: primitiveId,
      name: "MCP Fixture Box",
    },
  });
  assert(renamed.changed, "rename_entity should change the bundle");
  assert(
    renamed.bundle.scene.entities[primitiveId as string]?.name === "MCP Fixture Box",
    "Entity should be renamed",
  );
  current = { ...current, bundle: renamed.bundle, revision: current.revision + 1 };

  const duplicated = executeXriftMcpEditorTool(current, {
    id: "fixture-duplicate",
    tool: "duplicate_entity",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      entityId: primitiveId,
      position: [2, 2, 2],
    },
  });
  assert(duplicated.changed, "duplicate_entity should change the bundle");
  const duplicateId = duplicated.sceneSelection?.id;
  assert(
    typeof duplicateId === "string" && duplicateId !== primitiveId,
    "Duplicate should get a new Entity ID",
  );
  current = { ...current, bundle: duplicated.bundle, revision: current.revision + 1 };

  const prefabPlaced = executeXriftMcpEditorTool(current, {
    id: "fixture-prefab",
    tool: "place_builtin_prefab",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      recipeId: "xrift-prefab.spawn-point",
    },
  });
  assert(prefabPlaced.changed, "place_builtin_prefab should change the bundle");
  current = { ...current, bundle: prefabPlaced.bundle, revision: current.revision + 1 };

  const emptyCreated = executeXriftMcpEditorTool(current, {
    id: "fixture-empty",
    tool: "create_empty_entity",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      name: "MCP Group",
    },
  });
  assert(emptyCreated.changed, "create_empty_entity should change the bundle");
  current = { ...current, bundle: emptyCreated.bundle, revision: current.revision + 1 };

  const deleted = executeXriftMcpEditorTool(current, {
    id: "fixture-delete",
    tool: "delete_entity",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      entityId: duplicateId,
    },
  });
  assert(deleted.changed, "delete_entity should change the bundle");
  assert(
    !deleted.bundle.scene.entities[duplicateId as string],
    "Deleted Entity should be removed from the Scene",
  );
  current = { ...current, bundle: deleted.bundle, revision: current.revision + 1 };

  const interactivityCreated = executeXriftMcpEditorTool(current, {
    id: "fixture-interactivity-create",
    tool: "create_interactivity_asset",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      name: "MCP Animation Graph",
      template: "empty",
    },
  });
  const interactivityAssetId = interactivityCreated.result.assetId as string;
  assert(interactivityCreated.changed, "create_interactivity_asset should create an Asset");
  current = {
    ...current,
    bundle: interactivityCreated.bundle,
    revision: current.revision + 1,
  };

  const onStartAdded = executeXriftMcpEditorTool(current, {
    id: "fixture-interactivity-on-start",
    tool: "add_interactivity_node",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      assetId: interactivityAssetId,
      op: "event/onStart",
      position: [80, 120],
    },
  });
  assert(onStartAdded.result.nodeIndex === 0, "onStart should be the first graph node");
  current = { ...current, bundle: onStartAdded.bundle, revision: current.revision + 1 };

  const animationAdded = executeXriftMcpEditorTool(current, {
    id: "fixture-interactivity-animation",
    tool: "add_interactivity_node",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      assetId: interactivityAssetId,
      op: "animation/start",
      position: [420, 120],
    },
  });
  assert(animationAdded.result.nodeIndex === 1, "animation/start should be the second graph node");
  current = { ...current, bundle: animationAdded.bundle, revision: current.revision + 1 };

  const pointerAdded = executeXriftMcpEditorTool(current, {
    id: "fixture-interactivity-pointer",
    tool: "add_interactivity_node",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      assetId: interactivityAssetId,
      op: "pointer/interpolate",
      position: [420, 360],
    },
  });
  assert(pointerAdded.result.nodeIndex === 2, "pointer/interpolate should be the third node");
  current = { ...current, bundle: pointerAdded.bundle, revision: current.revision + 1 };

  const pointerConfigured = executeXriftMcpEditorTool(current, {
    id: "fixture-interactivity-material-pointer",
    tool: "configure_interactivity_material_pointer",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      assetId: interactivityAssetId,
      nodeIndex: 2,
      materialAssetId: BUILTIN_ASSET_IDS.material.orange,
      presetId: "base-color-tiling",
    },
  });
  assert(
    (pointerConfigured.result.preset as { pointer?: string }).pointer?.includes(
      "KHR_texture_transform/scale",
    ),
    "Interactivity material target should use the official texture transform pointer",
  );
  current = {
    ...current,
    bundle: pointerConfigured.bundle,
    revision: current.revision + 1,
  };

  const graphConnected = executeXriftMcpEditorTool(current, {
    id: "fixture-interactivity-connect",
    tool: "connect_interactivity_nodes",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      assetId: interactivityAssetId,
      kind: "flow",
      sourceNode: 0,
      sourceSocket: "out",
      targetNode: 1,
      targetSocket: "in",
    },
  });
  current = { ...current, bundle: graphConnected.bundle, revision: current.revision + 1 };

  const speedUpdated = executeXriftMcpEditorTool(current, {
    id: "fixture-interactivity-value",
    tool: "set_interactivity_value",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      assetId: interactivityAssetId,
      nodeIndex: 1,
      socket: "speed",
      signature: "float",
      value: [1.5],
    },
  });
  current = { ...current, bundle: speedUpdated.bundle, revision: current.revision + 1 };

  const graphValidation = executeXriftMcpEditorTool(current, {
    id: "fixture-interactivity-validate",
    tool: "validate_interactivity_asset",
    arguments: { assetId: interactivityAssetId },
  });
  assert(graphValidation.result.valid === true, "MCP-authored KHR graph should validate");
  assert(graphValidation.result.nodeCount === 3, "MCP graph should retain all nodes");

  let cycleCode: string | undefined;
  try {
    executeXriftMcpEditorTool(current, {
      id: "fixture-interactivity-cycle",
      tool: "connect_interactivity_nodes",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: current.revision,
        assetId: interactivityAssetId,
        kind: "flow",
        sourceNode: 1,
        sourceSocket: "done",
        targetNode: 0,
        targetSocket: "in",
      },
    });
  } catch (error) {
    cycleCode = error instanceof XriftMcpEditorToolError ? error.code : undefined;
  }
  assert(
    cycleCode === "INTERACTIVITY_VALIDATION_FAILED",
    "MCP graph writes should reject flow cycles atomically",
  );

  let missingEntityCode: string | undefined;
  try {
    executeXriftMcpEditorTool(current, {
      id: "fixture-delete-missing",
      tool: "delete_entity",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: current.revision,
        entityId: "entity-does-not-exist",
      },
    });
  } catch (error) {
    missingEntityCode = error instanceof XriftMcpEditorToolError ? error.code : undefined;
  }
  assert(
    missingEntityCode === "ENTITY_NOT_FOUND",
    "Deleting an unknown Entity should be rejected",
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`XRift MCP fixture failed: ${message}`);
}
