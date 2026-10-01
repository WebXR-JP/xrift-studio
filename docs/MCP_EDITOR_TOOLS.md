# MCP editor tool の全体像

マテリアルのPBR値は`update_material_asset`の`patch.pbrMetallicRoughness`で変更する。`baseColorFactor`は0〜1のRGBA配列、`metallicFactor`と`roughnessFactor`は0〜1の数値。簡易指定には`patch.color`（#rrggbb）、`opacity`、`metalness`、`roughness`も使える。描画方式は`patch.blending`、深度書き込みは`patch.depthWrite`、アルファトゥカバレッジは`patch.alphaToCoverage`で変更する。Classic R3Fシェーダーのuniformは`get_custom_shader`で現在値を読み、`update_custom_shader`の`patch.uniforms`で更新する。マテリアルの頂点カラーと不透明度マップも`update_material_asset`で設定する。`patch.vertexColors`はboolean、`patch.opacityTexture`は既存テクスチャのIDまたはTextureInfo（nullで解除）、`patch.opacityChannel`は`r`・`g`・`b`・`a`（既定は`a`）。透過には`alphaMode: "BLEND"`または`"MASK"`を併せて指定し、裏面も表示するなら`doubleSided: true`にする。更新後は`get_material_asset`で保存値を読み、割当先モデルで色と透過を確認する。Unityの独自シェーダーをそのまま実行する設定ではない。

テクスチャ枠にはTexture Asset IDか`{ "textureAssetId": "...", "texCoord": 0, "transform": { "offset": [0, 0], "rotation": 0, "scale": [1, 1] } }`を渡す。`null`で割当を解除する。Normal Mapの`scale`、Occlusion Mapの`strength`も同じオブジェクトで指定する。`patch.extensions`には対応する`KHR_materials_*`名をキーにし、拡張ごとの係数・色・テクスチャを部分更新する。拡張自体を削除するときはそのキーへ`null`を渡す。VolumeにはTransmission、DispersionにはVolumeを併せて設定する。`KHR_materials_unlit`は空オブジェクトで有効化する。

MToon 1.0は`update_material_asset`の`patch.extensions.VRMC_materials_mtoon`へオブジェクトを渡して有効化する。`specVersion`は`"1.0"`。明るい部分の色は`pbrMetallicRoughness.baseColorFactor`、影の色は`shadeColorFactor`（0〜1のRGB配列）、影の境界は`shadingShiftFactor`、境界の硬さは`shadingToonyFactor`（0〜1）で設定する。アウトラインは`outlineWidthMode: "worldCoordinates"`と`outlineWidthFactor`（m）、または`"screenCoordinates"`と画面の高さに対する割合で指定し、`outlineColorFactor`で色を変える。`outlineWidthMode: "none"`で線だけを消し、拡張へ`null`を渡すと保存済みの標準マテリアル設定に戻る。`shadeMultiplyTexture`と`outlineWidthMultiplyTexture`には通常のTextureInfoを使う。MToonとUnlitの両方がある場合はMToonを優先する。更新後は`get_material_asset`で値を読み、割当先モデルで影と線を確認する。

VRM 0.x / 1.0のアバターは通常のモデルと同じ取り込み操作で`.vrm`を指定する。VRM 0.xの`VRM/MToon`と`VRM/Unlit*`はthree-vrmの公式変換を通して、編集できるMToon 1.0のMaterial Assetへ展開する。元のVRMファイルを保存したまま、色のlinear変換、影の境界、アウトライン幅、UV変換、透過順序を引き継ぐ。MatCap、Rim、UV Animationの係数とテクスチャも保存し、アウトラインの色を部分更新しても保持する。これらの設定は`matcapFactor` / `matcapTexture`、`parametricRimColorFactor` / `rimMultiplyTexture`、`uvAnimationMaskTexture` / `uvAnimationScrollXSpeedFactor` / `uvAnimationScrollYSpeedFactor` / `uvAnimationRotationSpeedFactor`で更新できる。`shadingShiftTexture`はTextureInfoに有限の`scale`を追加する。`renderQueueOffsetNumber`は−9〜9の整数。`extras.xriftVrm0CompatShade`は旧版の描画互換を保つ取り込み情報なので、通常の色・線の編集では変更しない。BlenderやUnityの任意の独自Toonシェーダーはこの変換の対象に含まれない。

XRift Studioには、開いているEditorをAIクライアントから操作するMCP serverを同梱している。この文書では、MCPから使えるEditor操作を一覧にしている。機能の追加時は、MCPへの対応漏れがないか確認する。

ツール名の定義は`src/lib/visual-editor/mcp-tool-registry.ts`の`XRIFT_MCP_TOOLS`にある。Rustのallow-list（`src-tauri/src/mcp_tool_names.rs`）もこの表から生成する。`pnpm mcp:tool-names --check`とRustの`tool_list_matches_the_generated_allow_list`テストで、表・生成物・JSON schemaのツール一覧が一致することを確認する。文書と定義の名前が異なる場合は、定義を優先する。

## CLI から操作する

Studioに同梱する`xrift-studio-mcp-sidecar`は、MCPサーバーとCLIを兼ねる。WindowsではStudioのインストール先にある`xrift-studio-mcp-sidecar.exe`を指定する。PATHへの登録は不要で、フルパスでも呼び出せる。macOSではアプリ内の`Contents/MacOS`、Linuxでは配布形式に応じた同梱先を使う。

```powershell
# Studio のインストール先で実行する例
.\xrift-studio-mcp-sidecar.exe tools
.\xrift-studio-mcp-sidecar.exe describe capture_scene_view
.\xrift-studio-mcp-sidecar.exe call get_editor_context
.\xrift-studio-mcp-sidecar.exe call capture_scene_view --args-file .\capture.json --output-dir .\Recording
```

`tools`は全ツールの説明とJSON Schema、`describe`は指定したツールの定義を返す。両方ともオフラインで使える。`call`は起動中のStudioを操作する。MCPと同じツール名・引数を使い、revision、スクリプトの変換、保存先などの扱いも同じになる。プロジェクトが開いていなくてもStudioが起動していれば呼べる。`list_projects`で状態を確認し、`create_project`または`open_project`でEditorを開いてから、編集対象の`projectId`と`sceneId`を`get_editor_context`で取得する。

ワールドの作成から公開までをCLIだけで通す例を示す。

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

`publish_project`は`get_publish_readiness`と同じ確認を先に行い、足りない項目があれば`PUBLISH_NOT_READY`で`requirements`と`nextActions`を返す。公開は数分かかることがあり、その間の他の呼び出しは`EDITOR_BUSY`になる。

引数はUTF-8のJSONオブジェクトで渡す。`--args-file <path>`、`--args <JSON>`、`--stdin`のうち一つを選ぶ。省略すると`{}`。PowerShellでは引用符の解釈を避けるため`--args-file`を推奨する。接続先は自動検出するが、`--rendezvous <path>`、環境変数`XRIFT_STUDIO_MCP_RENDEZVOUS`の順で上書きできる。接続ファイルには認証情報が含まれるため、共有しない。

結果は標準出力にJSONで返る。`call`の`ok`、`result`、`error`はStudioの応答で、完成条件の未達などは`result`内の`completionAccepted`や`nextActions`まで確認する。`--output-dir`を指定すると、撮影と制作状態取得の画像を指定フォルダーへPNGとして保存し、画像の`data`を絶対パスの`path`に置き換える。毎回別名で保存し、既存ファイルを上書きしない。省略時はbase64の画像データを保持する。動画の保存先はこのオプションでは変わらず、制作中のワールドの`Recording/`になる。

終了コードは成功`0`、Studioによる拒否`1`、引数の誤り`2`、接続失敗`3`、画像の書き出し失敗`4`。`4`では操作自体は成功している場合がある。応答と`exportError`を確認し、編集をそのまま再送しない。

このCLIはStudioの描画環境を利用する。画面を起動しない完全なヘッドレス実行には対応しない。ビジュアル編集からコード編集へ変換する既存の`xrift-studio convert`は別のCLIで、詳細は [変換CLI](./VISUAL_PROJECT_MIGRATION_CLI.md) を参照する。サブコマンドなしの起動は従来のMCP stdio接続を維持する。

開発時は`pnpm mcp:sidecar:prepare`後、`src-tauri/target-mcp-sidecar/debug/xrift-studio-mcp.exe`（Windows）から同じコマンドを試せる。

## surface

ワールド制作の開始・再開には`begin_world_authoring` / `get_world_authoring`、画像判定の記録には`review_world_authoring`、完成条件の確認には`complete_world_authoring`を使う。Studioに内蔵されており、利用者側のソースコードや追加ランナーは不要。`capture_scene_view`は保存パスに加えてMCPの画像を直接返す。制作状態の保存と鮮度の判定は [ワールド制作ハーネス](./WORLD_AUTHORING_HARNESS.md) を参照する。

制作状態と`list_component_definitions`は、ワールドの場合に`worldComponents`も返す。用途別の公式設備、配置と検証の手順、公式フィールド、プレハブの編集可能項目、現在の設備一覧を確認できる。交流・共同作業・発表では画面共有を最初に検討し、採用・省略の理由と利用場所を設計図に残す。鏡はアバター確認、タグ選択はイベントのタグ選択に合わせて選ぶ。`place_builtin_prefab`は`componentId`と該当する`placementGuidance`を返す。位置・向き・大きさを調整し、客席や操作位置から撮影してから、対応環境で動作を確認する。設備の存在だけで共有・同期が動いたとは判断しない。

toolは実行する場所と副作用に応じて、6つのsurfaceに分類する。この分類を権限の境界として使う。document以外の操作には、React shellかTauri側での副作用がある。

| surface | 実行する場所 | 性質 |
| --- | --- | --- |
| `project` | `App.tsx` | プロジェクトの作成・開く・閉じる、公開、アカウント確認。Editorの外で動くので、プロジェクトが開いていなくても呼べる |
| `document` | `mcp-editor-tools.ts` | document setへの純粋な関数。副作用なし |
| `local-asset` | React shell | ネイティブfile I/Oを伴う |
| `script` | React shell | project file I/Oまたは動作確認modeの変更を伴う |
| `external-store` | React shell | ネットワークと取り込みQueueを使う |
| `debug` | React shell | viewportの取得、撮影、制作確認状態の保存。SceneDocumentは変更しない |

書き込みtoolは`projectId`、`sceneId`、`expectedRevision`を要求する。古い
snapshotへの適用を防ぐためだ。複数clientが同時に触っても編集は直列化される。

MCPの要求は常にshell (`App.tsx`) が受け取る。`project` toolはshellが処理し、それ以外は開いているEditorが処理する。Editorが無いあいだはshellが`EDITOR_UNAVAILABLE`を返し、`list_projects`、`open_project`、`create_project`を案内する。EditorはMCPのlistenerを登録した時点でshellへbridge（最新bundle、保存、退出）を登録し、shellはこのbridgeを通じて公開と閉じる操作を行う。

## instructions と description の役割

利用者のプロジェクトに接続したAIクライアントは、serverの`instructions`とtoolのdescriptionを読む。このリポジトリのスキルや文書は届かないため、制作手順は`instructions`の先頭に書く。各toolのdescriptionには、機能、選ぶ基準、実行後の確認、失敗しやすい条件を記す。採用するかは設計図の内容で決め、descriptionに一律の禁止は書かない。

地形と草には14本、床には1本のtoolがある。説明がなければ、AIがtoolの多い機能を優先するおそれがあるため、用途に応じた選び方を伝える。設計判断と経緯は[ワールド制作ハーネス](./WORLD_AUTHORING_HARNESS.md)を参照する。

document toolの戻り値には`harness`が付くことがある。同じ種類（地形、草、同じオブジェクトの
位置・回転・大きさ、同じマテリアル）の書き込みを`capture_scene_view`を挟まずに3回続けると付く警告だ。
書き込み自体は拒否しない。数え方はEditorのメモリだけを使う。projectには残らない。

## project (12)

**Library / セッション**
`list_projects`, `list_starter_templates`, `create_project`, `open_project`,
`close_project`

`create_project`はスターターからプロジェクトを作ってEditorで開き、`open_project`はLibraryのビジュアル編集プロジェクトを開く。どちらも開いているプロジェクトを保存して閉じてから切り替える。コード編集プロジェクトは`PROJECT_NOT_EDITABLE`で断る。

**複製と受け渡し**
`duplicate_project`, `export_project`, `import_project`

`duplicate_project`はLibraryのプロジェクトを同じ保存先へ別名でコピーする。`export_project`は一つの`.xriftstudio`ファイルに書き出し、`import_project`はそのファイル、従来の`.zip`、またはGitリポジトリをLibraryへ展開する。三つともコード編集プロジェクトも対象にするが、結果をEditorでは開かない。開くには返ってきたpathで`open_project`を呼ぶ。複製と取り込みは`projectId`を新しくし、`lastPublication`と`.xrift/*.json`の公開記録を落とすので、公開しても元のワールドを上書きしない。

パッケージには`node_modules`、`.git`、`dist`、キャッシュを含めない。同名のフォルダーは`PROJECT_EXISTS`で断り、上書きも統合もしない。`export_project`は保存先を受け取らず、Libraryの`.cache/exports`に書いた`.xriftstudio`のpathを返す。任意のpathへ書けるとLibraryの外のファイルを上書きできてしまうからだ。

`import_project`は`archivePath`（`.xriftstudio` / `.zip`）か`repositoryUrl`（GitのHTTPS / SSH URL、shallow cloneして履歴は持ち込まない）のどちらか一つを受け取る。`archivePath`は読むだけで、内部のZIPの直下または一つのフォルダーの中にプロジェクトの定義がないと`inspect`の段階で断る。ZIPの構成とpackage manifestは従来どおりで、拡張子の変更によるdocumentの変換は行わない。詳細は[プロジェクトの受け渡し形式](./PROJECT_PACKAGE.md)を参照する。

**アカウント**
`get_account`, `login`

`login`はStudioの中で`xrift login`を始める。ブラウザでの認証は人が完了し、認証情報はStudioの実行環境homeに残る。MCPへは「ログインしているか」と表示名だけを返す。

**公開**
`get_publish_readiness`, `publish_project`

`get_publish_readiness`は保存してから、公開情報（スターターのタイトル・説明のままでないこと）、サムネイル、ログイン、compilerのblocking diagnosticsを確認し、足りない項目ごとに直すtoolを`nextActions`に返す。`publish_project`は同じ確認を通ったときだけ、公開ダイアログと同じ`publishVisualProject`パイプライン（保存・変換・`xrift check --build`・アップロード）を実行し、結果をprojectの`lastPublication`に保存する。人が公開を依頼した場合にだけ呼ぶ。

## document (96)

**Editor context / Project**
`get_editor_context`, `get_project_health`, `analyze_performance`, `get_scripting_capabilities`, `update_project_metadata`

`get_project_health`は既存のProject / Scene / Asset検証を実行し、件数とほぼ0のScaleを報告する。`scope: document`の`ready`はファイルの存在、Playの動作、公開可能な状態を保証しない。指摘を修正したら再診断し、既存のPlay・Compile・公開前チェックへ進む。

`analyze_performance`は編集データのEntity / Light / Rigid Body / Texture / Model件数を目安と比較する。無効な要素・未使用素材も含み、Prefab内部やScriptによる実行時生成は展開しない。80%超は`warning`、100%超は`over-budget`。FPS・メモリー・三角形数の測定ではなく、公開を止める条件には使わない。両ツールともdocument surfaceの読み取りで、Scene・revision・保存状態を変更しない。

**素材一覧と整理**
`list_assets`, `create_asset_folder`, `rename_asset`, `rename_asset_folder`,
`move_asset`, `move_asset_folder`, `detach_asset_references`, `delete_asset`,
`delete_asset_folder`, `create_document_asset`

`delete_asset`は参照されている素材を拒否する。詳細には参照元を返す。その拒否は
`detach_asset_references`で解消する。Editorの削除ダイアログ
が出す「参照を外す」と同じ操作だ。マテリアル枠のような差し替え可能な参照は
空になる。形状・パーティクルemitter・プレハブinstanceのように参照なしでは成立
しないコンポーネントは外れる。オブジェクトは残る。`ownerId`を渡すと1件だけ外せる。
`delete_asset`の`detachReferences`は、外してから削除するまでを1回で行う。

**素材の設定**
`get_audio_asset`, `get_model_asset`, `update_model_asset`,
`get_texture_asset`, `update_texture_asset`, `get_particle_asset`,
`update_particle_asset`, `get_material_asset`, `update_material_asset`, `update_material_assets`,
`set_material`, `set_material_texture_transform`, `list_material_presets`,
`create_material_from_preset`, `create_custom_shader`,
`get_custom_shader`, `update_custom_shader`

`update_material_asset`の`patch.shadingModel`は`standard`、`mtoon-0.x`、`mtoon-1.0`を受け付ける。各素材の色・Texture・UVを引き継いで種類を変え、Standardへ戻すとMToon専用設定を控えに保存する。再びMToonを選ぶとその設定を復元する。0.xは旧版の陰影互換モードであり、保存する`VRMC_materials_mtoon.specVersion`はどちらも`"1.0"`になる。既存の`patch.extensions.VRMC_materials_mtoon`による輪郭・陰影の編集も使える。単体編集は従来どおりEditとPlayで実行できる。

複数素材はEdit中に`update_material_assets`へ`assetIds`を渡す。`patch`と`fieldUpdates`のどちらか一方を指定し、全変更を一回のrevision・Undo・自動保存として確定する。Custom Shader Materialとマテリアル以外のAssetは変更せず、`skippedAssets`が理由を返す。未知のIDは変更前に`ASSET_NOT_FOUND`で拒否する。通常設定は対象Materialの種類が同じ場合に変更できる。種類が混在する場合は`patch: { "shadingModel": "mtoon-0.x" }`などで先にそろえ、最新contextを取得してから設定を変える。混在種類に種類と通常設定を同時指定すると`MATERIAL_SHADING_MISMATCH`になる。

`fieldUpdates`は`[{ "path": "extensions.VRMC_materials_mtoon.shadeColorFactor.0", "value": 0.5 }]`のように、`properties`接頭辞のない保存値のパスを指定する。`.0`などの成分だけを変えると、各素材の他のRGB・Alpha・UV成分を保つ。Texture参照の`.textureAssetId`だけを変える場合も各UVを保つ。例として`pbrMetallicRoughness.baseColorTexture.transform.offset.0`はUVのXだけを変える。未割当のMapへのUV・Scale操作はその素材だけを変更しない。新しいTexture参照が存在しないかTexture以外なら`INVALID_TEXTURE_REFERENCE`で全体を拒否する。`extensions.KHR_materials_clearcoat.enabled`などのBoolean操作はInspectorと同じ依存関係を扱う。

未知のパス、Shader・メタデータのパス、不正な値は`INVALID_ARGUMENT`で全変更前に拒否する。`updatedMaterialAssetIds`は実際に変えた素材だけを返し、すべて同じ値ならrevisionを増やさない。更新後は`get_material_asset`で保存値を読み、割り当てたMeshを`capture_scene_view`で確認する。一括編集はPlay中に`EDITOR_READ_ONLY`となる。Play中の単体編集には`update_material_asset`を使う。

`create_custom_shader`は任意のGLSLを受ける。「空っぽく見せる」用途には使わず、カタログから選ぶ。
ゼロから書くとカタログが持つ数値を自分で決めることに
なる。`list_material_presets`は空・水・グロー・glTF拡張のカタログを返す。名前付きの
パラメーターと範囲と既定値を含む。`create_material_from_preset`はマテリアル
を作る。`nextStep`を返す。空はシーンsettingsのskyboxが指して初めて空に
なる。水は板ポリへ割り当てて初めて水面になる。作っただけでは終わらない。
空の背景の各項目は`qualityOptions`に軽量・標準・高精細のvariantsと説明を返す。
作成後の`update_custom_shader`へ`patch.variants`として渡すとUniformを保って品質を変えられる。
独自variantがある場合は`get_custom_shader`で取得し、品質用definesだけを統合する。
ストアの見回し・再生停止は一時的なプレビュー操作なのでMCPには追加しない。
地形の地面は形と一緒に選ぶ。`list_terrain_presets`の方にある。

`kind: "gltf"`はglTF拡張とPBRテクスチャのマテリアルを返す。50種類の見本セットに加え、互換性のために旧カタログの素材IDを保持している。Clearcoat、Transmission、Volume、Dispersion、Iridescence、Sheen、Anisotropy、Emissive、Specular、IOR、Unlitと、Normal Map・ORM・UV・Alphaの比較を含む。

`comparisonMaterialAssetId`は比較用のマテリアルを指す。拡張を比較する見本は基本のPBR値を揃え、テクスチャを比較する見本は比較対象のマップやUV設定だけを変える。`textureAssetIds`は必要な同梱テクスチャを返す。効果を見比べるときは`list_scene_recipes`の`shelf: "materials"`から選び、`apply_scene_recipe`で見本一式を置く。既存のモデルへ質感だけを付けるときは`create_material_from_preset`を使う。テクスチャが必要なプリセットは、保存済みのプロジェクトへ画像も取り込んでからMaterialを作成する。`parameters`は受け付けず、調整には通常のMaterial更新を使う。

`list_scene_recipes`は`group`、`tags`、`comparisonLabels`も返す。`shelf: "materials"`は50種類、ワールド用の`shelf: "gimmicks"`は50種類の見本にカスタム車を加えて返す。ギミックの操作確認はSceneへ追加してPlayで行う。カタログ内の回転・拡大・絞り込みは表示だけの操作なので、新しいMCP toolは追加しない。全項目と確認範囲は [カタログ拡充](./catalog-expansion/README.ja.md) に記載する。

写真・ポスター・展示画のように「画像そのものを貼る」ときはカードではなく
画像コンポーネントを使う。`place_asset`へ画像のテクスチャを渡すと、幅1 mで
画像の縦横比どおりの画像オブジェクトができる。マテリアルは作らない。既存の
オブジェクトへ付けるなら`add_component`の`core.image`に`textureAssetId`を渡す。
大きさ、基準点、色味、不透明度、透明部分の扱い、両面、ライトの影響は
`update_component`で変える。`height: null`は画像の縦横比へ戻す指示で、
`textureAssetId: ""`は画像を外す指示だ。環境テクスチャ（HDRI）は画像に貼れず、
空の背景へ使う。ノードグラフからは表示・色味・不透明度だけを変えられる。
画像の差し替えを対象にしない理由は`docs/KHR_INTERACTIVITY_EDITOR.md`にある。

**Scene / Entity**
`update_scene_settings`, `list_entities`, `get_entity_components`,
`get_entity_bounds`, `create_empty_entity`, `create_primitive`, `place_asset`,
`list_scene_recipes`, `place_builtin_prefab`, `create_prefab`, `rename_entity`,
`duplicate_entity`, `reparent_entity`, `delete_entity`, `set_entity_enabled`,
`update_transform`

`update_scene_settings`の`postprocessing`は、合成全体の有効・無効を書ける。
`ao` / `bloom` / `grading`それぞれの有効・無効と値、`order`（適用順）も書ける。
同じ値でも順番で仕上がりが変わる。順番を設定からしか触れない
ままにすると、「効果は選べるが見た目は決められない」状態になる。
`order`は並べ替えできるlayerを1つずつ含む完全な配列だけを受ける。AOは
sceneを描き直すpassで常に最初に動く。`order`には含めない。

共有ソースの3Dモデルノード（`list_entities`が`modelNode`を返すオブジェクト。Skin /
Animationを持つGLB / VRMの展開ノード）はオブジェクト単体では消せない。ジオメトリを親3Dモデルの共有メッシュが
描くためだ。`delete_entity`は削除せず非表示（親メッシュの
`modelPose.nodes[i].visible: false`）へ変換する。結果の`deleted: false`と
`modelNodeVisibility: "hidden"`でそう伝える。再表示は`set_entity_enabled`
（`enabled: true`）で行う。3Dモデルから完全に取り除くにはソースを編集して再インポート
する。`set_entity_enabled`はこのノードに対してenabledとpose visibilityを
同時に書く。シーン・公開ワールド・Runtimeの見た目が一致する。

`list_scene_recipes`は焚き火・松明・木・岩・雪・噴水・柱・階段・井戸・ベンチ・
収録スタジオなどの出来合いの3Dセットを返す。配置はlocal-assetの
`apply_scene_recipe`で行う。各セットは光・パーティクル・マテリアルが互いに
合ったsubtreeだ。同じものをprimitiveから組むと十数回の呼び出しが要り、
見劣りする。`note`は配置後の残作業を示す。落とさず
そのまま返す。

「しかけ・チュートリアル」カテゴリのセットは、形状に加えて音源と
ノードグラフまで組み込んで配置する。`behaviours`は押したときに何が
起きるかを1本ずつ返す。`lesson`はそのセットが教える手順を返す。押すと音が
鳴る、押すと灯りが点く、開いて自動で閉じる、といった仕掛けは、`add_component`
と`create_interactivity_asset`を何度も呼んで組み直す必要はない。配置される
のは普通の操作を受け付ける / 音源 / グラフの実行だ。置いた
あとは通常のtoolでそのまま編集できる。

`get_entity_bounds`は位置・回転・大きさではなく**大きさ**を返す。`world`は既定で
配下を含めたaxis-aligned boxを返す。`local`は自身のメッシュの素のextentを返す。回転して
いる子は8隅を変換して含める箱にする。重なり判定が安全側になる。extent
を解決できないメッシュ（metadataが無い時代の3Dモデルなど）はunionから黙って
外さない。`unmeasuredEntityIds`に出す。「小さい」と「不明」を区別する。

**Component**
`list_component_definitions`, `add_component`, `update_component`,
`remove_component`, `update_script_component`

**Collider**
`set_mesh_collision`, `inspect_colliders`, `optimize_colliders`

共有ソースの3Dモデルノード（`modelNode`付きオブジェクト）には`add_component`で
`physics.mesh-collider` / `physics.box-collider`を付けられる。Mesh Colliderは
そのノード自身のジオメトリだけを使う。子ノードは各自のオブジェクトで扱う。
Box Colliderはimport時に記録したノードboundsへ自動フィットする。boundsは新規
import / reimportで付く。旧素材は既定サイズになる。Mesh Colliderを
付けられるのはジオメトリを持つノード（nodeTypeメッシュ / skinned-mesh）だけだ。
Bone / 空ノードは`DEPENDENCY_MISSING`で断る。poseで非表示にしたノードは
描画と同時にColliderからも外れる。`get_entity_bounds`はboundsを持つノードを
実測に含める。

**Terrain**
`get_terrain`, `sample_terrain_point`, `list_terrain_presets`,
`create_terrain`, `create_terrain_from_preset`, `sculpt_terrain`,
`update_terrain`, `apply_terrain_surface`

`create_terrain`が作るのは平らな板だ。primitiveとしては正しいが、出発点として
は向いていない。上部の「素材を追加 → Entityを作成 → World → Terrain」は形のプリセットを8種と、高さと傾斜で塗り分ける表面プリセットを
10種出す。primitiveだけでは谷をブラシで一打ずつ彫ることになる。
`create_terrain_from_preset`は彫って草まで載った状態で置く。`position`を
省くと既存の地形の隣へ置く。同じ地面に2枚重なるとモアレになるためだ。
重なりは阻止しない。`overlappingTerrainCount`で報告する。

`apply_terrain_surface`は高さと傾斜でマテリアルを混ぜる表面プリセットを貼る。
プリセットの高さ帯は絶対値のメートルだ。既定ではその地形の標高範囲へ
合わせ直す。合わせずに貼ると全部の境界が範囲外に出て一色になる。「シェーダー
が壊れている」ように見える。貼った結果は通常のマテリアルだ。あとから
マテリアルのtoolで調整できる。

`sample_terrain_point`はTerrain-localのXZから、補間した高さ、同じ点の
world座標、傾斜、穴、草の層ごとの被覆を返す。documentは高さを平坦な配列で
持っていて直接は引けない。これが無いと彫った地形の上へy=0で置いて
しまう。

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

`apply_interactivity_recipe`は、Editorの「追加」パネルにある「よく作るもの」と同じレシピからGraph素材を作る。`entityId`を渡すと、グラフを実行するComponentもそのEntityへ追加する。押して動かすレシピにはInteractableも追加し、一連の変更を1 revisionで確定する。

Editorのsetupパネルでは、動作に必要な設定がまだないことを案内できる。MCPにはこのパネルがないため、素材の作成と実行設定を一緒に行う。`list_interactivity_recipes`で、動作確認と公開先の両方で実行できるレシピのidを取得する。

`create_model_animation_graph`は3Dモデルの素材のアニメーションクリップ
すべてを`event/onStart`から同時にループ再生するグラフを作る。モデルの設定
の「アニメーションのGraphを作る」と同じものだ。素材を作るだけでオブジェクトには
付けない。付け先は`add_component`の`interaction.trigger`で選ぶ。

Animationコンポーネントは廃止された。`place_asset`でクリップを持つ3Dモデルを置くと、
その全クリップを再生するGraphとグラフの実行が一緒に付く。`add_component`
に`core.animation`は無い。まだコンポーネントを持つdocumentに対する
`update_component`は`COMPONENT_REMOVED`で断る。`remove_component`は通る。

ノードエディターの操作はすべてこの表にある。元に戻す / やり直す、選択、編集領域の見え方（拡大、
全体表示、パネル幅）、タイムラインの範囲と時刻のつまみを除く。
除いた4つはdocumentを変えない。

`duplicate_interactivity_node`は`targetGraphIndex`を受ける。Editorの
Ctrl+C / Ctrl+Vと同じく別のグラフへも置ける。同じグラフの中ならノードはその
まま写せる。別のグラフでは`declaration`のindexもinline valueの`type`
のindexも別のものを指す。名前で取り出し、コピー先のグラフでindexを割り当て直す。

`set_interactivity_value`は設定の「値」欄と同じ操作で、数値だけでなく
`signature`も受ける。KHR_interactivityに定数ノードは無く、固定値は必ずソケット
自身のliteralなので、`3`を送るのと`(0, 1, 0)`を送るのは型の違いでしかない。
operationが型を決めているソケット (秒数、繰り返し回数、animationのindex、
論理演算の入力) へ別の型を渡すと`SIGNATURE_NOT_ALLOWED`で拒否する。設定も
同じソケットでは型を変えさせないので、どちらのsurfaceから書いても同じ結果に
なる。どのソケットが固定かは`list_interactivity_operations`の
`fixedValueTypes`が返す。

`configure_interactivity_trigger_action`は、`set_interactivity_configuration`と`set_interactivity_value`で個別に書ける4つのkeyをまとめて設定する。対象のオブジェクト・コンポーネント・プロパティが存在することと、値の型を確認する。誤った対象を指定したグラフは保存できても動作しないため、Editorの選択欄と同じ検証をMCPにも適用する。

かける時間とイージングも同じ呼び出しで指定する。補間できないプロパティに時間を指定した場合は拒否する。

値が数値でないプロパティは`value`を取らない。`kind`が`asset`のものは
`valueAssetId`、`string`のものは`text`を取る。KHR_interactivityにstring型は
無い。素材も文も補間できる量ではない。どちらもtargetと並んで
`configuration`に入る。`valueAssetId`へ空文字を渡すと、シーン設定側の素材へ
戻る。`list_interaction_trigger_targets`は各プロパティの`kind`を返す。加えて
受け付ける素材の種類 (`assetKinds`) と、どの引数で渡すか (`argument`) を返す。
`Scene`ターゲットへの書き込みはすべてclient-localだ。そのグラフを実行して
いるビューアーの描画にだけ効く。

`simulate_interactivity_asset`は、Editorのタイムラインと同じ処理で、レンダラーを使わずにグラフを実行する。待機後の実行時刻、繰り返しの終了、実行されない分岐などを確認できる。documentを書き換えないため、revisionは不要。

`move_interactivity_node`と`layout_interactivity_graph`でノードの表示位置を保存する。作者が開いたときにカードが重ならず、グラフを読める状態にするための操作である。

**コンポーネントコードの取り込み**
`analyze_component_code`, `apply_component_code_import_plan`

## local-asset (15)

`import_audio_asset`, `import_font_asset`, `import_texture_asset`, `import_model_asset`,
`import_skybox_asset`, `import_shader_asset`, `reimport_model_asset`,
`process_texture_asset`, `optimize_model_asset`, `revert_asset_optimization`,
`apply_scene_recipe`, `get_shader_asset`, `update_shader_asset`,
`set_project_thumbnail`

`import_font_asset`が受け付けるのはTTF、OTF、WOFFだけだ。WOFF2はtext
rendererが解釈できない。組版が終わらないままテキストが空になる。
取り込みの時点で理由を添えて断る。取り込んだフォント素材は
`update_component`の`patch.fontAssetId`でテキストから参照する。空文字を渡すと
同梱の書体へ戻る。

`apply_scene_recipe`は、セットに使う3Dモデルをprojectへ書き出すため、shellで処理する。パーティクルとsubtreeは一件のhistoryにまとめ、Undoでセット全体の登録を戻せるようにする。

`update_texture_asset`が書けるのはimport設定だけだ。`maxSize`、`format`、
`quality`を指す。原本の画像はそのまま残る。実際に解像度を変えて再エンコード
するのは`process_texture_asset`だ。設定だけ書いて「圧縮した」と報告すると、
Editor上の「未反映」の表示と食い違う。変換の実行を別の
toolにしてある。既に設定が反映済みなら`changed: false`と理由を返す。原本を
書き直さない。

`update_model_asset`も同じだ。書けるのはimport recipeだけだ。`scale`、
`generateColliders`、`optimizeMeshes`、`importAnimations`を指す。原本のGLBを
実際に書き換えるのは`optimize_model_asset`だ。頂点の結合、頂点バッファの共有、
Animationキーフレームの間引きを行う。任意でDraco圧縮も行う。マテリアルSlot、Node
構造、Animationクリップの本数は変えない。マテリアルやNodeの索引が動くと、オブジェクト
側のマテリアル割当が別のマテリアルへ移る。統合や平坦化は行わない。実行する
処理がなければ`changed: false`を返す。

`instanceMeshes`は描画の設定で、再インポートなしで動作確認と公開先へ反映する。
`update_model_asset`の`patch.importSettings.instanceMeshes`をtrueにすると有効、
falseにすると解除する。静的GLBの同じ形状・マテリアルの不透明な部品を近隣ごとに
まとめる。動的な親、Animation、Skin、Morph、反転した部品は除外する。
スクリプトやグラフの実行があるシーンは通常描画を維持する。原本や衝突判定は変更しない。
取り込みテクスチャの端末共通設定は歯車から変更できる。MCPでは既存の取り込みtoolの
明示設定を使うため、端末の既定値専用toolは設けない。

変換と最適化はどちらも非破壊だ。原本のファイルは書き換えない。変換結果を
`assets/.optimized/`へ書く。素材の`source`が指す先だけを差し替える。変換前の
`source`、解析結果、読み込み設定は`optimizedFrom`に控える。
`revert_asset_optimization`はこの控えから原本へ戻す。圧縮を試して戻せないと
手直しが要る。実行と同じsurfaceに解除も置いてある。

## script (6)

`list_script_templates`, `get_script_asset`, `create_script_asset`,
`apply_script_template`, `update_script_asset`, `set_play_mode`

`list_script_templates`は`vehicle` / `seat`のTSXテンプレートも返す。
設定済みの車を置く場合は、ギミックの`scene-recipe.custom-vehicle`を`apply_scene_recipe`で配置する。
Scriptだけを作る場合は`create_script_asset`の`templateId`に指定する。
操縦処理は`update_script_asset`、車体・座席・タイヤの配置や見た目は通常のEntity・Model・Materialの操作で編集する。使用範囲は
[Vehicle / Seat](./SCRIPTING.md#vehicle--seatworld-components-0520) を参照する。

追加承認のないスクリプト実行と隔離の限界は [スクリプトの契約](./SCRIPTING.md) にある。

## external-store (3)

`search_external_assets`, `get_external_asset_options`,
`install_external_asset`

`search_external_assets`の3Dモデルには、Poly Havenの一覧APIが返す`polycount`と`dimensionsMm`が付く。寸法は幅・奥行・高さの順で、単位はmm。Poly Havenの写真スキャンには、木で数百万、岩でも数十万の三角形を持つモデルがある。取り込む前に値を読み、そのワールドの制作予算と比較する。上限の数値はこの文書では固定しない。

## debug (15)

`capture_scene_debug`, `capture_scene_view`, `set_scene_view_camera`,
`start_recording`, `stop_recording`, `get_recording_status`,
`set_recording_profile`, `set_recording_viewport`, `get_recording_viewport`,
`set_recording_camera`, `get_recording_camera`

documentを書き換えない。現在表示中のシーンを読む / 向きを変える / 録画するだけだ。
元に戻す履歴も選択も動かさない。

- `capture_scene_debug` — fps、frame time、draw call、triangle、可視メッシュ数、
  形状 / テクスチャ別のVRAM概算（geometryVramBytes / textureVramBytes）、未算定テクスチャ数（unknownVramTextures）、
  テクスチャ内訳（compressedTextureVramBytes / uncompressedTextureVramBytes、compressedTextureCount / uncompressedTextureCount。未算定は除外）、
  カメラの奥を返す。WebMの録画もstart / stopで扱う
- `capture_scene_view`は描画したPNGを1枚、appの`debug-captures`へ保存し、パスを返す。数値やdocumentの確認に加え、この画像で実際の表示を確認する。
- `set_scene_view_camera` — 俯瞰 (`top`) / 真下から (`bottom`) / 各軸 (`front`
  `back` `left` `right`) / 既定の斜め (`iso`) を選べる。`focusEntityId`でオブジェクトの
  実描画boundsへ寄る。あるいは`position`と`target`を直接指定する。プリセット
  だけを渡した場合は今の注視点を保つ。「いまの対象を上から見る」操作になる。
  boundsはFキーと同じ経路で測る。コライダー枠のような編集用の補助表示
  や無効化した子は含めない。同じオブジェクトを同じ場所から見る操作になる

保存先は指定できない。意図的な制限だ。確認のために撮った画像は一時的な成果物だ。
projectではなくapp dataへ置く。

**ワールド制作の録画**（詳細は [ワールド制作の録画](./RECORDING.md)）

## 意図的に公開していない操作

- 部分.xriftstudio書き出し・追加Importのファイル選択、保存先、セッションクリップボードは本人のローカル操作として扱い、今回専用MCP toolは追加しない。UIは既存のdocument/Asset/Undo処理を共用する。ファイル受け渡しの制約は[Hierarchyの受け渡し契約](./HIERARCHY_TRANSFER.md)を参照する。
- 素材・Component検索、Inspector見出し、制作データ確認dialogはUI上の導線であり、新規toolやネットワーク計測にしない。既存のproject health toolが実行時やファイルの存在まで確認したとは扱わない。


- ヘッダー・ステータスバーの配置、Scale比率固定の初期値、アイテムの初期Unlit表示はUIだけの設定で、専用toolは設けない。Entity作成・Scale更新・ギミック追加は既存の操作を使う。ギミックのprojectKindsはワールド・アイテムで共通化し、通常のproject kind・revision・Asset操作ロックは維持する。

- シーン / Hierarchyの「反転して貼り付け」はエディター内のクリップボードを使うため、専用toolは設けない。MCPでは既存の`duplicate_entity`で作ったEntityに`update_transform`を適用し、local Scaleの指定軸だけ符号を反転する。元のEntityを変更しない。メニューの開閉や軸選択はUIだけの状態として扱う。

- iPadのパネル切り替え・視点だけ操作・複数選択・Playのタッチ入力は、端末側の表示または入力状態で、documentを変えないため専用toolを設けない。ブラウザの保存先選択、`.xriftstudio`のダウンロードと共有メニューはユーザー操作とSafariの権限に依存するため、MCPから起動しない。プロジェクトのデータ編集とデスクトップのファイル書き出し・取り込みは既存toolを使う。iPadブラウザ内でのMCP接続は提供しない。

- スクリプト一覧の検索・折り畳み・シーン横のタブ切り替えは画面内の表示状態なので、専用toolは設けない。素材の取得・作成・更新は既存のスクリプトtoolを使う。Graphとのイベント連携APIは`get_scripting_capabilities`に含め、スクリプト元データとGraphの既存編集toolで設定する。

- 公開用GLBの不要画像除去とキャッシュ管理は、公開・書き出し処理に自動適用する。編集用素材や動作確認の状態を変える操作ではないため、専用のMCP toolは設けない。仕様は[公開時のダウンロード容量削減](./PUBLISH_DOWNLOAD_OPTIMIZATION.md)を参照する。

- マテリアルSlotsの開閉・検索・ページ切替は表示だけの状態なのでMCPへ公開しない。マテリアル割当の読み取り・変更は既存の3Dモデルの素材操作を使う。

「まだ作っていない」ものと「公開しないもの」を分けて示す。

| 操作 | 理由 |
| --- | --- |
| 元に戻す / やり直す | 操作はrevisionで直列化する。Editorの履歴は人の操作単位だ。片方から巻き戻すと、もう片方が何を失ったのか分からなくなる |
| 選択の変更だけ | 各toolが結果として選択を移す。選択のためだけのtoolは履歴もdocumentも変えない。状態だけずらす |
| シーンの描画品質（自動 / 高品質 / 軽量 / 描画50% / 描画25%） | 編集中の描き方だけを変えるEditor Stateだ。既定の自動は75%から開始し、負荷が続くと25%まで下げる。documentにも公開物にも残らない。動作確認とサムネイル撮影は常に高品質で描く。読み取る見た目も変わらない |
| 拡大・全体表示・パネル幅・タイムラインの範囲と時刻 | 見え方だけの状態だ。documentに残らない。ノードの位置はdocumentに残るので`move_interactivity_node`と`layout_interactivity_graph`で扱う |
| 公開ダイアログのテクスチャ一括変換・素材最適化 | 公開前の容量削減は`process_texture_asset`と素材ごとのtoolで行う。`publish_project`は確認済みのdocumentをそのまま公開する |
| Logout、トークンの受け渡し | 認証情報をMCP境界へ渡さないためだ。`login`はStudioの中で認証を始めるだけで、`get_account`は状態だけを返す |
| 録画の保存先の指定 | `recording_begin_file`が開けるのは既定の保存先と、フォルダーダイアログで選んだ場所だけだ。pathを直接書けるとRust側のpath検証を迂回する。保存先を変える場合は録画パネルを使う |
| 公式コンポーネントのposition / rotation / scale | `update_component`はXRiftのコンポーネントのこれらのpropを受け取らない。コンポーネント側に持たせるとオブジェクトの位置・回転・大きさと別の原点ができ、選択したときのギズモと回転の中心が描かれている場所からずれる。配置は`update_component`の`transform` patchでオブジェクトへ書く |
| 任意pathの読み書き・削除 | Rust側のpath検証と権限制御を迂回させないためだ |
| 任意JavaScriptの実行 | 汎用JavaScript評価toolは提供しない。Script AssetはPlayで追加承認なく実行され、sandboxではない（SCRIPTING.md参照） |
| テクスチャの一括変換 | 複数選択したものをまとめて書き出すための導線だ。MCPからは`process_texture_asset`を素材ごとに呼ぶ。対象の選び方は設計図で決まる |
| テクスチャの共通設定・サイズ確認 | 共通設定は`update_texture_asset`の`importSettings`と`process_texture_asset`で同じ処理を実行する。サイズ確認は既存画像の読み取りだけを行う設定の表示状態だ。再インポートで取得した寸法は素材のimportMetadataにも入る |
| 取り込み時のテクスチャ最大解像度 | 読み込むメニューに残るEditor Stateだ。documentには入らない。`import_local_texture`と`update_texture_asset`の`importSettings.resize`で同じ結果を素材ごとに指定する |
| ワールド動作確認のプレイヤー操作（移動・視点・ジャンプ・掴み・操作） | 実行中のプレイヤー入力だ。documentにも公開物にも残らない。視点はマウスのポインターロックが前提だ。MCPから送っても画面のロックは動かない。シーンを見るには`set_scene_view_camera`と`capture_scene_debug`を使う。操作の結果を確かめるなら`set_play_mode`とノードグラフ / スクリプト側の状態を読む |

## 機能を足すときの手順

1. `mcp-tool-registry.ts`の`XRIFT_MCP_TOOLS`へnameとsurfaceを足す
2. surfaceに応じて`mcp-editor-tools.ts`のhandler、またはReact shellの分岐を書く
3. `src-tauri/src/mcp.rs`の`tool_definitions()`へJSON schemaを足す
4. `pnpm mcp:tool-names`でRustのallow-listを再生成する
5. `mcp-editor-tools.fixture.ts`へ、成功する呼び出しと拒否される呼び出しを足す
6. `pnpm typecheck`、`pnpm cli:test`、`cargo test --manifest-path src-tauri/Cargo.toml`

シーンdocumentのスキーマを増やしたときは、`serialization.ts`の許可キーと
対応するMCP toolを同時に更新する。片方だけ更新すると、保存した時点でシーンが
読めなくなる。

### 大きなモデルを取り込むとき

Editorの`import_model_asset`と、`importSettings`を省略した`import_texture_asset`は歯車から開く設定パネルの共通設定を使う。未設定時は最大1024px・KTX2。対応する単体画像とモデル内蔵画像を変換してからManifestを採用するため、変換前の画像を先にシーンへ配置しない。元画像と元モデルは保持する。既存素材には遡って適用しない。圧縮に失敗した場合は配置へ進まず、設定を変えて再試行できる。

`set_mesh_collision`はMeshのColliderの追加・解除・シーン全体の置換を一件のrevisionで実行する。`exclusive`はTriggerを含む全ColliderとAuto Colliderを解除する。`inspect_colliders`の`sources`から設定元のオブジェクト、形状、階層の有効状態を読める。

`bake_mesh_collider`は選んだ3DモデルノードのCollider用軽量Modelを作るlocal-asset操作。`entityId`、Mesh Colliderの`componentId`、残す割合`ratio`を渡す。結果のポリゴン数を確認し、歩行を検証する。共有3Dモデルと通常の展開ノードに対応し、未展開3Dモデル全体と組み込みプリミティブは対象外。

外部カタログの`list_scene_recipes`は`shelf`に`models`（3Dセット）、`materials`（マテリアル表現のglTF見本）、`gimmicks`（ギミック）を返す。目的に合う分類から選び、既存の配置ツールへ同じrecipe IDを渡す。配置後はInspectorで編集し、ギミックはPlayで動作を確認する。 UIの3Dセット・マテリアル・ギミック一覧は基本4列で、狭い表示領域では3列・2列になる。列数は表示だけの状態なので専用MCP toolは設けない。


### ギミックのカスタム車を配置する

UIでは「外部から追加 → ギミック → カスタム車」と「XRift公式コンポーネント → Vehicle」の両方から、同じ設定済みの車を配置できる。MCPではWorld向けの`scene-recipe.custom-vehicle`を`apply_scene_recipe`で配置する。`place_builtin_prefab`にVehicleは登録されていないため、公式カードの表示名をそのまま渡さない。配置される車は通常のEntity・Model・Scriptを組み合わせた編集可能なセットである。

1. `get_editor_context`で編集中の`projectId`、`sceneId`、revisionとEditモードを確認する。保存済みのWorldプロジェクトが必要。
2. `list_scene_recipes`を引数`{}`で呼び、返された`recipes`から`shelf: "gimmicks"`、`id: "scene-recipe.custom-vehicle"`を選ぶ。`shelf`は戻り値であり、このtoolの入力引数ではない。
3. `apply_scene_recipe`へ次の引数を渡す。IDとrevisionは直前に取得した値へ置き換える。`position`を省略するとカタログと同じグリッドへ配置する。

```json
{
  "projectId": "取得したprojectId",
  "sceneId": "取得したsceneId",
  "expectedRevision": 12,
  "recipeId": "scene-recipe.custom-vehicle",
  "position": [0, 0, 0]
}
```

結果の`entityId`は車の親Entity、`childEntityIds`は車体・運転席・同乗席・4輪・排気煙の8個、`createdAssetIds`は今回追加したAssetsを示す。次の更新には`revisionAfter`を使う。一覧の`assembly: "vehicle"`と`scriptBehaviours`は、ノードグラフではなくScriptで動くセットであることを示す。

車体・座席・タイヤは通常のGLBを参照するMesh Rendererを持ち、Edit中もHierarchyから選択して配置を調整できる。ScriptへのBase64埋め込みや、Play開始時だけのモデル生成は行わない。モデルは通常のglTF PBRカラーを使い、座席は1マテリアル。排気煙にはParticle EmitterとParticle Assetが付き、タイヤの回転と煙の放出にはそれぞれScriptが付く。形状を変えるときはGLBやModel Asset、配置を変えるときは子EntityのTransformを編集する。

親EntityのScriptは地面追従を既定で有効にし、登れる坂の上限を45度にする。追従には固定Colliderのある地面が必要で、標準車体の4輪位置を基準に接地を判定する。タイヤの配置を大きく変える場合は操縦Scriptの接地点も合わせて調整する。壁との車体衝突やサスペンションを再現する車両物理ではない。

Playでは運転席をクリックして乗り、W/Sで前後移動、A/Dで旋回、Spaceで降りる。同乗席も着席できる。タイヤと煙は、各参加者側で公式Vehicleの同期済み移動量から表示を更新する。停止中は回転と新しい煙の放出を止める。粒子ごとの位置やタイヤの角度を個別送信する方式ではないため、粒子の形や位置が参加者間で完全に一致する保証はない。公開XRiftでの複数人表示は別途確認する。

追加後は`get_entity_components`で構成、`capture_scene_view`でEdit中の見た目を確認し、`set_play_mode`で乗降と走行を確認する。既存の車は新規配置と別の編集対象であり、この操作だけでは差し替わらない。
