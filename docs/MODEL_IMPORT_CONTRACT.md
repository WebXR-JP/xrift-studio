# Model Import Contract

## 目的

GLB / glTF を Asset Manifest へ取り込み、Scene、Inspector、Collider、Compiler が同じ派生情報を参照できるようにする。元ファイルの読み込みやサムネイル生成に失敗しても、最後に保存できた Manifest を壊さない。

## 永続化する情報

`ModelAsset` は次の情報を保持する。

- `id`: Scene と Prefab が参照する安定した Asset ID
- `source` / `sourceHash`: project-relative source と SHA-256
- `importSettings`: scale、Collider生成と、将来のprocessor用に保持するMesh最適化・Animation取り込み設定
- `materialSlots`: 安定した `slot`、表示名、source Material index、任意の既定Material binding
- `importMetadata`: source format、byte length、node / mesh / primitive count、モデルローカルbounds、Animation名・長さ・track数・source index、glTF extensions
- `thumbnail`: source hash とrenderer versionを持つ派生画像。再取り込み後に生成できなければ旧画像を `stale` として明示する

`bounds` は Asset import scale と Entity Transform を適用する前のモデルローカル座標である。Colliderの自動fitはこの値へ import scaleだけを適用する。

## 新規取り込み

1. 拡張子、MIME、ファイルサイズ、SHA-256を確認する。
2. glTF 2.0 JSON構造と外部URI依存を確認する。
3. loaderでScene、Animation、boundsを検査する。
4. source JSONからnode / mesh / primitive数とMaterial indexを取得する。
5. `validateModelAssetContract` で非有限値、壊れたbounds、重複slot、参照切れを検査する。
6. sourceとthumbnailを一つのatomic import transactionで公開する。
7. transaction成功後だけManifestへAssetを追加する。

Blocking diagnosticが一つでもあれば、ファイルcommitとManifest更新は行わない。

## 再取り込み

`createModelReimportPlan(existingAsset, input)` は既存Assetを置換する計画を作る。`AssetImportPlan.replacesAssetId` が置換対象を明示し、`commitAssetImportPlan` は次を保証する。

- Asset ID、名前、folder、order、import settingsを維持する
- source hashが同一ならファイルを書き直さず、検査済みmetadataだけを更新できる
- sourceが変化した場合はcontent-addressedな新しいsource / thumbnail pathへatomic commitする
- commit失敗時は入力Manifestを返さず、呼び出し側が保持する最後のManifestを変更しない

Material slotは次の順で既存slotと照合する。

1. source Material indexと正規化名が一致
2. 正規化名が一意に一致
3. source Material indexが一致
4. 一致しなければ `material-{sourceMaterialIndex}` を基準に決定的な新規slot IDを作る

一致したslotは既存の `slot` と `defaultMaterialAssetId` を維持する。sourceから消えたslotは削除し、追加slotはsource index順に追加する。これによりMaterial順の変更と名前変更の双方で、可能な限りScene側のbindingを維持する。

`analyzeModelReimportImpact` は確定前または確定後に、旧Modelと新Modelのstable slot IDを比較する。消失slotに対する明示的なMaterial bindingを、現在のSceneと全PrefabからEntity / Component単位で収集する。この解析は入力documentを変更せず、無効なEntityやComponentの参照も将来再有効化される可能性があるため省略しない。canonicalなbuiltin primitive参照があるMeshでは、互換用の`geometryAssetId`をModel参照として扱わない。

## Desktop境界

UIはTauri commandを直接呼ばない。`reimportModelAssetFromDisk` が次をまとめて行う。

1. project-relative sourceをdata URLとして読む
2. bytesへ変換して再取り込み計画を作る
3. blocking diagnosticを確認する
4. atomic Asset commitを実行する
5. 成功Manifestまたは変更前Manifestとsanitized messageを返す

進行状態は `reading-source`、`inspecting-source`、`committing-assets`、`complete`、`failed` のいずれかで通知する。

## 検証境界

- Asset Manifest parseはModel contract違反を拒否する。
- CompilerはAsset Manifest codecを通すため、同じ違反をblocking diagnosticにする。
- `model-import-contract.fixture.ts` はslot照合、binding維持、設定更新、metadata round-trip、非有限値拒否、atomic replacementをファイルシステムなしで検証する。

## UI境界

Model Inspectorは、last-goodの構造情報、現在のimport recipe、既定Material slot bindingを分けて表示する。現在のproject-relative sourceは同じAsset IDのまま再取り込みでき、処理中の進捗、成功、失敗を同じInspectorへ残す。処理中に対象Assetが編集された場合は結果を自動適用せず、直前のAssetを保持する。

消失slotがある時は、適用前の確認または適用後に残す結果として、slot名、stable ID、失われるModel既定Material、影響するScene / Prefabの割当を同じInspectorに表示する。`optimizeMeshes`はschema互換のため値を保持するが、現在のprocessorは値を処理へ反映しないため、Inspectorでは「未対応」として読み取り専用で表示する。`importAnimations`は配置時のAnimation Component自動追加を制御し、検出済みclipがあるModelだけを対象にする。

残る作業は次のとおりである。

- 現在sourceの再検査とは別に、別sourceを選ぶ置換操作を追加する
- 取り込み前後のnode / mesh / Animation / bounds差分を確定前に確認できるようにする
- sidecarを参照するglTFの複数ファイル取り込みと、未参照になったcontent-addressed fileの回収を追加する
