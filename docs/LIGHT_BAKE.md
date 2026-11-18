# ライトベイクの仕組み

動かないMeshに当たる光をエディター内で計算し、ライトマップとして保存する機能の設計。利用者向けの手順は[利用ガイド](./guide/light-bake.md)、操作と状態は[F-48](./ux/editor.md#f-48)にある。

## 守ること

- ベイクはエディターで作者が実行した時点で行う。公開のときに焼き直さない。
- 結果は`lightmap`種別のAssetとしてプロジェクトに保存する。Scene View、Play、公開したワールドは、同じ2つのファイルを同じコードで貼る。
- 元のModelと共有Materialは書き換えない。同じModelやMaterialを、ベイクしていないEntityも使っている。
- 貼れないMeshや読めないファイルは、別の陰影で置き換えず、貼らずに理由を残す。

## データ

| 場所 | 内容 |
|---|---|
| `MeshComponent.lightBake` | 対象かどうかと、細かさの倍率。省略は対象外 |
| `LightComponent.bakeMode` | `realtime`（省略時）または`baked` |
| `SceneSettings.lightBake` | 画像の大きさの上限、品質、影のやわらかさ、使用中の`lightmapAssetId` |
| `LightmapAsset` | 画像（EXR）のパス、UV2データのパス、焼いたEntityとLight、ベイク時点のSceneの署名 |

ファイルは`assets/imported/lightmaps/<画像のSHA-256の先頭16桁>/`に2つ置く。中身のハッシュを場所にするので、焼き直しても前のファイルが残り、「元に戻す」で前のライトマップへ戻れる。使われなくなったファイルの掃除はまだ無い。

- `lightmap.exr`: 半精度RGBAの正方形。一辺は64以上の2のべき乗。放射照度をそのまま持ち、負の値と1を超える値を含む。
- `lightmap-uv.bin`: Meshごとの UV2。形式は`packages/xrift-studio-runtime/src/lightmap-data.ts`が正。

### UV2データ

Meshは「Entity id」と「Entityの中で何番目のMeshか」で特定する。番号は、`xriftLightmapScope`の印が付いた親の配下を深さ優先で数えた順で、`collectXriftLightmapMeshes`がベイク時と適用時の両方で数える。編集補助（`editorHelper`）、MToonの輪郭線、スキン・モーフのあるMeshは数えない。

Meshごとに次を持つ。

- 元の頂点数と索引数。読み込んだgeometryと合わなければ適用しない。
- 追加する頂点の写し元。チャートの境目では、同じ頂点が画像の別々の場所を読むので頂点を増やす。
- 差し替える索引（位置と新しい頂点番号の組）。
- 頂点ごとのUV。画像全体に対する16bit固定小数。

追加頂点と索引差し替えが一致するMeshは、1組を共有して書く。

## ベイクの流れ

実装は`src/lib/visual-editor/light-bake/`にあり、three.jsとDOMに依存しない部分はfixtureで検査する。

1. **収集**（`collect-scene.ts`）: Scene Viewのthree.jsのシーンから、印の付いたMeshのワールド座標の形、Material、ライト、環境を読む。保存した文書から組み立て直さないので、Modelの読み込み結果と割り当てたMaterialがそのまま入る。Textureは小さく描いてGPUから読み戻す。IBLは背景として6方向へ描いて読み戻す。
2. **UV2の生成**（`unwrap.ts`）: 面の向きが種の面から45度以内の、つながった面を1チャートにする。チャートを正面から平面へ写し、いちばん長い外周の辺を横軸に合わせる。計算はワールド座標なので、画像上の広さが実寸に比例する。
3. **配置**（`unwrap.ts`）: 全チャートを高さの順に段へ詰める。細かさは上限（1mあたり40px）から始め、収まる最小の画像を選ぶ。上限の大きさでも入らなければ、細かさを二分探索で下げる。チャートの周りは1px空ける。
4. **担当の割り当て**（`raster.ts`）: テクセルの中心が三角形の中にあればその位置を、縁から1px以内なら縁の位置を担当させる。
5. **光の計算**（`tracer.ts`、`bvh.ts`）: 自前のBVH（ビン分割SAH）へレイを飛ばすパストレース。Web Workerを論理コア数-1（最大8）立て、2048テクセルずつ配る。
6. **仕上げ**（`bake.ts`）: 無効なテクセルを同じチャートの隣から埋め、ばらつきに応じた縁を保つぼかし（à-trous 3回）を掛け、余白を近くの色で埋める。
7. **保存**: EXRとUV2データをプロジェクトへ書き、Lightmap Assetを更新し、Sceneの`lightmapAssetId`を1件の履歴として反映する。

## 焼く光

値はthree.jsの`lightMap`と同じ放射照度で、描画時にAlbedo / πが掛かる。ライトの減衰はthree.jsの物理ベースの式に合わせてある。

| 光 | ライトマップへ入れる量 |
|---|---|
| `baked`のライトの直接光 | すべて。描画ではライトを消す |
| `realtime`のライトの直接光 | 入れない。描画時に照らす |
| すべてのライトの間接光 | すべて |
| Emissiveの面が周りを照らす光 | すべて |
| Ambient Light、Hemisphere Light、IBL | 遮られて届かないぶんを負の値で持つ |

環境光は描画時に「遮るものが無い」前提で足される。そこで、最初のレイが何かに当たった向きだけ、その向きの環境の輝度を引く。何にも当たらなければ何も足さないので、開けた場所の値は誤差なしの0になる。three.jsの`aoMap`を使わないのは、Modelが元から持つAO Mapの枠を奪わないためである。

`baked`にしたAmbient LightとHemisphere Lightは、遮られずに届くぶんをそのまま焼き、描画では消す。

### テクセルの扱い

- 1テクセル内でレイの出発点をずらし、影の縁を格子でギザギザにしない。ずらした先がテクセルの中心から見えない場合（壁の向こう側など）は使わない。
- 最初のレイの40%超が裏面に当たったテクセルは、閉じた形の内側にあるとみなして無効にし、隣の有効な値で埋める。
- 半透明（blend）のMaterialは光を遮らず、跳ね返さない。抜き（mask）のMaterialは、Textureのアルファが閾値以上の所だけ遮る。

## 適用

`packages/xrift-studio-runtime/src/lightmap-apply.ts`が、エディターと公開物の両方で動く。

- 印の付いた親の配下のMeshを数え、保存データと照合する。0.5秒ごとに調べ直すので、後から読み込まれたModelにも貼られる。
- geometryは、元の属性配列を共有したまま、空いているUVの番号（`uv1`〜`uv3`）にUV2を足した写しへ差し替える。頂点を増やす必要があるMeshだけ配列を作り直す。
- Materialは`lightMap`を持たせた写しへ差し替える。写しは「元のMaterialとUVの番号」ごとに1つで、同じMaterialを使うMeshが共有する。
- 元のMaterialの変更は、毎フレーム写しへ届ける。作者の編集や、トリガーによる書き換えに追従するためである。
- ライトマップを表示できるのは、Standard / Physical / Lambert / Phong / Toon。Unlit、MToon、カスタムシェーダーには貼らない。
- 外すときは、元のgeometryとMaterialへ戻す。

公開物では、Compilerが対象のMeshを`<group userData={{ xriftLightmapScope: true }}>`で包み、`XriftSceneLightmap`をSceneに1つ置く。`baked`のLightには`baked`を渡す。ライトマップの2ファイルは`assetCopyPlan`へ入り、`public/`直下へコピーされる。ワールドのコードは通信APIを直接呼べないので、ファイルはthree.jsの`FileLoader`で読む。

## 焼き直しが要るかの判定

`computeLightBakeSignature`が、対象のMeshとその祖先のTransform、割り当てたMaterialの値、ModelのハッシュとScale、有効なLight、Ambient Light、IBL、ベイクの設定を1つのハッシュにまとめる。ベイク時点の値をLightmap Assetに残し、今の値と違えば「Sceneが変わりました」と表示する。対象から外したMeshと、`realtime`へ戻したLightは、焼き直しを待たずに反映する。

## まだ対応していないこと

- Runtime JSONでの公開（ブラウザ版の公開）。Compilerは、ライトマップを使うSceneを`lightmap-unsupported-runtime-output`で止める。対応には`react-three-fiber/index.tsx`と`three/index.ts`への組み込みと、ランタイムシェルの再生成が要る。
- 動く物への光（ライトプローブ）。`baked`のライトは、対象でないMeshとアバターを照らさない。
- チャートの境目をまたぐ色の連続化。なめらかな曲面では、境目に薄い筋が出ることがある。
- 鏡面反射とNormal Mapの方向。ライトマップは拡散光だけを持つ。
- Spot Lightの投影画像（`map`）と、ライトごとの影のやわらかさ。
- Prefabの中のMeshを、インスタンスごとに対象にする操作。Prefabの元のEntityで対象にすると、すべてのインスタンスが対象になる。
- 使われなくなったライトマップのファイルの掃除と、複数枚のライトマップ。

## 検証

- `pnpm cli:test`の「light bake」: BVHと総当たりの一致、UV2の重なりと実寸、テクセルの割り当て、UV2データの往復、焼いた影と跳ね返りの量、環境光の差分、Emissive、閉じた形の内側、適用と復元、Materialの共有と追従、Compilerの出力、Runtime JSONの拒否。
- 同じく「staged world typecheck」: ライトマップを含むワールドの生成コードを、公開テンプレートと同じ設定の`tsc`で検査する。
