# XRift Studio の文書

使い方は [利用者向けガイド](./wiki/index.md)、開発環境は [DEVELOPMENT.md](../DEVELOPMENT.md) から読む。仕様を調べるときは、変更する分野から選ぶ。

## 全体設計と対応状況

- [ビジュアルエディター設計](./VISUAL_EDITOR_ARCHITECTURE.md): データ形式、保存、変換、実行、権限の基本設計
- [対応範囲と今後の課題](./VISUAL_EDITOR_ROADMAP.md): 利用できる機能、制約、今後検討する項目
- [UX 原則](./UX_PRINCIPLES.md): 操作と結果の表示方針
- [機能別の操作・状態設計](./UX_INTERACTIONS.md): 分野別の F-ID と共通の MI-ID

## 編集画面と素材

| 調べたいこと | 文書 |
| --- | --- |
| Inspector のレイアウト | [Inspector デザイン](./EDITOR_INSPECTOR_DESIGN.md) |
| Model の取り込みと再取り込み | [Model Import](./MODEL_IMPORT_CONTRACT.md) |
| Unity の Scene・Prefab | [UnityPackage Import](./UNITY_PACKAGE_IMPORT.md) |
| Open Brush の描画 | [Open Brush Material](./OPENBRUSH_MATERIAL_PROVIDER_DESIGN.md) |
| 空・水・草・Wind | [マテリアルカタログ](./MATERIAL_CATALOG_SPEC.md) |
| Terrain の編集 | [Terrain](./TERRAIN_EDITOR_SPEC.md) |

## 実行と公開

| 調べたいこと | 文書 |
| --- | --- |
| Script の API と実行権限 | [Scripting](./SCRIPTING.md) |
| ノードグラフと実行エンジン | [KHR_interactivity](./KHR_INTERACTIVITY_EDITOR.md) |
| Classic プロジェクトへの書き出し | [Classic Export](./VISUAL_PROJECT_MIGRATION_CLI.md) |
| ブラウザ公開の試験実装と制約 | [Web Upload](./WEB_UPLOAD.md) |
| 制作過程の録画 | [録画](./RECORDING.md) |

## AI 連携・開発・運用

- [MCP ツール](./MCP_EDITOR_TOOLS.md): Editor 操作、権限、公開しない操作
- [ワールド制作の支援方針](./WORLD_AUTHORING_HARNESS.md): 設計図、制作手順、検証の方針
- [画面デバッグ](./MCP_DEBUGGING.md): MCP から画面とログを確認する手順
- [リリース前 E2E](./RELEASE_E2E.md): 配布前の検証
- [Issue 相談 GPT](./BUG_REPORT_GPT.md): バグ報告の作成支援と設定
- [エージェント向け作業指示](../AGENT.md): 実装・検証の共通ルール

## 文書を更新するとき

仕様は上の該当文書へ統合し、同じ内容の計画書を増やさない。未着手の提案はロードマップに目的と未決事項を残す。完了した調査や古い実装手順は Git の履歴で参照する。

利用者向けページは `docs/wiki/` に置く。追加・改名するときは、掲載順を持つ `src/lib/wiki-config.ts` も更新する。
