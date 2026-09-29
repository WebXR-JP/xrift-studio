import { catalogPublicAssetUrl } from "../../lib/visual-editor/catalog-public-url";
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { BUILTIN_MATERIAL_ASSETS } from '../../lib/visual-editor/prototype-project';
import { getMaterialShowcaseAsset } from '../../lib/visual-editor/material-showcase-catalog';
import { getCatalogTexture, type CatalogTextureDefinition } from '../../lib/visual-editor/catalog-textures';
import type { MaterialTextureInfo } from '../../lib/visual-editor/asset-manifest';
import { materialWritesDepth } from '../../lib/visual-editor/asset-manifest';
import { isUnlitMaterial, physicalMaterialExtensionProps, usesPhysicalMaterial } from './material-physical-props';
import { useCatalogPreviewAssetLoad } from './CatalogPreviewFrame';
import { createMToonMaterial, type MToonMaterialTextures } from '../../../packages/xrift-studio-runtime/src/mtoon-material';

type CatalogTextureBinding = {
 info: MaterialTextureInfo;
 definition: CatalogTextureDefinition;
 texture: THREE.Texture;
 slots: string[];
 mtoonRole?: keyof MToonMaterialTextures;
};

/** Same glTF factors, maps, UV transform and color spaces as the installed Material. */
export function getCatalogMaterialProperties(materialAssetId: string | undefined) {
 const builtin = BUILTIN_MATERIAL_ASSETS.find(asset => asset.id === materialAssetId);
 return (builtin ?? (materialAssetId ? getMaterialShowcaseAsset(materialAssetId) : undefined))?.properties;
}

export function useCatalogMaterial(materialAssetId:string|undefined):THREE.Material {
 const properties=useMemo(()=>getCatalogMaterialProperties(materialAssetId),[materialAssetId]);
 const trackLoad=useCatalogPreviewAssetLoad();
 // Allocate texture objects before the shared factory compiles its UV/channel
 // bindings. Loading images later keeps their identity and authored transforms.
 const bindings=useMemo(()=>{
  const entries:CatalogTextureBinding[]=[];
  const add=(info:MaterialTextureInfo|undefined,slots:string[],mtoonRole?:keyof MToonMaterialTextures)=>{
   if(!info) return;
   const definition=getCatalogTexture(info.textureAssetId);
   if(!definition) return;
   const texture=new THREE.Texture();
   texture.colorSpace=definition.colorSpace==='srgb'?THREE.SRGBColorSpace:THREE.NoColorSpace;
   texture.flipY=false;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
   texture.channel=info.texCoord;
   if(info.transform){texture.offset.fromArray(info.transform.offset);texture.repeat.fromArray(info.transform.scale);texture.rotation=info.transform.rotation;}
   entries.push({info,definition,texture,slots,mtoonRole});
  };
  add(properties?.pbrMetallicRoughness.baseColorTexture,['map'],'baseColorMap');
  const toon=properties?.extensions.VRMC_materials_mtoon;
  if(toon || !isUnlitMaterial(properties)){
   add(properties?.normalTexture,['normalMap'],'normalMap');
   add(properties?.emissiveTexture,['emissiveMap'],'emissiveMap');
   if(toon){
    add(properties?.opacityTexture,[],'opacityMap');
    add(toon.shadeMultiplyTexture,[],'shadeMultiplyMap');
    add(toon.shadingShiftTexture,[],'shadingShiftMap');
    add(toon.matcapTexture,[],'matcapMap');
    add(toon.rimMultiplyTexture,[],'rimMultiplyMap');
    add(toon.outlineWidthMultiplyTexture,[],'outlineWidthMultiplyMap');
    add(toon.uvAnimationMaskTexture,[],'uvAnimationMaskMap');
   }else{
    add(properties?.pbrMetallicRoughness.metallicRoughnessTexture,['roughnessMap','metalnessMap']);
    add(properties?.occlusionTexture,['aoMap']);
   }
  }
  return entries;
 },[properties]);
 const material=useMemo(()=>{
  const p=properties;
  if(p?.extensions.VRMC_materials_mtoon){
   const textures=Object.fromEntries(bindings.flatMap(binding=>binding.mtoonRole?[[binding.mtoonRole,binding.texture]]:[])) as MToonMaterialTextures;
   return createMToonMaterial(p,textures);
  }
  const common={color:p?.color??'#94a3b8',side:p?.doubleSided?THREE.DoubleSide:THREE.FrontSide,
   opacity:p?.pbrMetallicRoughness.baseColorFactor[3]??1,
   transparent:p?.alphaMode==='BLEND',alphaTest:p?.alphaMode==='MASK'?p.alphaCutoff:0,
   depthWrite:materialWritesDepth({alphaMode:p?.alphaMode??'OPAQUE',depthWrite:p?.depthWrite??'auto'})};
  const lit={...common,metalness:p?.pbrMetallicRoughness.metallicFactor??0,roughness:p?.pbrMetallicRoughness.roughnessFactor??.8,
   emissive:new THREE.Color(...(p?.emissiveFactor??[0,0,0])),
   emissiveIntensity:p?.extensions.KHR_materials_emissive_strength?.emissiveStrength??1};
  const result=isUnlitMaterial(p)?new THREE.MeshBasicMaterial(common):usesPhysicalMaterial(p)?new THREE.MeshPhysicalMaterial({...lit,...physicalMaterialExtensionProps(p)}):new THREE.MeshStandardMaterial(lit);
  const target=result as unknown as Record<string,unknown>;
  for(const binding of bindings) for(const slot of binding.slots) target[slot]=binding.texture;
  if(!isUnlitMaterial(p)){
   const surface=result as THREE.MeshStandardMaterial;
   surface.normalScale.setScalar(p?.normalTexture?.scale??1);
   surface.aoMapIntensity=p?.occlusionTexture?.strength??1;
  }
  return result;
 },[properties,bindings]);
 useEffect(()=>{
  let cancelled=false;
  const loadingTextures:THREE.Texture[]=[];
  const finishes:Array<(success?:boolean)=>void>=[];
  for(const binding of bindings){
   const {definition,texture}=binding;
   const finish=trackLoad(); finishes.push(finish);
   const loadingTexture=new THREE.TextureLoader().load(`${catalogPublicAssetUrl(definition.publicPath)}?v=${definition.sha256.slice(0,12)}`,
    loaded=>{
     if(cancelled){loaded.dispose();return;}
     texture.image=loaded.image;texture.needsUpdate=true;
     material.needsUpdate=true;loaded.dispose();finish();
    },undefined,()=>{if(!cancelled)finish(false);});
   loadingTextures.push(loadingTexture);
  }
  return()=>{cancelled=true;finishes.forEach(f=>f());loadingTextures.forEach(t=>t.dispose());bindings.forEach(b=>b.texture.dispose());material.dispose();};
 },[material,bindings,trackLoad]);
 return material;
}
