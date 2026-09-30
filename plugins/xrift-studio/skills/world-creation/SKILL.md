---
name: world-creation
description: XRift Studioで会話から3Dワールドを新規制作したり、利用者が会話に渡した作品を編集するときに使う。
---

# XRift Studioでワールドを作る

利用者の制作依頼を、Studioの実際のdocument toolで形にする。新規制作では`create_world`を呼び、返された`bundle`と`revision`を使って`edit_world`を続けて呼ぶ。既存作品ではアプリの「会話に編集対象を渡す」から届いたbundleを使う。編集対象がなければ、この操作を案内する。

使うdocument toolのschemaを`describe_document_tool`で確認する。`edit_world.operations`に`tool`と通常の`arguments`を並べる。projectId・sceneId・expectedRevisionはサーバーが各操作に補う。最大64操作をまとめられる。各呼び出しの後は、必ず返された最新版bundleとrevisionを使う。以前のbundleを使って後続の編集を失わない。

床、SpawnPoint、配置する物の大きさと関係を整え、依頼に必要な形状・材質・照明を作る。入手していない画像やモデルの参照を作らない。素材ファイルは利用者がアプリ内で取り込む。添付画像やモデルが自動転送されたとは扱わない。

結果はアプリで確認できる。開いている作品がある場合は「AIの結果を開く」を案内する。制作後は何を配置したかを短く伝え、「作品を書き出す」でブラウザ版・デスクトップ版へ引き継げることを伝える。描画・Playを実機で確認していない場合、見た目や動作を確認済みと書かない。

作品のクラウド保存・端末間同期・XRiftへの公開・非同期の制作ジョブはない。サーバーに作品を保存した、アプリを閉じた後も作り続ける、という説明をしない。
