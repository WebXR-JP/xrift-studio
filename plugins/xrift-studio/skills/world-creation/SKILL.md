---
name: world-creation
description: XRift StudioのEditorを開き、会話からブラウザ内の3Dワールドを制作・編集するときに使う。
---

# XRift Studioでワールドを作る

MCPは小さな操作をEditorへ渡すだけで、作品を生成・編集・保存するサーバーではない。作品全文やbundleをツール引数へ渡さない。snapshotIdやサーバーの作品一覧も使わない。

新規制作は`create_world({name, operationId})`で依頼する。操作ごとに一意のoperationIdを付け、同じ引数の再送だけで同じIDを使う。サーバーの応答は受付であり、作成・保存・表示の成功ではない。Editorから実際のstudioDeliveryまたはstudioContextが届くまで、依存する追編集を実行しない。未接続や閉じたEditorでは、実行済みと伝えない。

追編集は`edit_world({projectId, expectedRevision, operationId, operations})`を使う。実際のEditor報告にある対象IDとrevisionを指定する。`describe_document_tool`で操作のschemaを確認し、operationsにtoolとargumentsを並べる。操作ごとのprojectId・sceneId・expectedRevisionはEditorが現在の作品から補う。最大200操作を一つのバッチで処理し、失敗したバッチでは作品を変えない。`ref`と後続の`$ref`で作成したEntityを参照できる。

create_primitiveの図形指定はshapeで、typeやprimitive_typeではない。材質やEntityのIDは、実際のEditorで実行したlist_assets・list_entitiesなどの結果から得る。schemaに合わせて引数を修正し、実行されていない失敗を直した場合だけ新しいoperationIdを使う。結果が不明ならget_operation_statusで確認し、成功済みの編集を別IDで繰り返さない。

`show_world({projectId})`は同じブラウザに保存された作品を開く。`capture_scene_view({projectId})`は現在開いている対象の実際のPNGを取得する。別作品・見つからない作品・古いrevisionは拒否される。失敗を新しい作品の作成で置き換えない。

再確認は`retry_world({projectId, operationId})`で、このブラウザにある元の結果を使う。編集を再実行せず、新しい編集を古い結果で巻き戻さない。ローカルの結果が残っていなければ、その事実を伝えて現在の作品を確認する。

## 手動作品と保存

現在の作品を会話で編集するときは、get_editor_contextまたは「会話に編集対象を渡す」で対象情報を確認する。作品名・projectId・revision・上限付きのEntity一覧を会話へ送り、作品全文や素材ファイルをMCPへアップロードしない。手動変更後は最新のrevisionを使う。

作品、素材、操作履歴はブラウザに保存する。MCPには作品の一時保存やクラウド作品管理を設けない。通常サイトとChatGPT内では保存領域が分かれ、端末間の自動同期はない。必要な作品は.xriftstudioに書き出す。

操作の受付、データ適用、ブラウザ保存、表示、画像受信を区別する。同じoperationId・projectId・revision・hashの実際のstudioDeliveryを根拠にし、PNGを確認した場合だけ画像確認済みと伝える。描画や画像取得の失敗で確認済みのブラウザ保存を失敗へ置き換えない。Playは実際に試した場合だけ確認済みと伝える。

素材はAssetsから取り込む。会話の添付素材の自動転送、購入、支払いは提供しない。open_studioはアプリ専用の入口で、会話から対象を開く場合はshow_worldを使う。Sitesの接続認証は、作品保存の有無とは別に必要となる。
