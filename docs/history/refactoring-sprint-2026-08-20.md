# リファクタリング4日スプリント計画 (2026-08-20)

前提: `docs/history/refactoring-audit-2026-08.md` (2026-08-09 の Thermo-Nuclear 監査) の続き。
監査から11日、**75コミット**が入ったが、そのほぼ全てが機能開発 (Terrain / Water / Sky / リリース動画) だった。
本書は「4日で何を取るか」を決めるための、**実測に基づく現況確認**と**絞り込んだ実行計画**である。

---

## 1. 監査項目の現況 (2026-08-20 実測)

### 完了しているもの

| 項目 | 状態 | 根拠 |
|---|---|---|
| B1 mesh の `sourceNodeName` 検証が到達不能 | **修正済** | `serialization.ts:1821` は `validatePrefabComponentShape` の mesh 分岐内 (collider 分岐は1837) |
| B2 glTF 取込で KHR 拡張6種が無警告脱落 | **構造的に解決** | `material-extension-registry.ts` (222行) の descriptor 表を `asset-manifest.ts` と `gltf-derived-assets.ts` が共有 |
| B3 texture だけ TOCTOU 対策なし | **修正済** | `lib.rs:4023` が `open_absolute_file_without_links` を使用 |
| Phase 0-4 scripting capabilities の分離 | **完了** | `scripting-capabilities.data.ts` (534行) |
| Phase 1-7 asset-format-registry の単一真実化 | **完了** | commit `bd8c2a4` |
| Phase 1-8 KHR 拡張ディスクリプタ表 | **完了** | 同上 `material-extension-registry.ts` |

監査が指摘した「正解パターンは既にリポジトリ内にある」という主張は、この2件で実証された。
**descriptor 表を1つ置いて4経路を駆動する形は、この codebase で既に機能している。** 残りは同じ型の適用。

### 未着手のもの

| 項目 | 規模 | 備考 |
|---|---|---|
| B4 到達不能な starter template | −2,870行 | `docs/history/b4-dead-template-removal-plan.md` に手順まで書かれている。実行されていない |
| json-guards / import-shared の抽出 | `isRecord` **13箇所**、`errorMessage` 5箇所、`safeSegment` 3箇所 (うち2つは挙動非互換) | |
| Phase 1-9 core component スキーマ表 | −1,200〜1,500行 | 監査の「本丸」 |
| Phase 1-10 MCP ツール契約の単一ソース化 | −1,550行 (Rust) + −2,000行 (TS) | |
| Phase 2 機械的分割 (lib.rs / mcp.rs / serialization) | | |
| Phase 3 hook フレームワーク | | |
| Phase 4 状態モデル再設計 | | |

### 悪化したもの

| ファイル | 監査時 | 現在 | 差 |
|---|---|---|---|
| `VisualEditorPrototype.tsx` | 8,811 | **9,075** | +264 |
| `src-tauri/src/lib.rs` | 6,019 | **6,313** | +294 |
| 1,000行超のファイル | 30本 | **28本** | −2 |

`VisualEditorPrototype.tsx` の MCP bridge useEffect は **L1960-3927 = 1,968行** (ファイルの22%) のまま。

---

## 2. 今日発生した公開エラー — 計画の裏付け

`[XRift Studio] OpenBrush Test` の公開が失敗し、UI にはこう出た:

```
Worldの検査に失敗しました: "allowedCodeRules": [ "no-obfuscation" ] } } }
```

ステージングで `xrift check` を再実行して得た**実際の**エラー:

```
━━━ __federation_expose_World-BxGL9Aml.js ━━━
  Score: 100  Verdict: REJECT
  x [no-obfuscation] 疑わしい変数名が検出されました:
    $a0PbU$FileLoader, $a0PbU$TextureLoader, $cf098bb13503440d$var$tiltBrushMaterialParams...
Results: 28 files  APPROVE: 27  REJECT: 1
```

### 原因は2つある

**(a) 機能の欠落 — OpenBrush を使った World は公開できない**

`three-icosa` は Parcel でバンドルされた `$hash$var$` 形式の識別子を含み、XRift の `no-obfuscation` ルールに必ず引っかかる。
CLI は `world.permissions.allowedCodeRules` で許可できると案内するが、
`compile.ts:4708 generateXriftJson()` は `permissions` を**一切出力しない** (`allowedCodeRules` は visual-editor 配下に1箇所も存在しない)。
`XriftJsonEditor.tsx` には入力欄があるが、これは Classic プロジェクト専用で Visual Editor の生成物には効かない。

→ 直前のコミット `b76c416 fix: OpenBrushのブラシが動かないのを直す` で描画は直ったが、**公開経路は塞がったまま**。

**(b) 診断バグ — 真因が UI に届かない**

`publish.ts:107 formatPublishCommandFailure()`:

```ts
const detail = [result.stderr, result.stdout].map(trim).filter(Boolean).join("\n");
const visibleDetail = safeDetail?.split(/\r?\n/).slice(-6).join("\n");
```

- `stderr` を先に連結してから末尾6行を取るので、**stderr は構造的に必ず捨てられる**
- 末尾6行は今回、CLI が親切に出した「設定例の JSON」の閉じ括弧だった
- `VisualUploadDialog.tsx` には `onLog` の受け口が無く、ストリームされている CLI ログは**どこにも表示されていない**

監査 T5「診断・エラー契約の分裂」の現物。ユーザーは 28ファイル中どれが何で落ちたのかを知る手段が UI 上に無い。

---

## 3. 4日で何を取るか

監査の全計画は8〜10週。4日で入るのは**1本の筋**だけなので、次の基準で選ぶ。

- 各日の終わりが独立してマージ可能であること
- 既存 fixture (58 suite) を回帰網として使えること
- 「複雑さを移す」のではなく「カテゴリごと消す」ものであること
- 保存フォーマットに触れないこと (直近に `fix: 前のバージョンで保存したSceneが開けなくなるのを直す` が出ている領域なので、4日では触らない)

### 採用: 「MCP ツール契約に住所を1つ与える」

現在、80ツールの契約は**4箇所**に手書きで分散している。

| 場所 | 内容 | 行数 |
|---|---|---|
| `mcp.rs:31` | `MCP_TOOL_NAMES: [&str; 83]` 許可リスト | 85 |
| `mcp.rs:2328` | `tool_definitions()` の手書き JSON Schema | ~1,570 |
| `mcp-editor-tools.ts:163` | ツール名配列 (79 + local/debug/script) | ~100 |
| `mcp-editor-tools.ts:315` | 135行の dispatcher switch + 62ツール分の手書き引数検証 | ~5,900 |

**Rust はスキーマを一切解釈していない** (名前照合と転送のみ)。所有する必然性がゼロ。
ここを1本化すると、TS と Rust の乖離という**バグのクラス自体が消える**。

そして最終日に、同じ registry へ `VisualEditorPrototype.tsx` の 1,968行 useEffect を合流させる。
同期ツールと非同期ツールが1つの住所に揃い、god component の最大ブロックが剥がれる。

---

## 4. 日次計画

### Day 1 — 削除と土台 (低リスク・即効)

1. **B4 到達不能テンプレート削除** — `docs/history/b4-dead-template-removal-plan.md` の手順どおり。`starter-templates.ts` 3,681 → 約1,180、fixture 727 → 約345。**−2,870行**
2. **`json-guards.ts` / `import-shared.ts` 抽出** — `isRecord` 13箇所を統合。`safeSegment` の非互換2実装は fixture で現挙動を固定してから分離 (ID 生成に使われているため挙動を変えない)
3. **公開診断の修正** — `formatPublishCommandFailure` を「stderr 優先 + 失敗行の抽出」に変更し、`VisualUploadDialog` に CLI ログ表示を追加。今日のエラーが**そのまま読める**状態にする
4. **OpenBrush 公開の解除** — `generateXriftJson` に `permissions` を通す (方式は要決定、5節)

到達点: **−3,000行前後、挙動変更なし + 公開経路の回復**

### Day 2 — defineTool フレームワーク

5. 先に `mcp-editor-tools.fixture.ts` へ `runTool()` ヘルパを入れる (現在 `expectedRevision` リテラルを65箇所手書きしており、1ステップ足すと全部手直しになる)。回帰網を先に整える
6. `defineTool({name, mode, schema, handler})` テーブルを導入。62ツール分の定型 (writability検査 → 検証 → lookup → touchProject → outcome整形) を吸収
7. ツール名配列と 135行の dispatcher switch を**テーブルの key から導出**。3重管理 → 1
8. `mcp-editor-tools.ts` を `mcp/tools/{assets, entities, components, materials, terrain, interactivity, scene-settings}.ts` へ分割。最も自己完結している interactivity から着手
9. `updateComponent` の500行 switch を per-type テーブル化 (patch キー配列は型定義の手書きコピーなので、ここで表に寄せる)

到達点: **6,113 → 約2,500行 (分割後の最大ファイル 800行以下)**

### Day 3 — TS から Rust へスキーマを生成

10. Day 2 のテーブルから JSON Schema をビルド時生成 (`scripts/generate-mcp-schema.mjs` → `src-tauri/src/mcp-tools.json`)
11. `mcp.rs` の `tool_definitions()` と `MCP_TOOL_NAMES` を `include_str!` 配信へ置換。**−1,550行**
12. 生成物のコミット差分チェックを CI に入れ、TS を変えて生成し忘れたら落ちるようにする

到達点: **`mcp.rs` 4,490 → 約2,900行、TS-Rust 乖離が構造的に不可能**

### Day 4 — god component から MCP bridge を剥がす

13. `EditorHost` インタフェース (`getSnapshot / commitChange / notify`) を定義
14. L1960-3927 の 1,968行 useEffect を、Day 2 の registry の**非同期側**として `mcp-async-tools/` へ移す。状態アクセスは全て ref 経由なので React 依存が無く、切り離しの縫い目が既に存在する
15. 「コミット儀式」(revision++ / bundleRef 同期 / setHistory / setSaveStatus) が effect 内だけで8回コピペされているものを `commitChange()` 1関数へ
16. script template 適用と shader import の UI 側との**二重実装**を canonical 操作へ統合

到達点: **`VisualEditorPrototype.tsx` 9,075 → 約7,100行**

---

## 5. 決めてほしいこと

**OpenBrush の公開許可をどう出すか** (セキュリティルールを緩める判断なので独断で決めない)

| 案 | 内容 | 評価 |
|---|---|---|
| A | OpenBrush (three-icosa) を使う Scene のときだけ `allowedCodeRules: ["no-obfuscation"]` を出力 | コンパイラは three-icosa 拡張を登録したか既に知っているので**導出可能**。新しい UI を増やさない。推奨 |
| B | 常に出力 | 全 World のセキュリティ姿勢を下げる。非推奨 |
| C | Scene Settings に手動トグルを追加 | 明示的だが、ユーザーは「なぜ必要か」を知らないまま失敗して初めて気付く |

A を推す。ただし A でも「このワールドは難読化チェックを免除して公開される」ことは公開前確認に表示すべき。

---

## 6. 検証手順

各日の終わりに:

```
pnpm typecheck
pnpm cli:test          # fixture 58 suite (= 回帰網)
cargo check --manifest-path src-tauri/Cargo.toml   # Day 3 のみ
```

Day 4 のみ `pnpm tauri:dev` を起動し、Tauri MCP でツール往復とコミット反映を実機確認する。
本番ビルドは行わない (AGENT.md の方針に従う)。

## 実施結果 (2026-08-20)

### 完了

| 項目 | 結果 |
|---|---|
| Day 1-1 B4 到達不能テンプレート削除 | `starter-templates.ts` 3,681 → 1,147行、fixture 727 → 317行、公開アセット −18MB |
| Day 1-2 json-guards 抽出 | `isRecord` 13箇所 → 1 (別パッケージの2件は据え置き)、`errorMessage` 5 → 1。意図的に違う2件は理由を明記して残置 |
| Day 1-3 公開診断の修正 | 二重の切り詰めを撤廃、CLI出力を画面とヘルプ報告の両方へ |
| Day 1-4 OpenBrush 公開の解除 | `publish-permissions.ts` として仕組み化。実CLIで `APPROVE: 28` を確認 |
| Day 2-7 ツール契約の単一ソース化 | `mcp-tool-registry.ts` に集約。6箇所の手書きが1つに |
| Day 2-9 patch キーの乖離検出 | `patchKeysOf<Patch>()` でビルド時に検出 |
| Day 3-10/11/12 TS→Rust 生成 | `MCP_TOOL_NAMES` を生成物へ。`pnpm cli:test` が古い生成物で落ちる |

### 想定と違ったこと

- **Rust のスキーマ 1,570行は今回動かせなかった**。`json!` の中で `texture_import_settings_schema(false)` のようなヘルパを呼んでいて、素の JSON ではない。ヘルパを展開すると共有していたサブスキーマが重複するので、移すこと自体が改悪になる。代わりに Rust テストを集合比較へ変え、スキーマ一覧と生成された allow-list が同じ集合であることを保証した。ツールの追加漏れはこれで必ず止まる。
- **`updateComponent` の500行 switch は表にしなかった**。ケースごとに形が違い (uniform 4 / 追加検証あり 3 / 特殊 4)、表にしても複雑さが移るだけで消えない。本題は patch キーの手書きコピーだったので、そこだけを型で固定した。
- **patch キーの乖離は現時点では無かった**。6つの Patch 型すべてが MCP のキー配列と一致していた。今回入れたのは予防であって修正ではない。
- **`mcp-editor-tools.ts` はまだ 6,024行**。契約の集約で −89行にとどまる。ファイル分割 (Day 2-8) は未実施。
- **`cargo check` はテストをコンパイルしない**。B4 のアセット削除で `include_bytes!` の参照が切れていたのを `cargo test` で発見した。AGENT.md に追記済み。

### 副産物として見つかった実バグ

- ドットを含む名前の Model (`chair.v2.glb`) で、派生 Texture/Material の id からハッシュ部が削られ衝突していた。`safeSegment` の2実装のうち片方だけが拡張子を落としており、それを id に適用していた。

## 7. 見送るもの (と理由)

- **core component スキーマ表 (監査の本丸)** — 保存フォーマットに直接触れる。直近に保存互換のバグ修正が出ている領域であり、4日では移行網を含めて終わらない。次スプリント単独で取る
- **lib.rs / SceneViewport の機械的分割** — 純移動なので価値はあるが「複雑さを消さない」。ただし**並行開発が止まっている今が唯一の窓**でもあるため、5節の判断次第では Day 3-4 と入れ替える価値がある
