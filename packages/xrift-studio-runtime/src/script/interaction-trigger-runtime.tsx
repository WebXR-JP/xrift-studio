import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  Color,
  Fog,
  LinearSRGBColorSpace,
  MathUtils,
  SRGBColorSpace,
  type Light,
  type Material,
  type Mesh,
  type Object3D,
  type Scene,
} from "three";
import {
  XRIFT_AUDIO_SOURCE_RUNTIME_USER_DATA_KEY,
  type XriftAudioSourceRuntimeBridge,
  type XriftAudioSourceRuntimeOverrides,
} from "./audio-source.js";
import {
  XRIFT_ANIMATION_RUNTIME_USER_DATA_KEY,
  isXriftAnimationRuntimeBridge,
  type XriftAnimationRuntimeBridge,
} from "./animation.js";
import {
  XRIFT_LIGHT_RUNTIME_USER_DATA_KEY,
  type XriftLightRuntimeBridge,
  type XriftLightRuntimeOverrides,
} from "./light.js";
import {
  XRIFT_PARTICLE_RUNTIME_USER_DATA_KEY,
  type XriftParticleRuntimeBridge,
  type XriftParticleRuntimeOverrides,
} from "./particle.js";
import {
  isXriftTextRuntimeBridge,
  XRIFT_TEXT_RUNTIME_USER_DATA_KEY,
  type XriftTextRuntimeBridge,
  type XriftTextRuntimeOverrides,
} from "./text-runtime.js";
import {
  emitXriftSceneEvent,
  findXriftSceneRuntimeBridge,
  type XriftSceneRuntimeBridge,
  readXriftScenePostprocessingBaseline,
  XRIFT_SCENE_SKYBOX_USER_DATA_KEY,
} from "./scene-runtime.js";
import { findXriftPlayerRuntimeBridge } from "./player-runtime.js";
import {
  findXriftInstanceStateRuntimeBridge,
  xriftSharedActionStateId,
} from "./instance-state-runtime.js";
import { collectXriftInteractionActions } from "./interaction-trigger.js";
import {
  getXriftInteractionProperty,
  resolveXriftInteractionEntityId,
  XRIFT_INTERACTION_SELF_ENTITY_ID,
  type XriftInteractionPropertyDescriptor,
  type XriftInteractionAction,
  type XriftInteractionTargetKind,
  type XriftInteractionValue,
} from "./interaction-trigger.js";
import { InteractivityEngine } from "../interactivity/engine.js";
import { parseInteractivityExtension } from "../interactivity/graph.js";
import type {
  InteractivityActionTarget,
  InteractivityHost,
} from "../interactivity/host.js";
import {
  asBoolean,
  asNumber,
  asNumbers,
  boolValue,
  floatValue,
  intValue,
  vectorValue,
  type InteractivityValue,
} from "../interactivity/value.js";

/**
 * Runs Interaction Trigger graphs, in Studio Play and in a published world.
 *
 * The XRift official `Interactable` reports an interaction by id, not by
 * Entity, and the Component it belongs to is rendered far from the Entity that
 * owns the graph. A module-level bus is what lets one emit reach every trigger
 * bound to that Entity without threading a callback through the whole tree, and
 * it is the same module in both surfaces, so an interaction cannot be wired one
 * way while authoring and another way after publishing.
 *
 * Writes go through the existing Audio Source and Light runtime bridges, the
 * same ones Scripts own, so a trigger and a Script changing the same Component
 * compose instead of fighting over it.
 */

type XriftInteractionHandler = () => void;

const interactionHandlers = new Map<string, Set<XriftInteractionHandler>>();

export function subscribeXriftInteraction(
  entityId: string,
  handler: XriftInteractionHandler,
): () => void {
  const existing = interactionHandlers.get(entityId) ?? new Set();
  existing.add(handler);
  interactionHandlers.set(entityId, existing);
  return () => {
    const current = interactionHandlers.get(entityId);
    if (!current) return;
    current.delete(handler);
    if (current.size === 0) interactionHandlers.delete(entityId);
  };
}

/** Called by the Entity's official Interactable when a player interacts. */
export function emitXriftInteraction(entityId: string): void {
  const handlers = interactionHandlers.get(entityId);
  if (!handlers) return;
  for (const handler of [...handlers]) handler();
}

function entityMarker(object: Object3D): string | undefined {
  const data = object.userData as {
    authoringEntityId?: unknown;
    renderedEntityId?: unknown;
    xriftEntityId?: unknown;
  };
  // Studio Play and generated output mark Entities with different keys; a
  // trigger has to resolve a target in both.
  const candidate =
    data.renderedEntityId ?? data.xriftEntityId ?? data.authoringEntityId;
  return typeof candidate === "string" ? candidate : undefined;
}

function findEntityObject(root: Object3D, entityId: string): Object3D | null {
  let found: Object3D | null = null;
  root.traverse((object) => {
    if (!found && entityMarker(object) === entityId) found = object;
  });
  return found;
}

/**
 * Visits runtime bridges belonging to one Entity.
 *
 * The traversal stops at a nested Entity so a trigger aimed at a parent never
 * silently writes to a child's Audio Source.
 */
function forEachOwnedBridge<Bridge>(
  root: Object3D,
  entityId: string,
  userDataKey: string,
  isBridge: (value: unknown) => value is Bridge,
  callback: (bridge: Bridge) => void,
): void {
  const seen = new Set<Bridge>();
  const visit = (object: Object3D) => {
    if (object !== root) {
      const marker = entityMarker(object);
      if (marker && marker !== entityId) return;
    }
    const candidate = (object.userData as Record<string, unknown>)[userDataKey];
    if (isBridge(candidate) && !seen.has(candidate)) {
      seen.add(candidate);
      callback(candidate);
    }
    for (const child of object.children) visit(child);
  };
  visit(root);
}

/**
 * One action, as the Text bridge's override shape.
 *
 * Colours become CSS hex because that is what the panel config takes; the
 * action carries linear RGB, which is how every other colour in a graph is
 * stored, so the conversion belongs here rather than in the bridge.
 */
function textRuntimeOverrides(
  action: XriftInteractionAction,
): XriftTextRuntimeOverrides | null {
  const value = action.value;
  if (!value) return null;
  switch (action.property) {
    case "enabled":
      return value.kind === "bool" ? { enabled: value.value } : null;
    case "text":
      return value.kind === "string" ? { text: value.value } : null;
    case "fontId":
      return value.kind === "string" ? { fontId: value.value } : null;
    case "textAlign":
      return value.kind === "enum"
        ? { textAlign: value.value as XriftTextRuntimeOverrides["textAlign"] }
        : null;
    case "color":
      return value.kind === "color" ? { color: hexFromLinear(value.value) } : null;
    case "outlineColor":
      return value.kind === "color"
        ? { outlineColor: hexFromLinear(value.value) }
        : null;
    case "fontSize":
      return value.kind === "float" ? { fontSize: value.value } : null;
    case "fontWeight":
      return value.kind === "float" ? { fontWeight: value.value } : null;
    case "lineHeight":
      return value.kind === "float" ? { lineHeight: value.value } : null;
    case "letterSpacing":
      return value.kind === "float" ? { letterSpacing: value.value } : null;
    case "maxWidth":
      return value.kind === "float" ? { maxWidth: value.value } : null;
    case "outlineWidth":
      return value.kind === "float" ? { outlineWidth: value.value } : null;
    default:
      return null;
  }
}

function hexFromLinear(value: readonly [number, number, number]): string {
  return `#${new Color()
    .setRGB(value[0], value[1], value[2], LinearSRGBColorSpace)
    .getHexString(SRGBColorSpace)}`;
}

function isAudioSourceBridge(
  value: unknown,
): value is XriftAudioSourceRuntimeBridge {
  const candidate = value as XriftAudioSourceRuntimeBridge | null;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof candidate.setOwner === "function" &&
    typeof candidate.command === "function" &&
    typeof candidate.read === "function"
  );
}

function isParticleBridge(
  value: unknown,
): value is XriftParticleRuntimeBridge {
  const candidate = value as XriftParticleRuntimeBridge | null;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof candidate.setOwner === "function" &&
    typeof candidate.removeOwner === "function" &&
    typeof candidate.read === "function"
  );
}

function isLightBridge(value: unknown): value is XriftLightRuntimeBridge {
  const candidate = value as XriftLightRuntimeBridge | null;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof candidate.setOwner === "function" &&
    typeof candidate.removeOwner === "function" &&
    typeof candidate.read === "function"
  );
}

function linearColor(value: readonly [number, number, number]): Color {
  return new Color().setRGB(value[0], value[1], value[2], LinearSRGBColorSpace);
}

export type XriftInteractionApplier = {
  apply(action: XriftInteractionAction): void;
  /**
   * Plays one clip beside whatever else is running.
   *
   * The Animation Component plays a single clip, which is all one「再生中」can
   * mean. A Model can carry sixty-four meant to run together — gulls, insects,
   * a boat's wake — so a graph needs a way to name them one at a time.
   */
  playClip(
    entityId: string,
    request: {
      clipIndex: number;
      loop: boolean;
      speed: number;
      fromSeconds: number | null;
    },
  ): void;
  stopClip(entityId: string, clipIndex: number): void;
  /** Live value of one property, so a graph can toggle or ramp from it. */
  read(target: {
    entityId: string;
    componentId: string | null;
    targetKind: XriftInteractionTargetKind;
    property: string;
  }): XriftInteractionValue | null;
  /**
   * Broadcasts what an action changed to everyone else in the instance.
   *
   * Separate from `apply` because the two answer different questions: `apply`
   * is what this viewer sees, `share` is what the room agrees on. An action
   * that is not shared never reaches this, and a runtime with no instance
   * bridge - an Item preview, a Scene View - drops it rather than failing.
   */
  share(action: XriftInteractionAction): void;
  /** Releases every override this trigger owns, as Play Stop and unmount do. */
  dispose(): void;
};

/**
 * The write half of a trigger, without React.
 *
 * Kept separate from the component so the part that actually changes a world
 * can be exercised against a plain scene graph: an override that survives Stop,
 * or a toggle that reads the wrong current value, is not something a rendered
 * preview makes obvious.
 */
export function createXriftInteractionApplier({
  root,
  componentId,
  order,
  selfEntityId = null,
}: {
  root: Object3D;
  componentId: string;
  order: number;
  /** The Entity this trigger sits on, substituted for the self sentinel. */
  selfEntityId?: string | null;
}): XriftInteractionApplier {
  const owner = {};
  /**
   * What an Entity looked like before this trigger touched it.
   *
   * Visibility and Transform are written straight onto the object rather than
   * through a bridge, so nothing else would put them back. Capturing the first
   * value means Play Stop leaves the Scene exactly as it was authored, which is
   * the same promise the Light and Audio overrides already make.
   */
  const restorePoints = new Map<
    Object3D,
    {
      visible: boolean;
      position: [number, number, number];
      rotation: [number, number, number];
      scale: [number, number, number];
    }
  >();
  const ownEntityId = (id: string): string =>
    resolveXriftInteractionEntityId(id, selfEntityId);

  const remember = (object: Object3D): void => {
    if (restorePoints.has(object)) return;
    restorePoints.set(object, {
      visible: object.visible,
      position: [object.position.x, object.position.y, object.position.z],
      rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
      scale: [object.scale.x, object.scale.y, object.scale.z],
    });
  };
  const lightOverrides = new Map<
    XriftLightRuntimeBridge,
    XriftLightRuntimeOverrides
  >();
  const audioOverrides = new Map<
    XriftAudioSourceRuntimeBridge,
    XriftAudioSourceRuntimeOverrides
  >();
  let commandRevision = 0;

  const applyEntity = (target: Object3D, action: XriftInteractionAction) => {
    remember(target);
    // Visibility only: physics bodies stay as authored, which is the same
    // meaning `enabled` has in the Editor viewport.
    target.visible =
      action.mode === "toggle"
        ? !target.visible
        : action.value?.kind === "bool"
          ? action.value.value
          : target.visible;
  };

  const applyTransform = (target: Object3D, action: XriftInteractionAction) => {
    if (action.value?.kind !== "vector3") return;
    remember(target);
    const [x, y, z] = action.value.value;
    if (action.property === "position") {
      target.position.set(x, y, z);
      return;
    }
    if (action.property === "rotation") {
      // Authored in degrees, because a graph is edited by hand and radians are
      // not a number an author has an opinion about.
      target.rotation.set(
        MathUtils.degToRad(x),
        MathUtils.degToRad(y),
        MathUtils.degToRad(z),
      );
      return;
    }
    if (action.property === "scale") target.scale.set(x, y, z);
  };

  const readTransform = (
    object: Object3D,
    property: string,
  ): XriftInteractionValue | null => {
    if (property === "position") {
      return {
        kind: "vector3",
        value: [object.position.x, object.position.y, object.position.z],
      };
    }
    if (property === "rotation") {
      return {
        kind: "vector3",
        value: [
          MathUtils.radToDeg(object.rotation.x),
          MathUtils.radToDeg(object.rotation.y),
          MathUtils.radToDeg(object.rotation.z),
        ],
      };
    }
    if (property === "scale") {
      return {
        kind: "vector3",
        value: [object.scale.x, object.scale.y, object.scale.z],
      };
    }
    return null;
  };

  const animationOwners = new Set<XriftAnimationRuntimeBridge>();
  const sceneOwners = new Set<XriftSceneRuntimeBridge>();
  const textOwners = new Set<XriftTextRuntimeBridge>();
  /**
   * Meshes whose Material this trigger replaced with its own clone.
   *
   * A Material Asset is shared, so writing to the instance a Mesh happens to
   * hold would recolour every other Entity using it. Owning a clone first is
   * what keeps the change to this Entity, and keeping the original is what puts
   * the Scene back on Stop.
   */
  const materialRestores = new Map<Mesh, Material | Material[]>();

  const isMesh = (object: Object3D): object is Mesh =>
    (object as Mesh & { isMesh?: boolean }).isMesh === true;

  /** Visits this Entity's own Meshes, stopping at a nested Entity. */
  const forEachOwnedMesh = (
    root: Object3D,
    entityId: string,
    callback: (mesh: Mesh) => void,
  ): void => {
    const visit = (object: Object3D) => {
      if (object !== root) {
        const marker = entityMarker(object);
        if (marker && marker !== entityId) return;
      }
      if (isMesh(object)) callback(object);
      for (const child of object.children) visit(child);
    };
    visit(root);
  };

  const ownMaterials = (mesh: Mesh): Material[] => {
    if (!materialRestores.has(mesh)) {
      materialRestores.set(mesh, mesh.material);
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((entry) => entry.clone())
        : mesh.material.clone();
    }
    return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  };

  type WritableMaterial = Material & {
    color?: Color;
    emissive?: Color;
    emissiveIntensity?: number;
  };

  const applyMaterial = (target: Object3D, action: XriftInteractionAction) => {
    forEachOwnedMesh(target, ownEntityId(action.entityId), (mesh) => {
      for (const material of ownMaterials(mesh) as WritableMaterial[]) {
        if (action.property === "baseColor" && action.value?.kind === "color") {
          material.color?.setRGB(
            action.value.value[0],
            action.value.value[1],
            action.value.value[2],
            LinearSRGBColorSpace,
          );
        } else if (
          action.property === "emissive" &&
          action.value?.kind === "color"
        ) {
          material.emissive?.setRGB(
            action.value.value[0],
            action.value.value[1],
            action.value.value[2],
            LinearSRGBColorSpace,
          );
        } else if (
          action.property === "emissiveIntensity" &&
          action.value?.kind === "float"
        ) {
          if (material.emissiveIntensity !== undefined) {
            material.emissiveIntensity = action.value.value;
          }
        } else if (
          action.property === "opacity" &&
          action.value?.kind === "float"
        ) {
          material.opacity = action.value.value;
          // Below 1 the Material has to be drawn in the transparent pass, or
          // the change simply does not show.
          material.transparent = material.transparent || action.value.value < 1;
        } else {
          continue;
        }
        material.needsUpdate = true;
      }
    });
  };

  const readMaterial = (
    object: Object3D,
    target: { entityId: string; property: string },
  ): XriftInteractionValue | null => {
    const found: { value: XriftInteractionValue | null } = { value: null };
    forEachOwnedMesh(object, ownEntityId(target.entityId), (mesh) => {
      if (found.value) return;
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      const material = materials[0] as WritableMaterial | undefined;
      if (!material) return;
      if (target.property === "baseColor" && material.color) {
        found.value = {
          kind: "color",
          value: [material.color.r, material.color.g, material.color.b],
        };
      } else if (target.property === "emissive" && material.emissive) {
        found.value = {
          kind: "color",
          value: [material.emissive.r, material.emissive.g, material.emissive.b],
        };
      } else if (target.property === "emissiveIntensity") {
        found.value = {
          kind: "float",
          value: material.emissiveIntensity ?? 1,
        };
      } else if (target.property === "opacity") {
        found.value = { kind: "float", value: material.opacity };
      }
    });
    return found.value;
  };
  const particleOverrides = new Map<
    XriftParticleRuntimeBridge,
    XriftParticleRuntimeOverrides
  >();
  let particleRestarts = 0;

  const applyParticle = (target: Object3D, action: XriftInteractionAction) => {
    forEachOwnedBridge(
      target,
      ownEntityId(action.entityId),
      XRIFT_PARTICLE_RUNTIME_USER_DATA_KEY,
      isParticleBridge,
      (bridge) => {
        const state = bridge.read();
        if (action.componentId && state.componentId !== action.componentId) return;
        // The bridge replaces an owner's overrides wholesale, so the running
        // set is kept here: writing the rate after the switch must not undo it.
        const next: XriftParticleRuntimeOverrides = {
          ...(particleOverrides.get(bridge) ?? {}),
        };
        if (action.property === "emitting") {
          const emitting =
            action.mode === "toggle"
              ? state.stopped === true || state.playing === false
              : action.value?.kind === "bool"
                ? action.value.value
                : true;
          next.playing = emitting;
          next.stopped = !emitting;
        } else if (
          action.property === "restart" &&
          (action.mode === "toggle" || action.value?.kind === "bool")
        ) {
          particleRestarts += 1;
          next.restartRevision = particleRestarts;
          next.playing = true;
          next.stopped = false;
        } else if (
          action.property === "emissionRate" &&
          action.value?.kind === "float"
        ) {
          next.emissionRate = action.value.value;
        } else if (
          action.property === "sizeMultiplier" &&
          action.value?.kind === "float"
        ) {
          next.sizeMultiplier = action.value.value;
        } else if (
          action.property === "opacity" &&
          action.value?.kind === "float"
        ) {
          next.opacity = action.value.value;
        } else if (action.property === "color" && action.value?.kind === "color") {
          next.color = linearColor(action.value.value).getHex(SRGBColorSpace);
        } else {
          return;
        }
        particleOverrides.set(bridge, next);
        bridge.setOwner(owner, order, componentId, next);
      },
    );
  };

  const readParticle = (
    object: Object3D,
    target: { entityId: string; componentId: string | null; property: string },
  ): XriftInteractionValue | null => {
    const found: { value: XriftInteractionValue | null } = { value: null };
    forEachOwnedBridge(
      object,
      ownEntityId(target.entityId),
      XRIFT_PARTICLE_RUNTIME_USER_DATA_KEY,
      isParticleBridge,
      (bridge) => {
        const state = bridge.read();
        if (found.value || (target.componentId && state.componentId !== target.componentId)) return;
        if (target.property === "emitting") {
          found.value = {
            kind: "bool",
            value: state.stopped !== true && state.playing !== false,
          };
        } else if (target.property === "emissionRate") {
          found.value = { kind: "float", value: state.emissionRate ?? 0 };
        } else if (target.property === "sizeMultiplier") {
          found.value = { kind: "float", value: state.sizeMultiplier ?? 1 };
        } else if (target.property === "opacity") {
          found.value = { kind: "float", value: state.opacity ?? 1 };
        } else if (target.property === "color") {
          const color = new Color(state.color ?? 0xffffff);
          found.value = { kind: "color", value: [color.r, color.g, color.b] };
        }
      },
    );
    return found.value;
  };

  /**
   * Scene properties whose runtime value is simply the property's own name.
   *
   * The bridge's override keys are the property names, so a table is enough:
   * one entry per Scene setting a graph can change, and the write itself is
   * the same three lines for all of them. Only the kind has to match, which is
   * what keeps a colour from being written where a float belongs.
   */
  const SCENE_BOOL_PROPERTIES = [
    "postprocessing",
    "bloom",
    "ao",
    "grading",
    "fog",
    "ambient",
    "skybox",
    "skyboxIbl",
  ] as const;
  const SCENE_FLOAT_PROPERTIES = [
    "exposure",
    "fade",
    "bloomStrength",
    "bloomRadius",
    "bloomThreshold",
    "fogNear",
    "fogFar",
    "ambientIntensity",
    "skyboxExposure",
    "skyboxRotation",
    "cameraFov",
  ] as const;
  const SCENE_COLOR_PROPERTIES = [
    "fadeColor",
    "fogColor",
    "ambientColor",
  ] as const;

  /**
   * Text is written through its own bridge, like Light and Particle: the panel
   * is typeset from one config object, so re-lettering a sign has to go through
   * the thing that owns that object rather than poking at the mesh.
   */
  const applyText = (target: Object3D, action: XriftInteractionAction) => {
    forEachOwnedBridge(
      target,
      ownEntityId(action.entityId),
      XRIFT_TEXT_RUNTIME_USER_DATA_KEY,
      isXriftTextRuntimeBridge,
      (bridge) => {
        // An empty component id means「このEntityのText」, which is what a graph
        // attached to the Entity itself writes.
        if (action.componentId && bridge.read().componentId !== action.componentId) {
          return;
        }
        const overrides = textRuntimeOverrides(action);
        if (!overrides) return;
        textOwners.add(bridge);
        bridge.setOwner(owner, order, componentId, overrides);
      },
    );
  };

  const readText = (
    target: Object3D,
    action: { entityId: string; componentId: string | null; property: string },
  ): XriftInteractionValue | null => {
    const found: { value: XriftInteractionValue | null } = { value: null };
    forEachOwnedBridge(
      target,
      ownEntityId(action.entityId),
      XRIFT_TEXT_RUNTIME_USER_DATA_KEY,
      isXriftTextRuntimeBridge,
      (bridge) => {
        const state = bridge.read();
        if (
          found.value ||
          (action.componentId && state.componentId !== action.componentId)
        ) {
          return;
        }
        if (action.property === "enabled") {
          found.value = { kind: "bool", value: state.enabled ?? true };
          return;
        }
        const current = state.overrides[
          action.property as keyof typeof state.overrides
        ];
        if (current === undefined) return;
        if (typeof current === "number") {
          found.value = { kind: "float", value: current };
        } else if (typeof current === "string") {
          found.value =
            action.property === "color" || action.property === "outlineColor"
              ? null
              : { kind: "string", value: current };
        }
      },
    );
    return found.value;
  };

  /**
   * Moves the person playing.
   *
   * Unlike every other action there is nothing to restore on Stop: a player
   * who walked somewhere is not an override on authored data, and putting them
   * back where the graph found them would be a second teleport nobody asked
   * for. Play discards the player with the rest of the run.
   */
  const applyPlayer = (action: XriftInteractionAction) => {
    if (action.property !== "teleport") return;
    const value = action.value;
    if (value?.kind !== "vector3") return;
    const bridge = findXriftPlayerRuntimeBridge(root);
    // No bridge means no player to move - an Item preview, or a Scene View
    // that is not running. Silently doing nothing is right; there is nobody
    // standing anywhere to move.
    if (!bridge) return;
    bridge.teleport({ position: [...value.value] });
  };

  const applyScene = (action: XriftInteractionAction) => {
    const bridge = findXriftSceneRuntimeBridge(root);
    if (!bridge) return;
    sceneOwners.add(bridge);
    const property = action.property;
    const value = action.value;
    if (
      value?.kind === "bool" &&
      (SCENE_BOOL_PROPERTIES as readonly string[]).includes(property)
    ) {
      bridge.setOwner(owner, order, componentId, { [property]: value.value });
      return;
    }
    if (
      value?.kind === "float" &&
      (SCENE_FLOAT_PROPERTIES as readonly string[]).includes(property)
    ) {
      bridge.setOwner(owner, order, componentId, { [property]: value.value });
      return;
    }
    if (
      value?.kind === "color" &&
      (SCENE_COLOR_PROPERTIES as readonly string[]).includes(property)
    ) {
      bridge.setOwner(owner, order, componentId, { [property]: value.value });
      return;
    }
    if (value?.kind === "asset" && property === "skyboxImage") {
      bridge.setOwner(owner, order, componentId, { skyboxImage: value.value });
    }
  };

  /**
   * The Scene value a toggle flips away from, or a timed change starts at.
   *
   * The override is the answer whenever there is one. When there is not, the
   * authored value has to come from somewhere real: fog, ambient light, the sky
   * and the camera are read straight off the live scene, and the compositor
   * publishes its own settings because nothing in the scene graph carries them.
   * Guessing「たぶんON」instead would make the first press of a「画質を上げる」
   * button do nothing on exactly the worlds that need it.
   */
  const readScene = (property: string): XriftInteractionValue | null => {
    const bridge = findXriftSceneRuntimeBridge(root);
    if (!bridge) return null;
    const state = bridge.read();
    const post = readXriftScenePostprocessingBaseline(root);
    const bool = (
      override: boolean | null,
      authored: boolean | undefined,
    ): XriftInteractionValue | null =>
      override === null && authored === undefined
        ? null
        : { kind: "bool", value: override ?? authored ?? false };
    const float = (
      override: number | null,
      authored: number | undefined,
    ): XriftInteractionValue | null =>
      override === null && authored === undefined
        ? null
        : { kind: "float", value: override ?? authored ?? 0 };
    const color = (
      value: readonly [number, number, number],
    ): XriftInteractionValue => ({
      kind: "color",
      value: [value[0], value[1], value[2]],
    });

    const scene = root as Scene;
    let ambientVisible: boolean | undefined;
    let ambientIntensity: number | undefined;
    let ambientColor: Color | undefined;
    let skyVisible: boolean | undefined;
    if (property.startsWith("ambient") || property === "skybox") {
      root.traverse((object) => {
        const light = object as Light & { isAmbientLight?: boolean };
        if (light.isAmbientLight === true && ambientVisible === undefined) {
          ambientVisible = light.visible;
          ambientIntensity = light.intensity;
          ambientColor = light.color;
        }
        if (
          (object.userData as Record<string, unknown>)[
            XRIFT_SCENE_SKYBOX_USER_DATA_KEY
          ] === true &&
          skyVisible === undefined
        ) {
          skyVisible = object.visible;
        }
      });
    }

    switch (property) {
      case "exposure":
        return { kind: "float", value: state.exposure ?? 1 };
      case "fade":
        return { kind: "float", value: state.fade };
      case "fadeColor":
        return color(state.fadeColor);
      case "postprocessing":
        return bool(state.postprocessing, post?.enabled);
      case "bloom":
        return bool(state.bloom, post?.bloom);
      case "bloomStrength":
        return float(state.bloomStrength, post?.bloomStrength);
      case "bloomRadius":
        return float(state.bloomRadius, post?.bloomRadius);
      case "bloomThreshold":
        return float(state.bloomThreshold, post?.bloomThreshold);
      case "ao":
        return bool(state.ao, post?.ao);
      case "grading":
        return bool(state.grading, post?.grading);
      case "fog":
        return bool(state.fog, scene.fog != null);
      case "fogColor":
        return state.fogColor
          ? color(state.fogColor)
          : scene.fog instanceof Fog
            ? color([scene.fog.color.r, scene.fog.color.g, scene.fog.color.b])
            : null;
      case "fogNear":
        return float(
          state.fogNear,
          scene.fog instanceof Fog ? scene.fog.near : undefined,
        );
      case "fogFar":
        return float(
          state.fogFar,
          scene.fog instanceof Fog ? scene.fog.far : undefined,
        );
      case "ambient":
        return bool(state.ambient, ambientVisible);
      case "ambientColor":
        return state.ambientColor
          ? color(state.ambientColor)
          : ambientColor
            ? color([ambientColor.r, ambientColor.g, ambientColor.b])
            : null;
      case "ambientIntensity":
        return float(state.ambientIntensity, ambientIntensity);
      case "skybox":
        return bool(
          state.skybox,
          skyVisible ?? (scene.background != null || undefined),
        );
      case "skyboxIbl":
        return bool(state.skyboxIbl, scene.environment != null);
      case "skyboxExposure":
        return float(state.skyboxExposure, scene.environmentIntensity);
      case "skyboxRotation":
        return float(
          state.skyboxRotation,
          (scene.environmentRotation.y * 180) / Math.PI,
        );
      default:
        return null;
    }
  };

  const applyAnimation = (target: Object3D, action: XriftInteractionAction) => {
    forEachOwnedBridge(
      target,
      ownEntityId(action.entityId),
      XRIFT_ANIMATION_RUNTIME_USER_DATA_KEY,
      isXriftAnimationRuntimeBridge,
      (bridge) => {
        const state = bridge.read();
        // Animation is addressed per Entity, not per Component: one Model has
        // one mixer, and the Component that used to own it is gone. A graph
        // written before that still names a component id, and matching on it
        // would silently make every one of those graphs do nothing.
        animationOwners.add(bridge);
        if (action.property === "playing") {
          const playing =
            action.mode === "toggle"
              ? !state.playing
              : action.value?.kind === "bool"
                ? action.value.value
                : state.playing;
          bridge.command(
            owner,
            order,
            componentId,
            playing ? { type: "play" } : { type: "pause" },
          );
          return;
        }
        if (action.property === "clip" && action.value?.kind === "float") {
          bridge.command(owner, order, componentId, {
            type: "select",
            clipIndex: Math.round(action.value.value),
          });
          return;
        }
        if (action.property === "time" && action.value?.kind === "float") {
          bridge.command(owner, order, componentId, {
            type: "seek",
            time: action.value.value,
          });
          return;
        }
        if (action.property === "speed" && action.value?.kind === "float") {
          bridge.setOwner(owner, order, componentId, {
            speed: action.value.value,
          });
        }
      },
    );
  };

  const readAnimation = (
    object: Object3D,
    target: { entityId: string; componentId: string | null; property: string },
  ): XriftInteractionValue | null => {
    const found: { value: XriftInteractionValue | null } = { value: null };
    forEachOwnedBridge(
      object,
      ownEntityId(target.entityId),
      XRIFT_ANIMATION_RUNTIME_USER_DATA_KEY,
      isXriftAnimationRuntimeBridge,
      (bridge) => {
        const state = bridge.read();
        if (found.value || (target.componentId && state.componentId !== target.componentId)) return;
        if (target.property === "playing") {
          found.value = { kind: "bool", value: state.playing };
        } else if (target.property === "clip") {
          found.value = { kind: "float", value: state.clipIndex };
        } else if (target.property === "speed") {
          found.value = { kind: "float", value: state.speed };
        } else if (target.property === "time") {
          found.value = { kind: "float", value: state.time };
        }
      },
    );
    return found.value;
  };

  const applyLight = (target: Object3D, action: XriftInteractionAction) => {
    forEachOwnedBridge(
      target,
      ownEntityId(action.entityId),
      XRIFT_LIGHT_RUNTIME_USER_DATA_KEY,
      isLightBridge,
      (bridge) => {
        const state = bridge.read();
        if (action.componentId && state.componentId !== action.componentId) return;
        const next: XriftLightRuntimeOverrides = {
          ...(lightOverrides.get(bridge) ?? {}),
        };
        if (action.property === "enabled") {
          next.enabled =
            action.mode === "toggle"
              ? !state.enabled
              : action.value?.kind === "bool"
                ? action.value.value
                : state.enabled;
        } else if (
          action.property === "intensity" &&
          action.value?.kind === "float"
        ) {
          next.intensity = action.value.value;
        } else if (action.property === "color" && action.value?.kind === "color") {
          next.color = linearColor(action.value.value);
        } else {
          return;
        }
        lightOverrides.set(bridge, next);
        bridge.setOwner(owner, order, componentId, next);
      },
    );
  };

  const applyAudioSource = (target: Object3D, action: XriftInteractionAction) => {
    forEachOwnedBridge(
      target,
      ownEntityId(action.entityId),
      XRIFT_AUDIO_SOURCE_RUNTIME_USER_DATA_KEY,
      isAudioSourceBridge,
      (bridge) => {
        const state = bridge.read();
        if (action.componentId && state.componentId !== action.componentId) return;
        if (action.property === "playback") {
          if (action.value?.kind !== "enum") return;
          commandRevision += 1;
          const type =
            action.value.value === "pause"
              ? "pause"
              : action.value.value === "stop"
                ? "stop"
                : "play";
          // The bridge resolves an autoplay refusal as false rather than
          // rejecting; a trigger has nowhere to report it, so it is dropped.
          void bridge.command(owner, order, componentId, {
            type,
            revision: commandRevision,
          });
          return;
        }
        const next: XriftAudioSourceRuntimeOverrides = {
          ...(audioOverrides.get(bridge) ?? {}),
        };
        if (action.property === "volume" && action.value?.kind === "float") {
          next.volume = action.value.value;
        } else if (action.property === "loop") {
          next.loop =
            action.mode === "toggle"
              ? !state.loop
              : action.value?.kind === "bool"
                ? action.value.value
                : state.loop;
        } else {
          return;
        }
        audioOverrides.set(bridge, next);
        bridge.setOwner(owner, order, componentId, next);
      },
    );
  };

  const readEntity = (
    object: Object3D,
    property: string,
  ): XriftInteractionValue | null =>
    property === "enabled" ? { kind: "bool", value: object.visible } : null;

  const readLight = (
    object: Object3D,
    target: { entityId: string; componentId: string | null; property: string },
  ): XriftInteractionValue | null => {
    // A callback cannot return through `forEachOwnedBridge`, and a plain `let`
    // would be narrowed back to `null` by the time it is read.
    const found: { value: XriftInteractionValue | null } = { value: null };
    forEachOwnedBridge(
      object,
      ownEntityId(target.entityId),
      XRIFT_LIGHT_RUNTIME_USER_DATA_KEY,
      isLightBridge,
      (bridge) => {
        const state = bridge.read();
        if (found.value || (target.componentId && state.componentId !== target.componentId)) return;
        if (target.property === "enabled") {
          found.value = { kind: "bool", value: state.enabled };
        } else if (target.property === "intensity") {
          found.value = { kind: "float", value: state.intensity };
        } else if (target.property === "color") {
          const color = new Color(state.color);
          found.value = { kind: "color", value: [color.r, color.g, color.b] };
        }
      },
    );
    return found.value;
  };

  const readAudioSource = (
    object: Object3D,
    target: { entityId: string; componentId: string | null; property: string },
  ): XriftInteractionValue | null => {
    const found: { value: XriftInteractionValue | null } = { value: null };
    forEachOwnedBridge(
      object,
      ownEntityId(target.entityId),
      XRIFT_AUDIO_SOURCE_RUNTIME_USER_DATA_KEY,
      isAudioSourceBridge,
      (bridge) => {
        const state = bridge.read();
        if (found.value || (target.componentId && state.componentId !== target.componentId)) return;
        if (target.property === "volume") {
          found.value = { kind: "float", value: state.volume };
        } else if (target.property === "loop") {
          found.value = { kind: "bool", value: state.loop };
        } else if (target.property === "playback") {
          found.value = { kind: "enum", value: state.playback };
        }
      },
    );
    return found.value;
  };

  const forEachAnimationBridge = (
    entityId: string,
    visit: (bridge: XriftAnimationRuntimeBridge) => void,
  ): void => {
    const object = findEntityObject(root, ownEntityId(entityId));
    if (!object) return;
    forEachOwnedBridge(
      object,
      ownEntityId(entityId),
      XRIFT_ANIMATION_RUNTIME_USER_DATA_KEY,
      isXriftAnimationRuntimeBridge,
      (bridge) => {
        animationOwners.add(bridge);
        visit(bridge);
      },
    );
  };

  return {
    playClip(entityId, request) {
      forEachAnimationBridge(entityId, (bridge) => {
        bridge.command(owner, order, componentId, {
          type: "play-clip",
          clipIndex: request.clipIndex,
          loop: request.loop,
          speed: request.speed,
          time: request.fromSeconds,
        });
      });
    },
    stopClip(entityId, clipIndex) {
      forEachAnimationBridge(entityId, (bridge) => {
        bridge.command(owner, order, componentId, {
          type: "stop-clip",
          clipIndex,
        });
      });
    },
    read(target) {
      if (target.targetKind === "scene") return readScene(target.property);
      const object = findEntityObject(root, ownEntityId(target.entityId));
      if (!object) return null;
      if (target.targetKind === "entity") return readEntity(object, target.property);
      if (target.targetKind === "transform") {
        return readTransform(object, target.property);
      }
      if (target.targetKind === "animation") {
        return readAnimation(object, target);
      }
      if (target.targetKind === "particle") {
        return readParticle(object, target);
      }
      if (target.targetKind === "material") {
        return readMaterial(object, target);
      }
      if (target.targetKind === "text") return readText(object, target);
      if (target.targetKind === "light") return readLight(object, target);
      return readAudioSource(object, target);
    },
    apply(action) {
      // The interpreter evaluates a wired socket and hands this a concrete
      // value, so a linked action only ever arrives from the static walk -
      // where it exists to record what the action writes to, not to be run.
      if (action.value?.kind === "linked") return;
      if (action.target === "scene") {
        applyScene(action);
        return;
      }
      if (action.target === "player") {
        applyPlayer(action);
        return;
      }
      const target = findEntityObject(root, ownEntityId(action.entityId));
      if (!target) return;
      if (action.target === "entity") {
        applyEntity(target, action);
        return;
      }
      if (action.target === "transform") {
        applyTransform(target, action);
        return;
      }
      if (action.target === "animation") {
        applyAnimation(target, action);
        return;
      }
      if (action.target === "particle") {
        applyParticle(target, action);
        return;
      }
      if (action.target === "material") {
        applyMaterial(target, action);
        return;
      }
      if (action.target === "text") {
        applyText(target, action);
        return;
      }
      if (action.target === "light") {
        applyLight(target, action);
        return;
      }
      applyAudioSource(target, action);
    },
    share(action) {
      const bridge = findXriftInstanceStateRuntimeBridge(root);
      // No bridge means no room to tell: an Item preview, or a Scene View that
      // is not running. The local write already happened, so nothing is lost.
      if (!bridge) return;
      if (!action.value || action.value.kind === "linked") return;
      bridge.send(
        xriftSharedActionStateId({
          // Resolved, not the sentinel: `__xrift_self__` names a different
          // Entity in every graph that uses it, and one id must mean one thing.
          entityId: ownEntityId(action.entityId),
          componentId: action.componentId,
          targetKind: action.target,
          property: action.property,
        }),
        { value: action.value },
      );
    },
    dispose() {
      // Overrides are runtime-only, exactly like a Script's: leaving them
      // applied after Stop would show values the document never had.
      for (const bridge of animationOwners) bridge.removeOwner(owner);
      animationOwners.clear();
      for (const bridge of sceneOwners) bridge.removeOwner(owner);
      sceneOwners.clear();
      for (const bridge of textOwners) bridge.removeOwner(owner);
      textOwners.clear();
      for (const bridge of particleOverrides.keys()) bridge.removeOwner(owner);
      particleOverrides.clear();
      for (const [mesh, original] of materialRestores) {
        const owned = mesh.material;
        mesh.material = original;
        for (const entry of Array.isArray(owned) ? owned : [owned]) {
          entry.dispose();
        }
      }
      materialRestores.clear();
      for (const bridge of lightOverrides.keys()) bridge.removeOwner(owner);
      for (const bridge of audioOverrides.keys()) bridge.removeOwner(owner);
      lightOverrides.clear();
      audioOverrides.clear();
      for (const [object, original] of restorePoints) {
        object.visible = original.visible;
        object.position.set(...original.position);
        object.rotation.set(...original.rotation);
        object.scale.set(...original.scale);
      }
      restorePoints.clear();
    },
  };
}

/** Reads one live property value into the engine's representation. */
function toInteractivityValue(
  kind: string,
  value: XriftInteractionValue,
  options: readonly { value: string; label: string }[],
): InteractivityValue | null {
  if (value.kind === "bool") return boolValue(value.value);
  if (value.kind === "float") return floatValue(value.value);
  if (value.kind === "color" || value.kind === "vector3") {
    return vectorValue([...value.value]);
  }
  if (value.kind === "enum") {
    const index = options.findIndex((option) => option.value === value.value);
    return intValue(index < 0 ? 0 : index);
  }
  void kind;
  return null;
}

/**
 * Narrows an engine value to what one property accepts.
 *
 * KHR_interactivity has no string type, so an enum arrives as the option index
 * and is resolved against the property's own option list here — the same list
 * the Editor's picker shows, so the two cannot disagree.
 */
/**
 * The engine's value in the shape the property takes, inside its legal range.
 *
 * The range matters because a write does not have to come from a slider: a
 * computed value, or an easing that deliberately passes its target and comes
 * back, can land outside what the property accepts. Clamping here keeps that
 * one node's overshoot from becoming a negative opacity or a mirrored scale.
 * Position and rotation have no declared range and are left alone.
 */
function toInteractionValue(
  descriptor: XriftInteractionPropertyDescriptor,
  value: InteractivityValue,
): XriftInteractionValue | null {
  const options = descriptor.options ?? [];
  const bounded = (entry: number, low?: number, high?: number): number => {
    if (!Number.isFinite(entry)) return low ?? 0;
    if (low !== undefined && entry < low) return low;
    if (high !== undefined && entry > high) return high;
    return entry;
  };
  switch (descriptor.kind) {
    case "bool":
      return { kind: "bool", value: asBoolean(value) };
    case "float":
      return {
        kind: "float",
        value: bounded(asNumber(value), descriptor.min, descriptor.max),
      };
    case "color": {
      const [red, green, blue] = asNumbers(value, 3);
      return {
        kind: "color",
        value: [
          bounded(red ?? 0, 0, 1),
          bounded(green ?? 0, 0, 1),
          bounded(blue ?? 0, 0, 1),
        ],
      };
    }
    case "vector3": {
      const [x, y, z] = asNumbers(value, 3);
      return {
        kind: "vector3",
        value: [bounded(x ?? 0), bounded(y ?? 0), bounded(z ?? 0)],
      };
    }
    case "enum": {
      const index = Math.trunc(asNumber(value));
      const option = options[Math.min(Math.max(index, 0), options.length - 1)];
      return option ? { kind: "enum", value: option.value } : null;
    }
    default:
      return null;
  }
}

/**
 * The world a trigger graph can see and change.
 *
 * Every write goes through the same applier the previous static trigger used,
 * so a graph and a Script that touch one Component still compose through the
 * existing runtime bridges instead of fighting over the object.
 */
export function createXriftInteractionHost(
  applier: XriftInteractionApplier,
): InteractivityHost {
  const descriptorFor = (target: InteractivityActionTarget) =>
    getXriftInteractionProperty(target.targetKind, target.property);

  return {
    /**
     * `animation/start` plays a clip on the Entity this graph is attached to.
     *
     * The graph names a clip by index, which is what the specification's
     * operation carries, and the Entity is the owner — the same rule an action
     * with no explicit target follows. Several of these run at once, so a Model
     * whose clips are meant to play together can have all of them started.
     *
     * `endTime` decides the loop: the specification's「最後まで再生して終わる」
     * is a bounded play, and a clip with no end is one an author wants to keep
     * going. That is also what a Model full of gulls and waves wants by
     * default, and the engine still sends `done` for the bounded case.
     */
    startAnimation(request) {
      applier.playClip(XRIFT_INTERACTION_SELF_ENTITY_ID, {
        clipIndex: request.animationIndex,
        loop: request.endTime === null,
        speed: request.speed,
        fromSeconds: request.startTime,
      });
    },
    stopAnimation(request) {
      applier.stopClip(XRIFT_INTERACTION_SELF_ENTITY_ID, request.animationIndex);
    },
    readProperty(target) {
      const descriptor = descriptorFor(target);
      if (!descriptor) return null;
      const current = applier.read({
        entityId: target.entityId,
        componentId: target.componentId,
        targetKind: descriptor.target,
        property: target.property,
      });
      if (!current) return null;
      return toInteractivityValue(descriptor.kind, current, descriptor.options ?? []);
    },
    emitEvent(name, payload) {
      const values = new Map<string, readonly (number | boolean)[]>();
      for (const [key, entry] of payload) values.set(key, entry.data);
      emitXriftSceneEvent(name, values);
    },
    /**
     * Points an Asset-valued property at another Asset for this viewer only.
     *
     * The applier still owns the write, so it composes with everything else a
     * graph or a Script has changed and comes off on Stop like the rest.
     */
    writeAsset(target, assetId) {
      const descriptor = descriptorFor(target);
      if (!descriptor || descriptor.kind !== "asset") return false;
      applier.apply({
        nodeIndex: -1,
        mode: "set",
        entityId: target.entityId,
        componentId: target.componentId,
        target: descriptor.target,
        property: target.property,
        value: { kind: "asset", value: assetId },
        shared: target.shared === true,
      });
      return true;
    },
    writeString(target, text) {
      const descriptor = descriptorFor(target);
      if (!descriptor || descriptor.kind !== "string") return false;
      applier.apply({
        nodeIndex: -1,
        mode: "set",
        entityId: target.entityId,
        componentId: target.componentId,
        target: descriptor.target,
        property: target.property,
        value: { kind: "string", value: text },
        shared: target.shared === true,
      });
      return true;
    },
    writeProperty(target, value) {
      const descriptor = descriptorFor(target);
      if (!descriptor) return false;
      const next = toInteractionValue(descriptor, value);
      if (!next) return false;
      const action = {
        nodeIndex: -1,
        mode: "set" as const,
        entityId: target.entityId,
        componentId: target.componentId,
        target: descriptor.target,
        property: target.property,
        value: next,
        shared: target.shared === true,
      };
      // Applied here as well as broadcast: the person who pressed should not
      // wait for a round trip to see their own button work, and the value they
      // send is the one everyone converges on anyway.
      applier.apply(action);
      if (target.shared) applier.share(action);
      return true;
    },
  };
}

export type XriftInteractionTriggerRuntimeProps = {
  /** Entity the graph is attached to; the one whose interaction starts it. */
  entityId: string;
  /** Canonical `KHR_interactivity` extension object of the bound graph. */
  graph: unknown;
  /** Component id, so two triggers on one Entity stay distinguishable. */
  componentId?: string;
  /** Override composition order, matching how Script Components are ordered. */
  order?: number;
  /**
   * Whether the graph is allowed to run.
   *
   * A published world is always running; Studio passes its Play state, because
   * a graph that started on `event/onStart` while the author was still editing
   * would change the Scene View out from under them.
   */
  playing?: boolean;
};

export function XriftInteractionTriggerRuntime({
  entityId,
  graph,
  componentId = "interaction-trigger",
  order = 0,
  playing = true,
}: XriftInteractionTriggerRuntimeProps) {
  const scene = useThree((state) => state.scene);
  const applier = useMemo(
    () =>
      createXriftInteractionApplier({
        root: scene,
        componentId,
        order,
        selfEntityId: entityId,
      }),
    [componentId, entityId, order, scene],
  );
  const host = useMemo(() => createXriftInteractionHost(applier), [applier]);
  /**
   * One engine per graph in the Asset.
   *
   * An Asset can hold several graphs, and the point of holding several is that
   * they compose: one waits, another reacts to what it announced. Running only
   * the document's default graph would make every other graph in the file
   * inert, which is not what an author who made a second graph asked for.
   */
  const engines = useMemo(() => {
    if (!playing) return [];
    const parsed = parseInteractivityExtension(graph);
    // Events are dispatched by this component rather than inside each engine,
    // so a receiver in the sending graph runs exactly once.
    const pending: string[] = [];
    const created = parsed.graphs.map(
      (candidate) =>
        new InteractivityEngine(
          graph,
          {
            ...host,
            emitEvent: (name, payload) => {
              pending.push(name);
              host.emitEvent?.(name, payload);
            },
          },
          { graphIndex: candidate.index, localEventDelivery: false },
        ),
    );
    return created.map((engine) => ({ engine, pending, all: created }));
  }, [graph, host, playing]);

  useEffect(() => () => applier.dispose(), [applier]);

  useEffect(() => {
    if (engines.length === 0) return;
    // `event/onStart` is what makes a graph a timeline rather than only a
    // reaction: the same Asset can wait, repeat and finish on its own.
    for (const entry of engines) entry.engine.start();
    return () => {
      for (const entry of engines) entry.engine.dispose();
      applier.dispose();
    };
  }, [applier, engines]);

  useFrame((_state, delta) => {
    const first = engines[0];
    if (!first) return;
    for (const entry of engines) entry.engine.update(delta);
    // Delivered after the frame's own work so a send cannot recurse into the
    // activation that produced it.
    if (first.pending.length === 0) return;
    const names = first.pending.splice(0, first.pending.length);
    for (const name of names) {
      for (const entry of engines) entry.engine.receiveEvent(name);
    }
  });

  useEffect(() => {
    if (engines.length === 0) return;
    return subscribeXriftInteraction(entityId, () => {
      for (const entry of engines) entry.engine.interact();
    });
  }, [engines, entityId]);

  /*
   * What the room already agrees on, and what it agrees on next.
   *
   * A shared action is applied here rather than by re-running the graph: the
   * flow belongs to the person who pressed, and replaying it on every viewer
   * would fire everything else that flow does - a sound, a second write, a
   * delay - once per person in the room.
   *
   * The same path serves a late joiner, which is the whole reason the value
   * travels as state rather than as an event: a door opened before someone
   * arrived is still open when they walk in.
   */
  const sharedActions = useMemo(() => {
    const byStateId = new Map<string, XriftInteractionAction>();
    for (const action of collectXriftInteractionActions(graph)) {
      if (!action.shared) continue;
      byStateId.set(
        xriftSharedActionStateId({
          entityId: resolveXriftInteractionEntityId(action.entityId, entityId),
          componentId: action.componentId,
          targetKind: action.target,
          property: action.property,
        }),
        action,
      );
    }
    return byStateId;
  }, [entityId, graph]);

  useEffect(() => {
    if (!playing || sharedActions.size === 0) return;
    const bridge = findXriftInstanceStateRuntimeBridge(scene);
    if (!bridge) return;
    const applyShared = (stateId: string, payload: { value: unknown }) => {
      const action = sharedActions.get(stateId);
      if (!action) return;
      const value = payload.value as XriftInteractionAction["value"];
      if (!value || value.kind === "linked") return;
      // The arriving value, not the authored one: a toggle that flipped to
      // `true` has to land as `true` everywhere, or each viewer flips its own
      // copy and the room ends up in two states.
      applier.apply({ ...action, mode: "set", value });
    };
    for (const [stateId, payload] of bridge.entries()) {
      applyShared(stateId, payload);
    }
    return bridge.subscribe(applyShared);
  }, [applier, playing, scene, sharedActions]);

  return null;
}
