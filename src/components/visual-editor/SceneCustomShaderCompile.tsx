import { useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useXriftShaderCompileFailures } from "../../../packages/xrift-studio-runtime/src/script/shader-compile-watch";
import type { AssetManifest } from "../../lib/visual-editor";
import {
  compilableCustomShader,
  customShaderCompileStore,
  customShaderSourceKey,
  findCustomShaderMaterialsBySource,
} from "../../lib/visual-editor/custom-shader-compile";
import { createClassicR3fMaterial } from "./ProjectModelVisual";
import {
  checkCustomShaderInScene,
  linkedSceneProgramsFor,
} from "./scene-custom-shader-check";

/** How often recorded failures are compared with what the Scene draws now. */
const RECHECK_SECONDS = 1;

/**
 * Makes the Scene View the place where Custom Shaders are compiled and their
 * failures are recorded, in Edit and in Play alike.
 *
 * Two things reach the record. A request - the Inspector showing a Material, or
 * an MCP tool that just wrote one - compiles that Material here even when no
 * mesh uses it. And when the Scene itself draws a mesh whose program fails, the
 * Materials with that GLSL are compiled and recorded without anybody asking.
 *
 * Mounted inside the Canvas because the renderer lives there. It draws nothing.
 */
export function SceneCustomShaderCompile({ assets }: { assets: AssetManifest }) {
  const renderer = useThree((state) => state.gl);
  const get = useThree((state) => state.get);
  const assetsRef = useRef(assets);
  assetsRef.current = assets;

  useLayoutEffect(() => {
    let unmounted = false;
    const release = customShaderCompileStore.setChecker((material) => {
      const { scene, camera } = get();
      return checkCustomShaderInScene({
        renderer,
        scene,
        camera,
        material,
        // The same call the Scene View makes for a mesh, so the program
        // compiled here is the one a mesh would be drawn with.
        createMaterial: (shader) => createClassicR3fMaterial(shader, {}, ""),
        isCancelled: () => unmounted,
      });
    });
    return () => {
      unmounted = true;
      release();
    };
  }, [get, renderer]);

  useXriftShaderCompileFailures((uses) => {
    const materials = findCustomShaderMaterialsBySource(
      assetsRef.current,
      uses.map((use) => use.material),
    );
    for (const material of materials) void customShaderCompileStore.check(material);
  });

  // A failure is recorded for the GLSL, but whether a program links also
  // depends on the Scene: three.js builds another program for the same Material
  // when Fog is switched, for one. Once every mesh that uses the GLSL is drawn
  // with a linked program again, the record is stale and is compiled afresh.
  const elapsed = useRef(0);
  const rechecked = useRef(new Map<string, string>());
  useFrame((state, delta) => {
    elapsed.current += delta;
    if (elapsed.current < RECHECK_SECONDS) return;
    elapsed.current = 0;
    const snapshots = customShaderCompileStore.getSnapshots();
    for (const assetId of Object.keys(snapshots)) {
      const snapshot = snapshots[assetId];
      if (snapshot?.status !== "error") {
        rechecked.current.delete(assetId);
        continue;
      }
      const material = assetsRef.current.assets[assetId];
      if (material?.kind !== "material") continue;
      const shader = compilableCustomShader(material);
      if (!shader || customShaderSourceKey(shader) !== snapshot.sourceKey) continue;
      const programs = linkedSceneProgramsFor(renderer, state.scene, shader);
      if (programs === null || rechecked.current.get(assetId) === programs) continue;
      rechecked.current.set(assetId, programs);
      void customShaderCompileStore.check(material);
    }
  });

  return null;
}
