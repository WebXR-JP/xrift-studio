# XRift Studio ビジュアルエディター設計

XRift Studioは、[XRift](https://xrift.net/)のワールドとアイテムを制作するデスクトップアプリである。コードを直接書く「コード編集」と、画面上でシーンを組み立てる「ビジュアル編集」に対応する。この文書ではビジュアル編集の設計を定義する。

対象範囲は、ビジュアルprojectの作成、素材の取り込み、シーン編集、保存、動作確認、XRift projectへの変換、check、uploadまで。変換は同じ入力から同じ出力が得られるようにする。

ワールドとアイテムは同じシーン形式を使う。input、controller、mount transform、cameraの実行環境profileは成果物の種別ごとに分ける。各操作では、authoring document、生成artifact、XRift resultの実際の状態を表示する。処理中、失敗、stale、審査中は、成功や公開済みとして表示しない。

全体の設計はこの文書で管理し、個別機能の詳細は次の文書で定義する。

| 文書 | 扱う範囲 |
| --- | --- |
| [UX原則](./UX_PRINCIPLES.md) | 画面文言、状態設計、レビュー基準 |
| [マイクロインタラクションWiki](./UX_INTERACTIONS.md) | 機能ごとの操作前・処理中・成功・失敗・戻り先 |
| [スクリプトContract](./SCRIPTING.md) | スクリプトのAPI、実行境界、対応範囲 |
| [KHR_interactivity Editor / MCP design](./KHR_INTERACTIVITY_EDITOR.md) | ノードグラフのcanonical形式とMCP契約 |
| [地形エディター仕様](./TERRAIN_EDITOR_SPEC.md) | 地形と草のモード、ブラシ、性能 |
| [マテリアルカタログ仕様](./MATERIAL_CATALOG_SPEC.md) | 空・水シェーダー、草、風契約 |
| [3Dモデルの読み込み仕様](./MODEL_IMPORT_CONTRACT.md) | 3Dモデルの取り込みと再取り込み |
| [設定デザインガイド](./EDITOR_INSPECTOR_DESIGN.md) | 右設定の密度と参照field |
| [ビジュアルプロジェクトをコード編集へ書き出すCLI](./VISUAL_PROJECT_MIGRATION_CLI.md) | コード編集への書き出し |
| [対応範囲と段階](./VISUAL_EDITOR_ROADMAP.md) | どこまで実装され、次に何を満たすか |

## 1. 目標と設計原則

コードを直接編集する方法に加え、素材をシーンへ置いて見た目を確かめながらワールドやアイテムを制作できるようにする。

設計では次を守る。

1. コード編集とビジュアルを対等な制作入口として扱う。
2. コード編集とビジュアル編集は、編集するデータと利用できる機能が異なるproject typeとする。同じprojectの表示モード切り替えとしては扱わない。
3. ビジュアル制作では`VisualProjectDocument`、`SceneDocument`、`AssetManifest`を保存・編集する。任意のJSXや`package.json`は編集データにしない。
4. SceneDocument、AssetManifestと、選択、カメラ、開いているパネルなどのEditor Stateを分離する。
5. エンティティ、コンポーネント、素材には表示名とは別の安定IDを持たせる。
6. 設定とコンパイラは同じ明示的なコンポーネント / 素材Schemaを参照する。
7. 汎用ECSランタイムを持たず、ECSに着想を得た正規化データとして実装する。system schedulerとqueryは導入しない。per-frameの更新順序を必要とするのはスクリプトのコンポーネントだけであり、そのschedulingは [4.8スクリプト](#48-scripting-script-asset--script-component) の`RuntimePlugin` lifecycleと固定順序に限定する。
8. 未保存、未変換、未公開を区別し、実行していない処理の成功表示を出さない。
9. XRiftの認証情報とファイル操作はブラウザUIから分離し、authoring documentや生成バンドルへ含めない。
10. ビジュアルモードではVite、CLI、開発サーバー、別ブラウザの起動を制作手順として意識させず、編集から動作確認、停止まで同じエディター内で完結させる。
11. 編集・Play・公開は同じ素材と実際の描画コードを使う。公開専用の材質置換や見た目の補正を行わない。共通runtimeと環境別adapterの境界、画像の扱い、検証条件は [描画の一致に関する実装契約](./AGENT_IMPLEMENTATION.md#rendering-parity) に従う。

## 2. 四つの制作導線と project type

新規作成の最初の画面には、「アイテム・コード編集」「ワールド・コード編集」「アイテム・ビジュアル」「ワールド・ビジュアル」の四つのカードを同じ階層に置く。各カードで成果物、制作方法、編集するデータ、作成後に開く画面を一文で示す。

成果物とproject typeは内部で二つの軸として管理し、画面では一度の選択で決められるようにする。「コード編集 / ビジュアル」の選択により、編集データ、利用できる機能、保存形式が変わる。同じprojectの編集画面を切り替える操作にはしない。

| 成果物 | プロジェクトtype | 正本 | 開く機能 | XRiftへの到達方法 |
| --- | --- | --- | --- | --- |
| アイテム | コード編集 | `package.json`、`xrift.json`、`src/` | コードエディター | 既存のitem check/build/upload |
| ワールド | コード編集 | `package.json`、`xrift.json`、`src/` | コードエディター | 既存のworld check/build/upload |
| アイテム | ビジュアル | `xrift-studio.project.json`、`scenes/`、`assets/` | ビジュアルエディターとアイテムプレビューProfile | Compilerが一時的なXRift item projectを生成して既存処理へ渡す |
| ワールド | ビジュアル | `xrift-studio.project.json`、`scenes/`、`assets/` | ビジュアルエディターとワールド動作確認Profile | Compilerが一時的なXRift world projectを生成して既存処理へ渡す |

### 2.1 コード編集 project

- `xrift create item`または`xrift create world`が作るXRift code projectをそのまま扱う。
- `package.json`、`xrift.json`、`src/`がユーザー編集可能な正本である。
- 任意のReact / JSX / JavaScriptを許し、ビジュアル用documentの存在を要求しない。
- 任意JSXを解析してビジュアルprojectへround-tripする機能や、自動変換は提供しない。

### 2.2 ビジュアル project

- ルートの`xrift-studio.project.json`をproject manifestとし、`scenes/main.scene.json`と`assets/assets.json`を参照する。
- `package.json`、`xrift.json`、`src/`はauthoring projectの正本にしない。
- Compilerが生成するXRift code projectはcacheまたは一時出力であり、再生成可能で手編集不可とする。
- ビジュアル編集からコード編集へ移る場合は、書き出し / Ejectで別のclassic projectを作る。以降はコード編集側を独立して編集し、自動同期は保証しない。コード編集からの取り込みは別transactionとして扱う。検査済みの元データgraphから静的に変換できる部分だけをlossy importし、元のビジュアル編集documentと往復同期しない。

`xrift-studio.project.json`はvisual projectのroot manifest filenameとする。filenameを変更する場合は旧名の検出と明示的migrationを用意し、同じprojectをclassicと推測しない。

```text
my-visual-project/
  xrift-studio.project.json
  scenes/
    main.scene.json
    prefabs/
      <prefab-id>.scene.json
  assets/
    assets.json
    folders.json
    source/
      <asset-id>/
        <sanitized-original-name>
  .xrift/
    world.json | item.json
  .cache/
    assets/
      <asset-id>/
        <derived-file>
    generated-xrift/
      package.json
      xrift.json
      src/
```

### 2.3 ライブラリでの判定

Tauri側のproject scanは、ルートに有効な`xrift-studio.project.json`があればvisual、`package.json`と`xrift.json`があればclassicと判定する。visualの`.cache/generated-xrift/`は再帰scanの対象外にする。

visual manifestが不正な場合は、classicとして開かない。「ビジュアル編集のプロジェクトを読み込めません」と表示し、対象fieldと修復手段を示す。ライブラリカードには成果物種別に加えて「コード編集」または「ビジュアル」を表示し、開くエディターと編集対象のデータを分かるようにする。

ビジュアルカードの作成成功時は上記専用formatをproject rootに保存し、ライブラリへ一件追加してビジュアルエディターを開く。作成途中の失敗では不完全なprojectを一覧へ追加せず、temporary directoryを回収して四カードまたは保存先確認へ戻す。

## 3. エディターの画面構成

デスクトップ幅では次の配置を基本とする。

```text
┌──────────────── ヘッダー / Edit・Play / Transform Tool / 状態 ────────────────┐
├──────────────┬───────────────────────────────┬─────────────────────────┤
│ Hierarchy    │ Scene View                    │ Inspector               │
│              │                               │                         │
│ エンティティ │ 3D 表示、選択、ギズモ          │ コンポーネントとプロパティ │
│              │                               │                         │
│              ├───────────────────────────────┤                         │
│              │ Assets                        │ Entity / Asset properties│
│              │ 探索、検索、D&D、thumbnail     │                         │
└──────────────┴───────────────────────────────┴─────────────────────────┘
```

### Hierarchy

- SceneDocumentの親子関係を表示する。
- クリックしたエンティティを選択し、シーンのアウトラインと設定を同時に更新する。
- 表示名を変更してもIDは変えない。
- 親子付け替え、複数選択、複製、削除、プレハブ作成はCommandとして扱い、シーンと同じ履歴へ入れる（[7. Commandと元に戻す / やり直す](#7-command-と元に戻す--やり直す)）。

### Scene View

- React Three FiberとThree.jsを表示層に使い、SceneDocumentのオブジェクトとAssetManifestの参照を解決して描画する。
- 選択中のエンティティだけに移動、回転、拡大縮小のギズモを表示する。
- 通常clickは単体選択、Shift / Ctrl・Cmd clickは追加／解除とし、複数選択中は全対象へoutline、最後に選んだprimaryオブジェクトだけにgizmoを表示する。pointer downからupまでにcamera drag相当の移動があれば選択を確定しない。
- ギズモ操作中はカメラ操作との競合を止め、操作終了時に一つの履歴として確定する。
- 編集の表示は一つの目的別selectorで「シーン」「ライトなし」「ワイヤー」「コライダー」を切り替える。空の背景、Fog、ライトを個別toolbar toggleとして並べず、診断用の3モードは既定のグレーマテリアルと形状を見分けられる暗いneutral背景を使う。表示モードはSceneDocument、元に戻す、自動保存、compile、動作確認結果を変更しない。
- 空間へ3Dモデル / プレハブをドロップした場合は、配置したエンティティを直ちに選択する。マテリアルのドロップでは、対象メッシュの割り当て枠のbindingだけを変更し、オブジェクトは増やさない。
- シーンの空間またはオブジェクトを右クリックすると追加submenuを開き、Empty、Box、Sphere、Plane、CylinderなどRegistry登録済みprimitiveをclick pointまたは選択親の下へ作成する。作成位置と親をmenu内で読めるようにし、`CreatePrimitiveCommand`一件で追加と選択を確定する。
- 編集と動作確認は明示的に分け、同じシーンで切り替える。
- 編集ではオブジェクト / 素材の選択、素材配置、ギズモ、位置・回転・大きさとマテリアルの編集を有効にする。
- 動作確認ではSceneDocumentとAssetManifestの編集を [4.6](#46-playsession-と実行環境-profile) が許可する範囲へ制限し、ギズモとドロップ先を隠す。project kindに対応するプレビューProfileで体験確認する。
- 停止では動作確認中のアバター、カメラ、入力状態を破棄し、動作確認開始前の編集の選択状態へ戻る。
- ワールド動作確認Profileのkeyboard / gamepad / XR inputは`InputAdapter`と`ControllerPlugin`を介し、アイテムプレビューProfileへworld navigationを混ぜない。

### Inspector

- 右側はオブジェクトと素材の唯一のproperty editorとする。`sceneSelection`と`assetSelection`は独立して保持し、最後に明示操作した対象を`inspectorContext`として表示する。素材を選んでもオブジェクトselection自体は消えず、設定headerのオブジェクト / 素材breadcrumbまたはpinned tabで直前のオブジェクトpropertiesへ一操作で戻れる。
- オブジェクトcontextは位置・回転・大きさ、コンポーネント、geometry / model reference、material slots、`castShadow` / `receiveShadow`、XRift Studio固有authoring fieldを扱う。マテリアルcontextはglTF PBR / extensions、テクスチャcontextは元データ、色空間、resize、mipmap / sampler、compression、derived / diagnosticsを扱う。3Dモデル、プレハブ、パーティクル、スクリプト、ノードグラフも同じ右設定のkind-specific sectionを使う。
- マテリアルの変更は、そのIDを参照するすべてのオブジェクトへ反映する。設定headerには素材kind、stable ID、参照数、「共有中」、dirty / stale statusを表示する。
- メッシュのマテリアルはglTFメッシュprimitiveに対応するslotごとに表示し、`materialBindings[].slot`と`materialAssetId`を編集する。`castShadow`と`receiveShadow`はマテリアルではなくオブジェクトのメッシュコンポーネントにある「影」sectionで扱う。素材単位の任意の`maxDistance`（奥Clip）は同じメッシュコンポーネントに保存し、未設定時はシーンCameraの`far`を使う。設定、MCP、Editorプレビュー、動作確認、コード編集compilerはこの値を共有し、葉や遠景モデルだけを安全に距離制限できる。
- 素材からマテリアルを、オブジェクト設定のslotかシーンのメッシュへドラッグできる。hover中は対象オブジェクト / slotと置換前後のマテリアル名を表示し、ドロップを`AssignMaterialCommand`一件として確定する。複数のslotから対象を特定できない場合は、ドロップ前にslot chooserを開く。推測では適用しない。
- 素材からテクスチャをマテリアル設定の対応slotへdragできる。用途がbase color / emissiveならsRGB、metallic-roughness / normal / occlusionならlinearのrecipeを提案し、既存recipeと衝突する場合は確定前に選択肢を示す。
- オブジェクト固有のマテリアルoverrideを追加する場合は、共有マテリアルの編集とは別の明示的コンポーネント / Commandにし、現在どちらを編集しているかheaderとfield groupで区別する。
- オブジェクトの値はSceneDocument、素材の値はAssetManifestに反映する。設定contextを切り替えても`sceneSelection`と`assetSelection`は維持する。
- 動作確認中も実行環境が生成した値をSceneDocumentやAssetManifestへ書き戻さない。任意のJSX、スクリプト、式を評価してpropertiesを生成しない。作者が設定またはMCPから明示的に変更したシーン構造と宣言済みスクリプトpropertyだけはauthoring Commandとして保存し、追加・削除・更新されたオブジェクトの実行環境revisionへ差分同期する。動作確認中に編集できるのは4.6が許可する範囲、スクリプト元データfile、宣言済みスクリプトpropertyとする。
- コンポーネントRegistryによりメッシュ、ライト、衝突判定、パーティクル、開始位置、地形とtyped XRiftのコンポーネントを追加する。

### Assets

- 素材は探索、検索、folder整理、selection、drag元データ、import statusに専念し、マテリアル / テクスチャproperty formを下部へ埋め込まない。Box、Sphere、Planeなどは保存対象素材ではなく、オブジェクト一覧 / シーンの右クリック追加submenuとtoolbarの追加paletteから作るprimitiveとする。
- 素材に表示するユーザー管理対象は3Dモデル / GLTF、テクスチャ、マテリアル、プレハブ、パーティクル、音声、スクリプト、シェーダー、ノードグラフとし、安定ID、表示名、種別、状態、thumbnailを持たせる。
- 一回のクリックは`assetSelection`を変えて右設定を素材contextへ切り替える。3Dモデル / プレハブのシーンへのdragまたは「配置」だけがオブジェクトを作り、マテリアルのdragはメッシュの割り当て枠binding、テクスチャのdragはマテリアルtexture slot referenceを変更する。
- 追加paletteのprimitiveと、3Dモデル、テクスチャ、マテリアル、プレハブ、パーティクルを見た目とラベルの両方で区別する。検索とfilterは表示名、kind、diagnostic statusを対象にする。
- thumbnailは`pending -> generating -> ready | failed | stale`のlifecycleを持つ動的なderived viewとする。元データ、マテリアルproperty、dependency、thumbnail recipeの変更を検知してbackground queueで再生成する。3Dモデル / プレハブは固定camera、マテリアルは基準球、テクスチャは用途の色空間、パーティクルは代表時刻を使い、選択中またはhover中だけbudget内でorbit / particle loopなど短いlive previewを許す。
- テクスチャ / GLB / GLTFの外部drag-and-dropは取り込みQueueで検証、元データcopy、derived / thumbnail生成、manifest commitまで実行する。import完了前にシーンやマテリアル枠の参照を確定せず、成功後は素材を右設定で編集できる。
- 「外部から追加」は [6.8外部リソースカタログ](#68-外部リソースカタログ) のcatalogを開き、CC0 providerとXRift公式カタログから同じimport transactionで素材を追加する。
- 非対応形式はシーンを変更せず、対応形式と次の操作を表示する。
- folderは素材IDと別の安定`folderId`を持つ表示上の整理単位とし、元データ / derivedの実ファイルpathをfolder移動だけで変更しない。空白部またはfolderのcontext menuから「マテリアル / プレハブ / パーティクルを作成」「3Dモデル / テクスチャをインポート」「新しいフォルダー」を選べる。素材のcontext menuには「名前を変更」「複製」「削除」「参照元を表示」「再インポート」「サムネイルを再生成」をkindと状態に応じて出す。
- 削除前には参照中のオブジェクト、プレハブ、マテリアル枠件数を示す。参照を壊す削除は暗黙に続けず、置換または明示的な参照解除を同じCommand Transactionに含める。

### Resizable / dockable layout

- オブジェクト一覧、シーン、設定、素材はsplitterでresizeでき、オブジェクト一覧 / 設定 / 素材は定義済みdock zoneへ移動できる。ドラッグ中はドロップ先のプレビューと移動後のパネル順を表示する。Escapeまたは領域外へのドロップではlayoutを変えない。
- layoutは`layoutSchemaVersion`、panel ID、dock zone、order、size ratio、collapsed / pinned inspector tabsとしてEditor Preferencesに保存する。pixel absolute値だけを保存せず、window sizeとminimum width / heightに合わせて正規化する。素材、シーン、selectionなどauthoring dataはlayout documentへ入れない。
- 起動、window resize、project kind切替でsaved layoutを復元し、存在しないpanel ID、画面外floating rect、minimum未満のsizeはsafe defaultへmigrationする。「レイアウトをリセット」で既定の左オブジェクト一覧、中央シーン、右設定、下素材へ戻せる。
- panel resize / dockの最中はauthoring元に戻す履歴を増やさない。Preferences save失敗でも編集を止めず、そのsessionのlayoutと再試行を保つ。

### 視覚基準

- エディターは明るいneutral surfaceを既定themeとし、白からneutral-50のpanel、neutral-200の境界、neutral-900の本文を使う。3D Viewの背景色や素材thumbnailの内容色をthemeの代わりにしない。dark themeを追加する場合もsemantic color tokenとcontrast基準は共有する。
- UIフォントはOSのsystem sans-serifを基準とし、本文13px、補助情報12px、panel見出し14px、画面見出し16pxを最小基準にする。素材名やオブジェクト名を12px未満へ縮めない。
- 本文はneutral-900、補助情報はneutral-600、無効状態はneutral-400、境界はneutral-200を基準にする。brand colorは選択、主操作、focus ringに限定し、warning / error / successは色と短い文言を併用する。
- 基本spacingは4px gridとし、field内4px、field間8px、section内12px、panel内16pxを基準にする。オブジェクト一覧rowと素材rowのhit areaは最低32px、主要buttonは最低36pxとする。
- 数値label、単位、入力欄の列を揃え、3軸値はX / Y / Zを色だけでなく文字でも示す。keyboard focusは2px以上の輪郭で示し、hoverと同じ見た目にしない。
- panel resize後もオブジェクト一覧、シーン、設定、素材の主surfaceを見失わない。狭い幅ではオブジェクト一覧 / 設定 / 素材をcollapsed tabにできるが、active inspector context、選択対象、未保存状態をheaderに残す。

### Icon Registry と inventory

すべての操作iconは`lucide-react`の既存exportを中央`IconRegistry`からsemantic tokenで参照する。各componentがLucide名を直接選ばず、`editor.play`のような用途名を要求する。他製品のicon assetのコピー、既存製品に似せたcustom SVGの生成、文字を図形化した独自iconは行わない。strokeは原則`1.9`、toolbarは18px、row / fieldは16px、空状態は24pxを基準にし、装飾目的でサイズやstrokeを変えない。

iconだけのbuttonは必ず同じ語のvisible tooltipと`aria-label`を持つ。shortcutはShortcut Registryからtooltip末尾へ自動付与し、shortcutがない場合は操作名だけを表示する。状態色はsemantic tokenであり、色だけで状態を伝えない。`neutral`はneutral-600、`active`はbrand-600とbrand-50背景、`success`はemerald-600、`warning`はamber-700、`error/destructive`はrose-600、`disabled`はneutral-400を起点にする。

| Semantic token | Lucide export | 用途 / visible label | 既定tooltip | Shortcut | 状態色 |
| --- | --- | --- | --- | --- | --- |
| `project.world` | `Globe2` | ワールド | ワールドを作成 | なし | neutral / 選択時active |
| `project.item` | `Box` | アイテム | アイテムを作成 | なし | neutral / 選択時active |
| `project.classic` | `Code2` | コード編集 | コードで作成 | なし | neutral / 選択時active |
| `project.visual` | `PanelsTopLeft` | ビジュアル | ビジュアルエディターで作成 | なし | neutral / 選択時active |
| `create.primitive` | `Cuboid` | プリミティブ | プリミティブを作成 | なし | neutral |
| `asset.model` | `Boxes` | 3Dモデル / GLTF | モデル | なし | kind fallbackのneutral |
| `asset.texture` | `Image` | テクスチャ | テクスチャ | なし | kind fallbackのneutral |
| `asset.material` | `Palette` | マテリアル | マテリアル | なし | kind fallbackのneutral |
| `asset.prefab` | `Package` | プレハブ | プレハブ | なし | kind fallbackのneutral |
| `asset.particle` | `Sparkles` | パーティクル | パーティクル | なし | kind fallbackのneutral |
| `asset.folder` | `Folder` / `FolderOpen` | フォルダー | フォルダーを開く / 閉じる | なし | neutral / ドロップ先はactive |
| `asset.import` | `HardDriveUpload` | インポート | 3Dモデルまたはテクスチャをインポート | なし | neutral |
| `asset.reimport` | `RefreshCw` | 再インポート | 元ファイルから再インポート | なし | neutral / 実行中active |
| `asset.new-folder` | `FolderPlus` | 新しいフォルダー | 新しいフォルダー | なし | neutral |
| `asset.new-prefab` | `PackagePlus` | プレハブを作成 | 選択オブジェクトからプレハブを作成 | なし | neutral |
| `edit.select` | `MousePointer2` | 選択 | 選択ツール | なし | 押下中active |
| `edit.move` | `Move3d` | 移動 | 移動ツール | `W` | 押下中active |
| `edit.rotate` | `Rotate3d` | 回転 | 回転ツール | `E` | 押下中active |
| `edit.scale` | `Scale3d` | 拡大縮小 | 拡大縮小ツール | `R` | 押下中active |
| `edit.focus` | `Focus` | 選択へフォーカス | 選択へフォーカス | `F` | neutral |
| `edit.copy` | `Copy` | コピー | コピー | `Ctrl/Cmd+C` | neutral |
| `edit.paste` | `ClipboardPaste` | 貼り付け | 貼り付け | `Ctrl/Cmd+V` | neutral / 不可時disabled |
| `edit.duplicate` | `CopyPlus` | 複製 | 複製 | `Ctrl/Cmd+D` | neutral |
| `edit.delete` | `Trash2` | 削除 | 削除 | `Delete` | destructive |
| `history.undo` | `Undo2` | 元に戻す | 元に戻す | `Ctrl/Cmd+Z` | neutral / 履歴なしdisabled |
| `history.redo` | `Redo2` | やり直す | やり直す | `Ctrl/Cmd+Shift+Z` | neutral / 履歴なしdisabled |
| `project.save` | `Save` | 保存 | 保存 | `Ctrl/Cmd+S` | neutral / 保存中active |
| `preview.play` | `Play` | Play | Play | `Ctrl/Cmd+Enter` | active |
| `preview.stop` | `Square` | Stop | Stop | `Ctrl/Cmd+Enter` | active |
| `publish.upload` | `CloudUpload` | アップロード | XRiftへアップロード | なし | active / 実行中active |
| `status.ready` | `CircleCheck` | 準備完了 | 準備完了 | なし | success |
| `status.info` | `Info` | 情報 | 詳細を表示 | なし | active |
| `status.warning` | `TriangleAlert` | 警告 | 警告を表示 | なし | warning |
| `status.error` | `CircleX` | エラー | エラーを表示 | なし | error |
| `status.loading` | `LoaderCircle` | 処理中 | 処理中 | なし | active、回転motion |

3Dモデル、テクスチャ、マテリアルは`thumbnail.status === ready`ならgenerated thumbnailを第一表示にする。プレハブとパーティクルも生成可能なら同じ規則を使う。kind iconはthumbnailが未生成、失敗、または表示不能な場合だけfallbackとし、失敗時はkind iconにstatus badgeとテキストを加える。generated thumbnailの上へ製品固有の装飾iconやLucide iconを常時重ねない。

## 4. ビジュアル project の document model

### 4.1 三つの正本

ビジュアルprojectは、役割の異なる三つのversioned documentを正本にする。

```text
VisualProjectDocument (xrift-studio.project.json)
  ├─ entrySceneId + scenePaths ─> SceneDocument (scenes/main.scene.json)
  └─ assetManifestPath ─────────> AssetManifest (assets/assets.json)
                             ↑
SceneDocument の mesh component ─ asset ID 参照 ─┘
```

- `VisualProjectDocument`はproject kind、開始シーンのID、scene paths、asset manifest path、metadataを定義する。
- `SceneDocument`はオブジェクト、親子関係、コンポーネント、素材ID参照だけを持つ。素材本体やマテリアル値を埋め込まない。
- `AssetManifest`は3Dモデル / GLTF、テクスチャ、マテリアル、プレハブ、パーティクル、音声、スクリプト、シェーダー、ノードグラフと、元データmetadata、再生成可能なderived metadataを持つ。
- 三documentはそれぞれ`schemaVersion`を持ち、別々にvalidationとmigrationを行う（[4.10](#410-schemaversion-と-migration)）。
- IDは表示名や相対パスを変更しても変えない。参照はファイル名ではなくIDで解決する。

三つはprojectを開くためのroot documentである。VisualProjectDocumentは`assetFoldersPath`と`saveCommitId` / committed hash setを持ち、プレハブが参照するプレハブSceneDocumentとfolder documentもversioned save setに含める。プレハブやfolderをAssetManifestへ巨大なinline JSONとして埋め込まない。

### 4.2 VisualProjectDocument

`xrift-studio.project.json`はTauri libraryとcompilerが最初に読むmanifestである。

```json
{
  "schemaVersion": "0.1.0",
  "projectId": "project_01jvisual",
  "projectKind": "world",
  "metadata": {
    "name": "garden-world",
    "title": "Garden World",
    "description": "A world authored in XRift Studio",
    "createdAt": "2026-07-20T00:00:00.000Z",
    "updatedAt": "2026-07-20T00:00:00.000Z"
  },
  "entrySceneId": "scene_main",
  "scenePaths": {
    "scene_main": "scenes/main.scene.json"
  },
  "assetManifestPath": "assets/assets.json"
}
```

visualの判定はrootのmanifest filenameとschemaで行い、classic projectからfield推測しない。`entrySceneId`は`scenePaths`に存在し、すべてのpathはproject root相対でなければならない。CompilerとPlaySessionは`projectKind`からworld / item profileを選び、item projectをworld adapterで生成しない。

### 4.3 SceneDocument

SceneDocumentはECSに着想を得た正規化オブジェクトgraphであり、system scheduler、query、独自実行環境ECSを持たない。スクリプトのコンポーネントはper-entityのupdate順序を必要とするが、その順序はオブジェクト階層順とコンポーネント並び順から決まる固定規則であり、SceneDocumentにschedulerやqueryを追加しない（[4.8スクリプト](#48-scripting-script-asset--script-component)）。

```json
{
  "schemaVersion": "0.1.0",
  "sceneId": "scene_main",
  "name": "Main",
  "rootEntityIds": ["entity_floor", "entity_gate"],
  "entities": {
    "entity_floor": {
      "id": "entity_floor",
      "name": "Floor",
      "parentId": null,
      "children": [],
      "enabled": true,
      "components": [
        {
          "id": "component_floor_transform",
          "type": "transform",
          "enabled": true,
          "position": [0, 0, 0],
          "rotation": [0, 0, 0],
          "scale": [8, 0.2, 8]
        },
        {
          "id": "component_floor_mesh",
          "type": "mesh",
          "enabled": true,
          "geometry": { "kind": "builtin", "primitive": "box" },
          "materialBindings": [
            { "slot": "default", "materialAssetId": "asset_material_stone" }
          ],
          "castShadow": false,
          "receiveShadow": true
        }
      ]
    },
    "entity_gate": {
      "id": "entity_gate",
      "name": "Gate",
      "parentId": null,
      "children": [],
      "enabled": true,
      "components": [
        {
          "id": "component_gate_transform",
          "type": "transform",
          "enabled": true,
          "position": [0, 0, -3],
          "rotation": [0, 0, 0],
          "scale": [1, 1, 1]
        },
        {
          "id": "component_gate_mesh",
          "type": "mesh",
          "enabled": true,
          "modelAssetId": "asset_model_gate",
          "materialBindings": [
            { "slot": "default", "materialAssetId": "asset_material_stone" }
          ],
          "castShadow": true,
          "receiveShadow": true
        }
      ]
    }
  }
}
```

メッシュコンポーネントの形状参照は二種類に分ける。ユーザー素材ではない組み込み形状は`geometry: { kind: "builtin", primitive: "box" }`のようなtyped追加Registry reference、取り込んだ3Dモデルは`modelAssetId`の素材ID参照とする。`materialBindings[].materialAssetId`は`material`素材だけを参照する。上の二オブジェクトは同じマテリアルを共有するため、マテリアルの変更は両方へ反映される。オブジェクト固有overrideは共有素材の編集とは別のversioned componentとして扱う。

### 4.4 AssetManifest

AssetManifestはSceneDocumentから独立し、右設定の素材contextとimporterの正本になる。

```json
{
  "schemaVersion": "0.1.0",
  "assets": {
    "asset_model_gate": {
      "id": "asset_model_gate",
      "name": "Garden Gate",
      "kind": "model",
      "status": "ready",
      "source": {
        "kind": "project",
        "relativePath": "assets/source/asset_model_gate/garden-gate.glb"
      },
      "importSettings": {
        "scale": 1,
        "generateColliders": false,
        "optimizeMeshes": true,
        "importAnimations": true
      }
    },
    "asset_material_stone": {
      "id": "asset_material_stone",
      "name": "Stone",
      "kind": "material",
      "status": "ready",
      "source": { "kind": "document" },
      "properties": {
        "pbrMetallicRoughness": {
          "baseColorFactor": [0.72, 0.7, 0.65, 1],
          "metallicFactor": 0.05,
          "roughnessFactor": 0.86,
          "baseColorTexture": { "textureAssetId": "asset_texture_stone" }
        }
      }
    },
    "asset_texture_stone": {
      "id": "asset_texture_stone",
      "name": "Stone Base Color",
      "kind": "texture",
      "status": "ready",
      "source": {
        "kind": "project",
        "relativePath": "assets/source/asset_texture_stone/stone-base-color.png"
      },
      "importSettings": {
        "colorSpace": "srgb",
        "generateMipmaps": true,
        "flipY": false
      }
    },
    "asset_particle_fireflies": {
      "id": "asset_particle_fireflies",
      "name": "Fireflies",
      "kind": "particle",
      "status": "ready",
      "source": { "kind": "document" },
      "properties": {
        "maxParticles": 256,
        "duration": 4,
        "looping": true
      }
    },
    "asset_prefab_lamp": {
      "id": "asset_prefab_lamp",
      "name": "Garden Lamp",
      "kind": "prefab",
      "status": "ready",
      "source": { "kind": "document" },
      "prefabDocumentPath": "scenes/prefabs/asset_prefab_lamp.scene.json"
    },
    "asset_script_spinner": {
      "id": "asset_script_spinner",
      "name": "Spinner",
      "kind": "script",
      "status": "ready",
      "contractVersion": "1.0.0",
      "language": "ts",
      "source": { "kind": "project", "relativePath": "scripts/spinner.ts" }
    }
  }
}
```

素材kindは`model | texture | material | prefab | particle | audio | script | shader | interactivity`の閉じた集合とし、検証、設定、compiler adapterを同じ変更で揃える。`source.kind = "project"`の`relativePath`はproject root相対の`/`区切りへ正規化し、OSの絶対パス、Blob URL、tokenを保存しない。`script` kindは [4.8スクリプト](#48-scripting-script-asset--script-component) のcontractに従い、`source.kind = "project"`だけを許してコード本文と派生schemaをmanifestへ保存しない。

3Dモデル / テクスチャは次のmetadataを持つ。

```json
{
  "sourceMetadata": {
    "mediaType": "model/gltf-binary",
    "byteLength": 184320,
    "sha256": "sha256:source-content-hash"
  },
  "derived": {
    "status": "ready",
    "importerVersion": "gltf-importer@1",
    "sourceHash": "sha256:source-content-hash",
    "artifacts": [
      {
        "role": "runtime-model",
        "relativePath": ".cache/assets/asset_model_gate/garden-gate.glb",
        "mediaType": "model/gltf-binary"
      }
    ]
  }
}
```

derivedは元データhashとimporter versionから再生成できるcacheとし、欠落しても元データから復元できる。

外部カタログから取り込んだ素材は、配布元、作者、ライセンス、配布ページURLを`attribution`として保持し、公開時の生成物へも同じ情報を出力する（[6.8](#68-外部リソースカタログ)）。

### 4.5 EditorSession と Editor State

`EditorSession`は読み込んだ三つのroot document、参照されるプレハブ / folder documentと一時状態を束ねるが、document自体と同一視しない。

```text
EditorSession
  project: VisualProjectDocument
  scene: SceneDocument
  assets: AssetManifest
  sceneSelection: { kind: "entity", entityIds: string[], primaryId: string } | null
  assetSelection: { kind: "asset", assetIds: string[], primaryId: string } | null
  inspectorContext: { kind: "entity", entityId: string } | { kind: "asset", assetId: string } | null
  mode: "edit" | "play"
  history: CommandHistory
  importQueue: ImportQueueEntry[]
  revisions: { project: number, scene: number, assets: number }
```

シーン、オブジェクト一覧、素材、設定はdocumentを直接書き換えず、EditorSessionへCommandまたはIntentを渡す。

- `SelectEntityIntent`は`sceneSelection`を変え、シーン、オブジェクト一覧、右設定のオブジェクトcontextを同期する。`SelectAssetIntent`は独立した`assetSelection`を変え、素材と右設定の素材contextを同期する。どちらも通常の選択だけでは元に戻す履歴に入れない。
- マテリアルやテクスチャを選択しても`sceneSelection`を解除しない。右設定は`inspectorContext`に従って素材propertiesを表示し、headerのpinnedオブジェクトtabから保持済み`sceneSelection`へ戻れる。オブジェクトを選び直しても`assetSelection`は明示的な素材選択解除まで保持する。
- `PlaceAssetIntent`は素材IDとドロップ位置を検証し、SceneDocumentにオブジェクトを追加するCommandへ変換する。
- `ImportFilesIntent`は外部Fileを取り込みQueueへ渡し、成功するまでSceneDocumentとAssetManifestを変えない。
- `UpdateEntityComponentCommand`はSceneDocument、`UpdateAssetCommand`はAssetManifestだけを変更する。
- documentの変更は対象revisionを増やし、保存成功時のrevisionと比較して未保存状態を決める。

カメラ位置、panel layout、検索、hover、`inspectorContext`、ギズモ操作中の一時値はEditor Stateであり、authoring documentやauthoring元に戻す履歴に入れない。panel layoutは別のversioned Editor Preferencesとして保存する。Place、マテリアルassign、duplicate、delete、プレハブ作成などdocumentと選択を同時に変えるCommandは、前後の`sceneSelection`と`assetSelection`を一つのselection snapshotとして履歴へ持つ。

### 4.6 PlaySession と実行環境 profile

動作確認の実行中だけ存在する値は`PlaySession`のEditor Runtime Stateとする。SceneDocumentとAssetManifestのsnapshotからauthoring objectと参照を共有しない実行環境sceneを作り、停止で必ず破棄する。中央は通常のシーンから境界とheaderが異なる`Play Window`へ切り替え、オブジェクト一覧と設定が編集データ、動作確認の画面が実行コピーを表示していることを同時に読めるようにする。

- `WorldPlayProfile`: spawnの解決、world navigation、character / physics実行環境を組み立てる。
- `ItemPreviewProfile`: XRiftから渡されるitem transform、preview stage、camera、interactionを組み立てる。player spawnを前提にしない。
- `InputAdapter`: keyboard、gamepad、XR controllerなどを正規化したactionへ変換する。
- `ControllerPlugin`: actionから実行環境avatarまたはpreview targetの状態を更新する。
- `PhysicsRuntimePlugin`: collision、gravity、stepを担当する。未導入時は明示的なno-physics実装を使う。
- `RuntimePlugin`: `start`、`update`、`stop`、`dispose`のlifecycleを持つ。
- `entityRevisions`: オブジェクトIDごとの実行環境世代。許可されたauthoring変更を反映する時だけ対象オブジェクトを増分し、そのオブジェクトのplugin、animation mixer、physics bodyをdisposeして再生成する。

ワールドプレビューのkeyboard / gamepad / XR actionは`InputAdapter`、移動とphysicsは登録済み`ControllerPlugin` / `PhysicsRuntimePlugin`で処理する。controller固有の一時実行環境stateをproject documentへ保存せず、アイテムプレビューProfileにはworld navigationを適用しない。

動作確認中もオブジェクト選択、位置・回転・大きさ、衝突判定、Animation、オブジェクト一覧構造、オブジェクト追加・削除・複製・親変更・コンポーネント追加のauthoring Commandを許可する。これらは通常どおり履歴と自動保存へ入り、PlaySessionは更新後の実行環境inputをコピーして追加・削除・更新されたオブジェクトだけを差分同期する。MCP書き込みも同じrevision検査と同期経路を使う。素材、マテリアル、シーンsettingsと実行環境生成値の書き戻しは無効にする。停止はinput listener、animation frame、controller、physics、XRSessionをdisposeし、実行環境の位置や速度をdocumentへ書き戻さず、最新のauthoring SceneDocument / AssetManifestと編集の選択・カメラへ戻す。

### 4.7 Component / Asset Registry

設定、validation、compilerの食い違いを防ぐため、コンポーネント`type`と素材`kind`ごとにtarget-neutralなschema、default、対応project kind、設定field、reference ruleを一か所へ定義する。Three preview、R3F、XRift world、XRift itemのadapterは別層に置き、同じコンポーネントtype / 素材kindへ登録する。未知type / kindまたは対応adapterの欠落は無視して続行せず、document path、オブジェクト / 素材ID、field、targetを含む診断にする。

#### Material schema: glTF 2.0 core

マテリアルschemaはKhronos glTF 2.0 coreのmetallic-roughnessマテリアルを欠落なくtyped schemaとして持ち、import、右設定、preview、compilerで同じfieldを使う。

| glTF core field | Authoring表現と既定値 | 検証と意味 |
| --- | --- | --- |
| `pbrMetallicRoughness.baseColorFactor` | RGBA `[1, 1, 1, 1]` | 4要素すべて有限数かつ`0..1`。textureと乗算する。Aはalpha coverage |
| `pbrMetallicRoughness.baseColorTexture` | `TextureInfo`または未設定 | RGBはsRGB、Aはlinear。premultiplied alphaにしない |
| `pbrMetallicRoughness.metallicFactor` | `1` | 有限数かつ`0..1`。metallic-roughness textureのB channelと乗算 |
| `pbrMetallicRoughness.roughnessFactor` | `1` | 有限数かつ`0..1`。metallic-roughness textureのG channelと乗算 |
| `pbrMetallicRoughness.metallicRoughnessTexture` | `TextureInfo`または未設定 | linear。G=roughness、B=metalness。R/Aはこの用途では無視 |
| `normalTexture` | `NormalTextureInfo`または未設定 | linear tangent-space RGB、`scale`既定`1`。Aは無視 |
| `occlusionTexture` | `OcclusionTextureInfo`または未設定 | linear R channel、`strength`既定`1`かつ`0..1` |
| `emissiveTexture` | `TextureInfo`または未設定 | RGBはsRGB、Aは無視 |
| `emissiveFactor` | RGB `[0, 0, 0]` | 3要素すべて有限数かつ`0..1`。emissive textureと乗算 |
| `alphaMode` | `OPAQUE` | `OPAQUE` / `MASK` / `BLEND`のいずれか。base color alphaの解釈を決める |
| `alphaCutoff` | `0.5` | `MASK`の時だけ有効な有限数かつ`>= 0`。他modeでは保存・出力しない |
| `doubleSided` | `false` | trueではback-face cullingを無効にし、裏面法線を反転して評価する |

不透明度は`baseColorFactor[3]`と`baseColorTexture`のalphaを乗算し、`alphaMode`と`alphaCutoff`で解釈する。別の`opacity` fieldは追加しない。UIの「透明度」欄ではこの関係をまとめて示す。alphaを変更しただけで`alphaMode`を`BLEND`へ自動変更しない。

`TextureInfo`のcoreとextensionは次のように分ける。

| Field | glTF区分 | Authoringの扱い |
| --- | --- | --- |
| texture `index` | core | `textureAssetId`として安定ID参照へ変換する |
| `texCoord` | core | `TEXCOORD_n`の`n`。既定`0`。対象primitiveに同じattributeが必要 |
| normal `scale` | core specialized TextureInfo | normal X/Yの強度。テクスチャ全体ではなくマテリアル枠に保存 |
| occlusion `strength` | core specialized TextureInfo | occlusionの強度。マテリアル枠に保存 |
| `offset`、`rotation`、`scale` | `KHR_texture_transform` extension | core fieldと混ぜず、typed extension blockに保存。offset `[0,0]`、rotation `0` radians、scale `[1,1]` |
| extension内`texCoord` | `KHR_texture_transform` extension | extension対応時にcore `texCoord`を上書きする。core fieldとは別に表示する |

`KHR_texture_transform`の`extensionsUsed` / `extensionsRequired`とfallback UVの有無も診断する。任意のextension JSONをマテリアルへ流し込まず、Registryに登録したtyped extensionだけをactive authoring dataとして扱う。

色空間はファイルのICC profileではなくマテリアル枠の用途で決める。base colorとemissiveのRGBはsRGB decode、metallic-roughness、normal、occlusion、alphaはlinearとする。同じ元データimageを異なる用途で共有する場合、元データを複製せず、用途別recipe / derived artifactを分ける。設定には「sRGB画像」ではなく「基本色: sRGB」「法線マップ: Linear」のように参照先の意味を表示する。

#### マテリアル枠、影、import の対応

glTFは一つのメッシュに複数のメッシュprimitiveを持ち、各primitiveがマテリアルを一つ参照できる。3Dモデルimporterはmaterial名だけでなく、メッシュindex、primitive index、元material indexから安定したslot IDを作り、3Dモデルの素材のderived metadataにslot一覧を持つ。`MeshComponent.materialBindings[]`はslot IDごとにマテリアルIDを一つ参照し、slot重複、欠落、別kindの参照をvalidation errorにする。組み込みprimitiveは`default` slot一件を使う。

再importでprimitive構成が変わった場合は、元index、名前、構造fingerprintの順にbindingを照合する。自動対応できないbindingは削除や別slotへの推測をせず`stale-binding` diagnosticとし、右設定から置換先を選べるようにする。

`castShadow`と`receiveShadow`はXRift Studioのメッシュコンポーネント / target adapter用authoring設定であり、glTF 2.0 coreマテリアルfieldではない。glTF importではprofileの既定値を入れ、マテリアルから推測しない。glTFへ再出力する場合もマテリアルJSONへ追加せず、XRift compiler adapterが実行環境設定として扱う。`maxDistance`も同じくrenderer adapterの設定で、`0.1..1,000,000`の有限値または未設定を受け付け、`null`更新でシーンCameraの`far`へ戻す。`doubleSided`はマテリアル、影と描画距離はオブジェクト / メッシュと、UI sectionと保存先を分ける。

#### Material extension Registry

マテリアルschemaはcore metallic-roughnessを完全対応し、extensionをcore fieldのように見せない。typedマテリアルextensionは`KHR_materials_iridescence`を最初の対応とし、`iridescenceFactor`、`iridescenceTexture`、`iridescenceIor`、`iridescenceThicknessMinimum`、`iridescenceThicknessMaximum`、`iridescenceThicknessTexture`をKhronos schemaに沿って一つのextension adapterで扱う。factor既定`0`、屈折率既定`1.3`、thickness既定`100nm..400nm`とし、iridescence textureのlinear R channelとthickness textureのlinear G channelを使う。minimumがmaximumを超える値は確定せず、`KHR_materials_unlit`との同時利用も拒否する。

`KHR_materials_clearcoat`、`KHR_materials_transmission`、`KHR_materials_ior`、`KHR_materials_volume`、`KHR_materials_sheen`、`KHR_materials_specular`、`KHR_materials_anisotropy`、`KHR_materials_emissive_strength`、`KHR_materials_unlit`、`KHR_materials_dispersion`などは、一つずつtyped adapter、validation、設定section、preview adapter、compiler adapterを揃えてRegistryへ登録する。未対応の`extensionsRequired`があるmodelはreadyにせず、extension名と対応策を示す。未対応のoptional extensionはcore fallbackのpreviewと差異が出ることを診断し、元データは非破壊で保持する。

`KHR_texture_basisu`と`EXT_texture_webp`はマテリアルmodelではなくテクスチャ元データを差し替えるglTF extensionとして別Registryに置く。KTX2 / WebPをcore PNG / JPEGと同一fieldのように保存しない。

#### Custom Shader Material

GLSLを直接書くマテリアルはシェーダー素材として持つ。シェーダー素材はUTF-8のGLSL元データとhashを管理下に保存し、マテリアル側はシェーダー素材ID、typed uniform values、テクスチャuniformの素材ID参照を持つ。Studio動作確認、Editorプレビュー、生成物は同じuniform descriptorを読む。空の背景シェーダーと水面マテリアルもこの仕組みの上に置き、シーンの風とライトを共通入力として受け取る（[マテリアルカタログ仕様](./MATERIAL_CATALOG_SPEC.md)）。

#### マテリアルの新規作成

素材の「作成」から「マテリアル」を選び、名前とauthoringプリセットを指定する。既定プリセットは「標準サーフェス」として白、不透明、metallic `0`、roughness `0.7`、double-sided offを明示し、Khronos coreの省略時既定値と同一だと誤解させない。「glTF既定値」プリセットを選んだ場合だけmetallic / roughnessを`1`にする。

作成成功では`source.kind = "document"`のマテリアルを一つAssetManifestに追加し、素材で選択して右設定に表示する。オブジェクトやマテリアル枠へ自動bindingしない。空の名前、重複ID、無効なプリセットではAssetManifest、selection、historyを変えず、field近くに修正方法を示す。表示名の重複は許してIDで識別し、必要なら同名件数を表示する。取消では素材の直前selectionと設定contextへ戻る。

#### コンポーネント定義と XRiftのコンポーネント

コンポーネントRegistryは「保存schema」と「各targetで実行できるadapter」を分離し、少なくとも次を登録単位にする。

```text
ComponentDefinition
  type / schemaVersion / displayName / semanticIcon
  allowedProjectKinds / defaults / inspectorSections
  referenceFields / validation / migration
  previewAdapter / worldCompilerAdapter / itemCompilerAdapter
```

基礎componentは位置・回転・大きさ、メッシュ、ライト、衝突判定、物理挙動、音源、開始位置、地形とする。パーティクルはパーティクルにemitter、shape、lifetime、rate、size / color curve、マテリアル / テクスチャ参照などの再利用可能なeffect definitionを持たせ、オブジェクトの`ParticleRendererComponent`はパーティクルIDとオブジェクト固有のplay / loop / seed設定だけを参照する。パーティクルの値をメッシュやオブジェクトへinline copyしない。地形は高さサンプルと草の散布ルールを持つ静的メッシュであり、固定のメッシュと同じ形衝突判定を伴う（[地形エディター仕様](./TERRAIN_EDITOR_SPEC.md)）。

XRift固有componentは`xrift.*` namespaceと明示的なworld / item profileを持たせる。Registryにschema、設定、preview、対象compiler adapterがすべて揃ったcomponentだけを作成可能にし、任意のJavaScript componentや文字列で指定されたmoduleをvisual documentからロードしない。スクリプトのコンポーネントだけは例外で、visual documentではなくproject内のスクリプト元データfileをasset IDで参照する。document側が持つのは参照と宣言済みproperty値だけで、コード文字列は持たない（[4.8スクリプト](#48-scripting-script-asset--script-component)）。preview adapterがないがcompiler adapterはある場合は「プレビュー未対応」を表示し、偽の見た目で代用しない。targetに対応しないcomponentは保存時warning、compile前errorとし、別project kind向けに黙って削除しない。

authoring Registryが型付きで扱うXRiftのコンポーネントは`Interactable`、`Grabbable`、`Mirror`、`Skybox`、`VideoScreen`、`VideoPlayer`、`LiveVideoPlayer`、`Video180Sphere`、`ScreenShareDisplay`、`SpawnPoint`、`TextInput`、`TagBoard`、`EntryLogBoard`、`Portal`、`BillboardY`とする。Propsは [公式APIリファレンス](https://docs.xrift.net/world-components/components/) ではなく、実際にstagingへインストールされる`@xrift/world-components`の公開exportを正とする。対象versionは`src/lib/xrift-cli.ts`の`COMPILER_WORLD_COMPONENTS_PACKAGE_SPEC`を単一の宣言箇所とし、`package.json`とworld実行環境shellの三箇所が一致することを`pnpm cli:test`（`scripts/check-world-components-alignment.mjs`）で強制する。生成コードは、例えば`VideoScreen`に必須の`id`と任意の`url`を出力し、`sync`は`VideoPlayer`ではなく`LiveVideoPlayer`にだけ出力する。

`EntryLogBoard`のnested partial objectはJSON objectとしてschema検証し、関数型の`formatTimestamp` / `onJoin` / `onLeave`はvisual documentにコードを保存せずpackage既定動作へ委ねる。`Interactable`の必須`onInteract`は固定のno-op adapterを生成し、任意コードをdocumentから注入しない。`DevEnvironment`はローカル起動wrapperでありシーンauthoring componentにはしない。Box / メッシュの衝突判定は`@xrift/world-components`のexportではなくRapierの物理componentとして、汎用衝突判定Registryとcompiler adapterで扱う。

### 4.8 Scripting (Script Asset / Script Component)

制作者がオブジェクトへ振る舞いを与えるための、versioned contractとして明示的に設計した例外である。
本節は設計原則7、4.3、4.7、9.4、10章、Extension policyの各規定に対する唯一の例外範囲を定める。
ここに書かれていない形の任意コード実行は対象外とする。

#### 分離の原則

パーティクルと同じ関係を採る。再利用可能な定義は素材側に置き、オブジェクト側は参照とオブジェクト固有の値だけを持つ。

- **スクリプト** は`kind: "script"`、`source.kind = "project"`の素材とし、実体はproject内の`scripts/`以下のTypeScript元データfileとする。AssetManifestに持つのは参照とlanguage、contract versionだけで、**コード本文と派生したproperty schemaをmanifestへ保存しない**。property schemaは元データから導出してEditor Stateに置く。これにより元データの編集がAssetManifestを変えず、動作確認中の保存が全オブジェクトの実行環境世代を上げない。
- **スクリプトのコンポーネント** は`scriptAssetId`、宣言済みproperty値、`assetReferences`、`entityReferences`を持つ。値は純JSONかつ有限数に限り、コード、関数、式を持たない。1オブジェクトへ複数付けられる。

#### 実行境界

- 実行は`RuntimePlugin`の`start` / `update` / `stop` / `dispose` lifecycleに従い（4.6）、動作確認の開始と停止、および`entityRevisions`によるオブジェクト単位の作り直しに従属する。
- update順序はオブジェクト階層順、次にオブジェクト内のコンポーネント並び順で確定する。個別の`useFrame`を並べず、単一のschedulerが確定順で呼ぶ。system queryや優先度指定は導入しない。
- named `Render`の役割は宣言的な追加描画だけだ。R3Fの`useFrame`はcallback例外をスクリプト単位に隔離できないため、動作確認と公開の診断で拒否し、フレーム処理は`start().update(delta)`へ統一する。
- 停止は生成したmodule、blob URL、timer、listenerを明示的に破棄する。Reactのunmountに依存しない。
- アイテムprojectは重力とRigidBodyを持たないため、物理へ触るAPIは未対応としてdegradeし、動くふりをしない。

#### 音声 / 音源の所有境界

- 音声素材はproject管理下のMP3 / WAV原本とformat、MIME、byte lengthを持ち、外部絶対pathやbytesをAssetManifestへ保存しない。編集のシーンは音源をiconで示すだけで元データを取得・再生せず、動作確認と`classic-jsx`生成物は同じ音源実行環境を使う。
- Studio動作確認がmanaged音声を読むnative境界は`assets/`配下のproject-relative pathだけを受け付ける。path traversal、通常file以外、symlink / reparse point、128 MiB超過、拡張子とMP3 / WAV signatureの不一致、read中のsize変化を拒否してからdata URLを実行環境へ渡す。
- `ctx.assets.loadAudio`はスクリプトownerが独立playerを作るAPIであり、保存済み音源コンポーネントを操作しない。`ctx.audioSources`はattachedオブジェクト自身の音源だけを`componentId` / `audioAssetId`で選び、play / pause / stop / seek / volume / loopをowner単位で上書きする。子オブジェクト、別オブジェクト、共有音声素材を変更しない。
- 同じオブジェクトの複数スクリプトはコンポーネント順で音源overrideを合成する。スクリプト再起動、実行時の失敗、停止ではそのownerの再生要求とoverrideを外し、音源コンポーネントの保存値へ戻す。browser / webviewのautoplay policyで拒否されても`play()`は例外を外へ出さず開始件数0をresolveし、`list().status`を`autoplay-blocked`にする。シーン全体を止めず、ユーザー操作後の再試行を許す。
- 音源のvolume / loop / autoplay /距離propertyは既存実行環境へ更新し、音声素材参照、spatial、enabled、コンポーネント追加・削除は対象オブジェクトだけを再同期する。編集時に音声素材を`place_asset`すると参照設定済み音源オブジェクトを作り、既存オブジェクトには`core.audio-source`のadd / update / removeを使う。
- `import_audio_asset`は編集mode限定で、trustedな絶対pathをnative側の通常file、no-link、128 MiB、extension + signature、read前後size検査へ通し、content-addressed copy、atomic commit、history、自動保存を一件で確定する。`get_audio_asset`とimport結果は管理下relative pathとmetadataだけを返し、外部path、data URL、binary bytesをMCPへ返さない。
- `import_model_asset`は単一ファイルのGLB / glTF / VRM / OBJを同じnative file境界で検証し、`get_model_asset` / `update_model_asset`でimport設定とマテリアル枠defaultを保存する。`reimport_model_asset`は管理下元データを再解析してderived metadataを3DモデルIDと参照を維持したままatomicに更新する。`import_skybox_asset`はHDR / EXRのequirectangularテクスチャをシーンskyboxへ設定し、`set_project_thumbnail`は既存のテクスチャから管理下thumbnailだけを更新する。
- `import_shader_asset`はUTF-8 GLSL元データを管理下シェーダー素材へ追加し、`get_shader_asset` / `update_shader_asset`は元データ本文とhashを同じrevision、history、自動保存境界で扱う。任意の外部pathやshell操作は実行せず、シェーダー元データは明示的なMCP入力またはmanaged local importだけを受け付ける。
- `create_prefab`は選択オブジェクトと子孫をプレハブdocumentへ複製し、プレハブ、managed document path、dependency referencesを一つのEditor revisionへ確定する。作成後はプレハブを選択し、`place_asset`で再利用できる。
- `ctx.audioSources`はruntime-onlyでSceneDocument revisionを変えない。保存する音源設定は`place_asset`、`add_component`、`update_component`、`remove_component`を使い、実行環境状態を暗黙に永続化しない。

#### ライトと実行環境 event の所有境界

- Studio動作確認と`classic-jsx`生成物は同じ`XriftScriptLight`とライトbridgeを使う。disabledのライトもbridgeをmountしたまま描画だけを止め、スクリプトから動作確認中に一時点灯できるようにする。Directional / Spotのtargetもこの共通実行環境で構成し、Editorと公開ワールドで向きを別実装にしない。
- `ctx.lights`はattachedオブジェクト自身のライトだけを`componentId` / `lightType`で選び、enabled、color、intensity、Point / Spotのdistanceをowner単位で上書きする。子オブジェクト、別オブジェクト、シーン環境ライト、共有設定を暗黙に変更しない。late mountまたは置換されたライトにも同じ選択規則を適用する。
- 同じオブジェクトの複数スクリプトはコンポーネント順でライトoverrideを合成する。同一スクリプト内ではfieldごとの最後の変更を優先し、スクリプト再起動、実行時の失敗、停止ではそのownerだけを外してライトのコンポーネントの保存値へ戻す。`reset()`は呼び出したスクリプトownerのoverrideだけを外す。
- 設定 / MCPによるenabled、color、intensity、shadow、distance、decay、angle、penumbra、Area sizeの永続変更は既存ライト実行環境へ即時反映する。ライト種別とコンポーネント追加・削除は構造変更として対象オブジェクトだけを再同期する。`ctx.lights`はruntime-onlyでSceneDocument revisionを変えず、永続化には`core.light.*`の`add_component` / `update_component` / `remove_component`を使う。
- スクリプトevent busは同じ`XriftScriptRoot`内だけにあり、payloadをSceneDocumentへ保存せず、KHR_interactivityへ暗黙に接続しない。近接判定はスクリプトのコンポーネントで明示参照したauthoredオブジェクトの`getWorldPosition`を使う。実行環境player / avatarは`ctx.find`へ公開しないため、player近接を実装済みと表示しない。
- 組み込み`proximity-event`は固定event名`xrift:proximity-state`へ`channel`、inside状態、`sourceEntityId`、`kind: enter | exit | sync`を送る。enter / exitは境界遷移時だけ一度送り、syncはlive channel変更と後から起動したreceiverの状態同期に限定する。停止・削除時は同元データのexitを送る。`event-light`はchannelごとのactive元データをSetで追跡するため複数sensorの一つが退出しても残りを維持する。event名の動的変更でlistenerを残留させず、スクリプトの停止・再起動時に購読を確実に解除する。

#### テクスチャ / マテリアルの所有境界

- `ctx.assets.loadTexture`はスクリプトのコンポーネントの`assetReferences`にあるテクスチャだけを受け付ける。実行環境resolverはURLだけでなく、素材ID、`colorSpace`、画像の繰り返しと補間のwrap / mag / min filter、`flipY`、`generateMipmaps`をdescriptorとして動作確認hostと公開adapterの両方へ渡す。
- スクリプトが省略したload optionはテクスチャの読み込み設定を継承し、明示したfieldだけをスクリプトinstanceの読み込みへ優先する。`generateMipmaps: false`とmipmap filterの組み合わせは`linear`へ正規化する。Studio動作確認と生成物で別の暗黙defaultを持たない。
- `ctx.materials`はattachedオブジェクト自身のownedメッシュだけへ実行環境overrideを重ねる。`setTextureTransform`はマテリアル枠ごとのテクスチャcloneに`offset`、`repeat`、`center`、`rotation`を適用し、読み込んだ元データテクスチャ、共有テクスチャ、別slot、子オブジェクト、別オブジェクトを変更しない。
- スクリプトの再起動、実行時の失敗、停止では、そのスクリプトownerのマテリアルclone、テクスチャclone、override、読み込みcacheを破棄する。`resetTextureTransform(slot)`は実行中に指定slotのtransformだけを戻し、他スクリプトownerのoverrideを外さない。
- `ctx.assets` / `ctx.materials`はruntime-onlyで、AssetManifest revisionを変更しない。保存するテクスチャの読み込み・繰り返し・補間設定は`get_texture_asset` / `update_texture_asset`、マテリアルのPBR / テクスチャbindingは`get_material_asset` / `update_material_asset` / `set_material_texture_transform`、メッシュの割り当て枠への割当は`set_material`を使う。新規localテクスチャimportは編集modeの`import_texture_asset`に限定する。
- `get_scripting_capabilities`は上記の素材default、明示optionの優先順位、filter / mipmap、clone隔離と、実行環境一時操作 / MCP永続操作のtool対応を機械可読に返す。MCP clientがスクリプトAPIから永続化を推測しないようにする。

#### 動的評価の限定

- Editorの動作確認では、元データをMonacoと同梱したTypeScript serviceの`transpileModule`で変換し、生成したmoduleを評価する。言語サービスworkerはEditor補完と診断に限定し、動作確認開始時のmodel同期を挟まない。これが本節で認める唯一の動的評価であり、対象はproject内のスクリプト元データfileに限る。visual document内の文字列を評価しない。
- 許可したbare specifierはStudioが既に読み込んでいる同一moduleインスタンスへ解決する。`three`を二重ロードしない。
- remote module importは動作確認・公開とも拒否する。対応specifierは`SCRIPTING.md`と実装の許可リストを参照する。
- 生成コードは静的importだけを出力する。`eval`、`Function`、動的importを生成物へ出さない（9.4）。

#### 権限と残存リスク

動作確認はiframeやWorkerを挟まないアプリと同一realmで動き、`withGlobalTauri`によりIPC bridgeが`window`に露出している。したがってスクリプトは原理的にアプリと同じ権限を持つ。

- module scopeで`window`、`globalThis`、`__TAURI__`、`fetch`、`document`、`Function`などを遮蔽する。ES moduleは常にstrict modeであり`eval`をlexical bindingとして宣言すると構文エラーになるため、`eval`は遮蔽一覧へ入れない。同一realmである以上これは完全なsandboxではなく、事故と素朴な悪用を止める緩和である。この限界を [スクリプトContract](./SCRIPTING.md) に明記し、隔離済みと表示しない。
- スクリプトのfingerprintは実行版の診断とhot reloadに使い、承認情報として保存・照会しない。
- UIとMCPは保存済みScriptを追加承認なく変換・実行する。`unapprovedPolicy`は旧clientとの互換引数で実行可否に影響しない。変換失敗時はEditを保ち、hot reload失敗時はlast-good moduleを維持する。現行の契約は [SCRIPTING.md](./SCRIPTING.md) を参照する。
- debug buildだけに登録するprivileged Tauri MCP bridgeは、webview JavaScript実行とTauri commandの`invoke`を許す開発者向けautomationであり、stdio MCP editor tools / serverのtrust boundaryには含めない。release buildには同bridgeを登録・搭載せず、スクリプト承認の公開APIとして扱わない。
- 完全な隔離と、10章が求めるCSPの適用は未達である。Monacoはlocal同梱済みだが、動作確認のblob moduleと共有module bridgeを許可しながら権限を狭めるCSP設計を要する。

#### 公開

- スクリプト元データとhost adapterをstagingのoverlay fileとして出力し、生成した`src/World.tsx`から静的importで参照する。`.ts` / `.js`は静的素材として許可しないため、必ずoverlay fileとして出す。
- stagingへinstallできるnpm packageは既存のallow-listに限る。スクリプトが任意packageを要求する形は取らない。
- 実行環境JSON出力はスクリプトを表現できないため、選択された場合はblocking診断とする。未処理のままmanifestへ素通しさせない。
- 同じ入力から同じ出力を得る決定性を維持する。生成する識別子はhash由来とし、挿入順や時刻に依存させない。

### 4.9 Interactivity (KHR_interactivity)

コードを書かずに時間とイベントで動く振る舞いを組むための仕組みである。スクリプトとは別の道具として並立させ、どちらか一方へ寄せない。

- 保存形式は独自graphではなくglTFの`KHR_interactivity` extension objectそのものとする。ノードグラフ素材は`extensionName`、`specStatus`、`extension.graphs`を持ち、ノードごとの表示位置だけを`extras.xriftStudio.position`に置く。React Flowのstateを可搬な正本にしない。
- ノードエディターはビジュアルエディターの中央から右へdocked modalとして開き、シーンの左側を残す。振る舞いを組みながらシーンの状態を確認できる。
- UIからの書き込みもMCPからの書き込みも、同じvalidatorを通してから確定する。検証対象はdeclaration / ノード / flow / value-source / typeのindex、RCの型シグネチャ、inline・type-default・connectedのvalue元データ、value connectionが先行ノードを指すこと、flow connectionが後続ノードを指すこと、ノードのdeclaration有無、editor安全のためのgraph / ノード数上限とする。構造errorは書き込みをatomicに拒否し、未知のextension operationはwarningに留めて破壊しない。
- 未知のextension-defined operationは保存したまま保持する。理解できるoperationにだけ専用接続口templateを与え、独自イベント名やJavaScriptへ置き換えない。
- MCPからは`list_interactivity_operations`、`get_interactivity_asset`、`create_interactivity_asset`、`add_interactivity_node`、`connect_interactivity_nodes`、`set_interactivity_value`、`set_interactivity_configuration`、`disconnect_interactivity_socket`、`delete_interactivity_node`、`validate_interactivity_asset`を提供する。書き込みtoolは他の編集toolと同じく`projectId`、`sceneId`、`expectedRevision`を要求し、staleなsnapshotへの適用を防ぐ。
- 実行環境adapterはoperation単位で実装する。未対応operationはcanonical JSONに保持したままno-opとし、任意JavaScriptへ翻訳しない。WebXRのcontroller / input取得はアプリ側の責務であり、graph eventへは実行環境adapterの境界で接続する。

詳細は [KHR_interactivity Editor / MCP design](./KHR_INTERACTIVITY_EDITOR.md) に置く。

### 4.10 schemaVersion と migration

documentを跨いだ互換規則を一か所に集める。個別sectionへ互換の例外を散らさない。

- VisualProjectDocument、SceneDocument、AssetManifest、プレハブdocument、folder documentはそれぞれ`schemaVersion`を必須とし、依存順に段階的なmigrationを通す。
- migrationは元データを直接壊さず、移行後のコピーを検証してから保存する。検証を通らない場合はclassicと推測して開かず、対象fieldと修復手段を示す。
- 読み込み時にだけ受け付ける旧表現は、次の対応で現行schemaへ移す。編集・再保存の出力には使わない。

| 旧表現 | 現行schema | 移行規則 |
| --- | --- | --- |
| 素材kind `template` | 素材kind `prefab` | user-facing名と一致させる。旧`templatePath`は`prefabDocumentPath`として検証する |
| 素材kind `primitive`の内部record | 追加Registryのbuiltin geometry reference | メッシュコンポーネントの`geometry: { kind: "builtin", primitive }`へ移す。ユーザー素材として一覧に出さない |
| メッシュコンポーネントの`geometryAssetId` | `geometry`または`modelAssetId` | 参照先がbuiltinなら`geometry`、3Dモデルの素材なら`modelAssetId`へ振り分ける |
| マテリアルの`color` / `metalness` / `roughness` / `*TextureId` | glTF core metallic-roughness | base color factor、metallic / roughness factor、typed TextureInfoへ移す |

マテリアルの移行では、旧表現になかったalpha、emissive、normal、occlusion、sampler、texture transform、extensionをglTF既定値または未設定として明示し、推測した画像やmodeを追加しない。移行結果は`UpdateAssetCommand`としてAssetManifestにだけ保存し、動作確認中は読み取り専用にする。

未知kind、未知コンポーネントtypeへ推測変換しない。新しいkindの追加は、閉じた検証集合、設定、compiler adapterを同じ変更で揃え、既存projectを読めなくするschema versionの引き上げを伴わない。

## 5. XRift Studio のコード境界

### 5.1 責務分離の方針

ビジュアルエディターは、次の責務を明確な境界で分ける。

- authoring documentとschema: シーン、素材、マテリアル、プレハブの永続データとmigration
- editor session: query、selection、command、history、reference解決
- React UI: オブジェクト一覧、シーン、設定、素材と操作状態
- preview / play実行環境: Three.jsによる編集表示と成果物種別ごとの実行環境
- native processing: Tauriによるファイル操作、CLI、変換、検査、upload
- generated outputs: thumbnail、texture変換、staging artifactなどの再生成可能な成果物

package構成そのものを目的にせず、シーンData、Editor API、UI、実行環境、native processingの依存方向と実行境界を固定する。

### 5.2 単一 package と module 境界

XRift Studioは単一packageを維持し、その中でdocument / command / asset processing / UIのmodule boundaryを固定する。build、型解決、Tauri path、プレビュー配布設定を同時に動かすmonorepo化は、独立実行環境または複数consumerが実在するまで行わない（5.3）。

後から抽出できるよう、依存方向は最初から固定する。

```text
src/lib/visual-editor/
  project-document.ts     VisualProjectDocument
  scene-document.ts       SceneDocument
  asset-manifest.ts       AssetManifest
  schema/                 component / asset schema、migration、reference validation
  selection.ts            sceneSelection / assetSelection と snapshot
  commands.ts             Command、CommandDispatcher、transaction
  history.ts              Undo / Redo と selection snapshot
  asset-api.ts            Asset query、参照数、import intent
  drop-intents.ts         Scene drop と external file drop の判別
  runtime-profile.ts      World Play / Item Preview の抽象契約
  play-session.ts         World / Item profile と runtime lifecycle
  editor-session.ts       上記 API を束ねる façade
  compiler-contract.ts    visual documents、診断、staging output の契約

src/components/visual-editor/
  VisualEditor.tsx
  hierarchy/
  viewport/
  inspector/
  assets/
```

依存方向は`components/visual-editor -> EditorSession façade -> documents / commands / asset API / play session`の一方向にする。`lib/visual-editor`はReact、Three.js、Tauri、DOMに依存させない。UIはdocument mutatorを直接importせず、typed Selection、queryとCommand / IntentだけをEditorSessionへ渡す。これによりオブジェクト一覧、Viewport、設定、素材が独自の履歴や参照解決を持つことを防ぐ。

entity、asset、selection、history、schemaを画面実装から分けるため、次を一つのEditorSession境界として扱う。

- 独立したtyped `SceneSelection`と`AssetSelection`、両方を束ねる`SelectionSnapshot`
- `CommandDispatcher`と`CommandHistory`
- Asset query / import / reference API
- コンポーネント / 素材SchemaとReference API
- `DropIntent = PlaceAssetIntent | ImportFilesIntent`
- `PlaySession = WorldPlaySession | ItemPreviewSession`

描画はsnapshotを読み、変更はCommandを発行する。ネイティブのファイル操作とCLI実行は`src/lib/tauri.ts`と`src/lib/xrift-cli.ts`の境界を越えて呼ぶ。

この境界に属するexportだけを公開し、UIから内部オブジェクトを直接書き換えない。機能を移動する時もimport互換を一時的なre-exportで保つ。

### 5.3 package を分ける条件

次のいずれかが実行環境・利用者・リリースの独立性を明確に示す形で発生した時点、または複数の弱い兆候が継続した時点でpnpm workspaceへの移行を決める。「二つ以上」を機械的な必須条件にはしない。

1. デスクトップアプリとWebエディターが、それぞれ独立した配布周期を持つ。
2. CompilerをCLIやCIからUIなしで利用する、二つ目の実利用者ができる。またはcompiler自体が独立実行環境として配布・version管理を必要とする。
3. 素材ProcessorをWorker、Node.js、WASMなど別実行環境で実行する。
4. VisualProjectDocument / SceneDocument / AssetManifestまたはRegistryを公開APIとしてSemVer管理する必要が出る。
5. アプリ全体を起動しないとcoreのtestができず、開発フィードバックが継続的に遅くなる。
6. Tauri専用依存とWeb専用依存の分離が、条件分岐やbundleサイズの問題を実際に起こす。

ファイル数や見た目上の整理だけを移行理由にしない。逆に、上の条件が満たされた後も単一packageに留めると実行環境境界とリリース境界が曖昧になるため、その段階では分割を採る。

### 5.4 分割の順序

分割する場合も一度に全面移行せず、利用者が確定したpackageから抽出する。

1. 単一package内で`lib/visual-editor`を純粋ロジック、`components/visual-editor`をUIとして分離する。
2. formatのEditor / Compiler consumerが独立releaseまたは実行環境を必要とした時に`packages/visual-project-format`と`packages/compiler`を抽出し、既存importはre-exportで維持する。
3. Webエディターの独立配布が始まった時: `apps/desktop`と`apps/web-editor`を作り、共有UIが実在する範囲だけ`packages/editor-ui`へ移す。
4. 素材Processorが別実行環境になった時: `packages/asset-contracts`を共有し、実装は`workers/asset-processor`または専用appへ置く。
5. 各段階でtypecheckと開発サーバーを先に通し、Tauri、プレビュー、生成先のパスを一段階ずつ移す。

到達形の候補は次の通りである。空packageを先に作らない。

```text
apps/
  desktop/
  web-editor/
packages/
  visual-project-format/
  editor-core/
  component-registry/
  compiler/
  xrift-adapters/
  editor-ui/              二つの app が本当に共有する場合だけ
workers/
  asset-processor/        別 runtime が必要になった場合だけ
```

分割後もvisual project formatとschemaを依存グラフの最下層に置き、UI、compiler、XRift adapterが相互参照しないようにする。packageを増やすこと自体を設計の完成とせず、独立した利用者、実行環境、リリースがあるかどうかを見て境界を決める。

## 6. 素材のライフサイクル

素材はSceneDocumentから分離し、AssetManifestの安定した`assetId`で参照する。外部ファイルのimportは、ファイル操作とdocument更新を一つの未検証処理にしない。Box、Sphere、Planeなどは追加Registryの組み込みprimitiveであり、ユーザーの素材grid、import、thumbnail管理の対象にはしない。

### 6.1 Import transaction

1. `ImportFilesIntent`を取り込みQueueへ登録する。この時点ではauthoring documentを変えない。
2. ネイティブ境界または隔離Workerで拡張子、MIME、magic bytes、サイズ、ファイル名、展開後 / decode後サイズを検証する。
3. `.gltf`の場合はJSONとexternal URI一覧だけをbudget内で解析し、[6.7](#67-gltf-external-uri-policy) のURI policyに従ってdependency closureを確定する。ネットワーク取得は行わない。
4. 素材IDを払い出し、project root内の一時領域へ元データと許可済みdependencyをbyte-preserving copyしてSHA-256を計算する。
5. Importerがマテリアル、テクスチャ、3Dモデルslot metadataを正規化し、`.cache/assets/<asset-id>/`にderived artifact、thumbnail、diagnosticを生成する。
6. 元データ、dependency、マテリアル枠、TextureInfo、derived hashの参照整合性を検証する。
7. 元データを`assets/source/<asset-id>/`へ移し、AssetManifestの追加を原子的に確定する。
8. `assetSelection`を新しい素材へ移し、右設定で元データ、recipe、derived、diagnosticを表示する。`sceneSelection`とSceneDocumentは変えない。
9. 3Dモデル / プレハブをシーンへ配置した時だけ、`PlaceAssetCommand`が素材IDを参照するオブジェクトを作る。

失敗時は一時領域を片付け、SceneDocument、AssetManifest、両selection、historyを開始前のまま保つ。再importは同じ素材IDの元データhashとprocessor versionを更新し、参照中オブジェクトのIDを変えない。マテリアル枠を再対応できない場合はbindingを推測変更せずdiagnosticにする。

### 6.2 元ファイルと derived の非破壊境界

- `assets/source/`はユーザーが選んだ元データと許可済みdependencyのbyte-preserving copyを保持する。resize、mipmap生成、色空間変換、WebP / KTX2圧縮、thumbnail生成で上書きしない。
- `.cache/assets/`のderivedは元データ、dependency hashes、processing recipe、processor version、target profileから再生成できる。欠落しても元データから復元できる。
- 元データ / derived pathはproject root相対の`/`区切りにする。OSの絶対パス、元のユーザーディレクトリ、Blob URL、署名付きURL、tokenをdocumentまたはdiagnosticに保存しない。
- 表示名を変えても素材ID、元データhash、参照を変えない。元データを差し替える再importでも素材IDは維持する。
- 3Dモデル内蔵マテリアルはcore / typed extension schemaに正規化したマテリアル、image / texture / samplerはテクスチャとして作り、メッシュコンポーネントへマテリアル値をinline化しない。
- 最後に成功したderivedは再生成中もpreviewに使えるが、hashが一致しなければ「古いプレビュー」と明記し、compile / uploadの入力にはしない。

derived metadataは少なくとも次を持つ。

```text
DerivedArtifact
  role
  relativePath
  mediaType
  byteLength
  sha256
  sourceHash
  dependencyHashes
  recipeHash
  processorVersion
  targetProfile
  width / height / mipLevelCount / colorSpace   texture の場合
```

`sourceHash`、全`dependencyHashes`、`recipeHash`、`processorVersion`、`targetProfile`のいずれかが現在値と違えば`stale`とする。単なる更新日時だけでreadyを判断しない。

### 6.3 Texture processing recipe

テクスチャimportは一つの「最適化」checkboxにまとめず、右設定で次を独立して確認できるrecipeにする。

| Section | 設定 | 方針 |
| --- | --- | --- |
| 用途と色空間 | `auto / sRGB / linear`と参照slot | `auto`はマテリアル枠から決める。base color / emissive RGBはsRGB、metallic-roughness / normal / occlusion / alphaはlinear |
| Resize | `maxDimension`とaspect ratio保持 | 候補は1024 / 2048 / 4096 / 元データ。元データはtarget budget内の時だけ選べる。縦横比を変えず、元画像は保持 |
| Quality | `fast / balanced / high` | encoderごとに意味が違うため、偽の共通0..100値にしない。lossy formatではプリセットの実encoder parametersと推定容量を詳細表示 |
| Mipmap | `preserve / generate / none` | glTF samplerのminification filterがmipmapを使う場合、full mip chainがない`none`はwarningまたはcompile blocker |
| 画像の繰り返しと補間 | mag / min filter、wrap S / T | glTF coreのsamplerとして扱う。magはNEAREST / LINEAR、minはmipmapを含む6種、wrapはCLAMP / MIRRORED_REPEAT / REPEAT |
| Compression | 元データ / WebP / KTX2 ETC1S / KTX2 UASTC | PNG / JPEGはcore。WebPは`EXT_texture_webp`、KTX2は`KHR_texture_basisu`を出力し、fallbackと`extensionsUsed` / `extensionsRequired`を明示 |

KTX2ではcolor dataの容量優先にETC1S、normalやmetallic-roughnessなどnon-color dataの品質優先にUASTCを提案できるが、自動決定を隠さずrecipeに残す。KTX2はmip levelsを格納できる。WebP / KTX2はcore image MIMEを増やしたように扱わず、それぞれのglTF extension adapterを通す。未対応targetへはPNG / JPEG fallbackを生成するか、compileを止めて必要extensionを示す。

一つの元データimageをsRGBとlinearの両用途で使う場合は、元データ素材を複製せずusage-specific derivedを作る。normal mapをsRGBとして圧縮する、base colorをlinearとしてpreviewする、alphaをpremultiplyするなどslot semanticsと矛盾するrecipeは確定しない。

### 6.4 Thumbnail lifecycle

3Dモデル、テクスチャ、マテリアル、プレハブ、パーティクルのthumbnailはauthoring素材と別のderived artifactとする。

```text
pending -> generating -> ready
                      -> failed
ready -- source/recipe/generator changed --> stale -> generating
```

- `ready`は元データhash、thumbnail recipe hash、generator versionが一致した時だけにする。
- `failed` / `stale`でも素材card、表示名、diagnostic、再生成操作を残す。placeholderだけで素材が消えたように見せない。
- 3Dモデル / プレハブのframing、マテリアルの基準球、パーティクルの代表時刻はdeterministic recipeとする。シーンlightや現在cameraに依存させない。
- テクスチャthumbnailはマテリアル枠の色空間に応じたpreviewを用意し、linear dataをbase colorのようにgamma表示した結果を正しい見た目として扱わない。
- 生成中は同じ素材の重複生成を防ぎ、取消ではlast-good thumbnailを維持する。

### 6.5 Stale status と diagnostic

diagnosticは`code`、`severity`、`stage`、`assetId`、任意の`sourceUri`、`materialSlot`、`fieldPath`、短いmessage、recovery actionを持つ。元ユーザーdirectoryの絶対パスやrawデコーダーerrorをそのまま表示・保存しない。

- `stale-source`: 元データ / dependency hashがderivedと違う。
- `stale-recipe`: resize、quality、mipmap、sampler、compressionがlast-good derivedと違う。
- `unsupported-required-extension`: `extensionsRequired`に未対応extensionがある。
- `unsupported-optional-extension`: core fallbackは表示できるが見た目が異なる可能性がある。
- `missing-external-resource` / `blocked-external-uri`: external URIが欠落またはpolicy違反。
- `decode-budget-exceeded`: decode前見積りがmemory budgetを超える。
- `stale-material-binding`: 3Dモデル再import後にマテリアル枠を安全に照合できない。
- `color-space-conflict` / `mipmap-sampler-conflict`: テクスチャrecipeと参照用途が矛盾する。

素材cardは最高severityと件数だけを示し、右設定の「診断」sectionで対象fieldと「再生成」「参照を置換」「設定を開く」「元データを再選択」の一つ以上へ移動できる。warningを無視してreadyと同じ表示にしない。

### 6.6 Browser Worker と memory budget

Web / WebView importerはUI threadでglTF JSON parse、image decode、圧縮を行わない。専用Workerにtransfer可能なbufferを渡し、処理終了、取消、project切替でbuffer、デコーダー、object URL、Workerを解放する。同じArrayBufferの不要な複製を避け、テクスチャは一枚ずつdecode / encode / releaseする。

security budgetは公開APIではなく調整可能なprofileとして次を起点にする。

| Budget | 値 | 超過時 |
| --- | --- | --- |
| glTF JSON | 16 MiB | parse前に拒否し、desktop processorまたは元データ整理を案内 |
| 単一external resource | 128 MiB | resource名と上限を診断 |
| 元データとdependency合計 | 256 MiB | importを確定しない |
| external resource数 | 256 | URI一覧だけを示して確定しない |
| 単一decoded image | 128 MiB見積り | decode前にmaxDimensionの引き下げを案内 |
| Worker decoded working set | 256 MiB | concurrencyを下げ、それでも超える場合は中止 |
| texture derived maxDimension | 既定4096、hard cap 8192 | 元データは保持できてもpreview / derivedをreadyにしない |
| processor concurrency | 最大2、端末状況で1へ低下 | queueと進捗を表示 |

image header、accessor / bufferView範囲、KTX2 level indexなどから可能な限りallocation前に見積もる。`navigator.deviceMemory`の有無だけを安全判定にせず、hard budget、実測working set、AbortSignalを併用する。Worker crash / out-of-memoryではlast-saved documentsとlast-good derivedを維持し、同じ設定の自動retry loopを行わない。

### 6.7 GLTF external URI policy

glTF 2.0 coreはbuffer / imageにdata URIとrelative pathを許し、clientが追加schemeを任意対応できる。XRift Studio importerはこれより厳しいallow-listを採る。

- GLB内部bufferView、許可MIMEのdata URI、ドロップされた`.gltf`と同じimport root内に実在するrelative URIだけを受け入れる。
- `http:`、`https:`、`file:`、その他scheme、authority、drive letter、UNC、root absolute path、query、fragmentは取得しない。読み込み時に暗黙のネットワークアクセスを行わない。
- percent-decodeとUnicode normalizationを一度だけ行い、`..`、encoded traversal、NUL、backslash混在、symlink / junction越しのproject root脱出をcanonical path検査で拒否する。
- data URIはMIME allow-list、encoded length、decoded lengthをdecode前に検査する。base64の膨張分もworking setに数える。
- JSONのdeclared byteLength、bufferView、accessor、image MIMEとmagic bytesを照合し、範囲外参照やtype不一致をデコーダーへ渡さない。
- relative dependencyはimport transactionの元データdirectoryへcopyし、実行時に元directoryやremote hostへ再取得しない。
- unsupported `extensionsRequired`はactive preview / compileを止める。optional extensionはcore fallbackの可否と見た目の差を診断する。

外部モデルの描画は [10章](#10-セキュリティと認証境界) のCSP、path、content、resource limitのgateを満たしてから有効にする。

取り込みQueueは元データcopy、derived / thumbnail generation、AssetManifest commitまでを実処理として追跡する。各stageが成功していない素材をready、保存済み、配置可能と表示しない。

### 6.8 外部リソースカタログ

自分のファイル以外から素材を得る経路も、通常のimport transactionの上に載せる。ブラウザで探して保存し直す手順をユーザーに要求しない。

- 素材の「外部から追加」はcatalogを開く。CC0 providerとしてPoly Haven（HDRI / マテリアル / 3Dモデル）とambientCG（HDRI / マテリアル、3Dモデルは検索のみ）、XRift公式カタログとしてOpen Brushのマテリアル、空の背景シェーダー、水面シェーダー、地形プリセット、発光オブジェクト、公式コンポーネントを扱う。
- ダウンロードは解像度と形式を選ばせ、確定前に容量の目安を示す。取得した実体は6.1のimport transactionを通し、検証、元データcopy、derived生成、manifest commitまで同じ経路で確定する。catalog専用の抜け道を作らない。
- catalog cardは静止画のサムネイルではなく、実際のGLSLや高さフィールドをWebGLで描画する。カードで見えているものと、追加後にシーンへ入るものを一致させる。
- 追加した素材は作者、ライセンス、配布ページURLを`attribution`として保持し、公開したワールドの生成物へも同じ情報を出力する。CC0とMITを同じ表示にせず、詳細パネルから配布ページとライセンス原文へ移動できるようにする。
- HDRIは環境テクスチャとして保存し、「追加後に空の背景へ設定」を選んだ場合だけシーンsettingsのskyboxを同じtransactionで更新する。空の背景シェーダーと水面シェーダーはマテリアル、地形プリセットは地形オブジェクト一件として追加し、追加後は通常の素材 / オブジェクトとして編集できる。
- 一時的なI/O失敗は限定回数の再試行で吸収し、それでも失敗する場合はprovider、対象ファイル、再試行手段を示してdocumentを変更しない。

## 7. Command と元に戻す / やり直す

SceneDocumentまたはAssetManifestを変える操作は、EditorSessionの`CommandDispatcher`を通してCommand Transactionにまとめる。

```text
Command {
  id
  label
  documents: ("scene" | "assets" | "project" | "prefab" | "folders")[]
  expectedRevisions
  affectedIds
  beforePatch
  afterPatch
  selectionBefore: { sceneSelection, assetSelection }
  selectionAfter: { sceneSelection, assetSelection }
  timestamp
}
```

- ギズモのpointer downで変更前スナップショットを保持する。
- pointer move中はシーンと設定に一時値を反映する。
- pointer upで一つの位置・回転・大きさCommandを確定する。
- Escapeは確定前の値を戻す。
- 元に戻すは`beforePatch`、やり直すは`afterPatch`を対象documentのrevision検査後に適用する。
- 位置・回転・大きさ、親子付け替え、複製、削除、コンポーネント追加はSceneDocumentのCommandとする。
- マテリアル変更、rename、texture slot変更はAssetManifestのCommandとする。
- 通常の選択、hover、カメラ操作は履歴の項目にしない。ただしdocument変更と選択が一体の操作では、前後selectionをtransactionに含める。
- `PlaceAssetCommand`の実行はオブジェクト追加と新オブジェクトの選択を一件にする。元に戻すはオブジェクトを除き、配置前の`sceneSelection` / `assetSelection`を復元する。やり直すは同じIDのオブジェクトを戻して再選択する。
- Copyはdocumentを変えず、選択subtree、component、内部オブジェクト参照、必要素材IDをversioned copy bufferに直列化するIntentとするため、authoring元に戻す履歴には積まない。Pasteは貼り付け先を検証し、新しいオブジェクトIDを払い出し、subtree内参照だけをremapする`PasteEntitiesCommand`とする。project外からのcopy bufferやschema version不一致はmigration / validationを通過するまで貼り付けない。
- 複製はcopy bufferを経由して結果が揺れない`DuplicateEntitiesCommand`とし、同じ親の直後へ複製する。元のオブジェクトと複製オブジェクトのID対応をCommandに保持し、元に戻すは元の`sceneSelection`と`assetSelection`、やり直すは同じ複製IDと両selectionを復元する。外部素材IDは共有参照のままにし、マテリアル / テクスチャを暗黙複製しない。
- オブジェクト一覧から素材 / folderへのドロップは`CreatePrefabFromEntitiesCommand`とする。プレハブdocument、AssetManifestの項目、folder membership、元subtreeのプレハブinstance metadataを一つのcross-document transactionで確定し、失敗時は一件も変更しない。元に戻す / やり直すは生成ID、元subtree、`sceneSelection`、`assetSelection`を完全に復元する。
- 非同期の読み込みはstaged file operationとAssetManifest更新がすべて成功した場合だけ履歴へ確定する。失敗時はdocument、revision、selection、historyを変更しない。
- revisionが競合したCommandは暗黙に上書きせず、再読込または再適用を選べる診断にする。

Command historyはproject session中の確定transactionを保持し、元に戻す / やり直すbuttonとshortcutは同じ履歴へ接続する。履歴が空、revision conflict、動作確認中の時は理由付きで無効にする。

### 7.1 Shortcut Registry

keyboard操作は各componentの`keydown`に散在させず、Command / Intentと同じIDを使う中央Shortcut Registryで解決する。

```text
ShortcutDefinition
  commandId
  label
  contexts[]
  defaultBindings: { windows, macos, linux }
  allowInTextInput: false
  repeatPolicy: "once" | "repeat"
  canExecute(session, focusedSurface)
```

context priorityは`modal > text-input / composition > quick-asset-editor > hierarchy / assets > viewport > editor-global`とする。同じkey chordがactive context内で複数commandに一致した場合は実行せずconflictとしてShortcut設定を開く。ユーザーoverrideはproject documentではなく端末のEditor Preferencesに保存し、`commandId`とplatformごとのbindingを持つ。予約済みOS shortcut、重複、空bindingを保存前に検証し、「既定へ戻す」をcommand単位と全体に用意する。

| Command ID | Active context | Windows / Linux | macOS | 備考 |
| --- | --- | --- | --- | --- |
| `edit.copy` | オブジェクト一覧 / 素材 | `Ctrl+C` | `Cmd+C` | active selectionをcopy bufferへ保存 |
| `edit.paste` | オブジェクト一覧 / 素材 / Viewport | `Ctrl+V` | `Cmd+V` | 貼り付け可能なbufferがある時だけ |
| `edit.duplicate` | オブジェクト一覧 / Viewport | `Ctrl+D` | `Cmd+D` | オブジェクトsubtreeを複製 |
| `edit.delete` | オブジェクト一覧 / 素材 / Viewport | `Delete` | `Delete` | 素材は参照確認を通す |
| `viewport.focus-selection` | Viewport | `F` | `F` | `sceneSelection`へcamera focus |
| `tool.move` | Viewport | `W` | `W` | 編集modeのみ |
| `tool.rotate` | Viewport | `E` | `E` | 編集modeのみ |
| `tool.scale` | Viewport | `R` | `R` | 編集modeのみ |
| `history.undo` | Editor global | `Ctrl+Z` | `Cmd+Z` | active transactionが確定済みの時だけ |
| `history.redo` | Editor global | `Ctrl+Shift+Z`、代替`Ctrl+Y` | `Cmd+Shift+Z` | 同じやり直すcommandへ解決 |
| `project.save` | Editor global | `Ctrl+S` | `Cmd+S` | 動作確認中は保存可能なauthoring snapshotがある時だけ |
| `preview.toggle-play` | Editor global | `Ctrl+Enter` | `Cmd+Enter` | 編集は動作確認、動作確認は停止 |

`input`、`textarea`、`select`、`contenteditable`、数値fieldの編集中、IME composition中は`allowInTextInput = false`のshortcutを実行しない。したがって`W/E/R/F/Delete/C/V/D`は文字入力や値削除を奪わない。Escapeによるfield編集取消、Enterによる確定などfield所有のkeyはShortcut Registryより先に処理する。動作確認中はauthoring shortcutの`canExecute`をfalseにし、停止とcamera / 実行環境用inputだけをactiveにする。

toolbar、context menu、command palette、tooltip、Shortcut設定、ユーザー向けショートカット表は同じRegistryからlabel、binding、enabled reasonを生成する。docsの既定shortcut表もRegistry snapshotから検査可能にし、UIと文書のdriftをCIで検出する。

## 8. Prefabs

プレハブは、ユーザーが用意するテクスチャ、パーティクル、モデル、設定済みコンポーネント群をオブジェクトsubtreeとして再利用する単位である。UI、schema、folder名では`Prefab`に統一する。

- オブジェクト一覧の一つ以上のrootオブジェクトを素材またはfolderへdragするか、context menuの「選択からプレハブを作成」で開始する。ドロップ中は作成先folderとdependency件数を示し、シーンへのreparentと混同しない。
- プレハブはAssetManifestにstable `prefabAssetId`と`prefabDocumentPath`を持ち、`scenes/prefabs/<prefab-id>.scene.json`のversioned documentを参照する。
- dependency closureは選択root以下のオブジェクト、コンポーネント、subtree内参照、参照する3Dモデル、テクスチャ、マテリアル、パーティクル、入れ子プレハブIDを含む。素材binaryは複製せずstable素材IDで共有し、外部参照と入れ子循環をvalidationする。portable package化は別の明示操作とし、プレハブ作成時に元データfileを隠れてコピーしない。
- 作成成功では選択subtreeを同じ見た目のプレハブの配置に変換し、`prefabAssetId`、`prefabRevision`、prefab-localオブジェクトIDとsceneオブジェクトIDの対応を保持する。素材gridは新プレハブを選択し、`sceneSelection`は元rootに対応するinstance rootを保つ。
- Instance差分は`overrides`に`prefabEntityId / componentType / fieldPath / value`のtyped operationとして保持する。プレハブ更新時はoverrideのないfieldだけを追従し、削除されたfieldや依存切れはconflict diagnosticにする。名前や配列indexだけでoverrideを対応しない。
- 「Overrideを適用」「元に戻す」は対象fieldまたはcomponent単位のCommandとする。プレハブ自体の変更と一instanceのoverrideを同じ設定fieldで曖昧に編集しない。
- UnpackはInstanceを通常オブジェクト群へ変換する一方向Commandとし、プレハブと他instanceは変更しない。元に戻すでは同じIDs、overrides、両selectionを復元する。
- プレハブを削除する時は全instanceと入れ子参照を列挙し、Unpack、置換、取消のいずれかを選ばせる。参照中のままdangling IDを残さない。
- プレハブ化したsubtreeの元オブジェクトを削除しても、プレハブとプレハブdocumentは独立して保存できる状態を保つ。

追加paletteの組み込み形状は追加Registryが提供するオブジェクトgeometryであり、プレハブとして素材へ保存しない。

## 9. XRift への変換パイプライン

ビジュアルprojectの変換は、authoring projectをclassic projectへ書き換えず、一時staging projectを作る一方向パイプラインにする。

### 9.1 保存 transaction と crash recovery

保存対象はVisualProjectDocument、開始シーンのSceneDocument、AssetManifestの三documentだけではない。`assets/folders.json`、すべてのプレハブdocument、追加scene、documentが参照する元データmetadataも同じ保存単位に含める。

元データbinary / derived cacheの確定は [6章](#6-素材のライフサイクル) のimport transactionが担当し、通常の保存が画像を再圧縮したりcacheを正本へ昇格したりしない。

1. 保存開始時の各document revisionと`sceneSelection` / `assetSelection`をsnapshotし、in-memory schema、参照、path、プレハブcycleを検証する。
2. 同一project volumeの`.xrift-studio/transactions/<transaction-id>/`にcanonical JSONのtemporary fileを全件書き、flush後に読み戻してschemaとSHA-256を検証する。project外のOS temporary directoryからrenameしない。
3. journalにtransaction ID、base / next save revision、対象relative path、before / after hash、temporary path、状態`prepared`を記録する。token、absolute path、Blob URLは含めない。
4. Tauri backendのsame-volume atomic replaceでleaf documentとfolder / プレハブdocumentを確定し、最後にVisualProjectDocumentの`saveCommitId`とdocument hash setをcommit markerとして置き換える。複数fileのrename自体を単一OS atomic operationとは主張せず、最後のcommit markerとjournalでproject全体の可視revisionを決める。
5. 全hashとcommitted revisionが一致した時だけjournalを`committed`とし、EditorSessionのsaved revisionsを進めて「未保存」を解除する。その後にtemporary fileと旧backupを回収する。

起動時に未完了journalがあれば、commit markerとfile hashesから「旧revisionへrollback」または「全after hashが揃ったtransactionをroll-forward」の一方だけを選び、ユーザーへ復旧内容を示す。途中fileを現在documentと混ぜて推測ロードしない。保存失敗時は最後にcommittedなrevisionを開ける状態に保ち、EditorSessionはdirtyのまま、再試行、別名保存、診断表示を選べるようにする。保存中に編集された新revisionはその完了表示へ含めず、直後も「未保存」を残す。

保存の元に戻す / やり直すは作らない。元に戻す / やり直すはauthoring stateを変え、保存は現在revisionをdurableにする操作である。保存後に元に戻した場合は通常どおり新しい未保存revisionになる。

### 9.2 Compiler staging と生成元の記録

```text
VisualProjectDocument + SceneDocument + AssetManifest
  -> document validation / migration / reference validation
  -> world または item compiler profile validation
  -> Asset resolution / derived artifact preparation
  -> target-neutral scene model
  -> xrift-studio.runtime JSON + Asset copy plan
  -> xrift-studio-runtime/three または /react-three-fiber
  -> 薄い World Adapter または Item Adapter
  -> staging XRift classic project (package.json + xrift.json + src/)
  -> 既存 XRift check / build
  -> upload
```

このパイプラインは実装境界であり、ビジュアルモードの操作手順として露出しない。同じエディターの動作確認を押し、シーン内で確認し、停止で編集へ戻る。Viteのポート、CLIコマンド、開発サーバー、別ブラウザのURLを選んだり起動したりする必要はない。

compiler coreは出力adapterを二つ持つ。desktopのPublish、コード編集export CLI、Editorからの既存コード編集追加は`classic-jsx`、ブラウザ版アップロードだけが事前ビルドのshell向けに`classic-runtime`を選ぶ。これはシーン変換器の複製ではなく、同じ検証、プレハブ展開、素材plan、diagnostics、生成元の記録から出力adapterだけを切り替える境界である。

Editor動作確認はvisual documentsをThree / R3F preview adapterが直接読むため、Node.js、XRift CLI、別のVite processを要求しない。toolchainがなくてもビジュアルprojectを作成・編集・保存できる。Compiler、check、uploadを実行する時だけ実行環境gateでNode.js / XRift CLI / 認証状態を検査し、不足時はauthoringを閉じずにセットアップ導線を示す。

staging projectの実行環境確認も準備と終了をエディターが管理し、シーンまたは同一ウィンドウ内の隔離されたpreview surfaceに表示する。準備に時間がかかる場合は「生成結果を準備中」と停止を示し、CLIの生ログは詳細表示へ分離する。自動で外部ブラウザを開かない。公開が失敗した場合はCLIとビルドの出力を捨てず、失敗したstageと併せて読める形で残す。

compile input fingerprintはcanonical化した全authoring documents、プレハブ / folder documents、参照する元データ / dependency hashes、derived recipe / artifact hashes、schema versions、compiler version、target (`world | item`)、Registry / adapter versionsから作る。現在のfingerprintと一致する成功stagingだけをfreshとし、mtimeや「一度ビルドした」flagで判断しない。保存後でもcompiler version、target、asset recipeのいずれかが変わればstaleである。

stagingには生成物と別に次の生成元の記録manifestを置く。

```text
XRiftStudioProvenance
  formatVersion
  compilerVersion / target / adapterVersions
  inputFingerprint
  documentHashes / sourceHashes / derivedHashes
  generatedFiles[]: relativePath / sha256 / sourceMappings[]
  sourceMappings[]: generatedRange -> sceneId / entityId / componentType / assetId / fieldPath
```

生成内容へwall-clock time、absolute path、random IDを入れない。同じfingerprintからbyte-equivalentなstagingを得る。生成時刻のようなUI metadataが必要なら生成元の記録hashの外に置く。プレビュー、check、uploadの開始直前にfingerprintと全generated file hashを再検証し、staleまたは手編集を検出したら自動再生成か中止を選ばせる。last-good stagingを「最新」と偽らない。

ここでいう双方向性は、XRift Studioが生成したartifactのdiagnostic、生成コードの位置、check結果、upload結果を、生成元の記録から元のオブジェクト / 素材 / fieldへ対応付けられることを指す。

これとは別に、既存コード編集の検査済みエントリーポイントとrelative importで到達するlocal moduleから、対応する静的JSXを一度ビジュアル編集へ取り込むlossy importを提供する。任意コードの実行、素材graph、`package.json`、`xrift.json`を完全なvisual documentsへ戻すround-tripとは扱わず、未対応箇所を診断へ残す。

生成ファイルの編集を検出した場合は上書き再生成または書き出し / Ejectを選ばせ、差分を元authoring documentへ自動反映しない。

### 9.3 Validation / Migration

- 三つのroot documentと参照されるシーン / プレハブ / folder documentの`schemaVersion`を必須にし、依存順に段階的に移行する（[4.10](#410-schemaversion-と-migration)）。
- migrationは元データを直接壊さず、移行後のコピーを検証してから保存する。
- path、オブジェクト、コンポーネント、素材、マテリアル / texture slotの参照整合性、有限数、許容スケール、親子循環を検査する。
- world / itemごとの許容コンポーネントと必須設定をprofileで検査する。
- 生成コードは公開テンプレートと同じTypeScript設定で検査する。同じ識別子を型importと値importで二重に束縛しないなど、テンプレート側の`strict` / `noUnusedLocals` / `noUnusedParameters`に違反する出力を作らない。この検査はfixtureとしてCIで実行する。

### 9.4 Code Generation

- `classic-runtime` modeは`public/xrift-runtime.json`と薄いadapterを生成する。ブラウザ版アップロードの事前ビルドshellだけがこれを使う。desktopのPublishとコード編集exportは`classic-jsx` modeを使う。`xrift-studio-runtime`はnpm未公開なので、これをimportする出力をコード編集のプロジェクトへ置くとビルドできない。
- 出力先はOSの一時ディレクトリまたはvisual projectの`.cache/generated-xrift/`とし、authoring rootに`package.json`や`src/`を生成しない。
- staging project全体をcompiler所有とし、自動生成markerと元データdocument hashを記録する。次回compileで破棄・再生成でき、ユーザー編集は受け付けない。
- `public/xrift-runtime.json`は編集用documentを直接公開せず、実行時に必要なシーン、オブジェクト、位置・回転・大きさ、コンポーネント、素材URLだけを持つ`xrift-studio.runtime` schemaへ変換する。
- `classic-runtime`の`src/World.tsx`または`src/Item.tsx`は`xrift-studio-runtime/react-three-fiber`を呼ぶ薄いadapterとする。`classic-jsx`のエントリーポイントはシーン全体のJSXと、動作確認と同じ実行環境moduleの`src/xrift-studio/`を生成する。どちらも正本はビジュアル編集documentであり、生成物を編集しても戻さない。
- 素のThree.js利用者は`xrift-studio-runtime/three`だけをimportでき、React／Tauri／CLIをbundleへ含めない。3Dモデルとテクスチャは並列にloadし、形式固有rendererは対象素材がある場合だけ遅延loadする。
- オブジェクト、素材、プロパティの出力順を安定させ、同じcanonical input setとcompiler / adapter versionから同じstaging projectを生成する。
- コンポーネント / 素材Registryはtarget-neutralなschema、reference、validation層と、Three preview、R3F、XRift world、XRift itemのtarget adapter層に分ける。
- メッシュ、ライトなどはallow-list済みadapterだけで変換する。document内の文字列を`eval`、`Function`、任意の動的importとして実行しない。この禁止は生成コードに対して無条件に維持する。スクリプトはdocument内の文字列ではなく独立した元データfileであり、生成コードへは**静的import** としてだけ出力する（[4.8スクリプト](#48-scripting-script-asset--script-component)）。

ワールドAdapterはワールドのルート、物理、スポーンなどのcompiler profileを接続する。アイテムAdapterはXRiftから渡される位置やスケールなどのアイテムpropsをルートへ適用し、アイテム用profileにない機能を生成しない。これらcompiler adapterと、Editor内のワールド動作確認Profile / アイテムプレビューProfileは責務が異なる。

### 9.5 プレビュー経路の選択

「動作を確認する」には複数の経路があり得るため、公式に契約が定義されている経路と、そうでない経路を分けて採用する。公式ドキュメントに記載のないAPIを前提にしたUIを作らない。

| 経路 | 公式に確認できる契約 | XRift Studioの採用 |
| --- | --- | --- |
| Editor direct preview | XRift固有APIではない。visual documentsをThree / R3F adapterが読める | 採用する。編集 / 動作確認に使い、XRift本番実行環境と同一とは表示しない |
| classic itemのlocal preview | item tutorialが`npm run dev`、`src/dev.tsx`、`localhost:5173`のCanvas / Physics / OrbitControls previewを示す | 制約付きで採用する。generated staging検査に使い、Node / template / port lifecycleをEditorが管理する。Editor direct previewとは別profile |
| XRift CLI preview command | command referenceにはlogin / whoami / create / upload / checkがあり、preview commandはない | 使わない。存在を仮定したcommandやUIを作らない |
| SDK upload | `@xrift/sdk`はworld / item upload、progress、resultのID / version / content hashを定義する | uploadの根拠としてだけ使う。preview APIの根拠にはしない。desktopは既存CLI / Tauri認証境界を優先する |
| Public API v1 | 公開world、公開instanceなどのread endpointを定義する | 未公開stagingの実行面として使わない |
| XRift上のunpublished / draft preview | CLI、SDK、Public APIに契約の記載がない | 設計上の依存にしない。公式auth、lifecycle、URL、cleanup contractが公開された時点で再評価する |

「動作確認」はEditor direct preview、「生成結果を確認」はstagingのlocal dev previewと明確に分ける。後者はEditorがserver起動、ready検知、sandboxed surface、停止、port解放、stderr redactionを管理する。CLI `upload`はbuildと審査 / 公開へ進むためpreview buttonの代替に使わず、実データを送信する通常検証もしない。

### 9.6 Upload modal と既存 XRift flow

Uploadはeditorのlight theme内に専用modalを開き、既存の`whoami` / `login`、公開準備確認、種別別`check --build`、`upload`実装を再利用する。別のtoken store、shell command builder、公開metadata schemaをvisual mode専用に複製しない。

公式CLIが同じ公開先を更新するためのremote IDは`xrift.json`ではなく、ワールドでは`.xrift/world.json`、アイテムでは`.xrift/item.json`に保存される。ビジュアル編集のプロジェクトはこのCLI付属ファイルをauthoring rootの非表示・編集不可metadataとして保持し、毎回作り直すstagingへupload前に復元する。

stagingには`projectId`と成果物種別を持つapp-owned owner markerを最後に書き、次回stagingを消す前にもCLI付属ファイルをauthoring projectへ回収する。

upload成功後はCLIが更新した付属ファイルをauthoring projectへjournal付きで戻してから成功結果を確定し、`lastPublication`にはUIで表示するIDと結果を同期する。

既存付属ファイル、`lastPublication`、owner marker、CLI resultのIDが一致しない場合、または以前のIDを一意に復元できない場合は、新しいremoteを重複作成しないようupload / retryを停止する。

| State | 表示と動作 | 取消 / 失敗からの戻り先 |
| --- | --- | --- |
| `review` | target、タイトル、説明、thumbnail、既存worldId / itemId、保存・compile freshness、diagnostic件数を表示。未編集placeholderやblockerをfield近くに示す | 閉じると編集。documentとremoteは不変 |
| `auth-check` | `whoami`の結果を表示し、未認証なら既存login導線を同じmodalから開始 | login取消後もmetadata入力を保持して`review` |
| `saving` | 9.1のtransactionと対象revisionを表示 | safe pointで取消し、未完了saveはjournal recovery対象。remoteは不変 |
| `compiling` | input fingerprint、target、asset processing、生成件数を段階表示 | worker / compilerを取消して`review`。last-goodをlatest扱いしない |
| `checking` | 既存check/buildのAPPROVE / REVIEW / REJECTと生成元の記録上のオブジェクト / 素材linkを表示 | local processを取消して`review`。REJECTはuploadへ進めない |
| `uploading` | files、bytes、current file、content hash、remote targetを表示 | remote commit前だけ取消可能。開始後のcancelはbest effortと明記し、結果不明ならstatus確認まで再uploadしない |
| `processing` | upload後の自動審査中であり未公開かもしれないことを表示 | modalを閉じてもresult IDを保持。公開完了とは表示しない |
| `succeeded` | SDK / CLIが返したworldId / itemId、versionId、versionNumber、contentHashを表示 | 「Editorに戻る」と「結果をコピー」。公式resultがURLを返した時だけURLを開く |
| `failed` | stage、sanitized error、再試行可能性、remote commitの有無を表示 | auth、compile、check、uploadの失敗stageから再試行。入力hashが変われば`review`からやり直す |

SDK API referenceのupload resultはID、version、content hashを定義するが公開URL fieldは定義していない。XRift StudioはIDからURL patternを推測生成せず、CLI / SDKが正式URLを返さない場合はIDとversionを表示し、既存の公式ページを開く導線またはstatus refresh APIが確認できるまでURL buttonを出さない。再試行ではinput fingerprint、content hash、既知のremote IDを照合し、結果不明のuploadを新規projectとして重複作成しない。

自動テスト、E2E、手動UI検証はcompile / checkまでをfake backendまたはfixtureで行い、実XRift uploadを実行しない。実uploadはユーザーがmodalの最終確認を明示実行した本番操作だけに限定する。

### 9.7 コード編集とビジュアル編集の境界

- コード編集プロジェクトは、ローカルフォルダー、またはネイティブ側で浅くcloneしたHTTPS / git SSHリポジトリから読み込む。`package.json`、`xrift.json`、同じ種別の`src/World.tsx`または`src/Item.tsx`を検査し、ファイル数、総容量、symlink、元データの依存グラフのバイト数に上限を適用する。エントリーポイントから相対importを再帰的に解決する。moduleは実行せず、静的なJSXとliteralだけをlossy importする。

  `group`、RigidBody、対応するDrei / XRift wrapper、ローカルコンポーネントのinstanceを独立したオブジェクトとして保持する。親子関係とローカルの位置・回転・大きさを保ち、その配下に標準形状、R3Fライト、衝突判定、型付きのXRiftコンポーネントを配置する。

  ローカルの3Dモデル、テクスチャ、MP3 / WAVは通常の素材import transactionで保存する。sphere / BackSide画像は空の背景へ、`new Audio`は音源へ接続する。確定前の確認でも、ファイルを書き込まずに同じtransactionを準備する。素材原本の容量、テクスチャ解像度と展開量、3Dモデルのbounds、取り込み時のscale、親を含む配置時の大きさ、配置後の寸法を示す。

  `THREE.ShaderMaterial`からCustomマテリアルIRへ変換するのは、GLSL、literal uniform、テクスチャsampler、メッシュ名variantだけとする。元の3Dモデルのslot、Editorプレビュー、compilerには同じdescriptorを渡す。

  OBJに明示された衝突判定メッシュ名は、named submeshへの参照として復元する。rootの3Dモデルを通らないnamedノードにも、取り込み時のscaleと中心offsetを明示的に適用し、表示モデルと物理演算の寸法を揃える。

  RigidBodyは衝突判定の形状と分離した親オブジェクトのコンポーネントとして保持する。保存するのはfixed / dynamic / kinematic type、静的な一般設定、auto collider方式である。動作確認とcompilerでは、次のnested RigidBody境界までの子孫メッシュと衝突判定を同じRapier Bodyへ戻す。親の原点に代替の衝突判定を生成しない。

  hook、callback、条件分岐、動的なcollection、解決できない素材依存は、元データのpath付き診断として残す。完全なround-tripや暗黙の継続同期は提供しない。
- visual project内に手書き`src/`や、生成対象外adapterを混在させない。拡張はversionedコンポーネント / 素材 / 実行環境plugin contractとして明示的に設計する。
- CLIの書き出し / Ejectは`xrift-studio convert <visual-project> --to classic --out <directory>`と同じcompiler coreを使い、新しい空directoryへ公開時と同じ`classic-jsx`ソースを持つコード編集のプロジェクトを作る。スクリプト元データ、素材、デコーダー、フォントも同じprojectへコピーし、公式テンプレートの依存関係だけでビルドできる状態にする。
- Desktop Editorの「コード編集へ書き出す」はOS folder pickerで同種の既存コード編集のプロジェクトを検査し、生成した`src/`一式をビジュアル編集のプロジェクトIDごとの`src/xrift-studio/<id>/`へ相対importを保ったまま移し、`Scene.tsx`から`XriftStudioScene`として公開する。素材、デコーダー、フォントは公開ワールドが直下しか配信しないため`public/`直下へ置き、生成元の記録とexport manifestは`.xrift-studio/exports/<id>/`へ置く。既存`xrift.json`、サムネイル、エントリーポイントは既定で変更しない。前回のexportが記録したfileのうち今回生成しないものは取り除き、手書きfileとbackupには触れない。
- 既存コード編集への追加はcomponent接続を既定とし、エントリーポイントの切り替えはbackupと明示確認を必要とする。npmだけ固定allow-listのdependency installを自動化し、他package managerのlockfileをnpmで混在させない。
- Eject先の`package.json`、`xrift.json`、`src/`、`public/xrift/`はユーザー所有へ移す。由来とhashを`.xrift-studio/export-manifest.json`へ残すが、自動同期やビジュアル編集への逆変換は行わない。
- `--update`は同じビジュアル編集のプロジェクト由来で、manifest記録後にfile追加・削除・変更がないexportだけに許可する。コード編集側を編集した後は更新を拒否し、既存directoryへの混在や`--force`を提供しない。
- Eject transactionは一方向であり、Eject先の変更を元のビジュアル編集のプロジェクトへ自動同期しない。戻す場合は別ビジュアル編集のプロジェクトまたは明示したシーン追加として静的lossy importを行う。元データとoutputが同一または親子になる配置も拒否する。

## 10. セキュリティと認証境界

- visual documentsは宣言データだけを受け入れ、任意スクリプト、HTML、シェルコマンドを保持・実行しない。スクリプトの実体はproject内の元データfileであり、visual documentが持つのはasset参照と宣言済みproperty値だけとする。スクリプトの評価はEditorの動作確認内部に限り、その実行境界と残存リスクは [4.8スクリプト](#48-scripting-script-asset--script-component) と [スクリプトContract](./SCRIPTING.md) に明記する。
- 外部素材は拡張子だけで信用せず、サイズ、MIME、実体、展開後サイズをネイティブ境界で検証する。
- パスはプロジェクトルート内へ正規化し、`..`、絶対パス、シンボリックリンク越しの脱出を拒否する。
- Importerと生成器は既知の素材 / コンポーネント型だけを処理する。
- 外部素材のpreview URLとTauri asset protocolはproject管理下の元データ / cacheだけへ制限し、CSPの`default-src`、`script-src`、`connect-src`、`img-src`、`media-src`を必要最小限に保つ。外部モデル描画前にこのgateを確認する。
- shell scopeは固定したXRift executableと許可済みsubcommand / argumentに限定し、documentや素材名を任意コマンドとして連結しない。Compiler接続前にcapabilityとscopeをreviewする。
- アップロードトークンはvisual documents、staging project、ブラウザの永続ストレージ、ログへ保存しない。
- デスクトップ版では、認証済みCLIまたはTauriバックエンドをアップロード境界にする。
- ログへ出す前にaccess token、cookie、Authorization header、署名付きURL、ユーザーホームの絶対パスをredactionする。compiler / uploadのraw stderrを無加工でUIやtelemetryへ送らない。
- Blob URL、input listener、Worker、PlaySession resourceは終了時にrevoke / disposeし、次のprojectへ残さない。
- Webだけでアップロードする経路を作る場合は、サーバーから短時間かつ用途限定の資格情報を受け取り、ブラウザへ長期トークンを配布しない設計を別途行う（[ブラウザからのワールド公開](./WEB_UPLOAD.md)）。
- upload前には既存の公開準備確認を再利用し、タイトル、説明、サムネイルが初期値のままなら開始しない。
- debug buildだけに登録するprivileged Tauri MCP bridgeは、webview JavaScript実行とTauri commandの`invoke`を許す開発者向けautomationである。release buildへ登録・搭載しない。

外部素材描画、Compiler、check/uploadはこのsecurity gateとthreat reviewを通過した実装だけを有効にする。gateに失敗した処理は開始せず、対象と修復手段をEditorに示す。

## 11. 製品能力

### Authoring workspace

- 新規作成はitem / worldとclassic / visualの四カードを同じ画面に示し、visual projectは専用documentsをjournal付きで保存してライブラリへ登録する。
- light themeの左オブジェクト一覧、中央シーン、右設定、下素材をresize / dockでき、versioned Editor Preferencesからlayoutを復元・resetできる。
- オブジェクト一覧 / シーンの右クリック追加、gizmo、設定、素材 / マテリアル / テクスチャdrag-and-dropはCommand Dispatcher、元に戻す / やり直す、両selection snapshotを共有する。
- 素材はfolder、検索、import、外部カタログ、動的thumbnail、drag元データを提供し、マテリアル / テクスチャ / 3Dモデルpropertiesは右設定で編集する。
- ワールド / アイテム動作確認は同じシーンと別実行環境profileを使い、停止後にauthoring documents、両selection、設定context、cameraを復元する。

### Asset and scene data

- GLB / GLTF / OBJ / VRM、PNG / JPEG / WebP / KTX2、HDR / EXR、MP3 / WAVをallow-list、Worker / memory budget、元データ非破壊のimport transactionで扱う。
- glTF core metallic-roughnessマテリアル、TextureInfo / sampler、マテリアルslots、`KHR_texture_transform`、typed `KHR_materials_iridescence`をimport、右設定、preview、compilerで共有する。
- 3Dモデル / テクスチャ / マテリアル / プレハブ / パーティクル / 音声 / スクリプト / シェーダー / ノードグラフ、プレハブdependency / override、コンポーネントRegistryをstable IDとversioned migrationで扱う。
- 地形は高さサンプルと草の散布ルールをSceneDocumentに保存し、シーン、staticメッシュと同じ形衝突判定、生成物で同じ三角形を使う。
- 元データ、recipe、processor、target hashが変わるとderivedとthumbnailをstaleにし、background queueで再生成する。

### Save, compile, preview, upload

- シーン / プレハブ / 素材 / folder document setをtemporary write、validate / hash、same-volume replace、journal、commit markerで保存し、crash後は旧または新の完全なrevisionへ復旧する。
- target-neutral Registryとworld / item adapterは生成元の記録付きの決定的staging projectを生成し、stale check後に既存XRift check / buildへ渡す。
- Editor direct previewとgenerated staging previewを分け、公式に定義されていないhosted / CLI previewを仮定しない。
- Upload modalは既存whoami / login / check / build / uploadを再利用し、review、進捗、取消、retry、remote ID / version、審査状態をEditor内に示す。

### Extension policy

- 後続`KHR_materials_*`は一つずつtyped Registry adapter、validation、設定、preview、compilerを揃えて追加する。
- コンポーネント / 素材Pluginは任意script実行ではなくversioned declarative schemaとallow-listed target adapterに限定する。ここでいうPluginはthird-partyがStudio本体を拡張する機構を指す。制作者が自分のワールド / アイテムのために書くスクリプトは [4.8スクリプト](#48-scripting-script-asset--script-component) のversioned contractとして別に扱い、Plugin機構としては開放しない。
- ECS実行環境は正規化documentとCommand / Registryで表現できないscheduling requirementが確認された時だけ評価する。スクリプトのコンポーネントのper-frame updateがその確認された要件であり、対応は固定順序の`RuntimePlugin` lifecycleにとどめる。汎用ECS実行環境は導入しない。

## 12. 検証と受け入れ条件

### Product UI and creation

- [ ] 新規作成の同じ画面にitem classic / world classic / item visual / world visualの四カードがあり、選択後の正本と開く画面を読める。
- [ ] classicとvisualが同じprojectの編集モードではなく、正本と利用機能が異なるproject typeだと選択画面から分かる。
- [ ] classicは既存のcode project作成、一覧更新、コードエディターへの遷移を変えない。
- [ ] visualは専用document formatをproject rootへ保存し、ライブラリから再度開ける。
- [ ] light theme上で左オブジェクト一覧、中央シーン、右設定、下素材の責務を識別できる。
- [ ] オブジェクト一覧またはシーンで選ぶと同じ`sceneSelection`が選択表示され、右オブジェクト設定が更新される。
- [ ] 素材の一回クリックは独立した`assetSelection`と右設定の素材contextを更新し、`sceneSelection`自体を消さない。
- [ ] primitiveは追加paletteにあり、user素材gridの3Dモデル / GLTF、テクスチャ、マテリアル、プレハブ、パーティクルと区別できる。
- [ ] オブジェクト一覧 / シーンの右クリック追加からprimitiveを作ると、オブジェクト一覧は選択親、シーンはclick pointを使ってオブジェクトを一件追加し、元に戻す / やり直すで同じIDと両selectionを復元する。
- [ ] 3Dモデル / プレハブの配置操作だけがオブジェクトを増やし、素材の一回クリック、マテリアル / テクスチャのdragではオブジェクトを増やさない。
- [ ] マテリアルをシーンメッシュまたはオブジェクト設定slotへdragするとhover中に対象slotと置換前後を確認でき、ドロップと元に戻す / やり直すが一件の`AssignMaterialCommand`になる。複数slotはchooserなしに推測適用しない。
- [ ] テクスチャを右マテリアル設定のslotへdragすると用途別色空間を検証し、衝突時は確定前に解決方法を選べる。
- [ ] オブジェクト設定は素材ID参照を示し、マテリアル値をオブジェクトにinline保存しない。
- [ ] 共有マテリアルを編集すると、そのIDを参照するすべてのオブジェクト表示が更新される。
- [ ] 3Dモデル / テクスチャ / マテリアルは元データ / マテリアル / dependencyの変更に追従する動的generated thumbnailを表示し、欠落 / 失敗時だけkind iconと状態labelを表示する。
- [ ] オブジェクト一覧、シーン、設定、素材をresize / dockしたlayoutが再起動後に復元され、invalid / off-screen layoutはsafe default、「レイアウトをリセット」は既定配置へ戻る。
- [ ] toolbarと素材は中央semantic Icon RegistryのLucide icon、label、tooltipを使い、他製品のicon assetやcustom SVGを含まない。
- [ ] ギズモまたは設定からposition、rotation、scaleを変更すると両方の表示が一致する。
- [ ] 動作確認は同じエディター中央の動作確認の画面で始まり、境界、header、実行コピーlabelでシーンと区別できる。Vite、CLI、ポート、別ブラウザを操作する必要がない。
- [ ] 動作確認中はオブジェクトの位置・回転・大きさ、衝突判定、Animation、追加・削除・複製・親変更・コンポーネント追加を通常の履歴と自動保存で変更でき、追加・削除・更新されたオブジェクトだけを実行環境へ差分同期する。素材、マテリアル、シーンsettingsは変更できない。
- [ ] ワールドプレビューのcontroller / physicsは登録済み実行環境adapterを使い、アイテムプレビューにワールド用controllerを適用しない。
- [ ] 停止後はPlaySessionが破棄され、動作確認中の許可された調整を含む最新SceneDocument、動作確認前と同じAssetManifest、selection、編集cameraへ戻る。実行環境位置や速度は書き戻さない。
- [ ] マテリアル / テクスチャは右設定のschemaで編集し、素材下部に別property formを作らない。
- [ ] GLB / GLTFを素材へドロップすると元データ、derived、thumbnail、AssetManifestがtransactionとして保存され、明示的なシーンドロップ以外ではオブジェクトを増やさない。
- [ ] 非対応ファイルではauthoring documentを変更せず、対応形式が分かる。
- [ ] Node.js / XRift CLIがなくてもvisual projectを開いて編集・保存・Editor動作確認でき、compile / upload時だけ実行環境gateを示す。
- [ ] 保存、変換、外部モデル描画、check、uploadは実結果に基づいて状態を更新し、stale / failed / processingをsuccessと表示しない。
- [ ] ライブラリへの戻り先があり、未保存変更がある時は保存、破棄、取消を選べる。
- [ ] `pnpm typecheck`が通り、Vite開発サーバーで主要導線とコンソールエラーを確認できる。

通常の確認では本番ビルドを実行しない。詳細は`AGENT.md`と`xrift-studio-verify`スキルに従う。

### Material / Texture / Import

- [ ] glTF 2.0 coreマテリアルのbaseColorFactor / テクスチャ、metallicFactor、roughnessFactor、metallicRoughnessTexture、normalTexture / scale、occlusionTexture / strength、emissiveTexture / 強さ、alphaMode / Cutoff、doubleSidedを欠落なくimport、編集、保存、preview、再出力できる。
- [ ] base color / emissive RGBはsRGB、metallic-roughness / normal / occlusionはlinearとして扱い、base color alphaはlinear / unpremultipliedのまま保持する。
- [ ] metallic-roughness textureのG=roughness / B=metallic、occlusionのR、normal scale、alpha modeの意味をfixtureで検証できる。
- [ ] core TextureInfoの`texCoord`と`KHR_texture_transform`のoffset / rotation / scale / override texCoordを別fieldとして保持し、extensionの有無を失わない。
- [ ] `KHR_materials_iridescence`の全field、既定値、linear single-channel textureをtyped adapterで保持し、他の未知`KHR_materials_*`をeditable fieldとして推測しない。
- [ ] `castShadow` / `receiveShadow`はメッシュコンポーネント、`doubleSided`はマテリアルに保存され、glTFマテリアルJSONへshadow fieldを混入しない。
- [ ] 複数メッシュprimitiveのstableマテリアル枠とbindingを保持し、再importで照合不能なbindingを自動置換せず`stale-material-binding`にする。
- [ ] マテリアルをプリセットから新規作成でき、作成後は素材だけを選択し、オブジェクトへ自動bindingしない。
- [ ] テクスチャimportは元データをbyte-preservingで残し、resize、mipmap、sampler、quality、WebP / KTX2 recipeとderived artifactを別管理する。
- [ ] KTX2 / WebPをそれぞれ`KHR_texture_basisu` / `EXT_texture_webp`として扱い、target非対応時のfallbackまたはblockerを示す。
- [ ] 元データ / dependency / recipe / processor / target hashの変化でderivedとthumbnailがstaleになり、last-goodをupload入力にしない。
- [ ] GLTF relative URIはimport root内だけを解決し、remote、absolute、traversal、scheme、budget超過をdocument変更前に拒否する。
- [ ] Worker取消 / crash / OOM / decode error後も最後に保存したdocuments、元データ、last-good derived、両selection、historyが壊れない。
- [ ] 素材folderのcreate / rename / moveとcontext menu操作がstable IDを保ち、表示上のfolder移動で元データpathを変えない。
- [ ] 外部カタログから追加した素材は作者とライセンスを保持し、公開した生成物にも同じ表記が出力される。

### Command / Shortcut / Prefab

- [ ] Place、Paste、複製、削除、プレハブ作成の元に戻す / やり直すがdocument IDsと前後の`sceneSelection` / `assetSelection`を両方復元する。
- [ ] 複製はsubtree内オブジェクト参照だけを新IDへremapし、マテリアル / テクスチャなど外部素材参照を暗黙複製しない。
- [ ] オブジェクト一覧から素材 / folderへのドロップでプレハブdocument、素材の項目、folder membership、instance metadataが一transactionとして確定し、途中失敗では一件も残らない。
- [ ] プレハブdependency closure、nested cycle、instance override、プレハブ更新、Unpackをstable prefab-local IDとfield pathで検証できる。
- [ ] プレハブ化した元オブジェクトを削除した後も、projectを保存して再度開ける。
- [ ] Ctrl/Cmd+C/V/D、削除、F、W/E/R、元に戻す / やり直す、保存、動作確認 / 停止がShortcut Registryの既定bindingから実行され、toolbar / tooltip / docsと一致する。
- [ ] text input、contenteditable、数値field、IME composition中はeditor shortcutが入力を奪わない。
- [ ] shortcut conflictはどちらも実行せず、user overrideと既定へ戻す操作がEditor Preferencesに保存される。

### 永続化とコンパイラ

- [ ] Tauri libraryはrootの有効な`xrift-studio.project.json`でvisualを判定し、`.cache/generated-xrift/`をprojectとして列挙しない。
- [ ] visual manifestが壊れている場合はclassicと推測せず、対象fieldと修復手段を示す。
- [ ] VisualProjectDocument、シーン / プレハブdocuments、AssetManifest、folder documentのserialize / loadでID、値、参照が失われない。
- [ ] 旧`schemaVersion`のfixtureが依存順に最新形式へ移行でき、[4.10](#410-schemaversion-と-migration) の対応表どおりに解決される。
- [ ] temporary write後のvalidation / hash、same-volume replace、journal、commit markerの順で保存し、各fault injection pointから旧または新の完全なdocument setに復旧できる。
- [ ] 保存中に編集が進んだ場合、保存対象revisionだけをcommittedとし、新revisionの「未保存」を消さない。
- [ ] 欠落素材、未知コンポーネント、循環オブジェクト一覧が対象ID付きで失敗する。
- [ ] マテリアル / texture slotの型違いと欠落参照を素材 / オブジェクトID付きで検出できる。
- [ ] 同じcanonical input fingerprint、compiler / adapter version、targetからbyte-equivalentなstaging projectと同じ生成元の記録mappingを得られる。
- [ ] 生成したstaging projectが公開テンプレートと同じTypeScript設定で型検査を通る。
- [ ] 元データ、derived recipe、compiler version、targetまたはgenerated file hashが変わるとstagingをstaleと判定し、preview / check / upload前に再生成または中止する。
- [ ] generated diagnosticのpath / rangeを生成元の記録により元シーン / オブジェクト / コンポーネント / 素材 / fieldへ戻せる。
- [ ] コード編集の検査済み`src` module graphからallow-list済み静的JSXをlossy importし、親子関係、localコンポーネント境界、typed XRiftのコンポーネントをfixtureで維持する。arbitrary codeや手編集stagingを実行・完全変換せず、未対応箇所は元データpath付きで診断する。
- [ ] world / item profileの違反を生成前に検出できる。
- [ ] visual authoring rootにcompilerが`package.json`、`xrift.json`、`src/`を生成しない。
- [ ] CLI Ejectは新しいclassic projectだけを作る。Desktopの既存コード編集追加はビジュアル編集のプロジェクトIDごとの所有領域だけを更新し、手書きのエントリーポイントは明示確認なしに変更しない。
- [ ] Editor direct previewとgenerated itemのlocal dev previewを別profileとして表示し、公式に未記載のCLI / hosted previewを実装済みと表示しない。
- [ ] 読み込む、保存、compileまたは生成失敗後も最後にcommittedなdocument set、revision、両selection、履歴が壊れない。
- [ ] 公開が失敗した場合にCLIとビルドの出力を読める。
- [ ] upload token、絶対パス、Blob URLがauthoring documentとstaging projectへ含まれない。
- [ ] CSP、Tauri shell scope、path validation、log redactionのsecurity gateをexternal render / compiler接続前に検証する。

### Upload

- [ ] Upload modalはtitle、description、thumbnail、target、auth、save / compile freshness、diagnosticsを確認してから既存whoami / login / check --build / uploadへ進む。
- [ ] review、auth-check、saving、compiling、checking、uploading、processing、succeeded、failedの各stateで進捗、取消可能性、再試行先、戻り先を読める。
- [ ] REJECT、stale compiler input、未編集metadata、thumbnail欠落などblockerがある時はuploadを開始しない。
- [ ] upload後はworldId / itemId、versionId、versionNumber、contentHashを表示し、審査中を公開済みと表示しない。
- [ ] `.xrift/world.json` / `.xrift/item.json`のremote IDをauthoring projectとfresh stagingの間で継承し、再uploadが同じremoteを更新する。
- [ ] 正式resultにURLがない場合はURL patternを推測せず、IDを表示する。結果不明の再試行で新規remote assetを重複作成しない。
- [ ] automated testと通常のUI検証はfake backend / fixtureを使い、実XRift uploadを発生させない。

## 13. 参考資料

### XRift

- [SDK Overview](https://docs.xrift.net/sdk/overview)
- [SDK API Reference](https://docs.xrift.net/sdk/api-reference)
- [World Components](https://docs.xrift.net/world-components/components/)
- [Create Your First Item](https://docs.xrift.net/item/create-first-item)
- [CLI Commands](https://docs.xrift.net/cli/commands)
- [Public API v1](https://docs.xrift.net/public-api/v1)

### Khronos glTF 2.0

- [glTF 2.0 Specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)
- [Material schema](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/schema/material.schema.json)
- [PBR Metallic-Roughness schema](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/schema/material.pbrMetallicRoughness.schema.json)
- [TextureInfo schema](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/schema/textureInfo.schema.json)
- [Sampler schema](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/schema/sampler.schema.json)
- [glTF Extension Registry](https://github.com/KhronosGroup/glTF/blob/main/extensions/README.md)
- [KHR_texture_transform](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_texture_transform/README.md)
- [KHR_texture_basisu](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_texture_basisu/README.md)
- [EXT_texture_webp](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Vendor/EXT_texture_webp/README.md)
- [KHR_materials_iridescence](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_iridescence/README.md)
- [KHR_interactivity](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_interactivity/README.md)
- [glTF Validator](https://github.com/KhronosGroup/glTF-Validator)

### UI icons

- [Lucide for React](https://lucide.dev/guide/react)

参照資料はXRift連携、データ互換性、UI実装の判断に使う。外部のコードや素材を取り込む場合は、それぞれのライセンスと更新方針を別途確認する。
