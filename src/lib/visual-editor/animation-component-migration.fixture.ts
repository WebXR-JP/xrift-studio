/**
 * The one-way conversion from Animation Component to graph.
 *
 * It runs once, on a document the author already had, and it is the only thing
 * standing between a world that animated yesterday and a world that does not.
 * Everything it can get wrong is silent: a clip that starts looping when it
 * used to play once, a speed dropped on the floor, a Component that was only a
 * handle for another graph turned into a playback nobody asked for.
 */

import {
  ASSET_MANIFEST_SCHEMA_VERSION,
  type AssetManifest,
  type ModelAsset,
} from "./asset-manifest";
import {
  createAnimationComponent,
  createMeshComponent,
  createTransformComponent,
  SCENE_DOCUMENT_SCHEMA_VERSION,
  type SceneDocument,
  type SceneEntity,
} from "./scene-document";
import {
  clearAnimationActionComponentIds,
  describeAnimationComponentMigration,
  migrateAnimationComponentsToGraphs,
  sceneHasAnimationComponents,
} from "./animation-component-migration";
import {
  configureInteractivityTriggerAction,
  getKhrInteractivityOnStartAnimationCues,
  readInteractivityTriggerAction,
  XRIFT_INTERACTION_OPERATIONS,
  type KhrInteractivityGraph,
} from "./interactivity-graph";
import {
  appendInteractivityOperation,
  createInteractionTriggerGraphExtension,
} from "./interactivity-recipes";
import {
  parseVisualProjectFiles,
  serializeVisualProjectDocuments,
} from "./persistence";
import { createStarterWorldProject } from "./starter-templates";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Animation migration fixture: ${message}`);
}

function modelAsset(): ModelAsset {
  return {
    id: "model-animated",
    name: "Coast",
    kind: "model",
    status: "ready",
    source: { kind: "project", relativePath: "assets/models/coast.glb" },
    thumbnail: { status: "missing" },
    folderId: null,
    order: 0,
    importSettings: {
      scale: 1,
      generateColliders: false,
      optimizeMeshes: false,
      importAnimations: true,
    },
    materialSlots: [],
    importMetadata: {
      sourceFormat: "glb",
      byteLength: 2048,
      nodeCount: 2,
      meshCount: 1,
      primitiveCount: 1,
      bounds: {
        min: [0, 0, 0],
        max: [1, 1, 1],
        center: [0.5, 0.5, 0.5],
        size: [1, 1, 1],
        boundingSphereRadius: 1,
      },
      animations: [
        { name: "Idle", duration: 2, trackCount: 1, sourceAnimationIndex: 0 },
        { name: "Wave", duration: 3.5, trackCount: 1, sourceAnimationIndex: 1 },
      ],
      nodes: [],
      extensionsUsed: [],
      extensionsRequired: [],
    },
  };
}

function entity(id: string, name: string, animation: SceneEntity["components"][number] | null): SceneEntity {
  return {
    id,
    name,
    parentId: null,
    children: [],
    enabled: true,
    components: [
      createTransformComponent(`${id}-transform`, [0, 0, 0]),
      createMeshComponent(`${id}-mesh`, "model-animated", []),
      ...(animation ? [animation] : []),
    ],
  };
}

function sceneWith(entities: SceneEntity[]): SceneDocument {
  return {
    schemaVersion: SCENE_DOCUMENT_SCHEMA_VERSION,
    sceneId: "scene-fixture",
    name: "Fixture",
    rootEntityIds: entities.map((candidate) => candidate.id),
    entities: Object.fromEntries(
      entities.map((candidate) => [candidate.id, candidate]),
    ),
  };
}

function manifest(): AssetManifest {
  const model = modelAsset();
  return {
    schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
    assets: { [model.id]: model },
  };
}

function counter(): (kind: string) => string {
  let next = 0;
  return (kind) => {
    next += 1;
    return `${kind}-${next}`;
  };
}

export function runAnimationComponentMigrationFixtureAssertions(): void {
  // A looping autoplay becomes a graph that loops that clip.
  const looping = createAnimationComponent("component-anim-loop");
  assert(looping !== null, "the fixture could not build an Animation Component");
  const loopScene = sceneWith([
    entity("entity-loop", "Waves", { ...looping, clipName: "Wave", speed: 2 }),
  ]);
  assert(
    sceneHasAnimationComponents(loopScene),
    "the fixture scene has no Animation Component to convert",
  );
  const loopResult = migrateAnimationComponentsToGraphs(
    loopScene,
    manifest(),
    counter(),
  );
  assert(
    !sceneHasAnimationComponents(loopResult.scene),
    "an Animation Component survived the conversion",
  );
  assert(loopResult.converted.length === 1, "the looping Component was not converted");
  const loopEntity = loopResult.scene.entities["entity-loop"]!;
  const trigger = loopEntity.components.find(
    (component) => component.type === "interaction-trigger",
  );
  assert(
    trigger !== undefined && trigger.type === "interaction-trigger",
    "the converted Entity did not get an Interaction Trigger",
  );
  const loopAsset = loopResult.assets.assets[trigger.interactivityAssetId];
  assert(
    loopAsset?.kind === "interactivity",
    "the Trigger points at something that is not an Interactivity Asset",
  );
  const loopCues = getKhrInteractivityOnStartAnimationCues(loopAsset.extension);
  assert(loopCues.length === 1, "the converted graph does not play exactly one clip");
  assert(
    loopCues[0]!.animationIndex === 1,
    "the converted graph plays a different clip than the Component named",
  );
  assert(loopCues[0]!.delaySeconds === 0, "the converted clip does not start with the world");
  assert(
    (loopCues[0]!.endTime ?? null) === null,
    "a looping Component became a clip that plays once",
  );
  assert(loopCues[0]!.speed === 2, "the Component's speed was dropped");

  // A one-shot Component keeps its single pass, which is an end time at the
  // clip's own duration: without it the play is unbounded and would loop.
  const once = createAnimationComponent("component-anim-once");
  assert(once !== null, "the fixture could not build an Animation Component");
  const onceResult = migrateAnimationComponentsToGraphs(
    sceneWith([entity("entity-once", "Door", { ...once, loop: false })]),
    manifest(),
    counter(),
  );
  const onceTrigger = onceResult.scene.entities["entity-once"]!.components.find(
    (component) => component.type === "interaction-trigger",
  );
  assert(
    onceTrigger !== undefined && onceTrigger.type === "interaction-trigger",
    "the one-shot Entity did not get an Interaction Trigger",
  );
  const onceAsset =
    onceResult.assets.assets[onceTrigger.interactivityAssetId];
  assert(onceAsset?.kind === "interactivity", "the one-shot Asset is missing");
  const onceCues = getKhrInteractivityOnStartAnimationCues(onceAsset.extension);
  assert(
    onceCues[0]?.endTime === 2,
    "a one-shot Component did not keep its single pass at the clip's duration",
  );

  // A Component that did not autoplay was a handle for another graph, not a
  // playback. Converting it would start an animation the world never started.
  const idle = createAnimationComponent("component-anim-idle");
  assert(idle !== null, "the fixture could not build an Animation Component");
  const idleResult = migrateAnimationComponentsToGraphs(
    sceneWith([entity("entity-idle", "Lamp", { ...idle, autoplay: false })]),
    manifest(),
    counter(),
  );
  assert(
    idleResult.converted.length === 0,
    "a Component that did not autoplay was turned into a playback",
  );
  assert(
    idleResult.skipped.some((entry) => entry.reason === "not-autoplaying"),
    "a dropped Component was not reported",
  );
  assert(
    !sceneHasAnimationComponents(idleResult.scene),
    "a Component that was not converted was also not removed",
  );
  assert(
    idleResult.scene.entities["entity-idle"]!.components.every(
      (component) => component.type !== "interaction-trigger",
    ),
    "a Component that did not autoplay still produced a Trigger",
  );

  // A Component naming a clip the Model no longer has was already playing
  // nothing; it is reported rather than silently pointed at clip zero.
  const missing = createAnimationComponent("component-anim-missing");
  assert(missing !== null, "the fixture could not build an Animation Component");
  const missingResult = migrateAnimationComponentsToGraphs(
    sceneWith([entity("entity-missing", "Gone", { ...missing, clipName: "Nope" })]),
    manifest(),
    counter(),
  );
  assert(
    missingResult.converted.length === 0 &&
      missingResult.skipped.some((entry) => entry.reason === "no-clip"),
    "a Component naming a missing clip was converted anyway",
  );

  // A Scene with nothing to convert is returned as-is, so opening a v1 project
  // does not mark it dirty.
  const clean = sceneWith([entity("entity-plain", "Rock", null)]);
  const cleanAssets = manifest();
  const cleanResult = migrateAnimationComponentsToGraphs(
    clean,
    cleanAssets,
    counter(),
  );
  assert(
    cleanResult.scene === clean && cleanResult.assets === cleanAssets,
    "a Scene with no Animation Component was rebuilt anyway",
  );
  assert(
    describeAnimationComponentMigration(cleanResult) === null,
    "a Scene with nothing to convert produced a notice",
  );
  assert(
    (describeAnimationComponentMigration(loopResult) ?? "").includes("1件"),
    "the conversion notice does not say how many were converted",
  );
}

/**
 * The conversion has to happen where a project is read, not only where it is
 * asked for.
 *
 * Opening is the one moment the clip, the loop and the speed are still written
 * down. A converter nothing calls on load would leave every project saved
 * before v1 opening silently un-animated, which looks exactly like the world
 * being broken.
 */
export function runAnimationComponentLoadMigrationFixtureAssertions(): void {
  const plan = createStarterWorldProject("blank", "animation-migration-fixture");
  const model = modelAsset();
  const legacy = createAnimationComponent("component-legacy-anim");
  assert(legacy !== null, "the fixture could not build an Animation Component");
  const legacyEntity = entity("entity-legacy", "Waves", {
    ...legacy,
    clipName: "Wave",
  });
  const documents = {
    project: plan.project,
    scenes: {
      [plan.scene.sceneId]: {
        ...plan.scene,
        rootEntityIds: [...plan.scene.rootEntityIds, legacyEntity.id],
        entities: { ...plan.scene.entities, [legacyEntity.id]: legacyEntity },
      },
    },
    assets: {
      ...plan.assets,
      assets: { ...plan.assets.assets, [model.id]: model },
    },
    prefabs: plan.prefabs,
  };
  // A document saved before v1 still serializes: the shape is only removed from
  // what can be authored, not from what can be read.
  const files = serializeVisualProjectDocuments(documents);
  assert(
    files.sceneDocuments.some((file) => file.content.includes('"animation"')),
    "the fixture did not actually write an Animation Component to disk",
  );

  const loaded = parseVisualProjectFiles({
    projectJson: files.projectJson,
    assetManifestJson: files.assetManifestJson,
    sceneDocuments: files.sceneDocuments,
    prefabDocuments: files.prefabDocuments,
  });
  const loadedScene = loaded.scenes[plan.scene.sceneId];
  assert(loadedScene !== undefined, "the loaded project lost its Scene");
  assert(
    !sceneHasAnimationComponents(loadedScene),
    "opening a project left an Animation Component in the Scene",
  );
  assert(
    loaded.animationMigration?.converted.length === 1,
    "opening a project did not report what it converted",
  );
  const loadedTrigger = loadedScene.entities[legacyEntity.id]?.components.find(
    (component) => component.type === "interaction-trigger",
  );
  assert(
    loadedTrigger !== undefined && loadedTrigger.type === "interaction-trigger",
    "opening a project did not attach the graph it created",
  );
  const loadedGraph = loaded.assets.assets[loadedTrigger.interactivityAssetId];
  assert(
    loadedGraph?.kind === "interactivity",
    "the graph created on open is not in the manifest that was returned",
  );
  const loadedCues = getKhrInteractivityOnStartAnimationCues(
    loadedGraph.extension,
  );
  assert(
    loadedCues.length === 1 && loadedCues[0]?.animationIndex === 1,
    "the graph created on open does not play the clip the Component named",
  );

  // Opening the converted project again changes nothing, so a project that has
  // been opened once does not keep looking dirty.
  const again = parseVisualProjectFiles(
    serializeVisualProjectDocuments({
      project: loaded.project,
      scenes: loaded.scenes,
      assets: loaded.assets,
      prefabs: loaded.prefabs,
    }),
  );
  assert(
    again.animationMigration === undefined,
    "opening an already-converted project converted something again",
  );
}

/**
 * A graph written before v1 kept working, or the change is a silent break.
 *
 *「押したら再生／停止」was written against an Animation Component and carries
 * its id. That Component is gone and animation is addressed per Entity now, so
 * an id left in place points at nothing: the runtime matched on it, which would
 * have made every one of those graphs quietly do nothing in Play and in
 * published worlds, with no diagnostic anywhere.
 */
export function runAnimationActionComponentIdFixtureAssertions(): void {
  const extension = createInteractionTriggerGraphExtension();
  const graph = extension.graphs[0] as KhrInteractivityGraph;
  const action = appendInteractivityOperation(
    graph,
    XRIFT_INTERACTION_OPERATIONS.toggleProperty,
    { x: 0, y: 0 },
  );
  const configured = configureInteractivityTriggerAction(graph, action, {
    entityId: "entity-door",
    componentId: "component-anim-gone",
    targetKind: "animation",
    property: "playing",
  });
  assert(configured, "the fixture could not write an Animation action");
  assert(
    readInteractivityTriggerAction(graph, action)?.componentId ===
      "component-anim-gone",
    "the fixture did not actually record the Component id",
  );

  const cleared = clearAnimationActionComponentIds(extension);
  assert(cleared.cleared === 1, "the stale Component id was not cleared");
  const clearedGraph = cleared.extension.graphs[0] as KhrInteractivityGraph;
  const after = readInteractivityTriggerAction(clearedGraph, action);
  assert(
    after?.componentId === "",
    "the Animation action still names a Component that no longer exists",
  );
  assert(
    after?.targetKind === "animation" && after.property === "playing",
    "clearing the Component id changed what the action does",
  );
  assert(
    after?.entityId === "entity-door",
    "clearing the Component id changed which Entity the action targets",
  );

  // Actions on other targets keep their Component id: an Audio Source or a
  // Light is still one of several a single Entity can carry.
  const audio = appendInteractivityOperation(
    clearedGraph,
    XRIFT_INTERACTION_OPERATIONS.setProperty,
    { x: 0, y: 0 },
  );
  configureInteractivityTriggerAction(clearedGraph, audio, {
    entityId: "entity-door",
    componentId: "component-audio",
    targetKind: "audio-source",
    property: "volume",
  });
  const again = clearAnimationActionComponentIds(cleared.extension);
  assert(
    again.cleared === 0 && again.extension === cleared.extension,
    "a second pass changed a graph that had nothing left to clear",
  );
  assert(
    readInteractivityTriggerAction(clearedGraph, audio)?.componentId ===
      "component-audio",
    "clearing Animation ids also cleared an Audio Source's",
  );
}
