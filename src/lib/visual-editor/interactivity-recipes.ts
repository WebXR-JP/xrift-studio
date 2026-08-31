import {
  cloneKhrInteractivityExtension,
  collectInteractivityRuntimeDiagnostics,
  configureInteractivityMaterialPointer,
  createDefaultKhrInteractivityExtension,
  estimateInteractivityNodeHeight,
  getInteractivityOperationTemplate,
  configureInteractivityTriggerAction,
  writeInteractivityNodePosition,
  XRIFT_INTERACTION_OPERATIONS,
  XRIFT_INTERACTION_PLAYER_ENTITY_ID,
  XRIFT_INTERACTION_SELF_ENTITY_ID,
  type KhrInteractivityExtension,
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
  // An operation KHR_interactivity does not define is only legal when its
  // declaration names the extension that does; the template carries that name
  // so a node placed from the palette validates like one written by hand.
  const extension = getInteractivityOperationTemplate(op)?.extension;
  graph.declarations.push(extension ? { op, extension } : { op });
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
 * A graph that starts from the interaction, not from `event/onStart`.
 *
 * The default Interactivity Asset is an animation-on-start example, which is
 * the wrong first node for a trigger: an author who adds an Interaction Trigger
 * has already said what starts it. Seeding the entry point means the first
 * thing they do in the editor is choose what the button changes.
 */
export function createInteractionTriggerGraphExtension(): KhrInteractivityExtension {
  const extension = cloneKhrInteractivityExtension(
    createDefaultKhrInteractivityExtension(),
  );
  const graph = extension.graphs[0] as KhrInteractivityGraph;
  graph.name = "Interaction trigger";
  graph.types = [];
  graph.declarations = [];
  graph.nodes = [];
  appendInteractivityOperation(
    graph,
    XRIFT_INTERACTION_OPERATIONS.onInteract,
    { x: 80, y: 160 },
  );
  return extension;
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

/**
 * The interaction recipes.
 *
 * Every one of these targets something Entity-scoped - the Entity itself, its
 * Transform, the player - because a recipe is built without a Scene in front of
 * it and cannot know which of an Entity's two Audio Sources the author meant.
 * `__xrift_self__` covers the Entity, so the same recipe works on every door
 * without being re-pointed.
 */
export const INTERACTIVITY_RECIPES: readonly InteractivityRecipe[] = [
  {
    id: "interact-teleport",
    label: "押したらテレポートする",
    description:
      "押した人を、指定した座標へ移動させます。押した人だけが動きます",
    focusOffset: 1,
    build: (graph, origin) => {
      const interact = appendInteractivityOperation(
        graph,
        XRIFT_INTERACTION_OPERATIONS.onInteract,
        origin,
      );
      const move = appendInteractivityOperation(
        graph,
        XRIFT_INTERACTION_OPERATIONS.setProperty,
        { x: origin.x + 320, y: origin.y },
      );
      configureInteractivityTriggerAction(graph, move, {
        entityId: XRIFT_INTERACTION_PLAYER_ENTITY_ID,
        componentId: "",
        targetKind: "player",
        property: "teleport",
      });
      connectInteractivityFlow(graph, interact, "out", move);
    },
  },
  {
    id: "interact-toggle-visibility",
    label: "押したら表示を切り替える",
    description:
      "押すたびに、このEntityの表示と非表示を入れ替えます。スイッチや隠し扉に",
    focusOffset: 1,
    build: (graph, origin) => {
      const interact = appendInteractivityOperation(
        graph,
        XRIFT_INTERACTION_OPERATIONS.onInteract,
        origin,
      );
      const toggle = appendInteractivityOperation(
        graph,
        XRIFT_INTERACTION_OPERATIONS.toggleProperty,
        { x: origin.x + 320, y: origin.y },
      );
      configureInteractivityTriggerAction(graph, toggle, {
        entityId: XRIFT_INTERACTION_SELF_ENTITY_ID,
        componentId: "",
        targetKind: "entity",
        property: "enabled",
      });
      connectInteractivityFlow(graph, interact, "out", toggle);
    },
  },
  {
    id: "interact-move-self",
    label: "押したら動かす",
    description:
      "押したEntity自身を、指定した位置へ動かします。扉やリフトに",
    focusOffset: 1,
    build: (graph, origin) => {
      const interact = appendInteractivityOperation(
        graph,
        XRIFT_INTERACTION_OPERATIONS.onInteract,
        origin,
      );
      const move = appendInteractivityOperation(
        graph,
        XRIFT_INTERACTION_OPERATIONS.setProperty,
        { x: origin.x + 320, y: origin.y },
      );
      configureInteractivityTriggerAction(graph, move, {
        entityId: XRIFT_INTERACTION_SELF_ENTITY_ID,
        componentId: "",
        targetKind: "transform",
        property: "position",
      });
      connectInteractivityFlow(graph, interact, "out", move);
    },
  },
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

/**
 * The recipes the add panel offers.
 *
 * Only the ones Play and the published world actually run. The catalogue was
 * taken out of the panel once before for exactly this reason: most of it was
 * `pointer/*` shapes the runtime ignores, so it read as a head start and then
 * did nothing when the world ran. Deriving the list from the runtime rather
 * than curating it by hand means an operation that becomes runnable brings its
 * recipe back on its own, and one that stops being runnable takes its recipe
 * out before an author can pick it.
 */
export const RUNNABLE_INTERACTIVITY_RECIPES: readonly InteractivityRecipe[] =
  INTERACTIVITY_RECIPES.filter(
    (recipe) => getInteractivityRecipeRuntimeSupport(recipe) === "executed",
  );

/** How many clips one `flow/sequence` fans out to before a new column starts. */
const MODEL_ANIMATION_GROUP_SIZE = 8;

/** Column pitch, from the card width plus room for the wires between columns. */
const MODEL_ANIMATION_COLUMN_GAP = 260;

/** Vertical air between two stacked cards. */
const MODEL_ANIMATION_ROW_GAP = 24;

/**
 * One clip a generated graph should play.
 *
 * Carried as data rather than derived from a clip name because the two callers
 * want different things from the same builder: the Model Inspector's button
 * loops everything, while converting an Animation Component has to keep the
 * loop, speed and single pass that Component was set to.
 */
export type ModelAnimationClipPlan = {
  /** Clip index in the Model, which is what `animation/start` addresses. */
  index: number;
  /** Clip name, shown on the card. Nothing reads it at runtime. */
  name: string;
  /** An unbounded play loops; see `durationSeconds` for the other case. */
  loop: boolean;
  speed: number;
  /**
   * Where a single pass ends, in clip-local seconds.
   *
   * Only read when `loop` is false. Left out, the play is unbounded and loops,
   * so a converted Component that was not looping would start looping.
   */
  durationSeconds?: number;
};

/**
 * A graph that plays every clip a Model carries, all at once and looping.
 *
 * The Animation Component played one clip, which is what a single「再生中」can
 * mean. A Model can carry sixty-four — gulls, insects, a boat's wake — meant to
 * run together, and picking one of them is not a choice anybody wants to make.
 * Generating the graph puts all of them on the canvas as ordinary nodes, so the
 * ones an author does not want are deleted rather than configured away.
 */
export function createModelAnimationGraphExtension(
  clipNames: readonly string[],
): KhrInteractivityExtension {
  return createModelAnimationClipGraphExtension(
    clipNames.map((name, index) => ({ index, name, loop: true, speed: 1 })),
  );
}

/**
 * The same graph, for callers that know what each clip should do.
 *
 * `event/onStart` has one flow output and a flow output reaches one node, so a
 * `flow/sequence` does the fan-out. They are grouped rather than hung off a
 * single sequence because a card with sixty-four sockets is taller than the
 * canvas and every edge in the graph would leave the same point.
 */
export function createModelAnimationClipGraphExtension(
  plans: readonly ModelAnimationClipPlan[],
): KhrInteractivityExtension {
  const extension = cloneKhrInteractivityExtension(
    createDefaultKhrInteractivityExtension(),
  );
  const graph = extension.graphs[0] as KhrInteractivityGraph;
  graph.name = "アニメーション";
  graph.nodes = [];
  graph.declarations = [];
  graph.types = [];
  const start = appendInteractivityOperation(graph, "event/onStart", { x: 0, y: 0 });
  if (plans.length === 0) return extension;

  const groups: ModelAnimationClipPlan[][] = [];
  for (let index = 0; index < plans.length; index += MODEL_ANIMATION_GROUP_SIZE) {
    groups.push([...plans.slice(index, index + MODEL_ANIMATION_GROUP_SIZE)]);
  }

  // With one group the root sequence would forward a single output, so the
  // clips hang straight off `event/onStart` instead.
  const root =
    groups.length > 1
      ? appendInteractivityOperation(graph, "flow/sequence", {
          x: MODEL_ANIMATION_COLUMN_GAP,
          y: 0,
        })
      : null;
  if (root !== null) {
    connectInteractivityFlow(graph, start, "out", root);
    annotateInteractivityNode(graph, root, "全部まとめて同時に開始します");
  }

  // Each group gets its own column, rather than every clip going into one that
  // ends up thirteen thousand pixels tall: sixty-four clips then read as eight
  // columns of eight, which fits on a screen at a zoom where the names are
  // still legible.
  const firstGroupColumn = MODEL_ANIMATION_COLUMN_GAP * (root === null ? 1 : 2);

  groups.forEach((members, groupIndex) => {
    const column = firstGroupColumn + groupIndex * MODEL_ANIMATION_COLUMN_GAP;
    const groupTop = 0;
    const fan =
      members.length > 1
        ? appendInteractivityOperation(graph, "flow/sequence", {
            x: column,
            y: groupTop,
          })
        : null;
    if (fan !== null) {
      if (root === null) connectInteractivityFlow(graph, start, "out", fan);
      else connectInteractivityFlow(graph, root, String(groupIndex), fan);
      // The card reads「順番に実行」, which is what the operation is: it runs its
      // outputs in socket order. What it is not is a queue — every clip here
      // starts in the same instant, because starting an animation returns
      // immediately. Said on the card, because "in order" is exactly what an
      // author fears when a graph plays sixty-four clips.
      annotateInteractivityNode(graph, fan, "全部まとめて同時に開始します");
    }

    // Wired before anything is placed: a card is as tall as the sockets it
    // actually uses, and the sequence only knows how many outputs it has once
    // its clips are connected. Measuring it first put the first clip inside it.
    const plays = members.map((plan, indexInGroup) => {
      const play = appendInteractivityOperation(graph, "animation/start", {
        x: column,
        y: groupTop,
      });
      const node = graph.nodes![play]!;
      const types = ensureInteractivityTypes(graph);
      // `endTime` is only written for a clip that should stop. An unbounded
      // play runs until something stops it, which the mixer surfaces as a
      // loop, and that is what an idle, a flag or a flock wants.
      const bounded =
        !plan.loop &&
        typeof plan.durationSeconds === "number" &&
        Number.isFinite(plan.durationSeconds) &&
        plan.durationSeconds > 0;
      node.values = {
        ...(node.values ?? {}),
        animation: { type: types.int, value: [plan.index] },
        startTime: { type: types.float, value: [0] },
        ...(bounded
          ? { endTime: { type: types.float, value: [plan.durationSeconds!] } }
          : {}),
        speed: { type: types.float, value: [plan.speed] },
      };
      node.extras = {
        ...(node.extras ?? {}),
        xriftStudio: {
          ...(isPlainRecord(node.extras?.xriftStudio) ? node.extras.xriftStudio : {}),
          // The runtime reads the index; a column of identical cards is
          // unreadable, so the card reads the name from here.
          clipName: plan.name,
        },
      };
      if (fan === null) {
        if (root === null) connectInteractivityFlow(graph, start, "out", play);
        else connectInteractivityFlow(graph, root, String(groupIndex), play);
      } else {
        connectInteractivityFlow(graph, fan, String(indexInGroup), play);
      }
      return play;
    });

    let cursorY = groupTop;
    if (fan !== null) {
      cursorY +=
        estimateInteractivityNodeHeight(graph, fan) + MODEL_ANIMATION_ROW_GAP;
    }
    for (const play of plays) {
      graph.nodes![play] = writeInteractivityNodePosition(graph.nodes![play]!, {
        x: column,
        y: cursorY,
      });
      cursorY +=
        estimateInteractivityNodeHeight(graph, play) + MODEL_ANIMATION_ROW_GAP;
    }
  });
  return extension;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Writes the one-line note a card shows under its title. */
function annotateInteractivityNode(
  graph: KhrInteractivityGraph,
  nodeIndex: number,
  note: string,
): void {
  const node = graph.nodes?.[nodeIndex];
  if (!node) return;
  node.extras = {
    ...(node.extras ?? {}),
    xriftStudio: {
      ...(isPlainRecord(node.extras?.xriftStudio) ? node.extras.xriftStudio : {}),
      note,
    },
  };
}
