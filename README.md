# XRift Studio

[XRift](https://xrift.net/) の**非公式**クライアントアプリ。Node.js や `@xrift/cli` のセットアップを肩代わりし、**環境構築を高速化**することが目的です。プロジェクトの作成・編集・アップロードもワンクリックで。

> Status: **v0.1 (alpha)** — UI シェル + `xrift` CLI 連携まで。AI 統合は v0.2 で予定。
>
> ⚠️ 本プロジェクトは XRift 公式とは無関係の有志によるサードパーティ製ツールです。XRift 本体に関する不具合報告等は公式チャンネルへお願いします。

## 機能

- 📁 **プロジェクト一覧**: `~/xrift-projects/` 配下のワールドを自動検出
- ✏️ **Monaco エディタ**: `src/World.tsx` をその場でちょい編集（Ctrl/⌘+S で保存）
- 🚀 **ワンクリック操作**: ログイン / 新規ワールド / VS Code で開く / アップロード
- 📜 **ログストリーム**: `xrift` CLI の stdout/stderr をリアルタイム表示

## 必要な環境

- **Node.js** 20+
- **Rust** (stable) — Tauri のビルドに必須 → https://www.rust-lang.org/learn/get-started
- **`@xrift/cli`** がグローバルインストールされていること
  ```bash
  npm install -g @xrift/cli
  ```
- OS: Windows 10/11、macOS 12+

### Windows 追加要件

- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（"Desktop development with C++" ワークロード）
- WebView2 Runtime（Win11 は標準搭載）

### macOS 追加要件

- Xcode Command Line Tools: `xcode-select --install`

## 開発

```bash
npm install
npm run tauri dev
```

## 配布ビルド

```bash
npm run tauri build
```

ビルド成果物は `src-tauri/target/release/bundle/` に出力されます（Win: `.msi` / `.exe`、macOS: `.dmg` / `.app`）。

## リリース (GitHub Actions)

`.github/workflows/release.yml` に Windows / macOS / Linux のインストーラを自動ビルドするワークフローを用意しています。

1. GitHub の **Actions** タブ → **Release** を選択
2. **Run workflow** をクリック
3. タグ名（例: `v0.1.0`）を入力して実行

ビルド後、指定タグで GitHub Release が作成され、各 OS の成果物が自動添付されます。

| OS | 成果物 |
|---|---|
| Windows | `.msi` (Windows Installer) / `.exe` (NSIS) |
| macOS | `.dmg` (universal — Apple Silicon + Intel) |
| Linux | `.deb` / `.rpm` / `.AppImage` |

プレリリース／ドラフトとして公開するオプションもあります。

## 構成

```
src/
  App.tsx                main layout + state
  components/
    Toolbar.tsx          上部アクションバー
    Sidebar.tsx          左ペイン: プロジェクト一覧
    EditorPane.tsx       中央: Monaco エディタ
    LogsPane.tsx         下部: CLI ログ
    NewWorldDialog.tsx   新規ワールド作成モーダル
  lib/
    tauri.ts             Rust コマンドの型付きラッパ
    xrift-cli.ts         tauri-plugin-shell 経由で xrift CLI を実行

src-tauri/
  src/lib.rs             list_projects / read_world_file / write_world_file など
  capabilities/          shell 実行許可リスト（xrift, code）
  tauri.conf.json
```

## ロードマップ

- [ ] v0.2: AI チャットパネル（Anthropic SDK、World.tsx 編集アシスタント）
- [ ] v0.3: Node / xrift CLI 自動インストール、ログイン状態の検出
- [ ] v0.4: コード署名、自動更新
