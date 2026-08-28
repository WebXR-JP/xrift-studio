# -*- coding: utf-8 -*-
"""
room_lib - XRIFT 向け室内ワールドを Blender で組むためのヘルパー。

作業フォルダにコピーして `from room_lib import *` で使う。
すべてワールド座標の min/max で書けるようにしてあるので、寸法定数から素直に組める。

Z-fighting 対策が組み込まれている点が肝:
  - attach_span() / rest_on() が取り付け物をホスト面へ自動で食い込ませる
  - 手で座標を書くと必ず面一にしてしまうので、この 2 つを必ず経由すること
  詳細は references/zfighting.md
"""
import bpy
import bmesh
import math
import os
from mathutils import Vector, Matrix

# ---------------------------------------------------------------- Z-fighting
EMBED = 0.004   # 取り付け物をホスト面へ沈める量(m)。1mm 未満は精度不足、10mm 超は見た目に響く


def attach_span(surface, inward, thickness, embed=EMBED):
    """ある面に貼り付く部材の (lo, hi) を返す。裏面は必ず `embed` だけホストへ沈む。

    surface   : ホスト面の座標値 (例: 左壁の内面 X0)
    inward    : 部屋がある向き。surface より座標が大きい側が部屋なら +1、小さい側なら -1
    thickness : 部屋側へ出っ張る厚み

    例) 左壁 x=X0 に厚み 35mm のパネル -> attach_span(X0, +1, 0.035)
        右壁 x=X1 に同じもの          -> attach_span(X1, -1, 0.035)
    """
    a = surface - inward * embed
    b = surface + inward * thickness
    return (min(a, b), max(a, b))


def rest_on(surface_z, height, embed=EMBED * 0.5):
    """床や天板の上に置く物の (lo, hi)。底面を少しだけ沈めて面一を避ける。"""
    return (surface_z - embed, surface_z + height)


def hang_under(surface_z, depth, embed=EMBED):
    """天井など上面から吊る/埋める物の (lo, hi)。上端をホストへ突き抜けさせる。"""
    return (surface_z - depth, surface_z + embed)


# ------------------------------------------------------------ scene scaffold
COLLS = {}


def wipe():
    """全オブジェクトと孤立データを消す。main() の先頭で呼び、ビルドを冪等にする。"""
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images,
                 bpy.data.cameras, bpy.data.lights, bpy.data.curves):
        for d in list(coll):
            coll.remove(d)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)


def make_collections(root="World", subs=("Room", "Furniture", "Fixtures",
                                         "Equipment", "Lighting", "_Preview")):
    """機能別コレクションを作る。_Preview は書き出し時に除外する用。"""
    global COLLS
    r = bpy.data.collections.new(root)
    bpy.context.scene.collection.children.link(r)
    COLLS = {root: r}
    for n in subs:
        c = bpy.data.collections.new(n)
        r.children.link(c)
        COLLS[n] = c
    return COLLS


def link(obj, coll_name):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    COLLS[coll_name].objects.link(obj)
    return obj


# ----------------------------------------------------------------- transform
def apply_transform(objs):
    """loc/rot/scale をメッシュへ焼く。scale を 1 に保つのが目的。"""
    if not isinstance(objs, (list, tuple)):
        objs = [objs]
    objs = [o for o in objs if o]
    if not objs:
        return
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.select_all(action="DESELECT")


def join(objs, name, coll):
    """複数パーツを 1 オブジェクトに統合。ワールド座標を保つ。"""
    objs = [o for o in objs if o is not None]
    apply_transform(objs)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    res = bpy.context.view_layer.objects.active
    res.name = name
    res.data.name = name
    link(res, coll)
    bpy.ops.object.select_all(action="DESELECT")
    return res


def set_origin(ob, point):
    """ジオメトリを動かさずに原点だけワールド座標 point へ移す。
    ドアのヒンジ・椅子の接地点など、XRIFT で意味を持つピボットを作るのに使う。"""
    apply_transform(ob)
    d = Vector(point)
    ob.data.transform(Matrix.Translation(-d))
    ob.location = d


# ------------------------------------------------------------------ geometry
def box(name, x0, x1, y0, y1, z0, z1, coll="Room", mat=None):
    """min/max 指定の直方体。原点は自身の中心。"""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.location = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    ob.scale = (max(x1 - x0, 1e-5), max(y1 - y0, 1e-5), max(z1 - z0, 1e-5))
    link(ob, coll)
    if mat:
        ob.data.materials.append(mat)
    apply_transform(ob)          # scale を残すと glTF で法線と物理が壊れる
    return ob


def cyl(name, r, h, loc, coll="Room", mat=None, verts=12, rot=(0, 0, 0)):
    """軸は +Z。任意方向へ向けるときは rot に dir.to_track_quat('Z','Y').to_euler() を渡す。"""
    return _cone_like(name, r, r, h, loc, coll, mat, verts, rot)


def cone(name, r_bottom, r_top, h, loc, coll="Room", mat=None, verts=12, rot=(0, 0, 0)):
    """r_bottom が -Z 側、r_top が +Z 側。下widerなシェードは r_bottom > r_top。"""
    return _cone_like(name, r_bottom, r_top, h, loc, coll, mat, verts, rot)


def _cone_like(name, r1, r2, h, loc, coll, mat, verts, rot):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts,
                          radius1=r1, radius2=r2, depth=h)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    ob.rotation_euler = rot
    link(ob, coll)
    if mat:
        ob.data.materials.append(mat)
    apply_transform(ob)
    return ob


def uvsphere(name, r, loc, coll="Room", mat=None, seg=12, rings=6):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    link(ob, coll)
    if mat:
        ob.data.materials.append(mat)
    apply_transform(ob)
    return ob


def aim(direction):
    """+Z 軸の円柱/円錐を direction 方向へ向けるオイラー角。手でオイラーを組まないこと。"""
    return Vector(direction).normalized().to_track_quat("Z", "Y").to_euler()


# ------------------------------------------------------------------- uv / mat
def box_uv(ob, tile=1.0):
    """ワールド座標のボックス投影を UV に焼き込む。

    Mapping ノードを使わないので glTF が KHR_texture_transform 無しで素直に出る。
    tile は「テクスチャ 1 周期が実寸で何 m か」。木部 1.2 / 壁 2.0 / 床 1.5 が目安。
    """
    me = ob.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uvl = me.uv_layers.active.data
    mw = ob.matrix_world
    rot = mw.to_3x3()
    inv = 1.0 / tile
    for poly in me.polygons:
        n = (rot @ poly.normal).normalized()
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for li in poly.loop_indices:
            co = mw @ me.vertices[me.loops[li].vertex_index].co
            if az >= ax and az >= ay:
                u, v = co.x, co.y
            elif ax >= ay:
                u, v = co.y, co.z
            else:
                u, v = co.x, co.z
            uvl[li].uv = (u * inv, v * inv)


def _img(tex_dir, fname, non_color=False):
    im = bpy.data.images.load(os.path.join(tex_dir, fname), check_existing=True)
    if non_color:
        im.colorspace_settings.name = "Non-Color"
    return im


def pbr_mat(name, tex_dir, asset, res="1k", tint=None,
            rough_mul=None, normal_strength=1.0):
    """Poly Haven の diff / nor_gl / arm 3 枚から Principled を組む。

    ARM(AO=R, Rough=G, Metal=B) の G/B を 1 枚の画像から繋ぐと、glTF エクスポータが
    再ベイクせずそのまま metallicRoughnessTexture として書き出す（軽い・速い）。
    tint は Multiply ノードになり glTF では baseColorFactor になるので、
    同じテクスチャで色違いのマテリアルを増やしてもテクスチャは 1 枚のまま。
    """
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); out.location = (600, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled"); bsdf.location = (280, 0)
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tex_d = nt.nodes.new("ShaderNodeTexImage"); tex_d.location = (-520, 260)
    tex_d.image = _img(tex_dir, "%s_diff_%s.jpg" % (asset, res))
    if tint:
        mix = nt.nodes.new("ShaderNodeMix"); mix.location = (0, 260)
        mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        nt.links.new(tex_d.outputs["Color"], mix.inputs[6])
        mix.inputs[7].default_value = (*tint, 1.0)
        nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    else:
        nt.links.new(tex_d.outputs["Color"], bsdf.inputs["Base Color"])

    tex_n = nt.nodes.new("ShaderNodeTexImage"); tex_n.location = (-520, -40)
    tex_n.image = _img(tex_dir, "%s_nor_gl_%s.jpg" % (asset, res), non_color=True)
    nm = nt.nodes.new("ShaderNodeNormalMap"); nm.location = (-160, -60)
    nm.inputs["Strength"].default_value = normal_strength
    nt.links.new(tex_n.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])

    tex_a = nt.nodes.new("ShaderNodeTexImage"); tex_a.location = (-520, -340)
    tex_a.image = _img(tex_dir, "%s_arm_%s.jpg" % (asset, res), non_color=True)
    sep = nt.nodes.new("ShaderNodeSeparateColor"); sep.location = (-200, -340)
    nt.links.new(tex_a.outputs["Color"], sep.inputs["Color"])
    if rough_mul is not None:
        rm = nt.nodes.new("ShaderNodeMath"); rm.location = (20, -320)
        rm.operation = "MULTIPLY"; rm.inputs[1].default_value = rough_mul
        rm.use_clamp = True
        nt.links.new(sep.outputs["Green"], rm.inputs[0])
        nt.links.new(rm.outputs["Value"], bsdf.inputs["Roughness"])
    else:
        nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    return m


def plain_mat(name, color, rough=0.6, metal=0.0,
              emit=None, emit_strength=0.0, alpha=1.0):
    """テクスチャ無しマテリアル。

    color はリニア値。暗いものは 0.02〜0.05 にする — 0.1 台にすると sRGB 表示で
    中間グレーになり「黒いはずの物が灰色」になる。
    """
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Alpha"].default_value = alpha
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1.0)
        b.inputs["Emission Strength"].default_value = emit_strength
    if alpha < 1.0:
        m.blend_method = "BLEND"
    return m


# -------------------------------------------------------------------- finish
def finalize(smooth_colls=("Equipment", "Lighting")):
    """書き出し前の共通処理。UV 保証・ヘルパー削除・丸物のスムーズシェード。

    箱物の建築はフラットのままの方が正しく、円柱や球だけ角度スムーズをかける。
    """
    for ob in list(bpy.data.objects):
        if ob.type != "MESH":
            continue
        if ob.name.startswith("_"):
            bpy.data.objects.remove(ob, do_unlink=True)
            continue
        if not ob.data.uv_layers:
            ob.data.uv_layers.new(name="UVMap")
        ob.data.validate(verbose=False)
    for cname in smooth_colls:
        if cname not in COLLS:
            continue
        for ob in COLLS[cname].objects:
            if ob.type != "MESH":
                continue
            bpy.ops.object.select_all(action="DESELECT")
            ob.select_set(True)
            bpy.context.view_layer.objects.active = ob
            try:
                bpy.ops.object.shade_auto_smooth(angle=math.radians(35))
                for m in list(ob.modifiers):
                    if m.type == "NODES":
                        bpy.ops.object.modifier_apply(modifier=m.name)
            except Exception:
                pass
    bpy.ops.object.select_all(action="DESELECT")
    for m in list(bpy.data.meshes):
        if m.users == 0:
            bpy.data.meshes.remove(m)
    bpy.context.view_layer.update()


def preview_setup(cam_loc, cam_target, lens=15.0, res=(1600, 900)):
    """確認用カメラ。View Transform は Standard — AgX は黒を持ち上げて判断を誤らせる。"""
    scn = bpy.context.scene
    scn.render.engine = "BLENDER_EEVEE"
    scn.render.resolution_x, scn.render.resolution_y = res
    scn.view_settings.view_transform = "Standard"
    cd = bpy.data.cameras.new("PREVIEW_Camera")
    cd.lens = lens
    cam = bpy.data.objects.new("PREVIEW_Camera", cd)
    cam.location = cam_loc
    cam.rotation_euler = (Vector(cam_target) - Vector(cam_loc)) \
        .to_track_quat("-Z", "Y").to_euler()
    link(cam, "_Preview")
    scn.camera = cam
    return cam


def set_preview_excluded(state, preview="_Preview"):
    """_Preview を view layer から外す/戻す。GLB 書き出しの前後で挟む。"""
    for lc in bpy.context.view_layer.layer_collection.children:
        for sub in lc.children:
            if sub.name == preview:
                sub.exclude = state
                return True
    return False


def export_glb(path, preview="_Preview"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    set_preview_excluded(True, preview)
    try:
        bpy.ops.export_scene.gltf(
            filepath=path, export_format="GLB",
            use_visible=True, export_apply=True,
            export_materials="EXPORT", export_image_format="AUTO",
            export_cameras=False, export_lights=False,
            export_yup=True, export_extras=False, export_animations=False)
    finally:
        set_preview_excluded(False, preview)
    return {"path": path, "bytes": os.path.getsize(path)}


def stats():
    """三角形数の内訳。重いオブジェクトを早めに見つける。"""
    rows = []
    for ob in bpy.data.objects:
        if ob.type == "MESH":
            rows.append((ob.name, sum(len(p.vertices) - 2 for p in ob.data.polygons)))
    rows.sort(key=lambda r: -r[1])
    return {"objects": len(rows), "tris": sum(r[1] for r in rows),
            "materials": len(bpy.data.materials), "images": len(bpy.data.images),
            "heaviest": rows[:8]}


def to_xrift(x, y, z):
    """Blender 座標 -> XRIFT(glTF Y-up) 座標。ユーザーに位置を伝えるときに使う。"""
    return (x, z, -y)
