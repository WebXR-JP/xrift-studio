# XRift Studioのプラグイン接続

ChatGPTの制作依頼からワールドを作るリモートMCPと、既存のブラウザ版を使うMCP Appです。作品は利用者のブラウザと`.xriftstudio`ファイルで保持します。共有DB、D1、R2、ユーザーアカウント、クラウド作品一覧は使いません。既存のGitHub Pages版とデスクトップ版のstdio MCPは変更しません。

## 制作の流れ

1. プラグインを接続して「夜の山に焚き火がある休憩所を作って」などと頼む。
2. AIが`create_world`と`edit_world`を呼び、返された編集データを引き継いで制作する。
3. 対応するhostのアプリ画面で、ブラウザ版と共通のエディターを開く。既存の作品が開いている場合は「AIの結果を開く」で結果を確認する。
4. 手元の編集とAIの編集元が異なるときは確認を表示する。手元の内容は先に保存し、必要なら「作品を書き出す」で別ファイルに残す。同じ作品の結果を適用すると現在のSceneを置き換える。
5. 「作品を書き出す」でファイルを保存し、通常のブラウザ版・デスクトップ版で続ける。XRiftへの公開は既存のStudioで行う。

既存作品はアプリで`.xriftstudio` / ZIPを取り込む。「会話に編集対象を渡す」を押すと、現在の編集データがChatGPTへ渡る。素材のバイト列は含めない。会話に添付した画像・モデルの自動取り込みは未対応。AI生成結果の描画・Playはアプリ画面で確認する。

## 保存とデータの境界

- Workerは1回のリクエストに含まれるdocument JSONを検証・加工して返す。作品・一覧・所有者を保持せず、他の利用者の作品を取得するAPIを持たない。認証不要の純粋な変換ツールとして公開する。
- 編集するdocument JSONはChatGPTの会話とMCP通信を通る。「サーバーを通らない」「会話にも残らない」という意味ではない。リクエスト本文・編集結果をログに出さない。インフラのログやChatGPT側の保持条件は公開時のポリシーで説明する。
- 素材と他のSceneはブラウザのIndexedDBで保持する。適用前にパス・document schema・参照素材を既存のStudio処理で検証する。保存済みの作品は同じブラウザの一覧から再開できる。iframeのストレージ可否はhost依存。保存失敗時は成功扱いしない。
- 会話用bundleとMCPリクエストは1 MBまで。最大64操作を順に処理し、途中で失敗した場合は部分結果を適用しない。取り込みは既存ブラウザ版の展開サイズ制限256 MBを使う。大きな作品のAI編集には向かない。
- サーバーでScript・Play・公開・任意のファイルアクセスは実行しない。非同期ジョブもない。ChatGPTがツールを呼ぶ間に制作する方式で、会話を閉じた後に制作を続けるものではない。
- ブラウザ保存はバックアップではない。ブラウザのデータ削除や別端末への移動に備え、作品を書き出す。端末間同期はない。

## 実装

`worker.ts`は`POST /mcp`の初期化、ツール、App resourceを扱う。`ASSETS`だけを使い、DB・オブジェクトストア・認証ヘッダーには依存しない。`document-tools.json`は既存MCPから再利用した91個のdocument toolのschema。`src/chatgpt-editor.tsx`は公式host bridgeとブラウザ保存・取り込み・書き出しを使う。`chatgpt-project.ts`はschema検証と、編集元の比較に使うSHA-256を共用する。ハッシュはユーザー認証やサーバー上のCASではない。

## 配置と個人接続（未実施）

GitHub Pagesでは`POST /mcp`を処理できないため、MCP用のWorkerを別途運用する。Pagesの既存URLは変えない。DBの運用は不要だが、Workerの費用・利用量・エラーの確認は運営者に残る。公開前にリクエスト数・予算の制限をCloudflare側で設定する。ツールが任意のURLを取得したり外部の有料APIを呼んだりする機能はない。

Cloudflareを使う場合の配置手順は以下。まだデプロイしていない。

```sh
# リポジトリ直下で、公開用のアセットを作るときに実行
pnpm build:preview
# Cloudflareアカウントで認証し、MCPとアセットを配置
pnpm dlx wrangler deploy --config packages/xrift-studio-cloud/wrangler.jsonc
# 実際に配置したURLを使う
node scripts/package-cloud-plugin.mjs https://YOUR-DEPLOYED-HOST/mcp /tmp/xrift-plugin
```

`YOUR-DEPLOYED-HOST`は説明用。Wranglerの実デプロイとバンドルは未検証。現在の環境では本番ビルド・公開を実行していない。Workerは独自の`ASSETS`で`chatgpt.html`と既存エディターのJS・CSS・カタログを配信する。`resources/read`がそのHTMLの参照URLを配置先の絶対URLにする。

配置後はChatGPTの開発者モードで実際のHTTPS `/mcp`を認証なしの接続として登録し、tool discovery、新規制作、編集、保存、再開、書き出しを確認する。生成したplugin packageには実URLの`mcp.json`、metadata、制作手順skillが入る。パッケージ配布だけではWorkerは動かない。

## 全員向けの公開

自分用の開発接続と、一般公開の審査は別。一般公開では次を用意してOpenAIのプラグイン公開ポータルへ申請する。

1. 実運用のHTTPSエンドポイントと、検証済みのアプリ表示。
2. 公開する開発者の本人・組織確認とドメイン確認。
3. 実際の機能に合う説明・アイコン・Webサイト・サポート・プライバシーポリシー・利用規約の公開URL。
4. 実録デモ、正常系5件・失敗系3件の審査例、対象地域・リリース情報など。
5. 公開用ZIPをドラフトとしてアップロードし、MCPを接続・検査して審査例を実行する。審査に提出し、承認後に公開する。

現状はソースと接続用パッケージの生成処理まで。実URL、公開用のポリシー、録画デモ、開発者・ドメイン確認、公開申請は未実施。審査済み・申請可能な完成パッケージとは扱わない。公開後もWorkerはこちらで運用する。

公式手順: [公開申請](https://developers.openai.com/plugins/deploy/submission)、[認証](https://developers.openai.com/plugins/build/auth)、[接続と検証](https://developers.openai.com/plugins/deploy/connect-chatgpt)。要件は申請時に再確認する。

## 検証

```sh
pnpm typecheck
pnpm --filter xrift-studio-cloud typecheck
node scripts/generate-cloud-mcp-schemas.mjs --check
node scripts/browser-project-transfer.test.mjs
```

ChatGPT WorkのMCP App / Extensionsに対応するhostが対象。通常のChatGPT画面・iOS / Androidの実機、iframe内のIndexedDB・ダウンロード・WebGL・Playは未確認。スマホで使えることは、対応するhostで制作から書き出しまで確認してから案内する。
