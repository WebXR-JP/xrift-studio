# マテリアルカタログ仕様

Skyシェーダーと同じ方法で、プリセット付きのカスタムシェーダーを水面と地形の草にも使うための仕様を示す。

この文書は実装前の設計を記録したもの。既存部分は実物を確認して記載し、新規部分は未実装の提案として区別している。

## 既存の土台（確認済み）

| 対象 | 場所 | 状態 |
| --- | --- | --- |
| Skyシェーダー | `src/lib/visual-editor/sky-shader.ts` | 実装済み |
| Skyプリセット | `src/lib/visual-editor/sky-shader-catalog.ts` | 33件・11カテゴリ。自然・天候・宇宙・幻想・抽象・水中を含む。軽量・標準・高精細のdefinesをマテリアルに保持する。詳細は[空の背景シェーダー](./SKY_SHADERS.md) |
| Skyプレビュー | `src/components/visual-editor/SkyShaderCatalogPreview.tsx` | 実装済み |
| 外部ストア | `src/components/visual-editor/SkyShaderStore.tsx` | 実装済み |
| 風コンポーネント | `src/lib/visual-editor/editor-session.ts` | オブジェクトへの追加とグローバル設定の両方あり |
| 地形 | `src/lib/visual-editor/terrain.ts` | 高さフィールド + ブラシ + マテリアルスロット。散布は無い |

Skyが持つ仕組みのうち、そのまま使えるものは次のとおりである。

- `resolveSkyShaderMaterial` — 素材からuniform値を解決する
- `SKY_SHADER_DRIVEN_UNIFORMS` / `skyShaderDrivenUniforms` — 時間などランタイムが供給するuniformの宣言
- `skyShaderTextureUniformNames` — テクスチャuniformの列挙
- `isSkyShaderMaterialAsset` — 素材種別の判定

水面も同じ4点を持てば、設定・プレビュー・公開の経路を作り直さずに済む。

## 共通方針

### 1. プリセットはコードで持ち、値は素材で持つ

シェーダー本体のGLSLはカタログに置き、作者はuniformの値を変更する。Skyもこの形式を使っている。プリセットの更新を既存ワールドへ反映でき、素材にGLSLを保存しないため公開時の審査対象も増えない。uniformだけなら、`classic-runtime`出力の`runtime.json`に数値として保存できる。

任意のGLSLを書く場合は、既存のカスタムシェーダーを使う。この機構ではGLSLの編集機能を追加しない。公開経路の前提が異なるため、両方の操作を混在させない。

### 2. 重い設定は既定で軽い側に倒す

カタログから配置した直後の負荷を抑えるため、既定値は最軽量にする。品質は作者が操作して上げる。各プリセットに`quality`を持たせ、`low` / `medium` / `high`で反復回数やレイヤー数を切り替える。

### 3. 風は共通の入力として扱う

水面の波と草の揺れには、既存の風コンポーネントを共通の入力として使う。水面と草に個別の風速は持たせず、同じシーンで風の向きが揃うようにする。

## 風契約

既存風の値を、シェーダーが読める形に正規化して供給する。

```
uWindDirection : vec2   水平方向の単位ベクトル
uWindSpeed     : float  m/s 相当
uWindTurbulence: float  0..1 乱れの強さ
uTime          : float  秒（既存の SKY_SHADER_DRIVEN_UNIFORMS と同じ供給元）
```

- オブジェクトの風が無い場合はグローバル設定の値を使う
- どちらも無い場合は`uWindSpeed = 0`とする。波と草は静止する（既定値で勝手に動かさない）
- `uTime`はSkyと同じ供給経路を使う。別の時間軸を作らない

多人数で見え方を揃える必要が出た場合は、`useServerClock`に切り替えられるよう、時間の供給は1箇所にまとめておく。

## 水面マテリアル

### プリセット

| id | 用途 | 想定負荷 |
| --- | --- | --- |
| `calm-lake` | 静かな湖面。反射弱め、波小さめ | 低 |
| `ocean-waves` | 海。うねりと白波 | 中 |
| `stylized-toon` | セルルック。段階的な色と輪郭 | 低 |

### uniform

共通。

```
uShallowColor  : vec3   浅い部分の色
uDeepColor     : vec3   深い部分の色
uOpacity       : float  0..1
uWaveHeight    : float  波の高さ
uWaveScale     : float  波の細かさ
uWaveLayers    : float  1..4  重ねる波の数（負荷に直結）
uFresnelPower  : float  縁の反射の強さ
uReflectivity  : float  0..1
```

`ocean-waves`のみ。

```
uFoamAmount    : float  0..1 白波の量
uFoamSharpness : float  白波の輪郭
```

`stylized-toon`のみ。

```
uBandCount     : float  2..8 色の段数
```

星の数の設定と同じく、`uWaveLayers`には実際に重ねる波の数を指定する。0.0〜1.0の割合にはしない。数を増やしても既存の波の位相が変わらないよう、レイヤーごとに固定のシードを使う。Skyの`42.0` / `78.0` / `134.0`と同じ方式である。

### 軽量化

- `uWaveLayers`の既定は`calm-lake`で2とする。`ocean-waves`で3とする
- 法線は頂点ではなくフラグメントで導出する。メッシュ分割を上げないためである
- 反射は環境色の近似で済ませる。実反射（追加のレンダーパス）は入れない。鏡と違い水面は広いため、実反射は負荷が読めない
- 画面上の水平線より下だけを描く最適化は入れない。カメラが水中に入る場合に破綻するためである

### 適用先

地形と同じくマテリアルスロットとして扱う。任意のメッシュに割り当てられるようにする。水面専用のプリミティブは追加しない。板ポリを置いて割り当てる形にすれば、池も海も同じ仕組みで作れる。

## 地形の草

一番分量が多い作業である。3つに分けて進める。

### フェーズ1: 散布データ

シーンdocumentに地形ごとの散布情報を持たせる。

```
grassLayers: [
  {
    id: string
    typeId: string      草の種類（カタログの id）
    density: number     1平方メートルあたりの本数
    mask: number[]      Terrain 解像度に合わせた 0..1 の配列
    heightRange: [min, max]
    slopeLimit: number  この傾斜より急な面には生えない
  }
]
```

- `mask`は高さフィールドと同じ解像度に揃える。解像度が異なると、編集時に各サンプルを対応付けられない
- スキーマに追加する際は`serialization.ts`の許可キーにも足すこと。未知キーはblockingとして弾かれる。追加を忘れると、保存した時点でシーンが読めなくなる（物理設定の追加時に実際に起きた）

### フェーズ2: 描画

- `InstancedMesh`で1レイヤー1ドローコールにする
- 配置は`mask`と地形の高さから決定的に生成する。乱数は保存しない。シードとmaskから毎回同じ配置を再現する。この方式であればシーンdocumentが肥大しない
- 距離カリング: 既定40mである。それより遠いレイヤーは描かない
- LOD: 近距離は交差板3枚にする。遠距離は1枚に落とす
- 上限: 1レイヤーあたり50,000インスタンスである。超えるdensityは上限に丸める。設定に丸めた旨を出す（黙って切り捨てない）

### フェーズ3: 揺れ

風契約のuniformを頂点シェーダーで受ける。根元を固定し、先端ほど大きく振れるようにする。

- 位相はインスタンスのワールド座標から導出する。全部が同じ位相で揺れると板に見えるためである
- `uWindSpeed = 0`のときは完全に静止させる。微小な揺れも入れない。静止画で使う場合に困るためである

### 草の種類

| id | 見た目 |
| --- | --- |
| `short-grass` | 短い芝 |
| `tall-grass` | 背の高い草 |
| `wildflower` | 花付き |
| `dry-grass` | 枯れ草 |

種類ごとにテクスチャと既定の高さ・幅を持つ。作者は種類を選ぶ。densityとmaskをペイントする。

### 公開への反映

`classic-runtime`出力の`runtime.json`には、種類id、density、mask、シードを散布情報として保存する。GLSLとインスタンス座標は含めない。ランタイム側で同じ配置を再生成するため、公開物のサイズはdensityに比例しない。

ランタイム側（`packages/xrift-studio-runtime`）に対応する生成コードが必要になる。Studio側とランタイム側で生成アルゴリズムが一致していないと、動作確認と公開後で草の位置がずれる。この一致はfixtureで固定すること。

## 実装順

1. 風契約を正規化し、既存の風から上記4 uniformを生成する。水面と草の両方が使うため、最初に実装する。
2. Skyのカタログ構造を使って、水面マテリアルを実装する。
3. 地形の草をフェーズ1〜3の順で実装する。

## 注意（この設計を実装する人へ）

- 単一ファイルだけを見て「機能が無い」と判断しない。着手前に広くgrepする。この文書を書く過程で、風コンポーネントを「存在しない」と誤って報告した。`component-registry.ts`だけを見て、実際の定義がある`editor-session.ts`を見ていなかったためである
- シーンdocumentのスキーマへ追加するときは、`serialization.ts`の許可キーとMCPの`update_scene_settings`を同時に更新する
- 並行して別セッションが`sky-shader-catalog.ts` / `InspectorPanel.tsx` / `SceneSettingsPanel.tsx`を編集していることがある。着手前に`git status`を確認する
