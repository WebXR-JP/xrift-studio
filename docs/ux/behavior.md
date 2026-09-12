# アニメーション・スクリプトの操作・状態設計

[機能一覧へ戻る](../UX_INTERACTIONS.md) / [共通の動き](./interactions.md)

<a id="f-22"></a>

## F-22 3Dモデルの Animation 再生

参照: MI-11, MI-13, MI-14, MI-35, MI-36, MI-54, MI-56, MI-60。保存形式と再生の詳細は [KHR_interactivity](../KHR_INTERACTIVITY_EDITOR.md#animation-belongs-to-the-graph) に従う。

- 操作前: 3Dモデルのクリップ一覧を確認する。キーフレームを新しく作る機能とは区別する。
- 操作中: クリップを持つ 3Dモデルの配置に合わせて、再生する Graph とグラフの実行を作る。再生順序・待機・繰り返しはグラフで編集する。
- 成功時: 動作確認と公開ワールドが同じグラフを使って再生する。保存後の再読み込みでもクリップの参照を保つ。
- 失敗時: クリップの欠落や未対応の operation を診断に表示し、編集対象へ戻れるようにする。
- 戻り先: グラフを閉じると 3Dモデルの設定へ戻る。停止時は動作確認の実行状態を破棄する。

<a id="f-28"></a>

## F-28 スクリプトとスクリプトのコンポーネントの状態設計

スクリプト編集はシーン・Graphと同じ領域のタブで行う（MI-69、MI-72）。左のスクリプト一覧には検索、ファイル名、パス、新規作成を置く。開いた直後は読み込み状態を示し、失敗時には再読み込みできる。シーンやGraphへ移っても編集中のコードと元に戻す履歴を保持する。別ファイルへの切り替えと閉じる操作では未保存変更を確認し、保存中は切り替えと閉じる操作を止める。保存後は同じコードへ戻り、動作確認中は該当オブジェクトへ反映する。

Graphとスクリプトの連携には明示的な `ctx.graph.on` / `ctx.graph.emit` を使う。同じシーン内の `event/send` / `event/receive` とイベント名を合わせると、双方向に処理を開始できる。連携は実行中だけの通知で、値の受け渡し、イベントの再送、コードとGraphの相互変換は行わない。停止・再起動・失敗時には購読を解除する。

参照: MI-03, MI-05, MI-09, MI-14, MI-69, MI-70, MI-71, MI-72, MI-73

### 操作前

- 素材 headerの常設追加から「新規スクリプト」を選べる。回転、追従、マテリアル、テクスチャ、パーティクル、3Dモデル表示、音源制御、ライト点滅、近接event送信、eventによるライト切替などの組み込みTemplateを用途別アイコンと元データ preview付きで同じdialogから確認する。選択オブジェクトがある場合はスクリプト作成とスクリプトのコンポーネント追加を一度に確定できる。XRift公式shortcutと競合するkeyboard操作は組み込みTemplateへ含めない。作成だけを選んだ場合も新しいスクリプトを素材で選択してスクリプト Editorを開く。選択中のスクリプトがある場合、コンポーネントを追加はそのスクリプトを参照する。
- スクリプトは素材でコードアイコンとTypeScript / TSXラベルを表示する。AI editor bridgeはスクリプト元データの取得、作成、更新、スクリプトのコンポーネントへの明示参照、動作確認 / 停止を同じEditor revision契約で提供する。
- スクリプト EditorのAPIガイドから、property、通常テクスチャ / 音声読み込み、保存済み音源 / ライト制御、world座標の近接event、テクスチャから継承する画像の繰り返しと補間 / Mipmap設定、`Render`での3Dモデル表示、マテリアルテクスチャ transform / パーティクル override、runtime-onlyと永続編集の違い、KTX2 previewとスクリプト typed loaderの境界を確認できる。
- スクリプトのコンポーネントは1つのオブジェクトへ複数付けられ、実行順がオブジェクト階層順とコンポーネント並び順で決まることを設定に示す。
- スクリプトを選ぶと、宣言したpropertyが設定へ型どおりに並ぶ。テクスチャなどの素材 propertyとオブジェクト propertyは選択結果を`assetReferences` / `entityReferences`へも入れる。宣言を読み取れないスクリプトは値を推測せず「propertyを読み取れません」と理由を示す。
- MCP clientは`get_scripting_capabilities`で利用可能な`ctx.assets` / `ctx.audioSources` / `ctx.lights` / `ctx.materials` / `ctx.particles`、実行環境 event、world座標とauthored オブジェクト参照の境界、テクスチャ / 音声 loader、各selector、実行環境一時操作と永続ライト / 音声 / テクスチャ / マテリアル toolの区別、近接送信からライト受信までのrecipeを取得する。`list_script_templates`、`create_script_asset(templateId)`、`apply_script_template`はUIと同じversion 5 catalogを使用する。
- アイテム projectでは重力とRigidBodyが動かないため、物理に触るAPIが未対応であることをスクリプトのdocumentと設定で示す。

### 操作中

- 動作確認の開始時にシーンが使うスクリプトをまとめて変換する。変換中は動作確認ボタンを「準備中」にして無効化し、編集表示のまま待たせる。
- 動作確認中もオブジェクトの追加・削除・複製・親変更・コンポーネント追加をauthoring dataへ保存して実行中のシーンへ差分同期する。回転速度、色などの宣言済みproperty値はスクリプトを再起動せず、同じinstanceの`ctx.props`へ次のframeから反映する。元データの保存、スクリプト参照、素材 / オブジェクト参照allowlist、コンポーネント構成の変更は、変換に成功した対象オブジェクトだけを再起動する。既存マテリアル / パーティクルのpropertyは設定とMCPから保存し、参照オブジェクトだけへ再反映する。MCPのシーン settings変更は共有シーンへ即時反映し、`update_texture_asset`はテクスチャを直接またはマテリアル / パーティクル経由で参照するオブジェクトだけを再起動する。テクスチャ元データの新規import、設定からのテクスチャ設定、設定でのマテリアル割り当ては停止まで無効にする。
- テクスチャ / 音声読み込みはスクリプトのコンポーネントで明示した素材だけを対象にし、スクリプト instance単位でcacheする。`loadTexture`で省略した色空間、wrap、filter、上下を反転する、Mipmapはテクスチャから継承する。`ctx.audioSources`と`ctx.lights`はオブジェクト自身のコンポーネントだけをselectorで選び、音声再生とライトの点灯・色・強度・Point / Spot距離をowner単位で合成する。マテリアル操作はオブジェクト自身のメッシュ clone、パーティクル操作はオブジェクト自身のEmitterへ限定する。子オブジェクト、別slot、別オブジェクト、共有素材を暗黙に変更しない。late mountされた元ファイル / ライト / メッシュ / Emitterにも同じ対象規則を適用する。
- `proximity-event`は明示したauthored オブジェクトを`getWorldPosition`で判定し、`xrift:proximity-state`のpayloadへchannel、inside状態、元データオブジェクト、`enter | exit | sync`を送る。edgeは境界遷移時だけ一度送り、syncはlive channelと後から起動したreceiverの状態同期に分ける。`event-light`はchannelごとのactive 元データを追跡する。実行環境 player / avatarは`ctx.find`へ公開せず、スクリプト eventは同じroot内だけでKHR_interactivityやdocumentへ暗黙接続しない。
- 動作確認は追加のスクリプト承認ダイアログを挟まず、保存済みの元データを読み込み、変換に成功してから開始する（MI-70）。UIとMCPで同じ手順を使い、スクリプトの更新後も再承認は求めない。準備中は編集を保ち、失敗した場合はConsoleから原因と対象fileを確認できる。スクリプトの来歴と元データ hashは診断情報として保持する。
- editorでの連続入力はhistoryへ積み増さず現在の項目を置き換える。保存はスクリプト元データ fileだけを書く。

### 成功時

- 全スクリプトを変換できた時だけ動作確認へ入る。スクリプト EditorのConsoleから実行結果を確認でき、新しい実行環境 failureでは自動的にConsoleを開く。
- 動作確認中の保存では、そのスクリプトを使うオブジェクトだけが作り直される。反映したオブジェクト数を短く示し、player位置、camera、physicsは保持する。
- property値の変更は回転速度、ライト点滅速度、近接半径、channelなどの実行状態を維持したまま即時に見た目へ反映する。`ctx.audioSources`、`ctx.lights`、`ctx.materials`、`ctx.particles`の変更は動作確認中に確認でき、authoring data自体は変更しない。ライトの永続scalar変更は既存実行環境へ反映し、ライト種別やコンポーネント構造だけ対象オブジェクトを再起動する。
- 公開ではstagingへスクリプト元データと adapterを出力し、生成した`src/World.tsx`または`src/Item.tsx`から静的importする。シーン subtreeを動作確認と同じ`XriftScriptRoot`で包み、同じ`XriftScriptHost`へproperty、実行順、素材 / オブジェクト参照resolver、任意の`Render` exportを渡す。出力先pathをcompile結果に残す。

### 失敗時

- 変換に失敗したら動作確認へ入らず、file名、行、列、原因を一覧で示して該当行へ移動できるようにする。壊れたシーンを再生しない。
- host管理下のlifecycle、event、React renderで起きた実行時例外はそのスクリプトだけを停止し、オブジェクト ID、スクリプト名、phase、例外文をスクリプト Consoleへ残す。シーンとほかのオブジェクトは動かし続ける。`ctx.lifecycle` を使わずに開始したPromise / timer / pointer callbackの例外帰属、元データ mapによる行・列、同一例外の件数集約は未対応として扱う。
- 動作確認中の保存で変換に失敗した場合は、直前に動いていたスクリプトを走らせ続け、失敗をConsoleへ残す。
- 未宣言または存在しない素材 IDでは`ctx.assets.url`が`null`になり、`loadTexture`も`null`を返す。URLを解決できても通常画像としてdecodeできないテクスチャでは`loadTexture`だけが`null`になる。スクリプトは処理を続けるか`ctx.log`で理由を残し、シーン全体を停止しない。
- `ctx.assets.loadTexture`でKTX2、HDR、EXR、マテリアルを直接読み込めるようには見せない。マテリアル / パーティクル previewのproject KTX2はlocal Basis transcoder、OpenBrush builtin テクスチャは同梱URLを使う別経路であり、スクリプト用typed loaderは今後必要であることを示す。
- XRift Studio stdio MCP editor tools / serverはスクリプトの作成・読取・更新、スクリプトのコンポーネント追加、動作確認切替、propertyと明示参照の更新に加え、動作確認中のオブジェクト / コンポーネント変更を同じrevision検査と差分同期経路で実行する。近接ライト recipeはsensor / target / receiverを解決し、`proximity-event`へtarget参照、receiverへ`core.light.*`と`event-light`、両スクリプトへ同じchannelを設定する。動作確認は追加承認なしで保存済みスクリプトを変換し、変換失敗時には開始しない。永続ライト編集は`core.light.*`のadd / update / remove、音声編集は`import_audio_asset`、`place_asset`、`core.audio-source`のadd / update / remove、ほかの素材編集も専用toolへ分離する。
- `pnpm tauri:dev`のdebug buildだけに登録するprivileged Tauri MCP bridgeは、webview JavaScript実行とTauri commandの`invoke`を許す開発者向けautomationであり、上記stdio editor toolのtrust boundary外とする。release buildには同bridgeを登録・搭載せず、公開された承認経路として扱わない。
- `https://`から始まるmoduleを読むスクリプトと、実行環境 JSON出力を選んだ場合はupload前にblockingとして示し、対象スクリプトと理由を挙げる。
- 取り込み由来のScriptも追加承認なく変換・実行する。変換失敗時はPlayを開始せず、Consoleに対象と理由を示す。

### 戻り先

- 変換失敗時は編集のままスクリプト editorの該当行へ戻る。修正して同じ動作確認操作から再試行できる。
- 実行時例外では該当行への移動、そのスクリプトの再開、停止のいずれかへ到達できる。
- 停止は生成したmoduleとblob URL、timer、listener、読み込んだテクスチャ、マテリアル枠所有のテクスチャ clone、独立音声 playerを破棄し、実行環境音源 / ライト / マテリアル / パーティクル overrideを元へ戻す。動作確認中に設定 / MCPで保存したauthoring dataは残し、編集の選択とcameraへ戻る。
- 公開のblockingでは該当スクリプト、またはUpload reviewへ戻り、修正後に同じreviewを再確認できる。

完了条件: スクリプトをTypeScriptで書く。共通Template catalogから元データ preview付きで作成する。オブジェクトへスクリプトのコンポーネントとして複数付けられる。宣言したpropertyが設定へ自動で並ぶ。素材参照とオブジェクト参照を選べる。動作確認中のpropertyは再起動なしで次のframeへ反映する。明示参照した基本テクスチャ / 音声、オブジェクト自身の音源 / ライト / マテリアル / パーティクルをowner単位で操作できる。明示参照オブジェクトのworld座標近接を実行環境 eventへつなぐ。ライト等の視覚効果をchannelで接続できる。オブジェクト / コンポーネント構成と対応するauthoring propertyは永続化する。ライト scalarは既存実行環境へ反映する。それ以外は影響オブジェクトだけを再同期する。実行時例外は該当スクリプトだけを止める。同じhost、root、音声 / ライト / パーティクル実行環境、参照resolverを公開ワールドへ静的importとして出力する。MCPも同じTemplate、参照契約、revision検査で作成・編集・適用・実行できる。

<a id="f-38"></a>

## F-38 操作のトリガーの状態設計

Interactableで包むGLBは、読み込み後やモデルの差し替え後も照準の判定対象へ追加する。Edit・Play・公開用出力は共通のレイヤー追従処理を使い、公式Interactableの登録・enabled・コールバックを保つ。未読み込み中は反応せず、読み込み後は届く距離で照準が反応してクリックできる。無効化・取り外し後は反応を解除する。モデルの当たり判定は描画メッシュを使うため、インタラクトのためだけにColliderを追加する必要はない。

参照: MI-05, MI-09, MI-11, MI-14, MI-25, MI-60, MI-89

### 操作前

- コンポーネントを追加のInteractionカテゴリに「グラフの実行」を置く。ノードグラフが一つもない場合は追加と同時に作成し、「操作されたとき」だけを置いたGraphをノードエディターで開く。
- 設定のカードには対象Graphの選択、Graphを開く操作、押したときの動きの一覧を出す。操作を受け付けるが付いていないオブジェクトでは「押せない」ことと追加操作を先に示し、動作確認後に気づかせない。
- ノードエディターのパレットは「操作されたとき」をイベント、「プロパティを変える」「プロパティを切り替える」をオブジェクトの操作として並べる。追加直後のactionは対象未設定であることを診断に出す。

### 処理中

- action ノードを選ぶと、オブジェクト、コンポーネント、プロパティを現在のシーンから選ぶ。コンポーネントを変えるとプロパティは新しい対象で有効なものへ置き換え、値接続口の型も一緒に書き換える。
- 値はプロパティの型で編集する。ON/OFFはチェックボックス、数値は範囲付きの入力、色はカラー選択欄、再生状態は選択肢で示し、生のfloat配列を直接編集させない。
- 未設定、対象が見つからない、ON/OFF以外への切り替えは、保存を止めずに警告として問題の一覧へ出す。canonical JSONからは削除しない。

### 成功時

- ノードカードには「Speaker / 音源の再生を再生にする」のように対象と結果を書く。設定の一覧も同じ文で、Graphを開かずに何が起きるか分かる状態にする。
- 動作確認では公式操作を受け付けるの登録をStudioがレイキャストし、押したときに音源、ライト、オブジェクトの表示へ適用する。公開ワールドは同じ実行環境 moduleとcanonical graphを出力し、動作確認と同じ結果になる。
- Triggerが表示を戻すオブジェクトは、無効なままでも非表示の状態で公開ワールドへ出力する。

### 失敗時

- Graph未設定、参照先素材欠落、操作のイベントがないGraphは公開時に診断を出し、Runtime JSON出力では実行できないためblockingにする。
- 動作確認中の適用は実行時のみで、停止すると元の値へ戻る。物理コライダーはオブジェクトの表示と別で、Triggerでは変えない。

### 戻り先

- ノードエディターを閉じると同じオブジェクトの設定へ戻る。設定の「開く」から同じGraphへ再び到達できる。
- 変更は元に戻すとAutosaveの対象で、Graphの保存は素材へ入り、同じGraphを使う他のオブジェクトにも反映される。

完了条件: オブジェクトへグラフの実行を付ける。公式操作を受け付けるで押したときに別オブジェクトやそのコンポーネントのプロパティを変えられる。対象、コンポーネント、プロパティ、値はノードエディターのシーンから選ぶ。設定には押したときの動きが一覧で残る。動作確認、公開ワールド、MCPは同じcanonical graphと同じ適用経路を使う。

### F-28 Vehicle / Seat の追加と確認（MI-69、MI-72）

新規スクリプトの既存ダイアログにVehicleとSeatを置く。選択前に説明とTSXを確認でき、
作成中は二重操作を防ぎ、成功後はAssetsとコードエディターから作成したScriptへ戻れる。
追加先EntityのInspectorで速度などを変更し、通常のScript Componentの削除で外せる。
作成失敗時はダイアログにエラーを残し、名前と選択内容を保って再試行する。
World Playの座席クリックで着席し、WASDを公式の運転入力へ渡す。Spaceで降車し、
Stopでは占有状態と移動中の車体を破棄する。キーボード入力欄とフォーカス喪失時には操縦を続けない。
このテンプレートは独自のキーバインドを追加せず、公式Seatの入力を利用する。
