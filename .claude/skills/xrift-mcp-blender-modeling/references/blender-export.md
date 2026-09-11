# Blender → GLB 書き出し手順（XRift Studio 向け）

XRift Studio は glTF/GLB を取り込む。**自己完結した GLB** を書き出すための確実な手順。

## 0. 前提チェック

- Blender MCP が接続済みか確認: `get_blendfile_summary_path_info`。
- 対象オブジェクトだけを選択しておく（`use_selection=True` のため）。
- 出力先の親ディレクトリが存在することを確認。

## 1. 書き出し前のクリーンアップ（必須）

順番を守る。これを怠ると Studio でスケールや原点がずれる。

```python
import bpy

# 対象を明示（例: 名前で指定）
targets = [obj for obj in bpy.data.objects if obj.name in {"Chair", "Table"}]
bpy.ops.object.select_all(action="DESELECT")
for obj in targets:
    obj.select_set(True)
bpy.context.view_layer.objects.active = targets[0]

# 1) 変換（特にスケール）を適用
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

# 2) 原点をジオメトリ中心へ（VR 配置で座標が狂うのを防ぐ）
bpy.ops.object.origin_set(type="ORIGIN_CENTER_OF_VOLUME", center="BOUNDS")

# 3) 非表示・モディファイアを確認
for obj in targets:
    for mod in obj.modifiers:
        print(obj.name, mod.type, "applied:", getattr(mod, "show_viewport", True))
```

モディファイアは Studio 側で評価できない場合がある。**デシメート・ベベル・サブサーフなどは
必要なら Apply しておく**（非破壊で残したい場合は `show_viewport` を確認し、書き出し前に反映）。

## 2. 単位とスケール

- Blender のシーン単位（`scene.unit_settings.scale_length`）を確認。Studio はメートル前提。
- `export_gltf` の `export_yup` は glTF の Y-up を維持（デフォルト有効）。
- 必要なら全体スケールを `bpy.ops.object.transform_apply(scale=True)` で 1 に。

## 3. マテリアルの簡素化

- Studio は PBR を想定。`Principled BSDF` 以外の複雑なノードは落とされる可能性が高い。
- 複数マテリアルはスロット単位で `set_material` できるので、名前を分かりやすく。
- テクスチャは GLB に内包（`export_materials="EXPORT"`）。

## 4. GLB 書き出し

```python
import bpy

# 選択オブジェクトだけを書き出す
bpy.ops.export_scene.gltf(
    filepath=r"C:\path\to\output.glb",
    export_format="GLB",
    use_selection=True,
    export_materials="EXPORT",
    export_apply=True,          # 変換を自動適用（事前に済ませていれば二重適用は起きない）
    export_yup=True,
)
```

> 注意: `export_apply=True` は書き出し時にモディファイアを適用する。事前に手動 Apply していれば
> 二重適用はしないが、確実を期すならどちらか一方にする（推奨: 手動 Apply のみ）。

## 5. 書き出し後チェック

- 出力ファイルが存在するか `Test-Path` で確認。
- `get_blendfile_summary_datablocks` で対象データブロックの状態を確認（任意）。
- Studio へは `import_model_asset` で取り込む。

## よくある失敗と対策

| 症状 | 対策 |
|---|---|
| 原点がずれて配置が浮く | `origin_set(type="ORIGIN_CENTER_OF_VOLUME")` |
| スケールがバラバラ | `transform_apply(scale=True)` |
| マテリアルが真っ白/黒 | `export_materials="EXPORT"` + Principled BSDF へ簡素化 |
| モディファイアが反映されない | Apply（`object.convert` or 書き出し時に適用） |
| 非表示オブジェクトが混入 | `use_selection=True` + 対象を明示選択 |
