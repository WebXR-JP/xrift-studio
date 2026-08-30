import { linearRgbToTint, tintToLinearRgb } from "./glow-material-catalog";
import {
  cloneKhrInteractivityExtension,
  collectInteractivityRuntimeDiagnostics,
  createDefaultKhrInteractivityExtension,
  estimateInteractivityNodeHeight,
  getInteractivityOperationTemplate,
  getInteractivityRuntimeSupport,
  getKhrInteractivityOnStartAnimationCues,
  INTERACTIVITY_NODE_CARD_WIDTH,
  KHR_INTERACTIVITY_MATERIAL_POINTER_PRESETS,
  validateKhrInteractivityExtension,
  readInteractivityNodePosition,
  type KhrInteractivityExtension,
  type KhrInteractivityGraph,
  type KhrInteractivityJsonValue,
} from "./interactivity-graph";
import {
  addInteractivityGraph,
  duplicateInteractivityGraph,
  removeInteractivityGraph,
  renameInteractivityGraph,
} from "./interactivity-graph";
import {
  appendInteractivityOperation,
  connectInteractivityFlow,
  createModelAnimationGraphExtension,
  ensureInteractivityTypes,
  getInteractivityRecipeRuntimeSupport,
  INTERACTIVITY_RECIPE_COLOR,
  INTERACTIVITY_RECIPES,
  setInteractivityLiteralValue,
} from "./interactivity-recipes";
import { removeNodesAndReindex } from "../../components/visual-editor/interactivity-graph-flow";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function emptyExtension(): KhrInteractivityExtension {
  const extension = cloneKhrInteractivityExtension(
    createDefaultKhrInteractivityExtension(),
  );
  const graph = extension.graphs[0] as KhrInteractivityGraph;
  graph.nodes = [];
  graph.declarations = [];
  graph.types = [];
  return extension;
}

/** Deterministic assertions for the Interactivity recipes and graph primitives. */
export function runInteractivityRecipeFixtureAssertions(): void {
  // Every recipe has to leave a graph the editor will let the author save. A
  // recipe that lands with a validation error is worse than no recipe: the
  // save button goes dead and nothing on screen says which node caused it.
  for (const recipe of INTERACTIVITY_RECIPES) {
    const extension = emptyExtension();
    const graph = extension.graphs[0] as KhrInteractivityGraph;
    recipe.build(graph, { x: 0, y: 0 }, 0);
    const errors = validateKhrInteractivityExtension(extension).filter(
      (diagnostic) => diagnostic.severity === "error",
    );
    assert(
      errors.length === 0,
      `Recipe ${recipe.id} produced ${errors.length} errors: ${errors
        .map((diagnostic) => `${diagnostic.path} ${diagnostic.message}`)
        .join(" / ")}`,
    );

    // The chain has to be connected. Two loose nodes look identical to a
    // connected pair until the world runs and nothing happens.
    const nodes = graph.nodes ?? [];
    assert(nodes.length >= 2, `Recipe ${recipe.id} placed fewer than two nodes`);
    const flowTargets = new Set(
      nodes.flatMap((node) => Object.values(node.flows ?? {}).map((flow) => flow.node)),
    );
    assert(
      flowTargets.size === nodes.length - 1,
      `Recipe ${recipe.id} left a node with no incoming flow`,
    );

    // The node the editor selects has to exist, or applying a recipe opens an
    // empty inspector.
    assert(
      nodes[recipe.focusOffset] !== undefined,
      `Recipe ${recipe.id} focuses a node it never created`,
    );

    // Every node is placed relative to the origin the editor passes in, so a
    // recipe cannot land off-screen when the author has panned away.
    for (const [index, node] of nodes.entries()) {
      const position = readInteractivityNodePosition(node, index);
      assert(
        Number.isFinite(position.x) && Number.isFinite(position.y),
        `Recipe ${recipe.id} placed node ${index} without a position`,
      );
    }

    // A recipe that writes a material property must say so, or the palette
    // offers it in a project with no Material and it silently targets nothing.
    const writesMaterial = nodes.some(
      (node) => node.values?.material !== undefined,
    );
    assert(
      writesMaterial === (recipe.needsMaterial === true),
      `Recipe ${recipe.id} disagrees with its needsMaterial flag`,
    );
  }

  // Colour recipes have to write the colour they advertise, in the linear light
  // glTF stores, not the sRGB hex the palette shows.
  const colorRecipe = INTERACTIVITY_RECIPES.find(
    (recipe) => recipe.id === "start-set-color",
  );
  assert(colorRecipe !== undefined, "The base colour recipe is missing");
  const colorExtension = emptyExtension();
  const colorGraph = colorExtension.graphs[0] as KhrInteractivityGraph;
  colorRecipe.build(colorGraph, { x: 0, y: 0 }, 0);
  const written = colorGraph.nodes?.[1]?.values?.value?.value ?? [];
  const [red, green, blue] = tintToLinearRgb(INTERACTIVITY_RECIPE_COLOR);
  assert(
    written[0] === red && written[1] === green && written[2] === blue && written[3] === 1,
    "The colour recipe wrote a different colour than the catalog derives",
  );
  assert(
    linearRgbToTint(written.slice(0, 3) as number[]) === INTERACTIVITY_RECIPE_COLOR,
    "A linear colour did not survive the round trip back to a hex the picker shows",
  );

  // The colour flag is what tells the inspector to show a picker rather than
  // four raw channel fields, so it has to stay on the factors that are colours.
  const colorPresets = KHR_INTERACTIVITY_MATERIAL_POINTER_PRESETS.filter(
    (preset) => preset.color === true,
  ).map((preset) => preset.id);
  assert(
    colorPresets.includes("base-color") && colorPresets.includes("emissive"),
    "A colour factor stopped being marked as a colour",
  );
  for (const preset of KHR_INTERACTIVITY_MATERIAL_POINTER_PRESETS) {
    if (preset.color !== true) continue;
    assert(
      preset.signature === "float3" || preset.signature === "float4",
      `Pointer preset ${preset.id} is marked as a colour but is ${preset.signature}`,
    );
  }

  // Appending an operation reuses an existing declaration rather than adding a
  // second row for the same op, which is what keeps the emitted glTF small and
  // the declaration indices stable for graphs saved earlier.
  const reuse = emptyExtension();
  const reuseGraph = reuse.graphs[0] as KhrInteractivityGraph;
  const first = appendInteractivityOperation(reuseGraph, "event/onStart", { x: 0, y: 0 });
  const second = appendInteractivityOperation(reuseGraph, "event/onStart", { x: 0, y: 200 });
  assert(first === 0 && second === 1, "Appending did not return the index it landed on");
  assert(
    reuseGraph.declarations?.length === 1,
    "The same operation was declared twice",
  );

  // A template's defaults come along, so a delay arrives as one second rather
  // than as an empty socket the author has to discover.
  const delayIndex = appendInteractivityOperation(reuseGraph, "flow/setDelay", { x: 0, y: 0 });
  const defaultDuration = reuseGraph.nodes?.[delayIndex]?.values?.duration?.value?.[0];
  assert(
    defaultDuration === 1,
    "A new delay node arrived without its default duration",
  );
  assert(
    getInteractivityOperationTemplate("flow/setDelay")?.flowOutputs.includes("done") === true,
    "The delay template stopped exposing the socket the recipes connect",
  );

  // A literal write only touches a socket the template already declared.
  setInteractivityLiteralValue(reuseGraph, delayIndex, "duration", [2.5]);
  const authoredDuration = reuseGraph.nodes?.[delayIndex]?.values?.duration?.value?.[0];
  assert(
    authoredDuration === 2.5,
    "A literal write did not reach the socket",
  );
  setInteractivityLiteralValue(reuseGraph, delayIndex, "notASocket", [1]);
  assert(
    reuseGraph.nodes?.[delayIndex]?.values?.notASocket === undefined,
    "A literal write invented a socket the operation does not have",
  );

  // Connecting twice from one flow socket replaces rather than duplicates: the
  // KHR flow socket holds a single target.
  connectInteractivityFlow(reuseGraph, first, "out", second);
  connectInteractivityFlow(reuseGraph, first, "out", delayIndex);
  assert(
    reuseGraph.nodes?.[first]?.flows?.out?.node === delayIndex,
    "Reconnecting a flow socket did not replace the earlier target",
  );
}

/**
 * Adding, copying and removing graphs inside one Asset.
 *
 * The default-graph index is the part that breaks quietly: remove a graph in
 * the middle and every index after it shifts, so a document that still says
 * "run graph 2" starts running a different graph.
 */
export function runInteractivityGraphListFixtureAssertions(): void {
  const extension: KhrInteractivityExtension = {
    graph: 0,
    graphs: [{ name: "First" }],
  };

  const second = addInteractivityGraph(extension, "Second");
  assert(second === 1, "adding a graph did not return its index");
  const third = addInteractivityGraph(extension, "Third");
  assert(
    extension.graphs.length === 3 && extension.graphs[third]?.name === "Third",
    "adding graphs did not extend the Asset",
  );
  assert(
    validateKhrInteractivityExtension(extension).every(
      (diagnostic) => diagnostic.severity !== "error",
    ),
    "a freshly added graph cannot be saved",
  );

  extension.graph = 2;
  assert(
    removeInteractivityGraph(extension, 1),
    "removing a graph in the middle was refused",
  );
  const remaining = extension.graphs.map((graph) => graph.name).join(",");
  assert(
    remaining === "First,Third",
    `removing a graph did not close the gap: ${remaining}`,
  );
  const followedIndex = extension.graph;
  assert(
    followedIndex === 1,
    "the default graph index did not follow the graph it pointed at",
  );

  extension.graph = 1;
  assert(
    removeInteractivityGraph(extension, 1),
    "removing the default graph was refused",
  );
  const resetIndex = extension.graph;
  assert(
    resetIndex === 0,
    "removing the default graph left the index pointing past the list",
  );
  assert(
    !removeInteractivityGraph(extension, 0),
    "the last graph was removed, leaving an Asset with no graph at all",
  );

  const source = extension.graphs[0];
  assert(source !== undefined, "the remaining graph went missing");
  source.declarations = [{ op: "event/onStart" }];
  source.nodes = [{ declaration: 0 }];
  const copyIndex = duplicateInteractivityGraph(extension, 0);
  const copy = extension.graphs[copyIndex];
  assert(copy !== undefined, "duplicating a graph produced nothing");
  assert(copy.nodes?.length === 1, "duplicating a graph did not copy its nodes");
  assert(
    copy.nodes !== source.nodes,
    "a duplicated graph shares its node array with the original",
  );
  assert(
    renameInteractivityGraph(extension, copyIndex, "Renamed") &&
      extension.graphs[copyIndex]?.name === "Renamed",
    "renaming a graph did not take",
  );
  assert(
    validateKhrInteractivityExtension(extension).every(
      (diagnostic) => diagnostic.severity !== "error",
    ),
    "graph list edits produced an Asset the editor cannot save",
  );
}

/**
 * What the Play execution engine actually runs.
 *
 * These assertions pin the properties the engine keeps: a chain continues only
 * through operations it implements, a computed input is evaluated rather than
 * refused, and whatever it will not run is reported instead of dropped in
 * silence. The support table and the engine have to agree, or a node card shows
 * a badge that says one thing while Play does another.
 */
export function runInteractivityRuntimeAdapterFixtureAssertions(): void {
  const build = (
    make: (graph: KhrInteractivityGraph) => void,
  ): KhrInteractivityExtension => {
    const extension = emptyExtension();
    make(extension.graphs[0] as KhrInteractivityGraph);
    assert(
      validateKhrInteractivityExtension(extension).every(
        (diagnostic) => diagnostic.severity !== "error",
      ),
      "A runtime engine case built an invalid graph, so its result proves nothing",
    );
    return extension;
  };

  /** Writes an inline value onto a socket the operation template does not declare. */
  const setLiteral = (
    graph: KhrInteractivityGraph,
    nodeIndex: number,
    socket: string,
    signature: "float" | "int" | "bool",
    value: KhrInteractivityJsonValue[],
  ) => {
    const types = ensureInteractivityTypes(graph);
    const node = graph.nodes?.[nodeIndex];
    if (!node) return;
    node.values = { ...node.values, [socket]: { type: types[signature], value } };
  };

  // A branch whose condition is computed takes the matching side. The static
  // walk this replaced could not evaluate a wire, so it ran neither side.
  const computedBranch = build((graph) => {
    const start = appendInteractivityOperation(graph, "event/onStart", { x: 0, y: 0 });
    const compare = appendInteractivityOperation(graph, "math/gt", { x: 150, y: 160 });
    setLiteral(graph, compare, "a", "float", [2]);
    setLiteral(graph, compare, "b", "float", [1]);
    const branch = appendInteractivityOperation(graph, "flow/branch", { x: 300, y: 0 });
    const whenTrue = appendInteractivityOperation(graph, "animation/start", { x: 600, y: -80 });
    const whenFalse = appendInteractivityOperation(graph, "animation/start", { x: 600, y: 80 });
    setInteractivityLiteralValue(graph, whenTrue, "animation", [0]);
    setInteractivityLiteralValue(graph, whenFalse, "animation", [1]);
    connectInteractivityFlow(graph, start, "out", branch);
    connectInteractivityFlow(graph, branch, "true", whenTrue);
    connectInteractivityFlow(graph, branch, "false", whenFalse);
    const branchNode = graph.nodes?.[branch];
    assert(branchNode !== undefined, "flow/branch node went missing");
    branchNode.values = {
      ...branchNode.values,
      condition: { node: compare, socket: "value" },
    };
  });
  const computed = getKhrInteractivityOnStartAnimationCues(computedBranch);
  assert(
    computed.length === 1 && computed[0]?.animationIndex === 0,
    "A branch on a computed condition did not take exactly the matching side",
  );
  assert(
    collectInteractivityRuntimeDiagnostics(computedBranch).length === 0,
    "A graph the engine fully runs still reported a runtime warning",
  );

  // A constant condition picks exactly one side.
  const constantBranch = build((graph) => {
    const start = appendInteractivityOperation(graph, "event/onStart", { x: 0, y: 0 });
    const branch = appendInteractivityOperation(graph, "flow/branch", { x: 300, y: 0 });
    const whenTrue = appendInteractivityOperation(graph, "animation/start", { x: 600, y: -80 });
    const whenFalse = appendInteractivityOperation(graph, "animation/start", { x: 600, y: 80 });
    setInteractivityLiteralValue(graph, branch, "condition", [true]);
    setInteractivityLiteralValue(graph, whenTrue, "animation", [0]);
    setInteractivityLiteralValue(graph, whenFalse, "animation", [1]);
    connectInteractivityFlow(graph, start, "out", branch);
    connectInteractivityFlow(graph, branch, "true", whenTrue);
    connectInteractivityFlow(graph, branch, "false", whenFalse);
  });
  const takenBranch = getKhrInteractivityOnStartAnimationCues(constantBranch);
  assert(
    takenBranch.length === 1 && takenBranch[0]?.animationIndex === 0,
    "A constant flow/branch did not take exactly the matching side",
  );

  // `done` waits for the duration; `out` continues immediately. The shipped
  // delayed-animation recipe is exactly the `done` case.
  const delayed = build((graph) => {
    const start = appendInteractivityOperation(graph, "event/onStart", { x: 0, y: 0 });
    const delay = appendInteractivityOperation(graph, "flow/setDelay", { x: 300, y: 0 });
    const afterDelay = appendInteractivityOperation(graph, "animation/start", { x: 600, y: -80 });
    const immediate = appendInteractivityOperation(graph, "animation/start", { x: 600, y: 80 });
    setInteractivityLiteralValue(graph, delay, "duration", [1.5]);
    setInteractivityLiteralValue(graph, afterDelay, "animation", [0]);
    setInteractivityLiteralValue(graph, immediate, "animation", [1]);
    connectInteractivityFlow(graph, start, "out", delay);
    connectInteractivityFlow(graph, delay, "done", afterDelay);
    connectInteractivityFlow(graph, delay, "out", immediate);
  });
  const delayedCues = getKhrInteractivityOnStartAnimationCues(delayed);
  assert(
    delayedCues.length === 2,
    "flow/setDelay did not schedule both of its flow outputs",
  );
  assert(
    delayedCues.find((cue) => cue.animationIndex === 1)?.delaySeconds === 0,
    "flow/setDelay delayed the `out` socket, which continues immediately",
  );
  assert(
    delayedCues.find((cue) => cue.animationIndex === 0)?.delaySeconds === 1.5,
    "flow/setDelay did not carry its duration to the `done` socket",
  );

  // A variable write runs, and the chain continues through it.
  const throughVariable = build((graph) => {
    const start = appendInteractivityOperation(graph, "event/onStart", { x: 0, y: 0 });
    const write = appendInteractivityOperation(graph, "variable/set", { x: 300, y: 0 });
    const play = appendInteractivityOperation(graph, "animation/start", { x: 600, y: 0 });
    setInteractivityLiteralValue(graph, play, "animation", [2]);
    connectInteractivityFlow(graph, start, "out", write);
    connectInteractivityFlow(graph, write, "out", play);
  });
  const afterVariable = getKhrInteractivityOnStartAnimationCues(throughVariable);
  assert(
    afterVariable.length === 1 && afterVariable[0]?.animationIndex === 2,
    "The chain no longer continues through variable/set",
  );

  // An operation no host implements stops the chain and is reported.
  const behindPointer = build((graph) => {
    const start = appendInteractivityOperation(graph, "event/onStart", { x: 0, y: 0 });
    const write = appendInteractivityOperation(graph, "pointer/set", { x: 300, y: 0 });
    const play = appendInteractivityOperation(graph, "animation/start", { x: 600, y: 0 });
    setInteractivityLiteralValue(graph, play, "animation", [0]);
    connectInteractivityFlow(graph, start, "out", write);
    connectInteractivityFlow(graph, write, "out", play);
  });
  assert(
    getKhrInteractivityOnStartAnimationCues(behindPointer).length === 0,
    "The engine continued past an operation no host implements",
  );
  assert(
    collectInteractivityRuntimeDiagnostics(behindPointer).some((diagnostic) =>
      diagnostic.message.startsWith("pointer/set:"),
    ),
    "An operation no host implements was skipped without being reported",
  );

  // `animation/stop` cancels a start it reaches at the same moment, and records
  // the stop time when the graph waits in between.
  const stopped = build((graph) => {
    const start = appendInteractivityOperation(graph, "event/onStart", { x: 0, y: 0 });
    const play = appendInteractivityOperation(graph, "animation/start", { x: 300, y: 0 });
    const stop = appendInteractivityOperation(graph, "animation/stop", { x: 600, y: 0 });
    setInteractivityLiteralValue(graph, play, "animation", [0]);
    setInteractivityLiteralValue(graph, stop, "animation", [0]);
    connectInteractivityFlow(graph, start, "out", play);
    connectInteractivityFlow(graph, play, "out", stop);
  });
  assert(
    getKhrInteractivityOnStartAnimationCues(stopped).length === 0,
    "animation/stop did not cancel the start it directly follows",
  );

  const stoppedLate = build((graph) => {
    const start = appendInteractivityOperation(graph, "event/onStart", { x: 0, y: 0 });
    const play = appendInteractivityOperation(graph, "animation/start", { x: 300, y: 0 });
    const delay = appendInteractivityOperation(graph, "flow/setDelay", { x: 600, y: 0 });
    const stop = appendInteractivityOperation(graph, "animation/stop", { x: 900, y: 0 });
    setInteractivityLiteralValue(graph, play, "animation", [0]);
    setInteractivityLiteralValue(graph, delay, "duration", [2]);
    setInteractivityLiteralValue(graph, stop, "animation", [0]);
    connectInteractivityFlow(graph, start, "out", play);
    connectInteractivityFlow(graph, play, "out", delay);
    connectInteractivityFlow(graph, delay, "done", stop);
  });
  const timed = getKhrInteractivityOnStartAnimationCues(stoppedLate);
  assert(
    timed.length === 1 && timed[0]?.delaySeconds === 0,
    "A stop after a delay dropped the playback that had already started",
  );
  assert(
    timed[0]?.stopSeconds === 2,
    "A stop after a delay did not record when the playback ends",
  );

  // The op table and the engine have to agree, or the badge on a node card says
  // one thing while Play does another.
  assert(
    getInteractivityRuntimeSupport("event/onStart").support === "executed" &&
      getInteractivityRuntimeSupport("variable/set").support === "executed" &&
      getInteractivityRuntimeSupport("flow/sequence").support === "executed" &&
      getInteractivityRuntimeSupport("animation/start").support === "conditional" &&
      getInteractivityRuntimeSupport("pointer/set").support === "ignored" &&
      getInteractivityRuntimeSupport("nonexistent/operation").support === "ignored",
    "The runtime support table no longer matches the operations the engine runs",
  );

  // Every recipe reports its own support, and the animation recipes are the
  // ones Play can run today.
  for (const recipe of INTERACTIVITY_RECIPES) {
    const support = getInteractivityRecipeRuntimeSupport(recipe);
    assert(
      support === "executed" || support === "ignored",
      `Recipe ${recipe.id} reported an unknown runtime support value`,
    );
  }
  const recipeById = (id: string) => {
    const recipe = INTERACTIVITY_RECIPES.find((candidate) => candidate.id === id);
    assert(recipe !== undefined, `The ${id} recipe is gone, so its coverage is gone too`);
    return recipe;
  };
  assert(
    getInteractivityRecipeRuntimeSupport(recipeById("start-animation")) === "executed",
    "The plain animation recipe stopped being runnable in Play",
  );
  assert(
    getInteractivityRecipeRuntimeSupport(recipeById("delayed-animation")) === "executed",
    "The delayed animation recipe is no longer runnable in Play",
  );
  assert(
    getInteractivityRecipeRuntimeSupport(recipeById("start-set-color")) === "ignored",
    "A pointer/set recipe claimed Play support no host provides",
  );
}


/**
 * The graph a Model's clips generate, checked the way Play will read it.
 *
 * The generator's whole promise is「押せば全部のclipが同時にループ再生される」,
 * and that promise is only kept if the dry run reports one cue per clip, all at
 * zero, none of them bounded. Counting nodes would not catch a fan-out that
 * reused a socket and quietly dropped sixty of them.
 */
export function runModelAnimationGraphFixtureAssertions(): void {
  const names = Array.from({ length: 64 }, (_, index) => `Clip ${index}`);
  const extension = createModelAnimationGraphExtension(names);
  assert(
    validateKhrInteractivityExtension(extension).every(
      (item) => item.severity !== "error",
    ),
    "The generated animation graph does not validate",
  );
  assert(
    collectInteractivityRuntimeDiagnostics(extension).length === 0,
    "The generated animation graph contains something Play cannot run",
  );

  const cues = getKhrInteractivityOnStartAnimationCues(extension);
  assert(
    cues.length === names.length,
    `The generated graph starts ${cues.length} clips, not ${names.length}`,
  );
  assert(
    cues.every((cue) => cue.delaySeconds === 0),
    "A generated clip does not start with the world",
  );
  assert(
    new Set(cues.map((cue) => cue.animationIndex)).size === names.length,
    "The generated graph starts the same clip more than once",
  );
  assert(
    cues.every((cue) => (cue.endTime ?? null) === null),
    "A generated clip carries an end time, so it would play once instead of looping",
  );
  assert(
    cues.every((cue) => cue.stopSeconds === undefined),
    "A generated clip is stopped by its own graph",
  );

  // Sixty-four cards land in a column, and a pitch guessed from one operation
  // stacks them on each other: the graph opens as an unreadable pile and the
  // author's first act is to drag them apart.
  const placed = (extension.graphs[0]?.nodes ?? []).map((node, index) => ({
    ...readInteractivityNodePosition(node, index),
    height: estimateInteractivityNodeHeight(
      extension.graphs[0] as KhrInteractivityGraph,
      index,
    ),
  }));
  for (let left = 0; left < placed.length; left += 1) {
    for (let right = left + 1; right < placed.length; right += 1) {
      const a = placed[left]!;
      const b = placed[right]!;
      const overlaps =
        a.x < b.x + INTERACTIVITY_NODE_CARD_WIDTH &&
        b.x < a.x + INTERACTIVITY_NODE_CARD_WIDTH &&
        a.y < b.y + b.height &&
        b.y < a.y + a.height;
      assert(!overlaps, `Generated nodes ${left} and ${right} are placed on top of each other`);
    }
  }

  // Deleting a play node has to leave the rest playing: an author trimming
  // sixty-four clips down to the three they want does it one node at a time.
  const trimmed = cloneKhrInteractivityExtension(extension);
  const graph = trimmed.graphs[0] as KhrInteractivityGraph;
  const victim = (graph.nodes ?? []).findIndex(
    (node) => graph.declarations?.[node.declaration]?.op === "animation/start",
  );
  assert(victim >= 0, "The generated graph has no animation node to delete");
  removeNodesAndReindex(graph, [victim]);
  assert(
    getKhrInteractivityOnStartAnimationCues(trimmed).length === names.length - 1,
    "Deleting one generated clip changed how many of the others play",
  );

  // One clip is the degenerate case the grouping must not break.
  const single = createModelAnimationGraphExtension(["Idle"]);
  assert(
    getKhrInteractivityOnStartAnimationCues(single).length === 1,
    "A Model with one clip did not generate a graph that plays it",
  );
  assert(
    getKhrInteractivityOnStartAnimationCues(
      createModelAnimationGraphExtension([]),
    ).length === 0,
    "A Model with no clips generated a graph that plays something",
  );
}
