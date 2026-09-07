/**
 * React Three Fiber wrapper around the shared Image quad object.
 *
 * The editor viewport and the generated Classic source both mount this, while
 * the published runtime builds the same `XriftImageQuadObject` directly from
 * the runtime manifest. Nothing about the quad or its material is
 * reimplemented per surface.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Texture } from "three";

import {
  XriftImageQuadObject,
  type XriftImageQuadConfig,
} from "../image-quad.js";
import {
  applyXriftImageRuntimeOverrides,
  createXriftImageRuntimeBridge,
  XRIFT_IMAGE_RUNTIME_USER_DATA_KEY,
} from "./image-runtime.js";

export type XriftImageQuadProps = {
  config: XriftImageQuadConfig;
  /** Decoded Texture for the picture. The host owns its lifetime. */
  map?: Texture | null;
  /**
   * Whether a picture was chosen at all. With one chosen and `map` still
   * null the quad waits rather than showing a placeholder at a guessed size.
   */
  awaitingMap?: boolean;
  /**
   * Which Image Component this quad is, so a graph aimed at one of an
   * Entity's two pictures does not fade both. Omitted leaves the quad
   * addressable only as「そのEntityのImage」.
   */
  componentId?: string;
};

export function XriftImageQuad({
  config,
  map = null,
  awaitingMap = false,
  componentId,
}: XriftImageQuadProps) {
  const invalidate = useThree((state) => state.invalidate);
  const quad = useMemo(() => new XriftImageQuadObject(), []);
  /**
   * Runtime overrides, parked on the quad so a graph can find it through the
   * Entity. Both surfaces mount this component, so a picture that fades in
   * Play fades the same way in the published world.
   */
  const bridge = useMemo(
    () => createXriftImageRuntimeBridge(componentId ?? null),
    [componentId],
  );
  const appliedRevision = useRef<number | null>(null);
  // Callers commonly rebuild the config object every render, so the effect
  // keys off the value rather than the identity.
  const configKey = JSON.stringify(config);

  useEffect(() => {
    const holder = quad.userData as Record<string, unknown>;
    holder[XRIFT_IMAGE_RUNTIME_USER_DATA_KEY] = bridge;
    return () => {
      delete holder[XRIFT_IMAGE_RUNTIME_USER_DATA_KEY];
    };
  }, [bridge, quad]);

  useEffect(() => {
    const state = bridge.read();
    appliedRevision.current = state.revision;
    quad.update(
      applyXriftImageRuntimeOverrides(config, state.overrides),
      map ?? null,
      awaitingMap,
    );
    if (state.enabled !== null) quad.visible = state.enabled;
    invalidate();
    // `config` is re-read through `configKey`; depending on it directly would
    // defeat the value comparison above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingMap, bridge, configKey, invalidate, map, quad]);

  // A graph writes into the bridge rather than into React state, so nothing
  // re-renders when it does. Re-applying only on a revision change keeps that
  // from costing a material update every frame.
  useFrame(() => {
    const state = bridge.read();
    if (appliedRevision.current === state.revision) return;
    appliedRevision.current = state.revision;
    quad.update(
      applyXriftImageRuntimeOverrides(config, state.overrides),
      map ?? null,
      awaitingMap,
    );
    quad.visible = state.enabled ?? true;
    invalidate();
  });

  useEffect(() => () => quad.dispose(), [quad]);

  return <primitive object={quad} />;
}
