# XRift Studio Visual Editor Roadmap

## 目標

XRift Studioだけで、Worldの新規作成、Scene編集、Asset管理、Material設定、XRift固有機能、Play、保存、変換、検査、Uploadまでを完了できる制作環境にする。ViteやCLIは内部実装として扱い、ビジュアル制作中の操作手順には出さない。

最初の実用到達点は、次の一連の操作が途切れないことである。

1. 素材入りStarter Worldを選んで作成する。
2. ModelまたはPrefabをAssetsからSceneへ配置する。
3. Hierarchyで名前、親子関係、複製、削除を編集する。
4. MaterialをInspectorで作り、Textureを割り当て、Sceneへ適用する。
5. Collider、Spawn Point、Mirror、Portalなどをコードなしで設定する。
6. 同じScene ViewでPlayし、Stopで編集状態へ戻る。
7. 保存し、XRift向けに変換・検査してUploadする。

## 揺らがない設計判断

- Classic projectとVisual projectは、正本と制作方法が異なる独立した導線にする。
- Visual projectの正本はScene、Asset、Material、Prefabなどの型付きdocumentとする。
- Scene View、Hierarchy、Inspector、Assetsは同じselectionとcommand historyを共有する。
- Materialは共有Assetとして保持し、EntityにはMaterial IDのbindingだけを保存する。
- Model、Texture、Material、Prefab、ParticleをAssetとして扱い、PrimitiveはCreate toolとして扱う。
- XRift固有機能は型付きRegistry、Inspector、Scene proxy、compiler adapterが揃ったものだけ公開する。
- 保存、変換、検査、Uploadは制作documentを破壊せず、失敗後もEditorへ戻れるようにする。
- UIは白とneutralを基調にし、既存のLucide iconをsemantic registry経由で使う。独自SVGは追加しない。

## 12段階

| Step | 到達点 | 現在 | 完了条件 |
| --- | --- | --- | --- |
| 1 | Visual document基盤 | 基盤あり、継続改善 | Project、Scene、Asset、Prefabの保存、migration、reference validationが決定的に動く。 |
| 2 | Editor shell | 基盤あり、継続改善 | Hierarchy、Scene View、Inspector、Assetsが同じprojectとselectionを表示し、明るい統一themeで使える。 |
| 3 | CommandとHierarchy編集 | 基盤あり | Create Empty、rename、copy、paste、duplicate、delete、reparent、Undo / Redoを主要surfaceから実行できる。 |
| 4 | Drag and Drop | WebView互換payloadと複数slot選択まで実装、実機受入が残る | Model / Prefab / ParticleをSceneとHierarchyへ、MaterialをMeshへ、TextureをMaterial slotへdropでき、一件の履歴になる。 |
| 5 | Material / Texture authoring | coreと主要extensionのInspector・thumbnailを実装、Scene描画を継続 | glTF core PBR、TextureInfo、UV、alpha、両面、emissive、normal、occlusion、主要extensionをInspectorで編集し、Sceneとthumbnailへ即時反映する。 |
| 6 | Starter World / Asset library | 進行中 | 新規Worldが実用品Model、Texture、Material、Collider、Lighting、XRift Spawnを持ち、未配置素材もAssetsから再利用できる。 |
| 7 | XRift Component / template | 8種の組み込みrecipeと保護付き設定fieldを実装、runtime受入を継続 | CreateからXRift機能をSceneへ作成またはEntityへ追加し、必須値をInspectorで設定して有効なcodeへ変換できる。 |
| 8 | Model import pipeline | 構造契約・Inspector・同一ID再importを実装、複数fileと差分確認が残る | GLB / GLTFのnode、mesh、material slot、animation、boundsを保持し、thumbnail、reimport、複数slot overrideが動く。 |
| 9 | Play runtime | 次段階 | World向け移動、camera、physics、interactionとItem previewを別profileで実行し、Stopでauthoring stateへ戻る。 |
| 10 | Save / Compile / Check / Upload | 基盤あり、堅牢化中 | revision整合、staging provenance、診断元への移動、認証、進捗、再試行、正式result表示まで一つのmodalで完結する。 |
| 11 | Workspace品質 | 計画済み | panel dock / resize / restore、shortcut設定、検索、複数選択、focus、accessibility、大規模Scene性能を実用水準にする。 |
| 12 | Production readiness | 計画済み | migration fixture、実機gesture、失敗回復、負荷、セキュリティ、Upload sandbox、release checklistを満たす。 |

## 現在の実装優先順

1. Material extensionをScene ViewとインポートModelの描画へ接続し、Inspector・thumbnail・Sceneを同じ値にする。
2. Model再importへ別source選択、sidecar付きglTF、変更差分、消失slot参照一覧を追加する。
3. Starter Worldと未配置Asset libraryへ、実利用できるModel・Texture・Materialと生成済みthumbnailを増やす。
4. XRift組み込みrecipeを実runtimeで受け入れ、必須値、Scene proxy、compiler diagnostic、Upload結果を一致させる。
5. WebView上のMaterial・Model・Prefab・Texture D&D、複数slot選択、Undo / Redoを一つの実機受入として確認する。
6. World Playのcharacter、collider、spawn、cameraをScene authoringと同じdocumentから実行する。

## 開発と検証の配分

機能実装中はdocument contract、command、UI、compiler adapterを先に揃える。型確認と対象fixtureは変更の境界で実行し、画面全体の反復デバッグは複数機能が一つの制作フローとしてつながった節目で行う。本番buildと実Uploadは通常の開発確認には使わない。

## 完了判定

ファイルやbuttonが存在するだけでは完了としない。各Stepは、完了条件の操作を実データで最後まで実行し、保存後の再読込、Undo / Redo、失敗時の復帰、compiler出力まで一致した時に完了とする。
