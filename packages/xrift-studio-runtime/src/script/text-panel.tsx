/**
 * React Three Fiber wrapper around the shared Text panel object.
 *
 * The editor viewport and the generated Classic source both mount this, while
 * the published runtime builds the same `XriftTextPanelObject` directly from
 * the runtime manifest. Nothing about the lettering or the plate is
 * reimplemented per surface.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Texture } from "three";

import {
  XriftTextPanelObject,
  type XriftTextPanelConfig,
} from "../text-panel.js";
import {
  applyXriftTextRuntimeOverrides,
  createXriftTextRuntimeBridge,
  XRIFT_TEXT_RUNTIME_USER_DATA_KEY,
} from "./text-runtime.js";

export type XriftTextPanelProps = {
  config: XriftTextPanelConfig;
  /** Decoded Texture for a `texture` background. The host owns its lifetime. */
  map?: Texture | null;
  /**
   * Directory the bundled font file is served from. Omitted uses Studio's own,
   * which is right everywhere except a published world; see
   * `XriftTextPanelConfig.fontDirectoryUrl`.
   */
  fontDirectoryUrl?: string;
  /**
   * Which Text Component this panel is, so a graph aimed at one of an Entity's
   * two signs does not re-letter both. Omitted leaves the panel addressable
   * only as「そのEntityのText」.
   */
  componentId?: string;
};

export function XriftTextPanel({
  config,
  map = null,
  fontDirectoryUrl,
  componentId,
}: XriftTextPanelProps) {
  const invalidate = useThree((state) => state.invalidate);
  const panel = useMemo(() => new XriftTextPanelObject(), []);
  /**
   * Runtime overrides, parked on the panel so a graph or a Script can find it
   * through the Entity. Both surfaces mount this component, so a sign that
   * changes in Play changes the same way in the published world.
   */
  const bridge = useMemo(
    () => createXriftTextRuntimeBridge(componentId ?? null),
    [componentId],
  );
  const appliedRevision = useRef<number | null>(null);
  // Callers commonly rebuild the config object every render. Re-typesetting on
  // each of those would restart troika's SDF work for text that has not
  // changed, so the effect keys off the value rather than the identity.
  const resolvedConfig =
    fontDirectoryUrl === undefined ? config : { ...config, fontDirectoryUrl };
  const configKey = JSON.stringify(resolvedConfig);

  useEffect(() => {
    panel.setLayoutListener(() => invalidate());
    return () => panel.setLayoutListener(null);
  }, [invalidate, panel]);

  useEffect(() => {
    const holder = panel.userData as Record<string, unknown>;
    holder[XRIFT_TEXT_RUNTIME_USER_DATA_KEY] = bridge;
    return () => {
      delete holder[XRIFT_TEXT_RUNTIME_USER_DATA_KEY];
    };
  }, [bridge, panel]);

  useEffect(() => {
    const state = bridge.read();
    appliedRevision.current = state.revision;
    panel.update(
      applyXriftTextRuntimeOverrides(resolvedConfig, state.overrides),
      map ?? null,
    );
    if (state.enabled !== null) panel.visible = state.enabled;
    // `config` is re-read through `configKey`; depending on it directly would
    // defeat the value comparison above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge, panel, configKey, map]);

  // A graph writes into the bridge rather than into React state, so nothing
  // re-renders when it does. Re-typesetting only on a revision change keeps
  // that from costing a troika sync every frame.
  useFrame(() => {
    const state = bridge.read();
    if (appliedRevision.current === state.revision) return;
    appliedRevision.current = state.revision;
    panel.update(
      applyXriftTextRuntimeOverrides(resolvedConfig, state.overrides),
      map ?? null,
    );
    panel.visible = state.enabled ?? true;
    invalidate();
  });

  useEffect(() => () => panel.dispose(), [panel]);

  return <primitive object={panel} />;
}
