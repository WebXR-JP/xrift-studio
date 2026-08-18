# キットの拡張

新しい演出が必要になったら、動画プロジェクト側に書かずキットへ足す。次の動画から同じ部品が使える状態にしてから、その動画を仕上げる。

## シーン種別を足す

1. `_kit/src/core/storyboard.ts` に型を足し、`Scene` の union へ入れる。
2. `_kit/src/scenes/` に描画を書く。既存の `Cards.tsx` / `Screens.tsx` の書き方に合わせる。色・余白・角丸は `theme.ts` の値だけを使う。
3. `_kit/src/Promo.tsx` の `SceneView` に分岐を足す。
4. `_kit/src/audio/PromoAudio.tsx` の `autoCuesFor` に、そのシーンで自動的に鳴らす効果音を足す。無音でよければ足さない。
5. `_kit/src/index.ts` から書き出す。
6. `_kit/template/storyboard.json` に例を入れるかどうかを決める。標準の 30 秒構成に必要な種別だけを雛形へ入れる。
7. 動画プロジェクトで `npm run typecheck` と静止画の書き出しを行い、横型・縦型の両方を確認する。

## 演出のパラメータを変える

タイミングや倍率は、まず storyboard 側で指定できないかを見る。動画ごとに変える必要があるものは storyboard のフィールドにする。すべての動画で共通の値は `_kit/src` の既定値を直す。

同じ数値が 2 か所以上に現れたら、`theme.ts` か `layout.ts` の定数にまとめる。

## 音を足す

[xrift-promo-audio](../../xrift-promo-audio/SKILL.md) の手順に従う。効果音の ID を足すときは、`storyboard.ts` の `SfxId`、`PromoAudio.tsx` の `SFX_GAIN`、`gen-audio.mjs` の `SFX` の 3 か所を必ず揃える。

## 縦型を強くする

現在の縦型は、素材を拡大して注目点を中央へ寄せる方式になっている。縦型で見せたい範囲が横に広い場合は、次のどちらかにする。

- 収録時に、縦型向けの画角でもう一度撮る。
- 縦型専用の storyboard を分け、シーンを縦型の構成で作り直す。

1 つの storyboard に縦横それぞれの座標を持たせる方向へは広げない。データが二重になり、確認漏れが増える。

## 変更したら

- `_kit` を変えたら、既存の動画プロジェクトを 1 つ選んで静止画を書き出し、見た目が壊れていないか確認する。
- 破壊的な変更（フィールド名の変更、既定値の大きな変更）をしたときは、`kit-demo` の storyboard も更新する。
- スキルの記述（このファイル、`storyboard.md`、`scenes.md`）を同じコミットで更新する。
