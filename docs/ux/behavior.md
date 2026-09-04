# アニメーション・スクリプトの操作・状態設計

[機能一覧へ戻る](../UX_INTERACTIONS.md) / [共通の動き](./interactions.md)

<a id="f-22"></a>

## F-22 Model の Animation 再生

参照: MI-11, MI-13, MI-14, MI-35, MI-36, MI-54, MI-56, MI-60。保存形式と再生の詳細は [KHR_interactivity](../KHR_INTERACTIVITY_EDITOR.md#animation-belongs-to-the-graph) に従う。

- 操作前: Model の clip 一覧を確認する。keyframe を新しく作る機能とは区別する。
- 操作中: clip を持つ Model の配置に合わせて、再生する Graph と Interaction Trigger を作る。再生順序・待機・繰り返しはグラフで編集する。
- 成功時: Play と公開ワールドが同じグラフを使って再生する。保存後の再読み込みでも clip の参照を保つ。
- 失敗時: clip の欠落や未対応の operation を診断に表示し、編集対象へ戻れるようにする。
- 戻り先: グラフを閉じると Model の Inspector へ戻る。停止時は Play の実行状態を破棄する。

<a id="f-28"></a>

## F-28 Script AssetとScript Componentの状態設計

参照: MI-03, MI-05, MI-09, MI-14, MI-69, MI-70, MI-71, MI-72, MI-73

### 操作前

- Assets headerの常設Createから「新規Script」を選べる。回転、追従、Material、Texture、Particle、Model表示、Audio Source制御、Light点滅、近接event送信、eventによるLight切替などの組み込みTemplateを用途別アイコンとsource preview付きで同じdialogから確認する。選択Entityがある場合はScript Asset作成とScript Component追加を一度に確定できる。XRift公式shortcutと競合するkeyboard操作は組み込みTemplateへ含めない。作成だけを選んだ場合も新しいScriptをAssetsで選択してScript Editorを開く。選択中のScriptがある場合、Add ComponentはそのScript Assetを参照する。
- Script AssetはAssetsでコードアイコンとTypeScript / TSXラベルを表示する。AI editor bridgeはScript sourceの取得、作成、更新、Script Componentへの明示参照、Play / Stopを同じEditor revision契約で提供する。
- Script EditorのAPIガイドから、property、通常Texture / Audio読み込み、保存済みAudio Source / Light制御、world座標の近接event、Texture Assetから継承するSampler / Mipmap設定、`Render`でのModel表示、Material Texture transform / Particle override、runtime-onlyと永続編集の違い、KTX2 previewとScript typed loaderの境界を確認できる。
- Script Componentは1つのEntityへ複数付けられ、実行順がEntity階層順とComponent並び順で決まることをInspectorに示す。
- Script Assetを選ぶと、宣言したpropertyがInspectorへ型どおりに並ぶ。TextureなどのAsset propertyとEntity propertyは選択結果を`assetReferences` / `entityReferences`へも入れる。宣言を読み取れないScriptは値を推測せず「propertyを読み取れません」と理由を示す。
- MCP clientは`get_scripting_capabilities`で利用可能な`ctx.assets` / `ctx.audioSources` / `ctx.lights` / `ctx.materials` / `ctx.particles`、runtime event、world座標とauthored Entity参照の境界、Texture / Audio loader、各selector、runtime一時操作と永続Light / Audio / Texture / Material toolの区別、近接送信からLight受信までのrecipeを取得する。`list_script_templates`、`create_script_asset(templateId)`、`apply_script_template`はUIと同じversion 5 catalogを使用する。
- Item projectでは重力とRigidBodyが動かないため、物理に触るAPIが未対応であることをScriptのdocumentとInspectorで示す。

### 操作中

- Playの開始時にSceneが使うScriptをまとめて変換する。変換中はPlayボタンを「準備中」にして無効化し、Edit表示のまま待たせる。
- Play中もEntityの追加・削除・複製・親変更・Component追加をauthoring dataへ保存して実行中のSceneへ差分同期する。回転速度、色などの宣言済みproperty値はScriptを再起動せず、同じinstanceの`ctx.props`へ次のframeから反映する。sourceの保存、Script Asset参照、Asset / Entity参照allowlist、Component構成の変更は、変換に成功した対象Entityだけを再起動する。既存Material / Particle AssetのpropertyはInspectorとMCPから保存し、参照Entityだけへ再反映する。MCPのScene settings変更は共有Scene viewへ即時反映し、`update_texture_asset`はTextureを直接またはMaterial / Particle経由で参照するEntityだけを再起動する。Texture sourceの新規import、InspectorからのTexture設定、InspectorでのMaterial割り当ては停止まで無効にする。
- Texture / Audio読み込みはScript Componentで明示したAssetだけを対象にし、Script instance単位でcacheする。`loadTexture`で省略した色空間、wrap、filter、Flip Y、MipmapはTexture Assetから継承する。`ctx.audioSources`と`ctx.lights`はEntity自身のComponentだけをselectorで選び、Audio再生とLightの点灯・色・強度・Point / Spot距離をowner単位で合成する。Material操作はEntity自身のMesh clone、Particle操作はEntity自身のEmitterへ限定する。子Entity、別slot、別Entity、共有Assetを暗黙に変更しない。late mountされたSource / Light / Mesh / Emitterにも同じ対象規則を適用する。
- `proximity-event`は明示したauthored Entityを`getWorldPosition`で判定し、`xrift:proximity-state`のpayloadへchannel、inside状態、source Entity、`enter | exit | sync`を送る。edgeは境界遷移時だけ一度送り、syncはlive channelと後から起動したreceiverの状態同期に分ける。`event-light`はchannelごとのactive sourceを追跡する。runtime player / avatarは`ctx.find`へ公開せず、Script eventは同じroot内だけでKHR_interactivityやdocumentへ暗黙接続しない。
- 未承認fingerprintを含むprojectのPlayでは、実行前に対象file、来歴、言語、完全なhash、読み取り専用sourceと、実行環境がアプリと同一で完全な分離ではないことを示して許可を求める。承認はproject外のapp dataへ保存し、project documentが自己承認できないようにする。
- editorでの連続入力はhistoryへ積み増さず現在の項目を置き換える。保存はScript source fileだけを書く。

### 成功時

- 全Scriptを変換できた時だけPlayへ入る。Script EditorのConsoleから実行結果を確認でき、新しいruntime failureでは自動的にConsoleを開く。
- Play中の保存では、そのScriptを使うEntityだけが作り直される。反映したEntity数を短く示し、player位置、camera、physicsは保持する。
- property値の変更は回転速度、Light点滅速度、近接半径、channelなどの実行状態を維持したまま即時に見た目へ反映する。`ctx.audioSources`、`ctx.lights`、`ctx.materials`、`ctx.particles`の変更はPlay中に確認でき、authoring data自体は変更しない。Lightの永続scalar変更は既存runtimeへ反映し、Light種別やComponent構造だけ対象Entityを再起動する。
- 公開ではstagingへScript sourceと adapterを出力し、生成した`src/World.tsx`または`src/Item.tsx`から静的importする。Scene subtreeをPlayと同じ`XriftScriptRoot`で包み、同じ`XriftScriptHost`へproperty、実行順、Asset / Entity参照resolver、任意の`Render` exportを渡す。出力先pathをcompile結果に残す。

### 失敗時

- 変換に失敗したらPlayへ入らず、file名、行、列、原因を一覧で示して該当行へ移動できるようにする。壊れたSceneを再生しない。
- host管理下のlifecycle、event、React renderで起きた実行時例外はそのScriptだけを停止し、Entity ID、Script名、phase、例外文をScript Consoleへ残す。Scene Viewとほかの Entity は動かし続ける。`ctx.lifecycle` を使わずに開始したPromise / timer / pointer callbackの例外帰属、source mapによる行・列、同一例外の件数集約は未対応として扱う。
- Play中の保存で変換に失敗した場合は、直前に動いていたScriptを走らせ続け、失敗をConsoleへ残す。
- 未宣言または存在しないAsset IDでは`ctx.assets.url`が`null`になり、`loadTexture`も`null`を返す。URLを解決できても通常画像としてdecodeできないTextureでは`loadTexture`だけが`null`になる。Scriptは処理を続けるか`ctx.log`で理由を残し、Scene全体を停止しない。
- `ctx.assets.loadTexture`でKTX2、HDR、EXR、Material Assetを直接読み込めるようには見せない。Material / Particle previewのproject KTX2はlocal Basis transcoder、OpenBrush builtin Textureは同梱URLを使う別経路であり、Script用typed loaderは今後必要であることを示す。
- XRift Studio stdio MCP editor tools / serverはScript Assetの作成・読取・更新、Script Component追加、Play切替、propertyと明示参照の更新に加え、Play中のEntity / Component変更を同じrevision検査と差分同期経路で実行する。近接Light recipeはsensor / target / receiverを解決し、`proximity-event`へtarget参照、receiverへ`core.light.*`と`event-light`、両Scriptへ同じchannelを設定する。このserverはScriptを承認できず、未承認時は`SCRIPT_APPROVAL_REQUIRED`を返す。永続Light編集は`core.light.*`のadd / update / remove、Audio編集は`import_audio_asset`、`place_asset`、`core.audio-source`のadd / update / remove、ほかのAsset編集も専用toolへ分離する。
- `pnpm tauri:dev`のdebug buildだけに登録するprivileged Tauri MCP bridgeは、webview JavaScript実行とTauri commandの`invoke`を許す開発者向けautomationであり、上記stdio editor toolのtrust boundary外とする。release buildには同bridgeを登録・搭載せず、公開された承認経路として扱わない。
- `https://`から始まるmoduleを読むScriptと、runtime JSON出力を選んだ場合はupload前にblockingとして示し、対象Scriptと理由を挙げる。
- 許可しなかった取り込み由来のScriptは実行せずPlayへ入り、無効であることをConsoleへ残す。

### 戻り先

- 変換失敗時はEditのままScript editorの該当行へ戻る。修正して同じPlay操作から再試行できる。
- 実行時例外では該当行への移動、そのScriptの再開、Stopのいずれかへ到達できる。
- Stopは生成したmoduleとblob URL、timer、listener、読み込んだTexture、Material slot所有のTexture clone、独立Audio playerを破棄し、runtime Audio Source / Light / Material / Particle overrideを元へ戻す。Play中にInspector / MCPで保存したauthoring dataは残し、Editの選択とcameraへ戻る。
- 公開のblockingでは該当Script、またはUpload reviewへ戻り、修正後に同じreviewを再確認できる。

完了条件: Script AssetをTypeScriptで書く。共通Template catalogからsource preview付きで作成する。EntityへScript Componentとして複数付けられる。宣言したpropertyがInspectorへ自動で並ぶ。Asset参照とEntity参照を選べる。Play中のpropertyは再起動なしで次のframeへ反映する。明示参照した基本Texture / Audio、Entity自身のAudio Source / Light / Material / Particleをowner単位で操作できる。明示参照Entityのworld座標近接をruntime eventへつなぐ。Light等の視覚効果をchannelで接続できる。Entity / Component構成と対応するauthoring propertyは永続化する。Light scalarは既存runtimeへ反映する。それ以外は影響Entityだけを再同期する。実行時例外は該当Scriptだけを止める。同じhost、root、Audio / Light / Particle runtime、参照resolverを公開ワールドへ静的importとして出力する。MCPも同じTemplate、参照契約、revision検査で作成・編集・適用・実行できる。

<a id="f-38"></a>

## F-38 インタラクトのトリガーの状態設計

参照: MI-05, MI-09, MI-11, MI-14, MI-25, MI-60, MI-89

### 操作前

- Add ComponentのInteractionカテゴリに「Interaction Trigger」を置く。Interactivity Graphが一つもない場合は追加と同時に作成し、「インタラクトされたとき」だけを置いたGraphをノードエディタで開く。
- Inspectorのカードには対象Graphの選択、Graphを開く操作、押したときの動きの一覧を出す。Interactableが付いていないEntityでは「押せない」ことと追加操作を先に示し、Play後に気づかせない。
- ノードエディタのパレットは「インタラクトされたとき」をイベント、「プロパティを変える」「プロパティを切り替える」をEntity操作として並べる。追加直後のactionは対象未設定であることを診断に出す。

### 処理中

- action nodeを選ぶと、Entity、Component、プロパティを現在のSceneから選ぶ。Componentを変えるとプロパティは新しい対象で有効なものへ置き換え、値socketの型も一緒に書き換える。
- 値はプロパティの型で編集する。ON/OFFはチェックボックス、数値は範囲付きの入力、色はカラーピッカー、再生状態は選択肢で示し、生のfloat配列を直接編集させない。
- 未設定、対象が見つからない、ON/OFF以外への切り替えは、保存を止めずに警告としてDiagnosticsへ出す。canonical JSONからは削除しない。

### 成功時

- ノードカードには「Speaker / Audio Source の 再生 を 再生 にする」のように対象と結果を書く。Inspectorの一覧も同じ文で、Graphを開かずに何が起きるか分かる状態にする。
- Playでは公式Interactableの登録をStudioがレイキャストし、押したときにAudio Source、Light、Entityの表示へ適用する。公開ワールドは同じruntime moduleとcanonical graphを出力し、Playと同じ結果になる。
- Triggerが表示を戻すEntityは、無効なままでも非表示の状態で公開ワールドへ出力する。

### 失敗時

- Graph未設定、参照先Asset欠落、インタラクトのイベントがないGraphは公開時に診断を出し、Runtime JSON出力では実行できないためblockingにする。
- Play中の適用は実行時のみで、Stopすると元の値へ戻る。物理コライダーはEntityの表示と別で、Triggerでは変えない。

### 戻り先

- ノードエディタを閉じると同じEntityのInspectorへ戻る。Inspectorの「開く」から同じGraphへ再び到達できる。
- 変更はUndoとAutosaveの対象で、Graphの保存はAssetへ入り、同じGraphを使う他のEntityにも反映される。

完了条件: EntityへInteraction Triggerを付ける。公式Interactableで押したときに別Entityやそのコンポーネントのプロパティを変えられる。対象、コンポーネント、プロパティ、値はノードエディタのSceneから選ぶ。Inspectorには押したときの動きが一覧で残る。Play、公開ワールド、MCPは同じcanonical graphと同じ適用経路を使う。
