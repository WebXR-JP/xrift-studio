import {
  cloneKhrInteractivityExtension,
  collectInteractivityRuntimeDiagnostics,
  configureInteractivityMaterialPointer,
  createDefaultKhrInteractivityExtension,
  getInteractivityOperationTemplate,
  writeInteractivityNodePosition,
  type KhrInteractivityGraph,
  type KhrInteractivityJsonValue,
  type KhrInteractivityNode,
} from "./interactivity-graph";
import { tintToLinearRgb } from "./glow-material-catalog";

/**
 * Graph authoring primitives, shared by the node editor and the recipes below.
 *
 * These live beside the KHR contract rather than inside the editor component so
 * a recipe can be run and validated without mounting React, which is what lets
 * the fixture suite prove every recipe produces a graph the editor will save.
 */
export function ensureInteractivityTypes(
  graph: KhrInteractivityGraph,
): Record<string, number> {
  graph.types ??= [];
  const ensure = (signature: string) => {
    const current = graph.types!.findIndex((type) => type.signature === signature);
    if (current >= 0) return current;
    graph.types!.push({ signature });
    return graph.types!.length - 1;
  };
  return { float: ensure("float"), int: ensure("int"), bool: ensure("bool") };
}

export function ensureInteractivityDeclaration(
  graph: KhrInteractivityGraph,
  op: string,
): number {
  graph.declarations ??= [];
  const existing = graph.declarations.findIndex((candidate) => candidate.op === op);
  if (existing >= 0) return existing;
  graph.declarations.push({ op });
  return graph.declarations.length - 1;
}

/** Appends one operation node and returns the index it landed on. */
export function appendInteractivityOperation(
  graph: KhrInteractivityGraph,
  op: string,
  position: { x: number; y: number },
): number {
  graph.nodes ??= [];
  const declaration = ensureInteractivityDeclaration(graph, op);
  const types = ensureInteractivityTypes(graph);
  const template = getInteractivityOperationTemplate(op);
  const node: KhrInteractivityNode = {
    declaration,
    ...(template?.createNode?.(types) ?? {}),
  };
  graph.nodes.push(writeInteractivityNodePosition(node, position));
  return graph.nodes.length - 1;
}

export function connectInteractivityFlow(
  graph: KhrInteractivityGraph,
  sourceIndex: number,
  socket: string,
  targetIndex: number,
): void {
  const source = graph.nodes?.[sourceIndex];
  if (!source) return;
  source.flows = { ...(source.flows ?? {}), [socket]: { node: targetIndex } };
}

/**
 * Writes a literal onto an existing socket.
 *
 * A socket that does not already exist is left alone: the operation template
 * decides which sockets a node has, and inventing one here would produce a node
 * the runtime cannot resolve.
 */
export function setInteractivityLiteralValue(
  graph: KhrInteractivityGraph,
  nodeIndex: number,
  socket: string,
  value: KhrInteractivityJsonValue[],
): void {
  const node = graph.nodes?.[nodeIndex];
  const current = node?.values?.[socket];
  if (!node || !current) return;
  node.values = { ...node.values, [socket]: { ...current, value } };
}

/**
 * Small working graphs for the things authors actually ask for.
 *
 * A palette of primitives answers "what can this do" but not "how do I change a
 * colour", which is the question people arrive with. Each recipe lands as a
 * connected chain with real values already filled in, so the next step is
 * editing a number rather than guessing which sockets belong together.
 */
export type InteractivityRecipe = {
  id: string;
  label: string;
  description: string;
  /** True when the recipe writes a material property and needs one to exist. */
  needsMaterial?: boolean;
  /** Offset, from the recipe's first node, of the node the author edits next. */
  focusOffset: number;
  build: (
    graph: KhrInteractivityGraph,
    origin: { x: number; y: number },
    materialIndex: number,
  ) => void;
};

/** Visible against both a light and a dark material, so a recipe shows its effect. */
export const INTERACTIVITY_RECIPE_COLOR = "#38bdf8";

function recipeColorValue(alpha: number | null): KhrInteractivityJsonValue[] {
  const [red, green, blue] = tintToLinearRgb(INTERACTIVITY_RECIPE_COLOR);
  return alpha === null ? [red, green, blue] : [red, green, blue, alpha];
}

export const INTERACTIVITY_RECIPES: readonly InteractivityRecipe[] = [
  {
    id: "start-set-color",
    label: "開始時に色を変える",
    description: "開始と同時にMaterialのBase Colorを書き換えます",
    needsMaterial: true,
    focusOffset: 1,
    build: (graph, origin, materialIndex) => {
      const start = appendInteractivityOperation(graph, "event/onStart", origin);
      const set = appendInteractivityOperation(graph, "pointer/set", {
        x: origin.x + 320,
        y: origin.y,
      });
      configureInteractivityMaterialPointer(graph, set, "base-color", materialIndex);
      setInteractivityLiteralValue(graph, set, "value", recipeColorValue(1));
      connectInteractivityFlow(graph, start, "out", set);
    },
  },
  {
    id: "start-fade-color",
    label: "開始時に色をゆっくり変える",
    description: "開始からBase Colorを1秒かけて補間します",
    needsMaterial: true,
    focusOffset: 1,
    build: (graph, origin, materialIndex) => {
      const start = appendInteractivityOperation(graph, "event/onStart", origin);
      const interpolate = appendInteractivityOperation(graph, "pointer/interpolate", {
        x: origin.x + 320,
        y: origin.y,
      });
      configureInteractivityMaterialPointer(graph, interpolate, "base-color", materialIndex);
      setInteractivityLiteralValue(graph, interpolate, "value", recipeColorValue(1));
      connectInteractivityFlow(graph, start, "out", interpolate);
    },
  },
  {
    id: "start-emissive",
    label: "開始時に発光させる",
    description: "開始と同時にEmissiveを立ち上げます。Bloomと合わせて光らせるとき用",
    needsMaterial: true,
    focusOffset: 1,
    build: (graph, origin, materialIndex) => {
      const start = appendInteractivityOperation(graph, "event/onStart", origin);
      const set = appendInteractivityOperation(graph, "pointer/set", {
        x: origin.x + 320,
        y: origin.y,
      });
      configureInteractivityMaterialPointer(graph, set, "emissive", materialIndex);
      setInteractivityLiteralValue(graph, set, "value", recipeColorValue(null));
      connectInteractivityFlow(graph, start, "out", set);
    },
  },
  {
    id: "start-animation",
    label: "開始時にアニメーションを再生",
    description: "開始と同時にanimation 0を再生します。ドアの開閉などに",
    focusOffset: 1,
    build: (graph, origin) => {
      const start = appendInteractivityOperation(graph, "event/onStart", origin);
      const play = appendInteractivityOperation(graph, "animation/start", {
        x: origin.x + 320,
        y: origin.y,
      });
      connectInteractivityFlow(graph, start, "out", play);
    },
  },
  {
    id: "delayed-animation",
    label: "少し待ってから再生",
    description: "開始から1秒待ってanimation 0を再生します",
    focusOffset: 1,
    build: (graph, origin) => {
      const start = appendInteractivityOperation(graph, "event/onStart", origin);
      const delay = appendInteractivityOperation(graph, "flow/setDelay", {
        x: origin.x + 300,
        y: origin.y,
      });
      const play = appendInteractivityOperation(graph, "animation/start", {
        x: origin.x + 620,
        y: origin.y,
      });
      connectInteractivityFlow(graph, start, "out", delay);
      connectInteractivityFlow(graph, delay, "done", play);
    },
  },
];

/**
 * Whether Play runs everything a recipe places.
 *
 * Derived by building the recipe into a scratch graph and asking the runtime
 * adapter, rather than recorded per recipe, so a recipe can never advertise
 * support the adapter does not have. Three of the shipped recipes write glTF
 * properties through `pointer/set`, which the adapter does not implement, and
 * the picker has to say so before an author spends a step on them.
 */
export function getInteractivityRecipeRuntimeSupport(
  recipe: InteractivityRecipe,
): "executed" | "ignored" {
  const extension = cloneKhrInteractivityExtension(
    createDefaultKhrInteractivityExtension(),
  );
  const graph = extension.graphs[0] as KhrInteractivityGraph;
  graph.nodes = [];
  graph.declarations = [];
  graph.types = [];
  recipe.build(graph, { x: 0, y: 0 }, 0);
  return collectInteractivityRuntimeDiagnostics(extension).length === 0
    ? "executed"
    : "ignored";
}
