# MCP editor tool の全体像

マテリアルの頂点カラーと不透明度マップは`update_material_asset`で設定する。`patch.vertexColors`はboolean、`patch.opacityTexture`は既存テクスチャのIDまたはTextureInfo（nullで解除）、`patch.opacityChannel`は`r`・`g`・`b`・`a`（既定は`a`）。透過には`alphaMode: "BLEND"`または`"MASK"`を併せて指定し、裏面も表示するなら`doubleSided: true`にする。更新後は割当先モデルで色と透過を確認する。Unityの独自シェーダーをそのまま実行する設定ではない。

XRift Studio は、開いている Editor をそのまま AIクライアントへ開放する MCP server を
同梱している。この文書は「どの Editor 操作が MCP から動くのか」を一覧で示す。
機能を足したときは、ここで MCP への対応漏れを確認する。

一次情報は `src/lib/visual-editor/mcp-tool-registry.ts` の `XRIFT_MCP_TOOLS`
表だ。Rust の allow-list (`src-tauri/src/mcp_tool_names.rs`) はそこから生成し、
`pnpm mcp:tool-names --check` と Rust の
`tool_list_matches_the_generated_allow_list` テストが、表・生成物・JSON schema の
3つが同じ集合であることを保証する。この文書だけ古くなる場合がある。
名前が食い違った場合は表の名前を優先する。

## CLI から操作する

Studio に同梱する `xrift-studio-mcp-sidecar` は、MCP サーバーと CLI を兼ねる。Windows では Studio のインストール先にある `xrift-studio-mcp-sidecar.exe` を指定する。PATH への登録は不要で、フルパスでも呼び出せる。macOS ではアプリ内の `Contents/MacOS`、Linux では配布形式に応じた同梱先を使う。

```powershell
# Studio のインストール先で実行する例
.\xrift-studio-mcp-sidecar.exe tools
.\xrift-studio-mcp-sidecar.exe describe capture_scene_view
.\xrift-studio-mcp-sidecar.exe call get_editor_context
.\xrift-studio-mcp-sidecar.exe call capture_scene_view --args-file .\capture.json --output-dir .\Recording
```

`tools` は全ツールの説明と JSON Schema、`describe` は指定したツールの定義を返す。両方ともオフラインで使える。`call` は起動中の Studio を操作する。MCP と同じツール名・引数を使い、revision、スクリプトの変換、保存先などの扱いも同じになる。プロジェクトが開いていなくても Studio が起動していれば呼べる。`list_projects` で状態を確認し、`create_project` または `open_project` で Editor を開いてから、編集対象の `projectId` と `sceneId` を `get_editor_context` で取得する。

ワールドの作成から公開までを CLI だけで通す例を示す。

```powershell
.\xrift-studio-mcp-sidecar.exe call create_project --args '{"name":"night-plaza","templateId":"blank"}'
.\xrift-studio-mcp-sidecar.exe call get_editor_context
# ここで document tool や local-asset tool を使って Scene を作る
.\xrift-studio-mcp-sidecar.exe call update_project_metadata --args-file .\metadata.json
.\xrift-studio-mcp-sidecar.exe call set_project_thumbnail --args-file .\thumbnail.json
.\xrift-studio-mcp-sidecar.exe call get_account
.\xrift-studio-mcp-sidecar.exe call login          # 未ログインならブラウザで完了させる
.\xrift-studio-mcp-sidecar.exe call get_publish_readiness --args-file .\scene.json
.\xrift-studio-mcp-sidecar.exe call publish_project --args-file .\scene.json
```

`publish_project` は `get_publish_readiness` と同じ確認を先に行い、足りない項目があれば `PUBLISH_NOT_READY` で `requirements` と `nextActions` を返す。公開は数分かかることがあり、その間の他の呼び出しは `EDITOR_BUSY` になる。

引数は UTF-8 の JSON オブジェクトで渡す。`--args-file <path>`、`--args <JSON>`、`--stdin` のうち一つを選ぶ。省略すると `{}`。PowerShell では引用符の解釈を避けるため `--args-file` を推奨する。接続先は自動検出するが、`--rendezvous <path>`、環境変数 `XRIFT_STUDIO_MCP_RENDEZVOUS` の順で上書きできる。接続ファイルには認証情報が含まれるため、共有しない。

結果は標準出力に JSON で返る。`call` の `ok`、`result`、`error` は Studio の応答で、完成条件の未達などは `result` 内の `completionAccepted` や `nextActions` まで確認する。`--output-dir` を指定すると、撮影と制作状態取得の画像を指定フォルダーへ PNG として保存し、画像の `data` を絶対パスの `path` に置き換える。毎回別名で保存し、既存ファイルを上書きしない。省略時は base64 の画像データを保持する。動画の保存先はこのオプションでは変わらず、制作中のワールドの `Recording/` になる。

終了コードは成功 `0`、Studio による拒否 `1`、引数の誤り `2`、接続失敗 `3`、画像の書き出し失敗 `4`。`4` では操作自体は成功している場合がある。応答と `exportError` を確認し、編集をそのまま再送しない。

この CLI は Studio の描画環境を利用する。画面を起動しない完全なヘッドレス実行には対応しない。ビジュアル編集からコード編集へ変換する既存の `xrift-studio convert` は別の CLI で、詳細は [変換 CLI](./VISUAL_PROJECT_MIGRATION_CLI.md) を参照する。サブコマンドなしの起動は従来の MCP stdio 接続を維持する。

開発時は `pnpm mcp:sidecar:prepare` 後、`src-tauri/target-mcp-sidecar/debug/xrift-studio-mcp.exe`（Windows）から同じコマンドを試せる。

## surface

ワールド制作の開始・再開には `begin_world_authoring` / `get_world_authoring`、画像判定の記録には `review_world_authoring`、完成条件の確認には `complete_world_authoring` を使う。Studio に内蔵されており、利用者側のソースコードや追加ランナーは不要。`capture_scene_view` は保存パスに加えて MCP の画像を直接返す。制作状態の保存と鮮度の判定は [ワールド制作ハーネス](./WORLD_AUTHORING_HARNESS.md) を参照する。

制作状態と `list_component_definitions` は、ワールドの場合に `worldComponents` も返す。用途別の公式設備、配置と検証の手順、公式フィールド、プレハブの編集可能項目、現在の設備一覧を確認できる。交流・共同作業・発表では画面共有を最初に検討し、採用・省略の理由と利用場所を設計図に残す。鏡はアバター確認、タグ選択はイベントのタグ選択に合わせて選ぶ。`place_builtin_prefab` は `componentId` と該当する `placementGuidance` を返す。位置・向き・大きさを調整し、客席や操作位置から撮影してから、対応環境で動作を確認する。設備の存在だけで共有・同期が動いたとは判断しない。

tool は「誰が実行するか」で6つに分かれる。この分類が権限の境界を示す。
document 以外は React shell か Tauri 側の副作用を伴う。

| surface | 実行する場所 | 性質 |
| --- | --- | --- |
| `project` | `App.tsx` | プロジェクトの作成・開く・閉じる、公開、アカウント確認。Editor の外で動くので、プロジェクトが開いていなくても呼べる |
| `document` | `mcp-editor-tools.ts` | document set への純粋な関数。副作用なし |
| `local-asset` | React shell | ネイティブ file I/O を伴う |
| `script` | React shell | project file I/O または動作確認 mode の変更を伴う |
| `external-store` | React shell | ネットワークと読み込む Queue を使う |
| `debug` | React shell | viewport の取得、撮影、制作確認状態の保存。SceneDocument は変更しない |

書き込み tool は `projectId`、`sceneId`、`expectedRevision` を要求する。古い
snapshot への適用を防ぐためだ。複数 client が同時に触っても編集は直列化される。

MCP の要求は常に shell (`App.tsx`) が受け取る。`project` tool は shell が処理し、それ以外は開いている Editor が処理する。Editor が無いあいだは shell が `EDITOR_UNAVAILABLE` を返し、`list_projects`、`open_project`、`create_project` を案内する。Editor は MCP の listener を登録した時点で shell へ bridge（最新 bundle、保存、退出）を登録し、shell はこの bridge を通じて公開と閉じる操作を行う。

## instructions と description の役割

利用者のプロジェクトで動く AIクライアントに届くのは、server の `instructions` と tool の
description だけだ。スキルも文書も届かない。「何を作るか」の手順は
`instructions` の先頭に置く。各 tool の description には「何をするか」に加えて「選ぶ基準」
「使ったあと何をするか」「行き詰まりやすい点」を書く。使うかどうかは設計図の内容に合わせて決める。description に禁止とは書かない。地形と草の tool は 14 本ある。
一方で床を作る tool は 1 本しかない。説明文に何も書かないと tool の数がワールドの形を決めてしまう。書き方の理由と
経緯は [ワールド制作ハーネス](./WORLD_AUTHORING_HARNESS.md) にある。

document tool の戻り値には `harness` が付くことがある。同じ種類（地形、草、同じオブジェクトの
位置・回転・大きさ、同じマテリアル）の書き込みを `capture_scene_view` を挟まずに 3 回続けると付く警告だ。
書き込み自体は拒否しない。数え方は Editor のメモリだけを使う。project には残らない。

## project (12)

**Library / セッション**
`list_projects`, `list_starter_templates`, `create_project`, `open_project`,
`close_project`

`create_project` はスターターからプロジェクトを作って Editor で開き、`open_project` は Library のビジュアル編集プロジェクトを開く。どちらも開いているプロジェクトを保存して閉じてから切り替える。コード編集プロジェクトは `PROJECT_NOT_EDITABLE` で断る。

**複製と受け渡し**
`duplicate_project`, `export_project`, `import_project`

`duplicate_project` は Library のプロジェクトを同じ保存先へ別名でコピーする。`export_project` は一つの `.xriftstudio` ファイルに書き出し、`import_project` はそのファイル、従来の `.zip`、または Git リポジトリを Library へ展開する。三つともコード編集プロジェクトも対象にするが、結果を Editor では開かない。開くには返ってきた path で `open_project` を呼ぶ。複製と取り込みは `projectId` を新しくし、`lastPublication` と `.xrift/*.json` の公開記録を落とすので、公開しても元のワールドを上書きしない。

パッケージには `node_modules`、`.git`、`dist`、キャッシュを含めない。同名のフォルダーは `PROJECT_EXISTS` で断り、上書きも統合もしない。`export_project` は保存先を受け取らず、Library の `.cache/exports` に書いた `.xriftstudio` の path を返す。任意の path へ書けると Library の外のファイルを上書きできてしまうからだ。

`import_project` は `archivePath`（`.xriftstudio` / `.zip`）か `repositoryUrl`（Git の HTTPS / SSH URL、shallow clone して履歴は持ち込まない）のどちらか一つを受け取る。`archivePath` は読むだけで、内部のZIPの直下または一つのフォルダーの中にプロジェクトの定義がないと `inspect` の段階で断る。ZIPの構成とpackage manifestは従来どおりで、拡張子の変更によるdocumentの変換は行わない。詳細は[プロジェクトの受け渡し形式](./PROJECT_PACKAGE.md)を参照する。

**アカウント**
`get_account`, `login`

`login` は Studio の中で `xrift login` を始める。ブラウザでの認証は人が完了し、認証情報は Studio の実行環境 home に残る。MCP へは「ログインしているか」と表示名だけを返す。

**公開**
`get_publish_readiness`, `publish_project`

`get_publish_readiness` は保存してから、公開情報（スターターのタイトル・説明のままでないこと）、サムネイル、ログイン、compiler の blocking diagnostics を確認し、足りない項目ごとに直す tool を `nextActions` に返す。`publish_project` は同じ確認を通ったときだけ、公開ダイアログと同じ `publishVisualProject` パイプライン（保存・変換・`xrift check --build`・アップロード）を実行し、結果を project の `lastPublication` に保存する。人が公開を依頼した場合にだけ呼ぶ。

## document (93)

**Editor context / Project**
`get_editor_context`, `get_project_health`, `analyze_performance`, `get_scripting_capabilities`, `update_project_metadata`

`get_project_health` は既存のProject / Scene / Asset検証を実行し、件数とほぼ0のScaleを報告する。`scope: document` の `ready` はファイルの存在、Playの動作、公開可能な状態を保証しない。指摘を修正したら再診断し、既存のPlay・Compile・公開前チェックへ進む。

`analyze_performance` は編集データのEntity / Light / Rigid Body / Texture / Model件数を目安と比較する。無効な要素・未使用素材も含み、Prefab内部やScriptによる実行時生成は展開しない。80%超は `warning`、100%超は `over-budget`。FPS・メモリー・三角形数の測定ではなく、公開を止める条件には使わない。両ツールともdocument surfaceの読み取りで、Scene・revision・保存状態を変更しない。

**素材一覧と整理**
`list_assets`, `create_asset_folder`, `rename_asset`, `rename_asset_folder`,
`move_asset`, `move_asset_folder`, `detach_asset_references`, `delete_asset`,
`delete_asset_folder`, `create_document_asset`

`delete_asset` は参照されている素材を拒否する。詳細には参照元を返す。その拒否は
`detach_asset_references` で解消する。Editor の削除ダイアログ
が出す「参照を外す」と同じ操作だ。マテリアル枠のような差し替え可能な参照は
空になる。形状・パーティクル emitter・プレハブ instance のように参照なしでは成立
しないコンポーネントは外れる。オブジェクトは残る。`ownerId` を渡すと 1 件だけ外せる。
`delete_asset` の `detachReferences` は、外してから削除するまでを 1 回で行う。

**素材の設定**
`get_audio_asset`, `get_model_asset`, `update_model_asset`,
`get_texture_asset`, `update_texture_asset`, `get_particle_asset`,
`update_particle_asset`, `get_material_asset`, `update_material_asset`,
`set_material`, `set_material_texture_transform`, `list_material_presets`,
`create_material_from_preset`, `create_texture_card`, `create_custom_shader`,
`get_custom_shader`, `update_custom_shader`

`create_custom_shader` は任意の GLSL を受ける。「空っぽく見せる」用途には使わず、カタログから選ぶ。
ゼロから書くとカタログが持つ数値を自分で決めることに
なる。`list_material_presets` は空・水・グロー・glTF 拡張のカタログを返す。名前付きの
パラメーターと範囲と既定値を含む。`create_material_from_preset` はマテリアル
を作る。`nextStep` を返す。空はシーン settings の skybox が指して初めて空に
なる。水は板ポリへ割り当てて初めて水面になる。作っただけでは終わらない。
空の背景の各項目は`qualityOptions`に軽量・標準・高精細のvariantsと説明を返す。
作成後の`update_custom_shader`へ`patch.variants`として渡すとUniformを保って品質を変えられる。
独自variantがある場合は`get_custom_shader`で取得し、品質用definesだけを統合する。
ストアの見回し・再生停止は一時的なプレビュー操作なのでMCPには追加しない。
地形の地面は形と一緒に選ぶ。`list_terrain_presets` の方にある。

`kind: "gltf"` はglTF拡張とPBRテクスチャのマテリアルを返す。50種類の見本セットに加え、互換性のために旧カタログの素材IDを保持している。Clearcoat、Transmission、Volume、Dispersion、Iridescence、Sheen、Anisotropy、Emissive、Specular、IOR、Unlitと、Normal Map・ORM・UV・Alphaの比較を含む。

`comparisonMaterialAssetId` は比較用のマテリアルを指す。拡張を比較する見本は基本のPBR値を揃え、テクスチャを比較する見本は比較対象のマップやUV設定だけを変える。`textureAssetIds` は必要な同梱テクスチャを返す。効果を見比べるときは `list_scene_recipes` の `shelf: "materials"` から選び、`apply_scene_recipe` で見本一式を置く。既存のモデルへ質感だけを付けるときは `create_material_from_preset` を使う。テクスチャが必要なプリセットは、保存済みのプロジェクトへ画像も取り込んでからMaterialを作成する。`parameters` は受け付けず、調整には通常のMaterial更新を使う。

`list_scene_recipes` は `group`、`tags`、`comparisonLabels` も返す。`shelf: "materials"` は50種類、ワールド用の `shelf: "gimmicks"` も50種類を返す。ギミックの操作確認はSceneへ追加してPlayで行う。カタログ内の回転・拡大・絞り込みは表示だけの操作なので、新しいMCP toolは追加しない。全項目と確認範囲は [カタログ拡充](./catalog-expansion/README.ja.md) に記載する。

`create_texture_card` は透過テクスチャから遠景板・草カードを作る。手で組む場合は
板ポリ、アルファブレンドの両面マテリアル、コライダー無し、円弧なら継ぎ目の
出ないセグメントの扇を、設定を互いに合わせて 4〜5 回呼び出すことになる。
マテリアルとオブジェクトを一件にまとめる。元に戻すでカードだけ消えてマテリアルが
残ることはない。

写真・ポスター・展示画のように「画像そのものを貼る」ときはカードではなく
画像コンポーネントを使う。`place_asset` へ画像のテクスチャを渡すと、幅 1 m で
画像の縦横比どおりの画像オブジェクトができる。マテリアルは作らない。既存の
オブジェクトへ付けるなら `add_component` の `core.image` に `textureAssetId` を渡す。
大きさ、基準点、色味、不透明度、透明部分の扱い、両面、ライトの影響は
`update_component` で変える。`height: null` は画像の縦横比へ戻す指示で、
`textureAssetId: ""` は画像を外す指示だ。環境テクスチャ（HDRI）は画像に貼れず、
空の背景へ使う。ノードグラフからは表示・色味・不透明度だけを変えられる。
画像の差し替えを対象にしない理由は `docs/KHR_INTERACTIVITY_EDITOR.md` にある。

**Scene / Entity**
`update_scene_settings`, `list_entities`, `get_entity_components`,
`get_entity_bounds`, `create_empty_entity`, `create_primitive`, `place_asset`,
`list_scene_recipes`, `place_builtin_prefab`, `create_prefab`, `rename_entity`,
`duplicate_entity`, `reparent_entity`, `delete_entity`, `set_entity_enabled`,
`update_transform`

`update_scene_settings` の `postprocessing` は、合成全体の有効・無効を書ける。
`ao` / `bloom` / `grading` それぞれの有効・無効と値、`order`（適用順）も書ける。
同じ値でも順番で仕上がりが変わる。順番を設定からしか触れない
ままにすると、「効果は選べるが見た目は決められない」状態になる。
`order` は並べ替えできる layer を 1 つずつ含む完全な配列だけを受ける。AO は
scene を描き直す pass で常に最初に動く。`order` には含めない。

共有ソースの 3Dモデルノード（`list_entities` が `modelNode` を返すオブジェクト。Skin /
Animation を持つ GLB / VRM の展開ノード）はオブジェクト単体では消せない。ジオメトリを親 3Dモデルの共有メッシュが
描くためだ。`delete_entity` は削除せず非表示（親メッシュの
`modelPose.nodes[i].visible: false`）へ変換する。結果の `deleted: false` と
`modelNodeVisibility: "hidden"` でそう伝える。再表示は `set_entity_enabled`
（`enabled: true`）で行う。3Dモデルから完全に取り除くにはソースを編集して再インポート
する。`set_entity_enabled` はこのノードに対して enabled と pose visibility を
同時に書く。シーン・公開ワールド・Runtime の見た目が一致する。

`list_scene_recipes` は焚き火・松明・木・岩・雪・噴水・柱・階段・井戸・ベンチ・
収録スタジオなどの出来合いの 3D セットを返す。配置は local-asset の
`apply_scene_recipe` で行う。各セットは光・パーティクル・マテリアルが互いに
合った subtree だ。同じものを primitive から組むと十数回の呼び出しが要り、
見劣りする。`note` は配置後の残作業を示す。落とさず
そのまま返す。

「しかけ・チュートリアル」カテゴリのセットは、形状に加えて音源と
ノードグラフまで組み込んで配置する。`behaviours` は押したときに何が
起きるかを 1 本ずつ返す。`lesson` はそのセットが教える手順を返す。押すと音が
鳴る、押すと灯りが点く、開いて自動で閉じる、といった仕掛けは、`add_component`
と `create_interactivity_asset` を何度も呼んで組み直す必要はない。配置される
のは普通の操作を受け付ける / 音源 / グラフの実行だ。置いた
あとは通常の tool でそのまま編集できる。

`get_entity_bounds` は位置・回転・大きさではなく**大きさ**を返す。`world` は既定で
配下を含めた axis-aligned box を返す。`local` は自身のメッシュの素の extent を返す。回転して
いる子は 8 隅を変換して含める箱にする。重なり判定が安全側になる。extent
を解決できないメッシュ（metadata が無い時代の 3Dモデルなど）は union から黙って
外さない。`unmeasuredEntityIds` に出す。「小さい」と「不明」を区別する。

**Component**
`list_component_definitions`, `add_component`, `update_component`,
`remove_component`, `update_script_component`

**Collider**
`set_mesh_collision`, `inspect_colliders`, `optimize_colliders`

共有ソースの 3Dモデルノード（`modelNode` 付きオブジェクト）には `add_component` で
`physics.mesh-collider` / `physics.box-collider` を付けられる。メッシュの衝突判定は
そのノード自身のジオメトリを焼いた当たりだ。子ノードは各自のオブジェクトで扱う。
Box は import 時に記録したノード bounds へ自動フィットする。bounds は新規
import / reimport で付く。旧素材は既定サイズになる。メッシュの衝突判定を
付けられるのはジオメトリを持つノード（nodeType メッシュ / skinned-mesh）だけだ。
Bone / 空ノードは `DEPENDENCY_MISSING` で断る。pose で非表示にしたノードは
描画と同時に当たりからも外れる。`get_entity_bounds` は bounds を持つノードを
実測に含める。

**Terrain**
`get_terrain`, `sample_terrain_point`, `list_terrain_presets`,
`create_terrain`, `create_terrain_from_preset`, `sculpt_terrain`,
`update_terrain`, `apply_terrain_surface`

`create_terrain` が作るのは平らな板だ。primitive としては正しいが、出発点として
は向いていない。追加メニューは形のプリセットを 8 種と表面カタログを出す。
primitive だけでは谷をブラシで一打ずつ彫ることになる。
`create_terrain_from_preset` は彫って草まで載った状態で置く。`position` を
省くと既存の地形の隣へ置く。同じ地面に 2 枚重なるとモアレになるためだ。
重なりは阻止しない。`overlappingTerrainCount` で報告する。

`apply_terrain_surface` は高さと傾斜でマテリアルを混ぜる表面プリセットを貼る。
プリセットの高さ帯は絶対値のメートルだ。既定ではその地形の標高範囲へ
合わせ直す。合わせずに貼ると全部の境界が範囲外に出て一色になる。「シェーダー
が壊れている」ように見える。貼った結果は通常のマテリアルだ。あとから
マテリアルの tool で調整できる。

`sample_terrain_point` は Terrain-local の XZ から、補間した高さ、同じ点の
world 座標、傾斜、穴、草の層ごとの被覆を返す。document は高さを平坦な配列で
持っていて直接は引けない。これが無いと彫った地形の上へ y=0 で置いて
しまう。

**地形の草**
`list_terrain_grass_types`, `apply_terrain_grass_preset`,
`add_terrain_grass_layer`, `update_terrain_grass_layer`,
`delete_terrain_grass_layer`, `paint_terrain_grass`
（詳細は [地形エディター仕様](./TERRAIN_EDITOR_SPEC.md) の「MCP から草を扱う」）

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

`apply_interactivity_recipe` は、Editor の「追加」パネルの「よく作るもの」と
同じレシピから Graph 素材を作る。`entityId` を渡すとグラフの実行で
そのオブジェクトへ付ける。押して動くレシピなら公式操作を受け付けるも足す。ここまでを
1 revision で行う。Editor には「まだ動きません」と言う setup パネルがある。
MCP には無い。素材を作るだけの tool では「テンプレートから作ったのに
動かない」状態が MCP 側に残る。`list_interactivity_recipes` が id を返す。並ぶのは
動作確認と公開先が実際に実行するレシピだけだ。

`create_model_animation_graph` は 3Dモデルの素材のアニメーションクリップ
すべてを `event/onStart` から同時にループ再生するグラフを作る。モデルの設定
の「アニメーションのGraphを作る」と同じものだ。素材を作るだけでオブジェクトには
付けない。付け先は `add_component` の `interaction.trigger` で選ぶ。

Animationコンポーネントは廃止された。`place_asset` でクリップを持つ 3Dモデルを置くと、
その全クリップを再生する Graph とグラフの実行が一緒に付く。`add_component`
に `core.animation` は無い。まだコンポーネントを持つ document に対する
`update_component` は `COMPONENT_REMOVED` で断る。`remove_component` は通る。

ノードエディターの操作はすべてこの表にある。元に戻す / やり直す、選択、編集領域の見え方（拡大、
全体表示、パネル幅）、タイムラインの範囲と時刻のつまみを除く。
除いた 4 つは document を変えない。

`duplicate_interactivity_node` は `targetGraphIndex` を受ける。Editor の
Ctrl+C / Ctrl+V と同じく別のグラフへも置ける。同じグラフの中ならノードはその
まま写せる。別のグラフでは `declaration` の index も inline value の `type`
の index も別のものを指す。名前で取り出し、コピー先のグラフで index を割り当て直す。

`set_interactivity_value` は設定の「値」欄と同じ操作で、数値だけでなく
`signature` も受ける。KHR_interactivity に定数ノードは無く、固定値は必ずソケット
自身の literal なので、`3` を送るのと `(0, 1, 0)` を送るのは型の違いでしかない。
operation が型を決めているソケット (秒数、繰り返し回数、animation の index、
論理演算の入力) へ別の型を渡すと `SIGNATURE_NOT_ALLOWED` で拒否する。設定も
同じソケットでは型を変えさせないので、どちらの surface から書いても同じ結果に
なる。どのソケットが固定かは `list_interactivity_operations` の
`fixedValueTypes` が返す。

`configure_interactivity_trigger_action` は 4 つの key を引き受ける。`set_interactivity_configuration`
と `set_interactivity_value` で手書きできる key だ。オブジェクト・コンポーネント・
プロパティの実在と値の型ごと扱う。対象を間違えたグラフは保存できる。動作確認で
何も起きない。Editor の選択欄が防いでいるのはこの失敗だ。MCP から書くときも
通してよいものではない。かける時間とイージングも同じ呼び出しにある。中間の
値を持たないプロパティに時間を指定すると拒否する。実行環境が補間できない値を、滑らかに変化させられるように見せないためだ。

値が数値でないプロパティは `value` を取らない。`kind` が `asset` のものは
`valueAssetId`、`string` のものは `text` を取る。KHR_interactivity に string 型は
無い。素材も文も補間できる量ではない。どちらも target と並んで
`configuration` に入る。`valueAssetId` へ空文字を渡すと、シーン設定側の素材へ
戻る。`list_interaction_trigger_targets` は各プロパティの `kind` を返す。加えて
受け付ける素材の種類 (`assetKinds`) と、どの引数で渡すか (`argument`) を返す。
`Scene` ターゲットへの書き込みはすべて client-local だ。そのグラフを実行して
いるビューアーの描画にだけ効く。

`simulate_interactivity_asset` はレンダラー無しでグラフを進める。いつ何が起きるか
を返す。Editor のタイムラインと同じ実行だ。JSON を読むだけでは「その待機が意図した
時刻に届くか」「その繰り返しが終わるか」「どの枝が一度も動かないか」は分からない。
書き込みはしない。revision も要らない。

`move_interactivity_node` と `layout_interactivity_graph` は、組んだ
グラフが作者の画面で開くためにある。位置を書けないと、全部のカードが同じ場所に積まれた状態で
渡ることになる。作者の最初の操作が「整列」を押すことになる。

**コンポーネントコードの取り込み**
`analyze_component_code`, `apply_component_code_import_plan`

## local-asset (14)

`import_audio_asset`, `import_font_asset`, `import_texture_asset`, `import_model_asset`,
`import_skybox_asset`, `import_shader_asset`, `reimport_model_asset`,
`process_texture_asset`, `optimize_model_asset`, `revert_asset_optimization`,
`apply_scene_recipe`, `get_shader_asset`, `update_shader_asset`,
`set_project_thumbnail`

`import_font_asset` が受け付けるのは TTF、OTF、WOFF だけだ。WOFF2 は text
renderer が解釈できない。組版が終わらないままテキストが空になる。
取り込みの時点で理由を添えて断る。取り込んだフォント素材は
`update_component` の `patch.fontAssetId` でテキストから参照する。空文字を渡すと
同梱の書体へ戻る。

`apply_scene_recipe` が document ではなく shell にあるのは、セットの部品の
3Dモデルを project へ書き出すためだ。パーティクルと subtree は一件の history
にまとめる。セットを元に戻すしたときに素材だけ残さないためだ。

`update_texture_asset` が書けるのは import 設定だけだ。`maxSize`、`format`、
`quality` を指す。原本の画像はそのまま残る。実際に解像度を変えて再エンコード
するのは `process_texture_asset` だ。設定だけ書いて「圧縮した」と報告すると、
Editor 上の「未反映」の表示と食い違う。変換の実行を別の
tool にしてある。既に設定が反映済みなら `changed: false` と理由を返す。原本を
書き直さない。

`update_model_asset` も同じだ。書けるのは import recipe だけだ。`scale`、
`generateColliders`、`optimizeMeshes`、`importAnimations` を指す。原本の GLB を
実際に書き換えるのは `optimize_model_asset` だ。頂点の結合、頂点バッファの共有、
Animation キーフレームの間引きを行う。任意で Draco 圧縮も行う。マテリアル Slot、Node
構造、Animation クリップの本数は変えない。マテリアルや Node の索引が動くと、オブジェクト
側のマテリアル割当が別のマテリアルへ移る。統合や平坦化は行わない。実行する
処理がなければ `changed: false` を返す。

`instanceMeshes` は描画の設定で、再インポートなしで動作確認と公開先へ反映する。
`update_model_asset` の `patch.importSettings.instanceMeshes` をtrueにすると有効、
falseにすると解除する。静的GLBの同じ形状・マテリアルの不透明な部品を近隣ごとに
まとめる。動的な親、Animation、Skin、Morph、反転した部品は除外する。
スクリプトやグラフの実行があるシーンは通常描画を維持する。原本や衝突判定は変更しない。
取り込みテクスチャの端末共通設定は歯車から変更できる。MCPでは既存の取り込みtoolの
明示設定を使うため、端末の既定値専用toolは設けない。

変換と最適化はどちらも非破壊だ。原本のファイルは書き換えない。変換結果を
`assets/.optimized/` へ書く。素材の `source` が指す先だけを差し替える。変換前の
`source`、解析結果、読み込む設定は `optimizedFrom` に控える。
`revert_asset_optimization` はこの控えから原本へ戻す。圧縮を試して戻せないと
手直しが要る。実行と同じ surface に解除も置いてある。

## script (6)

`list_script_templates`, `get_script_asset`, `create_script_asset`,
`apply_script_template`, `update_script_asset`, `set_play_mode`

`list_script_templates` は `vehicle` / `seat` のTSXテンプレートも返す。
`create_script_asset` の `templateId` に指定し、既存のScript Component追加・property編集の経路を使う。
操縦処理や車体の形状は `update_script_asset` で編集する。使用範囲は
[Vehicle / Seat](./SCRIPTING.md#vehicle--seatworld-components-0520) を参照する。

追加承認のないスクリプト実行と隔離の限界は [スクリプトの契約](./SCRIPTING.md) にある。

## external-store (3)

`search_external_assets`, `get_external_asset_options`,
`install_external_asset`

`search_external_assets` の 3Dモデルには Poly Haven の一覧 API が返す `polycount` と
`dimensionsMm` (幅、奥行、高さ、mm) が付く。Poly Haven の写真スキャンは木で数百万、岩でも
数十万三角形のものがある。重さを知らずに install すると公開物が壊れる。入れる前に
読んで、そのワールドに決めた予算と見比べる。上限の数値はここでは決めない。

## debug (11)

`capture_scene_debug`, `capture_scene_view`, `set_scene_view_camera`,
`start_recording`, `stop_recording`, `get_recording_status`,
`set_recording_profile`, `set_recording_viewport`, `get_recording_viewport`,
`set_recording_camera`, `get_recording_camera`

document を書き換えない。現在表示中のシーンを読む / 向きを変える / 録画するだけだ。
元に戻す履歴も選択も動かさない。

- `capture_scene_debug` — fps、frame time、draw call、triangle、可視メッシュ数、
  形状 / テクスチャ別のVRAM概算（geometryVramBytes / textureVramBytes）、未算定テクスチャ数（unknownVramTextures）、
  テクスチャ内訳（compressedTextureVramBytes / uncompressedTextureVramBytes、compressedTextureCount / uncompressedTextureCount。未算定は除外）、
  カメラの奥を返す。WebM の録画も start / stop で扱う
- `capture_scene_view` — 描画そのままの PNG を 1 枚、app の
  `debug-captures` へ保存する。パスを返す。**数値と document は「何が映るはず
  か」しか言わない。実際に何が映っているかはフレームだけが示す**
- `set_scene_view_camera` — 俯瞰 (`top`) / 真下から (`bottom`) / 各軸 (`front`
  `back` `left` `right`) / 既定の斜め (`iso`) を選べる。`focusEntityId` でオブジェクトの
  実描画 bounds へ寄る。あるいは `position` と `target` を直接指定する。プリセット
  だけを渡した場合は今の注視点を保つ。「いまの対象を上から見る」操作になる。
  bounds は F キーと同じ経路で測る。コライダー枠のような編集用の補助表示
  や無効化した子は含めない。同じオブジェクトを同じ場所から見る操作になる

保存先は指定できない。意図的な制限だ。確認のために撮った画像は一時的な成果物だ。
project ではなく app data へ置く。

**ワールド制作の録画**（詳細は [ワールド制作の録画](./RECORDING.md)）

## 意図的に公開していない操作

- iPadのパネル切り替え・視点だけ操作・複数選択・Playのタッチ入力は、端末側の表示または入力状態で、documentを変えないため専用toolを設けない。ブラウザの保存先選択、`.xriftstudio` のダウンロードと共有メニューはユーザー操作とSafariの権限に依存するため、MCPから起動しない。プロジェクトのデータ編集とデスクトップのファイル書き出し・取り込みは既存toolを使う。iPadブラウザ内でのMCP接続は提供しない。

- スクリプト一覧の検索・折り畳み・シーン横のタブ切り替えは画面内の表示状態なので、専用toolは設けない。素材の取得・作成・更新は既存のスクリプト toolを使う。Graphとのイベント連携APIは `get_scripting_capabilities` に含め、スクリプト元データとGraphの既存編集toolで設定する。

- 公開用GLBの不要画像除去とキャッシュ管理は、公開・書き出し処理に自動適用する。編集用素材や動作確認の状態を変える操作ではないため、専用のMCP toolは設けない。仕様は[公開時のダウンロード容量削減](./PUBLISH_DOWNLOAD_OPTIMIZATION.md)を参照する。

- マテリアル Slotsの開閉・検索・ページ切替は表示だけの状態なのでMCPへ公開しない。マテリアル割当の読み取り・変更は既存の3Dモデルの素材操作を使う。

「まだ作っていない」ものと「公開しないもの」を分けて示す。

| 操作 | 理由 |
| --- | --- |
| 元に戻す / やり直す | 操作は revision で直列化する。Editor の履歴は人の操作単位だ。片方から巻き戻すと、もう片方が何を失ったのか分からなくなる |
| 選択の変更だけ | 各 tool が結果として選択を移す。選択のためだけの tool は履歴も document も変えない。状態だけずらす |
| シーンの描画品質（自動 / 高品質 / 軽量 / 描画50% / 描画25%） | 編集中の描き方だけを変える Editor State だ。既定の自動は75%から開始し、負荷が続くと25%まで下げる。document にも公開物にも残らない。動作確認とサムネイル撮影は常に高品質で描く。読み取る見た目も変わらない |
| 拡大・全体表示・パネル幅・タイムラインの範囲と時刻 | 見え方だけの状態だ。document に残らない。ノードの位置は document に残るので `move_interactivity_node` と `layout_interactivity_graph` で扱う |
| 公開ダイアログのテクスチャ一括変換・素材最適化 | 公開前の容量削減は `process_texture_asset` と素材ごとの tool で行う。`publish_project` は確認済みの document をそのまま公開する |
| Logout、トークンの受け渡し | 認証情報を MCP 境界へ渡さないためだ。`login` は Studio の中で認証を始めるだけで、`get_account` は状態だけを返す |
| 録画の保存先の指定 | `recording_begin_file` が開けるのは既定の保存先と、フォルダーダイアログで選んだ場所だけだ。path を直接書けると Rust 側の path 検証を迂回する。保存先を変える場合は録画パネルを使う |
| 公式コンポーネントの position / rotation / scale | `update_component` は XRiftのコンポーネントのこれらの prop を受け取らない。コンポーネント側に持たせるとオブジェクトの位置・回転・大きさと別の原点ができ、選択したときのギズモと回転の中心が描かれている場所からずれる。配置は `update_component` の `transform` patch でオブジェクトへ書く |
| 任意 path の読み書き・削除 | Rust 側の path 検証と権限制御を迂回させないためだ |
| 任意 JavaScript の実行 | 汎用JavaScript評価toolは提供しない。Script AssetはPlayで追加承認なく実行され、sandboxではない（SCRIPTING.md参照） |
| テクスチャの一括変換 | 複数選択したものをまとめて書き出すための導線だ。MCP からは `process_texture_asset` を素材ごとに呼ぶ。対象の選び方は設計図で決まる |
| テクスチャの共通設定・サイズ確認 | 共通設定は `update_texture_asset` の `importSettings` と `process_texture_asset` で同じ処理を実行する。サイズ確認は既存画像の読み取りだけを行う設定の表示状態だ。再インポートで取得した寸法は素材のimportMetadataにも入る |
| 取り込み時のテクスチャ最大解像度 | 読み込むメニューに残る Editor State だ。document には入らない。`import_local_texture` と `update_texture_asset` の `importSettings.resize` で同じ結果を素材ごとに指定する |
| ワールド動作確認のプレイヤー操作（移動・視点・ジャンプ・掴み・操作） | 実行中のプレイヤー入力だ。document にも公開物にも残らない。視点はマウスのポインターロックが前提だ。MCP から送っても画面のロックは動かない。シーンを見るには `set_scene_view_camera` と `capture_scene_debug` を使う。操作の結果を確かめるなら `set_play_mode` とノードグラフ / スクリプト側の状態を読む |

## 機能を足すときの手順

1. `mcp-tool-registry.ts` の `XRIFT_MCP_TOOLS` へ name と surface を足す
2. surface に応じて `mcp-editor-tools.ts` の handler、または React shell の分岐を書く
3. `src-tauri/src/mcp.rs` の `tool_definitions()` へ JSON schema を足す
4. `pnpm mcp:tool-names` で Rust の allow-list を再生成する
5. `mcp-editor-tools.fixture.ts` へ、成功する呼び出しと拒否される呼び出しを足す
6. `pnpm typecheck`、`pnpm cli:test`、`cargo test --manifest-path src-tauri/Cargo.toml`

シーン document のスキーマを増やしたときは、`serialization.ts` の許可キーと
対応する MCP tool を同時に更新する。片方だけ更新すると、保存した時点でシーンが
読めなくなる。

### 大きなモデルを取り込むとき

Editorの `import_model_asset` と、`importSettings` を省略した `import_texture_asset` は歯車から開く設定パネルの共通設定を使う。未設定時は最大1024px・KTX2。対応する単体画像とモデル内蔵画像を変換してからManifestを採用するため、変換前の画像を先にシーンへ配置しない。元画像と元モデルは保持する。既存素材には遡って適用しない。圧縮に失敗した場合は配置へ進まず、設定を変えて再試行できる。

`set_mesh_collision` はメッシュの描画の追加・解除・シーン全体の置換を一件のrevisionで実行する。`exclusive`はTriggerを含む全衝突判定と自動生成を解除する。`inspect_colliders`の`sources`から設定元のオブジェクト、形状、階層の有効状態を読める。

`bake_mesh_collider` は選んだ3Dモデルノードの当たり判定だけを間引くlocal-asset操作。`entityId`、メッシュの衝突判定の`componentId`、残す割合`ratio`を渡す。結果のポリゴン数を確認し、歩行を検証する。共有3Dモデルと通常の展開ノードに対応し、未展開3Dモデル全体と組み込みプリミティブは対象外。

外部カタログの `list_scene_recipes` は `shelf` に `models`（3Dセット）、`materials`（マテリアル表現のglTF見本）、`gimmicks`（ギミック）を返す。目的に合う分類から選び、既存の配置ツールへ同じrecipe IDを渡す。配置後はInspectorで編集し、ギミックはPlayで動作を確認する。
