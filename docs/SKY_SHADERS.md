# Skybox Shader Library v3

## カタログと選び方

全33プリセット、11カテゴリ。従来の9プリセットのIDを維持し、24プリセットを追加しています。テクスチャ、リモート画像、追加モデルは不要です。各プリセットは色違いだけではなく、複数のGLSL表現方式とそのパラメーター設定を組み合わせています。フォトグラメトリや観測に基づく物理大気モデルではなく、ワールド用に調整した表現です。

| カテゴリ | プリセットID | 内容 |
|---|---|---|
| 昼 | alpine-cumulus | 雲の厚み、内側の陰影、光る縁を描く積雲 |
| 昼 | high-cirrus | 二層の風に流される巻雲 |
| 昼 | coastal-haze | 海辺の霞と淡い地平線。水面は描かない |
| 夕方 | amber-cloud-sea | 頭上の積雲と眼下の雲海 |
| 朝 | lavender-blue-hour | 青紫と桃色の薄明の巻雲 |
| 天候 | storm-front | 暗い雲底と遠くの雨筋。落雷・激しい点滅なし |
| 天候 | overcast-silver | 銀灰色の空を覆う厚い雲 |
| 天候 | desert-dust | 砂塵と乾燥した地平線 |
| 夜 | lunar-halo | 月の満ち欠け・表面の濃淡・月暈 |
| 夜 | milky-way-core | 天の川の明るい帯と暗黒帯 |
| オーロラ | polar-curtains | 縦筋を持つ緑と紫の光の幕 |
| オーロラ | aurora-corona | 頭上へ集まる放射状の光冠 |
| 宇宙 | ringed-planet | 縞模様の惑星・環・遮蔽・環に落ちる惑星の影 |
| 宇宙 | red-giant | 対流風の表面模様を持つ恒星 |
| 宇宙 | cosmic-dust | 星雲の細かな構造と暗い塵 |
| 宇宙 | eclipse-corona | 遮蔽された太陽と光冠 |
| 幻想 | astral-ribbons | 全天を横断する発光リボン |
| 幻想 | celestial-gate | 重なった光の円環と刻み |
| 幻想 | crystal-vault | Voronoi分割を使った結晶風の天蓋 |
| スタイル | painted-clouds | 輪郭のあるイラスト風の雲 |
| スタイル | synthwave-horizon | ストライプの太陽・山影・下半球のグリッド |
| 抽象 | prismatic-flow | プリズム色の流体風模様 |
| 抽象 | ink-marble | 墨と金の大理石風模様 |
| 水中 | submerged-caustics | 頭上の光窓・水面風の光模様・光の筋 |
| 昼・夕方（従来） | volumetric-daylight / volumetric-sunset | ボリューム雲の昼・夕方 |
| 昼・夕方・朝（従来） | daylight-clear / golden-sunset / morning-glow | 太陽・雲・遠景のある空 |
| 夜（従来） | moonlit-night / starfield-night | 月夜・星空 |
| オーロラ・宇宙（従来） | aurora-night / nebula-space | オーロラ・星雲 |

星の数は全天に対する確率的な目安です。実際に画面内で見える点の数は、方向、画角、解像度、明るさ、雲や天体による遮蔽で変わります。

## 品質と負荷

| 設定 | 新規ノイズの階層 | 新規ボリューム雲 | 新規オーロラ | 従来ボリューム雲 / 光サンプル |
|---|---:|---:|---:|---:|
| 軽量 | 3 | 10 | 10 | 12 / 2 |
| 標準 | 4 | 18 | 18 | 24 / 3 |
| 高精細 | 5 | 28 | 28 | 40 / 4 |

数値は1ピクセルあたりの上限やループ回数です。内部に別のノイズや光の計算があるので、単純なFPS換算はできません。巻雲・霞はボリュームのレイマーチを行いません。サンプリング数を使わないシンプルなプリセットでは、品質を変更しても見た目や負荷が変わらない場合があります。「描画量」はアルゴリズム上の目安で、実測の性能ランクではありません。

既定は標準です。ストアの品質選択は通常のMaterialのVariants/definesへ保存されます。追加後に品質を変更するにはdefinesを編集するか、同じプリセットを追加し直します。追加し直す場合は独自のGLSLやUniform編集が上書きされることに注意してください。

既存のvolumetric系のストア既定値は40/4から24/3へ変更しています。高精細では40/4に戻せます。保存済みのプロジェクト内Materialのサンプル数は自動変更しません。

## 見た目とプレビューの変更

星は立体グリッドから球面方向の6面グリッドへ変更し、ピクセルより小さい星の明るさを補正しています。太陽・月の輪郭には角距離に対するアンチエイリアスを適用し、地平線とノイズの補間も見直しました。山並みは新規の自然系では初期値0とし、不要な地形を空に強制しません。

オーロラは高さごとに変わる模様をそのまま重ねず、縦筋を共有し、サンプル間隔に合わせて光の幕をフィルターします。環を持つ惑星は球と環を交差判定し、前後関係と影を計算しています。下半球のシンセウェーブの格子は背景であり、歩ける床ではありません。水中プリセットも実際の水面・集光・水中フォグを作りません。

一覧は `public/visual-editor/sky-shaders/v3/*.webp` を遅延読み込みします。詳細欄のみ1つのライブCanvasを使用し、カード数に比例してWebGLコンテキストを増やしません。サムネイルが読めない場合は案内を表示し、別Canvasへフォールバックしません。

詳細欄ではドラッグ・矢印キーで見回し、再生・一時停止と視点リセットができます。タブ非表示・画面外では連続描画を止めます。端末の「視覚効果を減らす」設定を初回の停止状態に反映します。Uniform編集では既存のShaderMaterialを更新し、品質やソースの変更時だけMaterialを作り直します。

## 開発者向け

実装の入口は次のとおりです。

- `src/lib/visual-editor/sky-shader-catalog.ts`: カタログ統合・既存9種類・パラメーター適用。
- `src/lib/visual-editor/sky-shader-extended-catalog.ts`: 新規24種類とGLSL表現のテンプレート。
- `src/lib/visual-editor/sky-shader-glsl.ts`: 共通の頂点段階、ノイズ、星、天体など。
- `src/lib/visual-editor/sky-shader-quality.ts`: 品質によるdefinesの上書き。Uniformを変更しない。
- `src/components/visual-editor/SkyShaderStore.tsx`: 検索・カテゴリ・品質・追加。
- `src/components/visual-editor/SkyShaderCatalogPreview.tsx`: 静止カードとライブ表示。

新規プリセットは安定したID、カテゴリ、GLSL、Uniform初期値、有効なパラメーター、タグ、既定の視点を定義してください。球の内側から描くため、variantは`side: back`、`transparent: false`、`depthWrite: false`です。方向は`vDirection`、回転は`uRotation`、露出は`uExposure`、中心は`uCenter`に従います。アニメーションは`animatedTimeUniform: uTime`を使います。

GLSLの結果は線形色として扱い、末尾にThree.jsの`tonemapping_fragment`と`colorspace_fragment`を入れます。色Uniformは既存のMaterial生成処理でsRGBから線形色へ変換されます。空の追加だけで環境照明や反射を変更しない契約を維持してください。

ブラウザ側で任意URLからGLSLを取得する新しいインポートAPIは追加していません。既存の「外部から追加」に同梱カタログを増やした改修です。編集可能な通常のMaterial、MCP、World出力の既存経路を利用します。

## 再現用コマンド

既存の依存関係をインストールした環境で実行してください。追加のnpm依存関係はありません。

```sh
# カタログの整合性検査と、自己完結型ギャラリー生成
node scripts/sky-shaders/check.cjs ./sky-check

# PlaywrightのChromiumで3品質・視点・境界値を検証
node scripts/sky-shaders/verify-webgl.mjs ./sky-check

# 検証に通った後、ストア用WebPサムネイルも再生成
node scripts/sky-shaders/verify-webgl.mjs ./sky-check --thumbnails

# アプリ全体の型検査と既存fixture群は別途実行
pnpm typecheck
pnpm e2e:typecheck
pnpm exec playwright test e2e/sky-shaders.spec.ts e2e/water-shaders.spec.ts
```

`check.cjs`はViteでTypeScriptを変換してカタログを読み、、アプリ全体の型検査ではありません。ギャラリーはデモ・検証用の独立したWebGL2実装で、R3Fの結合テストや実機FPS測定の代わりにはなりません。

PlaywrightのChromiumが未導入なら既存プロジェクトの手順で導入してください。システムのChromiumを利用する環境では`SKY_CHROMIUM_PATH`、ソフトウェア描画では`SKY_SOFTWARE_GL=1`を指定できます。Linux環境によってはXvfb等のディスプレイが必要です。

`verify-webgl.mjs`は実装と同じ品質definesをカタログから生成して使います。ShaderMaterial contractを含むアプリのfixtureには、全プリセットの品質・インストール・再インストール・JSON保存の検査も追加しています。Skybox用fixtureは取り込み時に実行済みです。全fixtureやVR実機の検証を代替するものではありません。

ストア用サムネイルは`--thumbnails`からPlaywrightのThree.js描画テストを呼び、本体と同じ`createClassicR3fMaterial`で生成します。標準品質、時刻6.5秒、640×400です。`manifest.json`にシェーダーのハッシュを記録しています。プリセットのGLSLや初期値、既定視点を変更した場合はサムネイルと確認用HTMLを再生成してください。確認用HTMLの表示変換はACESフィットとsRGB出力で、アプリのThree.jsチャンクとは独立した実装です。

## ライセンス

追加したGLSL・コード・描画サムネイルは、このプロジェクトのMITライセンスに従います。外部HDR画像やモデル素材は同梱していません。インストール時の既存の作者・出典・MIT表記は維持しています。

## main取り込み時の検証（2026-09-07）

- 本体とE2Eの型チェック、カタログの2,237項目が通過しました。
- Three.jsで33種類×3品質の99通りを描画し、全種類のMaterial追加・再追加・JSON保存と、Scene設定・World出力のfixtureを通過しました。
- 実際のSkyShaderStoreとR3F詳細を使い、検索、停止、見回し、品質の保持、追加失敗と再試行を確認しました。追加の応答はテスト用です。
- MCPの一覧で33種類と品質別variantsを取得し、既存の`update_custom_shader`でUniformを変えずに軽量設定へ変更できることを確認しました。水21種類の回帰テストも通過しています。
- 付属の独立WebGL2検査も再実行し、99品質描画、198方向、980境界値、1,277有限値検査が失敗0件でした。

Tauriでの実ファイル保存・再読込、公開先、Quest/WebXR実機の性能は未検証です。`docs/sky-shader-verification`の既存JSONは提供元の記録として保持しています。
