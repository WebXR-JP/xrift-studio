# XRIFT Studio へ取り込む — 手順と落とし穴

## 呼び出し順

```
1. get_editor_context      Edit モードか / revision / projectId / sceneId
2. import_model_asset      絶対パス。GLB/VRM/glTF/OBJ 単一ファイル、128MB まで
3. get_editor_context      ★必ず読み直す
4. place_asset             シーンへ配置
5. 後始末（下記）
```

### revision が飛ぶ

**これで 1 回失敗する。** `import_model_asset` を `expectedRevision: 0` で呼ぶと成功して
`revisionAfter: 1` が返るが、その直後に Studio 側がコライダー生成などの後処理を走らせるため、
実際の revision は一気に進む（実測 0 → **17**）。そのまま `place_asset` に 1 を渡すと

```
STALE_REVISION: Sceneが更新されています。最新のEditor contextを取得してください
```

**インポートと配置の間に必ず `get_editor_context` を挟む。**
以降も書き込みのたびに直前の戻り値の `revisionAfter` を使うか、読み直す。

### import_model_asset の引数

```json
{
  "projectId": "project-...",
  "sceneId": "scene-...",
  "expectedRevision": 0,
  "sourcePath": "C:\\...\\export\\Model.glb",
  "name": "Model"
}
```

`sourcePath` は絶対パスの実ファイル（シンボリックリンク不可）。glTF の分割形式は
companion ファイルを読まないので **GLB 一択**。

戻り値の `importMetadata.nodes` に全ノードの name / position / rotation / 親子関係が入る。
ここで**名前・ピボット・親子が意図どおり入ったかを確認する**。特に：

- ドアのヒンジ原点が期待した座標か
- ハンドルがパネルの子になっているか（`parentSourceNodeIndex`）
- `scale` が全ノード `[1,1,1]` か

---

## 座標系

glTF の Y-up 変換で軸が入れ替わる。

```
Blender (x, y, z)  ->  XRIFT (x, z, -y)
```

Blender で **+Y 側**にあった壁は XRIFT では **−Z 側**。ユーザーに座標を伝えるときは必ず変換する。

| Blender | XRIFT |
|---|---|
| `(±0.85, ±0.62, 2.50)` 天井 | `(±0.85, 2.50, ∓0.62)` |
| `(±1.80, 0.55, 1.88)` 壁 | `(±1.80, 1.88, −0.55)` |

`room_lib.to_xrift(x, y, z)` が変換してくれる。

---

## 取り込み直後の後始末

新規プロジェクトの既定シーンには starter エンティティが入っている。放置すると壊れる。

### 1. `starter-floor` を無効化する

8×8 の平面が **y=0** にある。自作の床の天面とちょうど同一平面になって Z-fighting し、
さらに部屋の外へはみ出す。

```
set_entity_enabled(entityId: "starter-floor", enabled: false)
```

削除ではなく無効化にする。ユーザーが戻したくなったときに 1 クリックで戻せる。

### 2. `starter-spawn` を室内へ移す

既定は `(0, 0.05, 4)`。たいていの部屋はこれより小さいので**外に出てしまう**。
室内の開けた場所へ移し、見せたい面を向かせる。

```
update_transform(entityId: "starter-spawn",
                 componentId: "starter-spawn-transform",
                 position: [-1.15, 0.05, 0.95],
                 rotation: [0, -0.637, 0])
```

three.js 系なので **yaw 0 が −Z 向き**。`(0,0,-1)` を +Y 軸まわりに θ 回すと
`(-sinθ, 0, -cosθ)` になるので、向けたい方向 `(dx, dz)` に対して
`θ = atan2(-dx, -dz)`。

テーブルや椅子の上に湧かないよう、家具の占有範囲を避けて置く。

### 3. 自動コライダーを見る

`importSettings.generateColliders` が既定 `true` なので、**全ノードに Mesh Collider が付く**。
48 ノードなら 48 個。`inspect_colliders` を叩くと全件に警告が出る：

```
explicit-mesh-with-auto-collider
「明示的なMesh ColliderとRigid Bodyの自動Colliderが重複する可能性があります」
fixable: false
```

`optimize_colliders` は `fixableCount: 0` なので**これは直せない**。手で減らす。
当たり判定が要らない代表例：

- 文字メッシュ（サインの文字、時計の数字）
- 発光面・サインの筐体
- 天井の照明器具、間接照明のストリップ
- 壁付けパネル（壁本体にコライダーがあれば足りる）
- 天井の見切り・回り縁

床・壁・天井・テーブル・椅子・ドアだけ残せば実用上は足りる。

---

## シーン設定でできること / できないこと

`update_scene_settings` で触れる範囲には制限がある。

| やりたいこと | 可否 |
|---|---|
| `ambient.color` / `ambient.intensity` | ○ |
| **`ambient.enabled`** | **×** — `INVALID_ARGUMENT: ambient.enabledはScene設定で変更できません`。UI でトグルしてもらう |
| `camera.far` / `near` | ○ — 屋内なら far を 2000 → 200 に下げると深度精度が上がり Z-fighting が減る |
| `fog` / `skybox` / `postprocessing` | ○ |

**照明そのもの（Light エンティティ）を勝手に置かない。** ユーザーが「最終ライティングは XRIFT 側で」
と言っている場合、器具の位置マーカーだけ渡して、実際の Light 配置は任せる。
提案するのはよいが、断りなく追加しない。

---

## 見た目を確認する

XRIFT 側にレンダー API は無いので、Scene View を録画してフレームを抜く。

```
capture_scene_debug(action: "start", durationMs: 2000)
capture_scene_debug(action: "stop")     -> webm のパスが返る
```

```bash
ffmpeg -v error -y -i <webm> -vf "select=eq(n\,15)" -vframes 1 out.png
```

抜いた PNG を `Read` で見る。

### 密閉した部屋は真っ暗になる

壁と天井で閉じた部屋に Directional ライトだけだと、内部に光が入らず何も見えない。
**確認のためだけに**、太陽の影を一時的に切ると全面が照らされて中が見える。

```
update_component(entityId: "starter-sun", componentId: "starter-sun-light",
                 patch: {"castShadow": false})
   ... capture ...
update_component(... patch: {"castShadow": true})     ★必ず戻す
```

影を切ると壁を無視して光が入るので内装が読める。**触った設定は必ず元に戻し、
何を触ったかユーザーに伝える。**

Emissive マテリアルは光源が無くても描画されるので、真っ暗な状態でも
「サインや画面が光っているか」だけは確認できる。インポートが効いている最初の証拠になる。

### `capture_scene_debug(action: "metrics")`

FPS / フレーム時間 / draw call / 三角形数 / メモリを返す。書き出したモデル単体の
三角形数より大きい値が出るが、starter 環境やシャドウパスを含むため。

---

## 大きすぎるレスポンス

`list_entities` は数万文字返ってきてファイルに退避される。
**全文を読み込まない。** 保存されたファイルを python / jq で集計する。

```python
import json, io
d = json.load(io.open(path, encoding="utf-8"))
roots = [e for e in d["entities"] if not e.get("parentId")]
```

Windows のコンソールは cp932 なので、日本語を含むエンティティ名を print すると
文字化けするか落ちる。`sys.stdout.reconfigure(encoding="utf-8")` を先に入れる。

---

## 引き渡し時に伝えるべきこと

取り込みが終わったら、ユーザーが次に触る場所を具体的に渡す。

- インポートした assetId / 配置した entityId
- **XRIFT 座標での**照明マーカー位置、ドアのヒンジ座標
- 触った設定と、戻したかどうか
- 残っている手作業（ambient のトグル、コライダー整理、Light 配置）
