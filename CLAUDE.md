@AGENT.md

Claude Code 固有の設定:

- ブラウザプレビューは `.claude/launch.json` の `web` 設定を preview_start で使う。ポート 1420 が使用中なら既存の dev サーバーが動いているので、新たに起動せず `http://localhost:1420/preview.html` へ navigate する。
- よく使うコマンドと Tauri MCP の読み取りは `.claude/settings.json` で事前許可済み。
- 作業の種類に応じて `.agents/skills/` のスキルを読む: 機能追加は `xrift-studio-feature`、UX 設計は `xrift-studio-ux`、動作確認・デバッグは `xrift-studio-verify`。
