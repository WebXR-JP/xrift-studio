import {
  getXriftInteractionProperties,
  getXriftInteractionProperty,
  XRIFT_INTERACTION_TARGET_LABELS,
  type XriftInteractionPropertyDescriptor,
  type XriftInteractionTargetKind,
} from "../../../packages/xrift-studio-runtime/src/script/interaction-trigger";
import type { AssetManifest } from "./asset-manifest";
import { collectXriftInteractionPrograms } from "./interactivity-graph";
import type { SceneDocument, SceneEntity } from "./scene-document";

/**
 * What an Interaction Trigger action can be pointed at, read from the Scene.
 *
 * The node editor cannot ask an author to type an Entity id, and it cannot show
 * every Component either: only the ones whose runtime state a trigger can
 * actually write. Building the list from the Scene and the shared property
 * registry together is what keeps the pickers honest — a Component with no
 * writable property never appears, so an author cannot select a target that
 * would silently do nothing.
 */

export type InteractionTriggerTargetComponent = {
  /** Empty for the Entity itself, which has no owning Component. */
  componentId: string;
  targetKind: XriftInteractionTargetKind;
  label: string;
  properties: readonly XriftInteractionPropertyDescriptor[];
};

export type InteractionTriggerTargetEntity = {
  entityId: string;
  name: string;
  /** Ancestor names joined for the picker, so two "Speaker" Entities differ. */
  path: string;
  components: readonly InteractionTriggerTargetComponent[];
};

const ENTITY_SELF_LABEL = "Entity 本体";

function componentLabel(
  entity: SceneEntity,
  targetKind: XriftInteractionTargetKind,
  index: number,
): string {
  const base = XRIFT_INTERACTION_TARGET_LABELS[targetKind];
  const siblings = entity.components.filter(
    (candidate) =>
      (targetKind === "audio-source" && candidate.type === "audio-source") ||
      (targetKind === "light" && candidate.type === "light"),
  );
  return siblings.length > 1 ? `${base} ${index + 1}` : base;
}

export function collectInteractionTriggerTargets(
  scene: SceneDocument,
): InteractionTriggerTargetEntity[] {
  const targets: InteractionTriggerTargetEntity[] = [];
  const visit = (entityId: string, ancestors: readonly string[]) => {
    const entity = scene.entities[entityId];
    if (!entity) return;
    const components: InteractionTriggerTargetComponent[] = [
      {
        componentId: "",
        targetKind: "entity",
        label: ENTITY_SELF_LABEL,
        properties: getXriftInteractionProperties("entity"),
      },
      {
        // Transform belongs to the Entity rather than to a Component the author
        // can add twice. It still carries a fixed id so the picker can tell it
        // apart from the Entity's own row, which uses the empty id.
        componentId: "transform",
        targetKind: "transform",
        label: XRIFT_INTERACTION_TARGET_LABELS.transform,
        properties: getXriftInteractionProperties("transform"),
      },
    ];
    let audioIndex = 0;
    let lightIndex = 0;
    for (const component of entity.components) {
      if (component.type === "audio-source") {
        components.push({
          componentId: component.id,
          targetKind: "audio-source",
          label: componentLabel(entity, "audio-source", audioIndex),
          properties: getXriftInteractionProperties("audio-source"),
        });
        audioIndex += 1;
      } else if (component.type === "animation") {
        components.push({
          componentId: component.id,
          targetKind: "animation",
          label: XRIFT_INTERACTION_TARGET_LABELS.animation,
          properties: getXriftInteractionProperties("animation"),
        });
      } else if (component.type === "light") {
        components.push({
          componentId: component.id,
          targetKind: "light",
          label: componentLabel(entity, "light", lightIndex),
          properties: getXriftInteractionProperties("light"),
        });
        lightIndex += 1;
      }
    }
    targets.push({
      entityId,
      name: entity.name,
      path: [...ancestors, entity.name].join(" / "),
      components,
    });
    for (const childId of entity.children) visit(childId, [...ancestors, entity.name]);
  };
  scene.rootEntityIds.forEach((entityId) => visit(entityId, []));
  return targets;
}

/**
 * Rewrites each trigger's `entityReferences` from its graph.
 *
 * The Component records the Entities its graph writes to, the way a Script
 * Component records the ones it can reach. The list is derived rather than
 * authored, so it cannot drift from the graph, and it is what lets the Editor
 * and future Prefab work see the dependency without parsing every Asset.
 */
export function syncInteractionTriggerEntityReferences(
  scene: SceneDocument,
  assets: AssetManifest,
): SceneDocument {
  let changed = false;
  const entities = Object.fromEntries(
    Object.entries(scene.entities).map(([entityId, entity]) => {
      let entityChanged = false;
      const components = entity.components.map((component) => {
        if (component.type !== "interaction-trigger") return component;
        const asset = assets.assets[component.interactivityAssetId];
        const references =
          asset?.kind === "interactivity"
            ? [
                ...new Set(
                  collectXriftInteractionPrograms(asset.extension).flatMap(
                    (program) => program.actions.map((action) => action.entityId),
                  ),
                ),
              ].sort()
            : [];
        if (
          references.length === component.entityReferences.length &&
          references.every(
            (value, index) => component.entityReferences[index] === value,
          )
        ) {
          return component;
        }
        entityChanged = true;
        return { ...component, entityReferences: references };
      });
      if (!entityChanged) return [entityId, entity];
      changed = true;
      return [entityId, { ...entity, components }];
    }),
  );
  return changed ? { ...scene, entities } : scene;
}

export function findInteractionTriggerTarget(
  targets: readonly InteractionTriggerTargetEntity[],
  entityId: string,
): InteractionTriggerTargetEntity | undefined {
  return targets.find((target) => target.entityId === entityId);
}

export function findInteractionTriggerTargetComponent(
  targets: readonly InteractionTriggerTargetEntity[],
  entityId: string,
  componentId: string,
): InteractionTriggerTargetComponent | undefined {
  return findInteractionTriggerTarget(targets, entityId)?.components.find(
    (component) => component.componentId === componentId,
  );
}

/**
 * One sentence describing what an action does, for the node card.
 *
 * A card showing only `xrift/setProperty` forces the author to select the node
 * to remember what it writes, which is exactly what a graph is supposed to make
 * visible at a glance.
 */
export function describeInteractionTriggerAction(
  targets: readonly InteractionTriggerTargetEntity[],
  action: {
    entityId: string;
    componentId: string;
    targetKind: string;
    property: string;
    mode: "set" | "toggle";
    value: readonly unknown[] | null;
  },
): string {
  const entity = findInteractionTriggerTarget(targets, action.entityId);
  const descriptor = getXriftInteractionProperty(action.targetKind, action.property);
  if (!entity || !descriptor) return "対象が未設定";
  const component = entity.components.find(
    (candidate) => candidate.componentId === action.componentId,
  );
  const componentLabelText =
    component?.label ?? XRIFT_INTERACTION_TARGET_LABELS[descriptor.target];
  const where = `${entity.name} / ${componentLabelText}`;
  if (action.mode === "toggle") {
    return `${where} の${descriptor.label}を切り替える`;
  }
  return `${where} の${descriptor.label}を ${formatTriggerValue(descriptor, action.value)} にする`;
}

export function formatTriggerValue(
  descriptor: XriftInteractionPropertyDescriptor,
  value: readonly unknown[] | null,
): string {
  const first = value?.[0];
  switch (descriptor.kind) {
    case "bool":
      return first === false ? "OFF" : "ON";
    case "float":
      return typeof first === "number" ? String(Number(first.toFixed(3))) : "既定値";
    case "color":
      return "指定した色";
    case "vector3": {
      const components = (value ?? []).slice(0, 3);
      if (components.length !== 3 || components.some((entry) => typeof entry !== "number")) {
        return "既定値";
      }
      return components
        .map((entry) => String(Number((entry as number).toFixed(3))))
        .join(", ");
    }
    case "enum": {
      const options = descriptor.options ?? [];
      const option =
        typeof first === "number" ? options[first] : options.find((entry) => entry.value === first);
      return option?.label ?? "既定値";
    }
  }
}
