# XRift Studio

[XRift](https://xrift.net/)のワールドとアイテムを作る、非公式のデスクトップアプリです。素材の配置、見た目や動きの調整、動作確認、公開までを行えます。コードを書いて制作することもできます。

**[ダウンロード](https://github.com/WebXR-JP/xrift-studio/releases/latest)** · **[使い方](./docs/guide/index.md)** · **[ブラウザで試す](https://webxr-jp.github.io/xrift-studio/)**

> XRift公式とは無関係の有志製ツールです。開発中のため、大切なプロジェクトは別の場所にも保存してください。

## はじめて使う

1. アプリを起動し、**ワールドを作る**からビジュアルエディターを開きます。公開に使うツールのセットアップは後で行えます。
2. [最初のワールドを作る](./docs/guide/first-world.md)に沿って、物を配置し、マテリアルで色を変えます。
3. 保存し、**Play**で歩いて確かめます。公開の準備ができたら**XRiftへ公開**へ進みます。

OS別の導入手順は[インストールガイド](./docs/guide/installation.md)を参照してください。ブラウザ版は操作を試すためのデモです。ログイン、ローカルファイルの操作、CLIの実行、公開にはデスクトップ版を使います。

## 作りたいものから探す

| やりたいこと | ガイド |
| --- | --- |
| Entityを配置する | [編集画面の使い方](./docs/guide/editor-basics.md) |
| 色や質感を変える | [色と質感を変える](./docs/guide/materials.md) |
| 押すと動く仕掛けを作る | [ノードで動きを作る](./docs/guide/interactivity.md) |
| AIに制作を手伝ってもらう | [AI連携](./docs/guide/ai-connection.md) |
| コードで続きを作る | [コードエディター用に書き出す](./docs/VISUAL_EDITOR_ROADMAP.md) |
| 起動や保存で困っている | [困ったとき](./docs/guide/troubleshooting.md) |

保存場所と削除範囲は[データの保存とリセット](./docs/guide/recovery.md)、機能の制約は[対応状況](./docs/VISUAL_EDITOR_ROADMAP.md)にまとめています。不具合は[GitHub Issues](https://github.com/WebXR-JP/xrift-studio/issues)へ報告できます。ログを添える場合は、アクセストークンや個人情報を取り除いてください。

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

### XR Previewと部屋の取り込み（実機検証中）

Scene ViewのXRパネルからPCのRuntimeを診断し、外部ブラウザでVRを確認できます。Quest Browserで取得した部屋の形状はGLBとして取り込めます。[使い方](docs/guide/xr-spatial.md)と[実装・未対応範囲](docs/OPENXR_SPATIAL_AUTHORING.md)を参照してください。
