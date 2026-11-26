# Vehicle / Seat のモデル

`parts.json` には、Blender モデルの再生成に使う寸法・色・配置データを保存しています。Studio では `public/visual-editor/world-assets/vehicle.glb`、`seat.glb`、`wheel.glb` を読み込みます。

Blender MCP の `execute_blender_code` で、`XRIFT_REPO` にリポジトリの絶対パスを設定してください。その状態で `scripts/generate-world-asset-models.py` を実行すると、GLB と取り込み用のハッシュ情報を生成できます。スクリプトは既存のオブジェクトを削除せず、作成したコレクション内のオブジェクトだけを書き出します。

出力は glTF 標準の Y-up、単位はメートルで、Seat の原点は着席位置に合わせています。車体は屋根や支柱のないオープンカーで、通常の glTF PBR の Base Color のみを使い、頂点カラーは含みません。マテリアル数は車体が 3、座席が 1、タイヤが 2 です。4 輪は同じ GLB を共有しており、スポークによって回転が視認できます。

Studio は追加時に通常のモデル取り込み処理で GLB をプロジェクトにコピーし、Hierarchy の Mesh から Model Asset を参照します。操縦や着席は Script で処理しており、モデル本体や Base64 URL は Script に含めません。地面追従の車輪位置は標準車体の寸法に対応しています。

「アセットストア → ギミック → カスタム車」から配置できます。タイヤ 4 個と排気煙も通常の子 Entity です。各参加者の環境では同期された車の移動量からタイヤの回転と煙の放出を計算し、停止中は回転と放出を止めます。パーティクルそのものの座標はネットワーク送信しません。
