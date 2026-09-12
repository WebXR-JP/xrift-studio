# 保存・公開・書き出しの操作・状態設計

[機能一覧へ戻る](../UX_INTERACTIONS.md) / [共通の動き](./interactions.md)

<a id="f-45"></a>

## F-45 iPad編集とブラウザプロジェクトの受け渡し

参照: MI-03, MI-04, MI-05, MI-09, MI-10

- 操作前: PCのシーン・Hierarchy・Assets・Inspectorを共通化し、タブレットではパネルを切り替える。画面幅に合わせてシーンの横または下へ表示する。パネルの選択・視点だけ操作・複数選択はその場で切り替え、documentやPCのパネル幅を変更しない。iPadをスマートフォン向けの狭幅確認ゲートから除外する。
- 保存: 同じdocument codecを使い、ブラウザのプロジェクトと素材をIndexedDBへ保存する。「ブラウザに保存済み」をZIPの保存完了と混同させない。直近のプロジェクトを復元し、「開く」で保存済み一覧・新規作成・ZIP取り込みを選べる。別プロジェクトを開く前に現在の保存を待つ。
- 処理中: 書き出し前にGraphの編集中の値と保存待ちを確定する。実行中・素材処理中の転送を防ぐ。ZIP準備中はダイアログを閉じられない。取り込みはパス・容量・documentを検証してから別のプロジェクトへ原子的に保存し、成功するまで現在の編集を置き換えない。
- 成功: ZIPを準備した後、ファイル名・容量・「ファイルに保存」・利用可能なら「共有する」を同じ面へ残す。非同期の準備完了を自動クリックによるダウンロードにせず、Safariで改めてユーザーが押せるリンクにする。Blob URLは閉じた直後に破棄しない。保存先はブラウザで確認するよう案内し、ダウンロードを保存済みと断定しない。
- 引き継ぎ: 既存のZIP形式（xrift-studio.project.json、全シーン、Assets、Prefab、素材ファイルとpackage manifest）を維持する。Mac/Windows版の「ZIPから取り込む」へ案内する。公開記録を引き継がず、新しい未公開の作品として開く。iPadの「公開」はこの受け渡しへ通し、トークン入力を表示しない。
- 失敗と復帰: 保存やZIP準備の失敗は編集内容を保持し、原因と再試行を残す。ZIPの取り込み失敗は別のファイルを選び直せる。保存済みプロジェクトの読込失敗では、プロジェクト選択や新規作成にも戻れる。ZIPのダイアログを閉じると同じ編集に戻る。
- 容量: ブラウザの転送はZIP・展開後のデータを256 MB以下、inventoryを含め20,000ファイル以下に制限する。大きな素材の圧縮で二重の作業用メモリーを増やさないよう、書き出すZIPはSTORE方式を使う。取り込むZIPは既存のDeflateにも対応する。

検証範囲: TypeScriptの静的検査と、Node上のZIP往復・複数シーン・Prefab・素材バイト列・不正パス・欠落ファイル・容量制限の確認を対象にする。今回の実装ではブラウザ・iPad実機・ネイティブアプリの動作確認を行っていない。

<a id="f-05"></a>

## F-05 公開準備とアップロードの状態設計

参照: MI-03, MI-04, MI-05, MI-07, MI-08, MI-09, MI-17, MI-27

### 操作前

- 「アップロード」はログインしていない間は実行できない状態にする。tooltipでログインが必要なことを示す。押せるのに必ず失敗する操作を出さない。
- 押すとまず公開情報を確認する。確認中はラベルを「公開情報を確認中…」に変える。
- タイトル、説明、サムネイルがテンプレートのままなら「公開前の確認」を開く。このまま公開すると初期ワールド（アイテム）のように表示される可能性があることを書く。主操作は情報の編集またはサムネイルの設定にする。
- ビジュアル編集のプロジェクトでは、公開情報、サムネイル、XRiftアカウント、公開先、公開データ、公開チェック、ロード容量・VRAMの目安を確認項目として並べる。それぞれの状態を一行で示す（[F-27](#f-27-公開前パフォーマンス概算と素材最適化の状態設計)）。

### 処理中

- ビジュアルの公開画面は検査の完了を待たずに開く。「公開データを確認中…」を表示し、最新の編集内容の検査が終わるまで公開ボタンを無効にする。検査中も公開情報の編集と「戻る」を使える。編集し直した場合は古い検査結果を採用せず、閉じた場合は検査を終了する。検査を開始できなかった場合は、閉じて開き直す案内を表示する。
- ビジュアルは保存、変換、検査、送信の順に進む。現在どの段階かと、取り消せるかどうかを表示する。
- 送信前の段階では取り消してもリモートを変更しない。送信開始後の取り消しはbest effortであることを明記する。

### 成功時

- 送信後はworldId / itemId、versionId、versionNumber、content hashを表示する。審査中を公開済みとして表示しない。
- 公式の結果がURLを返した場合だけ、そのページを開く導線を出す。IDからURLを推測して作らない。
- 公開済みのプロジェクトでは、以降エディターのheaderから公開先を開ける。

### 失敗時

- 失敗した段階、要約したエラー、リモートを変更したかどうかを示す。その段階から再試行できるようにする。
- 検査で止まった場合は、修正に必要なログを同じ画面で読める状態にする。
- 結果が不明な送信の再試行では、既知の公開先IDと入力のhashを照合する。新しい公開先を重複して作らない。

### 戻り先

- 編集を促された場合は対象の編集画面（`xrift.json` またはサムネイル）へ移動する。保存後に同じ確認へ戻る。閉じた場合はエディターへ戻る。制作データとリモートは変わらない。

完了条件: 初期値の upload を防ぐ。toolchain が不足しても authoring を失わない。review から upload result / 審査状態まで続けられる。正式 result にない公開 URL は推測しない。

<a id="f-10"></a>

## F-10 ビジュアル編集保存 / Compile / プレビュー / Upload の状態設計

参照: MI-03, MI-04, MI-05

同名のglTFマテリアルは、公開データの生成時に元モデル内のマテリアル番号で自動的に区別する。既存プロジェクトも同じ処理を通すため、名前の変更や再取り込みは不要。ノードごとの割り当てと各マテリアルの見た目を保つ。処理は通常の公開前検査に含め、成功後はそのまま公開へ進める。元の番号がない古いデータは名前で照合し、一意に決められない割り当てを勝手に統合しない。この処理は画面・MCP・コード書き出しで共通のcompilerを使うため、追加の修正操作は設けない。

### 操作前

- authoring操作前は直前revisionを自動保存済みとして示す。compile / previewはtargetとinput freshnessを示す。Uploadはtitle、description、thumbnail、auth、diagnostic、既存remote IDを開始前に示す。
- Editor direct preview、generated staging preview、XRift upload / 審査を同じ「プレビュー」と呼ばない。公式資料にない hosted / CLI / XFT preview は選択肢に出さない。

### 操作中

- authoring操作の確定後は250msの待機を挟む。最新revisionをvalidate、temporary write、commitへ進める。保存中に次の変更が確定した場合は並列writeしない。現在の保存完了後に最新revisionを続けて保存する。compileはasset prepare、generate、hash / 生成元の記録、必須の`public/thumbnail.png`のstaging copyとSHA-256一致確認へ進む。Upload modalはauth-check、saving、compiling、checking、uploading、processingを表示する。Upload reviewでは現行シーンの実描画を撮影するか画像を選択する。同じ場所から`public/thumbnail.png`を更新できる。
- まだ書き込みを始めていない古いrevisionは保存待ちから省く。新しいrevisionが要求されたら、古いrevisionの再試行待ち時間を解除し、最新の保存へ進む。実行中の書き込みは完了まで待ち、保存先で処理が重ならないようにする。
- cancel button は安全に止められる stage だけ有効にする。remote upload 開始後は best effort であることを示す。結果不明のまま新規 upload を再開しない。

### 成功時

- 自動保存はcommit markerと全hash一致後だけ対象revisionを保存済みにする。保存中に新しいrevisionができた場合は「自動保存中」または「自動保存待ち」を維持する。後続保存が完了してから「自動保存済み」にする。compile / checkはfresh input fingerprintのresultと生成元の記録 linkを残す。サムネイルは「公開用ステージングへコピー済み」と検証SHAを表示する。
- Upload は正式 result の worldId / itemId、versionId、versionNumber、contentHash と審査状態を表示する。正式 URL field がある時だけ URL を表示する。サムネイル更新後は保存済み画像、公開チェック、staleになったcompile状態を同じreviewへ反映する。
- Upload 成功後は CLI が `.xrift/world.json` または `.xrift/item.json` に記録した remote ID を authoring project へ保存する。次の fresh staging へ復元する。`xrift.json` を remote ID の保存先として扱わない。

### 失敗時

- 自動保存の一時失敗は最新revisionだけを最大3回自動再試行する。上限後も失敗した場合はlast committed document setと未保存のEditor stateを維持する。headerへ「自動保存エラー」と再試行を表示する。新しい操作が確定した場合は古いrevisionのretryを打ち切る。同じ内容の無限retryは行わない。compile failureはlast-good stagingを保つ。Upload failureはremote commitの有無を保つ。stage、sanitized cause、再試行先を示す。
- stale input、REJECT、未編集 metadata、auth failure、サムネイルの欠落・copy失敗・SHA不一致を成功扱いにしない。元オブジェクト / 素材 / field または review へ戻す。Upload reviewからの撮影・画像変換・保存に失敗した場合は既存サムネイルを保持する。review内で再試行できる。サムネイル変更時はcompileをstaleにする。再staging前にremote uploadを開始しない。token、absolute path、raw stderr を表示しない。
- 保存済み remote ID を一意に復元できない、または manifest、CLI 付属ファイル、upload result の ID が一致しない場合は新規 upload を開始しない。再試行しない。公開先の確認を求める。

### 戻り先

- modal / previewを閉じると同じvisual projectの編集、動作確認前のcamera、`sceneSelection`、`assetSelection`、自動保存状態へ戻る。ライブラリへ戻る時は待機中または保存中の最新revisionをflushする。失敗した場合はEditorへ留まる。再試行を示す。
- automated test と通常の UI 検証は fake backend / fixture で upload state を再現する。実 XRift upload を行わない。

完了条件: authoring操作ごとの直列化された自動保存、journal付きcommit、決定的compiler / 生成元の記録、freshness検査、区別されたpreview、既存XRift check / uploadを一つのeditor flowで扱う。失敗や取消後もlast committed authoringと戻り先を保つ。Upload reviewから現行シーンのサムネイルを保存する。新規公開と既存ワールド更新の両方で再確認できる。

<a id="f-19"></a>

## F-19 ビジュアル編集からコード編集への書き出しの状態設計

### 操作前

- ビジュアルエディター headerの「コード編集へ書き出す」から開始する。現在のビジュアル編集のプロジェクトを閉じない。このexport自体は一方向で自動同期しないこと、コード編集から戻す場合はF-23の静的lossy importを別に実行することを最初に示す。
- OSのfolder pickerで同じワールド／アイテム種別のコード編集のプロジェクトを選ぶ。`package.json`、`xrift.json`、`src/World.tsx`または`src/Item.tsx`、package managerを検査する。書き込みを有効にする。
- 既定は既存開始ファイルを保つ「コンポーネントとして追加」とする。「エントリーを切り替える」は既存fileをbackupして置き換える事実への明示確認を必要とする。

### 操作中

- 最新ビジュアル編集 documentsを先に保存する。公開と同じ`classic-jsx` compiler modeでシーンのソース、素材 copy plan、デコーダー / フォントの同梱plan、diagnostics、生成元の記録を作る。blocking diagnosticがあればコード編集側へ書き始めない。
- 生成した`src/`一式は`src/xrift-studio/<project-id>/`へ相対importを保ったまま移す。`Scene.tsx`から`XriftStudioScene`として読めるようにする。素材、デコーダー、フォントは公開ワールドが直下しか配信しないため`public/`直下へ置く。生成元の記録とexport manifestは`.xrift-studio/exports/<project-id>/`へ置く。既存`xrift.json`とthumbnailをビジュアル編集 metadataで上書きしない。`permissions`が必要な場合は追加すべき内容を完了画面に示す。
- 依存packageはcompiler planから決める。`@xrift/world-components`は既存rangeが必要版へ届かない時だけ固定する。テキスト（troika-three-text）とOpen Brush（three-icosa）は必要な時だけ追加する。npm projectでは固定allow-listのpackageを自動installできる。package.jsonの記載だけでなく取得済みバージョンも確認し、不足がある場合は再試行でもinstallを実行する。不足がなければinstallを走らせない。pnpm／Yarn／Bun projectは別lockfileを作らない。`package.json`へのdependency記録と既存package managerでのinstall案内までにする。

### 成功時

- シーンのソース、実行環境 module、素材、デコーダー / フォント、接続component、生成元の記録、export manifestを残す。前回のexportが記録したfileのうち今回生成しないものは取り除く。手書きfileとbackupには触れない。開始ファイル切替時は内容ごとにバックアップを保存し、そのパスをmanifestへ記録する。再実行でも初回と途中の手直しを保持する。生成済みの開始ファイルはバックアップを増やさない。
- 完了dialogに「フォルダーを開く」「VS Codeで開く」「ターミナルを開く」を残す。コンポーネント追加では開始ファイルへ貼るimport／JSX snippetをコピーできる。

### 失敗時

- folder検査、ビジュアル編集保存、compileが失敗した場合はコード編集のプロジェクトを変更しない。対象file不足、kind不一致、blocking diagnosticは同じdialogで修正できる。選び直せる。
- package install失敗時は生成内容とdependency記録を保持する。公開済みpackageまたは既存package managerで再実行できる事実を示す。成功に見せない。

### 戻り先

- 取消または完了後にdialogを閉じると、同じビジュアルエディター、シーン、selection、camera、保存状態へ戻る。コード編集側の編集結果を自動同期しない。取り込む場合はF-23から検査と診断を伴う別transactionを開始する。

完了条件: ビジュアルエディターの日常導線から任意の同種コード編集のプロジェクトを検査する。Runtime JSON、素材、接続component、固定dependencyを手書き領域と分離して追加できる。成功後はfolder、VS Code、terminal、接続snippetへ進める。

<a id="f-27"></a>

## F-27 公開前パフォーマンス概算と素材最適化の状態設計

公開時の不要データ除去と変換キャッシュは[ダウンロード容量削減](../PUBLISH_DOWNLOAD_OPTIMIZATION.md)に従う。通常の動作確認に変換待ちを追加せず、公開用コピーだけへ適用する。公開ログでGLBの変換前後の容量を確認できる。

参照: MI-04, MI-07, MI-27, MI-67

### 操作前

- Upload reviewの確認項目の最後に「ロード容量・VRAMの目安」を置き、ロード容量、VRAMのrange、優先度の高い改善候補の有無を一行で示す。「詳細を見る」から「ワールドの容量・パフォーマンス目安」を開く。
- 詳細は「素材 VRAM」「初回素材ロード」「実行時の全体目安」「スマートフォン目安」を並べ、各数値の下に内訳を書く。テクスチャ数と3Dモデル数、回線速度と所要秒数、加算した描画buffer量、余裕ありと判定するStudio基準の閾値を、数値だけで終わらせない。
- デスクトップ判定、メッシュ配置数、高速回線での所要秒数を補助として同じ行に添える。
- 「VRAM使用量が多い順」と「ロード容量が多い順」を寄与量の多い順に並べ、それぞれの前提を見出しの下に書く。前者は同じ素材の複数配置がGPUリソースを共有すること、後者は公開時にコピーされる素材原本の合計であり、アプリ本体と通信オーバーヘッドを含まないことを示す。
- 概算対象の素材がないシーンでは0件と空状態の文を出す。合計値だけを見せて、内訳の取得に失敗したように見せない。
- 末尾に、これが実測値ではないこと、ロード時間の計算に含まれないもの（キャッシュ、CDN、アプリ本体、HTTP処理）、VRAMが変動する条件（ブラウザ、GPU、画面解像度、影、ポストエフェクト、KTX2の転送先形式）、PNG / JPEG / WebPをGPU上のRGBA展開として数え、mipmap有効時に約33%を加算していることを明記する。

### 操作中

- 改善候補は対象素材の名前と現在値を添えて示す。テクスチャは最大2048pxへの縮小とKTX2への変換、3DモデルはDraco圧縮を候補にし、推奨と検討をseverityとして区別して並べる。
- 候補は個別にチェックでき、チェックした分だけを素材へ適用する。適用中は進捗と対象を表示し、同じ候補の二重実行を防ぐ。
- 概算はUpload reviewを開いた時点の公開対象シーンと展開済みプレハブから解析する。Editorの選択、シーン、素材を変更しない。

### 成功時

- 適用した候補は対象素材の読み込み設定または派生素材へ反映し、概算を再計算して同じ画面の数値と内訳を更新する。何がどう変わったかを見てから次を選べる。
- 重複メッシュの候補は、モデルの全配置数ではなく同じ元データメッシュを参照する部品数を表示する。選択して適用すると、モデルの「重複メッシュをインスタンス化」が有効になり、動作確認と公開先で共通処理を使う。同じ形状とマテリアルの不透明な静的部品を64m単位でまとめ、原本と衝突判定を保持する。動的な親、Animation、Skin、Morph、反転した部品、スクリプトやグラフの実行があるシーンは通常描画を維持する。適用済みの候補は一覧から消え、モデルの設定から解除できる。ファイル容量の削減として表示しない。
- 「公開前の確認へ戻る」でUpload reviewへ戻り、更新後の一行サマリを確認したうえで公開へ進める。

### 失敗時

- 変換に失敗した候補は対象素材を変更せず、対象名と理由を残す。同時に選んだ他の候補の結果は取り消さない。
- 概算できない素材は概算対象外として示し、0や不明を余裕ありとして数えない。

### 戻り先

- 「公開前の確認へ戻る」でUpload review、閉じた場合はEditorへ戻る。どちらでもEditorの編集状態、選択、設定 contextを変えない。

完了条件: ワールド / アイテムの更新前に初回ロード容量と回線別時間、素材と実行時VRAMのrange、端末別Studio基準、容量・負荷順の内訳と最適化候補を確認できる。対応候補は個別選択してresize、KTX2、Dracoを素材へ適用する。変換結果と再計算値を確認した上で同じUpload reviewへ戻れる。
