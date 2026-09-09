import { BUILTIN_ASSET_IDS } from './builtin-asset-ids';
import { BUILTIN_PRIMITIVE_CREATION_IDS } from './creation-catalog';
import type { SceneRecipePart, SceneRecipeAction, SceneRecipeBehaviour } from './scene-recipe-catalog';
import type { Vec3 } from './scene-document';

export const CM = BUILTIN_ASSET_IDS.material;
/** Ordinary scene parts, shared by the shipped examples; no preview-only geometry. */
export function catalogBox(name:string, position:Vec3, scale:Vec3, materialAssetId:string = CM.slate): Extract<SceneRecipePart,{kind:'primitive'}> {
 return {kind:'primitive',name,creationId:BUILTIN_PRIMITIVE_CREATION_IDS.box,materialAssetId,position,scale,rotation:[0,0,0]};
}
export function catalogModel(name:string, modelId:string, position:Vec3, materialAssetId?:string, scale:Vec3=[1,1,1]): Extract<SceneRecipePart,{kind:'model'}> {
 return {kind:'model',name,modelId,position,rotation:[0,0,0],scale,...(materialAssetId ? {materialAssetId} : {})};
}
export function catalogText(name:string,text:string,position:Vec3,fontSize=0.08): Extract<SceneRecipePart,{kind:'text'}> {
 return {kind:'text',name,text,position,rotation:[0,0,0],fontSize,maxWidth:2.4,color:'#e2e8f0'};
}
export function catalogButton(name:string,label:string,x=0,materialAssetId:string=CM.orange): SceneRecipePart[] {
 return [catalogModel(`${name}の台座`,'catalog-pedestal',[x,0,0.83],CM.charcoal,[0.36,0.7,0.36]),
 {...catalogModel(name,'catalog-knob',[x,0.09,0.83],materialAssetId,[0.24,0.24,0.24]),interactable:{label}},
 catalogText(`${name}のラベル`,label,[x,0.2,1.0],0.06)];
}
export function catalogWrite(part:string,targetKind:SceneRecipeAction['targetKind'],property:string,value:SceneRecipeAction['value'],extra:Partial<SceneRecipeAction>={}):SceneRecipeAction {
 return {target:{scope:'part',part},targetKind,property,value,...extra};
}
export function catalogToggle(part:string,targetKind:SceneRecipeAction['targetKind'],property:string):SceneRecipeAction {
 return {target:{scope:'part',part},targetKind,property,mode:'toggle'};
}
export function catalogBehaviour(host:string,summary:string,actions:readonly SceneRecipeAction[]):SceneRecipeBehaviour {
 return {host,graphName:summary,start:'interact',summary,interactionText:host,actions};
}
