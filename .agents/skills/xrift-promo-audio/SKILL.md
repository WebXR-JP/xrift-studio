---
name: xrift-promo-audio
description: XRift Studioの紹介動画へBGM・効果音を追加し、尺・音量・拍を調整する。
---

# リリース動画の音

## Overview

BGM は 2 系統ある。標準は XRift Studio の制作者が Suno で作った楽曲を、動画の尺に合わせて切り出したもの。もう 1 つは `gen-audio.mjs` がその場で合成するループ素材で、尺が中途半端なときに使う。効果音はすべて合成音。

同梱音源の利用条件を保ち、新しい音源は提供元と利用・再配布条件を確認する。生成物は Git に入れず、原曲と設計だけを残して必要なときに作り直す。

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

## 音素材を選ぶ・変更する

既存BGMや効果音の選択、尺・音量の調整、音素材の追加時は [audio-catalog.md](references/audio-catalog.md) を読む。音源合成は [synthesis.md](references/synthesis.md) を参照する。

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
