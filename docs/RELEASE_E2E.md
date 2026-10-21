# リリース前 E2E

リリース前には、XRift Studioの主要導線9件と、Releaseワークフローで指定した回帰テストを確認します。`e2e/release-gate.spec.ts`の`@release-smoke`タグで主要導線を明示します。追加の対象はワークフローで選び、全テストを自動で必須条件にはしません。Pull Requestや通常のPushでは、このリリース用の検査を自動実行しません。

## 対象

- 初回セットアップからプロジェクト一覧への遷移
- コード編集／ビジュアル編集、ワールド／アイテムの4通りの作成
- コード編集ワールドの公開情報編集、保存、ローカル実行、停止
- コード編集アイテムのセキュリティチェック
- ビジュアルワールドのオブジェクト追加、自動保存、動作確認、停止
- コード編集とビジュアルの公開前確認
- ビジュアルエディターの一時保存失敗からの自動復帰

ガイドの画面幅別検査、全プリセットの描画、個別のComponent・地形・Scriptの詳細検査は、該当機能を変更したときや不具合を調べるときに選んで実行します。リリースでは、次の一覧に示した主要導線と回帰テストを実行します。

実行時はReactアプリをChromiumで開きます。Tauri IPCとXRift CLIの境界だけをメモリ上のテスト実装へ差し替えます。アプリ画面、状態遷移、入力、主要コマンドの組み立ては本番コードを通ります。Rust側のファイル実装、実際のNode.js導入、実CLI、ネットワーク、XRift側APIはこのE2Eの対象外です。

## アップロード禁止境界

テストは次のいずれかを検出すると失敗します。

- シェルコマンドに`upload`が含まれる
- ビジュアル公開処理が`mark_compiler_upload_started`を呼ぶ
- テスト用IPCに未定義のコマンドが追加される

公開画面では要件と最終ボタンの状態を確認します。最終送信ボタンは押しません。実アカウント、実プロジェクト、公開先は変更されません。

## リリース時の実行

`.github/workflows/release.yml`の`verify` jobと`Release smoke E2E` jobが同時に走り、両方が成功した場合だけWindows、macOS、Linuxのビルドを開始します。

`verify` jobは次を確認します。

1. リリースタグとアプリバージョンの一致
2. `pnpm typecheck`と`pnpm e2e:typecheck`の型検査
3. `pnpm runtime:shell:check`とVRM同梱コードの検査・テスト
4. `pnpm cli:test`のコンパイラfixtureと公開ステージング検査
5. 録画の撮影間隔・フレーム取得と利用ガイドの回帰テスト

`Release smoke E2E` jobは1台・1 workerで次を実行します。

1. Chromiumと必要なシステム依存の導入
2. `pnpm e2e:smoke`
3. Piによる正式なEditor操作・保存・取り消し・Plan・競合・停止・履歴・権限制御、Itemの保存・削除、接続・思考量、正式なMaterial編集・保存・UndoとSkybox描画・保存の検査
4. ブラウザ公開・認証情報・MToon・Audioの検査
5. ギズモ・Hierarchyのドラッグ・描画品質・共通MToon描画・Open Brushの個別マテリアル割り当てと輪郭の検査

旧チャット専用の結果設定UI・依頼候補のspecはPi移行で削除されたため選択しません。`chatgpt-pi-authoring.spec.ts`と`chatgpt-connection-reasoning.spec.ts`で現行の制作導線を、`mcp-material-batch.spec.ts`と`sky-shaders.spec.ts`で正式な編集・描画経路を確認します。`chatgpt-model-source-integrity.spec.ts`も選択しますが、実Blender出力がない場合はSKIPし、必須の制作検査の代わりにはしません。

`verify`のリリース回帰テストは、workflowが選ぶ個々のspecの存在も確認します。Playwrightは複数指定の一部が存在すれば成功し得るため、選択グループ全体の検出件数だけでは判定しません。

型検査は`verify` jobで1回だけ行います。コンパイラfixtureと公開ステージング検査、E2Eのアップロード禁止境界は維持します。

失敗時は`release-e2e-report`という名前のworkflow artifactに、`playwright-report`と`test-results`が入ります。

## 手動調査

リリース前と同じ範囲をローカルで確認するときは、次を実行します。

```bash
pnpm exec playwright install chromium
pnpm e2e:release
```

主要導線だけをUI付きで調査する場合は次を使います。

```bash
pnpm e2e:smoke --headed
```

個別機能の変更では、関連するファイルを選んで実行します。全件確認も手動で実行できます。

```bash
pnpm e2e:test e2e/material-save.spec.ts
pnpm e2e:test
```

日常の変更では`pnpm typecheck`とプロジェクトの通常の検証手順を実行し、変更した範囲のE2Eを組み合わせます。

## 機能追加時

主要導線を追加または変更した場合は、次を確認します。

- 個別機能の回帰テストは対応するspecへ追加したか
- `@release-smoke`を追加する場合、起動・作成・保存・Play・公開前確認を妨げる不具合を検出するために必要か。既存の主要導線と重複していないか
- 新しいTauri IPCを`src/release-e2e/mock-tauri.ts`に明示したか
- 公開開始より前で停止する境界を維持しているか
- テスト用の成功結果が実機能の成功表示と混同されていないか

制限のある検証環境では、公式のMSDFフォントmetadataを変更せず取得したキャッシュのパスを `XRIFT_E2E_FONT_METRICS_PATH` に指定できます。Material・Skybox試験はその一つのURLだけをキャッシュから返し、その他の通信・描画・エラー検査は変更しません。TLS検査は無効にしません。
