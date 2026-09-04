# MCP editor tool の全体像

XRift Studio は、開いている Editor をそのまま AI client へ開放する MCP server を
同梱している。この文書は「どの Editor 操作が MCP から動くのか」を一覧で示す。
機能を足したときは、ここで MCP への対応漏れを確認する。

一次情報は `src/lib/visual-editor/mcp-tool-registry.ts` の `XRIFT_MCP_TOOLS`
表だ。Rust の allow-list (`src-tauri/src/mcp_tool_names.rs`) はそこから生成し、
`pnpm mcp:tool-names --check` と Rust の
`tool_list_matches_the_generated_allow_list` テストが、表・生成物・JSON schema の
3つが同じ集合であることを保証する。この文書だけ古くなる場合がある。
名前が食い違った場合は表の名前を優先する。

## surface

tool は「誰が実行するか」で5つに分かれる。この分類が権限の境界を示す。
document 以外は React shell か Tauri 側の副作用を伴う。

| surface | 実行する場所 | 性質 |
| --- | --- | --- |
| `document` | `mcp-editor-tools.ts` | document set への純粋な関数。副作用なし |
| `local-asset` | React shell | ネイティブ file I/O を伴う |
| `script` | React shell | project file I/O または Play mode の変更を伴う |
| `external-store` | React shell | ネットワークと Import Queue を使う |
| `debug` | React shell | document ではなく現在表示中の viewport を読む |

書き込み tool は `projectId`、`sceneId`、`expectedRevision` を要求する。古い
snapshot への適用を防ぐためだ。複数 client が同時に触っても編集は直列化される。

## instructions と description の役割

利用者のプロジェクトで動く AI client に届くのは、server の `instructions` と tool の
description だけだ。スキルも文書も届かない。「何を作るか」の手順は
`instructions` の先頭に置く。各 tool の description には「何をするか」に加えて「選ぶ基準」
「使ったあと何をするか」「行き詰まりやすい点」を書く。使うかどうかは設計図の内容に合わせて決める。description に禁止とは書かない。Terrain と草の tool は 14 本ある。
一方で床を作る tool は 1 本しかない。説明文に何も書かないと tool の数がワールドの形を決めてしまう。書き方の理由と
経緯は [ワールド制作ハーネス](./WORLD_AUTHORING_HARNESS.md) にある。

document tool の戻り値には `harness` が付くことがある。同じ種類（Terrain、草、同じ Entity の
Transform、同じ Material）の書き込みを `capture_scene_view` を挟まずに 3 回続けると付く警告だ。
書き込み自体は拒否しない。数え方は Editor のメモリだけを使う。project には残らない。

## document (93)

**Editor context / Project**
`get_editor_context`, `get_scripting_capabilities`, `update_project_metadata`

**Assets 一覧と整理**
`list_assets`, `create_asset_folder`, `rename_asset`, `rename_asset_folder`,
`move_asset`, `move_asset_folder`, `detach_asset_references`, `delete_asset`,
`delete_asset_folder`, `create_document_asset`

`delete_asset` は参照されている Asset を拒否する。詳細には参照元を返す。その拒否は
`detach_asset_references` で解消する。Editor の削除ダイアログ
が出す「参照を外す」と同じ操作だ。Material slot のような差し替え可能な参照は
空になる。Geometry・Particle emitter・Prefab instance のように参照なしでは成立
しない Component は外れる。Entity は残る。`ownerId` を渡すと 1 件だけ外せる。
`delete_asset` の `detachReferences` は、外してから削除するまでを 1 回で行う。

**Asset の設定**
`get_audio_asset`, `get_model_asset`, `update_model_asset`,
`get_texture_asset`, `update_texture_asset`, `get_particle_asset`,
`update_particle_asset`, `get_material_asset`, `update_material_asset`,
`set_material`, `set_material_texture_transform`, `list_material_presets`,
`create_material_from_preset`, `create_texture_card`, `create_custom_shader`,
`get_custom_shader`, `update_custom_shader`

`create_custom_shader` は任意の GLSL を受ける。「空っぽく見せる」用途には使わず、カタログから選ぶ。
ゼロから書くとカタログが持つ数値を自分で決めることに
なる。`list_material_presets` は空・水・グロー・glTF 拡張のカタログを返す。名前付きの
パラメーターと範囲と既定値を含む。`create_material_from_preset` は Material
を作る。`nextStep` を返す。空は Scene settings の skybox が指して初めて空に
なる。水は板ポリへ割り当てて初めて水面になる。作っただけでは終わらない。
Terrain の地面は形と一緒に選ぶ。`list_terrain_presets` の方にある。

`kind: "gltf"` は glTF の Material 拡張ごとに 1 つずつ用意した Material を返す。
クリアコートの車塗装、ヘアライン金属、透過ガラス、色ガラス、分散する水晶、
シャボン玉、玉虫塗装、ベルベット、マット塗装、金コーティング、ネオン管、
屈折率違いのガラス、アンリット看板である。`comparisonMaterialAssetId` は
同じ Material から拡張だけを外したものを指す。拡張は隣に「無い方」が無いと
読めないので、効果を見せるのが目的なら `apply_scene_recipe` の
「マテリアル見本」セットを置く。面として使うのが目的ならこの tool を使う。
`parameters` は受け付けない。glow と同じく、値の決まった完成品だからである。

`create_texture_card` は透過 Texture から遠景板・草カードを作る。手で組む場合は
板ポリ、アルファブレンドの両面 Material、コライダー無し、円弧なら継ぎ目の
出ないセグメントの扇を、設定を互いに合わせて 4〜5 回呼び出すことになる。
Material と Entity を一件にまとめる。Undo でカードだけ消えて Material が
残ることはない。

**Scene / Entity**
`update_scene_settings`, `list_entities`, `get_entity_components`,
`get_entity_bounds`, `create_empty_entity`, `create_primitive`, `place_asset`,
`list_scene_recipes`, `place_builtin_prefab`, `create_prefab`, `rename_entity`,
`duplicate_entity`, `reparent_entity`, `delete_entity`, `set_entity_enabled`,
`update_transform`

`update_scene_settings` の `postprocessing` は、合成全体の有効・無効を書ける。
`ao` / `bloom` / `grading` それぞれの有効・無効と値、`order`（適用順）も書ける。
同じ値でも順番で仕上がりが変わる。順番を Inspector からしか触れない
ままにすると、「効果は選べるが見た目は決められない」状態になる。
`order` は並べ替えできる layer を 1 つずつ含む完全な配列だけを受ける。AO は
scene を描き直す pass で常に最初に動く。`order` には含めない。

共有ソースの Model ノード（`list_entities` が `modelNode` を返す Entity。Skin /
Animation を持つ GLB / VRM の展開ノード）は Entity 単体では消せない。ジオメトリを親 Model の共有 Mesh が
描くためだ。`delete_entity` は削除せず非表示（親 Mesh の
`modelPose.nodes[i].visible: false`）へ変換する。結果の `deleted: false` と
`modelNodeVisibility: "hidden"` でそう伝える。再表示は `set_entity_enabled`
（`enabled: true`）で行う。Model から完全に取り除くにはソースを編集して再インポート
する。`set_entity_enabled` はこのノードに対して enabled と pose visibility を
同時に書く。Scene View・公開ワールド・Runtime の見た目が一致する。

`list_scene_recipes` は焚き火・松明・木・岩・雪・噴水・柱・階段・井戸・ベンチ・
収録スタジオなどの出来合いの 3D セットを返す。配置は local-asset の
`apply_scene_recipe` で行う。各セットは光・パーティクル・マテリアルが互いに
合った subtree だ。同じものを primitive から組むと十数回の呼び出しが要り、
見劣りする。`note` は配置後の残作業を示す。落とさず
そのまま返す。

「しかけ・チュートリアル」カテゴリのセットは、形状に加えて Audio Source と
Interactivity Graph まで組み込んで配置する。`behaviours` は押したときに何が
起きるかを 1 本ずつ返す。`lesson` はそのセットが教える手順を返す。押すと音が
鳴る、押すと灯りが点く、開いて自動で閉じる、といった仕掛けは、`add_component`
と `create_interactivity_asset` を何度も呼んで組み直す必要はない。配置される
のは普通の Interactable / Audio Source / Interaction Trigger だ。置いた
あとは通常の tool でそのまま編集できる。

`get_entity_bounds` は Transform ではなく**大きさ**を返す。`world` は既定で
配下を含めた axis-aligned box を返す。`local` は自身の Mesh の素の extent を返す。回転して
いる子は 8 隅を変換して含める箱にする。重なり判定が安全側になる。extent
を解決できない Mesh（metadata が無い時代の Model など）は union から黙って
外さない。`unmeasuredEntityIds` に出す。「小さい」と「不明」を区別する。

**Component**
`list_component_definitions`, `add_component`, `update_component`,
`remove_component`, `update_script_component`

**Collider**
`inspect_colliders`, `optimize_colliders`

共有ソースの Model ノード（`modelNode` 付き Entity）には `add_component` で
`physics.mesh-collider` / `physics.box-collider` を付けられる。Mesh Collider は
そのノード自身のジオメトリを焼いた当たりだ。子ノードは各自の Entity で扱う。
Box は import 時に記録したノード bounds へ自動フィットする。bounds は新規
import / reimport で付く。旧 Asset は既定サイズになる。Mesh Collider を
付けられるのはジオメトリを持つノード（nodeType mesh / skinned-mesh）だけだ。
Bone / 空ノードは `DEPENDENCY_MISSING` で断る。pose で非表示にしたノードは
描画と同時に当たりからも外れる。`get_entity_bounds` は bounds を持つノードを
実測に含める。

**Terrain**
`get_terrain`, `sample_terrain_point`, `list_terrain_presets`,
`create_terrain`, `create_terrain_from_preset`, `sculpt_terrain`,
`update_terrain`, `apply_terrain_surface`

`create_terrain` が作るのは平らな板だ。primitive としては正しいが、出発点として
は向いていない。Create メニューは形の preset を 8 種と表面カタログを出す。
primitive だけでは谷をブラシで一打ずつ彫ることになる。
`create_terrain_from_preset` は彫って草まで載った状態で置く。`position` を
省くと既存の Terrain の隣へ置く。同じ地面に 2 枚重なるとモアレになるためだ。
重なりは阻止しない。`overlappingTerrainCount` で報告する。

`apply_terrain_surface` は高さと傾斜でマテリアルを混ぜる表面 preset を貼る。
preset の高さ帯は絶対値のメートルだ。既定ではその Terrain の標高範囲へ
合わせ直す。合わせずに貼ると全部の境界が範囲外に出て一色になる。「シェーダー
が壊れている」ように見える。貼った結果は通常の Material だ。あとから
Material の tool で調整できる。

`sample_terrain_point` は Terrain-local の XZ から、補間した高さ、同じ点の
world 座標、傾斜、穴、草の層ごとの被覆を返す。document は高さを平坦な配列で
持っていて直接は引けない。これが無いと彫った地形の上へ y=0 で置いて
しまう。

**Terrain の草**
`list_terrain_grass_types`, `apply_terrain_grass_preset`,
`add_terrain_grass_layer`, `update_terrain_grass_layer`,
`delete_terrain_grass_layer`, `paint_terrain_grass`
（詳細は [Terrain エディター 仕様](./TERRAIN_EDITOR_SPEC.md) の「MCP から草を扱う」）

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
同じレシピから Graph Asset を作る。`entityId` を渡すと Interaction Trigger で
その Entity へ付ける。押して動くレシピなら公式 Interactable も足す。ここまでを
1 revision で行う。Editor には「まだ動きません」と言う setup パネルがある。
MCP には無い。Asset を作るだけの tool では「テンプレートから作ったのに
動かない」状態が MCP 側に残る。`list_interactivity_recipes` が id を返す。並ぶのは
Play と公開先が実際に実行するレシピだけだ。

`create_model_animation_graph` は Model Asset の animation clip
すべてを `event/onStart` から同時にループ再生するグラフを作る。Model Inspector
の「アニメーションのGraphを作る」と同じものだ。Asset を作るだけで Entity には
付けない。付け先は `add_component` の `interaction.trigger` で選ぶ。

Animation Component は廃止された。`place_asset` で clip を持つ Model を置くと、
その全 clip を再生する Graph と Interaction Trigger が一緒に付く。`add_component`
に `core.animation` は無い。まだ Component を持つ document に対する
`update_component` は `COMPONENT_REMOVED` で断る。`remove_component` は通る。

ノードエディターの操作はすべてこの表にある。Undo / Redo、選択、canvas の見え方（拡大、
全体表示、パネル幅）、タイムラインの範囲と時刻のつまみを除く。
除いた 4 つは document を変えない。

`duplicate_interactivity_node` は `targetGraphIndex` を受ける。Editor の
Ctrl+C / Ctrl+V と同じく別のグラフへも置ける。同じグラフの中なら node はその
まま写せる。別のグラフでは `declaration` の index も inline value の `type`
の index も別のものを指す。名前で取り出し、コピー先のグラフで index を割り当て直す。

`set_interactivity_value` は Inspector の「値」欄と同じ操作で、数値だけでなく
`signature` も受ける。KHR_interactivity に定数ノードは無く、固定値は必ずソケット
自身の literal なので、`3` を送るのと `(0, 1, 0)` を送るのは型の違いでしかない。
operation が型を決めているソケット (秒数、繰り返し回数、animation の index、
論理演算の入力) へ別の型を渡すと `SIGNATURE_NOT_ALLOWED` で拒否する。Inspector も
同じソケットでは型を変えさせないので、どちらの surface から書いても同じ結果に
なる。どのソケットが固定かは `list_interactivity_operations` の
`fixedValueTypes` が返す。

`configure_interactivity_trigger_action` は 4 つの key を引き受ける。`set_interactivity_configuration`
と `set_interactivity_value` で手書きできる key だ。Entity・Component・
プロパティの実在と値の型ごと扱う。対象を間違えたグラフは保存できる。Play で
何も起きない。Editor のピッカーが防いでいるのはこの失敗だ。MCP から書くときも
通してよいものではない。かける時間とイージングも同じ呼び出しにある。中間の
値を持たないプロパティに時間を指定すると拒否する。runtime が補間できない値を、滑らかに変化させられるように見せないためだ。

値が数値でないプロパティは `value` を取らない。`kind` が `asset` のものは
`valueAssetId`、`string` のものは `text` を取る。KHR_interactivity に string 型は
無い。Asset も文も補間できる量ではない。どちらも target と並んで
`configuration` に入る。`valueAssetId` へ空文字を渡すと、シーン設定側の Asset へ
戻る。`list_interaction_trigger_targets` は各プロパティの `kind` を返す。加えて
受け付ける Asset の種類 (`assetKinds`) と、どの引数で渡すか (`argument`) を返す。
`Scene` ターゲットへの書き込みはすべて client-local だ。そのグラフを実行して
いるビューアーの描画にだけ効く。

`simulate_interactivity_asset` はレンダラー無しでグラフを進める。いつ何が起きるか
を返す。Editor のタイムラインと同じ実行だ。JSON を読むだけでは「その待機が意図した
時刻に届くか」「その繰り返しが終わるか」「どの枝が一度も動かないか」は分からない。
書き込みはしない。revision も要らない。

`move_interactivity_node` と `layout_interactivity_graph` は、組んだ
グラフが作者の画面で開くためにある。位置を書けないと、全部のカードが同じ場所に積まれた状態で
渡ることになる。作者の最初の操作が「整列」を押すことになる。

**Component コードの取り込み**
`analyze_component_code`, `apply_component_code_import_plan`

## local-asset (14)

`import_audio_asset`, `import_font_asset`, `import_texture_asset`, `import_model_asset`,
`import_skybox_asset`, `import_shader_asset`, `reimport_model_asset`,
`process_texture_asset`, `optimize_model_asset`, `revert_asset_optimization`,
`apply_scene_recipe`, `get_shader_asset`, `update_shader_asset`,
`set_project_thumbnail`

`import_font_asset` が受け付けるのは TTF、OTF、WOFF だけだ。WOFF2 は text
renderer が解釈できない。組版が終わらないまま Text が空になる。
取り込みの時点で理由を添えて断る。取り込んだ Font Asset は
`update_component` の `patch.fontAssetId` で Text から参照する。空文字を渡すと
同梱の書体へ戻る。

`apply_scene_recipe` が document ではなく shell にあるのは、セットの部品の
Model を project へ書き出すためだ。Particle Asset と subtree は一件の history
にまとめる。セットを Undo したときに Asset だけ残さないためだ。

`update_texture_asset` が書けるのは import 設定だけだ。`maxSize`、`format`、
`quality` を指す。原本の画像はそのまま残る。実際に解像度を変えて再エンコード
するのは `process_texture_asset` だ。設定だけ書いて「圧縮した」と報告すると、
Editor 上の「未反映」の表示と食い違う。変換の実行を別の
tool にしてある。既に設定が反映済みなら `changed: false` と理由を返す。原本を
書き直さない。

`update_model_asset` も同じだ。書けるのは import recipe だけだ。`scale`、
`generateColliders`、`optimizeMeshes`、`importAnimations` を指す。原本の GLB を
実際に書き換えるのは `optimize_model_asset` だ。頂点の結合、頂点バッファの共有、
Animation キーフレームの間引きを行う。任意で Draco 圧縮も行う。Material Slot、Node
構造、Animation clip の本数は変えない。Material や Node の索引が動くと、Entity
側の Material 割当が別の Material へ移る。統合や平坦化は行わない。実行する
処理がなければ `changed: false` を返す。

変換と最適化はどちらも非破壊だ。原本のファイルは書き換えない。変換結果を
`assets/.optimized/` へ書く。Asset の `source` が指す先だけを差し替える。変換前の
`source`、解析結果、Import 設定は `optimizedFrom` に控える。
`revert_asset_optimization` はこの控えから原本へ戻す。圧縮を試して戻せないと
手直しが要る。実行と同じ surface に解除も置いてある。

## script (6)

`list_script_templates`, `get_script_asset`, `create_script_asset`,
`apply_script_template`, `update_script_asset`, `set_play_mode`

Script の実行境界と trust gate は [Scripting の契約](./SCRIPTING.md) にある。

## external-store (3)

`search_external_assets`, `get_external_asset_options`,
`install_external_asset`

`search_external_assets` の Model には Poly Haven の一覧 API が返す `polycount` と
`dimensionsMm` (幅、奥行、高さ、mm) が付く。Poly Haven の写真スキャンは木で数百万、岩でも
数十万三角形のものがある。重さを知らずに install すると公開物が壊れる。入れる前に
読んで、そのワールドに決めた予算と見比べる。上限の数値はここでは決めない。

## debug (11)

`capture_scene_debug`, `capture_scene_view`, `set_scene_view_camera`,
`start_recording`, `stop_recording`, `get_recording_status`,
`set_recording_profile`, `set_recording_viewport`, `get_recording_viewport`,
`set_recording_camera`, `get_recording_camera`

document を書き換えない。現在表示中の Scene View を読む / 向きを変える / 録画するだけだ。
Undo 履歴も選択も動かさない。

- `capture_scene_debug` — fps、frame time、draw call、triangle、可視 Mesh 数、
  Geometry / Texture別のVRAM概算（geometryVramBytes / textureVramBytes）、未算定Texture数（unknownVramTextures）、
  Texture内訳（compressedTextureVramBytes / uncompressedTextureVramBytes、compressedTextureCount / uncompressedTextureCount。未算定は除外）、
  カメラの Far を返す。WebM の録画も start / stop で扱う
- `capture_scene_view` — 描画そのままの PNG を 1 枚、app の
  `debug-captures` へ保存する。パスを返す。**数値と document は「何が映るはず
  か」しか言わない。実際に何が映っているかはフレームだけが示す**
- `set_scene_view_camera` — 俯瞰 (`top`) / 真下から (`bottom`) / 各軸 (`front`
  `back` `left` `right`) / 既定の斜め (`iso`) を選べる。`focusEntityId` で Entity の
  実描画 bounds へ寄る。あるいは `position` と `target` を直接指定する。preset
  だけを渡した場合は今の注視点を保つ。「いまの対象を上から見る」操作になる。
  bounds は F キーと同じ経路で測る。コライダー枠のような編集用の補助表示
  や無効化した子は含めない。同じ Entity を同じ場所から見る操作になる

保存先は指定できない。意図的な制限だ。確認のために撮った画像は一時的な成果物だ。
project ではなく app data へ置く。

**ワールド制作の録画**（詳細は [ワールド制作の録画](./RECORDING.md)）

## 意図的に公開していない操作

「まだ作っていない」ものと「公開しないもの」を分けて示す。

| 操作 | 理由 |
| --- | --- |
| Undo / Redo | 操作は revision で直列化する。Editor の履歴は人の操作単位だ。片方から巻き戻すと、もう片方が何を失ったのか分からなくなる |
| 選択の変更だけ | 各 tool が結果として選択を移す。選択のためだけの tool は履歴も document も変えない。状態だけずらす |
| Scene View の描画品質（高品質 / 軽量 / 描画50% / 描画25%） | 編集中の描き方だけを変える Editor State だ。document にも公開物にも残らない。Play とサムネイル撮影は常に高品質で描く。読み取る見た目も変わらない |
| 拡大・全体表示・パネル幅・タイムラインの範囲と時刻 | 見え方だけの状態だ。document に残らない。ノードの位置は document に残るので `move_interactivity_node` と `layout_interactivity_graph` で扱う |
| Project の保存・公開・アップロード | 外向きの不可逆操作だ。アップロード前に `xrift.json` とサムネイルを確認する導線は残す |
| Login / account 操作 | 認証情報を MCP 境界へ渡さないためだ |
| 録画の保存先の指定 | `recording_begin_file` が開けるのは既定の保存先と、フォルダーダイアログで選んだ場所だけだ。path を直接書けると Rust 側の path 検証を迂回する。保存先を変える場合は録画パネルを使う |
| 公式 Component の position / rotation / scale | `update_component` は XRift Component のこれらの prop を受け取らない。Component 側に持たせると Entity の Transform と別の原点ができ、選択したときのギズモと回転の中心が描かれている場所からずれる。配置は `update_component` の `transform` patch で Entity へ書く |
| 任意 path の読み書き・削除 | Rust 側の path 検証と権限制御を迂回させないためだ |
| 任意 JavaScript の実行 | Script は trust gate 付きの Asset としてだけ入る |
| Texture の一括変換 | 複数選択したものをまとめて書き出すための導線だ。MCP からは `process_texture_asset` を Asset ごとに呼ぶ。対象の選び方は設計図で決まる |
| Textureの共通設定・サイズ確認 | 共通設定は `update_texture_asset` の `importSettings` と `process_texture_asset` で同じ処理を実行する。サイズ確認は既存画像の読み取りだけを行うInspectorの表示状態だ。再インポートで取得した寸法はAssetのimportMetadataにも入る |
| 取り込み時の Texture 最大解像度 | Import メニューに残る Editor State だ。document には入らない。`import_local_texture` と `update_texture_asset` の `importSettings.resize` で同じ結果を Asset ごとに指定する |
| World Play のプレイヤー操作（移動・視点・ジャンプ・掴み・インタラクト） | 実行中のプレイヤー入力だ。document にも公開物にも残らない。視点はマウスのポインターロックが前提だ。MCP から送っても画面のロックは動かない。Scene を見るには `set_scene_view_camera` と `capture_scene_debug` を使う。インタラクトの結果を確かめるなら `set_play_mode` と Interactivity Graph / Script 側の状態を読む |

## 機能を足すときの手順

1. `mcp-tool-registry.ts` の `XRIFT_MCP_TOOLS` へ name と surface を足す
2. surface に応じて `mcp-editor-tools.ts` の handler、または React shell の分岐を書く
3. `src-tauri/src/mcp.rs` の `tool_definitions()` へ JSON schema を足す
4. `pnpm mcp:tool-names` で Rust の allow-list を再生成する
5. `mcp-editor-tools.fixture.ts` へ、成功する呼び出しと拒否される呼び出しを足す
6. `pnpm typecheck`、`pnpm cli:test`、`cargo test --manifest-path src-tauri/Cargo.toml`

Scene document のスキーマを増やしたときは、`serialization.ts` の許可キーと
対応する MCP tool を同時に更新する。片方だけ更新すると、保存した時点で Scene が
読めなくなる。
