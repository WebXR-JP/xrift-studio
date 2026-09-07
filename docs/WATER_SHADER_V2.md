# Water Shader v2 — 海・水面カタログの拡充

## 変更の概要

既存のWater Shaderを3種類から21種類、8カテゴリへ拡充しました。旧3種類のIDを維持し、新規18種類を追加しています。GLSLは共通コアと演出用の定義に分かれ、16通りの演出構成があります。同じ波に色だけを変えた21個ではありません。

Assetsの「外部から追加 → Water Shader」と、既存MCPの`list_material_presets` / `install_material_preset`から使います。インストール後は従来どおり、GLSLとUniformを保持した独立したMaterial Assetになります。新しいネットワーク取得先や依存パッケージは追加していません。

## 使い方

1. この変更を取り込んだXRift Studioを、元のプロジェクトで使用している依存関係を導入して起動します。
2. Assets → 外部から追加 → Water Shaderで、検索またはカテゴリから選びます。
3. 詳細プレビューを見ながら波・さざ波、反射・透明感、泡、演出、色を調整し、「Materialへ追加」を押します。
4. 作成した水平の水面メッシュにMaterialを割り当てます。追加後の調整はInspectorのUniform valuesを使います。
5. 動かない場合はSceneのWindを確認します。詳細パネルの「試し風」はプレビューだけに効き、Sceneは変更しません。

通常のPlaneでは`uWaveDisplacement`を0のまま使えます。水面の輪郭も動かす場合は、`dev/water-shaders/meshes`または別添シェーダーパックの分割メッシュをインポートして使います。

## プリセット一覧

| 名前 | ID | 主な表現 |
| --- | --- | --- |
| Calm Lake | calm-lake | 細かなさざ波・静かな反射 |
| Ocean Waves | ocean-waves | 交差するうねり・泡の網目・逆光の波頭 |
| Stylized Toon | stylized-toon | 段階的な陰影・波の輪郭線 |
| Deep Ocean Swell | deep-swell | 長いうねり・4層の波・深い青 |
| Trade Wind Sea | trade-wind-sea | 方向性のある波・風下への泡筋 |
| Tropical Lagoon | tropical-lagoon | 青緑の浅瀬・疑似コースティクス・小さな波 |
| Coral Shallows | coral-shallows | 寄せ波・明るい浅瀬・光の網目 |
| Coastal Surf | coastal-surf | 往復する波打ち際・砕ける波・浅瀬の色変化 |
| Rocky Coast Surge | rocky-coast | 交差波・大きな寄せ波・細長い泡 |
| Storm Sea | storm-sea | 荒いうねり・崩れる白波・風の泡筋 |
| Rainy Harbor | rainy-harbor | 雨の円形波紋・静かなうねり・曇天の反射 |
| Golden Tide | golden-tide | 低い光のきらめき・暖色の水平線・長いうねり |
| Moonlit Ocean | moonlit-ocean | 月明かりの反射・暗い波の谷・控えめな白波 |
| Bioluminescent Bay | bioluminescent-bay | 発光する寄せ波・光る微粒子・暗い水面 |
| Anime Summer Sea | anime-ocean | 鮮明な色面・白い波線・浅瀬の光 |
| Watercolor Sea | watercolor-sea | 絵の具のむら・かすれた泡・柔らかな反射 |
| Ink Waves | ink-waves | 墨の等高線・斜線の陰影・紙色の泡 |
| Aurora Tide | aurora-tide | 角度で変わる色・発光する波頭・光る微粒子 |
| Holographic Sea | holographic-sea | 波で歪む格子・流れる光・発光する輪郭 |
| Iridescent Sea | iridescent-sea | 角度依存の虹色・なめらかな反射・交差する波 |
| Glacial Sea | glacial-sea | 流氷風の模様・氷の割れ目・穏やかな水面 |

## 品質面の変更

うねりは最大4層のGerstner波、細かなさざ波は解析勾配を持つノイズで計算します。波の接線から法線と圧縮度を求め、泡は波頭の圧縮、塊、ちぎれた縁、小さな穴を組み合わせています。急峻さの合計には上限を設けています。

空の反射方向、視線の角度による反射、主光源のきらめき、波頭の疑似散乱を調整できます。遠い細部の模様と鋭い反射は、画面上の微分を使って弱めます。画面屈折・反射カメラ・テクスチャの追加読み込みはありません。

演出によって寄せ波、風に流れる泡筋、集光模様、雨の円形波紋、発光、セルルック、水彩のむら、インクの線、偏光色、発光格子、流氷風の模様を切り替えます。セルルックやインクで結果に反映されない物理寄りの操作項目は表示しません。

Windの速度、`uWaveSpeed`のどちらかが0なら、水面の波・泡・雨の波紋・夜光の動きが止まります。これは既存の共有Wind契約を維持するための動作です。

## 表現上の制約

反射は指定した天頂色・水平線色と水専用の雲模様の近似です。Scene内の建物やアバターを鏡のように映す機能ではなく、Skyboxの画像・雲とも自動同期しません。夕景・月明かりのサンプル照明は、そのままSceneへ追加されません。実際の主光源と環境光はSceneの設定から供給されます。

寄せ波は`uShoreAngle`、`uShoreOffset`、`uShoreWidth`で指定する直線の岸です。地形や岩への接触検出、地形に沿った泡、波の衝突シミュレーションはありません。水深による吸収、画面屈折、水底へのコースティクス投影、影の受け取り、浮力・衝突、水中用ポストエフェクトも追加していません。流氷は水面上の模様であり、歩ける氷のメッシュではありません。

不透明度は基本の透過率です。浅い視線の反射や泡の部分は不透明に近づきますが、0なら完全に非表示になります。透過メッシュを重ねたときの描画順は既存ランタイムの制約を受けます。

## 水面メッシュ

| ファイル | 大きさ | 頂点 | 三角形 | 用途 |
| --- | --- | ---: | ---: | --- |
| ocean-grid-64m-64.glb | 64m × 64m | 4,225 | 8,192 | 控えめなうねり、3層程度から調整 |
| ocean-grid-64m-128.glb | 64m × 64m | 16,641 | 32,768 | 頂点変位を使う標準的な試作 |

どちらもXZ平面、上向き法線、原点中心、テクスチャなしです。最初は`uWaveDisplacement=0.3`程度から上げてください。メッシュを大きく拡大したり、波を極端に細かくしたりすると頂点が足りなくなります。その場合は分割数を増やすか、頂点変位・波の重ね数を下げてください。GLSLは頂点を動かすだけで、CPU側のバウンディングボックスや物理形状を更新しません。大きな変位の端でカリングが起きないかも確認してください。

## 負荷とプレビュー

品質は`uDetailQuality`の0（軽量）、1（標準）、2（高精細）です。細かいノイズの層数を切り替え、0では雲模様と雨の波紋を省きます。その他の演出がすべて省略される設定ではありません。「負荷目安」は実装上の相対的な目安で、FPSやQuest性能の測定値ではありません。

一覧カードは共有WebGLRendererで順番に描いた静止画です。可視領域付近だけ描き、最大64件をキャッシュします。詳細だけがR3F Canvasで動きます。追加されるプレビュー用コンテキストは共有サムネイル1個と詳細1個で、21個のCanvasを同時に動かしません。閉じた後は共有レンダラーを破棄します。非表示タブ・表示範囲外・一時停止・動きを減らす設定では詳細アニメーションを停止します。

検索で選択中の項目が隠れた場合、該当結果の先頭を選択します。該当結果0件なら説明を表示します。追加中は再追加とプリセット切り替えを抑止し、成功・失敗をパネルに表示します。プレビューが描けない場合にも失敗を明示し、CSSの偽プレビューには置き換えません。

## 保存済みMaterialと並行改修

既存MaterialのGLSLは保存データに埋め込まれているため、ソースを更新するだけでは自動変更されません。同じプリセットをカタログから追加し直すと、従来のIDのMaterialが現在のパラメータで更新されます。以前の見た目を保持したい場合は先にプロジェクトを保存し、別名バックアップを残してください。

この成果物は共有された`xrift-studio-main(1).zip`を基準にした海用の改修です。別作業のSkyboxや3Dモデル改修を取り込んだものではありません。それらと組み合わせる場合は、プロジェクト丸ごとの上書きではなく差分パッチを確認して適用してください。

## 取り込み時の検証（2026-09-07）

最新mainへ海関連の差分だけを統合しました。`pnpm typecheck`、`pnpm e2e:typecheck`、カタログ検査（21種類・532パラメータ）、`e2e/water-shaders.spec.ts`の2テストを通過しています。Three.jsの共通プレビュー描画で全21種類を品質3段階の計63通り確認し、高精細では頂点変位も有効にしました。既存のMaterial追加・生成WorldへのGLSLとWindの出力に関するfixtureも通過しています。

ブラウザの分離テストでは実際のWaterShaderStoreとR3F詳細表示を使い、検索・検索0件・追加中の操作抑止・失敗・再試行・成功表示を確認しました。追加処理の応答はテスト用です。Tauriでのファイル保存・再読込、公開先、VR実機の検証を代替するものではありません。カタログ検査は現行TypeScriptに合わせ、旧コンパイラーAPIからViteの変換へ変更しました。

## 提供元の検証結果と未検証範囲

以下はZIPに記録されていた提供元の検証結果です。483ケースの参照描画は取り込み時には再実行していません。

カタログチェック：21プリセット、8カテゴリ、16演出構成、532パラメータ登録を確認しました。ID重複、数値範囲、非有限値・不正色・未知キーの除外、元データの非破壊、既存IDの維持、通常Planeでの安全な既定値を確認しています。

GLSL参照描画：Mesa llvmpipe / OpenGL ES 3.2で483ケースを描画しました。全プリセットについて品質0/1/2、頂点変位0/1、霧なし/ありを組み合わせ、風0・波速0の停止、不透明度0の非表示、時間経過での変化、数値範囲端、上面/下面を確認しています。霧の有無を含め32プログラムをコンパイル・リンクしました。掲載画像はこの参照描画であり、XRift Studioの実画面ではありません。

TypeScript/TSXの変更7ファイルは利用可能なTypeScript 5.8.3で構文変換を通過しています。プロジェクト指定の依存関係・TypeScriptを使った意味的な型チェックの代わりにはなりません。

依存パッケージ取得先のDNS接続ができず、React/Threeなどを導入できなかったため、フル型チェックは依存関係不足で失敗しました。この環境のChromiumはWebGLコンテキストも作成できませんでした。**Three.js/R3F統合、XRift Studio起動、Tauri、公開ワールド、Quest/WebXR実機、FPS、追加・保存・再読込の一連の操作は未検証です。**通常の環境で以下を実行し、公開前に確認してください。

```sh
# 元プロジェクトのパッケージ管理・レジストリ設定を使用
pnpm install --frozen-lockfile
pnpm typecheck
pnpm exec playwright test e2e/water-shaders.spec.ts
pnpm dev

# スタンドアロンのカタログ検査とブラウザ確認用パックの生成
node scripts/check-water-shader-catalog.cjs --export ./water-shader-pack
python dev/water-shaders/generate_grids.py ./water-shader-pack/meshes
```

`water-shader-pack/preview.html`はインターネット接続なしで開けるWebGL2の確認ページです。Three.jsの標準入力と一部チャンクを最小のアダプターで置き換えているため、Studio統合テストではありません。

任意のLinux参照描画ではEGL/Mesa、Python、NumPy、Pillowを使います。これらはアプリ本体の依存関係には追加していません。

```sh
python dev/water-shaders/gles_reference.py ./water-shader-pack/catalog.json --preset 1 --output water-reference.png
```

## ファイル構成とライセンス

`water-shader-core.ts`が共通GLSL、`water-shader-catalog.ts`が登録・既定値・操作項目、`water-preview-renderer.ts`が共有プレビュー描画です。`WaterShaderStore.tsx`が一覧と調整UI、`WaterShaderCatalogPreview.tsx`が静止画と詳細表示です。MCPにはカテゴリ・特徴・負荷目安・注意書きを追加しています。

Gerstner波の基礎部分に対するMochiesCodeの表示は保持しています。移植元は既存の`THIRD_PARTY_ASSETS.md`に記載されています。詳細は`dev/water-shaders/LICENSE.water-shaders.txt`を参照してください。
