# 反復編集ループ（Blender × XRift Studio）

「Blender で直す → Studio に反映 → 見て確認」を短い周期で回す手順。
コーディングエージェントとして確実に差分を追うためのルール。

## 基本フロー

```
1. Blender でメッシュ/モディファイアを編集（必要なら export）
2. Studio へ import_model_asset / reimport_model_asset
3. place_asset / update_transform / set_material で配置
4. set_play_mode で確認 → get_editor_context で診断
5. 問題があれば 1 に戻る（差分を明確に）
```

## 変更の追い方

- 毎回 **同じ GLB パスに上書き export** し、`reimport_model_asset` で反映する。
  これで `modelAssetId` と参照が維持され、再配置不要。
- ジオメトリ以外（マテリアル・transform）は Blender を経由せず **Studio 側の MCP ツール**で
  直接調整する。Blender は「形」だけに閉じる。
- 変更前後で `get_model_asset` の `importSettings` / `materialSlots` を比較し、ズレを検知。

## Blender 側の編集のコツ

- **選択を明示** してから編集。`bpy.ops` は選択・アクティブに依存する。
- メッシュ編集は **bmesh** を使い、`bmesh.to_mesh()` で flush。忘れると編集が消える。
- モディファイアは **非破壊のまま編集** → 書き出し時だけ Apply する流れが安全。
- 各ステップの後に `result` に JSON 化できる要約（オブジェクト名・頂点数・モディファイア一覧）を
  返し、確認する。

## Studio 側の反映ルール

- `reimport_model_asset` は Edit 中のみ。Play 中は反映されない。
- Play 中の構造ツールは即時同期するが、モデル再取込は Edit に戻って行う。
- マテリアルスロットの数が変わったら `get_model_asset` で再確認し、`set_material` を再実行。

## 確認のショートカット

- 描画確認: `set_play_mode` + `get_editor_context` の scriptRuntime。
- 見た目確認: Blender の `get_screenshot_of_window_as_image`。
- 差分検知: `get_model_asset` の返却値を直前と突き合わせる。

## 失敗パターン

| 症状 | 原因と対処 |
|---|---|
| 再取込でマテリアルが消える | `update_model_asset` の `materialSlotBindings` を再設定 |
| 再取込で位置がずれる | 原点が変動。`ORIGIN_CENTER_OF_VOLUME` + `transform_apply` を再実行 |
| Play で反映されない | Edit に戻って `reimport_model_asset` を実行 |
| スクリプトの参照が壊れる | `assetReferences` / `entityReferences` を `update_script_component` で再宣言 |
