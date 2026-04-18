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
npm install
npm run tauri dev
```

## 配布ビルド

```bash
npm run tauri build
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

1. GitHub Actions タブ → **Release** → **Run workflow**
2. タグ名（例: `v0.1.0`）を入力して実行
3. 完了後、GitHub Release に全 OS の成果物が自動添付されます

| OS | 生成される成果物 |
|---|---|
| Windows | `.msi` (Windows Installer) / `.exe` (NSIS) |
| macOS | `.dmg`（universal — Apple Silicon + Intel） |
| Linux | `.deb` / `.rpm` / `.AppImage` |

**プレリリース／ドラフト** として公開するオプションもあります（workflow 実行時のフォーム参照）。

## ロードマップ

- [ ] v0.2: AI チャットパネル（Anthropic SDK、World.tsx 編集アシスタント）
- [ ] v0.3: ログイン状態のより良い検出 / 自動 sign-in
- [ ] v0.4: コード署名 / 自動更新

## コントリビュート

- Issue / Pull Request は歓迎します
- 大きめの変更は事前に Issue で相談いただけるとスムーズです
