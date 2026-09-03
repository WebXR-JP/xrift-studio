# Script で作るもの

XRift の Script は「動くもの」「繰り返すもの」「反応するもの」を、Entity を並べるより速く軽く作る
道具である。Entity を 100 個置くところを Script 1 本と seed で済ませ、Play と公開先で同じコードが
動く。契約の全文は `docs/SCRIPTING.md`、API の一覧は `get_scripting_capabilities`、出発点は
`list_script_templates` のテンプレートにある。この文書はコードの雛形を持たない。書き方は契約と
テンプレートを読んで、その場で設計する。

## いつ Script を選ぶか

| 状況 | Entity で作る | Script で作る |
| --- | --- | --- |
| 同じ物が数個 | Entity | |
| 同じ物を規則やばらつきで多数置く | | `Render` で配列を描く。多数なら instancing |
| 位置・回転・色が時間で変わる | | `start(ctx)` が返す `update(delta)` |
| 押す・近づくで何かが起きる | Interactivity Graph のレシピが先 | Graph で足りないとき Script |
| 見る人ごとに画質や霧を変える | | `ctx.viewer` |
| 外部の GLB を規則的に並べる | `place_asset` | `Render` + `useGLTF` / `Clone` |

## できること (契約の要点)

- `Render` を named export すると、Entity の子として R3F を宣言的に描ける。`start` と併用できる。
- `start(ctx)` が返す `update(delta)` でフレーム処理をする。`useFrame` は Play でも公開でも使えない。
- `ctx.materials` / `ctx.lights` / `ctx.particles` / `ctx.audioSources` で、その Entity 自身の
  Material、Light、Particle、Audio Source を Play 中だけ変える。子 Entity には届かない。
- `ctx.viewer` で、その Script を実行している人の画面だけの見え方 (Bloom、霧、環境光、露出、
  視野角) を変える。他の人には同期しない。
- `ctx.on` / `ctx.emit` で Script 同士がイベントをやり取りする。`proximity-event` と
  `event-light` / `event-visibility` のテンプレートがその原型。
- `ctx.time.elapsed` で時間に応じた変化 (夕方から夜へ、潮の満ち引き) を作る。空の Texture 自体は
  差し替えられないので、明るさ、環境光、霧の色で時間を表す。
- 非同期処理は `ctx.lifecycle.task` / `timeout` / `interval` に登録する。global の `setTimeout` は
  使わない。
- Asset は `prop.asset` で宣言し、`update_script_component` の `assetReferences` にも入れる。
  宣言していない Asset は `null` になる。
- 使える import は `three`、`@react-three/fiber`、`@react-three/drei`、`@react-three/rapier`、
  `@xrift/world-components`、`react`、`xrift:script` だけ。
- Script は sandbox ではない。Play の前にユーザーが Studio で承認する。`set_play_mode` が
  `SCRIPT_APPROVAL_REQUIRED` を返したら、承認を依頼して待つ。

## 作る手順

1. `get_editor_context` → `get_scripting_capabilities` → `list_script_templates`。
2. `create_script_asset` (`templateId` か、`language: "tsx"` と `source`)。
3. `add_component` で `scripting.script` を Entity に付け、`update_script_component` で property と
   `assetReferences` / `entityReferences` を宣言する。
4. `set_play_mode { mode: "play" }`。承認待ちならユーザーへ。
5. `get_editor_context` の `scriptRuntime` で compile error を確認し、`capture_scene_view` で見た目を確認する。

## 失敗しやすいところ

| 症状 | 原因と対処 |
| --- | --- |
| Play で何も出ない | `set_play_mode` が承認待ち。`get_editor_context.scriptRuntime.trust` を見る |
| `useFrame` でエラー | `start().update` に移す |
| Model が出ない | `prop.asset` の宣言と `assetReferences` の両方が要る |
| 重い | 個別 mesh を instancing に。`capture_scene_debug` で draw call を見る |
| 停止したら見た目が戻った | runtime の override は保存されない。永続にしたい値は Component / Asset へ書く |
