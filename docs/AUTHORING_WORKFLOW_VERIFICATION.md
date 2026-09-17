# 制作導線・再利用の実装と検証

2026-09-16。対象は `xrift-studio-ui-polish.zip` のソース（PR #101相当のUI調整版、0.9.35）。この作業ではGitHubの最新mainを再取得していない。前回のUI調整に、今回の追加変更を統合したソース一式である。バージョン・依存関係・lockfile・既存CI/CDは変更していない。GitHubへのPush・PR作成・mainの変更は行っていない。

## 追加した範囲

- 「素材を追加」の横断検索、分類名、日本語の説明と追加不可の理由。検索とInspectorは同じ文字照合を使う。World / Itemの候補を共通表示し、実行時の種類・依存・重複チェックは残す。
- Inspectorの編集対象表示、Component追加の検索・分類、Scene / Hierarchyの編集メニューと順序の共通化。Assetsの選択を新規配置と混同せず、既存の複数選択とタッチ用メニューを維持する。
- 「選択範囲を書き出す」と「.xriftstudioから追加」。親子・依存素材と付随ファイル、ID再割り当て、配置補正、確認画面、Undo / Redoへ接続する。書き出す種類をアイテムにすると独立したItemプロジェクトになる。既存プロジェクトへ追加する場合は追加先の種類・シーン設定・公開先を維持する。
- 同じウィンドウ・タブ内の別プロジェクトへのコピー。素材の読み出し完了後に切り替える。同じプロジェクト内の通常貼り付け・反転は既存の即時操作を保つ。
- 操作ガイド、UI原則、MCPの操作境界、回帰テストを更新する。テレメトリ、同意画面、KPI収集、検索履歴、利用状況の外部送信は追加しない。

Hierarchy受け渡しの基礎は保存されていた `xrift-studio-hierarchy-transfer.patch`（2026-09-14）から復元し、PR #101相当のSceneメニューとUIへ統合した。その後に報告だけが残っていた変更ファイルが復旧したという意味ではなく、本ZIP向けに編集・統合し直したもの。

## 実行結果

| 検査 | 結果と範囲 |
| --- | --- |
| Hierarchy transfer | 20ケース・290 assertions成功。親子TRS、依存素材、ID衝突、付随ファイル、書込失敗・revision競合、履歴、制約を隔離データで検証 |
| Authoring workflow | 検索、Item変換・追加、入力不変、World / Itemのカタログを検証 |
| 構文変換 | 変更・追加した36個のTS / TSX / JSファイルで構文エラー0件。型チェックではない |
| fixture登録 | 113 suitesの登録整合性成功。全113 suitesを実行したわけではない |
| MCP tool名 | 147 toolsの整合性成功。新しいMCP toolは追加していない |
| スキル同期 | 共通UXスキルとClaude互換コピーの差分0件 |
| ガイド | 10件中9件成功。リンク・見出し・画像参照・検索等は成功。残る1件はReact未導入で失敗 |
| 差分 | `git diff --check`成功。納品時にパッチの適用とZIPのCRCも別途確認する |

ロジックfixtureは実際のTSモジュールをNode 22.16.0と環境内TypeScript 5.8.3で実行している。ファイル書き込み境界のテストでは隔離したメモリ上のバイト列・注入したI/Oを使い、ユーザーの作品や公開先には書き込まない。描画結果、OS保存ダイアログ、本番公開の試験ではない。

ブラウザでのZIP encode / decode結合テストは定義したが未実行。ロジック検査を、全アプリやファイルI/Oの動作保証としない。

## 未確認・失敗した検証

- `tsc --noEmit` は実行したが、React・Three・Tauri等の依存と型定義がなく終了コード2。環境内TypeScriptによる実行で、依存導入後のプロジェクト指定バージョンによる完全な型チェックではない。
- `npm run e2e:test -- e2e/authoring-workflow.spec.ts` は `unknown command 'test'` で停止。プロジェクトのJavaScript版Playwrightと依存がなく、ブラウザ回帰テストは未実行。
- Rust toolchainがなく、追加した保存コマンドの `cargo fmt` / `cargo check` / native testsは未実行。Tauri実機の保存先選択・Windows / macOSの保存も未確認。
- 実画面での密度・重なり・フォーカス、iPadタッチ、glTF描画・アニメーション・ギミックの実行、公開、アプリを再起動した後の保存復元は未確認。
- 本番ビルド・インストーラ生成はしていない。このZIPは実行ファイルではなくソースコード。

## 再確認する手順

通常の開発環境で依存を揃え、次を実行する。新しいCIを追加する必要はない。

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm e2e:typecheck
node scripts/run-authoring-fixtures.cjs
pnpm test:guide
pnpm cli:test
pnpm e2e:test e2e/authoring-workflow.spec.ts e2e/component-menus.spec.ts e2e/scene-context-menu.spec.ts e2e/editor-ui-polish.spec.ts
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml hierarchy_transfer
```

単独runnerはNode 22.15以上・TypeScriptが必要。別バージョンのNodeでは通常の `pnpm cli:test` に登録された同じfixtureを使う。TypeScriptをグローバルに用意した検証環境では `XRIFT_TYPESCRIPT_PATH` を指定できる。依存未導入のまま上記全部が動くという意味ではない。

実画面では、素材検索→Cube配置→Component追加→複数選択→Scene / Hierarchyの反転、選択範囲をItemとして書き出し→別ワールドへ追加→Undo / Redo→保存・再起動を確認する。次に実際のglTF付随ファイル、Script、Prefab、壊れた参照、保存キャンセル、データ更新競合を試す。

## データの扱い

素材ファイルは追加ごとの新しい管理パスへ書き、既存の素材・公開情報を上書きしない。Undo後のRedoや競合時の安全性のため、追加済みの未参照素材ファイルが残る場合がある。Scriptのコード本文は書き換えず、コピー側のEdit実行をPlayのみへ切り替える。受け取ったScriptを安全なsandboxに変換する機能ではない。

全ワールド用ギミックがItemで動くとは保証しない。種類の制約や選択外参照は、確認画面に注意事項を出して無効で保持する。Model内部だけの選択、TRSへ戻せない変形、プロジェクト外パスなどは中止して対処を案内する。詳細は[Hierarchyの受け渡し契約](./HIERARCHY_TRANSFER.md)と[操作ガイド](./guide/hierarchy-transfer.md)を参照。
