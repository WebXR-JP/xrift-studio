import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useFrame, useThree, type ThreeElements } from "@react-three/fiber";
import { AnimationMixer, LoopOnce, LoopRepeat } from "three";

import type {
  XriftRuntimeComponent,
  XriftRuntimeManifest,
} from "../schema.js";
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
  const renderer = useThree((state) => state.gl);
  const loader = useMemo(
    () => new XriftThreeLoader({ assetBaseUrl, renderer }),
    [assetBaseUrl, renderer],
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

  return result ? (
    <>
      <primitive object={result.root} />
      <XriftRuntimeAnimations result={result} />
    </>
  ) : fallback;
}

function XriftRuntimeAnimations({ result }: { result: XriftLoadResult }) {
  const playbacks = useMemo(() => {
    const scene = result.manifest.scenes[result.manifest.entryScene];
    if (!scene) return [];
    return Object.values(scene.entities).flatMap((entity) => {
      const target = result.entities.get(entity.id);
      const clips = result.animationClipsByEntity.get(entity.id) ?? [];
      const clip = clips[0];
      if (!target || !clip) return [];
      const component = entity.components.find(
        (
          candidate,
        ): candidate is Extract<
          XriftRuntimeComponent,
          { type: "animation" }
        > =>
          candidate.type === "animation" &&
          candidate.enabled,
      );
      return component?.autoplay
        ? [{ component, clip, mixer: new AnimationMixer(target) }]
        : [];
    });
  }, [result]);

  useEffect(() => {
    for (const playback of playbacks) {
      const action = playback.mixer.clipAction(playback.clip);
      action.reset();
      action.clampWhenFinished = !playback.component.loop;
      action.setLoop(
        playback.component.loop ? LoopRepeat : LoopOnce,
        playback.component.loop ? Infinity : 1,
      );
      action.play();
    }
    return () => {
      for (const playback of playbacks) {
        playback.mixer.stopAllAction();
        playback.mixer.uncacheRoot(playback.mixer.getRoot());
      }
    };
  }, [playbacks]);

  useFrame((_, delta) => {
    for (const playback of playbacks) {
      playback.mixer.update(Math.min(delta, 0.1));
    }
  });

  return null;
}
