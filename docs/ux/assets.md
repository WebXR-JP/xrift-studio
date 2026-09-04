# 素材の取り込み・編集の操作・状態設計

[機能一覧へ戻る](../UX_INTERACTIONS.md) / [共通の動き](./interactions.md)

<a id="f-08"></a>

## F-08 Visual Asset authoring / import の状態設計

### 操作前

- Assets は左のfolder treeに実フォルダーの親子関係を常時表示する。右側に選択フォルダーの内容を出す。Model / GLTF、Texture、Material、Prefab、Particleの種類別collectionは実フォルダーと区別する。primitiveは別のCreate paletteに置く。Material / Model / Textureはreadyなgenerated thumbnailを使う。未生成時だけkind iconを使う。
- `sceneSelection` と `assetSelection` が独立する。右 Inspector がどちらの context を表示しているかを選択背景、header、pinned tab で示す。
- Import 前に対応形式を確認できる。HDR / EXRがSkyboxへ直ちに設定されること、source 保持、既定 max resolution / quality / mipmap / compression、resource budget、external URI が local dependency に限られることも確認できる。
- Model Inspectorはsourceとlast-good解析結果、Material slot、animation、bounds、現在のimport recipeを同時に示す。解析済みの値と次回再import用の設定を区別する。

### 操作中

- Material 作成は dialog 内の validation、Texture / Model / HDRI import は Import Queue の validate、copy、decode、derive、thumbnail、commit を表示する。cancel を処理中 stage に合わせる。
- MCP の `import_audio_asset` / `import_texture_asset` も Edit 中だけ通常Importと同じcontent-addressed copy、atomic commit、history、autosaveを通す。絶対 source path は trusted client input としてnative側で通常file、symlink / reparse pointなし、対応拡張子、128 MB上限、read前後size、AudioではMP3 / WAV signatureも検査する。応答には外部path、data URL、bytesを返さない。
- Particle は Assets の作成操作から追加する。右 Inspector で emission、shape、velocity、lifetime、size、color、texture、blend を編集する。Particle Asset は Scene View または Hierarchy へ drag して Particle Emitter Entity として配置できる。
- context menu は現在 kind / state で実行できる項目だけを有効にする。menu open だけでは selection や document を変えない。
- Modelのscale、collider生成、mesh最適化、animation importを変更した時はrecipeだけを未保存にする。再importが必要な項目をInspector内で示す。再import中も既存Scene参照とlast-good表示を消さない。

### 成功時

- Import / Material 作成は AssetManifest と folder membership を一度だけ確定する。新 Asset を `assetSelection` にする。HDR / EXR importだけは同じ履歴でScene settingsのSkybox参照も確定する。それ以外は`sceneSelection`とSceneDocumentを維持する。
- MCP Audio / Texture import は新Assetを`assetSelection`にする。同じkindとsource hashが登録済みなら複製しない。既存Assetを選択する。結果には管理下のproject-relative pathと形式metadataだけを残す。外部sourceを表示しない。
- Particle Asset の作成は新 Asset を `assetSelection` にする。Entity への配置または Particle Emitter の追加は参照する Asset ID を SceneDocument に保持する。
- thumbnail / derived は source / recipe / processor / target hash と一致した時だけ ready にする。同じ source を再 import しても Asset ID と参照を保つ。Material一覧は保存済み画像だけを表示する。変更時の生成queue以外ではWebGL contextを増やさない。
- Material の変更は共有 Asset に一度だけ保存する。同じ ID を参照する全 preview に反映する。
- Model再importはAsset IDを維持する。slot identityが一致する既存Material bindingを保持する。新規slotは未設定として追加する。消失slotは診断に残す。参照先の修正へ進める。

### 失敗時

- extension、URI、budget、decode、Material field、slot binding の失敗は Asset / field / source URI を project-relative に示す。reimport、設定変更、参照置換のいずれかへ案内する。
- MCP Texture import の相対 path、最終 symlink、未対応形式、署名不一致、stale revisionでは manifest と history を変えない。外部絶対 path を error detailsへ含めない。
- temporary data を回収する。Scene / Asset / folder documents、両 selection、history、source、last-good derived を開始前のままにする。同じ設定の自動 retry loop は行わない。
- Model metadataが非有限、bounds不正、slot重複、未対応external URIの場合は新しいmanifestを確定しない。last-good Model Assetと配置済みEntityを維持する。

### 戻り先

- Import Queue を閉じても Assets と右 Inspector に last result / diagnostic を残す。cancel は直前の `assetSelection`、Inspector context、Scene View へ戻る。
- Play 中は既存Material / Particle AssetのpropertyとMCP経由の既存Texture import settings変更を許可する。Texture sourceの新規importは停止まで無効にする。Stop 後はPlay中に保存した変更と現在のselectionsを維持する。

完了条件: Material / Texture / Model / GLTF / OBJ / VRM / Prefab / Particle を左のfolder tree、種類別collection、保存済みthumbnail付きで管理する。GLB / VRMの埋め込みMaterial / Textureを再利用可能なAssetへ展開する。Materialは変更時だけ一時rendererでthumbnailを更新する。card自体はWebGL contextを保持しない。HDR / EXRはequirectangular用途を持つTexture Assetとして取り込む。現在Sceneへ直ちに設定する。ソースから保存済みthumbnailを自動生成・再生成する。Texture Assetはcontext menuからproject thumbnailへ設定する。Scene Inspectorで実画像を確認できる。sourceを壊さずimport、右InspectorでFlip Yを含むrecipe編集、参照を保つreimport、stale診断を行える。配置したGLB / VRMはNode・Bone・Mesh単位で編集できる。Animation取り込みを有効にしたModelは配置時に再生設定へ到達できる。Asset編集中も`sceneSelection`は保持する。

<a id="f-15"></a>

## F-15 OBJ / VRM import と静的モデルポーズの状態設計

### 操作前

- Import入口にGLB / glTF / OBJ / VRMを同じModel形式として表示する。OBJは単体のgeometryを取り込む。外部MTL / textureは自動取得しない。必要なMaterialをXRift Studio内で割り当てることを示す。
- VRM 0.x / 1.xはModel Assetとして取り込む。humanoidを含むboneとshape keyを最後に正常解析したmetadataとして保持する。Timelineやclip編集は静的pose編集の対象外であることをUI上で区別する。
- 配置後はModel Entityの下にsourceのNode、Bone、Mesh、Skinned Meshを親子順で表示する。SkinはNodeごとに複製しない。親Model Entityの共有Rendererでbind poseとAnimationを維持する。
- poseとnode別Material bindingはModel Asset共通値ではなく配置EntityのMesh componentに属する。同じModelの別配置を変更しない。

### 操作中

- Import中は既存Import Queueで形式検証、source copy、parse、thumbnail、manifest commitを順に示す。二重Import / reimportを無効にする。
- HierarchyでBoneまたはNodeを選ぶと、そのlocal Transformを通常の数値入力とギズモで編集する。共有Modelのsource node poseへ即時反映する。従来のbone選択UIとshape keyの0..1 weightも同じ配置の静的poseとして維持する。
- Mesh / Skinned Mesh Nodeを選ぶと、そのsource nodeが使うMaterial slotだけを表示する。同じsource material indexを共有する別Nodeとは`sourceNodeIndex`で上書きを分離する。
- Hierarchyの目アイコンは共有ModelのNodeにも効く。enabledと同時に共有Meshのpose（`nodes[i].visible`）へ書く。そのNodeのサブツリーの描画をScene View・公開ワールド・Runtimeで一致して消す。DeleteはNodeをEntityとして削除しない。同じ非表示へ変換する。理由と再表示手段を通知する（MI-117）。
- pose変更は有効な有限値だけを確定する。Play中は読み取り専用にする。Asset reimport中はlast-good metadataと現在のEntity poseを表示したままにする。編集を止める。

### 成功時

- Import成功後は新Model Assetを選択する。形式、bone数、shape key数、source、thumbnailをInspectorに残す。「配置」でEntityを作成する。pose編集へ進める。
- Bone / Node Transform、node別Material、node別の表示 / 非表示、shape key weightは共有Mesh componentへ保存する。Undo / Redo、project再表示、Scene View、Classic JSX、Runtime manifestで同じ静的状態を復元する。旧版が保存した「無効なのに描画される」Node flagはprojectを開いた時に実態へそろえる。件数を通知する。
- 「ポーズをリセット」はboneとshape keyだけを初期値へ戻す。Entity Transform、Material binding、Collider、Model Assetを維持する。

### 失敗時

- 不正なOBJ / VRM、上限超過、読めないgeometry、VRM拡張解析失敗ではAssetManifestへcommitしない。Import Queueに形式と再選択の案内を残す。
- OBJの外部MTL / texture参照は自動取得しない。warningにする。Model自体は読める場合に限りcommitする。欠けた見た目はMaterial slotから修正できる。
- reimport後にpose対象のboneまたはshape keyが消えた場合は値を別対象へ移さない。残っている対象だけ適用する。Inspectorに未適用件数とリセットを示す。
- source Node解析またはSkin参照が壊れている場合は部分的なHierarchyを成功表示しない。last-good AssetとSceneを維持する。Import Queueから再試行できるようにする。

### 戻り先

- Import Queueを閉じても新Model Assetと診断をAssets / Model Inspectorに残す。Entityを選択すると直前のpose編集へ戻れる。
- pose編集後に別Entity / Assetを選んでも値を保持する。同じEntityへ戻ると保存済みposeを再表示する。Timeline追加時はこの静的poseを初期状態として扱える構造を維持する。

完了条件: OBJ / VRMをModel Assetとして配置できる。VRMのNode・Bone・Skinned MeshをHierarchyから選ぶ。配置EntityごとのTransform、node別Material、shape key weight、node別の表示 / 非表示とnode単位のCollider追加を保存する。再表示と生成結果で同じ静的状態を復元できる。

<a id="f-16"></a>

## F-16 UnityPackage / Scene / Prefab import の状態設計

### 操作前

- AssetsのImportとdropは`.unitypackage`、`.unity`、`.prefab`を既存Model / Textureと同じ入口で受け付ける。UnityPackageはSceneだけでなく依存Assetを含む入力として区別する。単体Scene / Prefabは外部GUID Assetを同時取得しない入力として区別する。
- 変換対象はGameObject階層、local Transform、GLB / glTF / OBJ / VRM、主要Texture、Unity Material、Mesh Renderer、Light、Audio Source設定、Collider、Fog / Ambient / Camera設定とする。FBXなど実行時Modelへ変換できないsourceも参照先と件数を診断する。
- MonoBehaviourのclass IDと件数はPrefab provenanceへ記録する。C#からJavaScriptへのコード変換は開始しない。

### 操作中

- Import Queueはreading、gzip / tar展開、`pathname`安全性検査、Unity YAML object / GUID参照解析、Asset derive、Scene再構築、Prefab生成、atomic commitを一つの進捗として表示する。処理中はModel reimportを含む別Asset mutationとPlayを無効にする。
- Unityの左手座標系はXRift / Three.jsの右手座標系へ変換する。positionのZとquaternionを対応させる。親参照の欠落とcycleはScene Rootへ安全に戻す。warningにする。
- 対応Asset sourceは既存のcontent-addressed保存とthumbnail生成を再利用する。同一SHAは既存Assetを選択する。同じbinaryを再コピーしない。Package内の全binary writeが揃うまでSceneDocument、AssetManifest、Prefab documentを画面へ反映しない。

### 成功時

- 変換したGameObject rootsを現在Sceneへ再構築する。Unity Scene / PrefabごとにPrefab documentとPrefab Assetを保存する。最後に作成または再利用したPrefabをAssetsで選択する。再構築したrootをHierarchy / Scene Viewで選択する。
- Activity drawerにPrefab、Entity、Asset、要確認の件数を残す。Prefabのimport metadataにはsource名、package内pathname、source SHA、Unity class ID件数、未対応class ID、C#変換を行っていない事実を保存する。

### 失敗時

- gzip / tar破損、安全でないpathname、展開上限超過、Unity YAML不正、変換対象なし、Asset commit失敗ではlast-good SceneDocument、AssetManifest、Prefab set、両selectionを維持する。
- 一部のAsset / Componentだけ未対応の場合は変換可能な階層を残す。FBX、外部glTF、Audio clip、MonoBehaviourなどの不足をwarningとしてActivity drawerから確認できる。黙って完全変換と表示しない。

### 戻り先

- 成功後は「アセットを表示」から生成Prefabへ移動する。Hierarchy / Scene Viewには再構築結果を残す。失敗後はActivity drawerを閉じても元Sceneを編集できる。同じまたは修正したpackageを再度dropできる。

完了条件: UnityPackageの論理pathnameとGUID参照を安全に復元する。対応Assetを抽出してScene階層を再構築する。再利用可能なXRift Prefabとして保存する。未対応Asset / Componentは黙って成功扱いしない。診断とprovenanceへ残す。C#変換を行わない。

<a id="f-18"></a>

## F-18 OpenBrush import / shader rendering の状態設計

### 操作前

- 新規Visual WorldはBlankとOpenBrushの2サンプルを表示する。OpenBrushは48種類のbrushを含むこと、three-icosaを使うこと、Editorに埋め込んだ固定brush resourceを使うことをカードとModel Inspectorで事前に示す。
- 通常のGLB / glTF import入口をそのまま使う。`GOOGLE_tilt_brush_material`、旧Tilt Brush exporter、OpenBrush material名を自動判定する。別形式の指定を要求しない。
- OpenBrush sourceに含まれるshaderを既定値とする。各brushを編集可能なAsset一覧へ出す時もStandard/PBRへ変換しない。three-icosa presetを参照する専用Materialとして展開する。通常のXRift Materialの割当は明示的なslot上書きとして扱う。

### 操作中

- Import Queueは既存のvalidate、copy、parse、thumbnail、commitを使う。OpenBrush exportに残る古い外部画像URLはimport解析時に取得しない。埋め込みplaceholderへ置換する。外部buffer参照は従来どおりblockする。
- OpenBrushのglTF nodeはsource GLBを複製しない。共有Model Assetと`sourceNodeIndex`を持つEntity hierarchyへ展開する。nodeの親子関係とlocal Transformを保持する。各Mesh Entityにはそのnodeが使用するbrush slotだけを表示する。
- Scene ViewはOpenBrush判定済みModelにだけthree-icosa loader extensionを登録する。通常のGLB / glTF、OBJ、VRMのloaderとMaterial挙動を変更しない。
- Custom Material Preview AdapterはMaterialのshader kind、source Model、source material indexから代表nodeを解決する。OpenBrush adapterは同じthree-icosa loaderを再利用する。Standard sphereへcustom shaderを貼らない。brush固有vertex attributeを持つ実ストロークgeometryで描画する。
- Custom Shader契約はMaterial内の編集可能なShader Asset copyとして、vertex / fragment GLSL、uniform型と設定状態、vertex attribute mappingを分離する。presetのGLSLを直接変更しない。Material copyだけを編集・resetできる。
- vertex GLSLの`in` / `attribute`宣言を解析する。`position`、`normal`、`color`、`uv`、`tangent`へsemantic mappingする。color / UV / tangentは安全な既定値を生成できる。Inspectorから任意のgeometry attribute名へ上書きできる。解決不能な必須attributeはPBR fallback理由として表示する。
- OpenBrush Materialも通常のMaterialと同じMesh Renderer slotへ割り当て可能とする。builtin primitiveでは元GLBに依存しない。brush preset、uniform、textureを独立ロードする。
- editor preview用の公式GLSL / brush textureはprojectへ固定snapshotとして埋め込む。network状態や外部CDN更新に依存せず解決する。安定版templateのresourceを優先する。three-icosa本体にだけ存在する追加resourceを補完する。
- three-icosaが知らないbrush preset、公開resourceがないpreset、GLSL / texture読込失敗は、該当primitiveだけGLTFLoaderが作成したPBR Materialを保持する。他のbrushを含むModel全体のimportを失敗させない。preview badgeとMaterial Inspectorへfallback種別・brush名・失敗理由を示す。
- 公開変換ではcompiler-owned stagingに固定versionのthree-icosaだけをallowlist付きで追加する。authoring projectのpackage manifestや任意pathへpackageを追加しない。

### 成功時

- Model InspectorにOpenBrush / three-icosa、brush数、exporter、renderer versionを残す。各OpenBrush Material Inspectorにはbrush名、GUID、source material indexを表示する。対応Materialを各Mesh Entityのslotへ初期設定する。通常のXRift Materialへ差し替えたslotだけScene Viewと生成結果でPBRへ置換する。
- Material Inspectorのリアルタイムpreviewは実際に適用されたMaterial type、GLSL source、uniform一覧、解決済みbrush textureを表示する。見た目と内部shaderの両方から初期割当を確認できる。
- OpenBrush Starterは検証済みGLBとApache-2.0 licenseをproject-relative pathへコピーする。48 brush MeshをGallery root配下の個別Entityとして展開したPrefabを一つの新規projectとして開く。Prefab Asset Inspectorは同じtreeを表示する。source Entityへ移動できる。
- Prefab source hierarchyを編集して「PrefabをUpdate」する。既存Prefab IDとsource Entity mappingを保ったままPrefab documentを再生成する。Undo / Redoと通常の保存対象にする。
- compiler outputはGLTFLoaderへthree-icosa extensionと固定brush base URLを登録し、一時stagingのruntime dependency planへ固定package specを記録する。

### 失敗時

- 不正glTF、外部buffer、geometry解析失敗、copy / hash不一致ではAssetManifestとSceneを変更しない。Import Queueまたは新規作成へ戻す。OpenBrush判定だけを理由に不完全なAssetをcommitしない。
- brush libraryのnetwork / CORS / shader load失敗はModel表示のerrorへ閉じ込める。Editor全体、他Entity、保存済みsourceを失わない。再試行と同じModel Inspectorへの復帰を保つ。
- Materialのsource Model、代表node、brush resourceを解決できない場合は固定画像を成功表示しない。Material preview内へ原因と再試行を残す。
- stagingへのthree-icosa installが失敗した場合はcheck / uploadへ進まない。authoring projectを保持したまま公開modalに失敗理由を示す。

### 戻り先

- Import成功後は新Model Assetを選択する。OpenBrush情報とslotを確認できる。Sceneへ配置した後は同じEntityを選択する。通常のTransform、Collider、Prefab、Undo / Redoを使う。
- Starter作成後はOpenBrush Modelが見えるScene Viewを開く。Blankへ戻って作り直す場合も、失敗projectを成功一覧へ残さない。

完了条件: OpenBrush / Tilt Brush形式のglTFを通常のModel Assetとして取り込む。three-icosaの専用shaderでScene Viewと生成Worldを再現する。OpenBrush sampleは外部リソースのOpen Brush providerから追加する。Apache-2.0 licenseを検証付きで保存できる。

<a id="f-21"></a>

## F-21 外部リソースStoreと環境Texture Assetの状態設計

### 操作前

- Assets headerの「外部から追加」から開始する。左sidebarに登録済みproviderを表示する。providerを選ぶと中央のcatalogと提供元creditを切り替える。選択中providerと対応種別が最初から分かるようにする。Poly HavenではSkybox / HDRI、Material / Texture、Modelをinstall可能にする。ambientCGではSkybox / HDRIとMaterial / Textureをinstall可能にする。ambientCGの3D Modelは非glTF形式のため一覧表示に留める。Open BrushはPoly Havenの下位filterにしない。sidebarの同じ階層へ置く。XRift Studioで検証済みの48 Materialを名前、カテゴリ、tagから選べるようにする。
- 各Assetにはthumbnail、説明、作者、license、配布ページ、解像度、HDR / EXR形式、download容量を表示する。project未保存、Play中、別Asset処理中は理由を示してinstallを無効にする。ローカルの`.hdr` / `.exr`も通常のImport入口から選べることをfile pickerに示す。
- Open Brushの一覧と右詳細は、固定`all_brushes.glb`の各代表stroke nodeをthree-icosaで事前描画した保存済みWebPを共有する。全48件をGUID単位で保存する。Storeを開くだけではCanvasを作らない。右詳細にはbrush GUID、renderer version、catalog revisionと、stroke向けMaterialである互換性説明を置く。解像度、file形式、download容量は表示しない。
- XRift公式Componentは同じprovider sidebarに置く。公開package version、公式source、Component名、categoryを表示する。全配置可能Componentはpackage本体を事前描画したversion付き保存済みWebPを一覧と詳細で共有する。選択中Componentだけを一件のScene historyとして追加する。

### 操作中

- catalogとfile情報はXRift Studio固有のUser-Agentで取得する。install要求に任意URLを含めない。provider ID、Asset ID、解像度からnative側でfile情報を再取得する。許可したHTTPS domainだけをproject管理下へ保存する。
- Materialはbase color、normal、ARMをTexture Assetにする。それらを参照するMaterial Assetを一つ作る。ambientCGではColorとNormalGLをTexture Assetとして保存する。HDRIは選択したHDRまたはEXRだけを取得する。形式とequirectangular用途を保持したTexture Assetにする。ModelはPoly Haven APIのglTF bundleを取得する。glTF 2.x、依存URI、安全な相対path、許可domain、容量を検証する。buffer / imageをdata URIへ埋め込んだ自己完結glTFにする。ambientCGのModelはOBJなどの非glTF形式のためinstallを開始しない。ローカルImportでもHDR / EXRのシグネチャを検証する。HTML fallbackなど不正な内容はcommitしない。download中はdialogを閉じる操作と二重実行を止める。
- Open Brushは任意URLやGLSLをrequestへ含めない。provider ID、brush GUID、固定catalog revisionをprovider側で照合する。追加中は主操作を「追加中」にする。provider切替、Material切替、dialogを閉じる操作、二重実行を止める。一件のhistory transactionでOpenBrush Material Assetを作る。途中失敗ではAssetManifestを変更しない。
- 環境Textureの保存後はHDR / EXRを一時WebGL rendererでtone mapする。`assets/.derived/thumbnails/`へ一覧用PNGを保存する。thumbnailが未生成、stale、旧renderer版、またはFlip Y変更後ならproject open時に自動再生成する。生成後はcardとInspectorを同じ画像へ更新する。

### 成功時

- installしたMaterial、環境Texture、ModelをAssetsで選択する。provider、作者、license、配布ページをAssetに保持する。Modelは通常のModel Assetと同じ配置導線を使う。外部取得だけを理由にSceneへ自動配置しない。HDRIで「インストール後にSkyboxへ設定」が有効なら、同じhistoryでScene settingsへ参照を設定する。ローカルHDR / EXRのimport成功時も作成したTexture Assetを選択する。同じhistoryでScene settingsへ設定する。
- Open Brushは`External/Open Brush` folderへbrush name、GUID、renderer version、source material index、attributionを持つMaterialを追加する。SceneやMeshへは自動割当しない。新Materialを`assetSelection`にする。同じGUIDとrenderer versionが既にあれば複製しない。既存Materialを選択する。成功面は「Assetsで開く」と「続けて追加」を残す。
- 環境Texture AssetをScene ViewまたはScene settingsのdrop領域へdragすると、Entityを作らない。シーン全体の背景とIBLを既定で有効にする。以後はScene settingsで片方だけを無効にできる。Flip YはTexture Inspector、回転・露出・追加反転はScene settingsから続けて調整できる。

### 失敗時

- catalog取得の失敗では選択中providerと検索条件を保つ。同じsidebarと一覧領域から再試行できる。file情報、download、保存、Asset作成の失敗では既存AssetManifestとSceneを変更しない。同じprovider、Asset、解像度、HDR / EXR形式を保持し、原因を見て再試行できる。
- providerが未対応、file domainが許可外、保存先に異なる内容がある、HDRI、必須base color、glTF本体、またはglTF依存fileがない場合はinstallを完了扱いにしない。
- Open Brushの保存済みthumbnailが欠落または破損している場合はinstall失敗と分ける。同じカード内にbrush iconと「Preview unavailable」を即時表示する。「準備中」を継続表示しない。Material追加自体は固定catalogのGUID検証で判定する。GUID不一致、未対応preset、renderer version不一致では追加を完了扱いにしない。同じMaterial選択から再試行できる。

### 戻り先

- dialogを閉じると同じVisual Editor、Scene、選択、cameraへ戻る。成功後は選択済みAssetのInspectorへ到達する。SkyboxはScene ViewへのdragまたはScene settingsから変更できる。
- Open Brush追加後の「Assetsで開く」はdialogを閉じる。選択済みMaterialの実previewとattributionを表示する。取消では追加前のAsset selectionを復元する。
- provider を追加する場合も共通catalog、download option、attribution、install resultを再利用する。Assets側にprovider固有の保存構造やlicense文言を散在させない。

完了条件: Assetsから提供元、作者、license、HDR / EXR形式を確認して外部Material、Texture、HDRI、Model、XRift公式Componentを追加する。Poly Haven Modelは依存fileを検証した自己完結glTF Assetとして保存する。ambientCGは公式v3 APIのdownload ZIPからColor / NormalGLまたはEXRを検証して保存する。UIとMCPのどちらからも同じinstall境界を使う。ambientCGの3D ModelはOBJなどの非glTF形式のためcatalog表示に留める。インストール可能に見せない。Open BrushはPoly Havenと同列のproviderから検証済みbrushを実stroke previewで選ぶ。GUIDとrenderer versionを保持したMaterial Assetとして追加できる。XRift公式Componentも同列のproviderから公開package本体のpreviewを確認してSceneへ追加できる。ローカルまたは外部のHDR / EXRはequirectangular用途のTexture Assetになる。Flip Yなどを編集する。import / install直後またはScene Viewへのdragでシーン全体へ設定できる。provider境界はUIと保存形式から分離する。追加ストアへ拡張できる。

<a id="f-23"></a>

## F-23 公式XRift ComponentカタログとClassic / TSX変換の状態設計

### 操作前

- 公式カタログはAssetsの「外部から追加」で「ワールド機能」区分の「Component」providerから開く。project kindで配置可能なComponentを全件表示し、各カードにComponent名、category、package本体を事前描画した保存済みthumbnailを置く。一覧と詳細を開くだけではWebGL Contextを作らない。`DevEnvironment`はScene Componentではなくdev entry用wrapperとして別注記する。
- 選択中Componentには公開package version、公式source、実際に生成するnamed importとJSX sampleを表示する。
- 右上の「Import」にはModel / 3D AssetとR3F / Classic変換を置く。R3F / Classic変換には貼り付け欄、「Classicプロジェクトを選択」、HTTPS / git SSHのRepository URL入力を並べ、folder / repository読込がデスクトップ機能であること、選択後のpackage名、entry、pathまたはURL、読み込んだmodule数を表示する。確定前にSceneへ追加するEntity、Model、Texture、Audio、Skybox、Custom Material、Collider部位と診断をreviewする。Classic Assetはこのreviewへ入る時点で書き込みなしの通常Import transactionまで準備し、原本容量、Texture解像度とRGBA / mipmap展開量、Model原寸、Model import scale、親を含む配置Scale、配置後寸法、中心補正、反転、同Scaleで復元するnamed Colliderを表示する。この段階ではScene、AssetManifest、project fileを変更しない。

### 処理中

- 公式sampleまたは貼り付けTSXをJavaScriptとして実行しない。import alias、JSX tag、string / boolean / number / array / object literal、`Math.PI`を含む有限な数式だけを解析する。
- Drei primitiveはStudio primitiveとMaterialへ、R3F LightはLightへ、Rapier RigidBodyは親Entityの独立したRigid Body Componentへ、`Billboard`は`BillboardY`へ、`Reflector`は`Mirror`へ、`Sky` / `Environment`は`Skybox`へ変換する。RigidBodyの`fixed` / `dynamic` / `kinematicPosition` / `kinematicVelocity`、一般設定、`colliders`生成方式を保持する。親原点へ仮Box Colliderを作らない。動的callbackと未対応Componentだけを診断へ残す。
- Classic folderまたは浅くcloneしたRepositoryは`package.json`、`xrift.json`、`src/World.tsx`または`src/Item.tsx`を検査する。file数、総容量、symlinkをnative境界で制限する。`src`内のTypeScript / JavaScript moduleを上限付きで読む。entryからrelative importを再帰的に解決する。local Componentはinstance境界をEntityとして保持する。静的に見つかるreturn JSXをその子へ展開する。参照されるlocal Model、Texture、MP3 / WAVは`baseUrl`、先頭`/`、`public/`を同じproject-relative pathへ正規化して重複を除く。通常のAsset transactionへ接続する。Repository URLでは浅いcloneのworking tree全体から解決する。宣言pathが欠けていても`public`内で同名fileが一意なら復旧する。sphere / BackSideの背景画像は有限半径のMeshではなく無限遠projectionのScene Skyboxへ変換する。`new Audio`のloop音源はAudio Sourceとして復元する。任意のcustom code、Hook、callback、条件分岐、動的collectionを実行しない。
- `THREE.ShaderMaterial`はvertex / fragment GLSL、literal uniform、Texture sampler、mesh名に対するdefine variantだけを宣言的なCustom Material Assetへ保存する。元Modelのmaterial slotへ適用する。Scene View、Play、Classic JSX compilerで同じShaderと時間uniformを使う。OBJ内で明示的に選ばれたCollider mesh名はnamed submeshとして復元する。元の非表示Collider groupをモデル全体の代替Boxへ変換しない。
- `group`、RigidBody、Drei / XRift wrapperを独立Entityとして残す。local Transformと親子順を維持する。定数参照を含むlocal ComponentのScaleとPositionを静的に復元する。Model import scale、中心offset、X反転を同じ単位系で合成する。named OBJ Colliderはroot Model描画を通らないためModel import scaleをCollider Entity自身へ適用する。可視Model、Collider、physics形状の寸法を一致させる。RigidBody Entityは次のネストしたRigidBody境界までの子孫Mesh / Colliderを一つのBodyとして所有する。対応するleaf Geometry、Light、Collider、公式Componentはその境界の子またはComponentとして変換する。
- Scene、AssetManifest、selectionは「追加」を確定するまで変更しない。

### 成功時

- 追加Entity、必要なModel / Texture / Audio / Material、Skybox、Light、Collider、公式XRift Componentを一つのUndo履歴へ確定し、最後のEntityを選択してInspectorで編集できる。「インポート後、そのままPlayで確認」が有効なら、確定したScene / Assetの分離コピーで直ちにPlayを開始する。
- compilerは`@xrift/world-components`から公式名をimportする。Portalなど実行時Contextが必要なComponentはEditとPlayでも公式本体を描画し、外部通信や遷移だけをStudio Provider bridgeで止め、生成結果では公式runtimeを使用する。

### 失敗時

- folder取消は入力を変えない。package / xrift manifestまたは同種entryの欠落、JSXなし、対応要素なし、project kind不一致、Entity / Material / Component作成失敗では追加を成功表示しない。個別Assetの欠落、未対応形式、変換失敗は対象pathをwarningとして残し、そのAssetだけをスキップして読み込めるSceneとAssetを一つの履歴へ確定する。
- 入力コードとsource module path／行番号付き診断をdialogに保持し、literalへの修正、未対応要素の除去、別Componentの選択へ戻れる。

### 戻り先

- キャンセルとEscapeはSceneを変更せず同じEditorへ戻る。
- 成功後はScene View、Hierarchy、右Inspectorが追加Entityへ同期し、Undoで追加前の両selectionとdocument setへ戻れる。

完了条件: 外部リソースで公開package versionと公式sourceを確認しながら、配置可能な公式Componentを全件サムネイル付きで選べる。右上ImportからDrei / React Three Fiberの標準primitiveとLight、Rapier RigidBody、公式XRift JSXを安全なScene dataへ変換する。既存Classicは検査済みentryを同じ変換器へ渡す。未対応custom codeやAssetを完全変換と誤表示しない。追加後のEntityとInspectorへ到達できる。

<a id="f-24"></a>

## F-24 glTF Material制御とBehavior連携の状態設計

### 操作前

- Material Inspectorの各Texture slotはTexture選択、UV Set、Sampler参照、タイリング / UV変換を同じ面に置く。タイリングを隠れた詳細機能にせず、glTF既定値がOffset 0、Rotation 0°、Tiling 1であることを示す。
- Animation InspectorはModel clip再生とMaterial Animationを分け、Material AnimationはInteractivity Assetの`pointer/interpolate`を開く導線として表示する。独自timelineが存在するようには見せない。
- Interactivityの`pointer/get`、`pointer/set`、`pointer/interpolate`はMaterial targetを選択可能にし、手書きJSON Pointerを前提にしない。設定前は対象Materialと項目が未選択であることを示す。

### 操作中

- Texture slotのOffset、Tiling、Rotation、UV Set変更は`MaterialTextureInfo`へ保存し、compilerとRuntime manifest adapterで`KHR_texture_transform` semanticsを維持する。Tilingが1以外でWrap S / TがRepeatでなければ、Material値を勝手に戻さずTexture Inspectorへの修正案を表示する。
- Material pointer presetは選択したMaterial Assetの安定順index、canonical pointer、KHR type index、`material` inline socket、設定または補間する`value` socketを一操作で更新する。Texture transform presetは`KHR_texture_transform`のoffset、scale、rotationだけを対象にする。
- MCPは`get_material_asset`、`update_material_asset`、`set_material_texture_transform`、`configure_interactivity_material_pointer`を公開し、project ID、Scene ID、expected revision、Edit / Import状態を通常操作と同じ境界で検査する。

### 成功時

- Material変更は同じMaterialを参照するScene View、thumbnail、Runtime manifestへ反映し、Material Assetを選択状態にする。Runtime loaderはTextureをMaterialごとにcloneしてUV channel、offset、repeat、rotationを適用し、別MaterialのTexture stateを汚染しない。
- Interactivity graphはcanonical `KHR_interactivity` JSONとして保存し、Node InspectorとMCP read結果にpointer、type、Material indexを残す。Animation Inspectorから開いた場合も同じgraph editorとvalidationを使う。

### 失敗時

- Texture未設定slot、存在しないMaterial、非pointer node、不明preset、不正vector、Play / Import中、stale revisionではAssetManifest、Interactivity Asset、historyを変更しない。MCPは原因codeと対象IDを返す。
- RuntimeでTextureを読み込めない場合はMaterial全体を消さず、該当mapのdiagnosticを残してfactor値による表示を継続する。

### 戻り先

- Material編集後は同じAsset Inspector、Animationからgraphを開いた後は同じInteractivity Assetへ戻れる。Scene selectionは維持し、Asset tabを閉じると元のEntity Inspectorへ戻る。
- Entityから開いたAsset Inspectorは、見出し下のパンくずに「<Entity名>へ戻る」ボタンと現在のAsset名を表示する。押すと同じEntity Inspectorへ戻り、選択は変えない。
- Material / graph変更の取消は通常のUndoを使い、MCP変更も同じhistoryとAutosaveから復元する。

完了条件: Material Textureのタイリング、Offset、Rotation、UV SetをglTF互換値として編集する。MCP、Animation導線、KHR_interactivity pointer nodeから同じMaterial設定へ到達できる。Runtime manifestでもTexture transformとRepeat samplerを維持する。

<a id="f-29"></a>

## F-29 Custom Shader authoringとMaterial適用の状態設計

参照: MI-03, MI-05, MI-09, MI-15, MI-16, MI-19, MI-25, MI-48

### 操作前

- Material Inspectorに「Custom Shaderを作成」を置き、標準PBR Materialから切り替えるとstarter GLSL、uniform、default variantを同じMaterial Assetへ作成する。作成だけではSceneのbindingを変えず、Material Assetを選択した状態を保つ。
- Custom ShaderはMaterial内の編集可能なshader契約として、vertex / fragment GLSL、uniform値、variant、時間uniformを持つ。既存のModel由来shaderを直接壊さず、Material単位のcopyとして編集する。
- MCPは`create_custom_shader`、`get_custom_shader`、`update_custom_shader`を公開し、`get_editor_context`のproject ID、Scene ID、revisionを要求する。既存Materialへの設定と新規Material作成は同じAssetManifest境界へ入る。

### 処理中

- GLSL source、uniform、variantの編集中はMaterialのassetSelectionと参照Entityを維持し、連続入力を一つのAsset更新へまとめる。処理中の保存・MCP更新は同じrevisionを消費し、古いMCP requestは`STALE_REVISION`で止める。
- Scene ViewではCustom Shaderを実際のShaderMaterialとしてMeshへ適用し、primitiveとModelのMaterial slotで同じuniform・attribute・時間uniform契約を使う。Texture uniformは明示されたTexture Assetだけを読み込む。
- MCP updateは`void main()`、uniform型、variant、source長を検証してからcommitする。Inspectorの途中入力は診断対象として保持し、compile / PlayではそのMaterialだけをPBR fallbackまたはblocking diagnosticへ分離する。

### 成功時

- Material InspectorにCustom Shader preview、GLSL、uniform、variant情報を残し、同じMaterialを参照する全Meshと生成Worldへ反映する。必要なら既存の`set_material`で任意のEntity slotへ割り当てられる。
- GLSLはMaterial内の短い編集だけに閉じず、`.glsl` / `.vert` / `.frag` / `.vs` / `.fs`を通常のAssets ImportからShader Assetとして登録できる。AssetsのダブルクリックとMaterial Inspectorの「編集」はScriptと同じドック型Editorを開き、Vertex / FragmentごとにMaterial内コードまたはShader Assetを選択できる。
- MCPの作成・更新結果にはMaterial Asset ID、shader内容、revisionAfterを返し、作成直後にMaterial Inspectorへ到達できる。Undo、Autosave、Play中の影響Entity再同期は通常のMaterial変更と同じにする。

### 失敗時

- shader形式不正、必須`main`欠落、uniform Texture欠落、variant不正、stale revision、Play / Import競合ではMaterial、Scene binding、historyを部分更新しない。原因code、field、Material IDをMCPとInspectorへ残す。
- WebGL compile failureはEditor全体を停止せず、該当Materialのpreviewへ原因とPBRへ戻す操作を示す。MCPの不正更新は前回の正常なMaterialを維持する。

### 戻り先

- 成功後は同じMaterial Inspectorへ留まり、Scene Viewで参照Meshを確認できる。MCP作成後も`assetSelection`を新しいMaterialへ更新する。
- 取消、PBRへ戻す、または失敗時の再試行では元のMaterial、Scene selection、Asset selectionを維持し、通常のUndoでCustom Shader設定前へ戻れる。

完了条件: Material InspectorまたはMCPからGLSL、uniform、variant、時間uniformを作成・編集する。同じMaterial AssetをMesh slotへ割り当てる。Scene View、Play、生成Worldへ反映できる。無効なshaderは診断とPBR復帰を残す。成功後は対象Materialへ戻れる。

<a id="f-30"></a>

## F-30 Textureから遠景 / 草カードを作成の状態設計

参照: MI-05, MI-09, MI-11, MI-15, MI-16, MI-25

### 操作前

- 通常の画像Texture AssetのInspectorに、遠景の平面・180度カーブ・270度カーブと、草・花の1枚・クロスを用途と分割数付きで並べる。HDR / EXRの環境Textureには表示しない。
- 遠景の平面は遠方に置く20 × 11mの縦Plane、180度と270度は同じTextureをUV分割した7枚または10枚のPlaneでカーブ状にする。草クロスは足元の縦Planeを直交2枚にして、見る方向が変わっても薄く消えにくくする。どの形もColliderを作らず、Textureのalphaを`BLEND`、Materialを両面表示にする。

### 処理中

- Material Assetの作成とScene Entityの配置を同じhistory transactionへまとめる。曲面は分割ごとにUV範囲を持つMaterialを作り、Textureを重複表示しない。Textureが見つからない、環境Textureである、またはMaterial作成に失敗したときは、SceneDocumentとAssetManifestを変更しない。

### 成功時

- 新しいEntityを選択し、Scene View、Hierarchy、Entity Inspectorを同期する。生成Materialは元Textureと同じfolderへ置き、Mesh RendererからいつでもMaterial Inspectorを開いて透明度、alpha mode、両面表示を調整できる。
- 同じ種類のカードは開始位置を少しずつずらし、完全に重なった状態で追加されないようにする。曲面は親Entityを選択して、全パネルをまとめて移動、回転、拡大縮小できる。

### 失敗時

- Inspectorの文脈を失わず、Textureの状態を確認する案内を残す。Play中またはImport中は作成せず、停止または完了後に同じTexture Inspectorから再試行できる。

### 戻り先

- 作成後は選択中のEntity Inspectorに留まり、Transform編集またはMaterial slotから見た目の調整へ進める。UndoでMaterialとEntityを同時に作成前の状態へ戻す。

完了条件: 通常のTexture Assetから、alpha blend・両面Materialを持つ平面・180 / 270度カーブの遠景、1枚 / クロスの草カードを一件のUndo履歴で作成する。配置直後にScene ViewとEntity Inspectorで位置とMaterialを調整できる。

<a id="f-36"></a>

## F-36 Audio Asset試聴の状態設計

参照: MI-03, MI-05, MI-09, MI-15, MI-20

### 操作前

- Audio AssetをAssetsから選ぶと、右Inspectorの「試聴」に再生コントロールを表示する。試聴はAudio Sourceの作成、配置、loop設定、SceneDocumentを変更しない。

### 処理中

- 管理済みのプロジェクト音源を読み込み中は「再生用の音源を読み込んでいます」と表示し、二重の再生操作を示さない。

### 成功時

- 読み込み後は標準の再生・停止・シーク操作を使え、Audio Assetの名前、形式、容量と同じInspector文脈を維持する。

### 失敗時

- ファイルが欠落、未保存、または読込に失敗した場合は再生可能であるように見せず、Assetsの保存先確認と再取込を案内する。Assetと選択状態は維持する。

### 戻り先

- 試聴の終了後も同じAudio Asset Inspectorに留まり、Audio Sourceへの配置は既存の配置操作から続けられる。

完了条件: Audio AssetのInspectorから音源を試聴できる。SceneDocumentとAudio Sourceの配置を変更しない。

<a id="f-37"></a>

## F-37 Texture解像度変更・圧縮の適用の状態設計

参照: MI-03, MI-05, MI-09, MI-15, MI-16, MI-25, MI-67

### 編集負荷の調整と再変換

- MI-03 / MI-05 / MI-67: 複数Textureの最大解像度・形式を共通指定し、実行前に各画像の対象／変更不要／非対応理由を表示する。変換中は設定と実行を無効化し、失敗時は元の参照を保って同じ選択から再試行する。
- 変換済み画像は保持してある原画像から再変換できる。現在使用中の画像と変換元を区別し、KTX2自体を再圧縮できるようには見せない。
- インポートの最大解像度は編集用の画像にも適用する。元ファイルは残し、再インポートでは保護された個別設定を優先する。
- Scene Viewに描画解像度50%・25%の編集用品質を追加する。Playと公開物には適用しない。

### 操作前

- Texture Inspectorの最大解像度と圧縮（方式・Quality）は設定として保持されるだけで、原本の画像ファイルは変わらない。公開時には F-40 の変換が同じ設定を自動で適用するため、この操作はEditorの表示と原本そのものを軽くしたいときに使う。「画像の書き出し」に現在の解像度・形式・容量と、変換後の解像度・形式・Qualityを並べて示す。
- 設定が原本と一致していて変換するものがない場合は、その理由を示して実行操作を無効にする。環境Texture（HDRI）、KTX2やSVGなど書き戻せない形式、外部・組み込みsource、解析結果のないAssetは、実行操作を出さずに対応していない理由を示す。
- 未反映の設定があるときは、公開結果には自動で反映されること、この操作はEditorの表示も変換後にすること、書き出しても元の画像fileは残ることを操作の前に示す。
- Play中と、アセットのインポート・Model再インポート・別Textureの変換中は実行できない。理由と、停止または完了後に同じInspectorから実行できることを示す。

### 処理中

- ボタンを「変換中」にして無効化し、同じTextureの設定変更も止める。読み込み・変換・保存の段階を文言で示し、二重実行を示さない。
- 書き出しは`assets/.optimized/`へハッシュ名の新しいfileとして保存し、元の原本を上書きしない。保存に失敗した場合はAssetManifestを変更せず、表示中のTextureも壊さない。

### 成功時

- 変換後の解像度、形式、変換前後の容量をInspectorに残し、通知にも同じ内容を出す。AssetのsourceとImport metadataを書き出したfileへ切り替える。保存上は未反映設定をリセットするが、Inspector・一括編集は保持した適用済み設定を表示・編集の基準にする。既存Optimize結果も実際の形式と寸法から補い、KTX2が意図せずJPEGへ戻らないようにする。
- 一件のUndo履歴として確定し、自動保存へ引き継ぐ。生成済みthumbnailはstaleにして再生成の対象にする。Undoで変換前のAssetへ戻る。

### 失敗時

- 失敗理由をInspectorと通知の両方に残し、元の原本と設定を保持する。変換中に同じTextureの設定が変わった場合は、書き出した画像を採用せず取り消したことを示す。
- 未保存のプロジェクトでは実行せず、初回の自動保存後に実行できることを示す。

### 戻り先

- 成功・失敗のいずれでも同じTexture Inspectorに留まり、設定を変えて再実行するか、Upload reviewの容量見積もりへ進める。Upload reviewの一括最適化と同じ変換結果の保存先を使う。書き出さずに公開へ進んだ場合は F-40 の公開時変換が同じ設定を適用する。

完了条件: Texture Inspectorの最大解像度・圧縮設定を、その場で原本の画像ファイルへ書き出せる。変換前後の解像度、形式、容量を同じ場所で見比べる。未反映のまま公開されない状態にする。環境Textureや書き戻せない形式は理由を示して実行させない。

<a id="f-40"></a>

## F-40 公開時のTexture変換と取り込み時の最大解像度の状態設計

参照: MI-03, MI-05, MI-09, MI-15, MI-16, MI-25, MI-67

### 操作前

- Texture Import設定（最大解像度・2のべき乗・圧縮）が原本へ未反映であることは、公開を止める理由にしない。制作データの原本はそのまま残し、公開・アップロード・Classic書き出しが配る画像だけを設定どおりに作り直す。Upload reviewは「原本へ未反映です」という診断を出さず、「Texture N枚を公開用に変換します」と、変換前後の解像度・形式の内訳を示す。
- 原本の形式が解像度変更・圧縮に対応していない場合（SVG、KTX2）は、公開を止めずに原本のまま配ることと、軽くしたい場合の読み込み直しを同じカードに示す。環境Texture（HDRI）へ設定が効かないことはTexture Inspectorが説明するので、公開前には繰り返さない。
- Importメニューに「取り込むTextureの最大解像度」を置く。単体・モデル内蔵の対応画像に同じ上限で編集用画像を生成し、元ファイルを保持する。選択した既定値はEditor Stateとしてブラウザに残る。モデル再インポートにも適用し、個別に保護した設定を優先する。

### 処理中

- 公開の変換は、staging・アップロードバンドル・Classic書き出しのいずれでも同じ計算とエンコード経路を通る。経路によって配られる画像が変わらない。
- 変換中は公開の進行表示に「Textureを公開用に変換しています」と、何枚目かと「制作データの原本はそのまま残ります」を示す。この段階は安全に取り消せる。
- 取り込み時の最大解像度で必要な画像を順番に変換する。変換に失敗した場合は新しいManifestを採用せず元の参照を保持する。glTFのsampler由来の設定は取り込みの既定より優先する。HDRI・SVG・元画像を保持していないKTX2は変換しない。

### 成功時

- 公開されたTextureは設定どおりの解像度・形式になり、コピー先のファイル名も変換後の拡張子で決まる。KTX2へ変換したTextureは、生成コードとRuntime manifestでもKTX2として読み込まれる。
- 制作データのファイルは読むだけで、書き換えない。Editorの表示は原本のままなので、後から解像度を上げ直せる。
- 容量の見積もりでは、未反映の設定があるTextureの配信容量は「公開時に変換するため実際はこれより小さくなる」ことを示す。

### 失敗時

- 変換に失敗した場合は、どのTextureで失敗したかを添えて公開を止める。制作データは変更しない。
- 設定を反映できない原本は、公開を止めずに警告だけを残し、原本のまま出力する。診断を黙って消さない。

### 戻り先

- 公開後もImport設定はそのまま残るので、解像度や圧縮を変えて公開し直せる。Editorの表示と原本そのものを軽くしたいときは、同じ設定のまま F-37 の「この設定で画像を書き出す」へ進める。

完了条件: 制作データの原本を書き換えない。公開・アップロード・Classic書き出しが配る画像だけをImport設定どおりに変換する。取り込み時の最大解像度は編集用画像の生成に使う。元ファイルを保持する。

<a id="f-43"></a>

## F-43 しかけ付き3Dセット（チュートリアル）の状態設計

参照: MI-03, MI-04, MI-05, MI-09, MI-11

### 操作前

- 「外部から追加 > 3Dセット」に、しかけ付きのセットを「しかけ・チュートリアル」カテゴリとして、他のセットと同じ棚に並べる。学習用の別画面を作らない。
- 詳細ペインには、中身 (形状・音・しかけの本数)、「動き」(押したら何が起きるかを1行ずつ)、「このセットで分かること」(目的と手順) を、配置する前に読める位置へ置く。
- 音を含むセットは、追加でAudio Assetがプロジェクトへ入ることを中身の一覧で先に示す。

### 処理中

- 追加ボタンは「追加中」に変わり、無効化する (MI-03)。音のimportとAsset commitが終わるまで完了にしない。

### 成功時

- Sceneへ配置し、追加したAssetの件数を示す (MI-05)。配置したEntityを選択状態にし、Hierarchyから中身を1つずつ編集できる状態にする。
- 手順を持つセットでは、棚を閉じない。手順はこのパネルにしかないので、閉じると次にすることが画面から消える。代わりに「この画面を閉じてPlayを開始してください」と、次の一手を示す。
- 手順を持たないセットでは、これまでどおり棚を閉じ、通知で編集方法を示す。

### 失敗時

- Play中、import中、未保存のプロジェクトでは、追加前に理由を示して止める (MI-09)。
- 音のimportやグラフの生成に失敗した場合は、途中まで配置したEntityを残さない。SceneもAssetManifestも変えず、同じボタンから再試行できる。

### 戻り先

- 棚を閉じると、配置したEntityを選択したEditorへ戻る。Undo一回でEntityと、そのセットが作ったParticle / Interactivity Assetがまとめて消える。
- 置いたあとはただのEntityとComponentなので、戻り先はいつものInspectorとNode Editorになる。
