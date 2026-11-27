# MCP で画面を見ながらデバッグする

XRift Studio のデバッグ版では、標準の MCP 経由で現在の画面を AI クライアントへ公開しています。Codex、DeepSeek を利用する MCP ホスト、Claude、Cursor などが対象です。stdio MCP サーバーを登録できるクライアントであれば、同じ操作を利用できます。

## できること

- `webview_screenshot`: 現在表示されている Tauri WebView を PNG 画像として取得します
- `webview_dom_snapshot`: DOM またはアクセシビリティツリーを取得します
- `read_logs`: WebView のコンソールエラーや警告を読み取ります
- `webview_get_styles`: 指定要素の算出スタイル（computed style）を確認します
- `webview_select_element`: 要素を選択し、注釈付き画像と要素情報を取得します
- `ipc_monitor` / `ipc_get_captured`: Tauri IPC の呼び出しと結果を確認します
- シーンの「診断」: FPS、フレーム時間、ドローコール数、ポリゴン数（三角形数）、表示中のメッシュ数、カメラの描画距離（Far）を表示します
- シーンの「録画」: 実際の 3D Canvas を最大 15 秒間 WebM 形式で保存し、見た目の問題を再現できるようにします

スクリーンショットだけで判断せず、DOM・コンソールログ・IPC の結果を合わせて確認材料として使います。

## 起動

リポジトリのルートでデバッグ版を起動します。

```text
pnpm tauri:dev
```

Tauri MCP はデバッグビルド専用です。アプリのウィンドウが開いた後、MCP クライアント側でサーバー設定を読み直してください。

Codex ではリポジトリの [`.mcp.json`](../.mcp.json) に設定済みです。このリポジトリを開き、`tauri` MCP サーバーを再読み込みしてください。

DeepSeek などを使う別の MCP ホストでは、次のコマンドで設定を生成できます。

```text
pnpm mcp:debug-config
```

出力された `mcpServers` の JSON をホスト側の MCP 設定へ追加してください。現在の Node 実行ファイルとリポジトリ内のサーバーラッパーの絶対パスが出力されるため、ホスト側の作業ディレクトリには依存しません。

DeepSeek のモデルを使う場合も手順は同じです。DeepSeek を接続できる MCP ホストへこの設定を登録します。モデル API や単独のチャット画面が stdio MCP に対応していない場合は、MCP ホストまたは IDE 側が中継します。

## 開発時の確認ループ

画面を変更したら、次の順に確認します。

1. `pnpm typecheck` を実行します。
2. `webview_screenshot` で操作前の画面を取得します。
3. 必要な操作を行い、処理中・成功・失敗の各画面を取得します。
4. `webview_dom_snapshot` で主要操作と状態ラベルを確認します。
5. `read_logs` でコンソールエラーが出ていないか確認します。
6. Tauri コマンドを変更した場合は、`ipc_monitor` と `ipc_get_captured` で通信内容を確認します。

静止画の取得には `capture_scene_view`、負荷や時間変化の確認には `capture_scene_debug` を使います。グリッドやギズモを除いた静止画が必要な場合は、`capture_scene_view` に `showEditorHelpers: false` を渡してください。録画を行う場合の呼び出し例は次のとおりです。

```json
{"projectId":"…","sceneId":"…","action":"metrics"}
{"projectId":"…","sceneId":"…","action":"start","durationMs":10000}
{"projectId":"…","sceneId":"…","action":"stop"}
```

`capture_scene_debug` の `stop` は保存先ダイアログを開きません。アプリの `debug-captures` フォルダーに WebM ファイルを保存し、そのパスを返します。事前に `get_editor_context` で対象のプロジェクトとシーンを確認してから呼び出してください。

スクリーンショットの対象は表示中の WebView 領域だけです。OS のファイル選択ダイアログなどのネイティブ UI は含まれません。シーンの録画も 3D Canvas だけを最大 15 秒間記録する仕組みであり、アプリ全体やネイティブ UI は記録しません。読み取り確認は安全に行えます。書き込み操作は [共通ガイド](../AGENT.md#作業の進め方と完了条件) に従い、隔離した作業用データで検証してください。すでに依頼済みの操作について、改めて許可を取り直す必要はありません。

## 2 種類の MCP サーバー

- `tauri` / `xrift-studio-debug`: 開発中の画面、DOM、コンソール、IPC を確認するための Tauri MCP です。デバッグビルドでのみ利用します。
- `xrift-studio`: シーン、素材、Component などを AI から編集するための XRift Studio MCP です。通常の元に戻す（Undo）、自動保存、リビジョン検査を通ります。

画面を見ながらシーンを編集する場合は、両方のサーバーを同じ MCP ホストへ登録します。デバッグ用サーバーは WebView 内の JavaScript を扱えるため、シーン編集用サーバーとは異なる開発者向けの権限境界を持ちます。リリース版には含めません。
