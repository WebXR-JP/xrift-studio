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

## document (71)

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
`set_material`, `set_material_texture_transform`, `create_custom_shader`,
`get_custom_shader`, `update_custom_shader`

**Scene / Entity**
`update_scene_settings`, `list_entities`, `get_entity_components`,
`create_empty_entity`, `create_primitive`, `place_asset`,
`place_builtin_prefab`, `create_prefab`, `rename_entity`, `duplicate_entity`,
`reparent_entity`, `delete_entity`, `set_entity_enabled`, `update_transform`

**Component**
`list_component_definitions`, `add_component`, `update_component`,
`remove_component`, `update_script_component`

**Collider**
`inspect_colliders`, `optimize_colliders`

**Terrain**
`get_terrain`, `create_terrain`, `sculpt_terrain`, `update_terrain`

**Terrain の草**
`list_terrain_grass_types`, `apply_terrain_grass_preset`,
`add_terrain_grass_layer`, `update_terrain_grass_layer`,
`delete_terrain_grass_layer`, `paint_terrain_grass`
（詳細は [Terrain エディター 仕様](./TERRAIN_EDITOR_SPEC.md) の「MCP から草を扱う」）

**Interactivity graph / Interaction Trigger**
`list_interactivity_operations`, `get_interactivity_asset`,
`create_interactivity_asset`, `add_interactivity_node`,
`connect_interactivity_nodes`, `set_interactivity_value`,
`set_interactivity_configuration`, `configure_interactivity_material_pointer`,
`disconnect_interactivity_socket`, `delete_interactivity_node`,
`validate_interactivity_asset`, `list_interaction_trigger_targets`
（詳細は [KHR_interactivity Editor / MCP design](./KHR_INTERACTIVITY_EDITOR.md)）

**Component コードの取り込み**
`analyze_component_code`, `apply_component_code_import_plan`

## local-asset (10)

`import_audio_asset`, `import_texture_asset`, `import_model_asset`,
`import_skybox_asset`, `import_shader_asset`, `reimport_model_asset`,
`process_texture_asset`, `get_shader_asset`, `update_shader_asset`,
`set_project_thumbnail`

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

## debug (1)

`capture_scene_debug`

## 意図的に公開していない操作

「まだ作っていない」ものと「公開しない」ものを混ぜないための一覧。

| 操作 | 理由 |
| --- | --- |
| Undo / Redo | AI の操作は revision で直列化されており、Editor の履歴は人の操作単位。片方から巻き戻すと、もう片方が何を失ったのか読めなくなる |
| 選択の変更だけ | 各 tool が結果として選択を移す。選択のためだけの tool は履歴も document も変えず、状態だけずらす |
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
