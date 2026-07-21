import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ThreeElements } from "@react-three/fiber";

import type { XriftRuntimeManifest } from "../schema.js";
import {
  disposeXriftLoadResult,
  XriftThreeLoader,
  type XriftLoadResult,
} from "../three/index.js";

export type XriftRuntimePrimitiveProps = ThreeElements["primitive"];

export type XriftRuntimeSceneProps = {
  manifest: string | URL | XriftRuntimeManifest;
  assetBaseUrl?: string;
  fallback?: ReactNode;
  onLoad?: (result: XriftLoadResult) => void;
  onError?: (error: Error) => void;
};

export function XriftWorld(props: XriftRuntimeSceneProps) {
  return <XriftRuntimeScene {...props} expectedKind="world" />;
}

export function XriftItem(props: XriftRuntimeSceneProps) {
  return <XriftRuntimeScene {...props} expectedKind="item" />;
}

function XriftRuntimeScene({
  manifest,
  assetBaseUrl,
  fallback = null,
  onLoad,
  onError,
  expectedKind,
}: XriftRuntimeSceneProps & { expectedKind: "world" | "item" }) {
  const loader = useMemo(
    () => new XriftThreeLoader({ assetBaseUrl }),
    [assetBaseUrl],
  );
  const [result, setResult] = useState<XriftLoadResult | null>(null);

  useEffect(() => {
    let active = true;
    let loaded: XriftLoadResult | null = null;
    void loader
      .load(manifest)
      .then((next) => {
        if (next.manifest.projectKind !== expectedKind) {
          throw new Error(
            `Runtime project kind is ${next.manifest.projectKind}; expected ${expectedKind}`,
          );
        }
        if (!active) {
          disposeXriftLoadResult(next);
          return;
        }
        loaded = next;
        setResult(next);
        onLoad?.(next);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        onError?.(reason instanceof Error ? reason : new Error(String(reason)));
      });
    return () => {
      active = false;
      if (loaded) disposeXriftLoadResult(loaded);
    };
  }, [expectedKind, loader, manifest, onError, onLoad]);

  return result ? <primitive object={result.root} /> : fallback;
}
