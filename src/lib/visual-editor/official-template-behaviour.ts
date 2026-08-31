import { addDefaultInteractivityAsset } from "./interactivity-graph";
import {
  appendInteractivityOperation,
  connectInteractivityFlow,
} from "./interactivity-recipes";
import {
  configureInteractivityTriggerAction,
  createDefaultKhrInteractivityExtension,
  getXriftInteractionProperty,
  setInteractivityTriggerActionValue,
  XRIFT_INTERACTION_OPERATIONS,
  XRIFT_INTERACTION_PLAYER_ENTITY_ID,
  type KhrInteractivityGraph,
} from "./interactivity-graph";
import { syncInteractionTriggerReferences } from "./interaction-trigger-targets";
import {
  createXriftComponent,
  XRIFT_COMPONENT_SCHEMA_IDS,
} from "./component-registry";
import {
  createInteractionTriggerComponent,
  type SceneComponent,
  type SceneDocument,
} from "./scene-document";
import type { AssetManifest } from "./asset-manifest";

/** Where the generated Behaviour graphs are filed in the Starter Library. */
const STARTER_BEHAVIOR_FOLDER_ID = "starter-library-behaviors";

/**
 * Where each of the sample's two portals sends the player.
 *
 * The Secret Room floor sits at z = 50, so two metres in puts the player inside
 * the room rather than in its back wall. The upstream World passes
 * `destination={[0, 0.5, 52]}` for the way in; the y differs only because
 * Studio's teleport takes the position the player's feet land on, the way a
 * SpawnPoint does.
 *
 * The way back matters as much as the way in. The sample puts a second portal
 * inside the room - `Return Portal` - and wiring only the first would drop a
 * player into a sealed room with a portal that does nothing, which is worse
 * than a room they could never enter.
 */
const PORTAL_DESTINATIONS: Readonly<
  Record<
    string,
    {
      arrival: readonly [number, number, number];
      label: string;
      /**
       * The Interactable's own id, which a published world requires to be
       * unique. Derived ids collide here because both portals are the same
       * component under two different groups.
       */
      interactableId: string;
    }
  >
> = {
  TeleportPortal: {
    arrival: [0, 0, 52],
    label: "隠し部屋へ",
    interactableId: "teleport-portal-in",
  },
  "Return Portal": {
    arrival: [0, 0, 8],
    label: "入口へ戻る",
    interactableId: "teleport-portal-out",
  },
};

type ButtonBehaviour = {
  graphName: string;
  caption: string;
  property: string;
  value: readonly [number, number, number];
};

/**
 * How the two identical button snapshots are told apart.
 *
 * Upstream they are「ローカル」and「グローバル」- one counting per viewer, one
 * shared across the instance. A graph has neither a way to show a number as
 * text nor any instance-synchronised state, so reproducing that would put back
 * the same static label this exists to remove. They are given two different
 * visible effects instead, and their captions say which.
 */
const BUTTON_BEHAVIOURS: readonly ButtonBehaviour[] = [
  {
    graphName: "押すと色が変わる",
    caption: "押すと色が変わる",
    property: "baseColor",
    value: [0.05, 0.62, 0.05],
  },
  {
    graphName: "押すと光る",
    caption: "押すと光る",
    property: "emissive",
    value: [0.62, 0.35, 0.02],
  },
];

/**
 * Gives the official template's interactive props something to actually do.
 *
 * The upstream Classic sample is a showcase of looks. `InteractableButton`
 * wraps a mesh in an `<Interactable>` with no `onInteract`, and its Click Count
 * label is a constant that never counts. `TeleportPortal` is a disc, a ring and
 * a word, with no teleport behind it. The World that composes them does pass a
 * destination and a label, but the component snapshots take no props, so even
 * that intent is lost on the way in.
 *
 * Converting it faithfully therefore produces a starter project where the two
 * things that most look pressable do nothing when pressed - which is the first
 * thing anyone tries. So the conversion is followed by this: the graphs the
 * Editor can express, wired to the Entities the source already named.
 */
export function wireOfficialTemplateBehaviour(
  scene: SceneDocument,
  assets: AssetManifest,
): { scene: SceneDocument; assets: AssetManifest } {
  let nextScene = scene;
  let nextAssets = assets;
  let graphIndex = 0;

  const byName = (name: string) =>
    Object.values(nextScene.entities).filter((entity) => entity.name === name);

  const childNamed = (entityId: string, name: string) =>
    (nextScene.entities[entityId]?.children ?? [])
      .map((childId) => nextScene.entities[childId])
      .find((child) => child?.name === name);

  const addComponent = (entityId: string, component: SceneComponent) => {
    const entity = nextScene.entities[entityId];
    if (!entity) return;
    nextScene = {
      ...nextScene,
      entities: {
        ...nextScene.entities,
        [entityId]: { ...entity, components: [...entity.components, component] },
      },
    };
  };

  const setText = (entityId: string, text: string) => {
    const entity = nextScene.entities[entityId];
    if (!entity) return;
    nextScene = {
      ...nextScene,
      entities: {
        ...nextScene.entities,
        [entityId]: {
          ...entity,
          components: entity.components.map((component) =>
            component.type === "text" ? { ...component, text } : component,
          ),
        },
      },
    };
  };

  const attachGraph = (
    entityId: string,
    graphName: string,
    build: (graph: KhrInteractivityGraph) => void,
  ) => {
    const extension = createDefaultKhrInteractivityExtension();
    const graph = extension.graphs[0] as KhrInteractivityGraph;
    graph.name = graphName;
    graph.nodes = [];
    graph.declarations = [];
    graph.types = [];
    build(graph);

    graphIndex += 1;
    const assetId = `starter-behavior-${graphIndex}`;
    const added = addDefaultInteractivityAsset(nextAssets, {
      id: assetId,
      name: graphName,
      folderId: STARTER_BEHAVIOR_FOLDER_ID,
      extension,
    });
    if (!added.added) return;
    nextAssets = added.manifest;
    const trigger = createInteractionTriggerComponent(
      `${assetId}-trigger`,
      assetId,
    );
    if (trigger) addComponent(entityId, trigger);
  };

  /** onInteract -> one property write. Every graph here is that shape. */
  const buildPressAction = (
    graph: KhrInteractivityGraph,
    target: {
      entityId: string;
      targetKind: "player" | "material";
      property: string;
      value: readonly number[];
    },
  ) => {
    const interact = appendInteractivityOperation(
      graph,
      XRIFT_INTERACTION_OPERATIONS.onInteract,
      { x: 80, y: 160 },
    );
    const write = appendInteractivityOperation(
      graph,
      XRIFT_INTERACTION_OPERATIONS.setProperty,
      { x: 400, y: 160 },
    );
    configureInteractivityTriggerAction(graph, write, {
      entityId: target.entityId,
      componentId: "",
      targetKind: target.targetKind,
      property: target.property,
    });
    const descriptor = getXriftInteractionProperty(
      target.targetKind,
      target.property,
    );
    if (descriptor) {
      setInteractivityTriggerActionValue(graph, write, descriptor, [
        ...target.value,
      ]);
    }
    connectInteractivityFlow(graph, interact, "out", write);
  };

  // Both portals share the same inner group name, so they are told apart by the
  // group the sample wrapped them in.
  for (const portal of byName("Teleport Portal")) {
    const rootName = portal.parentId
      ? nextScene.entities[portal.parentId]?.name
      : undefined;
    const destination = rootName ? PORTAL_DESTINATIONS[rootName] : undefined;
    if (!destination) continue;
    // A walk-in sensor is not something a graph can hear yet, so the portal is
    // made pressable instead. The Interactable wraps the whole group, which is
    // what puts the disc and the ring within the crosshair's reach.
    const interactable = createXriftComponent(
      XRIFT_COMPONENT_SCHEMA_IDS.interactable,
      {
        componentId: `${portal.id}-interactable`,
        properties: {
          id: destination.interactableId,
          interactionText: destination.label,
        },
      },
    );
    if (interactable) addComponent(portal.id, interactable);
    attachGraph(portal.id, `${destination.label}テレポート`, (graph) => {
      buildPressAction(graph, {
        entityId: XRIFT_INTERACTION_PLAYER_ENTITY_ID,
        targetKind: "player",
        property: "teleport",
        value: destination.arrival,
      });
    });
    const label = childNamed(portal.id, "Portal Label");
    if (label) setText(label.id, destination.label);
  }

  byName("InteractableButton").forEach((buttonRoot, index) => {
    const behaviour = BUTTON_BEHAVIOURS[index % BUTTON_BEHAVIOURS.length]!;
    const group = childNamed(buttonRoot.id, "Interactable Button");
    if (!group) return;
    const interactable = (group.children ?? [])
      .map((childId) => nextScene.entities[childId])
      .find((child) =>
        child?.components.some(
          (component) =>
            component.type === "xrift-component" &&
            component.schemaId === XRIFT_COMPONENT_SCHEMA_IDS.interactable,
        ),
      );
    if (!interactable) return;
    // The Material lives on the mesh, and a Material action stops at the first
    // nested Entity, so the action names the mesh rather than riding on the
    // self sentinel from the Entity that carries the Interactable.
    const rigidBody = childNamed(interactable.id, "RigidBody");
    const mesh = rigidBody ? childNamed(rigidBody.id, "Button Mesh") : undefined;
    if (!mesh) return;
    attachGraph(interactable.id, behaviour.graphName, (graph) => {
      buildPressAction(graph, {
        entityId: mesh.id,
        targetKind: "material",
        property: behaviour.property,
        value: behaviour.value,
      });
    });
    const caption = childNamed(group.id, "Click Count");
    if (caption) setText(caption.id, behaviour.caption);
  });

  return {
    scene: syncInteractionTriggerReferences(nextScene, nextAssets),
    assets: nextAssets,
  };
}
