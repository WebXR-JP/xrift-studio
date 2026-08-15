import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useFrame, useThree, type ThreeElements } from "@react-three/fiber";
import { AnimationMixer, LoopOnce, LoopRepeat, Mesh, ShaderMaterial } from "three";

import type {
  XriftRuntimeComponent,
  XriftRuntimeManifest,
} from "../schema.js";
import {
  disposeXriftLoadResult,
  XriftThreeLoader,
  type XriftLoadResult,
} from "../three/index.js";
import {
  type MutableUniformValue,
  type TimeUniformSpec,
  applyTimeUniformValue,
} from "../shader-time.js";

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
      <XriftRuntimeTimeUniforms result={result} />
    </>
  ) : fallback;
}

function XriftRuntimeTimeUniforms({ result }: { result: XriftLoadResult }) {
  useFrame((state) => {
    const elapsed = state.clock.getElapsedTime();
    result.root.traverse((object) => {
      const mesh = object as Mesh;
      const material = mesh.material as ShaderMaterial | undefined;
      const specs = material?.userData?.xriftTimeUniforms as
        | TimeUniformSpec[]
        | undefined;
      if (!Array.isArray(specs) || !material) return;
      for (const spec of specs) {
        const uniform = material.uniforms[spec.name];
        if (uniform) {
          applyTimeUniformValue(uniform as MutableUniformValue, spec, elapsed);
        }
      }
    });
  });
  return null;
}

function XriftRuntimeAnimations({ result }: { result: XriftLoadResult }) {
  const playbacks = useMemo(() => {
    const scene = result.manifest.scenes[result.manifest.entryScene];
    if (!scene) return [];
    return Object.values(scene.entities).flatMap((entity) => {
      const target = result.entities.get(entity.id);
      const clips = result.animationClipsByEntity.get(entity.id) ?? [];
      if (!target || clips.length === 0) return [];
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
      const selectedIndex =
        component?.autoplay
          ? component.clipName === undefined
            ? 0
            : clips.findIndex((clip) => clip.name === component.clipName)
          : -1;
      const indices = new Set<number>();
      if (selectedIndex >= 0) indices.add(selectedIndex);
      for (const index of
        result.interactionAnimationIndicesByEntity.get(entity.id) ?? []) {
        indices.add(index);
      }
      const speed =
        typeof component?.speed === "number" && Number.isFinite(component.speed)
          ? component.speed
          : 1;
      return [...indices].flatMap((index) => {
        const clip = clips[index];
        return clip
          ? [
              {
                clip,
                loop: component?.loop ?? false,
                // Speed applies to the selected clip, not interactivity-driven ones.
                timeScale: index === selectedIndex ? speed : 1,
                mixer: new AnimationMixer(target),
              },
            ]
          : [];
      });
    });
  }, [result]);

  useEffect(() => {
    for (const playback of playbacks) {
      const action = playback.mixer.clipAction(playback.clip);
      action.reset();
      action.clampWhenFinished = !playback.loop;
      action.setLoop(
        playback.loop ? LoopRepeat : LoopOnce,
        playback.loop ? Infinity : 1,
      );
      action.timeScale = playback.timeScale;
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
