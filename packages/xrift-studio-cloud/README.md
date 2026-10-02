# XRift Studioのプラグイン接続

ChatGPTの制作依頼からワールドを作るリモートMCPと、既存のブラウザ版を使うMCP Appです。作品は利用者のブラウザと`.xriftstudio`ファイルで保持します。共有DB、D1、R2、ユーザーアカウント、クラウド作品一覧は使いません。通常ブラウザ版と作品の操作を共通化し、ChatGPTとの接続はプラグイン側で扱います。

## 制作の流れ

1. プラグインを接続し、会話でワールド制作を頼みます。
2. `create_world`の結果のbundleとrevisionを会話内で引き継ぎ、`edit_world({bundle, revision, operations})`で追編集します。Editorの表示、activeProjectId、反映報告や画像を編集の前提にしません。最大200操作を一つのバッチで適用し、途中で失敗した部分結果は使いません。
3. 結果を共通エディターへ取り込み、ブラウザ保存と実際のScene Viewを確認します。データ編集・ブラウザ保存・画面反映・画像受信を区別します。画像が未取得でも追編集は続けられます。
4. 作品ID付きリンクまたは`open_studio({projectId})`で保存した作品を再開します。対象の一致はアプリの`projectMatched`報告で確認します。
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

PR #124のMCPは既存のSitesプロジェクトで運用しています。接続先は `https://xrift-studio-pr124.kkkkkkasdad.chatgpt.site/mcp` です。GitHub Pagesは通常ブラウザ版の公開先であり、`POST /mcp`を処理しません。PRへのPushだけではSitesの内容は更新されません。

SitesはMCPの手前でOAuth認証を行います。未認証のアクセスには401と、`/.well-known/oauth-protected-resource/mcp`を指す`WWW-Authenticate`を返します。必要なscopeは`openid resource.invoke email`です。各toolの`securitySchemes`もこの値を宣言します。Sitesが用意した既存App・プラグインを使い、認証なしの接続へ変更したり、代わりのAppを新規作成したりしないでください。

公開申請ポータルで「Authentication unavailable」「MCP configuration incomplete」と表示された場合は、既存MCPのConnectまたはReconnectで認証方式と接続状態を確認します。別の申請AppでSitesの既存OAuth接続を利用できない場合は、認証を削除せず、既存のAppを公開申請へつなぐ方法を確認してください。ZIPの再アップロードだけでは認証やscanは完了しません。

`initialize`では、クライアントが指定した対応版（2025-03-26、2025-06-18、2025-11-25）を返します。未対応版には最新の対応版を返し、クライアントが接続を続けられるか判断します。

接続用パッケージは実際のエンドポイントから生成します。

```sh
node scripts/package-cloud-plugin.mjs https://xrift-studio-pr124.kkkkkkasdad.chatgpt.site/mcp /tmp/xrift-plugin
```

生成先にはmetadata、制作手順skill、PNGアイコン、`mcp.json`が入ります。サーバーの配置や公開申請は別の手順です。

## 全員向けの公開

自分用の開発接続と、一般公開の審査は別。一般公開では次を用意してOpenAIのプラグイン公開ポータルへ申請する。

1. 実運用のHTTPSエンドポイントと、検証済みのアプリ表示。
2. 公開する開発者の本人・組織確認とドメイン確認。
3. 実際の機能に合う説明・アイコン・Webサイト・サポート・プライバシーポリシー・利用規約の公開URL。
4. 実録デモ、正常系5件・失敗系3件の審査例、対象地域・リリース情報など。
5. 公開用ZIPをドラフトとしてアップロードし、MCPを接続・検査して審査例を実行する。審査に提出し、承認後に公開する。

接続先とポリシーのURLは掲載情報に含めています。カテゴリは3Dワールドの創作に合わせた`Creativity`です。公開申請の接続状態、最新scan、対象地域、審査用ケース、デモ録画、認証用の審査アクセスは、申請する版のポータルで確認してください。既存の録画草稿は手動操作の確認用で、AI制作の審査を満たした録画とは扱いません。メタデータ修正用のZIPだけで審査提出可能とは判断しません。

公式手順: [公開申請](https://developers.openai.com/plugins/deploy/submission)、[認証](https://developers.openai.com/plugins/build/auth)、[接続と検証](https://developers.openai.com/plugins/deploy/connect-chatgpt)。要件は申請時に再確認する。

## 検証

```sh
pnpm typecheck
pnpm --filter xrift-studio-cloud typecheck
node scripts/generate-cloud-mcp-schemas.mjs --check
node scripts/browser-project-transfer.test.mjs
```

ChatGPT WorkのMCP App / Extensionsに対応するhostが対象。通常のChatGPT画面・iOS / Androidの実機、iframe内のIndexedDB・ダウンロード・WebGL・Playは未確認。スマホで使えることは、対応するhostで制作から書き出しまで確認してから案内する。
