import { useCallback, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import type { Material, Mesh, ShaderMaterial } from "three";
import type { XriftClassicShader } from "./classic-shader-contract.js";
import {
  attachClassicShaderMaterial,
  createClassicShaderMaterial,
  type ClassicShaderTextureLookup,
} from "./classic-shader-runtime.js";
import { advanceMaterialTimeUniforms } from "./shader-time.js";
export * from "./classic-shader-contract.js";
export * from "./classic-shader-runtime.js";
export { advanceMaterialTimeUniforms } from "./shader-time.js";

/**
 * Puts an already built Custom Shader Material on the parent mesh.
 *
 * The Material is attached through the shared function rather than by name, so
 * what the Material asks of its mesh (no frustum culling, for one) is applied
 * when it goes on and undone when it comes off.
 */
export function XriftClassicShaderAttachment({
  material,
  attach = "material",
}: {
  material: Material;
  attach?: string;
}) {
  const attachMaterial = useCallback(
    (parent: Mesh, instance: Material) =>
      attachClassicShaderMaterial(parent, instance, attach),
    [attach],
  );
  return <primitive object={material} attach={attachMaterial} />;
}

function XriftClassicShaderClock({ material }: { material: ShaderMaterial }) {
  useFrame((state) =>
    advanceMaterialTimeUniforms(material, state.clock.getElapsedTime()),
  );
  return null;
}

/**
 * A Custom Shader Material as a React Three Fiber child of a mesh.
 *
 * The generated world renders this for every mesh slot that wears a Custom
 * Shader. It builds the Material with the function the editor uses, advances
 * its time uniforms from the frame clock and releases it on unmount.
 */
export function XriftClassicShaderMaterial({
  shader,
  textures,
  attach = "material",
  meshName = "",
}: {
  shader: XriftClassicShader;
  /** One loaded texture per Texture Asset id the shader reads. */
  textures?: ClassicShaderTextureLookup;
  attach?: string;
  meshName?: string;
}) {
  const material = useMemo(
    () => createClassicShaderMaterial(shader, { meshName, textures }),
    [meshName, shader, textures],
  );
  useEffect(() => () => material.dispose(), [material]);
  return (
    <>
      <XriftClassicShaderAttachment material={material} attach={attach} />
      {Array.isArray(material.userData.xriftTimeUniforms) ? (
        <XriftClassicShaderClock material={material} />
      ) : null}
    </>
  );
}
