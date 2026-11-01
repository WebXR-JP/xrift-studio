# 既存GLBにBlenderの編集元を追加する

既存作品を移行する開発用ツールです。Studioの対象プロジェクトを閉じてから実行します。元GLB・Scene・Model ID・材質の割り当ては変更せず、検証済みの`.blend`と`blenderSource`だけを追加します。制作時のモディファイアや履歴の復元ではありません。

```powershell
& $blender --background --factory-startup --disable-autoexec --offline-mode --python-exit-code 1 --python scripts/prepare-existing-model-blends.py -- --project $project --output $prepared
& $blender --background --factory-startup --disable-autoexec --offline-mode --python-exit-code 1 --python scripts/verify-existing-model-blends.py -- $prepared
node scripts/commit-existing-model-blends.mjs $prepared
```

`$prepared`にはプロジェクト外の新しい作業用ディレクトリを指定します。`--model <Asset ID>`を繰り返すと対象を絞れます。既存の編集元は上書きしません。対応外の形式・拡張はreport.jsonに記録します。各ファイルを再度Blenderで開き、アプリと同じ書き出し処理でボーン名・MToon設定・ジオメトリの存在を検証してから移行できます。

移行前のassets.jsonを同じディレクトリの`assets.json.before-blender-*.bak`へ保存します。準備後に作品や元GLBが変わった場合は停止します。保存途中の失敗では元のmanifestを保持します。書き込み途中に残った未参照の.blendは作品へ反映されません。Studioを開いたままの並行編集には対応しません。

テクスチャ参照のないVRMC_materials_mtoonはBlenderのカスタムプロパティで保持します。MToonテクスチャや専用のインポーターが必要な拡張を推測で変換しません。Blenderの材質表示はMToon表示とは異なるため、最終描画はStudioで確認します。このMToon往復処理には本変更を含むStudioビルドが必要です。

BlenderのカスタムプロパティとglTF extrasの仕様: [Blender glTF importer/exporter](https://github.com/KhronosGroup/glTF-Blender-IO/blob/main/docs/blender_docs/scene_gltf2.rst)

検証:

```powershell
node --test scripts/commit-existing-model-blends.test.mjs
& $blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/blender-material-roundtrip.test.py
```
