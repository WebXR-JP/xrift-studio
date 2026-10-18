# ChatGPT制作機能の拡張

Studio内のChatGPTは、利用できる操作とComponent定義を読み、構造化したPlanを返す。実行は通常のEditor操作を通し、モデルの出力でScene文書を直接置換しない。

制作方針と制作方法の説明は`world-authoring-guide.json`をMCP・制作専用スキルと共有する。nativeは実際の操作Schemaに合う詳細だけを追加し、素材検索とコード生成を別の応答で扱う。原本の事前検証、変更のないcommitの省略、同じ不合格レビューの再利用条件は[ワールド制作ハーネス](./WORLD_AUTHORING_HARNESS.md)を参照する。

Studioの制作チャットは、送信すると編集を進める。UIにはPlanの切り替えを置かず、下書きに制作モードを保存しない。Queueへ追加するときと送信するときの両方で`mode: "build"`を指定し、以前の`mode: "plan"`予約も直接編集として送る。MCP/APIの`mode: "plan"`と`apply_chatgpt_plan`は維持する。外部から作られた確認待ちをStudioで開いた場合は「変更を反映」「変更を破棄」を表示する。

## 操作の定義と実行

- `src/lib/visual-editor/chatgpt-editor-actions.json`に、拡張操作の名前、表示名、必要な能力、入力Schemaを置く。TypeScriptの入力キー検査とRustの推論用JSON Schemaが同じファイルを使う。
- `chatgpt-editor-actions.ts`に型、入力検査、実行ハンドラーを追加する。ハンドラーは固定したEditor toolを呼ぶ。未知の操作やフィールドは拒否する。モデルが任意のtool名、コマンド、実行コードを渡す方式にはしない。
- `chatgpt-plan-guards.ts`でPlanの説明と変更対象を記録する。削除は配下全体と親Entityを保護し、推論・反映中の手動変更を上書きしない。
- `chatgpt-authoring-host.ts`は各操作の結果を一つの変更として反映・保存し、保存済みの結果だけを進捗へ加える。`App.tsx`は画面と所有する状態を接続する。失敗した操作を完了扱いにしない。

新しい操作を追加したら、共有Schema、TypeScript検査、実行ハンドラー、Plan表示、競合時の保護、保存・復元を一緒に検証する。新しい`requires`の分類が必要な場合は、Rustの能力判定も追加する。

## ComponentとMCPの共通経路

`component-registry.ts`が名前、プロパティ、型、値の範囲、選択肢、既定値の正本。`chatgpt-scene-resources.ts`がこれを要約し、既存ComponentのIDと設定値も優先順に渡す。公式Componentを増やすたびに、ChatGPT用の専用操作を増やす必要はない。

`component-add`は既存Entityへの追加と新規Entityの作成を扱う。`component-update`は指定Componentの部分更新。`component-remove`は指定Componentを取り外す。TransformはEntityに必須のため取り外せない。公式Componentに加え、Light、Text、Image、Mesh Renderer、Rigid Body、Collider、Audio Sourceなどの基本Componentも同じ操作で扱う。

基本Componentの候補は`editor-session.ts`の共通registryを使う。許可する設定キーは`component-patch-contract.ts`が正本で、MCPの`update_component`とChatGPTの入力検査・送信カタログが共有する。Patch型からキーが増えたときは型チェックでも不一致を検出する。同じ型を持つLightやTextの候補は、`fieldsFrom`で最初の候補のフィールドを参照し、重複する説明でSkyboxや利用者の素材を送信から押し出さない。

`propertiesJson`は公式Componentでは公式プロパティ、基本Componentでは`update_component`のpatchフィールドを持つJSONオブジェクトであり、コードではない。指定しない値は保持する。最終的な型・範囲・一意性・保護対象の検証は通常の`add_component`・`update_component`・`remove_component`へ任せる。途中の検証に失敗した新規EntityはSceneへ反映しない。Scriptのソースやプロパティ契約、Node Graph、Asset本体の制作は、汎用Component patchへ含めず、それぞれの専門経路で扱う。既存Scriptの有効・無効と取り外しは共通Component操作で扱える。

編集・Play・公開は既存の公式Componentの描画処理を使う。Componentの保存確認と、画面共有・複数人同期などの実利用の確認は分けて報告する。

## 選択式の確認

判断に必要な情報が不足している場合、Planは`questions`を最大3件返す。文章だけの質問は3択、素材の質問は最大12候補を持たせ、UIが「その他（自由入力）」を加える。Skyboxは十分な素材があるとき6〜12候補を提示し、依頼と現在のSceneの用途・時間帯・色・照明に合う順に並べる。候補名と短い理由を示し、表示側で名前順に並べ替えない。質問を含むPlanには編集操作を混ぜない。

素材候補の`choiceCandidateIds`は表示順と一対一で対応させる。4候補以上ではすべてのIDを必須とし、重複・未登録ID・件数の不一致をフロントエンドとnativeの両方で拒否する。送信量を圧縮しても内蔵Skyboxを12候補、通常の表面に使えるMaterialを12候補確保する。契約6で選択肢の上限を拡張し、契約7で全体への一括適用を追加する。

サムネイルは候補名の下に配置し、横幅に合わせたカード一覧にする。素材の追加・割り当てを提案するPlanと保存済みの会話にも、各作業の説明の下に表示する。プレビュー情報は検証した候補からUI用に解決し、推論が返したURLを使わない。素材集と同じカタログのデータ・描画処理、Assetsの実サムネイル、外部カタログの取得済み画像を使う。取得できない画像は状態を示す。内蔵の重いプレビューは表示領域に近いときだけ読み込み、外れたら描画Contextを解放する。

`chatgpt-question-schema.json`が推論用Schema、`chatgpt-questions.ts`が質問と回答の検査、`ChatgptQuestionForm.tsx`がページ表示を担当する。全ページの回答がそろったら、同じgenerationId・モデル・思考量・添付Entity・制作モードで考え直す。回答待ちは`planned`として扱い、未回答のPlan反映は拒否する。

回答は会話の参照情報へ残す。会話、回答、Entity名はデータとして扱い、操作SchemaやEditorの権限を変更する指示にはしない。

外部素材の選択肢は、ネイティブのカタログ取得で検証した候補だけをgenerationIdに紐付けてメモリーへ保持し、回答後の同じ依頼のSchemaへ渡す。上限は36件で、回答済みの候補と新しい質問の候補を優先する。会話の候補IDは保持済みデータの優先順位だけに使い、新しいURLや素材情報の導入には使わない。新規依頼、最終Plan、停止、ログアウトで破棄する。

素材の検索は、現在のAssetsと内蔵候補で足りない場合だけ、必要なprovider・種類・検索語に絞る。`chatgpt/public_catalog.rs`は公開metadataの10分TTLとproviderごとの取得共有を担当する。同時missでも同じ一覧を重複取得せず、異なる配布元は並行して読む。resourceContextを使わない互換plannerも必要な最大2配布元を並行取得する。期限切れ、失敗、停止した取得を成功として再利用しない。resource plannerの入力には同じ候補metadataをqualified形式で一度だけ含め、候補のID・集合・表示順と検証を保つ。各native処理の開始時にアカウントの利用権限と現在の対応思考量を確認する。UIの取得済み一覧やMCPの直近60秒の一覧は設定候補の参照に限り、この検証を省略しない。

## Materialの候補と変更範囲

Materialを見比べたい依頼では、十分な素材があるとき6〜12候補を、対象の用途・色・質感・照明に合う順で提案する。候補IDと実プレビューを持つ質問で選択を待つ。通常の表面にSkybox Shaderを勧めない。

単体、明示した一部、全体の依頼を区別する。Entityの名前・選択・添付がある場合は、その対象への`material`割り当てを使い、元の共有Material自体を変更しない。複数対象を同じ候補へ強制せず、対象ごとに候補を選ぶか、利用者が希望した配色の組み合わせを確認する。全体への変更は全体が依頼された場合だけ行う。範囲が不明なら公開名で確認し、回答前に編集しない。

全体への一括変更を依頼された場合は、Scene全体に使う候補を一度だけ確認する。Entityごとの質問へ分けず、選択後は`material-scene`の1操作で適用する。現在のSceneの有効なMesh Rendererを列挙し、全スロットとModelの部分Entityの割り当てを既存MCPの`set_material`経路で変更する。対象が32件を超えても、Planの操作件数や1回の保存を分割しない。元の共有Material、形状、配置を保ち、依頼単位で一括して戻せる。確認待ちの間にSceneが変わった場合は最新状態で再確認する。

AssetsのMaterial自体の設定変更を依頼された場合は、従来どおり`material-update`で同じAssetを編集し、参照するEntityにも反映されることを説明する。Entityへの候補の割り当てと、共有Asset自体の編集を混同しない。

## 次の依頼の候補

接続済みで入力欄が空のとき、直前の完了結果と現在の添付Entity・Materialから、入力欄に依頼文の候補を1件だけ表示する。候補の作成に推論APIを追加で呼ばない。取り込み時に入力欄へ文面を入れ、対象IDを通常の添付へ引き継ぐ。Scene・Assetsの編集と送信は、利用者が内容を確認して送信するまで始めない。

入力欄が空で変換中ではないとき、修飾キーなしのTabで候補を取り込む。Escapeか候補横の閉じるボタンで非表示にし、同じ結果・添付では閉じた状態を保つ。↑・↓、Shift+Tab、IME変換、入力途中のキー操作は通常どおり扱う。取り込んだ文面は編集でき、Enterで通常の送信経路へ渡す。

処理中、送信待ちあり、未接続、質問・変更内容の確認待ち、失敗・停止・取り消し後は候補を表示しない。候補を3ページの確認質問と混同しないよう、質問中はそのフォームのTab・Space操作を維持する。候補に含む対象も、通常の添付と同じScene・Materialの存在確認、上限、Queue、送信直前の検証を通す。

## 制作範囲・細かさ・終了条件

現在のauthoring契約は11。制作範囲は利用者の依頼から決め、Sceneに既存Entityがあることや`selectedEntityId`だけを理由に、ワールド全体の依頼を部分編集へ狭めない。「公園を作ってください」なら、園路、植栽、休憩場所、照明を含む全体を設計し、床だけの準備で終えない。利用者が訂正した依頼を、以前の却下された制作予定より優先する。

`chatgpt-starter-context.ts`は、実際の初期テンプレートとEntity・参照素材・階層を照合し、未編集の`starter-floor`・`starter-box`だけを`ChatgptSceneContext.starterEntityIds`へ渡す。明示的に添付した対象や配下、ほかのEntityのScript・Component・Modelから参照される対象は除く。全体を新しく作る依頼では、この一覧の床・箱を置き換えたり削除したりでき、既存の寸法や形を完成条件に含める必要はない。編集済みの作品、添付対象、依頼範囲外の内容は保持する。一覧が空または省略された場合、名前やIDだけから初期配置と推測しない。MCPの`get_editor_context.starterEntityIds`も同じ照合を使う。

Planの`production`は、制作範囲`scope`、細かさ`detail`、焦点`focus`、完了条件`criteria`、回数の上限`maxPasses`を持つ。範囲は`edit`・`model`・`environment`・`world`、細かさは`focused`・`balanced`・`overview`から選ぶ。焦点は160文字以内、完了条件は重複しない1〜6件・各240文字以内、上限は1〜6回とする。未知のフィールド、空や重複した完了条件、範囲外の回数を拒否する。旧Planの欠落・nullは従来の動作として扱う。

初回の`world`・`environment`には、制作・画像確認・修正を行う余地として3〜6回を提案する。`chatgptProductionDirection`は初回提案の上限を最低3回に整えるが、1回目で完了条件と画像確認を満たせば終了する。継続中に保存済みの上限は延長せず、旧履歴の1回上限も保持する。`model`・`edit`では1回の上限を引き続き使える。

範囲と細かさは、依頼した体験、Sceneの広さ、見る距離、操作の必要性からモデルが判断する。単語の一致で分類しない。家1軒を主役にする依頼では必要な構造を詳しく作り、街全体では道・区画・建物の大きさと配置を揃える。背景の建物には控えめな外観の違いを付け、同じモデルを共有して配置する。入ることを求められていない建物の内装や、見えない装飾で作業を増やさない。

`environment`と`world`は通常のbuildでも、意味のある作業が残る間だけ保存と計画を繰り返す。最初の方針・完了条件・上限を同じ依頼の中で固定し、再計画でも回数をリセットしない。質問待ちは作業を進めず、回答後も同じ方針を使う。`chatgpt-production.ts`が継続と終了を判断し、会話には元の方針、残りの作業、保存済み件数を2000文字以内で引き継ぐ。`productionPass`と進展のない回数は履歴にも残すが、再起動後は自動再開しない。

`model`や`edit`でも`hasMore`を返して継続する場合は、同じ元の`maxPasses`を守る。小さな編集を繰り返すことで制作上限を迂回せず、scopeを別の値へ読み替えて予算を広げない。

全体の制作では、個々の背景素材ごとの画像修正を繰り返さず、保存後のScene全体を2方向から描画して確認する。配置、導線、大きさの整合、必要な構造、空や照明のまとまりを最初の完了条件と照合する。未完了なら、具体的な残りの作業だけを次の計画へ渡す。完了条件を満たして全体の画像確認が終わった場合に完了とする。上限に達した場合や3回続けて進展がない場合は、未確認・未完了の項目を示して停止し、保存済みのSceneを保持する。未取得の映像やPlayの確認を完了扱いにしない。

契約10では`chatgpt_review_scene`の結果に`criteria`を必須とし、元の`production.criteria`全件を元の順序で`{criterion, passed, reason}`として返す。条件名の言い換え、抜け、重複、追加、順序の変更を拒否する。`reason`は空でない600文字以内の日本語で、具体的なScene値と実画像の観察、または確認できなかった内容を述べる。未観測・不確実な条件は`passed: false`とし、元の条件をすべて満たした場合だけ`approved: true`と`remainingWork: ""`を許す。未完了の残作業は元の不合格条件だけに結び付け、求められていない内装や装飾で制作を延長しない。

nativeのSchema・parserとフロントエンドの`authoring-criteria.ts`がこの整合を検査する。`authoring-evidence.ts`は、同じ最新の保存済みSceneのfingerprintと2方向の画像、全条件のレビュー、pending writeがないことを照合する。見直し中のScene変更、古い画像、未確認の条件、保存失敗を完了に変換しない。これは証拠の同一性と条件の網羅性の検査であり、実モデルの判断やPlayの動作を自動で保証するものではない。R3Fを導入した契約9とは別の契約更新として扱う。

## 制作入力と実行の記録

`chatgpt-harness-context.ts`は同じbundleから限定したScene、resources、制作方針、省略した件数を作り、呼出元から切り離してfreezeする。`sceneFingerprint`は作品のauthoring値、`fingerprint`は会話とcatalogも含む入力packetを識別する。完全なR3F原本を優先し、容量に入らない原本を途中で切らない。

計画とScene全体レビューの前に、`chatgpt-harness-context-archive.ts`がpacketを作品の`.cache/xrift-studio-harness/contexts/<fingerprint>.json`へcanonical JSONで保存する。`authoring_context.rs`の固定cache内だけに保存し、一時ファイルのflushと既存ファイルを置換しない公開、読戻しによる長さ・canonical bytes・digestの検証を経て参照を返す。cacheは公開・作品の書き出しから除外する。会話履歴の`contextRefs`には直近8件の検証済み参照を残し、原本や画像bytesをjournalへ複写しない。

準備したhandleは一度だけdispatchできる。実行直前に保存内容を再検証し、そのI/O後に対象作品・Sceneと制作ownerを確認する。現在のSceneへの計画やレビューでは、最新の対象snapshotとの一致も確かめる。失敗したhandleを再利用せず、欠落・破損・不正な参照を新しい内容で黙って置換しない。保存対象はbounded authoring packetであり、nativeが作るproviderのHTTP body全体、内部の素材検索・repair・形状制作・画像の全記録とは区別する。復元は入力の検査に使い、推論の自動再送や再起動後の自動実行を許可しない。

`target: "new"`の初回計画は現在の作品のcacheへ保存する。新作品を作成した後、元の参照を検証して読み、新作品にも同じ不変artifactを保存してからEditorを切り替える。新旧両方の会話に残した参照を、それぞれの作品内で復元できる。

`authoring-progress.ts`はChatGPTとMCPの共通処理として、Planまたは操作と、その前後のSceneのdigestを直近16回分保持する。Sceneが変わらない処理、同じPlanの繰り返し、以前のSceneへ戻る循環を区別し、進展のない継続を既定で3回までに制限する。手動編集などで連続性が切れた境界を越えて循環と判定しない。Sceneが変化しただけでは品質の改善とは判断せず、元の完成条件と最新画像を使う。

進展の比較では、検証済みR3Fの版・最初の依頼・照合用baselineだけを除き、完全な原本と実際のScene・Assets・Prefabを保持する。管理情報だけの更新は進展に数えない。保存・画像確認・完了は、これらの管理情報も含む厳密なfingerprintで確認する。

runtimeは同じrunのpass、repair、推論工程、変更、実行時間を累積する。型付きsnapshotと直近128件のjournalを会話へ保存し、`useChatgptSessions.flush()`が失敗したときは次の推論・副作用を始めない。進展記録の復元でもversion、field、pass順、分類と回数・循環長の整合を検査する。旧履歴の省略された任意fieldは許容し、壊れた新形式は記録ごと捨てずにエラーにする。

## Goalの継続制作

`/goal 目標`は`chatgpt-goal.ts`でコマンドと本文を分け、Queueへ`mode: "goal"`として渡す。空の目標は送信しない。MCPは`generate_chatgpt_world`の`mode: "goal"`から同じ処理を使う。本文、モデル、思考量、添付、generationIdは継続中も保持する。

各回は通常のPlan検証、Scene競合検出、編集、保存を通す。`production`があるGoalは同じ制作方針と回数上限を守り、完了条件を満たした後に空の追加計画を要求しない。`production`がない旧形式のGoalだけは、変更後に次の計画で見直す従来の処理を使う。各回のnative leaseとイベント購読を解放するループを使い、再帰呼び出しを積み重ねない。

`ChatgptSceneContext.goal`をnative側の制作指示へ反映する。本文の2000文字枠は維持し、目標本文へ内部指示を継ぎ足さない。目標に関係する改善だけを続け、完了済みの変更やEntityを重複させず、手動編集を保持する。構造と設定の見直しを、受信していない映像やPlayの確認として報告しない。IPCの追加項目はauthoring契約5以降で扱う。

進行状況と保存件数は同じ依頼へ集計し、Goalと見直し回数を画面・履歴・コピーに残す。質問待ちは`planned`として待機し、回答後もGoalを維持する。停止・エラーでは保存済みの変更を残し、後のQueueも保留する。作品・Sceneの変更では停止する。Studioの再起動後は既存の中断処理を使い、自動再開しない。

## 結果からのMaterial調整

`material-update`の公開結果には、`plan.objects[].materialAssetId`として正確なAsset IDを付ける。履歴へ保存するときもIDを検査して保持し、Material名から編集対象を推測しない。保存済みの`settings`や作業ログは当時の変更記録として保持する。

`ChatgptMaterialControls`は、現在のAsset ManifestにあるMaterialのpropertiesを正本として、完了した結果の「現在のMaterialを調整」にBase Color、Roughness、Metallicを表示する。同じMaterialへの複数の変更がある場合は最後の結果に一つ置く。変更は`VisualEditorPrototype`の既存`handleMaterialChange`へ渡し、通常の`updateMaterialAsset`、描画、編集履歴、自動保存を共用する。Base ColorではRGBだけを変更し、確定時のAlphaと未指定のテクスチャ・Shaderを保つ。UIだけの保存成功を表示しない。

対象がない結果、未完了・確認待ち・取り消し済みでは操作欄を出さず、Playやインポートなどで編集できない間は無効にする。手動調整は通常のUndoへ積む。後続の手動編集を上書きするAI依頼単位の取り消しは、既存checkpointの検査で拒否する。

## 結果からのScene設定の調整

Skybox・Fogを変更した公開結果には、`plan.objects[].sceneSettingsSections`へ実際に扱った節だけを記録する。値は`skybox`・`fog`に限定し、生成結果の名前や説明から対象を推測しない。履歴の保存・復元でも節を検査して保持する。同じ依頼で一つの節を複数回扱った場合、操作欄は最後の結果に一つ置く。

「現在のScene設定を調整」は、現在のSceneを正本としてSkyboxの表示・色・明るさ、IBL、Fogの有効・無効・色・距離を表示する。画像・Skybox Shaderの利用状態に応じて調整可能な項目を出す。IBLは利用できる画像がある場合だけ有効にし、Fogの開始距離・終了距離の関係も既存検証に従う。

変更はシーン設定の共通経路へ渡し、通常の検証、描画、Undo、自動保存を使う。未指定の設定とSkyboxの画像・Shaderを保持する。保存時の`settings`と作業ログは過去の記録として残し、現在値へ書き換えない。未完了・確認待ち・取り消し済みは操作欄を表示せず、Playや読み込み中は無効にする。

## 進行状況と作業ログ

現在の進行状況と同じ文が作業ログの末尾にある場合、表示上は進行状況の一箇所にまとめる。変更のない思考中の案内だけでは「作業の記録」の見出しを出さない。依頼中と履歴のどちらも保存イベントは保持し、APIや保存済み履歴からイベントを削除しない。具体的な作業名、変更前後の値、保存件数の記録を残す。

## モデルの制作と見直し

### R3Fの原本からSceneを制作する

契約9の`r3f-scene`は、`name`、完全なTSXの`source`、新規ならnull・更新なら既存ルートの`entityId`を持つ。モデルを使う設定が有効な場合、組み合わせで表現できる建物や街並みは、この経路を優先できる。Blenderの導入を必要としない。素材ストアを選んだ依頼では使わない。

コードはMonacoに同梱したTypeScriptで構文と許可範囲を検査し、既存のComponent取り込み処理で通常のEntityへ変換する。任意のJavaScriptは実行しない。ファイル直下の部品Component、静的なconst、props、配列のmap、基本形状、PBR値、直線のShapeの押し出しに対応する。押し出しはXY平面から+Z方向とし、`bevelEnabled: false`を明示する。Mesh内の子Object3Dも保持し、形状の寸法が子の配置へ誤って掛からないよう分離する。Textの静的な文字列・数値式は実際の文言として保存する。Reactの`key`は部品の識別にだけ使い、propsへ渡さない。フック、動的な処理、外部ファイル、保持できない形状・属性は拒否する。取り込みの警告も反映前のエラーとして扱い、一部だけ変換して成功にしない。Compilerの読み込み失敗は後続の依頼で再試行できるようにする。

原本はUTF-8で48,000バイト以下、1操作で1,024 Entity以下。新規ルートの`codeAuthoring`に原本、最初の依頼、版、安定した部品キー、生成時のEntityとMaterialを保存する。続きの推論には`authoredScenes`で最新の原本をそのまま渡す。原本が送信容量に入らないルートは更新対象にしない。複数原本の合計は48,000バイト、原本を含むresource全体は96KiB以下とする。Sceneに保存するだけの版更新は、制作の進展に数えない。

各部品には同じ親の中で重複しないnameかkeyを付ける。更新ではキーから同じEntityを特定し、生成時・現在値・新しい生成結果を比較する。Inspectorで変更したTransformの各値、Material、追加Component、子Entity、親の配置を保持する。手動で削除した部品も復活させない。手動変更のある部品を削除する場合や原本との対応が壊れた場合は、何も反映せず停止する。複製やHierarchy経由の受け渡しでは、原本の対応先も新しいルートへ変更する。以前のMaterialは、別SceneやPrefabでの再利用を保つため自動削除しない。

原本全体で一意な明示的keyは、親グループを移した場合やラッパーを追加した場合も、旧Entityに対応付ける。metadata v1には任意の`identityKey`を保持し、以前の原本は保存したソースから対応を復元する。繰り返す子部品のkeyは親の範囲で区別する。一意だったkeyが重複して対応を確定できなくなった場合や、描画の親子構造を変えることで手動の寸法・材質・子Entity・追加Componentが変わる場合は、元のSceneを保って停止する。現在は未使用の旧Materialも、対象ルート由来ならPlanの競合検査に含める。

この操作を含むPlanには、単体の家や部分編集でも`production`を必須とする。反映と保存の後、実際のSceneを2方向から確認する。未完了の項目だけを有限回の次の計画へ渡し、停止後の遅い応答は適用しない。個々の部品についてBlender制作や3方向のモデル確認を繰り返さない。編集・Play・公開は同じ形状とMaterialを使う。

### モデルの制作原本と部分修正

生成したModelには、初回の依頼、今回の依頼、制作指示、形状SpecをJSONで保存する。`ModelAsset.authoring`は原本のパス、SHA-256、版、直前のAsset IDを保持する。GLBと原本は同じAsset取り込みのトランザクションで保存し、両方の保存後にManifestへ反映する。原本は内容のハッシュを含むパスへ保存し、以前の版を上書きしない。GLBが同じバイト列でも、異なる制作原本の版は別のAssetとして残す。

続きの制作では、指定したEntityのMesh Renderer、または通常のモデル配置で作られた階層のルートから元のAssetを特定する。複数モデルやモデル内部の一部から推測しない。原本のハッシュ、版、GLBのハッシュを照合してから、初回の依頼と現在のSpecをモデルへ渡す。手動の再取り込みでGLBが変わった場合や原本が失われた場合は、古い形状から黙って再制作せず理由を表示する。

再制作の前に、モデル内部のEntity・Componentと取り込み時のMaterialも照合する。内部のTransform、名前、表示、材質割り当て、追加Componentを手動で変えた場合や、Modelの既定Materialを差し替え・解除した場合は、その編集を残して停止する。取り込み後にMaterialの値を編集した場合も同じ扱いとし、保存した原本へ自動では統合しない。元モデルのEntity全体のTransformと、ルートへ追加した通常の子Entityは保持して制作を続けられる。

形状の各パーツは安定した`id`を持つ。続きの修正では、変更しないパーツのIDと値を保ち、対象部分を編集する。同じSpecが返された場合は既存のModelを使い、Blenderの再実行や原本の版追加を省く。旧形式でIDがないパーツには、読み込み時に決定的なIDを割り当てる。`repeat`は同じパーツを指定間隔で繰り返し、`extrude`はXY平面の輪郭をZ方向へ押し出す。曲線、回転面、ベベル、PBR材質と組み合わせ、固定runnerがGLBを作る。SpecはUTF-8のJSONで400,000バイト以下とし、型、座標、輪郭、個数を検査する。

Hierarchyの選択範囲を書き出して別のWorldやItemへ追加する場合も、制作原本を含める。追加先の管理フォルダーへパスを変更しても、原本のバイト列とハッシュ、過去のAsset IDを示す履歴は保つ。履歴の親Assetは実行時の依存素材に含めない。生成した子EntityとComponentのIDは、新しいモデルルートに対応するIDへ変更する。

### 実際の描画を使ったモデルの見直し

モデル単体の制作では、新しい形状を通常のEditor経路で反映・保存した後、Studioの描画結果を3方向から取得する。初回の依頼、今回の依頼、制作指示、現在のSpecと画像を使い、輪郭、寸法、構造、材質を確認する。修正は最大2回、画像による確認は最大3回で終える。修正した版も反映・保存・再確認し、未確認の最後の版を確認済みとは報告しない。`environment`・`world`では、制作規模に合う全体の画像確認を使う。

同じ形状への修正が繰り返された場合や、確認・修正に失敗した場合は理由を表示して停止する。最後に保存できたモデルと原本は残す。見直し中に対象やその材質を手動編集した場合は、その編集を保って最新のSceneから考え直す。停止後は結果を確認し、次の依頼で続けられる。

Blenderの制作処理にも依頼の停止を伝える。停止後に遅れて届いた形状を取り込まず、保存済みのSceneへ追加しない。確認画像は実際のSceneの描画と画面効果を使い、素材の読み込みを待ってから取得する。

思考量の初期値は、対応しているモデルでは`low`を優先する。非対応ならcatalogの対応済み`defaultReasoningEffort`を使い、情報を確認できない場合は推論APIへ思考量を指定しない。MCPの`generate_chatgpt_world`で`reasoningEffort`を省略した場合も同じ選び方を使う。明示的な選択と保存済み設定は保持し、UIの「モデルの既定」を選んだ場合は推論APIへ明示指定しない。利用者が選んだ値は計画、形状制作、画像での見直しへ引き継ぐ。思考量の変更で制作上限や完成条件は減らさない。画像確認と修正にもChatGPTの利用枠を使い、追加の待ち時間がかかる。

## 検証

`pnpm typecheck`、`pnpm e2e:typecheck`、`cargo check --manifest-path src-tauri/Cargo.toml`を実行する。関連するnative試験は`cargo test --manifest-path src-tauri/Cargo.toml chatgpt::tests --lib`、制作の操作試験は`e2e/chatgpt-authoring-actions.spec.ts`にある。

Scene全体レビューのnative試験は`chatgpt::modeling::tests`、公開metadata cacheは`chatgpt::public_catalog::tests`、不変の入力ファイルは`authoring_context::tests`で確認する。`scripts/chatgpt-harness-context-archive.test.mjs`では参照発行前の保存・読戻し、変更された保存内容の拒否、一度だけのdispatchとその直前のScene確認、参照の型付き復元を検査する。進展と完成条件の試験では、変更なし・循環・手動編集の境界、欠落・重複・順序変更・部分的な承認を扱う。

試験では隔離したワールドを使う。最大件数のSchemaで列挙数と階層の上限、未知のID・未対応設定の拒否、手動編集の保持、削除の復元、質問中にSceneが変わらないことを確認する。`e2e/chatgpt-component-parity.spec.ts`では基本Componentの追加・設定・取り外し・復元、通常のMCP編集と保存値が一致すること、Skyboxの候補3件と各素材棚が送信容量内に収まることを確認する。実アカウントでの推論を行わない試験を、推論品質の確認済みとは扱わない。

`e2e/chatgpt-model-source-integrity.spec.ts`では、Blenderの実GLBを通常の取り込み処理へ渡し、原本との同時保存、失敗時の保持、Manifestの再読み込み、版の分離、GLBや原本の不一致の拒否、Hierarchy経由での原本の受け渡しを確認する。この試験は推論結果の見映えや速度を評価するものではない。

`scripts/chatgpt-model-integrity.test.mjs`は、小さなglTFバイナリを通常の取り込み・配置へ渡す。モデル内部や材質の手動編集の保護、ルートのTransformと通常の子Entityの保持、階層の展開・置き換え、転送先の新しいIDと原本の整合を確認する。実アカウントの推論や描画品質は、この試験の対象に含めない。

`blender-model`はentityIdとcomponentIdで配置済みPrimitiveのMesh Rendererを指定できる。置き換え時はposition・rotation・scaleをnullにし、既存Transformを保持する。対象未指定ではpositionが必須。取り込み後に通常の`set_entity_model`経路を使い、自動Colliderのフィットと既存モデル内部ノードの保護も共用する。Sceneの変更は一つの履歴として反映する。

`scene-settings`のsettingsJsonは部分的なScene設定。上位節とAsset参照を検査し、既存のupdate_scene_settingsで型・範囲・依存条件を検査する。指定された節だけをPlanの競合検出に含め、他の節は保持する。現在値はcurrentSettingsJsonとして送る。Skybox素材は従来の候補検証付き操作で選び、画像なしのIBLは生成操作だけ無効にする。

推論前にはchatgpt_authoring_contractで画面と本体の契約版を照合する。版はchatgpt-authoring-contract.jsonを共有する。受け渡しに互換性のない変更では版も更新し、Sceneデータや機能を黙って削って古い本体へ送らない。不一致時は再起動・更新と送信待ちの再試行を案内する。

Blenderモデルの初回Planには、`model: {name, brief}`として寸法・輪郭・構造・材質を記録する。`chatgpt_model_specs`は同じモデル・思考量・generationIdで詳細制作を最大2件並行し、完成した構造化形状をChannelへ送る。`chatgpt-model-stream.ts`は完成順に結果を渡し、authoring hostが通常のBlender runner・GLB分析・Assets保存・Scene更新を1件ずつ行う。処理終了時の戻り値でもChannelの遅延を補い、二重取り込みを防ぐ。同じEntityへの連続操作と非モデル操作の順番を保ち、独立したモデルの連続部分だけを完成順に反映する。途中失敗・停止・Scene競合では未完了の推論を中止し、保存済みの結果を保持する。

受信中の表示には、完全に受信できた最上位の`description`だけを「制作予定」として使う。途中のJSON、モデル形状、内部の推論イベントは表示・実行しない。全Planは従来どおり検証してから適用する。構成で表現できる形状はR3Fの静的変換を使い、必要な独自の形状にはBlenderを使える。Blenderの形状は固定Python runnerで作り、モデル応答の任意コードは実行しない。画像生成の自動呼び出しは未対応であり、UVのあるモデルへの通常のテクスチャ割り当てと区別する。

作業ログの具体的な項目名と値はchatgpt-change-description.tsで組み立てる。予定ログは部分patchとresolveSceneSettingsした現在値を比較し、保存ログは変更した節の適用後データを比較する。MCPで正規化したIBLや依存設定を、モデルが要求した値として誤記しない。chatgptOperationProgressは同じ説明を進行中と保存後の両方へ渡し、EntityのTransform回転はラジアンから度へ換算する。
