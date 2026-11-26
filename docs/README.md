# 開発ドキュメント一覧

アプリの使い方は [ユーザーガイド](./guide/index.md)、開発環境の構築手順は [開発ガイド](../DEVELOPMENT.md) をご覧ください。ここでは、実装や仕様を調べるための開発者向けドキュメントをまとめています。

## 設計・方針・対応状況

| 調べたいこと | ドキュメント |
| --- | --- |
| データ形式・保存・実行・公開の全体構造 | [全体設計](./VISUAL_EDITOR_ARCHITECTURE.md) |
| 現在の対応範囲と今後の課題 | [対応状況](./VISUAL_EDITOR_ROADMAP.md) |
| 画面操作と状態表示の設計方針 | [UX 原則](./UX_PRINCIPLES.md) · [機能別の操作・状態設計](./UX_INTERACTIONS.md) |
| 画面名・専門用語・文章ルール | [日本語表記と用語ガイド](./JAPANESE_WRITING.md) |

## 機能別の仕様

| 分野 | ドキュメント |
| --- | --- |
| Inspector・設定パネル | [レイアウト設計](./EDITOR_INSPECTOR_DESIGN.md) |
| 3D モデル | [読み込み・再読み込み仕様](./MODEL_IMPORT_CONTRACT.md) · [UnityPackage 取り込み](./UNITY_PACKAGE_IMPORT.md) |
| マテリアル・地形 | [素材カタログ仕様](./MATERIAL_CATALOG_SPEC.md) · [地形エディター仕様](./TERRAIN_EDITOR_SPEC.md) · [Open Brush 対応](./OPENBRUSH_MATERIAL_PROVIDER_DESIGN.md) |
| ライト | [ライトベイク仕様](./LIGHT_BAKE.md) |
| 空・水面 | [空のシェーダー](./SKY_SHADERS.md) · [水面シェーダー v2](./WATER_SHADER_V2.md) |
| インタラクション・スクリプト | [Node Graph 仕様](./KHR_INTERACTIVITY_EDITOR.md) · [スクリプト API](./SCRIPTING.md) |
| Hierarchy の受け渡し | [選択範囲の書き出し・追加](./HIERARCHY_TRANSFER.md) · [実装・検証記録](./AUTHORING_WORKFLOW_VERIFICATION.md) |
| 書き出し・公開 | [コード編集への書き出し](./VISUAL_PROJECT_MIGRATION_CLI.md) · [ブラウザ公開](./WEB_UPLOAD.md) · [公開データ容量の最適化](./PUBLISH_DOWNLOAD_OPTIMIZATION.md) |
| 録画 | [録画機能](./RECORDING.md) |

## 開発・検証・運用

| 分野 | ドキュメント |
| --- | --- |
| AI・MCP 連携 | [MCP ツール仕様](./MCP_EDITOR_TOOLS.md) · [制作状態と実行制御](./WORLD_AUTHORING_HARNESS.md) |
| デバッグ・テスト | [画面デバッグ](./MCP_DEBUGGING.md) · [リリース前 E2E](./RELEASE_E2E.md) |
| Homebrew 配布 | [導入・定義の更新](./PACKAGE_MANAGERS.md) |
| 内蔵モデルの更新記録 | [モデル作成・再生成](./asset-refresh/README.md) · [検証レポート](./asset-refresh/REPORT.ja.md) · [差し替え版の説明](./asset-refresh/MODEL_REFRESH_README.ja.md) |
| 当たり判定の修正記録 | [Play を含む最終版](./collider-fix/PLAY_COLLIDER_FIX_NOTES.md) · [前回段階](./collider-fix/COLLIDER_FIX_NOTES.md) |
| 不具合報告 | [報告支援の設定](./BUG_REPORT_GPT.md) |
| AI 向けの作業ルール | [AGENT.md](../AGENT.md) |

## ドキュメントを読むときの注意点

- 作業の進め方や完了条件は [AGENT.md](../AGENT.md)、実装手順は該当機能のドキュメント、API の仕様は最新のソースコードとツールスキーマを確認してください。
- 設計ドキュメントに書かれた「実装順」や「受け入れ条件」を、そのまま実装済みの根拠にしないでください。ドキュメントと実装に差がある場合は、ソースコード・テスト・実際の画面で事実を確認します。
- `releases/`、`asset-refresh/`、`catalog-expansion/`、`collider-fix/`、`guide-review/`、`sky-shader-verification/` は当時の作業・検証記録であり、現在の動作を保証するものではありません。
- 長い設計書はすべて通読せず、変更に関係するセクションだけを参照してください。ユーザー向けの操作手順は `docs/guide/`、機能ごとの仕様 ID は `docs/UX_INTERACTIONS.md` から辿れます。

## ドキュメントの管理ルール

- ユーザー向けの操作手順は `docs/guide/`、実装上の仕様や制約は分野別の開発ドキュメントに分けます。`README.md` には導入と案内だけを置き、詳しい手順は重複させません。
- 過去の検証記録は、実施日と未検証の範囲を残しておきます。第三者のライセンス表記や素材のクレジットは削除しないでください。
- ユーザーガイドのページ名や見出しを変更した場合は、`docs/guide/manifest.json` と関連リンクも忘れずに更新してください。画面文言に合わせてコードやコマンド、保存形式の識別子まで変えないよう注意してください。
- ユーザーガイドのビルド・公開・画像撮影の手順は [ガイドの管理](./GUIDE_MAINTENANCE.md) にまとめています。
- 通常のユーザーから復旧方法について問い合わせがあった場合は、まず [データの保存とリセット](./guide/recovery.md) を案内してください。
