# MCP editor tool の全体像

XRift Studio は、開いている Editor をそのまま AI client へ開放する MCP server を
同梱している。この文書は「どの Editor 操作が MCP から動くのか」を一覧で答える
ためのもので、機能を足したときに MCP を忘れていないかを確認する場所でもある。

一次情報は `src/lib/visual-editor/mcp-tool-registry.ts` の `XRIFT_MCP_TOOLS`
表。Rust の allow-list (`src-tauri/src/mcp_tool_names.rs`) はそこから生成し、
`pnpm mcp:tool-names --check` と Rust の
`tool_list_matches_the_generated_allow_list` テストが、表・生成物・JSON schema の
3つが同じ集合であることを保証する。この文書だけが古くなることはあり得るので、
名前が食い違ったら表の方が正しい。

## surface

tool は「誰が実行するか」で5つに分かれる。分類は権限の境界そのもので、
document 以外は React shell か Tauri 側が持つ副作用を伴う。

| surface | 実行する場所 | 性質 |
| --- | --- | --- |
| `document` | `mcp-editor-tools.ts` | document set への純粋な関数。副作用なし |
| `local-asset` | React shell | ネイティブ file I/O を伴う |
| `script` | React shell | project file I/O または Play mode の変更を伴う |
| `external-store` | React shell | ネットワークと Import Queue を使う |
| `debug` | React shell | document ではなく生きた viewport を読む |

書き込み tool は `projectId`、`sceneId`、`expectedRevision` を要求する。古い
snapshot への適用を弾くためで、複数 client が同時に触っても編集は直列化される。

## document (89)

**Editor context / Project**
`get_editor_context`, `get_scripting_capabilities`, `update_project_metadata`

**Assets 一覧と整理**
`list_assets`, `create_asset_folder`, `rename_asset`, `rename_asset_folder`,
`move_asset`, `move_asset_folder`, `delete_asset`, `delete_asset_folder`,
`create_document_asset`

**Asset の設定**
`get_audio_asset`, `get_model_asset`, `update_model_asset`,
`get_texture_asset`, `update_texture_asset`, `get_particle_asset`,
`update_particle_asset`, `get_material_asset`, `update_material_asset`,
`set_material`, `set_material_texture_transform`, `list_material_presets`,
`create_material_from_preset`, `create_texture_card`, `create_custom_shader`,
`get_custom_shader`, `update_custom_shader`

`create_custom_shader` は任意の GLSL を受けるので、「空っぽく見せる」には
向かない道具。ゼロから書く caller はカタログが持っている数値を発明することに
なる。`list_material_presets` は空・水・グローのカタログを、名前付きの
パラメーターと範囲と既定値ごと返す。`create_material_from_preset` は Material
を作って `nextStep` を返す。空は Scene settings の skybox が指して初めて空に
なり、水は板ポリへ割り当てて初めて水面になるので、作っただけでは終わらない。
Terrain の地面は形と一緒に選ぶものなので `list_terrain_presets` の方にある。

`create_texture_card` は透過 Texture から遠景板・草カードを作る。手で組むと
板ポリ、アルファブレンドの両面 Material、コライダー無し、円弧なら継ぎ目の
出ないセグメントの扇と、設定を互いに合わせた 4〜5 回の呼び出しになる。
Material と Entity を一件にまとめるので、Undo でカードだけ消えて Material が
残ることもない。

**Scene / Entity**
`update_scene_settings`, `list_entities`, `get_entity_components`,
`get_entity_bounds`, `create_empty_entity`, `create_primitive`, `place_asset`,
`list_scene_recipes`, `place_builtin_prefab`, `create_prefab`, `rename_entity`,
`duplicate_entity`, `reparent_entity`, `delete_entity`, `set_entity_enabled`,
`update_transform`

`list_scene_recipes` は焚き火・松明・木・岩・雪・噴水・柱・階段・井戸・ベンチ・
収録スタジオなどの出来合いの 3D セットを返す（配置は local-asset の
`apply_scene_recipe`）。各セットは光・パーティクル・マテリアルが互いに
噛み合った subtree で、同じものを primitive から組むと十数回の呼び出しで
明らかに見劣りする。`note` は配置後に作者がまだやることなので、落とさず
そのまま返す。

`get_entity_bounds` は Transform ではなく**大きさ**を返す。`world` は既定で
配下を含めた axis-aligned box、`local` は自身の Mesh の素の extent。回転して
いる子は 8 隅を変換して含める箱にするので、重なり判定が安全側になる。extent
を解決できない Mesh（metadata が無い時代の Model など）は union から黙って
外さず `unmeasuredEntityIds` に出す。「小さい」と「不明」は違う。

**Component**
`list_component_definitions`, `add_component`, `update_component`,
`remove_component`, `update_script_component`

**Collider**
`inspect_colliders`, `optimize_colliders`

**Terrain**
`get_terrain`, `sample_terrain_point`, `list_terrain_presets`,
`create_terrain`, `create_terrain_from_preset`, `sculpt_terrain`,
`update_terrain`, `apply_terrain_surface`

`create_terrain` が作るのは平らな板で、primitive としては正しいが出発点として
は間違っている。Create メニューは形の preset を 8 種と表面カタログを出していて、
primitive しか無い caller は谷をブラシで一打ずつ彫ることになる。
`create_terrain_from_preset` は彫って草まで載った状態で置く。`position` を
省くと既存の Terrain の隣へ逃がす。同じ地面に 2 枚重なるとモアレになるため。
重なりは阻止せず `overlappingTerrainCount` で報告する。意図的に隣接させたい
場合があるが、モアレで気付かせてはいけない。

`apply_terrain_surface` は高さと傾斜でマテリアルを混ぜる表面 preset を貼る。
preset の高さ帯は絶対値のメートルなので、既定ではその Terrain の標高範囲へ
合わせ直す。合わせずに貼ると全部の境界が範囲外に出て一色になり、「シェーダー
が壊れている」ように見える。貼った結果は通常の Material なので、あとから
Material の tool で調整できる。

`sample_terrain_point` は Terrain-local の XZ から、補間した高さ、同じ点の
world 座標、傾斜、穴、草の層ごとの被覆を返す。document は高さを平坦な配列で
持っていて caller は引けないので、これが無いと彫った地形の上へ y=0 で置いて
しまう。

**Terrain の草**
`list_terrain_grass_types`, `apply_terrain_grass_preset`,
`add_terrain_grass_layer`, `update_terrain_grass_layer`,
`delete_terrain_grass_layer`, `paint_terrain_grass`
（詳細は [Terrain エディター 仕様](./TERRAIN_EDITOR_SPEC.md) の「MCP から草を扱う」）

**Interactivity graph / Interaction Trigger**
`list_interactivity_operations`,
`list_interaction_trigger_targets`, `get_interactivity_asset`,
`validate_interactivity_asset`, `simulate_interactivity_asset`,
`create_interactivity_asset`, `update_interactivity_asset`,
`add_interactivity_graph`, `update_interactivity_graph`,
`delete_interactivity_graph`, `add_interactivity_node`,
`duplicate_interactivity_node`, `delete_interactivity_node`,
`connect_interactivity_nodes`, `disconnect_interactivity_socket`,
`set_interactivity_value`, `set_interactivity_configuration`,
`configure_interactivity_material_pointer`,
`configure_interactivity_trigger_action`,
`move_interactivity_node`, `layout_interactivity_graph`
（詳細は [KHR_interactivity Editor / MCP design](./KHR_INTERACTIVITY_EDITOR.md)）

ノードエディターで人ができる操作は、Undo / Redo、選択、canvas の見え方（拡大、
全体表示、パネル幅）、タイムラインの範囲と時刻のつまみを除いて、すべてこの表に
ある。除いた 4 つは document を変えない。

`duplicate_interactivity_node` は `targetGraphIndex` を受け、Editor の
Ctrl+C / Ctrl+V と同じく別のグラフへも置ける。同じグラフの中なら node はその
まま写せるが、別のグラフでは `declaration` の index も inline value の `type`
の index も別のものを指すので、名前で持ち出して着地先で引き直す。

`configure_interactivity_trigger_action` は `set_interactivity_configuration`
と `set_interactivity_value` で手書きできる 4 つの key を、Entity・Component・
プロパティの実在と値の型ごと引き受ける。対象を間違えたグラフは保存でき、Play で
何も起きない。Editor のピッカーが防いでいるのはこの失敗で、MCP から書くときだけ
素通りするわけにはいかない。かける時間とイージングも同じ呼び出しにある。中間の
値を持たないプロパティへ時間を指定すると拒否する。runtime が作れない滑らかさを
グラフが約束しないため。

`simulate_interactivity_asset` はレンダラー無しでグラフを進め、いつ何が起きるか
を返す。Editor のタイムラインと同じ実行で、JSON を読んでも「その待機が意図した
時刻に届くか」「その繰り返しが終わるか」「どの枝が一度も動かないか」は分からない。
書き込みはしないので revision も要らない。

`move_interactivity_node` と `layout_interactivity_graph` があるのは、AI が組んだ
グラフを人が開くから。位置を書けないと、全部のカードが同じ場所に積まれた状態で
渡ることになり、作者の最初の操作が「整列」を押すことになる。

**Component コードの取り込み**
`analyze_component_code`, `apply_component_code_import_plan`

## local-asset (11)

`import_audio_asset`, `import_texture_asset`, `import_model_asset`,
`import_skybox_asset`, `import_shader_asset`, `reimport_model_asset`,
`process_texture_asset`, `apply_scene_recipe`, `get_shader_asset`,
`update_shader_asset`, `set_project_thumbnail`

`apply_scene_recipe` が document ではなく shell にあるのは、セットの部品の
Model を project へ書き出すため。Particle Asset と subtree は一件の history
にまとめる。セットを Undo したときに Asset だけ残らないようにするため。

`update_texture_asset` が書けるのは import 設定 (`maxSize`、`format`、
`quality`) だけで、原本の画像はそのまま残る。実際に解像度を変えて再エンコード
するのは `process_texture_asset`。設定だけ書いて「圧縮した」と報告すると、
Editor 上では「未反映」と表示されている状態と食い違うため、変換の実行を別の
tool にしてある。既に設定が反映済みなら `changed: false` と理由を返し、原本を
書き直さない。

## script (6)

`list_script_templates`, `get_script_asset`, `create_script_asset`,
`apply_script_template`, `update_script_asset`, `set_play_mode`

Script の実行境界と trust gate は [Scripting の契約](./SCRIPTING.md) にある。

## external-store (3)

`search_external_assets`, `get_external_asset_options`,
`install_external_asset`

## debug (3)

`capture_scene_debug`, `capture_scene_view`, `set_scene_view_camera`

document を書き換えず、生きた Scene View を読む / 向きを変えるだけの 3 つ。
Undo 履歴も選択も動かさない。

- `capture_scene_debug` — fps、frame time、draw call、triangle、可視 Mesh 数、
  カメラの Far。WebM の録画も start / stop で扱う
- `capture_scene_view` — 描画そのままの PNG を 1 枚、app の
  `debug-captures` へ保存してパスを返す。**数値と document は「何が映るはず
  か」しか言わない。実際に何が映っているかを言うのはフレームだけ**
- `set_scene_view_camera` — 俯瞰 (`top`) / 真下から (`bottom`) / 各軸 (`front`
  `back` `left` `right`) / 既定の斜め (`iso`)、`focusEntityId` で Entity の
  実描画 bounds へ寄る、あるいは `position` と `target` の直接指定。preset
  だけを渡した場合は今の注視点を保つので、「いまの対象を上から見る」になる。
  bounds は F キーと同じ経路で測るので、コライダー枠のような編集用の補助表示
  や無効化した子は含めない。agent と人が同じ Entity を同じ場所から見る

保存先を caller が選べないのは意図的。確認のために撮った画像は一時的な成果物
なので、project ではなく app data へ置く。

## 意図的に公開していない操作

「まだ作っていない」ものと「公開しない」ものを混ぜないための一覧。

| 操作 | 理由 |
| --- | --- |
| Undo / Redo | AI の操作は revision で直列化されており、Editor の履歴は人の操作単位。片方から巻き戻すと、もう片方が何を失ったのか読めなくなる |
| 選択の変更だけ | 各 tool が結果として選択を移す。選択のためだけの tool は履歴も document も変えず、状態だけずらす |
| 拡大・全体表示・パネル幅・タイムラインの範囲と時刻 | 見え方だけの状態で document に残らない。ノードの位置は document に残るので `move_interactivity_node` と `layout_interactivity_graph` にある |
| Project の保存・公開・アップロード | 外向きの不可逆操作。アップロード前の `xrift.json` とサムネイルの確認は人が通る導線に残す |
| Login / account 操作 | 認証情報を MCP 境界へ渡さない |
| 任意 path の読み書き・削除 | Rust 側の path 検証と権限制御を迂回させない |
| 任意 JavaScript の実行 | Script は trust gate 付きの Asset としてだけ入る |

## 機能を足すときの手順

1. `mcp-tool-registry.ts` の `XRIFT_MCP_TOOLS` へ name と surface を足す
2. surface に応じて `mcp-editor-tools.ts` の handler、または React shell の分岐を書く
3. `src-tauri/src/mcp.rs` の `tool_definitions()` へ JSON schema を足す
4. `pnpm mcp:tool-names` で Rust の allow-list を再生成する
5. `mcp-editor-tools.fixture.ts` へ、成功する呼び出しと弾かれる呼び出しを足す
6. `pnpm typecheck`、`pnpm cli:test`、`cargo test --manifest-path src-tauri/Cargo.toml`

Scene document のスキーマを増やしたときは、`serialization.ts` の許可キーと
対応する MCP tool を同時に更新する。片方だけだと、保存した時点で Scene が
読めなくなる。
