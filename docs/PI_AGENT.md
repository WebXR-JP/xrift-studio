# Pi SDKによるStudio内部の制作

新しい制作依頼はPi SDK 1.3.0で実行する。Studioのチャット、モデル選択、Queue、保存済み履歴を入口にし、正式なEditor toolの結果をPiへ返す。モデルがSceneやAssetsのファイルを直接書き換える経路は設けない。

## 構成

- `packages/xrift-studio-agent`: Node.js内のPi SDK。汎用のread・write・edit・bashやユーザーの拡張はロードしない。会話はアプリ専用ディレクトリへ保存する。
- `src-tauri/src/chatgpt/pi_agent.rs`: 既存のChatGPT認証、モデル検査、Nodeプロセス、20分・256操作の上限、停止、Sceneの範囲を管理する。更新用の認証情報はOSの安全な保存先に残す。短期トークンだけをプロセスの標準入力へ渡し、履歴には書かない。
- `src/lib/visual-editor/pi-authoring-host.ts`: チャット履歴、進捗、対象Scene、新規World、停止・失敗時の保存、変更を戻す操作を接続する。
- `mcp::dispatch_internal`: 外部MCPと同じEditor要求へ転送する。schemaとdescriptionは既存の`mcp::tool_definitions()`を使う。編集は通常のrevision・検証・履歴・保存を通る。

Piの`studio_search_tools`で操作説明と引数Schemaを読み、`studio_execute`で正式な操作を実行する。公開・認証変更・別作品を開く操作・生成の再帰呼び出しは渡さない。実行前に現在のprojectIdとsceneIdを照合し、書き込みではexpectedRevisionをEditorが検査する。古いrevisionのエラーをモデルへ返し、再取得して判断できるようにする。

通常の構成は静的TSXの`apply_r3f_scene`、既存Asset、公式Components、Materialなどを使う。複雑な形状には正式な`create_blender_model`も使える。内部要求にはnativeがownerGenerationIdを付け、同じ制作だけがモデル作成の所有権を共有する。外部クライアントからこの所有権は受け取らない。

## 完了と停止

`save_project`はEditorのコード・Graph下書きと自動保存をflushする。同じScene・revisionを保存できた場合だけsaved=trueを返す。

Piは文書の`get_project_health`、最新Sceneのspawn・iso画像を確認してから、完成条件ごとの根拠を`studio_complete`へ渡す。画像はファイル名だけでなくモデルへのimage contentになる。変更後は古い検証を無効にし、完了直前にもrevisionを取り直す。文書検証は実行時や複数人同期の検証を代替しない。

単なる回答終了、ツールの成功件数、同じ設定の再適用は完成判定にしない。最新状態の保存・文書検証・2方向の画像が揃わない場合はcompletedにしない。依頼の美的品質や要件の達成はモデルの画像レビューを含む判断であり、機械的に保証できるものとは区別する。

停止時は新しい操作を開始せず、受理済みのEditor操作を終了させる。失敗・停止でも通常の保存をflushし、既に反映した内容を保つ。対象Sceneの切り替え後には書き込まない。

`mode: plan`では読み取り用のtoolだけを渡し、文章の制作プランを返す。反映時は最新Sceneを読んでPiで制作する。保存済み旧形式Planの適用だけは従来のadapterを残す。新規依頼の失敗時に旧ハーネスへ自動fallbackしない。

## 同梱と検証

`pnpm agent:build`でworkerをビルドし、`pnpm agent:prepare`でロックファイルに沿ったproduction依存だけをTauri resourceへ配置する。開発・配布のbefore commandにも接続する。依存のlifecycle scriptは実行しない。同梱のNode.jsが必要で、グローバルなPiのインストールや認証ファイルには依存しない。

- `pnpm agent:test`: 実Pi SDKのループにfixture providerを接続し、tool結果、画像、会話保存、秘密情報の非保存、完成条件を確認。
- `pnpm e2e:test e2e/pi-agent.spec.ts`: native/model transportをfixtureにし、正式なEditor、静的変換、保存、WebGL画像、失敗後の保持を確認。
- `cargo test --manifest-path src-tauri/Cargo.toml --lib internal_tools_are_official_scoped_and_cannot_publish_or_recurse`: toolの実在と範囲、計画モードの読み取り制限。

これらは実ChatGPTアカウントからの推論・品質比較とは別の確認である。既存作品をテストに使わず、隔離したWorldで実モデル確認を行う。
