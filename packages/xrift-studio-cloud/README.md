# XRift Studio Cloud MCP

ChatGPT Workのサイドバーから、PCを起動せずにワールドを作成・取り込み・編集するためのリモートMCP実装です。ブラウザ版と同じ`VisualEditorPrototype`とdocument toolを使います。デスクトップ版のstdio MCPは変更しません。

## 利用の流れ

1. 認証付きのクラウドMCPを配置し、プラグインを接続する。
2. ChatGPT WorkのサイドバーでXRift Studioを開く。
3. 名前を入力して作成するか、`.xriftstudio` / ZIPを取り込む。
4. 「会話に編集対象を渡す」を押し、変更内容を伝える。
5. 「読み直す」でAIの変更を既存のエディターに表示する。手元で未保存の編集があれば保存を先に行う。競合時は書き出しを案内し、勝手に置き換えない。
6. 「手元の編集を書き出す」で`.xriftstudio`を保存し、ブラウザ版またはデスクトップ版で続ける。

エディター内の既存のAssets取り込みも使えます。会話に添付した画像・GLBが自動的にエディターへ転送される仕組みは未実装です。サーバーは`.xriftstudio`の実際のバイト列を`import_project`で受け取れますが、会話添付の取り出しは接続先の権限とファイル転送機能が別途必要です。画像から3Dモデルを生成する機能は含みません。

## 実装

- `worker.ts`: 認証を注入するHTTP MCPハンドラー。`POST /mcp`の初期化、tool discovery、tool call、MCP App resourceを処理する。
- `sites-worker.ts`: Sitesの認証済みdispatcher専用のWorker。`oai-authenticated-user-id`をユーザー境界として使う。外部からこのヘッダーを渡せる汎用Workerへ、そのまま配置しない。
- `migrations/0001_worlds.sql`: D1の所有者別インデックス。`state`はR2の不変スナップショットキー。
- `WORLD_FILES`: R2互換のオブジェクトストア。CAS保存前に別キーへ書き、D1のrevisionが一致するときだけ参照を切り替える。旧スナップショットと失敗したCASの孤立オブジェクトは消さない。運用時にDBで参照中のキーを保護するGCが必要。
- `src/chatgpt-editor.tsx`: 公式SDKによるhost bridge、クラウド保存、ブラウザの作業用コピー、既存エディターの表示。
- `document-tools.json`: デスクトップMCPから再利用した91個のdocument toolの説明とschema。Rustのschema helperを必要とするtoolは公開しない。`describe_document_tool`でschemaを読み、`edit_world`へその引数を渡す。

保存されたプロジェクトは所有者IDとワールドIDの両方で取得します。書き込みはrevisionをD1で比較し、古い保存を拒否します。その他のScene、Prefab、取り込んだ素材のバイト列を保持します。サーバー上ではScriptの実行、Play、撮影、XRiftへの公開、ローカルファイルアクセスを行いません。Playはエディターで利用者が開始する既存の動作です。サーバーのdocument更新だけで見た目の検証済みとは扱いません。

## 配置と接続（未実施）

現在のGitHub Pagesは静的配信のため`POST /mcp`や共有保存を扱えません。既存のPages公開先を変更せず、別の認証付きWorkerにMCPとApp用アセットを配置します。

Sitesを利用する場合は、実際に登録したSiteの構成に`mcp`、D1、R2、認証のcapabilityを追加し、Sitesが用意するDB / WORLD_FILES / ASSETS bindingを接続します。認証済みdispatcher以外の公開入口を作らないでください。Sitesのcanonical pluginを使い、同じSiteを別pluginで二重登録しません。

別ホストを使う場合は、`handleMcp`へOAuth/sessionを検証する`authenticate`を渡し、同じユーザーIDを各リクエストに返す必要があります。クライアント指定の所有者ID、共有APIキー、未検証のヘッダーをユーザーIDとして扱いません。

Appアセットには`chatgpt.html`と、その参照する既存のブラウザ版のJS・CSS・カタログアセットを含めます。Viteのpreview入力に追加済みです。`resources/read`は配置先のHTMLを読み、絶対URLとbase URLを設定します。プラグインの配布だけではサーバーは動きません。

独自ホスト向けのprivate plugin sourceは`plugins/xrift-studio/`です。実際に配置・確認したHTTPSエンドポイントを使って構成を生成します。

```sh
node scripts/package-cloud-plugin.mjs https://YOUR-DEPLOYED-HOST/mcp /tmp/xrift-plugin
```

上記のURLは説明用です。生成スクリプトは実際のエンドポイントの疎通・OAuth確認を代行しません。公開ディレクトリへの申請、アカウントへのplugin登録、デプロイ、スマホ実機でのhost表示は未実施です。

## 制限と検証

初期実装では展開後およびJSON保存形式で8 MBまでです。大きなGLBを含むプロジェクトは既存のブラウザ版・デスクトップ版で扱ってください。ZIPは解凍前に展開サイズを制限し、既存のパス・CRC・参照素材チェックを使います。

ChatGPT WorkのMCP App / global entrypointに対応するhostが対象です。通常のChatGPT画面での表示、iOS / Androidの実機、iframe内のIndexedDB・ダウンロード・WebGL・Playは接続後の確認が必要です。スマホ対応を実機確認済みとは扱いません。

```sh
pnpm typecheck
pnpm --filter xrift-studio-cloud typecheck
node scripts/generate-cloud-mcp-schemas.mjs --check
node scripts/browser-project-transfer.test.mjs
```

schema変更後は`node scripts/generate-cloud-mcp-schemas.mjs`で再生成します。クラウドの所有者分離、競合保存、取り込みと書き出しを隔離したデータで検証してください。本番配布前には認証の実接続とApp表示を確認します。
