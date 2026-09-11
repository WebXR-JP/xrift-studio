# XRift Studio Agent Guide

Codex と Claude Code の共通ルール。現在の依頼に関係する資料だけを読む。

## プロジェクトの原則

- React 19・TypeScript・Vite・Tailwind CSS と Tauri v2 を使う。IPC は `src/lib/tauri.ts` の型付きラッパーへ分離する。
- 依存変更は Takumi Guard の設定に従い、ロックファイルを更新する。
- `Entity / Inspector / Hierarchy / Assets / Components` と定着した glTF・3D 用語は英語で残し、説明は短い自然な日本語にする。
- Markdown、画面文言、コミットメッセージでは絵文字を使わない。
- 公式 Component と 3D Asset は実際の描画経路で表示する。架空の画像や成功したように見えるモックを実機能として扱わない。
- 既存作品、パス検証、権限制御を保つ。依頼外の機能や体験を追加しない。

## 意思決定と完了

- 調査、依頼範囲の編集、ローカルコミット、隔離した作業用データでの検証は継続して進める。既存作品と分離できたことを確認してから書き込み検証を行う。
- 実装、影響に応じた検証、今回の変更に起因する問題の修正までを完了条件とする。初回実装だけで確認待ちにしない。
- 依頼されたローカルビルドや成果物作成は同じ許可を再度求めない。公開・配布は別の操作として扱う。
- PR の依頼は作業ブランチへの Push と PR 作成を含む。main への直接 Push、マージ、公開・配布、外部送信は依頼に含まれる場合だけ実行する。
- 依頼外の破壊的変更、既存作品の削除・初期化、公開先の変更、本人による認証が必要な場合は対象と理由を示して確認する。進められる作業は先に終える。
- 実行環境の権限を守る。接続や検証環境が利用できなければ、実施済みと未検証を区別して報告する。

## 作業別の参照

| 変更対象 | 必要な資料 |
|---|---|
| UI・状態遷移 | `.agents/skills/xrift-studio-ux/SKILL.md`、`docs/AGENT_IMPLEMENTATION.md` の UI 節 |
| Component・Graph・公開物 | `docs/AGENT_IMPLEMENTATION.md` の該当節、`docs/SCRIPTING.md` |
| Scene 更新・描画性能 | `docs/AGENT_IMPLEMENTATION.md` の Scene 節 |
| MCP・Rust コマンド | `docs/AGENT_IMPLEMENTATION.md` の MCP 節、`docs/MCP_EDITOR_TOOLS.md` |
| 機能追加・IPC 連携 | `docs/AGENT_IMPLEMENTATION.md` の IPC・CLI 節 |
| 日本語の作成・推敲 | `.agents/skills/japanese-writing/SKILL.md`。誤字だけなら対象文と差分を確認 |
| コード・画面の検証 | `.agents/skills/xrift-studio-verify/SKILL.md` |
| Tauri MCP 接続 | `docs/AGENT_TAURI_MCP.md` |
| 不具合の再現・修正 | `.agents/skills/xrift-studio-error-recovery/SKILL.md` |
| ワールド制作・調整 | `.agents/skills/xrift-world-direction/SKILL.md` |
| 3D モデル制作・取込 | `.agents/skills/xrift-mcp-blender-modeling/SKILL.md` |
| リリース動画 | `.agents/skills/xrift-release-promo-video/SKILL.md` |

開発環境とコマンドは `DEVELOPMENT.md` を参照する。文書だけの変更では型チェックや実機起動を一律に行わず、内容・リンク・スキルの同期を確認する。

## スキルの管理

共通スキルの正本は `.agents/skills/`。`node scripts/sync-agent-skills.mjs` で `.claude/skills/` 互換コピーを同期し、`--check` で差分を検出する。Claude 専用スキルとクライアント別の `agents/` メタデータは同期対象外。詳細な手順や例は必要なときだけ参照し、description には適用条件を短く書く。
