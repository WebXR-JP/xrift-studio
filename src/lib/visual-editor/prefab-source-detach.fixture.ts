import { serializeVisualProjectDocuments } from "./persistence";
import { createStarterWorldProject } from "./starter-templates";
import type { SceneDocument } from "./scene-document";
import { addPrefabAsset, createPrefabDocument } from "./prefab-document";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * Deleting the Entity a Prefab was captured from must not make a project
 * unsavable.
 *
 * The save validator used to reject the whole document set when a Prefab's
 * source Entity was gone, so one ordinary deletion turned every later autosave
 * into an error naming an id pair the author could not act on, with no way out
 * from the UI. `source` is provenance; the Prefab document carries its own
 * Entities and still instantiates without it.
 */
export function runPrefabSourceDetachFixtureAssertions(): void {
  const plan = createStarterWorldProject("blank", "prefab-detach-fixture");
  const prefab = createPrefabDocument(plan.scene, plan.assets, {
    prefabId: "prefab-detach-fixture",
    name: "Detached source fixture",
    sourceRootEntityIds: ["starter-floor"],
  })?.document;
  assert(prefab !== undefined, "The Prefab source fixture could not be created");
  const prefabs = { [prefab.prefabId]: prefab };
  const prefabAsset = addPrefabAsset(plan.assets, {
    id: "prefab-detach-fixture-asset",
    name: prefab.name,
    prefabPath: `prefabs/${prefab.prefabId}.prefab.json`,
  });
  assert(prefabAsset.added, "The Prefab fixture Asset could not be created");
  const documents = {
    project: plan.project,
    scenes: { [plan.scene.sceneId]: plan.scene },
    assets: prefabAsset.manifest,
    prefabs,
  };

  const sourceRootIds = Object.values(prefabs).flatMap(
    (prefab) => prefab.source.rootEntityIds,
  );
  assert(
    sourceRootIds.length > 0,
    "The Prefab fixture has no source Entity to detach",
  );
  const detachedId = sourceRootIds[0];
  assert(
    plan.scene.entities[detachedId] !== undefined,
    `The starter Prefab points at an Entity the Scene does not have: ${detachedId}`,
  );

  // Saving with the source Entity present has always worked.
  serializeVisualProjectDocuments(documents);

  // Now delete it, the way an author would.
  const withoutSource: SceneDocument = {
    ...plan.scene,
    rootEntityIds: plan.scene.rootEntityIds.filter((id) => id !== detachedId),
    entities: Object.fromEntries(
      Object.entries(plan.scene.entities).filter(([id]) => id !== detachedId),
    ),
  };

  let failure: string | null = null;
  try {
    serializeVisualProjectDocuments({
      ...documents,
      scenes: { [withoutSource.sceneId]: withoutSource },
    });
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }
  assert(
    failure === null,
    `Deleting a Prefab source Entity made the project unsavable: ${failure}`,
  );

  // The scene reference is still required: a Prefab pointing at a Scene the
  // document set does not contain means the set itself is incomplete.
  const [prefabId, currentPrefab] = Object.entries(prefabs)[0];
  let missingSceneFailure: string | null = null;
  try {
    serializeVisualProjectDocuments({
      ...documents,
      prefabs: {
        ...prefabs,
        [prefabId]: {
          ...currentPrefab,
          source: { ...currentPrefab.source, sceneId: "scene-that-is-gone" },
        },
      },
    });
  } catch (error) {
    missingSceneFailure =
      error instanceof Error ? error.message : String(error);
  }
  assert(
    missingSceneFailure !== null,
    "A Prefab pointing at an absent Scene was accepted",
  );
}
