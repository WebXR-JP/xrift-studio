import { createDefaultParticleAsset } from "./particle-system";
import { createPrototypeProject } from "./prototype-project";
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
  const bundle = {
    ...initial,
    assets: {
      ...initial.assets,
      assets: { ...initial.assets.assets, [particle.id]: particle },
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
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`XRift MCP fixture failed: ${message}`);
}
