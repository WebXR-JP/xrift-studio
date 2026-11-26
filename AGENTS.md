# XRift Studio エージェントガイド

Codex 向けのプロジェクト指示です。作業を始める前に [AGENT.md](./AGENT.md) を読み、変更対象に関係するドキュメントを確認してください。ドキュメント・PR・コミットメッセージの日本語は、[AGENT.md](./AGENT.md) と [docs/JAPANESE_WRITING.md](./docs/JAPANESE_WRITING.md) の方針に沿って自然な日本語で書きます。

ワールド制作専用スキルは `src/lib/visual-editor/world-authoring-guide.json` から自動生成しています。元の JSON を編集した場合は `node scripts/sync-agent-skills.mjs` を実行して Codex 用・Claude Code 用の両方を更新し、`node scripts/sync-agent-skills.mjs --check` で差分がないことを確認してください。アプリ本体の開発では、制作スキルを読み込む必要はありません。
