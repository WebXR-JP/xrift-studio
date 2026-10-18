# ワールド制作用ハーネス

ここでいうハーネスは、LLMがワールドを制作するための実行環境と制御の仕組みを指す。Studio内のChatGPTと外部MCPクライアントのどちらも、最新のScene、保存、撮影、完成条件を結び付けて制作する。利用者がStudioのソースをクローンしたり、Node.jsの実行環境を用意したりする必要はない。

制作方針は`src/lib/visual-editor/world-authoring-guide.json`を正本にする。Studio内ChatGPT、MCP、制作専用スキルは同じ方針を使い、接続先ごとの操作形式と実行制御を組み合わせる。制作方法の詳細は、選んだ方法に必要なときだけ読む。


制作では作業規模に応じて工程を選ぶ。設計図を作る前に、現在の状態を読み取ってよい。小さな調整では、新規ワールド全体の体験設計は不要。制作runを使う場合は、以下のbegin/review/completeの保存・検証契約を維持する。

## 各文書と実装の役割

| 場所 | 残す内容 |
| --- | --- |
| `world-authoring-guide.json`の`core` | 範囲・細かさ・全体構成・制作方法の選択・完了判断の共有方針 |
| 同じファイルの`routes` | R3F・素材・Blenderを選んだときに読む制作方法と制約 |
| `src-tauri/src/mcp.rs`のinstructions | 共有方針とMCPの開始・復帰・保存・操作契約 |
| toolのdescription | 操作の目的、選ぶ基準、操作後の確認、失敗しやすい条件 |
| toolの戻り値 | 現在の状態、診断、次に確認する内容 |
| `xrift-world-authoring/SKILL.md` | 共有方針と、接続中のStudioから必要な案内を読む入口 |
| この文書 | ツールを変更するときの設計判断 |

外部の制作プロジェクトから接続するクライアントには、このリポジトリのスキルや文書が届くとは限らない。必要な操作説明はMCPのinstructionsとdescriptionにも含める。

## 設計判断

- 制作範囲は利用者の依頼から決める。選択中のEntityや既存の床・箱を、ワールド全体の設計条件にしない。公園など場所全体の制作では、主な特徴、導線、設備、照明を含む一つの構成を最初から作る。
- `get_editor_context.starterEntityIds`とChatGPTの同名フィールドには、初期テンプレートとの照合で未編集と確認できた床・箱だけを含める。新しい場所の制作では任意に置換できる。編集済みの作品や添付対象は保持し、一覧にないEntityを名前やIDから削除可能と推測しない。
- 床の種類、品質、主役、予算は依頼と設計図に基づいて決める。カタログやツールの数が多いという理由で地形や草を選ばせない。
- 素材の入手先に一律の順位を付けない。モデルの形状・容量・ライセンスと、依頼に合うかを確認する。
- 空・環境光・フォグをまとめて確認する。ポストエフェクトは有効にする前後の画像を比較する。
- 三角形数、ライト数、作り込む範囲などの作品の予算は、依頼と公開先に応じて設計図で決める。実行を際限なく続けないための回数・時間の上限は別に持ち、同じ依頼の再計画ではリセットしない。
- 静的な繰り返しや組み合わせには、共有Assetや対応するR3F原本の取り込みを使える。動きや操作に応じた生成にはスクリプトを検討する。ログインの認証情報はStudioの中に留め、公開は人が依頼したときだけ`publish_project`で行う。
- 完了の判断にはスポーン位置と俯瞰からの画像を使う。metricsとdocumentだけで見た目を判断しない。
- 主役は写真映えする物体に限らない。画面を見せながら会話する、アバターを確認する、イベントに参加するなど、訪問者の体験を先に決める。その体験に必要な場合に、画面共有・ミラー・タグ選択などの公式Componentを選ぶ。
- 設備だけでなく、観客・操作する人・待機列の場所と通路を設計する。ミラーやタグ選択は用途に合わせて選び、全ワールドへ一律に追加しない。

## 実装による支援

### 一つの制作方針と、必要なときに読む詳細

`world-authoring-guide.json`の`core`は、依頼に合う制作範囲と見る距離から、構成と細かさを決める。全体を依頼された場合は、主な形状・導線・材質・照明がまとまった最初の結果を作り、保存後の画像で足りない条件を確認する。素材一覧の全件調査や、固定件数ごとの小分けを制作開始の条件にしない。

MCPの`get_world_authoring_guide`は、`topic: "overview"`で共有方針と制作方法の概要を返す。`r3f`・`assets`・`blender`では、その方法の詳細だけを読む。利用可否は接続先のtoolと現在のcapabilityで確認する。Studio内ChatGPTも同じJSONを使い、schemaに実際に含まれる制作方法の説明を追加する。回数・時間の上限、Schema、revision、保存と完了の判定は引き続き実装が管理し、スキルの文章だけに委ねない。

R3Fの新規制作と原本からの更新には`apply_r3f_scene`を使い、Studio内ChatGPTと同じ原本・安定キー・手動編集の保持を適用する。更新前に原本を持つルートを`get_entity_components`で読み、`r3fAuthoring`の`version`・`revision`・完全な`source`を確認する。汎用の`analyze_component_code`と`apply_component_code_import_plan`は取り込み用として残し、原本を保持する更新と区別する。

Studio内ChatGPTでは、Planに含まれる全R3F原本の構文と対応機能を、先行するEntity編集・削除・素材取り込みより前に検証する。無効な原本ならSceneを変更せず、同じ依頼の有限の修正経路へ戻す。反映時にも最新の対象と手動編集を確認する。MCPの原本更新は、通常の書込予約・revision検査・Undo・自動保存の経路を通り、非同期の変換中に状態が変わった場合は反映しない。

同一の原本による変更なしはEditorへのcommitを省き、Undoやrevisionを増やさない。Studio内ChatGPTの全体レビューが不合格だった場合に限り、自動継続中の同じrun・同じbundle参照と保存内容・同じ依頼、モデル、思考量、完成条件であれば、その未完了項目を引き継ぐ。変化のないSceneの再撮影と同じレビュー推論を省くが、継続予算と停滞判定は消費する。実際の変更・手動編集・再読込や利用者の確認への回答後は再確認し、合格結果をこの仕組みで再利用しない。

プロジェクトの制作専用スキルは`xrift-world-authoring`だけを置く。`node scripts/generate-authoring-skill.mjs`が共有JSONから`.agents/skills/`と`.claude/skills/`の両方を生成し、`--check`で一致を確認する。過去の開発・レビュー用スキルは復元せず、一般的な実装作業で制作スキルを必須にしない。外部クライアントはこのスキルを導入しなくても、同じ案内をMCPから取得できる。

既存の`node scripts/sync-agent-skills.mjs`も、この生成処理を呼ぶ互換入口として使える。任意の旧スキルをコピーする処理は持たない。

### 制作runtimeと接続先の分離

`chatgpt-harness-runtime.ts`が同じrun IDの実行状態、工程、予算、停止、保存と画像確認を管理する。`chatgpt-authoring-host.ts`はEditor bridge、Tauri、素材準備、保存、撮影、推論を接続する。`App.tsx`に制作1 pass全体を埋め込まず、画面と所有する状態の接続を残す。

`chatgpt-harness-context.ts`は同じbundleから不変のScene・resources・制作方針を作る。完全なR3F原本を優先し、入らない原本を途中で切らない。省略したEntity・原本の件数とbytesも保持する。`sceneFingerprint`は省略対象を含む作品のauthoring値、`fingerprint`は会話・catalog・制作方針も含めた送信内容を識別する。保存と撮影の照合には前者を使う。

制作方針と省略件数は、既存の検証済みconversationを使ってnativeへも送る。repairや継続で、最初の範囲・細かさ・完成条件を落とさない。

計画とScene全体レビューの入力packetは、`chatgpt-harness-context-archive.ts`を通して作品内の`.cache/xrift-studio-harness/contexts/<fingerprint>.json`へ不変のcanonical JSONとして保存する。nativeの`authoring_context.rs`は固定cache内の通常ファイルだけを扱い、保存と読戻し検証に成功してから参照を発行する。既存の異なる内容を上書きせず、欠落・破損・不正なpathやbytesでは推論を開始しない。cacheは公開物と作品の書き出しから除外する。

準備した入力は一度だけdispatchでき、直前にartifactを再検証して対象作品・Sceneと制作ownerを確認する。現在のSceneへの計画やレビューでは最新の対象snapshotとも照合する。会話履歴には直近8件の参照を保存し、復元時にも型とdigestを検査する。復元だけで前回の推論を再送しない。保存対象は限定したScene・resources・制作方針・省略情報であり、providerのHTTP body全体やnative内部の全試行を記録したものではない。

`target: "new"`は初回計画の入力を現在の作品のcacheへ保存する。新作品のファイル作成後、元のartifactを検証し、新作品にも不変の控えを保存してからEditorを切り替える。会話に残した参照は、それぞれの作品内で復元・照合できる。

`chatgpt-operation-registry.ts`は15種の操作kindに一つずつtrusted handlerを登録する。未知・重複・未登録のkindや、必要能力を持たない操作を拒否する。R3Fの静的変換、手動編集の保持、Blenderの固定runner、通常のEditor操作と保存は維持する。モデルが実行handlerや任意のtool名を登録する方式にはしない。

Studio内ChatGPTのruntimeの既定上限は、pass 12回、repair 4回、登録された推論工程24回、変更工程192回、実行時間20分、1工程4分。productionが決めた1〜6回の制作上限や3回の進展なし停止も併用し、先に達した条件で止まる。world・environmentに加え、model・editで`hasMore`を返す継続も同じ`maxPasses`を守る。確認待ちはpauseし、実行時間から除く。同じ依頼の継続と再計画は同じrunで数え直さず、上限を広げない。推論工程の数はhostへ登録した単位であり、provider内部の全request数の実測とは区別する。

authoring契約11では、初回のworld・environmentの制作上限に最低3回の余地を確保する。モデルには3〜6回を提案させ、初回だけ`chatgptProductionDirection`で下限を適用する。初回でも完成条件と画像確認を満たせば終了し、保存済みの継続予算は延長しない。model・editの1回上限は維持する。MCPの明示runは別のbudgetを使い、同様に制作・確認・修正の余地を見込んで開始する。

`authoring-progress.ts`はPlanまたは操作と変更前後のSceneのdigestを使い、変更なし、同じ内容での変更なし、A→B→Aのような循環を区別する。直近16回の記録と停滞回数をChatGPTとMCPで共有し、進展のない継続を既定で3回までに制限する。手動編集などで連続性が切れたところを越えて循環と判定しない。Sceneの差分があることと、見た目が良くなったことは分け、後者は画像と完成条件で確認する。記録は履歴へ保存し、復元時に未知field、pass順序、分類、停滞回数、循環長の不整合を拒否する。

進展用のdigestは`authoring-scene-progress.ts`で作り、検証済みR3Fのrevision・最初の依頼・照合用baselineだけを除く。完全な原本と実際のEntity・Material・Prefabは比較対象に保つ。保存・撮影・完了の識別情報はこの省略を行わず、厳密な保存内容と照合する。

型付きsnapshotと直近128件のjournalは端末の既存会話履歴へ保存する。モデル・副作用開始の前に`useChatgptSessions.flush()`を呼び、保存失敗時はdispatchしない。履歴を読み取れない場合は元のbytesを保ち、新しい履歴で上書きしない。未知versionや壊れたjournalを黙って削除しない。Studio再起動後の実行中snapshotは中断終了し、自動実行の権限を復活させない。

停止時は、以降の工程の追加を止め、native cancelを依頼し、所有する処理が落ち着くまで待つ。遅れて到着した結果を停止後のSceneへ適用しない。保存済みの結果と手動編集を保持し、処理がまだ書き込んでいる間に次の依頼を開始しない。

ChatGPTのcancel toolは要求の受理を返し、jobはdrainが終わるまで`running`・`cancelling: true`、終了後に`cancelled`となる。native lease登録前の取消はprogressでも再送する。利用者がQueueで「再試行」を押す場合は新generation IDを作り、終了した旧runの履歴を保持する。自動修復と継続は元のIDと累積予算を使う。

### 制作ownerとproject入口の書込

`world-authoring-native.ts`が永続化された制作状態を読み、project入口の`create_blender_model`にもファイル生成前のwrite予約と結果記録を適用する。Editorのdocument toolだけを数えてproject側のモデル制作で予算を迂回させない。

MCP runの実行中と上限停止中は、UI・MCPの両方からChatGPTの新規制作・再開を拒否する。MCP runがcancelまたはcompletedになった後は開始できる。逆にChatGPTが実行中なら、MCPの`begin_world_authoring`を拒否する。二つの制作ownerが同じ作品へ並行して書き込まない。

### 保存と検査に共通の完了条件

`authoring-evidence.ts`はStudio内ChatGPTとMCPの共通判定を担う。現在のfingerprintと保存済みのfingerprintが一致し、必要なviewの画像と同じfingerprintへのreviewがあり、書込・saveが残っていなければ完了条件を満たす。保存失敗、古い画像、未承認のreviewを完了へ変換しない。

`authoring-criteria.ts`は元の完成条件がすべて確認されたかを検査する。契約10のChatGPT全体レビューは、元の`production.criteria`と同じ文字列・件数・順序の`{criterion, passed, reason}`を返す。理由は各条件について具体的なScene値や実画像を挙げ、未観測・不確実な条件は合格にしない。全件合格と`approved`、残作業の整合をnativeとフロントエンドの両方で確認する。MCPも同じ保存済みSceneと新しい2方向の画像について元の各条件を判定し、抜けた条件を一括の承認で代用しない。

画像の内容と依頼への適合は、画像を受け取ったモデルまたは利用者が判断する。gateは見た目の品質やPlayの動作そのものを証明しない。実モデルによる生成品質と速度の比較は未測定である。

### 必要な素材情報だけを確認する

現在のAssetsと内蔵候補を先に使い、外部の候補が必要な場合だけ対象のprovider・種類・検索語をnativeへ渡す。`chatgpt/public_catalog.rs`は公開metadataだけを10分間再利用し、同じproviderの同時取得を共有する。違うproviderは独立して読み、互換plannerも必要な最大2配布元を並行確認する。検索の候補数と種類、正確なID、質問に表示する順序は保ち、resource plannerへ同じ候補説明を二重に送らない。

素材検索を要求する応答では、短い制作方針と検索条件だけを受け取り、同時に編集操作やR3Fコードを生成させない。この排他条件はnativeで検査する。検索後は最初の題名・説明・productionを参照データとして渡し、候補を使った制作Planを生成する。素材確認前に書いた長いコードを破棄して作り直す経路を避け、入力修正でも元の制作範囲と完成条件を保つ。

期限切れ・取得失敗・未完了の内容を成功として返さず、停止時に独立した取得taskを残さない。アカウント別のmodel catalogと認証情報はこのcacheに入れず、計画・形状制作・レビューの各native処理で利用権限と対応する思考量を確認する。素材確認の重複を減らす設計であり、実モデルの生成速度の改善率を測定した結果ではない。

### 体験に合わせた設備の選択と配置

`world-component-authoring.ts`は、画面共有・ミラー・タグ選択・入退室履歴・スポーン・動画・移動先への入口の用途と配置、確認手順を返す。`list_component_definitions`と制作開始・再開・確認の応答に`worldComponents`を含めるので、ローカルのスキルがないクライアントにも届く。`place_builtin_prefab`の応答には配置した`componentId`と該当する`placementGuidance`を含め、次の調整へつなぐ。

部品のプロパティとレシピID、プレハブの編集可能項目は既存のレジストリから取得する。画面共有には公式画面共有を使い、動画再生や飾りの板で代用しない。イベントのタグ選択はタグ選択で扱う。入退室履歴も既存の配置ツールから選べる。

`worldComponents.components[].instances`はSceneDocumentの公式コンポーネントを列挙し、コンポーネント自体、オブジェクト、祖先の無効状態を反映する。スクリプト内の描画や未展開プレハブは含まないため、この一覧だけで設備がないと断定しない。`screenShareDecision`は既存設備を調べて調整するか、用途に応じて追加・省略を判断する案内であり、自動追加や完了の拒否には使わない。

採用判断、利用場所、見た目と機能の完成条件は`begin_world_authoring`のblueprintとcriteriaに保存する。既存の制作履歴の形式は変えない。設備があるだけでは完成にしない。客席の前列・後列・端や操作位置から、向き・大きさ・遮蔽物・通路・壁や枠との収まりを撮影して確認する。追加画像は`authoringView`を指定せず、スポーン・俯瞰の登録を上書きしない。

画面共有の開始・表示・停止、タグ選択、ミラーのアバター反射は対応する実行環境で確認する。参加者間の共有や同期は複数クライアントで確かめ、編集の待機画面だけで動作確認済みとはしない。実行環境の制約で確認できない項目は未検証と報告し、該当する完成条件を合格にしない。Studioの完了検査は引き続き画像の鮮度と登録された判定を確認し、画像の内容や動作そのものを自動判定するものではない。

この変更はMCPの案内と応答を拡充するもので、画面の状態遷移や新しいマイクロインタラクションは追加しない。配置は既存のrevision・履歴・保存・選択を使い、失敗時は既存のエラーと最新のcontextから再開する。

### 制作状態と画像の確認

1. `begin_world_authoring`で設計図と完成条件、任意の`budget`を保存する。保存先は開いているワールドの`.xrift-authoring/<sceneId>.jsonl`。Gitの除外設定も追加する。
   目標を改める場合は`replaceExisting: true`を明示する。以前の状態は履歴に残し、新しい条件で画像確認をやり直す。
2. 再接続時は`get_world_authoring`で目標・確認状況・次の操作を取得する。現在のシーンに対応する保存画像も返る。
3. 編集後、`set_scene_view_camera`でスポーン視点と俯瞰を用意し、それぞれ`capture_scene_view`の`authoringView`に`spawn`、`iso`を指定する。画像はMCPのimage contentとして返るので、LLMに別ディレクトリの読み取り権限を与える必要はない。
4. LLMが両画像と完成条件を見比べ、`review_world_authoring`に合否・根拠・両画像のcapture IDを渡す。数値の条件にはmetricsも照合する。
5. `complete_world_authoring`が保存済みの現在のSceneに対する確認結果を検証する。未達なら`get_world_authoring`の`reasons`、`uncheckedCriteria`、`nextActions`を読む。上限に達している場合は書込を再送せず、保存済みの結果を確認する。

画像の内容を判断するのはLLMである。Studioは画像の登録と参照、シーン内容のハッシュ、条件ごとの合否を検査する。シーンを編集した後や画像を撮り直した後は、古い判定で完了できない。スポーンとして登録する視点が実際のスポーン位置に合っているかは、接続したLLMが確認する。

ハッシュではJSONのキー順と浮動小数点数の往復変換による微小な丸め誤差をそろえる。数値は有効数字12桁で比較し、保存し直しただけで確認済み画像が無効にならないようにする。

履歴には制作状態の更新と、MCPの成功応答時に検出したシーン変更を追記する。再起動後はファイルから復元する。同時更新は連番で検出し、破損した行を通知なしで破棄しない。編集が成功して履歴の保存だけが失敗した場合は`authoringWarning`を返す。その場合は編集を再送せず、現在の状態を確認する。

新しい明示的な制作runには累積budgetがある。既定は変更256回、画像確認8回、進展なし3回、連続失敗3回、経過時間900,000ms。`budget`では`maxWrites`、`maxPasses`、`maxNoProgress`、`maxConsecutiveFailures`、`maxElapsedMs`を指定でき、値の範囲をnativeとEditorの両方で検査する。変更は実行前に予約して保存し、失敗した試行も1回として数える。直近128件のtyped journalを残す。MCPの経過時間はrun開始からの時間で、Studio内ChatGPTのpauseを除いたactive timeとは異なる。

画像確認のpassは、前回と内容の異なるSceneでスポーン・俯瞰の両画像が揃ったときに1回数える。同じSceneの画角を変えて撮り直しても回数を増やさず、制作が停滞している回数もリセットしない。撮り直しでcapture IDが変われば以前の判定は使えないため、最新画像の確認は必要になる。

`get_world_authoring`はrunのbudget・counters・journalに加え、`writeAdmission`、`terminalReason`、`canComplete`、`reasons`を返す。上限、連続失敗、進展なし、停止の後は新しい制作書込を拒否するが、読み取り・camera・captureは使える。最後の許可された工程で証拠が揃っていれば、予算到達後でも完了できる。予算をリセットするためだけに`replaceExisting`で同じ目標を作り直さない。外部クライアントの内部model call数はStudioから見えないため数えない。

`cancel_world_authoring`は制作runを停止し、capture・reviewの完了証拠を無効にする。既存のScene、Assets、保存済みファイルは残す。MCP brokerはtoolを直列処理するため、現在のtoolがsettleした後で停止要求を処理し、後続の書込を止める。実行中processのhard killとは異なる。停止したrunは完了できず、別の制作を始める場合は新しい目標として明示する。小さな直接編集でrunを始めていない場合と、`run`を持たない旧履歴には、この新しい予算を遡って適用しない。

録画は制作中のワールドの`Recording/`に動画とJSONを保存する。保存先の決定はStudioが行い、MCPに任意の外部パスを指定する機能は設けない。詳しくは [録画](./RECORDING.md) を参照する。

`src/lib/visual-editor/mcp-harness-guard.ts`は、画像を確認せず同じ種類の編集を繰り返したときに警告を返す。地形、草、同じオブジェクトの位置・回転・大きさ、同じマテリアル、シーン設定の書き込みが、`capture_scene_view`を挟まず3回続くと`harness`を付ける。この警告自体は書込を拒否せず、カウンターもEditorのメモリーだけに持つ。明示的な制作runの累積budgetとwrite admissionは別の検査であり、そちらの上限では書込を拒否する。

外部モデルの検索結果には`polycount`と`dimensionsMm`を含め、取り込む前に予算と比較できるようにする。配置後は接地とマテリアルを画像で確認する。

同じ失敗が続く場合は、説明文、戻り値、制作手順、カタログの構成を調べて直す。過去の失敗談やモデルへの評価を追加する代わりに、判断に必要な情報を返す。

追加機能の候補は [ロードマップ](./VISUAL_EDITOR_ROADMAP.md#今後検討する項目)、ツールの権限と一覧は [MCPツール](./MCP_EDITOR_TOOLS.md) を参照する。

## 参考にする設計

### CLI とヘッドレス実行

現在の`cli/main.mjs`はビジュアル編集からコード編集への`convert`を提供する。通常のMCP操作は、起動中のStudioのEditorを対象とする。コマンドから操作できることと、Studioの描画環境を起動せず操作できることは分けて考える。

| 構成 | 利点 | 費用・制約 |
| --- | --- | --- |
| 起動中のStudioを呼ぶCLI | シェル、自動テスト、MCP非対応のクライアントから同じ操作を使える。既存の保存・revision・承認を共有できる | Studioの起動が必要。画像はファイル保存、通常の結果はJSONなど、CLI向けの出力設計が必要 |
| 描画不要の処理をヘッドレス化 | 文書の検査、変換、バッチ処理をCIで動かせる | Editorと同じ変更処理・資産検証・保存トランザクションを使う必要がある |
| 撮影・録画・動作確認までヘッドレス化 | 無人の映像生成や表示検証が可能になる | WebGL、ブラウザまたはWebView、音声、スクリプトの実行環境が必要。GPU・OS・フォントによる差と権限管理も検証対象になる |

同梱の`xrift-studio-mcp-sidecar`に`tools`、`describe`、`call`を実装した。ツール定義と接続処理はMCPと共有し、すべての操作を同じ保存・revision・承認処理へ渡す。CLIの利用に、このリポジトリのクローンやNode.jsは不要。操作例は [MCPツールのCLI操作](./MCP_EDITOR_TOOLS.md#cli-から操作する) を参照する。完全なヘッドレス描画は未実装で、無人実行の需要と実行環境を確かめてから別途設計する。

独立したCLIで検討した履歴管理と完了条件をStudio本体へ移した。実装は`world-authoring.ts`と`world_authoring.rs`に分け、MCPが操作の入口になる。外部の実行ループや特定のモデル接続は同梱しない。

[DeepSeek Harnessの参照commit](https://github.com/deepseek-ai/deepseek-harness/tree/687f282e8625c6b8d11ff58211a90524be2e4317)は、モデル接続、ツール、セッション記録、実行ループをプラグインとして構成する。ツール実行の前後の介入、モデル入力の再構成、cancelとcleanup、checkpointを調べ、XRiftの責務に合わせて構成し直した。調査範囲、ソース・test根拠、採用しない機能、品質と速度の未測定範囲は[詳細分析](./DEEPSEEK_HARNESS_ANALYSIS.md)に記録する。

XRift Studioでは、この設計を次の判断に役立てた。DeepSeek Harnessのコードやパッケージは取り込んでいない。

- モデルやクライアントを変更しても、制作ツールの入出力・権限・検証方法を共通に保つ。
- 操作前のrevision確認と、操作後の結果・画像の確認を、説明文だけでなく実行経路で支える。
- 制作の再開に必要な設計図、操作結果、検証結果を記録する。セッション内の一時的な警告カウンターとは保存目的を分ける。
- 素材の取得や検証方法を追加するときは、役割ごとに交換・拡張できる構成を検討する。
