<!-- コマンドとパスは、特記がなければリポジトリの作業ディレクトリを基準にします。 -->

# XRift Studio × Blender モデリングパイプライン

必要な形状、見た目、編集のしやすさ、実行時の負荷に合わせて制作方法を選んでください。

## 制作方法の選択

Blenderを指定された場合はBlenderを使います。メッシュの形状、UV、ベイク、原点を編集する場合にも適しています。TSX Scriptは、動きや繰り返し配置を作る場合に使ってください。既存GLBの配置・調整は、StudioのAssetとEntityの操作で行えます。

TSX ScriptのRenderでは、R3Fの`useFrame`を使えません。フレームごとの処理は、`start(ctx)`が返す`update(delta)`へ書いてください。モデルは、テクスチャを含む自己完結したGLBを推奨します。外部素材を参照する場合は、`ctx.assets.url()`と`useGLTF` / `Clone`を使います。

特定の方法を常に優先せず、依頼に必要な工程を選んでください。

## 選んだ方法の手順

### B. コード中心でシーンを組む（Script を使う場合）

#### B-1. R3F / Three.js コードを「貼り付けて変換」する（最速）

Studioの「コードから作成」にR3F / Three.jsのJSXを貼り付けると、EntityとComponentへ変換できます。既存コードをEntityとして編集したい場合に使ってください。

1. R3Fワールドの`World.tsx`に相当する、`@xrift/world-components`とR3FのJSXを用意してください。
2. `ComponentCodeImportDialog`で、`analyzeComponentCode`または`analyzeComponentProject`に渡します。参照モデル、テクスチャ、Entityの構造、Componentを抽出し、`applyComponentCodeImportPlan`でEntity群として確定します。
3. `get_editor_context`でrevisionを確認し、作成後の最新状態を取得してください。
4. `useFrame`などの変換できない構文は、エラーを確認して`start(ctx).update(delta)`へ書き換えます。

変換対象は、`@xrift/world-components`のComponentと、R3Fのプリミティブ・メッシュです。変換後の形状、マテリアル、編集のしやすさが依頼を満たすか確認してください。

#### B-2. TSX Script の Render で手続き的に描画する

アニメーションや複雑なJSXの生成など、`analyzeComponentCode`で変換できない描画は、TSX Scriptの`Render`へ記述してください。

1. `list_script_templates`で雛形を確認し、`create_script_asset`に`language: "tsx"`を指定して作成します。
2. `Render({ ctx })`をnamed exportしてください。外部GLBは、`model-display`テンプレートの`useGLTF` / `Clone`、prop.asset、ScriptRenderPropsに合わせて参照します。
3. 動きは`start(ctx) { return { update(delta) {} } }`へ書きます。`useFrame`は使えません。
4. `update_script_component`で`assetReferences`と`entityReferences`を宣言してください。

#### B-3. 確定と確認（共通）

`update_script_component`で、使うAssetとEntityを宣言してください。未宣言の参照は解決できません。

`set_play_mode(mode: "play")`で実行し、`get_editor_context.scriptRuntime`の変換・実行エラーを確認します。Scriptごとの承認は不要です。compile errorとtrust状態も確認してください。

### C. Blender でメッシュを作る（必要なときだけ）

`get_blendfile_summary_path_info`でMCPの接続を確認してください。未接続なら、Blenderでアドオンを起動するよう案内します。

既存シーンは保ち、新規オブジェクトに一意の名前を付けます。`.001`などの名前の衝突を避け、作成直後に参照を取得してください。

`execute_blender_code`でプリミティブの生成・編集とモディファイアの適用を行えます。デシメート、ベベル、サブサーフは、可能なら非破壊で編集します。メッシュ編集にはbmesh APIを使い、`bmesh.to_mesh()`で結果を反映してください。

書き出し前は[blender-export.md](blender-export.md)に従って対象を確認します。非均一なスケールは、影響を確認してから`bpy.ops.object.transform_apply()`で適用してください。原点は用途に合わせて保ち、扉の蝶番などのピボットを一律に中心へ移しません。Blenderの標準単位はメートルですが、実際のシーン単位も確認します。非表示・無関係なオブジェクトを除き、マテリアルはPBRのPrincipled BSDFへ整理してください。

`bpy.ops.export_scene.gltf(export_format="GLB", use_selection=True, export_materials="EXPORT")`で書き出せます。出力先は絶対パスを指定し、日本語や空白を含む場合は、ツールへ正しく渡ることを確認してください。

### D. GLB を Studio へ取り込む

1. Editモードで`import_model_asset`にGLBの絶対パスを渡してください。通常のファイルが必要です。
2. `get_model_asset`で取り込み設定とマテリアルスロットを確認します。
3. 必要に応じて`update_model_asset`で`importSettings.scale`と`materialSlotBindings`を調整してください。
4. ジオメトリを変更した場合は、`reimport_model_asset`で取り込み直します。
5. `place_asset`で配置し、`update_transform`で位置を調整してください。
6. `set_material`で各スロットにMaterial Assetを割り当てます。
7. PBRとKHR拡張は`update_material_asset`、テクスチャの追加は`import_texture_asset`で行います。
8. 必要なら`add_component`で`core.mesh`などを追加し、castShadowとreceiveShadowを設定してください。

### E. 検証ループ

`set_play_mode(mode: "play")`で動作を確認し、`get_editor_context`のscriptRuntimeでcompile errorとtrust状態を確認してください。問題があれば、`update_script_asset`、`update_transform`、`update_material_asset`で対象を修正します。

Play中にEntity / Sceneの構造ツールで書き込んだ変更は即時に同期されます。続ける前に`get_editor_context`を取得し、最新のrevisionを使ってください。

## コード中心の変換ガイド（R3F/Three.js → TSX Script）

詳しい変換手順は[r3f-to-script.md](r3f-to-script.md)にあります。

| Three.js / R3F | XRift TSX Script |
|---|---|
| `useFrame((state) => ...)` | `start(ctx) { return { update(delta) { ... } } }`。`delta`の単位は秒 |
| `const ref = useRef()` + imperative | `update`内で`ctx.object3d`を操作 |
| `<mesh geometry={...} material={...}>` | `<mesh>`から既存Entity / Assetを参照 |
| `useGLTF(url)` | `ctx.assets.url(declaredModelId)` + `@react-three/drei` |
| `<primitive object={scene}>` | dreiの`<Clone>`で再利用 |
| マテリアルの変更 | `ctx.materials.setColor/setRoughness/...` |
| ライトの変更 | `ctx.lights.setColor/setIntensity/...` |

## Blender 使用時の重要注意

GLBにはテクスチャを含め、自己完結させてください。大規模なシーンは必要な範囲を順に調べ、全オブジェクトを一括出力しません。Blenderの表示確認には`get_screenshot_of_window_as_image`を使えます。

## 参照

| 作業 | 資料 |
|---|---|
| 共通ルール | AGENT.md |
| UXの設計 | .agents/skills/xrift-studio-ux/SKILL.md |
| 検証 | .agents/skills/xrift-studio-verify/SKILL.md |
| IPC・CLIの連携 | docs/AGENT_IMPLEMENTATION.md |
| GLBの書き出し | [blender-export.md](blender-export.md) |
| R3F / Three.jsからScriptへの変換 | [r3f-to-script.md](r3f-to-script.md) |
| 変換と配置の例 | [r3f-to-studio-example.md](r3f-to-studio-example.md) |
| 繰り返し編集する手順 | [iterative-loop.md](iterative-loop.md) |
