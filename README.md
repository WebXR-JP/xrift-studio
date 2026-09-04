# XRift Studio

XRift Studio は、[XRift](https://xrift.net/) のワールドとアイテムを制作するための非公式デスクトップアプリです。

Node.js や `@xrift/cli` の導入、コードまたはビジュアルエディターによる制作、ローカルプレビュー、XRift への公開までをひとつの画面にまとめます。

> **注意**: XRift Studio は XRift 公式とは無関係の有志製ツールです。XRift 本体・公式 CLI・アカウントについては、[XRift 公式サイト](https://xrift.net/)をご確認ください。

## できること

- [プロジェクトを作る・再開する](./docs/wiki/projects.md): World / Item と、コード編集 / ビジュアル編集を選ぶ。
- [シーンを編集する](./docs/wiki/visual-editor.md): オブジェクトを配置し、素材・光・地形を調整する。
- [素材を取り込む](./docs/wiki/importing-assets.md): 3D モデル、画像、音などをプロジェクトで管理する。
- [動きを付ける](./docs/wiki/interactivity.md): ノードグラフで動作を組み立てる。コードを書く場合は [Script](./docs/wiki/scripting.md) を使う。
- [動作を確認する](./docs/wiki/play-mode.md): Play で歩いたり操作したりして、公開前に確認する。
- [XRift に公開する](./docs/wiki/publishing.md): タイトル・説明・サムネイルを整え、保存・検査・変換してアップロードする。

対応形式と制約は各ガイド、開発中の項目は [対応範囲と今後の課題](./docs/VISUAL_EDITOR_ROADMAP.md) にまとめています。ブラウザ版は制作フローのデモです。ログイン、ローカルファイル操作、CLI 実行、公開はデスクトップ版を使ってください。

## Visual projectを通常のXRift開発へ書き出す

Visual Editorで作ったプロジェクトのJSONとアセット一式を、XRiftのクラシックプロジェクトへ書き出せます。逆方向の変換には対応していません。

Visual Editorのヘッダーにある「Classicへ書き出す」では、既存のクラシックプロジェクトに追加できます。手書きのエントリーファイルを残してComponentを追加する方法と、バックアップを作ってエントリーファイルを切り替える方法を選べます。依存パッケージの変更予定も確認できます。完了後は、書き出し先のフォルダー、VS Code、ターミナルを開けます。

新しい空のフォルダーへ書き出す場合はCLIを使います。`--dry-run`で変更予定を確認でき、書き出した後に編集していないファイルは`--update`で更新できます。衝突の検出と、書き出し元・生成ファイルの記録（provenance）にも対応しています。

```bash
xrift-studio convert ./my-visual-project --to classic --out ./my-xrift-world
```

この変換CLIはnpm公開前のため、`pnpm cli:build`でビルドして`node dist/cli/xrift-studio.mjs`から実行します。書き出すのは公開時にXRiftへ送るものと同じTypeScript / React Three Fiberのソースで、書き出し先は公式テンプレートの依存関係だけで`npm install`と`npm run dev`が通ります。仕様は[Visual Project Classic Export CLI](./docs/VISUAL_PROJECT_MIGRATION_CLI.md)を参照してください。

起動中の Studio をターミナルから操作する場合は、同梱の `xrift-studio-mcp-sidecar` を使います。MCP と同じ全ツールを呼び出し、結果を JSON、撮影画像を PNG で受け取れます。Node.js やリポジトリのクローンは不要です。[操作方法](./docs/MCP_EDITOR_TOOLS.md#cli-から操作する)を参照してください。

## 体験設計

XRift Studio は、制作の途中で「次に何をすればよいか」を考え直させないことを大切にします。更新、作成、起動、公開の各操作では、現在の状態と次にできる操作を表示し、完了後は作成物や公開先を開けるようにします。

- 新しいアプリ本体と CLI は起動時に検知し、現在と最新のバージョンを示したうえでそれぞれ更新できる。
- 作成前にワールドまたはアイテムを選べ、作成後は結果のプロジェクトをそのまま開ける。実行後は、起動中の URL をすぐ開ける。
- アップロード前には、タイトル、説明、サムネイルが初期状態のままではないことを確認し、必要な編集から公開までをつなげる。
- プロジェクトライブラリは、サムネイル、名前、説明、件数、新規作成ボタンをまとめて表示し、制作の開始と再開に使えるようにする。
- 進行中・成功・失敗を明示し、失敗した場合でもログや元の画面からやり直せるようにする。

詳細な原則と実装時の確認項目は [UX 原則](./docs/UX_PRINCIPLES.md) を参照してください。状態ごとの動きと機能一覧は [マイクロインタラクション Wiki](./docs/UX_INTERACTIONS.md) にまとめています。リポジトリの Markdown 文書では絵文字を使わず、操作名と状態を日本語で明確に書きます。

## まずはブラウザで見る

[**GitHub Pages の Web プレビューを開く →**](https://webxr-jp.github.io/xrift-studio/)

ブラウザ版では、ワールドとアイテムを選べる制作フロー、コード編集画面、3Dプレビューに加え、ビジュアルエディターのデモを確認できます。実際のログイン、ローカルファイル操作、CLI実行、XRiftへの公開はデスクトップ版の機能です。

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

## XRift Studio 本体の更新

アプリは起動時に [GitHub Releases](https://github.com/WebXR-JP/xrift-studio/releases/latest) の最新版を確認します。新しいバージョンがある場合は、署名済みの更新をアプリ内でダウンロードし、インストール後に自動で再起動できます。設定画面の **更新を確認** から手動でも確認できます。

## データとリセット

アプリのランタイム、キャッシュ、ログイン情報、プロジェクトは次の場所に保存されます。

| OS | 保存場所 |
| --- | --- |
| Windows | `%APPDATA%\\net.xrift.studio\\` |
| macOS | `~/Library/Application Support/net.xrift.studio/` |
| Linux | `~/.local/share/net.xrift.studio/` |

設定とバージョン情報の **危険領域 (Danger Zone)** から、次のリセットを実行できます。どちらも削除内容の確認を経てから実行し、完了後にアプリを再起動します。

- **ランタイムのみ**: Node.js、`@xrift/cli`、ログイン状態を削除します。プロジェクトは残ります。
- **完全リセット**: 上記に加えて、アプリが管理するすべてのプロジェクトを削除します。元に戻せません。

完全リセットの前に、残したいワールドやアイテムを別の場所へバックアップしてください。

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

### AI connection／Tauri MCPを使う

ビジュアルエディターの「AI connection」パネルでは、インストール済みのCodex、Claude Code、Claude Desktop / Cowork、OpenCode、Cursorを検出し、XRift StudioのMCPサーバーを登録できます。

Ollamaがある場合は、ローカルモデルと接続先（Codex、Claude Code、OpenCode）を選べます。XRift MCPの登録と、Ollamaをモデルの提供元として使う設定をまとめて行えます。設定時にモデルがツール呼び出しに対応しているか再確認します。モデルのダウンロードやクライアントの起動は自動では行いません。

登録後にAIクライアントを再起動するか、MCPを再読み込みすると、開いているSceneの読み取り、Entityの更新、Assetの配置など、許可された操作を利用できます。

制作目標と画像の確認状況はStudioが保存し、MCPの再接続後も引き継げます。撮影画像はMCPから直接受け取り、録画は制作中のワールドの`Recording/`に保存します。利用者がこのリポジトリをクローンしたり、追加の実行スクリプトを用意したりする必要はありません。[ワールド制作ハーネス](./docs/WORLD_AUTHORING_HARNESS.md)を参照してください。

画面共有、ミラー、イベントのタグ選択などは、ワールドで体験することに合わせて選べます。MCPは既存設備の一覧と配置・確認の手順を返し、客席からの見え方、操作する場所、通路、周囲との収まりを整える作業を支援します。

複数のクライアントが同時に操作した場合は、編集を順番に処理します。処理中で受け付けられない場合は`EDITOR_BUSY`を返します。クライアントはSceneの最新のリビジョンを取得して再試行できます。Claude Desktop / Coworkはローカルセッションで利用できます。リモートのCoworkではローカルMCPサーバーを起動できません。

MCPサーバーはTauri側の中継処理を介して、現在開いているEditorへ接続します。リクエストのサイズ、利用できるツール名、応答の待ち時間を制限します。Editorが待機していないときは操作を受け付けません。配布時は`pnpm mcp:sidecar:prepare:release`でserver binaryを準備し、Tauri sidecarとして同梱します。

公開しているEditor toolの一覧と、意図的に公開していない操作は[MCP editor toolの全体像](./docs/MCP_EDITOR_TOOLS.md)にまとめています。

開発中の画面調査には従来のTauri Bridgeも利用できます。`pnpm tauri:dev`でデバッグ版を起動し、`.mcp.json`の`tauri`設定をMCP対応clientから読み込みます。Tauri Bridgeはデバッグビルド専用です。エージェント向けの実装ルールは[AGENT.md](./AGENT.md)にまとめています。

画面をスクリーンショットで確認しながら開発する手順は[MCP画面デバッグガイド](./docs/MCP_DEBUGGING.md)にまとめています。Codexはリポジトリの`.mcp.json`をそのまま使えます。DeepSeekなど別のMCP hostでは、`pnpm mcp:debug-config`で生成した設定を追加してください。

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
  src/mcp.rs               AI client登録、MCP broker、sidecar起動
  capabilities/            Tauri 権限設定
  tauri.conf.json          Tauri アプリ設定
scripts/prepare-mcp-sidecar.mjs    MCP sidecarの開発／配布準備
.github/workflows/         Pages とリリースの自動化
AGENT.md                   AI エージェント向け開発ルール
DEVELOPMENT.md             OS 別の開発・リリース手順
docs/README.md             文書の一覧と、最初に読む順序
docs/VISUAL_EDITOR_ARCHITECTURE.md 設計の正本。データ・実行境界・変換
docs/VISUAL_EDITOR_ROADMAP.md      対応範囲、設計上の境界、段階と完了判定
docs/UX_PRINCIPLES.md      再現可能な制作体験の設計原則
docs/UX_INTERACTIONS.md    状態ごとの動きと機能一覧を定義する Wiki
docs/wiki/                 利用者向けの使い方ガイド。GitHub Pages でも配布
docs/ux/                   分野別の操作・状態設計と共通の動き
.agents/skills/            XRift Studio の実装・UX・検証に使うエージェントスキル
```

## トラブルシューティング

### セットアップに失敗する

ネットワーク接続を確認し、アプリを再起動して再試行してください。それでも直らない場合は 右上の歯車から設定とバージョン情報を開き、危険領域 (Danger Zone) の **ランタイムのみ** を実行します。

### プレビューが開かない

プロジェクトを保存してから再度 **実行** を押してください。ターミナルを開き、プロジェクトの開発サーバーのログを確認することもできます。

### Issueを相談する

[Issue相談GPTの設定と使い方](./docs/BUG_REPORT_GPT.md)では、バグ報告と機能要望を相談しながら、Issueの下書きを作る流れをまとめています。[ヘルプセンターGPTを開く](https://chatgpt.com/g/g-6a6d32ac1de881919670c649f51b52a7-heruhusenta)こともできます。デスクトップ版のプロジェクト一覧には「ヘルプと報告」があり、環境情報のコピーと現在の画面の保存を行ってからGitHub / ChatGPTへ進めます。

[GitHubで新しいIssueを作成する](https://github.com/WebXR-JP/xrift-studio/issues/new)こともできます。アカウント情報やアクセストークンは貼り付けないでください。

## 開発状況

XRift Studioは開発中です。機能ごとの対応状況と開発段階、各段階の完了条件は[対応範囲と段階](./docs/VISUAL_EDITOR_ROADMAP.md)にまとめています。設計そのものは[ビジュアルエディター設計](./docs/VISUAL_EDITOR_ARCHITECTURE.md)、文書の一覧は[docs/README.md](./docs/README.md)を参照してください。

## ライセンス

MIT
