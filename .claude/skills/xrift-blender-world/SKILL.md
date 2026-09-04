---
name: xrift-blender-world
description: Blender MCP で XRIFT Studio 向けのワールド（部屋・建築・インテリア・スタジオ）を手続き的に制作し、GLB 経由で XRIFT Studio へ取り込むまでの一連の手順。Z-fighting の設計ルール、Poly Haven CC0 テクスチャの ARM→glTF 直結、ワールド座標ベース UV、XRIFT MCP の落とし穴（starter floor / spawn 位置 / ambient.enabled / 自動コライダー / Blender +Y → XRIFT −Z）を含む。Use whenever the user builds a room, interior, building, studio, or any 3D environment in Blender — especially for a metaverse / VR world — or imports a model into XRift Studio. 「Blenderで部屋を作って」「スタジオを作って」「ワールドを作って」「XRIFTに持ち込んで」「GLBをインポートして」「Z-fightingが起きた」「メタバース用のモデル」「軽量化して」などで発動。ユーザーが Blender と XRIFT のどちらか一方しか言及していなくても、もう一方に繋がる作業なら参照すること。
metadata:
  version: "1.0.0"
---

# XRIFT Studio 向けワールドを Blender で作る

Blender MCP で部屋・インテリアを手続き的に組み、GLB にして XRIFT Studio へ持ち込むまでの手順。
**Blender は「絵を作る場所」ではなく「XRIFT で扱いやすいベースを作る場所」**という前提で全体が組まれている。

## 5つの鉄則

これを外すと後から直すのが高くつく。理由は各セクションで説明する。

1. **面を絶対に一致させない。** 壁に貼る物は必ず壁へ数 mm 食い込ませる。`join()` で 1 個にまとめた部品どうしも同じ。Blender では見えないが XRIFT で Z-fighting になる。→ `references/zfighting.md` を**制作前に**読む
2. **不透明マテリアルは `use_backface_culling = True` にする。** 既定のままだと glTF に `doubleSided: true` で出て、背中合わせの面が両方描かれて競る
3. **ビルドは `.py` ファイルに書いて MCP から `exec` する。** MCP 呼び出しを積み上げる作り方をしない
4. **プレビューは View Transform を `Standard` にする。** 既定の AgX は黒を持ち上げるので、マテリアルの明るさ判断を誤る
5. **XRIFT の管理下ディレクトリに作業ファイルを置かない**

---

## Phase 0 — 準備

**作業場所。** XRIFT のプロジェクトフォルダ（`%APPDATA%/net.xrift.studio/projects/<name>/`）は Studio が
`assets/` `scenes/` `prefabs/` を管理している。生の .blend やテクスチャをここに置くとスキャンや同期で
問題になりうるので、別の場所に作業フォルダを切る。

```
<work>/
├── build_<name>.py     ビルドスクリプト（唯一の真実）
├── room_lib.py         ヘルパー（このスキルの scripts/ からコピー）
├── <name>.blend
├── textures/
└── export/<name>.glb
```

`execute_blender_code` を何度も叩いて形を積み上げると、やり直しが
効かず、寸法変更のたびに全部やり直しになる。代わりに 1 本の冪等なスクリプトを書き、こう実行する：

```python
path = r"<work>/build_studio.py"
g = {"__name__": "builder", "__file__": path}
exec(compile(open(path, encoding="utf-8").read(), path, "exec"), g)
result = g["main"]()          # execute_blender_code は result が dict でないとエラーになる
```

`main()` は先頭で全オブジェクト・全データブロックを消してから作り直す。こうすると寸法定数を
書き換えて再実行するだけで作り直せるので、試行回数を稼げる。

`scripts/room_lib.py` に検証済みのヘルパー（`box` / `cyl` / `join` / `set_origin` / `box_uv` /
`pbr_mat` と、**Z-fighting を構造的に防ぐ `attach_span` / `rest_on`**）が入っている。
これを作業フォルダにコピーして import すると、毎回書き直さずに済む。

---

## Phase 1 — Blender で作る

### 段階を踏む

一気に完成させず、**大きい形 → 全体確認 → 部分的にディテールアップ**の順で進める。
部屋の場合の既定の順番：

```
部屋（床・天井・壁） → テーブル等の主家具 → 椅子 → 開口部（窓・ドア）
→ 壁の仕上げ（腰壁・見切り） → 吸音材・ルーバー → 小物・機材 → 照明マーカー
```

各段階で `render_viewport_to_path` してから次へ進む。返ってきたパスは Blender の temp を指すので、
そのパスを `Read` して実際に目で見る。**見ずに進めると後でまとめて破綻する。**

### 寸法は定数にまとめる

スクリプト先頭に置く。ユーザーからの寸法変更に 1 行で応えられる。

```python
RW, RD, RH = 3.6, 2.8, 2.5        # 内寸 幅(X) x 奥行(Y) x 高さ(Z)
WT = 0.10                          # 壁厚
X0, X1 = -RW/2, RW/2               # 内面の座標
Y0, Y1 = -RD/2, RD/2
WIN_X0, WIN_X1 = -1.35, 0.25       # 開口部も定数で
DOOR_X0, DOOR_X1 = 0.75, 1.63
```

### 開口部はブーリアンを使わず「壁を分割して作る」

窓やドアの穴は、壁を 6 個程度のボックスに分けて `join` する。ブーリアンは頂点が汚れ、
モディファイアの適用忘れも起きる。分割なら開口部の縁が必ず正しい面になる。

```python
segs = [(X0, WIN_X0, 0, RH), (WIN_X1, DOOR_X0, 0, RH), (DOOR_X1, X1, 0, RH),
        (WIN_X0, WIN_X1, 0, WIN_Z0), (WIN_X0, WIN_X1, WIN_Z1, RH),
        (DOOR_X0, DOOR_X1, DOOR_Z1, RH)]
```

**腰壁・見切り・幅木のような「壁を一周する仕上げ」は、開口部を跨がせない。**
一周分をまとめて 1 本のボックスで作ると、ドアの中を横切ってしまう。開口部の x 範囲で分割する。

### 命名とオブジェクト分割

XRIFT 側で個別に触るものは必ず別オブジェクトにする。名前がそのまま XRIFT のエンティティ名になる。

- `Room_Floor` `Room_Ceiling` `Room_Wall_Back` … 構造
- `Table` `Chair_01` `Mic_01` … 家具・小物（1 個 1 オブジェクト）
- `OnAir_Sign_Housing` / `OnAir_Sign_Light` / `OnAir_Sign_Text` … **発光部を筐体から分ける**
- `Door_Panel`（原点をヒンジに）/ `Door_Handle`（Panel の子）
- `Light_Downlight_01`… `Light_Cove_Strips` `Light_WallLamp_L` … 照明は器具形状のみ

コレクションは `Room` / `Furniture` / `Fixtures` / `Equipment` / `Lighting` / `_Preview`。
`_Preview` に確認用ライトとカメラを入れ、書き出し時に除外する。

### 原点（ピボット）を意図的に置く

XRIFT で回したり置いたりする物は、原点が意味のある位置にないと使えない。
`set_origin(obj, world_point)` でジオメトリを動かさずに原点だけ移す。

| 対象 | 原点 |
|---|---|
| ドア | **ヒンジ側の端**（Z 回転だけで開く） |
| 椅子・テーブル | 床面の中心 |
| マイク・機材 | 設置面の中心 |
| ダウンライト | 天井面（Z=天井高） |
| 壁付け照明 | 壁面の取付点 |

**スケールは必ず 1 にする。** `join()` が内部で `transform_apply` するので自然にそうなるが、
書き出し前に検証する（後述）。位置と Z 回転は残ってよい — glTF のノード変換として正しく出るし、
「椅子のローカル −Y が正面」という情報が保たれる方が XRIFT で扱いやすい。

### 部品を回すときは自分の付け根を軸にする

椅子の背もたれを傾ける等。原点が床にあるまま回すと、高さ × sin だけ大きくずれる。

```python
br = box("_cb", ...)
set_origin(br, (0, -sd/2 + 0.031, sh + 0.11))   # 付け根に原点を移してから
br.rotation_euler = (math.radians(9), 0, 0)      # 回す
```

円柱は既定で +Z 軸。任意方向へ向けるときはオイラー角を手で組まず、
`dir.to_track_quat("Z", "Y").to_euler()` を使う。手組みは符号ミスで壊れる。

### マテリアルと UV

詳細は `references/blender-recipes.md`。要点だけ：

- **UV はワールド座標のボックス投影を焼き込む**（`box_uv(obj, tile=2.0)`）。Mapping ノードに依存しないので
  `KHR_texture_transform` 不要で glTF が素直に出る。実寸周期で貼れるのでタイリングも直感的
- **Poly Haven の `arm` マップ**（AO=R / Rough=G / Metal=B）を G→Roughness, B→Metallic に繋ぐと、
  glTF エクスポータが**再ベイクせずそのまま** `metallicRoughnessTexture` として出す。1 枚で 3 チャンネル分
- **色替えは Multiply ノード**で。glTF では `baseColorFactor` になるので、同じテクスチャを
  色違いの複数マテリアルで共用できる（例：吸音壁と腰壁で同じ壁テクスチャ）
- **暗い色はリニア値で 0.02〜0.05**。0.1 台にすると sRGB では中間グレーになって「黒いはずの物が灰色」になる
- テキストは `data.resolution_u = 2` にしてからメッシュ化（既定のままだと 1 文字列で 3000 tris 超える）

### 確認用ライティング

最終ライティングは XRIFT 側。Blender では形が読める程度でよい。ただし
**View Transform を `Standard` にする** — 既定の AgX はフィルム的に黒を持ち上げるので、
「マットな黒のマイク」が灰色に見えてマテリアル値を誤って調整してしまう。
`Standard` はゲームエンジンの見え方に近い。

照明位置は XRIFT 側で迷わないよう、器具のジオメトリを実際の位置に置いておく
（ダウンライト・間接照明・壁付け照明・サイン）。実際の Light は置かない。

### 書き出し前の検証

書き出す前に必ず全メッシュを走査する。この 5 点が通っていれば XRIFT で困らない。

```
□ scale が全て (1,1,1)
□ UV レイヤーが全メッシュにある
□ マテリアルスロットが空でない
□ モディファイアが残っていない
□ 意図しない位置/回転が残っていない（ピボット目的のものは除く）
□ 同一平面に重なった面が無い（Z-fighting）
```

上 5 つは `scripts/validate_scene.py`、最後の 1 つは `scripts/find_coplanar.py` を `exec` する。
`ready_to_export: true` かつ `suspect_count: 0` になるまで書き出さない。

**Z-fighting は目視では取りこぼす。** 必ず機械的に走らせる。

### GLB 書き出し

```python
bpy.ops.export_scene.gltf(
    filepath=path, export_format="GLB",
    use_visible=True,              # _Preview を view layer から exclude してから呼ぶ
    export_apply=True,
    export_materials="EXPORT",
    export_image_format="AUTO",    # JPEG ソースを JPEG のまま保つ
    export_cameras=False, export_lights=False,   # 照明は XRIFT 側
    export_yup=True, export_extras=False, export_animations=False)
```

`_Preview` は `layer_collection.children[...].exclude = True` で外し、書き出し後に戻す。

書き出したら GLB を検証する。`references/blender-recipes.md` に GLB インスペクタのコードがある。
`metallicRoughnessTexture` が ARM 画像を直接指していること、画像枚数が想定どおりであることを見る。

---

## Phase 2 — XRIFT Studio へ取り込む

手順とハマりどころの詳細は **`references/xrift-import.md`**。ここでは骨子だけ。

```
get_editor_context            → Edit モードと revision を確認
import_model_asset            → 絶対パス。ここで revision が大きく飛ぶ
get_editor_context            → ★必ず読み直す（飛んだ revision を取得）
place_asset                   → シーンに配置
（starter 環境の後始末・spawn 位置修正）
```

### 座標系

glTF の Y-up 変換で軸が入れ替わる。**Blender (x, y, z) → XRIFT (x, z, −y)**。
Blender の +Y 側にあった壁は XRIFT では −Z 側になる。ユーザーに位置を伝えるときは変換して伝える。

### 取り込み直後に必ず確認する 3 点

1. **`starter-floor`** — 既定シーンの床は y=0 の 8×8 平面。自作の床の天面と同一平面になって
   Z-fighting し、部屋の外にもはみ出す。`set_entity_enabled(false)` で無効化する（削除より戻しやすい）
2. **`starter-spawn`** — 既定で `(0, 0.05, 4)`。たいてい**部屋の外**。室内の開けた場所に移し、
   見せたい面を向かせる（three.js 系なので yaw 0 が −Z 向き）
3. **自動コライダー** — `generateColliders: true` で全ノードに Mesh Collider が付く。
   文字・サイン・照明・パネルなど当たり判定が不要な物は無効化するとよい。
   `optimize_colliders` は "explicit-mesh-with-auto-collider" 警告を直せない（`fixableCount: 0`）

### 見た目の検証

密閉した部屋は Directional ライトだけでは中が真っ暗になる。中を見るには：

```
starter-sun の castShadow を一時的に false にする  → 影が消えて全面が照らされる
capture_scene_debug start / stop                   → webm が保存される
ffmpeg で 1 フレーム抜いて Read で見る
castShadow を true に戻す
```

**設定を触ったら必ず元に戻し、何を触ったかユーザーに伝える。**

`ambient.enabled` は MCP から変更できない（`Scene設定で変更できません`）。色と強度だけ設定して、
トグルは UI 側でやってもらう。

`list_entities` は数万文字返ってファイルに落とされる。全文を読まず、保存されたファイルを
python/jq で集計する。

---

## 参照ファイル

| ファイル | 中身 | いつ読むか |
|---|---|---|
| `references/zfighting.md` | Z-fighting の原因・設計ルール・チェックリスト | **制作前に必ず** |
| `references/blender-recipes.md` | マテリアル / UV / 形状 / GLB 検証のコード | Phase 1 で必要になったとき |
| `references/xrift-import.md` | XRIFT MCP の呼び出し順・落とし穴の詳細 | Phase 2 |
| `scripts/room_lib.py` | 検証済みヘルパー（Z-fighting 安全） | Phase 1 の最初にコピー |
| `scripts/fetch_polyhaven.py` | テクスチャ取得・前処理 | テクスチャが要るとき |
| `scripts/validate_scene.py` | 書き出し前チェック（scale/UV/マテリアル） | 書き出し直前 |
| `scripts/find_coplanar.py` | Z-fighting 検出（重なり面積まで見る） | 書き出し直前 |

## ライセンス

Poly Haven は全アセット CC0（商用可・再配布可・改変可・クレジット不要）。XRIFT でのワールド公開に
制限はない。**ただし「無料と書いてあるから」で判断せず、使う前に必ずライセンスページを確認する。**
他サイトの素材を使う場合は特に。取得先・作者・加工内容を README に残しておく。
