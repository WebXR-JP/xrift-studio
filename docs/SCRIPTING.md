# Scripting Contract

## 目的

制作者はTypeScriptのスクリプトでオブジェクトの動作を作れる。Editorの動作確認と公開ワールドには同じスクリプトを使い、XRift上でも同じ挙動になることを本書の契約とする。

本書は [ビジュアルエディターArchitecture 4.8](./VISUAL_EDITOR_ARCHITECTURE.md#48-scripting-script-asset--script-component)
が定めた例外範囲の実装契約である。ここに書いていない形での任意コード実行は行わない。

## 分離の原則

パーティクルと同じ分け方にする。再利用できる定義は素材が持つ。オブジェクト固有の値はコンポーネントが持つ。

| | 持つもの | 持たないもの |
| --- | --- | --- |
| スクリプト | `kind: "script"`、`contractVersion`、`language`、`source.kind = "project"`の相対path | コード本文、派生したproperty schema |
| スクリプトのコンポーネント | `scriptAssetId`、宣言済みproperty値、`assetReferences`、`entityReferences`、`runIn` | コード、関数、式 |

コード本文はproject内の`scripts/`以下の元データfileが正本である。AssetManifestには参照だけを置く。
property schemaは元データから導出する。Editor Stateが持ち、manifestへは保存しない。

スクリプト本文を編集してもmanifestの項目は変更しない。保存時は、そのスクリプトを使うオブジェクトだけをcompileして再起動する。AssetManifestを変更した場合も依存関係を逆引きし、変更したマテリアル / パーティクル / テクスチャなどを参照するオブジェクトだけ、実行環境の世代を更新する。

## 永続化する情報

`ScriptAsset`は次を保持する。

- `id`: シーンとプレハブが参照する安定した素材ID
- `contractVersion`: 本書の契約版。読み込み時に厳密一致で検証する
- `language`: `ts`または`tsx`
- `source`: `kind: "project"`とproject root相対の`/`区切りpath。OS絶対path、Blob URL、tokenを保存しない

`ScriptComponent`は次を保持する。

- `scriptAssetId`: 参照先スクリプト
- `properties`: 宣言済みpropertyへの値。純JSONかつ有限数に限る
- `assetReferences` / `entityReferences`: propertyが参照する素材とオブジェクトのID
- `runIn`: 現在は`play`。schemaの`play-and-edit`は将来予約で、設定では選択できず実行もしない

1つのオブジェクトには複数のスクリプトのコンポーネントを付けられる。実行順はオブジェクト階層順で決まる。次にオブジェクト内のコンポーネント並び順で決まる。

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

lifecycle名はArchitecture 4.6の`RuntimePlugin`に揃える。

React Three Fiberで宣言的な見た目を追加する場合は、同じmoduleから`Render`をexportする。
オブジェクトのgroupの子としてmountする。`start`と併用できる。フレーム更新は`start`が返す`update(delta)`に置く。
R3Fの`useFrame` callbackはReactのError Boundaryの外で動く。そのためスクリプト単位に隔離できない。動作確認と公開の両方でblockingにする。

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

`Render`は`start(ctx)`の成功後にmountする。同じlive `ctx`を`{ ctx }`として受け取る。
宣言固有のproperty型が要る場合は`ScriptRenderProps<MyPropDeclaration>`を使う。
設定 / MCPでpropertyを変えたときは`Render`も新しい`ctx.props`で再描画する。TSX元データは
スクリプトの`language: "tsx"`と`.tsx` pathを持つ。組み込み`model-display`はこの入口から
宣言済み3DモデルURLを`useGLTF` / `Clone`へ渡す例だ。依存fileを内包したGLBを推奨する。

### ScriptContext

| 名前 | 内容 |
| --- | --- |
| `entity` | `id`、`name`、`enabled` |
| `object3d` | このオブジェクトのgroup |
| `scene` / `camera` / `renderer` | 実行中のThree.jsオブジェクト |
| `props` | 宣言したpropertyの値。動作確認中の設定 / MCP変更は再起動せず次のframeから反映される |
| `time` | `elapsed`と`delta`。`delta`は0.1秒で上限とする |
| `input` | 既存スクリプト互換用の低レベルキーボード状態。XRift公式shortcutと競合しうるため組み込みTemplateでは使わない |
| `lifecycle` | スクリプトinstanceが所有するAbortSignal、timer、async task、cleanup |
| `find(entityId)` | `entityReferences`に宣言したauthoredオブジェクトだけを引ける。player / avatarは対象外 |
| `assets` | `assetReferences`に宣言した素材のURL解決、基本テクスチャ読み込み、音声再生 |
| `audioSources` | このオブジェクトが所有する音源を動作確認中だけ再生・調整する |
| `materials` | このオブジェクトが所有するメッシュのマテリアルを動作確認中だけ変更する |
| `lights` | このオブジェクトが所有するライトの点灯、色、強度、距離を動作確認中だけ変更する |
| `particles` | このオブジェクトが所有するパーティクルの放出を動作確認中だけ再生・調整する |
| `viewer` | このスクリプトを実行しているビューアーの画面表示を動作確認中だけ変える。他のビューアーへは同期しない |
| `getAssetUrl(ref)` | `assets.url(ref)`の非推奨alias |
| `on` / `emit` | スクリプト間のイベント |
| `log` | スクリプトConsoleへ出力する |

### 非同期処理と cleanup

hot reload、実行時の失敗、動作確認の停止、unmountのあとに古いcallbackがオブジェクトを変えないようにする。
そのため非同期処理は`ctx.lifecycle`へ登録する。

| API | 契約 |
| --- | --- |
| `signal` | スクリプト終了時にabortされる`AbortSignal` |
| `onDispose(callback)` | 終了時のcleanupを登録し、返した関数で登録解除する。callbackはPromiseを返せる |
| `timeout(callback, ms)` | 所有されたone-shot timer。終了時に自動解除する。callbackはPromiseを返せる |
| `interval(callback, ms)` | 所有されたinterval。終了時に自動解除する。callbackはPromiseを返せる |
| `task(run)` | signalを渡してPromiseを実行し、終了後の結果を捨てる。未処理例外はそのスクリプトの`async` failureにする |

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

`task`は通信やデコーダー自体を強制終了しない。処理側が`signal`に対応する場合は必ず渡す。
完了後にシーンを変える前にも`signal.aborted`を確認する。globalの`setTimeout`や追跡していないPromiseを直接使った場合は
hostの所有外になる。自動cleanupと例外帰属の保証を受けない。
`onDispose`、`timeout`、`interval`が返したPromiseのrejectionも、登録元のオブジェクト / スクリプトの
`async` failureとして扱う。スクリプトConsoleとMCP実行環境reportへ記載する。

### テクスチャ / マテリアルの実行時操作

テクスチャはpropertyで明示参照してから読み込む。project内の任意素材を走査するスクリプト用のAPIはない。pathを直接組み立てるスクリプト用のAPIもない。

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
        magFilter: "linear",
        minFilter: "linear-mipmap-linear",
        generateMipmaps: true,
      });
      if (signal.aborted || !texture) return;
      ctx.materials.setTexture("baseColor", texture);
      ctx.materials.setTextureTransform("baseColor", {
        repeat: [2, 2],
        offset: [0, 0],
      });
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

設定で`texture`を選ぶと、そのIDは`properties.texture`と`assetReferences`の両方へ入る。
MCPから設定する場合も`update_script_component`へproperty値と完全な`assetReferences`を渡す。
宣言していないIDに対する`assets.url`は`null`を返す。`assets.loadTexture`は`null`を返すPromiseになる。project内の別素材へは到達しない。

`assets`は次を提供する。

| API | 契約 |
| --- | --- |
| `url(assetId)` | 明示参照したproject素材の実行時URL。解決できない場合は`null` |
| `loadTexture(assetId, options?)` | PNG、JPEG、WebPなどブラウザが通常の画像としてdecodeできるテクスチャを読み込む |
| `loadAudio(assetId, options?)` | 明示参照したMP3 / WAVのlifecycle-owned playerを返す |

`loadTexture`は参照先テクスチャの`importSettings`を実行時の既定値にする。
optionを省略した項目は素材の値を継承する。スクリプトで明示した項目だけをその読み込みに対して上書きする。

| option | 値 |
| --- | --- |
| `colorSpace` | `"auto"`、`"srgb"`、`"linear"` |
| `wrapS` / `wrapT` | `"repeat"`、`"clamp-to-edge"`、`"mirrored-repeat"` |
| `magFilter` | `"nearest"`、`"linear"` |
| `minFilter` | `"nearest"`、`"linear"`、4種のmipmap filter |
| `flipY` / `generateMipmaps` | `boolean` |

`generateMipmaps: false`とmipmapを必要とする`minFilter`を組み合わせた場合は、実行時に
`minFilter: "linear"`へ正規化する。同一スクリプトinstance内では素材IDと解決後のoptionごとにcacheする。
スクリプトの再起動または停止で自動的にdisposeする。

返した`ScriptTexture`はThree.jsテクスチャと互換のtransform fieldを持つ。マテリアル上のUV演出には
`ctx.materials.setTextureTransform`を使う。このAPIはマテリアル枠ごとの所有cloneを作る。
そのため同じテクスチャを使う別slot、別オブジェクト、共有テクスチャを変更しない。

マテリアル / パーティクルのpreviewと`ctx.assets.loadTexture`は別の読み込み経路だ。Studioのpreviewはproject元データを
Tauri IPCで読む。`importMetadata.sourceFormat`または拡張子がKTX2なら、Studioに同梱したBasis JS / WASMで変換する。
OpenBrushの`source.kind = "builtin"`テクスチャはproject pathがなくても同梱URLから表示できる。どちらもpreviewのために
CDNを必要としない。生成物もKTX2を使う場合は固定したBasis fileをワールドへ同梱する。
生成JavaScriptと同じ公開バージョンのディレクトリから解決する。

デコーダーを要する形式はKTX2だけではない。Draco圧縮した3Dモデルはデコーダーを同梱する。
どの形式が何を必要とするかは`src/lib/visual-editor/vendor-assets.ts`の表が一箇所だけで持つ。
同梱の要否はstagingへcopyする素材の事実から決める。生成コードに特定のhelper名が
現れるかでは決めない。出力モードごとに生成物の形が違うため、文字列一致は片方の出力モードで
外れることがある。`classic-runtime`ではRuntime manifestの`decoders`が同じ場所を示す。
loaderはmanifestからの相対で解決する。

### 公開物はワールド直下にしか置けない

公開したワールドが配信するのは、ワールド直下のファイルだけだ。`public/`のサブ
ディレクトリは公開物に含まれない。置いても404になる。素材のコピー先が
`public/xrift-studio-<assetId>-<file>`のように平坦なのはこのためだ。デコーダー、
フォント、Runtime manifestも同じく直下へ置く。デコーダーはファイル名がloader側で
固定されている（DRACOLoaderは`draco_wasm_wrapper.js`、KTX2Loaderは
`basis_transcoder.js`をデコーダーpathへ足す）。そのため名前はそのまま直下に置く。
pathには生成JavaScriptと同じ公開ディレクトリを渡す。名前が固定でない同梱物は、他のファイルと
ぶつからないよう接頭辞を付ける。

公開コードの`import.meta.url`からその公開バージョンのディレクトリを決め、3Dモデル、テクスチャ、
音声、フォント、デコーダー、スクリプト、Runtime manifestで共有する。XRift側の画面更新中に古い
ワールドが残っても、新しい`baseUrl`と古いファイル名を組み合わせない。Viteのソースモジュール
など、HTTPで配信されたJavaScript以外では従来どおりXRiftの`baseUrl`を使う。

この対応はマテリアル / パーティクルのpreviewと生成物の描画経路に限る。スクリプトの`ctx.assets.loadTexture`は引き続き
Three.jsの標準`TextureLoader`を使う。そのためKTX2 / HDR / EXRをtypedテクスチャとして返さない。

### 音声の実行時操作

`loadAudio`は`prop.asset({ kind: "audio" })`と`assetReferences`に入れた音声だけを開く。
optionsは`volume`（0..1）、`loop`、正の`playbackRate`、`preload: "none" | "metadata" | "auto"`である。
返す`ScriptAudio`は`play()`、`pause()`、`stop()`、`seek()`、`setVolume()`、`setLoop()`、
`setPlaybackRate()`と、read-onlyの`playing`、`currentTime`、`duration`を持つ。

ブラウザの自動再生規則により`play()`はrejectしうる。ユーザー入力後に呼ぶ。必要なら
`ctx.lifecycle.task`内でawaitし、スクリプトConsoleへ理由を残す。スクリプトの再起動、失敗、停止、
unmountではhostが全playerを停止する。元データを解放する。Studio動作確認と公開生成物は同じ実装を使う。

`ctx.assets.loadAudio`はスクリプトが所有する独立playerを新しく作る入口だ。オブジェクトに保存済みの
音源コンポーネントを操作する場合は`ctx.audioSources`を使う。別のplayerを二重に作らない。
`ctx.audioSources`はスクリプトのコンポーネントを付けたオブジェクト自身の音源だけを対象にする。子オブジェクトは含めない。

| API | 操作 |
| --- | --- |
| `count()` | 対象音源数を返す |
| `list()` | `componentId`、`audioAssetId`、spatial、再生状態、現在位置、長さ、音量、loopを列挙する |
| `select({ componentId?, audioAssetId? })` | 指定した条件すべてに一致する音源だけを操作するhandleを返す |
| `play()` | 対象を再生し、開始できた件数をPromiseで返す |
| `pause()` / `stop()` | 一時停止、または停止して先頭へ戻し、対象件数を返す |
| `seek(seconds)` | 有限かつ0以上の秒へ移動し、対象件数を返す |
| `setVolume(value)` / `setLoop(value)` | 動作確認中の音量とloopを上書きし、対象件数を返す |
| `reset()` | このスクリプト、または選択handleが持つ実行環境overrideを取り除く |

handleは同じオブジェクトで後から追加・更新された音源にも選択条件を適用する。同じオブジェクトに複数スクリプトがある場合は
コンポーネント実行順でoverrideを合成する。後のスクリプトが同じfieldを変更した値を採用する。`play()`は例外を外へ投げない。
実際に再生を開始できた件数を必ずresolveする。ユーザー操作要件で拒否された元ファイルは件数に含めない。
`list()`の`status: "autoplay-blocked"`で確認できる。画面操作後に再度`play()`を呼べる。
スクリプトの再起動、実行時の失敗、停止では、そのownerの再生要求、seek、volume、loop overrideを外す。
音源コンポーネントに保存した値へ戻す。音声素材とシーンdocumentは変更しない。

### ライトと近接イベントの実行時操作

`ctx.lights`はスクリプトのコンポーネントを付けたオブジェクト自身のライトだけを対象にする。子オブジェクトは含めない。
disabledのライトにも動作確認中のbridgeを残す。そのためスクリプトから一時的に点灯できる。

| API | 操作 |
| --- | --- |
| `count()` / `list()` | 対象ライト数と`componentId`、`lightType`、有効状態、色、強度、距離を返す |
| `select({ componentId?, lightType? })` | 条件をすべて満たすライトのlive handleを返す |
| `setEnabled(value)` | 動作確認中の点灯状態を変更する |
| `setColor(value)` | 動作確認中の色を変更する |
| `setIntensity(value)` | 0以上へ正規化した強度を変更する |
| `setDistance(value)` | Point / Spotライトの距離を変更し、対応した件数だけを返す |
| `reset()` | このスクリプトまたは選択handleのoverrideを外す |

同一スクリプトでは最後に変更したfieldを優先する。複数スクリプトではコンポーネント実行順が後のownerを優先する。
スクリプトの再起動、実行時の失敗、停止ではそのownerだけを外す。設定 / MCPで保存したライト値へ戻す。
Studio動作確認と`classic-jsx`は同じ`XriftScriptLight`とbridgeを使う。動作確認中にライトの
enabled、color、intensity、shadow、距離、減衰、角度、半影、Area sizeを保存しても既存実行環境へ反映する。
`lightType`の変更、コンポーネント追加・削除だけ対象オブジェクトを再起動する。

`ctx.on` / `ctx.emit`は同じ`XriftScriptRoot`内だけの実行環境event busだ。
KHR_interactivityとシーンdocumentには接続しない。payloadはcloneも永続化もしない。

Graphと連携するときは`ctx.graph.on(name, handler)` / `ctx.graph.emit(name)`を使う。
Graphの`event/send`と同名の通知をスクリプトで受け、スクリプトから送った通知はGraphの
`event/receive`で受ける。Graph側ではeventのIDまたは名前を一致させる。
同じThree.jsシーン内だけで動き、Studio動作確認と公開ワールドは同じ実装を使う。
通知は値を渡さず、保存・再送・他のビューアーへの同期もしない。Graphへの通知は
フレームごとにまとめて処理し、処理中に生じた通知は次のフレームへ送る。
スクリプトの停止・失敗・再起動で購読は自動解除される。返された関数でも解除できる。
既存の`ctx.on` / `ctx.emit`は引き続きスクリプト間のpayload付きイベントに使う。
任意のTypeScriptとGraphの自動変換は提供しない。

```ts
start(ctx) {
  ctx.graph.on("door.open", () => {
    ctx.audioSources.play();
    ctx.graph.emit("door.opened");
  });
}
```

組み込み`proximity-event`はスクリプトのコンポーネントの`entityReferences`に明示したauthoredオブジェクトを
`getWorldPosition`で判定する。`xrift:proximity-state`へ`channel`、inside状態、`kind`を送る。
`event-light`は同じeventを受け取る。liveな`channel` propertyが一致した時だけライトを変える。
各sensorは`sourceEntityId`で別々に追跡する。そのため同じchannelの複数sensorのうち一つが範囲を出ても、
ほかが範囲内ならライトを維持する。`kind: "enter" | "exit"`は境界をまたいだ時だけ一度送る。
`kind: "sync"`はlive channel変更や後から起動したreceiverを同期する状態通知として分ける。
sensorの停止・削除時はその元データの`exit`を送る。そのためedge eventを滞在中に繰り返さない。
`object3d.position`は親local座標だ。近接判定へ直接使わない。現時点で実行環境player / avatarを
`ctx.find`するAPIはない。

`materials`はスクリプトのコンポーネントを付けたオブジェクト自身が所有するメッシュだけを対象にする。子オブジェクトのメッシュは含めない。
共有マテリアルを直接変更しない。実行環境用cloneへ次のoverrideを重ねる。

| API | 操作 |
| --- | --- |
| `count()` | 対象マテリアル数を返す |
| `list()` | `meshName`、メッシュの0始まりtraversal index、マテリアル枠index、`materialName`を列挙する |
| `select({ meshName?, meshIndex?, materialIndex? })` | 指定した条件すべてに一致するマテリアルだけを操作するhandleを返す |
| `setColor(value)` | base colorを変更する |
| `setOpacity(value)` | opacityを0から1の範囲で変更する |
| `setEmissive(value, intensity?)` | emissive colorと任意の強度を変更する |
| `setMetalness(value)` | metalnessを0から1の範囲で変更する |
| `setRoughness(value)` | roughnessを0から1の範囲で変更する |
| `setTexture(slot, textureOrNull)` | `baseColor`、`normal`、`emissive`、`metallicRoughness`、`occlusion`のslotを変更する。`null`で外す |
| `setTextureTransform(slot, transform)` | slotのテクスチャに`offset`、`repeat`、`center`、radianの`rotation`を部分上書きする |
| `resetTextureTransform(slot)` | 指定slotにこのhandleが付けたテクスチャtransformだけを取り除く |
| `reset()` | `ctx.materials`ではこのスクリプト全体、選択handleではそのhandleのマテリアルoverrideを取り除く |

setterの返り値は対応して変更したマテリアル数だ。未対応のマテリアルpropertyは無視する。
`select`の名前条件は同名メッシュすべてに一致する。index条件は現在のownedメッシュtraversalを対象にする。
handleは非同期に追加されたメッシュにも追従する。そのため3Dモデルの読み込み完了を待って作り直す必要はない。
同じオブジェクトに複数スクリプトがある場合はコンポーネントの実行順でoverrideを合成する。後のスクリプトが同じpropertyを変更した値を採用する。
`setTextureTransform`はrootの`ctx.materials`と`select(...)`が返すhandleの両方にある。値を省略したfieldは
現在のslot値を保つ。hostは対象マテリアル枠ごとにテクスチャcloneを所有する。元データテクスチャと共有素材を直接変更しない。
`resetTextureTransform(slot)`はそのslotだけを元のtransformへ戻す。
スクリプトの再起動または停止では、そのスクリプトのcloneとoverrideだけを外す。最後のスクリプトが終了した時点で元のマテリアルへ戻す。

### パーティクルの実行時操作

`particles`はスクリプトのコンポーネントを付けたオブジェクト自身が所有するパーティクルの放出を対象にする。
パーティクルの値は変更しない。コンポーネント実行順で実行環境overrideを重ねる。

| API | 操作 |
| --- | --- |
| `count()` | 対象パーティクルの放出数を返す |
| `play()` / `pause()` | 現在のsimulationを再生・一時停止する |
| `stop()` | simulationを停止し、表示中の粒子を消す |
| `restart()` | このスクリプトのrestart commandを発行し、経過時間を0へ戻す |
| `setEmissionRate(value)` | 1秒あたりの生成数を変更する |
| `setSpeedMultiplier(value)` | 初速の倍率を変更する |
| `setSizeMultiplier(value)` | 表示サイズの倍率を変更する |
| `setColor(value)` / `setOpacity(value)` | マテリアル側の色と不透明度を変更する |
| `reset()` | このスクリプトinstanceのパーティクルoverrideを取り除く |

Studio動作確認と`classic-jsx`で生成したワールド / アイテムは
`packages/xrift-studio-runtime/src/script/particle.tsx`の同じ実装を使用する。
Runtime JSONを出力する`classic-runtime` modeはスクリプトとパーティクルを表現できない。そのためどちらもblocking診断にする。
スクリプトごとの`restart()` counterは共有bridgeがglobal revisionへ変換する。そのため複数スクリプトが同じローカル番号を発行しても
commandが相殺されない。スクリプトの再起動または停止では、そのスクリプトのoverrideだけを外す。

パーティクルの`maxParticles`は1から10,000、`duration`は0.01から600秒へ正規化する。
poolは`maxParticles`を越えて確保しない。continuous emissionは同じslotを再利用する。`looping: false`では
`duration`まで新しい粒子を生成する。そのあとすでに生まれた粒子が`startLifetime`を終えるまで表示を続ける。
`rateOverTime: 0`のburst-only emitterも動作する。`time`、`count`、`cycles`、`interval`をduration内で展開する。
`looping: true`では同じburst scheduleをdurationごとに繰り返す。continuous slotがpoolを使い切った場合や、
burstの合計が残り容量を越えた場合は、後ろのburstから上限で切る。

`ctx.particles.setEmissionRate`はauthored emission全体に対する実行環境overrideだ。overrideが有効な間は
指定したcontinuous rateを使う。authored burstは発生しない。burstへ戻すには`ctx.particles.reset()`を呼ぶ。
またはスクリプトを再起動する。

### ビューアーごとの見え方

`ctx.viewer`は、シーン設定のうち「そのビューアーの画面表示」を実行時に上書きする。
シーン設定は全ビューアー共通だ。そのためポストエフェクトを有効にすると重い端末では見る側が自分で切れない。
`ctx.viewer`の書き込みは、そのスクリプトを実行しているクライアントの描画にだけ効く。他のビューアーへ同期しない。
ワールド作者は「画質を上げる」を用意し、選択を各自に委ねられる。

| API | 操作 |
| --- | --- |
| `setPostprocessing(enabled)` | ポストエフェクト全体を切り替える |
| `setBloom({ enabled?, strength?, radius?, threshold? })` | 発光を切り替え、強さ・広がり・しきい値を変える |
| `setAmbientOcclusion(enabled)` | 接地部分の陰影を切り替える |
| `setColorGrading(enabled)` | 色味の調整を切り替える |
| `setExposure(value)` | 露出を設定する。1が既定 |
| `setFog({ enabled?, color?, near?, far? })` | 距離フォグを切り替え、色と距離を変える |
| `setAmbient({ enabled?, color?, intensity? })` | 環境光を切り替え、色と強さを変える |
| `setSkybox({ enabled?, ibl?, exposure?, rotationDegrees? })` | 背景の表示、IBL、明るさ、水平回転を変える |
| `setCameraFov(degrees)` | 視野角を度で設定する |
| `reset()` | このスクリプトのviewer overrideを外す |

スクリプトの再起動、実行時の失敗、停止では、そのスクリプトのoverrideだけを外す。
再入室したビューアーはシーン設定の値を見る。値の合成は他のbridgeと同じくコンポーネント実行順だ。
同じfieldを後のスクリプトが上書きする。ノードグラフの`xrift/setProperty`が
書くシーンプロパティとも同じbridgeを共有する。そのためスクリプトとグラフが競合せず合成される。

環境光がシーンに無い場合、`setAmbient`は実行環境が所有するAmbientLightを追加する。
これがないと、環境光を切っているシーンでだけ「明るくする」が効かない。
空の背景画像そのものの差し替えはスクリプトAPIには無く、ノードグラフの
`skyboxImage`プロパティで行う。素材の解決先はサーフェスが持っており、スクリプトから
任意素材を空へ差し込むAPIは提供しない。

### 実行時変更と永続編集

| 変更経路 | 保存 | 動作確認中の反映 | 停止 / 再起動 |
| --- | --- | --- | --- |
| `ctx.audioSources`、`ctx.lights`、`ctx.materials`、`ctx.particles`、`ctx.viewer`、`setTextureTransform` | runtime-only。document revisionは変えない | setterを呼んだ時点から対象オブジェクトの所有player / ライト / cloneに反映 | そのスクリプトの再生要求、clone、overrideを外し、元のコンポーネント / 素材値へ戻る |
| スクリプトのコンポーネントの宣言済みproperty | シーンdocument | 同じスクリプトinstanceの`ctx.props`へ次のframeから反映 | 保存値として残る |
| スクリプト元データ、スクリプト / 素材 / オブジェクト参照、コンポーネント構成 | 元データ / シーンdocument | 保存済み元データをcompileし、成功後に影響するオブジェクトだけを再起動。失敗時はlast-good moduleを継続 | 保存値として残る |
| 既存マテリアル / パーティクルのproperty | AssetManifest | 設定またはMCPから保存し、その素材を参照するオブジェクト / Emitterだけを再反映 | 保存値として残る |
| 既存テクスチャのimport settings | AssetManifest | MCPから保存し、直接参照またはマテリアル / パーティクル経由で参照するオブジェクトだけを再起動 | 保存値として残る |
| ライトのコンポーネントのscalar property | シーンdocument | 設定またはMCPから保存し、既存ライト実行環境へ再起動なしで反映 | 保存値として残る |
| オブジェクト / コンポーネントの追加・削除、ライト種別、その他の構造変更 | シーンdocument | 設定またはMCPから保存し、影響するオブジェクトだけを再起動 | 保存値として残る |
| シーンsettings | シーンdocument | MCPの`update_scene_settings`から共有シーンへ即時反映 | 保存値として残る |

動作確認中の設定で永続編集できる素材propertyは、現時点では既存のマテリアル / パーティクルに限る。
テクスチャ元データの新規importと設定からのテクスチャimport settings変更は編集に戻って行う。
MCPの`update_texture_asset`は同じ動作確認session中でも永続化できる。テクスチャを直接参照するオブジェクトと
マテリアル / パーティクル経由で参照するオブジェクトだけを再起動する。`import_audio_asset`と`import_texture_asset`は
atomic importを伴う。そのため編集限定だ。シーンsettingsの設定は動作確認中read-onlyのままだ。一方MCPの`update_scene_settings`は
同じ動作確認session中でも永続化と即時反映に対応する。MCPは`set_material`と`create_document_asset`を含むほかの対応済みwriteも実行できる。
実行環境演出を保存したい場合は値を`ctx.*`から読み戻す仕組みはない。そのため設定または次の永続MCP toolへ同じ値を明示する。

MCP clientは最初に`get_scripting_capabilities`を呼ぶ。利用可能なスクリプトAPI、テクスチャslot、参照制限、
作成から動作確認までのtool順序と、動作確認中に永続化できる操作を機械可読な形で取得できる。

ライト / 音声 / テクスチャ / マテリアル操作は目的で入口を分ける。

| 目的 | スクリプト実行環境 | 永続MCP authoring |
| --- | --- | --- |
| 独立した音声playerを動作確認中だけ作る | `ctx.assets.loadAudio` | 対象外 |
| 保存済み音源を動作確認中だけ操作する | `ctx.audioSources`。同じオブジェクトのコンポーネントだけをowner単位で上書き | 対象外 |
| 音声素材を追加・確認する | 対象外 | 編集中の`import_audio_asset` / `get_audio_asset` |
| 音源オブジェクトを保存して配置する | 対象外 | `place_asset`。既存オブジェクトへは`add_component(definitionId: "core.audio-source")`後に`update_component` |
| 動作確認中だけライトを点灯・点滅・調整する | `ctx.lights`。同じオブジェクトのライトだけをowner単位で上書き | 対象外 |
| ライトのコンポーネントを追加・保存する | 対象外 | `add_component(definitionId: "core.light.*")`後に`update_component` |
| テクスチャを一時的に読み込む | `ctx.assets.loadTexture`。素材の色空間、画像の繰り返しと補間、上下反転、Mipmapを既定値にする | 対象外 |
| 動作確認中だけマテリアルの見た目やUVを変える | `ctx.materials.set*` / `setTextureTransform`。オブジェクト所有cloneだけを変更 | 対象外 |
| テクスチャの読み込み・繰り返し・補間設定を保存する | 対象外 | `get_texture_asset` / `update_texture_asset`。新規画像は編集中の`import_texture_asset` |
| マテリアルのPBR値やテクスチャbindingを保存する | 対象外 | `get_material_asset` / `update_material_asset` / `set_material_texture_transform` |
| マテリアルをメッシュの割り当て枠へ保存して割り当てる | 対象外 | `set_material` |

スクリプト実行環境の再生要求、option、transformは停止で消える。MCP authoringはシーンdocument / AssetManifestと通常の履歴へ残る。
同じ見た目を両方へ暗黙に書き戻さない。保存したい値は永続toolへ明示する。

| 目的 | MCP tool |
| --- | --- |
| 現在のID、mode、revision、スクリプト診断を読む | `get_editor_context` |
| スクリプトAPIとtrust / persistence capabilityを読む | `get_scripting_capabilities` |
| スクリプトを作成・適用・更新する | `list_script_templates`、`create_script_asset`、`apply_script_template`、`get_script_asset`、`update_script_asset` |
| スクリプトのproperty / 明示参照を更新する | `update_script_component` |
| ローカルMP3 / WAVを音声素材として追加する | `import_audio_asset` |
| 音声素材の管理下元データ情報を取得する | `get_audio_asset` |
| 音源オブジェクトを配置する | `place_asset`へ音声素材IDを渡す |
| 既存オブジェクトへ音源を追加・設定・削除する | `add_component(definitionId: "core.audio-source")`、`update_component`、`remove_component` |
| 既存オブジェクトへライトを追加・設定・削除する | `add_component(definitionId: "core.light.point")`など、`update_component`、`remove_component` |
| ローカル画像をテクスチャとして追加する | `import_texture_asset` |
| テクスチャの設定を取得・更新する | `get_texture_asset`、`update_texture_asset` |
| マテリアルをメッシュの割り当て枠へ割り当てる | `set_material` |
| マテリアルを作成する | `create_document_asset(kind: "material")` |
| マテリアルを読み、PBR / テクスチャbindingを保存する | `get_material_asset`、`update_material_asset` |
| マテリアルテクスチャのoffset / scale / rotation / UV setを保存する | `set_material_texture_transform` |
| メッシュ / 葉素材の描画距離（奥Clip）を保存・解除する | `update_component.patch.maxDistance`。有限値`0.1..1,000,000`、`null`でシーンCameraの奥へ戻す |
| パーティクルを作成・取得・更新する | `create_document_asset(kind: "particle")`、`get_particle_asset`、`update_particle_asset` |
| シーンsettingsを取得・部分更新する | `get_editor_context.sceneSettings`、`update_scene_settings` |
| コンポーネント構成を取得・変更する | `list_component_definitions`、`get_entity_components`、`add_component`、`update_component`、`remove_component`、`set_entity_enabled` |

`update_material_asset.patch`は`pbrMetallicRoughness`、normal / occlusion / emissiveテクスチャ、
`emissiveFactor`、alpha、double-sided、KHR material extensionsと、移行用の
`color` / `opacity` / `metalness` / `roughness` / 各`*TextureId`を受ける。
`set_material_texture_transform`のslotは`baseColor`、`metallicRoughness`、`normal`、`occlusion`、`emissive`、
変更値は`offset`、`scale`、`rotationDegrees`、`texCoord`または`reset`である。

`update_particle_asset.patch`は`maxParticles`、`duration`、`looping`、`prewarm`、`simulationSpace`、
start delay / lifetime / speed / size / rotation、gravity、emission、shape、color / size / velocity over lifetime、
rendererを受ける。rendererの`materialAssetId` / `textureAssetId`は存在する正しいkindの素材だけを受け付ける。

`update_scene_settings`は`skybox`、`fog`、`ambient`、`camera`、`postprocessing`、`vegetation`、`physics`、
`editor`を任意に組み合わせたnon-empty patchとして受ける。空の背景は表示、IBL、projection、既存テクスチャ参照、gradient、回転、反転、露出、
有限メッシュtransformを更新できる。Editor sectionは背景、grid、gizmo size、snapを更新できる。
`postprocessing` sectionは合成全体の有効・無効、`ao` / `bloom` / `grading`各layerの有効・無効と値、
HDR、露出、そして`order`を更新できる。`order`はlayerを適用順に並べた配列だ。並べ替え可能なlayerを
それぞれ1つずつ含む完全な配列だけを受ける。一部のlayerだけを渡すと残りの順序を推測する必要があり、作者の意図と異なる見た目になる可能性があるため受け付けない。AOはsceneを描き直すpassで常に最初に適用される。そのため`order`に含めない。
`skybox.imageAssetId`はAssetManifestに存在するテクスチャだけを受け付ける。project元データを持つもの（または移行前の空の背景）に限る。
`null`で参照とIBLを解除する。色、有限値、範囲、Fog / Cameraのnear-far関係は確定前に検証する。

同じシーンsettings設定に表示される公開title / descriptionはプロジェクトmetadataだ。thumbnailはnative binary fileだ。
いずれもSceneDocument.settingsではない。そのためこのtoolへ混在させない。Directional / Point / Spotライトもオブジェクトコンポーネントだ。
`get_entity_components` / `update_component`の対象になる。これらをシーンsettingsとして暗黙に変更しない。

`import_audio_asset`は信頼できる絶対`sourcePath`と現在のrevisionを受ける。MP3またはWAVだけを扱う。
native境界で絶対path、通常file、symlink / reparse pointなし、128 MB上限、拡張子とfile signatureの一致、
read前後のsize一致を確認する。そのあと既存importと同じcontent-addressed destination、atomic commit、history、
自動保存を通す。MCP応答は音声素材ID、管理下のproject-relative path、format、MIME、byte lengthだけを返す。
外部path、data URL、binary bytesを返さない。同じ元データhashがあれば複製せず既存音声を選択する。
`get_audio_asset`も同じ管理下metadataだけを返す。永続音源は音声素材を`place_asset`で配置する。
または`core.audio-source`を追加する。そして`update_component.patch`の`audioAssetId`、`volume`、`loop`、`autoplay`、
`spatial`、`refDistance`、`rolloffFactor`、`maxDistance`を保存する。

`import_texture_asset`は信頼できる絶対`sourcePath`と現在のrevisionを受ける。PNG、JPEG、WebP、AVIF、GIF、
BMP、SVG、KTX2の通常fileだけを128 MB上限で読み込む。最終パス要素のsymlink、相対path、未対応拡張子を拒否する。
既存importと同じsignature / SVG external-reference検査、content-addressed destination、atomic commit、
thumbnail生成を通す。MCP応答には外部pathとfile bytesを返さない。管理下のproject-relative pathと素材IDだけを返す。
同一元データhashが存在する場合は複製せず既存テクスチャを返す。

`update_texture_asset.patch`は`colorSpace`、`generateMipmaps`、`flipY`、`resize`、
`sampler.wrapS / wrapT / magFilter / minFilter`、`compression.format / quality`を受ける。
未知field、enum外の値、非有限値、範囲外のmax size / qualityはdocumentを変えず拒否する。
Mipmapsを無効にした時のmipmap filterは既存モデルと同じく`linear`へ正規化する。
この保存値は、次に`ctx.assets.loadTexture`が同じテクスチャを読む時の既定値になる。
スクリプト側でoptionを明示した項目だけは、そのスクリプトinstanceの読み込みで保存値より優先する。

基本手順は`get_editor_context`、`list_script_templates`、`create_script_asset`または`apply_script_template`、
`add_component`、`update_script_component`、`set_play_mode`の順だ。すべてのwriteへ
`projectId`、`sceneId`、`expectedRevision`を渡す。write後は`get_editor_context`で最新revisionと
`scriptRuntime`を取り直す。動作確認中の対応済みwriteは直ちにauthoring dataへ保存する。
シーンsettingsは共有シーンへ即時反映する。コンポーネント / オブジェクト変更はそのオブジェクトを再起動する。
マテリアル / テクスチャ / パーティクル変更は参照オブジェクトだけを再起動する。音源コンポーネントの変更も
そのオブジェクトだけへ反映する。ライトのscalar変更は既存実行環境へ即時反映する。ライト種別だけ対象オブジェクトを再起動する。
`ctx.audioSources` / `ctx.lights`のruntime-only状態をAssetManifestやSceneDocumentへ暗黙に書き戻さない。

MCPから生成・更新したスクリプトも、動作確認で保存済み元データを変換して実行する。
スクリプトごとの承認ダイアログは表示しない。`get_scripting_capabilities`は
`sandboxed: false`、`trustGate: false`を返す。変換失敗時は編集に留まり、
動作確認中の更新に失敗した場合は直前の正常なmoduleを維持する。
`unapprovedPolicy`は旧clientとの互換性のため受け付けるが、実行可否には影響しない。
`get_editor_context.scriptRuntime.trust`は`status: "not-required"`と実行中の元データ情報を返す。

`pnpm tauri:dev`のdebug buildだけにTauri MCP bridgeを登録する。
webview JavaScriptやTauri commandを扱う開発用機能であり、release buildには搭載しない。

## 組み込み Template

素材の追加 > スクリプトとMCPは同じversion 6 catalogを使う。作成画面では元データpreviewを確認できる。
オブジェクトを選択している場合はスクリプトとスクリプトのコンポーネントを1回の履歴操作で作成できる。
XRift公式shortcutと競合する。そのためversion 5では`keyboard-move`と`audio-hotkey`を組み込み一覧から外した。
既存スクリプト元データと低レベル`ctx.input`の互換性は維持する。新しい標準例はevent / propertyで接続する。

| ID | 用途 | 追加設定 |
| --- | --- | --- |
| `blank` | 最小lifecycle | なし |
| `vehicle` | 公式Vehicleと運転席・同乗席（World向け） | 速度・旋回速度 |
| `seat` | 公式Seat（World向け） | 座面の高さ |
| `rotate` | 軸と速度を設定からリアルタイム変更 | なし |
| `float` | 上下移動 | なし |
| `follow-entity` | 明示参照したオブジェクトを追従 | オブジェクト参照 |
| `material-pulse` | 色、発光、粗さのanimation | メッシュの描画 |
| `light-flicker` | ライトの色・強度・点灯をリアルタイムに点滅 | ライト |
| `texture-scroll` | テクスチャ設定を継承した読み込みと、所有clone上のUV scroll | テクスチャとメッシュの描画 |
| `particle-control` | 再生、放出、速度、サイズ、色 | パーティクルの放出 |
| `model-display` | 宣言済みGLBをTSX `Render`へ読み込み、速度をリアルタイム変更 | 3Dモデルの素材 |
| `audio-source-control` | 同じオブジェクトの音源の再生、音量、loop、再生位置をリアルタイム変更 | 音声素材と音源 |
| `proximity-event` | 明示参照オブジェクトがworld座標の範囲へ入った／出た状態をchannelで送信 | オブジェクト参照 |
| `event-light` | 同じchannelの近接eventでライトの色と強度をfade | ライト |
| `event-visibility` | スクリプトeventで表示切替 | なし |

`create_script_asset`は`templateId`または任意`source`のどちらかを受け取る。Templateはcatalogの
`language`に従って`.ts` / `.tsx`を選ぶ。任意のJSX元データでは`language: "tsx"`を明示する。
`apply_script_template`はスクリプトの作成と指定オブジェクトへのコンポーネント追加を1 revisionで行う。
未知のtemplate ID、存在しないオブジェクト / Folder、古いrevisionではdocumentを変更しない。

## property の種別

設定のフィールドは宣言から自動生成する。種別は既存のコンポーネントfield種別の語彙に揃える。

`string`、`number`、`boolean`、`enum`、`vec2`、`vec3`、`color`、`asset`、`entity`

`asset`と`entity`は既存コンポーネントにはない種別だ。スクリプトのために追加するpickerを使う。
選択結果は`assetReferences` / `entityReferences`にも反映する。参照の検証と、削除時の影響調査に使う。

宣言を静的に読み取れないスクリプトは、値を推測しない。「propertyを読み取れません」と理由を示す。コードは実行しない。

## モジュール解決

許可したspecifierは、Studioが既に読み込んでいる同一moduleインスタンスへ解決する。

`three`、`@react-three/fiber`、`@react-three/drei`、`@react-three/rapier`、`@xrift/world-components`、`react`、`xrift:script`

`three`を二重にロードすると`instanceof`とR3Fの突き合わせが壊れる。同じシーンを共有できなくなる。
この解決は公開先でも同じだ。公開ワールドは共有singletonを前提とする。

`https://`から始まるmoduleを解決する内部opt-inはある。現在のEditor UI / MCPからは有効化しない。
通常の動作確認はofflineで完結する。remote moduleをblockingにする。公開時は常にblocking診断とする。対象スクリプトと理由を示す。
動的`import(...)`と`useFrame`も動作確認 / 公開の両方でblockingにする。

## 対応範囲

| 操作 | Studio動作確認 | `classic-jsx`で生成したワールド / アイテム | 永続化 | 現在の入口 |
| --- | --- | --- | --- | --- |
| number / color / vectorなどのproperty変更 | 対応。次のframeから同じinstanceへ反映 | 対応。compile時の値を初期値として使用 | シーンdocument | 設定 / MCP |
| 明示参照した素材のURL解決 | 対応 | 対応 | なし | `ctx.assets.url` |
| PNG / JPEG / WebPなど基本テクスチャの読み込み | 対応。素材の色空間 / 画像の繰り返しと補間 / 上下反転 / Mipmapを継承し、明示optionを優先 | 対応 | なし | `ctx.assets.loadTexture` |
| MP3 / WAV音声の再生・停止・seek・音量・loop・再生速度 | 対応 | 対応 | runtime-only | `ctx.assets.loadAudio` |
| オブジェクト自身の音源の再生・停止・seek・音量・loop | 対応。owner単位override | 対応。同じ実行環境実装 | runtime-only | `ctx.audioSources` |
| オブジェクト自身のライトの点灯・色・強度・Point / Spot距離 | 対応。owner単位override | 対応。同じ実行環境実装 | runtime-only | `ctx.lights` |
| 明示参照オブジェクトのworld座標近接とスクリプトevent接続 | 対応 | 対応 | runtime-only | `ctx.find` + `getWorldPosition` + `on` / `emit` |
| 宣言済みGLBをTSX `Render`で表示 | 対応 | 対応 | 元データ | `ctx.assets.url` + `useGLTF` / `Clone` |
| マテリアルテクスチャのrepeat / offset / center / rotation | 対応。オブジェクト / マテリアル枠所有cloneだけを変更 | 対応 | runtime-only | `ctx.materials.setTextureTransform` |
| オブジェクト自身のマテリアルのcolor / opacity / emissive / metalness / roughness | 対応 | 対応 | runtime-only | `ctx.materials` |
| オブジェクト自身のマテリアルへのテクスチャ設定 | 対応 | 対応 | runtime-only | `ctx.materials.setTexture` |
| オブジェクト自身のパーティクルの再生 / 放出 / 速度 / サイズ / 色 | 対応 | 対応 | runtime-only | `ctx.particles` |
| パーティクルのburst-only / loop / non-loop duration | 対応。上限10,000 particles | 対応。同じ実行環境実装 | AssetManifest | 設定 / `update_particle_asset` |
| project KTX2を使うマテリアル / パーティクルの描画 | 対応。local Basis transcoder | 対応。Basis fileを生成物へ同梱 | AssetManifest | 素材 / マテリアル / パーティクル設定 |
| マテリアル / パーティクルpropertyの動作確認中の永続編集 | 対応。参照オブジェクトだけ再反映 | 次回の生成へ反映 | AssetManifest | 設定 / MCP |
| テクスチャimport settingsの動作確認中の永続編集 | 対応。依存するオブジェクトだけ再起動 | 次回の生成へ反映 | AssetManifest | `update_texture_asset` |
| オブジェクト / コンポーネント構成の動作確認中の永続編集 | 対応。影響オブジェクトだけ再起動 | 次回の生成へ反映 | シーンdocument | 設定 / MCP |
| 明示参照した別オブジェクトの取得 | 対応 | 対応 | なし | `ctx.find` |
| React Three Fiberの宣言的な描画追加 | 対応 | 対応 | 元データ | named export `Render`。`useFrame`は不可 |
| マテリアル自体の編集 | スクリプトAPIでは未対応 | スクリプトAPIでは未対応 | 対応 | 設定 / マテリアルMCP tools |
| マテリアルIDをそのまま実行環境マテリアルとして適用 | 未対応 | 未対応 | なし | 今後のtyped loader / recipe |
| KTX2、HDR、EXRのスクリプト専用読み込み | 未対応 | 未対応 | なし | 現在は素材 / シーン設定。専用loaderは今後 |
| 3Dモデルのimperative typed loader | 未対応。TSX `Render`は対応 | 未対応。TSX `Render`は対応 | なし | 今後の素材種別別facade |

次の操作に対応する。

- 動作確認で実行する。動作確認中の元データ編集では該当オブジェクトだけをホットリロードする
- 停止では実行中のblob moduleとresourceを破棄する。同一元データのTypeScript変換結果だけを
  128件のbounded cacheへ残す。次の動作確認はtop-level codeと`start`を必ず新しいmoduleとして実行し直す
- 動作確認中のオブジェクト / コンポーネント構成とマテリアル / テクスチャ / パーティクルpropertyを永続変更する。参照オブジェクトだけへ差分反映する
- 1オブジェクトへ複数スクリプトを付ける
- 公開ワールドへ静的importとして出力する
- hostが管理する`start` / `update` / `ctx.on`とReactの`Render` render errorをスクリプト単位で隔離する
- 設定 / MCPで変更した宣言済みpropertyをframe単位で反映する
- 明示参照した基本テクスチャ / 音声、TSX Renderの3Dモデル表示、オブジェクト単位の実行環境音源 / ライト / マテリアル / パーティクルoverrideに対応する
- local / builtinテクスチャのマテリアル / パーティクルpreviewに対応する。local Basis transcoderを使うKTX2 preview / 公開描画に対応する

次の操作は現在の対応範囲に含めない。

- 物理APIはワールドprojectだけに提供する。アイテムprojectは重力とRigidBodyを持たないため未対応としてdegradeする
- 低レベル`ctx.input`は既存スクリプト互換用のkeyboard状態だけを持つ。公式shortcut競合を避けるため組み込みTemplateでは使わない。pointer lock、マウス移動、gamepadの配線も提供しない
- `ctx.find`から実行環境player / avatarを取得するAPIはない。近接Templateは明示参照したauthoredオブジェクト同士だけを扱う
- 実行環境JSON出力ではスクリプトを表現できない。そのためblocking診断とする
- 任意npm packageのimportには対応しない。stagingへinstallできるpackageは固定の許可リストに限る
- スクリプトから公式XRiftのコンポーネントをimperativeに操作するAPIは初版では提供しない
- スクリプトからマテリアルのrecipeを永続変更することと、マテリアルをIDだけで一括適用することには対応しない
- スクリプトAPIからの`KTX2Loader`、`HDRLoader`、`EXRLoader`のようにデコーダーやrenderer設定を伴うテクスチャloaderには対応しない
- 素材一覧の列挙、未宣言素材の読み込み、project pathの直接参照には対応しない
- `Render`内の`useFrame`には対応しない。フレーム処理はhostが隔離する`start().update(delta)`を使う

## 実行環境の権限と限界

スクリプトは完全には隔離されていない。 この節の内容を「sandbox済み」と表示してはならない。

動作確認はiframeやWorkerを挟まない。アプリと同一realmで動く。`withGlobalTauri`によりIPC bridgeが`window`に露出している。
そのためスクリプトは原理的にアプリと同じ権限を持つ。ファイルシステムとシェルへの到達手段を持ちうる。

module scopeでは`window`、`globalThis`、`self`、`document`、`fetch`、
`XMLHttpRequest`、`Function`、`importScripts`、`__TAURI__`、`__TAURI_INTERNALS__`を遮蔽する。
ES moduleのstrict modeでは`eval`をlexical bindingで遮蔽できない。
これらは意図しないアクセスを減らす処理であり、隔離境界にはならない。

2026-09-07にスクリプトごとの内容hash承認を廃止した。UIとMCPの動作確認は同じ実行経路を使う。
元データは一度だけ読み、変換と評価に同じ値を使う。hash、言語、契約version、来歴は、
実行中の版の特定とhot reloadのために保持する。旧承認storeへの照会・書き込みは行わない。
プロジェクト切り替え時の破棄、固定のimport許可リスト、ファイルパス検証、
変換失敗時の開始防止は維持する。スクリプトは通常のローカルコードとして動作し、
無限loopや同一realmからの権限到達を隔離する保証はない。

## 既知の課題

- 完全な隔離は未対応だ。実現するにはrealmを分ける必要がある。Three.jsインスタンス共有と両立しない
- MonacoとTypeScript serviceはlocal同梱済みでofflineでも動く。動作確認変換は軽量な`transpileModule`を使う。
  Editor補完と診断はlanguage-service workerへ分離している。Architecture 10章が求めるCSPは未適用だ。
  動作確認のblob moduleと共有module bridgeを許可しながら権限を狭める方針が残っている
- スクリプトの`ctx.assets.loadTexture`はThree.jsの標準`TextureLoader`を使う。マテリアル / パーティクルpreviewと
  `classic-jsx`のKTX2描画はlocal Basis transcoderに対応済みだ。一方KTX2、HDR、EXR、動画テクスチャ、cubeテクスチャ、
  renderer capabilityに応じたtranscoding、進捗と再試行を含むスクリプト用typed loaderは未対応だ
- `ctx.materials`はメッシュに既に設定されたマテリアルの実行環境cloneを操作する。マテリアルのrecipe全体、
  シェーダー固有uniform、複数UV setの選択は未対応だ
- パーティクルはStudioと公開で共通実装になった。burstの時刻 / cycle / intervalとnon-looping durationに対応した。
  ただしworld-space simulation、per-particle size / rotation、stretched billboard、sort modeは互換表示だ。
  完全なsimulationではない。poolは10,000 particlesが上限だ。容量を越えるburstは切る
- `ctx.particles.setEmissionRate`はauthored burstと加算するAPIではない。burstを抑止してcontinuous rateを
  実行環境overrideする。burstとcontinuous rateを同時に動的編集するAPIは未対応だ
- テクスチャ読み込み失敗は`null`で返す。素材名、format、decode errorをまとめたスクリプトConsole診断と
  preload / loading stateの標準化が要る
- スクリプトConsoleはスクリプトEditor内でcompile / lifecycle / event / Renderの失敗と`ctx.log`を表示する。
  MCPの`get_editor_context.scriptRuntime`からもJSON-safeな直近結果を取得できる。現時点では元データmapによる行・列、
  同一例外の集約、個別スクリプトの再開操作は未対応だ
- pointer / mouse / gamepadと実行環境player / avatar参照は未対応だ
- `ctx.lifecycle`を使わない`Promise.then`、global timer、Renderのpointer / physics callbackなど、hostの所有外で
  開始した非同期callbackの例外帰属と自動停止は未対応だ
- 公開先プラットフォームがuploadされたbundleを審査またはsandboxするかは未確認だ。Studioのlocal動作確認は公開実行環境の隔離や審査を代替しない

## 公開

スクリプト元データとhost adapterをstagingのoverlay fileとして出力する。生成した`src/World.tsx`または
`src/Item.tsx`から静的importで参照する。

- `.ts` / `.js`は静的素材として許可されない。そのため必ずoverlay fileとして出す
- 生成物に`eval`、`Function`、動的importを出さない
- host adapterとauthoring APIは単一の実装を正本とする。Editor動作確認と生成物で二重管理しない
- 生成したワールド / アイテムのシーンsubtreeは動作確認と同じ`XriftScriptRoot`で包む。各コンポーネントは同じ
  `XriftScriptHost`へdefaultスクリプト、任意のnamed `Render`、property、実行順、明示参照を渡す
- `assetReferences`のうちstagingへcopyした素材だけを決定的なURL mapへ入れる。
  生成JavaScriptと同じ公開ディレクトリで解決してから`ctx.assets.url` / `loadTexture`を動作確認と同じ参照gateへ通す
- KTX2を参照するマテリアル / パーティクルがある場合はpinned Basis JS / WASMをstagingの`public/`直下へ
  copyする。`useKTX2`のtranscoder pathに生成JavaScriptと同じ公開ディレクトリを渡す
- Draco圧縮した3Dモデルがある場合はpinned Dracoデコーダーを同じく`public/`直下へcopyする。
  `useGLTF`のデコーダーpathに生成JavaScriptと同じ公開ディレクトリを渡す
- オブジェクトgroupへ安定IDを付ける。`entityReferences`に宣言したIDだけを`ctx.find`で解決する
- ワールド / アイテムinstanceごとのscope marker内だけを探索する。同じアイテムを複数配置しても別instanceのオブジェクトを返さない
- テクスチャcache / dispose、音声停止・解放、マテリアルclone / restore、frame更新とevent busはhostのlifecycleに属する。
  動作確認の停止と公開worldのunmountで同じcleanupを行う
- 出力はstagingのbuildで型検査する。スクリプトの型エラーは公開を止める。そのためupload前にStudio側で提示する
- 同じ入力から同じ出力を得る決定性を維持する。識別子はhash由来とする。挿入順や時刻に依存させない
- プレハブinstanceは合成IDで事前展開する。そのためスクリプトinstanceの同一性は展開後のコンポーネントIDから導出する

## 参照

- 例外範囲の定義: [ビジュアルエディターArchitecture 4.8](./VISUAL_EDITOR_ARCHITECTURE.md#48-scripting-script-asset--script-component)
- 状態設計: [UX Interactions F-28](./UX_INTERACTIONS.md)

## Vehicle / Seat（world-components 0.53.0）

車は「外部から追加 → ギミック → カスタム車」または「XRift公式コンポーネント → Vehicle」、椅子単体は「外部から追加 → XRift公式コンポーネント → Seat」から追加する。
カスタム車を追加すると、親Entityに操縦用Script、その子に「車体」「運転席」「同乗席」、タイヤ4個と「排気煙」を作る。
車体と座席は通常のMesh ComponentでModel Assetを参照し、各座席にSeat用Scriptを付ける。
Hierarchyでモデルを選び、Transform・Mesh・Materialを編集できる。Seat単体も同じ構成を使う。
車体とシートはBlenderで作成したGLBを使い、追加時に通常のModel Assetとしてプロジェクトへ取り込む。
同じモデルの再追加では既存Assetを再利用し、Prefab・公開用出力にも参照先のGLBを含める。
Scriptにはモデル本体・Base64 URL・見た目を生成するコードを入れない。

Vehicle/SeatのScriptは`renderMode: "wrap"`を宣言し、`Render({ ctx, children })`で
EntityのMeshと子Entityを公式Componentの中へ渡す。EditではScriptを実行せず通常のHierarchyを表示する。
Playと公開先は同じScript hostで階層を包むため、車体の移動に子Entityと着席位置が追従する。
SeatとInteractableのScript importは共通adapterを通し、遅れて読み込まれたモデルも
公式raycasterの対象へ追加する。公式の座席登録・占有・操縦入力は維持する。
公開用adapterではVehicleも公式パッケージから明示的にimportしてexportする。`export *`だけで転送するとModule FederationがVehicleをワールド側へ取り込み、XRift本体のSeatと内部Contextが分かれる場合がある。両者は同じ共有パッケージから解決し、運転席の登録を維持する。
同じEntityに同じテンプレートを複数付ける場合は「同じEntity内の識別子」を別々にする。
モデルの再生成は`scripts/generate-world-asset-models.py`と`assets/world-models/parts.json`を使う。

新規Vehicleの「地面に追従」は初期値がオン。運転者の`onDrive`で4輪付近の固定Colliderを下向きに調べ、
車体の高さ・傾きを合わせる。「登れる坂の角度」は初期値45度。地面の欠損、急斜面、大きな段差では移動を止める。
Sensorと動くRigid Bodyは地面判定に使わない。地面にはColliderが必要で、壁への車体衝突・サスペンション・落下の物理演算は含まない。
オフにすると地面を判定せず直接移動する。

VehicleはHierarchyの車体・座席・タイヤ・排気煙を一つの公式`Vehicle`で包む。
`Seat driver`の入力を公式`Vehicle onDrive`へ渡し、車体の移動・旋回を行う。
W/Sで前後、A/Dで旋回、StudioのWorld PlayではSpaceまたはEで降車する。
Seat単体もSpaceまたはEで立てる。Play停止・座席削除・テレポートで着席を解除する。
テンプレートはWorld向け。アイテムのPlayにはプレイヤーがいないため、着席・操縦確認はWorld Playで行う。
Itemに転用する場合は、同じItemを複数置いてもIDが衝突しないよう、`useItem().id`を座席・車体IDへ含める。

デスクトップ版の公開物でも同じTSXと公式Componentを使う。
Scriptを扱わないブラウザ版のRuntime JSON公開は対象外。車体の姿勢・同乗席・後から入室した人への状態は
XRiftプラットフォームのSeatContextに任せ、`useInstanceState`で重複同期しない。
World Playの着席位置・視点追従・操縦入力・降車は、0.53.0の公式`PhysicsPlayer`で処理する。
Studioの着席Providerは座席の登録と占有を同じプレイヤーへ渡し、Stop・座席削除・テレポートで解除する。
フォーカスやポインターロックが外れたときは、押下中のキーを解除して操縦が続かないようにする。
単一プレイヤーの確認用で、オンライン同期やアバターの着席アニメーションは再現しない。
複数人からの見え方と再入室後の停車位置は、XRift上で別途確認する。

砲台など、車体同期を使わない操作では引き続き`Seat onControlInput`を使用できる。

### 公式更新への追従

Editor、Classic出力・公開ステージング、Runtimeの開発依存、Web upload shellを同じバージョンに揃える。
`node scripts/check-world-components-alignment.mjs`はバージョンと必要な公式exportを検査する。
依存の更新時は生成TSXの型検査と`e2e/vehicle-seat.spec.ts`で座席の登録・解除・運転を確認する。

Vehicle/Seatは、コールバックとReact Contextの親子関係を保持できるTSXテンプレートとして提供する。
Add Componentの公式registryへ静的なwrapperとして追加すると、RuntimeのEntity別portal間で
VehicleのContextが引き継がれないため、現時点ではそこへ登録しない。
速度・旋回速度・地面追従・最大傾斜角は親EntityのScript propertyとしてInspectorから編集する。座面の高さは座席EntityのTransformで変更する。

参照: [公式Component](https://github.com/WebXR-JP/xrift-world-components)、
[World template](https://github.com/WebXR-JP/xrift-world-template)、
[Item template](https://github.com/WebXR-JP/xrift-item-template)。

### タイヤと煙の演出

モデルは通常のglTF PBRカラーを使用し、車体は3、Seatは1、共通タイヤは2マテリアルです。頂点カラーやScript内のBase64は使いません。

タイヤと煙のScriptは、各参加者が受信した公式Vehicleの位置変化から演出を更新します。走行中はタイヤを回して煙を放出し、停止中は止めます。Graphのinteractイベントは乗車継続や移動の状態を表さないため、このギミックでは移動量を使用します。粒子の個別座標は同期せず、各端末で描画します。

MCPからの配置は`list_scene_recipes` → `apply_scene_recipe`（`recipeId: "scene-recipe.custom-vehicle"`）を使います。具体的な引数と確認手順は [MCP Editor Tools](./MCP_EDITOR_TOOLS.md) を参照してください。
