# XRift Studio マイクロインタラクション Wiki

この文書は、XRift Studio の画面が「どの状態で、何を伝えるために、どう動くか」を定義する。個々の機能仕様は、ここにある ID を参照して、体験の一貫性を保つ。

## 使い方

新しい画面や状態遷移を追加するときは、既存の項目を再利用するか、新しい `MI-xx` を追加する。項目には必ず、対象状態、開始条件、見た目の変化、操作可能な状態、終わり方を書く。装飾だけの動きは追加しない。

機能仕様では、次の形式で参照する。

```text
F-06 アイテム検査
参照: MI-03, MI-05, MI-09
```

## 共通の動き

| ID | 状態と開始条件 | 見た目と時間 | 操作と終わり方 |
| --- | --- | --- | --- |
| MI-01 | 画面または一覧が初めて表示される | `fade-in`、450ms、下から 6px。画面の存在を示すだけで、注目を奪わない。 | 表示中も操作を妨げない。完了後は静止する。 |
| MI-02 | カードや副操作にポインタを重ねる | 背景または境界線をわずかに変え、カードは最大 4px 上へ。200ms 以内。 | クリック可能であることを示す。意味のない常時アニメーションは使わない。 |
| MI-03 | 主操作を実行する | ラベルを「実行中」に変え、ボタンを無効化する。必要ならログまたは進捗を開く。 | 二重実行を防ぐ。成功、失敗、取消可能のいずれかが明らかになるまで通常状態へ戻さない。 |
| MI-04 | ダイアログを開く | 背景を薄く暗くし、内容を `scale-in`、350ms、0.94 から 1.0 へ表示する。 | 背景クリックと Escape の扱いを明示する。処理中で安全に閉じられない場合は閉じる操作を無効にする。 |
| MI-05 | 非同期処理が成功または失敗する | 成功・失敗のトーストを短く表示する。色だけでなく操作名と結果を文言で示す。 | トーストだけで完了にしない。作成物、URL、ログ、再試行のいずれかへ到達できる状態を残す。 |
| MI-06 | 一覧の項目が表示される | 一覧全体を 100ms 遅らせ、各カードは 40ms ずつずらして `fade-in` する。 | 新規作成カードを先頭に固定する。空状態でも作成入口を表示する。 |
| MI-07 | アップロード前に公開情報を確認する | target、`xrift.json` 相当のタイトル・説明、サムネイル、既存 remote ID、保存 / compile freshness、診断を一つの review に示し、未編集項目だけを「テンプレートのままです」と表示する。 | blocker があればアップロードしない。対象 field または Editor へ戻り、保存・compile 後に同じ review を再確認する。すべて整った時だけ明示的な最終操作を有効にする。 |
| MI-08 | ローカル実行、upload または審査結果を得る | local preview は実行中、upload 完了は ID / version / content hash、審査中は「処理中」、公開済みは「公開済み」と別 label で示す。公式 result に URL がある時だけ URL を表示する。 | URL を ID から推測しない。Stop、status refresh、結果コピー、Editor へ戻るのうち現在可能な操作を残す。古い結果は input hash と version を添えて区別する。 |
| MI-09 | 読み込み失敗、設定不備、空の状態になる | 落ち着いたエラーまたは空状態の面を表示し、原因または状況を一文で示す。 | 必ず再試行、編集、作成、ログ確認のいずれか一つ以上を置く。 |
| MI-10 | Hierarchy または Scene View で Entity を選択する | 120ms 以内に Hierarchy の選択背景、Scene View の選択表示、Inspector の見出しと値を同じ Entity ID へ更新する。選択表示は色だけに頼らない。 | 選択のためにシーンデータや Undo 履歴は変更しない。別 Entity の選択または明示的な選択解除で終わる。 |
| MI-11 | user Asset を Scene View / Hierarchy へ drag する、「配置」を実行する、Hierarchy / Scene の右クリックから primitive を作る、または外部ファイルを drop する | drag 中に対象と結果を表示する。Model / Prefab / Particle / Audio は Scene View では配置位置、Hierarchy では Scene Root または親 Entity を明示して Entity 配置する。Audioは参照元Audio Assetを設定済みのAudio Source Entityになる。Material は hover 中 Mesh slot への binding、Texture は Material Inspector slot への参照になる。右クリック Create は click point / 選択親を示す。外部 file は Import Queue の全 stage を通す。 | Escape または領域外 drop は変更せず終了する。drag と「配置」は同じ Asset placement を使い、Place / Create / Assign Material の Undo は一つの履歴で document と前の `sceneSelection` / `assetSelection` を復元する。import 失敗では SceneDocument と AssetManifest を変えない。 |
| MI-12 | 移動、回転、拡大縮小ツールを切り替える、またはギズモを操作する | 選択ツールを押下状態と名称で示す。ギズモは待機中のRGB色と不透明度を抑え、hoverまたはdrag中の軸だけを明るくしてSceneより目立たせない。操作中は Scene View と Inspector の数値を同期し、カメラ操作との競合を止める。pointer down から pointer up までを一つの Command Transaction とする。 | pointer up で一件の履歴として確定する。Escape または不正値では操作前へ戻し、履歴を追加しない。Entity の選択は保つ。 |
| MI-13 | ビジュアル project を開く、保存する、または authoring document を変更する | ヘッダーには成果物種別、「ビジュアル」、保存状態だけを静かに表示する。stale compile は常時警告にせず、公開 review で自動保存・変換される事実と現在の診断を示す。 | commit marker が指す Scene / Prefab / Asset / folder を含む全 document set の保存成功後だけ対象 revision の「未保存」を解除する。未保存で戻る時は保存、破棄、取消を選べる。 |
| MI-14 | Edit で「Play」を実行する、Play中に選択Entityの実行入力を変更する、または「Stop」を実行する | project kind に応じた実行コピーを中央の`Play Window`へ開き、太い境界、専用header、「分離された実行コピー」の文言でScene Viewと区別する。Stopは同じ位置に常時置く。HierarchyとInspectorは編集データを表示し、Play中も選択EntityのTransform、Collider、Animationだけ調整可能にする。Worldのinput / controller / gravity / collider physicsをItemへ適用しない。 | PlaySessionは開始時snapshotとEntity別runtime revisionを持つ。許可した変更は通常のauthoring Commandとして保存し、変更Entityだけを新revisionで先頭から再実行する。無関係なEntity、player、camera、physics stateは維持する。構造変更、Asset変更、ギズモ、dropは停止まで無効にする。Stopで全runtime resourceをdisposeし、最新の編集データ、両selection、Inspector context、Edit cameraへ戻る。初期化失敗時はEditのまま原因と再試行を示す。 |
| MI-15 | Assets で Asset を一回クリックする、または Entity Inspector の Asset reference を開く | Assets の選択背景と右 Inspector の Asset context を同じ `assetSelection` へ更新する。`sceneSelection` は維持し、Inspector header の Entity / Asset tab から双方へ戻れる。Entity は追加せず、Undo 履歴も増やさない。 | 別 Asset / Entity の選択または Inspector context 切替で終わる。Material は参照 Entity 数と「共有中」、Texture / Model は source と derived status を表示する。 |
| MI-16 | 右 Inspector で Material / Texture Asset を変更する | Material は glTF core PBR、TextureInfo、emissive、normal、occlusion、alpha / double-sided、typed extension、Texture は source、色空間、resize、mipmap / sampler、compression、derived / diagnostics を section 分けする。同じ Material ID を参照する全 Entity と選択中のライブpreviewへ同期し、変更後はgenerated thumbnailをstaleにして一時rendererの更新queueへ送る。shadow は Entity の Mesh section に残す。 | 有効値の確定を `UpdateAssetCommand` 一件にし、AssetManifest を未保存にする。SceneDocument や Entity 固有値へ複製しない。不正値は確定せず field 近くに形式、範囲、色空間、slot の意味を示す。Play 中は読み取り専用にする。 |
| MI-17 | visual project で compile、check、upload を開始し、必要な toolchain がない | authoring 画面を閉じず、Node.js、XRift CLI、認証のうち不足している項目とセットアップ操作を表示する。通常の Edit / 保存は利用可能なままにする。 | セットアップ後は同じ操作へ戻れる。取消時は Edit へ戻り、SceneDocument、AssetManifest、staging output、公開先を変更しない。 |
| MI-18 | 新規作成を開く | item classic、world classic、item visual、world visual の四カードを同じ階層で表示し、成果物、制作方法、正本、作成後の画面を一文で示す。hover だけに説明を隠さない。 | 一カードの選択で名前 / 保存先確認へ進む。戻ると四カードへ戻り、前の選択を保持する。取消では project を作らない。 |
| MI-19 | Assets の「作成 > Material」を選ぶ | 名前、標準サーフェスまたは glTF 既定値 preset、作成先 folder を compact dialog で示す。作成中も右 Entity Inspector を保つ。 | 成功時は Material Asset を一件追加して `assetSelection` にし、Entity へ binding しない。取消 / validation 失敗では AssetManifest、両 selection、history を変えない。 |
| MI-20 | GLB / GLTF / Texture / HDRI / MP3 を drop または import する | Editor下部のAsset status barへ現在のstageと進捗を表示し、詳細を開くとActivity drawerでvalidate、copy、parse / decode、derive、dynamic thumbnail、commit、件数、bytes、診断を確認できる。完了項目を閉じなくても制作を継続でき、source保持、resize / mipmap / compression recipe、stale状態は右Inspectorで確認できる。Model再importなど別のAsset transaction中は入口を理由付きで無効化し、同じsourceへのcommitを並行実行しない。HDR / EXRはシグネチャ検証後にequirectangular環境Texture Assetとして保存し、同じ履歴で現在SceneのSkyboxへ設定する。保存後はHDR / EXRソースからtone map済みの一覧用thumbnailを自動生成し、未生成・旧renderer版・Flip Y変更を検出して再生成する。MP3はシグネチャ検証後にAudio Assetとしてproject管理下へ原本を保存し、編集画面では自動再生しない。 | 全検証後だけAssetManifestへcommitする。成功時はstatus barとdrawerにMaterial / Textureの展開件数、またはSkyboxへの設定結果と「アセットを表示」を残し、新Assetを`assetSelection`にできる。HDRIのTexture InspectorではFlip Yを含むImport設定を編集でき、thumbnail生成失敗を永久な準備中表示にせず再試行可能な通知として示す。HDRI以外のAssetsへのimportは明示的なScene dropなしにSceneを変えない。失敗時はdrawerを開いて原因を示し、取消時はtemporaryを回収してlast-goodと両selectionを維持する。 |
| MI-21 | thumbnail を生成、再生成、または stale 判定する | card は pending / generating / ready / stale / failed を label と status icon で示す。Model / Texture / Material は ready な generated thumbnail を優先し、それ以外だけ kind icon を fallback にする。Material cardはWebGL contextを保持せず、内容hashが変わった時だけ一つの一時rendererで順番に画像化する。 | 成功時は同じ Asset ID の thumbnail hash を更新し、生成画像をprojectへ保存して一時rendererを解放する。失敗時も card と Asset を残し、再生成と診断を置く。last-good が stale なら「古いプレビュー」と明示する。 |
| MI-22 | toolbar、menu、context menu、keyboard から Command を起動する | central Shortcut Registry の label、semantic Lucide icon、platform binding、enabled reason を全 surface で一致させる。active tool は icon、label、押下状態で示す。conflict は両 command を実行せず設定へ案内する。 | Command 成功 / 失敗へ収束する。text input、contenteditable、数値入力、IME composition 中は editor shortcut を抑止し、ユーザー override と既定へ戻す操作を Editor Preferences に保存する。 |
| MI-23 | Copy / Paste / Duplicate / Delete を実行する | Copy は versioned buffer の対象数、Paste / Duplicate は生成予定数、Asset Delete は参照元件数を示す。document 変更を伴う操作だけを Command history に積む。 | Paste / Duplicate / Delete の Undo / Redo は同じ IDs と前後の `sceneSelection` / `assetSelection` を復元する。Copy 自体は document Undo にしない。参照を壊す Delete は置換、解除、取消なしに進めない。 |
| MI-24 | Hierarchy の Entity subtree を Assets / folder へ drop して Prefab にする | drop target、Prefab 名、Entity / Asset dependency 件数、既存 Prefab / cycle conflict を表示する。成功前は Scene、Asset、folder のどれも変更しない。 | 成功時は Prefab Asset / document と instance metadata を一 transaction で作り、`sceneSelection` は instance root、`assetSelection` は Prefab にする。Undo / 失敗 / 取消では全 document と両 selection を元へ戻す。 |
| MI-25 | authoring操作を一件確定する、Undo / Redoする、またはCtrl/Cmd+Sで即時保存を要求する | 確定したrevisionを短い待機時間後に自動保存し、headerを「自動保存待ち」「自動保存中」「自動保存済み」「自動保存エラー」で更新する。連続変更は最新revisionへまとめ、保存処理は必ず直列化する。Ctrl/Cmd+Sは主導線ではなく待機中の保存を即時flushする。 | commit markerと全hash一致後だけ対象revisionを保存済みにする。保存中の追加編集は次の自動保存へ引き継ぎ、古い保存完了で新しいrevisionを保存済みにしない。失敗時はlast committed setを維持し、編集を止めず同じheaderから再試行できる。戻る操作は最新revisionの保存完了を待ち、失敗時はEditorに留まる。 |
| MI-26 | Play、generated preview、compile または check を実行する | Editor direct Play、generated staging preview、check/build を別 label にし、input fingerprint、target、stale、progress を示す。diagnostic は provenance から元 Entity / Asset / field へ link する。 | fresh hash の結果だけ成功にする。Stop / cancel は process と resource を cleanup して Edit へ戻る。公式に未記載の CLI / hosted / XFT preview を存在するように表示しない。 |
| MI-27 | Upload modal を開き、review から remote result まで進める | review、auth-check、saving、compiling、required thumbnail copy / SHA-256 verify、checking、uploading、processing、succeeded、failed を一つの modal 内で段階表示し、title、description、thumbnail、diagnostic、progress、cancel / retry を現在 state に合わせる。 | `public/thumbnail.png` のcopyまたはSHA一致確認に失敗した場合はremote uploadを開始しない。検証成功後は「公開用ステージングへコピー済み」を残す。閉じると Edit に戻り、結果 ID は保持する。remote commit 後を取消済みと断定しない。成功時は正式 result の ID / version / hash、正式に返る時だけ URL を示す。test / 通常検証では実 upload をしない。 |
| MI-28 | Asset folder または Asset の context menu を開く | folder では作成 / import / 新規 folder / Assets をエクスプローラーで開く、Asset では rename / duplicate / delete / references / reimport / thumbnail regeneration / source をエクスプローラーで表示を kind と state に応じて表示する。project source を持たない document / builtin Asset と論理 folder は物理 Assets root を開く。shortcut と icon は Registry と一致させる。 | 一つの操作選択または Escape / 外側 click で閉じる。実行不可項目は理由を tooltip で示し、menu を開いただけでは document や selection を変えない。Explorer 起動失敗では Editor と selection を維持して Assets status に確認先を示す。 |
| MI-29 | panel splitter を動かす、panel header を dock zone へ drag する、または layout を reset する | drag 中は resize cursor、minimum size、dock preview、最終 order を表示する。Scene / Asset data と authoring history は変更しない。 | drop で normalized size / zone / order を Editor Preferences に保存する。Escape / 領域外 drop は開始前 layout、reset は既定 layout へ戻る。保存失敗時も session layout を保ち、再試行を示す。 |
| MI-30 | Edit 中に Hierarchy の Entity subtree を別 Entity または Scene Root へ drag する | 行の上端は「前へ」、中央は「子へ」、下端は「後へ」として挿入線または親候補の面を表示する。Root 領域はScene Root末尾への移動を示す。自分自身、子孫、実際に順序が変わらない位置はエラー色の境界と理由で実行不可を示す。 | 有効な drop は Entity ID と subtree を維持したHierarchy Move Command一件として確定し、同じ親内の順序変更と親子化のどちらでも選択を維持する。Escape、領域外 drop、実行不可 target、Play 中は SceneDocument と history を変更しない。Undo / Redo は親子 link と兄弟順を復元する。 |
| MI-31 | Assets の XRift Prefabs から built-in recipe を Scene View へ drag する、または「配置」を実行する | Spawn Point、Mirror、Portalなどを通常のproject Assetと分けた保護付きcatalogとして表示し、project kindで利用可能項目を絞る。各cardは同じ公式Component catalogで撮影済みの保存WebPを表示し、欠落時だけ種類iconと利用不可表示へ戻す。Scene Viewはrecipe名と配置位置を表示する。 | drop後は通常のEntityを一件作り選択する。Entity Transform、recipe identity、Component削除は保護し、URLや公開先IDなどrecipeが明示した設定fieldだけInspectorで編集できる。通常Assetのrename / delete / folder move対象にはしない。Entity自体のDeleteとUndo / Redoは利用できる。必須field未設定時はcompileをblockし、そのfieldを同じInspectorで修正できる。 |
| MI-32 | Visual Editor の render または動的 module 読み込みで例外が発生する | App 全体を白画面にせず、明るい既存配色の復帰面へ切り替え、落ちた機能名と制作データを保持している事実を示す。例外本文、stack、component stack、token、絶対 path は画面へ表示しない。動的 module 失敗は通常の render 例外と区別し、Editor用ファイルを再取得する必要があることだけを示す。 | 通常の「Editorを再試行」は Boundary と Editor subtree を remount する。動的 module 失敗では拒否済みの `React.lazy` を再利用せず、ユーザー操作による「アプリを再読み込み」で一度だけ再取得する。自動 reload loop は行わない。「プロジェクトライブラリへ戻る」または前画面へ戻る操作は既存 `onBack` を実行し、Editor 外の App 状態を維持する。 |
| MI-33 | Particle Asset を作成・編集する、Scene / Hierarchy へ配置する、または Entity に Particle Emitter を追加する | Assets、右 Inspector、Scene View、Hierarchy のすべてで同じ Particle Asset ID を扱う。Particle の変更は Scene View の表現へ即時反映し、Asset を drop した時は Transform と Particle Emitter を持つ Entity を作る。Particle Asset がない状態で Particle Emitter を追加した時は既定 Asset を同じ操作内で作成する。 | 作成・配置・Component 追加・参照変更・削除はそれぞれ一つの履歴へ確定する。取消または失敗時は AssetManifest、SceneDocument、両 selection を開始前へ戻す。Play 中は編集操作を無効にする。 |
| MI-34 | toolbar の Create、または Hierarchy の右クリックから Entity / Component を作成する | Create は Empty Entity、Primitive、XRift Component、通常 Component の責務別入口を示す。選択 Entity がある時は追加先を名前で示し、選択がない時も単独で成立する XRift Component は Transform 付き Entity として作成できる。wrapper は追加先 Entity がない限り無効にし、理由を表示する。 | 作成または追加は一件の history transaction とし、作成 Entity を `sceneSelection` にして Inspector を開く。Escape / 外側 click は document を変えず閉じる。Play / Import 中は無効にし、必須値が未設定なら Inspector から設定して compile blocker を解消できる。 |
| MI-35 | Visual World の新規作成で Starter Scene を選ぶ | 既定は実用的な World Starter とし、配置済み Scene と Assets へ追加される Model / Texture の数をカード上に示す。Blank は明示的な最小構成として残し、素材入り template と混同しない。 | 作成成功時は bundled source を project-relative path へ検証付きでコピーし、Scene / Asset / Material / Collider / XRift Spawn の参照を一度に確定して Editor で開く。copy / hash / document 保存の一部が失敗した場合は不完全な project を成功表示せず、新規作成へ戻れる。 |
| MI-36 | Model Assetを選択して構造を確認し、import設定を変更または再importする | 右Inspectorにsource/status、node・mesh・primitive、bounds、animation、Material slotと現在のimport recipeを分けて表示する。recipe変更は未適用であることを示し、source解析済みの事実と混同しない。再importでslotが消える時は確定前にScene / Prefabの影響先を列挙する。 | 再import成功時は同じAsset IDを維持し、同じslot identityへのMaterial割当を保持して追加・消失slotを明示する。影響を確認せず参照切れを成功表示しない。失敗時はlast-good metadata、thumbnail、Scene参照を維持し、原因と再試行を同じModel Inspectorに残す。Play中は閲覧のみとする。 |
| MI-37 | 左下の歯車「シーン設定」を開き、公開情報、スカイボックス、フォグ、環境光、カメラ、ギズモを変更する | 現在のScene ViewとEntity / Asset selectionを保ったまま、右のEntity InspectorをScene Inspectorへ切り替える。ワールド名またはアイテム名と説明は現在の公開情報を表示し、入力欄から移動した時に確定する。Skybox画像の背景表示とIBLライティングは独立したトグルにし、両方、片方、どちらも使用しない状態を即時同期する。数値は確定時に範囲へ補正する。Scene Viewへ不透明な補助床は追加せず、Skyboxまたは編集背景の上に軽いグリッドだけを表示する。Play中は値を読み取り専用にし、停止後に同じ設定画面へ戻れる。 | 設定変更はProjectまたはSceneDocumentを未保存にして自動保存へ合流し、公開情報はヘッダー、公開前確認、生成する`xrift.json`へ反映する。戻る、Entity / Assetの選択は変更済みの値を保持して通常Inspectorへ戻る。サムネイルは保存済みprojectでだけ既存の画像編集画面を開き、保存後に公開前確認へ戻れる。 |
| MI-38 | 左下のユーティリティレールからショートカット一覧、ヘルプ、シーン設定を開く | 上からキーボード、ヘルプ、歯車を小さな同一サイズで常時表示する。hover / focusでは操作名を示し、開いている項目は背景、アイコン、`aria-expanded`または押下状態で区別する。ショートカットは中央Registryの現在のbindingを分類して表示し、ヘルプは作成、選択、素材配置、Playの最短導線とレイアウト初期化を示す。 | Escape、外側click、同じボタンで補助パネルを閉じ、Scene / Asset selectionとdocumentを変えない。歯車はScene Inspectorを切り替え、レイアウト初期化は既定配置へ戻して同じEditorを継続する。 |
| MI-39 | Scene View、Hierarchy、Create、Inspector、AssetsでXRift Componentを表示する | 公式Component名と中央Registryのsemantic iconを全authoring surfaceで共有する。EditとPlayは`@xrift/world-components`本体を同じrendererで描画し、必要なContextだけをStudio Provider bridgeから注入する。Componentの外観をSVG、CSS図形、DOM疑似表示、Studio独自の旧実装へ置き換えない。 | 選択変更やInspector編集で同じComponent IDの公式描画だけを更新し、document、selection、外部runtime stateを増やさない。Portalのinstance取得と遷移はStudio内の副作用なしimplementationへ接続する。wrapper Componentは同じEntityの実childrenを包む。 |
| MI-40 | Edit 中にHierarchy行の目アイコンでEntityのEnabledを切り替える、または親EntityのTransformを変更する | Entity自身のEnabledと、親の無効化による実効状態を行のアイコンと濃淡で区別する。親を無効にするとsubtreeをScene Viewから隠し、親のPosition / Rotation / Scaleは子のlocal Transformへ階層的に反映する。 | EnabledとTransformの変更はそれぞれ一件のhistoryへ確定する。親を再び有効にすると子自身のEnabledを保ったまま復帰し、Undo / Redo、Play、生成Worldでも同じ親子関係と実効状態を再現する。 |
| MI-41 | GLB / glTFをimportまたは再importする | Model名の論理folderとMaterials / Texturesを自動生成し、埋め込みPBR Materialと画像を独立Assetとして一覧へ追加する。選択Sceneのnode名、親子関係、local Transform、Mesh参照も保持する。同じfolder・source file名は既存Modelの更新、同一SHAの実ファイルは検証後の再利用として表示する。 | 成功時はModelを選択して専用folderを開き、Material slotから展開済みMaterialを開ける。ModelをSceneへ配置すると共有Model Assetを参照するEntity treeとしてHierarchyへ展開する。再importはModel / slot / 派生Asset IDとScene参照を維持し、ユーザー編集済みMaterialを上書きしない。失敗時はlast-good Manifestと実ファイルを保持し、同じ履歴の前回結果と今回結果を重複表示しない。 |
| MI-42 | Entity Inspector の Transform 軸ラベルを左右へドラッグする、または Scale の比率固定を切り替える | 軸ラベルは `ew-resize` cursor と開始値から現在値への小さな表示でスクラブ可能と伝える。Shift は微調整、Ctrl / Alt は大きな調整にし、Scene View、Inspector、ギズモを同じ local Transform へ即時同期する。Scale の比率固定中は操作軸の倍率を他軸へ適用し、不均等比率を保つ。 | pointer up で一件の Transform history として確定する。Escape / pointer cancel は開始前の値と保存状態へ戻し、履歴を追加しない。ラベルのダブルクリックは数値入力へfocusし、入力中のEditor shortcutを抑止する。 |
| MI-43 | Edit 中に Entity を選択して F を押す | 選択 Entity の描画 bounds と子 Entity を含む中心・距離へカメラと Orbit 中心を移し、Scene View端に対象名と解除操作を表示する。boundsが空の場合だけEntityのworld位置を使う。別Entityの選択だけではカメラを移動せず、Fで対象を切り替える。 | 同じEntityで再度F、Escape、または表示中の「解除」で、開始前に保存したカメラ位置、向き、Orbit中心、ズームへ戻る。Play開始時も解除してEdit cameraを保存する。Play中、text / 数値入力、IME composition中、Entity未選択時は開始しない。 |
| MI-44 | Create、Hierarchy右クリック、またはInspectorのAdd Componentを開く | Core、Rendering、Physics、Media、XRiftを件数付きの折りたたみsectionで表示し、同じ中央Registryから候補を取得する。現在のEntityへ追加できない項目は理由と「追加済み」を示す。 | 項目を選ぶとComponentを一件追加して同じEntityを選択したままInspectorへ到達する。Audio Sourceは音を自動再生せず、source URL、音量、loop、spatial設定をInspectorで確定できる。Escape、外側click、section開閉だけではdocumentを変更しない。 |
| MI-45 | プロジェクトライブラリを開く、検索・並び替え・公開状態の絞り込みを行う、またはプロジェクトを削除する | 新規作成を先頭に保ち、表紙を小さくした高密度カードへ更新日時と公開済み / 未公開を表示する。検索、更新日時、公開日時、名前順と公開状態filterはproject documentを変更せず即時反映する。削除は対象名と絶対保存先、元に戻せないことを確認dialogに表示し、処理中は重複操作を無効にする。 | 並び替え・絞り込みの解除で同じ一覧へ戻る。削除成功後は一覧を再取得して対象を除き、新規作成と他projectを開く導線を保つ。失敗時は対象を残して原因を通知する。native側はprojects root直下の認識済みXRift project以外を拒否する。 |
| MI-46 | OBJ / VRMをimportする、または配置済みModelのボーン回転・シェイプキーを編集する | Import QueueはGLB / glTFと同じvalidate、copy、parse、thumbnail、commitを使い、Model Inspectorに形式、bone、shape key件数を残す。Entity Inspectorの「モデルポーズ」は選択したboneのXYZ回転とshape keyのweightをScene Viewへ即時反映し、編集対象がAsset共通値ではなく現在のEntityであることを示す。 | 有効値だけをMesh componentの静的poseへ一件のhistoryとして保存する。同じModelの別Entityには波及しない。リセットはposeだけを初期状態へ戻し、Transform、Material、Assetを維持する。失敗時はlast-good Asset / Entity poseを保ち、対応形式または修正対象を同じImport Queue / Inspectorに示す。 |
| MI-47 | `.unitypackage`、Unity Scene、Unity PrefabをAssetsへdropまたはImportする | Import Queueでgzip / tar展開、pathname復元、Unity YAML解析、Asset変換、Hierarchy再構築、Prefab作成、commitの順に進捗を示す。対応Model / Texture / MaterialとGameObject、Transform、Light、Audio Source、Collider、Scene環境設定を変換し、未対応class IDと件数を診断へ残す。C# / MonoBehaviourはJavaScriptへ変換しない。 | 全Asset sourceのatomic commit後だけScene、AssetManifest、Prefab documentを一件のhistoryへ反映する。成功時はPrefab / Entity / Asset件数と要確認件数、「アセットを表示」を残し、生成Prefabを`assetSelection`、再構築したrootを`sceneSelection`にする。失敗時はlast-good document setを維持して同じActivity drawerから原因を確認できる。 |
| MI-48 | Editor のAI連携を開き、対応clientへXRift Studio MCPを登録する、Ollamaのローカルモデルで対応clientを構成する、または接続済みAIからScene編集を受ける | 未登録、登録中、登録済み、接続待ち、接続中、失敗を同じpanelに表示する。登録は検出済みclientとscope、実行する固定commandを示してから一度だけ実行し、処理中は重複操作を無効にする。OllamaはMCP clientではなくmodel providerとして分離し、ローカルmodelと構成先clientを明示選択してから、XRift MCP登録とprovider構成を一つの主操作で順に実行する。AI編集はclient名、tool名、対象Scene、変更概要、保存状態をActivityとして残し、Scene View、Hierarchy、Inspectorを同じCommand結果へ同期する。 | 登録成功後はclientの再読み込み方法と接続待ちを残し、Ollama構成後はmodel名、構成先client、起動方法を残す。接続後は対象project、Scene、revision、直近の変更、Undoへ到達できる。Play、Import、revision競合、未認可project、保存失敗ではdocumentを変更せず理由と再試行先を示す。panelを閉じても接続と直近Activityを維持し、AI変更のUndoは通常のEditor historyへ合流する。 |
| MI-49 | OpenBrush / Tilt Brush glTFをimportする、OpenBrush Starterを作成する、または対象Model / Materialを表示・変換する | `GOOGLE_tilt_brush_material`、exporter、brush名から形式を判定し、Model InspectorへOpenBrush badge、brush数、three-icosa rendererを表示する。Material InspectorはCustom Material Preview Adapterで元Modelの該当nodeを分離し、埋め込みbrush libraryから実ストローク形状、実GLSL、uniform、brush textureをリアルタイム描画する。 | 各source brushをbrush名、GUID、renderer version、source material indexを持つOpenBrush Material Assetへ展開して対応slotへ初期設定する。対応presetは専用shader、未対応presetまたはshader resource失敗時はGLB内のglTF PBR Materialを保持し、previewとInspectorへfallback理由を示す。明示的に割り当てた通常のXRift Materialだけがslot単位で上書きする。import時の古い外部画像URLは取得せず、安全な解析用画像へ置換する。 |
| MI-50 | Visual Editorの「Classicへ書き出す」を開き、既存XRift Classic projectを選択する | OSのfolder picker後に`package.json`、`xrift.json`、World／Item entry、package managerを検査し、コンポーネント追加またはバックアップ付きentry切替、Runtime package installの結果を一つのdialogでreviewする。処理中は保存、compile、file追加、installのstageとprogressを表示し、閉じる操作と二重実行を止める。 | 成功時はRuntime JSON、Asset、接続componentをVisual Project IDごとの管理領域へ置き、folder、VS Code、terminal、接続snippetへ到達できる。既存entryは既定で変更せず、entry切替は確認後にbackupを残す。失敗時はVisual projectと既存手書きentryを維持し、folder再選択、再実行、package managerでのinstallへ戻れる。 |
| MI-51 | アプリ起動後またはAboutの「更新を確認」でXRift Studio本体の更新を検知する | 確認中は制作を妨げず、更新がある時だけ現在版、最新版、リリースノートをdialogに表示する。「後で」を選ぶとライブラリheaderとAboutに更新導線を残す。download中はbytesと割合、install中は再起動準備を示し、閉じる操作と二重実行を止める。 | 署名検証済み更新のinstall後にアプリを再起動し、新しい現在版と完了通知を表示する。確認またはinstall失敗時は現在のアプリを維持し、Aboutまたは同じdialogから再試行できる。 |
| MI-52 | Assetsの「外部から追加」を開く、provider sidebarでリソース集を選ぶ、HDR / EXRをimportする、外部Assetをinstallする、公式XRift Componentを追加する、または環境Texture AssetをScene Viewへdragする | 左sidebarにPoly Haven、Open Brush、XRift公式Componentを同じ階層で表示し、中央に選択中providerの検索、種別またはカテゴリ、一覧、右に作者、license、配布ページとprovider固有optionを表示する。Open Brushは固定catalogの代表stroke nodeをthree-icosaで事前描画した保存済みthumbnailを全48件に表示し、汎用sphereの疑似previewへ置換しない。XRift公式Componentは公開package本体と公式sampleを事前描画したversion付き保存済みthumbnailを表示する。一覧と詳細を開くだけではWebGL contextを作らない。provider切替ではSceneとAssetを変更せずcatalogだけを切り替える。ローカルHDR / EXRはシグネチャ検証後にTextureとしてqueueへ表示する。downloadまたは追加処理中はprovider切替と主操作を無効にし、providerが返した固定domainまたは固定catalog revisionだけを扱う。環境Texture drag中はScene全体へ設定されることを表示する。 | 成功時はMaterialと参照Texture、形式とequirectangular用途を保持したTexture Asset、GUIDとrenderer versionを保持したOpenBrush Material Asset、または公式XRift Componentを持つEntityを選択する。環境TextureはFlip Yなどを編集でき、任意ならSkyboxへ直ちに設定する。Open BrushはSceneへ自動割当せず、同じGUIDとrenderer versionの再追加では既存Materialを選択する。公式Componentは一件のScene historyとして追加しInspectorを開く。保存済みthumbnailが欠落した場合は項目名と種類iconを表示し、「準備中」のままにしない。catalog取得失敗では同じproviderから再試行でき、install失敗時はmanifestとSceneを変更せず同じAssetとoptionから再試行できる。provider creditとlicenseはAssetに保持し、一覧とInspectorから確認できる。 |
| MI-53 | Hierarchy、Scene View、または Assets で Shift / Ctrl・Cmd を使って複数選択する | 選択行・カード・Scene上のoutlineを同じ選択状態として示し、Inspector見出しに件数を表示する。Hierarchy / AssetsのShiftは表示順の範囲、Scene ViewのShiftと全surfaceのCtrl・Cmdは追加／解除とする。Scene Viewでは最後に選んだEntityだけをprimaryとしてgizmoを表示し、camera dragを選択clickとして確定しない。Entityは共通するMesh Renderer / Light、Materialは共通PBR値だけを表示する。 | 選択だけではdocumentとhistoryを変更しない。一括変更は一件のhistoryとして確定し、Undoで全対象を戻す。HierarchyのDeleteと右クリックの削除は選択済みEntity全体を一回で削除し、選択解除または単体選択で通常Inspectorへ戻る。Play中は選択を維持して編集操作を無効にする。 |
| MI-54 | Animation clipを含み`importAnimations`が有効なGLB / glTF ModelをSceneへ配置し、Playを開始する | 配置EntityへAnimation Componentを自動追加し、Inspectorに先頭clip名、長さ、track数、Autoplay、Loopを表示する。Edit中は静止し、Play開始時だけ有効なAutoplayで先頭clipを再生する。 | Loop有効時はPlay中と生成結果で繰り返す。Loop無効時は一度で停止する。Play中にEnabled、Autoplay、Loopまたは同じEntityのTransform / Colliderを変更した時は、そのEntityのmixerとphysics bodyだけを破棄して先頭から再実行する。Stop、Component無効化、Entity破棄ではmixerを停止してEdit時の姿勢へ戻す。clip欠落時はScene View全体を止めず同じInspectorに理由を示す。 |
| MI-55 | 外部リソースの「XRift公式 Component」で公式Componentを選ぶ | 公開中の`@xrift/world-components`検証version、公式source、利用可能な全Componentをgridへ表示する。thumbnailはpackage本体と公式sample childを固定generatorで事前描画し、Component名と公式badgeを焼き込んだ保存済みWebPを使う。versionが変わる時は保存先revisionを更新して全件を再生成し、SVG／CSSだけの識別用イラストへ置換しない。選択中Componentにはdescription、category、named import、versionを表示し、`DevEnvironment`はScene用でない理由を示す。 | 追加成功時は公式XRift Componentを一件のhistory transactionへ確定し、追加Entityを選択してScene ViewとInspectorへ到達する。Play、別Import中、project kind不一致、変換診断errorではSceneを変更せず理由を同じ詳細欄に残す。 |
| MI-56 | GLB / VRM ModelをSceneへ配置し、展開されたNode、Bone、MeshをHierarchyで選択する | sourceの親子順を保つEntity treeをModel Entityの下へ表示し、行末をNode / Bone / Mesh / Skinで区別する。SkinまたはAnimationを含むModelは一つの共有Rendererを維持し、選択NodeのInspectorへsource node番号、共有Model、編集対象を表示する。Bone / Node TransformはScene Viewと共有Model poseへ即時同期し、Mesh / Skin行にはそのnodeが使うMaterial slotだけを表示する。 | Transformとnode別Material変更を一件のhistoryへ保存し、Undo / Redo、再表示、Classic JSX、Runtime manifestで同じ結果を復元する。同じsource materialを使う別nodeへnode別上書きを漏らさない。parse失敗時は単一Entityへ偽装せずImport Queueへ戻し、last-good Asset / Sceneを維持する。 |
| MI-57 | Hierarchyの親Entityを折り畳む、展開する、検索で絞り込む、矢印キーで移動する、またはEntityのEnabledを変更する | 子を持つ行だけに展開状態と件数が分かる矢印を表示し、折り畳み中は子孫行だけを隠す。上下キーは表示中の前後、右キーは展開または最初の子、左キーは折り畳みまたは親、Home / Endは先頭 / 末尾へ選択を移し、選択行を表示範囲へ追従させる。Shift+上下は表示順の範囲選択とし、文字入力・IME変換中はHierarchy操作を抑止する。検索は名前、Entity種類、Component種類、Enabledの語を空白区切りで絞り込み、一致したEntityと祖先だけを自動展開する。折り畳み、検索、キー選択はSceneDocumentとUndo履歴を変更しない。単一Entity Inspectorの先頭はUnityと同じ順序でEnabledチェックと名前を一行に置き、Prefab sourceはアイコン、名前、更新アイコンだけを続ける。説明は常設せずtooltipと読み上げ名に移す。親が無効な子は継承された非表示状態をHierarchyの濃淡とInspectorの状態アイコンで示す。 | 検索を消すと検索前の折り畳み状態と同じ順序へ戻る。Scene Viewなどから折り畳まれた子孫を選択した時は祖先を自動展開して選択行とInspectorへ到達させる。Play中も選択移動と開閉は利用できるがScene構造とhistoryは変更しない。Enabled変更は一件のauthoring historyとしてScene View、Play、生成結果へ反映し、子Entity自身のEnabled値は保持する。一致なしでは検索語とクリア操作を表示する。 |
| MI-58 | Entity InspectorでMesh Rendererを有効・無効にする、Material slotを確認する、またはMaterialを選択する | Mesh RendererのEnabledはComponent見出しの先頭へ置く。Material slotは入れ子のカード枠を使わず区切り線で並べ、Base Color、透明度、Texture有無を示すスウォッチ、選択欄、詳細を開くアイコンを一行にする。Material名だけに識別を依存せず、説明はtooltipと読み上げ名へ移す。 | EnabledとMaterial割当はそれぞれ一件のhistoryとしてScene View、Play、生成結果へ反映する。Materialを開いてもEntity選択を保持し、戻ると同じslotへ復帰できる。参照切れはスウォッチを未設定表示にし、既存bindingを暗黙に別Materialへ置換しない。 |
| MI-59 | Scene InspectorでSkyboxの投影方式を変更する | 無限遠、ボックス、地面付きドームを用途の説明とともに同じ選択欄へ表示する。ボックスとドームでは有限Skyメッシュの位置、回転、スケール、投影中心だけを続けて表示し、数値確定時にScene Viewへ同期する。ボックス底面とドームの平坦部は位置Yを床面の基準とし、環境Textureは有限メッシュ表示でもIBLへ利用する。 | 変更は一件のSceneDocument履歴として保存対象にし、Undo / Redo、再表示、Play、生成Worldで同じ投影を復元する。Play中は読み取り専用にし、旧Sceneでは無限遠と既定メッシュ値を補完する。不正値は確定せず現在の投影と選択を保つ。 |
| MI-60 | Material InspectorでTextureを設定する、AnimationからMaterial graphを開く、またはInteractivityのpointer nodeを選ぶ | 各Texture slotでUV Setと「タイリング / UV変換」を隠さず表示し、Offset、X/Yタイリング、Rotationを`KHR_texture_transform`として編集する。1以外のタイリングでSamplerがRepeatでない時はTexture設定への修正案を同じslotへ出す。Animation InspectorはMaterial Animation用graphを列挙し、pointer/interpolateへ移動できる。Interactivity Node InspectorはMaterial Assetと色、PBR factor、Texture offset / scale / rotationのpresetを選ぶとcanonical pointer、型、Material indexを同時設定する。 | Material変更はAsset history、graph変更はInteractivity Asset historyとして確定し、Scene selectionを失わない。MCPもMaterial読取・更新・Texture transform・Material pointer設定を同じvalidationとrevision境界で実行する。Play、Import、stale revision、不正slotではlast-goodを維持する。 |
| MI-61 | 外部Asset StoreまたはMCPからPoly Haven Modelを選び、解像度を確認してinstallする | Model cardにも解像度、総bytes、依存file数を表示し、glTF本体、buffer、Textureを取得後に検証して自己完結glTFへまとめることを明示する。処理中はprovider切替、dialog close、二重installを止め、MCPは同じ外部IDとresolutionで進捗待ちになる。 | glTF 2.x、許可domain、安全な相対URI、全依存file、容量、保存先collisionを通過した時だけModel Assetを追加して選択する。失敗時はAssetManifestとSceneを変更せず同じModel / resolutionから再試行できる。MCP成功結果は作成Asset IDと前後revisionを返す。 |
| MI-62 | Edit中のScene Viewで目的別の表示モードを切り替える | toolbarの一つの「表示」選択に「シーン」「ライトなし」「ワイヤー」「コライダー」を置く。「シーン」だけが保存済みSkybox、Fog、Light、Materialを通常描画し、他のモードは明るいneutral背景で確認対象を強調する。「コライダー」はBoxとMesh Colliderを表示し、Meshを持たない補助Componentを隠す。個別のSkybox / Fog / Lightスイッチをtoolbarへ並べない。 | 切替はScene Viewだけに即時反映し、SceneDocument、Editor history、自動保存、compile、Play結果を変更しない。Play開始時は通常の実行表示にし、Stop後は直前のEdit表示モードへ戻る。未対応Materialは架空の本来表示を作らずneutral fallbackで形状を維持する。 |
| MI-63 | HierarchyでEntityの種類を絞り込む | 検索欄の直下にMesh、Light、Collider、Audio、Particle、Animation、Spawn、XRift Componentのsemantic iconを一列で置き、hover / focusで日本語名を示す。複数選択は種類同士をOR、文字検索とはANDで適用し、一致Entityとその祖先だけを自動展開する。 | 絞り込みはselection、SceneDocument、historyを変更しない。押下中のiconは背景と`aria-pressed`で示し、再押下で解除する。すべて解除すると絞り込み前の折り畳み状態へ戻り、0件時は条件を一度にクリアできる。 |
| MI-64 | Visual Editor右上の「Import」を開き、Model / 3D Asset、R3F TSX、またはXRift Classic projectを選ぶ | 右上は外部catalogではなく変換とfile取込の入口に限定する。Model / 3D Assetは既存Import Queueへ接続し、対応拡張子を同じfile pickerで選べる。R3F / ClassicはTSX貼付とfolder選択を同じ変換dialogへ集約し、Classicはfolder選択後に`package.json`、`xrift.json`、同種entryを検査してentry source、対象path、読み込んだ`src` module数を表示する。TSXは実行せず、import graph、JSX構造、静的literalだけを解析する。 | fileは既存のvalidate、copy、parse、thumbnail、commitを通り、変換は全Entity / Material / Light / Collider / XRift Componentを一件のhistory transactionへ確定する。最後の追加EntityまたはAssetを選択し、`group`、RigidBody、公式wrapper、local Componentの親子境界をHierarchyへ残す。Playまたは別Import中は理由付きで入口を無効にする。 |
| MI-65 | project thumbnailを画像選択またはTexture Assetのcontext menuから設定する | 保存中は選択操作を無効にし、成功時は画像上に「設定済み」と保存先を表示する。Visual Editorでは編集modalを閉じてScene Inspectorへ戻り、現在設定中の実画像と「設定済み」を常設する。Texture Assetはproject source、またはHDR / EXR等の生成済みpreviewをPNGへ変換して使用する。 | 成功時は`public/thumbnail.png`への保存完了後だけ通知し、compileをstaleにする。Textureからの設定後はScene Inspectorを開いて同じ画像を再取得する。未保存project、Play中、画像の欠落・decode・保存失敗では既存thumbnailを維持し、同じ入口から再試行できる。 |
| MI-66 | AboutのDanger Zoneからランタイムまたは全データのリセットを開始する | CLI version確認中は削除操作を無効にし、確認dialogでは対象と復元不能な範囲を明示する。実行中はdialogを閉じられず、削除対象を通常pathから分離してから再読み込みする。 | 成功時は再読み込みして新しいsetupまたは空のproject一覧へ進む。物理削除をすぐ完了できない旧データは退避し、次回起動時に再回収する。退避にも失敗した場合はdialogを保ち、実行中のterminalやeditorを閉じて同じ操作を再試行できる。 |
| MI-67 | Visual projectのUpload reviewを開く | 公開対象Sceneと展開済みPrefabから参照されるTexture / Modelを解析し、Asset VRAM、描画buffer等を含む実行時range、スマートフォン / デスクトップのStudio基準を表示する。詳細modalは寄与量の多い順に解像度、mipmap、GPU展開形式、mesh / primitive、参照数を示し、resize、KTX2、Draco、mesh instancingを効果の大きい順に提案する。 | 推定を実測と表示せず、未知の解像度、GPU / browser差、KTX2転送形式、Dracoが配信量中心の改善であることを残す。詳細を閉じると同じUpload reviewへ戻り、分析だけではSceneDocument、AssetManifest、公開先を変更しない。 |

## 機能一覧

| 機能 ID | 機能 | 参照するインタラクション | 完了条件 |
| --- | --- | --- | --- |
| F-01 | CLI 更新 | MI-03, MI-04, MI-05 | 現在と最新の差分を見て更新または延期でき、更新後の状態が再取得される。 |
| F-02 | プロジェクトライブラリ | MI-01, MI-02, MI-03, MI-04, MI-05, MI-06, MI-09, MI-45 | 項目を成果物種別、classic / visual、更新日時、公開状態で見分けられ、検索・並び替え・絞り込み・安全な削除と、新規作成・再開の入口が常に見つかる。壊れたvisual manifestをclassicと推測して開かない。 |
| F-03 | プロジェクト作成 | MI-03, MI-04, MI-05, MI-06, MI-13, MI-18, MI-35, MI-55 | 四カードから item / world と classic / visual の組を一度に選べる。クラシックは code project、ビジュアルは専用 document project として開く。Visual World は公式Classicテンプレートの固定revisionから対応R3F / Rapierを変換したStarterを既定にし、BlankとOpenBrushも選べる。 |
| F-04 | ローカル実行 | MI-03, MI-05, MI-08 | 実行中であることと、プレビュー URL を開く操作が分かる。 |
| F-05 | 公開準備とアップロード | MI-03, MI-04, MI-05, MI-07, MI-08, MI-09, MI-17, MI-27 | 初期値の upload を防ぎ、toolchain が不足しても authoring を失わず、review から upload result / 審査状態まで続けられる。正式 result にない公開 URL は推測しない。 |
| F-06 | アイテム検査 | MI-03, MI-05, MI-09 | ビルドを含むセキュリティチェックを実行でき、成功時は公開、失敗時はログと編集へ進める。 |
| F-07 | ビジュアルエディター | MI-01, MI-09, MI-10, MI-11, MI-12, MI-13, MI-14, MI-15, MI-16, MI-18, MI-21, MI-22, MI-29, MI-30, MI-31, MI-32, MI-33, MI-34, MI-35, MI-37, MI-38, MI-40, MI-42, MI-43, MI-46, MI-53, MI-54, MI-56, MI-57, MI-58, MI-59, MI-60, MI-62, MI-63, MI-64, MI-65 | 四カードの入口、Hierarchy、Scene View、右 Inspector、下 Assets を使い、独立 selection、Scene Viewを含む複数選択と共通プロパティ編集、復元可能なEntityフォーカス、目的別のScene View表示、Empty / primitive / XRift Component 作成、Asset / Material / Particle / XRift Prefab D&D、Hierarchyの文字検索・種類フィルター・折り畳み・並び替え・親子化・Enabled、親子Transform、軸スクラブとScale比率固定、ComponentごとのEnabled、視覚的なMaterial選択、Material / Texture / Particle 編集、Material Textureのタイリング、Animation / InteractivityからのMaterial操作、配置Entityごとの静的なモデルポーズ、GLB / VRMのNode・Bone・Mesh別編集、GLB / glTF AnimationのPlay時自動再生、動的 thumbnail、Texture Assetから設定できるproject thumbnail、Playとシーン全体の環境設定、右上のModel / R3F / Classic Importを扱える。左下のユーティリティレールからヘルプ、ショートカット、シーン設定へ迷わず到達できる。panel layout は resize / dock 後も復元され、Editor render / module load failure は App 全体へ伝播させず再試行、再読み込み、一覧への復帰を選べる。 |
| F-08 | Visual Asset authoring / import | MI-11, MI-15, MI-16, MI-19, MI-20, MI-21, MI-28, MI-33, MI-36, MI-41, MI-46, MI-54, MI-56, MI-65 | Material / Texture / Model / GLTF / OBJ / VRM / Prefab / Particle を左のfolder tree、種類別collection、保存済みthumbnail付きで管理し、GLB / VRMの埋め込みMaterial / Textureを再利用可能なAssetへ展開する。Materialは変更時だけ一時rendererでthumbnailを更新し、card自体はWebGL contextを保持しない。HDR / EXRはequirectangular用途を持つTexture Assetとして取り込み、現在Sceneへ直ちに設定し、ソースから保存済みthumbnailを自動生成・再生成する。Texture Assetはcontext menuからproject thumbnailへ設定し、Scene Inspectorで実画像を確認できる。sourceを壊さずimport、右InspectorでFlip Yを含むrecipe編集、参照を保つreimport、stale診断を行え、配置したGLB / VRMはNode・Bone・Mesh単位で編集できる。Animation取り込みを有効にしたModelは配置時に再生設定へ到達できる。Asset編集中も`sceneSelection`は保持される。 |
| F-09 | Command / Shortcut / Prefab | MI-12, MI-22, MI-23, MI-24, MI-28, MI-30, MI-31, MI-34, MI-38, MI-43 | toolbar、menu、keyboard、Hierarchy D&D と左下の一覧が同じ Command / Shortcut Registry を使い、Copy / Paste / Duplicate / Delete / Reparent、Entityフォーカスの切替と解除、Empty / Component 作成、Hierarchy からの Prefab 化、XRift built-in Prefab配置、Undo / Redo が IDs と両 selection を復元する。 |
| F-10 | Visual Save / Compile / Preview / Upload | MI-03, MI-05, MI-07, MI-08, MI-09, MI-17, MI-25, MI-26, MI-27 | authoring操作ごとの直列化された自動保存、journal付きcommit、決定的compiler / provenance、freshness検査、区別されたpreview、既存XRift check / uploadを一つのeditor flowで扱い、失敗や取消後もlast committed authoringと戻り先を保つ。 |
| F-12 | Scene environment settings | MI-37, MI-38, MI-59 | 左下の歯車から右のScene Inspectorへ切り替え、ワールド名またはアイテム名、説明、サムネイル、Skyboxの背景表示・IBLライティング、無限遠・ボックス・地面付きドーム投影、画像・回転・明るさ・有限メッシュTransform・投影中心、Fog、環境光、Near/Far、FOV、背景、グリッド、ギズモ、スナップを一か所で設定し、公開情報、Scene View、生成Worldへ一貫して反映する。 |
| F-13 | XRift Component editor preview | MI-10, MI-34, MI-39 | EditとPlayで公式package本体と同じRendererを使い、Portal、TagBoardを含むComponentの実際の見た目をStudio独自デザインへ置換せず確認できる。外部runtime機能だけを副作用なしProvider bridgeへ差し替える。 |
| F-15 | OBJ / VRM import と静的モデルポーズ | MI-03, MI-05, MI-09, MI-20, MI-36, MI-41, MI-46, MI-56 | OBJ / VRMをModel Assetとして配置でき、VRMのNode・Bone・Skinned MeshをHierarchyから選び、配置EntityごとのTransform、node別Material、shape key weightを保存し、再表示と生成結果で同じ静的状態を復元できる。 |
| F-16 | UnityPackage / Scene / Prefab import | MI-03, MI-05, MI-09, MI-11, MI-13, MI-20, MI-24, MI-47 | UnityPackageの論理pathnameとGUID参照を安全に復元し、対応Assetを抽出してScene階層を再構築し、再利用可能なXRift Prefabとして保存する。未対応Asset / Componentは黙って成功扱いせず診断とprovenanceへ残し、C#変換を行わない。 |
| F-17 | AI editor integration / MCP | MI-03, MI-05, MI-09, MI-10, MI-11, MI-13, MI-25, MI-48, MI-60, MI-61 | 対応AI clientへXRift Studio MCPを一操作で登録し、必要ならOllamaのローカルmodelをCodex、Claude Code、OpenCodeのproviderとして構成する。認可したvisual projectの現在Scene、Asset、selection、revisionを読み取り、Fog変更、Asset配置、Material編集、Interactivity Material pointer設定、Poly Haven検索・downloadを通常のEditor Command、Undo、Autosaveへ合流し、AIと手操作の競合を暗黙に上書きしない。登録後は接続状態、対象Scene、直近の編集と復帰手段がEditorに残る。 |
| F-18 | OpenBrush import / shader rendering | MI-03, MI-05, MI-09, MI-15, MI-18, MI-20, MI-27, MI-35, MI-36, MI-49 | OpenBrush / Tilt Brush形式のglTFを通常のModel Assetとして取り込み、three-icosaの専用shaderでScene Viewと生成Worldを再現する。新規Worldでは公式XRift、Blank、OpenBrushの3 Starterから選び、OpenBrush sampleとApache-2.0 licenseを検証付きで保存できる。 |
| F-19 | VisualからClassicへの書き出し | MI-03, MI-04, MI-05, MI-09, MI-17, MI-26, MI-50 | Visual Editorの日常導線から任意の同種Classic projectを検査し、Runtime JSON、Asset、接続component、固定dependencyを手書き領域と分離して追加できる。成功後はfolder、VS Code、terminal、接続snippetへ進める。 |
| F-20 | XRift Studio本体の更新 | MI-03, MI-04, MI-05, MI-09, MI-51 | 起動時またはAboutから署名済み更新を確認し、現在版、最新版、更新内容を見て延期またはinstallできる。進捗を確認したまま再起動し、更新後の版または失敗時の再試行へ到達できる。 |
| F-21 | 外部リソースStoreと環境Texture Asset | MI-03, MI-04, MI-05, MI-09, MI-11, MI-15, MI-16, MI-21, MI-39, MI-49, MI-52, MI-55, MI-61 | Assetsから提供元、作者、license、HDR / EXR形式を確認して外部Material、Texture、HDRI、Model、XRift公式Componentを追加する。Poly Haven Modelは依存fileを検証した自己完結glTF Assetとして保存し、UIとMCPのどちらからも同じinstall境界を使う。Open BrushはPoly Havenと同列のproviderから検証済みbrushを実stroke previewで選び、GUIDとrenderer versionを保持したMaterial Assetとして追加できる。XRift公式Componentも同列のproviderから公開package本体のpreviewを確認してSceneへ追加できる。ローカルまたは外部のHDR / EXRはequirectangular用途のTexture Assetになり、Flip Yなどを編集し、import / install直後またはScene Viewへのdragでシーン全体へ設定できる。provider境界はUIと保存形式から分離し、追加ストアへ拡張できる。 |
| F-22 | GLB / glTF Animation自動再生 | MI-11, MI-13, MI-14, MI-36, MI-54, MI-56 | Animationを含むModelを配置するとAnimation Componentが付き、source NodeをHierarchyへ展開したまま先頭clipのAutoplayとLoopをInspectorで確認・変更できる。Edit中は静止し、Playと生成結果だけで再生し、Stop後は制作状態へ戻る。 |
| F-23 | 公式XRift ComponentカタログとClassic / TSX変換 | MI-03, MI-04, MI-05, MI-09, MI-34, MI-39, MI-52, MI-55, MI-64 | 外部リソースで公開package versionと公式sourceを確認しながら、配置可能な公式Componentを全件サムネイル付きで選べる。右上ImportからDrei / React Three Fiberの標準primitiveとLight、Rapier RigidBody、公式XRift JSXを安全なScene dataへ変換する。既存Classicは検査済みentryを同じ変換器へ渡し、未対応custom codeやAssetを完全変換と誤表示せず、追加後のEntityとInspectorへ到達できる。 |
| F-24 | glTF Material制御とBehavior連携 | MI-15, MI-16, MI-25, MI-60 | Material Textureのタイリング、Offset、Rotation、UV SetをglTF互換値として編集し、MCP、Animation導線、KHR_interactivity pointer nodeから同じMaterial設定へ到達できる。Runtime manifestでもTexture transformとRepeat samplerを維持する。 |
| F-26 | アプリデータのリセット | MI-03, MI-04, MI-05, MI-09, MI-66 | 実行中CLIとの競合や一時的なfile lockで部分的な状態を残さず、ランタイムのみまたは全データを確実に新しい起動から分離する。失敗時は対象と再試行方法を確認したまま復帰できる。 |
| F-27 | 公開前VRAM概算 | MI-04, MI-07, MI-27, MI-67 | World / Itemの更新前にAssetと実行時VRAMのrange、端末別Studio基準、負荷順の内訳と最適化候補を確認し、推定値の限界を理解した上で同じUpload reviewへ戻れる。 |

## F-23 公式XRift ComponentカタログとClassic / TSX変換の状態設計

### 操作前

- 公式カタログはAssetsの「外部から追加」でPoly Haven、Open Brushと同列の「XRift公式 Component」providerから開く。project kindで配置可能なComponentを全件表示し、各カードにComponent名、category、package本体を事前描画した保存済みthumbnailを置く。一覧と詳細を開くだけではWebGL Contextを作らない。`DevEnvironment`はScene Componentではなくdev entry用wrapperとして別注記する。
- 選択中Componentには公開package version、公式source、実際に生成するnamed importとJSX sampleを表示する。
- 右上の「Import」にはModel / 3D AssetとR3F / Classic変換を置く。R3F / Classic変換には貼り付け欄と「Classicプロジェクトを選択」を並べ、folder読込がデスクトップ機能であること、選択後のpackage名、entry、path、読み込んだmodule数を表示する。

### 処理中

- 公式sampleまたは貼り付けTSXをJavaScriptとして実行しない。import alias、JSX tag、string / boolean / number / array / object literal、`Math.PI`を含む有限な数式だけを解析する。
- Drei primitiveはStudio primitiveとMaterialへ、R3F LightはLightへ、Rapier RigidBodyは親Entityの独立したRigid Body Componentへ、`Billboard`は`BillboardY`へ、`Reflector`は`Mirror`へ、`Sky` / `Environment`は`Skybox`へ変換する。RigidBodyの`fixed` / `dynamic` / `kinematicPosition` / `kinematicVelocity`、一般設定、`colliders`生成方式を保持し、親原点へ仮Box Colliderを作らない。動的callbackと未対応Componentだけを診断へ残す。
- Classic folderは`package.json`、`xrift.json`、`src/World.tsx`または`src/Item.tsx`を検査し、`src`内のTypeScript / JavaScript moduleを上限付きで読み、entryからrelative importを再帰的に解決する。local Componentはinstance境界をEntityとして保持し、静的に見つかるreturn JSXをその子へ展開する。任意のcustom code、Hook、callback、条件分岐、動的collectionを実行せず、Asset dependency graphとruntime stateは完全移行と表示しない。
- `group`、RigidBody、Drei / XRift wrapperを独立Entityとして残し、local Transformと親子順を維持する。RigidBody Entityは次のネストしたRigidBody境界までの子孫Mesh / Colliderを一つのBodyとして所有する。対応するleaf Geometry、Light、Collider、公式Componentはその境界の子またはComponentとして変換する。
- Scene、AssetManifest、selectionは「追加」を確定するまで変更しない。

### 成功時

- 追加Entity、必要なMaterial、Light、Collider、公式XRift Componentを一つのUndo履歴へ確定し、最後のEntityを選択してInspectorで編集できる。
- compilerは`@xrift/world-components`から公式名をimportする。Portalなど実行時Contextが必要なComponentはEditとPlayでも公式本体を描画し、外部通信や遷移だけをStudio Provider bridgeで止め、生成結果では公式runtimeを使用する。

### 失敗時

- folder取消は入力を変えない。package / xrift manifestまたは同種entryの欠落、JSXなし、対応要素なし、project kind不一致、Entity / Material / Component作成失敗では追加を成功表示しない。
- 入力コードとsource module path／行番号付き診断をdialogに保持し、literalへの修正、未対応要素の除去、別Componentの選択へ戻れる。

### 戻り先

- キャンセルとEscapeはSceneを変更せず同じEditorへ戻る。
- 成功後はScene View、Hierarchy、右Inspectorが追加Entityへ同期し、Undoで追加前の両selectionとdocument setへ戻れる。

## F-07 の状態設計

### 操作前

- 新規作成では item classic、world classic、item visual、world visual の四カードを同じ画面で選ぶ。内部 model は成果物と project type の二軸でも、二段階 UI にしない。
- クラシックは `package.json` / `xrift.json` / `src/` を編集する code project、ビジュアルは専用 manifest / Scene / Asset document を編集する project と説明する。同じ project の表示切替や自動相互変換とは表示しない。
- ビジュアルを選ぶ前に専用 format を作成し、保存、Play、変換、check、upload まで同じ Editor flow で扱うことを示す。
- 開いた直後は成果物種別、project type、既定 Scene、独立した `sceneSelection` / `assetSelection`、Edit、Transform tool、未保存状態が見える。
- 起動時は saved panel layout を window size と schema に合わせて復元し、不正または画面外の配置は safe default に補正する。
- World には World Play Profile、Item には Item Preview Profile を使うことを示す。World の controller / physics / spawn adapter を Item へ適用せず、利用可能な input capability を Play 前に示す。
- Node.js / XRift CLI がなくても authoring と同一画面の Play shell を利用できる。Vite、CLI、開発サーバー、別ブラウザの起動を制作操作として置かない。
- クラシックを選んだ場合は既存の名前入力、作成、一覧更新、コードエディターへの流れを変えない。

### 操作中

- Asset の一回クリックは `assetSelection` と右 Inspector の Asset context を更新し、`sceneSelection` を維持する。Model / Prefab を Scene View へ drag するか「配置」を実行するまで Entity を増やさない。
- Hierarchy と Assets は Shift の範囲選択、Ctrl・Cmd の追加／解除を受け付ける。複数選択時は右Inspectorで対象数と、全対象が持つMesh Renderer / LightまたはMaterialの共通プロパティだけを表示する。
- Hierarchy / Scene の右クリック Create は selected parent / click point を menu header に示し、primitive 選択前には Entity を増やさない。
- Hierarchyの行D&Dは上端と下端を兄弟順の挿入位置、中央を親子化として扱う。親行の矢印は子孫行だけを折り畳み、Scene Viewなどから折り畳まれた子を選択した時は祖先を自動展開する。検索は名前、種類、Component、Enabled状態を対象にし、直下のsemantic iconでMesh、Light、Collider、Audio、Particle、Animation、Spawn、XRift Componentを複数選択できる。種類同士はOR、文字検索とはANDで絞り込み、一致Entityと祖先を表示し、クリア後は元の折り畳み状態へ戻す。行の目アイコンと単一／複数Entity InspectorのEnabledはEntity自身の状態を切り替える。単一Inspectorの先頭はEnabledチェック、名前、必要時だけ継承状態アイコンの順にし、Prefab sourceは名前と更新アイコンだけを置く。説明は常設せずtooltipと読み上げ名へ移す。
- 子EntityのTransformはlocal値として保持し、Scene View、Play、生成Worldのすべてで親のPosition / Rotation / Scaleを継承する。
- Material drag 中は Scene Mesh または Entity Inspector slot だけを drop target とし、slot が複数なら chooser を表示する。Texture drag は右 Material Inspector の compatible slot だけを target にする。
- Asset のドラッグ中は Scene View だけを配置可能領域として示し、drop 前には Entity を増やさない。
- ギズモ操作中はカメラ操作を競合させず、Scene View と Inspector の Transform 値を同期する。Inspector の軸ラベルをスクラブする時も local Transform を即時同期し、Scale の比率固定中は操作軸の倍率で不均等比率を保つ。
- Entity選択中のFは、そのEntity subtreeの描画boundsへカメラとOrbit中心を合わせる。フォーカス中に別Entityを選択しただけでは追従せず、Fを押した時だけ対象を切り替える。
- 待機中のギズモと選択補助線はニュートラルカラーで控えめにし、操作中の軸とAsset drop targetだけを明るく示す。
- panel resize / dock 中は drop preview と minimum size を示し、authoring Command や selection を変更しない。
- Material Asset の color、metalness、roughness、texture 参照は Edit 中だけ変更でき、同じ Asset ID を参照する全 Entity の preview と同期する。Entity 固有 Material 値へ複製しない。
- 外部 GLB / GLTF の drop は Import Queue で validate、source copy、derive、dynamic thumbnail、manifest commit まで処理する。Assets への drop は Scene 配置へ進めず、Scene への明示 drop だけが import 成功後の配置を同じ transaction intent で続ける。
- Play 準備中は二重開始を防ぎ、成功するまでauthoring documentを変更しない。Play開始後は実行コピーを`Play Window`へ表示し、HierarchyとInspectorは編集データへ接続したままにする。単一EntityのTransform、Collider、Animationだけ通常の履歴と自動保存で変更でき、構造変更、Asset変更、ギズモ、Asset dropは停止まで無効にする。
- World Preview は有効な input と controller 操作方法を示し、Item Preview には World 用 avatar / controller を出さない。
- Play 中の input、controller、camera、physics などは PlaySession にだけ保持する。
- Play 中は Stop を常に見える位置に置き、別画面や別ブラウザへ移動させない。
- ヘッダーの「ビジュアル」、未保存、compile freshness、upload / 審査状態は操作中も消さない。

### 成功時

- Asset の配置成功では Asset ID を参照するroot Entityを一つ追加し、GLB / VRMにsource Node metadataがある場合だけ同じtransactionで編集用Node Entity treeを子へ展開する。Hierarchy、Scene View、Entity Inspectorはrootを選択し、Undoではrootと展開Node、selectionを配置前へ戻す。
- primitive 作成成功では `CreatePrimitiveCommand` 一件で Entity と builtin geometry reference を追加し、Material drop 成功では `AssignMaterialCommand` 一件で既存 Mesh slot だけを更新する。
- Transform 操作成功ではギズモまたは軸ラベルの pointer down から pointer up までを一件として確定し、選択とカメラを維持する。
- フォーカス成功では対象名とF / Escape / 解除ボタンをScene View端に残し、同じEntityでFを押すか解除操作を行うと開始前のカメラ位置、向き、Orbit中心、ズームへ戻す。
- layout 操作成功では normalized size、dock zone、order を Editor Preferences に保存し、再起動後も復元する。
- Material 操作成功では有効値が AssetManifest の一つの Material Asset に残り、共有する全 Entity の表示を更新する。SceneDocument と Entity 固有値は変更しない。
- 複数Entityの削除と共通プロパティ変更、複数MaterialのPBR変更は、対象全体を一件のhistoryとして確定する。
- Play開始成功では中央のPlay Windowでproject kindに対応するprofileを確認でき、runtimeの位置、速度、animation時刻はPlaySessionにだけ残る。
- Play中の許可されたEntity変更は編集データへ残り、そのEntityだけruntime revisionを進めてAnimationとphysicsを先頭から再実行する。他Entityとcontrollerのruntime stateは維持する。
- Stop成功ではPlaySessionを破棄し、Play中に許可された調整を含む最新SceneDocument、Play開始前と同じAssetManifest、selection、Edit cameraへ戻る。runtimeの位置や速度をauthoring変更として扱わない。
- GLB / GLTF の import 成功は source / derived / thumbnail / manifest commit の完了と新 Asset card を表示する。Scene 配置は Scene drop または後続の「配置」が成功した時だけ別結果として示す。
- 同期操作の結果はトーストだけにせず、追加 Entity、右 Inspector、参照 Entity の表示、Import Queue の項目として画面へ残す。

### 失敗時

- 非対応ファイルは拡張子と対応形式を示し、SceneDocument、AssetManifest、selection、history を変更しない。
- Transform に有限でない値や不正な scale が入った場合、または軸スクラブを Escape / pointer cancel で終えた場合は操作前へ戻し、対象項目の近くに修正方法を示す。
- 選択Entityに描画boundsがない場合はworld Transform位置をフォーカス中心にし、Entity自体を選べない場合やPlay中、入力中はカメラを変更しない。
- Material Asset に不正な color、有限でない値、`0..1` の範囲外、欠落 texture 参照が入った場合は確定せず、右 Inspector の対象 field 近くに形式または範囲を示す。
- 欠落 Asset 参照では Entity を消さず、欠落 ID、参照元 Entity、Asset の再 import または置換を示す。
- primitive create point、parent、Material / Texture slot を解決できない場合は Command を確定せず、対象を選び直す操作を示す。
- Play の初期化に失敗した場合は Edit と authoring document を維持し、Scene View 内に profile、原因、再試行を示す。回避策として CLI や別ブラウザの手動起動を要求しない。
- Play 中に runtime error が発生した場合は PlaySession を dispose して Edit へ安全に戻し、SceneDocument と AssetManifest が変更されていないことを保つ。
- Scene View を初期化できない場合は MI-09 の面を表示し、ライブラリへ戻る操作と再読み込みを用意する。
- layout Preferences を保存できない場合は session layout を保ち、authoring を止めずに再試行と「レイアウトをリセット」を示す。
- 保存、変換、check、upload の失敗は実 stage と sanitized cause を表示し、成功通知へ進めない。retry または対象 field へ戻る操作を置く。

### 戻り先

- ヘッダーにライブラリへ戻る操作を置き、未保存変更がある場合は保存、破棄、取消を同じ画面内で選べる。
- Play 中にライブラリへ戻る場合は、先に Stop と同じ cleanup を実行して PlaySession を破棄する。runtime state を authoring document へ保存しない。
- 戻った後はプロジェクトライブラリを表示し、新規作成入口を先頭に保つ。
- Escape で未確定 dock / resize を開始前 layout へ戻し、「レイアウトをリセット」で左 Hierarchy、中央 Scene View、右 Inspector、下 Assets へ戻す。
- フォーカス中のEscape、解除ボタン、Play開始は保存したEdit cameraへ戻し、selectionとSceneDocumentは変更しない。
- 作成または保存 transaction が commit した project だけを一覧へ追加する。
- 永続化を接続した後は、Scene / Prefab / Asset / folder を含む save set のいずれかが未保存なら保存、破棄、戻るの取り消しを選べる確認へ置き換える。

## F-08 Visual Asset authoring / import の状態設計

### 操作前

- Assets は左のfolder treeに実フォルダーの親子関係を常時表示し、右側に選択フォルダーの内容を出す。Model / GLTF、Texture、Material、Prefab、Particleの種類別collectionは実フォルダーと区別し、primitiveは別のCreate paletteに置く。Material / Model / Textureはreadyなgenerated thumbnail、未生成時だけkind iconを使う。
- `sceneSelection` と `assetSelection` が独立し、右 Inspector がどちらの context を表示しているかを選択背景、header、pinned tab で示す。
- Import 前に対応形式、HDR / EXRがSkyboxへ直ちに設定されること、source 保持、既定 max resolution / quality / mipmap / compression、resource budget、external URI が local dependency に限られることを確認できる。
- Model Inspectorはsourceとlast-good解析結果、Material slot、animation、bounds、現在のimport recipeを同時に示し、解析済みの値と次回再import用の設定を区別する。

### 操作中

- Material 作成は dialog 内の validation、Texture / Model / HDRI import は Import Queue の validate、copy、decode、derive、thumbnail、commit を表示し、cancel を処理中 stage に合わせる。
- Particle は Assets の作成操作から追加し、右 Inspector で emission、shape、velocity、lifetime、size、color、texture、blend を編集する。Particle Asset は Scene View または Hierarchy へ drag して Particle Emitter Entity として配置できる。
- 右 Inspector の Asset context は source と derived、slot の色空間、recipe、stale / diagnostic を分ける。Entity context の Mesh shadow や選択 Entity を Asset field で上書きしない。
- context menu は現在 kind / state で実行できる項目だけを有効にし、menu open だけでは selection や document を変えない。
- Modelのscale、collider生成、mesh最適化、animation importを変更した時はrecipeだけを未保存にし、再importが必要な項目をInspector内で示す。再import中も既存Scene参照とlast-good表示を消さない。

### 成功時

- Import / Material 作成は AssetManifest と folder membership を一度だけ確定し、新 Asset を `assetSelection` にする。HDR / EXR importだけは同じ履歴でScene settingsのSkybox参照も確定し、それ以外は`sceneSelection`とSceneDocumentを維持する。
- Particle Asset の作成は新 Asset を `assetSelection` にし、Entity への配置または Particle Emitter の追加は参照する Asset ID を SceneDocument に保持する。
- thumbnail / derived は source / recipe / processor / target hash と一致した時だけ ready にし、同じ source を再 import しても Asset ID と参照を保つ。Material一覧は保存済み画像だけを表示し、変更時の生成queue以外ではWebGL contextを増やさない。
- Material の変更は共有 Asset に一度だけ保存され、同じ ID を参照する全 preview に反映する。
- Model再importはAsset IDを維持し、slot identityが一致する既存Material bindingを保持する。新規slotは未設定として追加し、消失slotは診断に残して参照先の修正へ進める。

### 失敗時

- extension、URI、budget、decode、Material field、slot binding の失敗は Asset / field / source URI を project-relative に示し、reimport、設定変更、参照置換のいずれかへ案内する。
- temporary data を回収し、Scene / Asset / folder documents、両 selection、history、source、last-good derived を開始前のままにする。同じ設定の自動 retry loop は行わない。
- Model metadataが非有限、bounds不正、slot重複、未対応external URIの場合は新しいmanifestを確定せず、last-good Model Assetと配置済みEntityを維持する。

### 戻り先

- Import Queue を閉じても Assets と右 Inspector に last result / diagnostic を残す。cancel は直前の `assetSelection`、Inspector context、Scene View へ戻る。
- Play 中は Asset authoring を読み取り専用にし、Stop 後に Play 前の selections と未保存状態へ戻る。

## F-09 Command / Shortcut / Prefab の状態設計

### 操作前

- toolbar、context menu、tooltip、Shortcut 設定は同じ command label、semantic Lucide icon、platform binding、enabled reason を中央 Registry から表示する。
- 左下のキーボードから現在有効なShortcut一覧を分類表示し、操作を探すために各toolbarを巡回させない。
- Hierarchy から Assets へ drag する時は reparent ではなく Prefab 作成になること、作成先 folder、subtree / dependency 件数を drop 前に示す。

### 操作中

- Copy は versioned buffer だけを更新する。Paste / Duplicate / Delete / Prefab 作成は before / after documents と `sceneSelection` / `assetSelection` を一 transaction に保持する。
- text input、contenteditable、数値 field、IME composition が focus 中は W / E / R / F / Delete / Copy / Paste / Duplicate の editor command を実行しない。shortcut conflict はどちらも実行しない。

### 成功時

- Paste / Duplicate は決定済みの新 ID、Prefab 作成は Prefab Asset / document / folder membership / instance metadata を一度だけ確定し、両 selection を仕様どおり更新する。
- Undo / Redo は同じ IDs、dependency references、Prefab overrides、前後の両 selection を復元する。toolbar、menu、keyboard の入口によって履歴結果を変えない。

### 失敗時

- stale copy buffer、revision conflict、Prefab cycle、missing dependency、参照中 Asset delete は document を変えず、対象 ID と修正操作を示す。
- cross-document Prefab transaction の一部だけを残さず、temporary Prefab document と払い出し ID を破棄して元の Scene / Asset / folder revision へ戻す。

### 戻り先

- Escape は未確定 drag / menu / dialog を閉じ、操作前の両 selection と focus surface へ戻る。確定後の戻りは Undo を使う。
- user shortcut override は Editor Preferences に残し、project を切り替えても同じ binding を使う。「既定へ戻す」で Registry default へ戻せる。

## F-10 Visual Save / Compile / Preview / Upload の状態設計

### 操作前

- authoring操作前は直前revisionを自動保存済みとして示す。compile / previewはtargetとinput freshness、Uploadはtitle、description、thumbnail、auth、diagnostic、既存remote IDを開始前に示す。
- Editor direct preview、generated staging preview、XRift upload / 審査を同じ「Preview」と呼ばない。公式資料にない hosted / CLI / XFT preview は選択肢に出さない。

### 操作中

- authoring操作の確定後は250msの待機を挟み、最新revisionをvalidate、temporary write、commitへ進める。保存中に次の変更が確定した場合は並列writeせず、現在の保存完了後に最新revisionを続けて保存する。compileはasset prepare、generate、hash / provenance、必須の`public/thumbnail.png`のstaging copyとSHA-256一致確認へ進み、Upload modalはauth-check、saving、compiling、checking、uploading、processingを表示する。
- cancel button は安全に止められる stage だけ有効にする。remote upload 開始後は best effort であることを示し、結果不明のまま新規 upload を再開しない。

### 成功時

- 自動保存はcommit markerと全hash一致後だけ対象revisionを保存済みにする。保存中に新しいrevisionができた場合は「自動保存中」または「自動保存待ち」を維持し、後続保存が完了してから「自動保存済み」にする。compile / checkはfresh input fingerprintのresultとprovenance linkを残し、サムネイルは「公開用ステージングへコピー済み」と検証SHAを表示する。
- Upload は正式 result の worldId / itemId、versionId、versionNumber、contentHash と審査状態を表示する。正式 URL field がある時だけ URL を表示する。
- Upload 成功後は CLI が `.xrift/world.json` または `.xrift/item.json` に記録した remote ID を authoring project へ保存し、次の fresh staging へ復元する。`xrift.json` を remote ID の保存先として扱わない。

### 失敗時

- 自動保存失敗はlast committed document setと未保存のEditor stateを維持し、headerへ「自動保存エラー」と再試行を表示する。新しい操作が確定した場合はその最新revisionで一度だけ再試行し、同じ内容の無限retryは行わない。compile failureはlast-good staging、Upload failureはremote commitの有無を保ち、stage、sanitized cause、再試行先を示す。
- stale input、REJECT、未編集 metadata、auth failure、サムネイルの欠落・copy失敗・SHA不一致を成功扱いにせず、元 Entity / Asset / field または review へ戻す。サムネイル変更時はcompileをstaleにし、再staging前にremote uploadを開始しない。token、absolute path、raw stderr を表示しない。
- 保存済み remote ID を一意に復元できない、または manifest、CLI sidecar、upload result の ID が一致しない場合は新規 upload を開始・再試行せず、公開先の確認を求める。

### 戻り先

- modal / previewを閉じると同じvisual projectのEdit、Play前のcamera、`sceneSelection`、`assetSelection`、自動保存状態へ戻る。ライブラリへ戻る時は待機中または保存中の最新revisionをflushし、失敗した場合はEditorへ留まって再試行を示す。
- automated test と通常の UI 検証は fake backend / fixture で upload state を再現し、実 XRift upload を行わない。

## F-11 Collider authoring / export の状態設計

### 操作前

- 新規 import した Model は `generateColliders` を既定で有効にし、Sceneへ初回配置した時に同じ Entityへ既定`Static (Fixed)`の`Mesh Collider`を追加する。既存 Asset で明示的に無効化された設定は移行で上書きしない。
- built-in primitive は `Box Collider` を同時作成する。Floor / Plane は薄い local bounds、その他は primitive bounds を初期 Half Extents とし、Entity Scale は値へ焼き込まずTransformで追従させる。
- PhysicsのAdd Componentに`Rigid Body`を一Entity一件で表示する。追加した親Entityは自身と子孫のCollider / Meshを一つの物理Bodyへまとめ、ネストした別Rigid Body Entityから先は別Bodyとして扱う。

### 操作中

- Inspector は Box の Center、Half Extents、自動フィット、Mesh の Trimesh / Convex Hull、共通の Enabled、Trigger、Friction、Restitutionを同じ Component cardで編集する。
- Rigid Body cardで`Static (Fixed)` / `Dynamic` / `Kinematic Position` / `Kinematic Velocity`、Gravity Scale、Linear / Angular Damping、Can Sleep、CCD、Position / Rotation Lockを編集する。Collider生成は`子孫のCollider Component`、`Auto Cuboid`、`Auto Ball`、`Auto Convex Hull`、`Auto Trimesh`から選び、対象となる子孫Collider / Mesh件数を同じcardに表示する。
- Rigid Body Componentがない旧documentではCollider内のBody設定を互換読み込みし、`Static (Fixed)`を既定にする。旧Classic importerが子を持つ空Entityの原点へ作った既定サイズBoxは、名前またはBody / surface設定のimport signatureを確認できる場合だけ親Rigid Body Componentへ読み込みmigrationし、原点Boxを残さない。親または自身にRigid Body ComponentがあるColliderは、Body設定の編集先をその親Entity名で示し、Collider cardでは形状と接触設定だけを編集する。
- Boxの再フィットは同じ Entity の Mesh boundsだけを使用する。Modelはimport metadataのboundsとimport scaleを用い、absolute pathや生のglTFデータをScene documentへ保存しない。

### 成功時

- Box / Mesh Colliderの変更、追加、削除は一つのScene history transactionになり、選択を維持する。選択中のBox ColliderはScene Viewにwireframeで表示する。
- PlayとcompilerはRigid Body Entityのlocal TransformをBody原点にし、そのsubtreeを一つのRapier `RigidBody`で包む。子孫のBoxは各Entityのlocal階層を保った`CuboidCollider`、Mesh Colliderは`MeshCollider`として同じBodyへ含める。親原点へ代替Boxを追加しない。ネストしたRigid Bodyは新しいBody ownershipを開始する。
- Auto Colliderを選んだ場合はRapierの自動生成をsubtree Meshへ適用する。Dynamic / Kinematicの明示TrimeshはRapier互換のConvex Hullへ自動変換し、compiler診断にも残す。

### 失敗時

- MeshのないEntityへMesh Colliderを追加せず、必要なMesh Rendererを示す。自動フィットboundsがない時は既存値とSceneを変更しない。
- 非有限Center、0以下のHalf Extents、負のFriction、`0..1`外のRestitutionは確定せず、upload前validationでもblocking diagnosticにする。
- Rigid Bodyのsubtreeに明示Colliderがなく、Auto Collider対象のMeshもない場合はBodyを消さずInspectorとcompiler診断へ「物理形状がありません」と示す。

### 戻り先

- ColliderまたはRigid Body削除後もMesh、Material、Transform、Entity selectionを維持する。Undoで同じComponent ID、Body ownership、設定を復元する。

## F-12 Scene environment settings の状態設計

### 操作前

- 左下の歯車「シーン設定」は、Entity / Asset selection を変えずに、右のEntity InspectorをScene Inspectorへ切り替える。設定対象は Scene 全体であり、Hierarchy の Entity として追加しない。
- Skybox、Fog、環境光は Scene View のプレビューと生成する World の両方に反映する。SkyboxはAssetsのequirectangular環境Textureまたは通常の画像Textureを選択・ドロップで設定し、背景表示とIBLライティングを独立して切り替え、回転と露出を共有する。HDR / EXRを直接importした場合は新しい環境Texture Assetを同じSceneへ設定し、背景とIBLを既定で有効にする。Near / Far、FOV、背景、グリッド、ギズモ、スナップは編集ビューの設定として明示する。
- Scene View固有の不透明な地面は追加しない。Skybox有効時は地平線の下側までSkyboxを見せ、その上へ編集用グリッドだけを重ねる。
- サムネイルは保存済み project でだけ編集可能にし、未保存 project では保存後に設定できる理由をボタン文言で示す。

### 操作中

- 色、トグル、数値の変更は対象 section 内で即時にプレビューへ反映する。数値入力は Enter または focus を外した時に確定し、不正値は直前の有効値へ戻す。Skybox画像は環境Textureまたは通常の画像Textureだけを受け付け、画像がない時はIBLトグルを無効にする。Texture InspectorのFlip Yを基本値とし、Scene Inspectorの追加反転はScene固有の上書きとして合成する。
- Fog の終了距離は開始距離より大きく、Camera Far は Near より大きく保つ。Play 中は document を変えず、各 control を読み取り専用にする。
- ギズモのスナップは移動、回転、拡縮に同じ設定を適用し、グリッドの表示を切っても Entity や SceneDocument の構造は変えない。

### 成功時

- 確定した Scene settings は Undo / Redo の一件として残り、保存後に Scene JSON へ書き込まれる。compiler はSkybox画像の背景とIBLを独立した設定として、Fog、環境光とともに generated World source に出力する。
- サムネイルを保存した後はScene Inspectorへ戻り、公開前確認が同じ画像を再取得できる状態を保つ。

### 失敗時

- 読み取り専用、未保存project、範囲外の数値、無効な色、使用できないSkybox画像では SceneDocument と選択を変えず、同じ場所で理由または復帰方法を示す。生成対象にできない画像はグラデーションへフォールバックし、compile診断に残す。
- サムネイルの読み書きに失敗した時は既存画像を維持し、サムネイル編集画面内で再試行できる。

### 戻り先

- ヘッダーの戻る、Entity / Assetの選択はScene Inspectorだけを閉じ、直前のScene Viewとselection、編集位置へ戻る。確定済みの変更は保存または Undo で扱う。

## F-13 XRift Component editor preview の状態設計

### 操作前

- Hierarchy、Create、Inspector、AssetsはComponent Registryの公式名、説明、semantic iconを使用する。Scene Viewは保存済みPropsとEntity Transformを`@xrift/world-components`本体へ渡し、EditとPlayで同じ公式Rendererを使用する。
- `XRiftProvider`、Physics、各runtime ContextはStudio Provider bridgeで供給する。instance取得、遷移、ユーザー、画面共有など外部platformの副作用は起こさず、公式ComponentのReact／Three実装は差し替えない。

### 操作中

- InspectorでPortalの`instanceId` / `disabled`、TagBoardの`title` / `columns` / `tags` / `scale`を変更すると、同じ公式ComponentへPropsを即時反映する。通信、ユーザー状態の生成、Scene history以外の副作用は起こさない。
- Interactable、Grabbable、TextInput、BillboardYはStudioが別の外観を作らず、同じEntityの実childrenを公式wrapperで包む。

### 成功時

- Portal、TagBoard、EntryLogBoard、Mirror、Video系を含む全公式Componentはpackage versionに含まれる実装どおりに表示する。Studio独自の旧ポータルshader、HTML board、簡易screenへ分岐しない。
- カタログthumbnailは同じProvider bridgeと公式Rendererを固定generatorで描画し、保存済みWebPとして一覧と詳細で共有する。Component名と公式badgeは識別情報として画像へ焼き込み、Component本体の代わりにSVG、CSS図形、DOMの疑似サムネイルを使わない。

### 失敗時

- 欠落または不正なPropsはRegistry defaultまたは公式Componentの空状態へフォールバックし、Scene View全体を停止させない。公式Rendererを安全に起動できない場合は架空の代替外観を作らず、Component名と未対応理由をEditor診断に残す。

### 戻り先

- 選択解除、Entity削除、Undo / Redoでは補助表示だけを同じScene documentへ追従させ、Camera、selection、runtime stateを追加で変更しない。

## F-14 Basic Component menu / Audio Source の状態設計

### 操作前

- Create、Hierarchy右クリック、InspectorのAdd Componentは同じ基本Component Registryを使い、Core、Rendering、Physics、Media、Worldを折りたたみsectionとして表示する。ライト種別、Particle Emitter、Audio SourceはRendering / Mediaの意味が分かる名前とiconを共有する。
- Audio Sourceは追加直後も既存Entity selectionを維持し、InspectorでImport済みAudio Assetを選択できる。直接URLは新規設定に使わず、既定では自動再生せず、編集画面を開いただけで音を鳴らさない。

### 操作中

- sectionの開閉はSceneDocumentと履歴を変更しない。項目を選んだ時だけComponent追加を一件確定し、メニューを閉じて追加したComponentのInspectorを表示する。
- Audio SourceはEnabled、Audio Asset、Volume、Loop、Autoplay、Spatial、Reference Distance、Rolloff、Max Distanceを型と範囲を保って編集する。Audio Assetがない時は同じInspectorからMP3 Importの入口を理解でき、Editor Previewでは音声取得を開始しない。

### 成功時

- compilerは参照されたAudio AssetのMP3をstagingの公開用アセットへコピーし、そのURLをThree.js Audio / PositionalAudioへ変換してcameraへAudioListenerを接続する。Componentを無効化した時とEntityを破棄した時は再生、listener、buffer参照をcleanupする。
- ライト、Particle、Audio SourceはCreate、Hierarchy、Inspectorのどの入口から追加しても同じComponent ID、初期値、重複規則、生成結果になる。

### 失敗時

- 未設定Audio Assetやload失敗でScene View全体を停止させない。未設定はcompile warningとして出力を省略し、参照切れ・MP3以外のsourceはcompileをblockする。runtime load失敗は生成側Component内で音声だけを停止する。
- 非有限値、範囲外のVolume、0以下の距離、負のRolloffは確定せず、直前のSceneDocumentとselectionを維持する。

### 戻り先

- Add Componentを閉じると同じEntity Inspectorへ戻る。追加後は同じEntityを選択したまま、UndoでComponent追加前へ、Redoで同じComponent IDと設定へ戻れる。

## F-15 OBJ / VRM import と静的モデルポーズの状態設計

### 操作前

- Import入口にGLB / glTF / OBJ / VRMを同じModel形式として表示する。OBJは単体のgeometryを取り込み、外部MTL / textureは自動取得せず、必要なMaterialをXRift Studio内で割り当てることを示す。
- VRM 0.x / 1.xはModel Assetとして取り込み、humanoidを含むboneとshape keyを最後に正常解析したmetadataとして保持する。Timelineやclip編集が今回の静的pose編集に含まれないことをUI上で区別する。
- 配置後はModel Entityの下にsourceのNode、Bone、Mesh、Skinned Meshを親子順で表示する。SkinはNodeごとに複製せず、親Model Entityの共有Rendererでbind poseとAnimationを維持する。
- poseとnode別Material bindingはModel Asset共通値ではなく配置EntityのMesh componentに属する。同じModelの別配置を変更しない。

### 操作中

- Import中は既存Import Queueで形式検証、source copy、parse、thumbnail、manifest commitを順に示し、二重Import / reimportを無効にする。
- HierarchyでBoneまたはNodeを選ぶと、そのlocal Transformを通常の数値入力とギズモで編集し、共有Modelのsource node poseへ即時反映する。従来のbone選択UIとshape keyの0..1 weightも同じ配置の静的poseとして維持する。
- Mesh / Skinned Mesh Nodeを選ぶと、そのsource nodeが使うMaterial slotだけを表示する。同じsource material indexを共有する別Nodeとは`sourceNodeIndex`で上書きを分離する。
- pose変更は有効な有限値だけを確定する。Play中は読み取り専用にし、Asset reimport中はlast-good metadataと現在のEntity poseを表示したまま編集を止める。

### 成功時

- Import成功後は新Model Assetを選択し、形式、bone数、shape key数、source、thumbnailをInspectorに残す。「配置」でEntityを作成してからpose編集へ進める。
- Bone / Node Transform、node別Material、shape key weightは共有Mesh componentへ保存し、Undo / Redo、project再表示、Scene View、Classic JSX、Runtime manifestで同じ静的状態を復元する。
- 「ポーズをリセット」はboneとshape keyだけを初期値へ戻し、Entity Transform、Material binding、Collider、Model Assetを維持する。

### 失敗時

- 不正なOBJ / VRM、上限超過、読めないgeometry、VRM拡張解析失敗ではAssetManifestへcommitせず、Import Queueに形式と再選択の案内を残す。
- OBJの外部MTL / texture参照は自動取得せずwarningにし、Model自体は読める場合に限りcommitする。欠けた見た目はMaterial slotから修正できる。
- reimport後にpose対象のboneまたはshape keyが消えた場合は値を勝手に別対象へ移さず、残っている対象だけ適用し、Inspectorに未適用件数とリセットを示す。
- source Node解析またはSkin参照が壊れている場合は部分的なHierarchyを成功表示せず、last-good AssetとSceneを維持してImport Queueから再試行できるようにする。

### 戻り先

- Import Queueを閉じても新Model Assetと診断をAssets / Model Inspectorに残す。Entityを選択すると直前のpose編集へ戻れる。
- pose編集後に別Entity / Assetを選んでも値を保持し、同じEntityへ戻ると保存済みposeを再表示する。Timeline追加時はこの静的poseを初期状態として扱える構造を維持する。

## F-16 UnityPackage / Scene / Prefab import の状態設計

### 操作前

- AssetsのImportとdropは`.unitypackage`、`.unity`、`.prefab`を既存Model / Textureと同じ入口で受け付ける。UnityPackageはSceneだけでなく依存Assetを含む入力、単体Scene / Prefabは外部GUID Assetを同時取得しない入力として区別する。
- 変換対象はGameObject階層、local Transform、GLB / glTF / OBJ / VRM、主要Texture、Unity Material、Mesh Renderer、Light、Audio Source設定、Collider、Fog / Ambient / Camera設定とする。FBXなど実行時Modelへ変換できないsourceも参照先と件数を診断する。
- MonoBehaviourのclass IDと件数はPrefab provenanceへ記録するが、C#からJavaScriptへのコード変換は開始しない。

### 操作中

- Import Queueはreading、gzip / tar展開、`pathname`安全性検査、Unity YAML object / GUID参照解析、Asset derive、Scene再構築、Prefab生成、atomic commitを一つの進捗として表示する。処理中はModel reimportを含む別Asset mutationとPlayを無効にする。
- Unityの左手座標系はXRift / Three.jsの右手座標系へ変換し、positionのZとquaternionを対応させる。親参照の欠落とcycleはScene Rootへ安全に戻してwarningにする。
- 対応Asset sourceは既存のcontent-addressed保存とthumbnail生成を再利用する。同一SHAは既存Assetを選択し、同じbinaryを再コピーしない。Package内の全binary writeが揃うまでSceneDocument、AssetManifest、Prefab documentを画面へ反映しない。

### 成功時

- 変換したGameObject rootsを現在Sceneへ再構築し、Unity Scene / PrefabごとにPrefab documentとPrefab Assetを保存する。最後に作成または再利用したPrefabをAssetsで選択し、再構築したrootをHierarchy / Scene Viewで選択する。
- Activity drawerにPrefab、Entity、Asset、要確認の件数を残す。Prefabのimport metadataにはsource名、package内pathname、source SHA、Unity class ID件数、未対応class ID、C#変換を行っていない事実を保存する。

### 失敗時

- gzip / tar破損、安全でないpathname、展開上限超過、Unity YAML不正、変換対象なし、Asset commit失敗ではlast-good SceneDocument、AssetManifest、Prefab set、両selectionを維持する。
- 一部のAsset / Componentだけ未対応の場合は変換可能な階層を残し、FBX、外部glTF、Audio clip、MonoBehaviourなどの不足をwarningとしてActivity drawerから確認できる。黙って完全変換と表示しない。

### 戻り先

- 成功後は「アセットを表示」から生成Prefabへ移動し、Hierarchy / Scene Viewには再構築結果を残す。失敗後はActivity drawerを閉じても元Sceneを編集でき、同じまたは修正したpackageを再度dropできる。

## F-17 AI editor integration / MCP の状態設計

### 操作前

- EditorのAI連携panelはCodex、Claude Code、Claude Desktop / Cowork、OpenCode、Cursorの検出結果、登録scope、XRift Studio MCP serverの状態を表示する。Codexは現在の`PATH`に加えて、公式installer、Codex app同梱CLI、npm、pnpm、WinGet、Homebrew、standalone installerの標準配置を確認し、起動時の環境変数が古い場合も再起動なしで検出する。OllamaはMCP client一覧へ混在させず、ローカルmodel providerとしてinstall状態、version、model一覧、構成先clientを別sectionに表示する。native APIがないブラウザでは登録済みに見せず「デスクトップ版で利用できます」と示す。Claude Desktop / Coworkはローカルsessionだけを対象にし、remote CoworkではローカルMCPを起動できないことを登録前に示す。
- MCPは現在開いているvisual projectだけを候補にし、project ID、Scene ID、session revisionを接続clientへ返す。接続しただけではSceneDocument、AssetManifest、selection、historyを変更しない。
- AI書き込みは既定でEdit中の認可済みprojectだけに許可し、Play、Import、project切替中は理由付きで読み取り専用にする。Upload、削除、任意file、任意shell操作は初期tool setへ含めない。

### 操作中

- CodexとClaude Codeのclient登録は検出した実行ファイルを直接起動し、client種別ごとに固定した`mcp add`引数だけを渡す。Claude Desktop / CoworkとCursorは既存設定をbackupし、`mcpServers.xrift-studio`だけをmergeする。OpenCodeは既存設定をbackupし、`mcp.xrift-studio`へ公式のlocal server形式をmergeする。登録するMCP serverは内容hash付きでapp dataへcopyし、Cargoの開発出力をclientから直接起動しない。shell文字列連結、任意command、project documentへのtoken保存は行わない。
- Ollama構成はinstall済みmodelの完全一致を再確認し、tool calling非対応modelは設定を変更せず拒否する。構成先はCodex、Claude Code、OpenCodeのallowlistに限定し、固定引数の`ollama launch <client> --model <model> --config --yes`をshell経由ではなく直接実行する。同じ操作内でXRift MCPが未登録または更新対象なら先に既存登録処理を完了する。model download、任意command実行、Ollama APIの外部hostへの接続は行わない。
- MCP書き込みはtool inputのproject ID、Scene ID、expected revisionを現在sessionと照合し、純粋なEditor toolで全入力を検証してから一件のhistoryへ確定する。Fog変更とAsset配置はScene Inspector、Asset placementと同じ関数を使う。
- 書き込み中は同じMCP brokerの変更を直列化する。複数のAI clientが同時に操作した場合、短いqueue timeoutを超えたrequestは`EDITOR_BUSY`で終了し、最新contextの再取得と再試行を促す。Editorの準備状態は定期heartbeatで更新し、WebViewの再読み込みやcrash後には自動失効させる。接続数、最初のmessage読込時間、message sizeを制限し、停止したclientが他clientを長時間塞がないようにする。成功結果には変更前後revision、対象Entity / Asset、Command概要、Autosave状態を含める。

### 成功時

- 登録成功後は「登録済み」、clientの再読み込み方法、接続待ちをpanelに残す。登録先の実行fileが現在のapp-data版と異なる場合は「更新」を表示し、明示操作で内容hash付きの最新版へ移行する。Claude Desktop / CoworkではDesktop appの再起動が必要なことを表示する。接続するとclient名、対象project / Scene、最終Activityを表示する。
- Ollama構成中はmodelとclientのselect、再検出、MCP登録を含む他の構成操作を無効にする。成功時はmodel名とclient名を残し、clientの起動または再起動を促す。Ollama未起動、modelなし、`launch`非対応version、tool非対応model、client未検出、構成timeoutでは既存のclient設定とproject documentを追加変更せず、Ollama起動、model追加、更新、client install、再試行のうち該当する復帰先を示す。
- Fog変更はScene settingsを一件更新してScene ViewとScene Inspectorへ同期する。Asset配置は新Entityを作成し、Hierarchy、Scene View、Entity Inspectorで同じEntityを選択する。どちらも通常のUndo / RedoとAutosaveを使う。
- AI変更の結果はトーストだけにせず、対象EntityまたはScene Inspectorへ移動でき、panelから通常のUndoを実行できる。

### 失敗時

- client未検出、登録command失敗、server未起動、Editor未接続、未認可project、Scene不一致、stale revision、Editor busy、Play / Import中、validation失敗ではdocumentとhistoryを変更しない。
- 失敗にはclientの再検出、登録再試行、Editorへ戻る、最新contextの再取得のいずれかを示す。absolute path、接続token、raw command outputを画面へ表示しない。

### 戻り先

- panelを閉じても同じEditor、Scene、両selection、接続状態、直近Activityを維持する。別projectを開いた時は前projectへの書き込み認可を引き継がず、新しいcontextを取得するまで変更を拒否する。
- AI変更の取消は通常のUndoを使い、同じCommand historyからScene、Asset、両selectionを復元する。登録解除はclient設定だけを外し、project documentとEditor historyを変更しない。

## F-18 OpenBrush import / shader rendering の状態設計

### 操作前

- 新規Visual WorldはBlankとOpenBrushの2サンプルを表示する。OpenBrushは48種類のbrushを含むこと、three-icosaを使うこと、Editorに埋め込んだ固定brush resourceを使うことをカードとModel Inspectorで事前に示す。
- 通常のGLB / glTF import入口をそのまま使う。`GOOGLE_tilt_brush_material`、旧Tilt Brush exporter、OpenBrush material名を自動判定し、ユーザーへ別形式の指定を要求しない。
- OpenBrush sourceに含まれるshaderを既定値とし、各brushを編集可能なAsset一覧へ出す時もStandard/PBRへ変換せず、three-icosa presetを参照する専用Materialとして展開する。通常のXRift Materialの割当は明示的なslot上書きとして扱う。

### 操作中

- Import Queueは既存のvalidate、copy、parse、thumbnail、commitを使う。OpenBrush exportに残る古い外部画像URLはimport解析時に取得せず、埋め込みplaceholderへ置換する。外部buffer参照は従来どおりblockする。
- OpenBrushのglTF nodeはsource GLBを複製せず、共有Model Assetと`sourceNodeIndex`を持つEntity hierarchyへ展開する。nodeの親子関係とlocal Transformを保持し、各Mesh Entityにはそのnodeが使用するbrush slotだけを表示する。
- Scene ViewはOpenBrush判定済みModelにだけthree-icosa loader extensionを登録する。通常のGLB / glTF、OBJ、VRMのloaderとMaterial挙動を変更しない。
- Custom Material Preview AdapterはMaterialのshader kind、source Model、source material indexから代表nodeを解決する。OpenBrush adapterは同じthree-icosa loaderを再利用し、Standard sphereへcustom shaderを貼らず、brush固有vertex attributeを持つ実ストロークgeometryで描画する。
- Custom Shader契約はMaterial内の編集可能なShader Asset copyとして、vertex / fragment GLSL、uniform型と設定状態、vertex attribute mappingを分離する。presetのGLSLを直接変更せず、Material copyだけを編集・resetできる。
- vertex GLSLの`in` / `attribute`宣言を解析し、`position`、`normal`、`color`、`uv`、`tangent`へsemantic mappingする。color / UV / tangentは安全な既定値を生成でき、Inspectorから任意のgeometry attribute名へ上書きできる。解決不能な必須attributeはPBR fallback理由として表示する。
- OpenBrush Materialも通常のMaterialと同じMesh Renderer slotへ割り当て可能とし、builtin primitiveでは元GLBに依存せずbrush preset、uniform、textureを独立ロードする。
- editor preview用の公式GLSL / brush textureはprojectへ固定snapshotとして埋め込み、network状態や外部CDN更新に依存せず解決する。安定版templateのresourceを優先し、three-icosa本体にだけ存在する追加resourceを補完する。
- three-icosaが知らないbrush preset、公開resourceがないpreset、GLSL / texture読込失敗は、該当primitiveだけGLTFLoaderが作成したPBR Materialを保持する。他のbrushを含むModel全体のimportを失敗させず、preview badgeとMaterial Inspectorへfallback種別・brush名・失敗理由を示す。
- 公開変換ではcompiler-owned stagingに固定versionのthree-icosaだけをallowlist付きで追加する。authoring projectのpackage manifestや任意pathへpackageを追加しない。

### 成功時

- Model InspectorにOpenBrush / three-icosa、brush数、exporter、renderer versionを残す。各OpenBrush Material Inspectorにはbrush名、GUID、source material indexを表示し、対応Materialを各Mesh Entityのslotへ初期設定する。通常のXRift Materialへ差し替えたslotだけScene Viewと生成結果でPBRへ置換する。
- Material Inspectorのリアルタイムpreviewは実際に適用されたMaterial type、GLSL source、uniform一覧、解決済みbrush textureを表示し、見た目と内部shaderの両方から初期割当を確認できる。
- OpenBrush Starterは検証済みGLBとApache-2.0 licenseをproject-relative pathへコピーし、48 brush MeshをGallery root配下の個別Entityとして展開したPrefabを一つの新規projectとして開く。Prefab Asset Inspectorは同じtreeを表示し、source Entityへ移動できる。
- Prefab source hierarchyを編集して「PrefabをUpdate」すると、既存Prefab IDとsource Entity mappingを保ったままPrefab documentを再生成し、Undo / Redoと通常の保存対象にする。
- compiler outputはGLTFLoaderへthree-icosa extensionと固定brush base URLを登録し、一時stagingのruntime dependency planへ固定package specを記録する。

### 失敗時

- 不正glTF、外部buffer、geometry解析失敗、copy / hash不一致ではAssetManifestとSceneを変更せず、Import Queueまたは新規作成へ戻す。OpenBrush判定だけを理由に不完全なAssetをcommitしない。
- brush libraryのnetwork / CORS / shader load失敗はModel表示のerrorへ閉じ込め、Editor全体、他Entity、保存済みsourceを失わない。再試行と同じModel Inspectorへの復帰を保つ。
- Materialのsource Model、代表node、brush resourceを解決できない場合は固定画像を成功表示せず、Material preview内へ原因と再試行を残す。
- stagingへのthree-icosa installが失敗した場合はcheck / uploadへ進まず、authoring projectを保持したまま公開modalに失敗理由を示す。

### 戻り先

- Import成功後は新Model Assetを選択してOpenBrush情報とslotを確認できる。Sceneへ配置した後は同じEntityを選択し、通常のTransform、Collider、Prefab、Undo / Redoを使う。
- Starter作成後はOpenBrush Modelが見えるScene Viewを開く。Blankへ戻って作り直す場合も、失敗projectを成功一覧へ残さない。

## F-19 VisualからClassicへの書き出しの状態設計

### 操作前

- Visual Editor headerの「Classicへ書き出す」から開始し、現在のVisual projectを閉じない。このexport自体は一方向で自動同期しないこと、Classicから戻す場合はF-23の静的lossy importを別に実行することを最初に示す。
- OSのfolder pickerで同じWorld／Item種別のClassic projectを選び、`package.json`、`xrift.json`、`src/World.tsx`または`src/Item.tsx`、package managerを検査してから書き込みを有効にする。
- 既定は既存entryを保つ「コンポーネントとして追加」とする。「エントリーを切り替える」は既存fileをbackupして置き換える事実への明示確認を必要とする。

### 操作中

- 最新Visual documentsを先に保存し、`classic-runtime` compiler modeでRuntime JSON、Asset copy plan、diagnostics、provenanceを作る。blocking diagnosticがあればClassic側へ書き始めない。
- 生成物は`public/xrift-studio/<project-id>/`、`src/xrift-studio/<project-id>/`、`.xrift-studio/exports/<project-id>/`へ分離する。既存`xrift.json`とthumbnailをVisual metadataで上書きしない。
- npm projectでは固定allow-listのRuntime packageを自動installできる。pnpm／Yarn／Bun projectは別lockfileを作らず、`package.json`へのdependency記録と既存package managerでのinstall案内までにする。

### 成功時

- Runtime JSON、Asset、接続component、provenance、export manifestを残す。entry切替時は元entryのbackup pathをmanifest管理領域へ保存する。
- 完了dialogに「フォルダーを開く」「VS Codeで開く」「ターミナルを開く」を残す。コンポーネント追加ではentryへ貼るimport／JSX snippetをコピーできる。

### 失敗時

- folder検査、Visual保存、compileが失敗した場合はClassic projectを変更しない。対象file不足、kind不一致、blocking diagnosticを同じdialogで修正または選び直せる。
- package install失敗時は生成内容とdependency記録を保持し、公開済みpackageまたは既存package managerで再実行できる事実を示す。成功に見せない。

### 戻り先

- 取消または完了後にdialogを閉じると、同じVisual Editor、Scene、selection、camera、保存状態へ戻る。Classic側の編集結果を自動同期せず、取り込む場合はF-23から検査と診断を伴う別transactionを開始する。

## F-20 XRift Studio本体の更新の状態設計

### 操作前

- 起動後にGitHub Releasesの署名済み更新情報を静かに確認する。最新版なら制作を遮らず、Aboutの「最新版です」へ状態を残す。
- 更新がある時は現在版、最新版、リリースノート、「更新して再起動」「後で」を同じdialogに置く。延期後もライブラリheaderとAboutから再び開ける。

### 操作中

- download中は取得bytesと取得可能な場合の割合、install中は再起動準備を表示する。処理中はdialogを閉じられず、更新と確認の二重実行を無効にする。
- install直前に同じendpointを再確認し、署名検証に成功した成果物だけを適用する。アプリ管理外のproject、Node.js、XRift CLIは変更しない。

### 成功時

- install完了後にアプリを自動再起動する。再起動後のアプリversionが更新対象と一致した時だけ完了通知を表示し、Aboutは新しい現在版と「最新版です」を示す。

### 失敗時

- 自動確認の失敗は制作を遮らない。Aboutに再確認を残す。download、署名検証、installの失敗はdialogに原因と「再試行」を表示し、現在のアプリを継続利用できる。

### 戻り先

- 「後で」または確認失敗では現在の画面を維持する。成功時は再起動したXRift Studioの通常起動画面へ戻り、project一覧とアプリversionを再取得する。

## F-21 外部Asset Storeと環境Texture Assetの状態設計

### 操作前

- Assets headerの「外部から追加」から開始し、左sidebarに登録済みproviderを表示する。providerを選ぶと中央のcatalogと提供元creditを切り替え、選択中providerと対応種別が最初から分かるようにする。Poly HavenではSkybox / HDRI、Material / Texture、Modelをinstall可能にする。Open BrushはPoly Havenの下位filterにせずsidebarの同じ階層へ置き、XRift Studioで検証済みの48 Materialを名前、カテゴリ、tagから選べるようにする。
- 各Assetにはthumbnail、説明、作者、license、配布ページ、解像度、HDR / EXR形式、download容量を表示する。project未保存、Play中、別Asset処理中は理由を示してinstallを無効にする。ローカルの`.hdr` / `.exr`も通常のImport入口から選べることをfile pickerに示す。
- Open Brushの一覧と右詳細は、固定`all_brushes.glb`の各代表stroke nodeをthree-icosaで事前描画した保存済みWebPを共有する。全48件をGUID単位で保存し、Storeを開くだけではCanvasを作らない。右詳細にはbrush GUID、renderer version、catalog revisionと、stroke向けMaterialである互換性説明を置く。解像度、file形式、download容量は表示しない。
- XRift公式Componentは同じprovider sidebarに置き、公開package version、公式source、Component名、categoryを表示する。全配置可能Componentはpackage本体を事前描画したversion付き保存済みWebPを一覧と詳細で共有し、選択中Componentだけを一件のScene historyとして追加する。

### 操作中

- catalogとfile情報はXRift Studio固有のUser-Agentで取得する。install要求に任意URLを含めず、provider ID、Asset ID、解像度からnative側でfile情報を再取得し、許可したHTTPS domainだけをproject管理下へ保存する。
- Materialはbase color、normal、ARMをTexture Assetにし、それらを参照するMaterial Assetを一つ作る。HDRIは選択したHDRまたはEXRだけを取得し、形式とequirectangular用途を保持したTexture Assetにする。ModelはPoly Haven APIのglTF bundleを取得し、glTF 2.x、依存URI、安全な相対path、許可domain、容量を検証してbuffer / imageをdata URIへ埋め込んだ自己完結glTFにする。ローカルImportでもHDR / EXRのシグネチャを検証し、HTML fallbackなど不正な内容はcommitしない。download中はdialogを閉じる操作と二重実行を止める。
- Open Brushは任意URLやGLSLをrequestへ含めず、provider ID、brush GUID、固定catalog revisionをprovider側で照合する。追加中は主操作を「追加中」にし、provider切替、Material切替、dialogを閉じる操作、二重実行を止める。一件のhistory transactionでOpenBrush Material Assetを作り、途中失敗ではAssetManifestを変更しない。
- 環境Textureの保存後はHDR / EXRを一時WebGL rendererでtone mapし、`assets/.derived/thumbnails/`へ一覧用PNGを保存する。thumbnailが未生成、stale、旧renderer版、またはFlip Y変更後ならproject open時に自動再生成し、生成後はcardとInspectorを同じ画像へ更新する。

### 成功時

- installしたMaterial、環境Texture、ModelをAssetsで選択し、provider、作者、license、配布ページをAssetに保持する。Modelは通常のModel Assetと同じ配置導線を使い、外部取得だけを理由にSceneへ自動配置しない。HDRIで「インストール後にSkyboxへ設定」が有効なら、同じhistoryでScene settingsへ参照を設定する。ローカルHDR / EXRのimport成功時も作成したTexture Assetを選択し、同じhistoryでScene settingsへ設定する。
- Open Brushは`External/Open Brush` folderへbrush name、GUID、renderer version、source material index、attributionを持つMaterialを追加する。SceneやMeshへは自動割当せず新Materialを`assetSelection`にする。同じGUIDとrenderer versionが既にあれば複製せず既存Materialを選択する。成功面は「Assetsで開く」と「続けて追加」を残す。
- 環境Texture AssetをScene ViewまたはScene settingsのdrop領域へdragすると、Entityを作らずシーン全体の背景とIBLを既定で有効にする。以後はScene settingsで片方だけを無効にできる。Flip YはTexture Inspector、回転・露出・追加反転はScene settingsから続けて調整できる。

### 失敗時

- catalog取得の失敗では選択中providerと検索条件を保ち、同じsidebarと一覧領域から再試行できる。file情報、download、保存、Asset作成の失敗では既存AssetManifestとSceneを変更しない。同じprovider、Asset、解像度、HDR / EXR形式を保持し、原因を見て再試行できる。
- providerが未対応、file domainが許可外、保存先に異なる内容がある、HDRI、必須base color、glTF本体、またはglTF依存fileがない場合はinstallを完了扱いにしない。
- Open Brushの保存済みthumbnailが欠落または破損している場合はinstall失敗と分け、同じカード内にbrush iconと「Preview unavailable」を即時表示する。「準備中」を継続表示せず、Material追加自体は固定catalogのGUID検証で判定する。GUID不一致、未対応preset、renderer version不一致では追加を完了扱いにせず、同じMaterial選択から再試行できる。

### 戻り先

- dialogを閉じると同じVisual Editor、Scene、選択、cameraへ戻る。成功後は選択済みAssetのInspectorへ到達し、SkyboxはScene ViewへのdragまたはScene settingsから変更できる。
- Open Brush追加後の「Assetsで開く」はdialogを閉じ、選択済みMaterialの実previewとattributionを表示する。取消では追加前のAsset selectionを復元する。
- 将来のprovider追加では共通catalog、download option、attribution、install resultを再利用し、Assets側にprovider固有の保存構造やlicense文言を散在させない。

## F-22 GLB / glTF Animation自動再生の状態設計

### 操作前

- Model Inspectorはソースから検出したAnimation名、長さ、track数と、配置時にAnimationを取り込む設定を表示する。timelineやclip編集がまだ含まれないことと、今回の再生対象が先頭clipであることを区別する。
- Animationを含み`importAnimations`が有効なModelは、Sceneへ配置した時にMesh Rendererと同じEntityへAnimation Componentを一つ追加する。source Nodeは編集用EntityとしてHierarchyへ展開するが、描画用ModelとAnimation mixerは親Entityに一つだけ保ち、clipとSkin bindingを分断しない。
- Edit中はModelを静止させ、InspectorでEnabled、Autoplay、Loopと対象clipを確認できる。

### 操作中

- AutoplayとLoopの変更は一件のScene historyとして確定し、同じEntity selectionとModel Asset参照を維持する。Play中の変更は同じEntityだけを新しいruntime revisionで再実行する。
- Play開始時にEnabledとAutoplayが有効なら先頭clipをリセットして再生する。Loop有効時は繰り返し、無効時は一度再生して最終姿勢で止める。
- Animation mixerは対象Entity内のModelだけを更新し、SceneDocument、AssetManifest、Undo historyへruntime姿勢を書き戻さない。

### 成功時

- Scene ViewのPlayと生成するClassic JSX、Runtime manifest adapterが同じAutoplay / Loop設定で先頭clipを再生する。
- Stop後はmixerとactionを破棄し、Edit中のModel姿勢、Entity Transform、selection、cameraへ戻る。
- 保存と再表示後もAnimation ComponentのEnabled、Autoplay、Loopを復元する。

### 失敗時

- clipが欠落する、Model参照が変わる、loadに失敗する場合はAnimationだけを開始せず、Scene View全体と他Entityを継続表示する。InspectorにAnimationを含むModelが必要であることを示す。
- AnimationのないEntityへAdd Componentを行った場合はSceneDocumentを変更せず、Animationを含むModelを同じEntityへ配置するよう案内する。
- runtimeでclipを解決できない場合は無限retryを行わず、Modelのlast-good表示とEditへの復帰を維持する。

### 戻り先

- Component設定後も同じEntity Inspectorへ留まり、PlayからStopすると同じAnimation設定と選択へ戻る。
- Model Assetを選ぶと検出済みclip一覧と取り込み設定を確認でき、Entityへ戻ると再生設定を続けられる。

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
- Material / graph変更の取消は通常のUndoを使い、MCP変更も同じhistoryとAutosaveから復元する。

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

## F-26 アプリデータのリセットの状態設計

参照: MI-03, MI-04, MI-05, MI-09, MI-66

### 操作前

- AboutのDanger Zoneで、ランタイムのみはprojectを残し、完全リセットはprojectを含むことを確認できる。
- `@xrift/cli`のversion確認中は、実行中のNode.jsと削除が競合しないようリセットを開始できない。

### 操作中

- 確認dialogの主操作を「実行中」に変えて無効化し、背景click、Escape、閉じる操作を無効にする。
- 通常pathを削除できない場合は同じアプリデータ領域の退避名へ移し、新しい起動が旧データを参照しない状態を先に確定する。

### 成功時

- 成功通知後にアプリを再読み込みし、ランタイムのみならsetup、完全リセットならsetup後の空のproject一覧へ進む。
- 退避した旧データは次回起動時にバックグラウンドで再回収し、新しい制作操作を妨げない。

### 失敗時

- 退避にも失敗した対象とOS errorを確認dialog内に残し、実行中のterminalやeditorを閉じる案内を示す。
- dialogを閉じず同じ主操作から再試行でき、取消ではAboutへ戻る。

### 戻り先

- 成功時は再読み込み後のsetupまたはproject一覧、失敗・取消時はAboutのDanger Zoneへ戻る。

## 実装制約

- 動きは `opacity` と `transform` を中心にし、レイアウトを押し広げたり、操作対象を移動させたりしない。
- ブランド色、影、動きは主操作、状態変化、注目すべき結果を示すときだけに使う。
- テキスト、アイコン、色、動きのうち二つ以上で状態を伝える。アイコンや色だけに意味を預けない。
- `prefers-reduced-motion` を尊重する。新しいアニメーションを追加するときは、動きを減らしても状態が分かる表示を用意する。
- 操作の開始・処理中・成功・失敗・復帰先を揃える。待機中に主操作を再実行できるように見せない。
- Markdown、UI 文言、コミットメッセージには絵文字を使わない。

## 変更手順

1. 機能の目的と到達点を `F-xx` として書く。
2. 操作前、処理中、成功、失敗、復帰先を列挙する。
3. 各状態に対応する `MI-xx` を選び、足りなければこの文書へ項目を追加する。
4. 実装では、状態・文言・無効化・URL または成果物への導線を同時に作る。
5. 実機確認が必要な変更は、実行前にユーザーへ確認方法と副作用を伝え、許可を得てから確認する。
# KHR_interactivity editing

- Reusable behavior is saved as an `InteractivityAsset` containing canonical
  `KHR_interactivity` JSON, not React Flow state or XRift-only event names.
- Opening the Asset uses a docked modal that keeps Scene View visible.
- UI edits, JSON import, and MCP edits share one validator and project history.
- The initial sample is `event/onStart → animation/start`; glTF animation must
  be started by graph behavior instead of unconditional viewer autoplay.
- MCP clients can create the Asset, add nodes, connect flow/value sockets, set
  inline values, read canonical JSON, and validate against the same boundary.
