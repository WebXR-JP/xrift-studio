# XRift Studio Agent Guide

このファイルは、XRift Studio の開発を支援する AI エージェント向けのプロジェクトルールです。

## プロジェクトの前提

- UI は React 19 + TypeScript + Vite + Tailwind CSS で構築する。
- デスクトップ機能は Tauri v2 の Rust バックエンドで実装する。
- Tauri の IPC は `src/lib/tauri.ts` にラッパーを追加し、React コンポーネントから Rust コマンドを直接散在させない。
- ブラウザだけで確認できる機能は `PreviewApp.tsx` と GitHub Pages のプレビューにも反映する。ただし、ファイル操作・CLI 実行・ログインなどのネイティブ機能はデスクトップ版の責務とする。
- パッケージのインストールや更新は、リポジトリの Takumi Guard 設定を尊重し、ロックファイルを更新する。

## 日常のコマンド

```bash
pnpm install
pnpm dev                 # React/Vite のブラウザ開発
pnpm tauri:dev           # Tauri デスクトップ開発
pnpm typecheck
pnpm build               # Tauri 用フロントエンドのビルド
pnpm tauri:build         # OS 向けパッケージのビルド
pnpm build:preview       # GitHub Pages 用プレビューのビルド
```

## Tauri MCP Bridge

このプロジェクトは、開発時の画面確認・UI 操作・コンソールログ・IPC 監視のために
[`mcp-server-tauri`](https://github.com/hypothesi/mcp-server-tauri) を使う。

- AI クライアントはリポジトリの `.mcp.json` にある `tauri` サーバー設定を使う。
- Tauri 側の `tauri-plugin-mcp-bridge` は `debug_assertions` のときだけ有効になる。リリースビルドへ開発用ブリッジを追加しない。
- `src-tauri/tauri.conf.json` の `withGlobalTauri` と `src-tauri/capabilities/default.json` の `mcp-bridge:default` は MCP 接続に必要な設定なので、削除しない。
- MCP を使うときは、まず `pnpm tauri:dev` でアプリを起動し、その後 AI クライアントを MCP 設定ごと再読み込みする。
- 画面を変更したら、MCP でスクリーンショットまたは DOM スナップショットを取得し、主要導線・コンソールエラー・必要な IPC を確認する。

## MCP を使った確認の例

```text
アプリのデバッグ版を起動し、Tauri MCP で次を確認してください。
1. ウィンドウのスクリーンショットを取得
2. DOM スナップショットで主要ボタンを確認
3. コンソールログにエラーがないか確認
4. セットアップ画面の操作で発生する IPC を監視
```

## 実装ルール

- 新しい画面は、まずブラウザで動く React の状態・表示を作り、Tauri 固有処理を小さな IPC ラッパーへ分離する。
- ネイティブ API が使えないブラウザプレビューでは、成功したように見せるモックを実機能と混同させない。画面上でサンプル・デモであることを明示する。
- Rust コマンドへ外部入力を渡すときは、既存のパス検証と権限制御を維持し、任意のパス実行や削除を追加しない。
- 変更後は `pnpm typecheck` と関連するビルドを実行する。Tauri IPC を変更した場合は `pnpm tauri:dev` と MCP の実画面確認まで行う。
- 作業単位ごとに意図が分かるコミットを作成し、ユーザーの指示がある場合は `main` へ Push する。

## 参照

- 開発手順: `DEVELOPMENT.md`
- Tauri バックエンド: `src-tauri/src/lib.rs`
- フロントエンド IPC ラッパー: `src/lib/tauri.ts`
- Web プレビュー: `src/PreviewApp.tsx`
