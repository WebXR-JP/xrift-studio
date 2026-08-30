/**
 * Converting the Animation Component into a graph, once, on open.
 *
 * The Component played one clip. A Model whose motion is spread over dozens of
 * clips — gulls, insects, a boat's wake, a flag — cannot say "play them all"
 * through it, and picking one of them is not a choice anybody wants to make.
 * v1 drops the Component and puts animation playback in the graph, where a clip
 * is an ordinary node next to the waits, the conditions and the property
 * writes it is meant to run beside.
 *
 * Documents saved before that keep their Animation Components, so opening one
 * converts them: each autoplaying Component becomes an Interactivity Asset that
 * plays its clip, plus the Interaction Trigger that runs it. The conversion
 * happens once and is written back on the next save; nothing here stays behind
 * to read a Component at runtime.
 */

import {
  createInteractionTriggerComponent,
  animationPlaybackSpeed,
  resolveAnimationClipIndex,
  type AnimationComponent,
  type SceneDocument,
  type SceneEntity,
} from "./scene-document";
import {
  addDefaultInteractivityAsset,
  cloneKhrInteractivityExtension,
  type KhrInteractivityExtension,
} from "./interactivity-graph";
import type { AssetManifest } from "./asset-manifest";
import { createModelAnimationClipGraphExtension } from "./interactivity-recipes";

/** One Component the conversion could not turn into a running graph. */
export type AnimationComponentMigrationSkip = {
  entityId: string;
  entityName: string;
  /**
   * Why nothing was created.
   *
   * `not-autoplaying` — the Component was not set to play on its own, so it
   * only held a clip for something else to command. Creating a graph would
   * start an animation the world did not have.
   * `no-clip` — the Entity's Model has no clip by that name, so the Component
   * was already playing nothing.
   */
  reason: "not-autoplaying" | "no-clip";
};

export type AnimationComponentMigrationResult = {
  scene: SceneDocument;
  assets: AssetManifest;
  /** Entities that gained a graph, in document order. */
  converted: { entityId: string; entityName: string; assetId: string }[];
  skipped: AnimationComponentMigrationSkip[];
};

function isAnimationComponent(
  component: SceneEntity["components"][number],
): component is AnimationComponent {
  return (component as { type: string }).type === "animation";
}

/**
 * The clips of the Model this Entity draws.
 *
 * Read from the Mesh Component rather than from the Entity's name or its
 * children: an Entity can carry several Meshes, and the Component that played
 * an animation never said which one it meant, so the first Model that has clips
 * is the one it can only have been about.
 */
function entityModelClips(
  entity: SceneEntity,
  assets: AssetManifest,
): { name: string; duration: number }[] {
  for (const component of entity.components) {
    if ((component as { type: string }).type !== "mesh") continue;
    const mesh = component as {
      geometry?: { kind: string; assetId: string };
      geometryAssetId?: string;
    };
    const assetId =
      mesh.geometry?.kind === "asset" ? mesh.geometry.assetId : mesh.geometryAssetId;
    const asset = assetId ? assets.assets[assetId] : undefined;
    if (asset?.kind !== "model") continue;
    const clips = asset.importMetadata?.animations ?? [];
    if (clips.length > 0) {
      return clips.map((entry) => ({ name: entry.name, duration: entry.duration }));
    }
  }
  return [];
}

/** Whether anything here still carries the removed Component. */
export function hasAnimationComponents(
  entities: Readonly<Record<string, SceneEntity>>,
): boolean {
  return Object.values(entities).some((entity) =>
    entity.components.some(isAnimationComponent),
  );
}

/** Whether anything in the Scene still carries the removed Component. */
export function sceneHasAnimationComponents(scene: SceneDocument): boolean {
  return hasAnimationComponents(scene.entities);
}

/**
 * Replaces every Animation Component with the graph that does the same thing.
 *
 * Works on a bag of Entities rather than on a Scene because a Prefab holds the
 * same Entities and can hold the same Component; converting one and not the
 * other would leave a Prefab that animates until it is placed.
 *
 * Pure, so opening a project and the fixture suite exercise the same code. Ids
 * are supplied rather than generated here for the same reason: a conversion
 * that produced different ids on every run could not be asserted, and would
 * make an unchanged project look dirty every time it was opened.
 */
export function migrateAnimationComponentsInEntities(
  entities: Readonly<Record<string, SceneEntity>>,
  assets: AssetManifest,
  createId: (kind: string) => string,
): {
  entities: Record<string, SceneEntity>;
  assets: AssetManifest;
  converted: AnimationComponentMigrationResult["converted"];
  skipped: AnimationComponentMigrationSkip[];
} {
  if (!hasAnimationComponents(entities)) {
    return { entities: entities as Record<string, SceneEntity>, assets, converted: [], skipped: [] };
  }
  let nextAssets = assets;
  const converted: AnimationComponentMigrationResult["converted"] = [];
  const skipped: AnimationComponentMigrationSkip[] = [];
  const next: Record<string, SceneEntity> = {};

  for (const [entityId, entity] of Object.entries(entities)) {
    const animations = entity.components.filter(isAnimationComponent);
    if (animations.length === 0) {
      next[entityId] = entity;
      continue;
    }
    const clips = entityModelClips(entity, nextAssets);
    const added: SceneEntity["components"] = [];
    for (const animation of animations) {
      const clipIndex = resolveAnimationClipIndex(
        animation,
        clips.map((clip) => clip.name),
      );
      const clip = clipIndex >= 0 ? clips[clipIndex] : undefined;
      if (!clip) {
        skipped.push({ entityId, entityName: entity.name, reason: "no-clip" });
        continue;
      }
      // A Component that did not autoplay was a handle for something else to
      // command, not a playback. Turning it into `event/onStart` would start an
      // animation the world never started.
      if (!animation.autoplay || !animation.enabled) {
        skipped.push({
          entityId,
          entityName: entity.name,
          reason: "not-autoplaying",
        });
        continue;
      }
      const assetId = createId("interactivity");
      const result = addDefaultInteractivityAsset(nextAssets, {
        id: assetId,
        name: `${entity.name} のアニメーション`,
        folderId: null,
        extension: createModelAnimationClipGraphExtension([
          {
            index: clipIndex,
            name: clip.name,
            loop: animation.loop,
            speed: animationPlaybackSpeed(animation),
            durationSeconds: clip.duration,
          },
        ]),
      });
      if (!result.added) {
        skipped.push({ entityId, entityName: entity.name, reason: "no-clip" });
        continue;
      }
      nextAssets = result.manifest;
      const trigger = createInteractionTriggerComponent(
        createId("component-interaction-trigger"),
        assetId,
      );
      if (!trigger) continue;
      added.push(trigger);
      converted.push({ entityId, entityName: entity.name, assetId });
    }
    next[entityId] = {
      ...entity,
      components: [
        ...entity.components.filter((component) => !isAnimationComponent(component)),
        ...added,
      ],
    };
  }

  return { entities: next, assets: nextAssets, converted, skipped };
}

/** The same conversion, for one Scene. */
export function migrateAnimationComponentsToGraphs(
  scene: SceneDocument,
  assets: AssetManifest,
  createId: (kind: string) => string,
): AnimationComponentMigrationResult {
  const result = migrateAnimationComponentsInEntities(
    scene.entities,
    assets,
    createId,
  );
  return {
    scene:
      result.entities === scene.entities
        ? scene
        : { ...scene, entities: result.entities },
    assets: result.assets,
    converted: result.converted,
    skipped: result.skipped,
  };
}

/**
 * Clears the Component ids that graphs used to name on Animation actions.
 *
 * A graph written before v1 says「この Animation Component の再生中を切り替える」
 * and carries the Component's id. That Component is gone, and animation is now
 * addressed per Entity — one Model, one mixer — so the id points at nothing.
 * The runtime ignores it, but the Editor's picker would show the action as
 * targeting a Component that is not there, so the id is dropped on open too.
 *
 * Returns the same object when there was nothing to clear, so a project that
 * has already been converted does not look edited.
 */
export function clearAnimationActionComponentIds(
  extension: KhrInteractivityExtension,
): { extension: KhrInteractivityExtension; cleared: number } {
  let cleared = 0;
  const next = cloneKhrInteractivityExtension(extension);
  for (const graph of next.graphs) {
    for (const node of graph.nodes ?? []) {
      const configuration = node.configuration;
      if (!configuration) continue;
      const targetKind = configuration.targetKind?.value?.[0];
      const component = configuration.component?.value?.[0];
      if (targetKind !== "animation") continue;
      if (typeof component !== "string" || component === "") continue;
      node.configuration = {
        ...configuration,
        component: { ...configuration.component!, value: [""] },
      };
      cleared += 1;
    }
  }
  return cleared > 0 ? { extension: next, cleared } : { extension, cleared: 0 };
}

/** One line for the notice bar, or null when nothing was converted. */
export function describeAnimationComponentMigration(
  result: Pick<AnimationComponentMigrationResult, "converted" | "skipped"> & {
    clearedActions?: number;
  },
): string | null {
  const clearedActions = result.clearedActions ?? 0;
  if (
    result.converted.length === 0 &&
    result.skipped.length === 0 &&
    clearedActions === 0
  ) {
    return null;
  }
  const parts: string[] = [];
  if (result.converted.length > 0) {
    parts.push(
      `${result.converted.length}件のAnimationをInteractivity Graphへ変換しました`,
    );
  }
  const dropped = result.skipped.filter(
    (entry) => entry.reason === "not-autoplaying",
  );
  if (dropped.length > 0) {
    parts.push(
      `自動再生でない${dropped.length}件は外しました（${dropped
        .slice(0, 3)
        .map((entry) => `「${entry.entityName}」`)
        .join("")}${dropped.length > 3 ? "ほか" : ""}）`,
    );
  }
  const missing = result.skipped.filter((entry) => entry.reason === "no-clip");
  if (missing.length > 0) {
    parts.push(`clipが見つからない${missing.length}件は外しました`);
  }
  if (clearedActions > 0) {
    parts.push(
      `Animationを操作する${clearedActions}件のノードは、Entityの Model を直接指すようにしました`,
    );
  }
  return parts.join("。");
}
