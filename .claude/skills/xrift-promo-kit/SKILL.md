---
name: xrift-promo-kit
description: XRift Studio のリリース動画を、共有キット dev/release-promo/_kit で組み立てる。プロジェクトの雛形作成、storyboard.json の書き方、シーン部品（タイトル・機能紹介・実画面デモ・前後比較・箇条書き・締め）、BGMの拍に合わせた尺、横型と縦型の書き出し、確認手順を提供する。「リリース動画を作る」「アップデート動画」「Remotion で動画」「新機能の紹介動画」「プロモ動画の雛形」などで使う。
---

# XRift Studio リリース動画キット

## Overview

動画ごとに Remotion のシーン実装を書き直さない。`dev/release-promo/_kit` に共通の部品・音・レイアウトがあり、各動画は `storyboard.json` というデータだけを持つ。台本が決まれば、コードを書かずに 30 秒の動画が出る。

企画・差分抽出・台本承認の進め方は [xrift-release-promo-video](../xrift-release-promo-video/SKILL.md) にある。実画面の収録は [xrift-promo-capture](../xrift-promo-capture/SKILL.md)、音の設計は [xrift-promo-audio](../xrift-promo-audio/SKILL.md) を見る。このスキルは「承認済みの台本を動画にする」部分を担当する。

## いちばん短い手順

```powershell
cd dev/release-promo
node _kit/scripts/new-promo.mjs --slug terrain-brush --title "地形ブラシを追加しました" --version 0.9.0
# public/source/ に実画面を置き、storyboard.json を埋める
cd terrain-brush
npm run studio             # プレビュー
npm run still              # 静止画で構図を確認
npm run render             # 横型 1920x1080
npm run render:vertical    # 縦型 1080x1920
```

`new-promo.mjs` は雛形の作成、音素材の生成、`public/audio` への配布までを行う。依存のインストールは不要で、`dev/release-promo/node_modules` を全プロジェクトで共有する。

## ディレクトリ

```text
dev/release-promo/
├─ package.json          # 共有依存（remotion / react）。ここで pnpm install する
├─ pnpm-workspace.yaml   # 独立したワークスペースの根。リポジトリ本体の install を巻き込まない
├─ _kit/
│  ├─ src/               # シーン部品・音・レイアウト。動画側から読み込む
│  ├─ scripts/           # 音の生成、素材の配布、雛形の作成
│  ├─ assets/audio/      # 生成した BGM と効果音。Git には入れない
│  └─ template/          # 新規プロジェクトの雛形
└─ <slug>/
   ├─ storyboard.json    # この動画の中身。ほぼここだけを書く
   ├─ src/index.tsx      # Composition の登録。触るのは尺や解像度を変えるときだけ
   ├─ public/source/     # 収録した実画面
   ├─ public/audio/      # sync-assets.mjs が配る。Git には入れない
   └─ out/               # 書き出し。Git には入れない
```

`pnpm install` は必ず `dev/release-promo` で実行する。リポジトリ直下で実行すると XRift Studio 本体の依存を作り直そうとするため、`pnpm-workspace.yaml` を消さない。

## storyboard の骨格

```json
{
  "id": "terrain-brush",
  "version": "0.9.0",
  "releaseStatus": "published",
  "scriptApproval": { "status": "approved", "approvedBy": "user" },
  "theme": "dark",
  "format": { "width": 1920, "height": 1080, "fps": 30 },
  "music": { "bed": "shipped-this-week-30", "volume": 0.7 },
  "sfx": { "enabled": true, "auto": true },
  "scenes": [ ... ]
}
```

- 尺は `durationInBars`（小節）で書く。BGM の拍とカットが必ず揃う。1 小節の長さは BGM ごとに違う。
- どうしてもフレーム単位で決めたいときだけ `durationInFrames` を使う。両方を書かない。
- `format.durationInFrames` は書かない。シーンの合計から自動で決まる。
- 収録が 16:9 以外なら `format.sourceAspect` を指定する（例: 16:10 なら `1.6`）。
- `scriptApproval.status` が `approved` になるまでレンダリングしない。

### 尺は BGM が決める

楽曲から切り出した BGM は長さが決まっている。**シーンの `durationInBars` の合計を、その BGM の小節数に合わせる。** 合っていないと途中で音が終わるか、曲の終わりが切れる。`new-promo.mjs` は `--bed` に合わせて雛形を作るので、通常はそのまま使えばよい。

| BGM | 動画の長さ | 小節 | 標準の配分 |
|---|---|---|---|
| `shipped-this-week-30`（既定） | 30.7秒 | 16 | 1 / 3 / 5 / 3 / 3 / 1 |
| `glass-atrium-pulse-30` | 29.8秒 | 15 | 1 / 3 / 5 / 3 / 2 / 1 |
| `shipped-this-week-60` | 59.5秒 | 31 | 1 / 3 / 12 / 7 / 7 / 1 |
| `glass-atrium-pulse-60` | 59.5秒 | 30 | 1 / 3 / 12 / 7 / 6 / 1 |

配分は「タイトル / 更新の紹介 / 実画面デモ / 結果 / まとめ / 締め」の順。どちらの曲も 8 小節目から主部に入るので、この配分だと実画面デモの途中で曲が開ける。

ループする合成ベッド（`bright-120` `calm-96` `drive-128`）を選んだ場合は長さの制約がない。尺が中途半端なときはこちらを使う。BGM の一覧は [xrift-promo-audio](../xrift-promo-audio/SKILL.md) にある。

## シーンの種類

| kind | 使いどころ | 主なフィールド |
|---|---|---|
| `title` | 先頭のシリーズ見出し | `title` `eyebrow` `version` |
| `feature` | 更新の紹介 | `headline` `subhead` `background` |
| `screen` | 実画面のデモ | `source` `label` `pointer` `focus` `callouts` `keyHint` |
| `compare` | 変更前後の比較 | `before` `after` `wipeAtFrame` |
| `bullets` | 結果の整理（2〜4項目） | `heading` `items` |
| `end` | 締め | `featureLabel` `version` `note` |

各シーンには `claim`（この画面が主張する事実）と `doneWhen`（レビューの完了条件）を必ず書く。差分または実画面で裏づけられない `claim` は載せない。

フィールドの詳細は [storyboard リファレンス](references/storyboard.md)、演出の数値は [シーンと演出](references/scenes.md) にある。

## 演出の既定値

- ポインターの移動は 8〜18 フレーム。クリック波紋は自動。素材側のカーソルは収録時に消す。
- ズームは 1.25〜1.7 倍、18〜30 フレーム。1 シーンで 1 回、動画全体で 2 回まで。
- ポインター・ズーム・注釈は必ず同じ対象を指す。1 画面にポインターを 2 つ置かない。
- 字幕は `caption` に 1 文だけ。音を切っても意味が通ることを必須にする。
- 座標はすべて素材内の 0〜1。左上が `{x:0, y:0}`。取得方法は [xrift-promo-capture](../xrift-promo-capture/SKILL.md) にある。

## 横型と縦型

同じ storyboard から `Promo`（1920x1080）と `PromoVertical`（1080x1920）が出る。縦型は 16:9 をそのまま入れると画面内の文字が読めないため、キットが自動で拡大し、`focus` → `pointer.to` → 最初の `callouts` の順に注目点を中央へ寄せる。

縦型を出す場合は、シーンごとに `focus` か `pointer` を置いて注目点を決める。置かないと中央固定になり、左右の重要な UI が切れる。書き出し後に縦型の静止画を必ず確認する。

## 確認

```powershell
npm run typecheck
npm run studio                                  # タイムラインで音と尺を見る
npm run still                  # 横型の静止画
npm run still:vertical         # 縦型の静止画
pnpm exec remotion still Promo --frame=430 out/check-430.png   # 任意のフレーム
npm run render
```

Remotion Studio のタイムラインには `BGM 1` `SFX click` のように音が並ぶ。どこで何が鳴るかはここで確認する。

書き出し後の確認項目:

- 先頭 2 秒でアップデート動画だと分かる。
- 各シーンが承認済み台本の文言・尺・実画面と一致している。
- 差分にない機能や、実際には完了していない操作を主張していない。
- ポインターの先端、リング、ズーム中心が同じ対象を指している。
- ズーム後も操作対象のラベル、結果、締めの文言が切れていない。
- 音を切っても内容が分かる。
- 横型と縦型のどちらでも重要な対象が画面内にある。
- 素材のちらつき、黒画面、音の途切れがない。

`ffprobe out/xxx.mp4` で尺・解像度・音声トラックの有無を、`ffmpeg -i out/xxx.mp4 -af volumedetect -f null -` で音量を確認できる。

## Git に入れる範囲

- 入れる: `_kit/` のソースとスクリプト、`<slug>/storyboard.json`、`<slug>/src`、`<slug>/package.json`、`<slug>/tsconfig.json`、`diff.json`、台本。
- 入れない: `node_modules/`、`out/`、`public/audio/`、生成した `*.wav`、`*.mp4` / `*.webm`。
- 収録した動画素材を残す必要があるときだけ、サイズとライセンスを確認したうえで `git add -f` する。既定では `dev/release-promo/.gitignore` が除外している。
- `git add .` を使わない。パスを指定してステージし、`git diff --cached --name-only` で確認してからコミットする。

音素材は生成物なので Git に入れない。別のクローンでも `node _kit/scripts/gen-audio.mjs` で同じ波形が再生成される。

## キットを広げるとき

新しいシーン種別や演出が必要になったら、動画プロジェクト側に書かずキットへ足す。手順は [キットの拡張](references/extending.md) にある。1 本の動画のためだけの実装をプロジェクト側に残さない。
