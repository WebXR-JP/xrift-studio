---
name: xrift-mcp-blender-modeling
description: XRift Studio MCP で「綺麗な」3D シーン・オブジェクト・モデルを作るためのハイブリッドパイプライン。TSX Script の Render (R3F) を主軸に、複雑ジオメトリは Blender MCP で手続き型モデリング → GLB 書き出し → Studio へ取り込む。「〇〇を作って」「モデルを生成」「机/椅子/建物を作る」「Blender で作って」「ジオメトリを最適化」「R3F コードでシーンを組んで」「GLB を配置」などで発動。
---

# XRift Studio × Blender モデリングパイプライン

XRift Studio MCP と Blender MCP を組み合わせ、コーディングエージェントらしく「綺麗」な
3D コンテンツを作るための標準手順。**コード中心**を主軸とし、Blender は必要なときだけ補助する。

## 原則（重要）

- **R3F (TSX Script の Render) を主軸にする**。プリミティブ・配置・ライト・マテリアル・
  アニメーションは可能な限りコードで表現する。コードは diff が読め、再生成・再利用・検証が容易。
- **Blender は複雑ジオメトリ・デシメート・マテリアルベーク・単位/原点補正にのみ使う**。
  単純な箱や球の配置に Blender を起動しない。
- **`useFrame` は使えない**。TSX Script の Render では R3F の `useFrame` が拒否される。
  フレーム処理は `start(ctx)` が返す `update(delta)` で行う。
- **モデルは自己完結した GLB を推奨**。外部テクスチャは `ctx.assets.url()` + `useGLTF`/`Clone`
  のポート可能パターンで参照する。

## 進め方（この順番を守る）

### A. 何を作るか整理する

1. ユーザー要望を「コードで組む部分」と「メッシュが必要な部分」に分ける。
2. コードで組める（プリミティブ・配置・ライト・色・アニメ）ものは TSX Script に割り当てる。
3. 複雑な形状（曲線、彫刻、特定のプロポーション）だけ Blender に回す。
4. 迷ったら**まずコードで組み、不足が明確になったら Blender に移行**する。

### B. コード中心でシーンを組む（主軸）

#### B-1. R3F / Three.js コードを「貼り付けて変換」する（最速）

Studio には `ComponentCodeImportDialog`（「コードから作成」）があり、R3F / Three.js の JSX を
貼り付けると Entity とコンポーネントへ変換される。コードエージェント的にはこれが一番綺麗。

1. R3F ワールドの `World.tsx` 相当の JSX（`@xrift/world-components` + R3F）を用意する。
2. これを `analyzeComponentCode` / `analyzeComponentProject`（`ComponentCodeImportDialog`）に通す。
   - 参照されるモデル・テクスチャ・Entity 構造・Component が抽出される。
   - `applyComponentCodeImportPlan` で Entity 群として確定する。
3. `get_editor_context` で revision を取り、作成後の最新状態を再取得する。
4. 変換できない構文（`useFrame` 等）はエラーとして出るので、`start(ctx).update(delta)` へ直す。

> 対象は「@xrift/world-components の Component」か「R3F のプリミティブ/メッシュ」。
> 単純な箱・球・配置・色はこれで十分に綺麗に組める。複雑ジオメトリだけ Blender に回す。

#### B-2. TSX Script の Render で手続き的に描画する

`analyzeComponentCode` では拾い切れない動的な手続き描画（アニメ・複雑な JSX 生成）は、
TSX Script の `Render` で直接 R3F を書く。

1. `list_script_templates` → `create_script_asset`(language: "tsx") で作成。
2. `Render({ ctx })` を named export する。外部 GLB は `model-display` テンプレートの
   `useGLTF`/`Clone` パターンを踏襲（prop.asset / ScriptRenderProps）。
3. フレーム毎の動きは `start(ctx) { return { update(delta) {} } }` に（`useFrame` 不可）。
4. `update_script_component` で `assetReferences` / `entityReferences` を宣言。

#### B-3. 確定と確認（共通）

1. `update_script_component` で `assetReferences` / `entityReferences` を宣言（未宣言は解決しない）。
2. `set_play_mode(mode: "play")` で確認。未承認ソースは `SCRIPT_APPROVAL_REQUIRED` が返るので
   ユーザーに Studio で承認してもらう。`unapprovedPolicy: "skip"` はスクリプトなしで始める場合のみ。
3. `get_editor_context` の scriptRuntime で compile error / trust 状態を確認。

### C. Blender でメッシュを作る（必要なときだけ）

1. Blender が MCP で接続されているか `get_blendfile_summary_path_info` で確認。未接続なら
   Blender 側でアドオン起動を促す。
2. 既存シーンを壊さない。新規オブジェクト名は一意にする（`.001` 衝突を避け参照は即時取得）。
3. 手続き型で作る:
   - `execute_blender_code` でプリミティブ生成・編集・モディファイア適用。
   - 非破壊のモディファイア（デシメート・ベベル・サブサーフ）を好む。
   - メッシュ編集は bmesh API を使い、`bmesh.to_mesh()` で flush を忘れない。
4. **書き出し前に必ずクリーンアップ**（xrift-mcp-blender-modeling の references/blender-export.md）:
   - 適用: `bpy.ops.object.transform_apply()`（スケール非均一を解消）。
   - 原点をジオメトリ中心へ: `bpy.ops.object.origin_set(type="ORIGIN_CENTER_OF_VOLUME")`。
   - 単位系: Blender はメートルがデフォルト。シーン単位を確認。
   - 非表示・無関係オブジェクトを除外。
   - マテリアルは PBR (Principled BSDF) に簡素化。
5. 書き出し: `bpy.ops.export_scene.gltf(export_format="GLB", use_selection=True, export_materials="EXPORT")`。
   出力先は絶対パスを指定し、パスに日本語/空白があれば注意。

### D. GLB を Studio へ取り込む

1. `import_model_asset`（Edit 中のみ、絶対パス・正規ファイル必須）。
2. `get_model_asset` で import 設定とマテリアルスロットを確認。
3. `update_model_asset` で `importSettings.scale` や `materialSlotBindings` を必要に応じ調整。
4. ジオメトリ変更を反映するなら `reimport_model_asset`。
5. `place_asset` でシーンへ配置 → `update_transform` で配置調整。
6. `set_material` でスロットへ Material Asset を割当。
7. マテリアルは `update_material_asset`（PBR / KHR 拡張）で調整。テクスチャは `import_texture_asset`。
8. 必要なら `add_component`（`core.mesh` に castShadow / receiveShadow 等）。

### E. 検証ループ

1. `set_play_mode(mode: "play")` で実機確認。
2. `get_editor_context` の scriptRuntime で compile error / trust 状態を確認。
3. 問題があれば `update_script_asset` / `update_transform` / `update_material_asset` で修正。
4. Play 中の書き込みは Entity/Scene 構造ツールが即時同期。`get_editor_context` を再取得して
   最新 revision から続行。

## コード中心の変換ガイド（R3F/Three.js → TSX Script）

Three.js / R3F で作ったコードを XRift に落とすときの変換ルールは
`references/r3f-to-script.md` に詳細がある。要点:

| Three.js / R3F | XRift TSX Script |
|---|---|
| `useFrame((state) => ...)` | `start(ctx) { return { update(delta) { ... } } }`（`delta` 秒） |
| `const ref = useRef()` + imperative | 不要。`update` 内で `ctx.object3d` を操作 |
| `<mesh geometry={...} material={...}>` | `<mesh>` に既存 Entity/Asset を参照 |
| `useGLTF(url)` | `ctx.assets.url(declaredModelId)` + `@react-three/drei` |
| `<primitive object={scene}>` | `<Clone>`（drei）で再利用 |
| マテリアル変更 | `ctx.materials.setColor/setRoughness/...` |
| ライト変更 | `ctx.lights.setColor/setIntensity/...` |

## Blender 使用時の重要注意

- **書き出しは GLB で自己完結**を基本とし、テクスチャを内包させる。
- 大規模シーンはプログレッシブに調査（全オブジェクトのダンプはしない）。
- スクリーンショットは `get_screenshot_of_window_as_image` で確認に使う。

## 参照

- エージェント全体ルール: AGENT.md
- UX 設計: .agents/skills/xrift-studio-ux/SKILL.md
- 検証ループ: .agents/skills/xrift-studio-verify/SKILL.md
- XRift Studio 機能追加: .agents/skills/xrift-studio-feature/SKILL.md
- GLB 書き出し詳細: .agents/skills/xrift-mcp-blender-modeling/references/blender-export.md
- R3F/Three.js → Script 変換: .agents/skills/xrift-mcp-blender-modeling/references/r3f-to-script.md
- 動作例（R3F→Studio 変換と配置）: .agents/skills/xrift-mcp-blender-modeling/references/r3f-to-studio-example.md
- 反復編集ループ: .agents/skills/xrift-mcp-blender-modeling/references/iterative-loop.md
