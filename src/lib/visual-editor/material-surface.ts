import { Material, type Texture } from "three";
import type { MaterialProperties } from "./asset-manifest";

/** Opacity is data, sampled before alpha test; never apply an sRGB conversion. */
export function opacityShaderChunk(channel: MaterialProperties["opacityChannel"]): string {
  return `#ifdef USE_ALPHAMAP\n diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).${channel};\n#endif`;
}

// Stable callbacks prevent unrelated scalar edits from rebuilding shaders.
const channelProps = Object.fromEntries((["r", "g", "b", "a"] as const).map(channel => [channel, {
  onBeforeCompile: ((shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <alphamap_fragment>", opacityShaderChunk(channel));
  }) as Material["onBeforeCompile"],
  customProgramCacheKey: () => `xrift-opacity-${channel}`,
}])) as Record<MaterialProperties["opacityChannel"], Pick<Material, "onBeforeCompile" | "customProgramCacheKey">>;

const refreshSurface = (material: Material) => { material.needsUpdate = true; };
const useGeometryVertexColors: Material["onBeforeRender"] = function (this: Material, _renderer, _scene, _camera, geometry) {
  const enabled = geometry.hasAttribute("color");
  if (this.vertexColors !== enabled) {
    this.vertexColors = enabled;
    this.needsUpdate = true;
  }
};

export function materialSurfaceProps(properties: MaterialProperties | undefined, alphaMap?: Texture) {
  return {
    vertexColors: properties?.vertexColors ?? false,
    onBeforeRender: properties?.vertexColors ? useGeometryVertexColors : Material.prototype.onBeforeRender,
    alphaMap: alphaMap ?? null,
    onUpdate: refreshSurface,
    ...(properties?.opacityTexture && properties.opacityChannel !== "g"
      ? channelProps[properties.opacityChannel ?? "a"]
      : { onBeforeCompile: Material.prototype.onBeforeCompile, customProgramCacheKey: Material.prototype.customProgramCacheKey }),
  };
}
