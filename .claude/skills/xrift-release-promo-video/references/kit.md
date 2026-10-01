# 共有キットでの実装

作業は`dev/release-promo`で行ってください。依存が必要なら、このディレクトリで`pnpm install`を実行します。Remotionの依存はルートのアプリに追加せず、専用の`pnpm-workspace.yaml`で管理します。

```bash
node _kit/scripts/new-promo.mjs --slug <slug> --title "<見出し>" --version <version>
cd <slug>
# public/source/ に収録素材を置き、storyboard.json を編集
npm run studio
npm run still
npm run render
npm run render:vertical
```

通常は既存の`_kit`を使ってください。起動・書き出し時には、音の生成と`public/audio`への同期を自動で実行します。新しい演出が必要な場合は、[extending.md](extending.md)に従って共通キットを拡張します。

- フィールドは [storyboard.md](storyboard.md)、シーンの選択は [scenes.md](scenes.md) を参照する。
- シーンの尺は`durationInBars`を使う。フレーム指定が必要なら`durationInFrames`とし、両方を書かない。`format.durationInFrames`は設定せず合計から求める。
- 楽曲を使う場合はシーンの小節数の合計を`_kit/beds.json`の`bars`に合わせる。ループ音源は固定尺に合わせる必要がない。
- 収録の縦横比は`format.sourceAspect`に記録し、引き伸ばさない。縦型は各シーンに`focus`または`pointer`を置き、対象と字幕が切れないことを確認する。
- `claim`と`doneWhen`は実画面と差分で検証できる内容にする。表示文や尺は承認済み台本から変えない。
- 動画素材は各プロジェクトで`node ../_kit/scripts/prepare-footage.mjs`を実行して整える。

`ffprobe out/<file>.mp4`で尺・解像度・音声トラックを確認する。生成物は`out/`に置き、Gitには追加しない。
