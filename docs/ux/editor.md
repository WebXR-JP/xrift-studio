# シーン編集の操作・状態設計

[機能一覧へ戻る](../UX_INTERACTIONS.md) / [共通の動き](./interactions.md)

<a id="f-07"></a>

## F-07 ビジュアルエディターの状態設計

### 操作前

- 新規作成では item classic、world classic、item visual、world visual の四カードを同じ画面で選ぶ。内部では成果物と project type の二軸で扱う。二段階 UI にしない。
- クラシックは `package.json` / `xrift.json` / `src/` を編集する code project、ビジュアルは専用 manifest / Scene / Asset document を編集する project と説明する。同じ project の表示切替や自動相互変換とは表示しない。
- ビジュアルを選ぶ前に専用 format を作成する。保存、Play、変換、check、upload まで同じ Editor flow で扱うことを示す。
- 開いた直後は成果物種別、project type、既定 Scene、独立した `sceneSelection` / `assetSelection`、Edit、Transform tool、未保存状態を表示する。
- 起動時は saved panel layout を window size と schema に合わせて復元する。不正または画面外の配置は safe default に補正する。
- World には World Play Profile、Item には Item Preview Profile を使うことを示す。World Playは`@xrift/world-components`の公式プレイヤーを起動する。SpawnPointから一人称で歩く。World の controller / physics / spawn adapter を Item へ適用しない。利用可能な input capability を Play 前に示す。
- Node.js / XRift CLI がなくても authoring と同一画面の Play shell を利用できる。Vite、CLI、開発サーバー、別ブラウザの起動を制作操作として置かない。
- クラシックを選んだ場合は既存の名前入力、作成、一覧更新、コードエディターへの流れを変えない。

### 操作中

- Asset の一回クリックは `assetSelection` と右 Inspector の Asset context を更新する。`sceneSelection` を維持する。Model / Prefab を Scene View へ drag するか「配置」を実行するまで Entity を増やさない。
- Hierarchy と Assets は Shift の範囲選択、Ctrl・Cmd の追加／解除を受け付ける。複数選択時は右Inspectorで対象数を表示する。全対象が持つMesh Renderer / LightまたはMaterialの共通プロパティだけを表示する。
- Hierarchy / Scene の右クリック Create は selected parent / click point を menu header に示す。primitive 選択前には Entity を増やさない。
- Hierarchyの行D&Dは上端と下端を兄弟順の挿入位置、中央を親子化として扱う。親行の矢印は子孫行だけを折り畳む。Scene Viewなどから折り畳まれた子を選んだ時は祖先を自動展開する。検索は名前、種類、Component、Enabled状態を対象にする。直下のsemantic iconではMesh、Light、Collider、Audio、Particle、Animation、Spawn、XRift Componentを複数選択できる。種類同士はOR、文字検索とはANDで絞り込む。一致Entityと祖先を表示する。クリア後は元の折り畳み状態へ戻す。行の目アイコンと単一／複数Entity InspectorのEnabledはEntity自身の状態を切り替える。単一Inspectorの先頭はEnabledチェック、名前、必要時だけ継承状態アイコンの順に並べる。Prefab sourceは名前と更新アイコンだけを置く。説明は常設しない。tooltipと読み上げ名へ移す。
- 子EntityのTransformはlocal値として保持する。Scene View、Play、生成Worldのすべてで親のPosition / Rotation / Scaleを継承する。
- Material drag 中は Scene Mesh または Entity Inspector slot だけを drop target とする。slot が複数なら chooser を表示する。Texture drag は右 Material Inspector の compatible slot だけを target にする。
- Asset のドラッグ中は Scene View だけを配置可能領域として示す。drop 前には Entity を増やさない。
- ギズモ操作中はカメラ操作を競合させない。Scene View と Inspector の Transform 値を同期する。Inspector の軸ラベルをスクラブする時も local Transform を即時同期する。Scale の比率固定中は操作軸の倍率で不均等比率を保つ。
- Inspector とシーン設定の数値欄は上下スピナーを出さない。欄そのものを左右へ引いて値を動かす。修飾キーなしのドラッグは微調整だ。Ctrl / Alt を押している間だけ大きく動かす。動かさずに離した時はクリックとして数値入力へ入る。打った値はキーごとに反映する。ドラッグ一回は一件の履歴として確定する。Escape では引き始める前へ戻す。
- ギズモとそのドラッグ平面は、親子関係に関わらず対象Entityのworld位置に置く。ギズモをEntityの祖先の下に描かない。祖先のTransformを二重に適用しない。ドラッグ開始時はカメラの慣性を先に止める。操作中の見え方と移動量を一致させる。
- Entity選択中のFは、そのEntity subtreeの描画boundsへカメラとOrbit中心を合わせる。boundsは表示中のMeshだけから測る。コライダー枠、ライトの向き矢印、選択輪郭などの編集用補助表示と、無効化された子は含めない。フォーカス中に別Entityを選択しただけでは追従しない。Fを押した時だけ対象を切り替える。
- 待機中のギズモと選択補助線はニュートラルカラーで控えめにする。操作中の軸とAsset drop targetだけを明るく示す。「ライトなし」「ワイヤー」「コライダー編集」は、既定のグレーMaterialが背景に埋もれない暗いneutral背景を使う。Scene settingsや公開結果は変更しない。
- panel resize / dock 中は drop preview と minimum size を示す。authoring Command や selection を変更しない。
- Scene View と Assets のheaderは、panelが狭くなっても一行を保つ。Scene Viewは名前を先に切る。次にスナップと「表示」のラベルをアイコンへ落とす。カメラ投影方式・表示モード・診断・録画を「表示」ポップオーバーへまとめる。Assetsは検索欄を縮める。breadcrumbを畳む。外部から追加とインポートをアイコンへ落とす。Play / 停止は常に一行の中に残す。他の操作へ重ねない。
- Material Asset の color、metalness、roughness、texture 参照は Edit と Play の Inspectorから変更できる。同じ Asset ID を参照する全 Entity の preview と同期する。Playでは参照Entityだけを再起動する。Entity 固有 Material 値へ複製しない。
- 外部 GLB / GLTF の drop は Import Queue で validate、source copy、derive、dynamic thumbnail、manifest commit まで処理する。Assets への drop は Scene 配置へ進めない。Scene への明示 drop だけが import 成功後の配置を同じ transaction intent で続ける。
- Play 準備中は二重開始を防ぐ。成功するまでauthoring documentを変更しない。Worldでは有効なSpawnPointをHierarchy順に解決する。親子TransformとSpawnPoint自身のPositionを合成した位置からキャラクターを開始する。Play開始後は実行コピーを`Play Window`へ表示する。HierarchyとInspectorは編集データへ接続したままにする。Entity / Component構成、Transform、Collider、Animation、既存Material / Particle AssetのpropertyとMCP経由のScene settingsは通常の履歴と自動保存で変更できる。Scene settingsは共有Scene viewへ即時反映する。Entity / Asset変更は影響するEntityだけへ反映する。Texture / Model設定、InspectorのMaterial割り当て、Scene ViewのTransformギズモ、Asset dropは停止まで無効にする。
- World Preview は有効な input と controller 操作方法を示し、Item Preview には World 用 avatar / controller を出さない。
- Play 中の input、controller、camera、physics などは PlaySession にだけ保持する。
- Play 中は Stop を常に見える位置に置き、別画面や別ブラウザへ移動させない。
- ヘッダーの「ビジュアル」、未保存、compile freshness、upload / 審査状態は操作中も消さない。

### 成功時

- Asset の配置成功では Asset ID を参照するroot Entityを一つ追加する。GLB / VRMにsource Node metadataがある場合だけ同じtransactionで編集用Node Entity treeを子へ展開する。Hierarchy、Scene View、Entity Inspectorはrootを選択する。Undoではrootと展開Node、selectionを配置前へ戻す。
- primitive 作成成功では `CreatePrimitiveCommand` 一件で Entity と builtin geometry reference を追加する。Material drop 成功では `AssignMaterialCommand` 一件で既存 Mesh slot だけを更新する。
- Transform 操作成功ではギズモまたは軸ラベルの pointer down から pointer up までを一件として確定する。選択とカメラを維持する。
- フォーカス成功では対象名とF / Escape / 解除ボタンをScene View端に残す。同じEntityでFを押すか解除操作を行うと開始前のカメラ位置、向き、Orbit中心、ズームへ戻す。
- layout 操作成功では normalized size、dock zone、order を Editor Preferences に保存する。再起動後も復元する。
- Material 操作成功では有効値が AssetManifest の一つの Material Asset に残る。共有する全 Entity の表示を更新する。SceneDocument と Entity 固有値は変更しない。
- Play開始成功では中央のPlay Windowでproject kindに対応するprofileを確認できる。Worldのキャラクターは有効なSpawnPointのworld位置から開始する。runtimeの位置、速度、animation時刻はPlaySessionにだけ残る。
- Play中の許可されたEntity変更は編集データへ残る。そのEntityだけruntime revisionを進めてAnimationとphysicsを先頭から再実行する。他Entityとcontrollerのruntime stateは維持する。
- Stop成功ではPlaySessionを破棄する。Play中に許可された調整を含む最新SceneDocumentとAssetManifest、selection、Edit cameraへ戻る。runtimeの位置や速度、`ctx.materials` / `ctx.particles` overrideをauthoring変更として扱わない。
- GLB / GLTF の import 成功は source / derived / thumbnail / manifest commit の完了と新 Asset card を表示する。Scene 配置は Scene drop または後続の「配置」が成功した時だけ別結果として示す。
- 同期操作の結果はトーストだけにせず、追加 Entity、右 Inspector、参照 Entity の表示、Import Queue の項目として画面へ残す。

### 失敗時

- 非対応ファイルは拡張子と対応形式を示し、SceneDocument、AssetManifest、selection、history を変更しない。
- Transform に有限でない値や不正な scale が入った場合、または軸スクラブを Escape / pointer cancel で終えた場合は操作前へ戻す。対象項目の近くに修正方法を示す。
- 選択Entityに描画boundsがない場合はworld Transform位置をフォーカス中心にする。Entity自体を選べない場合やPlay中、入力中はカメラを変更しない。
- Material Asset に不正な color、有限でない値、`0..1` の範囲外、欠落 texture 参照が入った場合は確定しない。右 Inspector の対象 field 近くに形式または範囲を示す。
- 欠落 Asset 参照では Entity を消さず、欠落 ID、参照元 Entity、Asset の再 import または置換を示す。
- primitive create point、parent、Material / Texture slot を解決できない場合は Command を確定しない。対象を選び直す操作を示す。
- Play の初期化に失敗した場合は Edit と authoring document を維持する。Scene View 内に profile、原因、再試行を示す。回避策として CLI や別ブラウザの手動起動を要求しない。
- Play 中に runtime error が発生した場合は PlaySession を dispose して Edit へ安全に戻す。SceneDocument と AssetManifest が変更されていないことを保つ。
- Scene View を初期化できない場合は MI-09 の面を表示する。ライブラリへ戻る操作と再読み込みを用意する。
- layout Preferences を保存できない場合は session layout を保つ。authoring を止めない。再試行と「レイアウトをリセット」を示す。
- 保存、変換、check、upload の失敗は実 stage と sanitized cause を表示する。成功通知へ進めない。retry または対象 field へ戻る操作を置く。

### 戻り先

- ヘッダーにライブラリへ戻る操作を置く。未保存変更がある場合は保存、破棄、取消を同じ画面内で選べる。
- Play 中にライブラリへ戻る場合は、先に Stop と同じ cleanup を実行して PlaySession を破棄する。runtime state を authoring document へ保存しない。
- 戻った後はプロジェクトライブラリを表示し、新規作成入口を先頭に保つ。
- Escape で未確定 dock / resize を開始前 layout へ戻す。「レイアウトをリセット」で左 Hierarchy、中央 Scene View、右 Inspector、下 Assets へ戻す。
- フォーカス中のEscape、解除ボタン、Play開始は保存したEdit cameraへ戻す。selectionとSceneDocumentは変更しない。
- 作成または保存 transaction が commit した project だけを一覧へ追加する。
- 永続化を接続した後は、Scene / Prefab / Asset / folder を含む save set のいずれかが未保存なら保存、破棄、戻るの取り消しを選べる確認へ置き換える。

完了条件: 四カードの入口、Hierarchy、Scene View、右 Inspector、下 Assets を使う。独立 selection、Scene Viewを含む複数選択と共通プロパティ編集、復元可能なEntityフォーカス、目的別のScene View表示、Empty / primitive / XRift Component 作成、Asset / Material / Particle / XRift Prefab D&D、Hierarchyの文字検索・種類フィルター・折り畳み・並び替え・親子化・Enabled、親子Transform、軸スクラブとScale比率固定、ComponentごとのEnabled、視覚的なMaterial選択、Material / Texture / Particle 編集、Material Textureのタイリング、Animation / InteractivityからのMaterial操作、配置Entityごとの静的なモデルポーズ、GLB / VRMのNode・Bone・Mesh別編集、GLB / glTF AnimationのPlay時自動再生、動的 thumbnail、Texture Assetから設定できるproject thumbnail、Playとシーン全体の環境設定、右上のModel / R3F / Classic Importを扱える。左下のユーティリティレールからヘルプ、ショートカット、シーン設定へ迷わず到達できる。panel layout は resize / dock 後も復元される。Editor render / module load failure は App 全体へ伝播させない。再試行、再読み込み、一覧への復帰を選べる。

<a id="f-09"></a>

## F-09 Command / Shortcut / Prefab の状態設計

### 操作前

- toolbar、context menu、tooltip、Shortcut 設定は同じ command label、semantic Lucide icon、platform binding、enabled reason を中央 Registry から表示する。
- 左下のキーボードから現在有効なShortcut一覧を分類表示する。操作を探すために各toolbarを巡回させない。
- Hierarchy から Assets へ drag する時は reparent ではなく Prefab 作成になる。作成先 folder、subtree / dependency 件数を drop 前に示す。

### 操作中

- Copy は versioned buffer だけを更新する。Paste / Duplicate / Delete / Prefab 作成は before / after documents と `sceneSelection` / `assetSelection` を一 transaction に保持する。
- text input、contenteditable、数値 field、IME composition が focus 中は W / E / R / X / F / 矢印 / PageUp / PageDown / Delete / Copy / Paste / Duplicate の editor command を実行しない。Shift による snap の反転も同じ条件で止める。shortcut conflict はどちらも実行しない。
- snap の入切と間隔は `editor.gizmo` の scene 設定として保存する。Undo 履歴には積まない。矢印 / PageUp / PageDown の 1 ステップは gizmo drag と同じ一件の履歴として確定する。

### 成功時

- Paste / Duplicate は決定済みの新 ID、Prefab 作成は Prefab Asset / document / folder membership / instance metadata を一度だけ確定する。両 selection を仕様どおり更新する。
- Undo / Redo は同じ IDs、dependency references、Prefab overrides、前後の両 selection を復元する。toolbar、menu、keyboard の入口によって履歴結果を変えない。

### 失敗時

- stale copy buffer、revision conflict、Prefab cycle、missing dependency、参照中 Asset delete は document を変えない。対象 ID と修正操作を示す。
- cross-document Prefab transaction の一部だけを残さない。temporary Prefab document と払い出し ID を破棄する。元の Scene / Asset / folder revision へ戻す。

### 戻り先

- Escape は未確定 drag / menu / dialog を閉じる。操作前の両 selection と focus surface へ戻る。確定後の戻りは Undo を使う。
- shortcut の override は Editor Preferences に残す。project を切り替えても同じ binding を使う。「既定へ戻す」で Registry default へ戻せる。

完了条件: toolbar、menu、keyboard、Hierarchy D&D と左下の一覧が同じ Command / Shortcut Registry を使う。Copy / Paste / Duplicate / Delete / Reparent、Entityフォーカスの切替と解除、Empty / Component 作成、Hierarchy からの Prefab 化、XRift built-in Prefab配置、Undo / Redo が IDs と両 selection を復元する。

<a id="f-11"></a>

## F-11 Collider authoring / export の状態設計

### 操作前

- 新規 import した Model は `generateColliders` を既定で有効にする。Sceneへ初回配置した時に同じ Entityへ既定`Static (Fixed)`の`Mesh Collider`を追加する。既存 Asset で明示的に無効化された設定は移行で上書きしない。
- built-in primitive は `Box Collider` を同時作成する。Floor / Plane は薄い local bounds、その他は primitive bounds を初期 Half Extents とする。Entity Scale は値へ焼き込まない。Transformで追従させる。
- PhysicsのAdd Componentに`Rigid Body`を一Entity一件で表示する。追加した親Entityは自身と子孫のCollider / Meshを一つの物理Bodyへまとめる。ネストした別Rigid Body Entityから先は別Bodyとして扱う。

### 操作中

- Inspector は Box の Center、Half Extents、自動フィット、Mesh の Trimesh / Convex Hull、共通の Enabled、Trigger、Friction、Restitutionを同じ Component cardで編集する。
- Rigid Body cardで`Static (Fixed)` / `Dynamic` / `Kinematic Position` / `Kinematic Velocity`、Gravity Scale、Linear / Angular Damping、Can Sleep、CCD、Position / Rotation Lockを編集する。Collider生成は`子孫のCollider Component`、`Auto Cuboid`、`Auto Ball`、`Auto Convex Hull`、`Auto Trimesh`から選ぶ。対象となる子孫Collider / Mesh件数を同じcardに表示する。
- Rigid Body Componentがない旧documentではCollider内のBody設定を互換読み込みする。`Static (Fixed)`を既定にする。旧Classic importerが子を持つ空Entityの原点へ作った既定サイズBoxは、名前またはBody / surface設定のimport signatureを確認できる場合だけ親Rigid Body Componentへ読み込みmigrationする。原点Boxを残さない。親または自身にRigid Body ComponentがあるColliderは、Body設定の編集先をその親Entity名で示す。Collider cardでは形状と接触設定だけを編集する。
- Boxの再フィットは同じ Entity の Mesh boundsだけを使用する。Modelはimport metadataのboundsとimport scaleを用いる。absolute pathや生のglTFデータをScene documentへ保存しない。
- Scene Viewの「コライダー編集」はMeshを抑えてCollider形状だけを確認する。選択Entityの診断件数と、MCPと同じ安全な最適化操作を表示する。`inspect_colliders`は`entityIds`を省略すればScene全体を扱う。`optimize_colliders`は`projectId`、`sceneId`、`expectedRevision`を使って同じ結果を一回のEditor revisionへ反映する。

### 成功時

- Box / Mesh Colliderの変更、追加、削除は一つのScene history transactionになる。選択を維持する。選択中のBox ColliderはScene Viewにwireframeで表示する。
- PlayとcompilerはRigid Body Entityのlocal TransformをBody原点にする。そのsubtreeを一つのRapier `RigidBody`で包む。子孫のBoxは各Entityのlocal階層を保った`CuboidCollider`、Mesh Colliderは`MeshCollider`として同じBodyへ含める。親原点へ代替Boxを追加しない。ネストしたRigid Bodyは新しいBody ownershipを開始する。
- Auto Colliderを選んだ場合はRapierの自動生成をsubtree Meshへ適用する。Dynamic / Kinematicの明示TrimeshはRapier互換のConvex Hullへ自動変換する。compiler診断にも残す。
- 最適化ではDynamic / KinematicのMesh Colliderを保存データ上もConvex Hullへ揃える。移動体のCCDを有効化する。出力時に先頭へ畳まれる重複Mesh Colliderを無効化する。自動Colliderと明示Mesh Colliderの併用、Meshなし、無効Entityは自動で無効化しない。診断へ残す。

### 失敗時

- MeshのないEntityへMesh Colliderを追加しない。必要なMesh Rendererを示す。自動フィットboundsがない時は既存値とSceneを変更しない。
- 非有限Center、0以下のHalf Extents、負のFriction、`0..1`外のRestitutionは確定しない。upload前validationでもblocking diagnosticにする。
- Rigid Bodyのsubtreeに明示Colliderがなく、Auto Collider対象のMeshもない場合はBodyを消さない。Inspectorとcompiler診断へ「物理形状がありません」と示す。

### 戻り先

- ColliderまたはRigid Body削除後もMesh、Material、Transform、Entity selectionを維持する。Undoで同じComponent ID、Body ownership、設定を復元する。

完了条件: importしたModelとbuilt-in primitiveへ既定Colliderが付く。形状、Center / Half Extents、自動フィット、Rigid Bodyの物理設定をInspectorから編集できる。Scene Viewの「コライダー」表示、Play、生成Worldが同じ物理表現を使う。

<a id="f-12"></a>

## F-12 Scene environment settings の状態設計

### 操作前

- 左下の歯車「シーン設定」は、Entity / Asset selection を変えない。右のEntity InspectorをScene Inspectorへ切り替える。設定対象は Scene 全体だ。Hierarchy の Entity として追加しない。
- Skybox、Fog、環境光は Scene View のプレビューと生成する World の両方に反映する。SkyboxはAssetsのequirectangular環境Textureまたは通常の画像Textureを選択・ドロップで設定する。背景表示とIBLライティングを独立して切り替える。回転と露出を共有する。HDR / EXRを直接importした場合は新しい環境Texture Assetを同じSceneへ設定する。背景とIBLを既定で有効にする。Near / Far、FOV、背景、グリッド、ギズモ、スナップは編集ビューの設定として明示する。
- Scene View固有の不透明な地面は追加しない。Skybox有効時は地平線の下側までSkyboxを見せる。その上へ編集用グリッドだけを重ねる。
- サムネイルは保存済み project でだけ編集可能にする。未保存 project では保存後に設定できる理由をボタン文言で示す。

### 操作中

- 色、トグル、数値の変更は対象 section 内で即時にプレビューへ反映する。数値入力は Enter または focus を外した時に確定する。不正値は直前の有効値へ戻す。Skybox画像は環境Textureまたは通常の画像Textureだけを受け付ける。画像がない時はIBLトグルを無効にする。Texture InspectorのFlip Yを基本値とする。Scene Inspectorの追加反転はScene固有の上書きとして合成する。
- Fog の終了距離は開始距離より大きく、Camera Far は Near より大きく保つ。Play 中は document を変えない。各 control を読み取り専用にする。
- ギズモのスナップは移動、回転、拡縮に同じ設定を適用する。グリッドの表示を切っても Entity や SceneDocument の構造は変えない。

### 成功時

- 確定した Scene settings は Undo / Redo の一件として残る。保存後に Scene JSON へ書き込まれる。compiler はSkybox画像の背景とIBLを独立した設定として、Fog、環境光とともに generated World source に出力する。
- サムネイルを保存した後はScene Inspectorへ戻る。公開前確認が同じ画像を再取得できる状態を保つ。

### 失敗時

- 読み取り専用、未保存project、範囲外の数値、無効な色、使用できないSkybox画像では SceneDocument と選択を変えない。同じ場所で理由または復帰方法を示す。生成対象にできない画像はグラデーションへフォールバックする。compile診断に残す。
- サムネイルの読み書きに失敗した時は既存画像を維持する。サムネイル編集画面内で再試行できる。

### 戻り先

- ヘッダーの戻る、Entity / Assetの選択はScene Inspectorだけを閉じる。直前のScene Viewとselection、編集位置へ戻る。確定済みの変更は保存または Undo で扱う。

完了条件: 左下の歯車から右のScene Inspectorへ切り替える。ワールド名またはアイテム名、説明、サムネイル、Skyboxの背景表示・IBLライティング、無限遠・ボックス・地面付きドーム投影、画像・回転・明るさ・有限メッシュTransform・投影中心、Fog、環境光、Near/Far、FOV、背景、グリッド、ギズモ、スナップを一か所で設定する。公開情報、Scene View、生成Worldへ一貫して反映する。

<a id="f-13"></a>

## F-13 XRift Component editor preview の状態設計

### 操作前

- Hierarchy、Create、Inspector、AssetsはComponent Registryの公式名、説明、semantic iconを使用する。Scene Viewは保存済みPropsとEntity Transformを`@xrift/world-components`本体へ渡す。EditとPlayで同じ公式Rendererを使用する。
- `XRiftProvider`、Physics、各runtime ContextはStudio Provider bridgeで供給する。instance取得、遷移、ユーザー、画面共有など外部platformの副作用は起こさない。公式ComponentのReact／Three実装は差し替えない。

### 操作中

- InspectorでPortalの`instanceId` / `disabled`、TagBoardの`title` / `columns` / `tags` / `scale`を変更する。同じ公式ComponentへPropsを即時反映する。通信、ユーザー状態の生成、Scene history以外の副作用は起こさない。
- Interactable、Grabbable、TextInput、BillboardYは別の外観を作らない。同じEntityの実childrenを公式wrapperで包む。

### 成功時

- Portal、TagBoard、EntryLogBoard、Mirror、Video系を含む全公式Componentはpackage versionに含まれる実装どおりに表示する。Studio独自の旧ポータルshader、HTML board、簡易screenへ分岐しない。
- カタログthumbnailは同じProvider bridgeと公式Rendererを固定generatorで描画する。保存済みWebPとして一覧と詳細で共有する。Component名と公式badgeは識別情報として画像へ焼き込む。Component本体の代わりにSVG、CSS図形、DOMの疑似サムネイルを使わない。

### 失敗時

- 欠落または不正なPropsはRegistry defaultまたは公式Componentの空状態へフォールバックする。Scene View全体を停止させない。公式Rendererを安全に起動できない場合は架空の代替外観を作らない。Component名と未対応理由をEditor診断に残す。

### 戻り先

- 選択解除、Entity削除、Undo / Redoでは補助表示だけを同じScene documentへ追従させる。Camera、selection、runtime stateを追加で変更しない。

完了条件: EditとPlayで公式package本体と同じRendererを使う。Portal、TagBoardを含むComponentの実際の見た目をStudio独自デザインへ置換せず確認できる。外部runtime機能だけを副作用なしProvider bridgeへ差し替える。

<a id="f-14"></a>

## F-14 Basic Component menu / Audio Source の状態設計

### 操作前

- Create、Hierarchy右クリック、InspectorのAdd Componentは同じ基本Component Registryを使う。Core、Rendering、Physics、Interaction、Media、World、Scriptingを折りたたみsectionとして表示する。三つの入口は同じcategory一覧を表示し、いずれかだけが特定categoryを省略しない。追加メニューには検索欄を置く。Componentは名前、category、IDで絞り込める。XRift Componentは名前、description、category、schema IDで絞り込める。CreateとHierarchy右クリックではEmpty Entity、Primitive、XRift Prefabも同じ検索結果に含める。ライト種別、Particle Emitter、Audio SourceはRendering / Mediaの意味が分かる名前とiconを共有する。
- Audio Sourceは追加直後も既存Entity selectionを維持する。InspectorでImport済みAudio Assetを選択できる。直接URLは新規設定に使わない。既定では自動再生しない。編集画面を開いただけで音を鳴らさない。

### 操作中

- sectionの開閉と検索文字の入力・クリアはSceneDocumentと履歴を変更しない。検索中は一致するsectionを開く。候補がない場合は同じメニューで伝える。項目を選んだ時だけComponent追加を一件確定する。メニューを閉じる。追加したComponentのInspectorを表示する。
- Audio SourceはEnabled、Audio Asset、Volume、Loop、Autoplay、Spatial、Reference Distance、Rolloff、Max Distanceを型と範囲を保って編集する。Audio Assetがない時は同じInspectorからMP3 / WAV Importの入口を理解できる。Edit表示では音声取得を開始しない。Play中はvolume / loop /距離propertyを既存playerへ更新する。Asset、spatial、enabled、構成変更は対象Entityだけを再同期する。

### 成功時

- Playとcompilerは参照されたMP3 / WAVを管理下sourceから読み込む。同じAudio Source runtimeで通常Audio / PositionalAudioへ変換する。cameraへAudioListenerを接続する。Componentを無効化した時とEntityを破棄した時は再生、listener、buffer参照をcleanupする。
- ライト、Particle、Audio SourceはCreate、Hierarchy、Inspectorのどの入口から追加しても同じComponent ID、初期値、重複規則、生成結果になる。

### 失敗時

- 未設定Audio Assetやload失敗でScene View全体を停止させない。未設定はcompile warningとして出力を省略し、参照切れ・MP3 / WAV以外のsourceはcompileをblockする。runtime load失敗は該当Componentの音声だけを停止する。自動再生policyで拒否された時はblocked状態を保持する。操作後のScriptまたは通常操作から再試行できる。
- 非有限値、範囲外のVolume、0以下の距離、負のRolloffは確定しない。直前のSceneDocumentとselectionを維持する。

### 戻り先

- Add Componentを閉じると同じEntity Inspectorへ戻る。追加後は同じEntityを選択したままにする。UndoでComponent追加前へ戻る。Redoで同じComponent IDと設定へ戻れる。

完了条件: Create、Hierarchy右クリック、InspectorのAdd Componentが同じComponent Registryとcategoryを表示する。検索から一件追加する。Inspectorへ到達できる。Audio SourceはImport済みAudio Assetを選ぶ。編集画面を開いただけでは音を鳴らさない。

<a id="f-25"></a>

## F-25 AssetsとOSファイルエクスプローラーの状態設計

参照: MI-11, MI-20, MI-28

### 操作前

- Assetsの空白、論理folder、Assetの右クリックmenuから、物理Assets rootまたはproject sourceの保存場所をエクスプローラーで確認できる。未保存projectでは操作を無効にし、先に保存する理由をtooltipで示す。
- 外部ファイルはエクスプローラーからAssets panelへdropでき、対応形式と処理結果は通常のImport入口と同じImport Queueで扱う。

### 操作中

- project sourceを持つAssetは検証済みのproject-relative fileをエクスプローラーで選択表示する。document / builtin Assetと論理folderは実ファイルがないため、project管理下の物理`assets` folderを開く。
- Explorer操作はSceneDocument、AssetManifest、selection、historyを変更しない。file dropだけがMI-20のvalidate、copy、derive、commitへ進み、drop overlayで受付状態を示す。

### 成功時

- Explorerを開いた後も同じEditor、Asset selection、Inspector contextを維持し、Assets statusに開いた対象を示す。
- drop import完了時は新Assetを選択し、「アセットを表示」とImport Activityから同じ結果へ戻れる。

### 失敗時

- source欠落、管理外path、Explorer起動失敗ではEditorを閉じず、Asset sourceまたはproject保存場所を確認する案内をAssets statusに示す。
- unsupported file、decode、copy、commit失敗では既存のSceneDocumentとAssetManifestを変更せず、Import Activityから原因と再試行先を確認できる。

### 戻り先

- Explorerを閉じる、dropを領域外で終える、Escapeでmenuを閉じる場合はいずれも、操作前のEditorと両selectionへ戻る。

完了条件: Assetsの右クリックから物理保存場所をエクスプローラーで開ける。エクスプローラーからのdropも通常のImport Queueで扱う。未保存projectでは理由を示して無効にする。

<a id="f-31"></a>

## F-31 Terrain authoring / MCP の状態設計

参照: MI-03, MI-05, MI-09, MI-13, MI-16, MI-76, MI-87

### 操作前

- Createメニューの「Terrain」から、16 × 16m・33 × 33 sample・平坦なTerrainを作成できる。Terrainには常にstatic Trimesh Colliderを付け、Material slotは一つだけにする。
- 選択中TerrainのInspectorにはSize、Resolution、現在のHeight rangeと、Raise / Lower / Flatten / SmoothのBrushを表示する。中心X/Z、radius、strength、Flattenのtarget heightを指定して一回のスタンプを適用する。
- 「草」では層の一覧、密度、傾斜の上限に加えて、選択中の層だけに色と大きさを開く。値は種類の既定から始まり、動かした項目だけが層の上書きになるので、既定のまま使う層は何も持たない。

### 処理中

- 作成と各ブラシスタンプはEdit中だけ有効にし、Play中またはAsset import中は無効化して理由を残す。ブラシ処理中に別のdocument操作を重ねない。
- MCPでは`get_terrain`で対象の範囲を確認し、`create_terrain`または`sculpt_terrain`へprojectId、sceneId、expectedRevisionを渡す。UIとMCPは同じheight sample計算を使う。

### 成功時

- Terrainを選択したままScene View、Hierarchy、Inspectorを更新し、各スタンプを一件のUndo履歴とautosave対象として確定する。Scene View、Play、compile、runtime manifestは同じheight samplesを使う。
- static Trimesh Colliderの範囲はTerrainの幅、奥行き、高さrangeに追従する。Material slotからTerrainの見た目を続けて調整できる。
- 草の色と大きさの変更も同じ一件のScene更新として確定し、Scene View、Play、生成Worldは同じ解決済みの値で描く。「種類の既定に戻す」で層は上書きを持たない状態へ戻る。層が本数の上限に達している場合は「本数を確認」に、密度どおりに生えないことと下げ方を示す。

### 失敗時

- 範囲外、空の対象、古いrevision、Terrain以外のEntityへの適用はdocumentとhistoryを変更しない。Inspectorの入力と選択を保ち、対象またはrevisionを確認して同じ操作からやり直せる。

### 戻り先

- 作成・ブラシ適用後はTerrain Inspectorに留まる。Undo / Redoで直前のTerrain samplesを戻し、必要ならMaterialまたはCollider診断へ進める。

完了条件: Createメニューからstatic Terrainを追加する。InspectorとMCPの同じRaise / Lower / Flatten / Smoothブラシで高さサンプルを編集する。各スタンプは一件のUndo履歴として保存される。Scene View、Play、生成コード、Trimesh Colliderへ同じTerrainを反映する。

<a id="f-32"></a>

## F-32 Scene post effects の状態設計

参照: MI-03, MI-05, MI-09, MI-13, MI-15, MI-16, MI-80

### 操作前

- Scene settingsにポストエフェクトを表示し、全体の有効化、HDR / tone mapping、SSAO、Bloomの有効化、threshold / strength / radius、exposureを一つのまとまりとして編集できる。WindはEntity Componentで対象を指定し、風量はScene settingsのグローバル値で一括調整する。既存Sceneのvegetation sectionはWind設定として互換保持し、sectionや新しい subsectionがなくても既定値で読み込み、古い制作データを壊さない。

### 処理中

- MCPとInspectorは同じrevision検査、autosave、Scene View同期を使う。HDR / AO / Bloomを個別に無効にした場合も通常のrendererへ戻し、最後のフレームを画面に残さない。

### 成功時

- Scene ViewとPlayで同じpostprocessing設定を確認でき、公開用の生成Worldにも同じHDR / AO / Bloom / exposureが出力される。WindはComponentを付けたEntityだけを対象にし、Scene Settingsのグローバル値がEditor / Play / Runtimeへ反映される。保存後にライブラリへ戻り再オープンしてもsectionと値を再取得できる。
- 保存後にSceneを再読込しても、設定値とRenderer contractを失わず、次のライティング改善へ進める。

### 失敗時

- 無効なpostprocessing sectionはSceneを開けなくする代わりに、対象pathと期待するobject shapeを示して修正する。古いSceneでsectionがない場合は互換既定値を使う。
- Viteやrendererの初期化に失敗した場合はSceneデータを変更せず、再読み込みまたはライブラリへ戻る導線を残す。

### 戻り先

- 設定変更後はScene Viewへ留まり、Play、Compile、公開レビューの順に進める。失敗時はScene settingsまたは変換manifestのdiagnosticsへ戻る。

完了条件: Scene settingsでHDR / AO / Bloom / 露出を編集する。Scene View、Play、生成Worldの同じレンダリング設定へ反映する。設定は保存・再読込・公開レビューまで同じScene contractで扱う。

<a id="f-33"></a>

## F-33 Wind Componentの状態設計

参照: MI-03, MI-05, MI-09, MI-11, MI-13, MI-14, MI-15, MI-16, MI-81

### 操作前

- Wind ComponentはEntity InspectorのAdd ComponentからRenderingカテゴリーに置く。Component検索でも同じ項目に到達できる。
- Componentカードは「Wind」「Entity Component」を見出しにし、対象がこのEntityと子Meshであること、風の強さ・速度・突風はScene Settingsのグローバル設定を使うこと、Mesh名からは判定しないことを本文で示す。カード内の操作はEnabledだけにし、同じ値をComponentとScene Settingsの二か所で編集させない。
- Scene Settingsの「Wind（グローバル）」に、Windの有効化、風の強さ、風の速度、突風の強さ、風向き（度）を置く。シーンの風は常に一つであることを同じ場所に書く。
- 風に反応するShader Materialは、`uWindDirection`、`uWindSpeed`、`uWindTurbulence`を宣言したものだけが対象になる。宣言していないshaderへ値を渡さず、対応しているように見せない。

### 操作中

- Componentの追加とEnabledの切り替えは一件のScene更新として履歴と自動保存へ入り、Scene Viewへ即時反映する。InspectorとMCPは同じrevision検査を通る。
- グローバル設定の変更はScene Viewの対象Entityと風対応Materialへ同時に反映する。水面が北へ、草が東へ流れるような食い違いを作らない。
- 向きはグローバルのままとし、Entity側では上書きしない。一つのシーンに二つの風向きを持たせない。

### 成功時

- Editor Preview、Play、生成World、Runtime manifestが同じComponentとScene値を読み、同じ揺れを描く。
- グローバルWindを無効にした場合、またはEntityのComponentを無効にした場合は完全な静止に戻す。Materialが独自に動き続けない。

### 失敗時

- 対象Entityに描画対象のMeshがない場合もComponent自体は保存し、対象が空であることを示す。名前や見た目からの推測で別のEntityを対象にしない。
- Scene Settingsに風の設定がない古いSceneは互換既定値で読み込み、Sceneを開けなくしない。

### 戻り先

- 追加・変更後はEntity Inspectorに留まり、グローバル値の調整はScene Settingsへ一操作で移動できる。確認はPlayで行う。

完了条件: Entity InspectorまたはMCPからWind Componentを明示的に追加する。対象Entityと子MeshだけへScene Settingsのグローバル風設定を適用する。Editor Preview、Play、生成World、Runtime manifestは同じComponentとScene値を使う。名前・Mesh分類・言語に依存した対象推測を行わない。

<a id="f-34"></a>

## F-34 Skybox Shader（手続き的な空）の状態設計

参照: MI-03, MI-05, MI-09, MI-15, MI-16, MI-19, MI-25, MI-82, MI-83

### 操作前

- 「外部リソースを追加」の左一覧に「Skybox Shader」を公式カタログとして置き、「画像ではなくGLSLで空を描くMaterialです」と件数を見出しに示す。
- カードは実際のGLSLをWebGLで描画する。SVGやCSSの疑似サムネイルを使わず、カードで見えているものと追加後の空を一致させる。カテゴリー（昼、夕暮れ、朝焼け、夜空、オーロラ、宇宙）で絞り込める。
- 詳細では、そのpresetが何を描くかと負荷の目安を文章で示し、Uniform valuesを名前・値・説明・uniform名付きのsliderとして並べる。変更はプレビューへ即時反映し、「既定値へ戻す」でpresetの値に戻せる。
- 追加ボタンは「〇〇を空へ設定」とし、「追加後にSceneの空へ設定」を既定で有効にする。外した場合はMaterialだけを追加することを同じ場所に書く。
- Scene Settingsのスカイボックスには「Skybox Shader（Custom Shader Material）」の選択肢を置き、割り当て中はSkybox画像とグラデーションより優先して空を描くことを示す。

### 操作中

- 追加は通常のAsset import transactionを通り、Material Assetの作成とSceneのskybox設定を同じ履歴へ確定する。
- 割り当て中は上空の色、地平線の色、オフセット、グラデーションを無効表示にする。水平回転と明るさはshaderのuniformへ渡すため有効なまま残す。
- Scene ViewはSkybox Shaderを描画しない。編集中の背景は単色のままで、見え方はPlayで確認する。この違いをUIで示し、描画に失敗したと誤解させない。

### 成功時

- 追加後はMaterial Assetとして残り、星の数や色をInspectorのUniform valuesから何度でも変更できる。カタログからの調整とInspectorでの再調整は同じMaterialを指す。
- Play、生成World、Runtime manifestが同じGLSLと同じuniform値を使う。
- 同じpresetをもう一度追加した場合はMaterialをpresetの値で上書きし、二つ目の同名Materialを増やさない。

### 失敗時

- 割り当てたMaterialが欠落または不正な場合は理由を示してグラデーションの空へ戻す。背景を空にしない。
- 重いpresetはstep数をvariant defineとして残し、下げられる状態にする。負荷を隠さない。

### 戻り先

- 追加後はScene SettingsのSkybox Shader欄へ戻り、「〇〇のUniformを編集」からMaterial Inspectorへ移動できる。カタログを閉じた場合もSceneとselectionは変わらない。

完了条件: 画像Skyboxではなく、Custom Shader Materialとして昼・夕暮れ・朝焼け・夜空・オーロラ・星雲の空を追加できる。星の数、太陽と月の位置、月の満ち欠け、雲、地平線の遠景をuniformで調整できる。レイマーチする厚みのある雲も選べる。外部リソース集での調整とInspectorでの再調整が同じMaterialを指す。Scene View、Play、生成Worldが同じGLSLを描く。Materialが欠落した場合はグラデーションへ戻す。警告診断を残す。重いpresetはstep数をvariant defineとして残す。下げられる状態にする。

<a id="f-39"></a>

## F-39 Text Component（書体・背景）の状態設計

参照: MI-05, MI-09, MI-81, MI-90

### 操作前

- Create、Hierarchy右クリック、InspectorのAdd ComponentのRenderingに「Text」「Text Panel (看板)」「Text Caption (作品キャプション)」を並べる。三つは同じText Componentで、初期の書体、揃え、背景の板だけが異なる。看板とキャプションは追加した時点で板と書体が入っており、美術館の解説や壁のラベルをそのまま置ける。
- Inspectorは文字（内容、書体、太さ、色、大きさ、折り返し幅、揃え、行間、字間、基準点、縁取り）と背景（なし・色・画像、色味、不透明度、板の大きさ、余白または幅高さ、文字との奥行き、裏からの見え方）を一つのカードに順に並べる。
- 書体は「自動」を既定にする。自動は同梱の標準書体（日本語subsetのため欧文も含む）で表示するので、日本語と欧文が混ざっていても設定なしで表示できる。
- 手持ちの書体を使う場合は、TTF、OTF、WOFFのファイルをAssetsへ取り込み、同じ書体の選択欄の「プロジェクトのフォント」から選ぶ。WOFF2は表示に使えないため取り込みの時点で理由を示して断る。取り込んだフォントは太さを選べないので、太さの操作は同梱書体のときだけ意味を持つ。

### 処理中

- 書体を選ぶと、その書体の同梱ファイルを初回だけ取得し、取得が終わってから一度だけ組版する。取得の間は文字を描かず、背景の板だけを先に置く。取得済みの書体はキャッシュから即座に使う。自動の書体で先に組んでから差し替えないのは、その組版が文字種ごとの代替フォント取得を伴い、代替フォントの配布元へ到達できない環境では以後の組版ごと止まってしまうため。
- 背景の画像はAssetsのTexture Assetから選ぶ。Edit中はプロジェクトの画像をそのまま読み、Scene ViewとPlayで同じ板を描く。
- 板の大きさが「文字に合わせる」のときは、組版が終わるたびに実測した文字の範囲へ余白を足して板を組み直す。実測が終わるまでは板を出さないので、途中の大きさで一瞬ちらつかない。

### 成功時

- Scene View、Play、生成したClassic source、公開したWorldは同じText Componentの値から同じ描画経路で文字と板を描く。Studioが独自に別の見た目を作ることはない。
- 「自動」も同梱の書体として解決する。文字種ごとに配布元から代替フォントを取得する経路は使わない。公開したWorldはそこへ到達できず文字が表示されないうえ、Studioと公開先で字形が食い違うため。書体のファイルはWorldへ同梱し、Runtime JSON出力ではmanifestがその置き場所を示す。
- 書体は`fontId`だけをドキュメントへ保存し、ファイルのURLはカタログが一箇所で決める。家族が持たない太さを選んだ場合は、実際に配布されている太さへ丸めて保存する。
- 背景に選んだTexture Assetは公開時の同梱対象になり、Runtime manifestにも参照が残る。

### 失敗時

- 取り込んだフォントの参照先が見つからない、または公開用にコピーできない場合は、同梱の書体で出力し、compileで警告を残す。文字が消えることはない。
- 書体のファイルを読めなかった場合はtroika既定の字形で表示を続ける。文字が消えることはなく、Inspectorに取得できない可能性を文言で残す。
- 背景を「画像」にしたまま画像が未設定、または参照先が公開できないTextureのときは、compileで警告を出して色だけの板として出力する。文字は必ず出力する。
- カタログにない書体ID、範囲外の太さ・行間・不透明度・余白・幅高さはSceneDocument、selection、historyを変更しない。MCPからの`update_component`も同じ境界で拒否し、背景の画像はTexture Assetを指しているときだけ受け付ける。

### 戻り先

- 変更は一件のScene更新として保存し、Undoで直前の書体・背景へ戻る。追加や編集の後も同じEntity Inspectorに留まり、Preview / Compile / Playへ進める。

完了条件: Text、Text Panel（看板）、Text Caption（作品キャプション）を同じComponent Registryから追加する。同梱書体または取り込んだフォント、色、太さ、揃え、行間と、色または画像の背景板をInspectorで設定できる。板は文字の実測値に合わせて組み立てる。Scene View、Play、生成Classic source、公開Worldが同じ描画経路で同じ見た目になる。取得できない書体は自動の書体へ落とす。出力できない背景画像は色だけの板へ落とす。文字は必ず表示する。
