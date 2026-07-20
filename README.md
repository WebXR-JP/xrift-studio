# XRift Studio

XRift Studio は、[XRift](https://xrift.net/) のワールドとアイテムの制作を始めるための、非公式デスクトップアプリです。

Node.js や `@xrift/cli` の導入、コードまたはビジュアルエディターによる制作、ローカルプレビュー、XRift への公開までをひとつの画面にまとめます。

> **注意**: XRift Studio は XRift 公式とは無関係の有志製ツールです。XRift 本体・公式 CLI・アカウントについては、[XRift 公式サイト](https://xrift.net/)をご確認ください。

## 対応機能チェックリスト

現行のデスクトップ版で利用できる機能を、制作の流れに沿ってまとめています。

| やりたいこと | ワールド | アイテム | 現在できること |
| --- | --- | --- | --- |
| 制作環境を準備する | 対応 | 対応 | アプリ専用領域へ Node.js と `@xrift/cli` をセットアップする。システム側の環境と分けて管理できる。 |
| CLI を最新にする | 対応 | 対応 | 起動時に現在と最新のバージョンを確認し、アプリが管理する CLI だけを更新する。 |
| プロジェクトを探して再開する | 対応 | 対応 | 種別、サムネイル、名前、説明をカードで一覧表示し、選んだプロジェクトを開く。 |
| 新しいプロジェクトを作る | 対応 | 対応 | ワールド／アイテムと、クラシック／ビジュアルの4通りから選び、作成後のプロジェクトをそのまま開く。 |
| コードと設定を編集する | 対応 | 対応 | 内蔵エディタでテキストファイルを編集・保存する。`xrift.json` はフォームと raw JSON の両方で編集できる。 |
| シーンをビジュアル編集する | 対応 | 対応 | Hierarchy、Scene View、Inspector、Assetsを使い、Primitive、Model、Prefab、XRift Componentを配置してギズモで調整する。 |
| アセットと表現を作る | 対応 | 対応 | GLB／glTFとTextureをドラッグ＆ドロップで取り込み、Material、Particle、PrefabをAssetsで管理してInspectorから編集する。 |
| 衝突判定を設定する | 対応 | 対応 | PrimitiveにはBox Collider、インポートModelにはMesh Colliderを初期設定し、Center／Half Extentsの編集と自動フィットを行う。 |
| Editor内でPlay確認する | 対応 | 対応 | 編集状態を保持したままPlayへ切り替え、ワールドではWASD操作、アイテムでは周囲からの見え方を確認する。 |
| 画像や 3D 素材を管理する | 対応 | 対応 | ファイルの追加、名前変更、削除、画像プレビュー、3D モデルプレビューを行う。 |
| 公開情報を整える | 対応 | 対応 | タイトル、説明、ビルド設定、サムネイルを編集する。ワールドでは物理・カメラ、アイテムでは権限も設定できる。 |
| ローカルで動作を確認する | 対応 | 対応 | 開発サーバーを起動・停止し、プレビュー URL をブラウザで開く。実行ログも同じ画面で確認する。 |
| アイテムを検査する | 該当なし | 対応 | ビルドを含むセキュリティチェックを実行し、結果と修正に必要なログを確認する。 |
| XRift に公開する | 対応 | 対応 | ログイン後、タイトル・説明・サムネイルを確認する。ビジュアル制作データは保存・検査・XRift向けTSX変換を行ってから種別に応じてアップロードする。 |
| 公開したものを確認する | 対応 | 対応 | アップロード完了後に公開 URL を表示し、そのまま XRift のページを開く。 |
| 外部ツールで作業を続ける | 対応 | 対応 | プロジェクトを VS Code またはターミナルで開く。 |

`対応` はデスクトップ版で操作できることを示します。ブラウザ版は制作フローを確認するための Web プレビューであり、ログイン、ファイル操作、CLI 実行、アップロードは行いません。

## 体験設計

XRift Studio は、制作の途中で「次に何をすればよいか」を考え直させないことを大切にします。更新、作成、起動、公開の各操作では、現在の状態、次にできる行動、完了後の到達点を同じ画面の流れで伝えます。

- 新しい CLI は起動時に検知し、現在と最新のバージョンを示したうえで更新できる。
- 作成前にワールドまたはアイテムを選べ、作成後は結果のプロジェクトをそのまま開ける。実行後は、起動中の URL をすぐ開ける。
- アップロード前には、タイトル、説明、サムネイルが初期状態のままではないことを確認し、必要な編集から公開までをつなげる。
- プロジェクトライブラリは、サムネイル、名前、説明、件数、作成入口を一望できる制作のホームとして扱う。
- 進行中・成功・失敗を明示し、失敗した場合でもログや元の画面からやり直せるようにする。

詳細な原則と実装時の確認項目は [UX 原則](./docs/UX_PRINCIPLES.md) を参照してください。状態ごとの動きと機能一覧は [マイクロインタラクション Wiki](./docs/UX_INTERACTIONS.md) にまとめています。リポジトリの Markdown 文書では絵文字を使わず、操作名と状態を日本語で明確に書きます。

## まずはブラウザで見る

[**GitHub Pages の Web プレビューを開く →**](https://webxr-jp.github.io/xrift-studio/)

ブラウザ版では、ワールドとアイテムを選べる制作フロー、サンプルプロジェクトのファイル一覧、コード編集画面、プレビューを確認できます。実際のログイン、ローカルファイル操作、CLI 実行、XRift への公開はデスクトップ版の機能です。

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
4. プロジェクトライブラリで **新規プロジェクト** を選び、ワールド／アイテムとクラシック／ビジュアルを選びます。
5. クラシックではコードを編集し、ビジュアルではAssetsからSceneへ素材を配置してInspectorで設定します。
6. `Ctrl/⌘ + S` で保存し、**実行** または **Play** で動作を確認します。
7. 準備ができたら **アップロード** で保存・検査・変換を行い、XRift に公開します。

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

リセット前に、残したいワールドやアイテムを別の場所へバックアップしてください。

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
    visual-editor/         Hierarchy、Scene、Inspector、Assets、Play、Upload
  lib/                     Tauri IPC と CLI のラッパー
    visual-editor/         Scene/Asset/Prefab IR、履歴、検査、XRift向けcompiler
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
docs/VISUAL_EDITOR_ARCHITECTURE.md Visual project のデータ・実行境界
docs/VISUAL_EDITOR_ROADMAP.md      12段階の実装順序と完了条件
.agents/skills/            XRift Studio の実装・UX・検証に使うエージェントスキル
```

## トラブルシューティング

### セットアップに失敗する

ネットワーク接続を確認し、アプリを再起動して再試行してください。それでも直らない場合は About の Danger Zone から **ランタイムのみリセット** を実行します。

### プレビューが開かない

プロジェクトを保存してから再度 **実行** を押してください。ターミナルを開き、プロジェクトの開発サーバーのログを確認することもできます。

### 問題を報告する

[GitHub Issues](https://github.com/WebXR-JP/xrift-studio/issues) に、OS、アプリのバージョン、再現手順、ログを添えて報告してください。アカウント情報やアクセストークンは貼り付けないでください。

## 開発状況

XRift Studio は開発中です。Visual Editor は Material / Texture、Starter World、XRift Componentを現在の優先領域とし、その後にModel import、Play runtime、workspace品質、production readinessへ進みます。実装順序と「何をもって完了とするか」は [Visual Editor Roadmap](./docs/VISUAL_EDITOR_ROADMAP.md) にまとめています。

## ライセンス

MIT
