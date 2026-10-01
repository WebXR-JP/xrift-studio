# キットの拡張

新しい演出は共通キットへ追加してください。ほかの動画でも同じ部品を使えるようにしてから、動画を仕上げます。

## シーン種別を足す

1. `_kit/src/core/storyboard.ts`に型を足し、`Scene`のunionへ入れる。
2. `_kit/src/scenes/`に描画を書く。既存の`Cards.tsx` / `Screens.tsx`の書き方に合わせる。色・余白・角丸は`theme.ts`の値だけを使う。
3. `_kit/src/Promo.tsx`の`SceneView`に分岐を足す。
4. `_kit/src/audio/PromoAudio.tsx`の`autoCuesFor`に、そのシーンで自動的に鳴らす効果音を足す。無音でよければ足さない。
5. `_kit/src/index.ts`から書き出す。
6. `_kit/template/storyboard.json`に例を入れるかどうかを決める。標準の30秒構成に必要な種別だけを雛形へ入れる。
7. 動画プロジェクトで`npm run typecheck`と静止画の書き出しを行い、横型・縦型の両方を確認する。

## 演出のパラメータを変える

タイミングや倍率は、まずstoryboardで指定できるか確認してください。動画ごとに変える値はstoryboardのフィールドへ追加し、共通の値は`_kit/src`の初期設定を変更します。

同じ数値が2か所以上に現れたら、`theme.ts`か`layout.ts`の定数にまとめる。

## 音を足す

[音](audio.md) の手順に従う。効果音のIDを足すときは、`storyboard.ts`の`SfxId`、`PromoAudio.tsx`の`SFX_GAIN`、`gen-audio.mjs`の`SFX`の3か所を必ず揃える。

## 縦型の表示範囲を調整する

現在の縦型は、素材を拡大して注目点を中央へ寄せる方式になっている。縦型で見せたい範囲が横に広い場合は、次のどちらかにする。

- 収録時に、縦型向けの画角でもう一度撮る。
- 縦型専用のstoryboardを分け、シーンを縦型の構成で作り直す。

縦横で異なる座標が必要な場合は、storyboardを分けてください。1つのstoryboardに両方の座標を追加すると、データが重複して確認漏れが増えます。

## 変更したら

- `_kit`を変えたら、既存の動画プロジェクトを1つ選んで静止画を書き出し、表示に問題がないか確認する。
- 破壊的な変更（フィールド名の変更、既定値の大きな変更）をしたときは、`kit-demo`のstoryboardも更新する。
- スキルの記述（このファイル、`storyboard.md`、`scenes.md`）を同じコミットで更新する。
