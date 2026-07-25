import {
  ASSET_MANIFEST_SCHEMA_VERSION,
  type AssetManifest,
} from "./asset-manifest";
import {
  SCENE_DOCUMENT_SCHEMA_VERSION,
  createTransformComponent,
  type ParticleEmitterComponent,
  type SceneDocument,
  type SceneEntity,
} from "./scene-document";
import { createDefaultParticleAsset } from "./particle-system";
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

  const scriptPropertySource = fixtureScene();
  scriptPropertySource.entities["entity-a"]?.components.push({
    id: "script-entity-a",
    type: "script",
    enabled: true,
    scriptAssetId: "asset-script",
    contractVersion: "1.0.0",
    properties: { speed: 1 },
    assetReferences: [],
    entityReferences: [],
    runIn: "play",
  });
  const scriptPropertySession = createPlaySession(
    scriptPropertySource,
    assets,
  );
  const scriptPropertyChanged = fixtureScene();
  scriptPropertyChanged.entities["entity-a"]?.components.push({
    id: "script-entity-a",
    type: "script",
    enabled: true,
    scriptAssetId: "asset-script",
    contractVersion: "1.0.0",
    properties: { speed: 8 },
    assetReferences: [],
    entityReferences: [],
    runIn: "play",
  });
  const livePropertyUpdate = synchronizePlaySession(
    scriptPropertySession,
    scriptPropertyChanged,
    assets,
  );
  assert(
    livePropertyUpdate.entityRevisions["entity-a"] === 0 &&
      livePropertyUpdate.lastReloads.length === 0,
    "Script property-only edits must preserve the running Entity instance",
  );
  assert(
    livePropertyUpdate.runtimeScene.entities["entity-a"]?.components.some(
      (component) =>
        component.type === "script" && component.properties.speed === 8,
    ),
    "Script property-only edits must reach the runtime Scene on the next frame",
  );

  const structurallyChanged = fixtureScene();
  structurallyChanged.entities["entity-c"] = entity("entity-c");
  structurallyChanged.rootEntityIds.push("entity-c");
  delete structurallyChanged.entities["entity-b"];
  structurallyChanged.rootEntityIds = structurallyChanged.rootEntityIds.filter(
    (entityId) => entityId !== "entity-b",
  );
  const structureSynchronized = synchronizePlaySession(
    started,
    structurallyChanged,
    assets,
  );
  assert(
    structureSynchronized.lastReloads.some(
      (reload) => reload.entityId === "entity-c" && reload.kind === "added",
    ),
    "An Entity added during Play must be mounted in the runtime Scene",
  );
  assert(
    structureSynchronized.lastReloads.some(
      (reload) => reload.entityId === "entity-b" && reload.kind === "removed",
    ),
    "An Entity deleted during Play must be removed from the runtime Scene",
  );
  assert(
    Boolean(structureSynchronized.runtimeScene.entities["entity-c"]) &&
      !structureSynchronized.runtimeScene.entities["entity-b"],
    "Runtime Scene structure must match the latest authoring Scene",
  );

  const particleA = createDefaultParticleAsset({
    id: "particle-a",
    name: "Particle A",
  });
  const particleB = createDefaultParticleAsset({
    id: "particle-b",
    name: "Particle B",
  });
  if (!particleA || !particleB) {
    throw new Error("Play session fixture could not create Particle Assets");
  }
  const particleScene = fixtureScene();
  particleScene.entities["entity-a"]?.components.push(
    particleEmitter("emitter-a", particleA.id),
  );
  particleScene.entities["entity-b"]?.components.push(
    particleEmitter("emitter-b", particleB.id),
  );
  const particleAssets: AssetManifest = {
    schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
    assets: {
      [particleA.id]: particleA,
      [particleB.id]: particleB,
    },
  };
  const particleSession = createPlaySession(particleScene, particleAssets);
  const changedParticleAssets: AssetManifest = JSON.parse(
    JSON.stringify(particleAssets),
  ) as AssetManifest;
  const changedParticle = changedParticleAssets.assets[particleA.id];
  if (changedParticle?.kind === "particle") {
    changedParticle.properties.emission.rateOverTime = 42;
  }
  const particleSynchronized = synchronizePlaySession(
    particleSession,
    particleScene,
    changedParticleAssets,
  );
  assert(
    particleSynchronized.lastReloads.length === 1 &&
      particleSynchronized.lastReloads[0]?.entityId === "entity-a",
    "An Asset edit must restart only Entities that consume the changed Asset",
  );
  assert(
    particleSynchronized.entityRevisions["entity-b"] === 0,
    "Unrelated Asset consumers must keep their runtime instance",
  );

  const unusedParticle = createDefaultParticleAsset({
    id: "particle-unused",
    name: "Unused Particle",
  });
  if (!unusedParticle) {
    throw new Error("Play session fixture could not create an unused Particle");
  }
  const withUnreferencedAsset: AssetManifest = {
    ...changedParticleAssets,
    assets: {
      ...changedParticleAssets.assets,
      [unusedParticle.id]: unusedParticle,
    },
  };
  const unreferencedSynchronized = synchronizePlaySession(
    particleSynchronized,
    particleScene,
    withUnreferencedAsset,
  );
  assert(
    unreferencedSynchronized.lastReloads.length === 0,
    "Adding an unreferenced Asset must not restart every running Entity",
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

function particleEmitter(
  id: string,
  particleAssetId: string,
): ParticleEmitterComponent {
  return {
    id,
    type: "particle-emitter",
    enabled: true,
    particleAssetId,
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Play session fixture failed: ${message}`);
}
