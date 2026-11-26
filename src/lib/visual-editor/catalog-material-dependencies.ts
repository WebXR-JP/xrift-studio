import { getCatalogTexture, type CatalogTextureDefinition } from './catalog-textures';
import { getFoliageTextureByAssetId } from './foliage-textures';

/**
 * A picture bundled with the app that a catalog Material reads.
 *
 * `mimeType` is absent for the glTF showcase maps, which are all PNG.
 */
export type BundledMaterialTexture = CatalogTextureDefinition & {
 mimeType?: "image/png" | "image/webp";
};

/**
 * Follow canonical texture infos, including extension maps and the texture
 * uniforms of a Custom Shader. Pass the Material's `properties`, or
 * `{ properties, shader }` for a Material that carries a shader. Do not mutate
 * authored Materials.
 */
export function catalogMaterialTextures(properties:unknown):readonly BundledMaterialTexture[] {
 const ids=new Set<string>();
 function walk(value:unknown):void {
  if (!value || typeof value!=='object') return;
  for(const [key,child] of Object.entries(value)) {
   if(key==='textureAssetId' && typeof child==='string') ids.add(child);
   else if(child && typeof child==='object') walk(child);
  }
 }
 walk(properties);
 return [...ids].flatMap(id=>{const d=getCatalogTexture(id)??getFoliageTextureByAssetId(id);return d?[d]:[];});
}

/** What `catalogMaterialTextures` should walk for a Material Asset. */
export function catalogMaterialTextureSource(material:{properties:unknown;shader?:unknown}):unknown {
 return material.shader ? { properties: material.properties, shader: material.shader } : material.properties;
}
