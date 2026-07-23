import {
  ASSET_MANIFEST_SCHEMA_VERSION,
  type AssetManifest,
} from "./asset-manifest";
import {
  SCENE_DOCUMENT_SCHEMA_VERSION,
  createTransformComponent,
  type SceneDocument,
  type SceneEntity,
} from "./scene-document";
import { createPlaySession, synchronizePlaySession } from "./play-session";

export function runPlaySessionFixtureAssertions(): void {
  const source = fixtureScene();
  const assets = fixtureAssets();
  const started = createPlaySession(source, assets);
  assert(started.runtimeScene !== source, "Play must render an isolated Scene copy");
  assert(
    started.runtimeScene.entities["entity-a"] !== source.entities["entity-a"],
    "Play must not share authoring Entity objects",
  );
  assert(started.runtimeAssets !== assets, "Play must isolate Asset inputs");

  const changed = fixtureScene();
  const transform = changed.entities["entity-a"]?.components[0];
  if (transform?.type === "transform") transform.position = [4, 5, 6];
  const synchronized = synchronizePlaySession(started, changed, assets);

  assert(
    synchronized.entityRevisions["entity-a"] === 1,
    "Changed Entity must receive a new runtime revision",
  );
  assert(
    synchronized.entityRevisions["entity-b"] === 0,
    "Unchanged Entity must retain its runtime revision",
  );
  assert(
    synchronized.lastReloads.length === 1 &&
      synchronized.lastReloads[0]?.entityId === "entity-a",
    "Only the changed Entity must be scheduled for restart",
  );
  assert(
    synchronizePlaySession(synchronized, changed, assets) === synchronized,
    "Unchanged authoring input must not advance the Play session",
  );
}

function fixtureAssets(): AssetManifest {
  return {
    schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
    assets: {},
  };
}

function fixtureScene(): SceneDocument {
  return {
    schemaVersion: SCENE_DOCUMENT_SCHEMA_VERSION,
    sceneId: "play-session-fixture",
    name: "Play session fixture",
    rootEntityIds: ["entity-a", "entity-b"],
    entities: {
      "entity-a": entity("entity-a"),
      "entity-b": entity("entity-b"),
    },
  };
}

function entity(id: string): SceneEntity {
  return {
    id,
    name: id,
    parentId: null,
    children: [],
    enabled: true,
    components: [createTransformComponent(`transform-${id}`)],
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Play session fixture failed: ${message}`);
}
