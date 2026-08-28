# -*- coding: utf-8 -*-
"""
書き出し前チェック。execute_blender_code にそのまま貼るか exec する。

`issues` が空、または「意図的なピボット」だけになっていれば書き出してよい。
scale が 1 でないものが 1 つでもあれば止めて直すこと（法線と物理が壊れる）。

意図的にトランスフォームを残すオブジェクト名は KEEP_TRANSFORM に足す。
"""
import bpy
import math
from mathutils import Matrix

KEEP_TRANSFORM = {"Door_Panel", "Door_Handle"}   # ヒンジなど、原点に意味があるもの

issues, rows = [], []
for ob in sorted(bpy.data.objects, key=lambda o: o.name):
    if ob.type != "MESH":
        continue

    scale = [round(v, 6) for v in ob.scale]
    rot = [round(math.degrees(v), 3) for v in ob.rotation_euler]
    loc = [round(v, 4) for v in ob.location]
    identity = ob.matrix_basis == Matrix.Identity(4)
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    ngons = sum(1 for p in ob.data.polygons if len(p.vertices) > 4)

    rows.append({
        "name": ob.name,
        "coll": ob.users_collection[0].name if ob.users_collection else "!none",
        "tris": tris,
        "uv": bool(ob.data.uv_layers),
        "mats": [s.material.name if s.material else "!EMPTY" for s in ob.material_slots],
        "mods": [m.type for m in ob.modifiers],
    })

    # --- 止めるべきもの
    if scale != [1.0, 1.0, 1.0]:
        issues.append("BLOCK %s: scale %s (法線と物理が壊れる)" % (ob.name, scale))
    if not ob.data.uv_layers:
        issues.append("BLOCK %s: UV レイヤーが無い" % ob.name)
    if not ob.material_slots or any(s.material is None for s in ob.material_slots):
        issues.append("BLOCK %s: マテリアルスロットが空" % ob.name)
    if ob.modifiers:
        issues.append("BLOCK %s: モディファイアが残っている %s"
                      % (ob.name, [m.type for m in ob.modifiers]))
    if ob.name.startswith("_"):
        issues.append("BLOCK %s: ヘルパーオブジェクトが残っている" % ob.name)

    # --- 確認するもの（意図的なら OK）
    if not identity and ob.name not in KEEP_TRANSFORM:
        if any(abs(v) > 1e-4 for v in rot):
            issues.append("CHECK %s: 回転 %s が残っている（ピボット目的なら OK）"
                          % (ob.name, rot))
        elif any(abs(v) > 1e-6 for v in loc):
            issues.append("CHECK %s: 位置 %s が残っている（ピボット目的なら OK）"
                          % (ob.name, loc))

blocking = [i for i in issues if i.startswith("BLOCK")]
rows.sort(key=lambda r: -r["tris"])

result = {
    "ready_to_export": not blocking,
    "blocking": blocking,
    "checks": [i for i in issues if i.startswith("CHECK")],
    "mesh_objects": len(rows),
    "tris": sum(r["tris"] for r in rows),
    "materials": len(bpy.data.materials),
    "images": len(bpy.data.images),
    "unused_materials": [m.name for m in bpy.data.materials if m.users == 0],
    "heaviest": rows[:10],
}
