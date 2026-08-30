import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Color, LinearSRGBColorSpace, MathUtils, type Object3D } from "three";
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
  getXriftInteractionProperty,
  type XriftInteractionAction,
  type XriftInteractionTargetKind,
  type XriftInteractionValue,
} from "./interaction-trigger.js";
import { InteractivityEngine } from "../interactivity/engine.js";
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
  /** Live value of one property, so a graph can toggle or ramp from it. */
  read(target: {
    entityId: string;
    componentId: string | null;
    targetKind: XriftInteractionTargetKind;
    property: string;
  }): XriftInteractionValue | null;
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
}: {
  root: Object3D;
  componentId: string;
  order: number;
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

  const applyAnimation = (target: Object3D, action: XriftInteractionAction) => {
    forEachOwnedBridge(
      target,
      action.entityId,
      XRIFT_ANIMATION_RUNTIME_USER_DATA_KEY,
      isXriftAnimationRuntimeBridge,
      (bridge) => {
        const state = bridge.read();
        if (state.componentId !== action.componentId) return;
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
      target.entityId,
      XRIFT_ANIMATION_RUNTIME_USER_DATA_KEY,
      isXriftAnimationRuntimeBridge,
      (bridge) => {
        const state = bridge.read();
        if (found.value || state.componentId !== target.componentId) return;
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
      action.entityId,
      XRIFT_LIGHT_RUNTIME_USER_DATA_KEY,
      isLightBridge,
      (bridge) => {
        const state = bridge.read();
        if (state.componentId !== action.componentId) return;
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
      action.entityId,
      XRIFT_AUDIO_SOURCE_RUNTIME_USER_DATA_KEY,
      isAudioSourceBridge,
      (bridge) => {
        const state = bridge.read();
        if (state.componentId !== action.componentId) return;
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
      target.entityId,
      XRIFT_LIGHT_RUNTIME_USER_DATA_KEY,
      isLightBridge,
      (bridge) => {
        const state = bridge.read();
        if (found.value || state.componentId !== target.componentId) return;
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
      target.entityId,
      XRIFT_AUDIO_SOURCE_RUNTIME_USER_DATA_KEY,
      isAudioSourceBridge,
      (bridge) => {
        const state = bridge.read();
        if (found.value || state.componentId !== target.componentId) return;
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

  return {
    read(target) {
      const object = findEntityObject(root, target.entityId);
      if (!object) return null;
      if (target.targetKind === "entity") return readEntity(object, target.property);
      if (target.targetKind === "transform") {
        return readTransform(object, target.property);
      }
      if (target.targetKind === "animation") {
        return readAnimation(object, target);
      }
      if (target.targetKind === "light") return readLight(object, target);
      return readAudioSource(object, target);
    },
    apply(action) {
      const target = findEntityObject(root, action.entityId);
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
      if (action.target === "light") {
        applyLight(target, action);
        return;
      }
      applyAudioSource(target, action);
    },
    dispose() {
      // Overrides are runtime-only, exactly like a Script's: leaving them
      // applied after Stop would show values the document never had.
      for (const bridge of animationOwners) bridge.removeOwner(owner);
      animationOwners.clear();
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
function toInteractionValue(
  kind: string,
  options: readonly { value: string; label: string }[],
  value: InteractivityValue,
): XriftInteractionValue | null {
  switch (kind) {
    case "bool":
      return { kind: "bool", value: asBoolean(value) };
    case "float":
      return { kind: "float", value: asNumber(value) };
    case "color": {
      const [red, green, blue] = asNumbers(value, 3);
      return { kind: "color", value: [red ?? 0, green ?? 0, blue ?? 0] };
    }
    case "vector3": {
      const [x, y, z] = asNumbers(value, 3);
      return { kind: "vector3", value: [x ?? 0, y ?? 0, z ?? 0] };
    }
    case "enum": {
      const index = Math.trunc(asNumber(value));
      const option = options[index];
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
    writeProperty(target, value) {
      const descriptor = descriptorFor(target);
      if (!descriptor) return false;
      const next = toInteractionValue(descriptor.kind, descriptor.options ?? [], value);
      if (!next) return false;
      applier.apply({
        nodeIndex: -1,
        mode: "set",
        entityId: target.entityId,
        componentId: target.componentId,
        target: descriptor.target,
        property: target.property,
        value: next,
      });
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
    () => createXriftInteractionApplier({ root: scene, componentId, order }),
    [componentId, order, scene],
  );
  const host = useMemo(() => createXriftInteractionHost(applier), [applier]);
  const engine = useMemo(
    () => (playing ? new InteractivityEngine(graph, host) : null),
    [graph, host, playing],
  );

  useEffect(() => () => applier.dispose(), [applier]);

  useEffect(() => {
    if (!engine) return;
    // `event/onStart` is what makes a graph a timeline rather than only a
    // reaction: the same Asset can wait, repeat and finish on its own.
    engine.start();
    return () => {
      engine.dispose();
      applier.dispose();
    };
  }, [applier, engine]);

  useFrame((_state, delta) => {
    engine?.update(delta);
  });

  useEffect(() => {
    if (!engine) return;
    return subscribeXriftInteraction(entityId, () => engine.interact());
  }, [engine, entityId]);

  return null;
}
