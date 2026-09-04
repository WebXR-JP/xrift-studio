# Model Import Contract

## 目的

GLB / glTF を Asset Manifest へ取り込む。Scene、Inspector、Collider、Compiler が同じ派生情報を参照できるようにする。元ファイルの読み込みやサムネイル生成に失敗しても、最後に保存できた Manifest を保つ。

## 永続化する情報

`ModelAsset` は次の情報を保持する。

- `id`: Scene と Prefab が参照する安定した Asset ID
- `source` / `sourceHash`: project-relative source と SHA-256
- `importSettings`: scale、Collider 生成と、将来の processor 用に保持する Mesh 最適化・Animation 取り込み設定
- `materialSlots`: 安定した `slot`、表示名、source Material index、任意の既定 Material binding
- `importMetadata`: source format、byte length、node / mesh / primitive count、モデルローカル bounds、Animation 名・長さ・track 数・source index、glTF extensions
- `thumbnail`: source hash と renderer version を持つ派生画像。再取り込み後に生成できなければ旧画像を `stale` として明示する

`bounds` は Asset import scale と Entity Transform を適用する前のモデルローカル座標である。Collider の自動 fit はこの値へ import scale だけを適用する。

## 新規取り込み

1. 拡張子、MIME、ファイルサイズ、SHA-256 を確認する。
2. glTF 2.0 JSON 構造と外部 URI 依存を確認する。
3. loader で Scene、Animation、bounds を検査する。
4. source JSON から node / mesh / primitive 数と Material index を取得する。
5. `validateModelAssetContract` で非有限値、壊れた bounds、重複 slot、参照切れを検査する。
6. source と thumbnail を一つの atomic import transaction で公開する。
7. transaction 成功後だけ Manifest へ Asset を追加する。

Blocking diagnostic が一つでもあれば、ファイル commit と Manifest 更新は行わない。

## 再取り込み

`createModelReimportPlan(existingAsset, input)` は既存 Asset を置換する計画を作る。`AssetImportPlan.replacesAssetId` が置換対象を明示する。`commitAssetImportPlan` は次を保証する。

- Asset ID、名前、folder、order、import settings を維持する
- source hash が同一ならファイルを書き直さない。検査済み metadata だけを更新できる
- source が変化した場合は content-addressed な新しい source / thumbnail path へ atomic commit する
- commit 失敗時は入力 Manifest を返さない。呼び出し側が保持する最後の Manifest は変更しない

Material slot は次の順で既存 slot と照合する。

1. source Material index と正規化名が一致
2. 正規化名が一意に一致
3. source Material index が一致
4. 一致しなければ `material-{sourceMaterialIndex}` を基準に決定的な新規 slot ID を作る

一致した slot は既存の `slot` と `defaultMaterialAssetId` を維持する。source から消えた slot は削除する。追加 slot は source index 順に追加する。この手順により、Material 順の変更と名前変更の双方で、可能な限り Scene 側の binding を維持する。

`analyzeModelReimportImpact` は確定前または確定後に、旧 Model と新 Model の stable slot ID を比較する。消失 slot に対する明示的な Material binding を、現在の Scene と全 Prefab から Entity / Component 単位で収集する。この解析は入力 document を変更しない。無効な Entity や Component の参照も将来再有効化される可能性があるため、省略しない。canonical な builtin primitive 参照がある Mesh では、互換用の `geometryAssetId` を Model 参照として扱わない。

## Desktop境界

UI は Tauri command を直接呼ばない。`reimportModelAssetFromDisk` が次をまとめて行う。

1. project-relative source を data URL として読む
2. bytes へ変換して再取り込み計画を作る
3. blocking diagnostic を確認する
4. atomic Asset commit を実行する
5. 成功 Manifest または変更前 Manifest と sanitized message を返す

進行状態は `reading-source`、`inspecting-source`、`committing-assets`、`complete`、`failed` のいずれかで通知する。

## 検証境界

- Asset Manifest parse は Model contract 違反を拒否する。
- Compiler は Asset Manifest codec を通す。このため、同じ違反を blocking diagnostic にする。
- `model-import-contract.fixture.ts` は slot 照合、binding 維持、設定更新、metadata round-trip、非有限値拒否、atomic replacement をファイルシステムなしで検証する。

## Sidecarを参照するModel

`.gltf` と `.obj` は依存ファイルを同じ import batch で受け取れる。`planModelCompanionBatch` が model source の URI（glTF は `buffers[].uri` と `images[].uri`、OBJ は `mtllib` と MTL の `map_*`）を読む。batch 内で実際に参照されているファイルだけを companion として確定する。

companion は `createAssetImportPlan` の `companionFiles` へ渡す。`three-model-converter` が自己完結 GLB へ正規化する。Material / Texture は生成した GLB から展開する。このため、companion を単独 Asset として重複 import しない。参照されていないファイルは従来どおり単独 Asset として扱う。

`model-companion-batch.fixture.ts` は glTF sidecar のグループ化、未参照ファイルの単独維持、MTL 経由の texture 解決、単一ファイル batch の非変更、MTL option flag の除去をファイルシステムなしで検証する。

## UI境界

Model Inspector は、last-good の構造情報、現在の import recipe、既定 Material slot binding を分けて表示する。現在の project-relative source は同じ Asset ID のまま再取り込みできる。処理中の進捗、成功、失敗を同じ Inspector へ残す。処理中に対象 Asset が編集された場合は結果を自動適用しない。直前の Asset を保持する。

消失 slot がある時は、適用前の確認または適用後に残す結果として、slot 名、stable ID、失われる Model 既定 Material、影響する Scene / Prefab の割当を同じ Inspector に表示する。`optimizeMeshes` は schema 互換のため値を保持する。現在の processor は値を処理へ反映しない。このため、Inspector では「未対応」として読み取り専用で表示する。`importAnimations` は配置時の Animation Component 自動追加を制御する。検出済み clip がある Model だけを対象にする。

残る作業は次のとおりである。

- 現在 source の再検査とは別に、別 source を選ぶ置換操作を追加する
- 取り込み前後の node / mesh / Animation / bounds 差分を確定前に確認できるようにする
- 未参照になった content-addressed file の回収を追加する
