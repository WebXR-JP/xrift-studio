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
  PLAYER_RUNTIME_HOST_OVERLAY_PATH,
  PLAYER_RUNTIME_OVERLAY_PATH,
  SCENE_RUNTIME_OVERLAY_PATH,
  SCRIPT_AUDIO_SOURCE_OVERLAY_PATH,
  SCRIPT_LIGHT_OVERLAY_PATH,
  SCRIPT_PARTICLE_OVERLAY_PATH,
} from "./compiler/script-emit";
import {
  collectInteractionTriggerTargets,
  describeInteractionTriggerAction,
  syncInteractionTriggerReferences,
} from "./interaction-trigger-targets";
import {
  collectInteractivityRuntimeDiagnostics,
  collectXriftInteractionActions,
  collectXriftInteractionIssues,
  getXriftInteractionScope,
  XRIFT_INTERACTION_PROPERTIES,
  XRIFT_INTERACTION_SCOPE_LABELS,
  XRIFT_INTERACTION_SCOPE_NOTES,
  collectXriftInteractionPrograms,
  configureInteractivityTriggerAction,
  createDefaultKhrInteractivityExtension,
  cloneKhrInteractivityExtension,
  setInteractivityTriggerActionAsset,
  setInteractivityTriggerActionValue,
  validateKhrInteractivityExtension,
  XRIFT_INTERACTION_OPERATIONS,
  XRIFT_INTERACTION_PLAYER_ENTITY_ID,
  XRIFT_INTERACTION_SCENE_ENTITY_ID,
  XRIFT_INTERACTION_SELF_ENTITY_ID,
  getXriftInteractionProperties,
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
  assertTextIsAWritableTarget();
  assertSceneTargetCoversTheSettingsPanel();
  assertAssetValuedActionRecordsItsDependency();
  assertPublishedWorldCarriesTheCompositorForAGraph();
  assertPlayerTeleportReachesThePublishedWorld();
  assertWiredValueKeepsItsAction();
  assertEveryActionSaysWhoSeesIt();
  assertPublishedWorldRunsTheTrigger();
  assertPublishedWorldRunsAGraphNobodyPresses();
  assertPublishedWorldOmitsTheUnusedInteractionEmitter();
  assertRuntimeJsonOutputCarriesTheTrigger();
}

const GRAPH_ASSET_ID = "asset_interactivity_trigger";
const AUDIO_ASSET_ID = "asset_audio_click";
const SKYBOX_ASSET_ID = "asset_skybox_sunset";
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
 * Text is offered as a target.
 *
 * The Component was in every Inspector list and in none of the trigger
 * pickers, so「文字を変える」was a feature the Editor advertised and the graph
 * could not reach. A picker that cannot name it is the same as not having it.
 */
function assertTextIsAWritableTarget(): void {
  const documents = buildDocuments();
  const targets = collectInteractionTriggerTargets(
    documents.scenes.scene_main,
    documents.assets,
  );
  const sign = targets.find((target) => target.entityId === "entity_sign");
  const text = sign?.components.find(
    (component) => component.targetKind === "text",
  );
  assert(Boolean(text), "the Text Component is not offered as a target");
  assert(
    text!.componentId === "component_sign_text",
    "the Text target does not name the Component it writes",
  );
  for (const name of ["text", "color", "fontSize", "fontWeight", "fontId"]) {
    assert(
      text!.properties.some((property) => property.name === name),
      `the Text target does not offer ${name}`,
    );
  }
  assert(
    text!.properties.find((property) => property.name === "text")?.kind ===
      "string",
    "the Text content is not offered as free text",
  );
}

/**
 * Every viewer-facing Scene setting is reachable from a graph.
 *
 * The complaint that produced this was「設定にあるのにグラフから触れない」, so
 * the test is the settings panel rather than a list someone remembered to
 * update. Editor-only rows — the gizmo, the grid, the editor background — are
 * deliberately absent: they are not part of what a viewer sees.
 */
function assertSceneTargetCoversTheSettingsPanel(): void {
  const scene = getXriftInteractionProperties("scene").map(
    (property) => property.name,
  );
  for (const name of [
    "postprocessing",
    "bloom",
    "ao",
    "grading",
    "exposure",
    "fog",
    "ambient",
    "skybox",
    "skyboxIbl",
    "skyboxImage",
    "cameraFov",
  ]) {
    assert(scene.includes(name), `the Scene target does not offer ${name}`);
  }
  const image = getXriftInteractionProperty("scene", "skyboxImage");
  assert(
    image?.kind === "asset" &&
      (image.assetKinds ?? []).includes("skybox") &&
      (image.assetKinds ?? []).includes("texture"),
    "the sky image is not offered as an Asset the author can pick",
  );
}

/**
 * An Asset a graph points at becomes a recorded dependency.
 *
 * Nothing in the Scene document mentions a sky a button switches to, so
 * without this the compiler has no reason to publish the image and the swap
 * would work in Play and do nothing in the world that shipped.
 */
function assertAssetValuedActionRecordsItsDependency(): void {
  const documents = buildDocuments();
  const graphAsset = documents.assets.assets[GRAPH_ASSET_ID];
  if (graphAsset?.kind !== "interactivity") {
    throw new Error("the fixture's Interactivity Asset is missing");
  }
  const extension = cloneKhrInteractivityExtension(graphAsset.extension);
  const graph = graphOf(extension);
  const swap = appendInteractivityOperation(
    graph,
    XRIFT_INTERACTION_OPERATIONS.setProperty,
    { x: 1000, y: 160 },
  );
  assert(
    configureInteractivityTriggerAction(graph, swap, {
      entityId: XRIFT_INTERACTION_SCENE_ENTITY_ID,
      componentId: "",
      targetKind: "scene",
      property: "skyboxImage",
    }),
    "the sky image action could not be targeted",
  );
  assert(
    setInteractivityTriggerActionAsset(graph, swap, SKYBOX_ASSET_ID),
    "the sky image action could not be pointed at an Asset",
  );
  const parsed = collectXriftInteractionActions(extension).find(
    (action) => action.property === "skyboxImage",
  );
  assert(
    parsed?.value?.kind === "asset" && parsed.value.value === SKYBOX_ASSET_ID,
    "the Asset id was not read back from the action's configuration",
  );

  const swapped = {
    ...documents,
    assets: {
      ...documents.assets,
      assets: {
        ...documents.assets.assets,
        [GRAPH_ASSET_ID]: { ...graphAsset, extension },
      },
    },
  };
  const synced = syncInteractionTriggerReferences(
    swapped.scenes.scene_main,
    swapped.assets,
  );
  const trigger = synced.entities.entity_button?.components.find(
    (component) => component.type === "interaction-trigger",
  );
  assert(
    trigger?.type === "interaction-trigger" &&
      trigger.assetReferences.join(",") === SKYBOX_ASSET_ID,
    "the trigger's assetReferences were not derived from its graph",
  );
}

/**
 * A world whose Scene has post effects off still ships the compositor when a
 * graph can turn them on.
 *
 * Otherwise「画質を上げる」publishes, validates, and does nothing — which is
 * worse than refusing to publish it.
 */
/**
 * Every action has to say who sees it.
 *
 * A trigger graph runs in the runtime of whoever pressed the button, so today
 * every action reaches one viewer. For the Scene and the player that is the
 * design; for a door, a colour or a clip it is a gap nothing on screen admitted
 * to. An author cannot discover it alone in the editor - it takes a second
 * person in the room - so the sentence the Editor shows carries it.
 */
function assertEveryActionSaysWhoSeesIt(): void {
  for (const descriptor of XRIFT_INTERACTION_PROPERTIES) {
    const scope = getXriftInteractionScope(descriptor.target);
    assert(
      scope === "viewer" || scope === "world",
      `${descriptor.target}.${descriptor.name} has no scope`,
    );
    // The Scene and the player belong to one viewer by design; anything else
    // is world content that simply is not synchronised yet. A new target that
    // silently lands in the wrong half is the failure this catches.
    const expected =
      descriptor.target === "scene" || descriptor.target === "player"
        ? "viewer"
        : "world";
    assert(
      scope === expected,
      `${descriptor.target}.${descriptor.name} claims the ${scope} scope, expected ${expected}`,
    );
  }
  assert(
    Boolean(XRIFT_INTERACTION_SCOPE_NOTES.viewer) &&
      Boolean(XRIFT_INTERACTION_SCOPE_NOTES.world),
    "a scope has no sentence to show the author",
  );

  // And the sentence the Editor renders has to carry it, or the registry knows
  // something the author never sees.
  const targets = collectInteractionTriggerTargets(buildScene());
  const described = describeInteractionTriggerAction(targets, {
    entityId: "entity_sign",
    componentId: "",
    targetKind: "transform",
    property: "position",
    mode: "set",
    value: [0, 1, 0],
  });
  assert(
    described.includes(XRIFT_INTERACTION_SCOPE_LABELS.world),
    `a world-scoped action did not say who sees it: ${described}`,
  );
}

/**
 * A value that comes from the graph must not erase the action that writes it.
 *
 * The static walk has no evaluator, so it used to drop any action whose value
 * socket was wired. The action was still perfectly well configured - it named
 * an Entity, a Component and a property - and the interpreter ran it, but the
 * Editor called the node unfinished and the compiler never learned the Entity
 * was a dependency. Recording it as `linked` says the one true thing the walk
 * knows: what the action writes to, and that only the interpreter can say with
 * what.
 */
function assertWiredValueKeepsItsAction(): void {
  const documents = buildDocuments();
  const graphAsset = documents.assets.assets[GRAPH_ASSET_ID];
  if (graphAsset?.kind !== "interactivity") {
    throw new Error("the fixture's Interactivity Asset is missing");
  }
  const extension = cloneKhrInteractivityExtension(graphAsset.extension);
  const graph = graphOf(extension);
  const move = appendInteractivityOperation(
    graph,
    XRIFT_INTERACTION_OPERATIONS.setProperty,
    { x: 1000, y: 640 },
  );
  assert(
    configureInteractivityTriggerAction(graph, move, {
      entityId: "entity_sign",
      componentId: "",
      targetKind: "transform",
      property: "position",
    }),
    "the transform action could not be targeted",
  );
  const literal = collectXriftInteractionActions(extension).find(
    (action) => action.nodeIndex === move,
  );
  assert(
    literal?.value?.kind === "vector3",
    "a literal transform action did not parse",
  );

  // Replace the literal with a wire, the way an author does when the value
  // should be computed.
  const source = appendInteractivityOperation(graph, "math/add", {
    x: 760,
    y: 640,
  });
  const node = graph.nodes?.[move];
  if (!node) throw new Error("the action node vanished");
  node.values = { ...(node.values ?? {}), value: { node: source, socket: "value" } };

  const wired = collectXriftInteractionActions(extension).find(
    (action) => action.nodeIndex === move,
  );
  assert(
    wired !== undefined,
    "an action whose value comes from the graph vanished from the walk",
  );
  assert(
    wired?.value?.kind === "linked" &&
      wired.entityId === "entity_sign" &&
      wired.property === "position",
    "a linked action lost the target it plainly names",
  );

  // And the Editor must stop calling a finished node unfinished.
  assert(
    !collectInteractivityRuntimeDiagnostics(extension).some((diagnostic) =>
      diagnostic.message.includes("まだ決まっていない"),
    ),
    "a wired value is still reported as an unconfigured action",
  );

  // The dependency it names has to survive into the Component, or the compiler
  // publishes a world whose trigger writes to an Entity it never emitted.
  const assets = {
    ...documents.assets,
    assets: {
      ...documents.assets.assets,
      [GRAPH_ASSET_ID]: { ...graphAsset, extension },
    },
  };
  const synced = syncInteractionTriggerReferences(
    documents.scenes.scene_main,
    assets,
  );
  const trigger = synced.entities.entity_button?.components.find(
    (component) => component.type === "interaction-trigger",
  );
  assert(
    trigger?.type === "interaction-trigger" &&
      trigger.entityReferences.includes("entity_sign"),
    "a linked action's Entity dependency was dropped",
  );
}

/**
 * A graph that moves the player has to move them after upload too.
 *
 * The player is reached through a bridge the host parks on the scene, so the
 * published world needs both the bridge module and the component that fills it
 * in - and it must not record the player stand-in as an Entity dependency,
 * because there is no such Entity for the compiler to emit.
 */
function assertPlayerTeleportReachesThePublishedWorld(): void {
  const documents = buildDocuments();
  const graphAsset = documents.assets.assets[GRAPH_ASSET_ID];
  if (graphAsset?.kind !== "interactivity") {
    throw new Error("the fixture's Interactivity Asset is missing");
  }
  const extension = cloneKhrInteractivityExtension(graphAsset.extension);
  const graph = graphOf(extension);
  const move = appendInteractivityOperation(
    graph,
    XRIFT_INTERACTION_OPERATIONS.setProperty,
    { x: 1000, y: 480 },
  );
  assert(
    configureInteractivityTriggerAction(graph, move, {
      entityId: XRIFT_INTERACTION_PLAYER_ENTITY_ID,
      componentId: "",
      targetKind: "player",
      property: "teleport",
    }),
    "the teleport action could not be targeted at the player",
  );
  const parsed = collectXriftInteractionActions(extension).find(
    (action) => action.target === "player",
  );
  assert(
    parsed?.property === "teleport" && parsed.value?.kind === "vector3",
    "the teleport action did not parse as a vector3 write on the player",
  );

  const assets = {
    ...documents.assets,
    assets: {
      ...documents.assets.assets,
      [GRAPH_ASSET_ID]: { ...graphAsset, extension },
    },
  };
  const synced = syncInteractionTriggerReferences(
    documents.scenes.scene_main,
    assets,
  );
  for (const entity of Object.values(synced.entities)) {
    for (const component of entity.components) {
      if (component.type !== "interaction-trigger") continue;
      assert(
        !(component.entityReferences ?? []).includes(
          XRIFT_INTERACTION_PLAYER_ENTITY_ID,
        ),
        "the player stand-in was recorded as an Entity dependency",
      );
    }
  }

  const result = compileVisualProject(
    {
      ...documents,
      scenes: { ...documents.scenes, scene_main: synced },
      assets,
    },
    { generatedAt: "2026-09-01T00:00:00.000Z" },
  );
  const world = result.overlayFiles.find(
    (file) => file.relativePath === "src/World.tsx",
  )?.content;
  assert(Boolean(world), "World.tsx was not emitted");
  assert(
    world!.includes("<XriftPlayerRuntime />"),
    "the player bridge was left out of a world whose graph teleports",
  );
  for (const path of [
    PLAYER_RUNTIME_OVERLAY_PATH,
    PLAYER_RUNTIME_HOST_OVERLAY_PATH,
  ]) {
    assert(
      result.overlayFiles.some((file) => file.relativePath === path),
      `the published world is missing ${path}`,
    );
  }
  const host = result.overlayFiles.find(
    (file) => file.relativePath === PLAYER_RUNTIME_HOST_OVERLAY_PATH,
  )?.content;
  assert(
    (host ?? "").includes("useTeleportContext"),
    "the emitted player bridge does not go through the platform's teleport",
  );
}

function assertPublishedWorldCarriesTheCompositorForAGraph(): void {
  const documents = buildDocuments();
  const graphAsset = documents.assets.assets[GRAPH_ASSET_ID];
  if (graphAsset?.kind !== "interactivity") {
    throw new Error("the fixture's Interactivity Asset is missing");
  }
  const extension = cloneKhrInteractivityExtension(graphAsset.extension);
  const graph = graphOf(extension);
  const brighten = appendInteractivityOperation(
    graph,
    XRIFT_INTERACTION_OPERATIONS.toggleProperty,
    { x: 1000, y: 320 },
  );
  configureInteractivityTriggerAction(graph, brighten, {
    entityId: XRIFT_INTERACTION_SCENE_ENTITY_ID,
    componentId: "",
    targetKind: "scene",
    property: "postprocessing",
  });
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
  assert(Boolean(world), "World.tsx was not emitted");
  assert(
    world!.includes("<ScenePostprocessing settings={"),
    "the compositor was left out of a world whose graph turns it on",
  );
  assert(
    result.overlayFiles.some(
      (file) =>
        file.relativePath === "src/xrift-studio/scene-postprocessing.tsx",
    ) &&
      result.overlayFiles.some(
        (file) => file.relativePath === "src/xrift-studio/scene-runtime.tsx",
      ),
    "the compositor shipped without the Scene bridge it reads",
  );
  const compositor = result.overlayFiles.find(
    (file) => file.relativePath === "src/xrift-studio/scene-postprocessing.tsx",
  )?.content;
  assert(
    compositor!.includes('from "./scene-runtime"'),
    "the staged compositor keeps a package path the flat world cannot resolve",
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

/**
 * Runtime JSON has to carry the graph, not refuse it.
 *
 * This assertion used to prove the opposite: a trigger blocked staging, because
 * the manifest could carry the graph and nothing on the runtime side read it.
 * Now that `XriftRuntimeInteractionTriggers` runs it, the same assertion is
 * what proves the graph travels - inlined, with its Entity and Asset references
 * intact, so a published world's button answers a press the way Play does.
 */
function assertRuntimeJsonOutputCarriesTheTrigger(): void {
  const result = compileVisualProject(buildDocuments(), {
    generatedAt: "2026-08-29T00:00:00.000Z",
    outputMode: "classic-runtime",
  });
  assert(
    result.canStage,
    `Runtime JSON refused a trigger it can now run: ${result.diagnostics
      .filter((diagnostic) => diagnostic.severity === "blocking")
      .map((diagnostic) => diagnostic.code)
      .join(" / ")}`,
  );
  const manifest = result.runtimeManifestFile?.content;
  assert(Boolean(manifest), "Runtime JSON output emitted no manifest");
  const parsed = JSON.parse(manifest!) as {
    scenes: Record<
      string,
      {
        entities: Record<
          string,
          { components: Array<{ type: string; graph?: unknown }> }
        >;
      }
    >;
  };
  const triggers = Object.values(parsed.scenes).flatMap((scene) =>
    Object.values(scene.entities).flatMap((entity) =>
      entity.components.filter(
        (component) => component.type === "interaction-trigger",
      ),
    ),
  );
  assert(
    triggers.length > 0,
    "the Runtime JSON manifest carries no Interaction Trigger",
  );
  assert(
    triggers.every(
      (trigger) =>
        typeof trigger.graph === "object" &&
        trigger.graph !== null &&
        Array.isArray((trigger.graph as { graphs?: unknown }).graphs),
    ),
    "a Runtime JSON trigger carries no graph for the interpreter to walk",
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
          {
            id: "component_sign_text",
            type: "text",
            enabled: true,
            text: "CLOSED",
            color: "#ffffff",
            fontSize: 0.2,
            anchorX: "center",
            anchorY: "middle",
            outlineWidth: 0,
            outlineColor: "#000000",
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
      [SKYBOX_ASSET_ID]: {
        id: SKYBOX_ASSET_ID,
        name: "Sunset",
        kind: "skybox",
        status: "ready",
        source: { kind: "project", relativePath: "assets/skybox/sunset.hdr" },
        thumbnail: { status: "missing" },
        projection: "equirectangular",
        sourceFormat: "hdr",
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
