<a id="3dモデル読み込む-contract"></a>

# 3Dモデルの読み込み仕様

## 目的

GLB / glTFを素材Manifestへ取り込み、シーン、設定、Collider、Compilerから同じ派生情報を参照できるようにする。元ファイルの読み込みやサムネイル生成に失敗した場合も、最後に保存できたManifestを保持する。

## 永続化する情報

`ModelAsset`は次の情報を保持する。

- `id`: シーンとプレハブが参照する安定した素材ID
- `source` / `sourceHash`: project-relative元データとSHA-256
- `importSettings`: scale、Collider生成と、将来のprocessor用に保持するメッシュ最適化・Animation取り込み設定
- `materialSlots`: 安定した`slot`、表示名、元データマテリアルindex、任意の既定マテリアルbinding
- `importMetadata`: 元データformat、byte length、ノード / メッシュ / primitive count、モデルローカルbounds、Animation名・長さ・track数・元データindex、glTF extensions
- `thumbnail`: 元データhashとrenderer versionを持つ派生画像。再取り込み後に生成できなければ旧画像を`stale`として明示する

`bounds`は素材import scaleとオブジェクト位置・回転・大きさを適用する前のモデルローカル座標である。Colliderの自動fitはこの値へimport scaleだけを適用する。

## 新規取り込み

1. 拡張子、MIME、ファイルサイズ、SHA-256を確認する。
2. glTF 2.0 JSON構造と外部URI依存を確認する。
3. loaderでシーン、Animation、boundsを検査する。
4. 元データJSONからノード / メッシュ / primitive数とマテリアルindexを取得する。
5. `validateModelAssetContract`で非有限値、壊れたbounds、重複slot、参照切れを検査する。
6. 元データとthumbnailを一つのatomic import transactionで公開する。
7. transaction成功後だけManifestへ素材を追加する。

Blocking diagnosticが一つでもあれば、ファイルcommitとManifest更新は行わない。

## 再取り込み

`createModelReimportPlan(existingAsset, input)`は既存素材を置換する計画を作る。`AssetImportPlan.replacesAssetId`が置換対象を明示する。`commitAssetImportPlan`は次を保証する。

- 素材ID、名前、folder、order、import settingsを維持する
- 元データhashが同一ならファイルを書き直さない。検査済みmetadataだけを更新できる
- 元データが変化した場合はcontent-addressedな新しい元データ / thumbnail pathへatomic commitする
- commit失敗時は入力Manifestを返さない。呼び出し側が保持する最後のManifestは変更しない

マテリアル枠は次の順で既存slotと照合する。

1. 元データマテリアルindexと正規化名が一致
2. 正規化名が一意に一致
3. 元データマテリアルindexが一致
4. 一致しなければ`material-{sourceMaterialIndex}`を基準に決定的な新規slot IDを作る

一致したslotは既存の`slot`と`defaultMaterialAssetId`を維持する。元データから消えたslotは削除する。追加slotは元データindex順に追加する。この手順により、マテリアル順の変更と名前変更の双方で、可能な限りシーン側のbindingを維持する。

`analyzeModelReimportImpact`は確定前または確定後に、旧3Dモデルと新3Dモデルのstable slot IDを比較する。消失slotに対する明示的なマテリアルbindingを、現在のシーンと全プレハブからオブジェクト / コンポーネント単位で収集する。この解析は入力documentを変更しない。無効なオブジェクトやコンポーネントの参照も将来再有効化される可能性があるため、省略しない。canonicalなbuiltin primitive参照があるメッシュでは、互換用の`geometryAssetId`を3Dモデル参照として扱わない。

## Desktop境界

UIはTauri commandを直接呼ばない。`reimportModelAssetFromDisk`が次をまとめて行う。

1. project-relative元データをdata URLとして読む
2. bytesへ変換して再取り込み計画を作る
3. blocking diagnosticを確認する
4. atomic素材commitを実行する
5. 成功Manifestまたは変更前Manifestとsanitized messageを返す

進行状態は`reading-source`、`inspecting-source`、`committing-assets`、`complete`、`failed`のいずれかで通知する。

## 検証境界

- 素材Manifest parseは3Dモデルcontract違反を拒否する。
- Compilerは素材Manifest codecを通す。このため、同じ違反をblocking diagnosticにする。
- `model-import-contract.fixture.ts`はslot照合、binding維持、設定更新、metadata round-trip、非有限値拒否、atomic replacementをファイルシステムなしで検証する。

## Sidecarを参照する3Dモデル

`.gltf`と`.obj`は、依存ファイルと一緒に取り込める。`planModelCompanionBatch`はmodel元データのURIを読む。glTFでは`buffers[].uri`と`images[].uri`、OBJでは`mtllib`とMTLの`map_*`を参照する。同時に取り込むファイルのうち、実際に参照されているものだけをcompanionとして確定する。

companionは`createAssetImportPlan`の`companionFiles`へ渡す。`three-model-converter`が自己完結GLBへ正規化する。マテリアル / テクスチャは生成したGLBから展開する。このため、companionを単独素材として重複importしない。参照されていないファイルは従来どおり単独素材として扱う。

`model-companion-batch.fixture.ts`はglTF付属ファイルのグループ化、未参照ファイルの単独維持、MTL経由のtexture解決、単一ファイルbatchの非変更、MTL option flagの除去をファイルシステムなしで検証する。

## UI境界

モデルの設定では、最後に正常に読み込めた構造情報、現在のimport recipe、既定マテリアル枠のbindingを分けて表示する。現在のproject-relative元データは同じ素材IDのまま再取り込みできる。進捗と成功・失敗の結果は同じ設定パネルに表示する。処理中に対象素材が編集された場合は、結果を自動適用せず直前の素材を保持する。

消失するslotがある場合は、適用前の確認画面か適用後の結果に、slot名、stable ID、失われる3Dモデルの既定マテリアル、影響するシーン / プレハブの割当を表示する。`optimizeMeshes`にはメッシュ最適化の選択を保存する。モデルの設定から変更でき、最適化・再読み込み時に適用される。`importAnimations`では、アニメーションのあるモデルの配置時に、再生用ノードグラフを自動で作るかどうかを指定する。

残る作業は次のとおりである。

- 現在元データの再検査とは別に、別元データを選ぶ置換操作を追加する
- 取り込み前後のノード / メッシュ / Animation / bounds差分を確定前に確認できるようにする
- 未参照になったcontent-addressed fileの回収を追加する

## 読み込み設定と圧縮

初回の取り込みでは、取り込みメニューのテクスチャ設定を使います。モデルごとに変える場合は、モデルの読み込み設定で「テクスチャの最大解像度」を選んで再インポートしてください。「読み込み設定に従う」「原寸のまま」、256〜8192pxから選べます。内蔵画像の縦横比と原本を保持し、個別に保護したテクスチャ設定は上書きしません。

メッシュ最適化とDraco圧縮の選択は素材に保存され、再インポートにも適用されます。設定パネルでの最適化と公開前のDraco圧縮には、共通の変換処理を使います。公開前にDraco圧縮を選ぶとDracoが有効になり、メッシュ最適化にはモデルに保存した選択が適用されます。

原本は保持されます。圧縮のチェックを外して再インポートすると、原本から読み直せます。原本自体がDraco圧縮済みの場合は、その圧縮が残ります。

「配置時にMesh Colliderを追加」を外して再インポートすると、そのモデルを参照するシーンとプレハブのMesh Colliderを取り除きます。手動で付けたMesh Colliderも対象です。Box Colliderなど他の形状、他のモデル、編集済みの階層や位置・回転・大きさは保持します。再インポートが失敗した場合は、現在の素材とColliderを保持します。

MCPでは`update_model_asset`の`patch.importSettings`に`compressWithDraco`と`textureMaxSize`を指定できます。`textureMaxSize`は`"default"`、`"original"`、または256、512、1024、2048、4096、8192です。設定を保存した後、`reimport_model_asset`で適用します。

Dracoはモデルの転送サイズを小さくします。描画時のテクスチャメモリを減らすには、テクスチャの解像度縮小とKTX2圧縮を使います。
