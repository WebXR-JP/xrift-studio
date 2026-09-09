import { EXTENDED_MATERIAL_SHOWCASES } from './material-showcase-extended';
import { materialShowcaseAssetId, materialShowcaseBaselineAssetId, getMaterialShowcaseDefinition } from './material-showcase-catalog';
import { catalogBox, catalogModel, catalogText, CM } from './scene-recipe-builders';
import type { SceneRecipe } from './scene-recipe-catalog';

/** Both surfaces share geometry, orientation, scale and a symmetric stage. */
function comparisonParts(key:string,model:string,labels:readonly [string,string],baseline=true):SceneRecipe['parts'] {
 const parts:SceneRecipe['parts'][number][] = [
   catalogBox('比較ステージ',[0,0.025,0],[2.5,0.05,1.25],CM.charcoal),
 ];
 for (const [i,x] of [-0.62,0.62].entries()) {
  const material=i===0 || !baseline ? materialShowcaseAssetId(key) : materialShowcaseBaselineAssetId(key);
  parts.push(catalogModel(`台座 ${i+1}`,'catalog-pedestal',[x,0.05,0],CM.slate,[0.94,1,0.94]));
  parts.push(catalogModel(i===0?'効果ありの見本':'比較用の見本',model,[x,0.18,0],material));
  parts.push(catalogText(`比較ラベル ${i+1}`,labels[i],[x,0.17,0.55],0.065));
  // An actual scene backdrop makes refraction visible after placement too.
  parts.push(catalogBox(`背景 ${i+1}`,[x,0.7,-0.43],[1.12,1.28,0.035],CM.white));
  for (let j=0;j<5;j++) parts.push(catalogBox(`背景ライン ${i+1}-${j}`,[x+(j-2)*0.19,0.7,-0.405],[0.035,1.12,0.014],j%2?CM.charcoal:CM.blue));
 }
 return parts;
}
export const EXTENDED_MATERIAL_RECIPES: readonly SceneRecipe[] = EXTENDED_MATERIAL_SHOWCASES.map(d=>({
 id:`scene-recipe.material-${d.key}`, name:d.name, description:d.description,
 category:'material', projectKinds:['world','item'], group:d.group,tags:[d.extensionLabel,...d.tags],comparisonLabels:d.labels,
 note:d.note, preview:{cameraPosition:[0.12,1.24,3.8],lookAtY:0.63,ground:true},
 parts:comparisonParts(d.key,d.sampleModel,d.labels),
 lesson:{goal:d.description,steps:['左が効果あり、右が比較用です。ドラッグして反射や透け方を確認します。','「シーンに追加」で、見本・比較用Material・必要なテクスチャをまとめて追加します。','Hierarchyで見本を選び、MaterialをInspectorで編集します。テクスチャもAssetsから差し替えられます。']},
}));

const LEGACY:Record<string,{key:string;model:string;group:string;name:string;labels:readonly[string,string]}>={
 'scene-recipe.material-clearcoat':{key:'car-paint',model:'catalog-shaderball',group:'Clearcoat',name:'Clearcoat / 車の塗装',labels:['Clearcoat 1','Clearcoat 0']},
 'scene-recipe.material-anisotropy':{key:'brushed-metal',model:'catalog-knob',group:'Anisotropy',name:'Anisotropy / 磨いた金属',labels:['Anisotropyあり','Anisotropyなし']},
 'scene-recipe.material-transmission':{key:'clear-glass',model:'catalog-vase',group:'Transmission',name:'Transmission / 透明ガラス',labels:['Transmissionあり','Transmissionなし']},
 'scene-recipe.material-volume':{key:'bottle-glass',model:'catalog-bottle',group:'Volume',name:'Volume / 色付きガラス',labels:['Volumeあり','Volumeなし']},
 'scene-recipe.material-dispersion':{key:'crystal',model:'catalog-gem',group:'Dispersion',name:'Dispersion / クリスタル',labels:['Dispersionあり','Dispersionなし']},
 'scene-recipe.material-iridescence':{key:'soap-bubble',model:'catalog-shaderball',group:'Iridescence',name:'Iridescence / 薄膜の虹色',labels:['Iridescenceあり','Iridescenceなし']},
 'scene-recipe.material-sheen':{key:'velvet',model:'catalog-drape',group:'Sheen',name:'Sheen / ベルベット',labels:['Sheenあり','Sheenなし']},
 'scene-recipe.material-specular':{key:'matte-coat',model:'catalog-vase',group:'Specular',name:'Specular / 表面の反射',labels:['Specular調整あり','標準の反射']},
 'scene-recipe.material-emissive-strength':{key:'neon-tube',model:'catalog-arch',group:'Emissive',name:'Emissive / ネオンチューブ',labels:['Emissive Strengthあり','Emissive Strength 1']},
 'scene-recipe.material-ior':{key:'diamond-ior',model:'catalog-gem',group:'IOR',name:'IOR / 屈折率',labels:['IOR調整あり','IOR 1.5']},
 'scene-recipe.material-unlit':{key:'unlit-sign',model:'catalog-tile',group:'Unlit',name:'Unlit / 照明に影響されない色',labels:['Unlit','標準PBR']},
};

const LEGACY_DESCRIPTIONS: Record<string,string> = {
 Clearcoat: '車の塗装を模した二層の反射です。同じ形状でClearcoatの有無を見比べます。',
 Anisotropy: '磨いた金属のハイライトが一方向に伸びます。回転して光の伸び方を比べます。',
 Transmission: '透明ガラスと透過しない面を比較します。背後のラインを通して違いを確認できます。',
 Volume: 'ガラス内部の光の減衰を比較します。厚みと色の設定による透け方の違いを確認できます。',
 Dispersion: 'カットした宝石で、屈折による色の分かれ方を比較します。左右の形状と屈折率は同じです。',
 Iridescence: '薄膜が作る虹色と、薄膜のない面を比較します。回転して見る角度による色の変化を確認できます。',
 Sheen: '折り目のある布で、縁や斜めの面に現れる柔らかな反射を比較します。',
 Specular: '同じ花器で、表面の反射を抑えた設定と標準の反射を比較します。',
 Emissive: 'ネオンチューブのEmissive Strengthを比較します。Bloomのにじみとは別に、表面の発光強度を確認できます。',
 IOR: '同じ宝石で屈折率の違いを比較します。背後のラインの曲がり方を確認できます。',
 Unlit: '照明に影響されないUnlitと標準PBRを比較します。看板や案内表示の質感を選ぶための見本です。',
};

/** Preserve all shipped recipe IDs and leave unrelated models/gimmicks untouched. */
export function enrichCatalogRecipe(recipe:SceneRecipe):SceneRecipe {
 const d=LEGACY[recipe.id];
 if(!d) return recipe;
 const def=getMaterialShowcaseDefinition(d.key);
 return {...recipe,name:d.name,description:LEGACY_DESCRIPTIONS[d.group],group:d.group,tags:[d.group,def?.extensionLabel??''],comparisonLabels:d.labels,
 preview:{cameraPosition:[0.12,1.24,3.8],lookAtY:0.63,ground:true},
 parts:comparisonParts(d.key,d.model,d.labels,Boolean(def?.baselineName)),
 lesson:{goal:LEGACY_DESCRIPTIONS[d.group],steps:['左が効果あり、右が比較用です。ドラッグして見比べます。','「シーンに追加」で、見本と比較用Materialをまとめて追加します。','Hierarchyで見本を選び、InspectorでMaterialの値を調整します。']},
 note: d.group==='Emissive' ? 'Emissiveは表面の発光です。周囲を照らすにはLightが必要です。Bloomのにじみは配置先のPost-processing設定によって変わります。' : '左右は同じモデルと照明で比較します。見本のスタジオ照明は追加されません。配置先の環境光やSkyboxによって反射は変わります。',
 };
}
