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
- `runIn`: `play` または `play-and-edit`

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

React Three Fiber を使いたい場合は、同じ module から `Render` を export する。Entity の group の子として mount され、
hooks と公式 Component をそのまま使える。`start` と併用できる。

```tsx
export const Render = () => {
  useFrame((_, dt) => { /* ... */ });
  return <mesh />;
};
```

### ScriptContext

| 名前 | 内容 |
| --- | --- |
| `entity` | `id`、`name`、`enabled` |
| `object3d` | この Entity の group |
| `scene` / `camera` / `renderer` | 実行中の Three.js オブジェクト |
| `props` | 宣言した property の値。Inspector の変更が反映される |
| `time` | `elapsed` と `delta`。`delta` は 0.1 秒で上限を切る |
| `input` | キーボードのみ |
| `find(entityId)` | `entityReferences` に宣言した Entity だけを引ける |
| `getAssetUrl(ref)` | 実行時 URL を解決する |
| `on` / `emit` | Script 間のイベント |
| `log` | Script Console へ出力する |

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

`https://` から始まる module は Play でだけ opt-in で許す。**公開時は blocking 診断**とし、対象 Script と理由を示す。

## 対応範囲

対応する。

- Play での実行と、Play 中の source 編集による該当 Entity だけのホットリロード
- 1 Entity へ複数 Script
- 公開ワールドへの静的 import としての出力
- Script 単位のエラー隔離

対応しない。

- 物理 API は World project だけ。Item project は重力と RigidBody を持たないため未対応として degrade する
- 入力はキーボードのみ。pointer lock、マウス移動、gamepad の配線は存在しない
- runtime JSON 出力では Script を表現できないため blocking 診断とする
- 任意 npm package の import。staging へ install できる package は固定の許可リストに限る
- Script から公式 XRift Component を imperative に操作する API は初版では提供しない

## 実行環境の権限と限界

**Script は完全に隔離されていない。** この節の内容を「sandbox 済み」と表示してはならない。

Play は iframe や Worker を挟まないアプリと同一 realm で動き、`withGlobalTauri` により IPC bridge が `window` に露出している。
したがって Script は原理的にアプリと同じ権限、すなわちファイルシステムとシェルへの到達手段を持ちうる。

緩和として二段構えを置く。

1. module scope で `window`、`globalThis`、`__TAURI__`、`fetch`、`document`、`eval`、`Function` を遮蔽する。
   同一 realm である以上これは回避可能であり、事故と素朴な悪用を止める緩和にすぎない。
2. 取り込み、Prefab、Starter、外部 Store 由来の Script は、初回 Play の前に対象 file を示して実行許可を求める。
   許可は project 単位で記録する。許可しなければ実行せずに Play へ入る。

自分で書いた Script を自分の環境で動かす限りは、これは通常のローカル開発と同じ危険度である。
危険なのは他人の project や Prefab を開いた場合であり、来歴ゲートはそこを守るために置く。

## 既知の課題

- 完全な隔離は未対応。実現するには realm を分ける必要があり、Three.js インスタンス共有と両立しない
- Architecture 10 章が求める CSP は未適用。現状 CSP を導入するとコードエディターの CDN 読み込みが壊れるため、
  Monaco の local 同梱がその前提条件になる
- 公開先プラットフォームが upload された bundle を審査または sandbox するかは未確認。Studio 側の検査は存在しない

## 公開

Script source と host adapter を staging の overlay file として出力し、生成した `src/World.tsx` から静的 import で参照する。

- `.ts` / `.js` は静的 Asset として許可されないため、必ず overlay file として出す
- 生成物に `eval`、`Function`、動的 import を出さない
- host adapter と authoring API は単一の実装を正本とし、Editor と生成物で二重管理しない
- 出力は staging の build で型検査される。Script の型エラーは公開を止めるため、upload 前に Studio 側で提示する
- 同じ入力から同じ出力を得る決定性を維持する。識別子は hash 由来とし、挿入順や時刻に依存させない
- Prefab instance は合成 ID で事前展開されるため、Script instance の同一性は展開後の Component ID から導出する

## 参照

- 例外範囲の定義: [Visual Editor Architecture 4.8](./VISUAL_EDITOR_ARCHITECTURE.md#48-scripting-script-asset--script-component)
- 状態設計: [UX Interactions F-28](./UX_INTERACTIONS.md)
- 実行 lifecycle: Visual Editor Architecture 4.6 `RuntimePlugin`
