# B4: studio-guide / openbrush スターターテンプレート削除プラン

`starter-templates.ts` の `StarterWorldTemplateId` は `"studio-guide"` と `"openbrush"` を含むが
`STARTER_WORLD_TEMPLATES` には未登録 → `getStarterWorldTemplate` が throw するだけの到達不能コード。

**削減見込み: starter-templates.ts 3,681 → 約1,180行、fixture 727 → 約345行（正味 約2,870行）**

## 0. 先に確認された「消してはいけないもの」

| 対象 | 理由 |
|---|---|
| `STUDIO_GUIDE_INTERACTION_DOOR_MODEL_ASSET_ID` | `SceneViewport.tsx:97,402` が barrel 経由で参照。既存プロジェクトが今もこの asset ID を持つ |
| `public/visual-editor/starter-assets/openbrush-all-brushes.glb` / `openbrush-LICENSE.txt` | `open-brush-catalog.ts:32` が参照 |
| リポジトリ内の `"openbrush"` 文字列の大半 | `MaterialAsset.shader.kind === "openbrush"` = OpenBrush シェーダ機能。テンプレートとは無関係 |
| `STARTER_ASSET_FOLDER_IDS` | `persistence.ts:698` が参照 |
| `starterWorldContainsNoPrimitiveAssets` | fixture が参照 |

`STARTER_WORLD_TEMPLATES` / `getStarterWorldTemplate` / `isStarterTemplateForKind` は
データ駆動なので **編集不要**（自動的に正しくなる）。UI 側も `STARTER_WORLD_TEMPLATES` を map するだけで
id ごとの switch がないため、union を狭めても網羅性チェックは壊れない。

## 1. 適用順序（この順で行うこと）

1. **`legacy-starter-asset-ids.ts` を新規作成** — `STUDIO_GUIDE_INTERACTION_DOOR_MODEL_ASSET_ID` を移設し、
   `index.ts` の barrel に `export * from "./legacy-starter-asset-ids";` を追加。
   → `SceneViewport.tsx` は **無変更**で通る。
2. **fixture を先に修正** — union を狭めた瞬間に `templateId === "studio-guide"` が TS2367 を大量に出し、
   本体の修正結果が読めなくなるため。
3. **starter-templates.ts をファイル末尾から先頭に向かって削除**（行番号ズレ防止）。
4. `pnpm typecheck` で未使用 import / TS2367 を潰す。
5. fixture ランナー実行（`xrift-official` / `blank` の 2 パスのみ）。

## 2. 削除対象シンボル（starter-templates.ts、下から適用）

| 行範囲 | シンボル | 死因 |
|---|---|---|
| 3642–3668 | `createModelEntity` | 呼び出し元が openbrush 分岐と guide 内のみ |
| 3557–3570 | `createFloorEntity` の templateId 分岐 | scale/position を `[8,8,8]` / `[0,0,0]` 固定に簡素化 |
| 3266–3546 | `createStudioGuideParticleAssets` | 281行 |
| 3207–3264 | `createStarterTextureAsset` の `isStudioGarden` 分岐 | HDR 専用処理 |
| 3099–3194 | `STARTER_TEXTURE_METADATA` guide 12件 | |
| 3060–3072 | `isStudioGuideDecorationModelId` | 削除後は常に false |
| 3047–3056 | `isBundledStarterModelId` の guide/openbrush 行 | |
| 3010–3029 | `createStarterModelAsset` の分岐 | `defaultModelImportSettings(false)` に簡素化 |
| 2821–2972, 2744–2772 | `STARTER_MODEL_METADATA` guide/openbrush | |
| 2685–2709 | `createGuideScreenMaterial` | |
| 2538–2642 | `createStarterMaterials` の studio-guide 分岐 | 105行 |
| 2468–2531 | `STARTER_MODEL_IDS` / `STARTER_MODEL_ORDER` / `STARTER_TEXTURE_IDS` / `STARTER_MATERIAL_IDS` の guide エントリ | `Record<BundledStarterModelId, …>` の余剰キーは型エラーになる |
| 1255–2459 | guide エンティティ関数群（`GuideStationInput`, `createStudioGuideEntities` 1,004行, `createGuideStation`, `createGuideGroup`, `createGuidePrimitiveEntity`, `createGuideTextEntity`, `createGuideParticleEntity`, `createGuideXriftEntity`） | 1,206行 |
| 1202–1230 | `createTemplateEntities` | 引数不要になる。呼び出し側 918行も修正 |
| 1190–1199 | `starterPrefabSeeds` の openbrush gallery | `return [ground];` に |
| 893–1007 | `createStarterWorldProject` の 4 分岐 | particles / interactivity asset / scene settings / license copy |
| 744–764 | `STUDIO_GUIDE_*` 定数群 | `STUDIO_GUIDE_TEMPLATE_THUMBNAIL` はリポジトリ全体で参照ゼロ |
| 699–708 | `OPEN_BRUSH_LICENSE_COPY` | |
| 665–697 | `BUNDLED_STARTER_ASSET_IDS` の該当エントリ | |
| 492–662, 300–461, 224–239 | `BUNDLED_STARTER_ASSETS` の guide/openbrush エントリ | 349行 |
| 55–98 | union 3件（`StarterWorldTemplateId`, `BundledStarterModelId`, `BundledStarterTextureId`） | |
| 1–53 | 不要 import 11件 | `ParticleAsset`, `createAnimationComponent`, `createMeshComponent`, `createMeshColliderComponent`, `createParticleEmitterComponent`, `createTextComponent`, `addDefaultInteractivityAsset`, `OPEN_BRUSH_RENDERER`, `createDefaultParticleAsset`, `ParticlePropertiesPatch`, `DEFAULT_SCENE_SETTINGS` |

`createBoxColliderComponent` / `createBuiltinPrimitiveMeshComponent` / `getBuiltinPrimitiveCreation` /
`BUILTIN_PRIMITIVE_CREATION_IDS` / `createBuiltinPrefabEntity` / `BUILTIN_PREFAB_RECIPE_IDS` は
`createFloorEntity` / `createSpawnEntity` が使うので **残す**。

## 3. fixture の変更点（starter-templates.fixture.ts、約380行削減）

| 行 | 対処 |
|---|---|
| 15–17 | `STUDIO_GUIDE_*` の import 削除 |
| 32–39 | 「Guide and OpenBrush must not be selectable」アサーション削除（union から消えるので恒真） |
| 57–67 | `bundledAssetCopies.length` 期待値を `(templateId === "xrift-official" ? 5 : 0)` に |
| 69–87 | openbrush ライセンスコピー検証ブロック削除 |
| 100–118 | model/texture asset 数の期待値を簡素化 |
| 127–136 | particle は `=== 0` 固定、material は guide 分岐を削除 |
| 195–236 | `expectsParticleAdapterBlock` と openbrush の runtimePackageSpecs 分岐を削除 |
| **245–574** | studio-guide 専用検証ブロックを丸ごと削除（**330行**） |

`(templateId as string) === "studio-guide"` の cast 版（35,36,245,248行）は
TS エラーにならないが常に false なので同様に削除すること。

## 4. 任意（Phase 2 候補）

削除後に孤児になる汎用カタログ資産（約130行）: `log-bench`, `torii-gate`（既に参照ゼロ）, `mug`,
`wine-glass`, `wood-planks-clean`, `polished-concrete`。`BUNDLED_STARTER_ASSETS` は public export なので
今回は残す判断も可。

`public/visual-editor/starter-assets/` の `studio-guide-*`, `studio-garden-2k.hdr`, `particle-*.png` は
削除可能。`THIRD_PARTY_ASSETS.md:10` の OpenBrush Starter 記述は要更新。
