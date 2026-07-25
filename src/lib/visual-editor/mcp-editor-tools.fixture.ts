import { createDefaultParticleAsset } from "./particle-system";
import { BUILTIN_ASSET_IDS, createPrototypeProject } from "./prototype-project";
import { createTextureAsset } from "./asset-manifest";
import { createScriptAsset } from "./scripting/script-files";
import { extractScriptContract } from "./scripting/script-contract";
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
  const script = createScriptAsset(
    "asset-mcp-script",
    "MCP Script",
    "scripts/mcp-script.ts",
  );
  const bundle = {
    ...initial,
    assets: {
      ...initial.assets,
      assets: {
        ...initial.assets.assets,
        [particle.id]: particle,
        [texture.id]: texture,
        [script.id]: script,
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
    scriptContracts: {
      [script.id]: extractScriptContract(`
        import { defineScript, prop } from "xrift:script";
        export default defineScript({
          name: "MCP Script",
          props: {
            speed: prop.number({ default: 2, min: 0, max: 10 }),
            axis: prop.vec3({ default: [0, 1, 0] }),
            tint: prop.color({ default: "#ffffff" }),
          },
        });
      `),
    },
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
  const scriptingCapabilities = executeXriftMcpEditorTool(context, {
    id: "fixture-scripting-capabilities",
    tool: "get_scripting_capabilities",
    arguments: {},
  });
  assert(
    typeof (editorContext.result.sceneSettings as { fog?: unknown })?.fog ===
      "object",
    "Editor context should expose current Fog settings",
  );
  assert(
    (
      scriptingCapabilities.result.runtime as {
        assets?: { methods?: string[] };
      }
    )?.assets?.methods?.some((method) => method.includes("loadTexture")),
    "Scripting capabilities should expose runtime Texture loading",
  );
  assert(
    (
      scriptingCapabilities.result.persistentAuthoring as {
        tools?: string[];
      }
    )?.tools?.includes("update_material_asset"),
    "Scripting capabilities should distinguish persistent Material authoring",
  );
  assert(
    (
      scriptingCapabilities.result.runtime as {
        materials?: { methods?: string[] };
      }
    )?.materials?.methods?.some((method) => method.includes("materials.select")),
    "Scripting capabilities should expose Material slot selection",
  );
  assert(
    (
      scriptingCapabilities.result.runtime as {
        particles?: { methods?: string[] };
      }
    )?.particles?.methods?.some((method) => method.includes("particles.restart")),
    "Scripting capabilities should expose runtime Particle controls",
  );
  assert(
    (
      scriptingCapabilities.result.runtime as {
        lifecycle?: { methods?: string[] };
      }
    )?.lifecycle?.methods?.some((method) => method.includes("lifecycle.task")),
    "Scripting capabilities should expose managed lifecycle tasks",
  );
  assert(
    scriptingCapabilities.result.sandboxed === false &&
      scriptingCapabilities.result.trustGate === false &&
      typeof (
        scriptingCapabilities.result.trustBoundary as {
          clientRule?: unknown;
        }
      )?.clientRule === "string",
    "Scripting capabilities must not claim a sandbox or trust gate",
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
  const placedEntityId = placed.sceneSelection?.id;
  assert(
    typeof placedEntityId === "string",
    "Placed Particle Asset should expose its Entity ID",
  );

  const componentDefinitions = executeXriftMcpEditorTool(current, {
    id: "fixture-component-definitions",
    tool: "list_component_definitions",
    arguments: {},
  });
  assert(
    (
      componentDefinitions.result.definitions as Array<{
        id: string;
        supportedInProject: boolean;
      }>
    ).some(
      (definition) =>
        definition.id === "physics.rigid-body" &&
        definition.supportedInProject,
    ),
    "Component definitions should be generated from the central registry",
  );

  const materialCreated = executeXriftMcpEditorTool(current, {
    id: "fixture-create-document-material",
    tool: "create_document_asset",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      kind: "material",
      name: "MCP Authored Material",
    },
  });
  assert(
    (materialCreated.result.asset as { kind?: string }).kind === "material",
    "create_document_asset should create a Material",
  );
  current = {
    ...current,
    bundle: materialCreated.bundle,
    revision: current.revision + 1,
  };

  const particleCreated = executeXriftMcpEditorTool(current, {
    id: "fixture-create-document-particle",
    tool: "create_document_asset",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      kind: "particle",
      name: "MCP Authored Particle",
    },
  });
  const authoredParticleId = (
    particleCreated.result.asset as { id?: string }
  ).id;
  assert(
    typeof authoredParticleId === "string",
    "create_document_asset should return the Particle Asset ID",
  );
  current = {
    ...current,
    bundle: particleCreated.bundle,
    revision: current.revision + 1,
  };

  const particleRead = executeXriftMcpEditorTool(current, {
    id: "fixture-get-particle",
    tool: "get_particle_asset",
    arguments: { particleAssetId: authoredParticleId },
  });
  assert(
    (
      particleRead.result.particleAsset as {
        properties?: { emission?: { rateOverTime?: number } };
      }
    ).properties?.emission?.rateOverTime === 28,
    "get_particle_asset should expose normalized authoring properties",
  );

  const particleUpdated = executeXriftMcpEditorTool(current, {
    id: "fixture-update-particle",
    tool: "update_particle_asset",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      particleAssetId: authoredParticleId,
      patch: {
        emission: { rateOverTime: 64 },
        startSize: { min: 0.2, max: 0.4 },
      },
    },
  });
  assert(
    (
      particleUpdated.result.properties as {
        emission?: { rateOverTime?: number };
      }
    ).emission?.rateOverTime === 64,
    "update_particle_asset should persist Particle properties",
  );
  current = {
    ...current,
    bundle: particleUpdated.bundle,
    revision: current.revision + 1,
  };

  const placedComponents = executeXriftMcpEditorTool(current, {
    id: "fixture-get-placed-components",
    tool: "get_entity_components",
    arguments: { entityId: placedEntityId },
  });
  const placedParticleComponent = (
    placedComponents.result.components as Array<{
      id: string;
      type: string;
      definitionId: string | null;
    }>
  ).find((component) => component.type === "particle-emitter");
  assert(
    placedParticleComponent?.definitionId === "core.particle",
    "get_entity_components should include stable definition IDs",
  );

  const particleEmitterUpdated = executeXriftMcpEditorTool(
    { ...current, editorMode: "play" },
    {
      id: "fixture-update-particle-emitter",
      tool: "update_component",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: current.revision,
        entityId: placedEntityId,
        componentId: placedParticleComponent?.id,
        patch: { particleAssetId: authoredParticleId },
      },
    },
  );
  assert(
    particleEmitterUpdated.result.synchronizedDuringPlay === true &&
      (
        particleEmitterUpdated.result.component as {
          particleAssetId?: string;
        }
      ).particleAssetId === authoredParticleId,
    "update_component should synchronize Particle Emitter references during Play",
  );
  current = {
    ...current,
    bundle: particleEmitterUpdated.bundle,
    revision: current.revision + 1,
  };

  const entityDisabled = executeXriftMcpEditorTool(
    { ...current, editorMode: "play" },
    {
      id: "fixture-disable-entity",
      tool: "set_entity_enabled",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: current.revision,
        entityId: placedEntityId,
        enabled: false,
      },
    },
  );
  assert(
    entityDisabled.result.synchronizedDuringPlay === true &&
      entityDisabled.bundle.scene.entities[placedEntityId]?.enabled === false,
    "set_entity_enabled should persist and synchronize during Play",
  );
  current = {
    ...current,
    bundle: entityDisabled.bundle,
    revision: current.revision + 1,
  };

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

  const rigidBodyAdded = executeXriftMcpEditorTool(current, {
    id: "fixture-add-rigid-body",
    tool: "add_component",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      entityId: primitiveId,
      definitionId: "physics.rigid-body",
    },
  });
  const rigidBodyComponentId = rigidBodyAdded.result.componentId as string;
  assert(
    typeof rigidBodyComponentId === "string",
    "add_component should return the Rigid Body Component ID",
  );
  current = {
    ...current,
    bundle: rigidBodyAdded.bundle,
    revision: current.revision + 1,
  };

  const rigidBodyUpdated = executeXriftMcpEditorTool(
    { ...current, editorMode: "play" },
    {
      id: "fixture-update-rigid-body",
      tool: "update_component",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: current.revision,
        entityId: primitiveId,
        componentId: rigidBodyComponentId,
        patch: {
          bodyType: "kinematicPosition",
          gravityScale: 0,
          ccd: true,
        },
      },
    },
  );
  assert(
    rigidBodyUpdated.result.synchronizedDuringPlay === true &&
      (
        rigidBodyUpdated.result.component as {
          bodyType?: string;
          ccd?: boolean;
        }
      ).bodyType === "kinematicPosition" &&
      (
        rigidBodyUpdated.result.component as {
          ccd?: boolean;
        }
      ).ccd === true,
    "update_component should dispatch to the Rigid Body patch helper",
  );
  current = {
    ...current,
    bundle: rigidBodyUpdated.bundle,
    revision: current.revision + 1,
  };

  const rigidBodyRemoved = executeXriftMcpEditorTool(
    { ...current, editorMode: "play" },
    {
      id: "fixture-remove-rigid-body",
      tool: "remove_component",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: current.revision,
        entityId: primitiveId,
        componentId: rigidBodyComponentId,
      },
    },
  );
  assert(
    rigidBodyRemoved.result.synchronizedDuringPlay === true &&
      !rigidBodyRemoved.bundle.scene.entities[
        primitiveId as string
      ]?.components.some((component) => component.id === rigidBodyComponentId),
    "remove_component should remove non-Transform Components during Play",
  );
  current = {
    ...current,
    bundle: rigidBodyRemoved.bundle,
    revision: current.revision + 1,
  };

  const primitiveComponents = executeXriftMcpEditorTool(current, {
    id: "fixture-get-primitive-components",
    tool: "get_entity_components",
    arguments: { entityId: primitiveId },
  });
  const transformComponentId = (
    primitiveComponents.result.components as Array<{
      id: string;
      type: string;
    }>
  ).find((component) => component.type === "transform")?.id;
  let transformRemoveCode: string | undefined;
  try {
    executeXriftMcpEditorTool(current, {
      id: "fixture-remove-transform",
      tool: "remove_component",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: current.revision,
        entityId: primitiveId,
        componentId: transformComponentId,
      },
    });
  } catch (error) {
    transformRemoveCode =
      error instanceof XriftMcpEditorToolError ? error.code : undefined;
  }
  assert(
    transformRemoveCode === "TRANSFORM_COMPONENT_REQUIRED",
    "remove_component should protect the required Transform",
  );

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

  const scriptAdded = executeXriftMcpEditorTool(current, {
    id: "fixture-add-script",
    tool: "add_component",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      entityId: primitiveId,
      definitionId: "scripting.script",
      scriptAssetId: script.id,
    },
  });
  assert(scriptAdded.changed, "add_component should add a Script Component");
  assert(
    scriptAdded.bundle.scene.entities[primitiveId as string]?.components.some(
      (component) =>
        component.type === "script" &&
        component.scriptAssetId === script.id &&
        component.properties.speed === 2 &&
        JSON.stringify(component.properties.axis) === "[0,1,0]",
    ),
    "Script Component should reference the requested Script and persist its declared defaults",
  );
  const scriptComponent = scriptAdded.bundle.scene.entities[
    primitiveId as string
  ]?.components.find((component) => component.type === "script");
  assert(scriptComponent, "Added Script Component should be readable");
  current = {
    ...current,
    bundle: scriptAdded.bundle,
    revision: current.revision + 1,
  };

  let genericScriptUpdateCode: string | undefined;
  try {
    executeXriftMcpEditorTool(current, {
      id: "fixture-generic-script-update",
      tool: "update_component",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: current.revision,
        entityId: primitiveId,
        componentId: scriptComponent?.id,
        patch: { properties: { speed: 2 } },
      },
    });
  } catch (error) {
    genericScriptUpdateCode =
      error instanceof XriftMcpEditorToolError ? error.code : undefined;
  }
  assert(
    genericScriptUpdateCode === "USE_UPDATE_SCRIPT_COMPONENT",
    "Generic Script property edits should direct MCP clients to update_script_component",
  );

  let missingReferenceCode: string | undefined;
  try {
    executeXriftMcpEditorTool(current, {
      id: "fixture-missing-script-reference",
      tool: "update_script_component",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: current.revision,
        entityId: primitiveId,
        componentId: scriptComponent?.id,
        assetReferences: ["asset-does-not-exist"],
      },
    });
  } catch (error) {
    missingReferenceCode =
      error instanceof XriftMcpEditorToolError ? error.code : undefined;
  }
  assert(
    missingReferenceCode === "ASSET_NOT_FOUND",
    "MCP should reject missing Asset IDs before changing Script references",
  );

  for (const [properties, label] of [
    [{ speed: 99 }, "number range"],
    [{ tint: "red" }, "color format"],
  ] as const) {
    let invalidPropertyCode: string | undefined;
    try {
      executeXriftMcpEditorTool(current, {
        id: `fixture-invalid-script-${label}`,
        tool: "update_script_component",
        arguments: {
          projectId: bundle.project.projectId,
          sceneId: bundle.scene.sceneId,
          expectedRevision: current.revision,
          entityId: primitiveId,
          componentId: scriptComponent?.id,
          properties,
        },
      });
    } catch (error) {
      invalidPropertyCode =
        error instanceof XriftMcpEditorToolError ? error.code : undefined;
    }
    assert(
      invalidPropertyCode === "SCRIPT_PROPERTY_TYPE_MISMATCH",
      `MCP should reject an invalid Script ${label}`,
    );
  }

  const scriptPropertyUpdated = executeXriftMcpEditorTool(
    { ...current, editorMode: "play" },
    {
      id: "fixture-update-script-property",
      tool: "update_script_component",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: current.revision,
        entityId: primitiveId,
        componentId: scriptComponent?.id,
        properties: { speed: 4.5 },
        assetReferences: [texture.id],
        entityReferences: [primitiveId],
      },
    },
  );
  assert(
    scriptPropertyUpdated.result.restartedDuringPlay === true,
    "Play-time Script property edits should report an Entity restart",
  );
  assert(
    scriptPropertyUpdated.bundle.scene.entities[
      primitiveId as string
    ]?.components.some(
      (component) =>
        component.type === "script" &&
        component.properties.speed === 4.5,
    ),
    "Play-time Script property edits should update authoring data",
  );
  assert(
    scriptPropertyUpdated.bundle.scene.entities[
      primitiveId as string
    ]?.components.some(
      (component) =>
        component.type === "script" &&
        component.assetReferences.includes(texture.id) &&
        component.entityReferences.includes(primitiveId as string),
    ),
    "MCP should declare the Asset and Entity references used by Script APIs",
  );
  current = {
    ...current,
    bundle: scriptPropertyUpdated.bundle,
    revision: current.revision + 1,
  };

  const liveScriptPropertyUpdated = executeXriftMcpEditorTool(
    { ...current, editorMode: "play" },
    {
      id: "fixture-update-live-script-property",
      tool: "update_script_component",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: current.revision,
        entityId: primitiveId,
        componentId: scriptComponent?.id,
        properties: { speed: 6 },
      },
    },
  );
  assert(
    liveScriptPropertyUpdated.result.restartedDuringPlay === false &&
      liveScriptPropertyUpdated.result.appliedOnNextFrame === true,
    "Property-only MCP edits should preserve the running Script instance",
  );
  current = {
    ...current,
    bundle: liveScriptPropertyUpdated.bundle,
    revision: current.revision + 1,
  };

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

  const emptyCreated = executeXriftMcpEditorTool(
    { ...current, editorMode: "play" },
    {
    id: "fixture-empty",
    tool: "create_empty_entity",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      name: "MCP Group",
    },
    },
  );
  assert(emptyCreated.changed, "create_empty_entity should change the bundle");
  const emptyId = emptyCreated.sceneSelection?.id;
  current = { ...current, bundle: emptyCreated.bundle, revision: current.revision + 1 };

  const reparented = executeXriftMcpEditorTool(
    { ...current, editorMode: "play" },
    {
      id: "fixture-reparent",
      tool: "reparent_entity",
      arguments: {
        projectId: bundle.project.projectId,
        sceneId: bundle.scene.sceneId,
        expectedRevision: current.revision,
        entityId: duplicateId,
        parentEntityId: emptyId,
      },
    },
  );
  assert(
    reparented.result.synchronizedDuringPlay === true &&
      reparented.bundle.scene.entities[duplicateId as string]?.parentId ===
        emptyId,
    "reparent_entity should synchronize Hierarchy changes during Play",
  );
  current = {
    ...current,
    bundle: reparented.bundle,
    revision: current.revision + 1,
  };

  const deleted = executeXriftMcpEditorTool(
    { ...current, editorMode: "play" },
    {
    id: "fixture-delete",
    tool: "delete_entity",
    arguments: {
      projectId: bundle.project.projectId,
      sceneId: bundle.scene.sceneId,
      expectedRevision: current.revision,
      entityId: duplicateId,
    },
    },
  );
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
