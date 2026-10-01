# シーンと演出

実装は`dev/release-promo/_kit/src`にあります。共通の数値を変える場合は、キットの初期設定を見直してください。1本の動画だけで上書きしません。

## 部品の対応

| 部品 | ファイル | 役割 |
|---|---|---|
| `Promo` | `src/Promo.tsx` | storyboardからシーンを順に作り、音と背景を追加する |
| `Backdrop` | `src/stage/Backdrop.tsx` | 全シーン共通の背景。ごく緩やかに動く |
| `ScreenStage` | `src/stage/ScreenStage.tsx` | 画面キャプチャの枠、ズーム、素材未収録の表示 |
| `Pointer` | `src/overlays/Pointer.tsx` | 強調ポインターとクリック波紋 |
| `Caption` `SceneLabel` `Callout` `KeyCaps` `FocusRing` `Badge` | `src/overlays/Annotations.tsx` | 画面上の文字と注釈 |
| `TitleCard` `FeatureCard` `BulletsCard` `EndCard` | `src/scenes/Cards.tsx` | 文字だけのシーン |
| `ScreenSceneView` `CompareSceneView` | `src/scenes/Screens.tsx` | 実画面のシーン |
| `PromoAudio` | `src/audio/PromoAudio.tsx` | BGMと効果音 |

## タイミングの既定値

| 演出 | 値 | 置き場所 |
|---|---|---|
| シーンの入り | 14フレームのspring | `ScreenStage` |
| ポインターの移動 | `moveDurationInFrames`（8〜18が目安） | storyboard |
| クリック波紋 | 22フレーム | `Pointer` |
| ズーム | `durationInFrames`（18〜30が目安）、倍率1.25〜1.7 | storyboard |
| 静止画のゆっくりした寄り | シーン全体で1.0 → 1.028倍 | `ScreenStage`の`ambientZoom` |
| カットの帯 | カットの4フレーム前から16フレーム | `Promo`の`CutSweep` |
| 字幕の出現 | 6フレーム遅れ | `Caption` |
| 箇条書きの出現 | 12フレーム目から14フレーム間隔 | `BulletsCard` |

`ambientZoom`は静止画をゆっくり拡大する設定です。動画素材の動きに拡大が重なる場合は、`ScreenStage`の呼び出し側で無効にしてください。

## 色とテーマ

`src/core/theme.ts`の2つだけを使う。

- `dark`（既定）: 周囲を暗くして画面キャプチャを見やすくする。XやDiscordのタイムラインで目立つ。
- `light`: 静かな白基調。ガイドや解説寄りの動画向け。

ブランド色はXRift Studio本体（`src/index.css`）のvioletスケールと同じ値を持つ。新しい色を動画側で足さない。強調色は「操作対象」「進行中」「結果」のいずれかの意味にだけ使う。

## レイアウト

`src/core/layout.ts`の`stageBox`が画面枠を決める。

- 横型: 上のラベルと下の字幕の場所を残し、素材全体を入れる。素材比が16:9以外でも切り取らない。
- 縦型: 素材を1.62倍に拡大し、注目点を中央へ寄せる。注目点は`focus` → `pointer.to` → 最初の`callouts`の順に決まる。枠が画面をはみ出すため、角丸と枠線は自動で消える。

縦型で重要なUIが切れる場合は、`focus`の座標を調整するか、縦型専用のシーンを別のstoryboardに分ける。素材の縦横比は保ってください。

## やらないこと

- 架空のUI、作り込んだモック、成功したように見せる画面を作らない。素材がなければ未収録のまま止める。
- 1画面にポインターを2つ置かない。ポインターが移動し終わる前に次の主張を始めない。
- ズームを1本の動画で3回以上使わない。
- 絵文字を使わない。アイコンには、操作や状態が分かるラベルを付ける。
- 差分にない機能、未確定のバージョン番号、性能値、公開日を断定しない。
