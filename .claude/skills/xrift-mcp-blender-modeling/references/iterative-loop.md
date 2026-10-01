# 反復編集ループ（Blender × XRift Studio）

Blenderでの修正をStudioへ反映し、表示を確認する手順です。各工程で変更前後の値を記録してください。

## 基本フロー

```
1. Blender でメッシュ/モディファイアを編集（必要なら export）
2. Studio へ import_model_asset / reimport_model_asset
3. place_asset / update_transform / set_material で配置
4. set_play_mode で確認 → get_editor_context で診断
5. 問題があれば 1 に戻る（差分を明確に）
```

## 変更の追い方

- 毎回同じパスへGLBを書き出し、`reimport_model_asset`で反映する。
  この方法で`modelAssetId`と参照を維持でき、再配置が不要になります。
- 配置固有のマテリアル・transformはStudio、元モデルに共通する変更はBlenderで調整する。再取込で維持すべき設定を先に確認する。
- 変更前後で`get_model_asset`の`importSettings` / `materialSlots`を比較し、変更前後の違いを確認してください。

## Blender 側の編集のコツ

- 編集するオブジェクトを選択し、アクティブにしてから操作してください。`bpy.ops`の操作対象は選択状態に依存します。
- メッシュは`bmesh`で編集し、`bmesh.to_mesh()`で変更を反映してください。反映しないと編集結果が残りません。
- モディファイアは編集できる状態を保ち、書き出すときだけApplyしてください。
- 各工程の後に、オブジェクト名・頂点数・モディファイア一覧を含む要約を`result`へ
  JSON化できる形で返し、確認してください。

## Studio 側の反映ルール

- `reimport_model_asset`はEdit中だけ使えます。Play中は反映されません。
- Play中の構造ツールは即時同期するが、モデル再取込はEditに戻って行う。
- マテリアルスロットの数が変わったら、`get_model_asset`で再確認して`set_material`を再実行してください。

## 確認のショートカット

- 描画確認: `set_play_mode` + `get_editor_context`のscriptRuntime。
- 見た目確認: Studioの`capture_scene_view`。Blenderの画像は制作中の補助に使う。
- 差分検知: `get_model_asset`の返却値を直前の結果と比較する。

## 失敗パターン

| 症状 | 原因と対処 |
|---|---|
| 再取込でマテリアルが消える | `update_model_asset`の`materialSlotBindings`を再設定 |
| 再取込で位置がずれる | 元モデルと配置の変換を比較し、意図したピボット・座標を復元 |
| Playで反映されない | Editに戻って`reimport_model_asset`を実行 |
| スクリプトの参照が壊れる | `assetReferences` / `entityReferences`を`update_script_component`で再宣言 |
