---
name: xrift-promo-audio
description: XRift Studio のリリース動画で使う BGM と効果音を扱う。合成音源の生成、シーン構成からの効果音の自動付与、音量とダッキング、拍とカットの同期、新しい音の追加、ライセンスの扱いを提供する。「動画に BGM を付けたい」「効果音を足したい」「音が大きい・小さい」「BGM を差し替えたい」「新しい効果音を作る」「音の権利」などで使う。
---

# リリース動画の音

## Overview

BGM と効果音は `dev/release-promo/_kit/scripts/gen-audio.mjs` がその場で合成する。外部の音源を使わないので、出典表記もライセンス確認もいらず、同じコードからは常に同じ波形が出る。生成物は Git に入れず、必要なときに作り直す。

動画側は storyboard を書くだけでよい。シーンの構成から効果音の位置が自動で決まり、BGM の拍とカットが揃う。

## 生成と配布

```powershell
cd dev/release-promo
node _kit/scripts/gen-audio.mjs             # 無いものだけ生成
node _kit/scripts/gen-audio.mjs --force     # 作り直す
node _kit/scripts/gen-audio.mjs --only sfx  # 効果音だけ
node _kit/scripts/sync-assets.mjs --project <slug>   # public/audio へ配る
```

`sync-assets.mjs` は storyboard が使う BGM と全効果音だけをコピーする。各プロジェクトの `npm run studio` と `npm run render` は前段でこれを自動実行する。素材が無ければ生成から行う。

## 用意されている BGM

| ID | BPM | 長さ | 向き |
|---|---|---|---|
| `bright-120` | 120 | 16 秒 | 明るいポップ。標準の 30 秒アップデート紹介 |
| `calm-96` | 96 | 20 秒 | 落ち着いた雰囲気。使い方ガイドや長めの解説 |
| `drive-128` | 128 | 15 秒 | 勢いのある展開。大きな機能追加やリリース総集編 |

すべて 8 小節のループ。動画の長さに合わせて必要な回数だけ並ぶ。ループの継ぎ目でリバーブの尾が途切れないよう、生成側でバッファを回り込ませて書いている。

`music.bed` に `none` を指定すると無音になる。`music.bpm` を指定すると拍グリッドだけ別の値にできるが、BGM を鳴らす場合は BGM の BPM と揃える。

## 用意されている効果音

| ID | 用途 | 既定音量 |
|---|---|---|
| `click` | ポインターのクリック | 0.50 |
| `tick` | 箇条書きや注釈の出現 | 0.34 |
| `pop` | テロップの出現 | 0.40 |
| `type` | キー入力 | 0.32 |
| `whoosh` | シーンの切り替え | 0.42 |
| `swish` | 短い切り替え、ワイプ | 0.38 |
| `zoom` | ズームイン | 0.30 |
| `riser` | 見せ場の直前の助走 | 0.40 |
| `impact` | タイトルの着地 | 0.62 |
| `chime` | 成功、完了 | 0.50 |
| `confirm` | 小さな確定、決定 | 0.42 |

## 自動で付く音

`sfx.auto` が `true`（既定）のとき、シーン構成から次の音が入る。

| きっかけ | 音 | 位置 |
|---|---|---|
| 2 番目以降のシーンの頭 | `whoosh` | カットの 5 フレーム前 |
| `title` | `impact` | 6 フレーム目（タイトルの着地と同じ） |
| `feature` | `pop` | 10 フレーム目 |
| `pointer.clickAtFrame` | `click` | その位置 |
| `pointer.extraClickFrames` | `click`（少し小さい） | その位置 |
| `focus.startFrame` | `zoom` | その位置 |
| `callouts[].at` | `tick` | その位置 |
| `keyHint.at` | `type` | キーごとに 6 フレーム間隔 |
| `compare.wipeAtFrame` | `swish` | その位置 |
| `bullets.items` | `tick` | 12 フレーム目から 14 フレーム間隔 |
| `end` | `chime` | 4 フレーム目 |

足りない音は、シーンの `sfx` に書く。

```json
"sfx": [{ "id": "riser", "at": 96, "volume": 0.35 }]
```

シーン頭の切り替え音とカットの帯を止めたいときは、そのシーンに `"noTransitionSfx": true` を付ける。動画全体で自動付与を切るなら `"sfx": { "auto": false }`、音を全部止めるなら `"enabled": false`。

## 音量とダッキング

- BGM は既定 0.32。字幕とナレーションの下で鳴らす前提で、生成時点でも余裕を持たせている。
- 先頭 0.5 秒でフェードイン、末尾 1.2 秒でフェードアウトする。`music.fadeInInFrames` / `fadeOutInFrames` で変えられる。
- `impact` `chime` `riser` が鳴る間は BGM が自動で下がる。倍率と長さは `PromoAudio.tsx` の `DUCKING` にある。
- 効果音全体を上げ下げするときは `sfx.volume`。個別は各キューの `volume`。

音を切っても内容が伝わることが必須条件。音は理解を助けるためだけに使い、音がないと分からない情報を音だけに載せない。

## 拍とカットを合わせる

シーンの尺は `durationInBars`（小節）で書く。BGM の BPM から 1 小節のフレーム数が決まり、カットが必ず拍の上に来る。

| BGM | 1 小節 | 30 秒 |
|---|---|---|
| `bright-120` | 2.0 秒（30fps で 60 フレーム） | 15 小節 |
| `calm-96` | 2.5 秒（75 フレーム） | 12 小節 |
| `drive-128` | 1.875 秒（56.25 フレーム） | 16 小節 |

`drive-128` は 30fps で 1 小節が整数フレームにならない。合計が 30 秒ぴったりである必要があるときは `bright-120` か `calm-96` を選ぶか、60fps にする。

## 新しい音を足す

効果音を足すときは 3 か所を必ず揃える。

1. `_kit/scripts/gen-audio.mjs` の `SFX` に `{ id, label, make }` を足す。合成は `_kit/scripts/instruments.mjs` に書く。
2. `_kit/src/core/storyboard.ts` の `SfxId` に ID を足す。
3. `_kit/src/audio/PromoAudio.tsx` の `SFX_GAIN` に既定音量を足す。自動付与するなら `autoCuesFor` にも足す。

BGM を足すときは、`gen-audio.mjs` の `BEDS` に `{ id, label, bpm, bars, mood, chords }` を足し、`_kit/src/core/timing.ts` の `BED_SPECS` に同じ `bpm` と `bars` を書く。ここがずれるとループが途中で切れる。

合成の作り方は [音源の作り方](references/synthesis.md) にある。

## 確認

```powershell
ffmpeg -i out/xxx.mp4 -af volumedetect -f null -
ffmpeg -y -i _kit/assets/audio/bgm-bright-120.wav -filter_complex "showwavespic=s=1200x200" -frames:v 1 wave.png
```

- 書き出した動画に音声トラックがあり、`max_volume` が 0 dB を超えていない。
- 目安は `mean_volume` が -26 〜 -14 dB 程度。極端に小さいときは BGM か効果音のどちらかが鳴っていない。
- Remotion Studio のタイムラインに `BGM 1` `SFX click` が並ぶ。どこで何が鳴るかはここで確認する。
- ループの継ぎ目、カットと拍のずれ、効果音の重なりすぎを通しで聞いて確認する。

## 外部の音源を使う場合

キットの合成音で足りるうちは外部音源を持ち込まない。どうしても必要なときだけ、次を守る。

- CC0 またはパブリックドメインに限る。CC BY-NC、用途不明、出典不明は使わない。
- 曲名、作者、ライセンス、配布ページ、取得日を storyboard の `sourceNotes` に書く。
- リポジトリへ入れるかどうかは、サイズ・ライセンス・再現性を確認してから決める。
- ナレーションは、ユーザーが明示的に求め、承認済み台本がある場合だけ追加する。
