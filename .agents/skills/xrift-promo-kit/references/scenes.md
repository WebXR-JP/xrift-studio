# シーンと演出

実装は `dev/release-promo/_kit/src` にある。数値を変えるときは、1 本の動画のためだけにプロジェクト側で上書きせず、キットの既定値を見直す。

## 部品の対応

| 部品 | ファイル | 役割 |
|---|---|---|
| `Promo` | `src/Promo.tsx` | storyboard をシーンの列に展開し、音と背景を敷く |
| `Backdrop` | `src/stage/Backdrop.tsx` | 全シーン共通の背景。ごく緩やかに動く |
| `ScreenStage` | `src/stage/ScreenStage.tsx` | 画面キャプチャの枠、ズーム、素材未収録の表示 |
| `Pointer` | `src/overlays/Pointer.tsx` | 強調ポインターとクリック波紋 |
| `Caption` `SceneLabel` `Callout` `KeyCaps` `FocusRing` `Badge` | `src/overlays/Annotations.tsx` | 画面上の文字と注釈 |
| `TitleCard` `FeatureCard` `BulletsCard` `EndCard` | `src/scenes/Cards.tsx` | 文字だけのシーン |
| `ScreenSceneView` `CompareSceneView` | `src/scenes/Screens.tsx` | 実画面のシーン |
| `PromoAudio` | `src/audio/PromoAudio.tsx` | BGM と効果音 |

## タイミングの既定値

| 演出 | 値 | 置き場所 |
|---|---|---|
| シーンの入り | 14 フレームの spring | `ScreenStage` |
| ポインターの移動 | `moveDurationInFrames`（8〜18 が目安） | storyboard |
| クリック波紋 | 22 フレーム | `Pointer` |
| ズーム | `durationInFrames`（18〜30 が目安）、倍率 1.25〜1.7 | storyboard |
| 静止画のゆっくりした寄り | シーン全体で 1.0 → 1.028 倍 | `ScreenStage` の `ambientZoom` |
| カットの帯 | カットの 4 フレーム前から 16 フレーム | `Promo` の `CutSweep` |
| 字幕の出現 | 6 フレーム遅れ | `Caption` |
| 箇条書きの出現 | 12 フレーム目から 14 フレーム間隔 | `BulletsCard` |

`ambientZoom` は静止画が止まって見えないようにするためのもの。動画素材を使うシーンでは効果が二重になるので、必要なら `ScreenStage` の呼び出し側で切る。

## 色とテーマ

`src/core/theme.ts` の 2 つだけを使う。

- `dark`（既定）: 周囲を落として画面キャプチャを浮かせる。X や Discord のタイムラインで目立つ。
- `light`: 静かな白基調。ガイドや解説寄りの動画向け。

ブランド色は XRift Studio 本体（`src/index.css`）の violet スケールと同じ値を持つ。新しい色を動画側で足さない。強調色は「操作対象」「進行中」「結果」のいずれかの意味にだけ使う。

## レイアウト

`src/core/layout.ts` の `stageBox` が画面枠を決める。

- 横型: 上のラベルと下の字幕の場所を残し、素材全体を入れる。素材比が 16:9 以外でも切り取らない。
- 縦型: 素材を 1.62 倍に拡大し、注目点を中央へ寄せる。注目点は `focus` → `pointer.to` → 最初の `callouts` の順に決まる。枠が画面をはみ出すため、角丸と枠線は自動で消える。

縦型で重要な UI が切れる場合は、`focus` の座標を調整するか、縦型専用のシーンを別の storyboard に分ける。素材そのものを引き伸ばして辻褄を合わせない。

## やらないこと

- 架空の UI、作り込んだモック、成功したように見せる画面を作らない。素材がなければ未収録のまま止める。
- 1 画面にポインターを 2 つ置かない。ポインターが移動し終わる前に次の主張を始めない。
- ズームを 1 本の動画で 3 回以上使わない。
- 絵文字を使わない。アイコンだけに意味を預けず、読めるラベルを付ける。
- 差分にない機能、未確定のバージョン番号、性能値、公開日を断定しない。
