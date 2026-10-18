# XRift Studio Agent Guide

Codex用のプロジェクト指示です。作業前に[AGENT.md](./AGENT.md)を読み、依頼に関係する実装資料を参照してください。日本語の作成・推敲では、`AGENT.md`の文章と用語の方針に従ってください。

制作専用スキルは`world-authoring-guide.json`から生成します。正本を変更したら`node scripts/sync-agent-skills.mjs`でCodex・Claude Code用の両コピーを更新し、`node scripts/sync-agent-skills.mjs --check`で一致を確認してください。アプリ本体の開発では、制作スキルの読込は不要です。
