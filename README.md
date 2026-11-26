# XRift Studio

[XRift](https://xrift.net/) 向けのワールドやアイテムを制作できる、非公式のデスクトップアプリです。素材の配置、質感や動きの調整、動作確認から公開までをひとつの画面で完結でき、コードを書いて作り込むこともできます。

[ダウンロード](https://github.com/WebXR-JP/xrift-studio/releases/latest) · [使い方ガイド](./docs/guide/index.md) · [ブラウザ版ビジュアルエディターを開く](https://webxr-jp.github.io/xrift-studio/editor.html)

> XRift 公式とは無関係の有志製ツールです。編集内容は自動で保存されますが、開発中のアプリのため、大切なプロジェクトはこまめにファイルへ書き出してバックアップを取っておくことをおすすめします。

## インストール

Windows・macOS・Linux 向けのインストーラーは [リリースページ](https://github.com/WebXR-JP/xrift-studio/releases/latest) からダウンロードできます。OS ごとの詳しい手順は [インストールガイド](./docs/guide/installation.md) をご覧ください。

### macOS（Homebrew）

[Homebrew](https://brew.sh/) をお使いの場合は、ターミナルから次のコマンドでインストールできます（Apple Silicon・Intel 両対応の Universal 版）。

```bash
brew tap webxr-jp/xrift-studio https://github.com/WebXR-JP/xrift-studio.git
brew install --cask webxr-jp/xrift-studio/xrift-studio
```

`brew tap` の登録は初回のみ必要です。インストール後は、アプリケーションフォルダーから XRift Studio を起動してください。開発元の確認ダイアログで開けない場合は、[macOS で開けないとき](./docs/guide/installation-problems.md#macosで開けない) を参考にしてください。

アップデートするときは、アプリを終了してから次を実行します。

```bash
brew update
brew upgrade --cask --greedy webxr-jp/xrift-studio/xrift-studio
```

XRift Studio はアプリ内アップデートに対応しているため、Homebrew 側から更新する際は `--greedy` を付けます。アンインストール手順や配布定義の管理方法は [Homebrew での配布](./docs/PACKAGE_MANAGERS.md) にまとめています。

## はじめての方へ

1. アプリを起動して「セットアップを開始」をクリックします。完了してプロジェクト一覧が開いたら、「新規プロジェクト」からビジュアルエディターを起動します。
2. [最初のワールドを作る](./docs/guide/first-world.md) に沿ってオブジェクトを配置し、マテリアルで色を変えてみます。
3. 自動保存されたら「Play」で実際に歩いて確認し、準備ができたら「XRiftへ公開」からアップロードします。

インストール不要の **ブラウザ版 β** でも、PC・iPad・スマートフォンからビジュアルエディターで制作し、API キーを使ってワールドやアイテムを公開できます。プロジェクトはブラウザ内に保存され、`.xriftstudio` ファイルに書き出せばデスクトップ版へ引き継げます。なお、スクリプトを含む作品の公開や、ChatGPT・MCP との連携にはデスクトップ版が必要です。

## 目的別ガイド

| やりたいこと | ガイド |
| --- | --- |
| Entity の配置や画面操作を知る | [画面の見方と視点操作](./docs/guide/editor-basics.md) |
| 色や質感を変える | [色と質感を変える](./docs/guide/materials.md) |
| アニメ調の陰影と輪郭線を付ける | [MToon 0.x・1.0 を使う](./docs/guide/materials.md#mtoonマンガのような陰影と輪郭線を付ける) |
| VRM アバターを配置・調整する | [VRM 0.x・1.0 を取り込む](./docs/guide/assets.md#vrmアバターを取り込む) |
| 押すと動く仕掛けを作る | [ボタンで動く仕掛けを作る](./docs/guide/interactivity.md) |
| 作った Entity を別プロジェクトへ渡す | [Entity を別のワールド・アイテムへ渡す](./docs/guide/hierarchy-transfer.md) |
| AI に制作を手伝ってもらう | [AI に編集を手伝ってもらう](./docs/guide/ai-connection.md) |
| コードエディターで続きを作る | [コードエディターへ書き出す](./docs/guide/save-and-open.md#コードエディターへ書き出す) |
| 起動・保存などのトラブルを解決する | [困ったときに探す](./docs/guide/troubleshooting.md) |

データの保存先や初期化の範囲は [データの保存とリセット](./docs/guide/recovery.md)、現在の対応機能や制限事項は [対応状況](./docs/VISUAL_EDITOR_ROADMAP.md) にまとめています。不具合を見つけた場合は [GitHub Issues](https://github.com/WebXR-JP/xrift-studio/issues) までご報告ください（ログを添付する際は、アクセストークンや個人情報をあらかじめ取り除いてください）。

## 開発者向け

ソースからビルドするには、Node.js 20 以上、pnpm 11 以上、および各 OS の開発環境が必要です。詳しくは [開発ガイド](./DEVELOPMENT.md) をご覧ください。

```bash
pnpm install
pnpm tauri:dev
```

- ブラウザ版のみ起動: `pnpm dev`（`/preview.html` が紹介ページ、`/editor.html` がビジュアルエディター）
- 型チェック: `pnpm typecheck`

設計ドキュメント・API 仕様・検証手順は [開発ドキュメント一覧](./docs/README.md)、画面名や用語の基準は [日本語表記と用語ガイド](./docs/JAPANESE_WRITING.md) を参照してください。

## ライセンス

MIT ライセンスです。同梱している第三者素材の権利表記は [THIRD_PARTY_ASSETS.md](./THIRD_PARTY_ASSETS.md) を参照してください。
