# リリース前 E2E

XRift Studio の主要導線を、XRift への送信を始める直前まで確認するリリース専用テストです。日常の開発、Pull Request、通常の Push では実行しません。手動の Release workflow が開始されたときだけ、OS 別ビルドより前に 1 回実行します。

## 対象

- 初回セットアップからプロジェクト一覧への遷移
- クラシック／ビジュアル、ワールド／アイテムの4通りの作成
- クラシックワールドの公開情報編集、保存、ローカル実行、停止
- クラシックアイテムのセキュリティチェック
- ビジュアルワールドのEntity追加、自動保存、Play、停止
- クラシックとビジュアルの公開前確認

実行時はReactアプリをChromiumで開き、Tauri IPCとXRift CLIの境界だけをメモリ上のテスト実装へ差し替えます。アプリ画面、状態遷移、入力、主要コマンドの組み立ては本番コードを通ります。Rust側のファイル実装、実際のNode.js導入、実CLI、ネットワーク、XRift側APIはこのE2Eの対象外です。

## アップロード禁止境界

テストは次のいずれかを検出すると失敗します。

- シェルコマンドに `upload` が含まれる
- ビジュアル公開処理が `mark_compiler_upload_started` を呼ぶ
- テスト用IPCに未定義のコマンドが追加される

公開画面では要件と最終ボタンの状態を確認し、最終送信ボタンは押しません。実アカウント、実プロジェクト、公開先は変更されません。

## リリース時の実行

`.github/workflows/release.yml` の `Release E2E` job が次の順序で実行します。

1. リリースタグとアプリバージョンの一致を確認する
2. Chromiumと必要なシステム依存を導入する
3. `pnpm e2e:release` を実行する
4. 成功した場合だけWindows、macOS、Linuxのビルドを開始する

失敗時は `playwright-report` と `test-results` を workflow artifact から確認できます。

## 手動調査

リリース前テストの作成・修正時に限り、ローカルで次を実行します。

```bash
pnpm exec playwright install chromium
pnpm e2e:release
```

UIを見ながら調査する場合は次を使います。

```bash
pnpm exec playwright test --config playwright.config.ts --headed
```

日常の変更確認は従来どおり `pnpm typecheck` とプロジェクトの高速フィードバックループを使います。

## 機能追加時

主要導線を追加または変更した場合は、次を確認します。

- 対応する利用者操作を `e2e/release-gate.spec.ts` に追加したか
- 新しいTauri IPCを `src/release-e2e/mock-tauri.ts` に明示したか
- 公開開始より前で停止する境界を維持しているか
- テスト用の成功結果が実機能の成功表示と混同されていないか
