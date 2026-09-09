import { catalogPublicAssetUrl } from "../../lib/visual-editor/catalog-public-url";
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { BUILTIN_MATERIAL_ASSETS } from '../../lib/visual-editor/prototype-project';
import { getMaterialShowcaseAsset } from '../../lib/visual-editor/material-showcase-catalog';
import { getCatalogTexture } from '../../lib/visual-editor/catalog-textures';
import type { MaterialTextureInfo } from '../../lib/visual-editor/asset-manifest';
import { materialWritesDepth } from '../../lib/visual-editor/asset-manifest';
import { isUnlitMaterial, physicalMaterialExtensionProps, usesPhysicalMaterial } from './material-physical-props';
import { useCatalogPreviewAssetLoad } from './CatalogPreviewFrame';

/** Same glTF factors, maps, UV transform and color spaces as the installed Material. */
export function useCatalogMaterial(materialAssetId:string|undefined):THREE.Material {
 const properties=useMemo(()=>(BUILTIN_MATERIAL_ASSETS.find(a=>a.id===materialAssetId) ?? (materialAssetId?getMaterialShowcaseAsset(materialAssetId):undefined))?.properties,[materialAssetId]);
 const trackLoad=useCatalogPreviewAssetLoad();
 const material=useMemo(()=>{
  const p=properties;
  const common={color:p?.color??'#94a3b8',side:p?.doubleSided?THREE.DoubleSide:THREE.FrontSide,
   opacity:p?.pbrMetallicRoughness.baseColorFactor[3]??1,
   transparent:p?.alphaMode==='BLEND',alphaTest:p?.alphaMode==='MASK'?p.alphaCutoff:0,
   depthWrite:materialWritesDepth({alphaMode:p?.alphaMode??'OPAQUE',depthWrite:p?.depthWrite??'auto'})};
  if(isUnlitMaterial(p)) return new THREE.MeshBasicMaterial(common);
  const lit={...common,metalness:p?.pbrMetallicRoughness.metallicFactor??0,roughness:p?.pbrMetallicRoughness.roughnessFactor??.8,
   emissive:new THREE.Color(...(p?.emissiveFactor??[0,0,0])),
   emissiveIntensity:p?.extensions.KHR_materials_emissive_strength?.emissiveStrength??1};
  return usesPhysicalMaterial(p)?new THREE.MeshPhysicalMaterial({...lit,...physicalMaterialExtensionProps(p)}):new THREE.MeshStandardMaterial(lit);
 },[properties]);
 useEffect(()=>{
  let cancelled=false;
  const textures:THREE.Texture[]=[];
  const finishes:Array<(success?:boolean)=>void>=[];
  // The type is structural: Basic also has map/aoMap, while lit materials add the others.
  const target=material as THREE.MeshStandardMaterial;
  const bind=(info:MaterialTextureInfo|undefined,slots:('map'|'normalMap'|'roughnessMap'|'metalnessMap'|'aoMap'|'emissiveMap')[])=>{
   if(!info) return;
   const definition=getCatalogTexture(info.textureAssetId);
   if(!definition) return;
   const finish=trackLoad(); finishes.push(finish);
   const texture=new THREE.TextureLoader().load(`${catalogPublicAssetUrl(definition.publicPath)}?v=${definition.sha256.slice(0,12)}`,
    loaded=>{if(cancelled){loaded.dispose();return;}material.needsUpdate=true;finish();},undefined,()=>{if(!cancelled)finish(false);});
   texture.colorSpace=definition.colorSpace==='srgb'?THREE.SRGBColorSpace:THREE.NoColorSpace;
   texture.flipY=false;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
   texture.channel=info.texCoord;
   if(info.transform){texture.offset.fromArray(info.transform.offset);texture.repeat.fromArray(info.transform.scale);texture.rotation=info.transform.rotation;}
   for(const slot of slots)target[slot]=texture;
   textures.push(texture); material.needsUpdate=true;
  };
  bind(properties?.pbrMetallicRoughness.baseColorTexture,['map']);
  if(!isUnlitMaterial(properties)){
   bind(properties?.normalTexture,['normalMap']);
   bind(properties?.pbrMetallicRoughness.metallicRoughnessTexture,['roughnessMap','metalnessMap']);
   bind(properties?.occlusionTexture,['aoMap']);
   bind(properties?.emissiveTexture,['emissiveMap']);
   target.normalScale.setScalar(properties?.normalTexture?.scale??1);
   target.aoMapIntensity=properties?.occlusionTexture?.strength??1;
  }
  return()=>{cancelled=true;finishes.forEach(f=>f());textures.forEach(t=>t.dispose());material.dispose();};
 },[material,properties,trackLoad]);
 return material;
}
