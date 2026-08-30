/**
 * Scene-wide state a behavior graph can change, and the named events it sends.
 *
 * Exposure and a full-screen fade belong to no Entity, so they cannot go
 * through the per-Entity bridges the other targets use. They are held here, on
 * one bridge attached to the Scene root, and applied by a component both Studio
 * Play and a published world mount.
 *
 * They are owner-ordered overrides rather than commands on purpose: a fade is a
 * state, so releasing the trigger that set it puts the authored look back —
 * which is what Play Stop has to do.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  Color,
  LinearSRGBColorSpace,
  type Mesh,
  type MeshBasicMaterial,
  type Object3D,
  type PerspectiveCamera,
} from "three";

export const XRIFT_SCENE_RUNTIME_USER_DATA_KEY = "xriftSceneRuntime" as const;

export type XriftSceneRuntimeOverrides = {
  /** Absolute tone-mapping exposure. Undefined leaves the authored value. */
  exposure?: number;
  /** 0 shows the world, 1 covers it completely. */
  fade?: number;
  /** Linear-light RGB of the covering colour. */
  fadeColor?: readonly [number, number, number];
};

export type XriftSceneRuntimeState = {
  readonly revision: number;
  readonly exposure: number | null;
  readonly fade: number;
  readonly fadeColor: readonly [number, number, number];
};

export type XriftSceneRuntimeBridge = {
  setOwner(
    owner: object,
    order: number,
    key: string,
    overrides: XriftSceneRuntimeOverrides,
  ): void;
  removeOwner(owner: object): void;
  read(): Readonly<XriftSceneRuntimeState>;
};

const IDLE_STATE: XriftSceneRuntimeState = {
  revision: 0,
  exposure: null,
  fade: 0,
  fadeColor: [1, 1, 1],
};

export function createXriftSceneRuntimeBridge(): XriftSceneRuntimeBridge {
  const owners = new Map<
    object,
    { order: number; key: string; overrides: XriftSceneRuntimeOverrides }
  >();
  let state = IDLE_STATE;

  const resolve = (): void => {
    let exposure: number | null = null;
    let fade = 0;
    let fadeColor: readonly [number, number, number] = [1, 1, 1];
    const ordered = [...owners.values()].sort(
      (left, right) =>
        left.order - right.order || left.key.localeCompare(right.key),
    );
    for (const owner of ordered) {
      if (owner.overrides.exposure !== undefined) {
        exposure = Math.min(16, Math.max(0, owner.overrides.exposure));
      }
      if (owner.overrides.fade !== undefined) {
        fade = Math.min(1, Math.max(0, owner.overrides.fade));
      }
      if (owner.overrides.fadeColor !== undefined) {
        fadeColor = owner.overrides.fadeColor;
      }
    }
    state = { revision: state.revision + 1, exposure, fade, fadeColor };
  };

  return {
    setOwner(owner, order, key, overrides) {
      owners.set(owner, {
        order,
        key,
        overrides: { ...owners.get(owner)?.overrides, ...overrides },
      });
      resolve();
    },
    removeOwner(owner) {
      if (!owners.delete(owner)) return;
      resolve();
    },
    read() {
      return state;
    },
  };
}

export function isXriftSceneRuntimeBridge(
  value: unknown,
): value is XriftSceneRuntimeBridge {
  const candidate = value as XriftSceneRuntimeBridge | null;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof candidate.setOwner === "function" &&
    typeof candidate.removeOwner === "function" &&
    typeof candidate.read === "function"
  );
}

export function findXriftSceneRuntimeBridge(
  root: Object3D,
): XriftSceneRuntimeBridge | null {
  const candidate = (root.userData as Record<string, unknown>)[
    XRIFT_SCENE_RUNTIME_USER_DATA_KEY
  ];
  return isXriftSceneRuntimeBridge(candidate) ? candidate : null;
}

/**
 * A named event leaving a graph.
 *
 * A module-level bus for the same reason interactions use one: the sender and
 * whatever reacts to it are rendered far apart, and threading a callback
 * through the whole tree would make the two surfaces wire it differently.
 */
type XriftSceneEventHandler = (
  payload: ReadonlyMap<string, readonly (number | boolean)[]>,
) => void;

const sceneEventHandlers = new Map<string, Set<XriftSceneEventHandler>>();

export function subscribeXriftSceneEvent(
  name: string,
  handler: XriftSceneEventHandler,
): () => void {
  const existing = sceneEventHandlers.get(name) ?? new Set();
  existing.add(handler);
  sceneEventHandlers.set(name, existing);
  return () => {
    const current = sceneEventHandlers.get(name);
    if (!current) return;
    current.delete(handler);
    if (current.size === 0) sceneEventHandlers.delete(name);
  };
}

export function emitXriftSceneEvent(
  name: string,
  payload: ReadonlyMap<string, readonly (number | boolean)[]>,
): void {
  const handlers = sceneEventHandlers.get(name);
  if (!handlers) return;
  for (const handler of [...handlers]) handler(payload);
}

/**
 * Applies the Scene bridge every frame.
 *
 * Exposure is written per frame rather than in an effect because the compositor
 * also writes it whenever its settings change; the last writer each frame is
 * what the viewer sees, and a graph's exposure has to be that.
 */
export function XriftSceneRuntime({
  enabled = true,
}: {
  enabled?: boolean;
}) {
  const scene = useThree((state) => state.scene);
  const bridge = useMemo(() => createXriftSceneRuntimeBridge(), []);
  const fadeRef = useRef<Mesh>(null);
  const authoredExposure = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const holder = scene.userData as Record<string, unknown>;
    holder[XRIFT_SCENE_RUNTIME_USER_DATA_KEY] = bridge;
    return () => {
      delete holder[XRIFT_SCENE_RUNTIME_USER_DATA_KEY];
    };
  }, [bridge, enabled, scene]);

  useFrame(({ camera, gl, size }) => {
    const state = bridge.read();
    if (state.exposure === null) {
      if (authoredExposure.current !== null) {
        gl.toneMappingExposure = authoredExposure.current;
        authoredExposure.current = null;
      }
    } else {
      if (authoredExposure.current === null) {
        authoredExposure.current = gl.toneMappingExposure;
      }
      gl.toneMappingExposure = state.exposure;
    }

    const mesh = fadeRef.current;
    if (!mesh) return;
    const visible = state.fade > 0.001;
    mesh.visible = visible;
    if (!visible) return;
    const material = mesh.material as MeshBasicMaterial;
    material.opacity = state.fade;
    (material.color as Color).setRGB(
      state.fadeColor[0],
      state.fadeColor[1],
      state.fadeColor[2],
      LinearSRGBColorSpace,
    );
    // Parked just in front of the near plane and scaled to the frustum, so the
    // cover works at any field of view without a second render pass.
    const distance = 0.12;
    mesh.position.copy(camera.position);
    mesh.quaternion.copy(camera.quaternion);
    mesh.translateZ(-distance);
    const perspective = camera as PerspectiveCamera;
    const height = Number.isFinite(perspective.fov)
      ? 2 * distance * Math.tan(((perspective.fov ?? 60) * Math.PI) / 360)
      : distance * 2;
    const aspect = size.height === 0 ? 1 : size.width / size.height;
    mesh.scale.set(height * aspect * 1.2, height * 1.2, 1);
  });

  if (!enabled) return null;
  return (
    <mesh ref={fadeRef} renderOrder={10000} frustumCulled={false} visible={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        transparent
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
        opacity={0}
      />
    </mesh>
  );
}
