# XRift Studio ドキュメント

XRift Studio は、[XRift](https://xrift.net/) のワールドとアイテムを制作する有志製のデスクトップアプリである。React 19 + TypeScript + Vite の UI と、Tauri v2 の Rust バックエンドで動く。

初めて読む場合は、この順で読むと全体像がつかめる。

1. [ビジュアルエディター設計](./VISUAL_EDITOR_ARCHITECTURE.md) — 製品の正本。データモデル、画面、Play、変換、セキュリティ境界。
2. [対応範囲と段階](./VISUAL_EDITOR_ROADMAP.md) — 設計のどこまでが動き、各段階を何で完了とするか。
3. [UX 原則](./UX_PRINCIPLES.md) — 画面文言と状態設計の基準。
4. リポジトリ直下の [DEVELOPMENT.md](../DEVELOPMENT.md) と [AGENT.md](../AGENT.md) — 環境構築と、作業時のルール。

## 設計（正本）

| 文書 | 扱う範囲 |
| --- | --- |
| [ビジュアルエディター設計](./VISUAL_EDITOR_ARCHITECTURE.md) | project type、document model、Registry、Command、Asset lifecycle、変換パイプライン、セキュリティ境界 |
| [対応範囲と段階](./VISUAL_EDITOR_ROADMAP.md) | 制作領域ごとの対応状況、設計上の境界、段階と完了判定 |
| [UX 原則](./UX_PRINCIPLES.md) | 体験の約束、新機能の設計手順、レビュー用チェックリスト |
| [マイクロインタラクション Wiki](./UX_INTERACTIONS.md) | 機能ごとの操作前・処理中・成功時・失敗時・戻り先 |
| [Inspector デザインガイド](./EDITOR_INSPECTOR_DESIGN.md) | 右 Inspector の密度、枠、参照フィールド |

## 機能ごとの仕様

| 文書 | 扱う範囲 |
| --- | --- |
| [Scripting Contract](./SCRIPTING.md) | Script Asset の API、実行境界、承認 gate、対応範囲 |
| [MCP editor tool の全体像](./MCP_EDITOR_TOOLS.md) | AI client へ公開する Editor 操作の一覧、surface ごとの権限、公開しない操作 |
| [KHR_interactivity Editor / MCP design](./KHR_INTERACTIVITY_EDITOR.md) | ノードグラフの canonical 形式、検証、MCP 契約 |
| [Terrain エディター 仕様](./TERRAIN_EDITOR_SPEC.md) | 地形と草のモード、ブラシ、性能、公開への反映 |
| [カメラタイムライン 仕様](./CAMERA_TIMELINE_SPEC.md) | camera Component、時間で進む実行器、カメラ用 op、再生場所（未実装の設計） |
| [マテリアルカタログ 仕様](./MATERIAL_CATALOG_SPEC.md) | 空・水 Shader、草、Wind 契約 |
| [Model Import Contract](./MODEL_IMPORT_CONTRACT.md) | Model の取り込みと再取り込み、永続化する情報 |
| [UnityPackage import](./UNITY_PACKAGE_IMPORT.md) | `.unitypackage` / `.unity` / `.prefab` の変換フロー |
| [Open Brush Material Provider 設計](./OPENBRUSH_MATERIAL_PROVIDER_DESIGN.md) | Open Brush 由来 Material の提供経路 |
| [Visual Project Classic Export CLI](./VISUAL_PROJECT_MIGRATION_CLI.md) | Visual project から Classic project への一方向書き出し |
| [ブラウザからのワールド公開](./WEB_UPLOAD.md) | Web 版からの upload 経路と未解決の制約 |

## 運用と支援

| 文書 | 扱う範囲 |
| --- | --- |
| [MCPで画面を見ながらデバッグする](./MCP_DEBUGGING.md) | デバッグ版を AI client から操作・観察する手順 |
| [リリース前 E2E](./RELEASE_E2E.md) | Release workflow だけで走らせる受け入れテスト |
| [XRift Studio Issue相談GPT](./BUG_REPORT_GPT.md) | 利用者がバグ報告と要望を整理するためのカスタム GPT 設計 |

## これから作るもの

[ワールド部品の追加計画](./WORLD_CONTENT_PLAN.md) は、初めてワールドを作る人が最初の一時間で欲しくなる部品を、カタログ preset・組み込み Prefab・新しい Component の三つに分けて並べた計画である。現在の対応範囲ではなく、これから足すものを扱う。

[カメラタイムライン 仕様](./CAMERA_TIMELINE_SPEC.md) は、決まった経路をカメラで再生してデバッグするための設計である。camera Component、KHR_interactivity の上に載せるカメラ用 operation、そして「時間で進む実行器」を扱う。全体が未実装で、既存の静的な walk との共存が設計の要点になる。

## 利用者向けガイド

[`docs/wiki/`](./wiki/index.md) は、インストールから公開までを利用者向けにまとめた使い方ガイドである。GitHub Pages で Web サイトとしても配布する。掲載順とカテゴリは `src/lib/wiki-config.ts` が持ち、ページを追加・改名する時は両方を同じ変更で揃える。

## 過去の記録

[`docs/history/`](./history/README.md) には、特定の日付時点の監査、調査、実行計画を当時の内容のまま残している。現在の設計や対応状況の正本ではない。仕様を知りたい場合は上の「設計（正本）」を参照する。
