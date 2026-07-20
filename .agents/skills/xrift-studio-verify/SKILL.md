---
name: xrift-studio-verify
description: XRift Studio の変更を高速に検証するループ。コード変更後の動作確認、LP (Web プレビュー) の見た目確認、デスクトップアプリの実機確認、コンソールエラーや IPC の確認を行うときに使う。「動作確認して」「スクリーンショットを撮って」「検証して」「デバッグして」で発動。
---

# XRift Studio 検証ループ

変更の種類に応じて、最も軽い確認手段から順に使う。重い手段を先に使わない。
実行許可はクライアントごとの設定に従う。Claude Code では `.claude/settings.json` を使い、Codex では現在のセッションの許可とツールを使う。

## Tier 0: 静的チェック（数秒）

- フロントエンド: `pnpm typecheck`
- Rust を触ったら: `cargo check --manifest-path src-tauri/Cargo.toml`

すべての変更で最初に実行する。ここが通らないうちに画面確認へ進まない。

## Tier 1: ブラウザプレビュー（LP と純粋な UI、数秒で再確認可）

Vite サーバーを port 1420 で起動する。Claude Code では `.claude/launch.json` の `web` 設定と preview_start を再利用でき、Codex では `pnpm dev -- --host 127.0.0.1 --port 1420` など、利用可能な起動手段を使う。起動済みなら再利用し、Vite の HMR が効くのでファイル保存のたびに再起動しない。

- LP（GitHub Pages 相当）: `http://localhost:1420/preview.html`
- メインアプリ（`index.html`）は Tauri IPC 前提のため、ブラウザでは起動画面から先へ進めない。メインアプリの画面確認は Tier 2 を使う。

手順:

1. navigate でページを開き、screenshot で全体を確認する
2. read_console_messages (onlyErrors) でエラーがないことを確認する
3. 文言・構造・リンク先は read_page / get_page_text で確認する（テキスト検証は screenshot より確実）
4. レスポンシブは resize_window（preset: mobile / desktop）で両方確認する

## Tier 2: デスクトップ実機（Tauri MCP）

セットアップ、CLI 実行、ファイル操作、公開フローなどデスクトップ固有の機能を確認するとき。

1. `pnpm tauri:dev` を Bash の run_in_background で起動する。ビルド済みなら 1〜2 分、初回は数分かかる。ウィンドウが開くまで待つ。
2. Tauri MCP（`.mcp.json` の `tauri` サーバー、`tauri-plugin-mcp-bridge` は debug ビルドのみ有効）で次を行う:
   - ウィンドウのスクリーンショット取得
   - DOM スナップショットで主要ボタン・導線の確認
   - コンソールログにエラーがないかの確認
   - 操作で発生する IPC の監視
3. このセッションに `tauri` MCP サーバーが接続されていない場合は、`pnpm mcp:cli`（@hypothesi/tauri-mcp-cli）で同等の操作を CLI から行える。`pnpm mcp:cli -- --help` で操作一覧を確認する。
4. 読み取り（スクリーンショット・DOM・ログ・IPC 監視）は自由に行ってよい。書き込みを伴う実機操作（ログイン、アップロード、削除、リセット）はユーザーの許可を得てから行う。
5. 確認が終わったら、起動した dev プロセスを停止する。放置しない。

スクリーンショットはセッションの scratchpad ディレクトリへ保存し、リポジトリを汚さない。

## 何を確認するか

- 変更した画面の「操作前 → 実行中 → 成功 → 失敗」の各状態（docs/UX_PRINCIPLES.md の完了条件）
- コンソールにエラー・警告が出ていないこと
- 成功後に、作成物・URL・更新結果へ画面から到達できること
- LP を変更した場合: 実アプリ（EditorView / ProjectLibrary / SetupView）と見た目・文言・挙動が食い違っていないこと
