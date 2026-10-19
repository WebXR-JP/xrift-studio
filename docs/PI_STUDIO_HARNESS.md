# Studio内部のPiハーネス

`codex/harness-redesign` の `07b7bedc158ba86246f3f365f20734706c44faef` を基点にする。Studioの制作チャットとMCP/APIの制作依頼は `createChatgptAuthoringRunner` から同じPiループへ入る。

## SDKと通信

2026-10-19に公式の [Pi Agent SDK](https://github.com/earendil-works/pi/tree/main/packages/agent) と配布パッケージの型を確認し、`@earendil-works/pi-agent-core` と `@earendil-works/pi-ai` を1.3.0に固定した。`Agent`、`StreamFn`、`AssistantMessageEventStream`、逐次tool実行と `terminate` を使う。SchemaはSDKと同じ `typebox` 1.3.27を使う。

ブラウザで動くAgent SDKを選び、ファイル編集・shell・拡張機能の自動読込を持つcoding-agentの既定ツールは導入しない。専用Node sidecarや `agent:prepare` は不要で、pnpm.exeをNodeで起動する処理も追加しない。PiのproviderやOAuth、環境変数からの認証探索は使わない。依存に含まれるGoogle/protobufのinstall scriptは実行しない。

モデルとの通信は型付き `tauri.chatgptAgentTurn` とnativeの `chatgpt_agent_turn` を通す。既存の接続権限確認、vault、refresh、モデル一覧検証、generation lease、タイムアウト、キャンセルを再利用する。アクセストークンやrefresh tokenをJavaScript、Pi、会話、進捗へ返さない。nativeは固定した4操作のenumだけを返し、未知の操作や余分なフィールド、262,144 bytesを超える会話を拒否する。Piのstream adapterはnativeの構造化応答をSDKのtoolCallへ変換する。

## 制作と完了

| Pi tool | 実行経路 |
| --- | --- |
| `studio_context` | 現在のbridgeからEntity・素材件数とfingerprintを読む。制作toolは独立して完全な制限付き入力を収集する |
| `studio_author` | 元の依頼で既存の制作passを1回実行。通常のPlan検証、生成文書検証、競合検査、Editor反映、保存を使う |
| `studio_inspect` | 同じrevisionを保存し、正式な `captureWorldViews` とnativeのScene reviewerで元の依頼を確認する |
| `studio_finish` | 実変更、最新状態の保存、同じfingerprintの合格画像レビューを照合して完了する |

初回の情報取得と制作はhostが開始し、以後の操作はモデルがPiの前回tool結果を読んで選ぶ。制作passはPiへ継続権を返し、自分では完了しない。モデルが元の依頼の文章を書き換えて制作toolへ渡すことはできない。不合格レビューは次の制作passの会話へ観測として渡す。Planや生成文書の検証失敗は既存の制限付き再計画を使う。致命的な保存失敗では停止し、既存の変更を保持する。

no-opを含む処理件数は完了根拠にならない。実際にEditor反映に成功した変更があり、最初と最後の制作内容にも差がある場合だけ完了を許す。変更した後は以前の画像レビューを無効化する。撮影・画像確認中の編集、作品やSceneの切替、Play・素材読み込み開始では古い結果で完了しない。

Piの間もgenerationIdのbusy・停止操作の所有者を保持する。進行状況は既存の保存される制作進捗へ表示する。最大32 tool turnに加え、既存のpass・モデル呼出・時間・進展なしの上限を維持する。質問やPlanの確認待ちは自動継続せず、利用者の操作を待つ。

## 検証

`pnpm test:pi` は実Pi SDKと既存hostの隔離fixtureを使う。編集と保存、画像確認不合格からの修正、Plan検証失敗からの修正、no-op完了拒否、保存失敗、古い画像の拒否、停止を確認する。native通信だけをfixtureに置き換えるため、実アカウント推論や実画像の判定品質を検証したことにはならない。`e2e/pi-studio-agent.spec.ts` はブラウザでSDKを読み込み、実toolループを確認する。

実アカウントの認証・生成・画像レビュー、Windowsデスクトップの実操作、配布バイナリでの確認は別途必要。実ユーザーの資格情報をテストのために取得しない。
