# XRift Studio

XRift ワールド制作の公式デスクトップランチャー。プロジェクトの作成・編集・アップロードをワンクリックで。

> Status: **v0.1 (alpha)** — UI シェル + `xrift` CLI 連携まで。AI 統合は v0.2 で予定。

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
