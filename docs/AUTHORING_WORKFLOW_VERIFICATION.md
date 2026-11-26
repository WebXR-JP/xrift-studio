# 制作導線・再利用の実装と検証

2026-09-16 に、`xrift-studio-ui-polish.zip` のソースを検証した。対象は PR #101 相当の UI 調整版（0.9.35）に今回の追加変更を統合したものである。GitHub の最新 `main` は再取得していない。バージョン、依存関係、ロックファイル、既存の CI/CD も変更しておらず、GitHub への Push・PR 作成・`main` の変更は行っていない。

## 追加した範囲

- 「素材を追加」の横断検索、分類名、日本語の説明、および追加できない場合の理由表示。検索と Inspector で同じ文字照合を使う。World / Item の候補を共通表示しつつ、実行時の種類・依存・重複チェックはそのまま残した。
- Inspector の編集対象表示、Component 追加の検索・分類、Scene と Hierarchy の編集メニューおよび項目順の共通化。Assets の選択を新規配置と混同せず、既存の複数選択とタッチ用メニューを維持した。
- 「選択範囲を書き出す」と「.xriftstudioから追加」。親子関係、依存素材と付随ファイル、ID 再割り当て、配置補正、確認画面、Undo / Redo に接続した。書き出す種類でアイテムを選ぶと独立した Item プロジェクトになる。既存プロジェクトに追加する場合は、追加先の種類・シーン設定・公開先をそのまま維持する。
- 同じウィンドウ・タブ内の別プロジェクトへのコピー。素材の読み出し完了後に切り替える。同じプロジェクト内の通常貼り付けと反転は、既存の即時操作を維持している。
- 操作ガイド、UI 原則、MCP の操作境界、回帰テストを更新した。テレメトリ、同意画面、KPI 収集、検索履歴、利用状況の外部送信は追加していない。

Hierarchy 受け渡しの基礎部分は、保存されていた `xrift-studio-hierarchy-transfer.patch`（2026-09-14）から復元し、PR #101 相当の Scene メニューと UI に統合した。報告だけが残っていた変更ファイルをそのまま復旧したものではなく、この ZIP 向けに編集・統合し直した。

## 実行結果

| 検査 | 結果と範囲 |
| --- | --- |
| Hierarchy transfer | 20 ケース・290 件のアサーション成功。親子 TRS、依存素材、ID 衝突、付随ファイル、書き込み失敗・リビジョン競合、履歴、制約を隔離データで検証 |
| Authoring workflow | 検索、Item 変換・追加、入力不変、World / Item のカタログを検証 |
| 構文変換 | 変更・追加した 36 個の TS / TSX / JS ファイルで構文エラー 0 件（型チェックではない） |
| フィクスチャ登録 | 113 スイートの登録整合性成功（全 113 スイートの実行ではない） |
| MCP ツール名 | 147 件のツールの整合性成功。新しい MCP ツールは追加していない |
| スキル同期 | 共通 UX スキルと Claude 互換コピーの差分 0 件 |
| ガイド | 10 件中 9 件成功。リンク・見出し・画像参照・検索などは成功。残る 1 件は React 未導入で失敗 |
| 差分 | `git diff --check` 成功。納品時にパッチの適用と ZIP の CRC も別途確認する |

ロジックのフィクスチャは、実際の TS モジュールを Node 22.16.0 と環境内の TypeScript 5.8.3 で実行した。ファイル書き込み境界のテストには隔離したメモリ上のバイト列と注入した I/O を使っており、利用者の作品や公開先には書き込まない。描画結果、OS の保存ダイアログ、本番公開の試験ではない。

ブラウザでの ZIP エンコード / デコード結合テストは定義したが未実行である。ロジック検査の結果をもってアプリ全体やファイル I/O の動作保証とは見なしていない。

## 未確認・失敗した検証

- `tsc --noEmit` は実行したが、React・Three・Tauri などの依存パッケージと型定義がなく終了コード 2 で失敗した。環境内の TypeScript による実行であり、依存導入後にプロジェクト指定バージョンで行う完全な型チェックではない。
- `npm run e2e:test -- e2e/authoring-workflow.spec.ts` は `unknown command 'test'` で停止した。プロジェクトの JavaScript 版 Playwright と依存パッケージがなく、ブラウザ回帰テストは未実行である。
- Rust ツールチェーンがなく、追加した保存コマンドの `cargo fmt` / `cargo check` / ネイティブテストは未実行である。Tauri 実機の保存先選択や Windows / macOS での保存も未確認。
- 実際の画面での表示密度・重なり・フォーカス、iPad タッチ操作、glTF 描画・アニメーション・ギミック実行、公開、アプリ再起動後の保存復元は未確認。
- 本番ビルドとインストーラー生成は行っていない。この ZIP は実行ファイルではなくソースコードである。

## 再確認する手順

通常の開発環境で依存パッケージをそろえ、以下を実行する。新しい CI を追加する必要はない。

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

単独ランナーの実行には Node 22.15 以上と TypeScript が必要である。別バージョンの Node では、同じフィクスチャを通常の `pnpm cli:test` から実行する。TypeScript をグローバルに導入した検証環境では `XRIFT_TYPESCRIPT_PATH` を指定できる。上記のコマンドを実行する前に、必要な依存パッケージを導入しておくこと。

実際の画面では、素材検索 → Cube 配置 → Component 追加 → 複数選択 → Scene / Hierarchy の反転、選択範囲を Item として書き出し → 別ワールドに追加 → Undo / Redo → 保存・再起動の流れを確認する。続けて、実際の glTF 付随ファイル、Script、Prefab、壊れた参照、保存キャンセル、データ更新競合も試す。

## データの扱い

素材ファイルは追加ごとに新しい管理パスに書き込み、既存の素材や公開情報を上書きしない。Undo 後の Redo や競合時の安全性を保つため、追加済みの未参照素材ファイルが残る場合がある。Script のコード本文は書き換えず、コピー側の実行タイミングを Play のみに切り替える。受け取った Script を安全なサンドボックスに変換する機能ではない。

すべてのワールド用ギミックが Item で動作することは保証しない。種類の制約や選択外への参照がある場合は、確認画面に注意事項を表示し、無効にした状態で残す。Model 内部だけの選択、TRS に戻せない変形、プロジェクト外パスなどは処理を中止して対処法を案内する。詳細は[Hierarchyの受け渡し契約](./HIERARCHY_TRANSFER.md)と[操作ガイド](./guide/hierarchy-transfer.md)を参照。
