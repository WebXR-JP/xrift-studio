# Script で作るもの

XRift の Script は、「動くもの」「繰り返し現れるもの」「反応するもの」を、Entity を並べるよりも少ない手数で軽く作るための道具だ。Entity を 100 個置く代わりに、Script 1 本と seed（乱数の種）で済ませられる。Play と公開先では同じコードが動く。

Script の契約の全文は `docs/SCRIPTING.md` にある。使える API の一覧は `get_scripting_capabilities`、書き始めの土台は `list_script_templates` のテンプレートから探す。この文書にコードの雛形は載せない。書き方は契約とテンプレートを読んで、その場で組み立てる。

## Entity で作るか Script で作るか

| 場面 | Entity で作る | Script で作る |
| --- | --- | --- |
| 同じものが数個だけ要る | Entity | |
| 同じものを規則やばらつきを持たせて多数置く | | `Render` で配列として描く。数が多い場合は instancing を使う |
| 位置・回転・色が時間で変わる | | `start(ctx)` が返す `update(delta)` に書く |
| 押す・近づくで何かが起きる | Interactivity Graph のレシピを先に試す | Graph では足りない場合に Script を使う |
| 見る人ごとに画質や霧を変える | | `ctx.viewer` を使う |
| 外部の GLB を規則的に並べる | `place_asset` | `Render` + `useGLTF` / `Clone` |

## 契約の要点

- `Render` を named export すると、Entity の子要素として R3F を宣言的に描ける。`start` との併用もできる。フレームごとの処理は、`start(ctx)` が返す `update(delta)` に書く。`useFrame` は Play でも公開先でも使えない。
- `ctx.materials` / `ctx.lights` / `ctx.particles` / `ctx.audioSources` で変えられるのは、その Entity 自身の Material・Light・Particle・Audio Source だけで、変更は Play 中だけ有効だ。子 Entity には届かない。
- `ctx.viewer` で変えられるのは、その Script を実行している人の画面だけの見え方（Bloom、霧、環境光、露出、視野角）だ。他の人には同期しない。
- Script 同士のやり取りには `ctx.on` / `ctx.emit` でイベントを送受信する。`proximity-event` と `event-light` / `event-visibility` のテンプレートが原型になる。
- `ctx.time.elapsed` を使うと、時間に応じた変化（夕方から夜へ、潮の満ち引きなど）が作れる。空の Texture 自体は差し替えられないので、明るさ・環境光・霧の色で時間を表す。
- 非同期処理は `ctx.lifecycle.task` / `timeout` / `interval` に登録する。グローバルの `setTimeout` は使わない。
- Asset を使うときは `prop.asset` で宣言し、`update_script_component` の `assetReferences` にも同じものを入れる。宣言していない Asset は `null` になる。
- 使える import は `three`、`@react-three/fiber`、`@react-three/drei`、`@react-three/rapier`、`@xrift/world-components`、`react`、`xrift:script` だけだ。
- Script は sandbox では動かない。Play する前にユーザーが Studio で承認する必要がある。`set_play_mode` が `SCRIPT_APPROVAL_REQUIRED` を返したら、承認をお願いして待つ。

## 手順

1. `get_editor_context` → `get_scripting_capabilities` → `list_script_templates` の順に読む。
2. `create_script_asset` で作る（`templateId` を指定するか、`language: "tsx"` と `source` を渡す）。
3. `add_component` で `scripting.script` を Entity に付け、`update_script_component` で property と `assetReferences` / `entityReferences` を宣言する。
4. `set_play_mode { mode: "play" }` で Play する。承認待ちになったらユーザーにお願いする。
5. `get_editor_context` の `scriptRuntime` で compile error がないか確かめ、`capture_scene_view` で見た目を確かめる。

## よくある不具合と対処

| 症状 | 原因と対処 |
| --- | --- |
| Play しても何も出ない | `set_play_mode` が承認待ちになっている。`get_editor_context.scriptRuntime.trust` を見る |
| `useFrame` でエラーになる | `start().update` の形に書き換える |
| Model が出ない | `prop.asset` の宣言と `assetReferences` の両方が要る。片方だけでは動かない |
| 重い | 個別の mesh を instancing に変える。`capture_scene_debug` で draw call を見る |
| 停止したら見た目が元に戻った | runtime の override は保存されない仕様だ。残したい値は Component / Asset に書き込む |
