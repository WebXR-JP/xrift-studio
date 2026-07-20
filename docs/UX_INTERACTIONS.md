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
| MI-11 | user Asset を Scene View / Hierarchy へ drag する、「配置」を実行する、Hierarchy / Scene の右クリックから primitive を作る、または外部ファイルを drop する | drag 中に対象と結果を表示する。Model / Prefab / Particle は Scene View では配置位置、Hierarchy では Scene Root または親 Entity を明示して Entity 配置する。Material は hover 中 Mesh slot への binding、Texture は Material Inspector slot への参照になる。右クリック Create は click point / 選択親を示す。外部 file は Import Queue の全 stage を通す。 | Escape または領域外 drop は変更せず終了する。drag と「配置」は同じ Asset placement を使い、Place / Create / Assign Material の Undo は一つの履歴で document と前の `sceneSelection` / `assetSelection` を復元する。import 失敗では SceneDocument と AssetManifest を変えない。 |
| MI-12 | 移動、回転、拡大縮小ツールを切り替える、またはギズモを操作する | 選択ツールを押下状態と名称で示す。操作中は Scene View と Inspector の数値を同期し、カメラ操作との競合を止める。pointer down から pointer up までを一つの Command Transaction とする。 | pointer up で一件の履歴として確定する。Escape または不正値では操作前へ戻し、履歴を追加しない。Entity の選択は保つ。 |
| MI-13 | ビジュアル project を開く、保存する、または authoring document を変更する | ヘッダーに成果物種別、「ビジュアル」、保存 / stale compile / upload / 審査状態を表示し、classic code project とは正本と機能が異なることを示す。 | commit marker が指す Scene / Prefab / Asset / folder を含む全 document set の保存成功後だけ対象 revision の「未保存」を解除する。未保存で戻る時は保存、破棄、取消を選べる。 |
| MI-14 | Edit で「Play」を実行する、または Play で「Stop」を実行する | project kind に応じて World Play Profile または Item Preview Profile を同じ Scene View に開く。Play 中は authoring をロックし、「Stop」を常に見える主操作にする。World の input / controller / physics を Item へ適用しない。Vite、CLI、port、別 browser を操作として見せない。 | PlaySession の state だけを変える。Stop で input、controller、camera、physics などを dispose し、Play 前の documents、両 selection、Inspector context、Edit camera へ戻る。初期化失敗時は Edit のまま原因と再試行を示す。 |
| MI-15 | Assets で Asset を一回クリックする、または Entity Inspector の Asset reference を開く | Assets の選択背景と右 Inspector の Asset context を同じ `assetSelection` へ更新する。`sceneSelection` は維持し、Inspector header の Entity / Asset tab から双方へ戻れる。Entity は追加せず、Undo 履歴も増やさない。 | 別 Asset / Entity の選択または Inspector context 切替で終わる。Material は参照 Entity 数と「共有中」、Texture / Model は source と derived status を表示する。 |
| MI-16 | 右 Inspector で Material / Texture Asset を変更する | Material は glTF core PBR、TextureInfo、emissive、normal、occlusion、alpha / double-sided、typed extension、Texture は source、色空間、resize、mipmap / sampler、compression、derived / diagnostics を section 分けする。同じ Material ID を参照する全 Entity と動的 thumbnail へ同期し、shadow は Entity の Mesh section に残す。 | 有効値の確定を `UpdateAssetCommand` 一件にし、AssetManifest を未保存にする。SceneDocument や Entity 固有値へ複製しない。不正値は確定せず field 近くに形式、範囲、色空間、slot の意味を示す。Play 中は読み取り専用にする。 |
| MI-17 | visual project で compile、check、upload を開始し、必要な toolchain がない | authoring 画面を閉じず、Node.js、XRift CLI、認証のうち不足している項目とセットアップ操作を表示する。通常の Edit / 保存は利用可能なままにする。 | セットアップ後は同じ操作へ戻れる。取消時は Edit へ戻り、SceneDocument、AssetManifest、staging output、公開先を変更しない。 |
| MI-18 | 新規作成を開く | item classic、world classic、item visual、world visual の四カードを同じ階層で表示し、成果物、制作方法、正本、作成後の画面を一文で示す。hover だけに説明を隠さない。 | 一カードの選択で名前 / 保存先確認へ進む。戻ると四カードへ戻り、前の選択を保持する。取消では project を作らない。 |
| MI-19 | Assets の「作成 > Material」を選ぶ | 名前、標準サーフェスまたは glTF 既定値 preset、作成先 folder を compact dialog で示す。作成中も右 Entity Inspector を保つ。 | 成功時は Material Asset を一件追加して `assetSelection` にし、Entity へ binding しない。取消 / validation 失敗では AssetManifest、両 selection、history を変えない。 |
| MI-20 | GLB / GLTF / Texture を drop または import する | Import Queue に validate、copy、parse / decode、derive、dynamic thumbnail、commit の stage、件数、bytes、取消を表示する。source 保持、resize / mipmap / compression recipe、stale 状態を右 Inspector で確認できる。 | 全検証後だけ AssetManifest へ commit する。成功時は新 Asset を `assetSelection` にし、右 Inspector で開く。明示的な Scene drop 以外は Scene を変えない。失敗 / 取消時は temporary を回収し、last-good と両 selection を維持する。 |
| MI-21 | thumbnail を生成、再生成、または stale 判定する | card は pending / generating / ready / stale / failed を label と status icon で示す。Model / Texture / Material は ready な generated thumbnail を優先し、それ以外だけ kind icon を fallback にする。 | 成功時は同じ Asset ID の thumbnail hash を更新する。失敗時も card と Asset を残し、再生成と診断を置く。last-good が stale なら「古いプレビュー」と明示する。 |
| MI-22 | toolbar、menu、context menu、keyboard から Command を起動する | central Shortcut Registry の label、semantic Lucide icon、platform binding、enabled reason を全 surface で一致させる。active tool は icon、label、押下状態で示す。conflict は両 command を実行せず設定へ案内する。 | Command 成功 / 失敗へ収束する。text input、contenteditable、数値入力、IME composition 中は editor shortcut を抑止し、ユーザー override と既定へ戻す操作を Editor Preferences に保存する。 |
| MI-23 | Copy / Paste / Duplicate / Delete を実行する | Copy は versioned buffer の対象数、Paste / Duplicate は生成予定数、Asset Delete は参照元件数を示す。document 変更を伴う操作だけを Command history に積む。 | Paste / Duplicate / Delete の Undo / Redo は同じ IDs と前後の `sceneSelection` / `assetSelection` を復元する。Copy 自体は document Undo にしない。参照を壊す Delete は置換、解除、取消なしに進めない。 |
| MI-24 | Hierarchy の Entity subtree を Assets / folder へ drop して Prefab にする | drop target、Prefab 名、Entity / Asset dependency 件数、既存 Prefab / cycle conflict を表示する。成功前は Scene、Asset、folder のどれも変更しない。 | 成功時は Prefab Asset / document と instance metadata を一 transaction で作り、`sceneSelection` は instance root、`assetSelection` は Prefab にする。Undo / 失敗 / 取消では全 document と両 selection を元へ戻す。 |
| MI-25 | Save または Ctrl/Cmd+S を実行する | validating、temporary write、commit の短い stage と対象 revision を header に表示する。Save 中の追加編集は未保存のまま残す。 | commit marker と全 hash 一致後だけ対象 revision を保存済みにする。失敗時は last committed set を維持して dirty のままにし、再試行、別名保存、診断を置く。crash recovery 後は復旧 revision を通知する。 |
| MI-26 | Play、generated preview、compile または check を実行する | Editor direct Play、generated staging preview、check/build を別 label にし、input fingerprint、target、stale、progress を示す。diagnostic は provenance から元 Entity / Asset / field へ link する。 | fresh hash の結果だけ成功にする。Stop / cancel は process と resource を cleanup して Edit へ戻る。公式に未記載の CLI / hosted / XFT preview を存在するように表示しない。 |
| MI-27 | Upload modal を開き、review から remote result まで進める | review、auth-check、saving、compiling、checking、uploading、processing、succeeded、failed を一つの modal 内で段階表示し、title、description、thumbnail、diagnostic、progress、cancel / retry を現在 state に合わせる。 | 閉じると Edit に戻り、結果 ID は保持する。remote commit 後を取消済みと断定しない。成功時は正式 result の ID / version / hash、正式に返る時だけ URL を示す。test / 通常検証では実 upload をしない。 |
| MI-28 | Asset folder または Asset の context menu を開く | folder では作成 / import / 新規 folder、Asset では rename / duplicate / delete / references / reimport / thumbnail regeneration を kind と state に応じて表示する。shortcut と icon は Registry と一致させる。 | 一つの操作選択または Escape / 外側 click で閉じる。実行不可項目は理由を tooltip で示し、menu を開いただけでは document や selection を変えない。 |
| MI-29 | panel splitter を動かす、panel header を dock zone へ drag する、または layout を reset する | drag 中は resize cursor、minimum size、dock preview、最終 order を表示する。Scene / Asset data と authoring history は変更しない。 | drop で normalized size / zone / order を Editor Preferences に保存する。Escape / 領域外 drop は開始前 layout、reset は既定 layout へ戻る。保存失敗時も session layout を保ち、再試行を示す。 |
| MI-30 | Edit 中に Hierarchy の Entity subtree を別 Entity または Scene Root へ drag する | 移動元を選択し、Entity 上では「子へ移動」、Root 領域では「Scene Root へ移動」を対象名付きで表示する。自分自身、子孫、現在と同じ親はエラー色の境界と理由で実行不可を示す。 | 有効な drop は Entity ID と subtree を維持した Reparent Command 一件として確定し、選択を維持する。Escape、領域外 drop、実行不可 target、Play 中は SceneDocument と history を変更しない。Undo / Redo は親子 link と順序を復元する。 |
| MI-31 | Assets の XRift Prefabs から built-in recipe を Scene View へ drag する、または「配置」を実行する | Spawn Point、Mirror などを通常の project Asset と分けた読み取り専用 catalog として表示し、project kind で利用可能項目を絞る。Scene View は recipe 名と配置位置を表示する。 | drop 後は通常の Entity を一件作り選択する。Entity Transform は編集できるが、recipe を定義する XRift Component は読み取り専用表示にし、通常 Asset の rename / delete / folder move 対象にしない。Entity 自体の Delete と Undo / Redo は利用できる。 |
| MI-32 | Visual Editor の render で例外が発生する | App 全体を白画面にせず、明るい既存配色の復帰面へ切り替え、落ちた機能名と制作データを保持している事実を示す。例外本文、stack、component stack、token、絶対 path は画面へ表示しない。 | 「Editorを再試行」は Boundary と Editor subtree を remount する。「プロジェクトライブラリへ戻る」または前画面へ戻る操作は既存 `onBack` を実行し、Editor 外の App 状態を維持する。 |
| MI-33 | Particle Asset を作成・編集する、Scene / Hierarchy へ配置する、または Entity に Particle Emitter を追加する | Assets、右 Inspector、Scene View、Hierarchy のすべてで同じ Particle Asset ID を扱う。Particle の変更は Scene View の表現へ即時反映し、Asset を drop した時は Transform と Particle Emitter を持つ Entity を作る。Particle Asset がない状態で Particle Emitter を追加した時は既定 Asset を同じ操作内で作成する。 | 作成・配置・Component 追加・参照変更・削除はそれぞれ一つの履歴へ確定する。取消または失敗時は AssetManifest、SceneDocument、両 selection を開始前へ戻す。Play 中は編集操作を無効にする。 |
| MI-34 | toolbar の Create、または Hierarchy の右クリックから Entity / Component を作成する | Create は Empty Entity、Primitive、XRift Component、通常 Component の責務別入口を示す。選択 Entity がある時は追加先を名前で示し、選択がない時も単独で成立する XRift Component は Transform 付き Entity として作成できる。wrapper は追加先 Entity がない限り無効にし、理由を表示する。 | 作成または追加は一件の history transaction とし、作成 Entity を `sceneSelection` にして Inspector を開く。Escape / 外側 click は document を変えず閉じる。Play / Import 中は無効にし、必須値が未設定なら Inspector から設定して compile blocker を解消できる。 |
| MI-35 | Visual World の新規作成で Starter Scene を選ぶ | 既定は実用的な World Starter とし、配置済み Scene と Assets へ追加される Model / Texture の数をカード上に示す。Blank は明示的な最小構成として残し、素材入り template と混同しない。 | 作成成功時は bundled source を project-relative path へ検証付きでコピーし、Scene / Asset / Material / Collider / XRift Spawn の参照を一度に確定して Editor で開く。copy / hash / document 保存の一部が失敗した場合は不完全な project を成功表示せず、新規作成へ戻れる。 |

## 機能一覧

| 機能 ID | 機能 | 参照するインタラクション | 完了条件 |
| --- | --- | --- | --- |
| F-01 | CLI 更新 | MI-03, MI-04, MI-05 | 現在と最新の差分を見て更新または延期でき、更新後の状態が再取得される。 |
| F-02 | プロジェクトライブラリ | MI-01, MI-02, MI-06, MI-09 | 項目を成果物種別と classic / visual project type で見分けられ、新規作成と再開の入口が常に見つかる。壊れた visual manifest を classic と推測して開かない。 |
| F-03 | プロジェクト作成 | MI-03, MI-04, MI-05, MI-06, MI-13, MI-18, MI-35 | 四カードから item / world と classic / visual の組を一度に選べる。クラシックは code project、ビジュアルは専用 document project として開き、自動相互変換がないことを事前に理解できる。Visual World は配置済み Scene と再利用可能な素材を持つ Starter を既定にできる。 |
| F-04 | ローカル実行 | MI-03, MI-05, MI-08 | 実行中であることと、プレビュー URL を開く操作が分かる。 |
| F-05 | 公開準備とアップロード | MI-03, MI-04, MI-05, MI-07, MI-08, MI-09, MI-17, MI-27 | 初期値の upload を防ぎ、toolchain が不足しても authoring を失わず、review から upload result / 審査状態まで続けられる。正式 result にない公開 URL は推測しない。 |
| F-06 | アイテム検査 | MI-03, MI-05, MI-09 | ビルドを含むセキュリティチェックを実行でき、成功時は公開、失敗時はログと編集へ進める。 |
| F-07 | ビジュアルエディター | MI-01, MI-09, MI-10, MI-11, MI-12, MI-13, MI-14, MI-15, MI-16, MI-18, MI-21, MI-22, MI-29, MI-30, MI-31, MI-32, MI-33, MI-34, MI-35 | 四カードの入口、Hierarchy、Scene View、右 Inspector、下 Assets を使い、独立 selection、Empty / primitive / XRift Component 作成、Asset / Material / Particle / XRift Prefab D&D、Hierarchy Reparent、Transform、Material / Texture / Particle 編集、動的 thumbnail、Play を扱える。panel layout は resize / dock 後も復元され、Editor render failure は App 全体へ伝播させず再試行または一覧へ復帰できる。 |
| F-08 | Visual Asset authoring / import | MI-11, MI-15, MI-16, MI-19, MI-20, MI-21, MI-28, MI-33 | Material / Texture / Model / GLTF / Prefab / Particle を folder と動的 thumbnail 付きで管理し、source を壊さず import、右 Inspector で recipe 編集、reimport、stale 診断を行える。Asset 編集中も `sceneSelection` は保持される。 |
| F-09 | Command / Shortcut / Prefab | MI-12, MI-22, MI-23, MI-24, MI-28, MI-30, MI-31, MI-34 | toolbar、menu、keyboard、Hierarchy D&D が同じ Command / Shortcut Registry を使い、Copy / Paste / Duplicate / Delete / Reparent、Empty / Component 作成、Hierarchy からの Prefab 化、XRift built-in Prefab配置、Undo / Redo が IDs と両 selection を復元する。 |
| F-10 | Visual Save / Compile / Preview / Upload | MI-03, MI-05, MI-07, MI-08, MI-09, MI-17, MI-25, MI-26, MI-27 | journal 付き保存、決定的 compiler / provenance、freshness 検査、区別された preview、既存 XRift check / upload を一つの editor flow で扱い、失敗や取消後も last committed authoring と戻り先を保つ。 |

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
- Hierarchy / Scene の右クリック Create は selected parent / click point を menu header に示し、primitive 選択前には Entity を増やさない。
- Material drag 中は Scene Mesh または Entity Inspector slot だけを drop target とし、slot が複数なら chooser を表示する。Texture drag は右 Material Inspector の compatible slot だけを target にする。
- Asset のドラッグ中は Scene View だけを配置可能領域として示し、drop 前には Entity を増やさない。
- ギズモ操作中はカメラ操作を競合させず、Scene View と Inspector の Transform 値を同期する。
- panel resize / dock 中は drop preview と minimum size を示し、authoring Command や selection を変更しない。
- Material Asset の color、metalness、roughness、texture 参照は Edit 中だけ変更でき、同じ Asset ID を参照する全 Entity の preview と同期する。Entity 固有 Material 値へ複製しない。
- 外部 GLB / GLTF の drop は Import Queue で validate、source copy、derive、dynamic thumbnail、manifest commit まで処理する。Assets への drop は Scene 配置へ進めず、Scene への明示 drop だけが import 成功後の配置を同じ transaction intent で続ける。
- Play 準備中は二重開始を防ぎ、成功するまで authoring document を変更しない。Play 開始後は SceneDocument と AssetManifest をロックし、Hierarchy、Inspector、ギズモ、Asset drop を編集操作として見せない。
- World Preview は有効な input と controller 操作方法を示し、Item Preview には World 用 avatar / controller を出さない。
- Play 中の input、controller、camera、physics などは PlaySession にだけ保持する。
- Play 中は Stop を常に見える位置に置き、別画面や別ブラウザへ移動させない。
- ヘッダーの「ビジュアル」、未保存、compile freshness、upload / 審査状態は操作中も消さない。

### 成功時

- Asset の配置成功では Asset ID を参照する Entity を一つだけ追加し、Hierarchy、Scene View、Entity Inspector で同じ Entity を選択する。Undo では Entity と selection を配置前へ戻す。
- primitive 作成成功では `CreatePrimitiveCommand` 一件で Entity と builtin geometry reference を追加し、Material drop 成功では `AssignMaterialCommand` 一件で既存 Mesh slot だけを更新する。
- Transform 操作成功では pointer down から pointer up までを一件として確定し、選択とカメラを維持する。
- layout 操作成功では normalized size、dock zone、order を Editor Preferences に保存し、再起動後も復元する。
- Material 操作成功では有効値が AssetManifest の一つの Material Asset に残り、共有する全 Entity の表示を更新する。SceneDocument と Entity 固有値は変更しない。
- Play 開始成功では同じ Scene View で project kind に対応する profile を確認でき、runtime の変化は PlaySession にだけ残る。
- Stop 成功では PlaySession を破棄し、Play 前と同じ SceneDocument、AssetManifest、selection、Edit camera へ戻る。runtime の位置や状態を保存済みまたは未保存の authoring 変更として扱わない。
- GLB / GLTF の import 成功は source / derived / thumbnail / manifest commit の完了と新 Asset card を表示する。Scene 配置は Scene drop または後続の「配置」が成功した時だけ別結果として示す。
- 同期操作の結果はトーストだけにせず、追加 Entity、右 Inspector、参照 Entity の表示、Import Queue の項目として画面へ残す。

### 失敗時

- 非対応ファイルは拡張子と対応形式を示し、SceneDocument、AssetManifest、selection、history を変更しない。
- Transform に有限でない値や不正な scale が入った場合は操作前へ戻し、対象項目の近くに修正方法を示す。
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
- 作成または保存 transaction が commit した project だけを一覧へ追加する。
- 永続化を接続した後は、Scene / Prefab / Asset / folder を含む save set のいずれかが未保存なら保存、破棄、戻るの取り消しを選べる確認へ置き換える。

## F-08 Visual Asset authoring / import の状態設計

### 操作前

- Assets は Model / GLTF、Texture、Material、Prefab、Particle と folder を表示し、primitive は別の Create palette に置く。Material / Model / Texture は ready な generated thumbnail、未生成時だけ kind icon を使う。
- `sceneSelection` と `assetSelection` が独立し、右 Inspector がどちらの context を表示しているかを選択背景、header、pinned tab で示す。
- Import 前に対応形式、source 保持、既定 max resolution / quality / mipmap / compression、resource budget、external URI が local dependency に限られることを確認できる。

### 操作中

- Material 作成は dialog 内の validation、Texture / Model import は Import Queue の validate、copy、decode、derive、thumbnail、commit を表示し、cancel を処理中 stage に合わせる。
- Particle は Assets の作成操作から追加し、右 Inspector で emission、shape、velocity、lifetime、size、color、texture、blend を編集する。Particle Asset は Scene View または Hierarchy へ drag して Particle Emitter Entity として配置できる。
- 右 Inspector の Asset context は source と derived、slot の色空間、recipe、stale / diagnostic を分ける。Entity context の Mesh shadow や選択 Entity を Asset field で上書きしない。
- context menu は現在 kind / state で実行できる項目だけを有効にし、menu open だけでは selection や document を変えない。

### 成功時

- Import / Material 作成は AssetManifest と folder membership を一度だけ確定し、新 Asset を `assetSelection` にする。`sceneSelection` と SceneDocument は維持する。
- Particle Asset の作成は新 Asset を `assetSelection` にし、Entity への配置または Particle Emitter の追加は参照する Asset ID を SceneDocument に保持する。
- thumbnail / derived は source / recipe / processor / target hash と一致した時だけ ready にし、同じ source を再 import しても Asset ID と参照を保つ。
- Material の変更は共有 Asset に一度だけ保存され、同じ ID を参照する全 preview に反映する。

### 失敗時

- extension、URI、budget、decode、Material field、slot binding の失敗は Asset / field / source URI を project-relative に示し、reimport、設定変更、参照置換のいずれかへ案内する。
- temporary data を回収し、Scene / Asset / folder documents、両 selection、history、source、last-good derived を開始前のままにする。同じ設定の自動 retry loop は行わない。

### 戻り先

- Import Queue を閉じても Assets と右 Inspector に last result / diagnostic を残す。cancel は直前の `assetSelection`、Inspector context、Scene View へ戻る。
- Play 中は Asset authoring を読み取り専用にし、Stop 後に Play 前の selections と未保存状態へ戻る。

## F-09 Command / Shortcut / Prefab の状態設計

### 操作前

- toolbar、context menu、tooltip、Shortcut 設定は同じ command label、semantic Lucide icon、platform binding、enabled reason を中央 Registry から表示する。
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

- Save は対象 revision、compile / preview は target と input freshness、Upload は title、description、thumbnail、auth、diagnostic、既存 remote ID を開始前に示す。
- Editor direct preview、generated staging preview、XRift upload / 審査を同じ「Preview」と呼ばない。公式資料にない hosted / CLI / XFT preview は選択肢に出さない。

### 操作中

- Save は validate、temporary write、commit、compile は asset prepare、generate、hash / provenance、Upload modal は auth-check、saving、compiling、checking、uploading、processing を表示する。
- cancel button は安全に止められる stage だけ有効にする。remote upload 開始後は best effort であることを示し、結果不明のまま新規 upload を再開しない。

### 成功時

- Save は commit marker と全 hash 一致後だけ対象 revision を保存済みにする。compile / check は fresh input fingerprint の result と provenance link を残す。
- Upload は正式 result の worldId / itemId、versionId、versionNumber、contentHash と審査状態を表示する。正式 URL field がある時だけ URL を表示する。

### 失敗時

- Save failure は last committed document set、compile failure は last-good staging、Upload failure は remote commit の有無を保ち、stage、sanitized cause、再試行先を示す。
- stale input、REJECT、未編集 metadata、auth failure を成功扱いにせず、元 Entity / Asset / field または review へ戻す。token、absolute path、raw stderr を表示しない。

### 戻り先

- modal / preview を閉じると同じ visual project の Edit、Play 前の camera、`sceneSelection`、`assetSelection`、dirty state へ戻る。
- automated test と通常の UI 検証は fake backend / fixture で upload state を再現し、実 XRift upload を行わない。

## F-11 Collider authoring / export の状態設計

### 操作前

- 新規 import した Model は `generateColliders` を既定で有効にし、Sceneへ初回配置した時に同じ Entityへ固定 `Mesh Collider` を追加する。既存 Asset で明示的に無効化された設定は移行で上書きしない。
- built-in primitive は `Box Collider` を同時作成する。Floor / Plane は薄い local bounds、その他は primitive bounds を初期 Half Extents とし、Entity Scale は値へ焼き込まずTransformで追従させる。

### 操作中

- Inspector は Box の Center、Half Extents、自動フィット、Mesh の Trimesh / Convex Hull、共通の Enabled、Trigger、Friction、Restitutionを同じ Component cardで編集する。
- Boxの再フィットは同じ Entity の Mesh boundsだけを使用する。Modelはimport metadataのboundsとimport scaleを用い、absolute pathや生のglTFデータをScene documentへ保存しない。

### 成功時

- Box / Mesh Colliderの変更、追加、削除は一つのScene history transactionになり、選択を維持する。選択中のBox ColliderはScene Viewにwireframeで表示する。
- compilerは一EntityのColliderを一つの固定Rapier `RigidBody`へまとめる。BoxはHalf Extentsを`CuboidCollider.args`へそのまま渡し、MeshはTrimeshを`trimesh`、Convexを`hull`へ変換する。

### 失敗時

- MeshのないEntityへMesh Colliderを追加せず、必要なMesh Rendererを示す。自動フィットboundsがない時は既存値とSceneを変更しない。
- 非有限Center、0以下のHalf Extents、負のFriction、`0..1`外のRestitutionは確定せず、upload前validationでもblocking diagnosticにする。

### 戻り先

- Collider削除後もMesh、Material、Transform、Entity selectionを維持する。Undoで同じComponent IDと設定を復元する。

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
