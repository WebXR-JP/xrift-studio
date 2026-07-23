# XRift Studio ビジュアルエディター初期設計

この文書は、XRift Studio に統合的なビジュアル制作体験を追加し、最終的に XRift が扱える React Three Fiber / JavaScript プロジェクトへ変換するための設計を定義する。

本仕様は、ビジュアル project の作成、Asset import、Scene 編集、保存、Play、XRift project への決定的変換、check、upload までを一つの製品導線として定義する。World Preview と Item Preview は同じ Scene View を使うが、input、controller、mount transform、camera の runtime profile は成果物種別ごとに分ける。各操作は実際の authoring document、生成 artifact、または XRift result に結び付き、処理中、失敗、stale、審査中を成功や公開済みとして表示しない。

## 1. 目標と設計原則

ユーザーが得たい結果は、コードを直接編集する方法を失わずに、アセットをシーンへ置き、見た目を確認しながらワールドまたはアイテムを制作できることである。

設計では次を守る。

1. クラシックとビジュアルを対等な制作入口として扱う。
2. クラシックとビジュアルは同じ project に付く表示モードではなく、正本と機能境界が異なる project type とする。
3. ビジュアル制作の正本は、任意の JSX や `package.json` ではなく、`VisualProjectDocument`、`SceneDocument`、`AssetManifest` とする。
4. SceneDocument、AssetManifest と、選択、カメラ、開いているパネルなどの Editor State を分離する。
5. エンティティ、コンポーネント、アセットには表示名とは別の安定 ID を持たせる。
6. Inspector とコンパイラは同じ明示的な Component / Asset Schema を参照する。
7. 初期段階では ECS ランタイムを導入せず、ECS に着想を得た正規化データとして実装する。
8. 未保存、未変換、未公開を区別し、実行していない処理の成功表示を出さない。
9. XRift の認証情報とファイル操作はブラウザ UI から分離し、将来も authoring document や生成バンドルへ含めない。
10. ビジュアルモードでは Vite、CLI、開発サーバー、別ブラウザの起動を制作手順として意識させず、Edit から Play、Stop まで同じエディター内で完結させる。

Hierarchy、Scene View、Inspector、Assets の責務を分離し、選択同期、ギズモ、アセットとシーンデータの分離、明示的な Inspector Schema、Edit / Play / Stop の状態分離を XRift Studio 自身の契約として定義する。ECS ランタイムへの依存は現段階では追加せず、Scene View を Play の表示面として再利用する。

## 2. 四つの制作導線と project type

新規作成の最初の画面には「アイテム・クラシック」「ワールド・クラシック」「アイテム・ビジュアル」「ワールド・ビジュアル」の四カードを同じ階層で置く。カード内では成果物、制作方法、正本、作成後に開く画面を一文で示す。成果物と project type を内部では二軸として扱っても、ユーザーに二段階の選択を往復させない。「クラシック / ビジュアル」は同じ project の編集画面切替ではなく、正本、利用できる機能、保存形式が異なる選択である。

| 成果物 | Project type | 正本 | 開く機能 | XRift への到達方法 |
| --- | --- | --- | --- | --- |
| アイテム | クラシック | `package.json`、`xrift.json`、`src/` | コードエディター | 既存の item check/build/upload |
| ワールド | クラシック | `package.json`、`xrift.json`、`src/` | コードエディター | 既存の world check/build/upload |
| アイテム | ビジュアル | `xrift-studio.project.json`、`scenes/`、`assets/` | ビジュアルエディターと Item Preview Profile | Compiler が一時的な XRift item project を生成して既存処理へ渡す |
| ワールド | ビジュアル | `xrift-studio.project.json`、`scenes/`、`assets/` | ビジュアルエディターと World Play Profile | Compiler が一時的な XRift world project を生成して既存処理へ渡す |

### 2.1 クラシック project

- `xrift create item` または `xrift create world` が作る現在の XRift code project をそのまま扱う。
- `package.json`、`xrift.json`、`src/` がユーザー編集可能な正本である。
- 任意の React / JSX / JavaScript を許し、ビジュアル用 document の存在を要求しない。
- 任意 JSX を解析してビジュアル project へ round-trip する機能や、自動変換は提供しない。

### 2.2 ビジュアル project

- ルートの `xrift-studio.project.json` を project manifest とし、`scenes/main.scene.json` と `assets/assets.json` を参照する。
- `package.json`、`xrift.json`、`src/` は authoring project の正本にしない。
- Compiler が生成する XRift code project は cache または一時出力であり、再生成可能で手編集不可とする。
- Visual から Classic へ移る場合は Export / Eject で別の classic project を作る。一方向の所有権移行であり、自動同期は保証しない。ClassicからVisualへの復帰は、検査済みsource graphの静的subsetを明示的にlossy importする別transactionであり、元Visual documentとのround-trip同期ではない。

`xrift-studio.project.json` は visual project の root manifest filename とする。将来変更する場合は旧名の検出と明示的 migration を用意し、同じ project を classic と推測しない。

```text
my-visual-project/
  xrift-studio.project.json
  scenes/
    main.scene.json
    prefabs/
      <prefab-id>.scene.json
  assets/
    assets.json
    folders.json
    source/
      <asset-id>/
        <sanitized-original-name>
  .xrift/
    world.json | item.json
  .cache/
    assets/
      <asset-id>/
        <derived-file>
    generated-xrift/
      package.json
      xrift.json
      src/
```

### 2.3 ライブラリでの判定

Tauri 側の project scan は、ルートに有効な `xrift-studio.project.json` があれば visual、既存の `package.json` と `xrift.json` があれば classic と判定する。visual の `.cache/generated-xrift/` は再帰 scan の対象外にする。

visual manifest が存在するが壊れている場合、classic として推測して開かず、「ビジュアルプロジェクトを読み込めません」と対象 field と修復手段を示す。ライブラリカードには成果物種別とは別に「クラシック」または「ビジュアル」を表示し、開くエディターと正本を予測できるようにする。

ビジュアルカードの作成成功時は上記専用 format を project root に保存し、ライブラリへ一件追加してビジュアルエディターを開く。作成途中の失敗では不完全な project を一覧へ追加せず、temporary directory を回収して四カードまたは保存先確認へ戻す。

## 3. エディターの画面構成

デスクトップ幅では次の配置を基本とする。

```text
┌──────────────── ヘッダー / Edit・Play / Transform Tool / 状態 ────────────────┐
├──────────────┬───────────────────────────────┬─────────────────────────┤
│ Hierarchy    │ Scene View                    │ Inspector               │
│              │                               │                         │
│ エンティティ │ 3D 表示、選択、ギズモ          │ コンポーネントとプロパティ │
│              │                               │                         │
│              ├───────────────────────────────┤                         │
│              │ Assets                        │ Entity / Asset properties│
│              │ 探索、検索、D&D、thumbnail     │                         │
└──────────────┴───────────────────────────────┴─────────────────────────┘
```

### Hierarchy

- SceneDocument の親子関係を表示する。
- クリックしたエンティティを選択し、Scene View のアウトラインと Inspector を同時に更新する。
- 表示名を変更しても ID は変えない。
- 将来は親子付け替え、複数選択、表示・ロック、複製、削除を Command として扱う。

### Scene View

- React Three Fiber と Three.js を表示層に使い、SceneDocument の Entity と AssetManifest の参照を解決して描画する。
- 選択中のエンティティだけに移動、回転、拡大縮小のギズモを表示する。
- 通常clickは単体選択、Shift / Ctrl・Cmd clickは追加／解除とし、複数選択中は全対象へoutline、最後に選んだprimary Entityだけにgizmoを表示する。pointer downからupまでにcamera drag相当の移動があれば選択を確定しない。
- ギズモ操作中はカメラ操作との競合を止め、操作終了時に一つの履歴として確定する。
- Editの表示は一つの目的別selectorで「シーン」「ライトなし」「ワイヤー」「コライダー」を切り替える。Skybox、Fog、Lightを個別toolbar toggleとして並べず、表示モードはSceneDocument、Undo、自動保存、compile、Play結果を変更しない。
- 空間へ Model / Prefab をドロップした場合は、配置したエンティティを直ちに選択する。Material の drop は Entity を増やさず、対象 Mesh slot の binding を変更する。
- Scene View の空間または Entity を右クリックすると Create submenu を開き、Empty、Box、Sphere、Plane、Cylinder など Registry 登録済み primitive を click point または選択親の下へ作成する。作成位置と親を menu 内で読めるようにし、`CreatePrimitiveCommand` 一件で追加と選択を確定する。
- Edit と Play は明示的に分け、同じ Scene View で切り替える。
- Edit では Entity / Asset の選択、アセット配置、ギズモ、Transform と Material Asset の編集を有効にする。
- Play では SceneDocument と AssetManifest の編集をロックし、ギズモと drop target を隠す。project kind に対応する Preview Profile で体験確認する。
- Stop では Play 中のアバター、カメラ、入力状態を破棄し、Play 開始前の SceneDocument と Edit の選択状態へ戻る。
- World Play Profile の keyboard / gamepad / XR input は `InputAdapter` と `ControllerPlugin` を介し、Item Preview Profile へ world navigation を混ぜない。

### Inspector

- 右側は Entity と Asset の唯一の property editor とする。`sceneSelection` と `assetSelection` は独立して保持し、最後に明示操作した対象を `inspectorContext` として表示する。Asset を選んでも Entity selection 自体は消えず、Inspector header の Entity / Asset breadcrumb または pinned tab で直前の Entity properties へ一操作で戻れる。
- Entity context は Transform、Component、geometry / model reference、material slots、`castShadow` / `receiveShadow`、XRift Studio 固有 authoring field を扱う。Material context は glTF PBR / extensions、Texture context は source、色空間、resize、mipmap / sampler、compression、derived / diagnostics を扱う。Model、Prefab、Particle も同じ右 Inspector の kind-specific section を使う。
- Material Asset の変更は、その ID を参照するすべての Entity へ反映する。Inspector header には Asset kind、stable ID、参照数、「共有中」、dirty / stale status を表示する。
- Mesh の Material は glTF mesh primitive に対応する slot ごとに表示し、`materialBindings[].slot` と `materialAssetId` を編集する。`castShadow` と `receiveShadow` は Material ではなく Entity の Mesh Component にある「影」section で扱う。
- Assets から Material を Entity Inspector の slot または Scene View の Mesh へ drag できる。hover 中は対象 Entity / slot と置換前後の Material 名を表示し、drop は `AssignMaterialCommand` 一件にする。複数 slot が曖昧なら drop 前に slot chooser を開き、推測適用しない。
- Assets から Texture を Material Inspector の対応 slot へ drag できる。用途が base color / emissive なら sRGB、metallic-roughness / normal / occlusion なら linear の recipe を提案し、既存 recipe と衝突する場合は確定前に選択肢を示す。
- Entity 固有の Material override を追加する場合は、共有 Material Asset の編集とは別の明示的 Component / Command にし、現在どちらを編集しているか header と field group で区別する。
- Entity の値は SceneDocument、Asset の値は AssetManifest に反映する。Inspector context を切り替えても `sceneSelection` と `assetSelection` は維持する。
- Play 中はすべて読み取り専用にし、runtime の値を SceneDocument や AssetManifest へ書き戻さない。任意の JSX、スクリプト、式を評価して properties を生成しない。
- Component Registry により Mesh、Light、Collider、Particle、Spawn Point と typed XRift component を追加する。

### Assets

- Assets は探索、検索、folder 整理、selection、drag source、import status に専念し、Material / Texture property form を下部へ埋め込まない。Box、Sphere、Plane などは保存対象 Asset ではなく、Hierarchy / Scene View の右クリック Create submenu と toolbar の Create palette から作る primitive とする。
- Assets に表示するユーザー管理対象は Model / GLTF、Texture、Material、Prefab、Particle とし、安定 ID、表示名、種別、状態、thumbnail を持たせる。
- 一回のクリックは `assetSelection` を変えて右 Inspector を Asset context へ切り替える。Model / Prefab の Scene View への drag または「配置」だけが Entity を作り、Material の drag は Mesh slot binding、Texture の drag は Material texture slot reference を変更する。
- Create palette の primitive と、Model、Texture、Material、Prefab、Particle を見た目とラベルの両方で区別する。検索と filter は表示名、kind、diagnostic status を対象にする。
- thumbnail は `pending -> generating -> ready | failed | stale` の lifecycle を持つ動的な derived view とする。source、Material property、dependency、thumbnail recipe の変更を検知して background queue で再生成する。Model / Prefab は固定 camera、Material は基準球、Texture は用途の色空間、Particle は代表時刻を使い、選択中または hover 中だけ budget 内で orbit / particle loop など短い live preview を許す。
- Texture / GLB / GLTF の外部 drag-and-drop は Import Queue で検証、source copy、derived / thumbnail 生成、manifest commit まで実行する。import 完了前に Scene や Material slot の参照を確定せず、成功後は Asset を右 Inspector で編集できる。
- 非対応形式はシーンを変更せず、対応形式と次の操作を表示する。
- folder は Asset ID と別の安定 `folderId` を持つ表示上の整理単位とし、source / derived の実ファイル path を folder 移動だけで変更しない。空白部または folder の context menu から「Material / Prefab / Particle を作成」「Model / Texture をインポート」「新しいフォルダー」を選べる。Asset の context menu には「名前を変更」「複製」「削除」「参照元を表示」「再インポート」「サムネイルを再生成」を kind と状態に応じて出す。
- 削除前には参照中の Entity、Prefab、Material slot 件数を示す。参照を壊す削除は暗黙に続けず、置換または明示的な参照解除を同じ Command Transaction に含める。

### Resizable / dockable layout

- Hierarchy、Scene View、Inspector、Assets は splitter で resize でき、Hierarchy / Inspector / Assets は定義済み dock zone へ移動できる。drag 中は drop preview と最終 panel order を表示し、Escape または領域外 drop は layout を変えない。
- layout は `layoutSchemaVersion`、panel ID、dock zone、order、size ratio、collapsed / pinned inspector tabs として Editor Preferences に保存する。pixel absolute 値だけを保存せず、window size と minimum width / height に合わせて正規化する。Asset、Scene、selection など authoring data は layout document へ入れない。
- 起動、window resize、project kind 切替で saved layout を復元し、存在しない panel ID、画面外 floating rect、minimum 未満の size は safe default へ migration する。「レイアウトをリセット」で既定の左 Hierarchy、中央 Scene View、右 Inspector、下 Assets へ戻せる。
- panel resize / dock の最中は authoring Undo 履歴を増やさない。Preferences save 失敗でも編集を止めず、その session の layout と再試行を保つ。

### 視覚基準

- エディターは明るい neutral surface を既定 theme とし、白から neutral-50 の panel、neutral-200 の境界、neutral-900 の本文を使う。3D View の背景色や Asset thumbnail の内容色を theme の代わりにしない。将来 dark theme を追加しても semantic color token と contrast 基準は共有する。
- UI font は OS の system sans-serif を基準とし、本文 13px、補助情報 12px、panel 見出し 14px、画面見出し 16px を最小基準にする。Asset 名や Entity 名を 12px 未満へ縮めない。
- 本文は neutral-900、補助情報は neutral-600、無効状態は neutral-400、境界は neutral-200 を基準にする。brand color は選択、主操作、focus ring に限定し、warning / error / success は色と短い文言を併用する。
- 基本 spacing は 4px grid とし、field 内 4px、field 間 8px、section 内 12px、panel 内 16px を基準にする。Hierarchy row と Asset row の hit area は最低 32px、主要 button は最低 36px とする。
- 数値 label、単位、入力欄の列を揃え、3軸値は X / Y / Z を色だけでなく文字でも示す。keyboard focus は 2px 以上の輪郭で示し、hover と同じ見た目にしない。
- panel resize 後も Hierarchy、Scene View、Inspector、Assets の主 surface を見失わない。狭い幅では Hierarchy / Inspector / Assets を collapsed tab にできるが、active inspector context、選択対象、未保存状態を header に残す。

### Icon Registry と inventory

すべての操作 icon は `lucide-react` の既存 export を中央 `IconRegistry` から semantic token で参照する。各 component が Lucide 名を直接選ばず、`editor.play` のような用途名を要求する。他製品の icon asset のコピー、既存製品に似せた custom SVG の生成、文字を図形化した独自 icon は行わない。stroke は原則 `1.9`、toolbar は 18px、row / field は 16px、空状態は 24px を基準にし、装飾目的でサイズや stroke を変えない。

icon だけの button は必ず同じ語の visible tooltip と `aria-label` を持つ。shortcut は Shortcut Registry から tooltip 末尾へ自動付与し、shortcut がない場合は操作名だけを表示する。状態色は semantic token であり、色だけで状態を伝えない。`neutral` は neutral-600、`active` は brand-600 と brand-50 背景、`success` は emerald-600、`warning` は amber-700、`error/destructive` は rose-600、`disabled` は neutral-400 を起点にする。

| Semantic token | Lucide export | 用途 / visible label | 既定 tooltip | Shortcut | 状態色 |
| --- | --- | --- | --- | --- | --- |
| `project.world` | `Globe2` | ワールド | ワールドを作成 | なし | neutral / 選択時 active |
| `project.item` | `Box` | アイテム | アイテムを作成 | なし | neutral / 選択時 active |
| `project.classic` | `Code2` | クラシック | コードで作成 | なし | neutral / 選択時 active |
| `project.visual` | `PanelsTopLeft` | ビジュアル | ビジュアルエディターで作成 | なし | neutral / 選択時 active |
| `create.primitive` | `Cuboid` | プリミティブ | プリミティブを作成 | なし | neutral |
| `asset.model` | `Boxes` | Model / GLTF | モデル | なし | kind fallback の neutral |
| `asset.texture` | `Image` | Texture | テクスチャ | なし | kind fallback の neutral |
| `asset.material` | `Palette` | Material | マテリアル | なし | kind fallback の neutral |
| `asset.prefab` | `Package` | Prefab | プレハブ | なし | kind fallback の neutral |
| `asset.particle` | `Sparkles` | Particle | パーティクル | なし | kind fallback の neutral |
| `asset.folder` | `Folder` / `FolderOpen` | フォルダー | フォルダーを開く / 閉じる | なし | neutral / drop target は active |
| `asset.import` | `HardDriveUpload` | インポート | Model または Texture をインポート | なし | neutral |
| `asset.reimport` | `RefreshCw` | 再インポート | Source から再インポート | なし | neutral / 実行中 active |
| `asset.new-folder` | `FolderPlus` | 新しいフォルダー | 新しいフォルダー | なし | neutral |
| `asset.new-prefab` | `PackagePlus` | Prefab を作成 | 選択 Entity から Prefab を作成 | なし | neutral |
| `edit.select` | `MousePointer2` | 選択 | 選択ツール | なし | 押下中 active |
| `edit.move` | `Move3d` | 移動 | 移動ツール | `W` | 押下中 active |
| `edit.rotate` | `Rotate3d` | 回転 | 回転ツール | `E` | 押下中 active |
| `edit.scale` | `Scale3d` | 拡大縮小 | 拡大縮小ツール | `R` | 押下中 active |
| `edit.focus` | `Focus` | 選択へフォーカス | 選択へフォーカス | `F` | neutral |
| `edit.copy` | `Copy` | コピー | コピー | `Ctrl/Cmd+C` | neutral |
| `edit.paste` | `ClipboardPaste` | 貼り付け | 貼り付け | `Ctrl/Cmd+V` | neutral / 不可時 disabled |
| `edit.duplicate` | `CopyPlus` | 複製 | 複製 | `Ctrl/Cmd+D` | neutral |
| `edit.delete` | `Trash2` | 削除 | 削除 | `Delete` | destructive |
| `history.undo` | `Undo2` | 元に戻す | 元に戻す | `Ctrl/Cmd+Z` | neutral / 履歴なし disabled |
| `history.redo` | `Redo2` | やり直す | やり直す | `Ctrl/Cmd+Shift+Z` | neutral / 履歴なし disabled |
| `project.save` | `Save` | 保存 | 保存 | `Ctrl/Cmd+S` | neutral / 保存中 active |
| `preview.play` | `Play` | Play | Play | `Ctrl/Cmd+Enter` | active |
| `preview.stop` | `Square` | Stop | Stop | `Ctrl/Cmd+Enter` | active |
| `publish.upload` | `CloudUpload` | アップロード | XRift へアップロード | なし | active / 実行中 active |
| `status.ready` | `CircleCheck` | 準備完了 | 準備完了 | なし | success |
| `status.info` | `Info` | 情報 | 詳細を表示 | なし | active |
| `status.warning` | `TriangleAlert` | 警告 | 警告を表示 | なし | warning |
| `status.error` | `CircleX` | エラー | エラーを表示 | なし | error |
| `status.loading` | `LoaderCircle` | 処理中 | 処理中 | なし | active、回転 motion |

Model、Texture、Material は `thumbnail.status === ready` なら generated thumbnail を第一表示にする。Prefab と Particle も生成可能なら同じ規則を使う。kind icon は thumbnail が未生成、失敗、または表示不能な場合だけ fallback とし、失敗時は kind icon に status badge とテキストを加える。generated thumbnail の上へ製品固有の装飾 icon や Lucide icon を常時重ねない。

## 4. ビジュアル project の document model

### 4.1 三つの正本

ビジュアル project は、役割の異なる三つの versioned document を正本にする。

```text
VisualProjectDocument (xrift-studio.project.json)
  ├─ entrySceneId + scenePaths ─> SceneDocument (scenes/main.scene.json)
  └─ assetManifestPath ─────────> AssetManifest (assets/assets.json)
                             ↑
SceneDocument の mesh component ─ asset ID 参照 ─┘
```

- `VisualProjectDocument` は project kind、entry scene ID、scene paths、asset manifest path、metadata を定義する。
- `SceneDocument` は Entity、親子関係、Component、Asset ID 参照だけを持つ。Asset 本体や Material 値を埋め込まない。
- `AssetManifest` の製品 schema は Model / GLTF、Texture、Material、Prefab、Particle、source metadata、再生成可能な derived metadata を持つ。0.1 の内部 primitive と `template` は migration 入力としてだけ受け入れる。
- 三 document はそれぞれ `schemaVersion` を持ち、別々に validation と migration を行う。
- ID は表示名や相対パスを変更しても変えない。参照はファイル名ではなく ID で解決する。

三つは project を開くための root document である。VisualProjectDocument は `assetFoldersPath` と `saveCommitId` / committed hash set を持ち、Prefab Asset が参照する Prefab SceneDocument と folder document も versioned save set に含める。Prefab や folder を AssetManifest へ巨大な inline JSON として埋め込まない。

### 4.2 VisualProjectDocument

`xrift-studio.project.json` は Tauri library と compiler が最初に読む manifest である。

```json
{
  "schemaVersion": "0.1.0",
  "projectId": "project_01jvisual",
  "projectKind": "world",
  "metadata": {
    "name": "garden-world",
    "title": "Garden World",
    "description": "A world authored in XRift Studio",
    "createdAt": "2026-07-20T00:00:00.000Z",
    "updatedAt": "2026-07-20T00:00:00.000Z"
  },
  "entrySceneId": "scene_main",
  "scenePaths": {
    "scene_main": "scenes/main.scene.json"
  },
  "assetManifestPath": "assets/assets.json"
}
```

visual の判定は root の manifest filename と schema で行い、classic project から field 推測しない。`entrySceneId` は `scenePaths` に存在し、すべての path は project root 相対でなければならない。Compiler と PlaySession は `projectKind` から world / item profile を選び、item project を world adapter で生成しない。

### 4.3 SceneDocument

SceneDocument は ECS に着想を得た正規化 Entity graph である。初期段階では system scheduler、query、独自 runtime ECS を持たない。

```json
{
  "schemaVersion": "0.1.0",
  "sceneId": "scene_main",
  "name": "Main",
  "rootEntityIds": ["entity_floor", "entity_gate"],
  "entities": {
    "entity_floor": {
      "id": "entity_floor",
      "name": "Floor",
      "parentId": null,
      "children": [],
      "enabled": true,
      "components": [
        {
          "id": "component_floor_transform",
          "type": "transform",
          "enabled": true,
          "position": [0, 0, 0],
          "rotation": [0, 0, 0],
          "scale": [8, 0.2, 8]
        },
        {
          "id": "component_floor_mesh",
          "type": "mesh",
          "enabled": true,
          "geometryAssetId": "asset_primitive_box",
          "materialBindings": [
            { "slot": "default", "materialAssetId": "asset_material_stone" }
          ],
          "castShadow": false,
          "receiveShadow": true
        }
      ]
    },
    "entity_gate": {
      "id": "entity_gate",
      "name": "Gate",
      "parentId": null,
      "children": [],
      "enabled": true,
      "components": [
        {
          "id": "component_gate_transform",
          "type": "transform",
          "enabled": true,
          "position": [0, 0, -3],
          "rotation": [0, 0, 0],
          "scale": [1, 1, 1]
        },
        {
          "id": "component_gate_mesh",
          "type": "mesh",
          "enabled": true,
          "geometryAssetId": "asset_model_gate",
          "materialBindings": [
            { "slot": "default", "materialAssetId": "asset_material_stone" }
          ],
          "castShadow": true,
          "receiveShadow": true
        }
      ]
    }
  }
}
```

0.1 の `geometryAssetId` は内部 `primitive` または `model` Asset を参照する migration 入力である。製品 schema は user-facing Asset ではない primitive を `geometry: { kind: "builtin", primitive: "box" }` のような typed Create Registry reference へ移し、Model だけを Asset ID 参照にする。`materialBindings[].materialAssetId` は `material` Asset だけを参照する。上の二 Entity は同じ Material Asset を共有するため、Material の変更は両方へ反映される。Entity 固有 override は共有 Asset の編集とは別の versioned component として扱う。

### 4.4 AssetManifest

AssetManifest は SceneDocument から独立し、右 Inspector の Asset context と importer の正本になる。

```json
{
  "schemaVersion": "0.1.0",
  "assets": {
    "asset_primitive_box": {
      "id": "asset_primitive_box",
      "name": "Box",
      "kind": "primitive",
      "status": "ready",
      "source": { "kind": "builtin", "key": "primitive/box" },
      "primitive": "box",
      "defaultMaterialAssetId": "asset_material_stone"
    },
    "asset_model_gate": {
      "id": "asset_model_gate",
      "name": "Garden Gate",
      "kind": "model",
      "status": "ready",
      "source": {
        "kind": "project",
        "relativePath": "assets/source/asset_model_gate/garden-gate.glb"
      },
      "importSettings": {
        "scale": 1,
        "generateColliders": false,
        "optimizeMeshes": true,
        "importAnimations": true
      }
    },
    "asset_material_stone": {
      "id": "asset_material_stone",
      "name": "Stone",
      "kind": "material",
      "status": "ready",
      "source": { "kind": "document" },
      "properties": {
        "color": "#b8b2a7",
        "metalness": 0.05,
        "roughness": 0.86,
        "baseColorTextureId": "asset_texture_stone"
      }
    },
    "asset_texture_stone": {
      "id": "asset_texture_stone",
      "name": "Stone Base Color",
      "kind": "texture",
      "status": "ready",
      "source": {
        "kind": "project",
        "relativePath": "assets/source/asset_texture_stone/stone-base-color.png"
      },
      "importSettings": {
        "colorSpace": "srgb",
        "generateMipmaps": true,
        "flipY": false
      }
    },
    "asset_particle_fireflies": {
      "id": "asset_particle_fireflies",
      "name": "Fireflies",
      "kind": "particle",
      "status": "ready",
      "source": { "kind": "document" },
      "properties": {
        "maxParticles": 256,
        "duration": 4,
        "looping": true
      }
    },
    "asset_template_lamp": {
      "id": "asset_template_lamp",
      "name": "Garden Lamp",
      "kind": "template",
      "status": "ready",
      "source": { "kind": "document" },
      "templatePath": "scenes/templates/garden-lamp.scene.json"
    }
  }
}
```

0.1 schema の `primitive | model | material | texture | particle | template` discriminated union は migration input である。読み込み時に `template` を user-facing 名と一致する `prefab` へ migration し、組み込み primitive は Create Registry reference へ移す。旧 `templatePath` は `prefabDocumentPath` として検証し、未知 kind へ推測変換しない。製品 schema の `source.kind = "project"` にある `relativePath` は project root 相対の `/` 区切りへ正規化し、OS の絶対パス、Blob URL、token を保存しない。

製品 schema の Model / Texture Asset は次の metadata を持つ。0.1 JSON を読み込む場合は migration 後に追加し、旧 document へ field を無秩序に混在させない。

```json
{
  "sourceMetadata": {
    "mediaType": "model/gltf-binary",
    "byteLength": 184320,
    "sha256": "sha256:source-content-hash"
  },
  "derived": {
    "status": "ready",
    "importerVersion": "gltf-importer@1",
    "sourceHash": "sha256:source-content-hash",
    "artifacts": [
      {
        "role": "runtime-model",
        "relativePath": ".cache/assets/asset_model_gate/garden-gate.glb",
        "mediaType": "model/gltf-binary"
      }
    ]
  }
}
```

derived は source hash と importer version から再生成できる cache とし、欠落しても source から復元できる。

### 4.5 EditorSession と Editor State

`EditorSession` は読み込んだ三つの root document、参照される Prefab / folder document と一時状態を束ねるが、document 自体と同一視しない。

```text
EditorSession
  project: VisualProjectDocument
  scene: SceneDocument
  assets: AssetManifest
  sceneSelection: { kind: "entity", entityIds: string[], primaryId: string } | null
  assetSelection: { kind: "asset", assetIds: string[], primaryId: string } | null
  inspectorContext: { kind: "entity", entityId: string } | { kind: "asset", assetId: string } | null
  mode: "edit" | "play"
  history: CommandHistory
  importQueue: ImportQueueEntry[]
  revisions: { project: number, scene: number, assets: number }
```

Scene View、Hierarchy、Assets、Inspector は document を直接書き換えず、EditorSession へ Command または Intent を渡す。

- `SelectEntityIntent` は `sceneSelection` を変え、Scene View、Hierarchy、右 Inspector の Entity context を同期する。`SelectAssetIntent` は独立した `assetSelection` を変え、Assets と右 Inspector の Asset context を同期する。どちらも通常の選択だけでは Undo 履歴に入れない。
- Material や Texture を選択しても `sceneSelection` を解除しない。右 Inspector は `inspectorContext` に従って Asset properties を表示し、header の pinned Entity tab から保持済み `sceneSelection` へ戻れる。Entity を選び直しても `assetSelection` は明示的な Asset 選択解除まで保持する。
- `PlaceAssetIntent` は Asset ID と drop point を検証し、SceneDocument に Entity を追加する Command へ変換する。
- `ImportFilesIntent` は外部 File を Import Queue へ渡し、成功するまで SceneDocument と AssetManifest を変えない。
- `UpdateEntityComponentCommand` は SceneDocument、`UpdateAssetCommand` は AssetManifest だけを変更する。
- document の変更は対象 revision を増やし、保存成功時の revision と比較して未保存状態を決める。

カメラ位置、panel layout、検索、hover、`inspectorContext`、ギズモ操作中の一時値は Editor State であり、authoring document や authoring Undo 履歴に入れない。panel layout は別の versioned Editor Preferences として保存する。Place、Material assign、duplicate、delete、Prefab 作成など document と選択を同時に変える Command は、前後の `sceneSelection` と `assetSelection` を一つの selection snapshot として履歴へ持つ。

### 4.6 PlaySession と runtime profile

Play の実行中だけ存在する値は `PlaySession` の Editor Runtime State とする。SceneDocument と AssetManifest の snapshot から authoring object と参照を共有しない runtime scene を作り、Stop で必ず破棄する。中央は通常のScene Viewから境界とheaderが異なる`Play Window`へ切り替え、HierarchyとInspectorが編集データ、Play Windowが実行コピーを表示していることを同時に読めるようにする。

- `WorldPlayProfile`: spawn の解決、world navigation、将来の character / physics runtime を組み立てる。
- `ItemPreviewProfile`: XRift から渡される item transform、preview stage、camera、interaction を組み立てる。player spawn を前提にしない。
- `InputAdapter`: keyboard、gamepad、XR controller などを正規化した action へ変換する。
- `ControllerPlugin`: action から runtime avatar または preview target の状態を更新する。
- `PhysicsRuntimePlugin`: collision、gravity、step を担当する。未導入時は明示的な no-physics 実装を使う。
- `RuntimePlugin`: `start`、`update`、`stop`、`dispose` の lifecycle を持つ。
- `entityRevisions`: Entity IDごとのruntime世代。許可されたauthoring変更を反映する時だけ対象Entityを増分し、そのEntityのplugin、animation mixer、physics bodyをdisposeして再生成する。

World Preview の keyboard / gamepad / XR action は `InputAdapter`、移動と physics は登録済み `ControllerPlugin` / `PhysicsRuntimePlugin` で処理する。controller 固有の一時 runtime state を project document へ保存せず、Item Preview Profile には world navigation を適用しない。

Play中もEntity選択と、選択EntityのTransform、Collider、Animationに限ってauthoring Commandを許可する。これらは通常どおりUndo履歴と自動保存へ入り、PlaySessionは更新後のruntime inputをコピーして対象Entityのrevisionだけを増やす。Hierarchy構造、Entity追加・削除、Asset、Material、Scene settings、ギズモ、drop、AI書き込みは無効にする。Stopはinput listener、animation frame、controller、physics、XRSessionをdisposeし、runtimeの位置や速度をdocumentへ書き戻さず、最新のauthoring SceneDocument / AssetManifestとEditの選択・カメラへ戻す。

### 4.7 Component / Asset Registry

Inspector、validation、compiler の食い違いを防ぐため、Component `type` と Asset `kind` ごとに target-neutral な schema、default、対応 project kind、Inspector field、reference rule を一か所へ定義する。Three preview、R3F、XRift world、XRift item の adapter は別層に置き、同じ Component type / Asset kind へ登録する。未知 type / kind または対応 adapter の欠落は無視して続行せず、document path、Entity / Asset ID、field、target を含む診断にする。

#### 0.1 compatibility input

0.1 Material Asset は次の最小 schema で保存されていた。製品エディターは読み込み時に product Material schema へ migration し、この形を編集・再保存の出力にはしない。

| Field | 保存先 | 値と検証 | 反映 |
| --- | --- | --- | --- |
| `properties.color` | AssetManifest | `#rrggbb` | 参照する全 Mesh の base color RGB |
| `properties.metalness` | AssetManifest | 有限数かつ `0..1` | 参照する全 Mesh の metalness |
| `properties.roughness` | AssetManifest | 有限数かつ `0..1` | 参照する全 Mesh の roughness |
| `properties.*TextureId` | AssetManifest | 存在する Texture Asset ID または未設定 | 簡易 texture 参照 |
| `materialBindings[]` | SceneDocument / Mesh Component | 一意な slot と存在する Material Asset ID | mesh primitive と Material Asset の参照 |

0.1 の color、metalness、roughness、texture ID は base color、metallic / roughness factor と typed TextureInfo へ migration する。情報がなかった alpha、emissive、normal、occlusion、sampler、texture transform、extension は glTF 既定値または未設定として明示し、推測した画像や mode を追加しない。変更は `UpdateAssetCommand` として AssetManifest にだけ保存し、Play 中は読み取り専用にする。

#### Product schema: glTF 2.0 core Material

製品 schema は Khronos glTF 2.0 core の metallic-roughness Material を欠落なく typed schema として持ち、import、右 Inspector、preview、compiler で同じ field を使う。0.1 JSON は versioned migration を通した後だけこの schema へ保存する。

| glTF core field | Authoring 表現と既定値 | 検証と意味 |
| --- | --- | --- |
| `pbrMetallicRoughness.baseColorFactor` | RGBA `[1, 1, 1, 1]` | 4要素すべて有限数かつ `0..1`。texture と乗算する。A は alpha coverage |
| `pbrMetallicRoughness.baseColorTexture` | `TextureInfo` または未設定 | RGB は sRGB、A は linear。premultiplied alpha にしない |
| `pbrMetallicRoughness.metallicFactor` | `1` | 有限数かつ `0..1`。metallic-roughness texture の B channel と乗算 |
| `pbrMetallicRoughness.roughnessFactor` | `1` | 有限数かつ `0..1`。metallic-roughness texture の G channel と乗算 |
| `pbrMetallicRoughness.metallicRoughnessTexture` | `TextureInfo` または未設定 | linear。G=roughness、B=metalness。R/A はこの用途では無視 |
| `normalTexture` | `NormalTextureInfo` または未設定 | linear tangent-space RGB、`scale` 既定 `1`。A は無視 |
| `occlusionTexture` | `OcclusionTextureInfo` または未設定 | linear R channel、`strength` 既定 `1` かつ `0..1` |
| `emissiveTexture` | `TextureInfo` または未設定 | RGB は sRGB、A は無視 |
| `emissiveFactor` | RGB `[0, 0, 0]` | 3要素すべて有限数かつ `0..1`。emissive texture と乗算 |
| `alphaMode` | `OPAQUE` | `OPAQUE | MASK | BLEND`。base color alpha の解釈を決める |
| `alphaCutoff` | `0.5` | `MASK` の時だけ有効な有限数かつ `>= 0`。他 mode では保存・出力しない |
| `doubleSided` | `false` | true では back-face culling を無効にし、裏面法線を反転して評価する |

Opacity は独立した曖昧な `opacity` field にしない。`baseColorFactor[3]` と `baseColorTexture` の alpha を乗算し、`alphaMode` と `alphaCutoff` で解釈する。UI の「透明度」はこの関係を一つの section で示し、alpha を変えただけで `alphaMode` を暗黙に `BLEND` へ変えない。

`TextureInfo` の core と extension は次のように分ける。

| Field | glTF 区分 | Authoring の扱い |
| --- | --- | --- |
| texture `index` | core | `textureAssetId` として安定 ID 参照へ変換する |
| `texCoord` | core | `TEXCOORD_n` の `n`。既定 `0`。対象 primitive に同じ attribute が必要 |
| normal `scale` | core specialized TextureInfo | normal X/Y の強度。Texture Asset 全体ではなく Material slot に保存 |
| occlusion `strength` | core specialized TextureInfo | occlusion の強度。Material slot に保存 |
| `offset`、`rotation`、`scale` | `KHR_texture_transform` extension | core field と混ぜず、typed extension block に保存。offset `[0,0]`、rotation `0` radians、scale `[1,1]` |
| extension 内 `texCoord` | `KHR_texture_transform` extension | extension 対応時に core `texCoord` を上書きする。core field とは別に表示する |

`KHR_texture_transform` の `extensionsUsed` / `extensionsRequired` と fallback UV の有無も診断する。任意の extension JSON を Material Asset へ流し込まず、Registry に登録した typed extension だけを active authoring data として扱う。

色空間はファイルの ICC profile ではなく Material slot の用途で決める。base color と emissive の RGB は sRGB decode、metallic-roughness、normal、occlusion、alpha は linear とする。同じ source image を異なる用途で共有する場合、source を複製せず、用途別 recipe / derived artifact を分ける。Inspector には「sRGB画像」ではなく「Base Color: sRGB」「Normal: Linear」のように参照先の意味を表示する。

#### Material slot、影、import の対応

glTF は一つの mesh に複数の mesh primitive を持ち、各 primitive が Material を一つ参照できる。Model importer は material 名だけでなく、mesh index、primitive index、元 material index から安定した slot ID を作り、Model Asset の derived metadata に slot 一覧を持つ。`MeshComponent.materialBindings[]` は slot ID ごとに Material Asset ID を一つ参照し、slot 重複、欠落、別 kind の参照を validation error にする。組み込み primitive は `default` slot 一件を使う。

再 import で primitive 構成が変わった場合は、元 index、名前、構造 fingerprint の順に binding を照合する。自動対応できない binding は削除や別 slot への推測をせず `stale-binding` diagnostic とし、右 Inspector から置換先を選べるようにする。

`castShadow` と `receiveShadow` は XRift Studio の Mesh Component / target adapter 用 authoring 設定であり、glTF 2.0 core Material field ではない。glTF import では profile の既定値を入れ、Material から推測しない。glTF へ再出力する場合も Material JSON へ追加せず、XRift compiler adapter が runtime 設定として扱う。`doubleSided` は Material、影は Entity / Mesh と、UI section と保存先を分ける。

#### Material extension Registry

製品 schema は core metallic-roughness を完全対応し、extension を core field のように見せない。最初の typed Material extension は `KHR_materials_iridescence` とし、`iridescenceFactor`、`iridescenceTexture`、`iridescenceIor`、`iridescenceThicknessMinimum`、`iridescenceThicknessMaximum`、`iridescenceThicknessTexture` を Khronos schema に沿って一つの extension adapter で扱う。factor 既定 `0`、IOR 既定 `1.3`、thickness 既定 `100nm..400nm` とし、iridescence texture の linear R channel と thickness texture の linear G channel を使う。minimum が maximum を超える値は確定せず、`KHR_materials_unlit` との同時利用も拒否する。

`KHR_materials_clearcoat`、`KHR_materials_transmission`、`KHR_materials_ior`、`KHR_materials_volume`、`KHR_materials_sheen`、`KHR_materials_specular`、`KHR_materials_anisotropy`、`KHR_materials_emissive_strength`、`KHR_materials_unlit`、`KHR_materials_dispersion` などは後続候補として Registry へ一つずつ typed adapter、validation、Inspector section、preview adapter、compiler adapter を登録する。未対応の `extensionsRequired` がある model は ready にせず、extension 名と対応策を示す。未対応の optional extension は core fallback の preview と差異が出ることを診断し、source は非破壊で保持する。

`KHR_texture_basisu` と `EXT_texture_webp` は Material model ではなく Texture source を差し替える glTF extension として別 Registry に置く。KTX2 / WebP を core PNG / JPEG と同一 field のように保存しない。

#### Material Asset の新規作成

Assets の「作成」から「Material」を選び、名前と authoring preset を指定する。既定 preset は「標準サーフェス」として白、不透明、metallic `0`、roughness `0.7`、double-sided off を明示し、Khronos core の省略時既定値と同一だと誤解させない。「glTF 既定値」preset を選んだ場合だけ metallic / roughness を `1` にする。

作成成功では `source.kind = "document"` の Material Asset を一つ AssetManifest に追加し、Assets で選択して右 Inspector に表示する。Entity や material slot へ自動 binding しない。空の名前、重複 ID、無効な preset では AssetManifest、selection、history を変えず、field 近くに修正方法を示す。表示名の重複は許して ID で識別し、必要なら同名件数を表示する。取消では Assets の直前 selection と Inspector context へ戻る。

#### Particle と XRift Component Registry

Component Registry は「保存 schema」と「各 target で実行できる adapter」を分離し、少なくとも次を登録単位にする。

```text
ComponentDefinition
  type / schemaVersion / displayName / semanticIcon
  allowedProjectKinds / defaults / inspectorSections
  referenceFields / validation / migration
  previewAdapter / worldCompilerAdapter / itemCompilerAdapter
```

基礎 component は Transform、Mesh、Light、Collider、Spawn Point とする。Particle は Particle Asset に emitter、shape、lifetime、rate、size / color curve、Material / Texture 参照などの再利用可能な effect definition を持たせ、Entity の `ParticleRendererComponent` は Particle Asset ID と Entity 固有の play / loop / seed 設定だけを参照する。Particle の値を Mesh や Entity へ inline copy しない。

XRift 固有 component は `xrift.*` namespace と明示的な world / item profile を持たせる。Registry に schema、Inspector、preview、対象 compiler adapter がすべて揃った component だけを作成可能にし、任意の JavaScript component や文字列で指定された module を visual document からロードしない。preview adapter がないが compiler adapter はある場合は「Preview 未対応」を表示し、偽の見た目で代用しない。target に対応しない component は保存時 warning、compile 前 error とし、別 project kind 向けに黙って削除しない。

2026 年 7 月の [公式 API リファレンス](https://docs.xrift.net/world-components/components/) と [`@xrift/world-components` 0.43.0 の公開 export](https://github.com/WebXR-JP/xrift-world-components/blob/main/src/index.ts) を照合し、authoring Registry は `Interactable`、`Grabbable`、`Mirror`、`Skybox`、`VideoScreen`、`VideoPlayer`、`LiveVideoPlayer`、`Video180Sphere`、`ScreenShareDisplay`、`SpawnPoint`、`TextInput`、`TagBoard`、`EntryLogBoard`、`Portal`、`BillboardY` を型付きで扱う。生成コードは実際にインストールされる package の公開 Props を優先し、例えば現行 `VideoScreen` は `src` ではなく必須の `id` と任意の `url` を出力し、`sync` は `VideoPlayer` ではなく `LiveVideoPlayer` にだけ出力する。

`EntryLogBoard` の nested partial object は JSON object として schema 検証し、関数型の `formatTimestamp` / `onJoin` / `onLeave` は visual document にコードを保存せず package 既定動作へ委ねる。`Interactable` の必須 `onInteract` は固定の no-op adapter を生成し、任意コードを document から注入しない。`DevEnvironment` はローカル起動 wrapper であり Scene authoring component にはしない。Box / Mesh Collider は `@xrift/world-components` の export ではなく Rapier の物理 component として、汎用 Collider Registry と compiler adapter で扱う。

## 5. XRift Studio のコード境界

### 5.1 責務分離の方針

ビジュアルエディターは、次の責務を明確な境界で分ける。

- authoring document と schema: Scene、Asset、Material、Prefab の永続データと migration
- editor session: query、selection、command、history、reference 解決
- React UI: Hierarchy、Scene View、Inspector、Assets と操作状態
- preview / play runtime: Three.js による編集表示と成果物種別ごとの実行環境
- native processing: Tauri によるファイル操作、CLI、変換、検査、upload
- generated outputs: thumbnail、texture 変換、staging artifact などの再生成可能な成果物

monorepo 化自体を目的にせず、Scene Data、Editor API、UI、runtime、native processing の依存方向と実行境界を先に固定する。

### 5.2 現時点の判断: package-ready modular monolith

XRift Studio は現在の単一 package を維持し、document / command / asset processing / UI の module boundary を固定する。全面的な monorepo 化は build、型解決、Tauri path、Preview 配布設定を同時変更するため、独立 runtime または複数 consumer が生じるまで行わない。

ただし、後から抽出できるよう、最初から依存方向を固定する。

```text
src/lib/visual-editor/
  project-document.ts     VisualProjectDocument
  scene-document.ts       SceneDocument
  asset-manifest.ts       AssetManifest
  schema/                 component / asset schema、migration、reference validation
  selection.ts            sceneSelection / assetSelection と snapshot
  commands.ts             Command、CommandDispatcher、transaction
  history.ts              Undo / Redo と selection snapshot
  asset-api.ts            Asset query、参照数、import intent
  drop-intents.ts         Scene drop と external file drop の判別
  runtime-profile.ts      World Play / Item Preview の抽象契約
  play-session.ts         World / Item profile と runtime lifecycle
  editor-session.ts       上記 API を束ねる façade
  compiler-contract.ts    visual documents、診断、staging output の契約

src/components/visual-editor/
  VisualEditor.tsx
  hierarchy/
  viewport/
  inspector/
  assets/
```

依存方向は `components/visual-editor -> EditorSession façade -> documents / commands / asset API / play session` の一方向にする。`lib/visual-editor` は React、Three.js、Tauri、DOM に依存させない。UI は最終的に document mutator を直接 import せず、typed Selection、query と Command / Intent だけを EditorSession へ渡す。これにより Hierarchy、Viewport、Inspector、Assets が独自の履歴や参照解決を持つことを防ぐ。

entity、asset、selection、history、schema を画面実装から分けるため、XRift Studio では次を一つの EditorSession 境界として扱う。

- 独立した typed `SceneSelection` と `AssetSelection`、両方を束ねる `SelectionSnapshot`
- `CommandDispatcher` と `CommandHistory`
- Asset query / import / reference API
- Component / Asset Schema と Reference API
- `DropIntent = PlaceAssetIntent | ImportFilesIntent`
- `PlaySession = WorldPlaySession | ItemPreviewSession`

描画は snapshot を読み、変更は Command を発行する。ネイティブのファイル操作と CLI 実行は既存の `src/lib/tauri.ts` と `src/lib/xrift-cli.ts` の境界を越えて呼ぶ。

この境界に属する export だけを公開し、UI から内部オブジェクトを直接書き換えない。機能を移動する時も import 互換を一時的な re-export で保つ。

### 5.3 monorepo へ移る判断条件

次のいずれかが強い独立 runtime / consumer / release boundary として実際に発生した時点、または複数の弱い兆候が継続した時点で pnpm workspace への移行を決める。「二つ以上」を機械的な必須条件にはしない。

1. デスクトップアプリと Web エディターが、それぞれ独立した配布周期を持つ。
2. Compiler を CLI や CI から UI なしで利用する、二つ目の実利用者ができる。または compiler 自体が独立 runtime として配布・version 管理を必要とする。
3. Asset Processor を Worker、Node.js、WASM など別 runtime で実行する。
4. VisualProjectDocument / SceneDocument / AssetManifest または Registry を公開 API として SemVer 管理する必要が出る。
5. アプリ全体を起動しないと core の test ができず、開発フィードバックが継続的に遅くなる。
6. Tauri 専用依存と Web 専用依存の分離が、条件分岐や bundle サイズの問題を実際に起こす。

ファイル数や見た目上の整理だけを移行理由にしない。逆に、上の条件が満たされた後も単一 package に留めると runtime 境界とリリース境界が曖昧になるため、その段階では monorepo 化を採る。

### 5.4 段階的な移行案

全面移行を一度に行わず、利用者が確定した package から抽出する。

1. 単一 package 内で `lib/visual-editor` を純粋ロジック、`components/visual-editor` を UI として分離する。
2. format の Editor / Compiler consumer が独立 release または runtime を必要とした時に `packages/visual-project-format` と `packages/compiler` を抽出し、既存 import は re-export で維持する。
3. Web エディターの独立配布が始まった時: `apps/desktop` と `apps/web-editor` を作り、共有 UI が実在する範囲だけ `packages/editor-ui` へ移す。
4. Asset Processor が別 runtime になった時: `packages/asset-contracts` を共有し、実装は `workers/asset-processor` または専用 app へ置く。
5. 各段階で typecheck と開発サーバーを先に通し、Tauri、Preview、生成先のパスを一段階ずつ移す。

独立 package が必要になった場合の到達形候補は次の通りである。空 package を先に作らない。

```text
apps/
  desktop/
  web-editor/
packages/
  visual-project-format/
  editor-core/
  component-registry/
  compiler/
  xrift-adapters/
  editor-ui/              二つの app が本当に共有する場合だけ
workers/
  asset-processor/        別 runtime が必要になった場合だけ
```

分割後も visual project format と schema を依存グラフの最下層に置き、UI、compiler、XRift adapter が相互参照しないようにする。package を増やすこと自体を設計の完成とせず、独立した利用者、runtime、リリースの存在を境界の根拠にする。

## 6. アセットのライフサイクル

アセットは SceneDocument から分離し、AssetManifest の安定した `assetId` で参照する。外部ファイルの import は、ファイル操作と document 更新を一つの未検証処理にしない。Box、Sphere、Plane などは Create Registry の組み込み primitive であり、ユーザーの Assets grid、import、thumbnail 管理の対象にはしない。0.1 の内部 primitive record は読み込み時に typed builtin geometry reference へ migration する。

### 6.1 Import transaction

1. `ImportFilesIntent` を Import Queue へ登録する。この時点では authoring document を変えない。
2. ネイティブ境界または隔離 Worker で拡張子、MIME、magic bytes、サイズ、ファイル名、展開後 / decode 後サイズを検証する。
3. `.gltf` の場合は JSON と external URI 一覧だけを budget 内で解析し、Section 6.6 の URI policy に従って dependency closure を確定する。ネットワーク取得は行わない。
4. Asset ID を払い出し、project root 内の一時領域へ source と許可済み dependency を byte-preserving copy して SHA-256 を計算する。
5. Importer が Material、Texture、Model slot metadata を正規化し、`.cache/assets/<asset-id>/` に derived artifact、thumbnail、diagnostic を生成する。
6. source、dependency、Material slot、TextureInfo、derived hash の参照整合性を検証する。
7. source を `assets/source/<asset-id>/` へ移し、AssetManifest の追加を原子的に確定する。
8. `assetSelection` を新しい Asset へ移し、右 Inspector で source、recipe、derived、diagnostic を表示する。`sceneSelection` と SceneDocument は変えない。
9. Model / Prefab を Scene View へ配置した時だけ、`PlaceAssetCommand` が Asset ID を参照する Entity を作る。

失敗時は一時領域を片付け、SceneDocument、AssetManifest、両 selection、history を開始前のまま保つ。再 import は同じ Asset ID の source hash と processor version を更新し、参照中 Entity の ID を変えない。material slot を再対応できない場合は binding を推測変更せず diagnostic にする。

### 6.2 Source と derived の非破壊境界

- `assets/source/` はユーザーが選んだ元データと許可済み dependency の byte-preserving copy を保持する。resize、mipmap 生成、色空間変換、WebP / KTX2 圧縮、thumbnail 生成で上書きしない。
- `.cache/assets/` の derived は source、dependency hashes、processing recipe、processor version、target profile から再生成できる。欠落しても source から復元できる。
- source / derived path は project root 相対の `/` 区切りにする。OS の絶対パス、元のユーザーディレクトリ、Blob URL、署名付き URL、token を document または diagnostic に保存しない。
- 表示名を変えても Asset ID、source hash、参照を変えない。source を差し替える再 import でも Asset ID は維持する。
- Model 内蔵 Material は core / typed extension schema に正規化した Material Asset、image / texture / sampler は Texture Asset として作り、Mesh Component へ Material 値を inline 化しない。
- 最後に成功した derived は再生成中も preview に使えるが、hash が一致しなければ「古いプレビュー」と明記し、compile / upload の入力にはしない。

derived metadata は少なくとも次を持つ。

```text
DerivedArtifact
  role
  relativePath
  mediaType
  byteLength
  sha256
  sourceHash
  dependencyHashes
  recipeHash
  processorVersion
  targetProfile
  width / height / mipLevelCount / colorSpace   texture の場合
```

`sourceHash`、全 `dependencyHashes`、`recipeHash`、`processorVersion`、`targetProfile` のいずれかが現在値と違えば `stale` とする。単なる更新日時だけで ready を判断しない。

### 6.3 Texture processing recipe

Texture import は一つの「最適化」checkbox にまとめず、右 Inspector で次を独立して確認できる recipe にする。

| Section | 設定 | 方針 |
| --- | --- | --- |
| 用途と色空間 | `auto / sRGB / linear` と参照 slot | `auto` は Material slot から決める。base color / emissive RGB は sRGB、metallic-roughness / normal / occlusion / alpha は linear |
| Resize | `maxDimension` と aspect ratio 保持 | 初期候補は 1024 / 2048 / 4096 / source。source は target budget 内の時だけ選べる。縦横比を変えず、元画像は保持 |
| Quality | `fast / balanced / high` | encoder ごとに意味が違うため、偽の共通 0..100 値にしない。lossy format では preset の実 encoder parameters と推定容量を詳細表示 |
| Mipmap | `preserve / generate / none` | glTF sampler の minification filter が mipmap を使う場合、full mip chain がない `none` は warning または compile blocker |
| Sampler | mag / min filter、wrap S / T | glTF core の sampler として扱う。mag は NEAREST / LINEAR、min は mipmap を含む6種、wrap は CLAMP / MIRRORED_REPEAT / REPEAT |
| Compression | source / WebP / KTX2 ETC1S / KTX2 UASTC | PNG / JPEG は core。WebP は `EXT_texture_webp`、KTX2 は `KHR_texture_basisu` を出力し、fallback と `extensionsUsed` / `extensionsRequired` を明示 |

KTX2 では color data の容量優先に ETC1S、normal や metallic-roughness など non-color data の品質優先に UASTC を初期提案にできるが、自動決定を隠さず recipe に残す。KTX2 は mip levels を格納できる。WebP / KTX2 は core image MIME を増やしたように扱わず、それぞれの glTF extension adapter を通す。未対応 target へは PNG / JPEG fallback を生成するか、compile を止めて必要 extension を示す。

一つの source image を sRGB と linear の両用途で使う場合は、source Asset を複製せず usage-specific derived を作る。normal map を sRGB として圧縮する、base color を linear として preview する、alpha を premultiply するなど slot semantics と矛盾する recipe は確定しない。

### 6.4 Thumbnail lifecycle

Model、Texture、Material、Prefab、Particle の thumbnail は authoring Asset と別の derived artifact とする。

```text
pending -> generating -> ready
                      -> failed
ready -- source/recipe/generator changed --> stale -> generating
```

- `ready` は source hash、thumbnail recipe hash、generator version が一致した時だけにする。
- `failed` / `stale` でも Asset card、表示名、diagnostic、再生成操作を残す。placeholder だけで Asset が消えたように見せない。
- Model / Prefab の framing、Material の基準球、Particle の代表時刻は deterministic recipe とする。Scene light や現在 camera に依存させない。
- Texture thumbnail は Material slot の色空間に応じた preview を用意し、linear data を base color のように gamma 表示した結果を正しい見た目として扱わない。
- 生成中は同じ Asset の重複生成を防ぎ、取消では last-good thumbnail を維持する。

### 6.5 Stale status と diagnostic

diagnostic は `code`、`severity`、`stage`、`assetId`、任意の `sourceUri`、`materialSlot`、`fieldPath`、短い message、recovery action を持つ。元ユーザー directory の絶対パスや raw decoder error をそのまま表示・保存しない。

- `stale-source`: source / dependency hash が derived と違う。
- `stale-recipe`: resize、quality、mipmap、sampler、compression が last-good derived と違う。
- `unsupported-required-extension`: `extensionsRequired` に未対応 extension がある。
- `unsupported-optional-extension`: core fallback は表示できるが見た目が異なる可能性がある。
- `missing-external-resource` / `blocked-external-uri`: external URI が欠落または policy 違反。
- `decode-budget-exceeded`: decode 前見積りが memory budget を超える。
- `stale-material-binding`: Model 再 import 後に material slot を安全に照合できない。
- `color-space-conflict` / `mipmap-sampler-conflict`: Texture recipe と参照用途が矛盾する。

Assets card は最高 severity と件数だけを示し、右 Inspector の「診断」section で対象 field と「再生成」「参照を置換」「設定を開く」「source を再選択」の一つ以上へ移動できる。warning を無視して ready と同じ表示にしない。

### 6.6 Browser Worker と memory budget

Web / WebView importer は UI thread で glTF JSON parse、image decode、圧縮を行わない。専用 Worker に transfer 可能な buffer を渡し、処理終了、取消、project 切替で buffer、decoder、object URL、Worker を解放する。同じ ArrayBuffer の不要な複製を避け、Texture は一枚ずつ decode / encode / release する。

初期 security budget は公開 API ではなく調整可能な profile として次を起点にする。

| Budget | 初期値 | 超過時 |
| --- | --- | --- |
| glTF JSON | 16 MiB | parse 前に拒否し、desktop processor または source 整理を案内 |
| 単一 external resource | 128 MiB | resource 名と上限を診断 |
| source と dependency 合計 | 256 MiB | import を確定しない |
| external resource 数 | 256 | URI 一覧だけを示して確定しない |
| 単一 decoded image | 128 MiB 見積り | decode 前に maxDimension の引き下げを案内 |
| Worker decoded working set | 256 MiB | concurrency を下げ、それでも超える場合は中止 |
| texture derived maxDimension | 既定 4096、hard cap 8192 | source は保持できても preview / derived を ready にしない |
| processor concurrency | 最大2、端末状況で1へ低下 | queue と進捗を表示 |

image header、accessor / bufferView 範囲、KTX2 level index などから可能な限り allocation 前に見積もる。`navigator.deviceMemory` の有無だけを安全判定にせず、hard budget、実測 working set、AbortSignal を併用する。Worker crash / out-of-memory では last-saved documents と last-good derived を維持し、同じ設定の自動 retry loop を行わない。

### 6.7 GLTF external URI policy

glTF 2.0 core は buffer / image に data URI と relative path を許し、client が追加 scheme を任意対応できる。XRift Studio importer はこれより厳しい allow-list を採る。

- GLB 内部 bufferView、許可 MIME の data URI、drop された `.gltf` と同じ import root 内に実在する relative URI だけを受け入れる。
- `http:`、`https:`、`file:`、その他 scheme、authority、drive letter、UNC、root absolute path、query、fragment は取得しない。Import が暗黙のネットワークアクセスにならないようにする。
- percent-decode と Unicode normalization を一度だけ行い、`..`、encoded traversal、NUL、backslash 混在、symlink / junction 越しの project root 脱出を canonical path 検査で拒否する。
- data URI は MIME allow-list、encoded length、decoded length を decode 前に検査する。base64 の膨張分も working set に数える。
- JSON の declared byteLength、bufferView、accessor、image MIME と magic bytes を照合し、範囲外参照や type 不一致を decoder へ渡さない。
- relative dependency は import transaction の source directory へ copy し、実行時に元 directory や remote host へ再取得しない。
- unsupported `extensionsRequired` は active preview / compile を止める。optional extension は core fallback の可否と見た目の差を診断する。

外部モデルの描画は Section 10 の CSP、path、content、resource limit の gate を満たしてから有効にする。

Import Queue は source copy、derived / thumbnail generation、AssetManifest commit までを実処理として追跡する。各 stage が成功していない Asset を ready、保存済み、配置可能と表示しない。

## 7. Command と Undo / Redo

SceneDocument または AssetManifest を変える操作は、EditorSession の `CommandDispatcher` を通して Command Transaction にまとめる。

```text
Command {
  id
  label
  documents: ("scene" | "assets" | "project" | "prefab" | "folders")[]
  expectedRevisions
  affectedIds
  beforePatch
  afterPatch
  selectionBefore: { sceneSelection, assetSelection }
  selectionAfter: { sceneSelection, assetSelection }
  timestamp
}
```

- ギズモの pointer down で変更前スナップショットを保持する。
- pointer move 中は Scene View と Inspector に一時値を反映する。
- pointer up で一つの Transform Command を確定する。
- Escape は確定前の値を戻す。
- Undo は `beforePatch`、Redo は `afterPatch` を対象 document の revision 検査後に適用する。
- Transform、親子付け替え、複製、削除、Component 追加は SceneDocument の Command とする。
- Material 変更、rename、texture slot 変更は AssetManifest の Command とする。
- 通常の選択、hover、カメラ操作は履歴 entry にしない。ただし document 変更と選択が一体の操作では、前後 selection を transaction に含める。
- `PlaceAssetCommand` の実行は Entity 追加と新 Entity の選択を一件にする。Undo は Entity を除き、配置前の `sceneSelection` / `assetSelection` を復元する。Redo は同じ ID の Entity を戻して再選択する。
- Copy は document を変えず、選択 subtree、component、内部 Entity 参照、必要 Asset ID を versioned copy buffer に直列化する Intent とするため、authoring Undo 履歴には積まない。Paste は貼り付け先を検証し、新しい Entity ID を払い出し、subtree 内参照だけを remap する `PasteEntitiesCommand` とする。project 外からの copy buffer や schema version 不一致は migration / validation を通過するまで貼り付けない。
- Duplicate は copy buffer を経由して結果が揺れない `DuplicateEntitiesCommand` とし、同じ親の直後へ複製する。元の Entity と複製 Entity の ID 対応を Command に保持し、Undo は元の `sceneSelection` と `assetSelection`、Redo は同じ複製 ID と両 selection を復元する。外部 Asset ID は共有参照のままにし、Material / Texture を暗黙複製しない。
- Hierarchy から Assets / folder への drop は `CreatePrefabFromEntitiesCommand` とする。Prefab document、AssetManifest entry、folder membership、元 subtree の Prefab instance metadata を一つの cross-document transaction で確定し、失敗時は一件も変更しない。Undo / Redo は生成 ID、元 subtree、`sceneSelection`、`assetSelection` を完全に復元する。
- 非同期 Import は staged file operation と AssetManifest 更新がすべて成功した場合だけ履歴へ確定する。失敗時は document、revision、selection、history を変更しない。
- revision が競合した Command は暗黙に上書きせず、再読込または再適用を選べる診断にする。

Command history は project session 中の確定 transaction を保持し、Undo / Redo button と shortcut は同じ履歴へ接続する。履歴が空、revision conflict、Play 中の時は理由付きで無効にする。

### 7.1 Shortcut Registry

keyboard 操作は各 component の `keydown` に散在させず、Command / Intent と同じ ID を使う中央 Shortcut Registry で解決する。

```text
ShortcutDefinition
  commandId
  label
  contexts[]
  defaultBindings: { windows, macos, linux }
  allowInTextInput: false
  repeatPolicy: "once" | "repeat"
  canExecute(session, focusedSurface)
```

context priority は `modal > text-input / composition > quick-asset-editor > hierarchy / assets > viewport > editor-global` とする。同じ key chord が active context 内で複数 command に一致した場合は実行せず conflict として Shortcut 設定を開く。ユーザー override は project document ではなく端末の Editor Preferences に保存し、`commandId` と platform ごとの binding を持つ。予約済み OS shortcut、重複、空 binding を保存前に検証し、「既定へ戻す」を command 単位と全体に用意する。

| Command ID | Active context | Windows / Linux | macOS | 備考 |
| --- | --- | --- | --- | --- |
| `edit.copy` | Hierarchy / Assets | `Ctrl+C` | `Cmd+C` | active selection を copy buffer へ保存 |
| `edit.paste` | Hierarchy / Assets / Viewport | `Ctrl+V` | `Cmd+V` | 貼り付け可能な buffer がある時だけ |
| `edit.duplicate` | Hierarchy / Viewport | `Ctrl+D` | `Cmd+D` | Entity subtree を複製 |
| `edit.delete` | Hierarchy / Assets / Viewport | `Delete` | `Delete` | Asset は参照確認を通す |
| `viewport.focus-selection` | Viewport | `F` | `F` | `sceneSelection` へ camera focus |
| `tool.move` | Viewport | `W` | `W` | Edit mode のみ |
| `tool.rotate` | Viewport | `E` | `E` | Edit mode のみ |
| `tool.scale` | Viewport | `R` | `R` | Edit mode のみ |
| `history.undo` | Editor global | `Ctrl+Z` | `Cmd+Z` | active transaction が確定済みの時だけ |
| `history.redo` | Editor global | `Ctrl+Shift+Z`、代替 `Ctrl+Y` | `Cmd+Shift+Z` | 同じ Redo command へ解決 |
| `project.save` | Editor global | `Ctrl+S` | `Cmd+S` | Play 中は保存可能な authoring snapshot がある時だけ |
| `preview.toggle-play` | Editor global | `Ctrl+Enter` | `Cmd+Enter` | Edit は Play、Play は Stop |

`input`、`textarea`、`select`、`contenteditable`、数値 field の編集中、IME composition 中は `allowInTextInput = false` の shortcut を実行しない。したがって `W/E/R/F/Delete/C/V/D` は文字入力や値削除を奪わない。Escape による field 編集取消、Enter による確定など field 所有の key は Shortcut Registry より先に処理する。Play 中は authoring shortcut の `canExecute` を false にし、Stop と camera / runtime 用 input だけを active にする。

toolbar、context menu、command palette、tooltip、Shortcut 設定、ユーザー向けショートカット表は同じ Registry から label、binding、enabled reason を生成する。docs の既定 shortcut 表も Registry snapshot から検査可能にし、UI と文書の drift を CI で検出する。

## 8. Prefabs

Prefab は、ユーザーが用意するテクスチャ、パーティクル、モデル、設定済みコンポーネント群を Entity subtree として再利用する単位である。UI、schema、folder 名では `Prefab` に統一し、現行 0.1 schema の `template` は migration 入力名としてだけ残す。

- Hierarchy の一つ以上の root Entity を Assets または folder へ drag するか、context menu の「選択から Prefab を作成」で開始する。drop 中は作成先 folder と dependency 件数を示し、Scene View への reparent と混同しない。
- Prefab Asset は AssetManifest に stable `prefabAssetId` と `prefabDocumentPath` を持ち、`scenes/prefabs/<prefab-id>.scene.json` の versioned document を参照する。
- dependency closure は選択 root 以下の Entity、Component、subtree 内参照、参照する Model、Texture、Material、Particle、入れ子 Prefab ID を含む。Asset binary は複製せず stable Asset ID で共有し、外部参照と入れ子循環を validation する。portable package 化は別の明示操作とし、Prefab 作成時に source file を隠れてコピーしない。
- 作成成功では選択 subtree を同じ見た目の Prefab Instance に変換し、`prefabAssetId`、`prefabRevision`、prefab-local Entity ID と scene Entity ID の対応を保持する。Asset grid は新 Prefab を選択し、`sceneSelection` は元 root に対応する instance root を保つ。
- Instance 差分は `overrides` に `prefabEntityId / componentType / fieldPath / value` の typed operation として保持する。Prefab 更新時は override のない field だけを追従し、削除された field や依存切れは conflict diagnostic にする。名前や配列 index だけで override を対応しない。
- 「Override を適用」「元に戻す」は対象 field または component 単位の Command とする。Prefab Asset 自体の変更と一 instance の override を同じ Inspector field で曖昧に編集しない。
- Unpack は Instance を通常 Entity 群へ変換する一方向 Command とし、Prefab Asset と他 instance は変更しない。Undo では同じ IDs、overrides、両 selection を復元する。
- Prefab を削除する時は全 instance と入れ子参照を列挙し、Unpack、置換、取消のいずれかを選ばせる。参照中のまま dangling ID を残さない。

Create palette の組み込み形状は Create Registry が提供する Entity geometry であり、Prefab Asset として Assets へ保存しない。

## 9. XRift への変換パイプライン

ビジュアル project の変換は、authoring project を classic project へ書き換えず、一時 staging project を作る一方向パイプラインにする。

### 9.1 Save transaction と crash recovery

保存対象は VisualProjectDocument、entry SceneDocument、AssetManifest の三 document だけではない。`assets/folders.json`、すべての Prefab document、追加 scene、document が参照する source metadata も同じ save set として扱う。source binary / derived cache の確定は Section 6 の import transaction が担当し、通常の Save が画像を再圧縮したり cache を正本へ昇格したりしない。

1. Save 開始時の各 document revision と `sceneSelection` / `assetSelection` を snapshot し、in-memory schema、参照、path、Prefab cycle を検証する。
2. 同一 project volume の `.xrift-studio/transactions/<transaction-id>/` に canonical JSON の temporary file を全件書き、flush 後に読み戻して schema と SHA-256 を検証する。project 外の OS temporary directory から rename しない。
3. journal に transaction ID、base / next save revision、対象 relative path、before / after hash、temporary path、状態 `prepared` を記録する。token、absolute path、Blob URL は含めない。
4. Tauri backend の same-volume atomic replace で leaf document と folder / Prefab document を確定し、最後に VisualProjectDocument の `saveCommitId` と document hash set を commit marker として置き換える。複数 file の rename 自体を単一 OS atomic operation とは主張せず、最後の commit marker と journal で project 全体の可視 revision を決める。
5. 全 hash と committed revision が一致した時だけ journal を `committed` とし、EditorSession の saved revisions を進めて「未保存」を解除する。その後に temporary file と旧 backup を回収する。

起動時に未完了 journal があれば、commit marker と file hashes から「旧 revision へ rollback」または「全 after hash が揃った transaction を roll-forward」の一方だけを選び、ユーザーへ復旧内容を示す。途中 file を現在 document と混ぜて推測ロードしない。Save 失敗時は最後に committed な revision を開ける状態に保ち、EditorSession は dirty のまま、再試行、別名保存、診断表示を選べるようにする。Save 中に編集された新 revision は今回の完了表示へ含めず、直後も「未保存」を残す。

保存の Undo / Redo は作らない。Undo / Redo は authoring state を変え、Save は現在 revision を durable にする操作である。保存後に Undo した場合は通常どおり新しい未保存 revision になる。

### 9.2 Compiler staging と provenance

```text
VisualProjectDocument + SceneDocument + AssetManifest
  -> document validation / migration / reference validation
  -> world または item compiler profile validation
  -> Asset resolution / derived artifact preparation
  -> target-neutral scene model
  -> xrift-studio.runtime JSON + Asset copy plan
  -> xrift-studio-runtime/three または /react-three-fiber
  -> 薄い World Adapter または Item Adapter
  -> staging XRift classic project (package.json + xrift.json + src/)
  -> 既存 XRift check / build
  -> upload
```

このパイプラインは実装境界であり、ビジュアルモードの操作手順として露出しない。ユーザーは同じエディターの Play を押し、Scene View 内で確認し、Stop で Edit へ戻る。Vite のポート、CLI コマンド、開発サーバー、別ブラウザの URL を選んだり起動したりする必要はない。

Runtime packageがnpm公開されるまで、compiler coreは既存desktop Publish向けの`classic-jsx`とClassic export CLI向けの`classic-runtime`を明示的に切り替える。これはScene変換器の複製ではなく、同じ検証、Prefab展開、Asset plan、diagnostics、provenanceから出力adapterだけを選ぶ移行境界である。

Editor Play は visual documents を Three / R3F preview adapter が直接読むため、Node.js、XRift CLI、別の Vite process を要求しない。toolchain がなくてもビジュアル project を作成・編集・保存できる。Compiler、check、upload を実行する時だけ runtime gate で Node.js / XRift CLI / 認証状態を検査し、不足時は authoring を閉じずにセットアップ導線を示す。

staging project の runtime 確認も準備と終了をエディターが管理し、Scene View または同一ウィンドウ内の隔離された preview surface に表示する。準備に時間がかかる場合は「生成結果を準備中」と Stop を示し、CLI の生ログは詳細表示へ分離する。自動で外部ブラウザを開かない。

compile input fingerprint は canonical 化した全 authoring documents、Prefab / folder documents、参照する source / dependency hashes、derived recipe / artifact hashes、schema versions、compiler version、target (`world | item`)、Registry / adapter versions から作る。現在の fingerprint と一致する成功 staging だけを fresh とし、mtime や「一度ビルドした」flag で判断しない。Save 後でも compiler version、target、asset recipe のいずれかが変われば stale である。

staging には生成物と別に次の provenance manifest を置く。

```text
XRiftStudioProvenance
  formatVersion
  compilerVersion / target / adapterVersions
  inputFingerprint
  documentHashes / sourceHashes / derivedHashes
  generatedFiles[]: relativePath / sha256 / sourceMappings[]
  sourceMappings[]: generatedRange -> sceneId / entityId / componentType / assetId / fieldPath
```

生成内容へ wall-clock time、absolute path、random ID を入れない。同じ fingerprint から byte-equivalent な staging を得る。生成時刻のような UI metadata が必要なら provenance hash の外に置く。Preview、check、upload の開始直前に fingerprint と全 generated file hash を再検証し、stale または手編集を検出したら自動再生成か中止を選ばせる。last-good staging を「最新」と偽らない。

ここでいう双方向性は、XRift Studio が生成した artifact の diagnostic、generated range、check result、upload result を provenance により元 Entity / Asset / field へ戻せることを指す。これとは別に、既存Classicの検査済みentryとrelative importで到達するlocal moduleから、対応する静的JSXを一度Visualへ取り込むlossy importを提供する。任意コードの実行、Asset graph、`package.json`、`xrift.json`を完全なvisual documentsへ戻すround-tripとは扱わず、未対応箇所を診断へ残す。generated file の編集を検出した場合は上書き再生成または Export / Eject を選ばせ、差分を元authoring documentへ自動反映しない。

### 9.3 Validation / Migration

- 三つの root document と参照される Scene / Prefab / folder document の `schemaVersion` を必須にし、依存順に段階的に移行する。
- migration は元データを直接壊さず、移行後のコピーを検証してから保存する。
- path、Entity、Component、Asset、Material / texture slot の参照整合性、有限数、許容スケール、親子循環を検査する。
- world / item ごとの許容 Component と必須設定を profile で検査する。

### 9.4 Code Generation

- 開発版の`classic-runtime` modeは`public/xrift/runtime.json`と薄いadapterを生成する。既存desktop PublishはRuntime package公開まで`classic-jsx` modeを維持する。
- 出力先は OS の一時ディレクトリまたは visual project の `.cache/generated-xrift/` とし、authoring root に `package.json` や `src/` を生成しない。
- staging project 全体を compiler 所有とし、自動生成 marker と source document hash を記録する。次回 compile で破棄・再生成でき、ユーザー編集は受け付けない。
- `public/xrift/runtime.json`は編集用documentを直接公開せず、実行時に必要なScene、Entity、Transform、Component、Asset URLだけを持つ`xrift-studio.runtime` schemaへ変換する。
- `src/World.tsx`または`src/Item.tsx`は`xrift-studio-runtime/react-three-fiber`を呼ぶ薄いadapterとし、大量のScene JSXを正本として生成しない。
- 素のThree.js利用者は`xrift-studio-runtime/three`だけをimportでき、React／Tauri／CLIをbundleへ含めない。ModelとTextureは並列にloadし、形式固有rendererは対象Assetがある場合だけ遅延loadする。
- Entity、Asset、プロパティの出力順を安定させ、同じ canonical input set と compiler / adapter version から同じ staging project を生成する。
- Component / Asset Registry は target-neutral な schema、reference、validation 層と、Three preview、R3F、XRift world、XRift item の target adapter 層に分ける。
- Mesh、Light などは allow-list 済み adapter だけで変換する。document 内の文字列を `eval`、`Function`、任意の動的 import として実行しない。

World Adapter はワールドのルート、物理、スポーンなどの compiler profile を接続する。Item Adapter は XRift から渡される位置やスケールなどの Item props をルートへ適用し、アイテム用 profile にない機能を生成しない。これら compiler adapter と、Editor 内の World Play Profile / Item Preview Profile は責務が異なる。

### 9.5 Preview 経路の調査結果と採用境界

2026-07-20 時点の XRift 公式ドキュメントと API reference から確認できる範囲を、期待ではなく実装可否として分ける。

| 経路 | 公式に確認できる事実 | XRift Studio の判断 |
| --- | --- | --- |
| Editor direct preview | XRift 固有 API ではない。visual documents を Three / R3F adapter が読める | `supported`。Edit / Play に採用し、XRift 本番 runtime と同一とは表示しない |
| classic item の local preview | 公式 item tutorial は `npm run dev`、`src/dev.tsx`、`localhost:5173` の Canvas / Physics / OrbitControls preview を示す | `supported with constraints`。generated staging 検査に使い、Node / template / port lifecycle を Editor が管理する。Editor direct preview とは別 profile |
| XRift CLI preview command | 公式 command reference には login / whoami / create / upload / check はあるが preview command は記載されていない | `not documented`。存在を仮定した command や UI を作らない |
| SDK upload | `@xrift/sdk` は world / item upload、progress、result の ID / version / content hash を記載する | `possible for upload`。preview API の根拠にはしない。desktop は既存 CLI / Tauri 認証境界を優先する |
| Public API v1 | 公開 world、公開 instance などの read endpoint を記載する | `not a draft preview API`。未公開 staging の実行面として使わない |
| XRift 上の unpublished / draft preview | 調査した CLI、SDK、Public API に契約が記載されていない | `unknown`。公式 auth、lifecycle、URL、cleanup contract が公開されるまで設計上の依存にしない |
| 「XFT preview」 | 調査した公式資料ではこの名称と API contract を確認できない | `unknown term`。別機能の略称と推測せず、正式な仕様 URL または定義を得てから再評価する |

「Play」は Editor direct preview、「生成結果を確認」は staging の local dev preview と明確に分ける。後者は Editor が server 起動、ready 検知、sandboxed surface、Stop、port 解放、stderr redaction を管理する。CLI `upload` は build と審査 / 公開へ進むため preview button の代替に使わず、実データを送信する通常検証もしない。

### 9.6 Upload modal と既存 XRift flow

Upload は editor の light theme 内に専用 modal を開き、既存の `whoami` / `login`、公開準備確認、種別別 `check --build`、`upload` 実装を再利用する。別の token store、shell command builder、公開 metadata schema を visual mode 専用に複製しない。

公式 CLI が同じ公開先を更新するための remote ID は `xrift.json` ではなく、World では `.xrift/world.json`、Item では `.xrift/item.json` に保存される。Visual project はこの CLI sidecar を authoring root の非表示・編集不可 metadata として保持し、毎回作り直す staging へ upload 前に復元する。staging には `projectId` と成果物種別を持つ app-owned owner marker を最後に書き、次回 staging を消す前にも CLI sidecar を authoring project へ回収する。upload 成功後は CLI が更新した sidecar を authoring project へ journal 付きで戻してから成功結果を確定し、`lastPublication` には UI で表示する ID と結果を同期する。既存 sidecar、`lastPublication`、owner marker、CLI result の ID が一致しない場合、または以前の ID を一意に復元できない場合は、新しい remote を重複作成しないよう upload / retry を停止する。

| State | 表示と動作 | 取消 / 失敗からの戻り先 |
| --- | --- | --- |
| `review` | target、タイトル、説明、thumbnail、既存 worldId / itemId、保存・compile freshness、diagnostic 件数を表示。未編集 placeholder や blocker を field 近くに示す | 閉じると Edit。document と remote は不変 |
| `auth-check` | `whoami` の結果を表示し、未認証なら既存 login 導線を同じ modal から開始 | login 取消後も metadata 入力を保持して `review` |
| `saving` | Section 9.1 の transaction と対象 revision を表示 | safe point で取消し、未完了 save は journal recovery 対象。remote は不変 |
| `compiling` | input fingerprint、target、asset processing、生成件数を段階表示 | worker / compiler を取消して `review`。last-good を latest 扱いしない |
| `checking` | 既存 check/build の APPROVE / REVIEW / REJECT と provenance 上の Entity / Asset link を表示 | local process を取消して `review`。REJECT は upload へ進めない |
| `uploading` | files、bytes、current file、content hash、remote target を表示 | remote commit 前だけ取消可能。開始後の cancel は best effort と明記し、結果不明なら status 確認まで再 upload しない |
| `processing` | upload 後の自動審査中であり未公開かもしれないことを表示 | modal を閉じても result ID を保持。公開完了とは表示しない |
| `succeeded` | SDK / CLI が返した worldId / itemId、versionId、versionNumber、contentHash を表示 | 「Editor に戻る」と「結果をコピー」。公式 result が URL を返した時だけ URL を開く |
| `failed` | stage、sanitized error、再試行可能性、remote commit の有無を表示 | auth、compile、check、upload の失敗 stage から再試行。入力 hash が変われば `review` からやり直す |

SDK API reference の upload result は ID、version、content hash を定義するが公開 URL field は定義していない。XRift Studio は ID から URL pattern を推測生成せず、CLI / SDK が正式 URL を返さない場合は ID と version を表示し、既存の公式ページを開く導線または status refresh API が確認できるまで URL button を出さない。再試行では input fingerprint、content hash、既知の remote ID を照合し、結果不明の upload を新規 project として重複作成しない。

自動テスト、E2E、手動 UI 検証は compile / check までを fake backend または fixture で行い、実 XRift upload を実行しない。実 upload はユーザーが modal の最終確認を明示実行した本番操作だけに限定する。

### 9.7 Classic と Visual の境界

- classic projectはlocal folderまたはnative境界で浅くcloneしたHTTPS / git SSH Repositoryから`package.json`、`xrift.json`、同種の`src/World.tsx`または`src/Item.tsx`を検査し、file数、総容量、symlink、source graph byte上限を適用する。entryからrelative importを再帰解決し、moduleは実行せず、静的JSXとliteralをlossy importする。`group`、RigidBody、対応Drei / XRift wrapper、local Component instanceを独立Entityとして保持し、その親子関係とlocal Transformの下へ標準Geometry、R3F Light、Collider、typed XRift Componentを配置する。local Model、Texture、MP3 / WAVは通常のAsset import transactionで保存し、sphere / BackSide画像はSkybox、`new Audio`はAudio Sourceへ接続する。確定前reviewでも同じtransactionをfile書き込みなしで準備し、Asset原本容量、Texture解像度と展開量、Model bounds、Model import scale、親を含む配置Scale、配置後寸法を提示する。`THREE.ShaderMaterial`はGLSL、literal uniform、Texture sampler、mesh名variantだけをCustom Material IRへ変換し、元Model slot、Editor Preview、compilerへ同じdescriptorを渡す。OBJ内で明示されたCollider mesh名はnamed submesh参照として復元し、root Modelを通らないnamed nodeへModel import scaleと中心offsetを明示適用して可視Modelとphysics寸法を揃える。RigidBodyはCollider形状と分離した親EntityのComponentとしてfixed / dynamic / kinematic type、静的な一般設定、auto collider方式を保持する。Playとcompilerは次のnested RigidBody境界までのsubtree Mesh / Colliderを同じRapier Bodyへ戻し、親原点へ代替Colliderを生成しない。hook、callback、条件分岐、動的collection、解決できないAsset dependencyはsource path付き診断へ残す。完全なround-tripや暗黙の継続同期は提供しない。
- visual project 内に手書き `src/` や、生成対象外 adapter を混在させない。拡張は versioned Component / Asset / runtime plugin contract として明示的に設計する。
- CLIのExport / Ejectは`xrift-studio convert <visual-project> --to classic --out <directory>`と同じcompiler coreを使い、新しい空directoryへRuntime JSON付きClassic projectを作る。
- Desktop Editorの「Classicへ書き出す」はOS folder pickerで同種の既存Classic projectを検査し、Visual Project IDごとの`public/xrift-studio/`、`src/xrift-studio/`、`.xrift-studio/exports/`へRuntime、Asset、bridge、provenanceを追加する。既存`xrift.json`、thumbnail、entryは既定で変更しない。
- 既存Classicへの追加はcomponent接続を既定とし、entry切替はbackupと明示確認を必要とする。npmだけ固定allow-listのdependency installを自動化し、他package managerのlockfileをnpmで混在させない。
- Eject先の`package.json`、`xrift.json`、`src/`、`public/xrift/`はユーザー所有へ移す。由来とhashを`.xrift-studio/export-manifest.json`へ残すが、自動同期やVisualへの逆変換は行わない。
- `--update`は同じVisual project由来で、manifest記録後にfile追加・削除・変更がないexportだけに許可する。Classic側を編集した後は更新を拒否し、既存directoryへの混在や`--force`を提供しない。
- Eject transactionは一方向であり、Eject先の変更を元のVisual projectへ自動同期しない。戻す場合は別Visual projectまたは明示したScene追加として静的lossy importを行う。sourceとoutputが同一または親子になる配置も拒否する。

## 10. セキュリティと認証境界

- visual documents は宣言データだけを受け入れ、任意スクリプト、HTML、シェルコマンドを保持・実行しない。
- 外部アセットは拡張子だけで信用せず、サイズ、MIME、実体、展開後サイズをネイティブ境界で検証する。
- パスはプロジェクトルート内へ正規化し、`..`、絶対パス、シンボリックリンク越しの脱出を拒否する。
- Importer と生成器は既知の Asset / Component 型だけを処理する。
- 外部 Asset の preview URL と Tauri asset protocol は project 管理下の source / cache だけへ制限し、CSP の `default-src`、`script-src`、`connect-src`、`img-src`、`media-src` を必要最小限に保つ。外部モデル描画前にこの gate を確認する。
- shell scope は固定した XRift executable と許可済み subcommand / argument に限定し、document や Asset 名を任意コマンドとして連結しない。Compiler 接続前に capability と scope を review する。
- アップロードトークンは visual documents、staging project、ブラウザの永続ストレージ、ログへ保存しない。
- デスクトップ版では、認証済み CLI または Tauri バックエンドをアップロード境界にする。
- ログへ出す前に access token、cookie、Authorization header、署名付き URL、ユーザーホームの絶対パスを redaction する。compiler / upload の raw stderr を無加工で UI や telemetry へ送らない。
- Blob URL、input listener、Worker、PlaySession resource は終了時に revoke / dispose し、次の project へ残さない。
- 将来 Web だけでアップロードする場合は、サーバーから短時間かつ用途限定の資格情報を受け取り、ブラウザへ長期トークンを配布しない設計を別途行う。
- upload 前には既存の公開準備確認を再利用し、タイトル、説明、サムネイルが初期値のままなら開始しない。

外部 Asset 描画、Compiler、check/upload はこの security gate と threat review を通過した実装だけを有効にする。gate に失敗した処理は開始せず、対象と修復手段を Editor に示す。

## 11. 製品能力

### Authoring workspace

- 新規作成は item / world と classic / visual の四カードを同じ画面に示し、visual project は専用 documents を journal 付きで保存してライブラリへ登録する。
- light theme の左 Hierarchy、中央 Scene View、右 Inspector、下 Assets を resize / dock でき、versioned Editor Preferences から layout を復元・reset できる。
- Hierarchy / Scene の右クリック Create、gizmo、Inspector、Asset / Material / Texture drag-and-drop は Command Dispatcher、Undo / Redo、両 selection snapshot を共有する。
- Assets は folder、検索、import、動的 thumbnail、drag source を提供し、Material / Texture / Model properties は右 Inspector で編集する。
- World / Item Play は同じ Scene View と別 runtime profile を使い、Stop 後に authoring documents、両 selection、Inspector context、camera を復元する。

### Asset and scene data

- GLB / GLTF、PNG / JPEG、WebP / KTX2 を allow-list、Worker / memory budget、source 非破壊の import transaction で扱う。
- glTF core metallic-roughness Material、TextureInfo / sampler、Material slots、`KHR_texture_transform`、typed `KHR_materials_iridescence` を import、右 Inspector、preview、compiler で共有する。
- Model / Texture / Material / Prefab / Particle、Prefab dependency / override、Particle / XRift Component Registry を stable ID と versioned migration で扱う。
- source、recipe、processor、target hash が変わると derived と thumbnail を stale にし、background queue で再生成する。

### Save, compile, preview, upload

- Scene / Prefab / Asset / folder document set を temporary write、validate / hash、same-volume replace、journal、commit marker で保存し、crash 後は旧または新の完全な revision へ復旧する。
- target-neutral Registry と world / item adapter は provenance 付きの決定的 staging project を生成し、stale check 後に既存 XRift check / build へ渡す。
- Editor direct preview と generated staging preview を分け、公式に定義されていない hosted / CLI preview を仮定しない。
- Upload modal は既存 whoami / login / check / build / upload を再利用し、review、進捗、取消、retry、remote ID / version、審査状態を Editor 内に示す。

### Extension policy

- 後続 `KHR_materials_*` は一つずつ typed Registry adapter、validation、Inspector、preview、compiler を揃えて追加する。
- Component / Asset Plugin は任意 script 実行ではなく versioned declarative schema と allow-listed target adapter に限定する。
- ECS runtime は正規化 document と Command / Registry で表現できない scheduling requirement が確認された時だけ評価する。

## 12. 検証と受け入れ条件

### Product UI and creation

- [ ] 新規作成の同じ画面に item classic / world classic / item visual / world visual の四カードがあり、選択後の正本と開く画面を読める。
- [ ] classic と visual が同じ project の編集モードではなく、正本と利用機能が異なる project type だと選択画面から分かる。
- [ ] classic は既存の code project 作成、一覧更新、コードエディターへの遷移を変えない。
- [ ] visual は専用 document format を project root へ保存し、ライブラリから再度開ける。
- [ ] light theme 上で左 Hierarchy、中央 Scene View、右 Inspector、下 Assets の責務を識別できる。
- [ ] Hierarchy または Scene View で選ぶと同じ `sceneSelection` が選択表示され、右 Entity Inspector が更新される。
- [ ] Asset の一回クリックは独立した `assetSelection` と右 Inspector の Asset context を更新し、`sceneSelection` 自体を消さない。
- [ ] primitive は Create palette にあり、user Asset grid の Model / GLTF、Texture、Material、Prefab、Particle と区別できる。
- [ ] Hierarchy / Scene View の右クリック Create から primitive を作ると、Hierarchy は選択親、Scene View は click point を使って Entity を一件追加し、Undo / Redo で同じ ID と両 selection を復元する。
- [ ] Model / Prefab の配置操作だけが Entity を増やし、Asset の一回クリック、Material / Texture の drag では Entity を増やさない。
- [ ] Material を Scene Mesh または Entity Inspector slot へ drag すると hover 中に対象 slot と置換前後を確認でき、drop と Undo / Redo が一件の `AssignMaterialCommand` になる。複数 slot は chooser なしに推測適用しない。
- [ ] Texture を右 Material Inspector の slot へ drag すると用途別色空間を検証し、衝突時は確定前に解決方法を選べる。
- [ ] Entity Inspector は Asset ID 参照を示し、Material 値を Entity に inline 保存しない。
- [ ] 共有 Material Asset を編集すると、その ID を参照するすべての Entity 表示が更新される。
- [ ] Model / Texture / Material は source / Material / dependency の変更に追従する動的 generated thumbnail を表示し、欠落 / 失敗時だけ kind icon と状態 label を表示する。
- [ ] Hierarchy、Scene View、Inspector、Assets を resize / dock した layout が再起動後に復元され、invalid / off-screen layout は safe default、「レイアウトをリセット」は既定配置へ戻る。
- [ ] toolbar と Assets は中央 semantic Icon Registry の Lucide icon、label、tooltip を使い、他製品の icon asset や custom SVG を含まない。
- [ ] ギズモまたは Inspector から position、rotation、scale を変更すると両方の表示が一致する。
- [ ] Playは同じエディター中央のPlay Windowで始まり、境界、header、実行コピーlabelでScene Viewと区別できる。Vite、CLI、ポート、別ブラウザを操作する必要がない。
- [ ] Play中は単一EntityのTransform、Collider、Animationだけを通常の履歴と自動保存で変更でき、対象Entityだけ先頭から再実行する。Hierarchy構造、Asset、Material、Scene settings、ギズモ、Asset dropは変更できない。
- [ ] World Preview の controller / physics は登録済み runtime adapter を使い、Item Preview に World 用 controller を適用しない。
- [ ] Stop後はPlaySessionが破棄され、Play中の許可された調整を含む最新SceneDocument、Play前と同じAssetManifest、selection、Edit cameraへ戻る。runtime位置や速度は書き戻さない。
- [ ] Material / Texture は右 Inspector の product schema で編集し、Assets 下部に別 property form を作らない。
- [ ] GLB / GLTF を Assets へ drop すると source、derived、thumbnail、AssetManifest が transaction として保存され、明示的な Scene drop 以外では Entity を増やさない。
- [ ] 非対応ファイルでは authoring document を変更せず、対応形式が分かる。
- [ ] Node.js / XRift CLI がなくても visual project を開いて編集・保存・Editor Play でき、compile / upload 時だけ runtime gate を示す。
- [ ] 保存、変換、外部モデル描画、check、upload は実結果に基づいて状態を更新し、stale / failed / processing を success と表示しない。
- [ ] ライブラリへの戻り先があり、未保存変更がある時は保存、破棄、取消を選べる。
- [ ] `pnpm typecheck` が通り、Vite 開発サーバーで主要導線とコンソールエラーを確認できる。

通常の確認では本番ビルドを実行しない。詳細は `AGENT.md` と `xrift-studio-verify` スキルに従う。

### Material / Texture / Import

- [ ] glTF 2.0 core Material の baseColorFactor / Texture、metallicFactor、roughnessFactor、metallicRoughnessTexture、normalTexture / scale、occlusionTexture / strength、emissiveTexture / Factor、alphaMode / Cutoff、doubleSided を欠落なく import、編集、保存、preview、再出力できる。
- [ ] base color / emissive RGB は sRGB、metallic-roughness / normal / occlusion は linear として扱い、base color alpha は linear / unpremultiplied のまま保持する。
- [ ] metallic-roughness texture の G=roughness / B=metallic、occlusion の R、normal scale、alpha mode の意味を fixture で検証できる。
- [ ] core TextureInfo の `texCoord` と `KHR_texture_transform` の offset / rotation / scale / override texCoord を別 field として保持し、extension の有無を失わない。
- [ ] `KHR_materials_iridescence` の全 field、既定値、linear single-channel texture を typed adapter で保持し、他の未知 `KHR_materials_*` を editable field として推測しない。
- [ ] `castShadow` / `receiveShadow` は Mesh Component、`doubleSided` は Material に保存され、glTF Material JSON へ shadow field を混入しない。
- [ ] 複数 mesh primitive の stable material slot と binding を保持し、再 import で照合不能な binding を自動置換せず `stale-material-binding` にする。
- [ ] Material Asset を preset から新規作成でき、作成後は Asset だけを選択し、Entity へ自動 binding しない。
- [ ] Texture import は source を byte-preserving で残し、resize、mipmap、sampler、quality、WebP / KTX2 recipe と derived artifact を別管理する。
- [ ] KTX2 / WebP をそれぞれ `KHR_texture_basisu` / `EXT_texture_webp` として扱い、target 非対応時の fallback または blocker を示す。
- [ ] source / dependency / recipe / processor / target hash の変化で derived と thumbnail が stale になり、last-good を upload 入力にしない。
- [ ] GLTF relative URI は import root 内だけを解決し、remote、absolute、traversal、scheme、budget 超過を document 変更前に拒否する。
- [ ] Worker 取消 / crash / OOM / decode error 後も最後に保存した documents、source、last-good derived、両 selection、history が壊れない。
- [ ] Asset folder の create / rename / move と context menu 操作が stable ID を保ち、表示上の folder 移動で source path を変えない。

### Command / Shortcut / Prefab

- [ ] Place、Paste、Duplicate、Delete、Prefab 作成の Undo / Redo が document IDs と前後の `sceneSelection` / `assetSelection` を両方復元する。
- [ ] Duplicate は subtree 内 Entity 参照だけを新 ID へ remap し、Material / Texture など外部 Asset 参照を暗黙複製しない。
- [ ] Hierarchy から Assets / folder への drop で Prefab document、Asset entry、folder membership、instance metadata が一 transaction として確定し、途中失敗では一件も残らない。
- [ ] Prefab dependency closure、nested cycle、instance override、Prefab 更新、Unpack を stable prefab-local ID と field path で検証できる。
- [ ] Ctrl/Cmd+C/V/D、Delete、F、W/E/R、Undo / Redo、Save、Play / Stop が Shortcut Registry の既定 binding から実行され、toolbar / tooltip / docs と一致する。
- [ ] text input、contenteditable、数値 field、IME composition 中は editor shortcut が入力を奪わない。
- [ ] shortcut conflict はどちらも実行せず、user override と既定へ戻す操作が Editor Preferences に保存される。

### 永続化とコンパイラ

- [ ] Tauri library は root の有効な `xrift-studio.project.json` で visual を判定し、`.cache/generated-xrift/` を project として列挙しない。
- [ ] visual manifest が壊れている場合は classic と推測せず、対象 field と修復手段を示す。
- [ ] VisualProjectDocument、Scene / Prefab documents、AssetManifest、folder document の serialize / load で ID、値、参照が失われない。
- [ ] 現行 `template` から `prefab` を含む旧 `schemaVersion` fixture が依存順に最新形式へ移行できる。
- [ ] temporary write 後の validation / hash、same-volume replace、journal、commit marker の順で保存し、各 fault injection point から旧または新の完全な document set に復旧できる。
- [ ] Save 中に編集が進んだ場合、保存対象 revision だけを committed とし、新 revision の「未保存」を消さない。
- [ ] 欠落 Asset、未知 Component、循環 Hierarchy が対象 ID 付きで失敗する。
- [ ] Material / texture slot の型違いと欠落参照を Asset / Entity ID 付きで検出できる。
- [ ] 同じ canonical input fingerprint、compiler / adapter version、target から byte-equivalent な staging project と同じ provenance mapping を得られる。
- [ ] source、derived recipe、compiler version、target または generated file hash が変わると staging を stale と判定し、preview / check / upload 前に再生成または中止する。
- [ ] generated diagnostic の path / range を provenance により元 Scene / Entity / Component / Asset / field へ戻せる。
- [ ] Classicの検査済み`src` module graphからallow-list済み静的JSXをlossy importし、親子関係、local Component境界、typed XRift Componentをfixtureで維持する。arbitrary codeや手編集stagingを実行・完全変換せず、未対応箇所はsource path付きで診断する。
- [ ] world / item profile の違反を生成前に検出できる。
- [ ] visual authoring root に compiler が `package.json`、`xrift.json`、`src/` を生成しない。
- [ ] CLI Ejectは新しいclassic projectだけを作る。Desktopの既存Classic追加はVisual Project IDごとの所有領域だけを更新し、手書きentryは明示確認なしに変更しない。
- [ ] Editor direct preview と generated item の local dev preview を別 profile として表示し、公式に未記載の CLI / hosted / XFT preview を実装済みと表示しない。
- [ ] Import、Save、compile または生成失敗後も最後に committed な document set、revision、両 selection、履歴が壊れない。
- [ ] upload token、絶対パス、Blob URL が authoring document と staging project へ含まれない。
- [ ] CSP、Tauri shell scope、path validation、log redaction の security gate を external render / compiler 接続前に検証する。

### Upload

- [ ] Upload modal は title、description、thumbnail、target、auth、save / compile freshness、diagnostics を確認してから既存 whoami / login / check --build / upload へ進む。
- [ ] review、auth-check、saving、compiling、checking、uploading、processing、succeeded、failed の各 state で進捗、取消可能性、再試行先、戻り先を読める。
- [ ] REJECT、stale compiler input、未編集 metadata、thumbnail 欠落など blocker がある時は upload を開始しない。
- [ ] upload 後は worldId / itemId、versionId、versionNumber、contentHash を表示し、審査中を公開済みと表示しない。
- [ ] `.xrift/world.json` / `.xrift/item.json` の remote ID を authoring project と fresh staging の間で継承し、再 upload が同じ remote を更新する。
- [ ] 正式 result に URL がない場合は URL pattern を推測せず、ID を表示する。結果不明の再試行で新規 remote asset を重複作成しない。
- [ ] automated test と通常の UI 検証は fake backend / fixture を使い、実 XRift upload を発生させない。

## 13. 参考資料

### XRift

- [SDK Overview](https://docs.xrift.net/sdk/overview)
- [SDK API Reference](https://docs.xrift.net/sdk/api-reference)
- [Create Your First Item](https://docs.xrift.net/item/create-first-item)
- [CLI Commands](https://docs.xrift.net/cli/commands)
- [Public API v1](https://docs.xrift.net/public-api/v1)

### Khronos glTF 2.0

- [glTF 2.0 Specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)
- [Material schema](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/schema/material.schema.json)
- [PBR Metallic-Roughness schema](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/schema/material.pbrMetallicRoughness.schema.json)
- [TextureInfo schema](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/schema/textureInfo.schema.json)
- [Sampler schema](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/schema/sampler.schema.json)
- [glTF Extension Registry](https://github.com/KhronosGroup/glTF/blob/main/extensions/README.md)
- [KHR_texture_transform](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_texture_transform/README.md)
- [KHR_texture_basisu](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_texture_basisu/README.md)
- [EXT_texture_webp](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Vendor/EXT_texture_webp/README.md)
- [KHR_materials_iridescence](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_iridescence/README.md)
- [glTF Validator](https://github.com/KhronosGroup/glTF-Validator)

### UI icons

- [Lucide for React](https://lucide.dev/guide/react)

参照資料は XRift 連携、データ互換性、UI 実装の判断に使う。外部のコードや素材を取り込む場合は、それぞれのライセンスと更新方針を別途確認する。
