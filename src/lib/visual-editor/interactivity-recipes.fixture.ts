import { linearRgbToTint, tintToLinearRgb } from "./glow-material-catalog";
import {
  cloneKhrInteractivityExtension,
  collectInteractivityRuntimeDiagnostics,
  createDefaultKhrInteractivityExtension,
  getInteractivityOperationTemplate,
  getInteractivityRuntimeSupport,
  getKhrInteractivityOnStartAnimationCues,
  KHR_INTERACTIVITY_MATERIAL_POINTER_PRESETS,
  validateKhrInteractivityExtension,
  readInteractivityNodePosition,
  type KhrInteractivityExtension,
  type KhrInteractivityGraph,
} from "./interactivity-graph";
import {
  appendInteractivityOperation,
  connectInteractivityFlow,
  getInteractivityRecipeRuntimeSupport,
  INTERACTIVITY_RECIPE_COLOR,
  INTERACTIVITY_RECIPES,
  setInteractivityLiteralValue,
} from "./interactivity-recipes";

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
 * What the Play runtime adapter actually executes.
 *
 * The adapter used to walk every flow edge regardless of the operation, so a
 * graph gated behind a branch started both branches and a graph behind a delay
 * started with no delay at all. These assertions pin the two properties that
 * fix keeps: an unimplemented operation produces no flow output, and whatever
 * the walk refuses to run is reported instead of dropped in silence.
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
      "A runtime adapter case built an invalid graph, so its result proves nothing",
    );
    return extension;
  };

  // A branch whose condition comes from another node must start nothing: the
  // adapter has no expression evaluator. Following both sides was the original
  // behaviour, and it played every clip in the graph.
  const openBranch = build((graph) => {
    const start = appendInteractivityOperation(graph, "event/onStart", { x: 0, y: 0 });
    const source = appendInteractivityOperation(graph, "variable/get", { x: 150, y: 160 });
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
      condition: { node: source, socket: "value" },
    };
  });
  assert(
    getKhrInteractivityOnStartAnimationCues(openBranch).length === 0,
    "An unevaluable flow/branch still started animations",
  );
  assert(
    collectInteractivityRuntimeDiagnostics(openBranch).some((diagnostic) =>
      diagnostic.message.startsWith("flow/branch:"),
    ),
    "An unevaluable flow/branch was skipped without being reported",
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
  assert(
    collectInteractivityRuntimeDiagnostics(constantBranch).length === 0,
    "A graph the adapter fully runs still reported a runtime warning",
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

  // An unimplemented operation stops the walk instead of running the rest of
  // the chain as though it had succeeded.
  const behindIgnored = build((graph) => {
    const start = appendInteractivityOperation(graph, "event/onStart", { x: 0, y: 0 });
    const write = appendInteractivityOperation(graph, "variable/set", { x: 300, y: 0 });
    const play = appendInteractivityOperation(graph, "animation/start", { x: 600, y: 0 });
    setInteractivityLiteralValue(graph, play, "animation", [0]);
    connectInteractivityFlow(graph, start, "out", write);
    connectInteractivityFlow(graph, write, "out", play);
  });
  assert(
    getKhrInteractivityOnStartAnimationCues(behindIgnored).length === 0,
    "The walk continued past an unimplemented operation",
  );
  assert(
    collectInteractivityRuntimeDiagnostics(behindIgnored).some((diagnostic) =>
      diagnostic.message.startsWith("variable/set:"),
    ),
    "An unimplemented operation was skipped without being reported",
  );

  // `animation/stop` cancels a start it can still reach, and reports the case
  // it cannot express rather than pretending the clip was stopped.
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
  assert(
    getKhrInteractivityOnStartAnimationCues(stoppedLate).length === 1,
    "A stop after a delay silently cancelled an animation that had already started",
  );
  assert(
    collectInteractivityRuntimeDiagnostics(stoppedLate).some((diagnostic) =>
      diagnostic.message.startsWith("animation/stop:"),
    ),
    "A stop the adapter cannot express was not reported",
  );

  // The op table and the walk have to agree, or the badge on a node card says
  // one thing while Play does another.
  assert(
    getInteractivityRuntimeSupport("event/onStart").support === "executed" &&
      getInteractivityRuntimeSupport("animation/start").support === "executed" &&
      getInteractivityRuntimeSupport("variable/set").support === "ignored" &&
      getInteractivityRuntimeSupport("nonexistent/operation").support === "ignored",
    "The runtime adapter table no longer matches the operations the walk runs",
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
    "A pointer/set recipe claimed Play support the adapter does not have",
  );
}
