---
name: xrift-promo-audio
description: XRift Studio のリリース動画で使う BGM と効果音を扱う。楽曲から30秒・60秒への切り出し、BPM と小節の解析、効果音の合成と自動付与、音量とダッキング、拍とカットの同期、曲や効果音の追加、権利の扱いを提供する。「動画に BGM を付けたい」「曲を追加したい」「30秒に切りたい」「効果音を足したい」「音が大きい・小さい」「BGM を差し替えたい」「音の権利」などで使う。
---

# リリース動画の音

## Overview

BGM は 2 系統ある。標準は XRift Studio の制作者が Suno で作った楽曲を、動画の尺に合わせて切り出したもの。もう 1 つは `gen-audio.mjs` がその場で合成するループ素材で、尺が中途半端なときに使う。効果音はすべて合成音。

どちらも外部の音源を含まないので、出典表記もライセンス確認もいらない。生成物は Git に入れず、原曲と設計だけを残して必要なときに作り直す。

動画側は storyboard を書くだけでよい。シーンの構成から効果音の位置が自動で決まり、BGM の拍とカットが揃う。

## 生成と配布

```powershell
cd dev/release-promo
node _kit/scripts/cut-music.mjs             # 楽曲から 30秒 / 60秒 を切り出す
node _kit/scripts/gen-audio.mjs             # 効果音と合成ループを作る
node _kit/scripts/gen-audio.mjs --only sfx  # 効果音だけ
node _kit/scripts/sync-assets.mjs --project <slug>   # public/audio へ配る
```

どちらも `--force` で作り直す。`sync-assets.mjs` は storyboard が使う BGM と全効果音だけをコピーし、足りない素材があればその場で生成する。各プロジェクトの `npm run studio` と `npm run render` は前段でこれを自動実行するので、通常は個別に叩かなくてよい。

## 用意されている BGM

`_kit/beds.json` が一覧の正。ここと書き出し側がずれていると、生成時にエラーで止まる。

### 楽曲から切り出したもの（標準）

XRift Studio の制作者が Suno で作成し、公開してよいものとして提供している。前奏と終わりがあるため繰り返さない。**動画の小節数をこの `bars` に合わせる。**

| ID | BPM | 長さ | 小節 | 向き |
|---|---|---|---|---|
| `shipped-this-week-30` | 125 | 30.72秒 | 16 | 標準の30秒アップデート紹介 |
| `shipped-this-week-60` | 125 | 59.52秒 | 31 | 60秒。複数の更新やまとめ |
| `glass-atrium-pulse-30` | 121 | 29.75秒 | 15 | 落ち着いた30秒 |
| `glass-atrium-pulse-60` | 121 | 59.50秒 | 30 | 落ち着いた60秒 |

どちらの曲も 0〜4 小節が前奏、4〜8 小節が助走、8 小節目から主部という構成。タイトル 1 小節 + 更新の紹介 3 小節にすると、実画面デモの開始と助走が重なる。

### 合成したループ素材

尺が中途半端なときや、曲の主張を抑えたいときに使う。長さを選ばない。

| ID | BPM | 1小節 | 向き |
|---|---|---|---|
| `bright-120` | 120 | 2.000秒 | 明るいポップ |
| `calm-96` | 96 | 2.500秒 | 落ち着いた解説 |
| `drive-128` | 128 | 1.875秒 | 勢いのある展開 |

`music.bed` に `none` を指定すると無音になる。

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

- BGM は既定 0.7。すべての BGM を -16 LUFS に揃えてあるので、この値がほぼそのまま動画全体の音量になる。0.7 で書き出しが -18 LUFS 前後になり、X や Discord でちょうどよい。ナレーションを重ねるときは 0.35〜0.45 まで下げる。
- 先頭 0.5 秒でフェードイン、末尾 1.2 秒でフェードアウトする。`music.fadeInInFrames` / `fadeOutInFrames` で変えられる。
- `impact` `chime` `riser` が鳴る間は BGM が自動で下がる。倍率と長さは `PromoAudio.tsx` の `DUCKING` にある。
- 効果音全体を上げ下げするときは `sfx.volume`。個別は各キューの `volume`。

音を切っても内容が伝わることが必須条件。音は理解を助けるためだけに使い、音がないと分からない情報を音だけに載せない。

## 拍とカットを合わせる

シーンの尺は `durationInBars`（小節）で書く。BGM の BPM から 1 小節のフレーム数が決まり、カットが必ず拍の上に来る。

楽曲から切り出した BGM は長さが決まっているので、**シーンの小節数の合計を BGM の `bars` に合わせる**。合っていないと、動画の途中で音が終わるか、曲の終わりが切れる。`new-promo.mjs` は `--bed` で選んだ BGM の小節数に合わせて雛形を作る。

| BGM | 1小節 | 全体 | 標準の配分（タイトル / 紹介 / デモ / 結果 / まとめ / 締め） |
|---|---|---|---|
| `shipped-this-week-30` | 1.920秒 | 16小節 | 1 / 3 / 5 / 3 / 3 / 1 |
| `glass-atrium-pulse-30` | 1.983秒 | 15小節 | 1 / 3 / 5 / 3 / 2 / 1 |
| `shipped-this-week-60` | 1.920秒 | 31小節 | 1 / 3 / 12 / 7 / 7 / 1 |
| `glass-atrium-pulse-60` | 1.983秒 | 30小節 | 1 / 3 / 12 / 7 / 6 / 1 |

60秒では 1 シーンが長くなりすぎるので、デモを 2〜3 シーンに割り、実画面を切り替える。

BGM が動画より 1 秒以上短いと、書き出した映像の上に赤い警告帯が出る。途中から無音の動画をそのまま公開しないための表示なので、BGM を長いものへ変えるか、シーンの小節数を減らして直す。意図的に短くする場合だけ `music.allowShorterThanVideo` を `true` にする。

ループ素材（`bright-120` など）は長さを選ばないので、小節数を合わせる必要はない。

## 楽曲を足す

新しい曲を BGM に加える手順。権利が確認できるものだけを入れる。

1. `_kit/assets/music/` に音源を置く。埋め込み画像は外しておく。

   ```powershell
   ffmpeg -i "元ファイル.mp3" -map 0:a:0 -c:a copy _kit/assets/music/new-track.mp3
   ```

2. 解析して BPM・小節の位置・構成を出す。

   ```powershell
   node _kit/scripts/analyze-music.mjs _kit/assets/music/new-track.mp3
   ```

   `確信度` が低いとき、また 3 連符の曲では BPM が 2/3 や 2 倍にずれることがある。出てきた小節の区切りが、実際の曲の展開（前奏・主部・間奏）と合っているかを構成表で確かめる。

3. `_kit/assets/music/tracks.json` に曲と切り出す区間を書く。`segments` は `[開始小節, 終了小節)` の並びで、複数書くとその位置でつながる。つなぎ目は 1 拍ぶん重ねるので、8 小節単位の区切りで指定すると自然になる。

4. `_kit/beds.json` に同じ ID・BPM・小節数を書く。`loop` は `false`、`kind` は `track`。

5. 書き出して確認する。`beds.json` と食い違っていればエラーで止まる。

   ```powershell
   node _kit/scripts/cut-music.mjs --force
   ```

書き出しは自動で -16 LUFS へ揃うので、`music.volume` の意味はどの曲でも同じになる。元の速度は変えない。曲の性格をそのまま残し、動画の尺のほうを小節数で合わせる。

## 新しい音を足す

効果音を足すときは 3 か所を必ず揃える。

1. `_kit/scripts/gen-audio.mjs` の `SFX` に `{ id, label, make }` を足す。合成は `_kit/scripts/instruments.mjs` に書く。
2. `_kit/src/core/storyboard.ts` の `SfxId` に ID を足す。
3. `_kit/src/audio/PromoAudio.tsx` の `SFX_GAIN` に既定音量を足す。自動付与するなら `autoCuesFor` にも足す。

合成のループ素材を足すときは、`gen-audio.mjs` の `BEDS` に `{ id, label, bpm, bars, mood, chords }` を足し、`_kit/beds.json` にも同じ `bpm` と `bars` を書く。ここがずれると書き出し時にエラーで止まる。楽曲を足す手順は前の節にある。

合成の作り方は [音源の作り方](references/synthesis.md) にある。

## 確認

```powershell
ffmpeg -i out/xxx.mp4 -af ebur128 -f null -
ffmpeg -y -i _kit/assets/audio/bgm-shipped-this-week-30.wav -filter_complex "showwavespic=s=1200x200" -frames:v 1 wave.png
```

- 書き出した動画に音声トラックがある。
- 統合ラウドネス（`I:`）が -20 〜 -16 LUFS に入っている。極端に小さいときは BGM か効果音のどちらかが鳴っていない。
- 波形に赤い警告帯が出ていない。出ていれば BGM が動画より短い。
- Remotion Studio のタイムラインに `BGM 1` `SFX click` が並ぶ。どこで何が鳴るかはここで確認する。
- 曲のつなぎ目、カットと拍のずれ、効果音の重なりすぎを通しで聞いて確認する。

## 外部の音源を使う場合

キットに入っている曲と合成音で足りるうちは、外部音源を持ち込まない。どうしても必要なときだけ、次を守る。

- 制作者本人が権利を持つもの、CC0、パブリックドメインに限る。CC BY-NC、用途不明、出典不明は使わない。
- 曲名、作者、ライセンス、配布ページ、取得日を `tracks.json` の `rights` と storyboard の `sourceNotes` に書く。
- リポジトリへ入れるかどうかは、サイズ・ライセンス・再現性を確認してから決める。
- ナレーションは、ユーザーが明示的に求め、承認済み台本がある場合だけ追加する。
