---
name: world-creation
description: XRift Studioで会話から3Dワールドを新規制作したり、利用者が会話に渡した作品を編集するときに使う。
---

# XRift Studioでワールドを作る

利用者の制作依頼を、Studioの実際のdocument toolで形にする。新規制作では`create_world`を呼び、反映報告と画像を待ってから`edit_world({operations})`を続けて呼ぶ。既存作品は開いているStudioの最新データを使う。`get_editor_context`で対象を確認し、対象がなければ作品を開く操作を案内する。

使うdocument toolのschemaを`describe_document_tool`で確認する。`edit_world.operations`に`tool`と通常の`arguments`を並べる。projectId・sceneId・expectedRevisionはStudioが各操作に補う。最大200操作を一つのバッチで適用し、revisionを一度進める。bundleを省略すれば手動編集後も現在のデータを使う。

床、SpawnPoint、配置する物の大きさと関係を整え、依頼に必要な形状・材質・照明を作る。入手していない画像やモデルの参照を作らない。素材ファイルは利用者がアプリ内で取り込む。添付画像やモデルが自動転送されたとは扱わない。

結果はアプリで確認できる。開いている作品へ自動反映する。失敗時だけ「反映を再確認」を案内する。見た目の確認が制作判断に必要なら、結果をStudioで開いたあとに`capture_scene_view`を呼ぶ。アプリが現在のScene ViewをPNGで会話へ送り返すので、その画像を見て構図・明るさ・配置・スケールなどを判断し、必要なら`edit_world`で調整して再度`capture_scene_view`する。キャプチャが失敗した場合は確認済みと扱わない。制作後は何を配置したかを短く伝え、「プロジェクトを書き出す」でブラウザ版・デスクトップ版へ引き継げることを伝える。Playの動作は実際に確認していない限り確認済みと書かない。

作品のクラウド保存・端末間同期・XRiftへの公開・非同期の制作ジョブはない。サーバーに作品を保存した、アプリを閉じた後も作り続ける、という説明をしない。

データの生成とStudioへの反映を区別する。create_world・edit_world・retry_worldの戻り値は反映待ちであり、完了の証拠ではない。同じoperationId・projectId・revision・hashのstudioDelivery報告（verified）とScene View画像が届いてから、画像を確認して反映済みと報告する。報告が届かない、画面が開いていない、接続が切れている、failed・waitingの場合は未完了と伝える。以前の成功報告を別の操作の確認に流用しない。復旧時はretry_worldにoperationIdを渡す。保存された結果が見つからない場合だけ元のデータも渡す。同じ編集操作を再実行して重複させない。

### ChatGPTで継続編集する

ChatGPT版は共通エディターまたはプロジェクト一覧へ直接入る。作成後はその作品をactiveにし、`edit_world({operations})`で現在のブラウザ保存と編集データを使う。`get_editor_context`で対象、`get_operation_status`で実際の反映結果を確認する。各ツール要求はアプリの返答まで未完了で、サーバーは作品やACKを保持しない。Studioが閉じている場合は完了扱いにしない。

1回の編集は最大200操作。`ref`で作成結果へ名前を付け、後の引数で`$ref`を参照する。projectId、sceneId、操作ごとのrevisionはStudioが補完する。追加だけの操作は最新revisionへ適用できるが、変更・削除のrevision競合は最新状態を確認して再試行する。失敗したバッチの途中データは保存しない。

受信後は自動で適用し、実データ・保存・Scene View PNGを検証して会話へ返す。失敗・未報告はChatGPTメニューの再確認で復旧する。スマホも共通エディターを使い、全画面を強制しない。利用可能な場合に会話内表示と全画面を切り替える。MI-03（処理中）、MI-05（成功）、MI-09（復帰）の既存表示を使い、長い案内や確認ダイアログを追加しない。
