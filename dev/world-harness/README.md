# ワールド制作ハーネスの試作

XRift のワールド制作を進める独自の実行環境。設計図、モデルの判断、MCP の操作結果、画像と判定理由を一つのセッションとして扱う。既存アプリへ組み込む前に、別ブランチで構成を確かめるための CLI 実装である。

[DeepSeek Harness の設計](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)から、モデル接続・ツール接続・実行ループの分離と、追記する履歴からの状態復元を参考にした。DeepSeek のコードやパッケージは取り込んでいない。XRift 固有の完成判定は、この試作で実装する。

## 実装した流れ

1. 設計図と完成条件を履歴へ保存する。
2. 現在の Scene を読み、モデルへ操作履歴と使用可能なツールを渡す。
3. モデルが選んだ操作を、一件ずつ MCP で実行する。実行予定を先に記録し、結果を後から記録する。
4. 指定したスポーン視点と俯瞰へカメラを動かし、撮影する。保存された PNG を読み、モデルへ画像入力として渡す。
5. モデルが画像と完成条件を照合し、条件ごとに合否と理由を記録する。
6. 最新の両画像と全条件の合格がそろった場合に、完了を受け付ける。

編集すると、それ以前の画像と判定は無効になる。モデルへの問い合わせ前後に Scene の revision とモードを読み直すため、手動編集が入った場合も判断をやり直す。これは見た目の良さを機械的に保証するものではない。判定理由が妥当かどうかは、モデルの画像理解と設計図に依存する。

## 起動

追加パッケージは不要。リポジトリのルートで実行する。

```powershell
Copy-Item dev/world-harness/config.example.json dev/world-harness/config.local.json
node dev/world-harness/run.mjs dev/world-harness/config.local.json
```

実行前に `config.local.json` を編集する。

- `goal`: 実際の設計図と完成条件。予算の確認も条件に含める。
- `mcp.command`: XRift Studio の通常の stdio MCP 実行ファイルへの絶対パス。デバッグ用の権限が強いブリッジは使わない。
- `captureDirectory`: Studio の `debug-captures` ディレクトリへの絶対パス。この外の画像は読み込まない。
- `captureArguments` と `cameras`: 制作対象の projectId と sceneId をそろえる。スポーンの座標と視線を実際のワールドに合わせる。例の座標はサンプルであり、自動取得しない。
- `effects`: モデルに使わせるツールと、その作用。`read` は読み取り、`view` は表示操作、`write` は制作内容の変更。制作に必要なツールを明示して追加する。誤った分類は画像の無効化を妨げるため、変更系は必ず `write` にする。

Studio で対象プロジェクトを開いておく。例のツールは最小限なので、Material の作成などが必要なら通常の MCP の一覧を確認して追加する。承認・ログイン・公開を回避するツールは追加しない。

付属のモデル接続例は [Chat Completions 形式](https://developers.openai.com/api/reference/resources/chat)を使う。画像入力と JSON 出力に対応する接続先が必要で、特定の提供元やモデルは固定しない。実行する PowerShell で以下を設定する。キーは設定ファイルや履歴に書かない。

```powershell
$env:XRIFT_MODEL_ENDPOINT = '接続先の chat/completions URL'
$env:XRIFT_MODEL = '使用する画像対応モデルの ID'
$env:XRIFT_MODEL_API_KEY = '接続先の API キー'
```

実行すると、その接続先へ設計図、Scene の操作結果、画像を送る。互換 API の細部には差があるため、別形式なら `model.command` を交換する。コマンドは標準入力から JSON を一件受け取り、標準出力に次の行動を JSON 一件で返す。診断は標準エラーへ出す。契約は `stdio-adapter.mjs` の `ACTION_PROTOCOL` にある。ハーネス全体の接続を交換する場合は `adapter` モジュールの `create()` を差し替える。

## 中断と再開

同じ設定で起動すると、同じ履歴を読んで続ける。`maxSteps` は一回の実行量であり、制作物の品質や物量を制限する値ではない。終了コードは完了が `0`、保留・結果不明が `2`、実行エラーが `1`。

通信が途切れて操作結果を受け取れなかった場合は `uncertain` で止まる。相手側で編集済みの可能性があるため、同じ操作を自動再送しない。この試作には結果不明を解消する操作画面はない。Studio と履歴を照合し、現在の Scene から続ける設計図を別の履歴で開始する。プロセス強制終了後に `.lock` が残った場合も、元のプロセスが終了したことを確認してからそのロックだけを取り除く。履歴の破損は黙って読み飛ばさない。

履歴には画像も含む。`.local/` とローカル設定は Git の対象外。長い制作での履歴圧縮、画像の別ファイル化、設定変更後の再開整合性、クラッシュ時の履歴修復、承認待ちの専用表示は未実装。完了済みの履歴は当時の完了記録として扱い、再実行では再評価しない。別クライアントとの排他編集は提供せず、revision の再確認と既存 MCP の `expectedRevision` 検証を使う。

## 検証

```powershell
node --test dev/world-harness/harness.test.mjs
pnpm typecheck
```

テストでは再開時の二重実行防止、結果不明での停止、古い画像による完了の拒否、手動編集の検知、画像の読み込み範囲、モデル API へ渡す画像形式、別プロセスとの MCP 通信を確認する。外部 API と実際の Studio をつないだ制作は、この自動テストには含まない。アプリ本体や main への採用は、実制作での検証を経て判断する。
