import { linearRgbToTint, tintToLinearRgb } from "./glow-material-catalog";
import {
  cloneKhrInteractivityExtension,
  createDefaultKhrInteractivityExtension,
  getInteractivityOperationTemplate,
  KHR_INTERACTIVITY_MATERIAL_POINTER_PRESETS,
  validateKhrInteractivityExtension,
  readInteractivityNodePosition,
  type KhrInteractivityExtension,
  type KhrInteractivityGraph,
} from "./interactivity-graph";
import {
  appendInteractivityOperation,
  connectInteractivityFlow,
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
