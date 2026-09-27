import { Vector4, type Material, type Texture } from "three";

export type OpenBrushMaterialProperties = {
  pbrMetallicRoughness: { baseColorFactor: [number, number, number, number]; roughnessFactor: number };
  alphaMode: "OPAQUE" | "MASK" | "BLEND";
  alphaCutoff: number;
};

/** Apply authored brush controls identically in the editor and publication. */
export function applyOpenBrushMaterialProperties(
  material: Material,
  properties: OpenBrushMaterialProperties,
  shaderTextures: Readonly<Record<string, Texture>> = {},
): void {
  const shader = material as Material & {
    uniforms?: Record<string, { value: unknown }>;
    fragmentShader?: string;
    needsUpdate?: boolean;
  };
  const uniforms = shader.uniforms;
  if (!uniforms) return;
  for (const [uniformName, texture] of Object.entries(
    shaderTextures,
  )) {
    if (uniforms[uniformName]) uniforms[uniformName].value = texture;
  }
  if (uniforms.u_Shininess) {
    uniforms.u_Shininess.value = 1 - properties.pbrMetallicRoughness.roughnessFactor;
  }
  if (uniforms.u_Cutoff && properties.alphaMode === "MASK") {
    uniforms.u_Cutoff.value = properties.alphaCutoff;
  }
  const factor = properties.pbrMetallicRoughness.baseColorFactor;
  const varyingDeclaration = "in vec4 v_color;";
  const varyingIndex = shader.fragmentShader?.indexOf(varyingDeclaration) ?? -1;
  if (varyingIndex < 0 || !shader.fragmentShader) return;
  if (!uniforms.xriftBaseColorFactor) {
    uniforms.xriftBaseColorFactor = { value: new Vector4(...factor) };
    const bodyStart = varyingIndex + varyingDeclaration.length;
    const shaderHeader = shader.fragmentShader.slice(0, bodyStart);
    const shaderBody = shader.fragmentShader
      .slice(bodyStart)
      .replace(/\bv_color\b/g, "(v_color * xriftBaseColorFactor)");
    // Keep the vertex/fragment varying name identical. Renaming only the
    // fragment input makes WebGL reject the linked shader program.
    shader.fragmentShader = `${shaderHeader}\nuniform vec4 xriftBaseColorFactor;${shaderBody}`;
  } else if (uniforms.xriftBaseColorFactor.value instanceof Vector4) {
    uniforms.xriftBaseColorFactor.value.set(...factor);
  } else {
    uniforms.xriftBaseColorFactor.value = new Vector4(...factor);
  }
  shader.needsUpdate = true;
}
