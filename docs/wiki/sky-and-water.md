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

| プリセット | 用途 |
| --- | --- |
| **Calm Lake** | 静かな湖面。波は小さく反射は控えめ |
| **Ocean Waves** | 海。うねりが大きい |
| **Stylized Toon** | セルルックの水 |

### 調整する

Inspector の Uniform values で、波と見た目を調整できます。

- **波**: 速さ、重ね数、高さ、細かさ
- **さざ波**: タイリング、強さ
- **反射**: 強さ、縁の反射、太陽のきらめき
- **不透明度**

### 風は Scene 設定から来る

水面の波の向きと速さは、Material 側ではなく **Scene 設定の Wind** から受け取ります。草と同じ風で動くため、水だけ別方向に流れることがありません。プリセットの **波の速さ** は、その風に対する倍率です。0 にすると水面が止まります。

## 次のステップ

- [地形と衝突判定](./terrain-and-colliders.md)
- [Play で動作を確認する](./play-mode.md)
- [外部リソースから追加する](./external-resources.md)
