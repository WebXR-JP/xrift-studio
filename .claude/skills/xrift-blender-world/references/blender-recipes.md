# Blender レシピ集

`room_lib.py`を使って部屋を作る手順です。設定値を選ぶときの注意点と、コードの例を掲載しています。

## 目次

- [テクスチャ調達（Poly Haven）](#テクスチャ調達poly-haven)
- [マテリアルの明るさ](#マテリアルの明るさ)
- [形状のレシピ](#形状のレシピ)
- [ポリゴンを減らす](#ポリゴンを減らす)
- [書き出し前の検証](#書き出し前の検証)
- [GLBを検証する](#glb-を検証する)

---

## テクスチャ調達（Poly Haven）

全アセットCC0。商用可・再配布可・改変可・クレジット不要。使う前に必ず
https://polyhaven.com/license を実際に確認する（リストAPIの`license`はnullで返る）。

```
一覧   https://api.polyhaven.com/assets?type=textures
ファイル https://api.polyhaven.com/files/<name>
直リンク https://dl.polyhaven.org/file/ph-assets/Textures/jpg/<res>/<name>/<name>_<map>_<res>.jpg
```

この手順では`diff`、`nor_gl`、`arm`の3枚を使います。
`arm`はAO=R / Roughness=G / Metallic=Bのパック済みマップで、これをG→Roughness、
B→Metallicに繋ぐと glTFエクスポータが再ベイクせずそのまま
`metallicRoughnessTexture`として書き出す。1枚で3チャンネル分になるので軽い。

`nor_dx`ではなく`nor_gl`を使う（BlenderもglTFもOpenGL規約）。

### 解像度

メタバース用なので1Kを基本にする。床やカーペットのような高周波ノイズは512で十分。
`scripts/fetch_polyhaven.py`が取得と縮小をやる。

### 選ぶ前にサムネイルを見る

素材名だけで選ばず、候補のサムネイルを確認してください。複数候補をコンタクトシートに並べると比較できます。

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

サムネイルは`https://cdn.polyhaven.com/asset_img/thumbs/<name>.png?width=200&height=200`。

### 色被りは Multiply では直らない

`dirty_carpet`は苔色のムラがあり、Multiplyの色調整ではムラごと増幅されて悪化する。
この素材はCC0なので、必要に応じて画像を加工できます。

```python
d = Image.open("dirty_carpet_diff_1k.jpg").convert("RGB")
d = Image.blend(d, d.convert("L").convert("RGB"), 0.88)   # 88% 脱色
d = ImageEnhance.Brightness(d).enhance(1.18)
d.resize((512, 512), Image.LANCZOS).save("carpet_grey_diff_512.jpg", quality=88)
```

加工したことと元素材をREADMEに残す。

### 同じテクスチャを色違いで使い回す

`tint`はglTFで`baseColorFactor`になるので、テクスチャは1枚のまま複数マテリアルを作れる。
吸音壁（明るいグレー）と腰壁（濃いグレー）を同じ`plastered_wall_04`から作る、など。
同じ画像を再利用すると、画像用メモリを減らせます。

---

## マテリアルの明るさ

Base Colorはリニア値。 sRGBの見た目とは違う。

| 狙い | リニア値 | sRGB表示 |
|---|---|---|
| マットな黒（機材・金属） | 0.015 〜 0.025 | 0.13 〜 0.17 |
| 濃いグレー（腰壁・ドア） | 0.04 〜 0.06 | 0.22 〜 0.26 |
| 中間グレー | 0.20 | 0.48 |
| 明るいグレー（壁） | 0.20 〜 0.27 | 0.48 〜 0.55 |

`0.115`のような「暗そうな数字」を書くとsRGBでは0.37の中間グレーになる。
黒い物が灰色に見える場合は、ビュー変換のAgXとマテリアル値を順に確認してください。

### View Transform

既定の AgXは黒を持ち上げてコントラストを圧縮するので、マテリアル値の判断を誤らせる。
XRIFTのようなエンジンに持っていく前提のプレビューでは`Standard`にする。

```python
bpy.context.scene.view_settings.view_transform = "Standard"
```

`Standard`はハイライトが飛びやすいので、Emissiveの強度とライト強度はAgX時の6割程度に落とす。

### Emissive

`Emission Color` + `Emission Strength`はglTFで`emissiveFactor` +
`KHR_materials_emissive_strength`として出る。XRIFTでもそのまま光る。

発光面は筐体と別オブジェクトにする。 XRIFT側でマテリアルを差し替えて
消灯状態を作れるようにするため。

---

## 形状のレシピ

### 壁の開口部

ブーリアンを使わず壁を分割して`join`。→ SKILL.md参照。

### 一周する仕上げは開口部で分割する

腰壁・笠木・幅木を「壁4面ぶん」まとめて作ると、ドアの中を横切る。

```python
ws = [
    box("_ws0", X0, DOOR_X0, *attach_span(Y1, -1, 0.022), 0.0, WAINSCOT_H),
    box("_ws0b", DOOR_X1, X1, *attach_span(Y1, -1, 0.022), 0.0, WAINSCOT_H),  # ドアを避ける
    box("_ws1", X0, X1, *attach_span(Y0, +1, 0.022), 0.0, WAINSCOT_H),
    ...
]
```

### ルーバー（縦格子）

スリット1本1本を箱で作り、`join`して1オブジェクトにする。44本でも528 trisで済む。
窓に重なる範囲はz範囲を変えて短くする。奥に暗い下地板を入れると隙間が影として読める。

```python
x, i = lx0, 0
while x + sw <= lx1:
    over_window = not (x + sw <= WIN_X0 or x >= WIN_X1)
    z0 = (WIN_Z1 + 0.05) if over_window else UPPER_Z0
    slats.append(box("_ls%03d" % i, x, x + sw, y_back - depth, y_back, z0, UPPER_Z1))
    x += pitch; i += 1
```

### 間接照明（コーブ）

発光ストリップを直接見せたくない場合は、立ち上がりのfasciaで隠してください。

```
壁 ─┐
    │ ← fascia: 壁から 90〜110mm 離した立板 (z 2.30〜2.43)
    │
  ──┘ ← shelf: 壁から fascia までの水平板 (z 2.28〜2.30)
        ストリップは shelf の上、fascia の裏 (z 2.32〜2.35) に置く
```

こうすると下から見上げても光源が見えず、天井だけが光る。

### 窓の奥

ガラスの奥に室内を表現したい場合は、開口部へ向けた5枚の板で浅い箱を作ってください。奥行きは1m程度にし、暗いマテリアルを使います。机とモニターを表す箱を2つ置くと、部屋の用途も伝わります。

### 椅子

座面と背もたれを直結しない。細い支柱2本で繋いで隙間を作ると、
箱3個でも「シンプルな椅子」に見える。背もたれは付け根に原点を移してから傾ける。

### 円柱の向き

既定の軸は +Z。`aim(direction)`を使う。方向ベクトルから姿勢を求めると符号ミスを避けやすい。

```python
dv = Vector((-1, 0, -0.6))
arm = cyl("_arm", 0.014, 0.19, center, rot=aim(dv))
```

円錐は`radius1`が −Z側。下が広いシェードは`cone(r_bottom=0.098, r_top=0.030, ...)`。

---

## ポリゴンを減らす

| 対象 | 手 | 効果 |
|---|---|---|
| テキスト | `data.resolution_u = 2`をメッシュ化前に | 3188 → 548 tris |
| 円柱 | `verts=10〜16`。小物は10で足りる | |
| 球 | `seg=12, rings=6` | |
| 面取り | `bevel(offset=0.008, segments=2)`を天板の稜線だけに | |

小さな箱は12 trisしかないので、パネルや小物を個別オブジェクトにしても総ポリゴンは増えない。
XRIFT側の編集しやすさを優先して分けてよい。

---

## 書き出し前の検証

`scripts/validate_scene.py`を`exec`する。返る`issues`が空か、
意図的なピボット（ドア・椅子・マイク等の位置/Z回転）だけになっていればOK。

この静的な部屋の制作では、scaleが1でない対象があれば書き出しを止めて修正してください。法線や物理計算への影響を防ぎます。

---

## GLB を検証する

書き出したら中身を見る。特にARMが直接使われているかを確認する。

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

- 画像枚数が想定どおりか（同じテクスチャを色違いで使い回せていれば増えない）
- `metallicRoughnessTexture`が ARM画像を直接指しているか（再ベイクされていたら別画像が増える）
- `baseColorFactor`にtintが乗っているか
- `KHR_materials_emissive_strength`が`extensionsUsed`にあるか
- ガラスが`alphaMode: BLEND`になっているか

texture数がimage数より多いのは正常（同じ画像を指すtextureが複数できるだけで、
バイナリは重複しない）。
