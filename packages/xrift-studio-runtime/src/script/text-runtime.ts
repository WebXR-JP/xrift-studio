/**
 * Runtime overrides for a Text panel.
 *
 * A Text Component is typeset from one config object, so「押したら文字が変わる」
 * has nowhere to land unless something can change that object without editing
 * the Scene. This is that something: the same owner-ordered bridge Light,
 * Particle and Audio Source already use, parked on the panel object so a
 * behavior graph or a Script can find it through the Entity it belongs to.
 *
 * Overrides are runtime-only. Stop, a restart or a failure removes the owner
 * and the panel goes back to the authored text, exactly like every other
 * bridge — nothing here is ever written to the document.
 */

import type { XriftTextPanelConfig } from "../text-panel-layout.js";

export const XRIFT_TEXT_RUNTIME_USER_DATA_KEY = "xriftTextRuntime" as const;

/**
 * The fields a graph or Script may change while a world runs.
 *
 * Deliberately not the whole config: the anchor, the background plate and the
 * font file decide the panel's geometry and its loaded resources, and changing
 * those per viewer is a different feature from re-lettering a sign.
 */
export type XriftTextRuntimeOverrides = {
  enabled?: boolean;
  text?: string;
  color?: string;
  fontSize?: number;
  fontWeight?: number;
  outlineWidth?: number;
  outlineColor?: string;
  letterSpacing?: number;
  lineHeight?: number;
  maxWidth?: number;
  textAlign?: XriftTextPanelConfig["textAlign"];
  /** Catalog font id. `auto` puts the automatic face back. */
  fontId?: string;
};

export type XriftTextRuntimeState = {
  readonly revision: number;
  readonly componentId: string | null;
  readonly enabled: boolean | null;
  readonly overrides: Readonly<XriftTextRuntimeOverrides>;
};

export type XriftTextRuntimeBridge = {
  setOwner(
    owner: object,
    order: number,
    key: string,
    overrides: XriftTextRuntimeOverrides,
  ): void;
  removeOwner(owner: object): void;
  read(): Readonly<XriftTextRuntimeState>;
};

export function createXriftTextRuntimeBridge(
  componentId: string | null,
): XriftTextRuntimeBridge {
  const owners = new Map<
    object,
    { order: number; key: string; overrides: XriftTextRuntimeOverrides }
  >();
  let state: XriftTextRuntimeState = {
    revision: 0,
    componentId,
    enabled: null,
    overrides: {},
  };

  const resolve = (): void => {
    const merged: XriftTextRuntimeOverrides = {};
    const ordered = [...owners.values()].sort(
      (left, right) =>
        left.order - right.order || left.key.localeCompare(right.key),
    );
    // Later owners win field by field, so two Scripts changing different parts
    // of one sign compose instead of the second erasing the first.
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

export function isXriftTextRuntimeBridge(
  value: unknown,
): value is XriftTextRuntimeBridge {
  const candidate = value as XriftTextRuntimeBridge | null;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof candidate.setOwner === "function" &&
    typeof candidate.removeOwner === "function" &&
    typeof candidate.read === "function"
  );
}

/**
 * The config the panel should typeset, after this viewer's overrides.
 *
 * An absent override leaves the authored field alone, which is what lets a
 * graph change only the colour of a sign whose text an author is still editing.
 */
export function applyXriftTextRuntimeOverrides(
  config: XriftTextPanelConfig,
  overrides: Readonly<XriftTextRuntimeOverrides>,
): XriftTextPanelConfig {
  const keys = Object.keys(overrides);
  if (keys.length === 0) return config;
  const next: XriftTextPanelConfig = { ...config };
  if (overrides.text !== undefined) next.text = overrides.text;
  if (overrides.color !== undefined) next.color = overrides.color;
  if (overrides.fontSize !== undefined) {
    next.fontSize = Math.max(0.001, overrides.fontSize);
  }
  if (overrides.fontWeight !== undefined) {
    next.fontWeight = Math.min(900, Math.max(100, overrides.fontWeight));
  }
  if (overrides.outlineWidth !== undefined) {
    next.outlineWidth = Math.max(0, overrides.outlineWidth);
  }
  if (overrides.outlineColor !== undefined) {
    next.outlineColor = overrides.outlineColor;
  }
  if (overrides.letterSpacing !== undefined) {
    next.letterSpacing = overrides.letterSpacing;
  }
  if (overrides.lineHeight !== undefined) {
    next.lineHeight = Math.max(0.1, overrides.lineHeight);
  }
  if (overrides.maxWidth !== undefined) {
    // 0 means「折り返さない」rather than a zero-width column, which would
    // typeset one character per line.
    next.maxWidth = overrides.maxWidth > 0 ? overrides.maxWidth : undefined;
  }
  if (overrides.textAlign !== undefined) next.textAlign = overrides.textAlign;
  if (overrides.fontId !== undefined) {
    // A catalog id replaces the catalog choice; the imported font file wins
    // over both, so switching faces means dropping it for this viewer.
    next.fontId = overrides.fontId;
    next.fontUrl = undefined;
  }
  return next;
}
