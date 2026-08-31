/**
 * React Three Fiber wrapper around the shared Text panel object.
 *
 * The editor viewport and the generated Classic source both mount this, while
 * the published runtime builds the same `XriftTextPanelObject` directly from
 * the runtime manifest. Nothing about the lettering or the plate is
 * reimplemented per surface.
 */

import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import type { Texture } from "three";

import {
  XriftTextPanelObject,
  type XriftTextPanelConfig,
} from "../text-panel.js";

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
};

export function XriftTextPanel({
  config,
  map = null,
  fontDirectoryUrl,
}: XriftTextPanelProps) {
  const invalidate = useThree((state) => state.invalidate);
  const panel = useMemo(() => new XriftTextPanelObject(), []);
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
    panel.update(resolvedConfig, map ?? null);
    // `config` is re-read through `configKey`; depending on it directly would
    // defeat the value comparison above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, configKey, map]);

  useEffect(() => () => panel.dispose(), [panel]);

  return <primitive object={panel} />;
}
