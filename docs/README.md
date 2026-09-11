# 開発文書

アプリの使い方は[利用者向けガイド](./guide/index.md)、開発環境の準備は[開発ガイド](../DEVELOPMENT.md)を参照してください。このページでは、実装を調べるための文書を案内します。

## 設計と対応状況

| 調べたいこと | 文書 |
| --- | --- |
| データ形式・保存・実行・公開の仕組み | [全体設計](./VISUAL_EDITOR_ARCHITECTURE.md) |
| 現在の対応範囲と今後の課題 | [対応状況](./VISUAL_EDITOR_ROADMAP.md) |
| 操作と状態の表示方針 | [操作設計の原則](./UX_PRINCIPLES.md) · [機能別の設計](./UX_INTERACTIONS.md) |
| 日本語の用語と説明の書き方 | [文章と用語のルール](./JAPANESE_WRITING.md) |

## 機能別の仕様

| 分野 | 文書 |
| --- | --- |
| 設定パネル | [レイアウト](./EDITOR_INSPECTOR_DESIGN.md) |
| 3Dモデル | [読み込み・再読み込み](./MODEL_IMPORT_CONTRACT.md) · [UnityPackage](./UNITY_PACKAGE_IMPORT.md) |
| マテリアル・地形 | [素材カタログ](./MATERIAL_CATALOG_SPEC.md) · [地形編集](./TERRAIN_EDITOR_SPEC.md) · [Open Brush](./OPENBRUSH_MATERIAL_PROVIDER_DESIGN.md) |
| 空・水面 | [空のシェーダー](./SKY_SHADERS.md) · [水面のシェーダー](./WATER_SHADER_V2.md) |
| 動き | [ノードグラフ](./KHR_INTERACTIVITY_EDITOR.md) · [スクリプトAPI](./SCRIPTING.md) |
| 書き出し・公開 | [コード編集への書き出し](./VISUAL_PROJECT_MIGRATION_CLI.md) · [ブラウザ公開の試験実装](./WEB_UPLOAD.md) · [容量の最適化](./PUBLISH_DOWNLOAD_OPTIMIZATION.md) |
| 録画 | [録画機能](./RECORDING.md) |

## 開発・検証

| 分野 | 文書 |
| --- | --- |
| AIからの操作 | [MCPツール](./MCP_EDITOR_TOOLS.md) · [制作状態と実行制御](./WORLD_AUTHORING_HARNESS.md) |
| 動作の検証 | [画面デバッグ](./MCP_DEBUGGING.md) · [リリース前の検証](./RELEASE_E2E.md) |
| 内蔵モデルの更新記録 | [モデルの作成・再生成](./asset-refresh/README.md) · [提供元の検証記録](./asset-refresh/REPORT.ja.md) |
| 不具合の報告 | [報告支援の設定](./BUG_REPORT_GPT.md) |
| AI向けの作業ルール | [AGENT.md](../AGENT.md) |

## 参照時の判断

- 作業の許可と完了条件は [AGENT.md](../AGENT.md)、手順は該当スキル、APIの実行条件は現行ソースとtoolのschemaを確認します。
- 設計案の「実装順」「受け入れ条件」を実装済みの証拠にしません。対応状況の記述とコードが違う場合は、コード・fixture・実画面で確認し、未確認の対応を断定しません。
- `releases/`、`asset-refresh/`、`catalog-expansion/`、`guide-review/`、`sky-shader-verification/` は実施時点の記録です。現在の成功を保証しません。
- 大きな設計文書は変更対象の節だけを読みます。利用者向けの操作は `guide/`、機能IDは `UX_INTERACTIONS.md` から辿ります。

## 文書の管理

利用者向けの手順は`docs/guide/`、実装上の条件は分野別の仕様書に置きます。READMEには最初の操作と案内だけを残し、機能ごとの説明を重複させません。過去の検証記録は、実施時点と未検証の範囲を残します。ライセンスや素材の権利表記は削除しません。

利用者向けページの名前を変えたときは、`docs/guide/manifest.json`と関連リンクを更新してください。コード・コマンド・保存形式の識別子は、画面の日本語に合わせて変更しません。

## コード制作・詳しい制作資料

専門的な実装や制作の説明は、[Scripting](./SCRIPTING.md)など既存の分野別資料を参照してください。

通常の利用者には、まず[データを守って復旧する](./guide/recovery.md)を案内してください。

使い方ガイドの更新・公開・検証は[ガイドの管理](./GUIDE_MAINTENANCE.md)を参照してください。
