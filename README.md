# XRift Studio

[XRift](https://xrift.net/)のワールドとアイテムを作る、非公式のデスクトップアプリです。素材の配置、見た目や動きの調整、動作確認、公開までを行えます。コードを書いて制作することもできます。

**[ダウンロード](https://github.com/WebXR-JP/xrift-studio/releases/latest)** · **[使い方](./docs/wiki/index.md)** · **[ブラウザで試す](https://webxr-jp.github.io/xrift-studio/)**

> XRift公式とは無関係の有志製ツールです。開発中のため、大切なプロジェクトは別の場所にも保存してください。

## はじめて使う

1. アプリを起動し、**セットアップを開始**を押します。制作に必要なNode.jsと`@xrift/cli`を、アプリ専用のフォルダーに準備します。
2. **新規プロジェクト**から、ワールドかアイテムを選びます。画面上で素材を配置する場合は**ビジュアル編集**を選んでください。
3. **Assets**に3Dモデルや画像、音声を読み込み、**シーン**へドラッグして配置します。
4. Entityを選び、**Inspector**で位置、マテリアル、音などを調整します。動きは**ノードグラフ**で組み立てられます。
5. `Ctrl/⌘ + S`で保存し、**動作確認**を押します。完成したら**XRiftへ公開**から公開します。

OS別の導入手順は[インストールガイド](./docs/wiki/installation.md)を参照してください。ブラウザ版は操作を試すためのデモです。ログイン、ローカルファイルの操作、CLIの実行、公開にはデスクトップ版を使います。

## 作りたいものから探す

| やりたいこと | ガイド |
| --- | --- |
| Entityを配置する | [編集画面の使い方](./docs/wiki/visual-editor.md) |
| 色や質感を変える | [素材とマテリアル](./docs/wiki/assets-and-materials.md) |
| 押すと動く仕掛けを作る | [ノードで動きを作る](./docs/wiki/interactivity.md) |
| AIに制作を手伝ってもらう | [AI連携](./docs/wiki/ai-connection.md) |
| コードで続きを作る | [コード編集用に書き出す](./docs/wiki/classic-export.md) |
| 起動や保存で困っている | [困ったとき](./docs/wiki/troubleshooting.md) |

保存場所と削除範囲は[データの保存とリセット](./docs/wiki/data-and-reset.md)、機能の制約は[対応状況](./docs/VISUAL_EDITOR_ROADMAP.md)にまとめています。不具合は[GitHub Issues](https://github.com/WebXR-JP/xrift-studio/issues)へ報告できます。ログを添える場合は、アクセストークンや個人情報を取り除いてください。

## 開発する

Node.js 20以上、pnpm 11以上と、OS別の開発環境が必要です。[開発ガイド](./DEVELOPMENT.md)を確認してから起動してください。

```bash
pnpm install
pnpm tauri:dev
```

ブラウザ版のみの起動は`pnpm dev`、型の確認は`pnpm typecheck`です。

設計・API・検証手順は[開発文書の一覧](./docs/README.md)、日本語の表記は[文章と用語のルール](./docs/JAPANESE_WRITING.md)を参照してください。

## ライセンス

MIT。素材ごとの権利表記は[THIRD_PARTY_ASSETS.md](./THIRD_PARTY_ASSETS.md)を参照してください。
