import { BUILTIN_RECIPE_AUDIO, getBuiltinRecipeAudio } from "./builtin-recipe-audio";
import { getBuiltinRecipeModel } from "./builtin-recipe-models";
import { getBuiltinPrimitiveCreation } from "./creation-catalog";
import { getMaterialShowcaseAsset } from "./material-showcase-catalog";
import { BUILTIN_MATERIAL_ASSETS } from "./prototype-project";
import {
  collectXriftInteractionActions,
  collectXriftInteractionPrograms,
  getXriftInteractionProperty,
  validateKhrInteractivityExtension,
  XRIFT_INTERACTION_OPERATIONS,
  type KhrInteractivityGraph,
} from "./interactivity-graph";
import { getParticleAuthoringPreset } from "./particle-system";
import {
  createSceneRecipeBehaviourExtension,
  SCENE_RECIPES,
  SCENE_RECIPE_CATEGORY_LABELS,
  type SceneRecipe,
  type SceneRecipePlacedPart,
} from "./scene-recipe-catalog";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * Stands in for a placement, so the wiring can be checked without a project.
 *
 * `instantiateSceneRecipe` needs a project path, a fetch for every bundled GLB
 * and WAV, and the desktop shell's asset transaction. None of that is what
 * these assertions are about: a set's graph is right or wrong before any of it
 * touches disk, and this is the same map the real placement hands the builder.
 */
function placeParts(recipe: SceneRecipe): Map<string, SceneRecipePlacedPart> {
  const placed = new Map<string, SceneRecipePlacedPart>();
  recipe.parts.forEach((part, index) => {
    const entityId = `entity-${index}`;
    const componentIds: SceneRecipePlacedPart["componentIds"] = {};
    if (part.kind === "light") componentIds.light = `${entityId}-light`;
    if (part.kind === "text") componentIds.text = `${entityId}-text`;
    if (part.kind === "particle") componentIds.particle = `${entityId}-particle`;
    if (
      part.kind === "audio" ||
      ((part.kind === "primitive" || part.kind === "model") && part.audio)
    ) {
      componentIds["audio-source"] = `${entityId}-audio`;
    }
    placed.set(part.name, { entityId, componentIds });
  });
  return placed;
}

/** Deterministic assertions for the 3D set catalog and its wired behaviours. */
export function runSceneRecipeCatalogFixtureAssertions(): void {
  const ids = new Set<string>();
  for (const recipe of SCENE_RECIPES) {
    assert(!ids.has(recipe.id), `Duplicate scene recipe id: ${recipe.id}`);
    ids.add(recipe.id);
    assert(
      Boolean(SCENE_RECIPE_CATEGORY_LABELS[recipe.category]),
      `${recipe.id} uses an unlabelled category`,
    );
    assert(recipe.parts.length > 0, `${recipe.id} has no parts`);

    // Two parts with one name would make a behaviour's target ambiguous, and
    // the placement resolves targets by name.
    const names = new Set<string>();
    for (const part of recipe.parts) {
      assert(
        !names.has(part.name),
        `${recipe.id} has two parts named ${part.name}`,
      );
      names.add(part.name);
      // The root Entity takes the set's own name. On a one-part scenery set
      // that repetition is harmless, but a set with graphs is one an author
      // navigates by name -- two identical rows one level apart is then a
      // Hierarchy where the part a behaviour writes to cannot be told from the
      // set that contains it.
      assert(
        !recipe.behaviours?.length || part.name !== recipe.name,
        `${recipe.id} has a part named after the set itself (${part.name})`,
      );
      if (part.kind === "primitive") {
        assert(
          Boolean(getBuiltinPrimitiveCreation(part.creationId)),
          `${recipe.id} references an unknown primitive ${part.creationId}`,
        );
        // `instantiateSceneRecipe` returns null when a part's Material cannot
        // be resolved, so a mistyped id is not a wrong colour -- it is a set
        // that silently refuses to place.
        assert(
          BUILTIN_MATERIAL_ASSETS.some(
            (material) => material.id === part.materialAssetId,
          ) || Boolean(getMaterialShowcaseAsset(part.materialAssetId)),
          `${recipe.id} references an unknown Material ${part.materialAssetId}`,
        );
      }
      if (part.kind === "model") {
        assert(
          Boolean(getBuiltinRecipeModel(part.modelId)),
          `${recipe.id} references an unknown model ${part.modelId}`,
        );
      }
      if (part.kind === "particle") {
        assert(
          Boolean(getParticleAuthoringPreset(part.presetId)),
          `${recipe.id} references an unknown particle preset ${part.presetId}`,
        );
      }
      if (part.kind === "text") {
        assert(
          part.text.trim().length > 0 && part.fontSize > 0,
          `${recipe.id} has an empty sign`,
        );
      }
      const audio =
        part.kind === "audio"
          ? part.audio
          : part.kind === "primitive" || part.kind === "model"
            ? part.audio
            : undefined;
      if (audio) {
        const definition = getBuiltinRecipeAudio(audio.audioId);
        assert(
          Boolean(definition),
          `${recipe.id} references an unknown sound ${audio.audioId}`,
        );
        // A one-shot looped is a click every time it wraps, and the sets that
        // loop exist to show that looping sounds right.
        assert(
          !audio.loop || Boolean(definition?.loopable),
          `${recipe.id} loops ${audio.audioId}, which is not seamless`,
        );
        assert(
          audio.volume > 0 && audio.volume <= 1,
          `${recipe.id} sets an out-of-range volume for ${audio.audioId}`,
        );
      }
    }

    // A part that lands hidden is only findable through the graph that shows
    // it. One with nothing writing its `enabled` is an Entity the author will
    // never see in Play and will not know to look for in the Hierarchy.
    for (const part of recipe.parts) {
      if (
        (part.kind !== "primitive" && part.kind !== "model") ||
        !part.startsDisabled
      ) {
        continue;
      }
      const revealed = (recipe.behaviours ?? []).some((behaviour) =>
        behaviour.actions.some(
          (action) =>
            action.target.scope === "part" &&
            action.target.part === part.name &&
            action.targetKind === "entity" &&
            action.property === "enabled",
        ),
      );
      assert(
        revealed,
        `${recipe.id} hides ${part.name} with nothing to show it again`,
      );
    }

    // Anything that teaches has to say what it teaches; anything with a graph
    // has to say what the graph does, because both are read before placing.
    if (recipe.category === "tutorial") {
      assert(
        Boolean(recipe.lesson?.steps.length),
        `${recipe.id} is a tutorial set with no steps`,
      );
    }
    for (const behaviour of recipe.behaviours ?? []) {
      assert(
        behaviour.summary.trim().length > 0,
        `${recipe.id} has a behaviour with no summary`,
      );
      const host = recipe.parts.find((part) => part.name === behaviour.host);
      assert(
        Boolean(host),
        `${recipe.id} wires a graph to a missing part ${behaviour.host}`,
      );
      // Without the official Interactable there is nothing to press, and the
      // compiler blocks the trigger rather than shipping a dead graph.
      assert(
        behaviour.start !== "interact" ||
          ((host?.kind === "primitive" || host?.kind === "model") &&
            Boolean(host.interactable)),
        `${recipe.id} presses ${behaviour.host}, which has no Interactable`,
      );
      assert(
        behaviour.actions[0]?.after !== "done",
        `${recipe.id}/${behaviour.graphName} starts on a "done" socket, which its entry point does not have`,
      );
      for (const action of behaviour.actions) {
        const descriptor = getXriftInteractionProperty(
          action.targetKind,
          action.property,
        );
        assert(
          Boolean(descriptor),
          `${recipe.id} writes an unknown property ${action.targetKind}.${action.property}`,
        );
        assert(
          action.mode !== "toggle" || descriptor?.kind === "bool",
          `${recipe.id} toggles ${action.property}, which is not a bool`,
        );
        if (action.target.scope === "part") {
          assert(
            names.has(action.target.part),
            `${recipe.id} writes to a missing part ${action.target.part}`,
          );
        }
      }

      // A press that moves something has to put it back. The sets sink a
      // button and slide a door, and a resting value that drifted from the
      // part's authored position leaves it visibly offset after the first
      // press -- which no test of the graph's shape would notice.
      const movedParts = new Map<string, readonly number[]>();
      for (const action of behaviour.actions) {
        if (
          action.target.scope !== "part" ||
          action.targetKind !== "transform" ||
          action.property !== "position" ||
          !Array.isArray(action.value)
        ) {
          continue;
        }
        movedParts.set(action.target.part, action.value);
      }
      for (const [partName, last] of movedParts) {
        const part = recipe.parts.find((candidate) => candidate.name === partName);
        const authored = part && "position" in part ? part.position : undefined;
        assert(
          Boolean(authored) &&
            authored!.every((value, index) => Math.abs(value - last[index]) < 1e-6),
          `${recipe.id}/${behaviour.graphName} leaves ${partName} at ${last.join(", ")} instead of its authored position`,
        );
      }

      const extension = createSceneRecipeBehaviourExtension(
        behaviour,
        placeParts(recipe),
      );
      assert(
        Boolean(extension),
        `${recipe.id} could not wire ${behaviour.graphName}`,
      );
      if (!extension) continue;

      // A graph the editor refuses to save is worse than no graph: the author
      // opens it, the save goes dead, and nothing says which node did it.
      const errors = validateKhrInteractivityExtension(extension).filter(
        (diagnostic) => diagnostic.severity === "error",
      );
      assert(
        errors.length === 0,
        `${recipe.id}/${behaviour.graphName} produced ${errors.length} errors: ${errors
          .map((diagnostic) => `${diagnostic.path} ${diagnostic.message}`)
          .join(" / ")}`,
      );

      // Every action has to be reachable and configured. An action the walk
      // cannot see is one the runtime will not run, and one with no target is
      // a node the Inspector shows as unfinished.
      const actions = collectXriftInteractionActions(extension);
      assert(
        actions.length === behaviour.actions.length,
        `${recipe.id}/${behaviour.graphName} wrote ${actions.length} actions for ${behaviour.actions.length} authored`,
      );
      for (const action of actions) {
        assert(
          action.entityId.trim().length > 0,
          `${recipe.id}/${behaviour.graphName} left an action with no target`,
        );
      }
      const graph = extension.graphs[0] as KhrInteractivityGraph;
      const entryOps = (graph.nodes ?? []).filter((node) => {
        const declaration = graph.declarations?.[node.declaration];
        return declaration?.op === XRIFT_INTERACTION_OPERATIONS.onInteract;
      });
      assert(
        entryOps.length === (behaviour.start === "interact" ? 1 : 0),
        `${recipe.id}/${behaviour.graphName} has the wrong entry point`,
      );
      if (behaviour.start === "interact") {
        // The press has to reach every action through the flow it wired,
        // including the ones behind a wait and behind a "done" socket.
        const programs = collectXriftInteractionPrograms(extension);
        assert(
          programs.length === 1 &&
            programs[0].actions.length === behaviour.actions.length,
          `${recipe.id}/${behaviour.graphName} does not run all of its actions from one press`,
        );
      }
    }
  }

  // The bundled sounds are addressed by content hash. Two entries claiming the
  // same id would have one silently import as the other.
  const audioIds = new Set(BUILTIN_RECIPE_AUDIO.map((entry) => entry.assetId));
  assert(
    audioIds.size === BUILTIN_RECIPE_AUDIO.length,
    "Two bundled sounds share an Asset id",
  );
  for (const entry of BUILTIN_RECIPE_AUDIO) {
    assert(
      entry.assetId === `audio-${entry.fileName.replace(/\.wav$/, "")}-${entry.sha256.slice(0, 12)}`,
      `${entry.audioId} has an id that does not match its file and hash`,
    );
    assert(
      entry.byteLength > 44 && entry.durationSeconds > 0,
      `${entry.audioId} has no audio in it`,
    );
  }
}
