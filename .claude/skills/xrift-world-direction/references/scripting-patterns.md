# Script で作るもの

XRiftのScriptでは、動き、繰り返し配置、操作への反応をコードで作れます。たとえば100個のEntityを配置する処理を、1本のScriptと乱数のseedで記述できます。Playと公開先では同じコードが動きます。

Scriptの仕様は`docs/SCRIPTING.md`を読んでください。使えるAPIは`get_scripting_capabilities`、コードの雛形は`list_script_templates`で確認できます。仕様とテンプレートに合わせてコードを作成します。

## Entity で作るか Script で作るか

| 場面 | Entityで作る | Scriptで作る |
| --- | --- | --- |
| 同じものが数個だけ要る | Entity | |
| 同じものを規則やばらつきを持たせて多数置く | | `Render`で配列として描く。数が多い場合はinstancingを使う |
| 位置・回転・色が時間で変わる | | `start(ctx)`が返す`update(delta)`に書く |
| 押す・近づくで何かが起きる | Interactivity Graphのレシピを先に試す | Graphでは足りない場合にScriptを使う |
| 見る人ごとに画質や霧を変える | | `ctx.viewer`を使う |
| 外部のGLBを規則的に並べる | `place_asset` | `Render` + `useGLTF` / `Clone` |

## 契約の要点

- `Render`をnamed exportすると、Entityの子要素としてR3Fを宣言的に描ける。`start`との併用もできる。フレームごとの処理は、`start(ctx)`が返す`update(delta)`に書く。`useFrame`はPlayでも公開先でも使えない。
- `ctx.materials` / `ctx.lights` / `ctx.particles` / `ctx.audioSources`で変えられるのは、そのEntity自身のMaterial・Light・Particle・Audio Sourceだけで、変更はPlay中だけ有効だ。子Entityには届かない。
- `ctx.viewer`で変えられるのは、そのScriptを実行している人の画面だけの見え方（Bloom、霧、環境光、露出、視野角）だ。他の人には同期しない。
- Script同士のやり取りには`ctx.on` / `ctx.emit`でイベントを送受信する。`proximity-event`と`event-light` / `event-visibility`のテンプレートが原型になる。
- `ctx.time.elapsed`を使うと、時間に応じた変化（夕方から夜へ、潮の満ち引きなど）が作れる。空のTexture自体は差し替えられないので、明るさ・環境光・霧の色で時間を表す。
- 非同期処理は`ctx.lifecycle.task` / `timeout` / `interval`に登録する。グローバルの`setTimeout`は使わない。
- Assetを使うときは`prop.asset`で宣言し、`update_script_component`の`assetReferences`にも同じものを入れる。宣言していないAssetは`null`になる。
- 使えるimportは`three`、`@react-three/fiber`、`@react-three/drei`、`@react-three/rapier`、`@xrift/world-components`、`react`、`xrift:script`だけだ。
- Scriptはsandboxでは動かない。Playで保存済みソースを変換して実行する。Scriptごとの承認操作は不要。

## 手順

1. `get_editor_context` → `get_scripting_capabilities` → `list_script_templates`の順に読む。
2. `create_script_asset`で作る（`templateId`を指定するか、`language: "tsx"`と`source`を渡す）。
3. `add_component`で`scripting.script`をEntityに付け、`update_script_component`でpropertyと`assetReferences` / `entityReferences`を宣言する。
4. `set_play_mode { mode: "play" }`でPlayする。変換・実行エラーを確認する。
5. `get_editor_context`の`scriptRuntime`でcompile errorがないか確かめ、`capture_scene_view`で見た目を確かめる。

## よくある不具合と対処

| 症状 | 原因と対処 |
| --- | --- |
| Playしても何も出ない | `get_editor_context.scriptRuntime`の変換エラーと実行エラーを見る |
| `useFrame`でエラーになる | `start().update`の形に書き換える |
| Modelが出ない | `prop.asset`の宣言と`assetReferences`の両方が要る。片方だけでは動かない |
| 重い | 個別のmeshをinstancingに変える。`capture_scene_debug`でdraw callを見る |
| 停止したら見た目が元に戻った | runtimeのoverrideは保存されません。残したい値はComponent / Assetへ書き込んでください |
