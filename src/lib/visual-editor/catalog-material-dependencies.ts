import { getCatalogTexture, type CatalogTextureDefinition } from './catalog-textures';
/** Follow canonical texture infos, including extension maps. Do not mutate authored Materials. */
export function catalogMaterialTextures(properties:unknown):readonly CatalogTextureDefinition[] {
 const ids=new Set<string>();
 function walk(value:unknown):void {
  if (!value || typeof value!=='object') return;
  for(const [key,child] of Object.entries(value)) {
   if(key==='textureAssetId' && typeof child==='string') ids.add(child);
   else if(child && typeof child==='object') walk(child);
  }
 }
 walk(properties);
 return [...ids].flatMap(id=>{const d=getCatalogTexture(id);return d?[d]:[];});
}
