# Scripting Contract

## 目的

制作者が Entity へ振る舞いを与えられるようにする。Script は TypeScript で書き、Editor の Play で実行し、
同じ Script を公開ワールドへも出力して実 XRift 上で動かす。Play と公開で挙動が食い違わないことを契約とする。

本書は [Visual Editor Architecture 4.8](./VISUAL_EDITOR_ARCHITECTURE.md#48-scripting-script-asset--script-component)
が定めた例外範囲の実装契約である。ここに書かれていない形の任意コード実行は行わない。

## 分離の原則

Particle Asset と同じ関係を採る。再利用可能な定義は Asset、Entity 固有の値は Component が持つ。

| | 持つもの | 持たないもの |
| --- | --- | --- |
| Script Asset | `kind: "script"`、`contractVersion`、`language`、`source.kind = "project"` の相対 path | コード本文、派生した property schema |
| Script Component | `scriptAssetId`、宣言済み property 値、`assetReferences`、`entityReferences`、`runIn` | コード、関数、式 |

コード本文は project 内の `scripts/` 以下の source file が正本である。AssetManifest には参照だけを置く。
property schema は source から導出して Editor State に持ち、manifest へ保存しない。

この分離には実務上の理由がある。manifest の entry を本文編集に対して不変にしておくことで、Script の保存は
その Script を使う Entity だけを compile・再起動できる。AssetManifest を変更した場合も依存関係を逆引きし、
変更した Material / Particle / Texture などを参照する Entity だけの runtime 世代を上げる。

## 永続化する情報

`ScriptAsset` は次を保持する。

- `id`: Scene と Prefab が参照する安定した Asset ID
- `contractVersion`: 本書の契約版。読み込み時に厳密一致で検証する
- `language`: `ts` または `tsx`
- `source`: `kind: "project"` と project root 相対の `/` 区切り path。OS 絶対 path、Blob URL、token を保存しない

`ScriptComponent` は次を保持する。

- `scriptAssetId`: 参照先 Script Asset
- `properties`: 宣言済み property への値。純 JSON かつ有限数に限る
- `assetReferences` / `entityReferences`: property が参照する Asset と Entity の ID
- `runIn`: 現在は `play`。schema の `play-and-edit` は将来予約で、Inspector では選択できず実行もしない

1 Entity へ複数の Script Component を付けられる。実行順は Entity 階層順、次に Entity 内の Component 並び順で確定する。

## オーサリング API

```ts
import { defineScript, prop } from "xrift:script";
import { Vector3 } from "three";

export default defineScript({
  name: "Spinner",
  props: {
    speed: prop.number({ default: 1, min: 0, max: 20 }),
    axis: prop.vec3({ default: [0, 1, 0] }),
    target: prop.entity(),
    hit: prop.asset({ kind: "audio" }),
  },
  start(ctx) {
    const axis = new Vector3(...ctx.props.axis);
    return {
      update(dt) { ctx.object3d.rotateOnAxis(axis, ctx.props.speed * dt); },
      stop() {},
      dispose() {},
    };
  },
});
```

lifecycle 名は Architecture 4.6 の `RuntimePlugin` に揃える。

React Three Fiber で宣言的な見た目を追加したい場合は、同じ module から `Render` を export する。
Entity の group の子として mount され、`start` と併用できる。フレーム更新は必ず `start` が返す `update(delta)` に置く。
R3F の `useFrame` callback は React の Error Boundary 外で動いて Script 単位に隔離できないため、Play と公開の両方で blocking にする。

```tsx
import type { ScriptRenderProps } from "xrift:script";

export const Render = ({ ctx }: ScriptRenderProps) => {
  return (
    <mesh name={`script-${ctx.entity.id}`} position={[0, 1, 0]}>
      <sphereGeometry args={[0.15]} />
      <meshStandardMaterial color="#38bdf8" />
    </mesh>
  );
};
```

`Render` は `start(ctx)` の成功後に mount され、同じ live `ctx` を `{ ctx }` として受け取る。
宣言固有の property 型が必要な場合は `ScriptRenderProps<MyPropDeclaration>` を使う。
Inspector / MCP の property 変更時は `Render` も新しい `ctx.props` で再描画される。TSX source は
Script Asset の `language: "tsx"` と `.tsx` path を持つ。組み込み `model-display` はこの入口から
宣言済み Model URL を `useGLTF` / `Clone` へ渡す例であり、依存fileを内包した GLB を推奨する。

### ScriptContext

| 名前 | 内容 |
| --- | --- |
| `entity` | `id`、`name`、`enabled` |
| `object3d` | この Entity の group |
| `scene` / `camera` / `renderer` | 実行中の Three.js オブジェクト |
| `props` | 宣言した property の値。Play 中の Inspector / MCP 変更は再起動せず次の frame から反映される |
| `time` | `elapsed` と `delta`。`delta` は 0.1 秒で上限を切る |
| `input` | キーボードのみ |
| `lifecycle` | Script instance が所有する AbortSignal、timer、async task、cleanup |
| `find(entityId)` | `entityReferences` に宣言した Entity だけを引ける |
| `assets` | `assetReferences` に宣言した Asset の URL 解決、基本 Texture 読み込み、Audio再生 |
| `materials` | この Entity が所有する Mesh の Material を Play 中だけ変更する |
| `particles` | この Entity が所有する Particle Emitter を Play 中だけ再生・調整する |
| `getAssetUrl(ref)` | `assets.url(ref)` の非推奨 alias |
| `on` / `emit` | Script 間のイベント |
| `log` | Script Console へ出力する |

### 非同期処理と cleanup

hot reload、runtime failure、Play Stop、unmount のあとに古い callback が Entity を変更しないよう、
非同期処理は `ctx.lifecycle` へ登録する。

| API | 契約 |
| --- | --- |
| `signal` | Script 終了時に abort される `AbortSignal` |
| `onDispose(callback)` | 終了時の cleanup を登録し、返した関数で登録解除する。callback は Promise を返せる |
| `timeout(callback, ms)` | 所有された one-shot timer。終了時に自動解除する。callback は Promise を返せる |
| `interval(callback, ms)` | 所有された interval。終了時に自動解除する。callback は Promise を返せる |
| `task(run)` | signal を渡して Promise を実行し、終了後の結果を捨てる。未処理例外はその Script の `async` failure にする |

```ts
void ctx.lifecycle.task(async (signal) => {
  const texture = await ctx.assets.loadTexture(ctx.props.texture);
  if (signal.aborted || !texture) return;
  ctx.materials.setTexture("baseColor", texture);
});

ctx.lifecycle.interval(() => {
  ctx.emit("heartbeat");
}, 1_000);
```

`task` は通信や decoder 自体を強制終了しない。処理側が `signal` に対応する場合は必ず渡し、
完了後に Scene を変更する前にも `signal.aborted` を確認する。global の `setTimeout` や追跡していない Promise を直接使った場合は
host の所有外であり、自動 cleanup と例外帰属の保証を受けない。
`onDispose`、`timeout`、`interval` が返した Promise の rejection も、登録元の Entity / Script の
`async` failure として Script Console と MCP runtime report へ帰属する。

### Texture / Material の実行時操作

Texture は property で明示参照してから読み込む。Script が project 内の任意 Asset を走査したり、path を直接組み立てたりする API は提供しない。

```ts
import { defineScript, prop } from "xrift:script";

export default defineScript({
  name: "TexturePulse",
  props: {
    texture: prop.asset({ kind: "texture" }),
    tint: prop.color({ default: "#ffffff" }),
    speed: prop.number({ default: 1, min: 0, max: 20 }),
  },
  start(ctx) {
    void ctx.lifecycle.task(async (signal) => {
      const texture = await ctx.assets.loadTexture(ctx.props.texture, {
        colorSpace: "srgb",
        wrapS: "repeat",
        wrapT: "repeat",
      });
      if (signal.aborted || !texture) return;
      texture.repeat.set(2, 2);
      ctx.materials.setTexture("baseColor", texture);
    });

    return {
      update(dt) {
        ctx.object3d.rotation.y += ctx.props.speed * dt;
        ctx.materials.setColor(ctx.props.tint);
      },
    };
  },
});
```

Inspector で `texture` を選ぶと、その ID は `properties.texture` と `assetReferences` の両方へ入る。
MCP から設定する場合も `update_script_component` へ property 値と完全な `assetReferences` を渡す。
宣言していない ID に対する `assets.url` は `null`、`assets.loadTexture` は `null` を返す Promise になり、project 内の別 Asset へ到達しない。

`assets` は次を提供する。

| API | 契約 |
| --- | --- |
| `url(assetId)` | 明示参照した project Asset の実行時 URL。解決できない場合は `null` |
| `loadTexture(assetId, options?)` | PNG、JPEG、WebP などブラウザが通常の画像として decode できる Texture を読み込む |
| `loadAudio(assetId, options?)` | 明示参照した MP3 / WAV の lifecycle-owned player を返す |

`loadTexture` の options は `colorSpace: "auto" | "srgb" | "linear"`、
`wrapS` / `wrapT: "repeat" | "clamp-to-edge" | "mirrored-repeat"`、`flipY: boolean` である。
返した Texture は `offset`、`repeat`、`center`、`rotation` を Three.js と同じ形で調整できる。同一 Script instance 内では
Asset ID と options ごとに cache し、Script の再起動または Stop で自動的に dispose する。

Material / Particle の preview と `ctx.assets.loadTexture` は別の読み込み経路である。Studio の preview は project source を
Tauri IPC で読み、`importMetadata.sourceFormat` または拡張子が KTX2 なら、Studio に同梱した Basis JS / WASM で変換する。
OpenBrush の `source.kind = "builtin"` Texture は project path がなくても同梱 URL から表示できる。どちらも preview のために
CDN を必要としない。`classic-jsx` の生成物も KTX2 を使う場合は固定した Basis file を
`public/xrift-studio/vendor/three-basis/` へ出力し、XRift の `baseUrl` から解決する。

この対応は Material / Particle の preview と生成物の描画経路に限る。Script の `ctx.assets.loadTexture` は引き続き
Three.js の標準 `TextureLoader` を使うため、KTX2 / HDR / EXR を typed Texture として返さない。

### Audio の実行時操作

`loadAudio` は `prop.asset({ kind: "audio" })` と `assetReferences` に入れた Audio だけを開く。
options は `volume`（0..1）、`loop`、正の `playbackRate`、`preload: "none" | "metadata" | "auto"` である。
返す `ScriptAudio` は `play()`、`pause()`、`stop()`、`seek()`、`setVolume()`、`setLoop()`、
`setPlaybackRate()` と、read-only の `playing`、`currentTime`、`duration` を持つ。

ブラウザの自動再生規則により `play()` は reject しうる。ユーザー入力後に呼び、必要なら
`ctx.lifecycle.task` 内で await して Script Console へ理由を残す。Script の再起動、失敗、Stop、
unmount では host が全playerを停止し、sourceを解放する。Studio Playと公開生成物は同じ実装を使う。

`materials` は Script Component を付けた Entity 自身が所有する Mesh だけを対象にする。子 Entity の Mesh は含めない。
共有 Material Asset を直接変更せず runtime 用 clone へ次の override を重ねる。

| API | 操作 |
| --- | --- |
| `count()` | 対象 Material 数を返す |
| `list()` | `meshName`、Meshの0始まりtraversal index、Material slot index、`materialName`を列挙する |
| `select({ meshName?, meshIndex?, materialIndex? })` | 指定した条件すべてに一致するMaterialだけを操作するhandleを返す |
| `setColor(value)` | base color を変更する |
| `setOpacity(value)` | opacity を 0 から 1 の範囲で変更する |
| `setEmissive(value, intensity?)` | emissive color と任意の強度を変更する |
| `setMetalness(value)` | metalness を 0 から 1 の範囲で変更する |
| `setRoughness(value)` | roughness を 0 から 1 の範囲で変更する |
| `setTexture(slot, textureOrNull)` | `baseColor`、`normal`、`emissive`、`metallicRoughness`、`occlusion` の slot を変更する。`null` で外す |
| `reset()` | `ctx.materials`ではこのScript全体、選択handleではそのhandleのMaterial overrideを取り除く |

setter の返り値は対応して変更した Material 数である。未対応の Material property は無視する。
`select`の名前条件は同名Meshすべてに一致し、index条件は現在のowned Mesh traversalを対象にする。
handleは非同期に追加されたMeshにも追従するため、Modelの読み込み完了を待って作り直す必要はない。
同じ Entity に複数 Script がある場合は Component の実行順で override を合成し、後の Script が同じ property を変更した値を採用する。
Script の再起動または Stop では、その Script の override だけを外し、最後の Script が終了した時点で元の Material へ戻す。

### Particle の実行時操作

`particles` は Script Component を付けた Entity 自身が所有する Particle Emitter を対象にする。
Particle Asset の値を変更せず、Component 実行順で runtime override を重ねる。

| API | 操作 |
| --- | --- |
| `count()` | 対象 Particle Emitter 数を返す |
| `play()` / `pause()` | 現在の simulation を再生・一時停止する |
| `stop()` | simulation を停止し、表示中の粒子を消す |
| `restart()` | この Script の restart command を発行し、経過時間を 0 へ戻す |
| `setEmissionRate(value)` | 1 秒あたりの生成数を変更する |
| `setSpeedMultiplier(value)` | 初速の倍率を変更する |
| `setSizeMultiplier(value)` | 表示サイズの倍率を変更する |
| `setColor(value)` / `setOpacity(value)` | Material 側の色と不透明度を変更する |
| `reset()` | この Script instance の Particle override を取り除く |

Studio Play と `classic-jsx` で生成した World / Item は
`packages/xrift-studio-runtime/src/script/particle.tsx` の同じ実装を使用する。
Runtime JSON を出力する `classic-runtime` mode は Script と Particle を表現できないため、どちらも blocking 診断にする。
Script ごとの `restart()` counter は共有 bridge が global revision へ変換するため、複数 Script が同じローカル番号を発行しても
command が相殺されない。Script の再起動または Stop では、その Script の override だけを外す。

Particle Asset の `maxParticles` は 1 から **10,000**、`duration` は 0.01 から 600 秒へ正規化する。
pool は `maxParticles` を越えて確保しない。continuous emission は同じ slot を再利用し、`looping: false` では
`duration` まで新しい粒子を生成したあと、すでに生まれた粒子が `startLifetime` を終えるまで表示を続ける。
`rateOverTime: 0` の burst-only emitter も動作し、`time`、`count`、`cycles`、`interval` を duration 内で展開する。
`looping: true` では同じ burst schedule を duration ごとに繰り返す。continuous slot が pool を使い切った場合や、
burst の合計が残り容量を越えた場合は、後ろの burst から上限で切られる。

`ctx.particles.setEmissionRate` は authored emission 全体に対する runtime override である。override が有効な間は
指定した continuous rate を使い、authored burst は発生しない。burst へ戻すには `ctx.particles.reset()` を呼ぶか
Script を再起動する。

### 実行時変更と永続編集

| 変更経路 | 保存 | Play 中の反映 | Stop / 再起動 |
| --- | --- | --- | --- |
| `ctx.materials`、`ctx.particles`、読み込んだ Texture の transform | runtime-only。document revision は変えない | setter を呼んだ時点から対象 Entity に反映 | その Script の override を外し、元の Asset 値へ戻る |
| Script Component の宣言済み property | Scene document | 同じ Script instance の `ctx.props` へ次の frame から反映 | 保存値として残る |
| Script source、Script / Asset / Entity 参照、Component 構成 | source / Scene document | compile 成功後、影響する Entity だけを再起動。失敗時は last-good module を継続 | 保存値として残る |
| 既存 Material / Particle Asset の property | AssetManifest | Inspector または MCP から保存し、その Asset を参照する Entity / Emitter だけを再反映 | 保存値として残る |
| 既存 Texture Asset の import settings | AssetManifest | MCP から保存し、直接参照または Material / Particle 経由で参照する Entity だけを再起動 | 保存値として残る |
| Entity / Component の追加・更新・削除・有効化 | Scene document | Inspector または MCP から保存し、影響する Entity だけを再起動 | 保存値として残る |
| Scene settings | Scene document | MCP の `update_scene_settings` から共有 Scene view へ即時反映 | 保存値として残る |

Play 中の Inspector で永続編集できる Asset property は、現時点では既存の Material / Particle Asset に限る。
Texture source の新規 import と Inspector からの Texture import settings 変更は Edit に戻って行う。
MCP の `update_texture_asset` は同じ Play session 中でも永続化でき、Texture を直接参照する Entity と
Material / Particle 経由で参照する Entity だけを再起動する。`import_texture_asset` は atomic import と
thumbnail 生成を伴うため Edit 限定である。Scene settings の Inspector は Play 中 read-only のままだが、MCP の `update_scene_settings` は
同じ Play session 中でも永続化と即時反映に対応する。MCP は `set_material` と `create_document_asset` を含むほかの対応済み write も実行できる。
runtime 演出を保存したい場合は値を `ctx.*` から読み戻す仕組みはないため、Inspector または次の永続 MCP tool へ同じ値を明示する。

MCP client は最初に `get_scripting_capabilities` を呼ぶと、利用可能な Script API、Texture slot、参照制限、
作成から Play までの tool 順序と、Play 中に永続化できる操作を機械可読な形で取得できる。

| 目的 | MCP tool |
| --- | --- |
| 現在の ID、mode、revision、Script 診断を読む | `get_editor_context` |
| Script API と trust / persistence capability を読む | `get_scripting_capabilities` |
| Script を作成・適用・更新する | `list_script_templates`、`create_script_asset`、`apply_script_template`、`get_script_asset`、`update_script_asset` |
| Script の property / 明示参照を更新する | `update_script_component` |
| ローカル画像を Texture Asset として追加する | `import_texture_asset` |
| Texture Asset の設定を取得・更新する | `get_texture_asset`、`update_texture_asset` |
| Material を Mesh slot へ割り当てる | `set_material` |
| Material Asset を作成する | `create_document_asset(kind: "material")` |
| Material Asset を読み、PBR / Texture binding を保存する | `get_material_asset`、`update_material_asset` |
| Material Texture の offset / scale / rotation / UV set を保存する | `set_material_texture_transform` |
| Particle Asset を作成・取得・更新する | `create_document_asset(kind: "particle")`、`get_particle_asset`、`update_particle_asset` |
| Scene settings を取得・部分更新する | `get_editor_context.sceneSettings`、`update_scene_settings` |
| Component 構成を取得・変更する | `list_component_definitions`、`get_entity_components`、`add_component`、`update_component`、`remove_component`、`set_entity_enabled` |

`update_material_asset.patch` は `pbrMetallicRoughness`、normal / occlusion / emissive Texture、
`emissiveFactor`、alpha、double-sided、KHR material extensions と、移行用の
`color` / `opacity` / `metalness` / `roughness` / 各 `*TextureId` を受ける。
`set_material_texture_transform` の slot は `baseColor`、`metallicRoughness`、`normal`、`occlusion`、`emissive`、
変更値は `offset`、`scale`、`rotationDegrees`、`texCoord` または `reset` である。

`update_particle_asset.patch` は `maxParticles`、`duration`、`looping`、`prewarm`、`simulationSpace`、
start delay / lifetime / speed / size / rotation、gravity、emission、shape、color / size / velocity over lifetime、
renderer を受ける。renderer の `materialAssetId` / `textureAssetId` は存在する正しい kind の Asset だけを受け付ける。

`update_scene_settings` は `skybox`、`fog`、`ambient`、`camera`、`editor` を任意に組み合わせた
non-empty patchとして受ける。Skyboxは表示、IBL、projection、既存Texture参照、gradient、回転、反転、露出、
有限mesh transformを、Editor sectionは背景、grid、gizmo size、snapを更新できる。
`skybox.imageAssetId` はAssetManifestに存在し、project sourceを持つTexture（または移行前のSkybox）だけを受け付け、
`null`で参照とIBLを解除する。色、有限値、範囲、Fog / Cameraのnear-far関係は確定前に検証する。

同じScene settings Inspectorに表示される公開title / descriptionはProject metadata、thumbnailはnative binary fileであり、
SceneDocument.settingsではないためこのtoolへ混在させない。Directional / Point / Spot LightもEntity Componentであり、
`get_entity_components` / `update_component`の対象である。これらをScene settingsとして暗黙に変更しない。
`import_texture_asset` は信頼できる絶対 `sourcePath` と現在の revision を受け、PNG、JPEG、WebP、AVIF、GIF、
BMP、SVG、KTX2 の通常 file だけを 128 MB 上限で読み込む。最終 entry の symlink、相対 path、未対応拡張子を拒否し、
既存 import と同じ signature / SVG external-reference 検査、content-addressed destination、atomic commit、
thumbnail 生成を通す。MCP 応答には外部 path と file bytes を返さず、管理下の project-relative path と Asset ID だけを返す。
同一 source hash が存在する場合は複製せず既存 Texture を返す。

`update_texture_asset.patch` は `colorSpace`、`generateMipmaps`、`flipY`、`resize`、
`sampler.wrapS / wrapT / magFilter / minFilter`、`compression.format / quality` を受ける。
未知 field、enum 外の値、非有限値、範囲外の max size / quality は document を変えず拒否する。
Mipmaps を無効にした時の mipmap filter は既存モデルと同じく `linear` へ正規化する。

基本手順は `get_editor_context`、`list_script_templates`、`create_script_asset` または `apply_script_template`、
`add_component`、`update_script_component`、`set_play_mode` の順である。すべての write へ
`projectId`、`sceneId`、`expectedRevision` を渡し、write 後は `get_editor_context` で最新 revision と
`scriptRuntime` を取り直す。Play 中の対応済み write は直ちに authoring data へ保存され、
Scene settingsは共有Scene viewへ即時反映し、Component / Entity 変更はその Entity、
Material / Texture / Particle Asset 変更は参照 Entity だけを再起動する。

MCP から生成・更新した Script も別の安全領域では動かない。`get_scripting_capabilities` の
`sandboxed: false`、`trustGate: false` を前提に、信頼していない source はユーザーへ file 内容を示して明示許可を得るまで
Play しない。

## 組み込み Template

Assets の Create > Script と MCP は同じ versioned catalog を使う。作成画面では source preview を確認でき、
Entity を選択している場合は Script Asset と Script Component を 1 回の履歴操作で作成できる。

| ID | 用途 | 追加設定 |
| --- | --- | --- |
| `blank` | 最小 lifecycle | なし |
| `rotate` | 軸と速度を Inspector からリアルタイム変更 | なし |
| `float` | 上下移動 | なし |
| `keyboard-move` | WASD / 矢印キー移動 | なし |
| `follow-entity` | 明示参照した Entity を追従 | Entity 参照 |
| `material-pulse` | 色、発光、粗さの animation | Mesh Renderer |
| `texture-scroll` | Texture 読み込みと UV scroll | Texture Asset と Mesh Renderer |
| `particle-control` | 再生、Emission、速度、サイズ、色 | Particle Emitter |
| `model-display` | 宣言済みGLBをTSX `Render`へ読み込み、速度をリアルタイム変更 | Model Asset |
| `audio-hotkey` | 宣言済みAudioを指定キーで再生／停止し、音量・速度・loopを変更 | Audio Asset |
| `event-visibility` | Script event で表示切替 | なし |

`create_script_asset` は `templateId` または任意 `source` のどちらかを受け取る。Templateはcatalogの
`language`に従って`.ts` / `.tsx`を選び、任意のJSX sourceでは`language: "tsx"`を明示する。
`apply_script_template` は Script Asset の作成と指定 Entity への Component 追加を 1 revision で行う。
未知の template ID、存在しない Entity / Folder、古い revision では document を変更しない。

## property の種別

Inspector のフィールドは宣言から自動生成する。種別は既存の Component field 種別の語彙に揃える。

`string`、`number`、`boolean`、`enum`、`vec2`、`vec3`、`color`、`asset`、`entity`

`asset` と `entity` は既存 Component にはない種別であり、Script のために追加する picker を使う。
選択結果は `assetReferences` / `entityReferences` にも反映し、参照の検証と削除時の影響調査へ乗せる。

宣言を静的に読み取れない Script は、値を推測せず「property を読み取れません」と理由を示す。コードは実行しない。

## モジュール解決

許可した specifier は、Studio が既に読み込んでいる同一 module インスタンスへ解決する。

`three`、`@react-three/fiber`、`@react-three/drei`、`@react-three/rapier`、`@xrift/world-components`、`react`、`xrift:script`

`three` を二重にロードすると `instanceof` と R3F の突き合わせが壊れ、同じ Scene を共有できない。
この解決は公開先でも同じで、公開ワールドは共有 singleton を前提とする。

`https://` から始まる module を解決する内部 opt-in はあるが、現在の Editor UI / MCP からは有効化しない。
通常の Play は offline で完結し、remote module を blocking にする。**公開時は常に blocking 診断**とし、対象 Script と理由を示す。
動的 `import(...)` と `useFrame` も Play / 公開の両方で blocking にする。

## 対応範囲

| 操作 | Studio Play | `classic-jsx` で生成した World / Item | 永続化 | 現在の入口 |
| --- | --- | --- | --- | --- |
| number / color / vector などの property 変更 | 対応。次の frame から同じ instance へ反映 | 対応。compile 時の値を初期値として使用 | Scene document | Inspector / MCP |
| 明示参照した Asset の URL 解決 | 対応 | 対応 | なし | `ctx.assets.url` |
| PNG / JPEG / WebP など基本 Texture の読み込み | 対応 | 対応 | なし | `ctx.assets.loadTexture` |
| MP3 / WAV Audio の再生・停止・seek・音量・loop・再生速度 | 対応 | 対応 | runtime-only | `ctx.assets.loadAudio` |
| 宣言済みGLBをTSX `Render`で表示 | 対応 | 対応 | source | `ctx.assets.url` + `useGLTF` / `Clone` |
| Texture の repeat / offset / rotation | 対応 | 対応 | runtime-only | 読み込んだ Texture |
| Entity 自身の Material の color / opacity / emissive / metalness / roughness | 対応 | 対応 | runtime-only | `ctx.materials` |
| Entity 自身の Material への Texture 設定 | 対応 | 対応 | runtime-only | `ctx.materials.setTexture` |
| Entity 自身の Particle の再生 / Emission / 速度 / サイズ / 色 | 対応 | 対応 | runtime-only | `ctx.particles` |
| Particle Asset の burst-only / loop / non-loop duration | 対応。上限 10,000 particles | 対応。同じ runtime 実装 | AssetManifest | Inspector / `update_particle_asset` |
| project KTX2 を使う Material / Particle の描画 | 対応。local Basis transcoder | 対応。Basis file を生成物へ同梱 | AssetManifest | Asset / Material / Particle Inspector |
| Material / Particle Asset property の Play 中の永続編集 | 対応。参照 Entity だけ再反映 | 次回の生成へ反映 | AssetManifest | Inspector / MCP |
| Texture Asset import settings の Play 中の永続編集 | 対応。依存する Entity だけ再起動 | 次回の生成へ反映 | AssetManifest | `update_texture_asset` |
| Entity / Component 構成の Play 中の永続編集 | 対応。影響 Entity だけ再起動 | 次回の生成へ反映 | Scene document | Inspector / MCP |
| 明示参照した別 Entity の取得 | 対応 | 対応 | なし | `ctx.find` |
| React Three Fiber の宣言的な描画追加 | 対応 | 対応 | source | named export `Render`。`useFrame` は不可 |
| Material Asset 自体の編集 | Script API では未対応 | Script API では未対応 | 対応 | Inspector / Material MCP tools |
| Material Asset ID をそのまま runtime Material として適用 | 未対応 | 未対応 | なし | 今後の typed loader / recipe |
| KTX2、HDR、EXR の Script 専用読み込み | 未対応 | 未対応 | なし | 現在は Asset / Scene Inspector。専用 loader は今後 |
| Model のimperative typed loader | 未対応。TSX `Render`は対応 | 未対応。TSX `Render`は対応 | なし | 今後のAsset種別別facade |

対応する。

- Play での実行と、Play 中の source 編集による該当 Entity だけのホットリロード
- Stop では実行中の blob module とresourceを破棄し、同一sourceのTypeScript変換結果だけを
  128件のbounded cacheへ残す。次のPlayはtop-level codeと`start`を必ず新しいmoduleとして実行し直す
- Play 中の Entity / Component 構成と Material / Texture / Particle Asset property の永続変更、および参照 Entity だけへの差分反映
- 1 Entity へ複数 Script
- 公開ワールドへの静的 import としての出力
- host が管理する `start` / `update` / `ctx.on` と React の `Render` render error を Script 単位で隔離
- Inspector / MCP で変更した宣言済み property の frame 単位の反映
- 明示参照した基本 Texture / Audio、TSX RenderのModel表示、Entity 単位のruntime Material / Particle override
- local / builtin Texture の Material / Particle preview と、local Basis transcoder を使う KTX2 preview / 公開描画

対応しない。

- 物理 API は World project だけ。Item project は重力と RigidBody を持たないため未対応として degrade する
- 入力はキーボードのみ。pointer lock、マウス移動、gamepad の配線は存在しない
- runtime JSON 出力では Script を表現できないため blocking 診断とする
- 任意 npm package の import。staging へ install できる package は固定の許可リストに限る
- Script から公式 XRift Component を imperative に操作する API は初版では提供しない
- Script から Material Asset の recipe を永続変更することと、Material Asset を ID だけで一括適用すること
- Script API からの `KTX2Loader`、`HDRLoader`、`EXRLoader` のように decoder や renderer 設定を伴う Texture loader
- Asset 一覧の列挙、未宣言 Asset の読み込み、project path の直接参照
- `Render` 内の `useFrame`。フレーム処理は host が隔離する `start().update(delta)` を使う

## 実行環境の権限と限界

**Script は完全に隔離されていない。** この節の内容を「sandbox 済み」と表示してはならない。

Play は iframe や Worker を挟まないアプリと同一 realm で動き、`withGlobalTauri` により IPC bridge が `window` に露出している。
したがって Script は原理的にアプリと同じ権限、すなわちファイルシステムとシェルへの到達手段を持ちうる。

緩和は二段構えを完成条件とする。

1. module scope で `window`、`globalThis`、`self`、`document`、`fetch`、`XMLHttpRequest`、`Function`、
   `importScripts`、`__TAURI__`、`__TAURI_INTERNALS__` を遮蔽する。ES module は strict mode のため
   `eval` を lexical binding として遮蔽できず、隔離境界にはならない。同一 realm である以上、ほかの遮蔽も回避可能であり、
   事故と素朴な悪用を止める緩和にすぎない。
2. 取り込み、Prefab、Starter、外部 Store 由来の Script は、初回 Play の前に対象 file を示して実行許可を求める。
   許可は project 単位で記録する。許可しなければ実行せずに Play へ入る。

現時点で実装済みなのは 1 の accidental-access mitigation だけであり、2 の来歴・信頼ゲート（MI-73）は未実装である。
したがって外部から受け取った project / Prefab の Script を、内容を確認せず Play してはならない。
来歴ゲートが入るまで「安全な sandbox」「外部 Script を安全に実行できる」と UI や MCP capability で表現しない。

自分で書いた Script を自分の環境で動かす限りは、これは通常のローカル開発と同じ危険度である。
危険なのは他人の project や Prefab を開いた場合であり、来歴ゲートはそこを守るために置く。

## 既知の課題

- 完全な隔離は未対応。実現するには realm を分ける必要があり、Three.js インスタンス共有と両立しない
- Monaco と TypeScript service は local 同梱済みで offline でも動く。Play変換は軽量な`transpileModule`、
  Editor補完と診断はlanguage-service workerへ分離している。Architecture 10 章が求める CSP は未適用で、
  Play の blob module と共有 module bridge を許可しながら権限を狭める方針が残っている
- Script の `ctx.assets.loadTexture` は Three.js の標準 `TextureLoader` を使う。Material / Particle preview と
  `classic-jsx` の KTX2 描画は local Basis transcoder に対応済みだが、KTX2、HDR、EXR、動画 Texture、cube Texture、
  renderer capability に応じた transcoding、進捗と再試行を含む Script 用 typed loader は未対応
- `ctx.materials` は Mesh に既に設定された Material の runtime clone を操作する。Material Asset の recipe 全体、
  shader 固有 uniform、複数 UV set の選択は未対応
- Particle は Studio と公開で共通実装になり、burst の時刻 / cycle / interval と non-looping duration に対応した。
  ただし world-space simulation、per-particle size / rotation、stretched billboard、sort mode は互換表示であり、
  完全な simulation ではない。pool は 10,000 particles が上限で、容量を越える burst は切られる
- `ctx.particles.setEmissionRate` は authored burst と加算する API ではなく、burst を抑止して continuous rate を
  runtime override する。burst と continuous rate を同時に動的編集する API は未対応
- Texture 読み込み失敗は `null` で返る。Asset 名、format、decode error をまとめた Script Console 診断と
  preload / loading state の標準化が必要
- Script Console は Script Editor 内で compile / lifecycle / event / Render の失敗と `ctx.log` を表示し、
  MCP の `get_editor_context.scriptRuntime` からも JSON-safe な直近結果を取得できる。現時点ではsource mapによる行・列、
  同一例外の集約、個別Scriptの再開操作は未対応
- `play-and-edit`、pointer / mouse / gamepad は未対応
- `ctx.lifecycle` を使わない `Promise.then`、global timer、Render の pointer / physics callback など、host の所有外で
  開始した非同期 callback の例外帰属と自動停止は未対応
- 公開先プラットフォームが upload された bundle を審査または sandbox するかは未確認。Studio 側の検査は存在しない

## 公開

Script source と host adapter を staging の overlay file として出力し、生成した `src/World.tsx` または
`src/Item.tsx` から静的 import で参照する。

- `.ts` / `.js` は静的 Asset として許可されないため、必ず overlay file として出す
- 生成物に `eval`、`Function`、動的 import を出さない
- host adapter と authoring API は単一の実装を正本とし、Editor Play と生成物で二重管理しない
- 生成した World / Item の Scene subtree は Play と同じ `XriftScriptRoot` で包み、各 Component は同じ
  `XriftScriptHost` へ default Script、任意の named `Render`、property、実行順、明示参照を渡す
- `assetReferences` のうち staging へ copy した Asset だけを決定的な URL map へ入れ、
  XRift の `baseUrl` で解決してから `ctx.assets.url` / `loadTexture` を Play と同じ参照 gate へ通す
- KTX2 を参照する Material / Particle がある場合は pinned Basis JS / WASM を staging の
  `public/xrift-studio/vendor/three-basis/` へ copy し、`useKTX2` の transcoder path を XRift の `baseUrl` で解決する
- Entity group へ安定 ID を付け、`entityReferences` に宣言した ID だけを `ctx.find` で解決する
- World / Item instance ごとの scope marker 内だけを探索し、同じ Item を複数配置しても別 instance の Entity を返さない
- Texture cache / dispose、Audio停止・解放、Material clone / restore、frame 更新と event bus は host の lifecycle に属し、
  Play の Stop と公開 world の unmount で同じ cleanup を行う
- 出力は staging の build で型検査される。Script の型エラーは公開を止めるため、upload 前に Studio 側で提示する
- 同じ入力から同じ出力を得る決定性を維持する。識別子は hash 由来とし、挿入順や時刻に依存させない
- Prefab instance は合成 ID で事前展開されるため、Script instance の同一性は展開後の Component ID から導出する

## 参照

- 例外範囲の定義: [Visual Editor Architecture 4.8](./VISUAL_EDITOR_ARCHITECTURE.md#48-scripting-script-asset--script-component)
- 状態設計: [UX Interactions F-28](./UX_INTERACTIONS.md)
- 実行 lifecycle: Visual Editor Architecture 4.6 `RuntimePlugin`
