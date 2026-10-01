# Vehicle / Seat のモデル

`parts.json`には、Blenderモデルの再生成に使う寸法・色・配置データを保存しています。
Studioでは`public/visual-editor/world-assets/vehicle.glb`、`seat.glb`、`wheel.glb`を読み込みます。

Blender MCPの`execute_blender_code`で、`XRIFT_REPO`をリポジトリの絶対パスに設定してください。
`scripts/generate-world-asset-models.py`を実行すると、GLBと取り込み用のハッシュ情報を生成できます。
スクリプトは既存オブジェクトを削除せず、作成したコレクションのオブジェクトだけを書き出します。
出力はglTFのY-upで、単位はメートルです。Seatの原点は着席位置に合わせています。
車体は屋根・支柱を持たないオープンカーです。通常のglTF PBR Base Colorを使い、頂点カラーは含みません。車体は3マテリアル、座席は1マテリアル、タイヤは2マテリアルです。4輪は同じGLBを共有し、スポークで回転を見分けられます。

Studioは追加時に通常のModel importを使ってGLBをプロジェクトへコピーし、HierarchyのMeshからModel Assetを参照します。
Scriptで操縦・着席を処理し、モデル本体やBase64 URLはScriptに含めません。
地面追従の車輪位置は標準車体の寸法に対応しています。

「外部から追加 → ギミック → カスタム車」で配置します。タイヤ4個と排気煙も通常の子Entityです。各参加者は同期済みの車の移動量からタイヤの回転と煙の放出を計算します。停止中は回転・放出を止めます。粒子そのものの座標はネットワーク送信しません。
