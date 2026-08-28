# -*- coding: utf-8 -*-
"""
Z-fighting の候補（同一平面かつ重なっている面のペア）を探す。
execute_blender_code にそのまま貼るか exec する。

素朴に「平面座標が同じ面」を集めるだけだと、3m 離れた左右の壁のパネルどうしが
同じ y 座標を共有しているだけで引っかかる。ここでは平面に加えて
**残り 2 軸の矩形が実際に重なっているか**まで見るので、誤検知が出ない。

出力の見かた:
  suspects                   … 同じ向きの面が重なっている。カリングの有無に関わらず必ず競る。
                                attach_span / rest_on / hang_under で直す
  back_to_back_double_sided  … 背中合わせで、かつ両面描画のマテリアルが絡むもの。
                                use_backface_culling = True にすれば消える

同一オブジェクト内のペアも見る。join したオブジェクト（筒 + レンズなど）の内部でも
面は重なるので、ここを除外すると取りこぼす。突き合わせ（辺で接するだけ）は重なり面積が
ゼロなので MIN_OVERLAP で落ちる。

同じ向きでない（背中合わせの）面は、片面描画なら裏側がカリングされるので競らない。
Blender のマテリアルは既定で両面（glTF に doubleSided:true で出る）なので、
不透明マテリアルは use_backface_culling = True にしておくこと。
"""
import bpy
from collections import defaultdict

TOL = 1e-4          # 同一平面とみなす距離
MIN_OVERLAP = 1e-4  # 重なり面積の下限(m^2)。辺で接するだけのものを除く

# 「接していて当然」の組み合わせ。ここに入る名前どうしは structural 扱い
STRUCTURAL_HINTS = ("Room_Floor", "Room_Ceiling", "Room_Wall")


def _faces():
    """軸に垂直な面を (軸, 平面座標, 他2軸のbbox, オブジェクト名) で返す。"""
    out = []
    for ob in bpy.data.objects:
        if ob.type != "MESH" or not ob.visible_get():
            continue
        mw = ob.matrix_world
        rot = mw.to_3x3()
        me = ob.data
        for p in me.polygons:
            n = (rot @ p.normal).normalized()
            for axis in range(3):
                if abs(abs(n[axis]) - 1.0) > 1e-3:
                    continue
                others = [i for i in range(3) if i != axis]
                pts = [mw @ me.vertices[v].co for v in p.vertices]
                bb = []
                for o in others:
                    vals = [pt[o] for pt in pts]
                    bb.append((min(vals), max(vals)))
                out.append((axis, round((mw @ p.center)[axis] / TOL) * TOL,
                            tuple(bb), ob.name, 1 if n[axis] > 0 else -1,
                            ob.material_slots[p.material_index].material
                            if p.material_index < len(ob.material_slots) else None))
                break
    return out


def _overlap(a, b):
    """2 つの矩形の重なり面積。"""
    area = 1.0
    for (a0, a1), (b0, b1) in zip(a, b):
        lo, hi = max(a0, b0), min(a1, b1)
        if hi - lo <= 0:
            return 0.0
        area *= (hi - lo)
    return area


def scan():
    groups = defaultdict(list)
    for axis, plane, bb, name, sign, mat in _faces():
        groups[(axis, plane)].append((bb, name, sign, mat))

    critical, back_to_back = defaultdict(set), defaultdict(set)
    for (axis, plane), items in groups.items():
        for i in range(len(items)):
            bb_i, n_i, s_i, m_i = items[i]
            for j in range(i + 1, len(items)):
                bb_j, n_j, s_j, m_j = items[j]
                if _overlap(bb_i, bb_j) < MIN_OVERLAP:
                    continue                       # 平面は同じだが位置が離れている
                key = "%s=%.4f" % ("xyz"[axis], plane)
                pair = tuple(sorted((n_i, n_j)))
                if s_i == s_j:
                    # 同じ向きの面が重なっている。カリングの有無に関わらず必ず競る。
                    # join 済みオブジェクトの内部でも起きるので同一名ペアも残す。
                    critical[key].add(pair)
                elif any(m is not None and not m.use_backface_culling
                         for m in (m_i, m_j)):
                    # 背中合わせ。両面描画のときだけ競るので、片面にすれば消える
                    back_to_back[key].add(pair)

    fmt = lambda d: {k: sorted("%s | %s" % p for p in v) for k, v in sorted(d.items())}
    return {
        "suspect_count": sum(len(v) for v in critical.values()),
        "suspects": fmt(critical),
        "back_to_back_double_sided_count": sum(len(v) for v in back_to_back.values()),
        "back_to_back_double_sided": fmt(back_to_back),
    }


result = scan()
