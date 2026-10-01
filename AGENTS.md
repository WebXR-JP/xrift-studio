# XRift Studio Agent Guide

Codex用のプロジェクト指示です。作業前に[AGENT.md](./AGENT.md)を読み、依頼に合うスキルを`.agents/skills/`から選んでください。日本語の作成・推敲では、`AGENT.md`の文章と用語の方針に従ってください。

Claude Code用のコピーは`.claude/skills/`にあります。共通スキルを変更したら、`node scripts/sync-agent-skills.mjs`でコピーを更新し、`node scripts/sync-agent-skills.mjs --check`で一致を確認してください。
