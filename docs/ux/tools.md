# AI 接続・診断・録画の操作・状態設計

[機能一覧へ戻る](../UX_INTERACTIONS.md) / [共通の動き](./interactions.md)

<a id="f-17"></a>

## F-17 AI editor integration / MCP の状態設計

### 操作前

- AI connectionパネルは、対応clientをXRift Studio MCPへワンクリック登録できること、現在Sceneを会話から読み取り・編集できること、AIの変更も通常のUndoと自動保存へ入ることを、登録前に読める位置で説明する。
- EditorのAI連携panelはCodex、Claude Code、Claude Desktop / Cowork、OpenCode、Cursorの検出結果、登録scope、XRift Studio MCP serverの状態を表示する。Codexは現在の`PATH`に加えて、公式installer、Codex app同梱CLI、npm、pnpm、WinGet、Homebrew、standalone installerの標準配置を確認する。起動時の環境変数が古い場合も再起動なしで検出する。OllamaはMCP client一覧へ混在させない。ローカルmodel providerとしてinstall状態、version、model一覧、構成先clientを別sectionに表示する。native APIがないブラウザでは登録済みに見せない。「デスクトップ版で利用できます」と示す。Claude Desktop / Coworkはローカルsessionだけを対象にする。remote CoworkではローカルMCPを起動できないことを登録前に示す。
- MCPは現在開いているvisual projectだけを候補にする。project ID、Scene ID、session revisionを接続clientへ返す。接続しただけではSceneDocument、AssetManifest、selection、historyを変更しない。
- AI書き込みは認可済みprojectのEditと、差分同期に対応したPlay中のtoolだけに許可する。Import、project切替中、または非対応のPlay操作は理由付きで読み取り専用にする。World / ItemのUpload、project削除、形式を限定しない任意file read / write、任意shell操作は初期tool setへ含めない。Asset削除は参照を検査する明示toolに限定する。例外となるlocal Audio / Texture / Model / Skybox / Shader importは対応形式、通常file、symlink / reparse pointなし、容量上限、signatureまたはUTF-8を検査する。managed project storageへcopyするだけとする。Entity削除はScene構造の永続操作として扱う。

### 操作中

- CodexとClaude Codeのclient登録は検出した実行ファイルを直接起動する。client種別ごとに固定した`mcp add`引数だけを渡す。Claude Desktop / CoworkとCursorは既存設定をbackupする。`mcpServers.xrift-studio`だけをmergeする。OpenCodeは既存設定をbackupする。`mcp.xrift-studio`へ公式のlocal server形式をmergeする。登録するMCP serverは内容hash付きでapp dataへcopyする。Cargoの開発出力をclientから直接起動しない。shell文字列連結、任意command、project documentへのtoken保存は行わない。
- Ollama構成はinstall済みmodelの完全一致を再確認する。tool calling非対応modelは設定を変更しない。拒否する。構成先はCodex、Claude Code、OpenCodeのallowlistに限定する。Codex / Claude Codeは固定引数の`ollama launch <client> --model <model> --config --yes`をshell経由ではなく直接実行する。OpenCodeは非対話のTauri commandから公式provider形式を`opencode.json`へmergeする。選択modelを設定する。同じ操作内でXRift MCPが未登録または更新対象なら先に既存登録処理を完了する。model download、client起動、任意command実行、Ollama APIの外部hostへの接続は行わない。
- MCP書き込みはtool inputのproject ID、Scene ID、expected revisionを現在sessionと照合し、純粋なEditor toolで全入力を検証してから一件のhistoryへ確定する。`update_scene_settings`はSkybox、Fog、環境光、Camera、Editor背景、grid / gizmo / snap設定を部分更新する。Skybox画像は既存のproject sourceを持つTexture Assetだけを受け付ける。Play中もScene settingsを共有Scene viewへ即時反映する。`import_audio_asset` / `import_texture_asset` / `import_model_asset` / `import_skybox_asset` / `import_shader_asset`はEdit限定で検証済みlocal mediaをmanaged storageへ追加する。読み取り結果は外部pathや不要なbinaryを含まない管理下metadataへ限定する。`get_model_asset` / `update_model_asset`、`reimport_model_asset`、`get_shader_asset` / `update_shader_asset`は既存Assetの authoring source と derived metadataを同じrevision境界で更新する。`create_prefab`はEntity hierarchyを再利用可能なPrefab Asset/documentへ確定する。`set_project_thumbnail`は既存Textureから保存サムネイルを更新する。Audio Assetの`place_asset`はAudio Source Entityを作る。`core.audio-source`のadd / update / removeは既存Entityへ永続化する。`update_texture_asset`はPlay中も既存Texture設定を保存する。Component / Entity変更は影響Entity、Material / Texture / Particle Asset変更は参照Entityだけをruntimeへ再同期する。
- 書き込み中は同じMCP brokerの変更を直列化する。複数のAI clientが同時に操作した場合、短いqueue timeoutを超えたrequestは`EDITOR_BUSY`で終了する。最新contextの再取得と再試行を促す。Editorの準備状態は定期heartbeatで更新する。WebViewの再読み込みやcrash後には自動失効させる。接続数、最初のmessage読込時間、message sizeを制限する。停止したclientが他clientを長時間塞がないようにする。成功結果には変更前後revision、対象Entity / Asset、Command概要、Autosave状態を含める。

### 成功時

- 登録成功後は「登録済み」、clientの再読み込み方法、接続待ちをpanelに残す。登録先の実行fileが現在のapp-data版と異なる場合は「更新」を表示する。明示操作で内容hash付きの最新版へ移行する。Claude Desktop / CoworkではDesktop appの再起動が必要なことを表示する。接続するとclient名、対象project / Scene、最終Activityを表示する。
- Ollama構成中はmodelとclientのselect、再検出、MCP登録を含む他の構成操作を無効にする。成功時はmodel名とclient名を残す。OpenCodeは再起動を促す。Codex / Claude Codeは起動または再起動を促す。Ollama未起動、modelなし、`launch`非対応version、tool非対応model、client未検出、構成timeoutでは既存のclient設定とproject documentを追加変更しない。Ollama起動、model追加、更新、client install、再試行のうち該当する復帰先を示す。
- Scene settings変更は全sectionを一件更新する。Scene ViewとScene Inspectorへ同期する。Play中のMCP変更も永続化する。Stop後に残す。Asset配置は新Entityを作成する。Hierarchy、Scene View、Entity Inspectorで同じEntityを選択する。どちらも通常のUndo / RedoとAutosaveを使う。
- AI変更の結果はトーストだけにしない。対象Entity、Scene Inspector、または追加・更新したAudio / Texture Assetへ移動できる。panelから通常のUndoを実行できる。

### 失敗時

- client未検出、登録command失敗、server未起動、Editor未接続、未認可project、Scene不一致、stale revision、Editor busy、Import中、非対応のPlay操作、validation失敗ではdocumentとhistoryを変更しない。
- 失敗にはclientの再検出、登録再試行、Editorへ戻る、最新contextの再取得のいずれかを示す。Texture import元を含むabsolute path、接続token、raw command outputを画面へ表示しない。

### 戻り先

- panelを閉じても同じEditor、Scene、両selection、接続状態、直近Activityを維持する。別projectを開いた時は前projectへの書き込み認可を引き継がない。新しいcontextを取得するまで変更を拒否する。
- AI変更の取消は通常のUndoを使う。同じCommand historyからScene、Asset、両selectionを復元する。登録解除はclient設定だけを外す。project documentとEditor historyを変更しない。

### 開発画面デバッグ（標準MCP）

参照: MI-03, MI-05, MI-09

#### 操作前

- デバッグ版Tauriを起動し、標準MCPの`tauri` serverを読み込む。Codexはリポジトリの`.mcp.json`を使い、その他のMCP hostは`pnpm mcp:debug-config`で生成した設定を使う。
- 現在表示中のWebViewを画像で確認する目的を明示し、Scene編集用の`xrift-studio` MCPと、画面調査用の`xrift-studio-debug` MCPを区別する。

#### 操作中

- UI変更ごとに`webview_screenshot`、`webview_dom_snapshot`、`read_logs`を必要な順に呼び出す。Tauri commandを変更した場合は`ipc_monitor`と`ipc_get_captured`を追加する。処理中の画面ではスクリーンショットを再取得する。二重操作や状態ラベルの不一致を確認する。
- 画面調査用MCPは表示中のWebViewの読み取りを基本とする。OSのネイティブダイアログ、連続動画、リリース版への接続を対象にしない。ログイン、アップロード、削除、リセットなどの書き込み操作は別途明示確認を必要とする。

#### 成功時

- 画像、DOM、console、IPCの結果を同じ変更単位の検証記録として扱う。次の修正へ戻れる。スクリーンショットはリポジトリへ保存しない。clientの一時領域またはscratchpadへ置く。

#### 失敗時

- Tauri app未起動、MCP server未接続、画面の読み込み失敗、スクリーンショット取得失敗、console errorは原因を分けて示す。アプリ起動、MCP再読み込み、画面再読み込み、ログ確認のいずれかへ戻す。画面調査だけでproject document、AssetManifest、historyを変更しない。

#### 戻り先

- MCP clientは最後に確認した画面、DOM、ログ、IPCの状態を保持する。修正後に同じ画面から再取得できる。開発用Tauri Bridgeはdebug buildだけに存在する。release buildのMCP surfaceへ追加しない。

完了条件: 対応AI clientへXRift Studio MCPを一操作で登録する。必要ならOllamaのローカルmodelをCodex、Claude Code、OpenCodeのproviderとして構成する。認可したvisual projectの現在Scene、Asset、selection、revisionを読み取る。Skybox / Fog /環境光/Camera/Editor表示設定、Asset配置、Material編集、Interactivity Material pointer設定、Poly HavenとambientCGの検索・downloadを通常のEditor Command、Undo、Autosaveへ合流する。AIと手操作の競合を暗黙に上書きしない。登録後は接続状態、対象Scene、直近の編集と復帰手段がEditorに残る。

<a id="f-35"></a>

## F-35 Visual QA診断と短時間録画の状態設計

参照: MI-03, MI-05, MI-14, MI-26, MI-80

### 操作前

- Scene Viewのtoolbarに「診断」と「録画」を置く。どちらもEditとPlayの両方で使え、Play WindowではPlay中の実際のrendererを測る。
- 「診断」はtoggleとして状態を保ち、押している間だけ右上へ計測panelを重ねる。panelはpointer eventsを受けず、下のScene Viewの操作を妨げない。
- panelはFPS、frame time、draw calls、triangles、可視Mesh数と総Mesh数、geometry数とtexture数、camera位置とFarを表示する。計測中は`LIVE`、録画中は`REC`を同じ位置に出す。
- Geometry・Texture別のVRAM概算と合計をMiBで表示する。実Sceneが参照する頂点・インデックス・インスタンス属性、Material/Uniform・背景・環境Textureを集計し、同じ参照は重複除外する。Textureは実際の形式とmipmapを考慮する。未読込・非対応形式は未算定件数を表示し、ゼロと断定しない。影・描画バッファ・内部生成領域は対象外と明示する。最初の計測を待って表示し、診断を閉じたら計測を止める。MCPのcapture_scene_debugにも同じ値を返す。
- Texture VRAMはGPU圧縮済み／非圧縮の算定済み件数・MiBを分けて表示する。両者の容量合計はTexture全体と一致させ、未算定は別に数える。判定は実行中TextureのGPU形式を使い、JPEG/WEBPやKTX2のRGBAフォールバックをGPU圧縮済みと表示しない。

### 操作中

- 計測は0.5秒ごとにThree.js rendererの実値から更新する。React stateからの推定値を表示しない。
- 「録画」はScene ViewのCanvasを最大15秒のWebMへ記録する。開始時に診断表示を自動で有効にし、録画中であることと上限秒数を通知に出す。同じ操作でボタンは「停止」に変わる。
- 上限に達した場合は自動で停止し、保存中であることを示す。保存中は開始も停止も受け付けない。
- 診断表示と録画はSceneDocument、AssetManifest、Undo履歴、compile結果を変更しない。サムネイル撮影中はpanelを隠し、撮影結果へ写り込ませない。

### 成功時

- 停止または自動停止のあと、デスクトップ版では保存先を選んでWebMを保存し、保存したpathを通知に残す。ブラウザではファイルとしてダウンロードする。
- MCPからの要求では、計測結果または保存したpathと録画時間を結果として返す。UIと同じ計測経路を使う。
- 保存後はScene Viewへ戻り、診断表示の状態はそのまま残る。

### 失敗時

- WebViewがCanvasの録画に対応していない場合、利用できるWebM形式がない場合、録画されたフレームが0件の場合は、それぞれの理由を通知に出して録画状態を解除する。Sceneは変更しない。
- 保存を取り消した場合は取り消したことを示す。保存に失敗した場合は理由を残し、診断表示と最後の計測値を維持する。
- 別の録画を保存中に新しい要求が来た場合は、完了後に再試行するよう示して二重保存を始めない。

### 戻り先

- 診断表示は再度「診断」を押して閉じる。録画の成否にかかわらずScene ViewとPlayの状態は保たれ、選択とカメラを失わない。

完了条件: Scene ViewとPlay Windowで実rendererのFPS、frame time、draw calls、triangles、mesh可視数、camera Farを確認できる。最大15秒のWebMを保存して問題の発生前後を再現できる。診断や録画はSceneDocument、AssetManifest、Undo履歴を変更しない。停止・保存失敗・WebM非対応から同じScene Viewへ戻れる。

<a id="f-42"></a>

## F-42 ワールド制作の録画の状態設計

参照: MI-03, MI-05, MI-09, MI-122

### 操作前

- 左下レールの「録画」パネルに、状態、フレーム (アスペクト比・短辺・fps と、その結果の画素数)、録画ビューの設定、録画用カメラ、保存先を 1 画面で置く。押す前に何がどの大きさで保存されるか読める。
- 「録画ビューを表示」で、投稿先の比率のフレームを先に見せる。普段の編集画面の比率で撮ってから切り抜かせない。
- 録画用カメラは「全体」「斜め」「正面」「真上」で置き、フレーム内のドラッグで直す。MCP は `set_recording_camera` で同じ姿勢を書く。
- 保存先は既定 (OS のビデオフォルダー直下の `XRift Studio`) を示し、変えるならフォルダーダイアログで選ぶ。AI からは変えられない。

### 処理中

- 「録画を開始」を押すと録画ビューを表示し、ボタンは「録画を停止」に変わる。開始中・停止中はボタンを無効化して二重操作を防ぐ (MI-03)。
- フレーム左上と Scene View ヘッダーに `REC` と経過時間、パネルに経過時間と書き込んだ大きさを出す。REC 表示は動画には入らない。
- Scene View が表示されていない間 (Project の再読み込み、別タブ) は「Scene View が表示されていません」と示し、録画は最後の絵で続ける。
- プロファイルの変更は受け付け、「次の録画から反映されます」と添える。
- MCP から始めた録画は「<client 名>が録画を開始しました」と通知し、人が気付かないまま録画が続く状態を作らない。

### 成功時

- 停止後、パネルに「保存済み」、長さ、大きさ、path を残し、「フォルダーを開く」で到達できる (MI-05)。トーストにも path を出す。
- 動画の隣に sidecar JSON を書き、どの Project・Scene・client・構図の録画か後から分かる。
- MCP には path、長さ、bytes、sidecar の path を返す。

### 失敗時

- WebView が録画に対応していない、ファイルを作れない、書き込みに失敗した、のいずれも「失敗」と理由を 1 文で示す (MI-09)。途中で失敗した場合は部分ファイルの path を残す。
- 失敗した状態からも「録画を開始」で再試行できる。失敗は制作の tool や Editor の操作に影響しない。

### 戻り先

- 「編集表示へ戻る」(Scene View ヘッダーとパネル) で録画ビューを閉じ、退避していた編集中のカメラへ戻る。録画は続く。
- 停止後は録画ビューを開いたまま次の take を始められ、閉じれば普段のパネル配置へ戻る。
