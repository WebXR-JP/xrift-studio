# モデルの取り込み設定

初回の取り込みではImportメニューのTexture設定を使います。モデルごとに変える場合は、InspectorのImport Recipeで「Textureの最大解像度」を選び、再インポートします。「Import設定に従う」「原寸のまま」、256〜8192pxから選べます。内蔵画像の縦横比と原本を保持し、個別に保護したTexture設定は上書きしません。

Mesh最適化とDraco圧縮の選択はAssetに保存され、再インポートにも適用されます。Inspectorの最適化と公開前のDraco圧縮は共通の変換処理を使います。公開前にDraco圧縮を選んだ場合は、Dracoを有効にし、Mesh最適化はモデルに保存した選択を使います。原本は残るので、圧縮のチェックを外して再インポートすると原本から読み直せます。原本自体がDraco圧縮済みの場合は、その圧縮は残ります。

「配置時にMesh Colliderを追加」を外して再インポートすると、そのモデルを参照するSceneとPrefabのMesh Colliderを取り除きます。手動で付けたMesh Colliderも対象です。Box Colliderなど他の形状、他のモデル、編集済みの階層やTransformは保持します。再インポートが失敗した場合は、現在のAssetとColliderを保持します。

MCPでは`update_model_asset`の`patch.importSettings`に`compressWithDraco`と`textureMaxSize`を指定できます。`textureMaxSize`は`"default"`、`"original"`、または256、512、1024、2048、4096、8192です。設定を保存した後、`reimport_model_asset`で適用します。

Dracoはモデルの転送サイズを小さくします。描画時のテクスチャメモリを減らすには、Textureの解像度縮小とKTX2圧縮を使います。
