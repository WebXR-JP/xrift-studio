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

この分離には実務上の理由がある。Play 中は AssetManifest が 1 byte でも変わると全 Entity の runtime 世代が上がる。
manifest の entry を本文編集に対して不変にしておくことで、Script の保存が Scene 全体の作り直しを起こさない。

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
export const Render = () => {
  return (
    <mesh position={[0, 1, 0]}>
      <sphereGeometry args={[0.15]} />
      <meshStandardMaterial color="#38bdf8" />
    </mesh>
  );
};
```

### ScriptContext

| 名前 | 内容 |
| --- | --- |
| `entity` | `id`、`name`、`enabled` |
| `object3d` | この Entity の group |
| `scene` / `camera` / `renderer` | 実行中の Three.js オブジェクト |
| `props` | 宣言した property の値。Play 中の Inspector / MCP 変更は再起動せず次の frame から反映される |
| `time` | `elapsed` と `delta`。`delta` は 0.1 秒で上限を切る |
| `input` | キーボードのみ |
| `find(entityId)` | `entityReferences` に宣言した Entity だけを引ける |
| `assets` | `assetReferences` に宣言した Asset の URL 解決と基本 Texture 読み込み |
| `materials` | この Entity が所有する Mesh の Material を Play 中だけ変更する |
| `getAssetUrl(ref)` | `assets.url(ref)` の非推奨 alias |
| `on` / `emit` | Script 間のイベント |
| `log` | Script Console へ出力する |

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
    let active = true;

    void ctx.assets
      .loadTexture(ctx.props.texture, {
        colorSpace: "srgb",
        wrapS: "repeat",
        wrapT: "repeat",
      })
      .then((texture) => {
        if (!active || !texture) return;
        texture.repeat.set(2, 2);
        ctx.materials.setTexture("baseColor", texture);
      })
      .catch((error) => {
        ctx.log("Texture error", error);
      });

    return {
      update(dt) {
        ctx.object3d.rotation.y += ctx.props.speed * dt;
        ctx.materials.setColor(ctx.props.tint);
      },
      dispose() {
        active = false;
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

`loadTexture` の options は `colorSpace: "auto" | "srgb" | "linear"`、
`wrapS` / `wrapT: "repeat" | "clamp-to-edge" | "mirrored-repeat"`、`flipY: boolean` である。
返した Texture は `offset`、`repeat`、`center`、`rotation` を Three.js と同じ形で調整できる。同一 Script instance 内では
Asset ID と options ごとに cache し、Script の再起動または Stop で自動的に dispose する。

`materials` は Script Component を付けた Entity 自身が所有する Mesh だけを対象にする。子 Entity の Mesh は含めない。
共有 Material Asset を直接変更せず runtime 用 clone へ次の override を重ねる。

| API | 操作 |
| --- | --- |
| `count()` | 対象 Material 数を返す |
| `setColor(value)` | base color を変更する |
| `setOpacity(value)` | opacity を 0 から 1 の範囲で変更する |
| `setEmissive(value, intensity?)` | emissive color と任意の強度を変更する |
| `setMetalness(value)` | metalness を 0 から 1 の範囲で変更する |
| `setRoughness(value)` | roughness を 0 から 1 の範囲で変更する |
| `setTexture(slot, texture)` | `baseColor`、`normal`、`emissive`、`metallicRoughness`、`occlusion` の slot を変更する |
| `reset()` | この Script instance の Material override を取り除く |

setter の返り値は対応して変更した Material 数である。未対応の Material property は無視する。
同じ Entity に複数 Script がある場合は Component の実行順で override を合成し、後の Script が同じ property を変更した値を採用する。
Script の再起動または Stop では、その Script の override だけを外し、最後の Script が終了した時点で元の Material へ戻す。

### 実行時変更と永続編集

`ctx.materials` と読み込んだ Texture の transform は runtime-only であり、Scene document や Material Asset を書き換えない。
Stop 後にも残す色、Texture binding、tiling、offset、rotation などは Inspector、または MCP の
`set_material`、`get_material_asset`、`update_material_asset`、`set_material_texture_transform` を使う。
これにより「Play の演出」と「保存する制作データ」を暗黙に混ぜない。

MCP client は最初に `get_scripting_capabilities` を呼ぶと、利用可能な Script API、Texture slot、参照制限、
作成から Play までの tool 順序を機械可読な形で取得できる。基本手順は
`get_editor_context`、`create_script_asset` または `update_script_asset`、
`add_component`、`update_script_component`、`set_play_mode` の順であり、各 write 後に最新 revision を再取得する。

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

| 操作 | Studio Play | 生成した World / Item | 永続化 | 現在の入口 |
| --- | --- | --- | --- | --- |
| number / color / vector などの property 変更 | 対応。次の frame から同じ instance へ反映 | 対応。compile 時の値を初期値として使用 | Scene document | Inspector / MCP |
| 明示参照した Asset の URL 解決 | 対応 | 対応 | なし | `ctx.assets.url` |
| PNG / JPEG / WebP など基本 Texture の読み込み | 対応 | 対応 | なし | `ctx.assets.loadTexture` |
| Texture の repeat / offset / rotation | 対応 | 対応 | runtime-only | 読み込んだ Texture |
| Entity 自身の Material の color / opacity / emissive / metalness / roughness | 対応 | 対応 | runtime-only | `ctx.materials` |
| Entity 自身の Material への Texture 設定 | 対応 | 対応 | runtime-only | `ctx.materials.setTexture` |
| 明示参照した別 Entity の取得 | 対応 | 対応 | なし | `ctx.find` |
| React Three Fiber の宣言的な描画追加 | 対応 | 対応 | source | named export `Render`。`useFrame` は不可 |
| Material Asset 自体の編集 | Script API では未対応 | Script API では未対応 | 対応 | Inspector / Material MCP tools |
| Material Asset ID をそのまま runtime Material として適用 | 未対応 | 未対応 | なし | 今後の typed loader / recipe |
| KTX2、HDR、EXR の Script 専用読み込み | 未対応 | 未対応 | なし | 現在は Asset / Scene Inspector。専用 loader は今後 |
| Model / Audio の typed load と再生 | URL 解決のみ | URL 解決のみ | なし | 今後の Asset 種別別 facade |

対応する。

- Play での実行と、Play 中の source 編集による該当 Entity だけのホットリロード
- 1 Entity へ複数 Script
- 公開ワールドへの静的 import としての出力
- host が管理する `start` / `update` / `ctx.on` と React の `Render` render error を Script 単位で隔離
- Inspector / MCP で変更した宣言済み property の frame 単位の反映
- 明示参照した基本 Texture と、Entity 単位の runtime Material override

対応しない。

- 物理 API は World project だけ。Item project は重力と RigidBody を持たないため未対応として degrade する
- 入力はキーボードのみ。pointer lock、マウス移動、gamepad の配線は存在しない
- runtime JSON 出力では Script を表現できないため blocking 診断とする
- 任意 npm package の import。staging へ install できる package は固定の許可リストに限る
- Script から公式 XRift Component を imperative に操作する API は初版では提供しない
- Script から Material Asset の recipe を永続変更することと、Material Asset を ID だけで一括適用すること
- `KTX2Loader`、`HDRLoader`、`EXRLoader` のように decoder や renderer 設定を伴う Texture loader
- Asset 一覧の列挙、未宣言 Asset の読み込み、project path の直接参照
- `Render` 内の `useFrame`。フレーム処理は host が隔離する `start().update(delta)` を使う

## 実行環境の権限と限界

**Script は完全に隔離されていない。** この節の内容を「sandbox 済み」と表示してはならない。

Play は iframe や Worker を挟まないアプリと同一 realm で動き、`withGlobalTauri` により IPC bridge が `window` に露出している。
したがって Script は原理的にアプリと同じ権限、すなわちファイルシステムとシェルへの到達手段を持ちうる。

緩和として二段構えを置く。

1. module scope で `window`、`globalThis`、`self`、`document`、`fetch`、`XMLHttpRequest`、`Function`、
   `importScripts`、`__TAURI__`、`__TAURI_INTERNALS__` を遮蔽する。ES module は strict mode のため
   `eval` を lexical binding として遮蔽できず、隔離境界にはならない。同一 realm である以上、ほかの遮蔽も回避可能であり、
   事故と素朴な悪用を止める緩和にすぎない。
2. 取り込み、Prefab、Starter、外部 Store 由来の Script は、初回 Play の前に対象 file を示して実行許可を求める。
   許可は project 単位で記録する。許可しなければ実行せずに Play へ入る。

自分で書いた Script を自分の環境で動かす限りは、これは通常のローカル開発と同じ危険度である。
危険なのは他人の project や Prefab を開いた場合であり、来歴ゲートはそこを守るために置く。

## 既知の課題

- 完全な隔離は未対応。実現するには realm を分ける必要があり、Three.js インスタンス共有と両立しない
- Monaco と TypeScript worker は local 同梱済みで offline でも動く。Architecture 10 章が求める CSP は未適用で、
  Play の blob module と共有 module bridge を許可しながら権限を狭める方針が残っている
- `loadTexture` は Three.js の標準 `TextureLoader` を使う。KTX2、HDR、EXR、動画 Texture、cube Texture、
  renderer capability に応じた transcoding、進捗と再試行を含む typed loader は未対応
- `ctx.materials` は Mesh に既に設定された Material の runtime clone を操作する。Material Asset の recipe 全体、
  shader 固有 uniform、Mesh 名や Material slot を指定した部分適用、複数 UV set の選択は未対応
- Texture 読み込み失敗は `null` で返る。Asset 名、format、decode error をまとめた Script Console 診断と
  preload / loading state の標準化が必要
- Script Console は Script Editor 内で compile / lifecycle / event / Render の失敗と `ctx.log` を表示し、
  MCP の `get_editor_context.scriptRuntime` からも JSON-safe な直近結果を取得できる。現時点ではsource mapによる行・列、
  同一例外の集約、個別Scriptの再開操作は未対応
- `play-and-edit`、pointer / mouse / gamepad、timer所有権の自動追跡は未対応
- `Promise.then`、`setTimeout`、Render の pointer / physics callback など、host の lifecycle 外でユーザーが開始した
  非同期 callback の例外帰属と自動停止は未対応。非同期処理は Script 内で `try/catch` し、`ctx.log` へ理由を残す必要がある
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
- Entity group へ安定 ID を付け、`entityReferences` に宣言した ID だけを `ctx.find` で解決する
- World / Item instance ごとの scope marker 内だけを探索し、同じ Item を複数配置しても別 instance の Entity を返さない
- Texture cache / dispose、Material clone / restore、frame 更新と event bus は host の lifecycle に属し、
  Play の Stop と公開 world の unmount で同じ cleanup を行う
- 出力は staging の build で型検査される。Script の型エラーは公開を止めるため、upload 前に Studio 側で提示する
- 同じ入力から同じ出力を得る決定性を維持する。識別子は hash 由来とし、挿入順や時刻に依存させない
- Prefab instance は合成 ID で事前展開されるため、Script instance の同一性は展開後の Component ID から導出する

## 参照

- 例外範囲の定義: [Visual Editor Architecture 4.8](./VISUAL_EDITOR_ARCHITECTURE.md#48-scripting-script-asset--script-component)
- 状態設計: [UX Interactions F-28](./UX_INTERACTIONS.md)
- 実行 lifecycle: Visual Editor Architecture 4.6 `RuntimePlugin`
