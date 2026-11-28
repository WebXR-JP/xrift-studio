# Scripting Contract

## 目的

制作者は TypeScript のスクリプトを使ってオブジェクトの動作を記述できる。エディター上の動作確認（Play）と公開ワールドでは同じスクリプトを実行し、XRift 上でも同じ挙動になることを本書の契約とする。

空間 UI では `@react-three/uikit` と `@pmndrs/uikit` もインポートできる。UIKit Panel テンプレートの仕様と運用ルールは次のとおりである。

- 実際のライブラリの `Container` と `Text` を使って角丸・余白・Flexbox を描画する。
- `Render` は Play で実行し、公開物にも同じソースを含める。UIKit のパッケージバージョンは Studio に合わせて固定する。
- 初期の Inter フォントは英字向けであるため、日本語などを扱う場合は Font Asset を宣言して `ctx.assets.url` から `useTTF` へ渡す。
- テンプレートは表示する文字から必要なグリフを生成し、文字数に合わせてアトラスの大きさを決める。
- `useTTF` へ渡す配列は、子が読み込み待ちになる `Suspense` より上位の `Render` で保持する。子の初回描画で生成すると再描画のたびに入力が変わり、読み込みが終わらない。
- 長い日本語を表示する場合は、末尾まで文字が欠けないことも実際の表示で確認する。フォントを読み込めない状態や編集画面（Edit）での表示は、UIKit の描画確認として扱わない。

本書は [ビジュアルエディター設計 4.8](./VISUAL_EDITOR_ARCHITECTURE.md#48-scripting-script-asset--script-component) が定めた例外範囲の実装契約である。本書に記載のない形での任意コード実行は行わない。

## 分離の原則

パーティクルと同じ責務分離を採用する。再利用できる定義は素材（Script Asset）側が持ち、オブジェクト固有の値はコンポーネント（Script Component）側が持つ。

| | 持つもの | 持たないもの |
| --- | --- | --- |
| スクリプト（`ScriptAsset`） | `kind: "script"`、`contractVersion`、`language`、`source.kind = "project"` の相対パス | コード本文、派生したプロパティスキーマ |
| スクリプトコンポーネント（`ScriptComponent`） | `scriptAssetId`、宣言済みプロパティ値、`assetReferences`、`entityReferences`、`runIn` | コード、関数、式 |

コード本文はプロジェクト内の `scripts/` 配下にあるソースファイルを本体とし、`AssetManifest` には参照情報だけを置く。プロパティスキーマはソースファイルから導出して Editor State が保持し、マニフェストへは保存しない。

スクリプト本文を編集してもマニフェストの項目は変更しない。保存時は、そのスクリプトを使用するオブジェクトだけをコンパイルして再起動する。`AssetManifest` を変更した場合も依存関係を逆引きし、変更したマテリアル・パーティクル・テクスチャなどを参照するオブジェクトだけ実行環境の世代を更新する。

## 永続化する情報

`ScriptAsset` は次の情報を保持する。

- `id`: シーンとプレハブが参照する安定した素材 ID
- `contractVersion`: 本書の契約バージョン。読み込み時に厳密一致で検証する
- `language`: `ts` または `tsx`
- `source`: `kind: "project"` とプロジェクトルート相対の `/` 区切りパス。OS の絶対パス、Blob URL、トークンは保存しない

`ScriptComponent` は次の情報を保持する。

- `scriptAssetId`: 参照先スクリプトの ID
- `properties`: 宣言済みプロパティの値。純粋な JSON かつ有限数に限る
- `assetReferences` / `entityReferences`: プロパティが参照する素材とオブジェクトの ID
- `runIn`: 実行・描画を行う場面の指定。Inspector の「スクリプトを表示する場面」または `update_script_component` で変更する
  - `play`: Play 中に実行する
  - `play-and-edit`: 編集画面でも名前付きエクスポートの `Render` を表示する。`start`・`update`・Graph からの通知は Play 中に実行するが、スクリプトのモジュールと `Render` 自体は編集時にも評価される。UIKit Panel テンプレートは `play-and-edit` で作成する

1 つのオブジェクトには複数のスクリプトコンポーネントを付けられる。実行順はオブジェクトの階層順で決まり、同一オブジェクト内ではコンポーネントの並び順に従う。

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

ライフサイクル名は設計書 4.6 の `RuntimePlugin` に揃える。

React Three Fiber で宣言的な見た目を追加する場合は、同じモジュールから `Render` をエクスポートする。`Render` はオブジェクトのグループの子としてマウントされ、`start` と併用できる。フレーム更新は `start` が返す `update(delta)` に記述する。React Three Fiber の `useFrame` コールバックは React の Error Boundary の外で動作するためスクリプト単位に隔離できず、Play と公開の両方でブロッキングエラーとする。

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

`Render` は `start(ctx)` の成功後にマウントし、同じ実行中の `ctx` を `{ ctx }` として受け取る。宣言固有のプロパティ型が必要な場合は `ScriptRenderProps<MyPropDeclaration>` を使う。

Inspector や MCP でプロパティを変更したときは、`Render` も新しい `ctx.props` で再描画する。TSX のソースファイルはスクリプトの `language: "tsx"` と `.tsx` パスを持つ。組み込みの `model-display` はこの仕組みを使い、宣言済み 3D モデルの URL を `useGLTF` / `Clone` へ渡す例である。モデルには依存ファイルを内包した GLB を推奨する。

### ScriptContext

| 名前 | 内容 |
| --- | --- |
| `entity` | `id`、`name`、`enabled` |
| `object3d` | このオブジェクトのグループ |
| `scene` / `camera` / `renderer` | 実行中の Three.js オブジェクト |
| `props` | 宣言したプロパティの値。Play 中の Inspector / MCP 変更は再起動せず次のフレームから反映される |
| `time` | `elapsed` と `delta`。`delta` は 0.1 秒を上限とする |
| `input` | 既存スクリプト互換用の低レベルキーボード状態。XRift 公式ショートカットと競合する恐れがあるため、組み込みテンプレートでは使わない |
| `lifecycle` | スクリプトインスタンスが所有する `AbortSignal`、タイマー、非同期タスク、クリーンアップ |
| `find(entityId)` | `entityReferences` に宣言した制作済みオブジェクトだけを取得する。プレイヤーやアバターは対象外 |
| `assets` | `assetReferences` に宣言した素材の URL 解決、基本テクスチャの読み込み、音声再生 |
| `audioSources` | このオブジェクトが所有する音源を Play 中だけ再生・調整する |
| `materials` | このオブジェクトが所有するメッシュのマテリアルを Play 中だけ変更する |
| `lights` | このオブジェクトが所有するライトの点灯・色・強度・距離を Play 中だけ変更する |
| `particles` | このオブジェクトが所有するパーティクルの放出を Play 中だけ再生・調整する |
| `viewer` | このスクリプトを実行しているビューアーの画面表示を Play 中だけ変更する。他のビューアーへは同期しない |
| `getAssetUrl(ref)` | `assets.url(ref)` の非推奨エイリアス |
| `on` / `emit` | スクリプト間のイベント送受信 |
| `log` | スクリプトコンソールへ出力する |

`object3d` と `find` の戻り値には Three.js の `Object3D` 型を使う。`add`、`traverse`、`worldToLocal` なども通常の Three.js と同じ型で呼び出せる。`scene`、`camera`、`renderer` も実行時に渡す Three.js の型を持つ。これらはいずれも型だけのインポートであり、別の Three.js 実体を読み込むことはない。`prop.asset({ kind: "font" })` なども指定した素材種別を型情報として維持する。

Play でのコンパイル成功は、公開プロジェクトでの TypeScript 型検査の成功を保証するものではない。Play は型を確かめずに変換だけを行い、公開用の `tsc` は `strict` で検証するため、宣言から推論できない補助関数の引数や空配列には `number` や `THREE.Mesh[]` などの型を明記する。たとえば `OffscreenCanvas` の `getContext("2d")` は `OffscreenCanvasRenderingContext2D` を返すので、`CanvasRenderingContext2D` として扱うには `as unknown as` を挟む。

公開前に、実際に変換したプロジェクトのビルドも確認する。公開ダイアログは型エラーをスクリプトの名前・ファイル・行・列で示して止まる。AI クライアントは `get_publish_readiness` に `verifyBuild: true` を渡すと、アップロードせずに公開と同じ変換・検査・ビルドを実行し、`buildCheck.scriptTypeErrors` で同じ位置を受け取れる。

### 非同期処理とクリーンアップ

ホットリロード、実行時エラー、Play の停止、アンマウントの後に古いコールバックがオブジェクトを変更しないよう、非同期処理は必ず `ctx.lifecycle` へ登録する。

| API | 契約 |
| --- | --- |
| `signal` | スクリプト終了時に中断される `AbortSignal` |
| `onDispose(callback)` | 終了時のクリーンアップ処理を登録し、登録解除用の関数を返す。コールバックは `Promise` を返せる |
| `timeout(callback, ms)` | ホスト管理下の単発タイマー。終了時に自動解除する。コールバックは `Promise` を返せる |
| `interval(callback, ms)` | ホスト管理下の繰り返しタイマー。終了時に自動解除する。コールバックは `Promise` を返せる |
| `task(run)` | `signal` を渡して `Promise` を実行し、終了後の結果を破棄する。未処理例外はそのスクリプトの `async` 失敗として記録する |

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

`task` は通信やデコーダー自体を強制終了しない。呼び出し先の処理が `signal` に対応している場合は必ず渡し、完了後にシーンを変更する前にも `signal.aborted` を確認する。

グローバルの `setTimeout` や追跡していない `Promise` を直接使った場合はホストの管理外となり、自動クリーンアップと例外の帰属先特定は保証されない。一方、`onDispose`、`timeout`、`interval` が返した `Promise` の拒否（rejection）は登録元のオブジェクトおよびスクリプトの `async` 失敗として扱い、スクリプトコンソールと MCP の実行環境レポートに記録する。

### テクスチャ / マテリアルの実行時操作

テクスチャはプロパティで明示的に参照してから読み込む。プロジェクト内の任意の素材を走査する API や、パスを直接組み立てる API はスクリプトに提供しない。

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

Inspector で `texture` を選択すると、その ID は `properties.texture` と `assetReferences` の両方に格納される。MCP から設定する場合も `update_script_component` へプロパティ値と完全な `assetReferences` を渡す。宣言していない ID に対する `assets.url` は `null` を返し、`assets.loadTexture` は `null` を返す `Promise` となるため、プロジェクト内の別素材には到達できない。

`assets` は次の API を提供する。

| API | 契約 |
| --- | --- |
| `url(assetId)` | 明示的に参照したプロジェクト素材の実行時 URL を返す。解決できない場合は `null` |
| `loadTexture(assetId, options?)` | PNG、JPEG、WebP などブラウザが通常の画像としてデコードできるテクスチャを読み込む |
| `loadAudio(assetId, options?)` | 明示的に参照した MP3 / WAV 用の、ライフサイクルに紐づく音声プレイヤーを返す |

`loadTexture` は参照先テクスチャの `importSettings` を実行時の既定値として扱う。オプションを省略した項目は素材側の設定を引き継ぎ、スクリプトで明示した項目だけをその読み込みに対して上書きする。

| オプション | 値 |
| --- | --- |
| `colorSpace` | `"auto"`、`"srgb"`、`"linear"` |
| `wrapS` / `wrapT` | `"repeat"`、`"clamp-to-edge"`、`"mirrored-repeat"` |
| `magFilter` | `"nearest"`、`"linear"` |
| `minFilter` | `"nearest"`、`"linear"`、4 種のミップマップフィルター |
| `flipY` / `generateMipmaps` | `boolean` |

`generateMipmaps: false` とミップマップを必要とする `minFilter` を組み合わせた場合は、実行時に `minFilter: "linear"` へ正規化する。同一スクリプトインスタンス内では素材 ID と解決後のオプションの組み合わせごとにキャッシュし、スクリプトの再起動または停止時に自動で破棄する。

返される `ScriptTexture` は Three.js のテクスチャと互換性のある変換フィールドを持つ。マテリアル上の UV 演出には `ctx.materials.setTextureTransform` を使う。この API はマテリアルスロットごとに専用の複製を作成するため、同じテクスチャを参照する別スロット・別オブジェクト・共有テクスチャには影響しない。

マテリアルおよびパーティクルのプレビューと `ctx.assets.loadTexture` は別の読み込み経路を使う。

- Studio のプレビューではプロジェクト内の元データを Tauri IPC 経由で読み込む。`importMetadata.sourceFormat` または拡張子が KTX2 の場合は、Studio に同梱した Basis JS / WASM で変換する。
- OpenBrush の `source.kind = "builtin"` テクスチャはプロジェクト内のパスがなくても同梱 URL から表示できる。いずれもプレビューのために CDN は必要ない。
- 生成物側でも KTX2 を使用する場合は、バージョン固定した Basis ファイルをワールドへ同梱し、生成 JavaScript と同じ公開バージョンのディレクトリから解決する。

デコーダーを必要とする形式は KTX2 に限らず、Draco 圧縮された 3D モデルでもデコーダーを同梱する。どの形式がどのファイルを必要とするかは `src/lib/visual-editor/vendor-assets.ts` の一覧で一元管理している。同梱の要否はステージングへコピーする素材の内容から判定し、生成コード内に特定のヘルパー名が現れるかどうかでは判定しない。出力モードごとに生成コードの形が異なるため、文字列一致による判定は片方の出力モードで外れる可能性がある。`classic-runtime` ではランタイムマニフェストの `decoders` が同じ場所を指し、ローダーはマニフェストからの相対パスで解決する。

### 公開物はワールド直下にしか置けない

公開したワールドが配信できるのはワールド直下のファイルに限られる。`public/` 配下のサブディレクトリは公開物に含まれず、配置しても 404 になる。素材のコピー先が `public/xrift-studio-<assetId>-<file>` のように平坦な構造になっているのはこのためである。デコーダー、フォント、ランタイムマニフェストも同様に直下へ配置する。

デコーダーのファイル名はローダー側で固定されている（`DRACOLoader` は `draco_wasm_wrapper.js`、`KTX2Loader` は `basis_transcoder.js` をデコーダーパスへ連結する）。そのため、デコーダーは元のファイル名のまま直下に置き、パスには生成 JavaScript と同じ公開ディレクトリを渡す。ファイル名が固定でない同梱物には、他のファイルと衝突しないよう接頭辞を付ける。

公開コードの `import.meta.url` からその公開バージョンのディレクトリを決定し、3D モデル、テクスチャ、音声、フォント、デコーダー、スクリプト、ランタイムマニフェストで共通して使用する。これにより、XRift 側の画面更新中に古いワールドが残っていても、新しい `baseUrl` と古いファイル名が組み合わさることはない。Vite のソースモジュールなど、HTTP で配信された JavaScript 以外の環境では従来どおり XRift の `baseUrl` を使う。

この仕組みはマテリアル・パーティクルのプレビューと生成物の描画経路に限られる。スクリプトの `ctx.assets.loadTexture` は引き続き Three.js 標準の `TextureLoader` を使用するため、KTX2 / HDR / EXR を型付きテクスチャとして返すことはできない。

### 音声の実行時操作

`loadAudio` は `prop.asset({ kind: "audio" })` と `assetReferences` に登録した音声だけを開く。オプションには `volume`（0..1）、`loop`、正の `playbackRate`、`preload: "none" | "metadata" | "auto"` を指定できる。返される `ScriptAudio` は `play()`、`pause()`、`stop()`、`seek()`、`setVolume()`、`setLoop()`、`setPlaybackRate()` の各メソッドと、読み取り専用の `playing`、`currentTime`、`duration` を持つ。

ブラウザの自動再生ポリシーにより、`play()` は失敗（reject）することがあるため、ユーザー入力後に呼び出す。必要に応じて `ctx.lifecycle.task` 内で `await` し、スクリプトコンソールへ理由を残す。スクリプトの再起動、実行時エラー、停止、アンマウント時にはホストがすべてのプレイヤーを停止し、リソースを解放する。Studio の Play と公開生成物は同じ実装を使用する。

`ctx.assets.loadAudio` はスクリプトが所有する独立した音声プレイヤーを新しく作るための入口である。オブジェクトに保存済みの音源コンポーネントを操作したい場合は、プレイヤーを二重に作らず `ctx.audioSources` を使う。`ctx.audioSources` が対象とするのは、スクリプトコンポーネントを付けたオブジェクト自身の音源だけであり、子オブジェクトは含まない。

| API | 操作 |
| --- | --- |
| `count()` | 対象音源の件数を返す |
| `list()` | `componentId`、`audioAssetId`、`spatial`、再生状態、現在位置、長さ、音量、`loop` を列挙する |
| `select({ componentId?, audioAssetId? })` | 指定した条件すべてに一致する音源だけを操作するハンドルを返す |
| `play()` | 対象を再生し、開始できた件数を `Promise` で返す |
| `pause()` / `stop()` | 一時停止、または停止して先頭へ戻し、対象件数を返す |
| `seek(seconds)` | 有限かつ 0 以上の秒数へ移動し、対象件数を返す |
| `setVolume(value)` / `setLoop(value)` | Play 中の音量とループ設定を上書きし、対象件数を返す |
| `reset()` | このスクリプト、または選択ハンドルが持つ実行時上書きを取り除く |

ハンドルは、同じオブジェクトで後から追加・更新された音源にも選択条件を適用する。同じオブジェクトに複数のスクリプトがある場合はコンポーネントの実行順で上書きを合成し、同じフィールドについては後のスクリプトの値を採用する。

`play()` は例外を外へ投げず、実際に再生を開始できた件数を必ず返す。ユーザー操作の制約で再生を拒否された音源は件数に含めない。拒否された状態は `list()` の `status: "autoplay-blocked"` で確認でき、画面操作後に再度 `play()` を呼び出せる。スクリプトの再起動、実行時エラー、停止時には、そのスクリプトが持つ再生要求・シーク・音量・ループの上書きを解除して音源コンポーネントの保存値へ戻す。音声素材とシーンドキュメント自体は変更しない。

### ライトと近接イベントの実行時操作

`ctx.lights` はスクリプトコンポーネントを付けたオブジェクト自身のライトだけを対象とし、子オブジェクトは含まない。無効化（disabled）されているライトにも Play 中のブリッジを残すため、スクリプトから一時的に点灯できる。

| API | 操作 |
| --- | --- |
| `count()` / `list()` | 対象ライトの件数と `componentId`、`lightType`、有効状態、色、強度、距離を返す |
| `select({ componentId?, lightType? })` | 指定した条件をすべて満たすライトのライブハンドルを返す |
| `setEnabled(value)` | Play 中の点灯状態を変更する |
| `setColor(value)` | Play 中の色を変更する |
| `setIntensity(value)` | 0 以上に正規化した強度を変更する |
| `setDistance(value)` | Point / Spot ライトの距離を変更し、対応した件数だけを返す |
| `reset()` | このスクリプト、または選択ハンドルの上書きを解除する |

同一スクリプト内では最後に変更したフィールドを優先し、複数スクリプトではコンポーネント実行順が後のスクリプトを優先する。スクリプトの再起動、実行時エラー、停止時にはそのスクリプトの上書きだけを解除し、Inspector や MCP で保存したライト設定へ戻す。

Studio の Play と `classic-jsx` は共通の `XriftScriptLight` とブリッジを使用する。Play 中にライトの `enabled`、`color`、`intensity`、`shadow`、距離、減衰、角度、半影、エリアサイズを保存しても再起動せず既存の実行環境へ反映される。`lightType` の変更やコンポーネントの追加・削除だけ、対象オブジェクトを再起動する。

`ctx.on` / `ctx.emit` は同じ `XriftScriptRoot` 内だけで動作する実行時イベントバスである。`KHR_interactivity` やシーンドキュメントとは接続せず、ペイロードの複製や永続化も行わない。

Graph と連携する場合は `ctx.graph.on(name, handler)` / `ctx.graph.emit(name)` を使う。

- Graph の `event/send` と同名の通知をスクリプトで受け取り、スクリプトから送った通知は Graph の `event/receive` で受け取る。Graph 側ではイベントの ID または名前を一致させる。
- 同じ Three.js シーン内だけで動作し、Studio の Play と公開ワールドは同じ実装を使う。
- 通知はペイロードを渡さず、保存・再送・他のビューアーへの同期も行わない。Graph への通知はフレームごとにまとめて処理し、処理中に発生した通知は次のフレームへ送る。
- スクリプトの停止・失敗・再起動で購読は自動解除される。戻り値の関数を呼んで手動で解除することもできる。
- 既存の `ctx.on` / `ctx.emit` は引き続きスクリプト間のペイロード付きイベントに使う。任意の TypeScript コードと Graph の自動変換は提供しない。

```ts
start(ctx) {
  ctx.graph.on("door.open", () => {
    ctx.audioSources.play();
    ctx.graph.emit("door.opened");
  });
}
```

組み込みの `proximity-event` は、スクリプトコンポーネントの `entityReferences` に明示した制作済みオブジェクトの位置を `getWorldPosition` で判定し、`xrift:proximity-state` へ `channel`、範囲内かどうかの状態、`kind` を送信する。`event-light` は同じイベントを受信し、実行中の `channel` プロパティが一致したときだけライトを切り替える。

各センサーは `sourceEntityId` ごとに個別に追跡するため、同じチャンネルの複数センサーのうち 1 つが範囲外に出ても、別のセンサーが範囲内であればライトの点灯を維持する。`kind: "enter" | "exit"` は境界をまたいだときだけ 1 回送信し、`kind: "sync"` は実行中のチャンネル変更や後から起動した受信側を同期するための状態通知として区別する。センサーの停止・削除時はその送信元の `exit` を送るため、滞在中にエッジイベントが繰り返されることはない。なお、`object3d.position` は親のローカル座標であるため近接判定には直接使わない。現時点で実行時のプレイヤーやアバターを `ctx.find` で取得する API はない。

`ctx.materials` はスクリプトコンポーネントを付けたオブジェクト自身が所有するメッシュだけを対象とし、子オブジェクトのメッシュは含まない。共有マテリアルを直接書き換えず、実行時用の複製へ次の実行時上書きを重ねる。

| API | 操作 |
| --- | --- |
| `count()` | 対象マテリアルの件数を返す |
| `list()` | `meshName`、メッシュの 0 始まり走査順インデックス、マテリアルスロット番号、`materialName` を列挙する |
| `select({ meshName?, meshIndex?, materialIndex? })` | 指定した条件すべてに一致するマテリアルだけを操作するハンドルを返す |
| `setColor(value)` | Base Color を変更する |
| `setOpacity(value)` | 不透明度を 0〜1 の範囲で変更する |
| `setEmissive(value, intensity?)` | Emissive Color と任意の強度を変更する |
| `setMetalness(value)` | 金属度（metalness）を 0〜1 の範囲で変更する |
| `setRoughness(value)` | 粗さ（roughness）を 0〜1 の範囲で変更する |
| `setTexture(slot, textureOrNull)` | `baseColor`、`normal`、`emissive`、`metallicRoughness`、`occlusion` の各スロットを変更する。`null` で外す |
| `setTextureTransform(slot, transform)` | スロットのテクスチャに対し、`offset`、`repeat`、`center`、ラジアン指定の `rotation` を部分上書きする |
| `resetTextureTransform(slot)` | 指定スロットにこのハンドルが付けたテクスチャ変換だけを取り除く |
| `setUniform(name, value)` | カスタムシェーダーの uniform を名前指定で変更し、該当 uniform を持つマテリアル数を返す |
| `resetUniform(name)` | 指定した uniform にこのハンドルが付けた上書きだけを取り除き、該当 uniform を持つマテリアル数を返す |
| `reset()` | `ctx.materials` ではこのスクリプト全体、選択ハンドルではそのハンドルのマテリアル上書きを取り除く |

各セッターの戻り値は、実際に変更が適用されたマテリアル数であり、未対応のマテリアルプロパティは無視する。`select` の名前条件は同名のメッシュすべてに一致し、インデックス条件は現在の所有メッシュの走査順を対象とする。ハンドルは非同期に追加されたメッシュにも自動で追従するため、3D モデルの読み込み完了を待って作り直す必要はない。

同じオブジェクトに複数スクリプトがある場合はコンポーネントの実行順で上書きを合成し、同じプロパティについては後のスクリプトの値を採用する。`setTextureTransform` はルート側の `ctx.materials` と `select(...)` が返すハンドルの両方で利用でき、省略したフィールドは現在のスロットの値をそのまま残す。ホストは対象マテリアルスロットごとにテクスチャの複製を所有するため、元のテクスチャや共有素材は直接変更されない。`resetTextureTransform(slot)` は指定スロットだけを元の変換へ戻す。スクリプトの再起動または停止時にはそのスクリプトの複製と上書きだけを解除し、最後のスクリプトが終了した時点で元のマテリアルへ戻す。

#### カスタムシェーダーの uniform

マテリアルに保存した uniform の値はワールドの動作中には変化しない。歩く人の位置に合わせて草を倒す、CPU で計算した座標を渡す、明かりを徐々に強めるといった動的な値は、スクリプトから `setUniform` で渡す。

```ts
import { defineScript, prop } from "xrift:script";
import { Vector3 } from "three";

export default defineScript({
  name: "GrassWalker",
  props: {
    walker: prop.entity({ label: "歩く人" }),
    tint: prop.color({ label: "色", default: "#7fbf5a" }),
  },
  start(ctx) {
    const position = new Vector3();
    return {
      update() {
        const walker = ctx.find(ctx.props.walker);
        if (!walker) return;
        walker.getWorldPosition(position);
        ctx.materials.setUniform("uWalker", position);
        ctx.materials.setUniform("uTint", ctx.props.tint);
      },
    };
  },
});
```

対象は、Three.js の `ShaderMaterial` または `RawShaderMaterial` そのもので描画するマテリアルである。GLSL を保存したカスタムシェーダーと Open Brush のプリセットが該当する。PBR と MToon のマテリアルは対象外であり、`setUniform` だけを呼んでも何も変更しない。戻り値は対象のうち指定名の uniform を持つマテリアル数であり、0 であれば描画は変わらない。uniform の名前と保存値は、マテリアルの Inspector にある「シェーダーの調整値」または MCP の `get_custom_shader` で確認できる。

渡す値は、マテリアル側が保持する uniform の型と一致する形式で指定する。

| マテリアルが持つ値 | 渡せる値 |
| --- | --- |
| 数値（GLSL の `float`、`int`、`bool`） | 有限の数値 1 個。`bool` には 0 か 1 を渡す |
| `Vector2` / `Vector3` / `Vector4` | 同じ個数の数値配列、または同じ次元のベクトル。`Vector3` には色文字列と `Color` も渡せる |
| `Color` | 色文字列（`"#ff6600"` など）、16 進数（`0xff6600`）、`Color`、数値 3 個の配列、または `Vector3` |
| `Matrix3` / `Matrix4` | 数値 9 個または 16 個の配列（列優先）、または同じ大きさの行列 |
| 数値の配列（GLSL の配列 uniform） | 同じ個数の数値配列または型付き配列。`vec3 points[4]` には数値 12 個を渡す |
| テクスチャ、または未設定の `null` | `ctx.assets.loadTexture` のテクスチャ、Three.js の `Texture`、`null` |

色文字列・16 進数・`Color` は、マテリアルの色 uniform と同じ変換でリニア RGB にして渡す。配列とベクトルには色空間変換を行わない。ホストは値を数値としてコピーして保持するため、呼び出し後に同じ配列や `Vector3` を書き換えても、次に `setUniform` を呼ぶまで描画は変わらない。`setUniform` は毎フレーム呼び出せるよう、2 回目以降は同じ保持領域へ書き込み、マテリアルの複製やシェーダープログラムの再生成は行わない。

型や形式の合わない値、真偽値、`NaN`、無限大、色として解釈できない文字列は `TypeError` となる。エラーメッセージには uniform 名、受け入れ可能な形式、渡された形式、対象の `meshIndex` と `materialIndex` を含める。番号は `ctx.materials.list()` と同じであり、`select` へそのまま渡せる。

拒否された呼び出しは何も変更せず、直前の上書きと描画中のマテリアルを維持する。捕捉しなかった例外は通常のスクリプトエラーとしてスクリプトコンソールに表示され、`update` 内で 5 回連続して発生するとスクリプトを停止する。不正な値を WebGL へ渡して毎フレーム描画エラーを出し続けることはない。後から読み込まれたメッシュの uniform と形式が合わない場合は、そのマテリアルにだけ上書きを適用しない。

上書きは uniform 名ごとに合成する。複数スクリプトではコンポーネント実行順が後のものを採用し、同一スクリプト内では `ctx.materials` と `select(...)` のハンドルのうち最後に書き込んだ値を採用する。`resetUniform(name)` はそのハンドルの上書きだけを取り除き、他に残っている上書きがあればその値へ、なければマテリアルの保存値へ戻す。`reset()`、スクリプトの再起動、実行時エラー、停止でも解除される。スクリプト側で独自に作成したテクスチャ（`DataTexture` など）は、`ctx.lifecycle.onDispose` でスクリプト自身が破棄する。

上書きしていない uniform は、スクリプトの複製マテリアルでも共有マテリアルの値をそのまま参照する。そのため、描画側がマテリアルへ毎フレーム書き込む経過時間は、スクリプトが他の uniform を上書きしているマテリアルでも進み続ける。対象となる時間 uniform は、マテリアルの「時間を受け取る変数名」（`animatedTimeUniform`）と `uTime` など名前から検出されたものである。同じ名前を `setUniform` で上書きしている間はスクリプト側の値で描画し、`resetUniform` で解除するとその時点の経過時間へ戻る（上書きしていた時刻から再開するわけではない）。

### パーティクルの実行時操作

`ctx.particles` は、スクリプトコンポーネントを付けたオブジェクト自身が所有するパーティクルの放出を対象とする。元のパーティクル素材の値は書き換えず、コンポーネント実行順で実行時上書きを重ねる。

| API | 操作 |
| --- | --- |
| `count()` | 対象パーティクルの放出数を返す |
| `play()` / `pause()` | 現在のシミュレーションを再生・一時停止する |
| `stop()` | シミュレーションを停止し、表示中の粒子を消去する |
| `restart()` | このスクリプトのリスタートコマンドを発行し、経過時間を 0 へ戻す |
| `setEmissionRate(value)` | 1 秒あたりの生成数を変更する |
| `setSpeedMultiplier(value)` | 初速の倍率を変更する |
| `setSizeMultiplier(value)` | 表示サイズの倍率を変更する |
| `setColor(value)` / `setOpacity(value)` | マテリアル側の色と不透明度を変更する |
| `reset()` | このスクリプトインスタンスのパーティクル上書きを取り除く |

Studio の Play と `classic-jsx` で生成したワールド・アイテムは、`packages/xrift-studio-runtime/src/script/particle.tsx` の共通実装を使用する。Runtime JSON を出力する `classic-runtime` モードではスクリプトとパーティクルを表現できないため、いずれもブロッキング診断とする。スクリプトごとの `restart()` カウンターは共有ブリッジがグローバルリビジョンへ変換するため、複数スクリプトが同じローカル番号を発行してもコマンドが相殺されない。スクリプトの再起動または停止時には、そのスクリプトの上書きだけを取り除く。

パーティクルの実行時仕様は次のとおりである。

- `maxParticles` は 1〜10,000、`duration` は 0.01〜600 秒の範囲に正規化する。プールは `maxParticles` を超えて確保しない。
- 連続放出は同じスロットを再利用する。`looping: false` では `duration` まで新しい粒子を生成し、その後はすでに生まれた粒子が `startLifetime` を終えるまで表示を続ける。
- `rateOverTime: 0` のバースト専用エミッターにも対応し、`time`、`count`、`cycles`、`interval` を `duration` 内で展開する。`looping: true` では同じバーストスケジュールを `duration` ごとに繰り返す。
- 連続放出スロットがプールを使い切った場合や、バーストの合計数が残り容量を超えた場合は、後ろのバーストから上限で切り捨てる。
- `ctx.particles.setEmissionRate` は設定済みの放出全体に対する実行時上書きである。上書きが有効な間は指定した連続放出レートが使われ、設定済みのバーストは発生しない。バーストへ戻すには `ctx.particles.reset()` を呼ぶか、スクリプトを再起動する。

### ビューアーごとの見え方

`ctx.viewer` は、シーン設定のうち「そのビューアーの画面表示」を実行時に上書きする。シーン設定自体は全ビューアー共通であるため、ポストエフェクトを有効にすると負荷の高い端末では閲覧側が自分で切れない。`ctx.viewer` の変更はそのスクリプトを実行しているクライアントの描画にだけ適用され、他のビューアーには同期されない。これにより、ワールド制作者は「画質を上げる」といった切り替えを用意し、選択を各利用者に委ねられる。

| API | 操作 |
| --- | --- |
| `setPostprocessing(enabled)` | ポストエフェクト全体を切り替える |
| `setBloom({ enabled?, strength?, radius?, threshold? })` | 発光（Bloom）を切り替え、強さ・広がり・しきい値を変更する |
| `setAmbientOcclusion(enabled)` | 接地部分の陰影（SSAO）を切り替える |
| `setColorGrading(enabled)` | 色味の調整（Color Grading）を切り替える |
| `setExposure(value)` | 露出を設定する（既定値は 1） |
| `setFog({ enabled?, color?, near?, far? })` | 距離フォグを切り替え、色と距離を変更する |
| `setAmbient({ enabled?, color?, intensity? })` | 環境光を切り替え、色と強さを変更する |
| `setSkybox({ enabled?, ibl?, exposure?, rotationDegrees? })` | 背景の表示、IBL、明るさ、水平回転を変更する |
| `setCameraFov(degrees)` | 視野角を度単位で設定する |
| `reset()` | このスクリプトのビューアー上書きを解除する |

スクリプトの再起動、実行時エラー、停止時にはそのスクリプトの上書きだけを取り除く。再入室したビューアーにはシーン設定の元の値が適用される。値の合成順は他のブリッジと同じくコンポーネント実行順であり、同じフィールドは後のスクリプトが上書きする。Node Graph の `xrift/setProperty` が書き込むシーンプロパティとも同じブリッジを共有しているため、スクリプトとグラフが競合せず合成される。

環境光がシーンに存在しない場合、`setAmbient` は実行環境が所有する `AmbientLight` を追加する。これにより、環境光を無効にしているシーンでも「明るくする」といった操作が機能する。空の背景画像自体の差し替えはスクリプト API にはなく、Node Graph の `skyboxImage` プロパティで行う。素材の解決先はサーフェス側が管理しており、スクリプトから任意の素材を空へ差し込む API は提供しない。

### 実行時変更と永続編集

| 変更経路 | 保存先 | Play 中の反映 | 停止 / 再起動時の扱い |
| --- | --- | --- | --- |
| `ctx.audioSources`、`ctx.lights`、`ctx.materials`、`ctx.particles`、`ctx.viewer`、`setTextureTransform`、`setUniform` | 実行時限定（ドキュメントのリビジョンは変わらない） | セッター呼び出し時点から対象オブジェクトの所有プレイヤー・ライト・複製マテリアルへ反映 | そのスクリプトの再生要求・複製・上書きを解除し、元のコンポーネントおよび素材の値へ戻る |
| スクリプトコンポーネントの宣言済みプロパティ | シーンドキュメント | 同じスクリプトインスタンスの `ctx.props` へ次のフレームから反映 | 保存値として残る |
| スクリプトのソースファイル、スクリプト・素材・オブジェクト参照、コンポーネント構成 | ソースファイル / シーンドキュメント | 保存済みソースをコンパイルし、成功後に影響するオブジェクトだけを再起動。失敗時は直前の正常なモジュールを継続 | 保存値として残る |
| 既存マテリアル / パーティクルのプロパティ | `AssetManifest` | Inspector または MCP から保存し、その素材を参照するオブジェクト・エミッターだけを再反映 | 保存値として残る |
| 既存テクスチャの読み込み設定（`importSettings`） | `AssetManifest` | MCP から保存し、直接参照またはマテリアル・パーティクル経由で参照するオブジェクトだけを再起動 | 保存値として残る |
| ライトコンポーネントのスカラー値プロパティ | シーンドキュメント | Inspector または MCP から保存し、既存のライト実行環境へ再起動なしで反映 | 保存値として残る |
| オブジェクト / コンポーネントの追加・削除、ライト種別、その他の構造変更 | シーンドキュメント | Inspector または MCP から保存し、影響するオブジェクトだけを再起動 | 保存値として残る |
| シーン設定 | シーンドキュメント | MCP の `update_scene_settings` から共有シーンへ即時反映 | 保存値として残る |

Play 中の編集可否と反映ルールは次のとおりである。

- Play 中に Inspector から永続編集できる素材プロパティは、現時点では既存のマテリアルとパーティクルに限られる。テクスチャの新規取り込みや Inspector からの読み込み設定変更は、編集画面（Edit）に戻って行う。
- MCP の `update_texture_asset` は Play セッション中でも永続化でき、そのテクスチャを直接参照するオブジェクトとマテリアル・パーティクル経由で参照するオブジェクトだけを再起動する。一方、`import_audio_asset` と `import_texture_asset` はアトミックな取り込みを伴うため編集時限定である。
- シーン設定の Inspector は Play 中は読み取り専用のままとなるが、MCP の `update_scene_settings` は Play セッション中でも永続化と即時反映に対応する。MCP では `set_material` や `create_document_asset` を含む他の対応済み書き込みツールも実行できる。
- 実行時の演出結果をそのまま保存データへ書き戻す仕組みはない。`ctx.*` の値を永続化したい場合は、Inspector または後述の永続化用 MCP ツールへ同じ値を明示的に指定する。

MCP クライアントは最初に `get_scripting_capabilities` を呼び出す。これにより、利用可能なスクリプト API、テクスチャスロット、参照制限、作成から Play までのツール呼び出し順序、Play 中に永続化できる操作を機械可読な形式で取得できる。

ライト・音声・テクスチャ・マテリアルの操作は、目的に応じて実行時 API と永続 MCP ツールを使い分ける。

| 目的 | スクリプト実行環境 | 永続 MCP オーサリング |
| --- | --- | --- |
| 独立した音声プレイヤーを Play 中だけ作成する | `ctx.assets.loadAudio` | 対象外 |
| 保存済み音源を Play 中だけ操作する | `ctx.audioSources`（同じオブジェクトのコンポーネントだけを所有者単位で上書き） | 対象外 |
| 音声素材を追加・確認する | 対象外 | 編集中の `import_audio_asset` / `get_audio_asset` |
| 音源オブジェクトを保存して配置する | 対象外 | `place_asset`。既存オブジェクトへは `add_component(definitionId: "core.audio-source")` 後に `update_component` |
| Play 中だけライトを点灯・点滅・調整する | `ctx.lights`（同じオブジェクトのライトだけを所有者単位で上書き） | 対象外 |
| ライトコンポーネントを追加・保存する | 対象外 | `add_component(definitionId: "core.light.*")` 後に `update_component` |
| テクスチャを一時的に読み込む | `ctx.assets.loadTexture`（素材の色空間、画像の繰り返しと補間、上下反転、Mipmap を既定値とする） | 対象外 |
| Play 中だけマテリアルの見た目や UV を変える | `ctx.materials.set*` / `setTextureTransform`（オブジェクト所有の複製だけを変更） | 対象外 |
| Play 中だけカスタムシェーダーの uniform を変える | `ctx.materials.setUniform`（オブジェクト所有の複製の uniform だけを変更） | 対象外 |
| テクスチャの読み込み・繰り返し・補間設定を保存する | 対象外 | `get_texture_asset` / `update_texture_asset`。新規画像は編集中の `import_texture_asset` |
| マテリアルの PBR 値やテクスチャ割り当てを保存する | 対象外 | `get_material_asset` / `update_material_asset` / `set_material_texture_transform` |
| カスタムシェーダーの GLSL と uniform の値を保存する | 対象外 | `get_custom_shader` / `update_custom_shader` |
| マテリアルをメッシュの割り当て枠へ保存して割り当てる | 対象外 | `set_material` |

スクリプト実行環境で行った再生要求・オプション変更・変換は停止時に消える。一方、MCP ツールによる編集はシーンドキュメントや `AssetManifest`、通常の操作履歴に残る。同じ見た目を双方へ暗黙に書き戻すことはせず、保存したい値は必ず永続化ツールへ明示する。

| 目的 | MCP ツール |
| --- | --- |
| 現在の ID、モード、リビジョン、スクリプト診断を取得する | `get_editor_context` |
| スクリプト API と信頼・永続化機能の対応状況を取得する | `get_scripting_capabilities` |
| スクリプトを作成・適用・更新する | `list_script_templates`、`create_script_asset`、`apply_script_template`、`get_script_asset`、`update_script_asset` |
| スクリプトのプロパティと明示参照を更新する | `update_script_component` |
| ローカルの MP3 / WAV を音声素材として追加する | `import_audio_asset` |
| 音声素材の管理下メタデータを取得する | `get_audio_asset` |
| 音源オブジェクトを配置する | `place_asset` へ音声素材 ID を渡す |
| 既存オブジェクトへ音源を追加・設定・削除する | `add_component(definitionId: "core.audio-source")`、`update_component`、`remove_component` |
| 既存オブジェクトへライトを追加・設定・削除する | `add_component(definitionId: "core.light.point")` など、`update_component`、`remove_component` |
| ローカル画像をテクスチャとして追加する | `import_texture_asset` |
| テクスチャの設定を取得・更新する | `get_texture_asset`、`update_texture_asset` |
| マテリアルをメッシュの割り当て枠へ割り当てる | `set_material` |
| マテリアルを作成する | `create_document_asset(kind: "material")` |
| マテリアルを読み込み、PBR 値やテクスチャ割り当てを保存する | `get_material_asset`、`update_material_asset` |
| マテリアルテクスチャの `offset` / `scale` / `rotation` / UV セットを保存する | `set_material_texture_transform` |
| メッシュ・葉素材の描画距離（奥クリップ）を保存・解除する | `update_component.patch.maxDistance`（有限値 `0.1..1,000,000`、`null` でシーンカメラの奥クリップへ戻す） |
| パーティクルを作成・取得・更新する | `create_document_asset(kind: "particle")`、`get_particle_asset`、`update_particle_asset` |
| シーン設定を取得・部分更新する | `get_editor_context.sceneSettings`、`update_scene_settings` |
| コンポーネント構成を取得・変更する | `list_component_definitions`、`get_entity_components`、`add_component`、`update_component`、`remove_component`、`set_entity_enabled` |

各 MCP ツールの入力仕様と制約は次のとおりである。

- **マテリアル更新**: `update_material_asset.patch` は `pbrMetallicRoughness`、normal / occlusion / emissive テクスチャ、`emissiveFactor`、alpha、両面描画（double-sided）、KHR マテリアル拡張、および移行用の `color` / `opacity` / `metalness` / `roughness` / 各 `*TextureId` を受け付ける。`set_material_texture_transform` のスロットは `baseColor`、`metallicRoughness`、`normal`、`occlusion`、`emissive` であり、変更値として `offset`、`scale`、`rotationDegrees`、`texCoord` または `reset` を指定する。
- **パーティクル更新**: `update_particle_asset.patch` は `maxParticles`、`duration`、`looping`、`prewarm`、`simulationSpace`、開始時の遅延・寿命・速度・サイズ・回転、重力、放出（emission）、形状、時間経過による色・サイズ・速度変化、レンダラーを受け付ける。レンダラーの `materialAssetId` と `textureAssetId` には、存在しかつ種別が一致する素材だけを受け入れる。
- **シーン設定更新**: `update_scene_settings` は `skybox`、`fog`、`ambient`、`camera`、`postprocessing`、`vegetation`、`physics`、`editor` を任意に組み合わせた空でないパッチを受け付ける。
  - 空の背景（`skybox`）では表示、IBL、投影方式、既存テクスチャ参照、グラデーション、回転、反転、露出、有限メッシュ変換を更新できる。`skybox.imageAssetId` には `AssetManifest` に存在しプロジェクト内の元データを持つテクスチャ（または移行前の空の背景）だけを受け入れ、`null` で参照と IBL を解除する。
  - `editor` セクションでは背景、グリッド、ギズモサイズ、スナップを更新できる。
  - `postprocessing` セクションでは合成全体の有効・無効、`ao` / `bloom` / `grading` 各レイヤーの有効・無効と値、HDR、露出、適用順（`order`）を更新できる。`order` には並べ替え可能なレイヤーを 1 つずつすべて含む完全な配列だけを受け付ける（一部だけを渡すと残り順序の推測が必要になり、制作者の意図と異なる見た目になる恐れがあるため）。なお、AO はシーンを再描画するパスで常に最初に適用されるため `order` には含めない。
  - 色、有限値、値の範囲、Fog と Camera の near-far 関係は確定前に検証する。
  - 同じシーン設定画面に表示される公開タイトル・説明はプロジェクトメタデータ、サムネイルはネイティブのバイナリファイルであり、いずれも `SceneDocument.settings` ではないためこのツールには含めない。また、Directional / Point / Spot ライトもオブジェクトのコンポーネント（`get_entity_components` / `update_component` の対象）であるため、シーン設定として暗黙に変更しない。
- **音声取り込み・取得**: `import_audio_asset` は信頼できる絶対パス `sourcePath` と現在のリビジョンを受け取り、MP3 または WAV だけを扱う。ネイティブ境界で絶対パス、通常ファイル、シンボリックリンク・リパースポイントでないこと、128 MB 上限、拡張子とファイルシグネチャの一致、読み込み前後のサイズ一致を検証したうえで、通常の取り込みと同じコンテンツハッシュに基づく配置先、アトミックコミット、操作履歴、自動保存を通す。MCP 応答には音声素材 ID、管理下のプロジェクト相対パス、フォーマット、MIME、バイト長だけを返し、外部パス・data URL・バイナリデータは返さない。同一ハッシュの元データが既にある場合は複製せず既存音声を返す。`get_audio_asset` も同じ管理下メタデータだけを返す。永続音源として配置するには `place_asset` で音声素材を配置するか `core.audio-source` を追加し、`update_component.patch` で `audioAssetId`、`volume`、`loop`、`autoplay`、`spatial`、`refDistance`、`rolloffFactor`、`maxDistance` を保存する。
- **テクスチャ取り込み・更新**: `import_texture_asset` は信頼できる絶対パス `sourcePath` と現在のリビジョンを受け取り、PNG、JPEG、WebP、AVIF、GIF、BMP、SVG、KTX2 の通常ファイルだけを 128 MB 上限で読み込む。最終パス要素のシンボリックリンク、相対パス、未対応拡張子は拒否する。通常の取り込みと同じシグネチャ検査・SVG 外部参照検査、コンテンツハッシュに基づく配置先、アトミックコミット、サムネイル生成を通す。MCP 応答には管理下のプロジェクト相対パスと素材 ID だけを返し、外部パスやファイル本体データは返さない。同一ハッシュが存在する場合は複製せず既存テクスチャを返す。`update_texture_asset.patch` は `colorSpace`、`generateMipmaps`、`flipY`、`resize`、`sampler.wrapS / wrapT / magFilter / minFilter`、`compression.format / quality` を受け付け、未知フィールド・列挙値外・非有限値・範囲外の最大サイズや品質はドキュメントを変更せず拒否する。Mipmap を無効にしたときのミップマップフィルターは既存モデルと同じく `linear` へ正規化する。保存した値は次回 `ctx.assets.loadTexture` が同じテクスチャを読むときの既定値となり、スクリプト側で明示したオプションだけがそのインスタンスの読み込みで優先される。

MCP からスクリプトを作成して Play する基本手順は、`get_editor_context` → `list_script_templates` → `create_script_asset` または `apply_script_template` → `add_component` → `update_script_component` → `set_play_mode` の順である。すべての書き込みツールには `projectId`、`sceneId`、`expectedRevision` を渡し、書き込み後は `get_editor_context` で最新リビジョンと `scriptRuntime` を取得し直す。

Play 中の対応済み書き込みは直ちに編集データへ保存され、変更内容に応じて次のように反映される。

- シーン設定は共有シーンへ即時反映する。
- コンポーネント・オブジェクトの構造変更はそのオブジェクトを再起動する。
- マテリアル・テクスチャ・パーティクルの変更は参照元のオブジェクトだけを再起動する。音源コンポーネントの変更もそのオブジェクトだけへ反映する。
- ライトのスカラー値変更は既存の実行環境へ即時反映し、ライト種別の変更だけ対象オブジェクトを再起動する。
- `ctx.audioSources` や `ctx.lights` の実行時限定の状態を `AssetManifest` や `SceneDocument` へ暗黙に書き戻すことはない。

MCP から生成・更新したスクリプトも、Play 時に保存済みのソースを変換してそのまま実行する。スクリプトごとの承認ダイアログは表示せず、`get_scripting_capabilities` は `sandboxed: false`、`trustGate: false` を返す。変換に失敗した場合は編集画面に留まり、Play 中の更新に失敗した場合は直前の正常なモジュールを維持する。`unapprovedPolicy` は旧クライアントとの互換性のために受け付けるが、実行可否には影響しない。`get_editor_context.scriptRuntime.trust` は `status: "not-required"` と実行中のソース情報を返す。

なお、Tauri MCP ブリッジは `pnpm tauri:dev` のデバッグビルドだけに登録する。WebView 上の JavaScript や Tauri コマンドを扱う開発用機能であるため、リリースビルドには搭載しない。

## 組み込みテンプレート

「素材の追加 > スクリプト」と MCP は共通のバージョン 6 カタログを使用する。作成画面ではソースコードのプレビューを確認できる。オブジェクトを選択している場合は、スクリプトの作成とスクリプトコンポーネントの追加を 1 回の操作履歴として実行できる。

XRift 公式ショートカットと競合するため、バージョン 5 で `keyboard-move` と `audio-hotkey` を組み込み一覧から外した。既存スクリプトのソースコードと低レベル `ctx.input` の互換性は維持するが、新しい標準例はイベントとプロパティで接続する構成を採る。

| ID | 用途 | 追加設定 |
| --- | --- | --- |
| `blank` | 最小ライフサイクル | なし |
| `vehicle` | 公式 `Vehicle` と運転席・同乗席（World 向け） | 速度・旋回速度 |
| `seat` | 公式 `Seat`（World 向け） | 座面の高さ |
| `rotate` | 軸と速度を Inspector からリアルタイムに変更 | なし |
| `float` | 上下移動 | なし |
| `follow-entity` | 明示参照したオブジェクトを追従 | オブジェクト参照 |
| `material-pulse` | 色・発光・粗さのアニメーション | メッシュの描画 |
| `light-flicker` | ライトの色・強度・点灯をリアルタイムに点滅 | ライト |
| `texture-scroll` | テクスチャ設定を引き継いだ読み込みと、所有複製上の UV スクロール | テクスチャとメッシュの描画 |
| `particle-control` | 再生・放出・速度・サイズ・色 | パーティクルの放出 |
| `model-display` | 宣言済み GLB を TSX の `Render` へ読み込み、速度をリアルタイムに変更 | 3D モデルの素材 |
| `audio-source-control` | 同じオブジェクトの音源の再生・音量・ループ・再生位置をリアルタイムに変更 | 音声素材と音源 |
| `proximity-event` | 明示参照オブジェクトがワールド座標の範囲へ入った／出た状態をチャンネルで送信 | オブジェクト参照 |
| `event-light` | 同じチャンネルの近接イベントでライトの色と強度をフェード | ライト |
| `event-visibility` | スクリプトイベントで表示を切り替え | なし |

`create_script_asset` は `templateId` または任意の `source` のどちらかを受け取る。テンプレートではカタログの `language` に従って `.ts` / `.tsx` を選び、任意の JSX ソースを指定する場合は `language: "tsx"` を明示する。`apply_script_template` はスクリプトの作成と指定オブジェクトへのコンポーネント追加を 1 リビジョンで実行する。未知のテンプレート ID、存在しないオブジェクトやフォルダー、古いリビジョンが指定された場合はドキュメントを変更しない。

## プロパティの種別

Inspector の入力フィールドはプロパティ宣言から自動生成する。種別は既存のコンポーネントフィールドの語彙に揃えている。

`string`、`number`、`boolean`、`enum`、`vec2`、`vec3`、`color`、`asset`、`entity`

`asset` と `entity` は既存コンポーネントにはない種別であり、スクリプト専用のピッカーを使用する。選択結果は `assetReferences` / `entityReferences` にも反映され、参照の検証や削除時の影響調査に利用する。

宣言を静的に読み取れないスクリプトでは値を推測せず、「propertyを読み取れません」と理由を表示し、コードは実行しない。

## モジュール解決

許可されたインポート指定子は、Studio がすでに読み込んでいる同一のモジュールインスタンスへ解決する。

`three`、`@react-three/fiber`、`@react-three/drei`、`@react-three/rapier`、`@xrift/world-components`、`react`、`xrift:script`

`three` を二重に読み込むと `instanceof` 判定や React Three Fiber の突き合わせが壊れ、同じシーンを共有できなくなる。この解決方式は公開先でも同様であり、公開ワールドは共有シングルトンを前提とする。

`https://` で始まるモジュールを解決する内部オプトイン機能は存在するが、現在のエディター UI および MCP からは有効化しない。通常の Play はオフラインで完結させ、リモートモジュールの読み込みはブロッキングエラーとする。公開時も常にブロッキング診断として対象スクリプトと理由を表示する。動的 `import(...)` と `useFrame` も Play と公開の両方でブロッキングエラーとする。

## 対応範囲

| 操作 | Studio Play | `classic-jsx` で生成したワールド / アイテム | 永続化 | 現在の入口 |
| --- | --- | --- | --- | --- |
| `number` / `color` / ベクトルなどのプロパティ変更 | 対応（次のフレームから同じインスタンスへ反映） | 対応（コンパイル時の値を初期値として使用） | シーンドキュメント | Inspector / MCP |
| 明示参照した素材の URL 解決 | 対応 | 対応 | なし | `ctx.assets.url` |
| PNG / JPEG / WebP など基本テクスチャの読み込み | 対応（素材の色空間・繰り返しと補間・上下反転・Mipmap を引き継ぎ、明示オプションを優先） | 対応 | なし | `ctx.assets.loadTexture` |
| MP3 / WAV 音声の再生・停止・シーク・音量・ループ・再生速度 | 対応 | 対応 | 実行時限定 | `ctx.assets.loadAudio` |
| オブジェクト自身の音源の再生・停止・シーク・音量・ループ | 対応（所有者単位の上書き） | 対応（同じ実行環境実装） | 実行時限定 | `ctx.audioSources` |
| オブジェクト自身のライトの点灯・色・強度・Point / Spot 距離 | 対応（所有者単位の上書き） | 対応（同じ実行環境実装） | 実行時限定 | `ctx.lights` |
| 明示参照オブジェクトのワールド座標近接とスクリプトイベント接続 | 対応 | 対応 | 実行時限定 | `ctx.find` + `getWorldPosition` + `on` / `emit` |
| 宣言済み GLB を TSX の `Render` で表示 | 対応 | 対応 | ソースファイル | `ctx.assets.url` + `useGLTF` / `Clone` |
| マテリアルテクスチャの `repeat` / `offset` / `center` / `rotation` | 対応（オブジェクト・マテリアルスロット所有の複製だけを変更） | 対応 | 実行時限定 | `ctx.materials.setTextureTransform` |
| オブジェクト自身のマテリアルの色・不透明度・発光・金属度・粗さ | 対応 | 対応 | 実行時限定 | `ctx.materials` |
| オブジェクト自身のマテリアルへのテクスチャ設定 | 対応 | 対応 | 実行時限定 | `ctx.materials.setTexture` |
| オブジェクト自身のカスタムシェーダーの uniform（数値 / ベクトル / 行列 / 配列 / 色 / テクスチャ） | 対応（オブジェクト所有の複製の uniform だけを変更） | 対応（同じ実行環境実装） | 実行時限定 | `ctx.materials.setUniform` |
| オブジェクト自身のパーティクルの再生・放出・速度・サイズ・色 | 対応 | 対応 | 実行時限定 | `ctx.particles` |
| パーティクルのバースト専用・ループ・非ループの再生時間（`duration`） | 対応（上限 10,000 粒子） | 対応（同じ実行環境実装） | `AssetManifest` | Inspector / `update_particle_asset` |
| プロジェクト内の KTX2 を使うマテリアル / パーティクルの描画 | 対応（ローカルの Basis トランスコーダー） | 対応（Basis ファイルを生成物へ同梱） | `AssetManifest` | 素材 / マテリアル / パーティクル設定 |
| マテリアル / パーティクルプロパティの Play 中の永続編集 | 対応（参照オブジェクトだけ再反映） | 次回の生成へ反映 | `AssetManifest` | Inspector / MCP |
| テクスチャ読み込み設定の Play 中の永続編集 | 対応（依存するオブジェクトだけ再起動） | 次回の生成へ反映 | `AssetManifest` | `update_texture_asset` |
| オブジェクト / コンポーネント構成の Play 中の永続編集 | 対応（影響オブジェクトだけ再起動） | 次回の生成へ反映 | シーンドキュメント | Inspector / MCP |
| 明示参照した別オブジェクトの取得 | 対応 | 対応 | なし | `ctx.find` |
| React Three Fiber の宣言的な描画追加 | 対応 | 対応 | ソースファイル | 名前付きエクスポート `Render`（`useFrame` は不可） |
| マテリアル自体の編集 | スクリプト API では未対応 | スクリプト API では未対応 | 対応 | Inspector / マテリアル MCP ツール |
| マテリアル ID をそのまま実行時マテリアルとして適用 | 未対応 | 未対応 | なし | 今後の型付きローダー / レシピ |
| KTX2・HDR・EXR のスクリプト専用読み込み | 未対応 | 未対応 | なし | 現在は素材・シーン設定のみ。専用ローダーは今後 |
| 3D モデルの命令的な型付きローダー | 未対応（TSX `Render` は対応） | 未対応（TSX `Render` は対応） | なし | 今後の素材種別別ファサード |

次の操作に対応する。

- Play でスクリプトを実行し、Play 中にソースを編集した場合は該当オブジェクトだけをホットリロードする。
- Stop 時には実行中の Blob モジュールとリソースを破棄し、同一ソースの TypeScript 変換結果だけを上限 128 件のキャッシュに残す。次回の Play ではトップレベルコードと `start` を必ず新しいモジュールとして実行し直す。
- Play 中のオブジェクト・コンポーネント構成およびマテリアル・テクスチャ・パーティクルのプロパティを永続変更し、参照元のオブジェクトだけへ差分反映する。
- 1 つのオブジェクトに複数スクリプトを付ける。
- 公開ワールドへ静的インポートとして出力する。
- ホストが管理する `start` / `update` / `ctx.on` と React の `Render` 描画エラーをスクリプト単位で隔離する。
- Inspector / MCP で変更した宣言済みプロパティをフレーム単位で反映する。
- 明示参照した基本テクスチャ・音声、TSX `Render` での 3D モデル表示、オブジェクト単位の実行時音源・ライト・マテリアル・パーティクルの上書きに対応する。
- ローカル素材および組み込みテクスチャのマテリアル・パーティクルプレビューと、ローカル Basis トランスコーダーを用いた KTX2 のプレビュー・公開描画に対応する。

次の操作は現在の対応範囲に含めない。

- 物理 API はワールドプロジェクトだけに提供する。アイテムプロジェクトは重力と `RigidBody` を持たないため未対応として機能制限する。
- 低レベル `ctx.input` は既存スクリプト互換用のキーボード状態だけを持つ。公式ショートカットとの競合を避けるため組み込みテンプレートでは使用せず、ポインターロック・マウス移動・ゲームパッドの配線も提供しない。
- `ctx.find` から実行時のプレイヤーやアバターを取得する API はない。近接テンプレートは明示参照した制作済みオブジェクト同士だけを扱う。
- ランタイム JSON 出力ではスクリプトを表現できないため、ブロッキング診断とする。
- 任意の npm パッケージのインポートには対応しない。ステージングへインストールできるパッケージは固定の許可リストに限る。
- スクリプトから公式 XRift コンポーネントを命令的に操作する API は初版では提供しない。
- スクリプトからマテリアルのレシピを永続変更すること、およびマテリアルを ID だけで一括適用することには対応しない。
- スクリプト API からの `KTX2Loader`、`HDRLoader`、`EXRLoader` のように、デコーダーやレンダラー設定を伴うテクスチャローダーには対応しない。
- 素材一覧の列挙、未宣言素材の読み込み、プロジェクト内パスの直接参照には対応しない。
- `Render` 内での `useFrame` には対応しない。フレーム処理はホストが隔離する `start().update(delta)` を使う。

## 実行環境の権限と限界

スクリプトは完全には隔離されていない。この節で説明する仕組みを「sandbox済み」（サンドボックス済み）と表示してはならない。

Play は `iframe` や Worker を挟まず、アプリ本体と同一の実行領域（realm）で動作する。`withGlobalTauri` により IPC ブリッジが `window` に露出しているため、スクリプトは原理的にアプリ本体と同じ権限を持ち、ファイルシステムやシェルへ到達できる。

モジュールスコープでは `window`、`globalThis`、`self`、`document`、`fetch`、`XMLHttpRequest`、`Function`、`importScripts`、`__TAURI__`、`__TAURI_INTERNALS__` を遮蔽している。ES モジュールの strict モードでは `eval` をレキシカルバインディングで遮蔽できない。これらの遮蔽は意図しないアクセスを減らすための緩和策であり、セキュリティ上の隔離境界にはならない。

2026-09-07 にスクリプトごとの内容ハッシュ承認を廃止した。UI と MCP の Play は同じ実行経路を使用する。ソースファイルは一度だけ読み込み、変換と評価に同じ内容を使う。ハッシュ・言語・契約バージョン・来歴は、実行中の版の特定とホットリロードのために保持しており、旧承認ストアへの照会・書き込みは行わない。プロジェクト切り替え時の破棄、固定のインポート許可リスト、ファイルパス検証、変換失敗時の開始防止は維持する。スクリプトは通常のローカルコードとして動作するため、無限ループや同一実行領域からの権限到達を隔離する保証はない。

## 既知の課題

- 完全な隔離には未対応である。実現するには実行領域（realm）を分ける必要があるが、Three.js インスタンスの共有と両立しない。
- Monaco と TypeScript サービスはローカル同梱済みでオフライン動作する。Play の変換には軽量な `transpileModule` を使い、エディターの補完と診断は言語サービスワーカーへ分離している。設計書 10 章が求める CSP は未適用であり、Play の Blob モジュールと共有モジュールブリッジを許可しつつ権限を狭める方針が課題として残っている。
- スクリプトの `ctx.assets.loadTexture` は Three.js 標準の `TextureLoader` を使う。マテリアル・パーティクルのプレビューと `classic-jsx` の KTX2 描画はローカルの Basis トランスコーダーに対応済みだが、KTX2・HDR・EXR・動画テクスチャ・キューブテクスチャ、レンダラー性能に応じたトランスコード、進捗・再試行を含むスクリプト向け型付きローダーは未対応である。
- `ctx.materials` はメッシュにすでに設定されたマテリアルの実行時複製を操作する。マテリアルのレシピ全体の差し替えや複数 UV セットの選択には未対応である。
- `ctx.materials.setUniform` の対象は Three.js の `ShaderMaterial` / `RawShaderMaterial` そのものに限られる。MToon のように独自プロパティを持つ派生マテリアルは対象外である。構造体の uniform、テクスチャの配列、`Matrix2` は扱えない。マテリアル側の値が `null` の uniform はテクスチャ用として扱う。uniform 名をスクリプトから列挙する API や、Node Graph から uniform を書き込むプロパティは未提供である。
- パーティクルは Studio と公開で共通実装となり、バーストの時刻・サイクル・間隔および非ループ時の再生時間に対応した。ただしワールド空間シミュレーション、粒子ごとのサイズ・回転、ストレッチビルボード、ソートモードは互換表示であり、完全なシミュレーションではない。プールの上限は 10,000 粒子で、容量を超えるバーストは切り捨てる。
- `ctx.particles.setEmissionRate` は設定済みバーストへ加算する API ではなく、バーストを抑止して連続放出レートを上書きする。バーストと連続放出レートを同時に動的編集する API は未対応である。
- テクスチャ読み込みの失敗は `null` で返す仕様となっており、素材名・フォーマット・デコードエラーをまとめたスクリプトコンソール診断と、プリロード・読み込み状態の標準化が今後の課題である。
- スクリプトコンソールはスクリプトエディター内でコンパイル・ライフサイクル・イベント・`Render` の失敗と `ctx.log` を表示し、MCP の `get_editor_context.scriptRuntime` からも JSON 互換の直近結果を取得できる。現時点ではソースマップによる行・列表示、同一例外の集約、個別スクリプトの再開操作には未対応である。
- ポインター・マウス・ゲームパッド入力および実行時のプレイヤー・アバター参照には未対応である。
- `ctx.lifecycle` を使わない `Promise.then`、グローバルタイマー、`Render` 内のポインター・物理コールバックなど、ホストの管理外で開始した非同期コールバックの例外帰属と自動停止には未対応である。
- 公開先プラットフォームがアップロードされたバンドルを審査またはサンドボックス化するかは未確認である。Studio のローカル Play は、公開実行環境での隔離や審査を代替しない。

## 公開

スクリプトのソースファイルとホストのアダプターをステージングのオーバーレイファイルとして出力し、生成した `src/World.tsx` または `src/Item.tsx` から静的インポートで参照する。

- `.ts` / `.js` は静的素材として許可されないため、必ずオーバーレイファイルとして出力する。
- 生成物には `eval`、`Function`、動的インポートを含めない。
- ホストのアダプターとオーサリング API は単一の実装を共通の基盤とし、エディターの Play と生成物で二重管理しない。
- 生成したワールド・アイテムのシーンサブツリーは Play と同じく `XriftScriptRoot` で包む。各コンポーネントは同じ `XriftScriptHost` へデフォルトエクスポートのスクリプト、任意の名前付き `Render`、プロパティ、実行順、明示参照を渡す。
- `assetReferences` のうちステージングへコピーした素材だけを決定的な URL マップに入れ、生成 JavaScript と同じ公開ディレクトリで解決してから、`ctx.assets.url` / `loadTexture` を Play と同じ参照ゲートに通す。
- KTX2 を参照するマテリアル・パーティクルがある場合は、バージョン固定の Basis JS / WASM をステージングの `public/` 直下へコピーし、`useKTX2` のトランスコーダーパスに生成 JavaScript と同じ公開ディレクトリを渡す。
- Draco 圧縮した 3D モデルがある場合は、バージョン固定の Draco デコーダーを同じく `public/` 直下へコピーし、`useGLTF` のデコーダーパスに生成 JavaScript と同じ公開ディレクトリを渡す。
- オブジェクトのグループへ安定 ID を付与し、`entityReferences` に宣言した ID だけを `ctx.find` で解決する。
- ワールド・アイテムのインスタンスごとのスコープマーカー内だけを探索するため、同じアイテムを複数配置しても別インスタンスのオブジェクトは返さない。
- テクスチャのキャッシュと破棄、音声の停止と解放、マテリアルの複製と復元、フレーム更新、イベントバスはホストのライフサイクルに属し、Play の停止と公開ワールドのアンマウントで同じクリーンアップを行う。
- 出力はステージングのビルドで型検査する。スクリプトの型エラーは公開を止めるため、アップロード前に Studio 側で提示する。ビルドはステージングの `src/scripts/<名前>.tsx` に対してエラーを報告するので、コンパイル結果の `scriptModules`（スクリプトの Asset ID と出力先のパス）で Asset へ戻し、Asset 名・プロジェクト内のパス・行・列で示す。出力時に書き換えるのは import の指定子だけなので、行番号は作者のソースと一致する。
- 同じ入力から同じ出力を得る決定性を維持する。識別子はハッシュ由来とし、挿入順や時刻に依存させない。
- プレハブインスタンスは合成 ID で事前展開し、スクリプトインスタンスの同一性は展開後のコンポーネント ID から導出する。

## 参照

- 例外範囲の定義: [ビジュアルエディター設計 4.8](./VISUAL_EDITOR_ARCHITECTURE.md#48-scripting-script-asset--script-component)
- 状態設計: [UX Interactions F-28](./UX_INTERACTIONS.md)

## Vehicle / Seat（world-components 0.53.0）

車は「アセットストア → ギミック → カスタム車」または「XRift公式コンポーネント → Vehicle」から、椅子単体は「アセットストア → XRift公式コンポーネント → Seat」から追加する。

- カスタム車を追加すると、親 Entity に操縦用スクリプトが付き、子 Entity として「車体」「運転席」「同乗席」、タイヤ 4 個、「排気煙」が作成される。
- 車体と座席は通常の Mesh Component で Model Asset を参照し、各座席に `Seat` 用スクリプトを付ける。Hierarchy でモデルを選び、Transform・Mesh・Material をそのまま編集できる。`Seat` 単体も同じ構成を使う。
- 車体とシートには Blender で作成した GLB を使用し、追加時に通常の Model Asset としてプロジェクトへ取り込む。同じモデルの再追加では既存の素材を再利用し、Prefab や公開用出力にも参照先の GLB を含める。スクリプトにはモデル本体・Base64 URL・見た目を生成するコードを含めない。
- モデルの再生成には `scripts/generate-world-asset-models.py` と `assets/world-models/parts.json` を使用する。

`Vehicle` / `Seat` のスクリプトは `renderMode: "wrap"` を宣言し、`Render({ ctx, children })` で Entity の Mesh と子 Entity を公式 Component の内側へ渡す。

- 編集画面（Edit）ではスクリプトを実行せず、通常の Hierarchy を表示する。Play と公開先では同じスクリプトホストで階層を包むため、車体の移動に子 Entity と着席位置が追従する。
- `Seat` と `Interactable` のスクリプトインポートは共通アダプターを通し、遅れて読み込まれたモデルも公式レイキャスターの対象へ追加する。公式の座席登録・占有・操縦入力の仕組みはそのまま維持する。
- 公開用アダプターでは `Vehicle` も公式パッケージから明示的にインポートしてエクスポートする。`export *` だけで転送すると Module Federation が `Vehicle` をワールド側へ取り込んでしまい、XRift 本体の `Seat` と内部 Context が分離する場合があるためである。両者を同じ共有パッケージから解決することで、運転席の登録を維持する。
- 同じ Entity に同じテンプレートを複数付ける場合は、「同じEntity内の識別子」をそれぞれ別にする。

新規 `Vehicle` の「地面に追従」は初期値がオンになっている。運転者の `onDrive` で 4 輪付近の固定 Collider を下向きに調べ、車体の高さと傾きを合わせる。「登れる坂の角度」は初期値 45 度であり、地面の欠損・急斜面・大きな段差では移動を止める。Sensor と動く Rigid Body は地面判定に使わない。地面には Collider が必要であり、壁への車体衝突・サスペンション・落下の物理演算は含まない。「地面に追従」をオフにすると、地面を判定せず直接移動する。

`Vehicle` は Hierarchy の車体・座席・タイヤ・排気煙を 1 つの公式 `Vehicle` で包み、`Seat driver` の入力を公式 `Vehicle onDrive` へ渡して移動・旋回を行う。

- 操作は W/S で前後、A/D で旋回、Studio の World Play では Space または E で降車する。`Seat` 単体も Space または E で立ち上がれる。Play の停止、座席の削除、テレポートでも着席を解除する。
- テンプレートは World 向けである。アイテムの Play にはプレイヤーが存在しないため、着席・操縦の確認は World Play で行う。Item に転用する場合は、同じ Item を複数配置しても ID が衝突しないよう、`useItem().id` を座席・車体 ID に含める。
- 砲台など、車体同期を使わない操作では引き続き `Seat onControlInput` を使用できる。

デスクトップ版の公開物でも同じ TSX と公式 Component を使用する。スクリプトを扱わないブラウザ版の Runtime JSON 公開は対象外である。車体の姿勢・同乗席・後から入室した人への状態共有は XRift プラットフォームの `SeatContext` に任せ、`useInstanceState` で重複同期しない。

World Play における着席位置・視点追従・操縦入力・降車は、0.53.0 の公式 `PhysicsPlayer` で処理する。Studio の着席 Provider は座席の登録と占有を同じプレイヤーへ渡し、Stop・座席削除・テレポートで解除する。フォーカスやポインターロックが外れたときは、押下中のキーを解除して操縦が継続しないようにする。なお、World Play は単一プレイヤーの確認用であり、オンライン同期やアバターの着席アニメーションは再現しない。複数人からの見え方や再入室後の停車位置は、XRift 上で別途確認する。

### 公式更新への追従

エディター、Classic 出力・公開ステージング、Runtime の開発依存、Web アップロードシェルはすべて同じバージョンに揃える。`node scripts/check-world-components-alignment.mjs` でバージョンと必要な公式エクスポートを検査する。依存パッケージの更新時は、生成 TSX の型検査と `e2e/vehicle-seat.spec.ts` で座席の登録・解除・運転を確認する。

`Vehicle` / `Seat` は、コールバックと React Context の親子関係を引き継げる TSX テンプレートとして提供する。Add Component の公式レジストリへ静的なラッパーとして登録すると、Runtime の Entity 別ポータル間で `Vehicle` の Context が引き継がれないため、現時点ではそこへ登録しない。速度・旋回速度・地面追従・最大傾斜角は親 Entity のスクリプトプロパティとして Inspector から編集し、座面の高さは座席 Entity の Transform で変更する。

参照: [公式Component](https://github.com/WebXR-JP/xrift-world-components)、[World template](https://github.com/WebXR-JP/xrift-world-template)、[Item template](https://github.com/WebXR-JP/xrift-item-template)。

### タイヤと煙の演出

モデルは通常の glTF PBR カラーを使用し、マテリアル数は車体が 3、Seat が 1、共通タイヤが 2 である。頂点カラーやスクリプト内の Base64 データは使わない。

タイヤと煙のスクリプトは、各参加者が受信した公式 `Vehicle` の位置変化から演出を更新する。走行中はタイヤを回転させて煙を放出し、停止中は止める。Graph の interact イベントは乗車継続や移動状態を表さないため、このギミックでは移動量を使用する。粒子の個別座標は同期せず、各端末で描画する。

MCP からの配置には `list_scene_recipes` → `apply_scene_recipe`（`recipeId: "scene-recipe.custom-vehicle"`）を使う。具体的な引数と確認手順は [MCP Editor Tools](./MCP_EDITOR_TOOLS.md) を参照する。
