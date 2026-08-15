# AI と一緒に Scene を編集する

ビジュアルエディターの **AI connection** パネルを使うと、AI クライアント（Codex、Claude Code、Claude Desktop / Cowork、OpenCode、Cursor）をアプリから登録し、開いている Scene の読取・設定変更・Asset 配置を限定 MCP tool で行えます。

## 対応している AI クライアント

- Codex
- Claude Code
- Claude Desktop / Cowork
- OpenCode
- Cursor

## セットアップ

1. ビジュアルエディターの **AI connection** パネルを開きます。
2. インストール済みの AI クライアントを検出します。
3. 使いたいクライアントを登録します。必要なら **Ollama** のローカル model で Codex、Claude Code、OpenCode を構成できます。
4. 登録後に AI クライアントを再起動するか、MCP を再読み込みします。

## できること

登録後、AI クライアントから次のような操作ができます。

- 開いている Scene の読取
- Entity の更新
- Asset の配置
- その他、許可された Editor tool

## 注意点

- 複数のクライアントから同時操作された場合は編集を直列化し、混雑時は `EDITOR_BUSY` を返して最新の Scene revision から安全に再試行できます。
- Claude Desktop / Cowork はローカル session で利用できます。remote Cowork ではローカル MCP server を起動できません。
- 構成時に model の tool calling 対応を再確認します。model download や client の自動起動は行いません。
