# マテリアルカタログ 仕様

Sky シェーダーで確立した「プリセット付きカスタムシェーダーをマテリアルとして配る」形を、Water と Terrain の草へ広げるための仕様。

この文書は実装前の設計であり、**未実装**である。既存部分は実物を確認して書いているが、新規部分は提案である。

## 既存の土台（確認済み）

| 対象 | 場所 | 状態 |
| --- | --- | --- |
| Sky シェーダー | `src/lib/visual-editor/sky-shader.ts` | 実装済み |
| Sky プリセット | `src/lib/visual-editor/sky-shader-catalog.ts` | 9件。昼 / 夕暮れ / 朝焼け / 月夜 / 星空 / オーロラ / 星雲、うち2件はレイマーチのボリュメトリック雲。遠景の稜線は宇宙以外の全presetが持つ |
| Sky プレビュー | `src/components/visual-editor/SkyShaderCatalogPreview.tsx` | 実装済み |
| 外部ストア | `src/components/visual-editor/SkyShaderStore.tsx` | 実装済み |
| Wind コンポーネント | `src/lib/visual-editor/editor-session.ts` | Entity への追加とグローバル設定の両方あり |
| Terrain | `src/lib/visual-editor/terrain.ts` | 高さフィールド + ブラシ + マテリアルスロット。**散布は無い** |

Sky が持つ仕組みで、そのまま使えるもの:

- `resolveSkyShaderMaterial` — Asset から uniform 値を解決する
- `SKY_SHADER_DRIVEN_UNIFORMS` / `skyShaderDrivenUniforms` — 時間などランタイムが供給する uniform の宣言
- `skyShaderTextureUniformNames` — テクスチャ uniform の列挙
- `isSkyShaderMaterialAsset` — Asset 種別の判定

Water も同じ4点を持てば、Inspector・プレビュー・公開の経路を作り直さずに済む。

## 共通方針

### 1. プリセットはコードで持ち、値は Asset で持つ

シェーダー本体（GLSL）はカタログに置き、作者が変えるのは uniform の値だけにする。Sky が既にこの形。理由は3つ。

- プリセットを更新すると既存ワールドにも反映できる
- Asset に GLSL を持たせないので、公開時の審査対象が増えない
- uniform だけなら `runtime.json` に数値として載る（`classic-runtime` 出力で表現できる）

**作者が任意の GLSL を書ける口は、この機構では開けない。** それは既存の Custom Shader 側の責務であり、混ぜると公開経路の前提が変わる。

### 2. 重い設定は既定で軽い側に倒す

カタログから置いた直後が最も見られる状態なので、**既定値は最軽量**にする。品質を上げるのは作者の明示操作にする。各プリセットは `quality` を持ち、`low` / `medium` / `high` で反復回数やレイヤー数を切り替える。

### 3. Wind は共通の入力として扱う

Water の波も草の揺れも同じ風から駆動する。既存の Wind コンポーネントを唯一の入力とし、Water と草がそれぞれ風速を持つことは**しない**。同じシーンで海と草が別方向に揺れるのは破綻して見える。

## Wind 契約

既存 Wind の値を、シェーダーが読める形に正規化して供給する。

```
uWindDirection : vec2   水平方向の単位ベクトル
uWindSpeed     : float  m/s 相当
uWindTurbulence: float  0..1 乱れの強さ
uTime          : float  秒（既存の SKY_SHADER_DRIVEN_UNIFORMS と同じ供給元）
```

- Entity の Wind が無い場合はグローバル設定の値を使う
- どちらも無い場合は `uWindSpeed = 0` とし、波と草は静止する（既定値で勝手に動かさない）
- `uTime` は Sky と同じ供給経路を使う。**別の時間軸を作らない**

多人数で見え方を揃える必要が出た場合は `useServerClock` に切り替えられるよう、時間の供給は1箇所に閉じておく。

## Water マテリアル

### プリセット

| id | 用途 | 想定負荷 |
| --- | --- | --- |
| `calm-lake` | 静かな湖面。反射弱め、波小さめ | 低 |
| `ocean-waves` | 海。うねりと白波 | 中 |
| `stylized-toon` | セルルック。段階的な色と輪郭 | 低 |

### uniform

共通:

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

`ocean-waves` のみ:

```
uFoamAmount    : float  0..1 白波の量
uFoamSharpness : float  白波の輪郭
```

`stylized-toon` のみ:

```
uBandCount     : float  2..8 色の段数
```

星の数と同じ考え方で、**`uWaveLayers` は実際の重ね数**にする。0.0〜1.0 の抽象値ではなく、作者が入力した数だけ波が重なる。値を上げても既存の波の位相が動かないよう、レイヤーごとに固定のシード（Sky の `42.0` / `78.0` / `134.0` と同じやり方）を使う。

### 軽量化

- `uWaveLayers` の既定は `calm-lake` で 2、`ocean-waves` で 3
- 法線は頂点ではなくフラグメントで導出し、メッシュ分割を上げない
- 反射は環境色の近似で済ませ、**実反射（追加のレンダーパス）は入れない**。Mirror と違い水面は広いため、実反射は負荷が読めない
- 画面上の水平線より下だけを描く最適化は入れない。カメラが水中に入る場合に破綻するため

### 適用先

Terrain と同じくマテリアルスロットとして扱い、任意のメッシュに割り当てられるようにする。水面専用のプリミティブは追加しない。板ポリを置いて割り当てる形にすれば、池も海も同じ仕組みで作れる。

## Terrain の草

一番大きい。3つに分けて進める。

### フェーズ1: 散布データ

Scene document に Terrain ごとの散布情報を持たせる。

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

- `mask` は高さフィールドと同じ解像度に揃える。別解像度にすると編集時の対応付けが壊れる
- **スキーマに追加する際は `serialization.ts` の許可キーにも足すこと。** 未知キーは blocking として弾かれ、追加を忘れると保存した時点で Scene が読めなくなる（物理設定の追加時に実際に踏んだ）

### フェーズ2: 描画

- `InstancedMesh` で1レイヤー1ドローコール
- 配置は `mask` と Terrain の高さから**決定的に**生成する。乱数を保存せず、シードと mask から毎回同じ配置を再現する。これで Scene document が肥大しない
- 距離カリング: 既定 40m。それより遠いレイヤーは描かない
- LOD: 近距離は交差板3枚、遠距離は1枚に落とす
- 上限: 1レイヤーあたり 50,000 インスタンス。超える density は上限に丸め、Inspector に丸めた旨を出す（黙って切り捨てない）

### フェーズ3: 揺れ

Wind 契約の uniform を頂点シェーダーで受け、根元を固定して先端ほど大きく振れるようにする。

- 位相はインスタンスのワールド座標から導出する。全部が同じ位相で揺れると板に見える
- `uWindSpeed = 0` のときは完全に静止させる（微小な揺れも入れない。静止画で使う場合に困る）

### 草の種類

| id | 見た目 |
| --- | --- |
| `short-grass` | 短い芝 |
| `tall-grass` | 背の高い草 |
| `wildflower` | 花付き |
| `dry-grass` | 枯れ草 |

種類ごとにテクスチャと既定の高さ・幅を持つ。作者は種類を選び、density と mask をペイントする。

### 公開への反映

`classic-runtime` 出力（`runtime.json`）に散布情報を載せる。**GLSL もインスタンス座標も載せない** — 種類 id、density、mask、シードだけを載せ、ランタイム側で同じ決定的生成を行う。これで公開物のサイズが density に比例しない。

ランタイム側（`packages/xrift-studio-runtime`）に対応する生成コードが必要になる。Studio 側とランタイム側で生成アルゴリズムが一致していないと、Play と公開後で草の位置がずれる。**この一致は fixture で固定すること。**

## 実装順

1. **Wind 契約の正規化** — 既存 Wind から上記4 uniform を作る層。Water と草の両方が依存するので最初
2. **Water マテリアル** — Sky のカタログ構造をなぞる。既存経路に乗るので確実
3. **Terrain の草 フェーズ1〜3** — 順に

## 注意（この設計を実装する人へ）

- **着手前に広く grep すること。** 単一ファイルを見て「機能が無い」と判断しない。この文書を書く過程で、Wind コンポーネントを「存在しない」と誤って報告した。`component-registry.ts` だけを見て、実際の定義がある `editor-session.ts` を見ていなかった
- Scene document のスキーマへ追加するときは `serialization.ts` の許可キーと MCP の `update_scene_settings` を同時に更新する
- 並行して別セッションが `sky-shader-catalog.ts` / `InspectorPanel.tsx` / `SceneSettingsPanel.tsx` を編集していることがある。着手前に `git status` を確認する
