# Scripting Contract

## 目的

制作者がオブジェクトに振る舞いを持たせるために使う。スクリプトは TypeScript で書く。Editor の動作確認で実行する。同じスクリプトを公開ワールドへ出力し、実際の XRift 上で動かす。動作確認と公開で挙動が食い違わないことを契約とする。

本書は [ビジュアルエディター Architecture 4.8](./VISUAL_EDITOR_ARCHITECTURE.md#48-scripting-script-asset--script-component)
が定めた例外範囲の実装契約である。ここに書いていない形での任意コード実行は行わない。

## 分離の原則

パーティクルと同じ分け方にする。再利用できる定義は素材が持つ。オブジェクト固有の値はコンポーネントが持つ。

| | 持つもの | 持たないもの |
| --- | --- | --- |
| スクリプト | `kind: "script"`、`contractVersion`、`language`、`source.kind = "project"` の相対 path | コード本文、派生した property schema |
| スクリプトのコンポーネント | `scriptAssetId`、宣言済み property 値、`assetReferences`、`entityReferences`、`runIn` | コード、関数、式 |

コード本文は project 内の `scripts/` 以下の元データ file が正本である。AssetManifest には参照だけを置く。
property schema は元データから導出する。Editor State が持ち、manifest へは保存しない。

この分離には実務上の理由がある。manifest の開始ファイルは本文を編集しても変えない。そのためスクリプトを保存したときは、そのスクリプトを使うオブジェクトだけを compile して再起動する。AssetManifest を変えた場合も依存関係を逆引きする。そして変更したマテリアル / パーティクル / テクスチャなどを参照するオブジェクトだけ実行環境世代を上げる。

## 永続化する情報

`ScriptAsset` は次を保持する。

- `id`: シーンとプレハブが参照する安定した素材 ID
- `contractVersion`: 本書の契約版。読み込み時に厳密一致で検証する
- `language`: `ts` または `tsx`
- `source`: `kind: "project"` と project root 相対の `/` 区切り path。OS 絶対 path、Blob URL、token を保存しない

`ScriptComponent` は次を保持する。

- `scriptAssetId`: 参照先スクリプト
- `properties`: 宣言済み property への値。純 JSON かつ有限数に限る
- `assetReferences` / `entityReferences`: property が参照する素材とオブジェクトの ID
- `runIn`: 現在は `play`。schema の `play-and-edit` は将来予約で、設定では選択できず実行もしない

1 つのオブジェクトには複数のスクリプトのコンポーネントを付けられる。実行順はオブジェクト階層順で決まる。次にオブジェクト内のコンポーネント並び順で決まる。

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

React Three Fiber で宣言的な見た目を追加する場合は、同じ module から `Render` を export する。
オブジェクトの group の子として mount する。`start` と併用できる。フレーム更新は `start` が返す `update(delta)` に置く。
R3F の `useFrame` callback は React の Error Boundary の外で動く。そのためスクリプト単位に隔離できない。動作確認と公開の両方で blocking にする。

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

`Render` は `start(ctx)` の成功後に mount する。同じ live `ctx` を `{ ctx }` として受け取る。
宣言固有の property 型が要る場合は `ScriptRenderProps<MyPropDeclaration>` を使う。
設定 / MCP で property を変えたときは `Render` も新しい `ctx.props` で再描画する。TSX 元データは
スクリプトの `language: "tsx"` と `.tsx` path を持つ。組み込み `model-display` はこの入口から
宣言済み 3Dモデル URL を `useGLTF` / `Clone` へ渡す例だ。依存fileを内包した GLB を推奨する。

### ScriptContext

| 名前 | 内容 |
| --- | --- |
| `entity` | `id`、`name`、`enabled` |
| `object3d` | このオブジェクトの group |
| `scene` / `camera` / `renderer` | 実行中の Three.js オブジェクト |
| `props` | 宣言した property の値。動作確認中の設定 / MCP 変更は再起動せず次の frame から反映される |
| `time` | `elapsed` と `delta`。`delta` は 0.1 秒で上限を切る |
| `input` | 既存スクリプト互換用の低レベルキーボード状態。XRift公式shortcutと競合しうるため組み込みTemplateでは使わない |
| `lifecycle` | スクリプト instance が所有する AbortSignal、timer、async task、cleanup |
| `find(entityId)` | `entityReferences` に宣言した authored オブジェクトだけを引ける。player / avatar は対象外 |
| `assets` | `assetReferences` に宣言した素材の URL 解決、基本テクスチャ読み込み、音声再生 |
| `audioSources` | このオブジェクトが所有する音源を動作確認中だけ再生・調整する |
| `materials` | このオブジェクトが所有するメッシュのマテリアルを動作確認中だけ変更する |
| `lights` | このオブジェクトが所有するライトの点灯、色、強度、距離を動作確認中だけ変更する |
| `particles` | このオブジェクトが所有するパーティクルの放出を動作確認中だけ再生・調整する |
| `viewer` | このスクリプトを実行しているビューアーの見え方だけを動作確認中だけ変える。他のビューアーへは同期しない |
| `getAssetUrl(ref)` | `assets.url(ref)` の非推奨 alias |
| `on` / `emit` | スクリプト間のイベント |
| `log` | スクリプト Console へ出力する |

### 非同期処理と cleanup

hot reload、実行環境 failure、動作確認の停止、unmount のあとに古い callback がオブジェクトを変えないようにする。
そのため非同期処理は `ctx.lifecycle` へ登録する。

| API | 契約 |
| --- | --- |
| `signal` | スクリプト終了時に abort される `AbortSignal` |
| `onDispose(callback)` | 終了時の cleanup を登録し、返した関数で登録解除する。callback は Promise を返せる |
| `timeout(callback, ms)` | 所有された one-shot timer。終了時に自動解除する。callback は Promise を返せる |
| `interval(callback, ms)` | 所有された interval。終了時に自動解除する。callback は Promise を返せる |
| `task(run)` | signal を渡して Promise を実行し、終了後の結果を捨てる。未処理例外はそのスクリプトの `async` failure にする |

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

`task` は通信やデコーダー自体を強制終了しない。処理側が `signal` に対応する場合は必ず渡す。
完了後にシーンを変える前にも `signal.aborted` を確認する。global の `setTimeout` や追跡していない Promise を直接使った場合は
host の所有外になる。自動 cleanup と例外帰属の保証を受けない。
`onDispose`、`timeout`、`interval` が返した Promise の rejection も、登録元のオブジェクト / スクリプトの
`async` failure として扱う。スクリプト Console と MCP 実行環境 report へ記載する。

### テクスチャ / マテリアルの実行時操作

テクスチャは property で明示参照してから読み込む。project 内の任意素材を走査するスクリプト用の API はない。path を直接組み立てるスクリプト用の API もない。

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

設定で `texture` を選ぶと、その ID は `properties.texture` と `assetReferences` の両方へ入る。
MCP から設定する場合も `update_script_component` へ property 値と完全な `assetReferences` を渡す。
宣言していない ID に対する `assets.url` は `null` を返す。`assets.loadTexture` は `null` を返す Promise になる。project 内の別素材へは到達しない。

`assets` は次を提供する。

| API | 契約 |
| --- | --- |
| `url(assetId)` | 明示参照した project 素材の実行時 URL。解決できない場合は `null` |
| `loadTexture(assetId, options?)` | PNG、JPEG、WebP などブラウザが通常の画像として decode できるテクスチャを読み込む |
| `loadAudio(assetId, options?)` | 明示参照した MP3 / WAV の lifecycle-owned player を返す |

`loadTexture` は参照先テクスチャの `importSettings` を実行時の既定値にする。
option を省略した項目は素材の値を継承する。スクリプトで明示した項目だけをその読み込みに対して上書きする。

| option | 値 |
| --- | --- |
| `colorSpace` | `"auto"`、`"srgb"`、`"linear"` |
| `wrapS` / `wrapT` | `"repeat"`、`"clamp-to-edge"`、`"mirrored-repeat"` |
| `magFilter` | `"nearest"`、`"linear"` |
| `minFilter` | `"nearest"`、`"linear"`、4 種の mipmap filter |
| `flipY` / `generateMipmaps` | `boolean` |

`generateMipmaps: false` と mipmap を必要とする `minFilter` を組み合わせた場合は、実行時に
`minFilter: "linear"` へ正規化する。同一スクリプト instance 内では素材 ID と解決後の option ごとに cache する。
スクリプトの再起動または停止で自動的に dispose する。

返した `ScriptTexture` は Three.js テクスチャと互換の transform field を持つ。マテリアル上の UV 演出には
`ctx.materials.setTextureTransform` を使う。この API はマテリアル枠ごとの所有 clone を作る。
そのため同じテクスチャを使う別 slot、別オブジェクト、共有テクスチャを変更しない。

マテリアル / パーティクルの preview と `ctx.assets.loadTexture` は別の読み込み経路だ。Studio の preview は project 元データを
Tauri IPC で読む。`importMetadata.sourceFormat` または拡張子が KTX2 なら、Studio に同梱した Basis JS / WASM で変換する。
OpenBrush の `source.kind = "builtin"` テクスチャは project path がなくても同梱 URL から表示できる。どちらも preview のために
CDN を必要としない。生成物も KTX2 を使う場合は固定した Basis file をワールドへ同梱する。
生成JavaScriptと同じ公開バージョンのディレクトリから解決する。

デコーダーを要する形式は KTX2 だけではない。Draco 圧縮した 3Dモデルはデコーダーを同梱する。
どの形式が何を必要とするかは `src/lib/visual-editor/vendor-assets.ts` の表が一箇所だけで持つ。
同梱の要否は staging へ copy する素材の事実から決める。生成コードに特定の helper 名が
現れるかでは決めない。出力モードごとに生成物の形が違うため、文字列一致は片方の出力モードで
外れることがある。`classic-runtime` では Runtime manifest の `decoders` が同じ場所を示す。
loader は manifest からの相対で解決する。

### 公開物はワールド直下にしか置けない

公開したワールドが配信するのは、ワールド直下のファイルだけだ。`public/` のサブ
ディレクトリは公開物に含まれない。置いても 404 になる。素材のコピー先が
`public/xrift-studio-<assetId>-<file>` のように平坦なのはこのためだ。デコーダー、
フォント、Runtime manifest も同じく直下へ置く。デコーダーはファイル名が loader 側で
固定されている（DRACOLoader は `draco_wasm_wrapper.js`、KTX2Loader は
`basis_transcoder.js` をデコーダー path へ足す）。そのため名前はそのまま直下に置く。
path には生成JavaScriptと同じ公開ディレクトリを渡す。名前が固定でない同梱物は、他のファイルと
ぶつからないよう接頭辞を付ける。

公開コードの `import.meta.url` からその公開バージョンのディレクトリを決め、3Dモデル、テクスチャ、
音声、フォント、デコーダー、スクリプト、Runtime manifestで共有する。XRift側の画面更新中に古い
ワールドが残っても、新しい `baseUrl` と古いファイル名を組み合わせない。Viteのソースモジュール
など、HTTPで配信されたJavaScript以外では従来どおりXRiftの `baseUrl` を使う。

この対応はマテリアル / パーティクルの preview と生成物の描画経路に限る。スクリプトの `ctx.assets.loadTexture` は引き続き
Three.js の標準 `TextureLoader` を使う。そのため KTX2 / HDR / EXR を typed テクスチャとして返さない。

### 音声の実行時操作

`loadAudio` は `prop.asset({ kind: "audio" })` と `assetReferences` に入れた音声だけを開く。
options は `volume`（0..1）、`loop`、正の `playbackRate`、`preload: "none" | "metadata" | "auto"` である。
返す `ScriptAudio` は `play()`、`pause()`、`stop()`、`seek()`、`setVolume()`、`setLoop()`、
`setPlaybackRate()` と、read-only の `playing`、`currentTime`、`duration` を持つ。

ブラウザの自動再生規則により `play()` は reject しうる。ユーザー入力後に呼ぶ。必要なら
`ctx.lifecycle.task` 内で await し、スクリプト Console へ理由を残す。スクリプトの再起動、失敗、停止、
unmount では host が全playerを停止する。元データを解放する。Studio 動作確認と公開生成物は同じ実装を使う。

`ctx.assets.loadAudio` はスクリプトが所有する独立 player を新しく作る入口だ。オブジェクトに保存済みの
音源コンポーネントを操作する場合は `ctx.audioSources` を使う。別の player を二重に作らない。
`ctx.audioSources` はスクリプトのコンポーネントを付けたオブジェクト自身の音源だけを対象にする。子オブジェクトは含めない。

| API | 操作 |
| --- | --- |
| `count()` | 対象音源数を返す |
| `list()` | `componentId`、`audioAssetId`、spatial、再生状態、現在位置、長さ、音量、loopを列挙する |
| `select({ componentId?, audioAssetId? })` | 指定した条件すべてに一致する音源だけを操作する handle を返す |
| `play()` | 対象を再生し、開始できた件数を Promise で返す |
| `pause()` / `stop()` | 一時停止、または停止して先頭へ戻し、対象件数を返す |
| `seek(seconds)` | 有限かつ0以上の秒へ移動し、対象件数を返す |
| `setVolume(value)` / `setLoop(value)` | 動作確認中の音量とloopを上書きし、対象件数を返す |
| `reset()` | このスクリプト、または選択handleが持つ実行環境 overrideを取り除く |

handle は同じオブジェクトで後から追加・更新された音源にも選択条件を適用する。同じオブジェクトに複数スクリプトがある場合は
コンポーネント実行順で override を合成する。後のスクリプトが同じ field を変更した値を採用する。`play()` は例外を外へ投げない。
実際に再生を開始できた件数を必ず resolve する。ユーザー操作要件で拒否された元ファイルは件数に含めない。
`list()`の`status: "autoplay-blocked"`で確認できる。画面操作後に再度`play()`を呼べる。
スクリプトの再起動、実行環境 failure、停止では、その owner の再生要求、seek、volume、loop overrideを外す。
音源コンポーネントに保存した値へ戻す。音声素材とシーン document は変更しない。

### ライトと近接イベントの実行時操作

`ctx.lights` はスクリプトのコンポーネントを付けたオブジェクト自身のライトだけを対象にする。子オブジェクトは含めない。
disabled のライトにも動作確認中の bridge を残す。そのためスクリプトから一時的に点灯できる。

| API | 操作 |
| --- | --- |
| `count()` / `list()` | 対象ライト数と `componentId`、`lightType`、有効状態、色、強度、距離を返す |
| `select({ componentId?, lightType? })` | 条件をすべて満たすライトの live handle を返す |
| `setEnabled(value)` | 動作確認中の点灯状態を変更する |
| `setColor(value)` | 動作確認中の色を変更する |
| `setIntensity(value)` | 0 以上へ正規化した強度を変更する |
| `setDistance(value)` | Point / Spot ライトの距離を変更し、対応した件数だけを返す |
| `reset()` | このスクリプトまたは選択 handle の override を外す |

同一スクリプトでは最後に変更した field を優先する。複数スクリプトではコンポーネント実行順が後の owner を優先する。
スクリプトの再起動、実行環境 failure、停止ではその owner だけを外す。設定 / MCP で保存したライト値へ戻す。
Studio 動作確認と `classic-jsx` は同じ `XriftScriptLight` と bridge を使う。動作確認中にライトの
enabled、color、intensity、shadow、距離、減衰、角度、半影、Area sizeを保存しても既存実行環境へ反映する。
`lightType` の変更、コンポーネント追加・削除だけ対象オブジェクトを再起動する。

`ctx.on` / `ctx.emit` は同じ `XriftScriptRoot` 内だけの実行環境 event bus だ。
KHR_interactivity とシーン document には接続しない。payload は cloneも永続化もしない。

Graphと連携するときは `ctx.graph.on(name, handler)` / `ctx.graph.emit(name)` を使う。
Graphの `event/send` と同名の通知をスクリプトで受け、スクリプトから送った通知はGraphの
`event/receive` で受ける。Graph側ではeventのIDまたは名前を一致させる。
同じThree.js シーン内だけで動き、Studio 動作確認と公開ワールドは同じ実装を使う。
通知は値を渡さず、保存・再送・他のビューアーへの同期もしない。Graphへの通知は
フレームごとにまとめて処理し、処理中に生じた通知は次のフレームへ送る。
スクリプトの停止・失敗・再起動で購読は自動解除される。返された関数でも解除できる。
既存の `ctx.on` / `ctx.emit` は引き続きスクリプト間のpayload付きイベントに使う。
任意のTypeScriptとGraphの自動変換は提供しない。

```ts
start(ctx) {
  ctx.graph.on("door.open", () => {
    ctx.audioSources.play();
    ctx.graph.emit("door.opened");
  });
}
```

組み込み `proximity-event` はスクリプトのコンポーネントの `entityReferences` に明示した authored オブジェクトを
`getWorldPosition` で判定する。`xrift:proximity-state`へ`channel`、inside状態、`kind`を送る。
`event-light`は同じeventを受け取る。liveな`channel` propertyが一致した時だけライトを変える。
各sensorは`sourceEntityId`で別々に追跡する。そのため同じchannelの複数sensorのうち一つが範囲を出ても、
ほかが範囲内ならライトを維持する。`kind: "enter" | "exit"`は境界をまたいだ時だけ一度送る。
`kind: "sync"`はlive channel変更や後から起動したreceiverを同期する状態通知として分ける。
sensorの停止・削除時はその元データの`exit`を送る。そのため edge eventを滞在中に繰り返さない。
`object3d.position`は親local座標だ。近接判定へ直接使わない。現時点で実行環境 player / avatarを
`ctx.find`するAPIはない。

`materials` はスクリプトのコンポーネントを付けたオブジェクト自身が所有するメッシュだけを対象にする。子オブジェクトのメッシュは含めない。
共有マテリアルを直接変更しない。実行環境用 clone へ次の override を重ねる。

| API | 操作 |
| --- | --- |
| `count()` | 対象マテリアル数を返す |
| `list()` | `meshName`、メッシュの0始まりtraversal index、マテリアル枠 index、`materialName`を列挙する |
| `select({ meshName?, meshIndex?, materialIndex? })` | 指定した条件すべてに一致するマテリアルだけを操作するhandleを返す |
| `setColor(value)` | base color を変更する |
| `setOpacity(value)` | opacity を 0 から 1 の範囲で変更する |
| `setEmissive(value, intensity?)` | emissive color と任意の強度を変更する |
| `setMetalness(value)` | metalness を 0 から 1 の範囲で変更する |
| `setRoughness(value)` | roughness を 0 から 1 の範囲で変更する |
| `setTexture(slot, textureOrNull)` | `baseColor`、`normal`、`emissive`、`metallicRoughness`、`occlusion` の slot を変更する。`null` で外す |
| `setTextureTransform(slot, transform)` | slot のテクスチャに `offset`、`repeat`、`center`、radian の `rotation` を部分上書きする |
| `resetTextureTransform(slot)` | 指定 slot にこの handle が付けたテクスチャ transform だけを取り除く |
| `reset()` | `ctx.materials`ではこのスクリプト全体、選択handleではそのhandleのマテリアル overrideを取り除く |

setter の返り値は対応して変更したマテリアル数だ。未対応のマテリアル property は無視する。
`select`の名前条件は同名メッシュすべてに一致する。index条件は現在のowned メッシュ traversalを対象にする。
handleは非同期に追加されたメッシュにも追従する。そのため 3Dモデルの読み込み完了を待って作り直す必要はない。
同じオブジェクトに複数スクリプトがある場合はコンポーネントの実行順で override を合成する。後のスクリプトが同じ property を変更した値を採用する。
`setTextureTransform` は root の `ctx.materials` と `select(...)` が返す handle の両方にある。値を省略した field は
現在の slot 値を保つ。host は対象マテリアル枠ごとにテクスチャ clone を所有する。元データテクスチャと共有素材を直接変更しない。
`resetTextureTransform(slot)` はその slot だけを元の transform へ戻す。
スクリプトの再起動または停止では、そのスクリプトの clone と override だけを外す。最後のスクリプトが終了した時点で元のマテリアルへ戻す。

### パーティクルの実行時操作

`particles` はスクリプトのコンポーネントを付けたオブジェクト自身が所有するパーティクルの放出を対象にする。
パーティクルの値は変更しない。コンポーネント実行順で実行環境 override を重ねる。

| API | 操作 |
| --- | --- |
| `count()` | 対象パーティクルの放出数を返す |
| `play()` / `pause()` | 現在の simulation を再生・一時停止する |
| `stop()` | simulation を停止し、表示中の粒子を消す |
| `restart()` | このスクリプトの restart command を発行し、経過時間を 0 へ戻す |
| `setEmissionRate(value)` | 1 秒あたりの生成数を変更する |
| `setSpeedMultiplier(value)` | 初速の倍率を変更する |
| `setSizeMultiplier(value)` | 表示サイズの倍率を変更する |
| `setColor(value)` / `setOpacity(value)` | マテリアル側の色と不透明度を変更する |
| `reset()` | このスクリプト instance のパーティクル override を取り除く |

Studio 動作確認と `classic-jsx` で生成したワールド / アイテムは
`packages/xrift-studio-runtime/src/script/particle.tsx` の同じ実装を使用する。
Runtime JSON を出力する `classic-runtime` mode はスクリプトとパーティクルを表現できない。そのためどちらも blocking 診断にする。
スクリプトごとの `restart()` counter は共有 bridge が global revision へ変換する。そのため複数スクリプトが同じローカル番号を発行しても
command が相殺されない。スクリプトの再起動または停止では、そのスクリプトの override だけを外す。

パーティクルの `maxParticles` は 1 から **10,000**、`duration` は 0.01 から 600 秒へ正規化する。
pool は `maxParticles` を越えて確保しない。continuous emission は同じ slot を再利用する。`looping: false` では
`duration` まで新しい粒子を生成する。そのあとすでに生まれた粒子が `startLifetime` を終えるまで表示を続ける。
`rateOverTime: 0` の burst-only emitter も動作する。`time`、`count`、`cycles`、`interval` を duration 内で展開する。
`looping: true` では同じ burst schedule を duration ごとに繰り返す。continuous slot が pool を使い切った場合や、
burst の合計が残り容量を越えた場合は、後ろの burst から上限で切る。

`ctx.particles.setEmissionRate` は authored emission 全体に対する実行環境 override だ。override が有効な間は
指定した continuous rate を使う。authored burst は発生しない。burst へ戻すには `ctx.particles.reset()` を呼ぶ。
またはスクリプトを再起動する。

### ビューアーごとの見え方

`ctx.viewer` は、シーン設定のうち「そのビューアーの画面に見えるもの」を実行時に上書きする。
シーン設定は全ビューアー共通だ。そのためポストエフェクトを有効にすると重い端末では見る側が自分で切れない。
`ctx.viewer` の書き込みは、そのスクリプトを実行しているクライアントの描画にだけ効く。他のビューアーへ同期しない。
ワールド作者は「画質を上げる」を用意し、選択を各自に委ねられる。

| API | 操作 |
| --- | --- |
| `setPostprocessing(enabled)` | ポストエフェクト全体を切り替える |
| `setBloom({ enabled?, strength?, radius?, threshold? })` | 発光を切り替え、強さ・広がり・しきい値を変える |
| `setAmbientOcclusion(enabled)` | 接地部分の陰影を切り替える |
| `setColorGrading(enabled)` | 色味の調整を切り替える |
| `setExposure(value)` | 露出を設定する。1 が既定 |
| `setFog({ enabled?, color?, near?, far? })` | 距離フォグを切り替え、色と距離を変える |
| `setAmbient({ enabled?, color?, intensity? })` | 環境光を切り替え、色と強さを変える |
| `setSkybox({ enabled?, ibl?, exposure?, rotationDegrees? })` | 背景の表示、IBL、明るさ、水平回転を変える |
| `setCameraFov(degrees)` | 視野角を度で設定する |
| `reset()` | このスクリプトの viewer override を外す |

スクリプトの再起動、実行環境 failure、停止では、そのスクリプトの override だけを外す。
再入室したビューアーはシーン設定の値を見る。値の合成は他の bridge と同じくコンポーネント実行順だ。
同じ field を後のスクリプトが上書きする。ノードグラフの `xrift/setProperty` が
書くシーンプロパティとも同じ bridge を共有する。そのためスクリプトとグラフが競合せず合成される。

環境光がシーンに無い場合、`setAmbient` は実行環境が所有する AmbientLight を追加する。
これがないと、環境光を切っているシーンでだけ「明るくする」が効かない。
空の背景画像そのものの差し替えはスクリプト API には無く、ノードグラフの
`skyboxImage` プロパティで行う。素材の解決先はサーフェスが持っており、スクリプトから
任意素材を空へ差し込む API は提供しない。

### 実行時変更と永続編集

| 変更経路 | 保存 | 動作確認中の反映 | 停止 / 再起動 |
| --- | --- | --- | --- |
| `ctx.audioSources`、`ctx.lights`、`ctx.materials`、`ctx.particles`、`ctx.viewer`、`setTextureTransform` | runtime-only。document revision は変えない | setter を呼んだ時点から対象オブジェクトの所有 player / ライト / clone に反映 | そのスクリプトの再生要求、clone、overrideを外し、元のコンポーネント / 素材値へ戻る |
| スクリプトのコンポーネントの宣言済み property | シーン document | 同じスクリプト instance の `ctx.props` へ次の frame から反映 | 保存値として残る |
| スクリプト元データ、スクリプト / 素材 / オブジェクト参照、コンポーネント構成 | 元データ / シーン document | 保存済み元データをcompileし、成功後に影響するオブジェクトだけを再起動。失敗時は last-good module を継続 | 保存値として残る |
| 既存マテリアル / パーティクルの property | AssetManifest | 設定または MCP から保存し、その素材を参照するオブジェクト / Emitter だけを再反映 | 保存値として残る |
| 既存テクスチャの import settings | AssetManifest | MCP から保存し、直接参照またはマテリアル / パーティクル経由で参照するオブジェクトだけを再起動 | 保存値として残る |
| ライトのコンポーネントの scalar property | シーン document | 設定または MCP から保存し、既存ライト実行環境へ再起動なしで反映 | 保存値として残る |
| オブジェクト / コンポーネントの追加・削除、ライト種別、その他の構造変更 | シーン document | 設定または MCP から保存し、影響するオブジェクトだけを再起動 | 保存値として残る |
| シーン settings | シーン document | MCP の `update_scene_settings` から共有シーンへ即時反映 | 保存値として残る |

動作確認中の設定で永続編集できる素材 property は、現時点では既存のマテリアル / パーティクルに限る。
テクスチャ元データの新規 import と設定からのテクスチャ import settings 変更は編集に戻って行う。
MCP の `update_texture_asset` は同じ動作確認 session 中でも永続化できる。テクスチャを直接参照するオブジェクトと
マテリアル / パーティクル経由で参照するオブジェクトだけを再起動する。`import_audio_asset` と `import_texture_asset` は
atomic importを伴う。そのため編集限定だ。シーン settings の設定は動作確認中 read-only のままだ。一方 MCP の `update_scene_settings` は
同じ動作確認 session 中でも永続化と即時反映に対応する。MCP は `set_material` と `create_document_asset` を含むほかの対応済み write も実行できる。
実行環境演出を保存したい場合は値を `ctx.*` から読み戻す仕組みはない。そのため設定または次の永続 MCP tool へ同じ値を明示する。

MCP client は最初に `get_scripting_capabilities` を呼ぶ。利用可能なスクリプト API、テクスチャ slot、参照制限、
作成から動作確認までの tool 順序と、動作確認中に永続化できる操作を機械可読な形で取得できる。

ライト / 音声 / テクスチャ / マテリアル操作は目的で入口を分ける。

| 目的 | スクリプト実行環境 | 永続 MCP authoring |
| --- | --- | --- |
| 独立した音声 playerを動作確認中だけ作る | `ctx.assets.loadAudio` | 対象外 |
| 保存済み音源を動作確認中だけ操作する | `ctx.audioSources`。同じオブジェクトのコンポーネントだけをowner単位で上書き | 対象外 |
| 音声素材を追加・確認する | 対象外 | 編集中の`import_audio_asset` / `get_audio_asset` |
| 音源オブジェクトを保存して配置する | 対象外 | `place_asset`。既存オブジェクトへは`add_component(definitionId: "core.audio-source")`後に`update_component` |
| 動作確認中だけライトを点灯・点滅・調整する | `ctx.lights`。同じオブジェクトのライトだけをowner単位で上書き | 対象外 |
| ライトのコンポーネントを追加・保存する | 対象外 | `add_component(definitionId: "core.light.*")`後に`update_component` |
| テクスチャを一時的に読み込む | `ctx.assets.loadTexture`。素材の色空間、画像の繰り返しと補間、上下を反転する、Mipmapを既定値にする | 対象外 |
| 動作確認中だけマテリアルの見た目や UV を変える | `ctx.materials.set*` / `setTextureTransform`。オブジェクト所有 clone だけを変更 | 対象外 |
| テクスチャの読み込む / 画像の繰り返しと補間設定を保存する | 対象外 | `get_texture_asset` / `update_texture_asset`。新規画像は編集中の `import_texture_asset` |
| マテリアルの PBR値やテクスチャ bindingを保存する | 対象外 | `get_material_asset` / `update_material_asset` / `set_material_texture_transform` |
| マテリアルをメッシュの割り当て枠へ保存して割り当てる | 対象外 | `set_material` |

スクリプト実行環境の再生要求、option、transform は停止で消える。MCP authoring はシーン document / AssetManifest と通常の履歴へ残る。
同じ見た目を両方へ暗黙に書き戻さない。保存したい値は永続 tool へ明示する。

| 目的 | MCP tool |
| --- | --- |
| 現在の ID、mode、revision、スクリプト診断を読む | `get_editor_context` |
| スクリプト API と trust / persistence capability を読む | `get_scripting_capabilities` |
| スクリプトを作成・適用・更新する | `list_script_templates`、`create_script_asset`、`apply_script_template`、`get_script_asset`、`update_script_asset` |
| スクリプトの property / 明示参照を更新する | `update_script_component` |
| ローカルMP3 / WAVを音声素材として追加する | `import_audio_asset` |
| 音声素材の管理下元データ情報を取得する | `get_audio_asset` |
| 音源オブジェクトを配置する | `place_asset`へ音声素材 IDを渡す |
| 既存オブジェクトへ音源を追加・設定・削除する | `add_component(definitionId: "core.audio-source")`、`update_component`、`remove_component` |
| 既存オブジェクトへライトを追加・設定・削除する | `add_component(definitionId: "core.light.point")`など、`update_component`、`remove_component` |
| ローカル画像をテクスチャとして追加する | `import_texture_asset` |
| テクスチャの設定を取得・更新する | `get_texture_asset`、`update_texture_asset` |
| マテリアルをメッシュの割り当て枠へ割り当てる | `set_material` |
| マテリアルを作成する | `create_document_asset(kind: "material")` |
| マテリアルを読み、PBR / テクスチャ binding を保存する | `get_material_asset`、`update_material_asset` |
| マテリアルテクスチャの offset / scale / rotation / UV set を保存する | `set_material_texture_transform` |
| メッシュ / 葉素材の描画距離（奥 Clip）を保存・解除する | `update_component.patch.maxDistance`。有限値 `0.1..1,000,000`、`null`でシーン Cameraの奥へ戻す |
| パーティクルを作成・取得・更新する | `create_document_asset(kind: "particle")`、`get_particle_asset`、`update_particle_asset` |
| シーン settings を取得・部分更新する | `get_editor_context.sceneSettings`、`update_scene_settings` |
| コンポーネント構成を取得・変更する | `list_component_definitions`、`get_entity_components`、`add_component`、`update_component`、`remove_component`、`set_entity_enabled` |

`update_material_asset.patch` は `pbrMetallicRoughness`、normal / occlusion / emissive テクスチャ、
`emissiveFactor`、alpha、double-sided、KHR material extensions と、移行用の
`color` / `opacity` / `metalness` / `roughness` / 各 `*TextureId` を受ける。
`set_material_texture_transform` の slot は `baseColor`、`metallicRoughness`、`normal`、`occlusion`、`emissive`、
変更値は `offset`、`scale`、`rotationDegrees`、`texCoord` または `reset` である。

`update_particle_asset.patch` は `maxParticles`、`duration`、`looping`、`prewarm`、`simulationSpace`、
start delay / lifetime / speed / size / rotation、gravity、emission、shape、color / size / velocity over lifetime、
renderer を受ける。renderer の `materialAssetId` / `textureAssetId` は存在する正しい kind の素材だけを受け付ける。

`update_scene_settings` は `skybox`、`fog`、`ambient`、`camera`、`postprocessing`、`vegetation`、`physics`、
`editor` を任意に組み合わせたnon-empty patchとして受ける。空の背景は表示、IBL、projection、既存テクスチャ参照、gradient、回転、反転、露出、
有限メッシュ transformを更新できる。Editor sectionは背景、grid、gizmo size、snapを更新できる。
`postprocessing` sectionは合成全体の有効・無効、`ao` / `bloom` / `grading` 各layerの有効・無効と値、
HDR、露出、そして `order` を更新できる。`order` はlayerを適用順に並べた配列だ。並べ替え可能なlayerを
それぞれ1つずつ含む完全な配列だけを受ける。部分的な配列は残りの位置を推測することになる。
作者が決めた見た目を黙って変えるためだ。AOはsceneを描き直すpassで常に最初に適用される。そのため `order` に含めない。
`skybox.imageAssetId` はAssetManifestに存在するテクスチャだけを受け付ける。project 元データを持つもの（または移行前の空の背景）に限る。
`null`で参照とIBLを解除する。色、有限値、範囲、Fog / Cameraのnear-far関係は確定前に検証する。

同じシーン settings 設定に表示される公開title / descriptionはプロジェクト metadata だ。thumbnailはnative binary fileだ。
いずれも SceneDocument.settingsではない。そのためこのtoolへ混在させない。Directional / Point / Spot ライトもオブジェクトコンポーネントだ。
`get_entity_components` / `update_component`の対象になる。これらをシーン settingsとして暗黙に変更しない。

`import_audio_asset` は信頼できる絶対`sourcePath`と現在のrevisionを受ける。MP3またはWAVだけを扱う。
native境界で絶対path、通常file、symlink / reparse pointなし、128 MB上限、拡張子とfile signatureの一致、
read前後のsize一致を確認する。そのあと既存importと同じcontent-addressed destination、atomic commit、history、
自動保存を通す。MCP応答は音声素材 ID、管理下のproject-relative path、format、MIME、byte lengthだけを返す。
外部path、data URL、binary bytesを返さない。同じ元データ hashがあれば複製せず既存音声を選択する。
`get_audio_asset`も同じ管理下metadataだけを返す。永続音源は音声素材を`place_asset`で配置する。
または `core.audio-source`を追加する。そして `update_component.patch`の`audioAssetId`、`volume`、`loop`、`autoplay`、
`spatial`、`refDistance`、`rolloffFactor`、`maxDistance`を保存する。

`import_texture_asset` は信頼できる絶対 `sourcePath` と現在の revision を受ける。PNG、JPEG、WebP、AVIF、GIF、
BMP、SVG、KTX2 の通常 file だけを 128 MB 上限で読み込む。最終開始ファイルの symlink、相対 path、未対応拡張子を拒否する。
既存 import と同じ signature / SVG external-reference 検査、content-addressed destination、atomic commit、
thumbnail 生成を通す。MCP 応答には外部 path と file bytes を返さない。管理下の project-relative path と素材 ID だけを返す。
同一元データ hash が存在する場合は複製せず既存テクスチャを返す。

`update_texture_asset.patch` は `colorSpace`、`generateMipmaps`、`flipY`、`resize`、
`sampler.wrapS / wrapT / magFilter / minFilter`、`compression.format / quality` を受ける。
未知 field、enum 外の値、非有限値、範囲外の max size / quality は document を変えず拒否する。
Mipmaps を無効にした時の mipmap filter は既存モデルと同じく `linear` へ正規化する。
この保存値は、次に `ctx.assets.loadTexture` が同じテクスチャを読む時の既定値になる。
スクリプト側で option を明示した項目だけは、そのスクリプト instance の読み込みで保存値より優先する。

基本手順は `get_editor_context`、`list_script_templates`、`create_script_asset` または `apply_script_template`、
`add_component`、`update_script_component`、`set_play_mode` の順だ。すべての write へ
`projectId`、`sceneId`、`expectedRevision` を渡す。write 後は `get_editor_context` で最新 revision と
`scriptRuntime` を取り直す。動作確認中の対応済み write は直ちに authoring data へ保存する。
シーン settingsは共有シーンへ即時反映する。コンポーネント / オブジェクト変更はそのオブジェクトを再起動する。
マテリアル / テクスチャ / パーティクル変更は参照オブジェクトだけを再起動する。音源コンポーネントの変更も
そのオブジェクトだけへ反映する。ライトのscalar変更は既存実行環境へ即時反映する。ライト種別だけ対象オブジェクトを再起動する。
`ctx.audioSources` / `ctx.lights`のruntime-only状態をAssetManifestやSceneDocumentへ暗黙に書き戻さない。

MCPから生成・更新したスクリプトも、動作確認で保存済み元データを変換して実行する。
スクリプトごとの承認ダイアログは表示しない。`get_scripting_capabilities` は
`sandboxed: false`、`trustGate: false` を返す。変換失敗時は編集に留まり、
動作確認中の更新に失敗した場合は直前の正常なmoduleを維持する。
`unapprovedPolicy` は旧clientとの互換性のため受け付けるが、実行可否には影響しない。
`get_editor_context.scriptRuntime.trust` は `status: "not-required"` と実行中の元データ情報を返す。

`pnpm tauri:dev` のdebug buildだけにTauri MCP bridgeを登録する。
webview JavaScriptやTauri commandを扱う開発用機能であり、release buildには搭載しない。

## 組み込み Template

素材の追加 > スクリプトと MCP は同じ version 6 catalog を使う。作成画面では元データ preview を確認できる。
オブジェクトを選択している場合はスクリプトとスクリプトのコンポーネントを 1 回の履歴操作で作成できる。
XRift公式shortcutと競合する。そのため version 5では`keyboard-move`と`audio-hotkey`を組み込み一覧から外した。
既存スクリプト元データと低レベル`ctx.input`の互換性は維持する。新しい標準例はevent / propertyで接続する。

| ID | 用途 | 追加設定 |
| --- | --- | --- |
| `blank` | 最小 lifecycle | なし |
| `vehicle` | 公式Vehicleと運転席・同乗席（World向け） | 速度・旋回速度 |
| `seat` | 公式Seat（World向け） | 座面の高さ |
| `rotate` | 軸と速度を設定からリアルタイム変更 | なし |
| `float` | 上下移動 | なし |
| `follow-entity` | 明示参照したオブジェクトを追従 | オブジェクト参照 |
| `material-pulse` | 色、発光、粗さの animation | メッシュの描画 |
| `light-flicker` | ライトの色・強度・点灯をリアルタイムに点滅 | ライト |
| `texture-scroll` | テクスチャ設定を継承した読み込みと、所有clone上のUV scroll | テクスチャとメッシュの描画 |
| `particle-control` | 再生、放出、速度、サイズ、色 | パーティクルの放出 |
| `model-display` | 宣言済みGLBをTSX `Render`へ読み込み、速度をリアルタイム変更 | 3Dモデルの素材 |
| `audio-source-control` | 同じオブジェクトの音源の再生、音量、loop、再生位置をリアルタイム変更 | 音声素材と音源 |
| `proximity-event` | 明示参照オブジェクトがworld座標の範囲へ入った／出た状態をchannelで送信 | オブジェクト参照 |
| `event-light` | 同じchannelの近接eventでライトの色と強度をfade | ライト |
| `event-visibility` | スクリプト event で表示切替 | なし |

`create_script_asset` は `templateId` または任意 `source` のどちらかを受け取る。Templateはcatalogの
`language`に従って`.ts` / `.tsx`を選ぶ。任意のJSX 元データでは`language: "tsx"`を明示する。
`apply_script_template` はスクリプトの作成と指定オブジェクトへのコンポーネント追加を 1 revision で行う。
未知の template ID、存在しないオブジェクト / Folder、古い revision では document を変更しない。

## property の種別

設定のフィールドは宣言から自動生成する。種別は既存のコンポーネント field 種別の語彙に揃える。

`string`、`number`、`boolean`、`enum`、`vec2`、`vec3`、`color`、`asset`、`entity`

`asset` と `entity` は既存コンポーネントにはない種別だ。スクリプトのために追加する picker を使う。
選択結果は `assetReferences` / `entityReferences` にも反映する。参照の検証と削除時の影響調査へ乗せる。

宣言を静的に読み取れないスクリプトは、値を推測しない。「property を読み取れません」と理由を示す。コードは実行しない。

## モジュール解決

許可した specifier は、Studio が既に読み込んでいる同一 module インスタンスへ解決する。

`three`、`@react-three/fiber`、`@react-three/drei`、`@react-three/rapier`、`@xrift/world-components`、`react`、`xrift:script`

`three` を二重にロードすると `instanceof` と R3F の突き合わせが壊れる。同じシーンを共有できない。
この解決は公開先でも同じだ。公開ワールドは共有 singleton を前提とする。

`https://` から始まる module を解決する内部 opt-in はある。現在の Editor UI / MCP からは有効化しない。
通常の動作確認は offline で完結する。remote module を blocking にする。**公開時は常に blocking 診断**とする。対象スクリプトと理由を示す。
動的 `import(...)` と `useFrame` も動作確認 / 公開の両方で blocking にする。

## 対応範囲

| 操作 | Studio 動作確認 | `classic-jsx` で生成したワールド / アイテム | 永続化 | 現在の入口 |
| --- | --- | --- | --- | --- |
| number / color / vector などの property 変更 | 対応。次の frame から同じ instance へ反映 | 対応。compile 時の値を初期値として使用 | シーン document | 設定 / MCP |
| 明示参照した素材の URL 解決 | 対応 | 対応 | なし | `ctx.assets.url` |
| PNG / JPEG / WebP など基本テクスチャの読み込み | 対応。素材の色空間 / 画像の繰り返しと補間 / 上下を反転する / Mipmapを継承し、明示optionを優先 | 対応 | なし | `ctx.assets.loadTexture` |
| MP3 / WAV 音声の再生・停止・seek・音量・loop・再生速度 | 対応 | 対応 | runtime-only | `ctx.assets.loadAudio` |
| オブジェクト自身の音源の再生・停止・seek・音量・loop | 対応。owner単位override | 対応。同じ実行環境実装 | runtime-only | `ctx.audioSources` |
| オブジェクト自身のライトの点灯・色・強度・Point / Spot距離 | 対応。owner単位override | 対応。同じ実行環境実装 | runtime-only | `ctx.lights` |
| 明示参照オブジェクトのworld座標近接とスクリプト event接続 | 対応 | 対応 | runtime-only | `ctx.find` + `getWorldPosition` + `on` / `emit` |
| 宣言済みGLBをTSX `Render`で表示 | 対応 | 対応 | 元データ | `ctx.assets.url` + `useGLTF` / `Clone` |
| マテリアルテクスチャの repeat / offset / center / rotation | 対応。オブジェクト / マテリアル枠所有cloneだけを変更 | 対応 | runtime-only | `ctx.materials.setTextureTransform` |
| オブジェクト自身のマテリアルの color / opacity / emissive / metalness / roughness | 対応 | 対応 | runtime-only | `ctx.materials` |
| オブジェクト自身のマテリアルへのテクスチャ設定 | 対応 | 対応 | runtime-only | `ctx.materials.setTexture` |
| オブジェクト自身のパーティクルの再生 / 放出 / 速度 / サイズ / 色 | 対応 | 対応 | runtime-only | `ctx.particles` |
| パーティクルの burst-only / loop / non-loop duration | 対応。上限 10,000 particles | 対応。同じ実行環境実装 | AssetManifest | 設定 / `update_particle_asset` |
| project KTX2 を使うマテリアル / パーティクルの描画 | 対応。local Basis transcoder | 対応。Basis file を生成物へ同梱 | AssetManifest | 素材 / マテリアル / パーティクル設定 |
| マテリアル / パーティクル property の動作確認中の永続編集 | 対応。参照オブジェクトだけ再反映 | 次回の生成へ反映 | AssetManifest | 設定 / MCP |
| テクスチャ import settings の動作確認中の永続編集 | 対応。依存するオブジェクトだけ再起動 | 次回の生成へ反映 | AssetManifest | `update_texture_asset` |
| オブジェクト / コンポーネント構成の動作確認中の永続編集 | 対応。影響オブジェクトだけ再起動 | 次回の生成へ反映 | シーン document | 設定 / MCP |
| 明示参照した別オブジェクトの取得 | 対応 | 対応 | なし | `ctx.find` |
| React Three Fiber の宣言的な描画追加 | 対応 | 対応 | 元データ | named export `Render`。`useFrame` は不可 |
| マテリアル自体の編集 | スクリプト API では未対応 | スクリプト API では未対応 | 対応 | 設定 / マテリアル MCP tools |
| マテリアル ID をそのまま実行環境マテリアルとして適用 | 未対応 | 未対応 | なし | 今後の typed loader / recipe |
| KTX2、HDR、EXR のスクリプト専用読み込み | 未対応 | 未対応 | なし | 現在は素材 / シーン設定。専用 loader は今後 |
| 3Dモデルのimperative typed loader | 未対応。TSX `Render`は対応 | 未対応。TSX `Render`は対応 | なし | 今後の素材種別別facade |

対応する。

- 動作確認で実行する。動作確認中の元データ編集では該当オブジェクトだけをホットリロードする
- 停止では実行中の blob module とresourceを破棄する。同一元データのTypeScript変換結果だけを
  128件のbounded cacheへ残す。次の動作確認はtop-level codeと`start`を必ず新しいmoduleとして実行し直す
- 動作確認中のオブジェクト / コンポーネント構成とマテリアル / テクスチャ / パーティクル property を永続変更する。参照オブジェクトだけへ差分反映する
- 1 オブジェクトへ複数スクリプトを付ける
- 公開ワールドへ静的 import として出力する
- host が管理する `start` / `update` / `ctx.on` と React の `Render` render error をスクリプト単位で隔離する
- 設定 / MCP で変更した宣言済み property を frame 単位で反映する
- 明示参照した基本テクスチャ / 音声、TSX Renderの3Dモデル表示、オブジェクト単位の実行環境音源 / ライト / マテリアル / パーティクル overrideに対応する
- local / builtin テクスチャのマテリアル / パーティクル preview に対応する。local Basis transcoder を使う KTX2 preview / 公開描画に対応する

対応しない。

- 物理 API はワールド project だけに提供する。アイテム project は重力と RigidBody を持たないため未対応として degrade する
- 低レベル`ctx.input`は既存スクリプト互換用のkeyboard状態だけを持つ。公式shortcut競合を避けるため組み込みTemplateでは使わない。pointer lock、マウス移動、gamepadの配線も提供しない
- `ctx.find`から実行環境 player / avatarを取得するAPIはない。近接Templateは明示参照したauthored オブジェクト同士だけを扱う
- 実行環境 JSON 出力ではスクリプトを表現できない。そのため blocking 診断とする
- 任意 npm package の importには対応しない。staging へ install できる package は固定の許可リストに限る
- スクリプトから公式 XRiftのコンポーネントを imperative に操作する API は初版では提供しない
- スクリプトからマテリアルの recipe を永続変更することと、マテリアルを ID だけで一括適用することには対応しない
- スクリプト API からの `KTX2Loader`、`HDRLoader`、`EXRLoader` のようにデコーダーや renderer 設定を伴うテクスチャ loaderには対応しない
- 素材一覧の列挙、未宣言素材の読み込み、project path の直接参照には対応しない
- `Render` 内の `useFrame`には対応しない。フレーム処理は host が隔離する `start().update(delta)` を使う

## 実行環境の権限と限界

**スクリプトは完全に隔離されていない。** この節の内容を「sandbox 済み」と表示してはならない。

動作確認は iframe や Worker を挟まない。アプリと同一 realm で動く。`withGlobalTauri` により IPC bridge が `window` に露出している。
そのためスクリプトは原理的にアプリと同じ権限を持つ。ファイルシステムとシェルへの到達手段を持ちうる。

module scopeでは `window`、`globalThis`、`self`、`document`、`fetch`、
`XMLHttpRequest`、`Function`、`importScripts`、`__TAURI__`、`__TAURI_INTERNALS__` を遮蔽する。
ES moduleのstrict modeでは `eval` をlexical bindingで遮蔽できない。
これらは意図しないアクセスを減らす処理であり、隔離境界にはならない。

2026-09-07にスクリプトごとの内容hash承認を廃止した。UIとMCPの動作確認は同じ実行経路を使う。
元データは一度だけ読み、変換と評価に同じ値を使う。hash、言語、契約version、来歴は、
実行中の版の特定とhot reloadのために保持する。旧承認storeへの照会・書き込みは行わない。
プロジェクト切り替え時の破棄、固定のimport許可リスト、ファイルパス検証、
変換失敗時の開始防止は維持する。スクリプトは通常のローカルコードとして動作し、
無限loopや同一realmからの権限到達を隔離する保証はない。

## 既知の課題

- 完全な隔離は未対応だ。実現するには realm を分ける必要がある。Three.js インスタンス共有と両立しない
- Monaco と TypeScript service は local 同梱済みで offline でも動く。動作確認変換は軽量な`transpileModule`を使う。
  Editor補完と診断はlanguage-service workerへ分離している。Architecture 10 章が求める CSP は未適用だ。
  動作確認の blob module と共有 module bridge を許可しながら権限を狭める方針が残っている
- スクリプトの `ctx.assets.loadTexture` は Three.js の標準 `TextureLoader` を使う。マテリアル / パーティクル preview と
  `classic-jsx` の KTX2 描画は local Basis transcoder に対応済みだ。一方 KTX2、HDR、EXR、動画テクスチャ、cube テクスチャ、
  renderer capability に応じた transcoding、進捗と再試行を含むスクリプト用 typed loader は未対応だ
- `ctx.materials` はメッシュに既に設定されたマテリアルの実行環境 clone を操作する。マテリアルの recipe 全体、
  シェーダー固有 uniform、複数 UV set の選択は未対応だ
- パーティクルは Studio と公開で共通実装になった。burst の時刻 / cycle / interval と non-looping duration に対応した。
  ただし world-space simulation、per-particle size / rotation、stretched billboard、sort mode は互換表示だ。
  完全な simulation ではない。pool は 10,000 particles が上限だ。容量を越える burst は切る
- `ctx.particles.setEmissionRate` は authored burst と加算する API ではない。burst を抑止して continuous rate を
  実行環境 override する。burst と continuous rate を同時に動的編集する API は未対応だ
- テクスチャ読み込み失敗は `null` で返す。素材名、format、decode error をまとめたスクリプト Console 診断と
  preload / loading state の標準化が要る
- スクリプト Console はスクリプト Editor 内で compile / lifecycle / event / Render の失敗と `ctx.log` を表示する。
  MCP の `get_editor_context.scriptRuntime` からも JSON-safe な直近結果を取得できる。現時点では元データ mapによる行・列、
  同一例外の集約、個別スクリプトの再開操作は未対応だ
- pointer / mouse / gamepad と実行環境 player / avatar参照は未対応だ
- `ctx.lifecycle` を使わない `Promise.then`、global timer、Render の pointer / physics callback など、host の所有外で
  開始した非同期 callback の例外帰属と自動停止は未対応だ
- 公開先プラットフォームが upload された bundle を審査または sandbox するかは未確認だ。Studioのlocal 動作確認は公開実行環境の隔離や審査を代替しない

## 公開

スクリプト元データと host adapter を staging の overlay file として出力する。生成した `src/World.tsx` または
`src/Item.tsx` から静的 import で参照する。

- `.ts` / `.js` は静的素材として許可されない。そのため必ず overlay file として出す
- 生成物に `eval`、`Function`、動的 import を出さない
- host adapter と authoring API は単一の実装を正本とする。Editor 動作確認と生成物で二重管理しない
- 生成したワールド / アイテムのシーン subtree は動作確認と同じ `XriftScriptRoot` で包む。各コンポーネントは同じ
  `XriftScriptHost` へ default スクリプト、任意の named `Render`、property、実行順、明示参照を渡す
- `assetReferences` のうち staging へ copy した素材だけを決定的な URL map へ入れる。
  生成JavaScriptと同じ公開ディレクトリで解決してから `ctx.assets.url` / `loadTexture` を動作確認と同じ参照 gate へ通す
- KTX2 を参照するマテリアル / パーティクルがある場合は pinned Basis JS / WASM を staging の `public/` 直下へ
  copy する。`useKTX2` の transcoder path に生成JavaScriptと同じ公開ディレクトリを渡す
- Draco 圧縮した 3Dモデルがある場合は pinned Draco デコーダーを同じく `public/` 直下へ copy する。
  `useGLTF` のデコーダー path に生成JavaScriptと同じ公開ディレクトリを渡す
- オブジェクト group へ安定 ID を付ける。`entityReferences` に宣言した ID だけを `ctx.find` で解決する
- ワールド / アイテム instance ごとの scope marker 内だけを探索する。同じアイテムを複数配置しても別 instance のオブジェクトを返さない
- テクスチャ cache / dispose、音声停止・解放、マテリアル clone / restore、frame 更新と event bus は host の lifecycle に属する。
  動作確認の停止と公開 world の unmount で同じ cleanup を行う
- 出力は staging の build で型検査する。スクリプトの型エラーは公開を止める。そのため upload 前に Studio 側で提示する
- 同じ入力から同じ出力を得る決定性を維持する。識別子は hash 由来とする。挿入順や時刻に依存させない
- プレハブ instance は合成 ID で事前展開する。そのためスクリプト instance の同一性は展開後のコンポーネント ID から導出する

## 参照

- 例外範囲の定義: [ビジュアルエディター Architecture 4.8](./VISUAL_EDITOR_ARCHITECTURE.md#48-scripting-script-asset--script-component)
- 状態設計: [UX Interactions F-28](./UX_INTERACTIONS.md)

## Vehicle / Seat（world-components 0.52.0）

Assets の追加から「新規スクリプト」を開き、`Vehicle` または `Seat` を選ぶ。
選択中のEntityへ追加すると、Vehicleの速度・旋回速度、Seatの座面の高さをInspectorから変更できる。
同じEntityに同じテンプレートを複数付ける場合は「同じEntity内の識別子」を別々にする。
見た目はTSXの `Render` にあるmeshを編集する。Scriptの描画はPlay中だけで、Editには表示しない。

Vehicleは車体と運転席・同乗席を一つの `Render` 内に置く。
`Seat driver` の入力を公式 `Vehicle onDrive` へ渡し、車体の移動・旋回を行う。
W/Sで前後、A/Dで旋回、StudioのWorld PlayではSpaceで降車する。
Seat単体もSpaceで立てる。Play停止・座席削除・テレポートで着席を解除する。
テンプレートはWorld向け。アイテムのPlayにはプレイヤーがいないため、着席・操縦確認はWorld Playで行う。
Itemに転用する場合は、同じItemを複数置いてもIDが衝突しないよう、`useItem().id` を座席・車体IDへ含める。

デスクトップ版の公開物でも同じTSXと公式Componentを使う。
Scriptを扱わないブラウザ版のRuntime JSON公開は対象外。車体の姿勢・同乗席・後から入室した人への状態は
XRiftプラットフォームのSeatContextに任せ、`useInstanceState` で重複同期しない。
Studioの着席Providerは単一プレイヤーの確認用で、オンライン同期やアバターの着席アニメーションは再現しない。
複数人からの見え方と再入室後の停車位置は、XRift上で別途確認する。

テンプレートは移動と旋回の出発点であり、車体の衝突・重力・地形への接地判定は含まない。
`translateZ` は車体の向きに沿って進む。地形に合わせて車体を傾ける処理は、作品側の `onDrive` に追加する。
砲台など、車体同期を使わない操作では引き続き `Seat onControlInput` を使用できる。

### 公式更新への追従

Editor、Classic出力・公開ステージング、Runtimeの開発依存、Web upload shellを同じバージョンに揃える。
`node scripts/check-world-components-alignment.mjs` はバージョンと必要な公式exportを検査する。
依存の更新時は生成TSXの型検査と `e2e/vehicle-seat.spec.ts` で座席の登録・解除・運転を確認する。

Vehicle/Seatは、コールバックとReact Contextの親子関係を保持できるTSXテンプレートとして提供する。
Add Componentの公式registryへ静的なwrapperとして追加すると、RuntimeのEntity別portal間で
VehicleのContextが引き継がれないため、現時点ではそこへ登録しない。
速度・旋回速度・高さはScript propertyとしてInspectorから編集する。

参照: [公式Component](https://github.com/WebXR-JP/xrift-world-components)、
[World template](https://github.com/WebXR-JP/xrift-world-template)、
[Item template](https://github.com/WebXR-JP/xrift-item-template)。
