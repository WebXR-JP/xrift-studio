import { catalogBox as box, catalogModel as model, catalogText as text, catalogButton as button, catalogWrite as w, catalogToggle as toggle, catalogBehaviour as behaviour, CM as M } from './scene-recipe-builders';
import { materialShowcaseAssetId as mat } from './material-showcase-catalog';
import type { SceneRecipe, SceneRecipePart, SceneRecipeAction, SceneRecipeBehaviour } from './scene-recipe-catalog';
import type { Vec3 } from './scene-document';

const recipes:SceneRecipe[]=[];
const note='操作はPlayで確認してください。各パーツ・音源・Interactivityグラフは追加後に編集できます。衝突判定やネットワーク同期は含みません。必要な対象へ別途設定してください。';
function add(key:string,name:string,group:string,description:string,parts:SceneRecipePart[],behaviours:SceneRecipeBehaviour[],customNote=note) {
 recipes.push({id:`scene-recipe.${key}`,name,group,description,category:'tutorial',projectKinds:['world'],tags:[group,...new Set(behaviours.flatMap(b=>b.actions.map(a=>a.targetKind)))],
 note:customNote,parts:[box('展示ベース',[0,0.015,0.25],[2.3,0.03,2],M.charcoal),...parts],behaviours,
 preview:{cameraPosition:[1.8,1.7,3.5],lookAtY:.65},
 lesson:{goal:description,steps:[`Playを開始し、${behaviours.filter(b=>b.start==='interact').map(b=>`「${b.host}」`).join('・')}を操作します。`,'動作確認を止めて、Hierarchyで操作部分を選び、Interactivityグラフを開きます。','各アクションの対象・値・かける時間を変更します。複製して使うときは、複製先の参照先も確認してください。']}});
}
function one(key:string,name:string,group:string,description:string,parts:SceneRecipePart[],actions:SceneRecipeAction[],label='動かす',extra:SceneRecipeBehaviour[]=[]){
 add(key,name,group,description,[...parts,...button('操作ボタン',label)], [behaviour('操作ボタン',description,actions),...extra]);
}
function light(name:string,position:Vec3,color='#e0f2fe',intensity=5):Extract<SceneRecipePart,{kind:'light'}>{
 return {kind:'light',name,position,light:{lightType:'point',color,intensity,distance:7,decay:2,castShadow:false}};
}
function sound(name:string,audioId='ambientHum',loop=true):Extract<SceneRecipePart,{kind:'audio'}>{
 return {kind:'audio',name,position:[0,.6,0],audio:{audioId,autoplay:false,loop,volume:.5,spatial:true,refDistance:2,maxDistance:14}};
}
function fixture(name='展示物',material:string=M.blue):Extract<SceneRecipePart,{kind:'model'}>{return model(name,'catalog-vase',[0,.15,0],material);}
function returnMotion(part:string,property:'position'|'rotation'|'scale',away:Vec3,rest:Vec3,duration=1):SceneRecipeAction[]{
 return [w(part,'transform',property,away,{duration}),w(part,'transform',property,rest,{duration,after:'done',delay:1.2})];
}
const frame=[box('左支柱',[-.51,.6,0],[.1,1.2,.16]),box('右支柱',[.51,.6,0],[.1,1.2,.16]),box('上枠',[0,1.22,0],[1.12,.1,.16])];
// 8 motion mechanisms: distinct axes, assemblies, and time sequences.
one('rotating-divider','回転式の間仕切り','扉・動き','ボタンで間仕切りを90度回し、待ってから元に戻します。',
 [...frame,model('回転パネル','catalog-tile',[0,.12,0],mat('clearcoat-wood'),[1,1.18,1])],returnMotion('回転パネル','rotation',[0,90,0],[0,0,0]),'回転する');
one('lifting-shutter','上がって戻るシャッター','扉・動き','ルーバーのシャッターが上へ動き、開いた状態で待ってから下がります。',
 [...frame,model('シャッター','catalog-shutter',[0,.13,0],M.slate)],returnMotion('シャッター','position',[0,1.2,0],[0,.13,0]),'開く');
one('split-gate','左右に開くゲート','扉・動き','左右のパネルを同時に開き、時間を合わせて閉じます。',
 [...frame,model('左扉','catalog-tile',[-.23,.13,0],M.blue,[.5,1.2,1]),model('右扉','catalog-tile',[.23,.13,0],M.violet,[.5,1.2,1])],
 [w('左扉','transform','position',[-.74,.13,0],{duration:1}),w('右扉','transform','position',[.74,.13,0],{duration:1}),w('左扉','transform','position',[-.23,.13,0],{duration:1,after:'done',delay:1.5}),w('右扉','transform','position',[.23,.13,0],{duration:1})],'ゲートを開く');
one('display-turntable','一周する展示ターンテーブル','扉・動き','展示用の花器を4秒で一周させ、向きをリセットします。',
 [model('回転台','catalog-pedestal',[0,.02,0],M.slate),fixture('展示花器',mat('clearcoat-ceramic'))],
 [w('展示花器','transform','rotation',[0,360,0],{duration:4}),w('展示花器','transform','rotation',[0,0,0],{after:'done'})],'一周見る');
one('display-lift','上下する展示リフト','扉・動き','台座と宝石を一緒に持ち上げ、ゆっくり元の高さへ戻します。',
 [model('昇降台','catalog-pedestal',[0,.04,0],M.slate),model('宝石','catalog-gem',[0,.18,0],mat('crystal'))],
 [w('昇降台','transform','position',[0,.55,0],{duration:1.4}),w('宝石','transform','position',[0,.69,0],{duration:1.4}),w('昇降台','transform','position',[0,.04,0],{duration:1.4,after:'done',delay:1}),w('宝石','transform','position',[0,.18,0],{duration:1.4})],'持ち上げる');
one('pullout-tray','手前に引き出すトレイ','扉・動き','トレイを手前へ引き出してから収納します。位置補間の見本です。',
 [box('収納台',[0,.4,-.1],[1,.8,.7]),model('トレイ','catalog-tile',[0,.75,0],mat('pbr-wood'),[1,.18,1])],returnMotion('トレイ','position',[0,.75,.48],[0,.75,0],1.1),'引き出す');
one('rotor-spin','回して止めるローター','扉・動き','4枚羽根を3回転させ、停止時に初期角度へ戻します。',
 [model('機械台','catalog-pedestal',[0,.03,0],M.slate),model('羽根','catalog-rotor',[0,.6,0],mat('brushed-metal'))],
 [w('羽根','transform','rotation',[0,1080,0],{duration:4}),w('羽根','transform','rotation',[0,0,0],{after:'done'})],'回す');
one('pendulum-display','往復する振り子','扉・動き','回転方向を切り替えて、吊り下げたパネルを左右に揺らします。',
 [box('吊り台',[0,1.15,0],[1.15,.06,.1]),{...model('振り子','catalog-tile',[0,1.1,0],M.orange,[.32,.72,1]),rotation:[0,0,Math.PI]}],
 [w('振り子','transform','rotation',[0,0,155],{duration:.7}),w('振り子','transform','rotation',[0,0,205],{duration:1.1,after:'done'}),w('振り子','transform','rotation',[0,0,180],{duration:.7,after:'done'})],'揺らす');
// 5 visibility/material state examples.
one('reveal-treasure','宝石を表示・非表示','表示・質感','台座の宝石を、同じボタンで表示・非表示に切り替えます。',
 [model('台座','catalog-pedestal',[0,.1,0],M.slate),{...model('隠れた宝石','catalog-gem',[0,.24,0],mat('dispersion-jewel')),startsDisabled:true}],
 [toggle('隠れた宝石','entity','enabled')],'表示を切り替える');
one('swap-exhibit','2つの展示物を切り替え','表示・質感','花器と宝石を交互に表示します。2つのEntityをまとめて切り替える例です。',
 [fixture('花器',mat('clearcoat-ceramic')),{...model('結晶','catalog-gem',[0,.15,0],mat('crystal')),startsDisabled:true}],
 [toggle('花器','entity','enabled'),toggle('結晶','entity','enabled')],'展示を切り替える');
one('material-fade','消えて戻る展示物','表示・質感','MaterialのOpacityを下げて消し、元の不透明度へ戻します。',
 [fixture('展示物',mat('clearcoat-wood'))], [w('展示物','material','opacity',0,{duration:1.2}),w('展示物','material','opacity',1,{duration:1.2,after:'done',delay:.7})],'フェードする');
one('scale-reveal','拡大して戻るミニチュア','表示・質感','宝石を拡大し、見せた後に元のサイズへ戻します。',
 [model('ミニチュア','catalog-gem',[0,.12,0],mat('iridescence-pearl'),[.45,.45,.45])],returnMotion('ミニチュア','scale',[1.2,1.2,1.2],[.45,.45,.45],.8),'拡大する');
one('toggle-label','案内ラベルを切り替え','表示・質感','作品だけを残して案内文を隠す、Textの表示切替です。',
 [fixture('作品',mat('clearcoat-ceramic')),text('案内文','CERAMIC / 作品の説明',[0,1.2,0])], [toggle('案内文','text','enabled')],'説明を切り替える');
// 7 lighting examples. Emissive and Light are deliberately separate targets.
add('lamp-dimmer','3段階の調光パネル','照明・発光','弱・中・強のボタンで、同じLightの明るさを変えます。',
 [fixture('ランプ',mat('neon-tube')),light('灯り',[0,.75,.3]),...button('弱','弱',-.7),...button('中','中',0),...button('強','強',.7)],
 [1,4,10].map((n,i)=>behaviour(['弱','中','強'][i],'照明の強さを変更',[w('灯り','light','intensity',n,{duration:.5})])));
add('lamp-temperature','暖色・寒色の照明','照明・発光','暖かい色と冷たい色で、同じ花器の見え方を比べます。',
 [fixture('白い花器',M.white),light('照明',[0,.8,.65]),...button('暖色','暖色',-.45),...button('寒色','寒色',.45)],
 [behaviour('暖色','暖かい照明',[w('照明','light','color','#ffb46b',{duration:.6})]),behaviour('寒色','冷たい照明',[w('照明','light','color','#80bfff',{duration:.6})])]);
one('timed-lamp','ゆっくり消えるタイマー灯','照明・発光','灯りを明るくし、2秒待ってからゆっくり暗くします。',
 [fixture('照明カバー',mat('clear-glass')),light('タイマー灯',[0,.55,0],'#ffd9a0',.2)],
 [w('タイマー灯','light','intensity',7,{duration:.35}),w('タイマー灯','light','intensity',.2,{duration:2,after:'done',delay:2})],'灯りをつける');
one('neon-pulse','Emissiveのパルス','照明・発光','ネオンの発光強度を上げ、ゆっくり元へ戻します。Lightは変更しません。',
 [model('ネオン','catalog-arch',[0,.15,0],mat('neon-tube'))],
 [w('ネオン','material','emissiveIntensity',14,{duration:.4}),w('ネオン','material','emissiveIntensity',1,{duration:1.6,after:'done'})],'発光する');
one('warning-beacon','3回点灯する警告灯','照明・発光','短い間隔でLightを3回点灯し、最後に消灯します。',
 [model('警告灯カバー','catalog-bottle',[0,.1,0],mat('volume-amber'),[.65,.7,.65]),{...light('警告灯',[0,.5,0],'#ff6a16',6),startsOff:true}],
 [0,1,2].flatMap(i=>[w('警告灯','light','enabled',true,i?{delay:.35}:{}),w('警告灯','light','enabled',false,{delay:.25})]),'警告する');
one('runway-lights','順番に点く誘導灯','照明・発光','3つの誘導灯を左から順に点灯し、まとめて消します。',
 [-.65,0,.65].flatMap((x,i)=>[model(`誘導灯${i}`,'catalog-ring',[x,.2,0],M.white,[.6,.6,.6]),{...light(`光${i}`,[x,.4,.15],'#7dd3fc',4),startsOff:true}]),
 [w('光0','light','enabled',true),w('光1','light','enabled',true,{delay:.35}),w('光2','light','enabled',true,{delay:.35}),w('光0','light','enabled',false,{delay:1.3}),w('光1','light','enabled',false),w('光2','light','enabled',false)],'順番に点灯');
one('color-transition','色が移る展示ランプ','照明・発光','青から紫、暖色へとLightの色を補間し、最初の色へ戻します。',
 [fixture('展示花器',M.white),light('カラー照明',[0,.9,.6],'#80bfff',7)],
 [w('カラー照明','light','color','#b28dff',{duration:1}),w('カラー照明','light','color','#ffba7a',{duration:1,after:'done'}),w('カラー照明','light','color','#80bfff',{duration:1,after:'done'})],'色を巡る');
// 4 audio controls; all files are bundled, never placeholder URLs.
const speaker=[model('スピーカー面','catalog-ring',[0,.35,0],M.slate),box('スピーカー箱',[0,.67,-.1],[.85,1.15,.35],M.charcoal)];
add('audio-transport','音の再生・停止パネル','音','同じAudio Sourceを再生・一時停止・停止する、基本の音声操作です。',
 [...speaker,sound('音源'),...button('再生','再生',-.7),...button('一時停止','一時停止',0),...button('停止','停止',.7)],
 ['play','pause','stop'].map((v,i)=>behaviour(['再生','一時停止','停止'][i],'音源を操作',[w('音源','audio-source','playback',v)])));
one('audio-fade','フェードイン・アウトする音','音','ループ音を小さく始めて大きくし、フェードアウトして止めます。',
 [...speaker,sound('音源')], [w('音源','audio-source','volume',0),w('音源','audio-source','playback','play'),w('音源','audio-source','volume',.6,{duration:2}),w('音源','audio-source','volume',0,{duration:2,after:'done',delay:1}),w('音源','audio-source','playback','stop',{after:'done'})],'音量を変える');
add('sound-palette','2種類の効果音を聴く','音','チャイムとクリックを別々のAudio Sourceで鳴らします。',
 [...speaker,sound('チャイム音','pressChime',false),sound('クリック音','softClick',false),...button('チャイム','チャイム',-.45),...button('クリック','クリック',.45)],
 [behaviour('チャイム','ベルを鳴らす',[w('チャイム音','audio-source','playback','play')]),behaviour('クリック','クリックを鳴らす',[w('クリック音','audio-source','playback','play')])]);
one('delayed-chime','待ってから鳴るチャイム','音','表示を「待機中」に変え、2秒後に音と完了メッセージを出します。',
 [...speaker,text('状態表示','READY',[0,1.3,0]),sound('完了音','pressChime',false)],
 [w('状態表示','text','text','待機中…'),w('完了音','audio-source','playback','play',{delay:2}),w('状態表示','text','text','完了しました'),w('状態表示','text','text','READY',{delay:2})],'タイマー開始');
// 6 particle controls. Initial rate=0 is authored, not hidden in the preview.
function particle(name:string,presetId:string):Extract<SceneRecipePart,{kind:'particle'}>{return {kind:'particle',name,presetId,position:[0,.32,0],overrides:{maxParticles:240,emission:{rateOverTime:0,bursts:[]}}};}
const emitterBase=[model('エミッター台','catalog-pedestal',[0,.12,0],M.slate)];
for(const d of [
 {key:'magic-burst',name:'魔法の粒子を放つ',preset:'magic',seconds:1.2,rate:95,description:'ボタンを押すと、短時間だけ魔法の粒子を放出します。'},
 {key:'spark-jet',name:'火花の短い噴射',preset:'spark',seconds:.5,rate:180,description:'火花を0.5秒だけ放出します。放出時間と粒子の寿命を分けて調整できます。'},
 {key:'fountain-control',name:'止められる小さな噴水',preset:'fountain',seconds:4,rate:90,description:'水しぶきを4秒間出し、その後に放出を止める噴水です。'},
 {key:'snow-globe',name:'一時的に雪を降らせる',preset:'snow',seconds:3,rate:65,description:'ボタンで雪を3秒間降らせます。残った粒子は寿命が来ると消えます。'},
 {key:'steam-release',name:'蒸気を抜くバルブ',preset:'steam',seconds:2,rate:38,description:'バルブ操作で白い蒸気を2秒間放出します。'},
 {key:'petal-shower',name:'桜の花びらシャワー',preset:'sakura',seconds:3,rate:55,description:'花びらを3秒間放出して止めます。歓迎や場面転換の演出に使えます。'},
]) one(d.key,d.name,'パーティクル',d.description,[...emitterBase,particle('粒子',d.preset)],
 [w('粒子','particle','emitting',true),w('粒子','particle','emissionRate',d.rate),w('粒子','particle','emissionRate',0,{delay:d.seconds})],'放出する');
// 4 text-focused examples; strings go through the real graph string writer.
add('reception-status','受付のOPEN・CLOSED表示','案内・テキスト','受付の状態と文字色を、2つのボタンで切り替えます。',
 [model('サイン板','catalog-tile',[0,.23,-.05],M.charcoal,[1.6,.8,1]),text('受付表示','OPEN',[0,.72,.04],.15),...button('営業中','OPEN',-.45),...button('受付終了','CLOSED',.45)],
 [behaviour('営業中','受付を開く',[w('受付表示','text','text','OPEN'),w('受付表示','text','color','#86efac')]),behaviour('受付終了','受付を閉じる',[w('受付表示','text','text','CLOSED'),w('受付表示','text','color','#fda4af')])]);
one('countdown-sign','3・2・1のカウントダウン','案内・テキスト','数字を1秒ずつ切り替え、GOの表示とチャイムを出します。',
 [text('カウント','READY',[0,.8,0],.25),sound('開始音','pressChime',false)],
 [w('カウント','text','text','3'),w('カウント','text','text','2',{delay:1}),w('カウント','text','text','1',{delay:1}),w('カウント','text','text','GO!',{delay:1}),w('開始音','audio-source','playback','play'),w('カウント','text','text','READY',{delay:2})],'カウント開始');
add('bilingual-guide','日本語・英語の案内切替','案内・テキスト','同じTextの案内文を、日本語と英語で切り替えます。',
 [text('案内板','ようこそ。ご自由にご覧ください。',[0,.8,0],.11),...button('日本語','日本語',-.45),...button('English','English',.45)],
 [behaviour('日本語','日本語で案内',[w('案内板','text','text','ようこそ。ご自由にご覧ください。')]),behaviour('English','英語で案内',[w('案内板','text','text','Welcome. Please enjoy the exhibition.')])]);
one('temporary-caption','数秒だけ出る説明文','案内・テキスト','ボタンを押すと詳しい説明を表示し、4秒後に短い案内へ戻します。',
 [fixture('作品',mat('clearcoat-ceramic')),text('キャプション','ボタンで作品の説明を表示',[0,1.27,0],.08)],
 [w('キャプション','text','text','釉薬のある陶器。反射と表面の凹凸をご覧ください。'),w('キャプション','text','text','ボタンで作品の説明を表示',{delay:4})],'説明を見る');
// 5 combinations with coordinated targets and an explicit final resting state.
one('welcome-sequence','光・文字・音のウェルカム','組み合わせ','歓迎の文字、ライト、チャイムを同時に出し、数秒後に元へ戻します。',
 [text('メッセージ','WELCOME',[0,1.05,0],.15),light('歓迎ライト',[0,.6,.25],'#80bfff',1),sound('歓迎音','pressChime',false),model('ゲート','catalog-arch',[0,.1,0],mat('neon-tube'))],
 [w('メッセージ','text','text','ようこそ！'),w('歓迎ライト','light','intensity',8,{duration:.6}),w('歓迎音','audio-source','playback','play'),w('メッセージ','text','text','WELCOME',{delay:3}),w('歓迎ライト','light','intensity',1,{duration:.6})],'歓迎する');
one('treasure-reward','宝石と紙吹雪のごほうび','組み合わせ','隠れた宝石を表示し、紙吹雪と音を出した後、元の状態へ戻します。',
 [model('台座','catalog-pedestal',[0,.1,0],M.slate),{...model('ごほうび','catalog-gem',[0,.24,0],mat('dispersion-cut')),startsDisabled:true},particle('紙吹雪','confetti'),sound('達成音','pressChime',false)],
 [w('ごほうび','entity','enabled',true),w('紙吹雪','particle','emissionRate',100),w('達成音','audio-source','playback','play'),w('紙吹雪','particle','emissionRate',0,{delay:.7}),w('ごほうび','entity','enabled',false,{delay:3})],'ごほうび');
one('scan-station','上下するスキャン展示','組み合わせ','リングが展示物を上下に走査し、スキャン中と完了の表示を切り替えます。',
 [fixture('検査対象',mat('brushed-metal')),{...model('スキャンリング','catalog-ring',[0,.28,-.468],mat('neon-tube'),[1.2,1.2,1.2]),rotation:[Math.PI/2,0,0]},text('進行表示','READY',[0,1.23,0])],
 [w('進行表示','text','text','SCANNING'),...returnMotion('スキャンリング','position',[0,.98,-.468],[0,.28,-.468],1.2),w('進行表示','text','text','COMPLETE',{after:'done'}),w('進行表示','text','text','READY',{delay:2})],'スキャンする');
one('stage-cue','展示のスポット演出','組み合わせ','作品を少し大きくし、照明と案内文を切り替えてから元へ戻します。',
 [fixture('主役',mat('iridescence-pearl')),light('展示照明',[0,.9,.5],'#e0f2fe',2),text('作品名','STANDBY',[0,1.35,0])],
 [w('作品名','text','text','FEATURED'),w('展示照明','light','intensity',9,{duration:.5}),w('主役','transform','scale',[1.15,1.15,1.15],{duration:.7}),w('主役','transform','scale',[1,1,1],{duration:.7,after:'done',delay:2}),w('展示照明','light','intensity',2,{duration:.5,after:'done'}),w('作品名','text','text','STANDBY')],'作品を紹介');
one('door-status','音と状態表示がある扉','組み合わせ','扉を開き、OPENを表示し、閉じた後にCLOSEDへ戻します。',
 [...frame,model('扉パネル','catalog-tile',[0,.13,0],mat('clearcoat-carbon'),[1,1.2,1]),text('扉の状態','CLOSED',[0,1.43,0]),sound('扉の音','doorSlide',false)],
 [w('扉の音','audio-source','playback','play'),w('扉の状態','text','text','OPENING'),w('扉パネル','transform','position',[.9,.13,0],{duration:1}),w('扉の状態','text','text','OPEN',{after:'done'}),w('扉の状態','text','text','CLOSING',{delay:2}),w('扉の音','audio-source','playback','play'),w('扉パネル','transform','position',[0,.13,0],{duration:1}),w('扉の状態','text','text','CLOSED',{after:'done'})],'扉を開く');

export const EXTENDED_GIMMICK_RECIPES:readonly SceneRecipe[]=recipes;
