# Blender → GLB 書き出し

## 対象と前提

Blender MCP の接続と出力先を確認し、対象オブジェクト・親子関係・実寸を調べる。
Studio はメートル、glTF は Y-up を前提に確認する。自己完結した GLB を使う。

- ドアのヒンジや設置面など、意図したピボットを保持する。原点を一律に中心へ移さない。
- 位置・回転・スケールの適用は必要な対象だけに行う。リグ・アニメーション・親子変換への影響を確認する。
- PBR マテリアルとテクスチャが書き出されるか確認する。複雑なノードは GLB と Studio の表示で検証する。
- モディファイアの適用が必要なら保存済みの元データを残す。`export_apply` はモディファイアの評価用で、原点やオブジェクト変換の自動修正ではない。

## 選択書き出しの例

オブジェクト名とパスは実在する対象に置き換える。階層・アニメーションを含む場合は必要な親・リグも対象に含める。

```python
import bpy
from pathlib import Path

names = {"Chair", "Table"}
targets = [obj for obj in bpy.context.scene.objects if obj.name in names]
assert {obj.name for obj in targets} == names, "書き出し対象を確認してください"
output = Path("/absolute/path/output.glb")
assert output.is_absolute() and output.parent.is_dir()

bpy.ops.object.select_all(action="DESELECT")
for obj in targets:
    obj.select_set(True)
bpy.context.view_layer.objects.active = targets[0]
bpy.ops.export_scene.gltf(
    filepath=str(output),
    export_format="GLB",
    use_selection=True,
    export_materials="EXPORT",
    export_yup=True,
)
assert output.is_file()
```

## Studio で確認

`import_model_asset` または既存 assetId への `reimport_model_asset` 後に、寸法・ピボット・階層・マテリアルを比較する。
ずれた場合は書き出し前後の変換を調べ、意図した座標を復元する。原点の再計算を応急処置にしない。
