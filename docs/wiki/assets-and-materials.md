# アセットと表現（Texture / Material / Particle）

ビジュアルエディターでは、Texture、Material、Particle、Prefab などの Asset を作成・管理し、Scene の見た目や表現を整えます。

## Texture（テクスチャ）

Texture は、モデルやマテリアルに貼り付ける画像です。

### 対応している形式

PNG、JPG、WebP、KTX2 に対応しています。

### 取り込む

Assets パネルで画像ファイルをドラッグ＆ドロップするか、インポートメニューから選択します。

### 設定する

Texture Asset を選択して Inspector で次の設定を編集します。

- **色空間**: auto、sRGB、linear
- **ミップマップ**: 生成するかどうか
- **フリップ Y**: 上下反転
- **リサイズ**: 解像度の調整
- **サンプラー**: フィルタ、ラップ（repeat、clamp-to-edge、mirrored-repeat）
- **圧縮**: WebP、KTX2 など

## Font（フォント）

Text コンポーネントの書体です。Studio には標準の書体が同梱されていて、書体を選ばなくても日本語と欧文を表示できます。

### 対応している形式

TTF、OTF、WOFF に対応しています。WOFF2 は表示に使えないため取り込めません。Google Fonts などから配布されている TTF を使う場合は、TTF のまま取り込んでください。

### 取り込む

Assets パネルにフォントファイルをドラッグ＆ドロップします。取り込んだフォントは、Text の Inspector にある書体の選択欄の「プロジェクトのフォント」に並びます。

### 公開したとき

選んだフォントのファイルはワールドへ同梱されます。公開したワールドは外部からフォントを取得しないため、配布元が変わっても表示は変わりません。

## Material（マテリアル）

Material は、モデルの表面の見た目を定義します。PBR（物理ベースレンダリング）マテリアルを作成・編集できます。

### 作成する

Assets パネルで **Material** を作成します。

### 設定する

Material Asset を選択して Inspector で次の設定を編集します。

- **ベースカラー**: 色とテクスチャ
- **メタリック / ラフネス**: 金属感と粗さ
- **ノーマル**: 法線マップ
- **オクルージョン**: 遮蔽マップ
- **エミッシブ**: 発光色とテクスチャ
- **アルファ**: 透過モード（OPAQUE、MASK、BLEND）
- **両面描画**: double-sided

### マテリアルを割り当てる

Material Asset を、Scene 内の Entity のメッシュスロットへ割り当てます。Inspector の Mesh Renderer からマテリアルを設定できます。

## Particle（パーティクル）

Particle は、煙、火、火花、魔法、雪などのエフェクトを表現します。

### 作成する

Assets パネルで **Particle** を作成します。

### 設定する

Particle Asset を選択して Inspector で次の設定を編集します。

- **シミュレーション**: シミュレーション設定
- **エミッション**: 放出量とタイミング
- **シェイプ**: 放出形状
- **ライフタイム**: パーティクルの寿命
- **ベロシティ**: 速度
- **カラー**: 色の変化
- **サイズ**: 大きさの変化
- **レンダラー**: 描画設定

### 配置する

Particle Asset を Scene View へドラッグして配置します。Entity に Particle Emitter として追加されます。

## Prefab（プレハブ）

Prefab は、Entity とその子階層を再利用可能な Asset にしたものです。

### 作成する

Scene 内の Entity を選択し、**Prefab として作成** します。

### 配置する

Prefab Asset を Scene View へドラッグして配置します。同じ構造を何度も配置できます。

## 次のステップ

- [地形と衝突判定](./terrain-and-colliders.md)
- [Entity に振る舞いを与える（Scripting）](./scripting.md)
