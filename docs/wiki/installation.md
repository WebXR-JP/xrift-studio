# インストールとセットアップ

XRift Studio をインストールして、最初の制作環境を準備する手順を説明します。

## 1. アプリのダウンロード

[**GitHub Releases の最新版**](https://github.com/WebXR-JP/xrift-studio/releases/latest) から、お使いの OS に合ったインストーラをダウンロードします。

| 対応 OS | 配布形式 |
| --- | --- |
| Windows 10 / 11 | `.msi`（推奨）、`.exe` |
| macOS 12 以降 | `.dmg`（Apple Silicon / Intel） |
| Linux | `.deb`、`.rpm`、`.AppImage` |

リリースがまだない場合は、[Web プレビュー](https://webxr-jp.github.io/xrift-studio/)またはソースからの開発環境をご利用ください。

## 2. アプリを起動する

インストールしたアプリを起動すると、最初に**セットアップ画面**が表示されます。

## 3. セットアップを開始する

セットアップ画面で **セットアップを開始** を押します。

XRift Studio は、システムにインストール済みの Node.js、npm、`@xrift/cli` を**原則として使用しません**。アプリ専用フォルダに、次のものを隔離して準備します。

- **Node.js**: アプリ専用のランタイム
- **`@xrift/cli`**: XRift の公式 CLI

セットアップが完了するまで待ちます。ネットワーク接続が必要です。

## 4. セットアップ完了後

セットアップが完了すると、**プロジェクトライブラリ**が表示されます。ここから新しいプロジェクトを作成できます。

次のステップは [プロジェクトの作成とライブラリ](./projects.md) を参照してください。

## アプリ本体と CLI の更新

XRift Studio は、起動時に次の更新を自動で確認します。

### `@xrift/cli` の更新

アプリは起動時に CLI の最新版を確認し、新しいバージョンがあれば通知します。ダイアログの **アップデート** を押すと、アプリが管理する CLI だけを更新します。システム側の CLI には影響しません。

### XRift Studio 本体の更新

アプリは起動時に [GitHub Releases](https://github.com/WebXR-JP/xrift-studio/releases/latest) の最新版を確認します。新しいバージョンがある場合は、署名済みの更新をアプリ内でダウンロードし、インストール後に自動で再起動できます。設定画面の **更新を確認** から手動でも確認できます。

## セットアップに失敗する場合

ネットワーク接続を確認し、アプリを再起動して再試行してください。それでも直らない場合は、About の Danger Zone から **ランタイムのみリセット** を実行します。詳しくは [データの保存場所とリセット](./data-and-reset.md) を参照してください。

## 開発者向け：ソースからビルドする

ソースから自分でビルド・改変する場合は、[開発ガイド](../../DEVELOPMENT.md) を参照してください。必要な環境は次のとおりです。

- Node.js 20 以上
- pnpm 11 以上
- Rust stable と Cargo
- Windows 10/11、macOS 12 以降、または Linux
- Windows では Microsoft C++ Build Tools と WebView2 Runtime

```bash
pnpm install
pnpm tauri:dev
```
