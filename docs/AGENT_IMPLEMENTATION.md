# 実装時に守る契約

対象の変更に関係する節だけを読む。パスはリポジトリルートからの相対パス。

## UI と表記

- 操作を追加・変更するときは[UX原則](./UX_PRINCIPLES.md)を読み、対象機能の操作前・処理中・成功時・失敗時・戻り先を設計する。完了後に次の操作を選べる表示も用意する。
- UIを変更・追加するときは、同じ画面の既存コンポーネント（モーダル、ダイアログ、ボタン、通知）の実装を先に確認し、既存のレイアウト、角丸、余白、色トークン、フォーカス表現を再利用する。新しい配色や強い装飾は独自の判断で追加しない。既存パターンと変える場合は、理由をUX原則または機能仕様に記録する。
- 動きや状態遷移を変更する場合は [マイクロインタラクションWiki](./UX_INTERACTIONS.md) の機能IDと`MI-xx`を確認し、追加する機能の状態遷移を先に記録する。既存項目に当てはまらない動きを追加する場合は、目的、開始条件、時間、終了状態をWikiに追記する。
- 新しい作成・起動・公開・更新フローでは、成功トーストだけで終わらせない。作成物、起動URL、公開URL、更新後のバージョンなど、結果そのものへ移動または到達できる表示を画面に残す。
- ワールドのアップロード前には、`xrift.json`のタイトル・説明とサムネイルがテンプレートのままではないことを確認する。未編集ならアップロードを開始せず、編集、保存、残りの確認、アップロードまでを途切れずにつなげる。
- 一覧画面では、新規作成を常に見つけられる位置に置く。各項目には見分けるための情報を載せ、一覧が空・読み込み中・失敗した場合の表示を用意する。削除や一時的な操作を除き、選択中の対象や編集中の内容を不用意に消さない。
- 進行する処理には実行中の表示と重複操作の防止を付ける。失敗時は次に取る行動または確認先を示し、処理中に安全でない中断ができるようには見せない。
- 白・グレーを基調にし、ブランド色は主操作、成功後のURL、更新対象などを強調するために使う。短く控えめな動きで画面遷移や状態変化を示す。
- Markdown文書、画面文言、コミットメッセージでは絵文字を使わない。アイコンだけに意味を持たせず、主要操作には読めるラベルか`title`を付ける。
- 新しい画面は、まずブラウザで動くReactの状態・表示を作り、Tauri固有処理を小さなIPCラッパーへ分離する。
- XRiftのワールド内Component、公式Component、3D Assetの見た目を、SVG、CSS図形、DOMの疑似サムネイルで置き換えない。Edit、Play、カタログのいずれも`@xrift/world-components`本体または同じThree.js / React Three Fiberの描画経路を使う。公式ComponentがContextを必要とする場合はStudio用Provider bridgeを用意し、独自の古いデザインを書き直さない。Component自体が子要素だけを包むwrapperの場合は、公式sampleのWebGL子要素を表示する。実レンダリングできない対象は架空の見た目を作らず、未対応の理由を明示する。
- ネイティブAPIが使えないブラウザプレビューでは、成功したように見えるモックを実機能と混同させない。画面上でサンプル・デモであることを明示する。
- 新しいComponentをAdd Componentメニューへ足すときは、同じ作業単位でInspectorの削除導線も用意する。`ComponentCard`の`remove`を使い、削除ハンドラは`VisualEditorPrototype`の`handleRemoveComponent`に通す。Transformのように削除できないComponentは、押しても削除できない理由が分かる通知を返す。Inspectorに専用UIを持たない種別も共通カードを表示し、見えないComponentを残さない。追加できて外せないComponentを残すと、Entityごと作り直すしかなくなる。

<a id="rendering-parity"></a>

## 編集・Play・公開の描画を揃える

Studioで制作中に見えている素材と動作を、そのまま公開先でも使う。実物のモデル、シェーダー、テクスチャ、公式Componentで開発・確認する。見た目だけを似せた代替表示を完成品として扱わない。

- 形状、材質、色空間、テクスチャの読み込み、照明、露出、アニメーションは同じ実行コードと値を使う。共通の描画処理は`packages/xrift-studio-runtime/src/`に置き、Editorから参照し、公開物には同じソースを同梱する。生成側に別の実装や既定値の表を持たせない。
- Compilerと環境別adapterはSceneの組み立て、素材IDから配信URLへの解決、Contextの接続を担う。公開時だけ通常材質へ置換したり、色や寸法を補正したり、数値を丸めたりしない。対応するシェーダーと依存素材を正しく読み込む経路を修正する。
- 公開には編集画面で使用中の画像をコピーする。縮小・圧縮・形式変換を作者が選ぶ場合は、制作中に適用結果を表示し、その確認済みの素材を公開する。公開のタイミングで別の画像へ自動変換しない。
- シェーダーや素材を読み込めない場合、別物を表示して読み込み成功と扱わない。参照元とエラーを保持して原因を直す。警告や公開前チェックを増やすだけで描画経路の修正を終えない。
- グリッド、ギズモ、選択枠などの編集補助は作品の材質・透明度・形状を変更しない。軽量表示など作者が選んだ表示品質の差は明示し、保存する素材や公開結果へ混ぜない。
- 描画に関わる変更は、編集側と実際に生成した公開コードの両方で確認する。比較には同じ素材、カメラ、照明、描画品質、再生状態・時刻を使う。別々に調整して似せた画像や、Compilerの文字列検査だけを一致の根拠にしない。検証した対象・条件と未確認の経路を区別する。

既存実装には未共通化の部分もある。描画の差を見つけたら、共通のソースへ統合する。個別の置換や補正を追加したり、既存作品の保存値を一括変更したりして差を合わせない。

## Component・Graph・公開物

- Scene設定画面に項目を追加したら、同じ作業でビューアーごとに実行時変更を許可するか決める。ポストエフェクト、フォグ、環境光、Skybox、露出、視野角など、見え方に関わる項目は`packages/xrift-studio-runtime/src/script/scene-runtime.tsx`のbridgeへoverrideを追加する。Interactivity Graphの`scene`ターゲットと`ctx.viewer`の両方から書き込めるようにする。シーン設定は全ビューアー共通なので、個別のoverrideがなければ、処理の重い端末だけを除外するか、全体の品質を下げる必要がある。書き込みは常にclient-localとし、他のビューアーへ同期しない。Stopと再入室でシーン設定へ戻す。ギズモ、グリッド、Editor背景など編集時だけの項目は対象外とし、理由を`docs/KHR_INTERACTIVITY_EDITOR.md`へ記録する。
- Interactivity GraphがEntityのComponentを書けるようにするときは、Playと公開先が同じruntime bridgeを通ることを先に確かめる。bridgeが無いComponentは、まずbridgeを足してからpropertyを公開する。InspectorのComponent一覧に出るのに「プロパティを変える」の対象に出てこないComponentを残さない。対象に入れない判断をした場合は、その理由を`docs/KHR_INTERACTIVITY_EDITOR.md`の「What a trigger can write」へ書く。
- Asset idや文字列など数値でない値をGraphのpropertyにするときは、`configuration`へ置き、value socketを使わない。KHR_interactivityにはstring型がない。Assetや文字列は補間できないため、durationを適用しない。Assetを指すpropertyを追加したら、同じ作業でgraphからComponentの`assetReferences`を導出し、compilerが依存素材を公開物へ含められるようにする。導出時はグラフの全action nodeを読む。`xrift/onInteract`から辿るだけでは、自動で開始するグラフの依存を記録できない。
- Editorに新しい操作を足したら、同じ作業単位でMCP toolも足す。Inspectorやツールバーからしか触れない操作は、AIから見ると存在しない機能になる。手順とsurfaceごとの権限は`docs/MCP_EDITOR_TOOLS.md`にある。公開しない判断をした場合は、その理由を同じ文書の「意図的に公開していない操作」へ記録する。
- 公開したWorldが配信できるのはWorld直下のファイルだけだ。`public/`のサブディレクトリは公開物に含まれないので、Asset、decoder、font、Runtime manifestはすべて`public/`直下へ平坦に置き、名前で衝突を避ける。詳細は`docs/SCRIPTING.md`の「公開物はワールド直下にしか置けない」にある。

MToon・VRMの生成コードには、固定した`@pixiv/three-vrm`の配布ソースとライセンスを同梱する。SDKが難読化と判定する既知の内部bindingだけを構文解析で改名し、公開APIと`constructor.name`、描画・読み込み処理を保つ。ブラウザ公開のランタイムシェルも、隔離した公式テンプレート内のaliasで同じ配布ソースを使う。描画コードの更新時はランタイム契約を更新し、`node scripts/build-world-runtime-shell.mjs`でシェルを再生成する。`node scripts/prepare-readable-three-vrm.mjs --check`で原本のSHA-256と生成物を照合する。依存更新時は再生成と`node --test scripts/readable-three-vrm.test.mjs`に加え、隔離した生成物の実ビルド・公式CLI検査・編集側との描画比較を行う。セキュリティ検査は通常のルールで実行する。

## Scene の更新と描画性能

- Entity単位の描画コンポーネントには`SceneDocument`そのものを渡さない。Scene ViewのEntity treeは`scene-entity-tree-store.ts`でEntityごとに更新を購読し、全ノード共通の値だけをcontextから受け取る。ノードのpropには、親Entityから決まる`entityId`、`inheritedRigidBody`、`ancestorEnabled`だけを渡す。Scene全体を親から渡すと、1 Entityの編集でも全Entityのpropsが変わり、`memo`で再描画を抑止できない。Entity単体を親から渡すだけでも不十分である。Componentを追加しても祖先のEntityは変わらず、memoした親が再描画を止めるため、子孫に変更が届かない。各Entityが直接更新を購読する構成にする。
- SceneDocumentを作り直す処理では、変更していないEntityのオブジェクト同一性を保つ。`editor-session.ts`の更新は`{ ...scene.entities, [id]: { ...entity } }`の形を守る。`prefab-resolver.ts`はPrefabを展開したEntityだけを差し替え、それ以外は同じ参照を返す。全Entityをcloneすると、`memo`も`useMemo`も参照の一致を確認できず、Scene全体を再描画する。
- 一覧パネルの行数がSceneのEntity数やAsset数に比例する場合は、行を`memo`したコンポーネントに分ける。行から親のclosureを呼ぶ場合は、毎renderで更新する1つのrefにまとめて渡す。closureをpropとして直接渡すと毎renderで参照が変わり、`memo`で再描画を抑止できない。
- Scene Viewの描画品質には、CSS表示サイズに対する固定の割合を使う。React Three FiberにdevicePixelRatioの範囲を渡すと、ディスプレイのdevicePixelRatioをその範囲に収める処理になる。1倍のディスプレイでは描画ピクセル数を減らせないため、範囲では指定しない。ラベルに示す割合と実際の描画ピクセル数を一致させる。

## ChatGPTと手動編集を続ける

`/goal`とMCPの`mode: "goal"`は、同じgenerationIdで制作・保存・最新Sceneの見直しを続ける。変更後には必ずもう一度確認し、変更も残り作業もない場合に完了する。進展のない継続は3回で停止する。質問、停止、失敗、Scene変更、再起動の扱いと、native契約7の`ChatgptSceneContext.goal`は[ChatGPT制作の契約](./CHATGPT_AUTHORING.md#goalの継続制作)に従う。

Sceneの正本は、開いているEditor bridgeの最新bundleとする。各依頼と再計画でScene・素材を読み直し、会話は制作意図と保存済みの作業を補う参照として渡す。以前のPlanの全項目を完了済みと扱わない。

- `chatgpt-scene-resources.ts`で送信用のSceneと素材情報を要約する。選択対象を優先し、件数・文字数・UTF-8容量を送信側で収める。未割当の素材参照は省略する。catalog keyの構文とファイルパスの構文は区別し、正規の内蔵候補をパスとして拒否しない。
- `chatgpt-plan-guards.ts`の推論用snapshotは、Scene・Assets・Prefabと入力に使う作品名を検査する。推論中に新規配置・削除・位置変更などがあれば、返答を適用する前に最新状態で再計画する。素材のサムネイルや保存時刻だけの更新は再計画の理由にしない。
- 確認済みPlanと反映中の保護は、変更するEntity・Skyboxと再利用するproject Assetを対象にする。既存素材を使う新規配置も保護する。非同期処理の結果は`rebaseChatgptStep`で最新bundleへ統合し、別Entity、別Settingsの節、別Prefab、独立したroot Entity追加を保持する。同じデータへの手動編集は上書きしない。
- 同一Sceneの編集競合は`ChatgptSceneConflictError`として扱い、`App.tsx`で同じ依頼を最大2回再計画する。`chatgpt-live-scene.ts`は保存済みイベントだけを続きを考えるための要約に含める。generationId、会話、モデル、思考量、保存件数を保ち、実行モードは未完了の作業を続ける。承認済みPlanから再計画した場合は、新しいPlanの確認待ちへ戻す。
- プロジェクト・Sceneの切り替え、Play、素材の読み込み、利用者による停止は再計画の対象にしない。反映を停止し、保存済みの変更を残す。手動編集が続いて再計画の上限に達した場合も、変更を保持し、最新状態から「続ける」で再開できることを案内する。

実collectorからRust検証までの契約、同じ対象と無関係な対象の編集、保存済み作業を含む再計画、Planの再確認を回帰試験で確認する。ブラウザのIPC fixtureでモデル応答を与える試験と、実アカウントでの推論・認証の確認は区別して報告する。

計画用JSON Schemaでは、同じEntity・Component・候補IDの一覧を`$defs`で共有し、操作ごとに列挙を複製しない。[Structured Outputsの公式仕様](https://developers.openai.com/api/docs/guides/structured-outputs)は、enum値の合計を1000、入れ子を10段階までとしている。最大件数のSceneと素材を使うnative回帰試験で上限内に収まることを確認し、利用者の素材を切り落として対処しない。

送信を受け付けた時点で入力欄を空にし、処理中や送信条件が整っていない依頼はFIFOのQueueに保持する。各依頼のモデル、思考量、実行モード、素材・制作方法の選択を保持し、送信直前に最新Sceneを読む。Queueはアプリ起動中の作品・Scene・チャットごとに管理する。停止・失敗・Planの破棄ではQueueも一時停止し、Planの確認待ちでは次の依頼を始めない。World画面から離れたQueueは復帰時に利用者が再開する。別作品や別Sceneへ自動転送しない。

Queueのdispatchは予約した作品・Scene・チャットをAppへ渡し、最新のbridgeと同期した選択refに一致する場合だけ開始する。Queueの依頼IDをgenerationIdとして使い、初回に作成したチャットへは同じIDの依頼だけを引き継ぐ。文面の一致を別依頼や別チャットへの関連付けに使わない。

導入済みのBlenderは`get_blender_status`で検出し、「Blenderを使う」の有効・無効へ反映する。`blender-model`は短い`name`・`brief`で計画し、詳細な形状とPBR Materialは別の推論処理で制作する。独立した対象は最大2件を並行して制作し、完成順に同梱の固定runnerへ渡す。Sceneへの反映と保存は1件ずつ行い、同じ対象への連続操作や非モデル操作の順番を保つ。バックグラウンドの初期Sceneで実GLBと編集可能な`.blend`を作り、通常のModel分析・Asset保存・描画経路で取り込む。任意のPythonをモデル応答から実行しない。作成先は作品内の一意な所有マーカー付きcacheとし、既存のBlender作品やファイルを上書きしない。StudioとBlenderの軸・Euler XYZ回転・寸法、曲線・回転面の形状とUVを実GLBで検証する。完成した家具や小物をSceneのPrimitiveで代用せず、下案を明示された場合や単純な面に限って使う方針を推論へ渡す。

## MCP とネイティブの契約

- AI clientはMCP toolのdescriptionとserverの`instructions`を操作説明として読む。toolの追加・修正時は、機能、選ぶ基準、実行後の操作、失敗しやすい条件を書く。代替toolがあれば名前も挙げる。説明だけでは防げない失敗には、戻り値の`harness`警告など、実装側の対応を用意する。
- Rustコマンドへ外部入力を渡すときは、既存のパス検証と権限制御を保ち、任意のパス実行や削除を追加しない。
- 外部ストアの配布元が使う正規CDNへの転送を、別サイトのダウンロードとして誤って拒否しない。ダウンロードの入口と各redirect先を、配布元ごとのHTTPS・host・配布pathで送信前に検査する。ambientCGは`ambientcg.com/get`から`acg-download.struffelproductions.com/file/ambientCG-Web/download/`へ転送する。全hostの許可や最終URLだけの事後検査で対処しない。
- ストアのモデル形式は、配布元のファイル情報にあるglTF・GLBだけを選ぶ。自己完結したGLBの元bytesを変換せず保存し、署名、version、container length、外部参照、保存先と通常fileの検査を保つ。GLBにはストア・取り込み共通の固定byte上限を適用しない。ブラウザのストアは先頭のGLB署名と宣言lengthを検査して読み取り、保存時のfile・transaction上限も正規GLBだけ対象外にする。配布情報のlength・hashとlicenseを保ち、再読込には同じ元bytesを使う。ZIP展開、画像・音声などの既存保護は別に保つ。メモリー確保や保存領域不足は、形式・配布先の拒否と区別して報告する。


## IPC・CLI 連携

Tauriコマンドを追加するときは、`src-tauri/src/lib.rs`の`#[tauri::command]`と`generate_handler!`の登録、`src/lib/tauri.ts`の型付きラッパーを揃える。Rustのsnake_caseとinvokeのcamelCaseの引数対応を確認する。必要な権限だけを`src-tauri/capabilities/default.json`に追加する。

CLI連携は`src/lib/xrift-cli.ts`の既存経路を使い、`LogLine`を流す。処理中のbusy/finallyと二重操作防止は既存の`wrap`パターンを使う。依存追加は必要性を説明し、ロックファイルを更新する。フロントエンドとRustの変更に合う検証は[開発ガイド](../DEVELOPMENT.md)で確認する。
