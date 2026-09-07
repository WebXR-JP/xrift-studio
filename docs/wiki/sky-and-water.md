# 空と水をつくる

空と水は、画像を貼るのではなく GLSL で描く Material です。どちらも [外部リソース](./external-resources.md) の公式カタログから追加し、あとから Inspector の Uniform values で調整します。

## Skybox Shader

### 追加する

1. Assets パネルの **外部から追加** を押します。
2. 左の一覧から **Skybox Shader** を選びます。
3. プリセットを選び、**「〇〇を空へ設定」** を押します。

**追加後に Scene の空へ設定** を有効にしたまま追加すると、Scene 設定の Skybox に割り当てられます。Skybox Shader は Skybox 画像より優先して背景を描きます。チェックを外すと Material だけが追加されます。

### プリセット

| カテゴリ | プリセット |
| --- | --- |
| 昼 | Volumetric Daylight、Daylight Clear |
| 夕暮れ | Volumetric Sunset、Golden Sunset |
| 朝焼け | Morning Glow |
| 夜空 | Moonlit Night、Starfield Night |
| オーロラ | Aurora Night |
| 宇宙 | Nebula Space |

### 調整する

Material を選ぶと、Inspector の **Uniform values** で数値と色を変更できます。プリセットによって項目は変わりますが、たとえば Volumetric Sunset では次のようなものを調整できます。

- **雲**: 量、濃さ、細かさ、雲底と雲頂の高さ、流れる速さ
- **太陽**: 高さ（度）、方角（度）、大きさ、まわりの光の広がり
- **遠景**: 尾根の高さ、起伏、かすみ、手前と奥の尾根の色
- **色**: 天頂の色、地平線の色、日なた／日かげの雲の色

**既定値へ戻す** でプリセットの値に戻せます。同じプリセットをカタログからもう一度追加した場合も、Material がプリセットの値で上書きされます。

> **注意**: Skybox Shader は Scene View には描画されません。編集中の Scene View では背景が単色のままなので、空の見え方は **Play** で確認してください。

## Water Shader

### 追加する

1. **外部から追加** から **Water Shader** を選びます。
2. プリセットを選び、**「〇〇を Material へ追加」** を押します。

追加されるのは Material です。水面にしたい Mesh（多くの場合は Plane）を作り、その Material スロットへ割り当てて使います。

### プリセット

海・水面を21種類から選べます。名前だけでなく、日本語の説明や特徴でも検索できます。

| カテゴリ | プリセット |
| --- | --- |
| 外洋・うねり | Ocean Waves、Deep Ocean Swell、Trade Wind Sea |
| 海岸・磯 | Coastal Surf、Rocky Coast Surge |
| 南国・浅瀬 | Tropical Lagoon、Coral Shallows |
| 荒天・雨 | Storm Sea、Rainy Harbor |
| 夕景・夜の海 | Golden Tide、Moonlit Ocean、Bioluminescent Bay |
| アニメ・絵画 | Stylized Toon、Anime Summer Sea、Watercolor Sea、Ink Waves |
| 幻想・SF | Aurora Tide、Holographic Sea、Iridescent Sea、Glacial Sea |
| 湖・内海 | Calm Lake |

### 調整する

追加する前は、詳細プレビューの下にある「波・さざ波」「反射・透明感」「泡」「演出」「色」で調整します。追加した後も Inspector の **Uniform values** で変更できます。

一覧は実際のGLSLを描いた静止画で、選択中の詳細だけが動きます。「試し風」はプレビュー専用です。Scene設定や追加するMaterialの風設定は変更しません。

通常のPlaneでは「頂点変位」を0にします。波の輪郭も上下させる場合は、十分に分割した水平メッシュを使って頂点変位を上げます。

> **表現の範囲**: 岸の泡は「岸の位置・方角・幅」による直線の演出です。地形や岩との接触を自動検出しません。反射は設定した空色の近似、集光模様は水面上の演出です。物体の鏡映、実際の水深、背景の屈折、水底への集光は扱いません。

同じプリセットを追加し直すと、同じMaterialが現在の設定で更新されます。既存の調整を残す場合は、更新する前にプロジェクトを保存・バックアップしてください。詳細は [Water Shader v2の仕様と検証範囲](../WATER_SHADER_V2.md) にまとめています。

### 風は Scene 設定から来る

水面の波の向きと速さは、Material 側ではなく **Scene 設定の Wind** から受け取ります。草と同じ風で動くため、水だけ別方向に流れることがありません。プリセットの **波の速さ** は、その風に対する倍率です。0 にすると水面が止まります。

## 次のステップ

- [地形と衝突判定](./terrain-and-colliders.md)
- [Play で動作を確認する](./play-mode.md)
- [外部リソースから追加する](./external-resources.md)
