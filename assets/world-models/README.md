# Vehicle / Seat のモデル

`parts.json` は Blender モデルを再生成するための寸法・色・配置データです。
実際に読み込むモデルは `public/visual-editor/world-assets/vehicle.glb` 、`seat.glb`、`wheel.glb` です。

Blender MCP の `execute_blender_code` から `XRIFT_REPO` をリポジトリの絶対パスに設定し、
`scripts/generate-world-asset-models.py` を実行すると、GLB と取り込み用のハッシュ情報を生成します。
既存オブジェクトを削除せず、作成したコレクションのオブジェクトだけをエクスポートします。
出力は glTF の Y-up、単位はメートルです。Seat の原点は着席位置です。
車体は屋根・支柱を持たないオープンカーです。通常の glTF PBR Base Color を使い、頂点カラーは含みません。車体は3マテリアル、座席は1マテリアル、タイヤは2マテリアルです。4輪は同じGLBを共有し、スポークで回転を見分けられます。

Studio は追加時に通常の Model import を使って GLB をプロジェクトへコピーします。
Hierarchy の Mesh が Model Asset を参照します。Script は操縦・着席を担当し、モデル本体や Base64 URL を含みません。
地面追従の車輪位置は標準車体の寸法に対応しています。

「外部から追加 → ギミック → カスタム車」で配置します。タイヤ4個と排気煙も通常の子Entityです。各参加者は同期済みの車の移動量からタイヤの回転と煙の放出を計算します。停止中は回転・放出を止めます。粒子そのものの座標はネットワーク送信しません。
