# XRift StudioのSites MCP

MCPは操作名と小さな引数を検証してEditorへ渡します。作品の生成・編集・保存・描画は、通常ブラウザ版と共通のEditor内で行います。MCPは作品の一時保存やクラウド作品管理を行わず、作品全文を会話モデルに転記させません。

## 会話から使う

1. `create_world({name, operationId})`で新規制作を依頼します。安定した操作IDから同じブラウザ内の作成対象を決めます。サーバー応答は受付だけなので、Editorの実行報告を待ちます。
2. `describe_document_tool`で操作のschemaを読み、Editorから返った`projectId`と`revision`を`edit_world({projectId, expectedRevision, operationId, operations})`へ渡します。最大200操作を一括で適用し、失敗したバッチでは作品を変更しません。`ref`と後続の`$ref`で新しく作ったEntityなどを参照できます。
3. `show_world({projectId})`は同じブラウザの保存済み作品を開きます。`capture_scene_view({projectId})`は現在開いている対象の実際のPNGを取得します。
4. `get_editor_context`は現在の作品名・対象ID・revision・上限付きのEntity一覧を会話へ渡します。作品全文や素材をサーバーへアップロードしません。
5. `retry_world({projectId, operationId})`は同じブラウザに残る元の結果を再確認します。編集処理を繰り返しません。`get_operation_status({operationId})`で実行報告を確認できます。

同じ操作IDへ別の引数を渡したり、別作品や古いrevisionへ編集したりすると拒否します。再送用データが残っていない場合、MCPから復元できるとは案内しません。Editorが閉じている・未接続・描画できない場合は、その段階を未確認として報告します。

サーバーの`structuredContent`にはコマンド名、操作ID、対象IDと受付状態だけを返し、実際の操作は`_meta.xriftCommand`でAppへ届けます。受信側でも内容を検証します。`documentEdited`、`serverSaved`、`browserSaved`、`rendered`は受付時にはfalseで、実際の`studioDelivery`だけを完了の根拠にします。画像取得の失敗で、確認済みのブラウザ保存を失敗へ置き換えません。

## Editorと保存

作品、素材、復旧用の操作結果はブラウザ内に保存します。通常サイトとChatGPT内では保存領域が分かれ、別の端末へ自動同期しません。長期保管や移動には`.xriftstudio`の書き出し・取り込みを使います。

「会話に編集対象を渡す」は現在の対象情報を伝える操作です。素材プレビューの生成とブラウザ保存が安定するのを待ち、準備が30秒以内に終わらなければ処理を中止します。文書のアップロードは行いません。編集中の内容が変わった場合も、古いrevisionで上書きしません。

`open_studio`はapp専用のグローバル入口で、空の引数を受け入れます。新規作成、再開、ファイル取り込み、書き出し、素材追加には共通Editorの処理を使います。会話モデル向けの操作は8個、app専用の入口は1個です。

以前のD1一時保存は実行経路から外しました。`store_editor_snapshot`とsnapshotIdを受け取るHTTP APIはありません。既存DBを自動的に消さないため、配置済みbindingとmigration履歴は保持します。旧記録は新しいMCPから読み書きできず、基盤の完全消去やバックアップ保持期間は保証しません。DBの永久削除は別の明示的な作業です。

## Sitesへの配置と接続

- Site: https://xrift-studio-pr124.kkkkkkasdad.chatgpt.site
- MCP: https://xrift-studio-pr124.kkkkkkasdad.chatgpt.site/mcp
- 既存の所有者用プラグイン: https://chatgpt.com/plugins/plugin_asdk_app_sites_a7e0e2c988c08191aa694d396a182112

Sitesが用意した既存Appとプラグインを更新します。別のAppや同名のプラグインを作って置き換えません。[公式のSites MCP手順](https://help.openai.com/en/articles/20001547-hosting-a-plugin-with-chatgpt-sites)に従い、「Plugins → Personal → Created by you」からInstall・Connectします。所有者用接続と公開ディレクトリの審査申請は別です。

SitesはMCPの手前でOAuth認証を行います。各toolは`oauth2`と`openid resource.invoke email`を宣言します。作品をサーバー保存しなくても、この管理OAuth境界は変わりません。公開SiteのURLや`_meta.ui.visibility`は、匿名MCPアクセスの設定ではありません。認証を削除したり、手作業のBearer tokenをZIPへ含めたりしません。

現在の公式案内では、Business・Enterpriseの共有ではSiteとプラグイン両方へのアクセスと各人の接続が必要です。Pro・個人アカウントはSiteプラグインを招待や共有リンクで直接共有できません。公開ディレクトリへの申請は、対象Appの設定と審査で別途確認します。

### ビルドと更新

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm mcp:cloud:check
pnpm test:cloud
pnpm build:sites
```

`dist/server/index.js`にWorker、`dist/client/`に紹介ページ・通常Editor・MCP App、`dist/.openai/hosting.json`に既存Site設定、`dist/drizzle/`に既存migrationを出力します。AppのJavaScriptとCSSは認証済みMCPリソースのHTMLへ同梱し、10 MiB未満に制限します。既存Sitesソースを基点に変更を反映し、そのコミットから配布物を作ります。GitHubへのPushだけではSiteを更新しません。

録画は既存Sitesソースの`public/review/xrift-studio-walkthrough-draft.mp4`でGit管理されています。Viteが公開素材を出力し、Sitesビルドが`dist/client/review/`へ引き継ぎます。PRのファイルだけでSitesソースを置き換えて録画を消さないでください。

## 公開ディレクトリの申請資料

`plugins/xrift-studio`に掲載情報、アイコン、制作手順skillを置きます。資料の変更は既存Sitesプラグインへの自動反映ではありません。実際の接続先と空の出力先を指定して書き出します。

```sh
node scripts/package-cloud-plugin.mjs https://xrift-studio-pr124.kkkkkkasdad.chatgpt.site/mcp /tmp/xrift-publication
```

出力は`.app.json`や非公開App参照を除き、portableな`mcp.json`を含めます。申請資料0.1.8はCreativity、日本語紹介文、正例5件・負例3件、[既存の手動操作動画](https://xrift-studio-pr124.kkkkkkasdad.chatgpt.site/review/xrift-studio-walkthrough-draft.mp4)を保持します。この録画は手動編集・色変更・保存・再開の以前の草稿で、待機時間を一部省略しています。現在のAI制作の成功を証明するものではありません。

ZIPの保存、申請Appの認証、scan、審査提出、承認後の公開を区別してください。所有者用接続が動いても、別の申請AppでのOAuth成功は保証されません。開発者本人の宣言と、実際の提出用Appを通した審査アクセスが必要です。

## 検証

`pnpm test:cloud`は、MCPがDBに触れず小さなコマンドだけを返すこと、対象・引数の検証、ブラウザ側の保存・復旧、操作の二重実行と古い結果による巻き戻し防止を確認します。旧storage moduleのテストはmigration履歴と併せて残していますが、HTTP処理からは使いません。

`/delivery-test.html?build=1`は隔離したブラウザで配布Appを使い、新規作成、追編集、同じコマンドの再送、古いrevisionの拒否、実際の保存とScene View PNGを確認します。手動作品の対象情報を伝えても、作品全文をMCPへ送らないことも確認します。

この検証と実ChatGPTの動作は別です。実ホストではEditorの起動、コマンド実行、同じoperationIdの保存・描画報告、PNG受信を順に確認し、未実施の結果を完了扱いしません。
