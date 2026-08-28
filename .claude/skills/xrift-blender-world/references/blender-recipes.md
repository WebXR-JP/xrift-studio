# Blender レシピ集

`room_lib.py` を使う前提。ここには判断が要る部分と、そのまま貼れるコードを置く。

## 目次

- [テクスチャ調達（Poly Haven）](#テクスチャ調達poly-haven)
- [マテリアルの明るさ](#マテリアルの明るさ)
- [形状のレシピ](#形状のレシピ)
- [ポリゴンを減らす](#ポリゴンを減らす)
- [書き出し前の検証](#書き出し前の検証)
- [GLB を検証する](#glb-を検証する)

---

## テクスチャ調達（Poly Haven）

全アセット CC0。商用可・再配布可・改変可・クレジット不要。**使う前に必ず
https://polyhaven.com/license を実際に確認する**（リスト API の `license` は null で返る）。

```
一覧   https://api.polyhaven.com/assets?type=textures
ファイル https://api.polyhaven.com/files/<name>
直リンク https://dl.polyhaven.org/file/ph-assets/Textures/jpg/<res>/<name>/<name>_<map>_<res>.jpg
```

必要なのは 3 枚だけ：`diff` / `nor_gl` / **`arm`**。
`arm` は AO=R / Roughness=G / Metallic=B のパック済みマップで、これを G→Roughness、
B→Metallic に繋ぐと **glTF エクスポータが再ベイクせずそのまま
`metallicRoughnessTexture` として書き出す**。1 枚で 3 チャンネル分になるので軽い。

`nor_dx` ではなく **`nor_gl`** を使う（Blender も glTF も OpenGL 規約）。

### 解像度

メタバース用なので 1K を基本にする。床やカーペットのような高周波ノイズは 512 で十分。
`scripts/fetch_polyhaven.py` が取得と縮小をやる。

### 選ぶ前にサムネイルを見る

名前だけで決めると外す。候補のサムネイルを落としてコンタクトシートにし、実際に見る。

```python
from PIL import Image, ImageDraw
names = [...]
S, C = 200, 4
R = (len(names) + C - 1) // C
sheet = Image.new("RGB", (C * S, R * (S + 22)), (30, 30, 30))
d = ImageDraw.Draw(sheet)
for i, n in enumerate(names):
    im = Image.open("th_%s.png" % n).convert("RGB").resize((S, S))
    x, y = (i % C) * S, (i // C) * (S + 22)
    sheet.paste(im, (x, y))
    d.text((x + 4, y + S + 5), n, fill=(230, 230, 230))
sheet.save("contact_sheet.png")
```

サムネイルは `https://cdn.polyhaven.com/asset_img/thumbs/<name>.png?width=200&height=200`。

### 色被りは Multiply では直らない

`dirty_carpet` は苔色のムラがあり、Multiply の色調整では**ムラごと増幅されて**悪化する。
こういうときは CC0 なので**オフラインで加工してしまう**のが早い。

```python
d = Image.open("dirty_carpet_diff_1k.jpg").convert("RGB")
d = Image.blend(d, d.convert("L").convert("RGB"), 0.88)   # 88% 脱色
d = ImageEnhance.Brightness(d).enhance(1.18)
d.resize((512, 512), Image.LANCZOS).save("carpet_grey_diff_512.jpg", quality=88)
```

加工したことと元素材を README に残す。

### 同じテクスチャを色違いで使い回す

`tint` は glTF で `baseColorFactor` になるので、テクスチャは 1 枚のまま複数マテリアルを作れる。
吸音壁（明るいグレー）と腰壁（濃いグレー）を同じ `plastered_wall_04` から作る、など。
画像枚数＝メモリなので、これが一番効く軽量化。

---

## マテリアルの明るさ

**Base Color はリニア値。** sRGB の見た目とは違う。

| 狙い | リニア値 | sRGB 表示 |
|---|---|---|
| マットな黒（機材・金属） | 0.015 〜 0.025 | 0.13 〜 0.17 |
| 濃いグレー（腰壁・ドア） | 0.04 〜 0.06 | 0.22 〜 0.26 |
| 中間グレー | 0.20 | 0.48 |
| 明るいグレー（壁） | 0.20 〜 0.27 | 0.48 〜 0.55 |

`0.115` のような「暗そうな数字」を書くと sRGB では 0.37 の中間グレーになる。
**黒い物が灰色に見えたら、まずビュー変換（AgX）を疑い、次に値を疑う。**

### View Transform

既定の **AgX は黒を持ち上げてコントラストを圧縮する**ので、マテリアル値の判断を誤らせる。
XRIFT のようなエンジンに持っていく前提のプレビューでは `Standard` にする。

```python
bpy.context.scene.view_settings.view_transform = "Standard"
```

`Standard` はハイライトが飛びやすいので、Emissive の強度とライト強度は AgX 時の 6 割程度に落とす。

### Emissive

`Emission Color` + `Emission Strength` は glTF で `emissiveFactor` +
`KHR_materials_emissive_strength` として出る。XRIFT でもそのまま光る。

**発光面は筐体と別オブジェクトにする。** XRIFT 側でマテリアルを差し替えて
消灯状態を作れるようにするため。

---

## 形状のレシピ

### 壁の開口部

ブーリアンを使わず壁を分割して `join`。→ SKILL.md 参照。

### 一周する仕上げは開口部で分割する

腰壁・笠木・幅木を「壁 4 面ぶん」まとめて作ると、**ドアの中を横切る**。

```python
ws = [
    box("_ws0", X0, DOOR_X0, *attach_span(Y1, -1, 0.022), 0.0, WAINSCOT_H),
    box("_ws0b", DOOR_X1, X1, *attach_span(Y1, -1, 0.022), 0.0, WAINSCOT_H),  # ドアを避ける
    box("_ws1", X0, X1, *attach_span(Y0, +1, 0.022), 0.0, WAINSCOT_H),
    ...
]
```

### ルーバー（縦格子）

スリット 1 本 1 本を箱で作り、`join` して 1 オブジェクトにする。44 本でも 528 tris で済む。
窓に重なる範囲は z 範囲を変えて短くする。奥に暗い下地板を入れると隙間が影として読める。

```python
x, i = lx0, 0
while x + sw <= lx1:
    over_window = not (x + sw <= WIN_X0 or x >= WIN_X1)
    z0 = (WIN_Z1 + 0.05) if over_window else UPPER_Z0
    slats.append(box("_ls%03d" % i, x, x + sw, y_back - depth, y_back, z0, UPPER_Z1))
    x += pitch; i += 1
```

### 間接照明（コーブ）

発光ストリップが直接見えると安っぽい。**立ち上がり（fascia）で隠す。**

```
壁 ─┐
    │ ← fascia: 壁から 90〜110mm 離した立板 (z 2.30〜2.43)
    │
  ──┘ ← shelf: 壁から fascia までの水平板 (z 2.28〜2.30)
        ストリップは shelf の上、fascia の裏 (z 2.32〜2.35) に置く
```

こうすると下から見上げても光源が見えず、天井だけが光る。

### 窓の奥

透明ガラスの向こうが虚無だと壊れて見える。**浅い箱（開口を向いた 5 枚板）**を置くだけで
「向こうに部屋がある」ように読める。奥行き 1m 程度、暗いマテリアル。
机とモニタらしき箱を 2 つ入れるとさらに効く。

### 椅子

座面と背もたれを**直結しない**。細い支柱 2 本で繋いで隙間を作ると、
箱 3 個でも「シンプルな椅子」に見える。背もたれは付け根に原点を移してから傾ける。

### 円柱の向き

既定の軸は +Z。`aim(direction)` を使う。オイラー角を手で組むと符号で必ず壊れる。

```python
dv = Vector((-1, 0, -0.6))
arm = cyl("_arm", 0.014, 0.19, center, rot=aim(dv))
```

円錐は `radius1` が −Z 側。下が広いシェードは `cone(r_bottom=0.098, r_top=0.030, ...)`。

---

## ポリゴンを減らす

| 対象 | 手 | 効果 |
|---|---|---|
| テキスト | `data.resolution_u = 2` をメッシュ化前に | 3188 → 548 tris |
| 円柱 | `verts=10〜16`。小物は 10 で足りる | |
| 球 | `seg=12, rings=6` | |
| 面取り | `bevel(offset=0.008, segments=2)` を天板の稜線だけに | |

小さな箱は 12 tris しかないので、**パネルや小物を個別オブジェクトにしても総ポリゴンは増えない**。
XRIFT 側の編集しやすさを優先して分けてよい。

---

## 書き出し前の検証

`scripts/validate_scene.py` を `exec` する。返る `issues` が空か、
意図的なピボット（ドア・椅子・マイク等の位置/Z回転）だけになっていれば OK。

**scale が 1 でないものが 1 つでもあれば止めて直す。** 法線と物理が壊れる。

---

## GLB を検証する

書き出したら中身を見る。特に ARM が直接使われているかを確認する。

```python
import struct, json
data = open(path, "rb").read()
off, js = 12, None
while off < len(data):
    clen, ctype = struct.unpack("<II", data[off:off + 8])
    if ctype == 0x4E4F534A:
        js = json.loads(data[off + 8:off + 8 + clen].decode("utf-8"))
    off += 8 + clen

print(len(js["images"]), "images |", len(js["materials"]), "materials")
for m in js["materials"]:
    p = m.get("pbrMetallicRoughness", {})
    print(m["name"],
          "MR:tex%s" % p["metallicRoughnessTexture"]["index"] if "metallicRoughnessTexture" in p else "",
          "baseColFactor" if "baseColorFactor" in p else "",
          "normal" if "normalTexture" in m else "")
for i, t in enumerate(js["textures"]):
    print("tex%d -> img%d %s" % (i, t["source"], js["images"][t["source"]].get("name")))
```

見るポイント：

- **画像枚数**が想定どおりか（同じテクスチャを色違いで使い回せていれば増えない）
- `metallicRoughnessTexture` が **ARM 画像を直接**指しているか（再ベイクされていたら別画像が増える）
- `baseColorFactor` に tint が乗っているか
- `KHR_materials_emissive_strength` が `extensionsUsed` にあるか
- ガラスが `alphaMode: BLEND` になっているか

texture 数が image 数より多いのは正常（同じ画像を指す texture が複数できるだけで、
バイナリは重複しない）。
