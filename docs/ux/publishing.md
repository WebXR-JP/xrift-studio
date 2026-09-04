# 保存・公開・書き出しの操作・状態設計

[機能一覧へ戻る](../UX_INTERACTIONS.md) / [共通の動き](./interactions.md)

<a id="f-05"></a>

## F-05 公開準備とアップロードの状態設計

参照: MI-03, MI-04, MI-05, MI-07, MI-08, MI-09, MI-17, MI-27

### 操作前

- 「アップロード」はログインしていない間は実行できない状態にする。tooltipでログインが必要なことを示す。押せるのに必ず失敗する操作を出さない。
- 押すとまず公開情報を確認する。確認中はラベルを「公開情報を確認中…」に変える。
- タイトル、説明、サムネイルがテンプレートのままなら「公開前の準備」を開く。このまま公開すると初期ワールド（アイテム）のように表示される可能性があることを書く。主操作は情報の編集またはサムネイルの設定にする。
- ビジュアルプロジェクトでは、公開情報、サムネイル、XRiftアカウント、公開先、公開データ、公開チェック、ロード容量・VRAMの目安を確認項目として並べる。それぞれの状態を一行で示す（[F-27](#f-27-公開前パフォーマンス概算とasset最適化の状態設計)）。

### 処理中

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

## F-10 Visual Save / Compile / Preview / Upload の状態設計

### 操作前

- authoring操作前は直前revisionを自動保存済みとして示す。compile / previewはtargetとinput freshnessを示す。Uploadはtitle、description、thumbnail、auth、diagnostic、既存remote IDを開始前に示す。
- Editor direct preview、generated staging preview、XRift upload / 審査を同じ「Preview」と呼ばない。公式資料にない hosted / CLI / XFT preview は選択肢に出さない。

### 操作中

- authoring操作の確定後は250msの待機を挟む。最新revisionをvalidate、temporary write、commitへ進める。保存中に次の変更が確定した場合は並列writeしない。現在の保存完了後に最新revisionを続けて保存する。compileはasset prepare、generate、hash / provenance、必須の`public/thumbnail.png`のstaging copyとSHA-256一致確認へ進む。Upload modalはauth-check、saving、compiling、checking、uploading、processingを表示する。Upload reviewでは現行Sceneの実描画を撮影するか画像を選択する。同じ場所から`public/thumbnail.png`を更新できる。
- cancel button は安全に止められる stage だけ有効にする。remote upload 開始後は best effort であることを示す。結果不明のまま新規 upload を再開しない。

### 成功時

- 自動保存はcommit markerと全hash一致後だけ対象revisionを保存済みにする。保存中に新しいrevisionができた場合は「自動保存中」または「自動保存待ち」を維持する。後続保存が完了してから「自動保存済み」にする。compile / checkはfresh input fingerprintのresultとprovenance linkを残す。サムネイルは「公開用ステージングへコピー済み」と検証SHAを表示する。
- Upload は正式 result の worldId / itemId、versionId、versionNumber、contentHash と審査状態を表示する。正式 URL field がある時だけ URL を表示する。サムネイル更新後は保存済み画像、公開チェック、staleになったcompile状態を同じreviewへ反映する。
- Upload 成功後は CLI が `.xrift/world.json` または `.xrift/item.json` に記録した remote ID を authoring project へ保存する。次の fresh staging へ復元する。`xrift.json` を remote ID の保存先として扱わない。

### 失敗時

- 自動保存の一時失敗は最新revisionだけを最大3回自動再試行する。上限後も失敗した場合はlast committed document setと未保存のEditor stateを維持する。headerへ「自動保存エラー」と再試行を表示する。新しい操作が確定した場合は古いrevisionのretryを打ち切る。同じ内容の無限retryは行わない。compile failureはlast-good stagingを保つ。Upload failureはremote commitの有無を保つ。stage、sanitized cause、再試行先を示す。
- stale input、REJECT、未編集 metadata、auth failure、サムネイルの欠落・copy失敗・SHA不一致を成功扱いにしない。元 Entity / Asset / field または review へ戻す。Upload reviewからの撮影・画像変換・保存に失敗した場合は既存サムネイルを保持する。review内で再試行できる。サムネイル変更時はcompileをstaleにする。再staging前にremote uploadを開始しない。token、absolute path、raw stderr を表示しない。
- 保存済み remote ID を一意に復元できない、または manifest、CLI sidecar、upload result の ID が一致しない場合は新規 upload を開始しない。再試行しない。公開先の確認を求める。

### 戻り先

- modal / previewを閉じると同じvisual projectのEdit、Play前のcamera、`sceneSelection`、`assetSelection`、自動保存状態へ戻る。ライブラリへ戻る時は待機中または保存中の最新revisionをflushする。失敗した場合はEditorへ留まる。再試行を示す。
- automated test と通常の UI 検証は fake backend / fixture で upload state を再現する。実 XRift upload を行わない。

完了条件: authoring操作ごとの直列化された自動保存、journal付きcommit、決定的compiler / provenance、freshness検査、区別されたpreview、既存XRift check / uploadを一つのeditor flowで扱う。失敗や取消後もlast committed authoringと戻り先を保つ。Upload reviewから現行Sceneのサムネイルを保存する。新規公開と既存ワールド更新の両方で再確認できる。

<a id="f-19"></a>

## F-19 VisualからClassicへの書き出しの状態設計

### 操作前

- Visual Editor headerの「Classicへ書き出す」から開始する。現在のVisual projectを閉じない。このexport自体は一方向で自動同期しないこと、Classicから戻す場合はF-23の静的lossy importを別に実行することを最初に示す。
- OSのfolder pickerで同じWorld／Item種別のClassic projectを選ぶ。`package.json`、`xrift.json`、`src/World.tsx`または`src/Item.tsx`、package managerを検査する。書き込みを有効にする。
- 既定は既存entryを保つ「コンポーネントとして追加」とする。「エントリーを切り替える」は既存fileをbackupして置き換える事実への明示確認を必要とする。

### 操作中

- 最新Visual documentsを先に保存する。公開と同じ`classic-jsx` compiler modeでSceneのソース、Asset copy plan、decoder / fontの同梱plan、diagnostics、provenanceを作る。blocking diagnosticがあればClassic側へ書き始めない。
- 生成した`src/`一式は`src/xrift-studio/<project-id>/`へ相対importを保ったまま移す。`Scene.tsx`から`XriftStudioScene`として読めるようにする。Asset、decoder、fontは公開Worldが直下しか配信しないため`public/`直下へ置く。provenanceとexport manifestは`.xrift-studio/exports/<project-id>/`へ置く。既存`xrift.json`とthumbnailをVisual metadataで上書きしない。`permissions`が必要な場合は追加すべき内容を完了画面に示す。
- 依存packageはcompiler planから決める。`@xrift/world-components`は既存rangeが必要版へ届かない時だけ固定する。Text（troika-three-text）とOpen Brush（three-icosa）は必要な時だけ追加する。npm projectでは固定allow-listのpackageを自動installできる。変更がなければinstallを走らせない。pnpm／Yarn／Bun projectは別lockfileを作らない。`package.json`へのdependency記録と既存package managerでのinstall案内までにする。

### 成功時

- Sceneのソース、runtime module、Asset、decoder / font、接続component、provenance、export manifestを残す。前回のexportが記録したfileのうち今回生成しないものは取り除く。手書きfileとbackupには触れない。entry切替時は元entryのbackup pathをmanifest管理領域へ保存する。
- 完了dialogに「フォルダーを開く」「VS Codeで開く」「ターミナルを開く」を残す。コンポーネント追加ではentryへ貼るimport／JSX snippetをコピーできる。

### 失敗時

- folder検査、Visual保存、compileが失敗した場合はClassic projectを変更しない。対象file不足、kind不一致、blocking diagnosticは同じdialogで修正できる。選び直せる。
- package install失敗時は生成内容とdependency記録を保持する。公開済みpackageまたは既存package managerで再実行できる事実を示す。成功に見せない。

### 戻り先

- 取消または完了後にdialogを閉じると、同じVisual Editor、Scene、selection、camera、保存状態へ戻る。Classic側の編集結果を自動同期しない。取り込む場合はF-23から検査と診断を伴う別transactionを開始する。

完了条件: Visual Editorの日常導線から任意の同種Classic projectを検査する。Runtime JSON、Asset、接続component、固定dependencyを手書き領域と分離して追加できる。成功後はfolder、VS Code、terminal、接続snippetへ進める。

<a id="f-27"></a>

## F-27 公開前パフォーマンス概算とAsset最適化の状態設計

参照: MI-04, MI-07, MI-27, MI-67

### 操作前

- Upload reviewの確認項目の最後に「ロード容量・VRAMの目安」を置き、ロード容量、VRAMのrange、優先度の高い改善候補の有無を一行で示す。「詳細を見る」から「ワールドの容量・パフォーマンス目安」を開く。
- 詳細は「Asset VRAM」「初回Assetロード」「実行時の全体目安」「スマートフォン目安」を並べ、各数値の下に内訳を書く。Texture数とModel数、回線速度と所要秒数、加算した描画buffer量、余裕ありと判定するStudio基準の閾値を、数値だけで終わらせない。
- デスクトップ判定、メッシュ配置数、高速回線での所要秒数を補助として同じ行に添える。
- 「VRAM使用量が多い順」と「ロード容量が多い順」を寄与量の多い順に並べ、それぞれの前提を見出しの下に書く。前者は同じAssetの複数配置がGPUリソースを共有すること、後者は公開時にコピーされるAsset原本の合計であり、アプリ本体と通信オーバーヘッドを含まないことを示す。
- 概算対象のAssetがないSceneでは0件と空状態の文を出す。合計値だけを見せて、内訳の取得に失敗したように見せない。
- 末尾に、これが実測値ではないこと、ロード時間の計算に含まれないもの（キャッシュ、CDN、アプリ本体、HTTP処理）、VRAMが変動する条件（ブラウザ、GPU、画面解像度、影、ポストエフェクト、KTX2の転送先形式）、PNG / JPEG / WebPをGPU上のRGBA展開として数え、mipmap有効時に約33%を加算していることを明記する。

### 操作中

- 改善候補は対象Asset名と現在値を添えて示す。Textureは最大2048pxへの縮小とKTX2への変換、ModelはDraco圧縮を候補にし、推奨と検討をseverityとして区別して並べる。
- 候補は個別にチェックでき、チェックした分だけをAssetへ適用する。適用中は進捗と対象を表示し、同じ候補の二重実行を防ぐ。
- 概算はUpload reviewを開いた時点の公開対象Sceneと展開済みPrefabから解析する。Editorの選択、Scene、Assetを変更しない。

### 成功時

- 適用した候補は対象AssetのImport設定または派生Assetへ反映し、概算を再計算して同じ画面の数値と内訳を更新する。何がどう変わったかを見てから次を選べる。
- 「公開前の確認へ戻る」でUpload reviewへ戻り、更新後の一行サマリを確認したうえで公開へ進める。

### 失敗時

- 変換に失敗した候補は対象Assetを変更せず、対象名と理由を残す。同時に選んだ他の候補の結果は取り消さない。
- 概算できないAssetは概算対象外として示し、0や不明を余裕ありとして数えない。

### 戻り先

- 「公開前の確認へ戻る」でUpload review、閉じた場合はEditorへ戻る。どちらでもEditorの編集状態、選択、Inspector contextを変えない。

完了条件: World / Itemの更新前に初回ロード容量と回線別時間、Assetと実行時VRAMのrange、端末別Studio基準、容量・負荷順の内訳と最適化候補を確認できる。対応候補は個別選択してresize、KTX2、DracoをAssetへ適用する。変換結果と再計算値を確認した上で同じUpload reviewへ戻れる。
