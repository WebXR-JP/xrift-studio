import { InteractivityEngine } from '../../../packages/xrift-studio-runtime/src/interactivity/engine';
import { boolValue, floatValue, intValue, vectorValue, type InteractivityValue } from '../../../packages/xrift-studio-runtime/src/interactivity/value';
import type { InteractivityActionTarget } from '../../../packages/xrift-studio-runtime/src/interactivity/host';
import { getXriftInteractionProperty, type XriftInteractionTargetKind } from './interactivity-graph';
import { SCENE_RECIPES, createSceneRecipeBehaviourExtension, type SceneRecipePlacedPart } from './scene-recipe-catalog';

function assert(value:boolean,message:string):asserts value {if(!value)throw new Error(message);}
/** Execute the shipped graphs with a property-recording host. This is not a renderer/Play test. */
export function runSceneRecipeRuntimeFixtureAssertions():void {
 for(const recipe of SCENE_RECIPES) {
  const placed=new Map<string,SceneRecipePlacedPart>();
  recipe.parts.forEach((p,i)=>placed.set(p.name,{entityId:`sample-${i}`,componentIds:{light:`light-${i}`,text:`text-${i}`,particle:`particle-${i}`,'audio-source':`audio-${i}`}}));
  for(const behaviour of recipe.behaviours??[]) {
   const extension=createSceneRecipeBehaviourExtension(behaviour,placed);
   assert(Boolean(extension),`${recipe.id}: graph build failed`);
   // Recreate scene-start graphs so all event types are activated three times.
   for(let startup=0;startup<(behaviour.start==='sceneStart'?3:1);startup++){
   const values=new Map<string,InteractivityValue>();
   const strings=new Map<string,string>();
   const key=(t:InteractivityActionTarget)=>`${t.entityId}:${t.targetKind}:${t.property}`;
   const engine=new InteractivityEngine(extension,{
    readProperty:t=>{
     const present=values.get(key(t));if(present)return present;
     const d=getXriftInteractionProperty(t.targetKind as XriftInteractionTargetKind,t.property);
     if(!d)return null;
     if(d.kind==='bool')return boolValue(d.defaultValue===true);
     if(d.kind==='enum')return intValue(0);
     if(Array.isArray(d.defaultValue))return vectorValue(d.defaultValue);
     return floatValue(typeof d.defaultValue==='number'?d.defaultValue:0);
    },
    writeProperty:(t,v)=>{assert(v.data.every(x=>typeof x==='boolean'||Number.isFinite(x)),`${recipe.id}: non-finite value`);values.set(key(t),v);return true;},
    writeString:(t,value)=>{strings.set(key(t),value);return true;},
    writeAsset:()=>true,
   });
   engine.start();
   for(let repeat=0;repeat<(behaviour.start==='interact'?3:1);repeat++){
    if(behaviour.start==='interact')engine.interact();
    // Small updates exercise intermediate interpolation, timers, and done continuations.
    for(let frame=0;frame<1_800;frame++)engine.update(1/60);
    assert(!engine.hasPendingWork,`${recipe.id}/${behaviour.graphName}: pending work after 30 seconds`);
    assert(engine.getIssues().length===0,`${recipe.id}/${behaviour.graphName}: ${JSON.stringify(engine.getIssues())}`);
   }
   const graph=extension!.graphs[0];
   for(const [i,node] of (graph.nodes??[]).entries()){
    const op=graph.declarations?.[node.declaration]?.op;
    if(op==='xrift/setProperty'||op==='xrift/toggleProperty') {
     assert(engine.getVisitedNodes().has(i),`${recipe.id}/${behaviour.graphName}: action ${i} never executed`);
    }
   }
   for(const action of behaviour.actions){
    if(action.target.scope==='part'&&action.targetKind==='text'&&action.property==='text') {
     const entityId=placed.get(action.target.part)!.entityId;
     assert(strings.has(`${entityId}:text:text`),`${recipe.id}: text action never wrote a string`);
    }
   }
   engine.dispose();
   }
  }
 }
}
