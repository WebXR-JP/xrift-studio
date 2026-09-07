/**
 * Runtime overrides for an Image quad.
 *
 * An Image Component is drawn from one config object, so「押したら写真が
 * 消える」or a fade has nowhere to land unless something can change that
 * object without editing the Scene. This is that something: the same
 * owner-ordered bridge Text, Light, Particle and Audio Source use, parked on
 * the quad object so a behavior graph can find it through the Entity it
 * belongs to.
 *
 * Overrides are runtime-only. Stop, a restart or a failure removes the owner
 * and the picture goes back to the authored look, exactly like every other
 * bridge — nothing here is ever written to the document.
 */

import type { XriftImageQuadConfig } from "../image-quad-layout.js";

export const XRIFT_IMAGE_RUNTIME_USER_DATA_KEY = "xriftImageRuntime" as const;

/**
 * The fields a graph may change while a world runs.
 *
 * Deliberately not the whole config: the size, the anchor and the picture
 * itself decide the quad's geometry and its loaded resources. Swapping the
 * picture per viewer is a different feature — it needs a texture loader that
 * knows the world's decoders — and is not offered until it can be done through
 * the same path on every surface.
 */
export type XriftImageRuntimeOverrides = {
  enabled?: boolean;
  color?: string;
  opacity?: number;
};

export type XriftImageRuntimeState = {
  readonly revision: number;
  readonly componentId: string | null;
  readonly enabled: boolean | null;
  readonly overrides: Readonly<XriftImageRuntimeOverrides>;
};

export type XriftImageRuntimeBridge = {
  setOwner(
    owner: object,
    order: number,
    key: string,
    overrides: XriftImageRuntimeOverrides,
  ): void;
  removeOwner(owner: object): void;
  read(): Readonly<XriftImageRuntimeState>;
};

export function createXriftImageRuntimeBridge(
  componentId: string | null,
): XriftImageRuntimeBridge {
  const owners = new Map<
    object,
    { order: number; key: string; overrides: XriftImageRuntimeOverrides }
  >();
  let state: XriftImageRuntimeState = {
    revision: 0,
    componentId,
    enabled: null,
    overrides: {},
  };

  const resolve = (): void => {
    const merged: XriftImageRuntimeOverrides = {};
    const ordered = [...owners.values()].sort(
      (left, right) =>
        left.order - right.order || left.key.localeCompare(right.key),
    );
    // Later owners win field by field, so two graphs changing different parts
    // of one picture compose instead of the second erasing the first.
    for (const owner of ordered) Object.assign(merged, owner.overrides);
    const { enabled = null, ...rest } = merged;
    state = {
      revision: state.revision + 1,
      componentId,
      enabled,
      overrides: rest,
    };
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

export function isXriftImageRuntimeBridge(
  value: unknown,
): value is XriftImageRuntimeBridge {
  const candidate = value as XriftImageRuntimeBridge | null;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof candidate.setOwner === "function" &&
    typeof candidate.removeOwner === "function" &&
    typeof candidate.read === "function"
  );
}

/**
 * The config the quad should draw, after this viewer's overrides.
 *
 * An absent override leaves the authored field alone, which is what lets a
 * graph fade a picture whose tint an author is still editing.
 */
export function applyXriftImageRuntimeOverrides(
  config: XriftImageQuadConfig,
  overrides: Readonly<XriftImageRuntimeOverrides>,
): XriftImageQuadConfig {
  if (Object.keys(overrides).length === 0) return config;
  const next: XriftImageQuadConfig = { ...config };
  if (overrides.color !== undefined) next.color = overrides.color;
  if (overrides.opacity !== undefined) {
    next.opacity = Math.min(1, Math.max(0, overrides.opacity));
  }
  return next;
}
