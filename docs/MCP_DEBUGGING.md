# MCPで画面を見ながらデバッグする

XRift Studioのデバッグ版は、標準MCP経由で現在の画面をAI clientへ公開します。Codex、DeepSeekを使うMCP host、Claude、Cursorなど、stdio MCP serverを登録できるclientから同じ操作を利用できます。

## できること

- `webview_screenshot`: 現在表示されているTauri WebViewをPNG画像として取得する
- `webview_dom_snapshot`: DOMまたはアクセシビリティツリーを取得する
- `read_logs`: WebViewのconsole errorやwarningを読む
- `webview_get_styles`: 指定要素のcomputed styleを確認する
- `webview_select_element`: 要素を選択し、注釈付き画像と要素情報を取得する
- `ipc_monitor` / `ipc_get_captured`: Tauri IPCの呼び出しと結果を確認する

画像だけで判断せず、DOM、console、IPCを同じ変更の確認材料として使います。

## 起動

リポジトリのルートでデバッグ版を起動します。

```text
pnpm tauri:dev
```

Tauri MCPはデバッグビルド専用です。アプリのウィンドウが開いた後、MCP client側でserver設定を読み直してください。

## Codex

リポジトリの [`.mcp.json`](../.mcp.json) に設定済みです。Codexでこのリポジトリを開き、`tauri` MCP serverを再読み込みすると利用できます。

## DeepSeekなど、別のMCP host

MCPを登録できるhostでは、次のコマンドでそのhost用の設定を生成できます。

```text
pnpm mcp:debug-config
```

出力された `mcpServers` のJSONをhostのMCP設定へ追加します。出力には現在のNode実行ファイルとリポジトリ内のserverラッパーの絶対パスが入るため、hostの作業ディレクトリに依存しません。

DeepSeekのモデルを使う場合も、DeepSeekを接続できるMCP hostへこの設定を登録します。モデルAPIや単独のチャット画面がstdio MCPに対応していない場合は、MCP hostまたはIDE側が中継します。

## 開発時の確認ループ

画面を変更したら、次の順に確認します。

1. `pnpm typecheck`
2. `webview_screenshot`で操作前の画面を取得
3. 必要な操作を行い、処理中・成功・失敗の画面を取得
4. `webview_dom_snapshot`で主要操作と状態ラベルを確認
5. `read_logs`でconsole errorを確認
6. Tauri commandを変更した場合は`ipc_monitor`と`ipc_get_captured`で通信を確認

スクリーンショットは表示中のWebView領域だけを対象にします。OSのファイル選択ダイアログなどのネイティブUIや、画面の連続動画は対象外です。読み取り確認は安全に行えますが、ログイン、アップロード、削除、リセットなどの書き込み操作は明示的に確認してから実行します。

## 2種類のMCP server

- `tauri` / `xrift-studio-debug`: 開発中の画面、DOM、console、IPCを確認するためのTauri MCP。デバッグビルドだけで利用します。
- `xrift-studio`: Scene、Asset、ComponentなどをAIから編集するためのXRift Studio MCP。通常のUndo、自動保存、revision検査を通ります。

画面を見ながらSceneを編集する場合は、両方のserverを同じMCP hostへ登録します。デバッグ用serverはWebView JavaScriptを扱えるため、Scene編集用serverとは異なる開発者向けの権限境界です。リリース版には追加しません。
