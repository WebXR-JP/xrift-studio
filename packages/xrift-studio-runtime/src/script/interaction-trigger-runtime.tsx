import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { Color, LinearSRGBColorSpace, type Object3D } from "three";
import {
  XRIFT_AUDIO_SOURCE_RUNTIME_USER_DATA_KEY,
  type XriftAudioSourceRuntimeBridge,
  type XriftAudioSourceRuntimeOverrides,
} from "./audio-source.js";
import {
  XRIFT_LIGHT_RUNTIME_USER_DATA_KEY,
  type XriftLightRuntimeBridge,
  type XriftLightRuntimeOverrides,
} from "./light.js";
import {
  collectXriftInteractionPrograms,
  type XriftInteractionAction,
} from "./interaction-trigger.js";

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
    // Visibility only: physics bodies stay as authored, which is the same
    // meaning `enabled` has in the Editor viewport.
    target.visible =
      action.mode === "toggle"
        ? !target.visible
        : action.value?.kind === "bool"
          ? action.value.value
          : target.visible;
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

  return {
    apply(action) {
      const target = findEntityObject(root, action.entityId);
      if (!target) return;
      if (action.target === "entity") {
        applyEntity(target, action);
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
      for (const bridge of lightOverrides.keys()) bridge.removeOwner(owner);
      for (const bridge of audioOverrides.keys()) bridge.removeOwner(owner);
      lightOverrides.clear();
      audioOverrides.clear();
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
};

export function XriftInteractionTriggerRuntime({
  entityId,
  graph,
  componentId = "interaction-trigger",
  order = 0,
}: XriftInteractionTriggerRuntimeProps) {
  const scene = useThree((state) => state.scene);
  const programs = useMemo(
    () => collectXriftInteractionPrograms(graph),
    [graph],
  );
  const applier = useMemo(
    () => createXriftInteractionApplier({ root: scene, componentId, order }),
    [componentId, order, scene],
  );

  useEffect(() => () => applier.dispose(), [applier]);

  useEffect(() => {
    if (programs.length === 0) return;
    return subscribeXriftInteraction(entityId, () => {
      for (const program of programs) {
        for (const action of program.actions) applier.apply(action);
      }
    });
  }, [applier, entityId, programs]);

  return null;
}
