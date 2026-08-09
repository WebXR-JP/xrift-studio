# xrift-studio コード品質監査レポート & リファクタリング計画

**日付**: 2026-08-08 ／ **対象**: 1,000行超の巨大ファイル30本（計 ~76,000行 / 全体 ~146,000行の52%）
**手法**: Thermo-Nuclear Code Quality Review（6領域並列監査：エディタシェル / パネル群 / データモデル / MCP・コンパイラ / インポートパイプライン / Rust・ランタイム）

---

## エグゼクティブサマリ

このコードベースの個々のコードは防御的検証・原子的コミット・O_NOFOLLOW等、**局所品質は高い**。問題はほぼすべて「横方向」にある：

> **正しい住処となるモジュール（component-registry / asset-format-registry / scene-document / editor-history / script-emit の overlay パターン…）が既に存在するのに、後から足された機能がそこへ還流されず、巨大ファイル側へ堆積し続けている。**

その結果、同じ知識の**並列手書きコピー**が乖離し、監査中に**実バグ4件**と**到達不能コード約2,000行**が見つかった。リファクタリングの本丸は「コードを動かすこと」ではなく、**知識の置き場を1箇所に定めて、コピーのカテゴリごと消すこと**（code judo）。

### 発見された実バグ（リファクタ以前に修正すべき）

| # | 内容 | 場所 |
|---|---|---|
| B1 | mesh の `sourceNodeName` 検証ブロックが rigid-body validator の for ループ内に誤配置され**一度も実行されない**（本来の mesh 分岐には検証なし） | `serialization.ts` L1857–1873 |
| B2 | glTF インポート時、KHR material 拡張 11種のうち **6種（sheen/specular/volume/iridescence/anisotropy/dispersion）が無警告で脱落**（エディタ側は全対応、インポート側が未追随） | `gltf-derived-assets.ts` L675–747 |
| B3 | ローカルインポート4兄弟のうち **texture だけ TOCTOU 対策（O_NOFOLLOW 相当）なしの通常 open**。audio/model/shader は対策済み — コピペ増殖でセキュリティ姿勢が不揃い | `src-tauri/src/lib.rs` L3843 |
| B4 | `StarterWorldTemplateId` に `"studio-guide"` / `"openbrush"` が居るが registry 未登録のため **約2,000行のテンプレート構築コードが到達不能**（選ぶと throw する経路のみ） | `starter-templates.ts` |

その他の要注意挙動: サムネイル Promise キャッシュ群（3箇所）が**無効化なし・容量無制限**（再生成後も古い画像が残る）、`list_files` が権限エラーを空配列に潰す、MCP ブローカのセッショントークンが OS 乱数失敗時に予測可能な値へフォールバック。

---

## 横断的な構造問題（重要度順）

### T1.【最重要】「単一の真実」の不在 — 同じ知識の並列列挙が5系統

**(a) Core component のスキーマが3重手書き**
collider の `friction≥0`、animation の `speed 0.01–10`、audio の `maxDistance≥refDistance` … 同一制約が
① `scene-document.ts` の update 関数群（L1287–2054, ~770行）
② `serialization.ts` の shape validator 群（L1612–2312, ~700行）
③ 生成関数のデフォルト正規化
に三重実装されている。バグ B1 はこの同期が実際に破綻した現物証拠。皮肉なことに **`component-registry.ts`（XRift拡張component用）は宣言的フィールド定義＋汎用検証130行で同じ問題を解決済み** — 正解パターンは既にリポジトリ内で実証されている。core 9 component にスキーマ表を導入すれば ~1,200–1,500行が消え、同期漏れバグのクラスが消滅する。

さらに component 型の分岐は `compile.ts` L1209–1253 / `InspectorPanel.tsx`（14箇所）/ `mcp-editor-tools.ts` の `updateComponent`（500行の型switch、patch キー配列は型定義の手書きコピー）/ `HierarchyPanel.tsx` のアイコン・ラベル判定にも並列存在する。

**(b) Asset フォーマット知識が8箇所以上にハードコード**
`asset-format-registry.ts` が存在するのに、拡張子/MIME のリストが component-code-import（2箇所）/ classic-project-import（3箇所）/ unity-package-import（2箇所）/ asset-manifest に再掲され、**既に乖離している**（avif/gif/bmp/svg の扱いが importer ごとに違う）。UI 側も asset.kind の icon/label switch が6箇所。

**(c) MCP ツール契約が言語間で三重管理**
80ツールの契約が ① `mcp.rs` の `MCP_TOOL_NAMES`（許可リスト）② `mcp.rs` `tool_definitions()` の**手書き JSON Schema 約1,470行** ③ `mcp-editor-tools.ts` のツール名リスト＋巨大switch＋手動引数検証 — に分散。**Rust 側はスキーマを一切解釈しない**（名前照合と転送のみ）ため、Rust がスキーマを所有する必然性はゼロ。TS 側で zod 等により1回定義し、ビルド時に JSON 生成 → Rust は `include_str!` で配信するだけにすれば、乖離のカテゴリ自体が消える（mcp.rs −1,550行、TS 側の検証コード＋switch も消滅）。

**(d) KHR material 拡張の4重実装**
11拡張 × {Patch型 / パッチ適用 / deep clone / glTF取込} が全部手書き（`asset-manifest.ts` ~900行 + `gltf-derived-assets.ts`）。取込だけ5拡張しか実装されておらず B2 を生んだ。UI 側 `StandardMaterialQuickEditor` の拡張セクション×10（~950行）も同型。**拡張ディスクリプタ表1つ**から適用・clone・取込・UI の4つを駆動すれば ~1,600行 → ~500行。

### T2. VisualEditorPrototype.tsx（8,811行）— god component の解剖

- useState 43 / useRef 51 / useCallback 121。InspectorPanel へ 60+ props、SceneViewport へ 45 props をドリル。
- **二重状態系**: MCP bridge が「レンダー外から最新状態を読む」ために主要状態ほぼ全てに ref ミラーが併走（~15本）。「コミット儀式」（revision++ / bundleRef 同期 / setHistory / setSaveStatus）が **MCP effect 内だけで8回以上コピペ**、ハンドラ側にも散在。1箇所書き漏らすと optimistic concurrency が静かに壊れる。
- **1,900行の MCP bridge useEffect**（L2087–3980, ファイルの22%）: tool 名の if 連鎖で5系統を分岐。React と本質的に無関係（状態アクセスは全て ref 経由）。script template 適用と shader import は UI 側ハンドラと**丸ごと二重実装**。
- **570行の `processImportQueue`**: 3つのインポートパイプラインをインライン展開、同型のキュー更新ボイラープレートが15回。
- **Play ライフサイクル**が7個の状態片に分散した手作りキャンセレーション機構（世代カウンタ＋スコープキー比較を await のたびに手動実行、無効化シーケンスが4箇所に重複）。
- ガード＋コミット＋通知の3点セットを**約60ハンドラが手書き**（推定800行超が定型文）。

**Code judo**: ① editor セッション状態（history+selection+saveStatus+revision）を React 外の単一ストア（`useSyncExternalStore`）へ → **ref ミラーというカテゴリごと消滅**。② 非同期 MCP tool を純粋 tool と同じ registry 形式に揃え、`EditorHost` インタフェースを渡す → コンポーネント側は hook 1行。③ `commitEdit({guard, update})` ヘルパで60ハンドラを3〜8行に。この3手で本体は ~900行まで縮む見込み（−90%）。

### T3. ボイラープレート・フレームワークの欠落（同型コードの大量反復）

| パターン | 反復回数 | あるべき形 |
|---|---|---|
| MCP tool の write 系定型（writability検査→検証→lookup→touchProject→outcome整形） | 62 tool × ~40行 | `defineTool({name, mode, schema, handler})` — **~2,000行削減** |
| DnD マイクロプロトコル手書き（hasEditorDragData→preventDefault→read→clear→guard） | 14箇所（同一の move ドロップが AssetsPanel だけで3実装） | `useEditorDropTarget` hook — ~600–800行削減＋clear忘れバグ根絶 |
| Promise キャッシュ＋active フラグ effect | ~10箇所（すべて無効化なし） | `useCachedAsync(key, loader)` |
| Shift範囲/Ctrl トグル選択 | AssetsPanel / HierarchyPanel で行単位一致 | `useListSelection` |
| Add Component メニュー | 3重実装（Hierarchy 側は entity 有無で丸ごと2回記述） | 共有 `<ComponentCreationMenu>` — ~500行削減 |
| MaterialAsset → three.js props 写像 | 4重実装（normalize 経路も不統一） | `materialAssetToStandardProps()` |
| バッチインポート編成（discovery→plan→重複排除→降格→fold） | classic / unity / component-code で3重実装 | `importAssetBatch()` |
| `isRecord` / `errorMessage` / `leafFileName` / `safeSegment` 等のマイクロヘルパ | 4〜6ファイルに私製コピー（`safeSegment` は挙動非互換の2実装が ID 生成に使用） | `json-guards.ts` / `import-shared.ts` |
| Rust: `read_local_*_import_source` 4兄弟 | ~500行の4連コピペ（B3 の原因） | spec 駆動の共通関数1本 → ~150行 |

### T4. 文字列 codegen とテストの脆さ

`compile.ts` は Projected Skybox の GLSL+TSX ~160行、terrain geometry、texture runtime、model pose 復元などを**文字列リテラルの実行コード**として埋め込む。tsc の検査対象外で、テストは `source.includes("...")` の文字列スニッフ142 assert に退化している。同じコンパイラ内に**正解パターンが既にある**（light/audio/particle は静的 overlay ファイルを import する方式）。skybox/terrain 等も実 `.tsx` ファイル化して props で設定を渡せば、テンプレ文字列が消えテストがコンポーネント単体テストになる。

fixture 側も: mcp fixture は `expectedRevision` リテラルを65箇所手書きで状態を逐次スレッディング — 序盤に1ステップ足すと以降全部手修正。`runTool()` ヘルパ1つで解消。

### T5. 診断・エラー契約の分裂

- インポート診断型が3系統（blocking/warning vs error/warning/info）に分裂し、classic importer は**診断 message 文字列を正規表現でパースして意味を復元**している（文言変更で静かに壊れる）。
- Rust 全域が `Result<_, String>`（日英混在）。MCP 側にはエラーコード化の前例あり。`enum AppError` ＋ code+message serialize へ。

---

## 段階的リファクタリング計画

原則: **「動くものを壊さない順」= バグ修正 → 純関数移動 → registry 化 → フレームワーク導入 → 状態モデル再設計**。各フェーズは独立にマージ可能で、fixture（既存のテスト資産）を回帰網として使う。

### Phase 0 — バグ修正＋ノーリスク削減（数日）

1. **B1**: `sourceNodeName` 検証を mesh 分岐へ移動＋テスト追加（1コミット）。
2. **B3**: texture の open を `open_absolute_file_without_links` に統一（H-3 の統合前でも1行で可能）。
3. **B4**: dead starter template ~2,000行を削除 or registry 登録（意図確認の上）。`starter-templates.ts` 3,681 → ~1,500行。
4. `get_scripting_capabilities` の静的ドキュメント520行を `scripting-capabilities.data.ts` へ分離。
5. `json-guards.ts` / `import/shared.ts` 抽出 — `isRecord`×6 / `errorMessage`×4 / `safeSegment`×3（非互換2実装は fixture で現挙動固定後に명확히〔ミョンファキ＝明確に〕分離）等の統合。
6. AnimationInspector の死んだ props 契約を削除、`list_files` のエラー握り潰し修正、ブローカトークンのフォールバック廃止（乱数失敗時は起動失敗に）。

### Phase 1 — Registry の確立（1〜2週）

7. **asset-format-registry 完全化**: `kindForPath` / `mimeTypeForPath` / icon / label / placeable / openCommand を集約し、8箇所のハードコード正規表現と6箇所の UI switch を置換。`no-restricted-syntax` lint で再発防止（B2 系乖離はここで構造的に閉じる）。
8. **KHR 拡張ディスクリプタ表**（T1-d）: 適用・clone・glTF 取込を1表から駆動。**B2 はここで恒久修正**。既存 fixture で入出力パリティ検証後に旧実装削除。UI 側（StandardMaterialQuickEditor）のテーブル駆動化も同じ表で。
9. **Core component スキーマ表**（T1-a, 本丸）: 最単純の light で schema 表＋汎用 validator / patch-applier を実装 → fixture で等価性確認 → 残り8 component へ展開。`scene-document.ts` / `serialization.ts` 合計 ~1,200–1,500行削減。B1 が構造的に再発不能になる。
10. **MCP ツール契約の単一ソース化**（T1-c）: `defineTool` テーブル＋zod スキーマ → ビルド時 JSON 生成 → `mcp.rs` は `include_str!` 配信のみ。mcp fixture に `runTool()` ヘルパを先に導入して回帰網を整備。

### Phase 2 — 機械的分割（純移動、~2週）

11. `lib.rs`（6,019行）→ `fs_safety.rs` / `media_sniff.rs` / `commands/{runtime_setup, project_library, visual_project, publish_staging, asset_import, project_fs}.rs`。**asset_import 移動時に read_local 4兄弟を spec 駆動1本に統合**。テスト940行は各モジュールへ随伴。lib.rs は ~200行に。
12. `mcp.rs` → `mcp/{broker, stdio, clients, ollama}.rs`（相互依存ほぼ無し）。
13. `serialization.ts` → material 検証 / scene-settings 検証 / component shape 検証 / codec に4分割（re-export で公開面維持）。`asset-manifest.ts` → types / material-properties / manifest-folders に3分割。
14. パネルの純粋抽出: SceneViewport → entity-visuals / runtime-physics / viewport-cameras / scene-skybox / drop-projection。ProjectModelVisual の glTF パーサ＋material 工場を lib へ（`model-preview-loader.ts` / `model-preview-materials.ts`）。AssetQuickEditor → サムネ基盤 / MaterialQuickEditor / TextureQuickEditor / 共有フィールド部品。
15. `mcp-editor-tools.ts` → `mcp/tools/{assets, entities, components, materials, terrain, interactivity, scene-settings}.ts` ＋ `tool-framework.ts`（interactivity から着手 — 最も自己完結）。

### Phase 3 — フレームワーク hook と契約の縮約（~2週）

16. `useEditorDropTarget` / `useCachedAsync` / `useListSelection` を導入しパネルを順次移行（SceneViewport は最後）。
17. `ComponentPatch` discriminated union ＋ inspector registry → InspectorPanel の props 55 → ~20、component 追加が registry 1行に。
18. 共有 `<ComponentCreationMenu>`、`SceneViewportRenderContext`（再帰 props 22 → 4）。
19. `updateComponent` の per-type 知識を component-registry へ移管、interactivity graph の構造手術（delete/connect/disconnect）を `interactivity-graph.ts` へ還流。
20. `importAssetBatch` ＋ 統一 `ImportDiagnostic` ＋ マルチ plan 原子 commit（unity → classic の順）。診断の正規表現照合を code ベースへ。

### Phase 4 — 状態モデルの再設計（最大の judo、~2〜3週）

21. **MCP bridge の抽出**: `EditorHost` インタフェース（`getSnapshot / commitChange / notify`）を定義し、1,900行の effect を `mcp-async-tools/` registry ＋ `useMcpEditorBridge` hook へ。コミット儀式は `commitChange()` 1関数に。script/shader の二重実装を canonical 操作に統合。
22. `commitEdit` ヘルパで ~60 ハンドラを縮約（−800行）。
23. `usePlayLifecycle`: 明示的状態機械（`idle | preparing | playing` ＋ epoch）へ。無効化4重複 → 1実装。
24. **editor-session-store**（`useSyncExternalStore`）: ref ミラー全廃。21–23 で接触面が細くなった後に実施すれば置換点は2箇所のみ。
25. App.tsx → 画面ルータ ~200行 ＋ `VisualEditorScreen` ＋ `useAppUpdater` ＋ `VisualPublishFlow`。
26. `compile.ts`: runtime 文字列テンプレを実 overlay ファイル化 → `ComponentEmitter` registry → outputMode backend の strategy 分離。fixture の文字列スニッフをコンポーネントテストへ移行。
27. `host.tsx`: particle → audio-source → material の順でリソースファクトリを各モジュールへ（light.tsx が縫い目の前例）。汎用 `createOverrideLayerStore` で audio/material の同型2系統を統合。host.tsx 2,817 → ~650行。

### 期待効果（概算）

| 指標 | 現状 | 計画完了後 |
|---|---|---|
| 1,000行超のファイル | 30本 | **0〜2本** |
| 最大ファイル | 8,811行 | ~1,400行（SceneViewport 本体） |
| 総行数（対象30本） | ~76,000行 | 推定 −15,000〜20,000行 |
| 新 component 追加時に触るファイル | 6+ | 1–2（registry 表） |
| 新 asset kind 追加時に触るファイル | 8+ | 1 |
| MCP tool 追加時に触る箇所 | 5+（2言語） | 1（TS テーブル） |
| 消滅するバグクラス | — | スキーマ同期漏れ / ref ミラー同期漏れ / DnD clear 忘れ / TS-Rust スキーマ乖離 / KHR 取込脱落 |

---

## 進め方の推奨

- Phase 0–1 は**今すぐ着手可能**で、投資対効果が最も高い（B1/B2/B3 の修正と registry 化だけで、以後の全フェーズの安全性が上がる）。
- 各ステップの前に該当 fixture を回帰網として整備する（特に `runTool()` ヘルパと classic import のスナップショット fixture）。
- Phase 4 の editor-session-store は**最後**。先に接触面を細らせることで、最大のリスクを最小の置換に変換できる。
- 並行開発がある場合、Phase 2 の機械的分割（純移動＋re-export）はコンフリクトを増やすので、機能開発の切れ目に一括で行うのが望ましい。

## 付録: 領域別詳細

各領域の完全な監査結果（行番号付き指摘・ファイル別分解計画）は6本の個別レポートにあります。必要であれば個別に展開・実装計画化できます:

1. **エディタシェル**（VisualEditorPrototype / App）— ref ミラー全廃と MCP bridge 抽出が核
2. **パネル群**（SceneViewport / Inspector / AssetQuickEditor / Assets / Hierarchy / ProjectModelVisual）— DnD hook と registry 駆動 UI が核
3. **データモデル**（scene-document / serialization / component-registry / interactivity-graph / model-import-contract / starter-templates）— core component スキーマ表が核
4. **MCP ツール & コンパイラ**（mcp-editor-tools / compile）— defineTool と overlay 統一が核
5. **インポートパイプライン**（asset-import / asset-manifest / component-code-import / classic / unity / gltf-derived）— KHR 表とバッチ編成が核
6. **Rust & ランタイム**（lib.rs / mcp.rs / external_store / script_trust / host.tsx / three）— スキーマ単一ソース化とモジュール分割が核
