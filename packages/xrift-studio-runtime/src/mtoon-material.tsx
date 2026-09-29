import { useCallback, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import type { MToonMaterial } from "@pixiv/three-vrm";
import type { Material, Mesh } from "three";
import { attachMToonOutlines, createMToonMaterial, type MToonSurfaceProperties, type MToonMaterialTextures } from "./mtoon-runtime.js";
export * from "./mtoon-runtime.js";

/** Shared R3F attachment for primitives and injected glTF material slots. */
export function XriftMToonMaterial({
  properties, textures, doubleSided, attach = "material",
}: {
  properties: MToonSurfaceProperties;
  textures?: MToonMaterialTextures;
  doubleSided?: boolean;
  attach?: string;
  meshName?: string;
  sourceMaterial?: Material;
}) {
  const material = useMemo(() => createMToonMaterial(properties, textures, doubleSided), [properties, textures, doubleSided]);
  useFrame((_, delta) => material.update(delta));
  useEffect(() => () => material.dispose(), [material]);
  const attachMaterial = useCallback((parent: Mesh, instance: MToonMaterial) => {
    const slot = /^material-(\d+)$/.exec(attach);
    const index = slot ? Number(slot[1]) : undefined;
    const previous = parent.material;
    const previousSlot = index !== undefined && Array.isArray(previous) ? previous[index] : undefined;
    if (index !== undefined && Array.isArray(previous)) {
      const owned = previous.slice();
      owned[index] = instance;
      parent.material = owned;
    } else parent.material = instance;
    attachMToonOutlines(parent);
    return () => {
      if (index !== undefined && Array.isArray(parent.material)) {
        if (parent.material[index] === instance && previousSlot) {
          const owned = parent.material.slice();
          owned[index] = previousSlot;
          parent.material = owned;
        }
      } else if (parent.material === instance) parent.material = previous;
      attachMToonOutlines(parent);
    };
  }, [attach]);
  return <primitive object={material} attach={attachMaterial} />;
}
