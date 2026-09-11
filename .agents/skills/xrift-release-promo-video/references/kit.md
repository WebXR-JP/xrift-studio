# 共有キットでの実装

作業場所は `dev/release-promo`。依存が必要ならここで `pnpm install` する。ルートのアプリへ Remotion 依存を追加せず、独立した `pnpm-workspace.yaml` を保つ。

```bash
node _kit/scripts/new-promo.mjs --slug <slug> --title "<見出し>" --version <version>
cd <slug>
# public/source/ に収録素材を置き、storyboard.json を編集
npm run studio
npm run still
npm run render
npm run render:vertical
```

通常は既存の `_kit` を使い、動画ごとにシーン実装を書き直さない。音の生成と `public/audio` への同期は起動・書き出し時に自動実行される。新しい演出が必要なら [extending.md](extending.md) を参照する。

- フィールドは [storyboard.md](storyboard.md)、シーンの選択は [scenes.md](scenes.md) を参照する。
- シーンの尺は `durationInBars` を使う。フレーム指定が必要なら `durationInFrames` とし、両方を書かない。`format.durationInFrames` は設定せず合計から求める。
- 楽曲を使う場合はシーンの小節数の合計を `_kit/beds.json` の `bars` に合わせる。ループ音源は固定尺に合わせる必要がない。
- 収録の縦横比は `format.sourceAspect` に記録し、引き伸ばさない。縦型は各シーンに `focus` または `pointer` を置き、対象と字幕が切れないことを確認する。
- `claim` と `doneWhen` は実画面と差分で検証できる内容にする。表示文や尺は承認済み台本から変えない。
- 動画素材は各プロジェクトで `node ../_kit/scripts/prepare-footage.mjs` を実行して整える。

`ffprobe out/<file>.mp4` で尺・解像度・音声トラックを確認する。生成物は `out/` に置き、Git には追加しない。
