import {
  ASSET_MANIFEST_SCHEMA_VERSION,
  createDefaultMaterialAsset,
  createTextureAsset,
  updateTextureAsset,
  type AssetManifest,
} from "./asset-manifest";
import {
  SCENE_DOCUMENT_SCHEMA_VERSION,
  createTransformComponent,
  type AudioSourceComponent,
  type LightComponent,
  type MeshComponent,
  type ParticleEmitterComponent,
  type SceneDocument,
  type SceneEntity,
} from "./scene-document";
import { createDefaultParticleAsset } from "./particle-system";
import { createPlaySession, synchronizePlaySession } from "./play-session";
import { resolveSceneSettings } from "./scene-settings";

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

  const settingsChanged = fixtureScene();
  const settings = resolveSceneSettings(settingsChanged.settings);
  settingsChanged.settings = {
    ...settings,
    ambient: { ...settings.ambient, color: "#abcdef", intensity: 0.9 },
    editor: {
      ...settings.editor,
      backgroundColor: "#111827",
    },
  };
  const settingsSynchronized = synchronizePlaySession(
    started,
    settingsChanged,
    assets,
  );
  assert(
    settingsSynchronized.runtimeScene.settings?.ambient.intensity === 0.9 &&
      settingsSynchronized.runtimeScene.settings.editor.backgroundColor ===
        "#111827",
    "Scene settings edits must reach the running Scene",
  );
  assert(
    settingsSynchronized.lastReloads.length === 0 &&
      settingsSynchronized.entityRevisions["entity-a"] === 0 &&
      settingsSynchronized.entityRevisions["entity-b"] === 0,
    "Scene settings edits must not restart unrelated Entity instances",
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

  const audioSourceScene = fixtureScene();
  audioSourceScene.entities["entity-a"]?.components.push(
    audioSource("audio-source-a", "audio-ambient"),
  );
  const audioSourceSession = createPlaySession(audioSourceScene, assets);
  const liveAudioSourceScene = fixtureScene();
  liveAudioSourceScene.entities["entity-a"]?.components.push({
    ...audioSource("audio-source-a", "audio-ambient"),
    volume: 0.25,
    loop: true,
    autoplay: true,
    refDistance: 2,
    rolloffFactor: 0.5,
    maxDistance: 24,
  });
  const liveAudioSourceUpdate = synchronizePlaySession(
    audioSourceSession,
    liveAudioSourceScene,
    assets,
  );
  assert(
    liveAudioSourceUpdate.entityRevisions["entity-a"] === 0 &&
      liveAudioSourceUpdate.lastReloads.length === 0,
    "Audio Source playback settings must update without restarting its Entity",
  );
  assert(
    liveAudioSourceUpdate.runtimeScene.entities["entity-a"]?.components.some(
      (component) =>
        component.type === "audio-source" &&
        component.volume === 0.25 &&
        component.loop &&
        component.maxDistance === 24,
    ),
    "Live Audio Source settings must reach the runtime Scene",
  );

  const structuralAudioSourceScene = fixtureScene();
  structuralAudioSourceScene.entities["entity-a"]?.components.push({
    ...audioSource("audio-source-a", "audio-next"),
    spatial: false,
  });
  const structuralAudioSourceUpdate = synchronizePlaySession(
    liveAudioSourceUpdate,
    structuralAudioSourceScene,
    assets,
  );
  assert(
    structuralAudioSourceUpdate.entityRevisions["entity-a"] === 1 &&
      structuralAudioSourceUpdate.lastReloads.length === 1 &&
      structuralAudioSourceUpdate.lastReloads[0]?.entityId === "entity-a",
    "Audio Asset or spatial mode changes must restart only the owning Entity",
  );

  const lightScene = fixtureScene();
  lightScene.entities["entity-a"]?.components.push(
    light("light-a", "point"),
  );
  const lightSession = createPlaySession(lightScene, assets);
  const liveLightScene = fixtureScene();
  liveLightScene.entities["entity-a"]?.components.push({
    ...light("light-a", "point"),
    enabled: false,
    color: "#ff8800",
    intensity: 3,
    castShadow: true,
    distance: 12,
    decay: 1,
  });
  const liveLightUpdate = synchronizePlaySession(
    lightSession,
    liveLightScene,
    assets,
  );
  assert(
    liveLightUpdate.entityRevisions["entity-a"] === 0 &&
      liveLightUpdate.lastReloads.length === 0,
    "Light scalar edits must update without restarting its Entity",
  );
  assert(
    liveLightUpdate.runtimeScene.entities["entity-a"]?.components.some(
      (component) =>
        component.type === "light" &&
        !component.enabled &&
        component.color === "#ff8800" &&
        component.intensity === 3 &&
        component.distance === 12,
    ),
    "Live Light settings must reach the runtime Scene",
  );

  const structuralLightScene = fixtureScene();
  structuralLightScene.entities["entity-a"]?.components.push(
    light("light-a", "spot"),
  );
  const structuralLightUpdate = synchronizePlaySession(
    liveLightUpdate,
    structuralLightScene,
    assets,
  );
  assert(
    structuralLightUpdate.entityRevisions["entity-a"] === 1 &&
      structuralLightUpdate.lastReloads.length === 1 &&
      structuralLightUpdate.lastReloads[0]?.entityId === "entity-a",
    "Changing Light type must restart only the owning Entity",
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

  const textureA = createTextureAsset({
    id: "texture-a",
    name: "Texture A",
    source: { kind: "project", relativePath: "assets/texture-a.png" },
    importSettings: {},
  });
  const textureB = createTextureAsset({
    id: "texture-b",
    name: "Texture B",
    source: { kind: "project", relativePath: "assets/texture-b.png" },
    importSettings: {},
  });
  const materialA = createDefaultMaterialAsset({
    id: "material-a",
    name: "Material A",
    properties: { baseColorTextureId: textureA?.id },
  });
  const materialB = createDefaultMaterialAsset({
    id: "material-b",
    name: "Material B",
    properties: { baseColorTextureId: textureB?.id },
  });
  if (!textureA || !textureB || !materialA || !materialB) {
    throw new Error("Play session fixture could not create Texture Assets");
  }
  const textureScene = fixtureScene();
  textureScene.entities["entity-a"]?.components.push(
    mesh("mesh-a", materialA.id),
  );
  textureScene.entities["entity-b"]?.components.push(
    mesh("mesh-b", materialB.id),
  );
  const textureAssets: AssetManifest = {
    schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
    assets: {
      [textureA.id]: textureA,
      [textureB.id]: textureB,
      [materialA.id]: materialA,
      [materialB.id]: materialB,
    },
  };
  const textureSession = createPlaySession(textureScene, textureAssets);
  const changedTextureAssets = updateTextureAsset(
    textureAssets,
    textureA.id,
    {
      importSettings: {
        colorSpace: "linear",
        sampler: { wrapS: "clamp-to-edge" },
      },
    },
  );
  const textureSynchronized = synchronizePlaySession(
    textureSession,
    textureScene,
    changedTextureAssets,
  );
  const runtimeTexture = textureSynchronized.runtimeAssets.assets[textureA.id];
  assert(
    runtimeTexture?.kind === "texture" &&
      runtimeTexture.importSettings.colorSpace === "linear" &&
      runtimeTexture.importSettings.sampler.wrapS === "clamp-to-edge",
    "Texture settings edits must reach the isolated runtime Asset snapshot",
  );
  assert(
    textureSynchronized.lastReloads.length === 1 &&
      textureSynchronized.lastReloads[0]?.entityId === "entity-a",
    "A Texture edit must restart only Entities consuming it through a Material",
  );
  assert(
    textureSynchronized.entityRevisions["entity-b"] === 0,
    "Entities using an unrelated Texture must preserve their runtime instance",
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

function audioSource(
  id: string,
  audioAssetId: string,
): AudioSourceComponent {
  return {
    id,
    type: "audio-source",
    enabled: true,
    audioAssetId,
    volume: 1,
    loop: false,
    autoplay: false,
    spatial: true,
    refDistance: 1,
    rolloffFactor: 1,
    maxDistance: 100,
  };
}

function light(
  id: string,
  lightType: LightComponent["lightType"],
): LightComponent {
  return {
    id,
    type: "light",
    enabled: true,
    lightType,
    color: "#ffffff",
    intensity: 1,
    castShadow: false,
    ...(lightType === "hemisphere" ? { groundColor: "#334155" } : {}),
    ...(lightType === "point" || lightType === "spot"
      ? { distance: 0, decay: 2 }
      : {}),
    ...(lightType === "spot"
      ? { angle: Math.PI / 3, penumbra: 0.5 }
      : {}),
    ...(lightType === "rectArea" ? { width: 1, height: 1 } : {}),
  };
}

function mesh(id: string, materialAssetId: string): MeshComponent {
  return {
    id,
    type: "mesh",
    enabled: true,
    geometryAssetId: "builtin.cube",
    materialBindings: [{ slot: "default", materialAssetId }],
    castShadow: true,
    receiveShadow: true,
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Play session fixture failed: ${message}`);
}
