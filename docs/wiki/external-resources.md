# 外部リソースから追加する

Assets パネルの **外部から追加** を押すと、素材のカタログが開きます。ダウンロードから取り込みまでアプリの中で完結するので、ブラウザでファイルを探して保存し直す必要はありません。

## カタログの種類

| カタログ | 提供 | 内容 |
| --- | --- | --- |
| **Poly Haven** | CC0 | HDRI、マテリアル、モデルを検索して追加 |
| **ambientCG** | CC0 | HDRI とマテリアルを追加、モデルは検索のみ |
| **Open Brush** | 公式 | 公式ブラシ Material |
| **空 Shader** | 公式 | 画像ではなく GLSL で空を描く Material |
| **Water Shader** | 公式 | 湖・海・セルルックの水面 Material |
| **Terrain** | 公式 | 形と草が入った地形 |
| **光る照明** | 公式 | Bloom で光る照明 |
| **XRift 公式 Component** | 公式 | Portal、Mirror、Spawn Point など |

公式カタログのカードは、静止画のサムネイルではなく **実際の GLSL や高さフィールドを WebGL で描画** しています。カードで見えているものが、そのままシーンに入ります。

## HDRI とマテリアルを追加する（Poly Haven / ambientCG）

1. **外部から追加** を押し、左の一覧から **Poly Haven** または **ambientCG** を選びます。
2. 名前、カテゴリ、タグで検索します。
3. 右側で **解像度** と **ファイル形式** を選びます。ダウンロード容量の目安が表示されます。
4. HDRI の場合、**インストール後に Skybox へ設定** を有効にしておくと、追加と同時にシーンの空になります。

HDRI は環境 Texture Asset として保存されます。あとから Scene View へドラッグして差し替えることもできます。

## 公式カタログから追加する

空 Shader、Water Shader、Terrain、光る照明は、カタログから選んで追加ボタンを押すだけです。追加されたものは通常の Asset や Entity になるので、そのあとは Inspector で自由に編集できます。

- 空 Shader と Water Shader は **Material Asset** として残ります。詳しくは [空と水をつくる](./sky-and-water.md) を参照してください。
- Terrain は **Terrain Entity** が 1 つ増えます。詳しくは [地形と衝突判定](./terrain-and-colliders.md) を参照してください。

## ライセンス表記

Poly Haven と ambientCG の素材は CC0 です。Open Brush など MIT の素材は、作者とライセンスの情報が Asset 自体に保存され、公開したワールドにも一緒に出力されます。カタログの詳細パネルから配布ページとライセンスを開けます。

## 次のステップ

- [空と水をつくる](./sky-and-water.md)
- [地形と衝突判定](./terrain-and-colliders.md)
- [アセットと表現（Texture / Material / Particle）](./assets-and-materials.md)
