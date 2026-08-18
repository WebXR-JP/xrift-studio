# XRift Studio リリース動画キット

リリース動画を毎回ゼロから作らないための共通基盤。動画ごとに書くのは `storyboard.json` だけで、シーン部品・BGM・効果音・レイアウトはここが持つ。

進め方は `.agents/skills/` のスキルを見る。

| 内容 | スキル |
|---|---|
| 企画、差分、台本、承認、レビュー | `xrift-release-promo-video` |
| キットの使い方、storyboard、シーン、書き出し | `xrift-promo-kit` |
| BGM と効果音 | `xrift-promo-audio` |
| 実画面の収録と座標 | `xrift-promo-capture` |

## 使い方

```powershell
cd dev/release-promo
pnpm install                                   # 初回だけ。ここで実行する
node _kit/scripts/new-promo.mjs --slug my-update --title "見出し" --version 0.9.0
cd my-update
npm run studio
npm run render
```

`pnpm install` は必ずこのディレクトリで実行する。`pnpm-workspace.yaml` があるおかげで、リポジトリ本体の `node_modules` を巻き込まない。消さないこと。

各動画プロジェクトは依存を持たず、`dev/release-promo/node_modules` を共有する。React が二重に読み込まれないので、キットのソースを相対パスでそのまま読み込める。

## 中身

```text
_kit/
├─ src/
│  ├─ Promo.tsx            storyboard をシーンの列に展開する入口
│  ├─ core/                storyboard の型、拍グリッド、テーマ、レイアウト
│  ├─ scenes/              タイトル・機能紹介・実画面・前後比較・箇条書き・締め
│  ├─ overlays/            ポインター、字幕、注釈、キー表示
│  ├─ stage/               画面キャプチャの枠と背景
│  └─ audio/               BGM と効果音の配置
├─ scripts/
│  ├─ dsp.mjs              波形・フィルタ・リバーブ・WAV 書き出し
│  ├─ instruments.mjs      楽器と効果音の合成
│  ├─ gen-audio.mjs        効果音と合成ループの生成
│  ├─ analyze-music.mjs    楽曲の BPM・小節・構成の解析
│  ├─ cut-music.mjs        楽曲から動画の尺への切り出し
│  ├─ sync-assets.mjs      音素材を各プロジェクトの public/audio へ配る
│  └─ new-promo.mjs        新しい動画プロジェクトを作る
├─ assets/music/           原曲と切り出しの設計（tracks.json）
├─ assets/audio/           生成した WAV。Git には入れない
├─ beds.json               使える BGM の一覧。TypeScript とスクリプトの両方が読む
└─ template/               新規プロジェクトの雛形
```

## 音について

BGM は 2 系統。標準は `assets/music/` の楽曲を動画の尺に合わせて切り出したもので、XRift Studio の制作者が Suno で作成し、公開してよいものとして提供している。もう 1 つは `gen-audio.mjs` が合成するループ素材。効果音はすべて合成音。外部素材を含まないので、出典表記もライセンス確認もいらない。

```powershell
node _kit/scripts/analyze-music.mjs assets/music/xxx.mp3   # BPM と構成を調べる
node _kit/scripts/cut-music.mjs                            # 30秒 / 60秒 を切り出す
node _kit/scripts/gen-audio.mjs                            # 効果音と合成ループ
```

Git に入れるのは原曲（`assets/music/*.mp3`）と設計（`tracks.json` `beds.json`）だけ。書き出した WAV は `.gitignore` 対象で、別のクローンでも同じコマンドで同じものが揃う。

使える BGM の一覧は `beds.json`。楽曲から切り出した BGM は長さが決まっているので、動画の小節数をその `bars` に合わせる。

## 動作確認

`kit-demo` がキットの動作確認用プロジェクト。実際のリリース動画ではないので、そのまま公開しない。キットを変更したら、ここで静止画と書き出しを確認する。

```powershell
cd kit-demo
npm run typecheck
npm run still
npm run still:vertical
npm run render
```
