# XRift Studio

XRift Studio は、[XRift](https://xrift.net/) のワールド制作を始めるための、非公式デスクトップアプリです。

Node.js や `@xrift/cli` の導入、プロジェクトの作成・編集、ローカルプレビュー、XRift への公開までをひとつの画面にまとめます。

> **注意**: XRift Studio は XRift 公式とは無関係の有志製ツールです。XRift 本体・公式 CLI・アカウントに関する問題は、[XRift 公式チャンネル](https://xrift.net/)へお問い合わせください。

## 体験設計

XRift Studio は、制作の途中で「次に何をすればよいか」を考え直させないことを大切にします。更新、作成、起動、公開の各操作では、現在の状態、次にできる行動、完了後の到達点を同じ画面の流れで伝えます。

- 新しい CLI は起動時に検知し、現在と最新のバージョンを示したうえで更新できる。
- ワールド作成後は、作ったワールドをそのまま開ける。実行後は、起動中の URL をすぐ開ける。
- アップロード前には、タイトル、説明、サムネイルが初期状態のままではないことを確認し、必要な編集から公開までをつなげる。
- プロジェクトライブラリは、サムネイル、名前、説明、件数、作成入口を一望できる制作のホームとして扱う。
- 進行中・成功・失敗を明示し、失敗した場合でもログや元の画面からやり直せるようにする。

詳細な原則と実装時の確認項目は [UX 原則](./docs/UX_PRINCIPLES.md) を参照してください。状態ごとの動きと機能一覧は [マイクロインタラクション Wiki](./docs/UX_INTERACTIONS.md) にまとめています。リポジトリの Markdown 文書では絵文字を使わず、操作名と状態を日本語で明確に書きます。

## まずはブラウザで見る

[**GitHub Pages の Web プレビューを開く →**](https://webxr-jp.github.io/xrift-studio/)

ブラウザ版では、サンプルプロジェクトのファイル一覧、コード編集画面、ワールドプレビューを確認できます。実際のログイン、ローカルファイル操作、CLI 実行、XRift への公開はデスクトップ版の機能です。

## できること

- Node.js と `@xrift/cli` をアプリ専用領域へ自動セットアップ
- ワールドプロジェクトの作成・一覧表示・サムネイル表示
- `src/World.tsx` などのプロジェクトファイルを内蔵エディタで編集
- 保存したプロジェクトを開発サーバーでローカルプレビュー
- XRift へのログイン、アップロード、公開 URL の表示
- `@xrift/cli` の最新版チェックと更新通知
- ターミナルや VS Code でプロジェクトを開く
- Tauri MCP を使った開発中の画面確認、DOM 確認、ログ確認、IPC 監視

## ダウンロード

[**最新版を GitHub Releases からダウンロード →**](https://github.com/WebXR-JP/xrift-studio/releases/latest)

| 対応 OS | 配布形式 |
| --- | --- |
| Windows 10 / 11 | `.msi`（推奨）、`.exe` |
| macOS 12 以降 | `.dmg`（Apple Silicon / Intel） |
| Linux | `.deb`、`.rpm`、`.AppImage` |

リリースがまだない場合は、[Web プレビュー](https://webxr-jp.github.io/xrift-studio/)またはソースからの開発環境をご利用ください。

## はじめて使う

1. アプリを起動します。
2. セットアップ画面で **セットアップを開始** を押します。
3. アプリ専用フォルダに Node.js と `@xrift/cli` が準備されるまで待ちます。
4. プロジェクトライブラリで **新規ワールド** を作成します。
5. プロジェクトを開き、ファイルを編集して `Ctrl/⌘ + S` で保存します。
6. **実行** でローカルプレビューを開きます。
7. 準備ができたら **アップロード** で XRift に公開します。

システムにインストール済みの Node.js、npm、`@xrift/cli` は原則として使用しません。アプリ内ランタイムはアプリ専用領域に隔離されます。

## `@xrift/cli` の更新

アプリは起動時に CLI の最新版を確認し、新しいバージョンがあれば通知します。ダイアログの **アップデート** を押すと、アプリが管理する CLI だけを更新します。

## データとリセット

アプリのランタイム、キャッシュ、ログイン情報、プロジェクトは次の場所に保存されます。

| OS | 保存場所 |
| --- | --- |
| Windows | `%APPDATA%\\net.xrift.studio\\` |
| macOS | `~/Library/Application Support/net.xrift.studio/` |
| Linux | `~/.local/share/net.xrift.studio/` |

About の **Danger Zone** から、次のリセットを実行できます。

- **ランタイムのみ**: Node.js、CLI、キャッシュ、ログイン状態を削除します。プロジェクトは残ります。
- **プロジェクトのみ**: アプリが管理するプロジェクトを削除します。
- **完全リセット**: 上記のランタイムとプロジェクトをすべて削除します。

リセット前に、残したいワールドを別の場所へバックアップしてください。

## 開発者向け

### 必要な環境

- Node.js 20 以上
- pnpm 11 以上
- Rust stable と Cargo
- Windows 10/11、macOS 12 以降、または Linux
- Windows では Microsoft C++ Build Tools と WebView2 Runtime

詳細な OS 別セットアップは [DEVELOPMENT.md](./DEVELOPMENT.md) を参照してください。

### セットアップと起動

```bash
pnpm install
pnpm tauri:dev
```

ブラウザ版だけを起動する場合は、次のコマンドを使います。

```bash
pnpm dev
```

### よく使うコマンド

| コマンド | 用途 |
| --- | --- |
| `pnpm typecheck` | TypeScript の型チェック |
| `pnpm build` | Tauri 用フロントエンドの本番ビルド |
| `pnpm tauri:build` | OS 向けインストーラのビルド |
| `pnpm build:preview` | GitHub Pages 用 Web プレビューのビルド |
| `pnpm tauri:dev` | Tauri デスクトップ開発 |

### Tauri MCP を使う

このリポジトリには [`mcp-server-tauri`](https://github.com/hypothesi/mcp-server-tauri) の設定が含まれています。

1. MCP 対応の AI クライアントでリポジトリを開きます。
2. `.mcp.json` の `tauri` サーバー設定を読み込みます。
3. `pnpm tauri:dev` でデバッグ版アプリを起動します。
4. AI クライアントを再読み込みし、スクリーンショット、DOM スナップショット、ログ、IPC 監視を依頼します。

Tauri 側の Bridge プラグインはデバッグビルドでのみ有効です。リリース版には開発用 MCP 接続を組み込みません。エージェント向けの実装ルールは [AGENT.md](./AGENT.md) にまとめています。

### リポジトリ構成

```text
src/                       React フロントエンド
  App.tsx                  デスクトップ版のメイン画面
  components/              画面コンポーネント
  lib/                     Tauri IPC と CLI のラッパー
  PreviewApp.tsx           GitHub Pages 用のブラウザプレビュー
src-tauri/                 Tauri v2 / Rust バックエンド
  src/lib.rs               ランタイム、ファイル、IPC コマンド
  capabilities/            Tauri 権限設定
  tauri.conf.json          Tauri アプリ設定
.github/workflows/         Pages とリリースの自動化
AGENT.md                   AI エージェント向け開発ルール
DEVELOPMENT.md             OS 別の開発・リリース手順
docs/UX_PRINCIPLES.md      再現可能な制作体験の設計原則
docs/UX_INTERACTIONS.md    状態ごとの動きと機能一覧を定義する Wiki
skills/xrift-studio-ux/    UX 原則を実装・レビューに適用するエージェントスキル
```

## トラブルシューティング

### セットアップに失敗する

ネットワーク接続を確認し、アプリを再起動して再試行してください。それでも直らない場合は About の Danger Zone から **ランタイムのみリセット** を実行します。

### プレビューが開かない

プロジェクトを保存してから再度 **実行** を押してください。ターミナルを開き、プロジェクトの開発サーバーのログを確認することもできます。

### 問題を報告する

[GitHub Issues](https://github.com/WebXR-JP/xrift-studio/issues) に、OS、アプリのバージョン、再現手順、ログを添えて報告してください。アカウント情報やアクセストークンは貼り付けないでください。

## 開発状況

XRift Studio は開発中です。動作する機能を優先して公開しており、OS や XRift 側の変更によって一部機能が利用できない場合があります。

今後の候補:

- AI チャットによる `World.tsx` 編集支援
- ログイン状態の検出と再認証フローの改善
- コード署名と自動更新
- より詳しいビルド・公開ログ

## ライセンス

MIT
