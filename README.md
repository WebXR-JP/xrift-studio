# XRift Studio

[XRift](https://xrift.net/)のワールドとアイテムを作る、非公式のデスクトップアプリです。素材の配置、見た目や動きの調整、動作確認、公開までを行えます。コードを書いて制作することもできます。

**[ダウンロード](https://github.com/WebXR-JP/xrift-studio/releases/latest)** · **[使い方](./docs/guide/index.md)** · **[ビジュアルエディターを開く](https://webxr-jp.github.io/xrift-studio/editor.html)**

> XRift公式とは無関係の有志製ツールです。編集内容は自動保存されます。開発中のため、大切なプロジェクトはファイルに書き出してバックアップも残してください。

## インストールする

Windows・macOS・Linux用のインストーラーは[ダウンロードページ](https://github.com/WebXR-JP/xrift-studio/releases/latest)から取得できます。OS別の手順は[インストールガイド](./docs/guide/installation.md)を参照してください。

### macOSでHomebrewを使う

[Homebrew](https://brew.sh/)を導入済みなら、ターミナルで次のコマンドを実行します。Apple Silicon・Intelの両方で使えるUniversal版がインストールされます。

```bash
brew tap webxr-jp/xrift-studio https://github.com/WebXR-JP/xrift-studio.git
brew install --cask webxr-jp/xrift-studio/xrift-studio
```

`tap`は、Homebrewがアプリを探すときに参照する追加の配布元です。XRift Studioでは、WebXR-JPが管理するこのリポジトリを専用の配布元（独自tap）として使います。最初の`brew tap`は初回だけ必要で、配布元を登録した後はHomebrewのコマンドでインストール・更新できます。

インストールが終わったら、アプリケーションフォルダーからXRift Studioを開きます。開発元の確認で止まった場合は、[macOSで開けないとき](./docs/guide/installation-problems.md#macosで開けない)を参照してください。

更新するときはアプリを終了し、次のコマンドを実行します。

```bash
brew update
brew upgrade --cask --greedy webxr-jp/xrift-studio/xrift-studio
```

`--greedy`は、アプリ内更新にも対応するXRift StudioをHomebrewの更新対象に含めるために指定します。削除の手順や配布定義の管理については[Homebrewでの配布](./docs/PACKAGE_MANAGERS.md)を参照してください。

## はじめて使う

1. アプリを起動して**セットアップを開始**を押します。完了したら、プロジェクト一覧の**新規プロジェクト**からビジュアルエディターを開きます。
2. [最初のワールドを作る](./docs/guide/first-world.md)に沿って、物を配置し、マテリアルで色を変えます。
3. 保存し、**Play**で歩いて確かめます。公開の準備ができたら**XRiftへ公開**へ進みます。

ブラウザ版βでは、パソコン・iPad・スマートフォンからビジュアルエディターで制作し、APIキーによるワールド送信を試せます。プロジェクトはブラウザに自動保存され、`.xriftstudio`ファイルでデスクトップ版へ引き継げます。アイテムやスクリプトを含むワールドの公開、MCPでのAI接続にはデスクトップ版を使います。

## 作りたいものから探す

| やりたいこと | ガイド |
| --- | --- |
| Entityを配置する | [編集画面の使い方](./docs/guide/editor-basics.md) |
| 色や質感を変える | [色と質感を変える](./docs/guide/materials.md) |
| マンガのような陰影と輪郭線を付ける | [MToon 0.x・1.0を使う](./docs/guide/materials.md#mtoonマンガのような陰影と輪郭線を付ける) |
| VRMアバターを配置して調整する | [VRM 0.x・1.0を取り込む](./docs/guide/assets.md#vrmアバターを取り込む) |
| 押すと動く仕掛けを作る | [ノードで動きを作る](./docs/guide/interactivity.md) |
| AIに制作を手伝ってもらう | [AI連携](./docs/guide/ai-connection.md) |
| コードで続きを作る | [コードエディターへ書き出す](./docs/guide/save-and-open.md#コードエディターへ書き出す) |
| 起動や保存で困っている | [困ったとき](./docs/guide/troubleshooting.md) |

保存場所と削除範囲は[データの保存とリセット](./docs/guide/recovery.md)、機能の制約は[対応状況](./docs/VISUAL_EDITOR_ROADMAP.md)にまとめています。不具合は[GitHub Issues](https://github.com/WebXR-JP/xrift-studio/issues)へ報告できます。ログを添える場合は、アクセストークンや個人情報を取り除いてください。

## 開発する

Node.js 20以上、pnpm 11以上と、OS別の開発環境が必要です。[開発ガイド](./DEVELOPMENT.md)を確認してから起動してください。

```bash
pnpm install
pnpm tauri:dev
```

ブラウザ版のみの起動は`pnpm dev`、型の確認は`pnpm typecheck`です。開発サーバーの`/preview.html`が紹介ページ、`/editor.html`がビジュアルエディターです。

設計・API・検証手順は[開発文書の一覧](./docs/README.md)、日本語の表記は[文章と用語のルール](./docs/JAPANESE_WRITING.md)を参照してください。

## ライセンス

MIT。素材ごとの権利表記は[THIRD_PARTY_ASSETS.md](./THIRD_PARTY_ASSETS.md)を参照してください。

Hierarchyの一部を `.xriftstudio` で書き出して別のワールド・アイテムへ追加する手順は、[Entityを別のワールド・アイテムへ渡す](./docs/guide/hierarchy-transfer.md)を参照してください。

### ChatGPT Workプラグインの開発

会話からワールドを作り、ブラウザに保存して書き出す[プラグイン用MCP実装](./packages/xrift-studio-cloud/README.md)を追加しています。共有DBやクラウド作品保存は使わず、既存のブラウザエディターと編集処理を再利用します。MCP用サーバーの配置、プラグイン接続、スマホ実機での表示確認は未実施です。現在のGitHub Pages版にMCPが自動で有効になる変更ではありません。
