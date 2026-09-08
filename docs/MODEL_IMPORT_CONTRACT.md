# 3Dモデル読み込む Contract

## 目的

GLB / glTF を素材 Manifest へ取り込む。シーン、設定、衝突判定、Compiler が同じ派生情報を参照できるようにする。元ファイルの読み込みやサムネイル生成に失敗しても、最後に保存できた Manifest を保つ。

## 永続化する情報

`ModelAsset` は次の情報を保持する。

- `id`: シーンとプレハブが参照する安定した素材 ID
- `source` / `sourceHash`: project-relative 元データと SHA-256
- `importSettings`: scale、衝突判定生成と、将来の processor 用に保持するメッシュ最適化・Animation 取り込み設定
- `materialSlots`: 安定した `slot`、表示名、元データマテリアル index、任意の既定マテリアル binding
- `importMetadata`: 元データ format、byte length、ノード / メッシュ / primitive count、モデルローカル bounds、Animation 名・長さ・track 数・元データ index、glTF extensions
- `thumbnail`: 元データ hash と renderer version を持つ派生画像。再取り込み後に生成できなければ旧画像を `stale` として明示する

`bounds` は素材 import scale とオブジェクト位置・回転・大きさを適用する前のモデルローカル座標である。衝突判定の自動 fit はこの値へ import scale だけを適用する。

## 新規取り込み

1. 拡張子、MIME、ファイルサイズ、SHA-256 を確認する。
2. glTF 2.0 JSON 構造と外部 URI 依存を確認する。
3. loader でシーン、Animation、bounds を検査する。
4. 元データ JSON からノード / メッシュ / primitive 数とマテリアル index を取得する。
5. `validateModelAssetContract` で非有限値、壊れた bounds、重複 slot、参照切れを検査する。
6. 元データと thumbnail を一つの atomic import transaction で公開する。
7. transaction 成功後だけ Manifest へ素材を追加する。

Blocking diagnostic が一つでもあれば、ファイル commit と Manifest 更新は行わない。

## 再取り込み

`createModelReimportPlan(existingAsset, input)` は既存素材を置換する計画を作る。`AssetImportPlan.replacesAssetId` が置換対象を明示する。`commitAssetImportPlan` は次を保証する。

- 素材 ID、名前、folder、order、import settings を維持する
- 元データ hash が同一ならファイルを書き直さない。検査済み metadata だけを更新できる
- 元データが変化した場合は content-addressed な新しい元データ / thumbnail path へ atomic commit する
- commit 失敗時は入力 Manifest を返さない。呼び出し側が保持する最後の Manifest は変更しない

マテリアル枠は次の順で既存 slot と照合する。

1. 元データマテリアル index と正規化名が一致
2. 正規化名が一意に一致
3. 元データマテリアル index が一致
4. 一致しなければ `material-{sourceMaterialIndex}` を基準に決定的な新規 slot ID を作る

一致した slot は既存の `slot` と `defaultMaterialAssetId` を維持する。元データから消えた slot は削除する。追加 slot は元データ index 順に追加する。この手順により、マテリアル順の変更と名前変更の双方で、可能な限りシーン側の binding を維持する。

`analyzeModelReimportImpact` は確定前または確定後に、旧 3Dモデルと新 3Dモデルの stable slot ID を比較する。消失 slot に対する明示的なマテリアル binding を、現在のシーンと全プレハブからオブジェクト / コンポーネント単位で収集する。この解析は入力 document を変更しない。無効なオブジェクトやコンポーネントの参照も将来再有効化される可能性があるため、省略しない。canonical な builtin primitive 参照があるメッシュでは、互換用の `geometryAssetId` を 3Dモデル参照として扱わない。

## Desktop境界

UI は Tauri command を直接呼ばない。`reimportModelAssetFromDisk` が次をまとめて行う。

1. project-relative 元データを data URL として読む
2. bytes へ変換して再取り込み計画を作る
3. blocking diagnostic を確認する
4. atomic 素材 commit を実行する
5. 成功 Manifest または変更前 Manifest と sanitized message を返す

進行状態は `reading-source`、`inspecting-source`、`committing-assets`、`complete`、`failed` のいずれかで通知する。

## 検証境界

- 素材 Manifest parse は 3Dモデル contract 違反を拒否する。
- Compiler は素材 Manifest codec を通す。このため、同じ違反を blocking diagnostic にする。
- `model-import-contract.fixture.ts` は slot 照合、binding 維持、設定更新、metadata round-trip、非有限値拒否、atomic replacement をファイルシステムなしで検証する。

## Sidecarを参照する3Dモデル

`.gltf` と `.obj` は依存ファイルを同じ同時に読み込むファイルで受け取れる。`planModelCompanionBatch` が model 元データの URI（glTF は `buffers[].uri` と `images[].uri`、OBJ は `mtllib` と MTL の `map_*`）を読む。batch 内で実際に参照されているファイルだけを companion として確定する。

companion は `createAssetImportPlan` の `companionFiles` へ渡す。`three-model-converter` が自己完結 GLB へ正規化する。マテリアル / テクスチャは生成した GLB から展開する。このため、companion を単独素材として重複 import しない。参照されていないファイルは従来どおり単独素材として扱う。

`model-companion-batch.fixture.ts` は glTF 付属ファイルのグループ化、未参照ファイルの単独維持、MTL 経由の texture 解決、単一ファイル batch の非変更、MTL option flag の除去をファイルシステムなしで検証する。

## UI境界

モデルの設定は、last-good の構造情報、現在の import recipe、既定マテリアル枠 binding を分けて表示する。現在の project-relative 元データは同じ素材 ID のまま再取り込みできる。処理中の進捗、成功、失敗を同じ設定へ残す。処理中に対象素材が編集された場合は結果を自動適用しない。直前の素材を保持する。

消失 slot がある時は、適用前の確認または適用後に残す結果として、slot 名、stable ID、失われる 3Dモデル既定マテリアル、影響するシーン / プレハブの割当を同じ設定に表示する。`optimizeMeshes`はメッシュ最適化の選択を保存する。モデルの設定で変更でき、最適化・再読み込み時に適用する。`importAnimations`は、アニメーションのあるモデルを配置するときに、再生用のノードグラフを自動で作るかどうかを指定する。

残る作業は次のとおりである。

- 現在元データの再検査とは別に、別元データを選ぶ置換操作を追加する
- 取り込み前後のノード / メッシュ / Animation / bounds 差分を確定前に確認できるようにする
- 未参照になった content-addressed file の回収を追加する

## 読み込み設定と圧縮

初回の取り込みでは読み込むメニューのテクスチャ設定を使います。モデルごとに変える場合は、設定の読み込み設定で「テクスチャの最大解像度」を選び、再インポートします。「読み込み設定に従う」「原寸のまま」、256〜8192pxから選べます。内蔵画像の縦横比と原本を保持し、個別に保護したテクスチャ設定は上書きしません。

メッシュ最適化とDraco圧縮の選択は素材に保存され、再インポートにも適用されます。設定の最適化と公開前のDraco圧縮は共通の変換処理を使います。公開前にDraco圧縮を選んだ場合は、Dracoを有効にし、メッシュ最適化はモデルに保存した選択を使います。原本は残るので、圧縮のチェックを外して再インポートすると原本から読み直せます。原本自体がDraco圧縮済みの場合は、その圧縮は残ります。

「配置時にメッシュの衝突判定を追加」を外して再インポートすると、そのモデルを参照するシーンとプレハブのメッシュの衝突判定を取り除きます。手動で付けたメッシュの衝突判定も対象です。直方体の衝突判定など他の形状、他のモデル、編集済みの階層や位置・回転・大きさは保持します。再インポートが失敗した場合は、現在の素材と衝突判定を保持します。

MCPでは`update_model_asset`の`patch.importSettings`に`compressWithDraco`と`textureMaxSize`を指定できます。`textureMaxSize`は`"default"`、`"original"`、または256、512、1024、2048、4096、8192です。設定を保存した後、`reimport_model_asset`で適用します。

Dracoはモデルの転送サイズを小さくします。描画時のテクスチャメモリを減らすには、テクスチャの解像度縮小とKTX2圧縮を使います。
