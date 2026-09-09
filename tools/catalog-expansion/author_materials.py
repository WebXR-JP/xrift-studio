"""Author the 39 additional glTF material comparisons (data, not runtime codegen)."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[2]
T=json.loads((ROOT/'tools/catalog-expansion/texture-ids.json').read_text())
entries=[]
def tex(k,normal=True,orm=True):
 t=T[k];p={}
 if 'color' in t:p['baseColorTextureId']=t['color']
 if normal and 'normal' in t:p['normalTexture']={'textureAssetId':t['normal'],'texCoord':0,'scale':.5}
 if orm and 'orm' in t:p.update(metallicRoughnessTextureId=t['orm'],occlusionTextureId=t['orm'])
 return p
cc=lambda rough=.07:{'KHR_materials_clearcoat':{'clearcoatFactor':1,'clearcoatRoughnessFactor':rough}}
def glass(rough=.05,ior=1.5,thickness=None,color=None,dist=.4,disp=None):
 e={'KHR_materials_transmission':{'transmissionFactor':1},'KHR_materials_ior':{'ior':ior}}
 if thickness is not None:
  e['KHR_materials_volume']={'thicknessFactor':thickness,'attenuationColor':color or [1,1,1],'attenuationDistance':dist}
 if disp is not None:e['KHR_materials_dispersion']={'dispersion':disp}
 return e
def add(key,name,group,shape,desc,ext='glTF 2.0',extensions=None,base=None,patch=None,be=None,bp=None,labels=None,note=None,tags=None):
 d=dict(key=key,name=name,extensionLabel=ext,base=base or {'color':'#ffffff','metalness':0,'roughness':.5},extensions=extensions or {},baselineName=name+'（比較）',baselineExtensions=be or {},patch=patch or {},sampleModel='catalog-'+shape,group=group,description=desc,note=note or '左右で同じ形状と照明を使っています。配置後はMaterialを選び、Inspectorで値とテクスチャを編集できます。',labels=labels or ['効果あり','比較'],tags=tags or [])
 if bp is not None:d['baselinePatch']=bp;d['comparisonProperty']=True
 entries.append(d)
# Layered surfaces. The base and its textures stay identical on both sides.
for key,name,texture,shape,rough,desc in [
 ('clearcoat-carbon','Clearcoat / カーボン','carbon','shaderball',.035,'織り模様の上に、鋭いコーティングの反射を重ねます。'),
 ('clearcoat-wood','Clearcoat / ニス仕上げの木','wood','vase',.09,'木目とNormal Mapを残したまま、ニスの光沢を比較します。'),
 ('clearcoat-ceramic','Clearcoat / 釉薬の陶器','ceramic','vase',.025,'タイル模様の陶器に、滑らかな釉薬の層を重ねます。'),
 ('clearcoat-satin','Clearcoat / サテン塗装','hammered','knob',.4,'粗いコーティングで、広く柔らかいハイライトを作ります。')]:
 add(key,name,'Clearcoat','%s'%shape,desc,'KHR_materials_clearcoat',cc(rough),{'color':'#ffffff','metalness':1 if texture in ['carbon','hammered'] else 0,'roughness':1},tex(texture),labels=['Clearcoat 1','Clearcoat 0'],tags=['コーティング','テクスチャ'])
for key,name,shape,r,normal,desc in [
 ('transmission-frosted','Transmission / すりガラス','vase',.38,'frosted','Roughnessと細かな凹凸で、透けた背景をぼかします。'),
 ('transmission-ribbed','Transmission / 筋入りガラス','bottle',.08,'brushed','Normal Mapの筋が、透けた背景と反射を歪めます。'),
 ('transmission-hammered','Transmission / 槌目ガラス','vase',.1,'hammered','槌目のNormal Mapを使った、凹凸のある透過表現です。'),
 ('transmission-acrylic','Transmission / アクリル板','tile',.035,None,'AlphaではなくTransmissionで、背景を透かす板を作ります。')]:
 patch={'normalTexture':{'textureAssetId':T[normal]['normal'],'texCoord':0,'scale':.75}} if normal else {}
 add(key,name,'Transmission',shape,desc,'KHR_materials_transmission',glass(),{'color':'#ffffff','metalness':0,'roughness':r},patch,labels=['Transmission 1','Transmission 0'],tags=['透明','ガラス','テクスチャ'] if normal else ['透明','アクリル'])
for key,name,col,dist,shape in [('volume-amber','Volume / 琥珀色の瓶',[.82,.36,.075],.3,'bottle'),('volume-ink','Volume / 青いインクガラス',[.08,.32,.78],.28,'vase'),('volume-smoke','Volume / スモークガラス',[.26,.27,.31],.6,'shaderball')]:
 add(key,name,'Volume',shape,'厚みを通過する光に色が付きます。基本色を同じにして、吸収の有無を比べます。','KHR_materials_volume',glass(thickness=.65,color=col,dist=dist),{'color':'#ffffff','metalness':0,'roughness':.06},be=glass(),labels=['Volume ON','Volume OFF'],tags=['吸収','色ガラス'])
for key,name,disp,ior in [('dispersion-cut','Dispersion / カットガラス',.6,1.65),('dispersion-jewel','Dispersion / ジュエル',1.1,2.1)]:
 add(key,name,'Dispersion','gem','カットされた面を通した背景で、色の分かれ方を比較します。','KHR_materials_dispersion',glass(ior=ior,thickness=.75,disp=disp),{'color':'#ffffff','metalness':0,'roughness':.015},be=glass(ior=ior,thickness=.75),labels=[f'Dispersion {disp}','Dispersion 0'],note='TransmissionとVolumeを保った比較です。分散は屈折した背景に現れます。プレビューは実際のMeshPhysicalMaterialを使います。',tags=['宝石','分散'])
for key,name,shape,texture,metal in [('iridescence-foil','Iridescence / ホログラム箔','tile','foil',1),('iridescence-pearl','Iridescence / 真珠塗装','vase','ceramic',0),('iridescence-anodized','Iridescence / 薄膜金属','knob','brushed',1)]:
 e={'KHR_materials_iridescence':{'iridescenceFactor':1,'iridescenceIor':1.8,'iridescenceThicknessMinimum':150,'iridescenceThicknessMaximum':480}}
 add(key,name,'Iridescence',shape,'見る角度による色の変化を、表面の模様と組み合わせます。','KHR_materials_iridescence',e,{'color':'#ffffff','metalness':metal,'roughness':.6},tex(texture),labels=['Iridescence 1','Iridescence 0'],note='角度による反射色の変化を比べます。厚みテクスチャのない面ではThickness Maximumが使われます。',tags=['薄膜','虹色','テクスチャ'])
for key,name,color,sheen,r in [('sheen-denim','Sheen / デニム','#748cb4',[.42,.57,.81],.65),('sheen-satin','Sheen / サテン','#c7a6b3',[.97,.78,.9],.2),('sheen-wool','Sheen / ウール','#bfb9ab',[.9,.86,.75],.88)]:
 add(key,name,'Sheen','drape','折り目と織り目に当たる光で、布の縁の柔らかい光沢を比べます。','KHR_materials_sheen',{'KHR_materials_sheen':{'sheenColorFactor':sheen,'sheenRoughnessFactor':r}},{'color':color,'metalness':0,'roughness':1},{**tex('fabric'), 'doubleSided':True},labels=['Sheen ON','Sheen OFF'],tags=['布','織り目','テクスチャ'])
for key,name,rotation,texture in [('anisotropy-turning','Anisotropy / 旋盤仕上げ',0,'brushed'),('anisotropy-copper','Anisotropy / 銅のヘアライン',1.5708,'hammered')]:
 add(key,name,'Anisotropy','knob','UVの方向に沿って伸びる反射を、等方的な反射と比べます。','KHR_materials_anisotropy',{'KHR_materials_anisotropy':{'anisotropyStrength':.85,'anisotropyRotation':rotation}},{'color':'#ffffff','metalness':1,'roughness':1},tex(texture),labels=['Anisotropy .85','Anisotropy 0'],tags=['金属','ヘアライン','テクスチャ'])
for key,name,mask,shape,color,strength in [
 ('emissive-circuit','Emissive / 回路パネル','circuit','tile',[.08,.8,1],5),
 ('emissive-grid','Emissive / ライトグリッド','grid','shaderball',[1,.65,.12],4),
 ('emissive-lava','Emissive / 溶岩の割れ目','lava','shaderball',[1,.17,.015],7),
 ('emissive-stars','Emissive / 星の陶器','stars','vase',[.3,.6,1],5),
 ('emissive-rings','Emissive / 同心円サイン','rings','tile',[1,.12,.45],4),
 ('emissive-pixels','Emissive / ドット表示','pixels','tile',[.2,1,.35],6)]:
 add(key,name,'Emissive',shape,'Emissive Textureの白い部分だけが光ります。模様を保ったまま発光強度を比べます。','KHR_materials_emissive_strength',{'KHR_materials_emissive_strength':{'emissiveStrength':strength}},{'color':'#151b25','metalness':.2,'roughness':.55,'emissiveFactor':color},{'emissiveTextureId':T[mask]['emission']},labels=[f'Strength {strength}','Strength 1'],note='発光はEmissive Factor × Emissive Texture × Strengthで決まります。にじみはBloom、周囲を照らす光はLightで別に設定します。',tags=['発光','ネオン','Emissive Texture','テクスチャ'])
for key,name,texture,shape,mode in [
 ('pbr-wood','PBR / 木目の凹凸','wood','vase','normal'),('pbr-marble','PBR / 大理石','marble','shaderball','normal'),
 ('pbr-concrete','PBR / コンクリート','concrete','tile','normal'),('pbr-brick','PBR / レンガの目地','brick','tile','normal'),
 ('pbr-leather','PBR / レザー','leather','drape','normal'),('pbr-ceramic','PBR / タイルの目地','ceramic','tile','normal'),
 ('pbr-rust','PBR / 錆と金属','rust','knob','orm'),('pbr-uv','Texture Transform / 繰り返し','ceramic','tile','uv'),
 ('pbr-cutout','Alpha Mask / 金属グリル','grille','tile','alpha')]:
 patch=tex(texture);bp={};label=['Normal Map ON','Normal Map OFF']
 if mode=='normal':bp={'normalTexture':None}
 if mode=='orm':bp={'metallicRoughnessTextureId':None};label=['ORM Map ON','ORM Map OFF']
 if mode=='uv':
  patch={'pbrMetallicRoughness':{'baseColorTexture':{'textureAssetId':T[texture]['color'],'texCoord':0,'transform':{'offset':[0,0],'rotation':0,'scale':[3,3]}}}}
  bp={'pbrMetallicRoughness':{'baseColorTexture':{'textureAssetId':T[texture]['color'],'texCoord':0}}};label=['UV 3 × 3','UV 1 × 1']
 if mode=='alpha':patch={**patch,'alphaMode':'MASK','alphaCutoff':.5,'doubleSided':True};bp={'alphaMode':'OPAQUE'};label=['Alpha MASK','Alpha OPAQUE']
 if shape=='drape':patch['doubleSided']=True
 add(key,name,'テクスチャ / PBR',shape,'画像・凹凸・粗さ・金属度を役割別に設定する、テクスチャ付きの比較見本です。',base={'color':'#ffffff','metalness':1 if texture in ['rust','grille'] else 0,'roughness':1 if texture!='grille' else .3},patch=patch,bp=bp,labels=label,tags=['PBR','テクスチャ','Normal Map' if mode=='normal' else mode])
add('unlit-pattern','Unlit / 模様のある案内板','Unlit','tile','同じテクスチャで、照明を受ける表示と受けない表示を比べます。','KHR_materials_unlit',{'KHR_materials_unlit':{}},{'color':'#ffffff','metalness':0,'roughness':1},{'baseColorTextureId':T['ceramic']['color']},labels=['Unlit','Lit'],tags=['案内板','テクスチャ'])
add('specular-leather','Specular / オイルレザー','Specular','drape','レザーの凹凸を残し、非金属の反射を抑えた表面と比べます。','KHR_materials_specular',{'KHR_materials_specular':{'specularFactor':.18,'specularColorFactor':[1,1,1]}},{'color':'#ffffff','metalness':0,'roughness':.65},{**tex('leather'),'doubleSided':True},labels=['Specular .18','Specular 1'],tags=['革','反射','テクスチャ'])
add('ior-liquid','IOR / 液体の屈折','IOR','vase','同じ器の形状で、屈折率を1.33と1.5にした違いを比べます。','KHR_materials_ior',glass(ior=1.33,thickness=.3),{'color':'#ffffff','metalness':0,'roughness':.025},be={'KHR_materials_transmission':{'transmissionFactor':1},'KHR_materials_volume':{'thicknessFactor':.3,'attenuationColor':[1,1,1],'attenuationDistance':.4}},labels=['IOR 1.33','IOR 1.5'],tags=['屈折率','水'])
assert len(entries)==39,len(entries)
header='''import type { MaterialShowcaseDefinition } from "./material-showcase-catalog";
/** Authored comparisons. Not color-only variants: each has a surface/parameter lesson. */
export type ExtendedMaterialShowcase = MaterialShowcaseDefinition & {
 sampleModel: string; group: string; description: string; note: string;
 labels: readonly [string, string]; tags: readonly string[];
};
export const EXTENDED_MATERIAL_SHOWCASES: readonly ExtendedMaterialShowcase[] = '''
(ROOT/'src/lib/visual-editor/material-showcase-extended.ts').write_text(header+json.dumps(entries,indent=2,ensure_ascii=False)+';\n')
print('Authored',len(entries),'material comparisons')
