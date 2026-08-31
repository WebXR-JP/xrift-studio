import {
  getXriftInteractionProperties,
  getXriftInteractionProperty,
  XRIFT_INTERACTION_PLAYER_ENTITY_ID,
  XRIFT_INTERACTION_SCENE_ENTITY_ID,
  XRIFT_INTERACTION_SELF_ENTITY_ID,
  XRIFT_INTERACTION_TARGET_LABELS,
  type XriftInteractionPropertyDescriptor,
  type XriftInteractionTargetKind,
} from "../../../packages/xrift-studio-runtime/src/script/interaction-trigger";
import type { AssetManifest } from "./asset-manifest";
import { collectXriftInteractionActions } from "./interactivity-graph";
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
      (targetKind === "text" && candidate.type === "text") ||
      (targetKind === "light" && candidate.type === "light"),
  );
  return siblings.length > 1 ? `${base} ${index + 1}` : base;
}

export function collectInteractionTriggerTargets(
  scene: SceneDocument,
  /**
   * The manifest, to know which Entities have clips.
   *
   * Animation is no longer a Component to look for — v1 removed it — so the
   * only way to say whether an Entity can be animated is to ask the Model it
   * draws. Optional so a caller that only wants the Transform and Material
   * rows does not have to carry one.
   */
  assets?: AssetManifest,
): InteractionTriggerTargetEntity[] {
  // The Scene itself comes first: exposure and the screen fade belong to no
  // Entity, and burying them under an arbitrary one would make an author hunt
  // for the target of a change that covers the whole view.
  const targets: InteractionTriggerTargetEntity[] = [
    {
      // Named before any real Entity because it is the answer that keeps the
      // graph reusable: the same「押したら開く」on every door, each opening
      // itself. Component ids are left empty on purpose — the owner is not
      // known while authoring, so the runtime takes whichever Light or Audio
      // Source that Entity turns out to have.
      entityId: XRIFT_INTERACTION_SELF_ENTITY_ID,
      name: "このグラフが付いた Entity",
      path: "付けた先で決まる",
      components: [
        {
          componentId: "",
          targetKind: "entity",
          label: ENTITY_SELF_LABEL,
          properties: getXriftInteractionProperties("entity"),
        },
        {
          componentId: "transform",
          targetKind: "transform",
          label: XRIFT_INTERACTION_TARGET_LABELS.transform,
          properties: getXriftInteractionProperties("transform"),
        },
        {
          componentId: "material",
          targetKind: "material",
          label: XRIFT_INTERACTION_TARGET_LABELS.material,
          properties: getXriftInteractionProperties("material"),
        },
        ...(["animation", "audio-source", "light", "particle", "text"] as const).map(
          (targetKind) => ({
            componentId: "",
            targetKind,
            label: XRIFT_INTERACTION_TARGET_LABELS[targetKind],
            properties: getXriftInteractionProperties(targetKind),
          }),
        ),
      ],
    },
    {
      entityId: XRIFT_INTERACTION_SCENE_ENTITY_ID,
      name: "Scene",
      path: "Scene 全体",
      components: [
        {
          componentId: "",
          targetKind: "scene",
          label: XRIFT_INTERACTION_TARGET_LABELS.scene,
          properties: getXriftInteractionProperties("scene"),
        },
      ],
    },
    {
      entityId: XRIFT_INTERACTION_PLAYER_ENTITY_ID,
      name: "プレイヤー",
      path: "押した人",
      components: [
        {
          componentId: "",
          targetKind: "player",
          label: XRIFT_INTERACTION_TARGET_LABELS.player,
          properties: getXriftInteractionProperties("player"),
        },
      ],
    },
  ];
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
      {
        // One row for everything this Entity draws: a Material Asset is shared
        // between Entities, so the write is scoped to this Entity's own copies
        // rather than to a Material a picker could point anywhere.
        componentId: "material",
        targetKind: "material",
        label: XRIFT_INTERACTION_TARGET_LABELS.material,
        properties: getXriftInteractionProperties("material"),
      },
    ];
    let audioIndex = 0;
    let lightIndex = 0;
    let textIndex = 0;
    for (const component of entity.components) {
      if (component.type === "audio-source") {
        components.push({
          componentId: component.id,
          targetKind: "audio-source",
          label: componentLabel(entity, "audio-source", audioIndex),
          properties: getXriftInteractionProperties("audio-source"),
        });
        audioIndex += 1;
      } else if (component.type === "mesh" && entityMeshHasClips(component, assets)) {
        // Animation belongs to the Model this Entity draws, not to a Component:
        // v1 removed the Animation Component, and a clip is addressed on the
        // Entity's own mixer. The empty id says exactly that.
        if (!components.some((candidate) => candidate.targetKind === "animation")) {
          components.push({
            componentId: "",
            targetKind: "animation",
            label: XRIFT_INTERACTION_TARGET_LABELS.animation,
            properties: getXriftInteractionProperties("animation"),
          });
        }
      } else if (component.type === "particle-emitter") {
        components.push({
          componentId: component.id,
          targetKind: "particle",
          label: XRIFT_INTERACTION_TARGET_LABELS.particle,
          properties: getXriftInteractionProperties("particle"),
        });
      } else if (component.type === "light") {
        components.push({
          componentId: component.id,
          targetKind: "light",
          label: componentLabel(entity, "light", lightIndex),
          properties: getXriftInteractionProperties("light"),
        });
        lightIndex += 1;
      } else if (component.type === "text") {
        components.push({
          componentId: component.id,
          targetKind: "text",
          label: componentLabel(entity, "text", textIndex),
          properties: getXriftInteractionProperties("text"),
        });
        textIndex += 1;
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
 * Rewrites each trigger's `entityReferences` and `assetReferences` from its
 * graph.
 *
 * The Component records what its graph reaches — the Entities it writes to and
 * the Assets it can point a property at — the way a Script Component records
 * the ones it can reach. Both lists are derived rather than authored, so they
 * cannot drift from the graph, and they are what lets the Editor, the compiler
 * and future Prefab work see the dependency without parsing every Asset.
 *
 * It reads every action node rather than walking forward from
 * `xrift/onInteract`: a graph that starts itself, or one behind
 * `event/receive`, still needs the Assets it names to be published.
 */
export function syncInteractionTriggerReferences(
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
        const actions =
          asset?.kind === "interactivity"
            ? collectXriftInteractionActions(asset.extension)
            : [];
        const entityReferences = [
          ...new Set(
            actions
              .map((action) => action.entityId)
              // The Scene and player stand-ins are not Entities, so they are
              // not dependencies the compiler has to keep emitting.
              .filter(
                (candidate) =>
                  candidate !== XRIFT_INTERACTION_SCENE_ENTITY_ID &&
                  candidate !== XRIFT_INTERACTION_PLAYER_ENTITY_ID,
              ),
          ),
        ].sort();
        const assetReferences = [
          ...new Set(
            actions.flatMap((action) =>
              action.value?.kind === "asset" && action.value.value
                ? [action.value.value]
                : [],
            ),
          ),
        ].sort();
        if (
          sameStrings(entityReferences, component.entityReferences) &&
          sameStrings(assetReferences, component.assetReferences)
        ) {
          return component;
        }
        entityChanged = true;
        return { ...component, entityReferences, assetReferences };
      });
      if (!entityChanged) return [entityId, entity];
      changed = true;
      return [entityId, { ...entity, components }];
    }),
  );
  return changed ? { ...scene, entities } : scene;
}

function sameStrings(
  left: readonly string[],
  right: readonly string[] | undefined,
): boolean {
  return (
    right !== undefined &&
    left.length === right.length &&
    left.every((value, index) => right[index] === value)
  );
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
    /** Seconds the change is spread over. 0 or absent is an immediate write. */
    durationSeconds?: number;
    /**
     * Name of the Asset an `asset` property points at, already resolved.
     *
     * The card shows a name rather than an id, and this module has no Asset
     * manifest, so the caller that does resolves it. Absent means「未設定」,
     * which for an Asset property is a real instruction: clear the override.
     */
    assetName?: string | null;
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
  if (descriptor.kind === "asset") {
    return action.assetName
      ? `${where} の${descriptor.label}を「${action.assetName}」にする`
      : `${where} の${descriptor.label}を元に戻す`;
  }
  const value = formatTriggerValue(descriptor, action.value);
  const seconds = action.durationSeconds ?? 0;
  return seconds > 0
    ? `${where} の${descriptor.label}を ${seconds}秒かけて ${value} にする`
    : `${where} の${descriptor.label}を ${value} にする`;
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
    case "asset":
      // The id lives in configuration, not the value socket, so there is
      // nothing here to format; callers describe it from the Asset's name.
      return "選んだAsset";
    case "string":
      return typeof first === "string" && first.length > 0 ? `「${first}」` : "空の文字";
  }
}

/** Whether the Model this Mesh draws carries animation clips. */
function entityMeshHasClips(
  mesh: Extract<SceneEntity["components"][number], { type: "mesh" }>,
  assets: AssetManifest | undefined,
): boolean {
  const assetId =
    mesh.geometry?.kind === "asset" ? mesh.geometry.assetId : mesh.geometryAssetId;
  const asset = assetId ? assets?.assets[assetId] : undefined;
  return asset?.kind === "model" && (asset.importMetadata?.animations.length ?? 0) > 0;
}
