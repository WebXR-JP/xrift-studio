# XRift Studio リリース動画キット

リリース動画に使うシーン部品・BGM・効果音・レイアウトをまとめたキットです。動画ごとに`storyboard.json`を書くと、共通の部品を使って制作できます。

制作手順は`.agents/skills/`のスキルを参照してください。

| 内容 | スキル |
|---|---|
| 企画、差分、台本、承認、レビュー | `xrift-release-promo-video` |
| キットの使い方、storyboard、シーン、書き出し | `xrift-release-promo-video/references/kit.md` |
| BGM と効果音 | `xrift-release-promo-video/references/audio.md` |
| 実画面の収録と座標 | `xrift-release-promo-video/references/capture.md` |

## 使い方

```powershell
cd dev/release-promo
pnpm install                                   # 初回だけ。ここで実行する
node _kit/scripts/new-promo.mjs --slug my-update --title "見出し" --version 0.9.0
cd my-update
npm run studio
npm run render
```

`pnpm install`は必ずこのディレクトリで実行してください。`pnpm-workspace.yaml`によって依存関係の管理範囲を分け、リポジトリ本体の`node_modules`に影響を与えないようにしています。この設定ファイルは削除しないでください。

各動画プロジェクトでは個別に依存関係を導入せず、`dev/release-promo/node_modules`を共有します。Reactを二重に読み込まないため、キットのソースを相対パスで読み込めます。

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

BGMは2系統あります。標準では、XRift Studioの制作者がSunoで作り、公開用に提供した`assets/music/`の楽曲を動画の長さに合わせて切り出します。もう1つは、`gen-audio.mjs`で合成するループ素材です。効果音はすべて合成音で、外部素材を含まないため、出典表記や外部素材のライセンス確認は不要です。

```powershell
node _kit/scripts/analyze-music.mjs assets/music/xxx.mp3   # BPM と構成を調べる
node _kit/scripts/cut-music.mjs                            # 30秒 / 60秒 を切り出す
node _kit/scripts/gen-audio.mjs                            # 効果音と合成ループ
```

Gitには、原曲の`assets/music/*.mp3`と設定ファイルの`tracks.json`、`beds.json`だけを追加してください。書き出したWAVは`.gitignore`の対象です。別のクローンでも、同じコマンドで再生成できます。

使えるBGMは`beds.json`に記載しています。楽曲から切り出したBGMは長さが決まっているため、動画の小節数をその`bars`に合わせてください。

## 動作確認

`kit-demo`は動作確認用のプロジェクトです。リリース動画としてそのまま公開しないでください。キットを変更したら、ここで静止画と動画の書き出しを確認してください。

```powershell
cd kit-demo
npm run typecheck
npm run still
npm run still:vertical
npm run render
```
