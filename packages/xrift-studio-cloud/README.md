# XRift Studioのプラグイン接続

ChatGPTの制作依頼からワールドを作るMCPと、通常ブラウザ版と共通のEditorを使うMCP Appです。会話での編集は、認証された利用者ごとにSitesのD1へ一時保存した文書を短いIDで引き継ぎます。ブラウザ作品と素材ファイルの長期保管には、ブラウザ保存と`.xriftstudio`の書き出しを使います。

## 制作の流れ

1. `create_world({name, operationId})`で新規作成し、snapshotId・projectId・revision・hash・expiresAtを受け取ります。operationIdは操作ごとに一意とし、同じ要求の通信再試行だけで再利用します。
2. `describe_document_tool`で操作のschemaを読み、`edit_world({snapshotId, expectedRevision, operationId, operations})`へ短い参照を渡します。Editorが閉じていても編集できます。最大200操作を一括処理し、途中の失敗では保存しません。成功バッチごとにrevisionが一度進みます。
3. 最新の`show_world({snapshotId})`または`capture_scene_view({snapshotId})`で表示します。文書全体は`_meta.xriftStudio`からアプリへ渡し、モデルへJSONの転記を求めません。
4. 同じ結果の再送は`retry_world({snapshotId})`です。期限切れや後続編集のある古いIDを拒否し、別作品を代用しません。
5. 手動編集したブラウザ作品は、`get_editor_context`または「会話に編集対象を渡す」で明示的に一時保存します。開いたり保存したりするだけでは既存作品をアップロードしません。素材プレビュー生成による文書更新を待ち、同じ版をブラウザに保存してから取り込みます。準備が30秒で完了しなければ送信せず再試行を案内し、生成済みのサムネイルと全文ハッシュの確認を保ちます。

一時保存、ブラウザ保存、画面反映、画像受信を区別します。serverSaved:trueは一時保存を確認した値であり、ブラウザ保存や表示の証拠ではありません。同じoperationId・projectId・revision・hashのアプリ報告と実際のPNGを確認します。

## 共通処理とChatGPT接続の境界

`BrowserEditorApp.tsx`、`BrowserProjectLibrary`、`VisualEditorPrototype`を両版で共用します。作品を開く・保存する・書き出す操作は`browser-project-session.ts`のキューと所有権の処理を使います。`chatgpt-editor.tsx`は公式host bridge、受信キュー、反映報告、復旧履歴を扱います。保存・一覧・取り込み・書き出しは再実装しません。

## 保存とデータの境界

- 所有者はSitesが付与する`oai-authenticated-user-id`だけから決めます。引数、メール、Cookie、サービス用アクセスから利用者を推測しません。利用者のいないデータ操作は401です。すべてのスナップショット参照に所有者と期限の条件を付け、IDを知る他の利用者も参照できません。
- D1には文書JSON、サイト内の利用者ID、作品ID、操作ID、revision、ハッシュ、作成時刻と期限を保存します。素材ファイルのバイト列、認証用のメールアドレスや認証トークンは保存しません。data URLを含む文書は拒否します。任意URLの取得、サーバーでのScript実行、Play、公開、バックグラウンド制作は行いません。
- 各保存結果は書き込みから24時間参照できます。読み取り・表示・再送では期限を延長しません。期限後の明示的なブラウザ作品の取り込みは新しい書き込みです。期限切れの記録は後続の書き込みごとに所有者の範囲で最大64件ずつ削除します。利用がなければ物理的な行が残る場合がありますが、参照は拒否します。基盤のバックアップ保持期間は未確認であり、24時間以内の完全消去を保証しません。
- 一時保存は1件1 MiB、利用者ごとに有効な128件・20作品・合計16 MiBまでです。MCPリクエストも1 MiBまでです。一般的なクラウド作品一覧・素材保管・端末間自動同期はありません。通常サイトとChatGPT内のブラウザ保存領域は別です。
- 不変の保存結果と作品ごとの最新参照を分け、D1の単一バッチでrevision・編集元ハッシュを比較して更新します。同時編集は一方だけが成功します。操作IDは入力ハッシュへ結び付け、期限内の同一要求の再送では同じ結果を返します。異なる入力での操作ID再利用は拒否します。過去の成功結果の再取得は最新状態を巻き戻しません。
- 保存障害・競合・上限では成功と報告せず、入力を保ちます。リクエスト本文や文書を独自のアクセスログへ出しません。ChatGPTの会話履歴と基盤ログの保持は各提供元の条件に従います。

## 実装

`worker.ts`はMCPと所有者の確認、既存の文書変換、短い参照への変換を扱います。`snapshot-store.ts`はD1のprepared statement・所有者分離・期限・CAS・二重送信を扱います。実行時にDDLは作りません。`db/schema.ts`から生成した`drizzle/`をソースと配布物に含め、SitesがWorker公開前に適用します。適用済みmigrationは変更せず、新しいmigrationを追加します。

`document-tools.json`は共通Editorの91個の操作schemaです。既存の純粋な`callTool`はローカルEditorと検証でも使い、HTTPで所有者確認を回避して呼ぶ経路はありません。`chatgpt-project.ts`のSHA-256とschema検証を共有します。ハッシュだけで本人確認するものではありません。

## Sitesへの配置と接続

この実装は、SitesにMCPとMCP Appを配置し、Sitesが用意するプラグインを接続する方式です。[公式のSites MCP手順](https://help.openai.com/en/articles/20001547-hosting-a-plugin-with-chatgpt-sites)に従います。公開ディレクトリへの審査は、所有者が使い始めるための前提ではありません。

- Site: https://xrift-studio-pr124.kkkkkkasdad.chatgpt.site
- MCP: https://xrift-studio-pr124.kkkkkkasdad.chatgpt.site/mcp
- 既存の所有者用プラグイン: https://chatgpt.com/plugins/plugin_asdk_app_sites_a7e0e2c988c08191aa694d396a182112

所有者はChatGPTの「Plugins → Personal → Created by you」からXRift Studioを開き、必要に応じてInstall・Connectを行います。接続済みなら、対応するChatGPT・Codexの会話でXRift Studioを選び、「小さな公園を作って」のように依頼します。グローバル入口の`open_studio`から共通エディターも開けます。Web・モバイル・デスクトップの提供状況と、WebGL・保存・ファイル操作が実際に使えるかは別に確認します。

### 再現できるビルドと更新

`.openai/hosting.json`には既存の`project_id`と`mcp` capabilityを保持し、論理D1 bindingを`DB`に設定します。新しいSiteやAppを作って置き換えず、同じSitesソースへ変更を反映して公開します。GitHubへのPushだけではSiteは更新されません。GitHub Pagesの通常ブラウザ版も、MCPをホストしません。

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm mcp:cloud:check
pnpm test:cloud
pnpm build:sites
```

`build:sites`は次をまとめて生成し、実際の出力を使ったMCPの初期化・ツール一覧・画面リソース・新規作成・追編集・表示要求を確認します。

- `dist/server/index.js`: Cloudflare Workers互換のMCPサーバー
- `dist/client/index.html`、`editor.html`: 紹介ページと通常ブラウザ版
- `dist/client/chatgpt.html`: 公式MCP Apps / OpenAI Extensionsのbridgeを使う共通エディター
- `dist/.openai/hosting.json`: 既存SiteのID、capability、DB binding
- `dist/drizzle/`: 公開前に適用するスキーマmigration

AppのJavaScriptとCSSは認証済みMCPリソースのHTMLに同梱します。別originのiframeからSiteのJavaScriptを匿名で読み込むことに依存しません。HTMLは10 MiB未満に制限します。`vite.chatgpt.config.ts`と`vite.sites.config.ts`を含むこのビルド設定を、Sites側だけの手作業として残さないでください。

出力確認後、同じソースを既存Sitesプロジェクトのソースリポジトリへ反映し、そのコミットから作った出力を保存・公開します。公開後は既存プラグインのツール一覧を更新し、`describe_document_tool`などの読み取りと、影響した操作を確認します。ローカルのWrangler設定はこの出力を確認する補助です。別のCloudflare公開先を作る手順ではありません。

### 認証とアクセス

SitesはMCPの手前でOAuth認証を行います。未認証のアクセスには401と、`/.well-known/oauth-protected-resource/mcp`を指す`WWW-Authenticate`を返します。必要なscopeは`openid resource.invoke email`です。各toolの`securitySchemes`もこの値を宣言します。認証を削除したり、手作業のBearer tokenを`mcp.json`に含めたりしないでください。

Siteの公開範囲とプラグインの利用権限は別です。現在の公式案内ではBusiness・Enterpriseのワークスペース共有には両方へのアクセスと各人の接続が必要で、Pro・個人アカウントはSiteプラグインを招待や共有リンクで直接共有できません。SiteのURLを公開するだけで、全員がプラグインを使えるとは案内しません。公開ディレクトリへの申請可否は、その申請用Appの設定と審査で別途確認します。

`initialize`は対応版（2025-03-26、2025-06-18、2025-11-25）が指定された場合に同じ版を返します。未対応版には最新の対応版を返し、クライアントが接続を続けられるか判断します。

## 公開ディレクトリの申請資料

`plugins/xrift-studio`には掲載情報、アイコン、制作手順skillを置きます。このディレクトリだけではサーバーを配置できません。また、ここでskillを編集しただけではSitesが管理する既存プラグインに自動追加されません。既存プラグインの編集機能と、Siteを再公開した後の保持を確認してから扱ってください。

公開申請資料の書き出しが必要な場合だけ、実際のHTTPSエンドポイントと空の出力先を指定します。

```sh
node scripts/package-cloud-plugin.mjs https://xrift-studio-pr124.kkkkkkasdad.chatgpt.site/mcp /tmp/xrift-publication
```

生成先の`xrift-studio`をZIPに含めます。スクリプトは既存出力への混在を防ぎ、`.app.json`と非公開Appへの参照を含めません。`mcp.json`にはStreamable HTTPの接続先を記載します。OAuthを用意する項目ではなく、ZIP書き出しは接続・scan・審査の完了も意味しません。Sitesを使い始めるために、このZIPから同名のプラグインを作り直す必要はありません。

公開申請には、開発者・ドメインの確認、実際の機能に合った紹介文とポリシー、対象地域、実録デモ、正常系5件・失敗系3件の審査例、必要な審査アクセスを揃えます。カテゴリは3Dワールドの創作に合わせた`Creativity`です。保存済みドラフトの審査資料を保持しながら更新してください。

申請用Appに「Authorization unavailable」「MCP configuration incomplete」と表示された場合は、Connect・Reconnectと最新scanの結果を確認します。Sites由来の所有者用Appと申請用Appは同じものとは限りません。所有者用接続が動いていても、申請用接続の成功は保証されません。認証開始前の失敗はWorkerの編集処理やZIPの再生成だけで修復できると判断せず、接続の対応関係を確認します。

[既存の録画草稿](https://xrift-studio-pr124.kkkkkkasdad.chatgpt.site/review/xrift-studio-walkthrough-draft.mp4)を`extensions.com.openai.review.demo_recording_url`に設定しています。手動編集・色の変更・ブラウザ保存・再開の実画面を収録した以前の草稿で、待機時間を一部省略しています。現在の24時間の一時保存や、ChatGPTからのAI編集・表示・画像受信を証明する動画ではありません。申請資料0.1.7はこのURLと説明だけを更新し、MCPサーバーのバージョンは0.1.6のままです。

録画は既存Sitesソースの`public/review/xrift-studio-walkthrough-draft.mp4`で管理します。Viteが公開素材を出力し、Sitesビルドが`dist/client/review/`へ引き継ぎます。更新時は既存Sitesソースを基点とし、PRのファイルだけで置き換えて録画を消さないでください。会話からの制作、同じ作品への追編集、実際の表示までを録画していない場合、AI制作の審査を満たすデモとして扱いません。

公式手順: [公開申請](https://developers.openai.com/plugins/deploy/submission)、[認証](https://developers.openai.com/plugins/build/auth)、[接続と検証](https://developers.openai.com/plugins/deploy/connect-chatgpt)。要件は申請時に再確認します。

## 検証と確認できていない範囲

`pnpm test:cloud`は実SQLiteを用いた利用者分離、全参照の期限、競合、二重送信、保存障害、短いIDからアプリへの文書の受け渡しと、共通の保存・再開・取り込み・書き出し・申請資料の生成を確認します。`pnpm build:sites`は配布するWorkerとHTMLを実際に読み、MCPの応答とAppリソースを確認します。どちらも実際のChatGPTで画面が表示された証拠ではありません。

ローカルで表示と保存を確認する場合は、`pnpm dev -- --host localhost --port 1420`で起動し、`/delivery-test.html`を開きます。「検証ワールドを作成」「立方体を移動」は、最新のbundleとrevisionを引き継いで同じ作品を編集します。`?build=1`はビルド済みのApp HTMLを使います。専用ブラウザプロファイルを使い、利用者の既存作品と分けてください。

実ホストでは、新規作成、短いsnapshotIdによる追編集、`show_world`への最新IDの受け渡し、同じ操作IDの`studioDelivery`、ブラウザ保存、実際のScene View PNGの受信を順に確かめます。ローカルのAppBridgeで画像を送れても、実際のChatGPTで受信できたことにはしません。2026-10-02時点では所有者用プラグインの認証済みMCP呼び出しを確認済みで、ChatGPTでのAI編集の自動反映・会話へのPNG受信、iOS・Androidの実機操作は未確認です。

### 表示の引数とグローバル入口

会話では`show_world`へ最新のsnapshotIdだけを渡します。欠けた引数は`conversation_state_required`として拒否し、別作品や新しい作品を代用しません。元の編集データの値はエラーへ出さず、読み取れない文書部分と検証パスを示します。

`open_studio`は`ui.visibility: ["app"]`のグローバル入口です。[公式仕様](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md#global-entrypoint)に従い、ナビゲーションからの空の引数は受け入れます。会話モデルには`show_world`を公開し、既存プラグインIDと`open_studio`のdeep linkは維持します。
