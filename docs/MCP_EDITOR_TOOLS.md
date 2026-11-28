# MCP エディターツールの全体像

`generate_chatgpt_world` の `attachedEntityIds` には、現在のシーンにある Entity を編集対象として添付できる。添付したルートと配下の Entity は、送信サイズの上限内で周辺の Entity より優先して送信する。`target=current` で利用し、送信時や再計画時には最新のシーンを読み込む。Entity の複製や移動は行わない。添付した名称は制作履歴に記録する。`attachedMaterialIds` には、現在の作品で利用可能なマテリアルを最大 16 件まで添付できる。送信直前の設定を優先して渡し、`material-update` は既存の `update_material_asset` と同じ処理でマテリアル自体を部分更新する。既存の割り当て・テクスチャ・シェーダーを維持したまま、通常の保存・競合検査・依頼全体の取り消し機能を使う。

Studio 内の制作チャットは Pi SDK を利用し、公式定義に沿った Entity・Component・素材のツールを直接呼び出す。通常の `add_component`・`update_component`・`delete_entity` を使うため、編集権限・型検証・履歴・保存の仕組みを共有できる。操作を拡張する場合は [ChatGPT 制作機能の拡張](./CHATGPT_AUTHORING.md) を参照する。

`get_chatgpt_generation` が `status=planned` と `plan.questions` を返した場合、シーンは変更されておらず回答待ちの状態にある。`answer_chatgpt_questions` に全ページの `questionIndex`（0 始まり）と、選択肢の本文または自由入力の `answer` を渡す。呼び出しには同じ作品・シーンと最新リビジョンが必要であり、回答後は同じ `generationId` をポーリングして進行を確認する。回答前に `apply_chatgpt_plan` は実行できない。

マテリアルの PBR 値は `update_material_asset` の `patch.pbrMetallicRoughness` で変更する。`baseColorFactor` は 0〜1 の RGBA 配列、`metallicFactor` と `roughnessFactor` は 0〜1 の数値で指定する。簡易指定として `patch.color`（`#rrggbb`）、`opacity`、`metalness`、`roughness` も利用できる。描画方式は `patch.blending`、深度書き込みは `patch.depthWrite`、アルファトゥカバレッジは `patch.alphaToCoverage` で変更する。Classic R3F シェーダーの uniform は `get_custom_shader` で現在値を読み取り、`update_custom_shader` の `patch.uniforms` で更新する。マテリアルの頂点カラーと不透明度マップも `update_material_asset` で設定する。`patch.vertexColors` は真偽値、`patch.opacityTexture` は既存テクスチャの ID または TextureInfo（`null` で解除）、`patch.opacityChannel` は `r`・`g`・`b`・`a`（既定は `a`）を受け付ける。透過させる場合は `alphaMode: "BLEND"` または `"MASK"` を併せて指定し、裏面も描画するなら `doubleSided: true` にする。更新後は `get_material_asset` で保存値を確認し、割り当て先のモデルで色と透過具合を確かめる。なお、これは Unity の独自シェーダーをそのまま実行する設定ではない。

テクスチャ枠には Texture Asset ID または `{ "textureAssetId": "...", "texCoord": 0, "transform": { "offset": [0, 0], "rotation": 0, "scale": [1, 1] } }` を渡す。`null` を渡すと割り当てを解除できる。Normal Map の `scale` や Occlusion Map の `strength` も同じオブジェクトで指定する。`patch.extensions` には対応する `KHR_materials_*` 名をキーにして、拡張ごとの係数・色・テクスチャを部分更新する。拡張自体を削除する場合はそのキーに `null` を渡す。Volume には Transmission、Dispersion には Volume を併せて設定する。`KHR_materials_unlit` は空オブジェクトで有効化する。

MToon 1.0 は `update_material_asset` の `patch.extensions.VRMC_materials_mtoon` にオブジェクトを渡して有効化する。`specVersion` は `"1.0"` を指定する。明るい部分の色は `pbrMetallicRoughness.baseColorFactor`、影の色は `shadeColorFactor`（0〜1 の RGB 配列）、影の境界は `shadingShiftFactor`、境界の硬さは `shadingToonyFactor`（0〜1）で調整する。アウトラインは `outlineWidthMode: "worldCoordinates"` と `outlineWidthFactor`（メートル単位）、または `"screenCoordinates"` と画面の高さに対する割合で指定し、`outlineColorFactor` で色を変える。`outlineWidthMode: "none"` で輪郭線だけを消せるほか、拡張キーに `null` を渡すと保存済みの標準マテリアル設定に戻る。`shadeMultiplyTexture` と `outlineWidthMultiplyTexture` には通常の TextureInfo を使う。MToon と Unlit の両方が指定されている場合は MToon を優先する。更新後は `get_material_asset` で値を読み取り、割り当て先のモデルで影と輪郭線を確認する。

VRM 0.x / 1.0 のアバターは、通常のモデルと同じ取り込み操作で `.vrm` ファイルを指定する。VRM 0.x の `VRM/MToon` と `VRM/Unlit*` は `three-vrm` の公式変換を通して、編集可能な MToon 1.0 の Material アセットへ展開する。元の VRM ファイルをそのまま保持しつつ、色のリニア変換、影の境界、アウトライン幅、UV 変換、透過順序を引き継ぐ。MatCap、Rim、UV Animation の係数とテクスチャも保存され、アウトライン色などを部分更新しても失われない。これらの設定は `matcapFactor` / `matcapTexture`、`parametricRimColorFactor` / `rimMultiplyTexture`、`uvAnimationMaskTexture` / `uvAnimationScrollXSpeedFactor` / `uvAnimationScrollYSpeedFactor` / `uvAnimationRotationSpeedFactor` で更新できる。`shadingShiftTexture` は TextureInfo に有限の `scale` を追加して指定し、`renderQueueOffsetNumber` は -9〜9 の整数を受け付ける。`extras.xriftVrm0CompatShade` は旧版の描画互換を維持するための取り込み情報なので、通常の色や輪郭線の編集では変更しない。Blender や Unity の任意の独自 Toon シェーダーはこの変換の対象外である。

XRift Studio には、開いているエディターを AI クライアントから操作するための MCP サーバーを同梱している。本書では MCP から利用できるエディター操作を一覧で整理する。機能を追加した際は、MCP 側への対応漏れがないか確認すること。

ツール名の定義は `src/lib/visual-editor/mcp-tool-registry.ts` の `XRIFT_MCP_TOOLS` にある。Rust 側の許可リスト（`src-tauri/src/mcp_tool_names.rs`）もこの表から自動生成する。`pnpm mcp:tool-names --check` と Rust の `tool_list_matches_the_generated_allow_list` テストにより、定義表・生成物・JSON スキーマのツール一覧が一致していることを検証する。文書と定義で名前が異なる場合は定義を優先する。

## CLI から操作する

Studio に同梱している `xrift-studio-mcp-sidecar` は、MCP サーバーと CLI を兼ねている。Windows では Studio のインストール先にある `xrift-studio-mcp-sidecar.exe` を指定する。PATH への登録は不要で、フルパスでも実行できる。macOS ではアプリバンドル内の `Contents/MacOS`、Linux では配布形式に応じた同梱先を使う。

```powershell
# Studio のインストール先で実行する例
.\xrift-studio-mcp-sidecar.exe tools
.\xrift-studio-mcp-sidecar.exe describe capture_scene_view
.\xrift-studio-mcp-sidecar.exe call get_editor_context
.\xrift-studio-mcp-sidecar.exe call capture_scene_view --args-file .\capture.json --output-dir .\Recording
```

`tools` は全ツールの説明と JSON スキーマ、`describe` は指定したツールの定義を返す。いずれもオフラインで利用できる。`call` は起動中の Studio を操作するコマンドであり、MCP と同じツール名・引数を使い、リビジョン管理、スクリプトの変換、保存先などの扱いも同じである。プロジェクトが開いていなくても Studio さえ起動していれば呼び出せる。`list_projects` で一覧を確認し、`create_project` または `open_project` でエディターを開いたあと、編集対象の `projectId` と `sceneId` を `get_editor_context` で取得する。

ワールドの作成から公開までを CLI だけで通す例は次のとおり。

```powershell
.\xrift-studio-mcp-sidecar.exe call create_project --args '{"name":"night-plaza","templateId":"blank"}'
.\xrift-studio-mcp-sidecar.exe call get_editor_context
# ここで document ツールや local-asset ツールを使ってシーンを作る
.\xrift-studio-mcp-sidecar.exe call update_project_metadata --args-file .\metadata.json
.\xrift-studio-mcp-sidecar.exe call set_project_thumbnail --args-file .\thumbnail.json
.\xrift-studio-mcp-sidecar.exe call get_account
.\xrift-studio-mcp-sidecar.exe call login          # 未ログインならブラウザで完了させる
.\xrift-studio-mcp-sidecar.exe call get_publish_readiness --args-file .\scene.json
.\xrift-studio-mcp-sidecar.exe call publish_project --args-file .\scene.json
```

`publish_project` は事前に `get_publish_readiness` と同じ確認を行い、不足項目があれば `PUBLISH_NOT_READY` とともに `requirements` および `nextActions` を返す。公開には数分かかる場合があり、その間の他ツール呼び出しは `EDITOR_BUSY` を返す。

引数は UTF-8 の JSON オブジェクトとして渡す。指定方法は `--args-file <path>`、`--args <JSON>`、`--stdin` のいずれか 1 つを選び、省略時は `{}` として扱う。PowerShell では引用符の解釈ズレを避けるため `--args-file` の使用を推奨する。接続先は自動検出されるが、`--rendezvous <path>`、環境変数 `XRIFT_STUDIO_MCP_RENDEZVOUS` の優先順で上書きできる。接続ファイルには認証情報が含まれるため、外部へ共有してはならない。

結果は標準出力に JSON で出力される。`call` の `ok`、`result`、`error` は Studio からの応答であり、完成条件の未達などは `result` 内の `completionAccepted` や `nextActions` まで確認する。`--output-dir` を指定すると、撮影や制作状態取得で得られた画像を指定フォルダーへ PNG として保存し、応答内の画像 `data` を絶対パスの `path` に置き換える。毎回別名で保存し、既存ファイルは上書きしない。省略時は base64 形式の画像データをそのまま返す。動画の保存先はこのオプションの影響を受けず、制作中ワールドの `Recording/` になる。

終了コードは、成功が `0`、Studio による拒否が `1`、引数の誤りが `2`、接続失敗が `3`、画像の書き出し失敗が `4` である。終了コード `4` の場合は操作自体が成功している可能性があるため、応答と `exportError` を確認し、編集操作をそのまま再送しないこと。

この CLI は Studio の描画環境を利用するため、画面を起動しない完全なヘッドレス実行には対応しない。ビジュアル編集からコード編集へ変換する既存の `xrift-studio convert` は別の CLI であり、詳細は [変換 CLI](./VISUAL_PROJECT_MIGRATION_CLI.md) を参照する。サブコマンドなしで起動した場合は、従来どおり MCP の stdio 接続として動作する。

開発時は `pnpm mcp:sidecar:prepare` を実行したあと、`src-tauri/target-mcp-sidecar/debug/xrift-studio-mcp.exe`（Windows）から同じコマンドを試せる。

## surface

`get_editor_context.starterEntityIds` は、初期テンプレートとの照合によって未編集と確認できた `starter-floor`・`starter-box` の ID を返す。新しい空間を作る依頼では、これらの初期配置を置き換えたり削除したりできる。一覧が空または省略されている場合は、名前や ID から削除可能と推測してはならない。書き込み前にはコンテキストを再取得して最新リビジョンを使い、編集済みの作品や依頼範囲外の内容はそのまま残す。また、選択中の Entity だけを理由に、ワールド全体を対象とする依頼を部分編集へ狭めない。

ワールド制作の開始・再開には `begin_world_authoring` / `get_world_authoring`、画像判定の記録には `review_world_authoring`、完成条件の確認には `complete_world_authoring`、制作ランの停止には `cancel_world_authoring` を使う。いずれも Studio に内蔵されており、利用者側のソースコードや追加ランナーは不要である。`capture_scene_view` は保存パスに加えて MCP の画像データを直接返す。制作状態の保存と鮮度判定の詳細は [ワールド制作ハーネス](./WORLD_AUTHORING_HARNESS.md) を参照する。

`begin_world_authoring` で開始する新しい制作ランには累積の上限（予算）がある。既定値は、変更 256 回、画像確認 8 回、進展なし 3 回、連続失敗 3 回、経過時間 900,000ms である。任意の `budget` 引数で `maxWrites`・`maxPasses`・`maxNoProgress`・`maxConsecutiveFailures`・`maxElapsedMs` を指定できる。書き込みは実行前に予約して保存し、失敗した試行も回数に含める。`get_world_authoring` の `state.run` には上限・累積回数・直近 128 件のジャーナルが入り、`writeAdmission`、`terminalReason`、`canComplete`、`reasons`、`nextActions` から次の操作を判断する。外部クライアント内部の推論回数は Studio 側から見えないため集計対象外である。

上限に達した制作ランでは、新たな制作書き込みが拒否される。読み取り・カメラ操作・撮影は引き続き利用でき、最後に許可された工程で現在の証拠が揃っていれば完了できる。`complete_world_authoring` は、最新シーンと保存済みフィンガープリントの一致、`spawn`・`iso` 両視点の画像、同一シーンに対する全条件の合格、および処理中の書き込みや保存が存在しないことを共通のゲートで検証する。未確認や保存待ちがある場合は `completionAccepted: false` と理由を返す。`replaceExisting` を使っても、同じ依頼の予算が自動リセットされることはない。

`cancel_world_authoring` は後続の書き込みを止め、撮影やレビューの完了証拠を無効化する一方で、シーン・素材・保存済みファイルはそのまま残す。MCP ブローカーはツールを直列処理するため、現在実行中のツールが完了したあとで停止要求を処理する（実行中プロセスの強制終了とは異なる）。停止した制作ランは完了できない。制作ランを持たない旧履歴や、明示的な制作ランを開始していない小規模な直接編集との互換性は維持している。

制作の実行権は常に 1 つに限定する。MCP の制作ランが実行中、または上限到達により停止中である間は、UI や MCP からの ChatGPT 新規制作・再開を拒否する。MCP ランが `cancelled` または `completed` になれば ChatGPT を開始できる。逆に ChatGPT が実行中の間は `begin_world_authoring` を拒否する。`project` サーフェス入口の `create_blender_model` も、永続化された同じ制作ランの書き込み予算をファイル生成前に検査し、実行結果を記録する。

制作状態と `list_component_definitions` は、ワールドプロジェクトの場合に `worldComponents` も返す。用途別の公式設備、配置と検証の手順、公式フィールド、プレハブの編集可能項目、現在の設備一覧を確認できる。交流・共同作業・発表の場では画面共有を最初に検討し、採用または省略の理由と設置場所を設計図に残す。鏡はアバター確認、タグ選択はイベントのタグ切り替えに合わせて選ぶ。`place_builtin_prefab` は `componentId` と該当する `placementGuidance` を返す。位置・向き・大きさを調整し、客席や操作位置から撮影して確認したうえで、対応環境で実際の動作を検証する。設備を配置しただけで共有や同期が動作したとみなしてはならない。

ツールは実行場所と副作用の有無に応じて、次のサーフェス（surface）に分類し、権限境界として扱う。`document` 以外の操作には、React シェルまたは Tauri 側での副作用が伴う。

| surface | 実行場所 | 性質 |
| --- | --- | --- |
| `project` | `App.tsx` | プロジェクトの作成・開く・閉じる、公開、アカウント確認。エディターの外で動作するため、プロジェクトが開いていなくても呼び出せる |
| `document` | `mcp-editor-tools.ts` | ドキュメントセットに対する純粋な関数。副作用なし |
| `async-document` | `mcp-code-authoring.ts` とエディター | 原本の静的変換を非同期で検証し、通常のリビジョン・履歴・自動保存へ反映する |
| `local-asset` | React シェル | ネイティブのファイル入出力を伴う |
| `script` | React シェル | プロジェクトのファイル入出力または動作確認モードの変更を伴う |
| `external-store` | React シェル | ネットワーク通信と取り込みキューを使う |
| `debug` | React シェル | ビューポート情報の取得、撮影、制作確認状態の保存。`SceneDocument` は変更しない |

書き込み系ツールは `projectId`、`sceneId`、`expectedRevision` を必須とする。古いスナップショットへの上書き適用を防ぐためであり、複数クライアントから同時にアクセスしても編集は直列化される。

MCP の要求は常にシェル（`App.tsx`）が受け取る。`project` ツールはシェル自身が処理し、それ以外は開いているエディターへ振り分ける。エディターが開いていない間はシェルが `EDITOR_UNAVAILABLE` を返し、`list_projects`、`open_project`、`create_project` の利用を案内する。エディターは MCP リスナーを登録した時点でシェルへブリッジ（最新バンドル取得・保存・終了）を登録し、シェルはこのブリッジを通じて公開やプロジェクトを閉じる操作を実行する。

`set_entity_model` は既存の Entity に Assets のモデルを設定し、`Mesh Renderer` がなければ追加する。引数には `projectId`・`sceneId`・`expectedRevision`・`entityId`・`modelAssetId` を渡す。`Mesh Renderer` が複数ある場合は `componentId` も指定する。名前・Transform・他の Component・手動で追加した子 Entity は維持したまま、同じ Entity を更新する。元モデルの既定マテリアルやポーズは新しいモデルに合わせて更新される。自動生成された Box Collider は新しい寸法に合わせて調整し、手動設定の Box Collider はそのまま残す。元の生成子に付いていた Mesh Collider は新モデルへ引き継ぐ。モデルの一部ノードへの適用、手動の子や Component が失われる差し替え、別形状モデルを使う Collider が存在する場合は拒否する。編集モードで読み込み済みのモデルだけを対象とし、素材の新規取り込みや新 Entity の配置は行わない。実行後は `get_entity_components` と `capture_scene_view` で結果を確認する。

## instructions と description の役割

利用者のプロジェクトに接続した AI クライアントが参照できるのは、サーバーの `instructions` と各ツールの `description` である。このリポジトリ内のスキルやドキュメントは外部クライアントには届かないため、制作手順は `instructions` の先頭に記載する。各ツールの `description` には、機能、選択基準、実行後の確認事項、失敗しやすい条件を明記する。ツールを採用するかどうかは設計図の内容に応じて判断するため、`description` に一律の禁止ルールは書かない。

共通の制作方針は `world-authoring-guide.json` から読み込む。方針は実際の作業順に並べており、「対象と合格基準」「現在のシーンと維持する特徴」「不具合の再現と修正順」「ワールド全体の構成」「モデルの形状と表面」「制作方法と再利用」「同条件比較による合否判定」「配置を保った差し替えと終了」の順で構成している。原因に合った最小単位で修正すること、モデルの形状を先に作って表面を後から合わせること、修正前後を同じ視点や同じ操作で比較することは、個別トピックを読まなくても毎回伝わるようにしている。`get_world_authoring_guide` で `topic: "overview"` を指定すると共通方針と制作方法の概要だけを返し、`r3f`・`assets`・`blender` を指定すると選んだ制作方法の詳細だけを返す。現在の接続先で利用できる操作はツール定義と機能情報（capability）で確認する。全制作方法の長い解説を毎回のエディターコンテキストに含めることはしない。

設計ガイドは `spatial-ui`・`environment`・`refinement`・`model-quality` の各トピックで取得する。`spatial-ui` は展示・案内・メニューにおける文字階層、余白、読む距離、再利用可能な静的 TSX 例、および UIKit 用スクリプトの入り口を返す。`environment` は Skybox と IBL の違い、照明設計、VR/WebGL の負荷確認を解説する。`refinement` は既存のモデル・動作・案内の品質を高める共通手順（基準版の対応付け、症状別の確認・修正箇所、最小単位の修正、同条件比較、複数件の記録）を返す。`model-quality` は主役モデルの制作や既存モデルの見た目改修に使い、参考資料と実際の描画を見比べ、通常の鑑賞距離で目立つ欠点から直して前後画像で判定する手順を返す。制作手段自体は `r3f`・`assets`・`blender` に従い、専用のツールや検査は追加しない。`overview` は概要だけを返し、作業内容に必要な詳細を都度選んで読む。R3F の `Text` では `fontWeight`、`textAlign`、`lineHeight`、`letterSpacing` も保持され、Text 背景の `borderRadius` は `update_component` で設定できる。

UIKit を使う場合は、`list_script_templates` の `uikit-panel` を `apply_script_template` で配置し、`update_script_component` や `update_script_asset` で調整する。`@react-three/uikit` と `@pmndrs/uikit` は TSX スクリプトの `Render` で実行する仕組みであり、静的な `apply_r3f_scene` では UIKit を実行しない。Font アセットを使う場合は `assetReferences` にも宣言し、Play で文字の読み込みと描画を確認する。右クリックからのチャット添付や AI での作り替えも、既存の添付引数と `generate_chatgpt_world` の `options.modelSource` で同じ操作を依頼できるため、専用ツールは追加していない。作り替えの初期値は `auto` であり、外部素材・コード・UIKit・Blender を用途に応じて選択する。利用者は送信前に `store` や `blender` へ変更できる。

`update_scene_settings.ambient.enabled` で Ambient Light の有効・無効を切り替え、`color` と `intensity` で色と強さを調整する。強さだけを変えても、無効状態のライトは有効にならない。`analyze_performance` は制作データの件数に基づく目安を算出するものであり、ヘッドセット上の実フレーム時間を計測する機能ではない。

地形と草には 14 本、床には 1 本のツールがある。説明がなければ AI がツール数の多い機能を優先して選んでしまうおそれがあるため、用途に応じた選び方を案内している。この設計判断と経緯は [ワールド制作ハーネス](./WORLD_AUTHORING_HARNESS.md) を参照する。

`document` ツールの戻り値には `harness` が付くことがある。同じ種類（地形、草、同じオブジェクトの位置・回転・大きさ、同じマテリアル）への書き込みを `capture_scene_view` を挟まずに 3 回連続で行ったときに付与される警告である。この警告自体は書き込みを拒否せず、エディターのメモリ状態だけを使って判定する。明示的な制作ランの累積予算とは別の仕組みであり、制作ラン側の上限に達した場合は書き込みそのものが拒否される。

## project (29)

**Library / セッション**
`list_projects`, `list_starter_templates`, `create_project`, `open_project`,
`close_project`

`create_project` はスターターテンプレートからプロジェクトを作成してエディターで開き、`open_project` は Library 内のビジュアル編集プロジェクトを開く。いずれも現在開いているプロジェクトを保存して閉じてから切り替える。コード編集プロジェクトを指定した場合は `PROJECT_NOT_EDITABLE` で拒否する。

**複製と受け渡し**
`duplicate_project`, `export_project`, `import_project`

`duplicate_project` は Library のプロジェクトを同じ保存先へ別名で複製する。`export_project` は 1 つの `.xriftstudio` ファイルに書き出し、`import_project` はそのファイル、従来の `.zip`、または Git リポジトリを Library へ展開する。この 3 つはコード編集プロジェクトも対象にするが、処理結果をエディターで自動的に開くことはしない。開くには返却されたパスを `open_project` に渡す。複製と取り込みでは `projectId` を新しく採番し、`lastPublication` と `.xrift/*.json` の公開記録を除外するため、公開しても元のワールドを上書きしない。

パッケージには `node_modules`、`.git`、`dist`、キャッシュを含めない。同名のフォルダーがすでに存在する場合は `PROJECT_EXISTS` で拒否し、上書きや統合は行わない。`export_project` は出力先パスを受け取らず、Library の `.cache/exports` に書き出した `.xriftstudio` ファイルのパスを返す。任意のパスへ書き込めると Library 外のファイルを上書きする危険があるためである。

`import_project` は `archivePath`（`.xriftstudio` / `.zip`）または `repositoryUrl`（Git の HTTPS / SSH URL。履歴を持ち込まないよう shallow clone する）のいずれか 1 つを受け取る。`archivePath` は読み取り専用で扱い、ZIP の直下または単一フォルダー内にプロジェクト定義が見つからない場合は検査（`inspect`）の段階で拒否する。ZIP の構成とパッケージマニフェストは従来どおりであり、拡張子の違いによるドキュメント変換は行わない。詳細は [プロジェクトの受け渡し形式](./PROJECT_PACKAGE.md) を参照する。

### ChatGPT による現在のシーンの編集

制作チャットの `/goal 目標` は、既存の `generate_chatgpt_world` に `mode: "goal"` を指定することで同じ継続制作を開始できる。各反復で現在のシーンを取得し、変更を保存しながら見直しを続け、改善点がなくなったら完了する。停止には `cancel_chatgpt_generation` を使う。質問待ち、進展なし、失敗、シーン変更のいずれが起きても、保存済みの成果はそのまま残る。

Studio 内の ChatGPT 制作は 1 つの Pi セッションで実行する。正式ツールの直接登録と Pi 標準の `tool_search`・`codemode` を使い、固定の担当別セッションや Studio 独自のターン数・呼び出し回数・制作時間の上限は設けない。外部 MCP ランの予算とは別経路であり、そのジャーナルを Pi 操作へ重ねない。詳細は [Pi SDK による Studio 制作](./CHATGPT_AUTHORING.md) を参照する。

モデル処理や副作用を伴う操作の前には会話履歴を確定（flush）し、保存に失敗した場合は開始しない。Studio 再起動後に残っていた実行中の制作ランは中断終了として扱い、自動再開はしない。`cancel_chatgpt_generation` は対象 `generationId` のネイティブ側キャンセルを要求し、所有している処理の終了を待って、遅れて届いた結果の反映を拒否する。MCP ツールの直列処理上で動く `cancel_world_authoring` とは停止範囲が異なる。

`cancel_chatgpt_generation` の応答は停止要求を受理したことだけを示し、処理終了の通知ではない。`get_chatgpt_generation` は所有処理の終了（drain）が完了するまで `status: "running"`・`cancelling: true` を返し、完了後に `cancelled` へ遷移する。ネイティブ側のリース登録前に届いた取り消し要求も、同じ `generationId` の進捗イベント経由で再送する。自動修復と継続実行は同じ `generationId` と予算を引き継ぎ、利用者がキューの「再試行」を選んだ場合だけ新しい `generationId` で開始する。旧ランは閉じた履歴として残す。制作方針とコンテキストの省略件数は、既存の検証済み会話データに含めてネイティブ側へ渡し、自動修復時にも引き継ぐ。

`get_chatgpt_connection`, `connect_chatgpt`, `disconnect_chatgpt`, `list_chatgpt_models`, `open_chatgpt_panel`, `generate_chatgpt_world`, `get_chatgpt_generation`, `apply_chatgpt_plan`, `cancel_chatgpt_generation`, `list_chatgpt_sessions`, `get_chatgpt_session`, `manage_chatgpt_session`, `revert_chatgpt_generation`

`connect_chatgpt` はブラウザでの認証フローを開始して直ちに制御を返す。本人が許可を完了したあと、`get_chatgpt_connection` で `connecting: false`、`restoring: false`、`signedIn: true`、`planUsageEnabled: true` を確認する。失敗理由は `error` に記録される。更新用の認証情報は OS の安全な保存領域に保管し、Studio 起動時に復元する。認証情報を MCP やプロジェクト内へ出力することはない。XRift の `login` とは独立した接続であり、接続操作と状態確認はプロジェクトを開いていない状態でも実行できる。外部 MCP クライアントの登録は、制作チャット入力欄の下にある「MCP接続」、またはプロジェクト一覧の「設定」から行う。「MCP接続」を開くと、登録済みのサーバー設定が同梱版へ自動更新される。更新後は案内に従って AI クライアントを再起動するか MCP を再読み込みする。

ワールドを開いた状態で `list_chatgpt_models` を呼び出し、利用可能なスラッグ・表示名・`supportedReasoningEfforts`・`defaultReasoningEffort` を取得する。対応する思考量はモデルごとに異なり、情報が得られない場合は空配列と `null` を返す。モデル名から対応値を推測してはならない。`open_chatgpt_panel` は同じエディター内の ChatGPT タブを開き、Scene View の横で変更内容と進行状況を確認できるようにする。Studio のチャットでは依頼を送るとそのまま編集が進み、制作モードの切り替え UI は表示しない。未接続時の接続カード、処理・復元中の案内、接続エラーは会話中央に表示し、接続後は右上のアカウントアイコンから詳細を確認できる。

`generate_chatgpt_world` には、最新の `get_editor_context` で取得した `projectId`・`sceneId`・`expectedRevision`、選択した `model`、2000 文字以内の `prompt` を渡す。任意の `reasoningEffort` には、`none`・`minimal`・`low`・`medium`・`high`・`xhigh`・`max` のうち選択モデルの `supportedReasoningEfforts` に含まれる値だけを指定できる。省略時は対応していれば `low` を優先し、非対応ならカタログの対応済み `defaultReasoningEffort` を使う。モデル情報を確認できない場合は推論 API に思考量を渡さない。明示した対応値はそのまま適用し、非対応の指定は推論 API へ送る前に拒否する。`options` は `models`・`materials`・`audio` の真偽値と、任意の `modelSource: "auto" | "blender" | "store"` を持つオブジェクトであり、省略時はすべて有効・制作方法は自動になる。Blender を使うには端末に Blender がインストールされている必要があり、`store` を選んだ場合は Blender による生成を行わない。実行には編集モードであることと、素材の取り込みなど他の処理が完了していることが必要である。アイテムプロジェクトでは生成できない。

生成には接続アカウントの利用枠を使用する。開始応答では `generationId` と `status: "running"` を返す。既定値は `target: "current"`、`mode: "build"` である。現在のシーンにある既存 Entity の位置・回転・大きさ・名前、モデル・マテリアル、Skybox・Audio Source・Collider を調整し、必要な Entity を追加する。空間全体を作る依頼では、初期配置の再利用にとらわれず、主な特徴・導線・照明を備えた構成を作る。`hasMore`・`remainingWork` で残作業を示し、利用者に内部 JSON や件数の調整を求めない。`target: "new"` を明示すると新しいワールドを作成する。

MCP / API の `mode: "plan"` は Plan の検証までを行い、`status: "planned"` と公開用の Plan 概要を返す。この段階ではシーンやプロジェクトファイルを一切変更しない。内容を確認したあと、最新の `get_editor_context` から得た `projectId`・`sceneId`・`expectedRevision` と `generationId` を `apply_chatgpt_plan` へ渡す。元の作品とシーンを開いている必要があり、古いリビジョンは拒否する。確認後にシーンが変更されていた場合は、手動編集を保護するため実行を拒否し、最新シーンから新しい Plan を依頼するよう促す。モデルと思考量の設定は引き継ぐ。`cancel_chatgpt_generation` は未反映の Plan を破棄するか、実行中の制作を停止する。Studio に確認待ちが表示された場合の操作名は「変更を反映」「変更を破棄」である。

通常の制作では、推論中にシーンや素材が編集された場合、最新情報をもとに内容を考え直す。反映中は無関係な編集を統合しつつ、変更対象と競合する部分だけを再計画する。保存済みの作業と手動編集を保護したまま、未完了の作業を継続する。再確認と修正は同じ Pi セッション内で行う。停止やエラーが発生しても保存済みの変更はそのまま残る。次の依頼では現在のシーンと会話履歴を読み直して進める。

`get_chatgpt_generation` で同じ `generationId` を確認し、`progress` の `phase`・`message`（実行中の工程）、`completed`・`total`（保存済みの件数）、`recentEvents`（直近の実行結果）、`projectId`（生成先）を読み取る。状態は `running`・`planned`・`completed`・`cancelled`・`failed` のいずれかである。開始直後や途中の進行表示を完了とみなしてはならない。検証後に下書きを保存し、素材の取り込みと Entity の調整・配置を順次進めながら各工程の結果を保存する。途中の失敗や停止でも保存済みの結果は残され、停止によって反映済みの変更が取り消されることはない。`completed` の保存先、または `failed` のエラーを確認し、`get_editor_context` と `capture_scene_view` で実際の状態を確認する。制作中に作品やシーンが切り替わった場合は追加処理を停止する。公開処理は行わない。会話の公開履歴は端末に保存し、Plan の実行用データと変更を戻す控えは Studio 終了までメモリ上に保持する。

全体のマテリアル変更にも正式な素材ツールを使う。Pi が対象と設定を読み取って変更・保存し、保存後の Project Health と実際の描画画像が現在のシーンと一致し、依頼条件を満たした場合にだけ完了とする。

`list_chatgpt_sessions` は現在の作品・シーンの会話一覧、`get_chatgpt_session` は `sessionId` の会話内容とコピー用の全文を返す。`manage_chatgpt_session` は最新の作品・シーン・リビジョンを使って `create`・`select`・`rename`・`delete` を実行する。履歴を削除してもシーンは変更されない。`generate_chatgpt_world` に `sessionId` を渡すと会話を引き継ぎ、直近の相談内容と現在のシーンをもとに制作する。履歴は端末内に最大 20 チャット・各 30 件・合計 3 MiB の上限で保存する。再起動時には実行中や未反映 Plan の記録を終了状態へ更新し、すでに失われた処理を実行中として表示しない。

`revert_chatgpt_generation` は最新の作品・シーン・リビジョンと `generationId` を受け取り、依頼前のシーンと素材の状態を復元して保存する。実行には `revertAvailable` が必要であり、その後に手動編集や別の依頼が行われている場合は拒否する。控えは Studio 起動中の直近 8 件まで保持され、再起動後は利用できない。ダウンロード済みのファイルと会話履歴は削除しない。

`disconnect_chatgpt` は認証・復元・推論の実行中には解除を拒否する。Studio 内と OS の保存領域から接続情報を削除し、ChatGPT 側のリフレッシュトークンも失効させる。リモート側での失効を確認できなかった場合は、返却された `error` の内容に従って ChatGPT 側の設定を確認する。

### Blender でモデルを作成する

`get_modeling_tools`, `create_blender_model`

パーツ単位の既存 `.blend` ファイルは `import_model_asset` で取り込める。端末に Blender が必要であり、128 MB 以内で外部リンクをローカル化し、画像をパック済みのファイルを使用する。編集元の `.blend` はプロジェクト内へコピーして Model の `blenderSource` に保存する。Assets の「Blenderで編集」からそのコピーを開き、保存後に `reimport_model_asset` を実行すると、Model ID と配置を維持したまま表示用 GLB を更新できる。`create_blender_model` で新規作成した結果も編集元を Assets の管理下に保存する。公開時には表示用 GLB を使う。

`get_modeling_tools` はインストール済み Blender の利用可否とバージョンを返す。プラグインや ChatGPT 接続は不要である。`create_blender_model` には最新の `get_editor_context` の作品・シーン・リビジョンと `model` を渡す。`model` は名前と最大 64 個の `parts` を持ち、各パーツは `box`・`sphere`・`cylinder`・`cone`・`torus`・`mesh`・`tube`・`lathe` から形状を選び、位置、Euler XYZ の回転、寸法、色、`metallic`、`roughness` を指定する。座標系は Studio の Y-up・メートル単位、回転は度数法である。`mesh` では `vertices` と `faces` を指定する。`tube` は `vertices` に 2〜128 個の中心線座標、`bevel` に管の半径を指定して滑らかな曲線形状を生成する。`lathe` は `vertices` に順番に並べた `[半径, 高さ, 0]` の断面座標を指定し、Y 軸を中心に 32 分割で回転体を生成する。`tube` と `lathe` の `faces` は `null` にする。各パーツには UV が自動生成される。任意の Python コードや外部ファイルを渡すことはできない。

編集モードで実行すると、独立した Blender プロセスが実 GLB と編集可能な `.blend` を生成し、GLB を通常の Model として Assets に保存する。既存の Blender 作品は変更しない。返却された `modelAssetId` を `get_model_asset` で確認し、`place_asset` でシーンへ配置する。生成中に利用者が別の Entity を編集しても、その編集内容は保存結果に統合される。作品やシーンが切り替わった場合は反映を停止する。

**アカウント**
`get_account`, `login`, `reload_xrift_items`

公開済みアイテムは `add_component` で `xrift.item` を追加し、`update_component` で `itemId` を設定する。`placementId` は配置ごとに自動生成され、公開設定の `world.items` はシーンから自動生成される。読み込みに失敗した場合は、`reload_xrift_items` で現在のログイン状態を使って再試行できる。応答は再試行を開始したことだけを示すため、`capture_scene_view` で実際の表示を確認する。

`login` は Studio 内で `xrift login` を開始する。ブラウザでの認証は利用者が完了し、認証情報は Studio 実行環境のホームディレクトリに残る。MCP へはログイン有無と表示名だけを返す。

**公開**
`get_publish_readiness`, `publish_project`

`get_publish_readiness` はプロジェクトを保存したうえで、公開情報（スターターのタイトル・説明のままでないこと）、サムネイル、ログイン状態、コンパイラの公開を妨げる診断エラーを確認し、不足項目ごとに修正用ツールを `nextActions` で返す。`verifyBuild: true` を渡すと、さらに `publish_project` がアップロード前に行う処理（変換・パッケージの取得・`xrift check --build` と `strict` の型検査）をそのまま実行し、`requirements` に `build` を加えて `buildCheck`（`passed`、`summary`、スクリプトの Asset ID・名前・パス・行・列を持つ `scriptTypeErrors`、ほかの段階で止まったときの `output`）を返す。数分かかることがあるが、ログインは不要で、アップロードはしない。Play はスクリプトを型検査しないため、スクリプトを変えたあと、公開できると伝える前に使う。`publish_project` は同じ確認を通過した場合にだけ、公開ダイアログと同じ `publishVisualProject` パイプライン（保存・変換・`xrift check --build`・アップロード）を実行し、結果をプロジェクトの `lastPublication` に保存する。利用者が明示的に公開を依頼した場合にだけ呼び出すこと。

## async-document (1)

`apply_r3f_scene`

完全な静的 R3F 原本から、まとまった形状と配置を編集可能な Entity として作成・更新する。最新の `projectId`・`sceneId`・`expectedRevision` と、`name`・`source` を渡す。新規作成時は `entityId` を省略するか `null` にし、返却されたルート Entity の ID を控えておく。対応構文と制約は `get_world_authoring_guide` の `topic: "r3f"` で取得できる。

更新時はそのルート Entity を `get_entity_components` で読み取り、`r3fAuthoring.source` の完全な原本を修正して、同じ `entityId` へ渡す。安定した名前・`key` と変更しない部分はそのまま残す。生成された子 Entity は原本更新の対象にしない。`list_entities` は原本の有無とバージョンだけを返し、全 TSX コードを一覧に重複して含めることはしない。

変換処理は任意の JavaScript を実行せず、非対応構文は `R3F_SOURCE_INVALID` で拒否する。手動変更が失われる場合は `R3F_EDIT_CONFLICT`、変換中に編集状態が変わった場合は `STALE_REVISION` を返し、部分的なシーン変更は反映しない。同じ原本であれば `changed: false` を返し、リビジョンと Undo 履歴を増やさない。制作ラン中は通常の書き込み予算を消費し、変更のない試行や失敗も記録する。反映後は保存済みシーンを撮影して完成条件を確認する。

変換中にエディターが観測した素材のサムネイルや保存日時だけの更新は、最新状態へ合流させて保持する。手動編集、取り消しで元に戻した編集、停止やスクリプト保存による明示的なリビジョン更新はこの例外に含めない。この派生更新の比較は非同期の原本変換中だけに行い、通常の編集へシーン全体の比較処理を追加しない。

## document (103)

**Editor context / Project**
`get_editor_context`, `get_world_authoring_guide`, `get_project_health`, `analyze_performance`, `get_scripting_capabilities`, `update_project_metadata`

`get_project_health` は既存のプロジェクト・シーン・素材の検証を実行し、要素数とほぼ 0 になっている Scale を報告する。`scope: document` の `ready` は実ファイルの存在、Play での動作、公開可能な状態を保証するものではない。指摘を修正したら再診断を行い、通常の Play・コンパイル・公開前チェックへ進む。

`analyze_performance` は編集データの Entity / Light / Rigid Body / Texture / Model の件数を目安値と比較する。無効化されている要素や未使用の素材も集計に含まれる。配置されたプレハブは中身を展開して数え、配置数と展開後の Entity 数を `prefabExpansion` で返す。たとえばライト付きの街灯を 20 か所に配置すれば、ライトは 20 件として集計される。スクリプトによる実行時生成は含まれない。80% 超で `warning`、100% 超で `over-budget` となる。FPS・メモリ・三角形数の実測ではなく、公開を止める条件には使わない。これら 2 つのツールはいずれも `document` サーフェスの読み取り専用操作であり、シーン・リビジョン・保存状態を変更しない。

**素材一覧と整理**
`list_assets`, `create_asset_folder`, `rename_asset`, `rename_asset_folder`,
`move_asset`, `move_asset_folder`, `detach_asset_references`, `delete_asset`,
`delete_asset_folder`, `create_document_asset`

`delete_asset` は参照されている素材の削除を拒否し、詳細に参照元一覧を返す。この拒否は `detach_asset_references` で解消できる。エディターの削除ダイアログにある「参照を外す」と同じ処理であり、マテリアル枠のような差し替え可能な参照は空になり、メッシュ形状・パーティクルエミッター・プレハブインスタンスのように参照なしでは成立しない Component は外れる（Entity 自体は残る）。`ownerId` を指定すると 1 件だけ参照を外せる。`delete_asset` に `detachReferences` を指定すれば、参照の解除から削除までを 1 回で実行できる。

**素材の設定**
`get_audio_asset`, `get_model_asset`, `update_model_asset`,
`get_texture_asset`, `update_texture_asset`, `get_particle_asset`,
`update_particle_asset`, `get_material_asset`, `update_material_asset`, `update_material_assets`,
`set_material`, `set_material_texture_transform`, `list_material_presets`,
`create_material_from_preset`, `create_custom_shader`,
`get_custom_shader`, `update_custom_shader`

`update_material_asset` の `patch.shadingModel` は `standard`、`mtoon-0.x`、`mtoon-1.0` を受け付ける。各素材の色・テクスチャ・UV を引き継いだままシェーディングの種類を変更でき、Standard へ戻すと MToon 専用設定が控えに保存され、再び MToon を選んだときに復元される。`mtoon-0.x` は旧版の陰影互換モードであり、保存される `VRMC_materials_mtoon.specVersion` はどちらも `"1.0"` になる。既存の `patch.extensions.VRMC_materials_mtoon` による輪郭線・陰影の編集も引き続き使える。単体編集は従来どおり編集モードと Play の両方で実行できる。

複数素材を一括編集する場合は、編集モード中に `update_material_assets` へ `assetIds` を渡す。`patch` と `fieldUpdates` のどちらか一方を指定し、全変更を 1 回のリビジョン・Undo・自動保存として確定する。Custom Shader マテリアルやマテリアル以外の素材は変更せず、`skippedAssets` に理由を返す。未知の ID が含まれている場合は変更前に `ASSET_NOT_FOUND` で拒否する。通常設定は対象マテリアルの種類が揃っている場合にのみ変更できる。種類が混在している場合は、先に `patch: { "shadingModel": "mtoon-0.x" }` などで種類を統一し、最新コンテキストを取得してから設定を変更する。種類が混在したまま種類の変更と通常設定を同時指定すると `MATERIAL_SHADING_MISMATCH` になる。

`fieldUpdates` は `[{ "path": "extensions.VRMC_materials_mtoon.shadeColorFactor.0", "value": 0.5 }]` のように、`properties` 接頭辞を省いた保存値のパスで指定する。`.0` などの成分だけを変更すれば、各素材の他の RGB・Alpha・UV 成分はそのまま残る。テクスチャ参照の `.textureAssetId` だけを変更する場合も各 UV 設定が維持される。たとえば `pbrMetallicRoughness.baseColorTexture.transform.offset.0` は UV の X オフセットだけを変更する。未割り当てのマップに対する UV や Scale の操作は、その素材だけ変更をスキップする。新しいテクスチャ参照が存在しないかテクスチャ以外の素材であれば、`INVALID_TEXTURE_REFERENCE` で全体を拒否する。`extensions.KHR_materials_clearcoat.enabled` などの真偽値操作は Inspector と同じ依存関係ルールに従う。

未知のパス、シェーダーやメタデータのパス、不正な値は変更を適用する前に `INVALID_ARGUMENT` で拒否する。`updatedMaterialAssetIds` には実際に値が変わった素材 ID だけを返し、すべて変更前と同じ値だった場合はリビジョンを増やさない。更新後は `get_material_asset` で保存値を確認し、割り当て先のメッシュを `capture_scene_view` で確認する。一括編集は Play 中には `EDITOR_READ_ONLY` となるため、Play 中の単体編集には `update_material_asset` を使う。

`create_custom_shader` の `shader` と `update_custom_shader` の `patch` は、次の uniform とバリアント設定を受け付ける。`get_custom_shader` は保存された値をそのまま返す。追加項目はすべて省略可能であり、省略時の描画は従来どおりとなる。編集・Play・生成されたワールド・ランタイム JSON の読み込みはいずれも、共有ランタイムの `createClassicShaderMaterial` でこの記述からマテリアルを組み立てる。

| `kind` | GLSL の型 | 値 |
| --- | --- | --- |
| `number`、`color`、`vector` | `float`、`vec3`、`vec2`〜`vec4` | `value` に数値、`#rrggbb`、2〜4 個の数値 |
| `matrix` | `mat3`、`mat4` | `value` に 9 個または 16 個の数値を列優先で並べる |
| `array` | `float`、`vecN`、`matN` の配列 | `value` に 1〜4096 個の数値を平坦に並べる（例: `vec3 uPoints[4]` は 12 個） |
| `texture` | `sampler2D` | `textureAssetId`。8bit 画像、KTX2、EXR を読み込む。EXR はファイル本来の精度（16bit または 32bit）の浮動小数点数として渡される |
| `texture-3d` | `sampler3D` | `textureAssetId` に、スライスを左から右へ並べた 8bit 画像を指定する。`slices` を省略すると正方形スライスとして数える。1 辺とスライス数は最大 256。スライス内の横が x、縦が y（画像の上端が 0）、スライス番号が z になる |
| `texture-cube` | `samplerCube` | `faces` に `{ "textureAssetId": "…" }` を +X、-X、+Y、-Y、+Z、-Z の順で 6 個指定する。同じ大きさの正方形の 8bit 画像を使用する |

テクスチャの uniform は `colorSpace`（`srgb` または `linear`、省略時は変換なし）と `filter`（`linear` または `nearest`、省略時は `linear`）を指定できる。`texture` と `texture-3d` は `wrapS`・`wrapT` に、`texture-3d` はさらに `wrapR` にも `repeat` または `clamp-to-edge` を指定できる。省略時は `texture` が `repeat`、`texture-3d` が `clamp-to-edge` になる。32bit EXR を `filter: "linear"` で読むには端末側の対応が必要なため、数値テーブル用途には `filter: "nearest"` か 16bit EXR を使う。

`texture`と`texture-cube`は`generateMipmaps`と`anisotropy`も持てる。`generateMipmaps: true`は、画像を元より小さく描く場所でMipmaps（縮小表示用の画像）を読む指定である。遠くの面や、細かく繰り返す面のちらつきを抑える。省略時と`false`では元の大きさの画像だけを読む。`filter`は1段階の中での読み方を決め、Mipmapsは隣り合う2段階を常に混ぜる。

| `filter` | `generateMipmaps` | 拡大したとき | 縮小したとき |
| --- | --- | --- | --- |
| `linear` | 省略、`false` | 補間する | 元の画像だけを補間して読む |
| `nearest` | 省略、`false` | 最も近い画素を読む | 元の画像だけから最も近い画素を読む |
| `linear` | `true` | 補間する | 2段階のMipmapsをそれぞれ補間して読み、混ぜる |
| `nearest` | `true` | 最も近い画素を読む | 2段階のMipmapsからそれぞれ最も近い画素を読み、混ぜる |

Mipmapsの作り方は画像の形式で決まる。8bitの画像は読み込むときに作る。KTX2はファイルが持つMipmapsを使い、持たないファイルはMipmapsなしで読む。EXRには作らない。浮動小数のMipmapsを作れない端末があり、その端末では黒く描かれるためである。

`anisotropy`は1〜16の整数で、斜めから見た面をぼかさずに描く。省略時は1で、効果はない。2以上は`generateMipmaps: true`と`filter: "linear"`（省略でもよい）の組み合わせでだけ指定できる。それ以外の組み合わせは描画に反映されないため、`CUSTOM_SHADER_INVALID`で拒否する。端末が対応する上限を超えた値は、その上限として扱われる。`texture-3d`は`generateMipmaps`と`anisotropy`を指定できない。

`variants` の各要素は、`side`、`transparent`、`depthWrite`、`defines` に加えて、`blending`（`normal`、`additive`、`multiply`、`subtractive`、省略時は `normal`）と `frustumCulled`（省略時は `true`）を持てる。`blending` の指定は `transparent` の値を自動変更しないため、光や煙を重ねる場合は `transparent: true` と `depthWrite: false` も合わせて指定する。`frustumCulled: false` は、頂点シェーダーでメッシュを元の位置から大きく移動させる場合に指定する。この設定はそのマテリアルを付けたメッシュだけを視錐台カリングの対象から外し、マテリアルを外すと元に戻る。

シーンが決める値は、次の名前のuniformを宣言したシェーダーにだけ渡る。マテリアルに保存した値の代わりに使われる。風は`uWindDirection`（`vector`、2個）、`uWindSpeed`、`uWindTurbulence`（`number`）。主光源と環境光は`uSunDirection`、`uSunColor`、`uAmbientColor`（`vector`、3個）、`uSunIntensity`、`uAmbientIntensity`（`number`）。割り当て先がプリミティブ、Terrain、モデルのどれでも、編集・Play・生成するワールド・Runtime JSONで同じ値になる。時刻は`uTime`などの名前か`animatedTimeUniform`で受け取る。

形式が不正な記述は `CUSTOM_SHADER_INVALID` で拒否し、`details.diagnostics` に `uniforms.<名前>: …` や `variants[0]: …` の形式で原因をすべて返す。存在しないテクスチャ、その種の uniform で扱えないテクスチャ（`texture-3d` や `texture-cube` への KTX2・EXR、およびすべての種類への HDR）、サイズ条件を満たさない画像は `CUSTOM_SHADER_TEXTURE_INVALID` で拒否し、`details.uniforms` に対象の uniform 名、`details.diagnostics` に原因を返す。テクスチャは先に `import_texture_asset` で取り込み、`get_texture_asset` でサイズを確認してから指定する。いずれのエラーでもマテリアルは変更しない。

`create_custom_shader` は任意の GLSL を受け付けるが、「空のように見せる」用途ではゼロから書かずにカタログから選ぶ。ゼロから書くとカタログ側で調整済みの数値を一から決め直すことになるためである。`list_material_presets` は空・水・グロー・glTF 拡張のカタログを返し、名前付きパラメーターと範囲・既定値を含む。`create_material_from_preset` はマテリアルを作成し、次の手順を `nextStep` で返す。空マテリアルはシーン設定の Skybox に割り当てて初めて空になり、水マテリアルは板ポリゴンへ割り当てて初めて水面になるため、作成しただけでは完了しない。水のうち `category: "river"` は流れる川であり、向きと中心線を割り当て先のメッシュから取得する。`nextStep` では細長い水平の Plane へ割り当てること、Entity の回転で向きを決めること、`uChannelWidth` を Plane の幅に合わせることを案内する。川の流れは `uFlowSpeed` で制御され、シーンの風が止まっていても動く（他の水は風が止まると止まる）。この違いは各項目の `notes` にも記載される。空の背景の各項目は `qualityOptions` に軽量・標準・高精細のバリアントと説明を返し、作成後の `update_custom_shader` に `patch.variants` として渡すことで uniform を維持したまま品質を切り替えられる。独自のバリアントがある場合は `get_custom_shader` で取得し、品質用 `defines` だけを統合する。ストア上の見回しや再生・停止は一時的なプレビュー操作なので MCP には公開しない。地形の地面は形状と合わせて `list_terrain_presets` から選ぶ。

Custom Shader をモデルへ `set_material` で割り当てると、頂点シェーダーはそのメッシュの属性を名前で参照できる。glTF の独自属性は小文字に変換されるため、`_AMAT` は `attribute float _amat;` と宣言する。`EXT_mesh_gpu_instancing` によるインスタンスごとの独自属性はインスタンス単位で 1 つの値として渡され、`_aoffset` と `_AOFFSET` のどちらでも参照できる。インスタンス配置には `instanceMatrix` を使う。編集・Play・公開のすべてで同じ読み込み処理を使う。仕様の詳細は [3Dモデルの読み込み仕様](./MODEL_IMPORT_CONTRACT.md#インスタンスごとの属性) を参照する。

`update_custom_shader` が更新するのは保存される uniform の値であり、歩く人の位置や CPU で計算する値など、動作中に変化する値には使わない。動的に変わる値はスクリプトから `ctx.materials.setUniform(name, value)` で毎フレーム渡す。値を決めるのは実行中のスクリプトでありドキュメントには残らないため、専用の MCP ツールは設けない。受け付ける値の形式、失敗時の表示、時間系 uniform との関係は `get_scripting_capabilities` の `runtime.materials.uniforms` で確認できる。uniform の名前と保存値は `get_custom_shader` で読み取り、型や形式が合わない値は `get_editor_context.scriptRuntime.failures` で確認する。

カスタムシェーダーの GLSL は Scene View のレンダラーでコンパイルして検証する。`create_custom_shader`、`update_custom_shader`、`get_custom_shader` の結果には `compile` が含まれ、`compile.status` は `ok`、`error`、`pending`、`unknown` のいずれかを返す。`error` のとき `compile.issues` には失敗したプログラムごとに 1 件の項目が入り、GLSL コンパイラの出力をそのまま `programLog`、`vertexLog`、`fragmentLog` に保持する。`lines` の各要素は `stage`、作者の GLSL 上の行番号 `line`、ログに出た行番号 `reportedLine`、`message`、該当行の本文 `source` を持つ。ログの行番号には Three.js が先頭に付加するコードと `#include` 展開後の行数が含まれるため、`line` と `reportedLine` は一致しない。`#include` 内で発生したエラーはその `#include` の行と `include` 名を返す。`#line` や展開されるループなどでコンパイル後コードとの照合から元行を特定できない場合は `line` を省略する。リンク失敗時は行番号を持たず `programLog` に理由が入る。

`origin: "check"` は、ツール呼び出し時にマテリアルを平面メッシュへ一時割り当てしてコンパイルした結果を表す。これにより、メッシュ未割り当てのマテリアルや画面外のマテリアルも検証できる。`origin: "scene"` は、シーン内のメッシュを実際に描画するプログラムでの失敗を表す。インスタンス描画やスキンメッシュは専用プログラムを使うため、特定のメッシュだけで起きる失敗もここに含まれる。シーンがすでにリンク済みプログラムで描画しているバリアントは再コンパイルしない。

シェーダーは形式検証（`void main()`、uniform、バリアント）を通過すれば、GLSL コンパイルに失敗しても保存される。その場合、マテリアルを割り当てたメッシュは描画されない。`compile.status` が `error` なら `lines` の該当行を修正して `update_custom_shader` で送り直す。`pending` はドライバーのコンパイルが 5 秒以内に終わらなかった場合、`unknown` は Scene View が非表示の場合または WebGL コンテキストをロストした場合に返る。いずれも `get_custom_shader` を呼び直すことで結果を取得できる。ツールは描画されないマテリアルの結果を待ち続けない。

`get_editor_context` の `customShaderErrors` は、現在の GLSL がコンパイルできないと判明しているマテリアル一覧を返す。各要素は `materialAssetId`、`materialName`、`issueCount`、先頭メッセージ `message` を持つ。ツールで検証したマテリアルに加え、Scene View が編集モードや Play 中に描画して失敗したマテリアルも含まれる。GLSL を書き換えたマテリアルは、次回コンパイルされるまで一覧から外れる。Skybox Shader と水面のマテリアルも同じ仕組みで診断できる。未知の `#include` は Three.js が描画時に例外を投げるため、コンパイル前に検出して該当行を `lines` で返す。

`kind: "gltf"` は glTF 拡張と PBR テクスチャのマテリアル一覧を返す。50 種類の見本セットに加え、互換性維持のため旧カタログの素材 ID も保持している。Clearcoat、Transmission、Volume、Dispersion、Iridescence、Sheen、Anisotropy、Emissive、Specular、IOR、Unlit と、Normal Map・ORM・UV・Alpha の比較セットを含む。

`comparisonMaterialAssetId` は比較用の基準マテリアルを指す。拡張機能の見本では基本の PBR 値を揃え、テクスチャの見本では比較対象のマップや UV 設定だけを変えている。`textureAssetIds` は必要な同梱テクスチャの ID を返す。効果を見比べるときは `list_scene_recipes` の `shelf: "materials"` から選び、`apply_scene_recipe` で見本一式を配置する。既存モデルに質感だけを付ける場合は `create_material_from_preset` を使う。テクスチャが必要なプリセットでは、保存済みプロジェクトへ画像を取り込んでからマテリアルを作成する。`parameters` は受け付けないため、調整には通常のマテリアル更新ツールを使う。

`list_scene_recipes` は `group`、`tags`、`comparisonLabels` も返す。`shelf: "materials"` は 50 種類、ワールド用の `shelf: "gimmicks"` は 50 種類の見本にカスタム車を加えて返す。ギミックの動作確認はシーンへ配置して Play で行う。カタログ内の回転・拡大・絞り込みは表示上の操作にすぎないため、専用の MCP ツールは追加しない。全項目と確認範囲は [カタログ拡充](./catalog-expansion/README.ja.md) に記載している。

写真・ポスター・展示画のように「画像そのものを貼る」用途では、カードではなく画像 Component を使う。`place_asset` に画像のテクスチャを渡すと、幅 1m で画像の縦横比をそのまま反映した画像 Entity が作成される（マテリアルは作らない）。既存 Entity に付ける場合は `add_component` で `core.image` を追加し `textureAssetId` を渡す。大きさ、基準点、色味、不透明度、透明部分の扱い、両面表示、ライトの影響は `update_component` で調整する。`height: null` で画像の元の縦横比へ戻り、`textureAssetId: ""` で画像を解除する。環境テクスチャ（HDRI）は画像 Component には貼れず、Skybox の背景として使う。ノードグラフからは表示・色味・不透明度だけを変更できる。画像の差し替えを対象外としている理由は `docs/KHR_INTERACTIVITY_EDITOR.md` に記載している。

**Scene / Entity**
`update_scene_settings`, `list_entities`, `get_entity_components`,
`get_entity_bounds`, `create_empty_entity`, `create_primitive`, `place_asset`,
`list_scene_recipes`, `place_builtin_prefab`, `create_prefab`,
`update_prefab_from_source`, `unpack_prefab_instance`, `rename_entity`,
`duplicate_entity`, `reparent_entity`, `delete_entity`, `set_entity_enabled`,
`update_transform`

`update_scene_settings` の `postprocessing` では、合成全体の有効・無効に加えて、`ao` / `bloom` / `grading` それぞれの有効・無効と設定値、さらに `order`（適用順）を指定できる。同じ設定値でも適用順によって仕上がりが変わるため、順序を設定画面からしか触れないと「効果は選べるが見た目を制御できない」状態になる。`order` には並べ替え可能なレイヤーを 1 つずつ含む完全な配列だけを受け付ける。AO はシーンを描き直すパスで常に最初に実行されるため、`order` には含めない。

共有ソースの 3D モデルノード（`list_entities` が `modelNode` を返す Entity。Skin や Animation を持つ GLB / VRM の展開ノード）は、Entity 単体として削除できない。ジオメトリを親 3D モデルの共有メッシュが描画しているためである。そのため `delete_entity` を呼ぶと削除せず非表示（親メッシュの `modelPose.nodes[i].visible: false`）に変換し、戻り値の `deleted: false` と `modelNodeVisibility: "hidden"` でその旨を伝える。再表示は `set_entity_enabled`（`enabled: true`）で行う。3D モデルから完全に取り除くには、元のソースモデルを編集して再インポートする。`set_entity_enabled` はこのノードに対して `enabled` とポーズの可視状態を同時に更新するため、シーン・公開ワールド・ランタイムの間で見た目が一致する。

`list_scene_recipes` は焚き火・松明・木・岩・雪・噴水・柱・階段・井戸・ベンチ・収録スタジオといった出来合いの 3D セット一覧を返す。配置には `local-asset` サーフェスの `apply_scene_recipe` を使う。各セットはライト・パーティクル・マテリアルが互いに調整されたサブツリーであり、同じものをプリミティブから組み上げると十数回の呼び出しが必要なうえ見栄えも劣る。`note` には配置後の残作業が記されているため、見落とさず確認すること。

風にそよぐ木には、広葉樹（`scene-recipe.foliage-broadleaf`）、庭木（`scene-recipe.foliage-garden-tree`）、低木（`scene-recipe.foliage-shrub`）と、それぞれの軽量版（`scene-recipe.foliage-broadleaf-light`、`scene-recipe.foliage-garden-tree-light`、`scene-recipe.foliage-shrub-light`）がある。初回の配置では木のモデルに加え、カスタムシェーダーのマテリアル `foliage-shader-broadleaf-material` と、葉・樹皮のテクスチャを 2 枚追加する。どの木も同じマテリアルを使うため、2 本目以降はモデルだけが増える。軽量版は葉の束が約半分で、たくさん並べる木や離れて見る木に向く。葉の色や揺れの強さは `get_custom_shader` で確認し、`update_custom_shader` で uniform を変更する。変更はそのマテリアルを使うすべての木に反映される。風や光の uniform（`uWindDirection`、`uSunDirection` など）はシーンが設定するため、手動で値を入れても次の描画で上書きされる。風は `update_scene_settings` の `vegetation` で変更する。

「しかけ・チュートリアル」カテゴリのセットは、形状に加えて音源とノードグラフまで組み込んだ状態で配置される。`behaviours` には操作時に起きる挙動が 1 本ずつ記されており、`lesson` にはそのセットが解説する手順が入っている。「押すと音が鳴る」「押すと灯りが点く」「開いて自動で閉じる」といった仕掛けを、`add_component` と `create_interactivity_asset` を何度も呼んで一から組み直す必要はない。配置されるのは通常の Interactable・Audio Source・グラフ実行 Component であるため、配置後は通常のツールでそのまま編集できる。

`get_entity_bounds` は位置・回転・スケールではなく、実際の**大きさ（バウンディングボックス）**を返す。`world` は既定で子孫を含めた軸並行バウンディングボックス（AABB）を返し、`local` は自身のメッシュ本来のサイズ範囲（extent）を返す。回転している子 Entity は 8 頂点を変換して包含する箱にするため、重なり判定が安全側になる。サイズ範囲を解決できないメッシュ（メタデータのない旧形式の 3D モデルなど）は合算範囲から黙って除外せず、`unmeasuredEntityIds` に出力することで「サイズが小さい」のと「不明」を明確に区別する。

木、ベンチ、街灯のように繰り返し配置するものは、1 つ目を仕上げて `create_prefab` でプレハブ化し、残りを `place_asset` で配置する。配置ごとに独立した Entity として作ると、後から修正するときに複製の数だけ同じ作業を繰り返す羽目になる。`get_editor_context` の `prefabs` は、作品内のプレハブ一覧、このシーンで編集する元の Entity（`sourceEntityId`）、および配置数（`instanceCount`）を返すため、AI は同じものを作り直す前に既存プレハブを確認できる。`list_assets` はプレハブの `kind` を `prefab` として返し、`kind: "prefab"` での絞り込みにも対応する。

プレハブの原点は元の Entity 自身の原点になる。元の Entity の位置はその 1 か所だけの配置として扱うためプレハブには含めず、回転・大きさ・子 Entity・Component を含める。子 Entity に付けた位置のずれはすべての配置に残るため、`create_prefab` は形状が原点から水平方向に離れている場合に `originWarning` を返す。`contentBounds` は 1 配置分の形状範囲を示す。

元の Entity を編集したら、`update_prefab_from_source` で全配置へ反映する。Inspector の「プレハブに反映」と同じ処理であり、元の Entity の位置は反映されない。元の Entity が削除されている、別のシーンにある、あるいは元の Entity の内部に同じプレハブの配置が含まれている場合は拒否する。変更がなければリビジョンを増やさない。配置されたプレハブは 1 つの Entity として扱われ、`get_entity_bounds` は展開した形状を計測してその Entity ID で返す。`get_entity_components` は元の Entity に `prefabSources`、配置側に `prefabInstances`（編集元 Entity の情報）を返す。

元の Entity を変更する書き込みツールは、結果の `prefabsPendingUpdate` で未反映のプレハブを返し、`nextActions` の先頭に `update_prefab_from_source` を提示する。元の Entity の位置だけを動かした場合は単なる配置変更なので返さない。`get_editor_context` の `prefabs` は `sourceChanged` フラグにより、手動編集を含めた未反映の変更有無を示す。配置側の Entity に形状編集ツール（`set_material`、`apply_r3f_scene`）を向けた場合は、元の Entity の情報と展開手順をエラーとして返す。元の Entity を `duplicate_entity` で複製した場合や `delete_entity` で削除した場合の結果にも、プレハブと連動しない旨と回復手順を含める。

`unpack_prefab_instance` は、プレハブの配置を同じ Entity 配下の通常 Entity 群へ展開する（設計上の Unpack）。展開前後で描画は変わらず、元のプレハブや他の配置にも影響しない。1 か所だけ形や色を個別に変えたい場合に使う。`makeSource: true` を指定すると展開した Entity をプレハブの新しい元 Entity にでき、元の Entity を削除してしまったプレハブを再び編集可能に戻せる。プレハブ側の Entity ID は維持されるため、他の配置もそのまま連動し続ける。R3F で作成した元 Entity の配置は、展開後も `r3fRootEntityId` の原本を `apply_r3f_scene` で修正できる。なお UI 側にはまだ展開操作が用意されていない。

`place_asset` は `rotation` と `scale` も受け付けるため、向きや大きさを調整した配置を 1 回の書き込みで完了できる。

**Component**
`list_component_definitions`, `add_component`, `update_component`,
`remove_component`, `update_script_component`

**Collider**
`set_mesh_collision`, `inspect_colliders`, `optimize_colliders`

共有ソースの 3D モデルノード（`modelNode` を持つ Entity）には、`add_component` で `physics.mesh-collider` や `physics.box-collider` を追加できる。Mesh Collider はそのノード自身のジオメトリだけを使い、子ノードは各自の Entity で扱う。Box Collider はインポート時に記録されたノードのバウンディングボックスへ自動フィットする（バウンディングボックスは新規インポート・再インポート時に記録され、旧素材では既定サイズになる）。Mesh Collider を付けられるのはジオメトリを持つノード（`nodeType` がメッシュまたは `skinned-mesh`）だけであり、ボーンや空ノードは `DEPENDENCY_MISSING` で拒否する。ポーズで非表示にしたノードは描画と同時に Collider からも外れる。`get_entity_bounds` はバウンディングボックスを持つノードを実測に含める。

**ライトベイク**
`get_light_bake`, `set_light_bake_targets`, `update_light_bake_settings`

`get_light_bake` は対象メッシュ、ライトの扱い、設定、ライトマップの状態（`none` / `current` / `stale`）を返す。`set_light_bake_targets` は `entityIds` または `selectStatic: true` でベイク対象を切り替える。`update_light_bake_settings` はライトマップの解像度・品質・影の柔らかさを変更でき、`removeLightmap: true` で焼き込み済みの陰影を外せる。ライトをベイク対象にするには、Light への `update_component` で `bakeMode` を `baked` に設定する。

実際に焼き込みを実行するのは `bake_lighting`（`local-asset` サーフェス）であり、設定と対象を変更しただけでは見た目は変わらない。手順は `get_light_bake` → `set_light_bake_targets` → `bake_lighting` → `capture_scene_view` の順になる。仕組みの詳細は [ライトベイクの仕組み](./LIGHT_BAKE.md) を参照する。

**Terrain**
`get_terrain`, `sample_terrain_point`, `list_terrain_presets`,
`create_terrain`, `create_terrain_from_preset`, `sculpt_terrain`,
`update_terrain`, `apply_terrain_surface`

`create_terrain` が作成するのは平らな板であり、プリミティブとしては正しいが地形制作の出発点には向かない。上部メニューの「素材を追加 → Entityを作成 → World → Terrain」では、形状プリセット 8 種と高さ・傾斜で塗り分ける表面プリセット 10 種を用意している。プリミティブだけから始めると谷などをブラシで一打ずつ彫る手間がかかるが、`create_terrain_from_preset` を使えば造形と草の配置まで済んだ状態で設置できる。`position` を省略すると既存地形の隣に配置される。これは同じ地面に 2 枚の地形が重なってモアレが発生するのを防ぐためであり、重なり自体は禁止しないものの `overlappingTerrainCount` で警告を返す。

`apply_terrain_surface` は、高さと傾斜に応じてマテリアルをブレンドする表面プリセットを適用する。プリセット内の高さ帯はメートル単位の絶対値で定義されているため、既定では対象地形の標高範囲に合わせて自動再スケーリングする。合わせずに適用すると全境界が範囲外に出て単色になり、「シェーダーが壊れた」ように見えるためである。適用後の結果は通常のマテリアルなので、後からマテリアル編集ツールで調整できる。

`sample_terrain_point` は、Terrain ローカル座標の XZ から補間した高さ、同じ点のワールド座標、傾斜、穴の有無、草の層ごとの被覆率を返す。ドキュメント内では高さが平坦な配列で格納されており直接参照しにくいため、このツールを使わないと彫った地形の上に `y = 0` でオブジェクトを置いてしまうミスが起きやすい。

**地形の草**
`list_terrain_grass_types`, `apply_terrain_grass_preset`,
`add_terrain_grass_layer`, `update_terrain_grass_layer`,
`delete_terrain_grass_layer`, `paint_terrain_grass`
（詳細は [地形エディター仕様](./TERRAIN_EDITOR_SPEC.md) の「MCPから草を扱う」）

**Interactivity graph / Interaction Trigger**
`list_interactivity_operations`, `list_interactivity_recipes`,
`apply_interactivity_recipe`,
`list_interaction_trigger_targets`, `get_interactivity_asset`,
`validate_interactivity_asset`, `simulate_interactivity_asset`,
`create_interactivity_asset`, `create_model_animation_graph`,
`update_interactivity_asset`,
`add_interactivity_graph`, `update_interactivity_graph`,
`delete_interactivity_graph`, `add_interactivity_node`,
`duplicate_interactivity_node`, `delete_interactivity_node`,
`connect_interactivity_nodes`, `disconnect_interactivity_socket`,
`set_interactivity_value`, `set_interactivity_configuration`,
`configure_interactivity_material_pointer`,
`configure_interactivity_trigger_action`,
`move_interactivity_node`, `layout_interactivity_graph`
（詳細は [KHR_interactivity Editor / MCP design](./KHR_INTERACTIVITY_EDITOR.md)）

`apply_interactivity_recipe` は、エディターの「追加」パネルにある「よく作るもの」と同じレシピからグラフ素材を作成する。`entityId` を指定すると、グラフを実行する Component もその Entity に追加する。操作で動かすレシピには Interactable も同時に追加し、一連の変更を 1 回のリビジョンとして確定する。

エディターのセットアップパネルでは不足している設定を画面上で案内できるが、MCP にはこのパネルがないため、素材の作成と実行設定をまとめて行う。`list_interactivity_recipes` で、動作確認と公開先の両方で実行できるレシピの ID を取得できる。

`create_model_animation_graph` は、3D モデル素材に含まれるアニメーションクリップすべてを `event/onStart` から同時にループ再生するグラフを作成する。モデル設定の「アニメーションのGraphを作る」と同じ機能であり、素材を作成するだけで Entity には取り付けない。取り付けには `add_component` で `interaction.trigger` を追加する。

従来の Animation Component は廃止された。`place_asset` でクリップを持つ 3D モデルを配置すると、全クリップを再生するグラフとグラフ実行 Component が自動で付く。`add_component` に `core.animation` は存在せず、この Component を残しているドキュメントに対する `update_component` は `COMPONENT_REMOVED` で拒否される（`remove_component` は実行できる）。

ノードエディターの操作は、元に戻す／やり直す、選択状態、編集領域の見え方（拡大・全体表示・パネル幅）、タイムラインの範囲と時刻のつまみの 4 つを除き、すべてこの一覧に揃っている。除外した 4 つはドキュメントを変更しない操作である。

`duplicate_interactivity_node` は `targetGraphIndex` を受け付け、エディターの Ctrl+C / Ctrl+V と同様に別のグラフへも複製できる。同じグラフ内であればノードをそのまま写せるが、別グラフでは `declaration` のインデックスやインライン値の `type` インデックスが異なる定義を指すため、名前で取り出してコピー先のグラフでインデックスを割り当て直す。

`set_interactivity_value` は Inspector の「値」欄と同じ操作であり、数値だけでなく `signature` も受け付ける。`KHR_interactivity` には定数ノードが存在せず、固定値は必ずソケット自身のリテラルとして保持されるため、`3` を渡すのと `(0, 1, 0)` を渡すのは型の違いとして表される。オペレーション側で型が固定されているソケット（秒数、繰り返し回数、アニメーションのインデックス、論理演算の入力など）へ別の型を渡すと `SIGNATURE_NOT_ALLOWED` で拒否する。Inspector でも同じソケットでは型を変更できないため、どちらから編集しても結果は一致する。どのソケットの型が固定されているかは、`list_interactivity_operations` の `fixedValueTypes` で確認できる。

`configure_interactivity_trigger_action` は、`set_interactivity_configuration` と `set_interactivity_value` で個別に設定できる 4 つのキーをまとめて設定する。対象の Entity・Component・プロパティが存在することと、値の型が合致することを検証する。誤った対象を指定したグラフは保存できても実行時に動かないため、エディターの選択 UI と同じ検証を MCP にも適用している。

変化にかける時間とイージングも同じ呼び出しで指定できる。補間できないプロパティに時間を指定した場合は拒否する。

値が数値でないプロパティは `value` を受け取らない。`kind` が `asset` のものは `valueAssetId`、`string` のものは `text` を指定する。`KHR_interactivity` に文字列型は存在せず、素材や文章は補間できる量でもないため、いずれもターゲット情報と並んで `configuration` に格納される。`valueAssetId` に空文字を渡すとシーン設定側の素材へ戻る。`list_interaction_trigger_targets` は各プロパティの `kind` に加えて、受け付ける素材の種類（`assetKinds`）と指定に使う引数名（`argument`）を返す。`Scene` ターゲットへの書き込みはすべてクライアントローカルであり、そのグラフを実行しているビューアーの描画にだけ反映される。

`simulate_interactivity_asset` は、エディターのタイムラインと同じ処理を使い、レンダラーを起動せずにグラフをシミュレーション実行する。待機後の発火時刻、ループの終了、到達しない分岐などを検証できる。ドキュメントを変更しないためリビジョン指定は不要である。

`move_interactivity_node` と `layout_interactivity_graph` はノードの表示位置を保存する。作者がノードエディターを開いたときにカードが重ならず読みやすい状態を保つための操作である。

**コンポーネントコードの取り込み**
`analyze_component_code`, `apply_component_code_import_plan`

## local-asset (16)

`import_audio_asset`, `import_font_asset`, `import_texture_asset`, `import_model_asset`,
`import_skybox_asset`, `import_shader_asset`, `reimport_model_asset`,
`process_texture_asset`, `optimize_model_asset`, `revert_asset_optimization`,
`apply_scene_recipe`, `get_shader_asset`, `update_shader_asset`,
`set_project_thumbnail`, `bake_lighting`

`bake_lighting` は、ライトベイクパネルの「ベイク」と同じ処理を実行する。Scene View が描画しているシーンを読み込むため、編集モードかつ表示モードが「シーン」の状態で実行する。計算完了まで待機し、生成された Lightmap アセットの ID、画像解像度、詳細度、注意点を返す。計算は Web Worker 上で走り、数秒から数分かかる。

`import_font_asset` が受け付けるのは TTF、OTF、WOFF のみである。WOFF2 はテキストレンダラーが解釈できず、組版が終わらないまま文字が空になってしまうため、取り込み時点で理由を添えて拒否する。取り込んだフォント素材は `update_component` の `patch.fontAssetId` で Text Component から参照する。空文字を渡すと同梱の書体に戻る。

`apply_scene_recipe` は、セットで使用する 3D モデルをプロジェクトへ書き出す必要があるため、React シェル側で処理する。パーティクルやサブツリーの追加は 1 件の履歴にまとめ、Undo でセット全体の配置を一括で戻せるようにしている。

`update_texture_asset` が変更できるのはインポート設定（`maxSize`、`format`、`quality`）だけであり、原本の画像は書き換えない。実際に解像度を変更して再エンコードするのは `process_texture_asset` である。設定を変えただけで「圧縮した」と報告するとエディター上の「未反映」表示と食い違うため、変換実行を別ツールとして分離している。すでに設定が反映済みであれば `changed: false` と理由を返し、原本を書き直さない。

`update_model_asset` も同様に、変更できるのはインポート設定（`scale`、`generateColliders`、`optimizeMeshes`、`importAnimations`）だけである。原本の GLB を実際に最適化して書き出すのは `optimize_model_asset` であり、頂点の結合、頂点バッファの共有、アニメーションキーフレームの間引き、さらに任意で Draco 圧縮を実行する。マテリアルスロット、ノード構造、アニメーションクリップの本数は変えない。マテリアルやノードのインデックスがずれると Entity 側のマテリアル割り当てが別のマテリアルへ移ってしまうため、統合や平坦化は行わない。実行すべき最適化がなければ `changed: false` を返す。

`instanceMeshes` は描画時の設定であり、再インポートなしで動作確認と公開先へ反映される。`update_model_asset` の `patch.importSettings.instanceMeshes` に `true` を渡すと有効化、`false` で解除する。静的 GLB のうち同じ形状・マテリアルを持つ不透明な部品を近隣ごとにまとめる仕組みであり、動的な親を持つもの、Animation・Skin・Morph を持つもの、反転した部品は除外する。スクリプトやノードグラフを実行しているシーンでは通常描画を維持し、原本や衝突判定は変更しない。取り込みテクスチャの端末共通設定は歯車アイコンから変更できるが、MCP では各取り込みツールの明示引数で指定するため、端末の既定値専用ツールは設けない。

テクスチャ変換とモデル最適化はいずれも非破壊であり、原本ファイルは書き換えない。変換結果は `assets/.optimized/` に書き出し、素材の `source` が指すパスだけを差し替える。変換前の `source`・解析結果・読み込み設定は `optimizedFrom` に控えを残しており、`revert_asset_optimization` で原本へ戻せる。圧縮を試したあと元に戻せないと手直しが必要になるため、実行と同じサーフェスに解除操作を用意している。

## script (6)

`list_script_templates`, `get_script_asset`, `create_script_asset`,
`apply_script_template`, `update_script_asset`, `set_play_mode`

`list_script_templates` は `vehicle` / `seat` の TSX テンプレートも返す。設定済みの車をそのまま置く場合は、ギミックの `scene-recipe.custom-vehicle` を `apply_scene_recipe` で配置する。スクリプトだけを作成する場合は `create_script_asset` の `templateId` に指定する。操縦処理は `update_script_asset` で編集し、車体・座席・タイヤの配置や見た目は通常の Entity・Model・Material 操作で調整する。対応範囲の詳細は [Vehicle / Seat](./SCRIPTING.md#vehicle--seatworld-components-0520) を参照する。

追加承認なしで実行されるスクリプトの挙動と隔離の限界については [スクリプトの契約](./SCRIPTING.md) にまとめている。

## external-store (3)

`search_external_assets`, `get_external_asset_options`,
`install_external_asset`

`search_external_assets` で取得する 3D モデルには、Poly Haven の一覧 API が返す `polycount` と `dimensionsMm` が付く。寸法は幅・奥行・高さの順でミリメートル単位である。Poly Haven のフォトスキャンモデルには、木で数百万、岩でも数十万のポリゴン（三角形）を持つものがある。取り込む前にこれらの値を確認し、対象ワールドの制作予算と見比べること。上限の数値は本書では固定しない。

## debug (17)

`capture_scene_debug`, `capture_scene_view`, `save_scene`, `set_scene_view_camera`,
`start_recording`, `stop_recording`, `get_recording_status`,
`set_recording_profile`, `set_recording_viewport`, `get_recording_viewport`,
`set_recording_camera`, `get_recording_camera`,
`begin_world_authoring`, `get_world_authoring`, `review_world_authoring`,
`complete_world_authoring`, `cancel_world_authoring`

このサーフェスのツールは `SceneDocument` を書き換えない。表示中のシーン状態の読み取り、カメラ操作、録画、および別ファイルに保存する制作ランや完了証拠の管理を扱う。Undo 履歴や選択状態も動かさない。

- `capture_scene_debug` — FPS、フレーム時間、ドローコール数、ポリゴン数（三角形数）、可視メッシュ数、ジオメトリ／テクスチャ別の VRAM 概算（`geometryVramBytes` / `textureVramBytes`）、未算定テクスチャ数（`unknownVramTextures`）、テクスチャ内訳（`compressedTextureVramBytes` / `uncompressedTextureVramBytes`、`compressedTextureCount` / `uncompressedTextureCount`。未算定は除外）、カメラの描画距離（Far）を返す。WebM 録画の開始・停止（`start` / `stop`）も扱う
- `save_scene` — エディター通常の自動保存を確定（flush）し、同じシーンが保存できた場合にだけフィンガープリントを返す。保存中にシーンが変更された場合は再保存を求める
- `capture_scene_view` — 描画した PNG を 1 枚アプリの `debug-captures` フォルダーに保存し、そのパスを返す。数値やドキュメントの確認に加えて、実際の描画結果を目視確認するために使う。
  既定では作者が見ている Scene View をそのまま撮影するため、グリッド、ギズモ、選択枠、Collider 枠、ライト・音・スポーンの目印も写る。
  参考画像とワールド本体を見比べる場合は `showEditorHelpers: false` を指定する。その 1 枚だけ編集用の補助表示を除き、表示モードを「シーン」にして描画する（サムネイル撮影や録画と同じ描き方であり、撮影後に Scene View は元の表示に戻る）。
  選択状態や `editor.gizmo.gridVisible` などの保存済み設定は変更しない。ギズモを操作している間は撮影を待機し、操作が続く場合はエラーを返す。真偽値以外の指定は `INVALID_ARGUMENT` で拒否する。
  なお、`capture_scene_debug` による録画は画面の表示をそのまま記録する。編集用の補助表示を除いた動画を撮る場合は、`set_recording_viewport` の `showEditorHelpers: false` と `start_recording` を使う
- `set_scene_view_camera` — 俯瞰（`top`）、真下から（`bottom`）、各軸（`front` / `back` / `left` / `right`）、既定の斜め視点（`iso`）を選べる。`focusEntityId` で対象 Entity の実際の描画バウンディングボックスに寄せるか、`position` と `target` を直接指定する。プリセットだけを渡した場合は現在の注視点を維持するため、「今の対象を上から見る」といった操作ができる。バウンディングボックスは F キーと同じ経路で計測し、Collider 枠などの補助表示や無効化した子 Entity は除外する。これにより同じ Entity を同じ位置から確認できる

保存先パスは指定できない。確認用に撮影した画像は一時的な成果物であるため、プロジェクト内ではなくアプリデータディレクトリへ置く意図的な制限である。

**ワールド制作の録画**（詳細は [ワールド制作の録画](./RECORDING.md)）

## 意図的に公開していない操作

- 制作チャットの表示幅の切り替え、入力候補の表示・非表示、Tab 補完は画面内の表示や下書き操作であり、シーン・素材・制作依頼の実行内容を変更しないため専用 MCP ツールは設けない。
- 部分 `.xriftstudio` 書き出し・追加インポートのファイル選択、保存先指定、セッションクリップボードは利用者本人のローカル操作として扱い、専用の MCP ツールは追加しない。UI は既存のドキュメント・素材・Undo 処理を共用する。ファイル受け渡しの制約は [Hierarchy の受け渡し契約](./HIERARCHY_TRANSFER.md) を参照する。
- 素材・Component 検索、Inspector の見出し、制作データ確認ダイアログは UI 上の導線であり、新規ツールやネットワーク計測機能にはしない。既存の Project Health ツールが実行時挙動や実ファイルの存在まで保証したとは扱わない。
- ヘッダーやステータスバーの配置、Scale 比率固定の初期値、アイテムの初期 Unlit 表示は UI 専用の設定であるため専用ツールは設けない。Entity 作成・Scale 更新・ギミック追加には既存の操作を使う。ギミックの `projectKinds` はワールドとアイテムで共通化し、通常のプロジェクト種別・リビジョン・素材操作ロックを維持する。
- シーン / Hierarchy の「反転して貼り付け」はエディター内のクリップボードを使うため専用ツールは設けない。MCP では既存の `duplicate_entity` で複製した Entity に `update_transform` を適用し、ローカル Scale の指定軸だけ符号を反転させる（元の Entity は変更しない）。メニューの開閉や軸選択は UI 上の状態として扱う。
- iPad のパネル切り替え・視点操作のみ・複数選択・Play のタッチ入力は端末側の表示または入力状態でありドキュメントを変更しないため、専用ツールを設けない。ブラウザの保存先選択や `.xriftstudio` のダウンロード・共有メニューはユーザー操作と Safari の権限に依存するため MCP からは起動しない。プロジェクトのデータ編集やデスクトップ側の書き出し・取り込みには既存ツールを使う。iPad ブラウザ内での MCP 接続は提供しない。
- スクリプト一覧の検索・折り畳み・シーン横のタブ切り替えは画面内の表示状態なので専用ツールは設けない。素材の取得・作成・更新には既存のスクリプトツールを使う。グラフとのイベント連携 API は `get_scripting_capabilities` に含めており、スクリプト元データとグラフの既存編集ツールで設定する。
- 公開用 GLB の不要画像除去とキャッシュ管理は、公開・書き出し処理で自動適用する。編集用素材や動作確認の状態を変更する操作ではないため専用の MCP ツールは設けない。仕様は [公開時のダウンロード容量削減](./PUBLISH_DOWNLOAD_OPTIMIZATION.md) を参照する。
- マテリアルスロットの開閉・検索・ページ切り替えは表示だけの状態なので MCP へ公開しない。マテリアル割り当ての読み取り・変更には既存の 3D モデル素材操作を使う。

「未実装のもの」と区別して、意図的に公開していない操作と理由を以下に整理する。

| 操作 | 理由 |
| --- | --- |
| 元に戻す / やり直す | 操作はリビジョンで直列化している。エディターの履歴は人の操作単位であるため、片方から巻き戻すともう片方が何を失ったのか分からなくなる |
| 選択の変更だけ | 各ツールが結果として選択を移す。選択変更だけのツールは履歴もドキュメントも変えず、状態だけをずらしてしまう |
| シーンの描画品質（自動 / 高品質 / 軽量 / 描画 50% / 描画 25%） | 編集中の描き方だけを変えるエディター状態である。既定の自動モードは 75% から開始し、負荷が続くと 25% まで下げる。ドキュメントにも公開物にも残らず、動作確認とサムネイル撮影は常に高品質で描画する |
| 拡大・全体表示・パネル幅・タイムラインの範囲と時刻 | 見え方だけの状態でありドキュメントに残らない。ノードの位置はドキュメントに保存されるため、`move_interactivity_node` と `layout_interactivity_graph` で扱う |
| 公開ダイアログのテクスチャ一括変換・素材最適化 | 公開前の容量削減は `process_texture_asset` と素材ごとのツールで行う。`publish_project` は確認済みのドキュメントをそのまま公開する |
| ログアウト、トークンの受け渡し | 認証情報を MCP 境界へ渡さないためである。`login` は Studio 内で認証を開始するだけであり、`get_account` はログイン状態だけを返す |
| 録画の保存先指定 | `recording_begin_file` が開けるのは既定の保存先とフォルダーダイアログで選んだ場所だけである。パスを直接書けると Rust 側のパス検証を迂回してしまうため、保存先を変える場合は録画パネルを使う |
| 公式 Component の position / rotation / scale | `update_component` は XRift 公式 Component のこれらのプロパティを受け付けない。Component 側に持たせると Entity の Transform と別の原点が生まれ、選択時のギズモと回転中心が描画位置とずれてしまう。配置は `update_component` の `transform` パッチで Entity 側に書く |
| 任意パスの読み書き・削除 | Rust 側のパス検証と権限制御を迂回させないためである |
| コードプロジェクトの `world.items` 編集 | 現行 MCP のシーン編集はビジュアルプロジェクトを対象とする。コードプロジェクトの設定編集はコードエディターで行う。ビジュアルプロジェクトでは `add_component` / `update_component` の Item 配置から一覧を自動生成する |
| 任意 JavaScript の実行 | 汎用 JavaScript 評価ツールは提供しない。Script アセットは Play 時に追加承認なく実行され、サンドボックスではない（`SCRIPTING.md` 参照） |
| テクスチャの一括変換 | 複数選択した素材をまとめて書き出すための UI 導線である。MCP からは `process_texture_asset` を素材ごとに呼び出し、対象の選定は設計図に基づいて行う |
| テクスチャの共通設定・サイズ確認 | 共通設定と同じ処理は `update_texture_asset` の `importSettings` と `process_texture_asset` で実行できる。サイズ確認は既存画像の読み取りを行う設定上の表示状態である。再インポートで取得した寸法は素材の `importMetadata` にも記録される |
| 取り込み時のテクスチャ最大解像度 | 読み込みメニューに残るエディター状態であり、ドキュメントには入らない。`import_local_texture` と `update_texture_asset` の `importSettings.resize` で素材ごとに同じ結果を指定できる |
| ワールド動作確認のプレイヤー操作（移動・視点・ジャンプ・掴み・操作） | 実行中のプレイヤー入力でありドキュメントにも公開物にも残らない。視点操作はマウスのポインターロックが前提のため、MCP から送っても画面のロックは動作しない。シーンの確認には `set_scene_view_camera` と `capture_scene_debug` を使い、操作結果の検証には `set_play_mode` とノードグラフ／スクリプト側の状態読み取りを使う |

## 機能を足すときの手順

1. `mcp-tool-registry.ts` の `XRIFT_MCP_TOOLS` にツール名とサーフェスを追加する
2. サーフェスに応じて `mcp-editor-tools.ts` のハンドラー、または React シェル側の分岐を実装する
3. `src-tauri/src/mcp.rs` の `tool_definitions()` に JSON スキーマを追加する
4. `pnpm mcp:tool-names` を実行して Rust 側の許可リストを再生成する
5. `mcp-editor-tools.fixture.ts` に成功ケースと拒否ケースのテストを追加する
6. `pnpm typecheck`、`pnpm cli:test`、`cargo test --manifest-path src-tauri/Cargo.toml` を実行して検証する

シーンのドキュメントスキーマを拡張したときは、`serialization.ts` の許可キーと対応する MCP ツールを同時に更新する。片方だけ更新すると、保存した時点でシーンが読み込めなくなる。

### 大きなモデルを取り込むとき

エディターの `import_model_asset` と、`importSettings` を省略した `import_texture_asset` は、歯車アイコンから開く設定パネルの共通設定を使用する（未設定時は最大 1024px・KTX2）。対応する単体画像やモデル内蔵画像を変換してからマニフェストへ採用するため、変換前の画像が先にシーンへ配置されることはない。元の画像と元モデルはそのまま残し、既存素材には遡って適用しない。圧縮に失敗した場合は配置へ進まず、設定を変更して再試行できる。

`set_mesh_collision` は、メッシュの Collider の追加・解除・シーン全体の置換を 1 回のリビジョンで実行する。`exclusive` を指定すると、Trigger を含む全 Collider と Auto Collider を解除する。`inspect_colliders` の `sources` から設定元の Entity、形状、階層上の有効状態を読み取れる。

`bake_mesh_collider` は、選択した 3D モデルノードの Collider 用軽量モデルを作成する `local-asset` 操作である。`entityId`、Mesh Collider の `componentId`、残す割合 `ratio` を渡す。結果のポリゴン数を確認し、歩行判定を検証する。共有 3D モデルと通常の展開ノードに対応し、未展開の 3D モデル全体および組み込みプリミティブは対象外である。

外部カタログの `list_scene_recipes` は、`shelf` に `models`（3D セット）、`materials`（マテリアル表現の glTF 見本）、`gimmicks`（ギミック）を返す。目的に合う分類から選び、既存の配置ツールへ同じレシピ ID を渡す。配置後は Inspector で編集し、ギミックは Play で動作を確認する。UI の 3D セット・マテリアル・ギミック一覧は基本 4 列で、狭い表示領域では 3 列・2 列になるが、列数は表示だけの状態なので専用 MCP ツールは設けない。

### ギミックのカスタム車を配置する

UI では「アセットストア → ギミック → カスタム車」と「XRift公式コンポーネント → Vehicle」の両方から、同じ設定済みの車を配置できる。MCP ではワールド向けの `scene-recipe.custom-vehicle` を `apply_scene_recipe` で配置する。`place_builtin_prefab` に Vehicle は登録されていないため、公式カードの表示名をそのまま渡してはならない。配置される車は、通常の Entity・Model・Script を組み合わせた編集可能なセットである。

1. `get_editor_context` で編集中の `projectId`、`sceneId`、リビジョン、および編集モードであることを確認する（保存済みのワールドプロジェクトが必要）。
2. `list_scene_recipes` を引数 `{}` で呼び出し、返却された `recipes` から `shelf: "gimmicks"`、`id: "scene-recipe.custom-vehicle"` を選ぶ。`shelf` は戻り値であり、このツールの入力引数ではない。
3. `apply_scene_recipe` へ次の引数を渡す。ID とリビジョンは直前に取得した値へ置き換える。`position` を省略するとカタログと同じグリッドへ配置される。

```json
{
  "projectId": "取得したprojectId",
  "sceneId": "取得したsceneId",
  "expectedRevision": 12,
  "recipeId": "scene-recipe.custom-vehicle",
  "position": [0, 0, 0]
}
```

結果の `entityId` は車の親 Entity、`childEntityIds` は車体・運転席・同乗席・4 輪・排気煙の 8 個、`createdAssetIds` は今回追加された素材を示す。次の更新には `revisionAfter` を使う。一覧の `assembly: "vehicle"` と `scriptBehaviours` は、ノードグラフではなくスクリプトで動作するセットであることを表している。

車体・座席・タイヤは通常の GLB を参照する Mesh Renderer を持ち、編集中も Hierarchy から選択して配置を調整できる。スクリプトへの Base64 埋め込みや、Play 開始時だけのモデル生成は行わない。モデルは通常の glTF PBR カラーを使い、座席は 1 マテリアルで構成される。排気煙には Particle Emitter と Particle アセットが付き、タイヤの回転と煙の放出にはそれぞれスクリプトが付く。形状を変えるときは GLB や Model アセット、配置を変えるときは子 Entity の Transform を編集する。

親 Entity のスクリプトは地面追従を既定で有効にしており、登れる坂の上限を 45 度に設定している。追従には固定 Collider のある地面が必要で、標準車体の 4 輪位置を基準に接地を判定する。タイヤの配置を大きく変える場合は、操縦スクリプトの接地点も合わせて調整する。壁との車体衝突やサスペンションを再現する本格的な車両物理ではない。

Play では運転席をクリックして乗り込み、W/S で前後移動、A/D で旋回、Space で降りられる。同乗席にも着席できる。タイヤと煙は、各参加者側で公式 Vehicle の同期済み移動量から表示を更新する仕組みであり、停止中は回転と新しい煙の放出を止める。粒子ごとの位置やタイヤの角度を個別送信する方式ではないため、粒子の形や位置が参加者間で完全に一致する保証はない。公開 XRift 上での複数人表示は別途確認する。

配置後は `get_entity_components` で構成を確認し、`capture_scene_view` で編集中の見た目を確認したうえで、`set_play_mode` で乗降と走行を検証する。既存の車は新規配置とは別の編集対象であり、この操作だけでは差し替わらない。

素材庫は `providerId: "shared-material-library"` を使って `search_external_assets`、`get_external_asset_options`、`install_external_asset` から利用できる。`resolution` には取得したファイル名を指定し、`format` は省略する。GLB は Model、PNG とマスクは Texture として取り込まれる。ライセンスが未指定の素材を許諾済みとして扱ってはならない。

### Script の編集プレビュー

`update_script_component` の `runIn` は `play` または `play-and-edit` を指定できる。後者を指定すると、編集画面でも名前付きエクスポートの `Render` が描画される。モジュールと `Render` は編集時にも評価され、`start`・`update` は Play 中に実行される。UIKit Panel テンプレートは `play-and-edit` で作成される。

### 同梱の透過画像

`search_external_assets` に `providerId: "xrift-transparent-textures"` を渡すと、透過 PNG 30 点を検索できる。`get_external_asset_options` で容量と原寸を確認し、`install_external_asset` へ `resolution: "original"` を渡す（`format` は省略する）。通常どおり `projectId`・`sceneId`・`expectedRevision` が必要である。UI と同じ保存トランザクション、PNG の SHA-256 検証、マテリアル生成、選択、Undo を通るため、独立した非公開の取り込み経路は存在しない。
