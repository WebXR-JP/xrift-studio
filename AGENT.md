# XRift Studio Agent Guide

## 共通の契約

- Visual Project / SceneDocumentを制作データの正本とし、Edit・MCP・Play・Compilerの既存経路へ統合する。
- React / TypeScriptのUIとTauri v2のネイティブ処理を分離する。IPCは `src/lib/tauri.ts` を通す。
- 既存のパス検証、Scriptの承認、権限制御、Takumi Guardを維持する。MCP Bridgeはdebug専用。
- Entity / Inspector / Hierarchy / Assets / ComponentsとglTFの専門用語は英語を保ち、説明は自然な日本語にする。Markdown・画面文言・コミットには絵文字を使わない。
- 作業中の未コミット変更を保持する。PR依頼ではmainを更新せず、専用ブランチへcommit・pushしてPRを作る。
- 実装依頼は必要な統合・関連文書・検証・失敗の修正まで進める。実行していない実機確認、公開、配布を成功と報告しない。

## 意思決定と完了

依頼に必要な調査、可逆的なローカル編集、依存取得、静的チェック、使い捨てデータでの検証、コミットは続けてよい。依存取得は既存のセキュリティ設定に従う。
PR作成の依頼は、その差分を作業ブランチへpushしてPRを作る許可を含む。すでに受けた許可を取り直さない。
本番公開、マージ、リリース、課金、他者への送信、ユーザーデータの削除は、それを含む依頼がある場合だけ行う。
Script承認や認証の製品側ゲートは変更しない。接続・権限が不足したら具体的な不足を伝え、独立して進められる作業を完了する。

通常の検証で本番ビルドやインストーラは作らない。明示的なビルド依頼、リリース成果物作成、署名・バンドル設定の検証で必要な場合に限る。必要な許可が依頼に含まれていなければ、対象OSと目的を示して確認する。

## 必要な資料を選ぶ

| 変更対象 | 参照先 |
| --- | --- |
| UIの導線・状態 | `docs/UX_PRINCIPLES.md`、新しい状態遷移では `docs/UX_INTERACTIONS.md` |
| Scene、Component、Runtime、描画、公開形式 | `docs/AGENT_IMPLEMENTATION.md` の該当項目 |
| MCPの追加・変更 | `docs/MCP_EDITOR_TOOLS.md`、registry・handler・Rust定義を同期 |
| Scriptと公開生成物 | `docs/SCRIPTING.md` |
| XR・Room Scan・Semantic GLB | `docs/OPENXR_SPATIAL_AUTHORING.md` |
| 日本語の説明・用語整理 | `.agents/skills/japanese-writing/SKILL.md` |
| 機能の実装 | `.agents/skills/xrift-studio-feature/SKILL.md` |
| 検証・デバッグ | `.agents/skills/xrift-studio-verify/SKILL.md` |
| ワールド全体の制作 | `.agents/skills/xrift-world-direction/SKILL.md` |
| GLBの制作・取り込み | `.agents/skills/xrift-mcp-blender-modeling/SKILL.md` |
| 開発環境 | `DEVELOPMENT.md`、MCP接続は `docs/MCP_DEBUGGING.md` |

誤字修正や局所変更のために全資料・全スキルを読まない。`.agents/skills/` と `.claude/skills/` の対応するコピーを変更したときは同期する。モデル固有の選択は個人設定で行い、共有リポジトリでモデルを強制しない。
