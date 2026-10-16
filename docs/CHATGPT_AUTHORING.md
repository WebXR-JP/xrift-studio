# ChatGPT制作機能の拡張

Studio内のChatGPTは、利用できる操作とComponent定義を読み、構造化したPlanを返す。実行は通常のEditor操作を通し、モデルの出力でScene文書を直接置換しない。

Studioの制作チャットは、送信すると編集を進める。UIにはPlanの切り替えを置かず、下書きに制作モードを保存しない。Queueへ追加するときと送信するときの両方で`mode: "build"`を指定し、以前の`mode: "plan"`予約も直接編集として送る。MCP/APIの`mode: "plan"`と`apply_chatgpt_plan`は維持する。外部から作られた確認待ちをStudioで開いた場合は「変更を反映」「変更を破棄」を表示する。

## 操作の定義と実行

- `src/lib/visual-editor/chatgpt-editor-actions.json`に、拡張操作の名前、表示名、必要な能力、入力Schemaを置く。TypeScriptの入力キー検査とRustの推論用JSON Schemaが同じファイルを使う。
- `chatgpt-editor-actions.ts`に型、入力検査、実行ハンドラーを追加する。ハンドラーは固定したEditor toolを呼ぶ。未知の操作やフィールドは拒否する。モデルが任意のtool名、コマンド、実行コードを渡す方式にはしない。
- `chatgpt-plan-guards.ts`でPlanの説明と変更対象を記録する。削除は配下全体と親Entityを保護し、推論・反映中の手動変更を上書きしない。
- `App.tsx`は各操作の結果を一つの変更として反映・保存し、保存済みの結果だけを進捗へ加える。失敗した操作を完了扱いにしない。

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

## Materialの候補と変更範囲

Materialを見比べたい依頼では、十分な素材があるとき6〜12候補を、対象の用途・色・質感・照明に合う順で提案する。候補IDと実プレビューを持つ質問で選択を待つ。通常の表面にSkybox Shaderを勧めない。

単体、明示した一部、全体の依頼を区別する。Entityの名前・選択・添付がある場合は、その対象への`material`割り当てを使い、元の共有Material自体を変更しない。複数対象を同じ候補へ強制せず、対象ごとに候補を選ぶか、利用者が希望した配色の組み合わせを確認する。全体への変更は全体が依頼された場合だけ行う。範囲が不明なら公開名で確認し、回答前に編集しない。

全体への一括変更を依頼された場合は、Scene全体に使う候補を一度だけ確認する。Entityごとの質問へ分けず、選択後は`material-scene`の1操作で適用する。現在のSceneの有効なMesh Rendererを列挙し、全スロットとModelの部分Entityの割り当てを既存MCPの`set_material`経路で変更する。対象が32件を超えても、Planの操作件数や1回の保存を分割しない。元の共有Material、形状、配置を保ち、依頼単位で一括して戻せる。確認待ちの間にSceneが変わった場合は最新状態で再確認する。

AssetsのMaterial自体の設定変更を依頼された場合は、従来どおり`material-update`で同じAssetを編集し、参照するEntityにも反映されることを説明する。Entityへの候補の割り当てと、共有Asset自体の編集を混同しない。

## 次の依頼の候補

接続済みで入力欄が空のとき、直前の完了結果と現在の添付Entity・Materialから、入力欄に依頼文の候補を1件だけ表示する。候補の作成に推論APIを追加で呼ばない。取り込み時に入力欄へ文面を入れ、対象IDを通常の添付へ引き継ぐ。Scene・Assetsの編集と送信は、利用者が内容を確認して送信するまで始めない。

入力欄が空で変換中ではないとき、修飾キーなしのTabで候補を取り込む。Escapeか候補横の閉じるボタンで非表示にし、同じ結果・添付では閉じた状態を保つ。↑・↓、Shift+Tab、IME変換、入力途中のキー操作は通常どおり扱う。取り込んだ文面は編集でき、Enterで通常の送信経路へ渡す。

処理中、送信待ちあり、未接続、質問・変更内容の確認待ち、失敗・停止・取り消し後は候補を表示しない。候補を3ページの確認質問と混同しないよう、質問中はそのフォームのTab・Space操作を維持する。候補に含む対象も、通常の添付と同じScene・Materialの存在確認、上限、Queue、送信直前の検証を通す。

## Goalの継続制作

`/goal 目標`は`chatgpt-goal.ts`でコマンドと本文を分け、Queueへ`mode: "goal"`として渡す。空の目標は送信しない。MCPは`generate_chatgpt_world`の`mode: "goal"`から同じ処理を使う。本文、モデル、思考量、添付、generationIdは継続中も保持する。

各回は通常のPlan検証、Scene競合検出、編集、保存を通す。保存後に最新のScene・素材・Prefabのsnapshotを比較し、変更があれば`hasMore`がfalseでも次の見直しへ進む。変更がなく、残りの作業もないときに完了する。回数や時間による一律の終了は設けず、変更なしの`hasMore: true`が3回続いた場合はエラーとして停止する。各回のnative leaseとイベント購読を解放するループを使い、再帰呼び出しを積み重ねない。

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

## 検証

`pnpm typecheck`、`pnpm e2e:typecheck`、`cargo check --manifest-path src-tauri/Cargo.toml`を実行する。関連するnative試験は`cargo test --manifest-path src-tauri/Cargo.toml chatgpt::tests --lib`、制作の操作試験は`e2e/chatgpt-authoring-actions.spec.ts`にある。

試験では隔離したワールドを使う。最大件数のSchemaで列挙数と階層の上限、未知のID・未対応設定の拒否、手動編集の保持、削除の復元、質問中にSceneが変わらないことを確認する。`e2e/chatgpt-component-parity.spec.ts`では基本Componentの追加・設定・取り外し・復元、通常のMCP編集と保存値が一致すること、Skyboxの候補3件と各素材棚が送信容量内に収まることを確認する。実アカウントでの推論を行わない試験を、推論品質の確認済みとは扱わない。

`blender-model`はentityIdとcomponentIdで配置済みPrimitiveのMesh Rendererを指定できる。置き換え時はposition・rotation・scaleをnullにし、既存Transformを保持する。対象未指定ではpositionが必須。取り込み後に通常の`set_entity_model`経路を使い、自動Colliderのフィットと既存モデル内部ノードの保護も共用する。Sceneの変更は一つの履歴として反映する。

`scene-settings`のsettingsJsonは部分的なScene設定。上位節とAsset参照を検査し、既存のupdate_scene_settingsで型・範囲・依存条件を検査する。指定された節だけをPlanの競合検出に含め、他の節は保持する。現在値はcurrentSettingsJsonとして送る。Skybox素材は従来の候補検証付き操作で選び、画像なしのIBLは生成操作だけ無効にする。

推論前にはchatgpt_authoring_contractで画面と本体の契約版を照合する。版はchatgpt-authoring-contract.jsonを共有する。受け渡しに互換性のない変更では版も更新し、Sceneデータや機能を黙って削って古い本体へ送らない。不一致時は再起動・更新と送信待ちの再試行を案内する。

Blenderモデルの初回Planには、`model: {name, brief}`として寸法・輪郭・構造・材質を記録する。`chatgpt_model_specs`は同じモデル・思考量・generationIdで詳細制作を最大2件並行し、完成した構造化形状をChannelへ送る。`chatgpt-model-stream.ts`は完成順に結果を渡し、Appが通常のBlender runner・GLB分析・Assets保存・Scene更新を1件ずつ行う。処理終了時の戻り値でもChannelの遅延を補い、二重取り込みを防ぐ。同じEntityへの連続操作と非モデル操作の順番を保ち、独立したモデルの連続部分だけを完成順に反映する。途中失敗・停止・Scene競合では未完了の推論を中止し、保存済みの結果を保持する。

受信中の表示には、完全に受信できた最上位の`description`だけを「制作予定」として使う。途中のJSON、モデル形状、内部の推論イベントは表示・実行しない。全Planは従来どおり検証してから適用する。家具・小物の完成品にはモデルを使い、SceneのPrimitiveは明示された下案や単純な面に限る方針を推論指示に含める。生成した形状は固定Python runnerで作り、モデル応答の任意コードは実行しない。画像生成の自動呼び出しは未対応であり、UVのあるモデルへの通常のテクスチャ割り当てと区別する。

作業ログの具体的な項目名と値はchatgpt-change-description.tsで組み立てる。予定ログは部分patchとresolveSceneSettingsした現在値を比較し、保存ログは変更した節の適用後データを比較する。MCPで正規化したIBLや依存設定を、モデルが要求した値として誤記しない。chatgptOperationProgressは同じ説明を進行中と保存後の両方へ渡し、EntityのTransform回転はラジアンから度へ換算する。
