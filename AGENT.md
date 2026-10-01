# XRift Studio Agent Guide

CodexとClaude Codeで使う共通の作業ルールです。依頼に関係する資料を読んでから作業してください。

## プロジェクトの原則

React 19、TypeScript、Vite、Tailwind CSS、Tauri v2を使います。IPCの呼び出しは、`src/lib/tauri.ts`の型付きラッパーにまとめてください。依存パッケージを変更する場合は、Takumi Guardの設定に従ってロックファイルも更新します。

画面ではEntity、Inspector、Hierarchy、Assets、Componentsの名前を使います。glTFや3D制作で定着した用語も保ち、操作の説明は自然な日本語で書いてください。Markdown、画面文言、コミットメッセージに絵文字は使いません。

公式Componentと3D Assetは、アプリで使う描画処理を通して表示してください。架空の画像や成功を装ったモックを、実装済みの機能として扱いません。

編集・Play・公開には同じ素材と描画コードを使います。作者が見ている内容をそのまま公開できるよう、公開時だけの材質置換、色補正、形状変更、画像の自動縮小・圧縮は加えません。共通化と検証は[描画の契約](./docs/AGENT_IMPLEMENTATION.md#rendering-parity)に従ってください。

既存作品、パスの検証、権限の制御を保ちます。依頼されていない機能や体験は追加しません。

## 意思決定と完了

調査、依頼された編集、ローカルコミット、隔離した作業用データでの検証は続けて進めてください。書き込みを伴う検証では、作業用データが既存作品と分かれていることを先に確認します。

作業は、実装と必要な検証を終え、今回の変更で生じた問題を修正した時点で完了です。実装直後に確認待ちで止めないでください。依頼済みのローカルビルドや成果物の作成も、同じ許可を取り直す必要はありません。公開・配布は別途判断します。

PRの依頼には、作業ブランチへのPushとPR作成が含まれます。mainへの直接Push、マージ、公開・配布、外部送信は、依頼に含まれる場合だけ実行してください。

依頼外の破壊的な変更、既存作品の削除・初期化、公開先の変更、本人による認証が必要な場合は、対象と理由を示して確認します。その確認を必要としない作業は先に終えてください。

実行環境の権限に従います。接続先や検証環境を利用できない場合は、確認した内容と未検証の内容を分けて報告してください。

## 作業別の参照

| 変更対象 | 読む資料 |
|---|---|
| UI・状態遷移 | `.agents/skills/xrift-studio-ux/SKILL.md`、`docs/AGENT_IMPLEMENTATION.md`のUI節 |
| Component・Graph・公開物 | `docs/AGENT_IMPLEMENTATION.md`の該当節、`docs/SCRIPTING.md` |
| Sceneの更新・描画性能 | `docs/AGENT_IMPLEMENTATION.md`のScene節 |
| MCP・Rustコマンド | `docs/AGENT_IMPLEMENTATION.md`のMCP節、`docs/MCP_EDITOR_TOOLS.md` |
| 機能追加・IPC連携 | `docs/AGENT_IMPLEMENTATION.md`のIPC・CLI節 |
| 日本語の作成・推敲 | `docs/JAPANESE_WRITING.md`で画面名と専門用語を確認 |
| コード・画面の検証 | `.agents/skills/xrift-studio-verify/SKILL.md` |
| Tauri MCPの接続 | `docs/AGENT_TAURI_MCP.md` |
| 不具合の再現・修正 | `.agents/skills/xrift-studio-error-recovery/SKILL.md` |
| ワールドの制作・調整 | `.agents/skills/xrift-world-direction/SKILL.md` |
| 3Dモデルの制作・取り込み | `.agents/skills/xrift-mcp-blender-modeling/SKILL.md` |
| リリース紹介動画 | `.agents/skills/xrift-release-promo-video/SKILL.md` |

開発環境とコマンドは`DEVELOPMENT.md`にあります。文書だけを変更した場合は、内容・リンク・スキルの同期を確認してください。型チェックや実機起動は、変更の影響に応じて選びます。

## 利用ガイドの更新

利用者向けの機能や操作名を変更したら、同じPRで`docs/guide/`の手順も確認してください。`manifest.json`の目次、検索語、関連ページも対象です。公開ガイドとアプリ内ヘルプには、この原稿を使います。

`reviewedVersion`と`reviewedOn`には、実際に確認したソースのバージョンと日付を記録します。画像を更新していない場合は、本文と画像のどちらを確認したか報告してください。

Pagesのワークフローはmainへのマージ後にガイドを公開します。PRを作成した段階では、公開済みと報告しません。

## スキルの管理

共通スキルは`.agents/skills/`で管理します。変更後は`node scripts/sync-agent-skills.mjs`で`.claude/skills/`へコピーし、`--check`で一致を確認してください。Claude専用スキルと、クライアント別の`agents/`メタデータは同期しません。削除した共通スキルのコピーは残るため、対象を確認して明示的に削除します。

スキルのdescriptionには、使う場面を短く書いてください。詳しい手順や例は参照資料に分けます。日本語は、誰が何をするか、どの条件で操作できるかを明確に書いてください。利用者の環境にYomiyasuがある場合は、文体の推敲に使えます。Yomiyasu本体と推敲の作業ファイルはGitの管理対象から除外します。
