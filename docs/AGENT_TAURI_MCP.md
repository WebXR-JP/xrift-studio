# Tauri MCP Bridge

このプロジェクトでは、開発時の画面確認、UI 操作、コンソールログの確認、IPC 監視に [`mcp-server-tauri`](https://github.com/hypothesi/mcp-server-tauri) を使う。

- 接続にはリポジトリ直下の `.mcp.json` に定義した `tauri` サーバー設定を使う。
- Tauri 側の `tauri-plugin-mcp-bridge` は `debug_assertions` が有効なときだけ動作する。リリースビルドには開発用ブリッジを含めない。
- `src-tauri/tauri.conf.json` の `withGlobalTauri` と `src-tauri/capabilities/default.json` の `mcp-bridge:default` は MCP 接続に必要な設定のため、削除しない。
- MCP を使うときは、先に `pnpm tauri:dev` でアプリを起動し、その後で AI クライアントを MCP 設定ごと再読み込みする。
- セッションに `tauri` MCP サーバーが接続されていない場合は、`pnpm mcp:cli`（`@hypothesi/tauri-mcp-cli`）で同じ操作を CLI から実行できる。
- 画面を変更したら、MCP でスクリーンショットまたは DOM スナップショットを取得し、主要導線、コンソールエラー、必要な IPC を確認する。

## MCP を使った確認の例

```text
アプリのデバッグ版を起動し、Tauri MCP で次を確認してください。
1. ウィンドウのスクリーンショットを取得
2. DOM スナップショットで主要ボタンを確認
3. コンソールログにエラーがないか確認
4. セットアップ画面の操作で発生する IPC を監視
```
