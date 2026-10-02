---
name: world-creation
description: XRift Studioで会話から3Dワールドを新規制作したり、会話に引き継いだ作品を編集するときに使う。
---

# XRift Studioでワールドを作る

新規制作では`create_world`を呼ぶ。返された`bundle`、`revision`、`projectId`、`operationId`、`baseHash`を会話内の編集状態として引き継ぐ。続く`edit_world`には、直前の結果の`bundle`と`revision`を内部で渡す。利用者にJSONの貼り直しやプロジェクトの手動選択を求めない。Editorが閉じていても、`activeProjectId`がnullでも、データの作成・追編集は続けられる。画面の起動、反映報告、PNGを待つことを編集の前提にしない。

利用者が現在のEditorを手動編集した場合は、`get_editor_context`から届く最新の`bundle`と`revision`を使う。会話の結果が古い可能性があるときは、既存作品を巻き戻さない。対象の`projectId`と`expectedRevision`を確認する。元のデータが会話にもブラウザにもなければ、復元できるとは言わず、作品ファイルの取り込みを案内する。

使うdocument toolのschemaを`describe_document_tool`で確認し、`operations`に`tool`と`arguments`を並べる。projectId・sceneId・操作ごとのexpectedRevisionは変換処理が補う。最大200操作を一つのバッチで適用し、revisionを一度進める。`ref`で作成結果に名前を付け、後の引数から`$ref`で参照できる。途中で失敗したバッチの部分結果は使わない。

形式エラーには、失敗した操作の番号、正しいdefinition、変更前のbundleとrevisionが返る。そのdefinition.inputSchemaに合わせて引数を直し、返された同じ作品の状態で`edit_world`を再試行する。失敗を理由に`create_world`で作品を作り直さない。create_primitiveの図形指定は`shape`で、`type`や`primitive_type`ではない。ツールのJSONテキストとstructuredContentは同じ結果を表す。

床、SpawnPoint、配置する物の寸法・材質・照明を整える。入手していない画像やモデルの参照は作らない。素材ファイルは利用者がAssetsから取り込む。会話の添付素材が自動転送されたとは扱わない。

作成・追編集のツールは画面を開かない。最後に`show_world`または`capture_scene_view`へ最新のbundle・revision・operationId・baseHashを内部で渡し、共通Editorへ一度だけ取り込む。中間結果ごとに別のエディターを表示しない。

## 保存と画面の確認

Sitesはdocument JSONを一時的に処理するだけで、作品・素材・編集セッションを保存しない。ツール結果の編集データはChatGPTの会話を通るが、会話の保存や保持期間をこのプラグインが保証することはできない。Editorへ取り込まれた作品・素材は共通のブラウザ保存に残る。通常サイトとChatGPT内の保存領域は分かれ、自動同期はない。`projectId`だけから別端末の作品を取得できるとは説明しない。

データ編集、ブラウザ保存、Editorへの反映、画像取得を分けて報告する。編集結果の返却だけでブラウザ保存や画面反映を完了扱いにしない。同じoperationId・projectId・revision・hashの`studioDelivery`報告を確認し、実際のScene View PNGを受け取って見た場合だけ画像確認済みと伝える。画像が未受信でも、データ編集を続けることはできる。

見た目の確認が必要になったら、結果をEditorへ適用して`capture_scene_view`を呼ぶ。構図・明るさ・配置を画像で判断し、必要なら最新のbundleで追編集する。画像取得が失敗した場合は未確認と説明する。Playは実際に試していなければ確認済みと書かない。

復旧は`retry_world`へ会話内の元の`operationId`、`bundle`、`revision`、`baseHash`を内部で渡す。変更操作を再実行して重複させない。古い操作を再送してその後の編集を巻き戻さない。ブラウザ内の未完了操作も再確認できる。Sitesに保存された状態からの復元とは説明しない。

会話の表示は`show_world`に完全なbundle、revision、operationId、baseHashを渡す。引数が欠けたら会話内の直前の結果を引き継ぎ、別の作品を作って代用しない。`open_studio`はアプリ専用のグローバル入口で、会話の表示には使わない。保存済み作品は一覧または作品ID付きリンクから開く。作品ごとの`/editor/{projectId}`、新規作成の`/new`も共通エディターにつながる。保存済み作品のURLは同じブラウザの保存領域が必要。取り込み・素材追加・書き出しは通常版と同じ場所を使う。長い説明や確認ダイアログを制作画面に重ねない。スマホは全画面を強制せず、対応するhostで会話内表示と広いEditorを切り替える。
