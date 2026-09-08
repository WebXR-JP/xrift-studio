# 素材の取り込み・編集の操作・状態設計

[機能一覧へ戻る](../UX_INTERACTIONS.md) / [共通の動き](./interactions.md)

<a id="f-08"></a>

## F-08 ビジュアル編集素材 authoring / import の状態設計

### 操作前

- 素材は左のfolder treeに実フォルダーの親子関係を常時表示する。右側に選択フォルダーの内容を出す。3Dモデル / GLTF、テクスチャ、マテリアル、プレハブ、パーティクルの種類別collectionは実フォルダーと区別する。primitiveは別の追加 paletteに置く。マテリアル / 3Dモデル / テクスチャはreadyなgenerated thumbnailを使う。未生成時だけkind iconを使う。
- `sceneSelection` と `assetSelection` が独立する。右設定がどちらの context を表示しているかを選択背景、header、pinned tab で示す。
- 読み込む前に対応形式を確認できる。HDR / EXRが空の背景へ直ちに設定されること、元データ保持、既定 max resolution / quality / mipmap / compression、resource budget、external URI が local dependency に限られることも確認できる。
- モデルの設定は元データとlast-good解析結果、マテリアル枠、animation、bounds、現在のimport recipeを同時に示す。解析済みの値と次回再import用の設定を区別する。

マテリアルスロットは件数付きで初期表示を折り畳み、閉じている間は行と選択肢を生成しない。展開後は20件ずつ表示し、スロット名とIDで検索できる。検索変更時は先頭ページへ戻る。該当なしの場合は検索語の変更を案内する。折り畳み・再展開時は検索とページを初期化するが、保存済みの割当は保持する（MI-117）。モデルの設定のプレビューは80px、素材のグリッドは最小幅76px・サムネイル高40pxにする。フォルダーアイコンは18pxに抑える。

### 操作中

- マテリアル作成は dialog 内の validation、テクスチャ / 3Dモデル / HDRI import は読み込む Queue の validate、copy、decode、derive、thumbnail、commit を表示する。cancel を処理中 stage に合わせる。
- MCP の `import_audio_asset` / `import_texture_asset` も編集中だけ通常読み込むと同じcontent-addressed copy、atomic commit、history、自動保存を通す。絶対元データ path は trusted client input としてnative側で通常file、symlink / reparse pointなし、対応拡張子、128 MB上限、read前後size、音声ではMP3 / WAV signatureも検査する。応答には外部path、data URL、bytesを返さない。
- パーティクルは素材の作成操作から追加する。右設定で emission、shape、velocity、lifetime、size、color、texture、blend を編集する。パーティクルはシーンまたはオブジェクト一覧へ drag してパーティクルの放出オブジェクトとして配置できる。
- context menu は現在 kind / state で実行できる項目だけを有効にする。menu open だけでは selection や document を変えない。
- 3Dモデルのscale、collider生成、メッシュ最適化、animation importを変更した時はrecipeだけを未保存にする。再importが必要な項目を設定内で示す。再import中も既存シーン参照とlast-good表示を消さない。

### 成功時

- 読み込む / マテリアル作成は AssetManifest と folder membership を一度だけ確定する。新素材を `assetSelection` にする。HDR / EXR importだけは同じ履歴でシーン settingsの空の背景参照も確定する。それ以外は`sceneSelection`とSceneDocumentを維持する。
- MCP 音声 / テクスチャ import は新素材を`assetSelection`にする。同じkindと元データ hashが登録済みなら複製しない。既存素材を選択する。結果には管理下のproject-relative pathと形式metadataだけを残す。外部元データを表示しない。
- パーティクルの作成は新素材を `assetSelection` にする。オブジェクトへの配置またはパーティクルの放出の追加は参照する素材 ID を SceneDocument に保持する。
- thumbnail / derived は元データ / recipe / processor / target hash と一致した時だけ ready にする。同じ元データを再 import しても素材 ID と参照を保つ。マテリアル一覧は保存済み画像だけを表示する。変更時の生成queue以外ではWebGL contextを増やさない。
- マテリアルの変更は共有素材に一度だけ保存する。同じ ID を参照する全 preview に反映する。
- 3Dモデル再importは素材 IDを維持する。slot identityが一致する既存マテリアル bindingを保持する。新規slotは未設定として追加する。消失slotは診断に残す。参照先の修正へ進める。

### 失敗時

- extension、URI、budget、decode、マテリアル field、slot binding の失敗は素材 / field / 元データ URI を project-relative に示す。reimport、設定変更、参照置換のいずれかへ案内する。
- MCP テクスチャ import の相対 path、最終 symlink、未対応形式、署名不一致、stale revisionでは manifest と history を変えない。外部絶対 path を error detailsへ含めない。
- temporary data を回収する。シーン / 素材 / folder documents、両 selection、history、元データ、last-good derived を開始前のままにする。同じ設定の自動 retry loop は行わない。
- 3Dモデル metadataが非有限、bounds不正、slot重複、未対応external URIの場合は新しいmanifestを確定しない。last-good 3Dモデルの素材と配置済みオブジェクトを維持する。

### 戻り先

- 読み込む Queue を閉じても素材と右設定に last result / diagnostic を残す。cancel は直前の `assetSelection`、設定 context、シーンへ戻る。
- 動作確認中は既存マテリアル / パーティクルのpropertyとMCP経由の既存テクスチャ import settings変更を許可する。テクスチャ元データの新規importは停止まで無効にする。停止後は動作確認中に保存した変更と現在のselectionsを維持する。

完了条件: マテリアル / テクスチャ / 3Dモデル / GLTF / OBJ / VRM / プレハブ / パーティクルを左のfolder tree、種類別collection、保存済みthumbnail付きで管理する。GLB / VRMの埋め込みマテリアル / テクスチャを再利用可能な素材へ展開する。マテリアルは変更時だけ一時rendererでthumbnailを更新する。card自体はWebGL contextを保持しない。HDR / EXRはequirectangular用途を持つテクスチャとして取り込む。現在シーンへ直ちに設定する。ソースから保存済みthumbnailを自動生成・再生成する。テクスチャはcontext menuからproject thumbnailへ設定する。シーン設定で実画像を確認できる。元データを壊さずimport、右設定で上下を反転するを含むrecipe編集、参照を保つreimport、stale診断を行える。配置したGLB / VRMはNode・Bone・メッシュ単位で編集できる。Animation取り込みを有効にした3Dモデルは配置時に再生設定へ到達できる。素材編集中も`sceneSelection`は保持する。

<a id="f-15"></a>

## F-15 OBJ / VRM import と静的モデルポーズの状態設計

### 操作前

- 読み込む入口にGLB / glTF / OBJ / VRMを同じ3Dモデル形式として表示する。OBJは単体のgeometryを取り込む。外部MTL / textureは自動取得しない。必要なマテリアルをXRift Studio内で割り当てることを示す。
- VRM 0.x / 1.xは3Dモデルの素材として取り込む。humanoidを含むboneとシェイプキーを最後に正常解析したmetadataとして保持する。Timelineやクリップ編集は静的pose編集の対象外であることをUI上で区別する。
- 配置後は3Dモデルオブジェクトの下に元データのNode、Bone、メッシュ、Skinned メッシュを親子順で表示する。SkinはNodeごとに複製しない。親3Dモデルオブジェクトの共有描画方式でbind poseとAnimationを維持する。
- poseとノード別マテリアル bindingは3Dモデルの素材共通値ではなく配置オブジェクトのメッシュ componentに属する。同じ3Dモデルの別配置を変更しない。

### 操作中

- 読み込む中は既存読み込む Queueで形式検証、元データ copy、parse、thumbnail、manifest commitを順に示す。二重読み込む / reimportを無効にする。
- オブジェクト一覧でBoneまたはNodeを選ぶと、そのlocal 位置・回転・大きさを通常の数値入力とギズモで編集する。共有3Dモデルの元データノード poseへ即時反映する。従来のbone選択UIとシェイプキーの0..1 weightも同じ配置の静的poseとして維持する。
- メッシュ / Skinned メッシュ Nodeを選ぶと、その元データノードが使うマテリアル枠だけを表示する。同じ元データ material indexを共有する別Nodeとは`sourceNodeIndex`で上書きを分離する。
- オブジェクト一覧の目アイコンは共有3DモデルのNodeにも効く。enabledと同時に共有メッシュのpose（`nodes[i].visible`）へ書く。そのNodeのサブツリーの描画をシーン・公開ワールド・Runtimeで一致して消す。削除はNodeをオブジェクトとして削除しない。同じ非表示へ変換する。理由と再表示手段を通知する（MI-117）。
- pose変更は有効な有限値だけを確定する。動作確認中は読み取り専用にする。素材 reimport中はlast-good metadataと現在のオブジェクト poseを表示したままにする。編集を止める。

### 成功時

- 読み込む成功後は新3Dモデルの素材を選択する。形式、bone数、シェイプキー数、元データ、thumbnailを設定に残す。「配置」でオブジェクトを作成する。pose編集へ進める。
- Bone / Node 位置・回転・大きさ、ノード別マテリアル、ノード別の表示 / 非表示、シェイプキー weightは共有メッシュ componentへ保存する。元に戻す / やり直す、project再表示、シーン、コード編集 JSX、Runtime manifestで同じ静的状態を復元する。旧版が保存した「無効なのに描画される」Node flagはprojectを開いた時に実態へそろえる。件数を通知する。
- 「ポーズをリセット」はboneとシェイプキーだけを初期値へ戻す。オブジェクト位置・回転・大きさ、マテリアル binding、衝突判定、3Dモデルの素材を維持する。

### 失敗時

- 不正なOBJ / VRM、上限超過、読めないgeometry、VRM拡張解析失敗ではAssetManifestへcommitしない。読み込む Queueに形式と再選択の案内を残す。
- OBJの外部MTL / texture参照は自動取得しない。warningにする。3Dモデル自体は読める場合に限りcommitする。欠けた見た目はマテリアル枠から修正できる。
- reimport後にpose対象のboneまたはシェイプキーが消えた場合は値を別対象へ移さない。残っている対象だけ適用する。設定に未適用件数とリセットを示す。
- 元データ Node解析またはSkin参照が壊れている場合は部分的なオブジェクト一覧を成功表示しない。last-good 素材とシーンを維持する。読み込む Queueから再試行できるようにする。

### 戻り先

- 読み込む Queueを閉じても新3Dモデルの素材と診断を素材 / モデルの設定に残す。オブジェクトを選択すると直前のpose編集へ戻れる。
- pose編集後に別オブジェクト / 素材を選んでも値を保持する。同じオブジェクトへ戻ると保存済みposeを再表示する。Timeline追加時はこの静的poseを初期状態として扱える構造を維持する。

完了条件: OBJ / VRMを3Dモデルの素材として配置できる。VRMのNode・Bone・Skinned メッシュをオブジェクト一覧から選ぶ。配置オブジェクトごとの位置・回転・大きさ、ノード別マテリアル、シェイプキー weight、ノード別の表示 / 非表示とノード単位の衝突判定追加を保存する。再表示と生成結果で同じ静的状態を復元できる。

<a id="f-16"></a>

## F-16 UnityPackage / シーン / プレハブ import の状態設計

### 操作前

- 素材の読み込むとここに移動は`.unitypackage`、`.unity`、`.prefab`を既存3Dモデル / テクスチャと同じ入口で受け付ける。UnityPackageはシーンだけでなく依存素材を含む入力として区別する。単体シーン / プレハブは外部GUID 素材を同時取得しない入力として区別する。
- 変換対象はGameObject階層、local 位置・回転・大きさ、GLB / glTF / OBJ / VRM、主要テクスチャ、Unity マテリアル、メッシュの描画、ライト、音源設定、衝突判定、Fog / Ambient / Camera設定とする。FBXなど実行時3Dモデルへ変換できない元データも参照先と件数を診断する。
- MonoBehaviourのclass IDと件数はプレハブ生成元の記録へ記録する。C#からJavaScriptへのコード変換は開始しない。

### 操作中

- 読み込む Queueはreading、gzip / tar展開、`pathname`安全性検査、Unity YAML object / GUID参照解析、素材 derive、シーン再構築、プレハブ生成、atomic commitを一つの進捗として表示する。処理中は3Dモデル reimportを含む別素材 mutationと動作確認を無効にする。
- Unityの左手座標系はXRift / Three.jsの右手座標系へ変換する。positionのZとquaternionを対応させる。親参照の欠落とcycleはシーンの直下へ安全に戻す。warningにする。
- 対応素材元データは既存のcontent-addressed保存とthumbnail生成を再利用する。同一SHAは既存素材を選択する。同じbinaryを再コピーしない。パッケージ内の全binary writeが揃うまでSceneDocument、AssetManifest、プレハブ documentを画面へ反映しない。

### 成功時

- 変換したGameObject rootsを現在シーンへ再構築する。Unity シーン / プレハブごとにプレハブ documentとプレハブを保存する。最後に作成または再利用したプレハブを素材で選択する。再構築したrootをオブジェクト一覧 / シーンで選択する。
- Activity drawerにプレハブ、オブジェクト、素材、要確認の件数を残す。プレハブのimport metadataには元データ名、package内pathname、元データ SHA、Unity class ID件数、未対応class ID、C#変換を行っていない事実を保存する。

### 失敗時

- gzip / tar破損、安全でないpathname、展開上限超過、Unity YAML不正、変換対象なし、素材 commit失敗ではlast-good SceneDocument、AssetManifest、プレハブ set、両selectionを維持する。
- 一部の素材 / コンポーネントだけ未対応の場合は変換可能な階層を残す。FBX、外部glTF、音声クリップ、MonoBehaviourなどの不足をwarningとしてActivity drawerから確認できる。黙って完全変換と表示しない。

### 戻り先

- 成功後は「素材を表示」から生成プレハブへ移動する。オブジェクト一覧 / シーンには再構築結果を残す。失敗後はActivity drawerを閉じても元シーンを編集できる。同じまたは修正したpackageを再度ここに移動できる。

完了条件: UnityPackageの論理pathnameとGUID参照を安全に復元する。対応素材を抽出してシーン階層を再構築する。再利用可能なXRift プレハブとして保存する。未対応素材 / コンポーネントは黙って成功扱いしない。診断と生成元の記録へ残す。C#変換を行わない。

<a id="f-18"></a>

## F-18 OpenBrush import / シェーダー rendering の状態設計

### 操作前

- 新規ビジュアル編集ワールドはBlankとOpenBrushの2サンプルを表示する。OpenBrushは48種類のbrushを含むこと、three-icosaを使うこと、Editorに埋め込んだ固定brush resourceを使うことをカードとモデルの設定で事前に示す。
- 通常のGLB / glTF import入口をそのまま使う。`GOOGLE_tilt_brush_material`、旧Tilt Brush exporter、OpenBrush material名を自動判定する。別形式の指定を要求しない。
- OpenBrush 元データに含まれるシェーダーを既定値とする。各brushを編集可能な素材一覧へ出す時もStandard/PBRへ変換しない。three-icosa プリセットを参照する専用マテリアルとして展開する。通常のXRift マテリアルの割当は明示的なslot上書きとして扱う。

### 操作中

- 読み込む Queueは既存のvalidate、copy、parse、thumbnail、commitを使う。OpenBrush exportに残る古い外部画像URLはimport解析時に取得しない。埋め込みplaceholderへ置換する。外部buffer参照は従来どおりblockする。
- OpenBrushのglTF ノードは元データ GLBを複製しない。共有3Dモデルの素材と`sourceNodeIndex`を持つオブジェクト hierarchyへ展開する。ノードの親子関係とlocal 位置・回転・大きさを保持する。各メッシュオブジェクトにはそのノードが使用するbrush slotだけを表示する。
- シーンはOpenBrush判定済み3Dモデルにだけthree-icosa loader extensionを登録する。通常のGLB / glTF、OBJ、VRMのloaderとマテリアル挙動を変更しない。
- Custom マテリアルプレビュー Adapterはマテリアルのシェーダー kind、元データ 3Dモデル、元データ material indexから代表ノードを解決する。OpenBrush adapterは同じthree-icosa loaderを再利用する。Standard sphereへcustom シェーダーを貼らない。brush固有vertex attributeを持つ実ストロークgeometryで描画する。
- カスタムシェーダー契約はマテリアル内の編集可能なシェーダー素材 copyとして、vertex / fragment GLSL、uniform型と設定状態、vertex attribute mappingを分離する。プリセットのGLSLを直接変更しない。マテリアル copyだけを編集・resetできる。
- vertex GLSLの`in` / `attribute`宣言を解析する。`position`、`normal`、`color`、`uv`、`tangent`へsemantic mappingする。color / UV / tangentは安全な既定値を生成できる。設定から任意のgeometry attribute名へ上書きできる。解決不能な必須attributeはPBR fallback理由として表示する。
- OpenBrush マテリアルも通常のマテリアルと同じメッシュの描画 slotへ割り当て可能とする。builtin primitiveでは元GLBに依存しない。brush プリセット、uniform、textureを独立ロードする。
- editor preview用の公式GLSL / brush textureはprojectへ固定snapshotとして埋め込む。network状態や外部CDN更新に依存せず解決する。安定版templateのresourceを優先する。three-icosa本体にだけ存在する追加resourceを補完する。
- three-icosaが知らないbrush プリセット、公開resourceがないプリセット、GLSL / texture読込失敗は、該当primitiveだけGLTFLoaderが作成したPBR マテリアルを保持する。他のbrushを含む3Dモデル全体のimportを失敗させない。preview badgeとマテリアル設定へfallback種別・brush名・失敗理由を示す。
- 公開変換ではcompiler-owned stagingに固定versionのthree-icosaだけをallowlist付きで追加する。authoring projectのpackage manifestや任意pathへpackageを追加しない。

### 成功時

- モデルの設定にOpenBrush / three-icosa、brush数、exporter、renderer versionを残す。各OpenBrush マテリアル設定にはbrush名、GUID、元データ material indexを表示する。対応マテリアルを各メッシュオブジェクトのslotへ初期設定する。通常のXRift マテリアルへ差し替えたslotだけシーンと生成結果でPBRへ置換する。
- マテリアル設定のリアルタイムpreviewは実際に適用されたマテリアル type、GLSL 元データ、uniform一覧、解決済みbrush textureを表示する。見た目と内部シェーダーの両方から初期割当を確認できる。
- OpenBrush Starterは検証済みGLBとApache-2.0 licenseをproject-relative pathへコピーする。48 brush メッシュをGallery root配下の個別オブジェクトとして展開したプレハブを一つの新規projectとして開く。プレハブ設定は同じtreeを表示する。元データオブジェクトへ移動できる。
- プレハブ元データ hierarchyを編集して「プレハブに反映」する。既存プレハブ IDと元データオブジェクト mappingを保ったままプレハブ documentを再生成する。元に戻す / やり直すと通常の保存対象にする。
- compiler outputはGLTFLoaderへthree-icosa extensionと固定brush base URLを登録し、一時stagingの実行環境 dependency planへ固定package specを記録する。

### 失敗時

- 不正glTF、外部buffer、geometry解析失敗、copy / hash不一致ではAssetManifestとシーンを変更しない。読み込む Queueまたは新規作成へ戻す。OpenBrush判定だけを理由に不完全な素材をcommitしない。
- brush libraryのnetwork / CORS / シェーダー load失敗は3Dモデル表示のerrorへ閉じ込める。Editor全体、他オブジェクト、保存済み元データを失わない。再試行と同じモデルの設定への復帰を保つ。
- マテリアルの元データ 3Dモデル、代表ノード、brush resourceを解決できない場合は固定画像を成功表示しない。マテリアル preview内へ原因と再試行を残す。
- stagingへのthree-icosa installが失敗した場合はcheck / uploadへ進まない。authoring projectを保持したまま公開modalに失敗理由を示す。

### 戻り先

- 読み込む成功後は新3Dモデルの素材を選択する。OpenBrush情報とslotを確認できる。シーンへ配置した後は同じオブジェクトを選択する。通常の位置・回転・大きさ、衝突判定、プレハブ、元に戻す / やり直すを使う。
- Starter作成後はOpenBrush 3Dモデルが見えるシーンを開く。Blankへ戻って作り直す場合も、失敗projectを成功一覧へ残さない。

完了条件: OpenBrush / Tilt Brush形式のglTFを通常の3Dモデルの素材として取り込む。three-icosaの専用シェーダーでシーンと生成ワールドを再現する。OpenBrush sampleは外部リソースのOpen Brush providerから追加する。Apache-2.0 licenseを検証付きで保存できる。

<a id="f-21"></a>

## F-21 外部リソースStoreと環境テクスチャの状態設計

### 操作前

- 素材 headerの「外部から追加」から開始する。左sidebarに登録済みproviderを表示する。providerを選ぶと中央のcatalogと提供元creditを切り替える。選択中providerと対応種別が最初から分かるようにする。Poly Havenでは空の背景 / HDRI、マテリアル / テクスチャ、3Dモデルをinstall可能にする。ambientCGでは空の背景 / HDRIとマテリアル / テクスチャをinstall可能にする。ambientCGの3Dモデルは非glTF形式のため一覧表示に留める。Open BrushはPoly Havenの下位filterにしない。sidebarの同じ階層へ置く。XRift Studioで検証済みの48 マテリアルを名前、カテゴリ、tagから選べるようにする。
- 各素材にはthumbnail、説明、作者、license、配布ページ、解像度、HDR / EXR形式、download容量を表示する。project未保存、動作確認中、別素材処理中は理由を示してinstallを無効にする。ローカルの`.hdr` / `.exr`も通常の読み込む入口から選べることをfile pickerに示す。
- Open Brushの一覧と右詳細は、固定`all_brushes.glb`の各代表stroke ノードをthree-icosaで事前描画した保存済みWebPを共有する。全48件をGUID単位で保存する。Storeを開くだけではCanvasを作らない。右詳細にはbrush GUID、renderer version、catalog revisionと、stroke向けマテリアルである互換性説明を置く。解像度、file形式、download容量は表示しない。
- XRift公式コンポーネントは同じprovider sidebarに置く。公開package version、公式元データ、コンポーネント名、categoryを表示する。全配置可能コンポーネントはpackage本体を事前描画したversion付き保存済みWebPを一覧と詳細で共有する。選択中コンポーネントだけを一件のシーン historyとして追加する。

### 操作中

- catalogとfile情報はXRift Studio固有のUser-Agentで取得する。install要求に任意URLを含めない。provider ID、素材 ID、解像度からnative側でfile情報を再取得する。許可したHTTPS domainだけをproject管理下へ保存する。
- マテリアルはbase color、normal、ARMをテクスチャにする。それらを参照するマテリアルを一つ作る。ambientCGでは色とNormalGLをテクスチャとして保存する。HDRIは選択したHDRまたはEXRだけを取得する。形式とequirectangular用途を保持したテクスチャにする。3DモデルはPoly Haven APIのglTF bundleを取得する。glTF 2.x、依存URI、安全な相対path、許可domain、容量を検証する。buffer / imageをdata URIへ埋め込んだ自己完結glTFにする。ambientCGの3DモデルはOBJなどの非glTF形式のためinstallを開始しない。ローカル読み込むでもHDR / EXRのシグネチャを検証する。HTML fallbackなど不正な内容はcommitしない。download中はdialogを閉じる操作と二重実行を止める。
- Open Brushは任意URLやGLSLをrequestへ含めない。provider ID、brush GUID、固定catalog revisionをprovider側で照合する。追加中は主操作を「追加中」にする。provider切替、マテリアル切替、dialogを閉じる操作、二重実行を止める。一件のhistory transactionでOpenBrush マテリアルを作る。途中失敗ではAssetManifestを変更しない。
- 環境テクスチャの保存後はHDR / EXRを一時WebGL rendererでtone mapする。`assets/.derived/thumbnails/`へ一覧用PNGを保存する。thumbnailが未生成、stale、旧renderer版、または上下を反転する変更後ならproject open時に自動再生成する。生成後はcardと設定を同じ画像へ更新する。

### 成功時

- installしたマテリアル、環境テクスチャ、3Dモデルを素材で選択する。provider、作者、license、配布ページを素材に保持する。3Dモデルは通常の3Dモデルの素材と同じ配置導線を使う。外部取得だけを理由にシーンへ自動配置しない。HDRIで「インストール後に空の背景へ設定」が有効なら、同じhistoryでシーン settingsへ参照を設定する。ローカルHDR / EXRのimport成功時も作成したテクスチャを選択する。同じhistoryでシーン settingsへ設定する。
- Open Brushは`External/Open Brush` folderへbrush name、GUID、renderer version、元データ material index、attributionを持つマテリアルを追加する。シーンやメッシュへは自動割当しない。新マテリアルを`assetSelection`にする。同じGUIDとrenderer versionが既にあれば複製しない。既存マテリアルを選択する。成功面は「素材で開く」と「続けて追加」を残す。
- 環境テクスチャをシーンまたはシーン settingsのここに移動領域へdragすると、オブジェクトを作らない。シーン全体の背景とIBLを既定で有効にする。以後はシーン settingsで片方だけを無効にできる。上下を反転するはテクスチャ設定、回転・露出・追加反転はシーン settingsから続けて調整できる。

### 失敗時

- catalog取得の失敗では選択中providerと検索条件を保つ。同じsidebarと一覧領域から再試行できる。file情報、download、保存、素材作成の失敗では既存AssetManifestとシーンを変更しない。同じprovider、素材、解像度、HDR / EXR形式を保持し、原因を見て再試行できる。
- providerが未対応、file domainが許可外、保存先に異なる内容がある、HDRI、必須base color、glTF本体、またはglTF依存fileがない場合はinstallを完了扱いにしない。
- Open Brushの保存済みthumbnailが欠落または破損している場合はinstall失敗と分ける。同じカード内にbrush iconと「プレビュー unavailable」を即時表示する。「準備中」を継続表示しない。マテリアル追加自体は固定catalogのGUID検証で判定する。GUID不一致、未対応プリセット、renderer version不一致では追加を完了扱いにしない。同じマテリアル選択から再試行できる。

### 戻り先

- dialogを閉じると同じビジュアルエディター、シーン、選択、cameraへ戻る。成功後は選択済み素材の設定へ到達する。空の背景はシーンへのdragまたはシーン settingsから変更できる。
- Open Brush追加後の「素材で開く」はdialogを閉じる。選択済みマテリアルの実previewとattributionを表示する。取消では追加前の素材 selectionを復元する。
- provider を追加する場合も共通catalog、download option、attribution、install resultを再利用する。素材側にprovider固有の保存構造やlicense文言を散在させない。

完了条件: 素材から提供元、作者、license、HDR / EXR形式を確認して外部マテリアル、テクスチャ、HDRI、3Dモデル、XRift公式コンポーネントを追加する。Poly Haven 3Dモデルは依存fileを検証した自己完結glTF 素材として保存する。ambientCGは公式v3 APIのdownload ZIPから色 / NormalGLまたはEXRを検証して保存する。UIとMCPのどちらからも同じinstall境界を使う。ambientCGの3DモデルはOBJなどの非glTF形式のためcatalog表示に留める。インストール可能に見せない。Open BrushはPoly Havenと同列のproviderから検証済みbrushを実stroke previewで選ぶ。GUIDとrenderer versionを保持したマテリアルとして追加できる。XRift公式コンポーネントも同列のproviderから公開package本体のpreviewを確認してシーンへ追加できる。ローカルまたは外部のHDR / EXRはequirectangular用途のテクスチャになる。上下を反転するなどを編集する。import / install直後またはシーンへのdragでシーン全体へ設定できる。provider境界はUIと保存形式から分離する。追加ストアへ拡張できる。

<a id="f-23"></a>

## F-23 公式XRiftのコンポーネントカタログとコード編集 / TSX変換の状態設計

### 操作前

- 公式カタログは素材の「外部から追加」で「ワールド機能」区分の「XRift公式コンポーネント」providerから開く。project kindで配置可能なコンポーネントを全件表示し、各カードにコンポーネント名、category、package本体を事前描画した保存済みthumbnailを置く。一覧と詳細を開くだけではWebGL Contextを作らない。`DevEnvironment`はシーンコンポーネントではなくdev 開始ファイル用wrapperとして別注記する。
- 選択中コンポーネントには公開package version、公式元データ、実際に生成するnamed importとJSX sampleを表示する。
- 右上の「読み込む」には3Dモデル / 3D 素材とR3F / コード編集変換を置く。R3F / コード編集変換には貼り付け欄、「コード編集プロジェクトを選択」、HTTPS / git SSHのリポジトリのURL入力を並べ、folder / repository読込がデスクトップ機能であること、選択後のpackage名、開始ファイル、pathまたはURL、読み込んだmodule数を表示する。確定前にシーンへ追加するオブジェクト、3Dモデル、テクスチャ、音声、空の背景、Custom マテリアル、衝突判定部位と診断をreviewする。コード編集素材はこのreviewへ入る時点で書き込みなしの通常読み込む transactionまで準備し、原本容量、テクスチャ解像度とRGBA / mipmap展開量、3Dモデル原寸、3Dモデル import scale、親を含む配置大きさ、配置後寸法、中心補正、反転、同大きさで復元するnamed 衝突判定を表示する。この段階ではシーン、AssetManifest、project fileを変更しない。

### 処理中

- 公式sampleまたは貼り付けTSXをJavaScriptとして実行しない。import alias、JSX tag、string / boolean / number / array / object literal、`Math.PI`を含む有限な数式だけを解析する。
- Drei primitiveはStudio primitiveとマテリアルへ、R3F ライトはライトへ、Rapier RigidBodyは親オブジェクトの独立した物理挙動コンポーネントへ、`Billboard`は`BillboardY`へ、`Reflector`は`Mirror`へ、`Sky` / `Environment`は`Skybox`へ変換する。RigidBodyの`fixed` / `dynamic` / `kinematicPosition` / `kinematicVelocity`、一般設定、`colliders`生成方式を保持する。親原点へ仮直方体の衝突判定を作らない。動的callbackと未対応コンポーネントだけを診断へ残す。
- コード編集 folderまたは浅くcloneしたRepositoryは`package.json`、`xrift.json`、`src/World.tsx`または`src/Item.tsx`を検査する。file数、総容量、symlinkをnative境界で制限する。`src`内のTypeScript / JavaScript moduleを上限付きで読む。開始ファイルからrelative importを再帰的に解決する。local コンポーネントはinstance境界をオブジェクトとして保持する。静的に見つかるreturn JSXをその子へ展開する。参照されるlocal 3Dモデル、テクスチャ、MP3 / WAVは`baseUrl`、先頭`/`、`public/`を同じproject-relative pathへ正規化して重複を除く。通常の素材 transactionへ接続する。リポジトリのURLでは浅いcloneのworking tree全体から解決する。宣言pathが欠けていても`public`内で同名fileが一意なら復旧する。sphere / BackSideの背景画像は有限半径のメッシュではなく無限遠projectionのシーン空の背景へ変換する。`new Audio`のloop音源は音源として復元する。任意のcustom code、Hook、callback、条件分岐、動的collectionを実行しない。
- `THREE.ShaderMaterial`はvertex / fragment GLSL、literal uniform、テクスチャ sampler、メッシュ名に対するdefine variantだけを宣言的なCustom マテリアルへ保存する。元3Dモデルのマテリアル枠へ適用する。シーン、動作確認、コード編集 JSX compilerで同じシェーダーと時間uniformを使う。OBJ内で明示的に選ばれた衝突判定メッシュ名はnamed submeshとして復元する。元の非表示衝突判定 groupをモデル全体の代替Boxへ変換しない。
- `group`、RigidBody、Drei / XRift wrapperを独立オブジェクトとして残す。local 位置・回転・大きさと親子順を維持する。定数参照を含むlocal コンポーネントの大きさと位置を静的に復元する。3Dモデル import scale、中心offset、X反転を同じ単位系で合成する。named OBJ 衝突判定はroot 3Dモデル描画を通らないため3Dモデル import scaleを衝突判定オブジェクト自身へ適用する。可視3Dモデル、衝突判定、physics形状の寸法を一致させる。RigidBody オブジェクトは次のネストしたRigidBody境界までの子孫メッシュ / 衝突判定を一つのBodyとして所有する。対応するleaf 形状、ライト、衝突判定、公式コンポーネントはその境界の子またはコンポーネントとして変換する。
- シーン、AssetManifest、selectionは「追加」を確定するまで変更しない。

### 成功時

- 追加オブジェクト、必要な3Dモデル / テクスチャ / 音声 / マテリアル、空の背景、ライト、衝突判定、公式XRiftのコンポーネントを一つの元に戻す履歴へ確定し、最後のオブジェクトを選択して設定で編集できる。「インポート後、そのまま動作確認で確認」が有効なら、確定したシーン / 素材の分離コピーで直ちに動作確認を開始する。
- compilerは`@xrift/world-components`から公式名をimportする。移動先への入口など実行時Contextが必要なコンポーネントは編集と動作確認でも公式本体を描画し、外部通信や遷移だけをStudio Provider bridgeで止め、生成結果では公式実行環境を使用する。

### 失敗時

- folder取消は入力を変えない。package / xrift manifestまたは同種開始ファイルの欠落、JSXなし、対応要素なし、project kind不一致、オブジェクト / マテリアル / コンポーネント作成失敗では追加を成功表示しない。個別素材の欠落、未対応形式、変換失敗は対象pathをwarningとして残し、その素材だけをスキップして読み込めるシーンと素材を一つの履歴へ確定する。
- 入力コードと元データ module path／行番号付き診断をdialogに保持し、literalへの修正、未対応要素の除去、別コンポーネントの選択へ戻れる。

### 戻り先

- キャンセルとEscapeはシーンを変更せず同じEditorへ戻る。
- 成功後はシーン、オブジェクト一覧、右設定が追加オブジェクトへ同期し、元に戻すで追加前の両selectionとdocument setへ戻れる。

完了条件: 外部リソースで公開package versionと公式元データを確認しながら、配置可能な公式コンポーネントを全件サムネイル付きで選べる。右上読み込むからDrei / React Three Fiberの標準primitiveとライト、Rapier RigidBody、公式XRift JSXを安全なシーン dataへ変換する。既存コード編集は検査済み開始ファイルを同じ変換器へ渡す。未対応custom codeや素材を完全変換と誤表示しない。追加後のオブジェクトと設定へ到達できる。

<a id="f-24"></a>

## F-24 glTF マテリアル制御とBehavior連携の状態設計

### 操作前

- マテリアル設定の各テクスチャ slotはテクスチャ選択、UVセット、画像の繰り返しと補間参照、繰り返し / UV変換を同じ面に置く。繰り返しを隠れた詳細機能にせず、glTF既定値がずらす量 0、回転 0°、繰り返し 1であることを示す。
- Animation 設定は3Dモデルクリップ再生とマテリアル Animationを分け、マテリアル Animationはノードグラフ素材の`pointer/interpolate`を開く導線として表示する。独自タイムラインが存在するようには見せない。
- ノードグラフの`pointer/get`、`pointer/set`、`pointer/interpolate`は変更するマテリアルを選択可能にし、手書きJSON Pointerを前提にしない。設定前は対象マテリアルと項目が未選択であることを示す。

### 操作中

- テクスチャ slotのずらす量、繰り返し、回転、UVセット変更は`MaterialTextureInfo`へ保存し、compilerとRuntime manifest adapterで`KHR_texture_transform` semanticsを維持する。繰り返しが1以外で横方向の繰り返し / Tが繰り返すでなければ、マテリアル値を勝手に戻さずテクスチャ設定への修正案を表示する。
- マテリアル pointer プリセットは選択したマテリアルの安定順index、canonical pointer、KHR type index、`material` inline 接続口、設定または補間する`value` 接続口を一操作で更新する。テクスチャ transform プリセットは`KHR_texture_transform`のoffset、scale、rotationだけを対象にする。
- MCPは`get_material_asset`、`update_material_asset`、`set_material_texture_transform`、`configure_interactivity_material_pointer`を公開し、project ID、シーン ID、expected revision、編集 / 読み込む状態を通常操作と同じ境界で検査する。

### 成功時

- マテリアル変更は同じマテリアルを参照するシーン、thumbnail、Runtime manifestへ反映し、マテリアルを選択状態にする。Runtime loaderはテクスチャをマテリアルごとにcloneしてUV channel、offset、repeat、rotationを適用し、別マテリアルのテクスチャ stateを汚染しない。
- ノードグラフはcanonical `KHR_interactivity` JSONとして保存し、ノードの設定とMCP read結果にpointer、type、マテリアル indexを残す。Animation 設定から開いた場合も同じgraph editorとvalidationを使う。

### 失敗時

- テクスチャ未設定slot、存在しないマテリアル、非pointer ノード、不明プリセット、不正vector、動作確認 / 読み込む中、stale revisionではAssetManifest、ノードグラフ素材、historyを変更しない。MCPは原因codeと対象IDを返す。
- Runtimeでテクスチャを読み込めない場合はマテリアル全体を消さず、該当mapのdiagnosticを残してfactor値による表示を継続する。

### 戻り先

- マテリアル編集後は同じ素材設定、Animationからgraphを開いた後は同じノードグラフ素材へ戻れる。シーン selectionは維持し、素材 tabを閉じると元のオブジェクト設定へ戻る。
- オブジェクトから開いた素材設定は、見出し下のパンくずに「<オブジェクト名>へ戻る」ボタンと現在の素材の名前を表示する。押すと同じオブジェクト設定へ戻り、選択は変えない。
- マテリアル / graph変更の取消は通常の元に戻すを使い、MCP変更も同じhistoryとAutosaveから復元する。

完了条件: マテリアルテクスチャの繰り返し、ずらす量、回転、UVセットをglTF互換値として編集する。MCP、Animation導線、KHR_interactivity pointer ノードから同じマテリアル設定へ到達できる。Runtime manifestでもテクスチャ transformと繰り返す samplerを維持する。

<a id="f-29"></a>

## F-29 カスタムシェーダー authoringとマテリアル適用の状態設計

参照: MI-03, MI-05, MI-09, MI-15, MI-16, MI-19, MI-25, MI-48

### 水面シェーダーカタログ

- 操作前: 素材 → 外部から追加 → 水面シェーダーで21種類を検索・分類し、一覧の実描画静止画と選択中の詳細アニメーションで比較する。調整は「波・さざ波」「反射・透明感」「泡」「演出」「色」にまとめる。
- 処理中（MI-03）: マテリアル追加中は検索、カテゴリ、選択、パラメータ編集と再追加を無効にする。詳細の試し風はシーンを変更しない。
- 成功時（MI-05）: 追加・更新したマテリアル名と割り当て方法をパネルに残し、素材のマテリアルから設定へ進める。既存マテリアルの更新は同じプリセットを追加し直した場合に限る。
- 失敗時・戻り先（MI-09）: 選択と値を保ってエラーを表示し、同じ追加操作を再試行できる。検索0件は空状態を表示し、条件の解除で一覧に戻る。
- 一覧は共有レンダラーの静止画、詳細だけは動画にする。非表示・一時停止・動きを減らす設定ではアニメーションを止める。既存の`list_material_presets`と`create_material_from_preset`で全種類とパラメータを扱う。

### 操作前

- マテリアル設定に「カスタムシェーダーを作成」を置き、標準PBR マテリアルから切り替えるとstarter GLSL、uniform、default variantを同じマテリアルへ作成する。作成だけではシーンのbindingを変えず、マテリアルを選択した状態を保つ。
- カスタムシェーダーはマテリアル内の編集可能なシェーダー契約として、vertex / fragment GLSL、uniform値、variant、時間uniformを持つ。既存の3Dモデル由来シェーダーを直接壊さず、マテリアル単位のcopyとして編集する。
- MCPは`create_custom_shader`、`get_custom_shader`、`update_custom_shader`を公開し、`get_editor_context`のproject ID、シーン ID、revisionを要求する。既存マテリアルへの設定と新規マテリアル作成は同じAssetManifest境界へ入る。

### 処理中

- GLSL 元データ、uniform、variantの編集中はマテリアルのassetSelectionと参照オブジェクトを維持し、連続入力を一つの素材更新へまとめる。処理中の保存・MCP更新は同じrevisionを消費し、古いMCP requestは`STALE_REVISION`で止める。
- シーンではカスタムシェーダーを実際のShaderMaterialとしてメッシュへ適用し、primitiveと3Dモデルのマテリアル枠で同じuniform・attribute・時間uniform契約を使う。テクスチャ uniformは明示されたテクスチャだけを読み込む。
- MCP updateは`void main()`、uniform型、variant、元データ長を検証してからcommitする。設定の途中入力は診断対象として保持し、compile / 動作確認ではそのマテリアルだけをPBR fallbackまたはblocking diagnosticへ分離する。

### 成功時

- マテリアル設定にカスタムシェーダー preview、GLSL、uniform、variant情報を残し、同じマテリアルを参照する全メッシュと生成ワールドへ反映する。必要なら既存の`set_material`で任意のオブジェクト slotへ割り当てられる。
- GLSLはマテリアル内の短い編集だけに閉じず、`.glsl` / `.vert` / `.frag` / `.vs` / `.fs`を通常の素材読み込むからシェーダー素材として登録できる。素材のダブルクリックとマテリアル設定の「編集」はスクリプトと同じドック型Editorを開き、頂点シェーダー / フラグメントシェーダーごとにマテリアル内コードまたはシェーダー素材を選択できる。
- MCPの作成・更新結果にはマテリアル ID、シェーダー内容、revisionAfterを返し、作成直後にマテリアル設定へ到達できる。元に戻す、Autosave、動作確認中の影響オブジェクト再同期は通常のマテリアル変更と同じにする。

### 失敗時

- シェーダー形式不正、必須`main`欠落、uniform テクスチャ欠落、variant不正、stale revision、動作確認 / 読み込む競合ではマテリアル、シーン binding、historyを部分更新しない。原因code、field、マテリアル IDをMCPと設定へ残す。
- WebGL compile failureはEditor全体を停止せず、該当マテリアルのpreviewへ原因とPBRへ戻す操作を示す。MCPの不正更新は前回の正常なマテリアルを維持する。

### 戻り先

- 成功後は同じマテリアル設定へ留まり、シーンで参照メッシュを確認できる。MCP作成後も`assetSelection`を新しいマテリアルへ更新する。
- 取消、PBRへ戻す、または失敗時の再試行では元のマテリアル、シーン selection、素材 selectionを維持し、通常の元に戻すでカスタムシェーダー設定前へ戻れる。

完了条件: マテリアル設定またはMCPからGLSL、uniform、variant、時間uniformを作成・編集する。同じマテリアルをメッシュの割り当て枠へ割り当てる。シーン、動作確認、生成ワールドへ反映できる。無効なシェーダーは診断とPBR復帰を残す。成功後は対象マテリアルへ戻れる。

<a id="f-30"></a>

## F-30 テクスチャから遠景 / 草カードを作成の状態設計

参照: MI-05, MI-09, MI-11, MI-15, MI-16, MI-25

### 操作前

- 通常の画像テクスチャの設定に、遠景の平面・180度カーブ・270度カーブと、草・花の1枚・クロスを用途と分割数付きで並べる。HDR / EXRの環境テクスチャには表示しない。
- 遠景の平面は遠方に置く20 × 11mの縦Plane、180度と270度は同じテクスチャをUV分割した7枚または10枚のPlaneでカーブ状にする。草クロスは足元の縦Planeを直交2枚にして、見る方向が変わっても薄く消えにくくする。どの形も衝突判定を作らず、テクスチャのalphaを`BLEND`、マテリアルを両面表示にする。

### 処理中

- マテリアルの作成とシーンオブジェクトの配置を同じhistory transactionへまとめる。曲面は分割ごとにUV範囲を持つマテリアルを作り、テクスチャを重複表示しない。テクスチャが見つからない、環境テクスチャである、またはマテリアル作成に失敗したときは、SceneDocumentとAssetManifestを変更しない。

### 成功時

- 新しいオブジェクトを選択し、シーン、オブジェクト一覧、オブジェクト設定を同期する。生成マテリアルは元テクスチャと同じfolderへ置き、メッシュの描画からいつでもマテリアル設定を開いて透明度、alpha mode、両面表示を調整できる。
- 同じ種類のカードは開始位置を少しずつずらし、完全に重なった状態で追加されないようにする。曲面は親オブジェクトを選択して、全パネルをまとめて移動、回転、拡大縮小できる。

### 失敗時

- 設定の文脈を失わず、テクスチャの状態を確認する案内を残す。動作確認中または読み込む中は作成せず、停止または完了後に同じテクスチャ設定から再試行できる。

### 戻り先

- 作成後は選択中のオブジェクト設定に留まり、位置・回転・大きさ編集またはマテリアル枠から見た目の調整へ進める。元に戻すでマテリアルとオブジェクトを同時に作成前の状態へ戻す。

完了条件: 通常のテクスチャから、alpha blend・両面マテリアルを持つ平面・180 / 270度カーブの遠景、1枚 / クロスの草カードを一件の元に戻す履歴で作成する。配置直後にシーンとオブジェクト設定で位置とマテリアルを調整できる。

<a id="f-36"></a>

## F-36 音声素材試聴の状態設計

参照: MI-03, MI-05, MI-09, MI-15, MI-20

### 操作前

- 音声素材を素材から選ぶと、右設定の「試聴」に再生コントロールを表示する。試聴は音源の作成、配置、loop設定、SceneDocumentを変更しない。

### 処理中

- 管理済みのプロジェクト音源を読み込み中は「再生用の音源を読み込んでいます」と表示し、二重の再生操作を示さない。

### 成功時

- 読み込み後は標準の再生・停止・シーク操作を使え、音声素材の名前、形式、容量と同じ設定文脈を維持する。

### 失敗時

- ファイルが欠落、未保存、または読込に失敗した場合は再生可能であるように見せず、素材の保存先確認と再取込を案内する。素材と選択状態は維持する。

### 戻り先

- 試聴の終了後も同じ音声素材設定に留まり、音源への配置は既存の配置操作から続けられる。

完了条件: 音声素材の設定から音源を試聴できる。SceneDocumentと音源の配置を変更しない。

<a id="f-37"></a>

## F-37 テクスチャ解像度変更・圧縮の適用の状態設計

参照: MI-03, MI-05, MI-09, MI-15, MI-16, MI-25, MI-67

### 編集負荷の調整と再変換

- MI-03 / MI-05 / MI-67: 複数テクスチャの最大解像度・形式を共通指定し、実行前に各画像の対象／変更不要／非対応理由を表示する。変換中は設定と実行を無効化し、失敗時は元の参照を保って同じ選択から再試行する。
- 変換済み画像は保持してある原画像から再変換できる。現在使用中の画像と変換元を区別し、KTX2自体を再圧縮できるようには見せない。
- インポートの最大解像度は編集用の画像にも適用する。元ファイルは残し、再インポートでは保護された個別設定を優先する。
- シーンに描画解像度50%・25%の編集用品質を追加する。動作確認と公開物には適用しない。

### 操作前

- テクスチャ設定の最大解像度と圧縮（方式・Quality）は設定として保持されるだけで、原本の画像ファイルは変わらない。公開時には F-40 の変換が同じ設定を自動で適用するため、この操作はEditorの表示と原本そのものを軽くしたいときに使う。「画像の書き出し」に現在の解像度・形式・容量と、変換後の解像度・形式・Qualityを並べて示す。
- 設定が原本と一致していて変換するものがない場合は、その理由を示して実行操作を無効にする。環境テクスチャ（HDRI）、KTX2やSVGなど書き戻せない形式、外部・組み込み元データ、解析結果のない素材は、実行操作を出さずに対応していない理由を示す。
- 未反映の設定があるときは、公開結果には自動で反映されること、この操作はEditorの表示も変換後にすること、書き出しても元の画像fileは残ることを操作の前に示す。
- 動作確認中と、素材のインポート・3Dモデル再インポート・別テクスチャの変換中は実行できない。理由と、停止または完了後に同じ設定から実行できることを示す。

### 処理中

- ボタンを「変換中」にして無効化し、同じテクスチャの設定変更も止める。読み込み・変換・保存の段階を文言で示し、二重実行を示さない。
- 書き出しは`assets/.optimized/`へハッシュ名の新しいfileとして保存し、元の原本を上書きしない。保存に失敗した場合はAssetManifestを変更せず、表示中のテクスチャも壊さない。

### 成功時

- 変換後の解像度、形式、変換前後の容量を設定に残し、通知にも同じ内容を出す。素材の元データと読み込む metadataを書き出したfileへ切り替える。保存上は未反映設定をリセットするが、設定・一括編集は保持した適用済み設定を表示・編集の基準にする。既存Optimize結果も実際の形式と寸法から補い、KTX2が意図せずJPEGへ戻らないようにする。
- 一件の元に戻す履歴として確定し、自動保存へ引き継ぐ。生成済みthumbnailはstaleにして再生成の対象にする。元に戻すで変換前の素材へ戻る。

### 失敗時

- 失敗理由を設定と通知の両方に残し、元の原本と設定を保持する。変換中に同じテクスチャの設定が変わった場合は、書き出した画像を採用せず取り消したことを示す。
- 未保存のプロジェクトでは実行せず、初回の自動保存後に実行できることを示す。

### 戻り先

- 成功・失敗のいずれでも同じテクスチャ設定に留まり、設定を変えて再実行するか、Upload reviewの容量見積もりへ進める。Upload reviewの一括最適化と同じ変換結果の保存先を使う。書き出さずに公開へ進んだ場合は F-40 の公開時変換が同じ設定を適用する。

完了条件: テクスチャ設定の最大解像度・圧縮設定を、その場で原本の画像ファイルへ書き出せる。変換前後の解像度、形式、容量を同じ場所で見比べる。未反映のまま公開されない状態にする。環境テクスチャや書き戻せない形式は理由を示して実行させない。

<a id="f-40"></a>

## F-40 公開時のテクスチャ変換と取り込み時の最大解像度の状態設計

参照: MI-03, MI-05, MI-09, MI-15, MI-16, MI-25, MI-67

### 操作前

- テクスチャ読み込み設定（最大解像度・2のべき乗・圧縮）が原本へ未反映であることは、公開を止める理由にしない。制作データの原本はそのまま残し、公開・アップロード・コード編集書き出しが配る画像だけを設定どおりに作り直す。Upload reviewは「原本へ未反映です」という診断を出さず、「テクスチャ N枚を公開用に変換します」と、変換前後の解像度・形式の内訳を示す。
- 原本の形式が解像度変更・圧縮に対応していない場合（SVG、KTX2）は、公開を止めずに原本のまま配ることと、軽くしたい場合の読み込み直しを同じカードに示す。環境テクスチャ（HDRI）へ設定が効かないことはテクスチャ設定が説明するので、公開前には繰り返さない。
- 歯車から開く設定パネルに「取り込むテクスチャのサイズと圧縮」を置く。読み込むメニューでは設定しない。未設定時は最大1024px・KTX2圧縮とし、シーンへ配置する前に変換を完了する。保存済みの設定とMCPで明示したテクスチャ設定は優先する。単体・モデル内蔵の対応画像に同じ上限で編集用画像を生成し、元ファイルを保持する。選択した既定値はEditor Stateとしてブラウザに残る。モデル再インポートにも適用し、個別に保護した設定を優先する。

### 処理中

- 公開の変換は、staging・アップロードバンドル・コード編集書き出しのいずれでも同じ計算とエンコード経路を通る。経路によって配られる画像が変わらない。
- 変換中は公開の進行表示に「テクスチャを公開用に変換しています」と、何枚目かと「制作データの原本はそのまま残ります」を示す。この段階は安全に取り消せる。
- 取り込み時の最大解像度で必要な画像を順番に変換する。KTX2圧縮は専用Workerで1枚ずつ実行し、画面スレッドを占有しない。完了・失敗時にWorkerを終了して圧縮用メモリを解放する。120秒で完了しない場合も終了し、最大解像度を下げるかWEBPで再試行する案内を出す。変換に失敗した場合は新しいManifestを採用せず元の参照を保持する。glTFのsampler由来の設定は取り込みの既定より優先する。HDRI・SVG・元画像を保持していないKTX2は変換しない。

### 成功時

- 公開されたテクスチャは設定どおりの解像度・形式になり、コピー先のファイル名も変換後の拡張子で決まる。KTX2へ変換したテクスチャは、生成コードとRuntime manifestでもKTX2として読み込まれる。
- 制作データのファイルは読むだけで、書き換えない。Editorの表示は原本のままなので、後から解像度を上げ直せる。
- 容量の見積もりでは、未反映の設定があるテクスチャの配信容量は「公開時に変換するため実際はこれより小さくなる」ことを示す。

### 失敗時

- 変換に失敗した場合は、どのテクスチャで失敗したかを添えて公開を止める。制作データは変更しない。
- 設定を反映できない原本は、公開を止めずに警告だけを残し、原本のまま出力する。診断を黙って消さない。

### 戻り先

- 公開後も読み込み設定はそのまま残るので、解像度や圧縮を変えて公開し直せる。Editorの表示と原本そのものを軽くしたいときは、同じ設定のまま F-37 の「この設定で画像を書き出す」へ進める。

完了条件: 制作データの原本を書き換えない。公開・アップロード・コード編集書き出しが配る画像だけを読み込み設定どおりに変換する。取り込み時の最大解像度は編集用画像の生成に使う。元ファイルを保持する。

<a id="f-43"></a>

## F-43 しかけ付き3Dセット（チュートリアル）の状態設計

参照: MI-03, MI-04, MI-05, MI-09, MI-11

### 操作前

- 「外部から追加 > ギミック」に操作付きセットを配布する。家具や装飾は「3Dセット」、glTFの表現見本は「特殊マテリアル > glTFマテリアル」、発光は「特殊マテリアル > Emissive」に分ける。分類を切り替えると検索・選択・結果表示を初期化し、対象の候補だけを表示する（MI-04）。配置前の詳細、追加中の無効化、成功後の選択、失敗時の再試行は共通の導線を使う。
- 詳細ペインには、中身 (形状・音・しかけの本数)、「動き」(押したら何が起きるかを1行ずつ)、「このセットで分かること」(目的と手順) を、配置する前に読める位置へ置く。
- 音を含むセットは、追加で音声素材がプロジェクトへ入ることを中身の一覧で先に示す。

### 処理中

- 追加ボタンは「追加中」に変わり、無効化する (MI-03)。音のimportと素材 commitが終わるまで完了にしない。

### 成功時

- シーンへ配置し、追加した素材の件数を示す (MI-05)。配置したオブジェクトを選択状態にし、オブジェクト一覧から中身を1つずつ編集できる状態にする。
- 手順を持つセットでは、棚を閉じない。手順はこのパネルにしかないので、閉じると次にすることが画面から消える。代わりに「この画面を閉じて動作確認を開始してください」と、次の一手を示す。
- 手順を持たないセットでは、これまでどおり棚を閉じ、通知で編集方法を示す。

### 失敗時

- 動作確認中、import中、未保存のプロジェクトでは、追加前に理由を示して止める (MI-09)。
- 音のimportやグラフの生成に失敗した場合は、途中まで配置したオブジェクトを残さない。シーンもAssetManifestも変えず、同じボタンから再試行できる。

### 戻り先

- 棚を閉じると、配置したオブジェクトを選択したEditorへ戻る。元に戻す一回でオブジェクトと、そのセットが作ったパーティクル / ノードグラフ素材がまとめて消える。
- 置いたあとはただのオブジェクトとコンポーネントなので、戻り先はいつもの設定とNode Editorになる。

### F-43 モデル更新版のプレビュー補足（2026-09-07）

参照: MI-03, MI-09。追加ボタンや戻り先は変更しません。カードは同じレシピを描画し、GLBの読み込みが終わってから静止画を保存します。モデルの読み込みに失敗した場合は、モデルを欠いた画像を完成状態として保存せず、失敗と確認先を表示します。タイムアウト時も失敗として表示し、一覧を開き直して再確認できます。詳細を閉じた後の読み込み完了も含め、プレビュー専用リソースを解放します。新しいUI操作やMCP操作は追加していません。

噴水の詳細には、水面・水筋が静的モデルで、中央の飛沫だけが動くことを配置前に示します。既存ワールドへ取り込み済みの素材は自動上書きしません。ブラウザの実描画で読み込み待ち・失敗・ジオメトリ解放を確認しました。Tauri実機とメモリ使用量の測定は未実施です。

### F-24 頂点カラーと不透明度マップ（2026-09-08）

参照: MI-03、MI-09。Diffuse（基本色）の「頂点カラーを使用」で、モデルに保存された色を基本色へ乗算する。色を持たないモデルの表示は変わらない。不透明度マップはR・G・B・Aのいずれかを選び、不透明度と基本色のテクスチャのAへ乗算する。初期値はA。マップを初めて指定した際、OpaqueならBlendへ切り替え、同じ変更として元に戻すできる。片面・両面は既存の裏面も表示するで選ぶ。

操作前は現在の選択を表示する。読み込み中・失敗は既存テクスチャスロットの表示を使い、成功時はプレビューとシーンへ反映する。読み込みに失敗した場合は同じスロットから選び直せる。変更後もマテリアルを選択したまま編集を続けられ、元に戻す・やり直す・保存・再読み込みで設定を保持する。Unity独自シェーダーを変換する操作ではなく、Studioの標準マテリアルの設定として扱う。MCPは既存のマテリアル更新操作へ同じプロパティを渡す。
