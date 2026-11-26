@AGENT.md

## Claude Code 向けの設定

- ブラウザプレビューには `.claude/launch.json` の `web` 設定を `preview_start` で使ってください。ポート 1420 で開発サーバーがすでに起動している場合はそのまま利用し、`http://localhost:1420/preview.html` を開きます。
- よく使うコマンドと Tauri MCP の読み取り操作は、`.claude/settings.json` で事前に許可しています。
- 変更対象に合わせて関連ドキュメントを参照してください。機能追加や IPC 連携は `docs/AGENT_IMPLEMENTATION.md`、画面設計は `docs/UX_PRINCIPLES.md`、動作確認やデバッグ手順は `DEVELOPMENT.md` にまとめています。
- ドキュメント・PR・コミットメッセージの日本語は、[AGENT.md](./AGENT.md) と [docs/JAPANESE_WRITING.md](./docs/JAPANESE_WRITING.md) の方針に沿って自然な表現で書いてください。
