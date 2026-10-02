# XRift Studioのプラグイン接続

ChatGPTの制作依頼からワールドを作るリモートMCPと、既存のブラウザ版を使うMCP Appです。作品は利用者のブラウザと`.xriftstudio`ファイルで保持します。共有DB、D1、R2、ユーザーアカウント、クラウド作品一覧は使いません。通常ブラウザ版と作品の操作を共通化し、ChatGPTとの接続はプラグイン側で扱います。

## 制作の流れ

1. プラグインを接続し、会話でワールド制作を頼みます。
2. `create_world`の結果のbundleとrevisionを会話内で引き継ぎ、`edit_world({bundle, revision, operations})`で追編集します。Editorの表示、activeProjectId、反映報告や画像を編集の前提にしません。最大200操作を一つのバッチで適用し、途中で失敗した部分結果は使いません。
3. 結果を共通エディターへ取り込み、ブラウザ保存と実際のScene Viewを確認します。データ編集・ブラウザ保存・画面反映・画像受信を区別します。画像が未取得でも追編集は続けられます。
4. 作品ID付きリンクまたは作品一覧から保存した作品を再開します。対象の一致はアプリの`projectMatched`報告で確認します。
5. 取り込みと書き出しは、通常版と同じ「プロジェクトを開く」「プロジェクトを書き出す」を使います。会話に添付した素材の自動取り込みは未対応です。

## 共通処理とChatGPT接続の境界

`BrowserEditorApp.tsx`を両版の入口にし、`BrowserProjectLibrary`と`VisualEditorPrototype`で同じ画面を表示します。作品を開く・保存する・書き出す操作は`browser-project-session.ts`の同じキューと所有権の処理を使います。プロジェクトIDの検証・解決・URLと取り込み時のID重複処理は`browser-project-routing.ts`、永続化は`browser-project-storage.ts`にまとめています。`browser-studio-project-store.ts`はEditorをマウントせずに同じ所有権・保存キューでデータを保存し、画面を開く処理から分離します。

`chatgpt-editor.tsx`は共通入口へホスト機能を渡します。MCP Apps接続、受信キュー、会話への報告、AI操作の復旧履歴を扱い、作品の保存・一覧・取り込み・書き出しは再実装しません。変更は共通入口の`apply`へ渡し、共通エディターの実データ・保存・Scene View PNGを確認します。

Sitesに作品を保存する領域は追加しません。会話内の最新の編集結果を次の呼び出しへ渡し、ブラウザ内の作品と操作履歴で再開・再送できます。ChatGPTの会話の保持は提供元の条件に従い、projectIdだけでサーバーから作品を取得するAPIはありません。作品と素材はブラウザに保存します。通常サイトとChatGPT内では保存領域が分かれるため、自動同期はありません。受け渡しには作品ファイルを使います。

## 保存とデータの境界

- Workerは1回のリクエストに含まれるdocument JSONを検証・加工して返す。作品・一覧・所有者を保持せず、他の利用者の作品を取得するAPIを持たない。Sitesの認証済み接続から利用する。Workerは利用者を識別して作品を保存する処理を持たないが、MCPの認証が不要という意味ではない。
- 編集するdocument JSONはChatGPTの会話とMCP通信を通る。「サーバーを通らない」「会話にも残らない」という意味ではない。リクエスト本文・編集結果をログに出さない。インフラのログやChatGPT側の保持条件は公開時のポリシーで説明する。
- 素材と他のSceneはブラウザのIndexedDBで保持する。適用前にパス・document schema・参照素材を既存のStudio処理で検証する。保存済みの作品は同じブラウザの一覧から再開できる。iframeのストレージ可否はhost依存。保存失敗時は成功扱いしない。
- 会話用bundleとMCPリクエストは1 MBまで。最大200操作を順に処理し、途中で失敗した場合は部分結果を適用しない。取り込みは既存ブラウザ版の展開サイズ制限256 MBを使う。大きな作品のAI編集には向かない。
- サーバーでScript・Play・公開・任意のファイルアクセスは実行しない。非同期ジョブもない。ChatGPTがツールを呼ぶ間に制作する方式で、会話を閉じた後に制作を続けるものではない。
- ブラウザ保存はバックアップではない。ブラウザのデータ削除や別端末への移動に備え、作品を書き出す。端末間同期はない。

## 実装

`worker.ts`は`POST /mcp`の初期化、ツール、App resourceを扱う。`ASSETS`だけを使い、DB・オブジェクトストア・認証ヘッダーには依存しない。`document-tools.json`は既存MCPから再利用した91個のdocument toolのschema。`src/chatgpt-editor.tsx`は公式host bridgeから共通の`BrowserEditorApp`を使う。`chatgpt-project.ts`はschema検証と、編集元の比較に使うSHA-256を共用する。ハッシュはユーザー認証やサーバー上のCASではない。

## Sitesへの配置と接続

この実装は、SitesにMCPとMCP Appを配置し、Sitesが用意するプラグインを接続する方式です。[公式のSites MCP手順](https://help.openai.com/en/articles/20001547-hosting-a-plugin-with-chatgpt-sites)に従います。公開ディレクトリへの審査は、所有者が使い始めるための前提ではありません。

- Site: https://xrift-studio-pr124.kkkkkkasdad.chatgpt.site
- MCP: https://xrift-studio-pr124.kkkkkkasdad.chatgpt.site/mcp
- 既存の所有者用プラグイン: https://chatgpt.com/plugins/plugin_asdk_app_sites_a7e0e2c988c08191aa694d396a182112

所有者はChatGPTの「Plugins → Personal → Created by you」からXRift Studioを開き、必要に応じてInstall・Connectを行います。接続済みなら、対応するChatGPT・Codexの会話でXRift Studioを選び、「小さな公園を作って」のように依頼します。グローバル入口の`open_studio`から共通エディターも開けます。Web・モバイル・デスクトップの提供状況と、WebGL・保存・ファイル操作が実際に使えるかは別に確認します。

### 再現できるビルドと更新

`.openai/hosting.json`には既存の`project_id`と`mcp` capabilityを保持します。新しいSiteやAppを作って置き換えず、同じSitesソースへ変更を反映して公開します。GitHubへのPushだけではSiteは更新されません。GitHub Pagesの通常ブラウザ版も、MCPをホストしません。

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
- `dist/.openai/hosting.json`: 既存SiteのIDとcapability

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

既存の録画草稿は手動操作の確認用です。会話からの制作、同じ作品への追編集、実際の表示までを録画していない場合、AI制作の審査を満たすデモとして扱いません。

公式手順: [公開申請](https://developers.openai.com/plugins/deploy/submission)、[認証](https://developers.openai.com/plugins/build/auth)、[接続と検証](https://developers.openai.com/plugins/deploy/connect-chatgpt)。要件は申請時に再確認します。

## 検証と確認できていない範囲

`pnpm test:cloud`はMCPと共通の保存・再開・作品ID・取り込み・書き出し・申請資料の生成を確認します。`pnpm build:sites`は配布するWorkerとHTMLを実際に読み、MCPの応答とAppリソースを確認します。どちらも実際のChatGPTで画面が表示された証拠ではありません。

ローカルで表示と保存を確認する場合は、`pnpm dev -- --host localhost --port 1420`で起動し、`/delivery-test.html`を開きます。「検証ワールドを作成」「立方体を移動」は、最新のbundleとrevisionを引き継いで同じ作品を編集します。`?build=1`はビルド済みのApp HTMLを使います。専用ブラウザプロファイルを使い、利用者の既存作品と分けてください。

実ホストでは、新規作成、同じbundleへの追編集、`show_world`への最新結果の受け渡し、同じ操作IDの`studioDelivery`、ブラウザ保存、実際のScene View PNGの受信を順に確かめます。ローカルのAppBridgeで画像を送れても、実際のChatGPTで受信できたことにはしません。2026-10-02時点では所有者用プラグインの認証済みMCP呼び出しを確認済みで、ChatGPTでのAI編集の自動反映・会話へのPNG受信、iOS・Androidの実機操作は未確認です。

### 表示の引数とグローバル入口

会話では`show_world`へ完全なbundle、revision、operationId、baseHashを渡します。欠けた引数は`conversation_state_required`として拒否し、別作品や新しい作品を代用しません。元の編集データの値はエラーへ出さず、読み取れない文書部分と検証パスを示します。

`open_studio`は`ui.visibility: ["app"]`のグローバル入口です。[公式仕様](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md#global-entrypoint)に従い、ナビゲーションからの空の引数は受け入れます。会話モデルには`show_world`を公開し、既存プラグインIDと`open_studio`のdeep linkは維持します。
