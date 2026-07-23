# 開発ガイド

XRift Studio はソースから自分でビルド・改変できます。このドキュメントは **開発者向け** です。アプリの使い方は [README.md](./README.md) をご覧ください。

## 必要な環境

- **Node.js** 20 以上
- **Rust** (stable) — https://www.rust-lang.org/learn/get-started
- OS: Windows 10/11 / macOS 12+ / Linux

### Windows 追加要件

- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（"Desktop development with C++" ワークロード）
- WebView2 Runtime（Windows 11 は標準搭載）

### macOS 追加要件

```bash
xcode-select --install
```

### Linux 追加要件（Ubuntu 22.04 の例）

```bash
sudo apt update
sudo apt install \
  libwebkit2gtk-4.1-dev \
  librsvg2-dev \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  patchelf \
  build-essential
```

## 起動（開発モード）

```bash
pnpm install
pnpm tauri:dev
```

## UX の確認

機能を追加・変更したら、[UX 原則](./docs/UX_PRINCIPLES.md) に沿って実画面を確認します。特に、作成や起動の操作を成功させるだけで終わらせず、結果に到達できることを確認してください。

1. 操作前に、現在の状態と主操作がひと目で分かる。
2. 実行中に、処理中であることと二重操作できないことが分かる。
3. 成功後に、作成物・起動 URL・公開 URL など、次の目的地をすぐ開ける。
4. 失敗後に、ログまたは再試行などの復帰手段が分かる。
5. 一覧へ戻ったときに、変更結果と新規作成の入口が見つかる。

日常の検証は AGENT.md の「高速フィードバックループ」に従います。`pnpm typecheck`、`cargo check`、ブラウザプレビュー（`.claude/launch.json` の `web` サーバーで `http://localhost:1420/preview.html`）、検証目的の `pnpm tauri:dev` と Tauri MCP による読み取りは、そのまま実行して構いません。`pnpm tauri:build`、インストーラ生成、実機での書き込みを伴う UI 操作は、成果物・アプリデータ・外部公開先に影響するため、実行前にユーザーへ目的と副作用を示して許可を得ます。Markdown の追加・編集時には絵文字を使いません。

## 配布ビルド

```bash
pnpm tauri:build
```

成果物は `src-tauri/target/release/bundle/` に OS 別で出力されます。

## リポジトリ構成

```
src/                       フロントエンド (React + TypeScript)
  App.tsx                  メインレイアウト / ルーティング
  components/              UI コンポーネント
    SetupView.tsx          初回セットアップ画面
    ProjectLibrary.tsx     プロジェクト一覧
    EditorView.tsx         エディタ画面
    UpdateDialog.tsx       @xrift/cli アップデート通知
    AboutModal.tsx         バージョン情報 / リセット
    ...
  lib/
    tauri.ts               Rust コマンドの型付きラッパー
    xrift-cli.ts           tauri-plugin-shell 経由で xrift CLI を呼び出す
    semver.ts              バージョン比較ユーティリティ

src-tauri/                 Rust バックエンド (Tauri v2)
  src/lib.rs               コマンド実装（ランタイム管理 / ファイル操作 / リセット）
  capabilities/            shell 実行の許可リスト
  tauri.conf.json          Tauri 設定
  Cargo.toml

.github/workflows/
  release.yml              Windows / macOS / Linux の自動リリースワークフロー
```

## 主要な Tauri コマンド

| コマンド | 役割 |
|---|---|
| `runtime_status` | Node.js と @xrift/cli がインストール済みか確認 |
| `setup_runtime` | Node.js ダウンロード → 展開 → @xrift/cli インストール |
| `check_xrift_latest` | npm registry から @xrift/cli の最新版を取得 |
| `update_xrift` | `npm i -g @xrift/cli@latest` を実行 |
| `reset_app_data` | scope に応じてアプリデータを削除（runtime / projects / all） |
| `list_projects` | `projects/` 配下のプロジェクトを列挙 |
| `read_text_file` / `write_text_file` | 任意のファイルを読み書き |

## リリース

`.github/workflows/release.yml` で Windows / macOS / Linux のインストーラを一括ビルドします。

GitHub Actions のリポジトリ Secrets に次を登録してください。

- `TAURI_SIGNING_PRIVATE_KEY`: `pnpm tauri signer generate` で生成した updater 秘密鍵の内容
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: 秘密鍵を生成したときのパスワード

公開鍵は `src-tauri/tauri.conf.json` の updater 設定に含まれます。秘密鍵ファイルとパスワードはリポジトリへ追加しないでください。

1. GitHub Actions タブ → **Release** → **Run workflow**
2. タグ名（例: `v0.1.0`）を入力して実行
3. 完了後、GitHub Release に全 OS のインストーラ、署名、`latest.json` が自動添付されます

公開済みの通常リリースだけがアプリの `releases/latest/download/latest.json` から取得されます。ドラフトは公開するまで、プレリリースは通常リリースになるまで自動更新の対象になりません。

| OS | 生成される成果物 |
|---|---|
| Windows | `.msi` (Windows Installer) / `.exe` (NSIS) |
| macOS | `.dmg`（universal — Apple Silicon + Intel） |
| Linux | `.deb` / `.rpm` / `.AppImage` |

**プレリリース／ドラフト** として公開するオプションもあります（workflow 実行時のフォーム参照）。

## ロードマップ

- [ ] v0.2: AI チャットパネル（Anthropic SDK、World.tsx 編集アシスタント）
- [ ] v0.3: ログイン状態のより良い検出 / 自動 sign-in
- [x] v0.4: 署名済み成果物によるアプリ内自動更新

## コントリビュート

- Issue / Pull Request は歓迎します
- 大きめの変更は事前に Issue で相談いただけるとスムーズです
