# BGM と効果音

作業場所は `dev/release-promo`。BGM の ID・BPM・小節数は `_kit/beds.json` を正とし、一覧や音量定数をこの文書へ複製しない。提供済み楽曲は終わりのある固定尺、合成ループは任意尺に使う。`music.bed: none` は無音。

通常は起動・書き出し時に素材が自動同期される。手動で再生成するときだけ次を使う。

```bash
node _kit/scripts/cut-music.mjs
node _kit/scripts/gen-audio.mjs
node _kit/scripts/gen-audio.mjs --only sfx
node _kit/scripts/sync-assets.mjs --project <slug>
```

再生成には `--force` を付ける。生成物は Git に入れず、原曲と生成設定を残す。

## storyboard での調整

- 固定尺の曲はシーンの `durationInBars` の合計を曲の `bars` に合わせる。BGM が短い場合の警告を解消し、意図的に短くするときだけ `music.allowShorterThanVideo` を使う。
- `music.volume`、`fadeInInFrames`、`fadeOutInFrames` で BGM を調整する。ダッキングと自動効果音は `_kit/src/audio/PromoAudio.tsx` の `DUCKING`、`autoCuesFor` を参照する。
- 効果音全体は `sfx.volume`、個別は各キューの `volume`。自動付与は `sfx.auto`、音全体は `sfx.enabled`、シーン頭の音と帯は `noTransitionSfx` で制御する。
- 追加キューは `sfx: [{ id, at, volume }]`。音の ID と既定音量は `SfxId` と `SFX_GAIN` を参照する。

## 音源を追加する場合

- 曲は `_kit/assets/music/` に置き、`analyze-music.mjs <path>` で BPM を調べる。解析値は倍・半分になることがあるため、実際の小節と展開を聞いて確認する。
- `tracks.json` の `segments` は `[開始小節, 終了小節)`。`beds.json` に同じ ID・BPM・小節数と `loop: false, kind: track` を記録し、`cut-music.mjs --force` で切り出す。
- 効果音追加は `gen-audio.mjs` の `SFX`、`storyboard.ts` の `SfxId`、`PromoAudio.tsx` の `SFX_GAIN` を揃える。合成ループは `BEDS` と `beds.json` を揃える。合成実装が必要なら [synthesis.md](synthesis.md) を読む。
- 外部音源はキットで足りずユーザーが必要と判断した場合だけ。制作者が権利を持つもの、CC0、パブリックドメインに限り、曲名・作者・ライセンス・配布ページ・取得日を `rights` と `sourceNotes` に残す。

## 確認

通し再生で音の継ぎ目・拍とカット・重なりを聞く。`ffprobe` で音声トラック、`ffmpeg -i out/<file>.mp4 -af ebur128 -f null -` で音量を確認する。既存の目安は統合ラウドネス -20〜-16 LUFS。無音でも字幕と実画面で意味が通ることを確かめる。
