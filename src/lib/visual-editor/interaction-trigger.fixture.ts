import {
  ASSET_MANIFEST_SCHEMA_VERSION,
  normalizeMaterialProperties,
  type AssetManifest,
} from "./asset-manifest";
import { compileVisualProject } from "./compiler";
import {
  INTERACTION_TRIGGER_MODEL_OVERLAY_PATH,
  INTERACTION_TRIGGER_OVERLAY_PATH,
  INTERACTIVITY_ENGINE_OVERLAY_PATH,
  INTERACTIVITY_GRAPH_OVERLAY_PATH,
  INTERACTIVITY_HOST_OVERLAY_PATH,
  INTERACTIVITY_VALUE_OVERLAY_PATH,
  ANIMATION_RUNTIME_OVERLAY_PATH,
  ANIMATION_MIXER_OVERLAY_PATH,
  SCENE_RUNTIME_OVERLAY_PATH,
  SCRIPT_AUDIO_SOURCE_OVERLAY_PATH,
  SCRIPT_LIGHT_OVERLAY_PATH,
  SCRIPT_PARTICLE_OVERLAY_PATH,
} from "./compiler/script-emit";
import {
  collectInteractionTriggerTargets,
  syncInteractionTriggerReferences,
} from "./interaction-trigger-targets";
import {
  collectInteractivityRuntimeDiagnostics,
  collectXriftInteractionIssues,
  collectXriftInteractionPrograms,
  configureInteractivityTriggerAction,
  createDefaultKhrInteractivityExtension,
  cloneKhrInteractivityExtension,
  setInteractivityTriggerActionValue,
  validateKhrInteractivityExtension,
  XRIFT_INTERACTION_OPERATIONS,
  XRIFT_INTERACTION_SELF_ENTITY_ID,
  getXriftInteractionProperty,
  type KhrInteractivityExtension,
  type KhrInteractivityGraph,
} from "./interactivity-graph";
import {
  appendInteractivityOperation,
  connectInteractivityFlow,
  createInteractionTriggerGraphExtension,
} from "./interactivity-recipes";
import { VISUAL_PROJECT_SCHEMA_VERSION } from "./project-document";
import {
  SCENE_DOCUMENT_SCHEMA_VERSION,
  type SceneDocument,
  type XRiftComponent,
} from "./scene-document";
import {
  createXriftComponent,
  XRIFT_COMPONENT_SCHEMA_IDS,
} from "./component-registry";

/**
 * Interaction Trigger contract, from the graph through to published output.
 *
 * The three surfaces that can drift apart are covered together on purpose: the
 * shared parse the runtime uses, the Editor's target list, and the emitted
 * world. A trigger that reads as configured in the Editor while the published
 * world drops it is the failure this suite exists to catch.
 */
export function runInteractionTriggerFixtureAssertions(): void {
  assertSeededGraphValidates();
  assertConfiguredActionIsParsed();
  assertUnfinishedActionIsReported();
  assertToggleRejectsNonBooleanProperty();
  assertWalkStopsAtUnsupportedOperation();
  assertSceneTargetsListWritableComponentsOnly();
  assertEntityReferencesFollowTheGraph();
  assertPublishedWorldRunsTheTrigger();
  assertPublishedWorldRunsAGraphNobodyPresses();
  assertPublishedWorldOmitsTheUnusedInteractionEmitter();
  assertRuntimeJsonOutputIsBlocked();
}

const GRAPH_ASSET_ID = "asset_interactivity_trigger";
const AUDIO_ASSET_ID = "asset_audio_click";
const MATERIAL_ASSET_ID = "asset_material_plain";

function graphOf(extension: KhrInteractivityExtension): KhrInteractivityGraph {
  return extension.graphs[0] as KhrInteractivityGraph;
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Interaction trigger fixture failed: ${message}`);
}

/** onInteract -> set the Audio Source's playback to "play". */
function buildPlaySoundGraph(): KhrInteractivityExtension {
  const extension = createInteractionTriggerGraphExtension();
  const graph = graphOf(extension);
  const action = appendInteractivityOperation(
    graph,
    XRIFT_INTERACTION_OPERATIONS.setProperty,
    { x: 400, y: 160 },
  );
  configureInteractivityTriggerAction(graph, action, {
    entityId: "entity_speaker",
    componentId: "component_audio",
    targetKind: "audio-source",
    property: "playback",
  });
  connectInteractivityFlow(graph, 0, "out", action);
  return extension;
}

function assertSeededGraphValidates(): void {
  const extension = createInteractionTriggerGraphExtension();
  const diagnostics = validateKhrInteractivityExtension(extension);
  assert(
    diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    "the seeded interaction graph does not pass KHR validation",
  );
  assert(
    graphOf(extension).declarations?.[0]?.extension ===
      "XRIFT_studio_interaction",
    "the seeded entry point does not declare its defining extension",
  );
  // An extension operation without a dedicated template would only be
  // preserved generically, which is what the palette entry prevents.
  assert(
    !diagnostics.some((diagnostic) =>
      diagnostic.message.includes("preserved generically"),
    ),
    "the interact entry point has no editor template",
  );
}

function assertConfiguredActionIsParsed(): void {
  const extension = buildPlaySoundGraph();
  assert(
    validateKhrInteractivityExtension(extension).every(
      (diagnostic) => diagnostic.severity !== "error",
    ),
    "a configured trigger graph does not validate",
  );
  const programs = collectXriftInteractionPrograms(extension);
  assert(programs.length === 1, "the interact entry point was not found");
  const action = programs[0]?.actions[0];
  assert(
    action?.entityId === "entity_speaker" &&
      action.componentId === "component_audio" &&
      action.target === "audio-source" &&
      action.property === "playback" &&
      action.mode === "set" &&
      action.value?.kind === "enum" &&
      action.value.value === "play",
    "the configured action was not parsed back from the graph",
  );
  assert(
    collectXriftInteractionIssues(extension).length === 0,
    "a fully configured action was reported as unfinished",
  );
  assert(
    collectInteractivityRuntimeDiagnostics(extension).length === 0,
    "a runnable trigger graph produced runtime warnings",
  );
}

function assertUnfinishedActionIsReported(): void {
  // A freshly placed action already points at the Entity the graph is attached
  // to, so it is complete before the author has chosen anything. That is what
  // lets one graph sit on many Entities.
  {
    const extension = createInteractionTriggerGraphExtension();
    const graph = graphOf(extension);
    const action = appendInteractivityOperation(
      graph,
      XRIFT_INTERACTION_OPERATIONS.setProperty,
      { x: 400, y: 160 },
    );
    connectInteractivityFlow(graph, 0, "out", action);
    const program = collectXriftInteractionPrograms(extension)[0];
    assert(
      program?.actions[0]?.entityId === XRIFT_INTERACTION_SELF_ENTITY_ID,
      "a new action did not default to the Entity the graph is attached to",
    );
    assert(
      collectInteractivityRuntimeDiagnostics(extension).length === 0,
      "a new action was reported as unfinished",
    );
  }

  const extension = createInteractionTriggerGraphExtension();
  const graph = graphOf(extension);
  const action = appendInteractivityOperation(
    graph,
    XRIFT_INTERACTION_OPERATIONS.setProperty,
    { x: 400, y: 160 },
  );
  connectInteractivityFlow(graph, 0, "out", action);
  // Clearing the Entity by hand is still an unfinished action.
  graph.nodes![action]!.configuration!.entity = { value: [""] };
  assert(
    collectXriftInteractionPrograms(extension)[0]?.actions.length === 0,
    "an action with no target was treated as runnable",
  );
  assert(
    collectXriftInteractionIssues(extension).some(
      (issue) => issue.reason === "incomplete-configuration",
    ),
    "an action with no target was not reported",
  );
  assert(
    collectInteractivityRuntimeDiagnostics(extension).length === 1,
    "the Editor diagnostics list does not mention the unfinished action",
  );
}

function assertToggleRejectsNonBooleanProperty(): void {
  const extension = createInteractionTriggerGraphExtension();
  const graph = graphOf(extension);
  const toggle = appendInteractivityOperation(
    graph,
    XRIFT_INTERACTION_OPERATIONS.toggleProperty,
    { x: 400, y: 160 },
  );
  connectInteractivityFlow(graph, 0, "out", toggle);
  const applied = configureInteractivityTriggerAction(graph, toggle, {
    entityId: "entity_speaker",
    componentId: "component_audio",
    targetKind: "audio-source",
    property: "volume",
  });
  assert(applied, "configuring a toggle target was rejected outright");
  assert(
    collectXriftInteractionIssues(extension).some(
      (issue) => issue.reason === "unsupported-toggle",
    ),
    "toggling a numeric property was not reported",
  );
  assert(
    collectXriftInteractionPrograms(extension)[0]?.actions.length === 0,
    "toggling a numeric property was treated as runnable",
  );
}

function assertWalkStopsAtUnsupportedOperation(): void {
  const extension = createInteractionTriggerGraphExtension();
  const graph = graphOf(extension);
  const ignored = appendInteractivityOperation(graph, "flow/doN", {
    x: 300,
    y: 160,
  });
  const action = appendInteractivityOperation(
    graph,
    XRIFT_INTERACTION_OPERATIONS.setProperty,
    { x: 600, y: 160 },
  );
  configureInteractivityTriggerAction(graph, action, {
    entityId: "entity_speaker",
    componentId: "",
    targetKind: "entity",
    property: "enabled",
  });
  connectInteractivityFlow(graph, 0, "out", ignored);
  connectInteractivityFlow(graph, ignored, "out", action);
  assert(
    collectXriftInteractionPrograms(extension)[0]?.actions.length === 0,
    "the walk ran an action behind an unimplemented operation",
  );
}

function assertSceneTargetsListWritableComponentsOnly(): void {
  const targets = collectInteractionTriggerTargets(buildScene());
  const speaker = targets.find((target) => target.entityId === "entity_speaker");
  assert(Boolean(speaker), "the target Entity is missing from the list");
  assert(
    speaker!.components.some(
      (component) =>
        component.componentId === "" && component.targetKind === "entity",
    ),
    "the Entity itself is not offered as a target",
  );
  assert(
    speaker!.components.some(
      (component) => component.componentId === "component_audio",
    ),
    "the Audio Source is not offered as a target",
  );
  assert(
    speaker!.components.every(
      (component) => component.componentId !== "component_mesh",
    ),
    "a Component with no writable property was offered as a target",
  );
  const button = targets.find((target) => target.entityId === "entity_button");
  assert(
    button?.path === "Button",
    "the target path does not name the Entity",
  );
}

function assertEntityReferencesFollowTheGraph(): void {
  const documents = buildDocuments();
  const synced = syncInteractionTriggerReferences(
    documents.scenes.scene_main,
    documents.assets,
  );
  const trigger = synced.entities.entity_button?.components.find(
    (component) => component.type === "interaction-trigger",
  );
  assert(
    trigger?.type === "interaction-trigger" &&
      trigger.entityReferences.join(",") === "entity_sign,entity_speaker",
    "the trigger's entityReferences were not derived from its graph",
  );
}

/**
 * A timeline graph reaches the published world.
 *
 * The compiler decided whether to carry the trigger runtime by asking whether
 * the Asset had an `xrift/onInteract` entry. A graph whose entry is
 * `event/onStart` — an opening sequence, the thing the timeline is for — has
 * none, so it ran in Studio Play and was dropped from the world that shipped.
 */
function assertPublishedWorldRunsAGraphNobodyPresses(): void {
  const documents = buildDocuments();
  const graphAsset = documents.assets.assets[GRAPH_ASSET_ID];
  if (graphAsset?.kind !== "interactivity") {
    throw new Error("the fixture's Interactivity Asset is missing");
  }
  const extension = createDefaultKhrInteractivityExtension();
  const graph = graphOf(extension);
  graph.nodes = [];
  graph.declarations = [];
  const start = appendInteractivityOperation(graph, "event/onStart", { x: 0, y: 0 });
  const reveal = appendInteractivityOperation(
    graph,
    XRIFT_INTERACTION_OPERATIONS.setProperty,
    { x: 320, y: 0 },
  );
  configureInteractivityTriggerAction(graph, reveal, {
    entityId: "entity_sign",
    componentId: "",
    targetKind: "entity",
    property: "enabled",
  });
  connectInteractivityFlow(graph, start, "out", reveal);

  const result = compileVisualProject(
    {
      ...documents,
      assets: {
        ...documents.assets,
        assets: {
          ...documents.assets.assets,
          [GRAPH_ASSET_ID]: { ...graphAsset, extension },
        },
      },
    },
    { generatedAt: "2026-08-29T00:00:00.000Z" },
  );
  const world = result.overlayFiles.find(
    (file) => file.relativePath === "src/World.tsx",
  )?.content;
  assert(Boolean(world), "World.tsx was not emitted for a self-starting graph");
  assert(
    world!.includes("<XriftInteractionTriggerRuntime"),
    "a graph that starts itself was dropped from the published world",
  );
  assert(
    result.overlayFiles.some(
      (file) => file.relativePath === INTERACTIVITY_ENGINE_OVERLAY_PATH,
    ),
    "a self-starting graph shipped without the interpreter that runs it",
  );
  assert(
    !result.diagnostics.some(
      (diagnostic) => diagnostic.code === "interaction-trigger-without-event",
    ),
    "a graph with an onStart entry was reported as having no entry point",
  );
  // Nobody presses this one, so demanding an Interactable would be noise.
  assert(
    !result.diagnostics.some(
      (diagnostic) => diagnostic.code === "interaction-trigger-without-interactable",
    ),
    "a graph that starts itself was asked for an Interactable",
  );
}

function assertPublishedWorldRunsTheTrigger(): void {
  const result = compileVisualProject(buildDocuments(), {
    generatedAt: "2026-08-29T00:00:00.000Z",
  });
  const world = result.overlayFiles.find(
    (file) => file.relativePath === "src/World.tsx",
  )?.content;
  assert(Boolean(world), "World.tsx was not emitted");
  assert(
    world!.includes(
      'import { XriftInteractionTriggerRuntime } from "./xrift-studio/interaction-trigger-runtime";',
    ),
    "the published world does not import the Interaction Trigger runtime",
  );
  assert(
    world!.includes(
      'import { emitXriftInteraction } from "./xrift-studio/interaction-trigger-runtime";',
    ),
    "the published world does not import the interaction emitter it wires",
  );
  assert(
    world!.includes('onInteract={() => emitXriftInteraction("entity_button")}'),
    "the official Interactable was not wired to the trigger",
  );
  assert(
    world!.includes("<XriftInteractionTriggerRuntime"),
    "the trigger runtime was not placed on the Entity",
  );
  assert(
    world!.includes("xrift/onInteract"),
    "the canonical graph was not published with the world",
  );
  // Exposure and the screen fade have no Entity to hang from, so the Scene-wide
  // runtime has to be mounted by the world itself.
  assert(
    world!.includes("<XriftSceneRuntime />"),
    "the published world does not mount the Scene-wide graph runtime",
  );
  // The Entity the graph re-shows is authored disabled; dropping it would make
  // the published trigger a no-op while Play still worked.
  assert(
    world!.includes('name="Hidden Sign"') && world!.includes("visible={false}"),
    "a disabled trigger target was dropped from the published world",
  );
  for (const path of [
    INTERACTION_TRIGGER_MODEL_OVERLAY_PATH,
    INTERACTION_TRIGGER_OVERLAY_PATH,
    INTERACTIVITY_ENGINE_OVERLAY_PATH,
    INTERACTIVITY_GRAPH_OVERLAY_PATH,
    INTERACTIVITY_HOST_OVERLAY_PATH,
    INTERACTIVITY_VALUE_OVERLAY_PATH,
    ANIMATION_RUNTIME_OVERLAY_PATH,
    ANIMATION_MIXER_OVERLAY_PATH,
    SCENE_RUNTIME_OVERLAY_PATH,
  ]) {
    assert(
      result.overlayFiles.some((file) => file.relativePath === path),
      `the published world is missing ${path}`,
    );
  }
  // The interpreter is what runs the graph, so it ships with the trigger: a
  // published world that only carried the trigger component would wait for an
  // engine that is not there.
  const engineOverlay = result.overlayFiles.find(
    (file) => file.relativePath === INTERACTIVITY_ENGINE_OVERLAY_PATH,
  )?.content;
  assert(
    !/from\s+["']\.{1,2}\/(?:interactivity\/)?[a-z-]+\.js["']/.test(
      engineOverlay ?? "",
    ),
    "the emitted interpreter still imports runtime-package specifiers",
  );
  assert(
    (engineOverlay ?? "").includes('from "./interactivity-graph"'),
    "the emitted interpreter does not import its graph reader as an overlay",
  );
  const runtimeOverlay = result.overlayFiles.find(
    (file) => file.relativePath === INTERACTION_TRIGGER_OVERLAY_PATH,
  )?.content;
  // The runtime package resolves siblings as `./x.js`; the staged project has
  // no such files, so an unrewritten specifier would fail its build.
  assert(
    !/from\s+["']\.\/[a-z-]+\.js["']/.test(runtimeOverlay ?? ""),
    "the emitted trigger runtime still imports runtime-package specifiers",
  );
  assert(
    (runtimeOverlay ?? "").includes('from "./audio-source-runtime"') &&
      (runtimeOverlay ?? "").includes('from "./light-runtime"') &&
      (runtimeOverlay ?? "").includes('from "./particle-runtime"') &&
      (runtimeOverlay ?? "").includes('from "./interaction-trigger"'),
    "the emitted trigger runtime does not import its staged siblings",
  );
  // The trigger runtime writes through every bridge it imports, so each of
  // those modules has to be staged even when the Scene uses none of them yet.
  // Without them the published world fails `tsc` on a missing module.
  for (const path of [
    SCRIPT_AUDIO_SOURCE_OVERLAY_PATH,
    SCRIPT_LIGHT_OVERLAY_PATH,
    SCRIPT_PARTICLE_OVERLAY_PATH,
  ]) {
    assert(
      result.overlayFiles.some((file) => file.relativePath === path),
      `the published world is missing the bridge module ${path}`,
    );
  }
  assert(
    !result.diagnostics.some(
      (diagnostic) => diagnostic.severity === "blocking",
    ),
    "publishing a trigger produced a blocking diagnostic",
  );
}

/**
 * A Trigger without an Interactable publishes no unused import.
 *
 * `emitXriftInteraction` only reaches the generated JSX through an official
 * Interactable's `onInteract`. An Entity without one renders no call, so
 * importing the emitter anyway left the staged project failing its own `tsc`
 * on TS6133 — a world that compiled in Studio and could not be built.
 */
function assertPublishedWorldOmitsTheUnusedInteractionEmitter(): void {
  const documents = buildDocuments();
  const scene = documents.scenes.scene_main;
  if (!scene) throw new Error("the fixture's Scene is missing");
  const button = scene.entities.entity_button;
  if (!button) throw new Error("the fixture's Entity is missing");
  const result = compileVisualProject(
    {
      ...documents,
      scenes: {
        ...documents.scenes,
        scene_main: {
          ...scene,
          entities: {
            ...scene.entities,
            entity_button: {
              ...button,
              components: button.components.filter(
                (component) => component.type !== "xrift-component",
              ),
            },
          },
        },
      },
    },
    { generatedAt: "2026-08-29T00:00:00.000Z" },
  );
  const world = result.overlayFiles.find(
    (file) => file.relativePath === "src/World.tsx",
  )?.content;
  assert(Boolean(world), "World.tsx was not emitted without an Interactable");
  assert(
    world!.includes("<XriftInteractionTriggerRuntime"),
    "the trigger was dropped when its Entity had no Interactable",
  );
  assert(
    !world!.includes("emitXriftInteraction"),
    "the published world imports an interaction emitter it never calls",
  );
}

function assertRuntimeJsonOutputIsBlocked(): void {
  const result = compileVisualProject(buildDocuments(), {
    generatedAt: "2026-08-29T00:00:00.000Z",
    outputMode: "classic-runtime",
  });
  assert(
    result.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "interaction-trigger-unsupported-runtime-output" &&
        diagnostic.severity === "blocking",
    ),
    "Runtime JSON output accepted a trigger it cannot run",
  );
}

function interactableComponent(): XRiftComponent {
  const component = createXriftComponent(
    XRIFT_COMPONENT_SCHEMA_IDS.interactable,
    {
      componentId: "component_interactable",
      properties: { id: "button", interactionText: "押す" },
    },
  );
  assert(Boolean(component), "the official Interactable could not be created");
  return component!;
}

function buildScene(): SceneDocument {
  return {
    schemaVersion: SCENE_DOCUMENT_SCHEMA_VERSION,
    sceneId: "scene_main",
    name: "Main",
    rootEntityIds: ["entity_button", "entity_speaker", "entity_sign"],
    entities: {
      entity_button: {
        id: "entity_button",
        name: "Button",
        parentId: null,
        children: [],
        enabled: true,
        components: [
          {
            id: "component_button_transform",
            type: "transform",
            enabled: true,
            position: [0, 1, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
          },
          interactableComponent(),
          {
            id: "component_trigger",
            type: "interaction-trigger",
            enabled: true,
            interactivityAssetId: GRAPH_ASSET_ID,
            entityReferences: ["entity_speaker"],
            assetReferences: [],
          },
          {
            id: "component_button_mesh",
            type: "mesh",
            enabled: true,
            geometryAssetId: "builtin_box",
            geometry: {
              kind: "builtin-primitive",
              creationId: "primitive.box",
              primitive: "box",
            },
            materialBindings: [
              { slot: "default", materialAssetId: MATERIAL_ASSET_ID },
            ],
            castShadow: true,
            receiveShadow: true,
          },
        ],
      },
      entity_speaker: {
        id: "entity_speaker",
        name: "Speaker",
        parentId: null,
        children: [],
        enabled: true,
        components: [
          {
            id: "component_speaker_transform",
            type: "transform",
            enabled: true,
            position: [2, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
          },
          {
            id: "component_audio",
            type: "audio-source",
            enabled: true,
            audioAssetId: AUDIO_ASSET_ID,
            volume: 1,
            loop: false,
            autoplay: false,
            spatial: true,
            refDistance: 1,
            rolloffFactor: 1,
            maxDistance: 10000,
          },
          {
            id: "component_mesh",
            type: "mesh",
            enabled: true,
            geometryAssetId: "builtin_box",
            geometry: {
              kind: "builtin-primitive",
              creationId: "primitive.box",
              primitive: "box",
            },
            materialBindings: [
              { slot: "default", materialAssetId: MATERIAL_ASSET_ID },
            ],
            castShadow: true,
            receiveShadow: true,
          },
        ],
      },
      entity_sign: {
        id: "entity_sign",
        name: "Hidden Sign",
        parentId: null,
        children: [],
        enabled: false,
        components: [
          {
            id: "component_sign_transform",
            type: "transform",
            enabled: true,
            position: [0, 2, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
          },
        ],
      },
    },
  };
}

/** The published fixture graph plays a sound and reveals a hidden Entity. */
function buildPublishGraph(): KhrInteractivityExtension {
  const extension = cloneKhrInteractivityExtension(buildPlaySoundGraph());
  const graph = graphOf(extension);
  const reveal = appendInteractivityOperation(
    graph,
    XRIFT_INTERACTION_OPERATIONS.setProperty,
    { x: 700, y: 160 },
  );
  configureInteractivityTriggerAction(graph, reveal, {
    entityId: "entity_sign",
    componentId: "",
    targetKind: "entity",
    property: "enabled",
  });
  const descriptor = getXriftInteractionProperty("entity", "enabled");
  if (descriptor) {
    setInteractivityTriggerActionValue(graph, reveal, descriptor, [true]);
  }
  connectInteractivityFlow(graph, 1, "out", reveal);
  return extension;
}

function buildDocuments() {
  const assets: AssetManifest = {
    schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
    assets: {
      [GRAPH_ASSET_ID]: {
        id: GRAPH_ASSET_ID,
        name: "Button trigger",
        kind: "interactivity",
        status: "ready",
        source: { kind: "document" },
        thumbnail: { status: "missing" },
        extensionName: "KHR_interactivity",
        specStatus: "release-candidate-2026-07-16",
        extension: buildPublishGraph(),
      },
      [MATERIAL_ASSET_ID]: {
        id: MATERIAL_ASSET_ID,
        name: "Plain",
        kind: "material",
        status: "ready",
        source: { kind: "document" },
        thumbnail: { status: "missing" },
        properties: normalizeMaterialProperties({
          color: "#cccccc",
          metalness: 0,
          roughness: 1,
        }),
      },
      [AUDIO_ASSET_ID]: {
        id: AUDIO_ASSET_ID,
        name: "Click",
        kind: "audio",
        status: "ready",
        source: { kind: "project", relativePath: "assets/audio/click.mp3" },
        thumbnail: { status: "missing" },
        importMetadata: {
          sourceFormat: "mp3",
          mimeType: "audio/mpeg",
          byteLength: 1024,
        },
      },
    },
  };
  return {
    project: {
      schemaVersion: VISUAL_PROJECT_SCHEMA_VERSION,
      projectId: "project_interaction_trigger",
      projectKind: "world" as const,
      entrySceneId: "scene_main",
      scenePaths: { scene_main: "scenes/main.scene.json" },
      assetManifestPath: "assets/manifest.json",
      metadata: {
        name: "Fixture",
        title: "Fixture",
        description: "Interaction trigger fixture",
        createdAt: "2026-08-29T00:00:00.000Z",
        updatedAt: "2026-08-29T00:00:00.000Z",
      },
    },
    scenes: { scene_main: buildScene() },
    assets,
    prefabs: {},
  };
}

/** Kept for the default extension's shape, so a graph change here is loud. */
export const INTERACTION_TRIGGER_FIXTURE_DEFAULT_GRAPH_NAME =
  createDefaultKhrInteractivityExtension().graphs[0]?.name ?? "";
