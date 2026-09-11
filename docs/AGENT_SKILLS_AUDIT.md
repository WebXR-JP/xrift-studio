# Agent指示とスキルの見直し

2026-09-11。[Eric Provencherの記事](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra)を参考に、XRift Studioで共有する指示を監査した。スキルの適用条件、必要時だけ読む構成、過剰な停止、依頼の完了条件を中心に見直している。共有スキルをAstra専用にはせず、他のエージェントでも使用できる契約を残す。

## 変更

| 対象 | 判断・変更 |
| --- | --- |
| AGENTS.md / AGENT.md | 入口は維持。共通契約と意思決定を短くし、詳細な実装条件はdocs/AGENT_IMPLEMENTATION.mdへ移動 |
| japanese-writing | 適用条件を日本語の作成・推敲に限定。正式な英語用語と意味の保持を維持 |
| xrift-studio-feature | 固定の全工程を要求せず、変更対象に応じて検証。PR依頼からpush・PRまでの完了を明示 |
| xrift-studio-verify | 文書だけの変更にtypecheckや実機起動を要求しない。Rust同梱ファイルの検証は維持 |
| xrift-studio-ux | 文言だけの変更で全資料を読ませない。主要導線、実画面、表記の契約は保持 |
| xrift-studio-error-recovery | 適用説明を短縮。最小再現・生成元修正・ユーザーデータ保持の指示は有用なので維持 |
| xrift-world-direction | 小物の移動で全体体験を設計しない。実際のScene・MCP確認を先に行えるよう変更。認証以外の接続不足も正しく報告 |
| xrift-mcp-blender-modeling | コード優先と重心原点の一律指定を廃止。成果物からBlender/Scriptを選択し、家具の設置面とGLB metadataを保持 |
| xrift-blender-world | 全Scene削除を専用生成Collectionの更新へ変更。GLB extrasを保持 |
| xrift-release-promo-video | 適用条件を短縮し、リリース済みの推測を避ける。台本承認は保持し、既に受けた承認は再要求しない |
| xrift-promo-kit | 適用条件を実装・書き出しに限定。共有キット、座標、成果物の条件は維持 |
| xrift-promo-capture | 適用条件を動画用収録に限定。実画面、個人情報、座標系の条件は維持 |
| xrift-promo-audio | 長い音素材一覧・追加方法を必要時のreferenceへ移動。新規音源の利用条件を一律に確認不要としない |

`.agents/skills/`の11スキルとClaude側の対応コピーを同期した。Claude専用のBlender建築スキルを含め12スキルを監査。配布プラグインや個人用config.tomlはこのPRの変更対象ではない。

## 意思決定の例

- 「この変更でPRを作って」: 作業ブランチで修正・必要な検証・commit・push・PRまで続ける。mainへのマージは含めない。
- 「ガイドの誤字を直して」: 差分とリンクを確認する。アプリの本番ビルドやHMD起動を要求しない。
- 「Blenderでテーブルを作って」: Blenderで制作し、床面原点と実寸を確認する。Scriptの箱へ勝手に置き換えない。
- 「ワールドに椅子を少し移して」: 対象Sceneと位置を確認して変更する。ワールド全体の体験提案を追加しない。
- 「公開までお願い」: 許可された対象の準備を進める。必要な認証やScript承認は製品のゲートに従う。

## 検証

12スキルのfrontmatter検証、対応コピーの同期、Markdown参照先を確認した。文言の監査であり、全スキルを各制作環境で実行した評価ではない。実際の作業で判断の問題が見つかった場合だけ、対象条件を狭く修正する。
