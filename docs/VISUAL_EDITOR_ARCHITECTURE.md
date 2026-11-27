# XRift Studio ビジュアルエディター設計

XRift Studio は、[XRift](https://xrift.net/) のワールドとアイテムを制作するデスクトップアプリである。コードを直接書く「コード編集」と、画面上でシーンを組み立てる「ビジュアル編集」の 2 方式に対応する。本書ではビジュアル編集の設計を定義する。

対象範囲は、ビジュアルプロジェクトの作成、素材の取り込み、シーン編集、保存、動作確認、XRift プロジェクトへの変換、検証（`check`）、アップロード（`upload`）までとする。変換処理は、同じ入力から常に同じ出力が得られる決定的な動作とする。

ワールドとアイテムは共通のシーン形式を使う一方、入力、コントローラー、装着時の Transform、カメラといった実行環境プロファイルは成果物の種別ごとに分ける。各操作では、編集ドキュメント、生成物、XRift の処理結果について実際の状態をそのまま表示する。処理中、失敗、古い状態（`stale`）、審査中を、成功や公開済みとして表示しない。

全体の設計は本書で管理し、個別機能の詳細は次の文書で定義する。

| 文書 | 扱う範囲 |
| --- | --- |
| [UX 原則](./UX_PRINCIPLES.md) | 画面文言、状態設計、レビュー基準 |
| [マイクロインタラクション Wiki](./UX_INTERACTIONS.md) | 機能ごとの操作前・処理中・成功・失敗・戻り先 |
| [スクリプト契約](./SCRIPTING.md) | スクリプトの API、実行境界、対応範囲 |
| [KHR_interactivity Editor / MCP design](./KHR_INTERACTIVITY_EDITOR.md) | ノードグラフの正規形式と MCP 契約 |
| [地形エディター仕様](./TERRAIN_EDITOR_SPEC.md) | 地形と草のモード、ブラシ、性能 |
| [マテリアルカタログ仕様](./MATERIAL_CATALOG_SPEC.md) | 空・水シェーダー、草、風の契約 |
| [3D モデルの読み込み仕様](./MODEL_IMPORT_CONTRACT.md) | 3D モデルの取り込みと再取り込み |
| [設定デザインガイド](./EDITOR_INSPECTOR_DESIGN.md) | `Inspector` の情報密度と参照フィールド |
| [ビジュアルプロジェクトをコード編集へ書き出す CLI](./VISUAL_PROJECT_MIGRATION_CLI.md) | コードプロジェクトへの書き出し |
| [対応範囲と段階](./VISUAL_EDITOR_ROADMAP.md) | 実装済みの範囲と各段階の達成条件 |

## 1. 目標と設計原則

コードを直接編集する方法に加え、素材をシーンへ配置して見た目を確かめながらワールドやアイテムを制作できるようにする。

設計では次の原則を守る。

1. コード編集とビジュアル編集を対等な制作入口として扱う。
2. コード編集とビジュアル編集は、編集するデータと利用できる機能が異なる別々のプロジェクト種別とする。同一プロジェクトの表示モード切り替えとしては扱わない。
3. ビジュアル編集では `VisualProjectDocument`、`SceneDocument`、`AssetManifest` を保存・編集する。任意の JSX や `package.json` は編集データにしない。
4. `SceneDocument`・`AssetManifest` と、選択状態・カメラ・開いているパネルなどのエディター状態（Editor State）を分離する。
5. `Entity`、`Component`、素材には、表示名とは別の安定した ID を持たせる。
6. `Inspector` とコンパイラーは、同じ明示的な `Component` / 素材スキーマを参照する。
7. 汎用 ECS ランタイムは導入せず、ECS に着想を得た正規化データとして実装する。システムスケジューラーやクエリは持たない。フレームごとの更新順序を必要とするのは Script Component だけであり、そのスケジューリングは [4.8 スクリプト](#48-scripting-script-asset--script-component) の `RuntimePlugin` ライフサイクルと固定順序に限定する。
8. 未保存、未変換、未公開を明確に区別し、実行していない処理の成功表示を出さない。
9. XRift の認証情報とファイル操作はブラウザ UI から分離し、編集ドキュメントや生成バンドルへ含めない。
10. ビジュアル編集では、Vite、CLI、開発サーバー、別ブラウザの起動を制作手順として意識させず、編集から動作確認（Play）、終了（Stop）までを同じエディター内で完結させる。
11. 編集・Play・公開では同じ素材と実際の描画コードを使う。公開専用の材質置換や見た目の補正は行わない。共通ランタイムと環境別アダプターの境界、画像の扱い、検証条件は [描画の一致に関する実装契約](./AGENT_IMPLEMENTATION.md#rendering-parity) に従う。

## 2. 四つの制作導線と project type

新規作成の最初の画面には、「アイテム・コード編集」「ワールド・コード編集」「アイテム・ビジュアル」「ワールド・ビジュアル」の四つのカードを同じ階層に並べる。各カードでは、成果物、制作方法、編集するデータ、作成後に開く画面を一文で示す。

成果物とプロジェクト種別は内部で二つの軸として管理し、画面では一度の選択で決められるようにする。「コード編集 / ビジュアル」の選択によって編集データ、利用できる機能、保存形式が変わるため、同じプロジェクトの編集画面を切り替える操作にはしない。

| 成果物 | プロジェクト種別 | 編集対象のデータ | 開く機能 | XRift への到達方法 |
| --- | --- | --- | --- | --- |
| アイテム | コード編集 | `package.json`、`xrift.json`、`src/` | コードエディター | 既存の item `check` / `build` / `upload` |
| ワールド | コード編集 | `package.json`、`xrift.json`、`src/` | コードエディター | 既存の world `check` / `build` / `upload` |
| アイテム | ビジュアル | `xrift-studio.project.json`、`scenes/`、`assets/` | ビジュアルエディターとアイテムプレビュープロファイル | コンパイラーが一時的な XRift アイテムプロジェクトを生成して既存処理へ渡す |
| ワールド | ビジュアル | `xrift-studio.project.json`、`scenes/`、`assets/` | ビジュアルエディターとワールド動作確認プロファイル | コンパイラーが一時的な XRift ワールドプロジェクトを生成して既存処理へ渡す |

### 2.1 コード編集 project

- `xrift create item` または `xrift create world` が生成する XRift コードプロジェクトをそのまま扱う。
- `package.json`、`xrift.json`、`src/` がユーザー編集可能な元データである。
- 任意の React / JSX / JavaScript を許容し、ビジュアル編集用ドキュメントの存在を要求しない。
- 任意の JSX を解析してビジュアルプロジェクトへ往復変換する機能や自動変換は提供しない。

### 2.2 ビジュアル project

- ルートの `xrift-studio.project.json` をプロジェクトマニフェストとし、`scenes/main.scene.json` と `assets/assets.json` を参照する。
- `package.json`、`xrift.json`、`src/` は編集対象のデータにしない。
- コンパイラーが生成する XRift コードプロジェクトはキャッシュまたは一時出力とし、いつでも再生成できる手編集不可の領域とする。
- ビジュアル編集からコード編集へ移行する場合は、「書き出し / Eject」によって独立したコードプロジェクトを新たに作成する。移行後はコードプロジェクト側を独立して編集し、自動同期は保証しない。
- コードプロジェクトからの取り込みは別トランザクションとして扱う。検査済みの元コードの依存グラフから静的に変換できる部分だけを不可逆に取り込み、元のビジュアル編集ドキュメントと往復同期しない。

`xrift-studio.project.json` はビジュアルプロジェクトにおけるルートマニフェストのファイル名とする。ファイル名を変更する場合は、旧ファイル名の検出と明示的な移行手順を用意し、同一プロジェクトをコードプロジェクトと誤認しない。

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

Tauri 側のプロジェクト探索では、ルートに有効な `xrift-studio.project.json` があればビジュアルプロジェクト、`package.json` と `xrift.json` があればコードプロジェクトと判定する。ビジュアルプロジェクト内の `.cache/generated-xrift/` は再帰探索の対象外とする。

ビジュアルマニフェストが不正な場合は、コードプロジェクトとして開かない。「ビジュアル編集のプロジェクトを読み込めません」と表示し、問題のあるフィールドと修復手段を示す。ライブラリカードには成果物種別に加えて「コード編集」または「ビジュアル」を表示し、開くエディターと編集対象のデータを一目で判別できるようにする。

ビジュアルカードからの作成に成功した場合は、上記の専用形式でプロジェクトルートに保存し、ライブラリへ 1 件追加してビジュアルエディターを開く。作成途中で失敗した場合は不完全なプロジェクトを一覧へ追加せず、一時ディレクトリを回収して四カード選択または保存先確認へ戻す。

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

- `SceneDocument` の親子関係を表示する。
- クリックした `Entity` を選択し、`Scene View` のアウトライン表示と `Inspector` を同時に更新する。
- 表示名を変更しても ID は変えない。
- 親子付け替え、複数選択、複製、削除、プレハブ作成はすべてコマンド（Command）として扱い、シーン編集と同じ履歴へ記録する（[7. Command と元に戻す / やり直す](#7-command-と元に戻す--やり直す)）。

### Scene View

- 表示層には React Three Fiber と Three.js を使い、`SceneDocument` の `Entity` と `AssetManifest` の参照を解決して描画する。
- 選択中の `Entity` にだけ移動・回転・拡大縮小のギズモを表示する。
- 通常クリックは単体選択、Shift または Ctrl / Cmd クリックは選択の追加・解除とする。複数選択中は全対象にアウトラインを表示し、最後に選んだ主対象（primary）の `Entity` にだけギズモを表示する。ポインター押下から離上までにカメラドラッグ相当の移動があった場合は選択を確定しない。
- ギズモ操作中はカメラ操作との競合を止め、操作完了時に 1 件の履歴として確定する。
- 編集時の表示モードは一つの目的別セレクターで「シーン」「ライトなし」「ワイヤー」「コライダー」を切り替える。空の背景、Fog、ライトを個別のツールバートグルとして並べず、診断用の 3 モードでは既定のグレーマテリアルと形状を見分けやすい暗いニュートラル背景を使う。表示モードの切り替えは `SceneDocument`、元に戻す履歴、自動保存、コンパイル、Play の結果を変更しない。
- 空間へ 3D モデルまたはプレハブをドロップした場合は、配置した `Entity` を直ちに選択する。マテリアルのドロップでは、対象メッシュの割り当て枠のバインディングだけを変更し、`Entity` は増やさない。
- `Scene View` の空間または `Entity` を右クリックすると追加サブメニューを開き、Empty、Box、Sphere、Plane、Cylinder など Registry 登録済みのプリミティブをクリック位置または選択中の親の下に作成する。作成位置と親をメニュー内で確認できるようにし、`CreatePrimitiveCommand` 1 件で追加と選択を確定する。
- 編集（Edit）と動作確認（Play）は明示的に分け、同じ `Scene View` 内で切り替える。
  - 編集時は `Entity` / 素材の選択、素材配置、ギズモ操作、Transform とマテリアルの編集を有効にする。
  - Play 中は `SceneDocument` と `AssetManifest` の編集を [4.6](#46-playsession-と実行環境-profile) が許可する範囲へ制限し、ギズモとドロップ先を隠す。プロジェクト種別に対応するプレビュープロファイルで体験を確認する。
  - Stop 時は Play 中のアバター、カメラ、入力状態を破棄し、Play 開始前の編集時の選択状態へ戻す。
- ワールド動作確認プロファイルにおけるキーボード / ゲームパッド / XR 入力は `InputAdapter` と `ControllerPlugin` を介して処理し、アイテムプレビュープロファイルへワールド移動操作を混ぜない。

### Inspector

- 右パネルの `Inspector` を `Entity` と素材の唯一のプロパティエディターとする。`sceneSelection` と `assetSelection` は独立して保持し、最後に明示操作した対象を `inspectorContext` として表示する。素材を選んでも `Entity` の選択自体は消えず、ヘッダーの `Entity` / 素材パンくずリストまたは固定タブから直前の `Entity` プロパティへ 1 操作で戻れる。
- コンテキストごとの編集範囲を明確に分ける。
  - `Entity` コンテキストでは Transform（位置・回転・大きさ）、`Component`、ジオメトリ / モデル参照、マテリアルスロット、`castShadow` / `receiveShadow`、XRift Studio 固有の編集フィールドを扱う。
  - マテリアルコンテキストでは glTF PBR と拡張設定、テクスチャコンテキストでは元データ、色空間、リサイズ、ミップマップ / サンプラー、圧縮、派生データ / 診断情報を扱う。
  - 3D モデル、プレハブ、パーティクル、スクリプト、ノードグラフも、同じく `Inspector` 内の種別ごとのセクションで編集する。
- マテリアルの変更は、その ID を参照するすべての `Entity` へ反映する。ヘッダーには素材の種別、安定 ID、参照数、「共有中」表示、未保存 / 古い状態（`dirty` / `stale`）を示す。
- メッシュのマテリアルは glTF メッシュプリミティブに対応するスロットごとに表示し、`materialBindings[].slot` と `materialAssetId` を編集する。`castShadow` と `receiveShadow` はマテリアル側ではなく `Entity` の Mesh Component にある「影」セクションで扱う。素材単位の任意の `maxDistance`（奥クリップ距離）も同じ Mesh Component に保存し、未設定時はシーンカメラの `far` を使う。`Inspector`、MCP、エディタープレビュー、Play、コード編集用コンパイラーはこの値を共有し、葉や遠景モデルだけを安全に距離制限できる。
- `Assets` からマテリアルを `Inspector` のスロットまたは `Scene View` のメッシュへドラッグできる。ホバー中は対象 `Entity` / スロットと置換前後のマテリアル名を表示し、ドロップを `AssignMaterialCommand` 1 件として確定する。複数スロットから対象を特定できない場合は、ドロップ前にスロット選択ダイアログを開き、推測では適用しない。
- `Assets` からテクスチャをマテリアル設定の対応スロットへドラッグできる。用途が `Base Color` / `Emissive` なら sRGB、Metallic-Roughness / Normal / Occlusion なら Linear の変換レシピを提案し、既存レシピと衝突する場合は確定前に選択肢を示す。
- `Entity` 固有のマテリアル上書き（オーバーライド）を追加する場合は、共有マテリアルの編集とは別の明示的な `Component` / コマンドとし、現在どちらを編集しているかヘッダーとフィールドグループで区別する。
- `Entity` の値は `SceneDocument`、素材の値は `AssetManifest` に反映する。`Inspector` のコンテキストを切り替えても `sceneSelection` と `assetSelection` は維持する。
- Play 中も実行環境が生成した値を `SceneDocument` や `AssetManifest` へ書き戻さない。任意の JSX、スクリプト、式を評価してプロパティを生成することも行わない。制作者が `Inspector` または MCP から明示的に変更したシーン構造と宣言済みスクリプトプロパティだけを編集コマンドとして保存し、追加・削除・更新された `Entity` の実行環境リビジョンへ差分同期する。Play 中に編集できるのは 4.6 が許可する範囲、スクリプトのソースファイル、宣言済みスクリプトプロパティに限定する。
- Component Registry により、メッシュ、ライト、コライダー、パーティクル、開始位置、地形、および型付きの XRift Component を追加する。

### Assets

- `Assets` パネルは探索、検索、フォルダー整理、選択、ドラッグ元データの提供、取り込み状態の表示に専念し、マテリアルやテクスチャのプロパティ編集フォームを下部へ埋め込まない。Box、Sphere、Plane などの組み込みプリミティブは保存対象素材ではなく、`Hierarchy` / `Scene View` の右クリック追加サブメニューとツールバーの追加パレットから作成する。
- `Assets` に表示するユーザー管理対象は、3D モデル / glTF、テクスチャ、マテリアル、プレハブ、パーティクル、音声、スクリプト、シェーダー、ノードグラフとし、それぞれ安定 ID、表示名、種別、状態、サムネイルを持たせる。
- 単一クリックは `assetSelection` を更新し、`Inspector` を素材コンテキストへ切り替える。3D モデル / プレハブの `Scene View` へのドラッグまたは「配置」操作だけが `Entity` を作成し、マテリアルのドラッグはメッシュの割り当て枠バインディング、テクスチャのドラッグはマテリアルのテクスチャスロット参照だけを変更する。
- 追加パレットのプリミティブと、3D モデル・テクスチャ・マテリアル・プレハブ・パーティクルは、見た目とラベルの両方で区別する。検索と絞り込みは表示名、種別、診断状態を対象とする。
- サムネイルは `pending -> generating -> ready | failed | stale` のライフサイクルを持つ動的な派生ビューとする。元ファイル、マテリアルプロパティ、依存ファイル、サムネイル生成レシピの変更を検知してバックグラウンドキューで再生成する。3D モデル / プレハブは固定カメラ、マテリアルは基準球、テクスチャは用途の色空間、パーティクルは代表時刻を使い、選択中またはホバー中だけ処理上限の範囲内で回転プレビューやパーティクルループなどの短いライブプレビューを許可する。
- テクスチャおよび GLB / glTF の外部ドラッグ＆ドロップは取り込みキューで検証、元ファイルのコピー、派生データ / サムネイル生成、マニフェストへの確定までを実行する。取り込み完了前にシーンやマテリアル枠の参照を確定せず、成功後に `Inspector` で編集できる状態にする。
- 「アセットストア」は [6.8 外部リソースカタログ](#68-外部リソースカタログ) のカタログを開き、CC0 プロバイダーと XRift 公式カタログから同じインポートトランザクションで素材を追加する。
- 非対応形式のファイルがドロップされた場合はシーンを変更せず、対応形式と次の操作を案内する。
- フォルダーは素材 ID とは別の安定した `folderId` を持つ表示上の整理単位とし、フォルダー移動だけで元ファイルや派生ファイルの実パスは変更しない。空白部またはフォルダーのコンテキストメニューから「マテリアル / プレハブ / パーティクルを作成」「3Dモデル / テクスチャをインポート」「新しいフォルダー」を選べる。素材のコンテキストメニューには「名前を変更」「複製」「削除」「参照元を表示」「再インポート」「サムネイルを再生成」を種別と状態に応じて表示する。
- 削除前には参照中の `Entity`、プレハブ、マテリアル枠の件数を示す。参照を壊す削除は暗黙に続行せず、置換または明示的な参照解除を同じコマンドトランザクションに含める。

### Resizable / dockable layout

- `Hierarchy`、`Scene View`、`Inspector`、`Assets` はスプリッターでサイズ調整でき、`Hierarchy` / `Inspector` / `Assets` は定義済みのドック領域へ移動できる。ドラッグ中はドロップ先のプレビューと移動後のパネル順を表示する。Escape キーまたは領域外へのドロップではレイアウトを変更しない。
- レイアウトは `layoutSchemaVersion`、パネル ID、ドック領域、並び順、サイズ比率、折りたたみ / 固定済み `Inspector` タブとしてエディター設定（Editor Preferences）に保存する。絶対ピクセル値だけを保存せず、ウィンドウサイズと最小幅・最小高さに合わせて正規化する。素材、シーン、選択状態などの編集データはレイアウトドキュメントに含めない。
- 起動時、ウィンドウリサイズ時、プロジェクト種別切り替え時に保存済みレイアウトを復元する。存在しないパネル ID、画面外のフローティング矩形、最小値未満のサイズは安全な既定値へ移行する。「レイアウトをリセット」で既定の配置（左 `Hierarchy`、中央 `Scene View`、右 `Inspector`、下 `Assets`）へ戻せる。
- パネルのリサイズやドック移動では編集の元に戻す履歴を増やさない。エディター設定の保存に失敗しても編集作業を止めず、そのセッションのレイアウトを維持したまま再試行できるようにする。

### 視覚基準

- エディターは明るいニュートラル面を既定テーマとし、白から neutral-50 のパネル、neutral-200 の境界線、neutral-900 の本文を使う。3D ビューの背景色や素材サムネイルの色をテーマの代わりにしない。ダークテーマを追加する場合もセマンティックカラートークンとコントラスト基準を共有する。
- UI フォントは OS のシステムサンセリフを基準とし、本文 13px、補助情報 12px、パネル見出し 14px、画面見出し 16px を最小基準とする。素材名や `Entity` 名を 12px 未満に縮小しない。
- 本文は neutral-900、補助情報は neutral-600、無効状態は neutral-400、境界線は neutral-200 を基準とする。ブランドカラーは選択、主操作、フォーカスリングに限定し、警告・エラー・成功は色と短い文言を併用して伝える。
- 基本余白は 4px グリッドとし、フィールド内 4px、フィールド間 8px、セクション内 12px、パネル内 16px を基準とする。`Hierarchy` 行と `Assets` 行の操作領域は最低 32px、主要ボタンは最低 36px とする。
- 数値ラベル、単位、入力欄の列を揃え、3 軸値は X / Y / Z を色だけでなく文字でも示す。キーボードフォーカスは 2px 以上の輪郭で示し、ホバー時と同じ見た目にしない。
- パネルリサイズ後も `Hierarchy`、`Scene View`、`Inspector`、`Assets` の主要領域を見失わないようにする。狭い幅では `Hierarchy` / `Inspector` / `Assets` を折りたたみタブにできるが、アクティブな `Inspector` コンテキスト、選択対象、未保存状態はヘッダーに残す。

### Icon Registry と inventory

すべての操作アイコンは `lucide-react` の既存エクスポートを中央の `IconRegistry` からセマンティックトークンで参照する。各 UI コンポーネントが Lucide 名を直接指定せず、`editor.play` のような用途名を要求する。他製品のアイコンアセットのコピー、既存製品に似せたカスタム SVG の作成、文字を図形化した独自アイコンは行わない。線幅（stroke）は原則 `1.9`、ツールバーは 18px、行・フィールドは 16px、空状態は 24px を基準とし、装飾目的でサイズや線幅を変えない。

アイコンだけのボタンには、必ず同じ語の可視ツールチップと `aria-label` を付与する。ショートカットは Shortcut Registry からツールチップ末尾へ自動付与し、ショートカットがない場合は操作名だけを表示する。状態色はセマンティックトークンで管理し、色だけで状態を伝えない。`neutral` は neutral-600、`active` は brand-600 と brand-50 背景、`success` は emerald-600、`warning` は amber-700、`error/destructive` は rose-600、`disabled` は neutral-400 を起点とする。

| Semantic token | Lucide export | 用途 / 表示ラベル | 既定ツールチップ | Shortcut | 状態色 |
| --- | --- | --- | --- | --- | --- |
| `project.world` | `Globe2` | ワールド | ワールドを作成 | なし | neutral / 選択時 active |
| `project.item` | `Box` | アイテム | アイテムを作成 | なし | neutral / 選択時 active |
| `project.classic` | `Code2` | コード編集 | コードで作成 | なし | neutral / 選択時 active |
| `project.visual` | `PanelsTopLeft` | ビジュアル | ビジュアルエディターで作成 | なし | neutral / 選択時 active |
| `create.primitive` | `Cuboid` | プリミティブ | プリミティブを作成 | なし | neutral |
| `asset.model` | `Boxes` | 3Dモデル / GLTF | モデル | なし | 種別フォールバックの neutral |
| `asset.texture` | `Image` | テクスチャ | テクスチャ | なし | 種別フォールバックの neutral |
| `asset.material` | `Palette` | マテリアル | マテリアル | なし | 種別フォールバックの neutral |
| `asset.prefab` | `Package` | プレハブ | プレハブ | なし | 種別フォールバックの neutral |
| `asset.particle` | `Sparkles` | パーティクル | パーティクル | なし | 種別フォールバックの neutral |
| `asset.folder` | `Folder` / `FolderOpen` | フォルダー | フォルダーを開く / 閉じる | なし | neutral / ドロップ先は active |
| `asset.import` | `HardDriveUpload` | インポート | 3Dモデルまたはテクスチャをインポート | なし | neutral |
| `asset.reimport` | `RefreshCw` | 再インポート | 元ファイルから再インポート | なし | neutral / 実行中 active |
| `asset.new-folder` | `FolderPlus` | 新しいフォルダー | 新しいフォルダー | なし | neutral |
| `asset.new-prefab` | `PackagePlus` | プレハブを作成 | 選択オブジェクトからプレハブを作成 | なし | neutral |
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
| `publish.upload` | `CloudUpload` | アップロード | XRiftへアップロード | なし | active / 実行中 active |
| `status.ready` | `CircleCheck` | 準備完了 | 準備完了 | なし | success |
| `status.info` | `Info` | 情報 | 詳細を表示 | なし | active |
| `status.warning` | `TriangleAlert` | 警告 | 警告を表示 | なし | warning |
| `status.error` | `CircleX` | エラー | エラーを表示 | なし | error |
| `status.loading` | `LoaderCircle` | 処理中 | 処理中 | なし | active、回転アニメーション |

3D モデル、テクスチャ、マテリアルは `thumbnail.status === ready` であれば生成済みサムネイルを第一表示とする。プレハブとパーティクルも生成可能な場合は同じ規則を適用する。種別アイコンはサムネイルが未生成・失敗・表示不能な場合のフォールバックに限定し、失敗時は種別アイコンに状態バッジとテキストを添える。生成済みサムネイルの上に製品固有の装飾アイコンや Lucide アイコンを常時重ねない。

## 4. ビジュアル project の document model

### 4.1 三つの正本

ビジュアルプロジェクトでは、役割の異なる三つのバージョン付きドキュメントを管理対象の元データとする。

```text
VisualProjectDocument (xrift-studio.project.json)
  ├─ entrySceneId + scenePaths ─> SceneDocument (scenes/main.scene.json)
  └─ assetManifestPath ─────────> AssetManifest (assets/assets.json)
                             ↑
SceneDocument の mesh component ─ asset ID 参照 ─┘
```

- `VisualProjectDocument` はプロジェクト種別、開始シーンの ID、各シーンのパス、アセットマニフェストのパス、メタデータを定義する。
- `SceneDocument` は `Entity`、親子関係、`Component`、素材 ID の参照だけを持つ。素材本体やマテリアルの設定値を直接埋め込まない。
- `AssetManifest` は 3D モデル / glTF、テクスチャ、マテリアル、プレハブ、パーティクル、音声、スクリプト、シェーダー、ノードグラフの定義と、元ファイルのメタデータおよび再生成可能な派生メタデータを持つ。
- 三つのドキュメントはそれぞれ `schemaVersion` を持ち、個別に検証とマイグレーションを行う（[4.10](#410-schemaversion-と-migration)）。
- ID は表示名や相対パスを変更しても変えない。参照はファイル名ではなく常に ID で解決する。

これら三つはプロジェクトを開くためのルートドキュメントである。`VisualProjectDocument` は `assetFoldersPath` と `saveCommitId` / コミット済みハッシュ一覧を持ち、プレハブが参照するプレハブ用 `SceneDocument` とフォルダー定義ドキュメントもバージョン管理された保存対象セットに含める。プレハブやフォルダー情報を `AssetManifest` へ巨大なインライン JSON として埋め込まない。

### 4.2 VisualProjectDocument

`xrift-studio.project.json` は Tauri のライブラリ探索処理とコンパイラーが最初に読み込むマニフェストである。

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

ビジュアルプロジェクトの判定はルートマニフェストのファイル名とスキーマで行い、コードプロジェクトのフィールドから推測しない。`entrySceneId` は `scenePaths` に存在している必要があり、すべてのパスはプロジェクトルートからの相対パスでなければならない。コンパイラーと `PlaySession` は `projectKind` に従ってワールド用・アイテム用のプロファイルを選び、アイテムプロジェクトをワールド用アダプターで生成しない。

### 4.3 SceneDocument

`SceneDocument` は ECS に着想を得た正規化 `Entity` グラフであり、システムスケジューラー、クエリ、独自の実行環境 ECS は持たない。Script Component は `Entity` 単位の更新順序を必要とするが、その順序は `Entity` の階層順と `Component` の並び順から決まる固定規則とし、`SceneDocument` にスケジューラーやクエリは追加しない（[4.8 スクリプト](#48-scripting-script-asset--script-component)）。

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
          "geometry": { "kind": "builtin", "primitive": "box" },
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
          "modelAssetId": "asset_model_gate",
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

Mesh Component の形状参照は二種類に分ける。ユーザー素材ではない組み込み形状は `geometry: { kind: "builtin", primitive: "box" }` のような型付きの追加 Registry 参照とし、取り込んだ 3D モデルは `modelAssetId` による素材 ID 参照とする。`materialBindings[].materialAssetId` は `material` 種別の素材だけを参照する。上記の 2 つの `Entity` は同じマテリアルを共有しているため、マテリアルの変更は両方へ反映される。`Entity` 固有の上書き設定は、共有素材の編集とは別のバージョン付き `Component` として扱う。

### 4.4 AssetManifest

`AssetManifest` は `SceneDocument` から独立しており、`Inspector` の素材コンテキストとインポーターの基準データとなる。

```json
{
  "schemaVersion": "0.1.0",
  "assets": {
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
        "pbrMetallicRoughness": {
          "baseColorFactor": [0.72, 0.7, 0.65, 1],
          "metallicFactor": 0.05,
          "roughnessFactor": 0.86,
          "baseColorTexture": { "textureAssetId": "asset_texture_stone" }
        }
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
    "asset_prefab_lamp": {
      "id": "asset_prefab_lamp",
      "name": "Garden Lamp",
      "kind": "prefab",
      "status": "ready",
      "source": { "kind": "document" },
      "prefabDocumentPath": "scenes/prefabs/asset_prefab_lamp.scene.json"
    },
    "asset_script_spinner": {
      "id": "asset_script_spinner",
      "name": "Spinner",
      "kind": "script",
      "status": "ready",
      "contractVersion": "1.0.0",
      "language": "ts",
      "source": { "kind": "project", "relativePath": "scripts/spinner.ts" }
    }
  }
}
```

素材の種別（`kind`）は `model | texture | material | prefab | particle | audio | script | shader | interactivity | lightmap` の閉じた集合とし、検証・`Inspector`・コンパイラーアダプターを同一の変更で揃える。`source.kind = "project"` の `relativePath` はプロジェクトルート相対の `/` 区切りに正規化し、OS の絶対パス、Blob URL、トークンは保存しない。`script` 種別は [4.8 スクリプト](#48-scripting-script-asset--script-component) の契約に従い、`source.kind = "project"` のみを許可し、コード本文と派生スキーマをマニフェストへ保存しない。

3D モデルとテクスチャは次のメタデータを持つ。

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

`derived` は元ファイルのハッシュとインポーターのバージョンから再生成できるキャッシュとし、欠落しても元ファイルから復元できる構造とする。

外部カタログから取り込んだ素材は、配布元、作者、ライセンス、配布ページ URL を `attribution` として保持し、公開時の生成物へも同じ情報を出力する（[6.8](#68-外部リソースカタログ)）。

### 4.5 EditorSession と Editor State

`EditorSession` は読み込んだ三つのルートドキュメント、参照されるプレハブ / フォルダー定義ドキュメント、および一時状態を束ねるが、ドキュメント自体とは同一視しない。

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

`Scene View`、`Hierarchy`、`Assets`、`Inspector` はドキュメントを直接書き換えず、`EditorSession` へ Command または Intent を渡す。

- `SelectEntityIntent` は `sceneSelection` を更新し、`Scene View`、`Hierarchy`、`Inspector` の `Entity` コンテキストを同期する。`SelectAssetIntent` は独立した `assetSelection` を更新し、`Assets` と `Inspector` の素材コンテキストを同期する。どちらも通常の選択操作だけでは元に戻す履歴へ積まない。
- マテリアルやテクスチャを選択しても `sceneSelection` は解除しない。`Inspector` は `inspectorContext` に従って素材プロパティを表示し、ヘッダーの固定 `Entity` タブから保持済みの `sceneSelection` へ戻れる。`Entity` を選び直しても、`assetSelection` は明示的な選択解除まで維持する。
- `PlaceAssetIntent` は素材 ID とドロップ位置を検証し、`SceneDocument` に `Entity` を追加するコマンドへ変換する。
- `ImportFilesIntent` は外部ファイルを読み込みキューへ渡し、処理が成功するまで `SceneDocument` と `AssetManifest` を変更しない。
- `UpdateEntityComponentCommand` は `SceneDocument`、`UpdateAssetCommand` は `AssetManifest` だけを変更する。
- ドキュメントの変更は対象リビジョンをインクリメントし、保存成功時のリビジョンと比較して未保存状態を判定する。

カメラ位置、パネルレイアウト、検索条件、ホバー状態、`inspectorContext`、ギズモ操作中の一時値はエディター状態（Editor State）であり、編集ドキュメントや元に戻す履歴には含めない。パネルレイアウトは別のバージョン付きエディター設定（Editor Preferences）として保存する。配置、マテリアル割り当て、複製、削除、プレハブ作成など、ドキュメントと選択状態を同時に変えるコマンドは、実行前後の `sceneSelection` と `assetSelection` を一つの選択スナップショットとして履歴に保持する。

### 4.6 PlaySession と実行環境 profile

Play の実行中だけ存在する値は `PlaySession` のエディター実行時状態（Editor Runtime State）とする。`SceneDocument` と `AssetManifest` のスナップショットから、編集対象と参照を共有しない実行環境シーンを生成し、Stop 時に必ず破棄する。中央パネルは通常の `Scene View` とは境界とヘッダーが異なる `Play Window` へ切り替え、`Hierarchy` と `Inspector` が編集データを、`Play Window` が実行コピーを表示していることを同時に判別できるようにする。

- `WorldPlayProfile`: スポーン地点の解決、ワールド移動、キャラクターおよび物理の実行環境を組み立てる。
- `ItemPreviewProfile`: XRift から渡されるアイテムの Transform、プレビューステージ、カメラ、インタラクションを組み立てる。プレイヤースポーンの存在は前提にしない。
- `InputAdapter`: キーボード、ゲームパッド、XR コントローラーなどの入力を正規化したアクションへ変換する。
- `ControllerPlugin`: アクションに応じて実行環境のアバターまたはプレビュー対象の状態を更新する。
- `PhysicsRuntimePlugin`: 衝突判定、重力、物理ステップを担当する。未導入時は明示的な物理なし実装（no-physics 実装）を使う。
- `RuntimePlugin`: `start`、`update`、`stop`、`dispose` のライフサイクルを持つ。
- `entityRevisions`: `Entity` ID ごとの実行環境世代。許可された編集変更を反映する時だけ対象 `Entity` の世代を進め、その `Entity` のプラグイン、アニメーションミキサー、物理ボディを破棄して再生成する。

ワールドプレビューのキーボード / ゲームパッド / XR アクションは `InputAdapter`、移動と物理演算は登録済みの `ControllerPlugin` / `PhysicsRuntimePlugin` で処理する。コントローラー固有の一時的な実行時状態をプロジェクトドキュメントへ保存せず、アイテムプレビュープロファイルにはワールド移動を適用しない。

Play 中も、`Entity` の選択、Transform、コライダー、Animation、`Hierarchy` 構造、および `Entity` の追加・削除・複製・親変更・`Component` 追加といった編集コマンドを許可する。これらは通常どおり履歴と自動保存へ記録し、`PlaySession` は更新後の実行入力をコピーして追加・削除・更新された `Entity` だけを差分同期する。MCP からの書き込みも同じリビジョン検査と同期経路を使う。一方、素材、マテリアル、シーン設定の編集や、実行環境で生成された値の書き戻しは無効にする。

Stop 時は入力リスナー、アニメーションフレーム、コントローラー、物理エンジン、`XRSession` を破棄し、実行環境上の位置や速度をドキュメントへ書き戻さずに、最新の編集済み `SceneDocument` / `AssetManifest` と編集時の選択状態・カメラへ戻す。

### 4.7 Component / Asset Registry

`Inspector`、検証、コンパイラー間の食い違いを防ぐため、`Component` の `type` と素材の `kind` ごとに、ターゲット非依存のスキーマ、既定値、対応プロジェクト種別、`Inspector` フィールド、参照ルールを 1 か所に定義する。Three プレビュー、R3F、XRift ワールド、XRift アイテムの各アダプターは別層に置き、同じ `Component` 種別 / 素材種別へ登録する。未知の `type` / `kind` や対応アダプターの欠落は無視して続行せず、ドキュメントパス、`Entity` / 素材 ID、フィールド、ターゲットを含む診断として報告する。

#### Material schema: glTF 2.0 core

マテリアルスキーマは Khronos glTF 2.0 コアの Metallic-Roughness マテリアルを欠落なく型付きスキーマとして定義し、インポート、`Inspector`、プレビュー、コンパイラーで同一フィールドを共有する。

| glTF core field | 編集時の表現と既定値 | 検証ルールと意味 |
| --- | --- | --- |
| `pbrMetallicRoughness.baseColorFactor` | RGBA `[1, 1, 1, 1]` | 4 要素すべて有限数かつ `0..1`。テクスチャと乗算する。A はアルファカバレッジ |
| `pbrMetallicRoughness.baseColorTexture` | `TextureInfo` または未設定 | RGB は sRGB、A は Linear。premultiplied alpha にしない |
| `pbrMetallicRoughness.metallicFactor` | `1` | 有限数かつ `0..1`。Metallic-Roughness テクスチャの B チャンネルと乗算 |
| `pbrMetallicRoughness.roughnessFactor` | `1` | 有限数かつ `0..1`。Metallic-Roughness テクスチャの G チャンネルと乗算 |
| `pbrMetallicRoughness.metallicRoughnessTexture` | `TextureInfo` または未設定 | Linear。G = Roughness、B = Metalness。R / A はこの用途では無視 |
| `normalTexture` | `NormalTextureInfo` または未設定 | Linear の接空間 RGB。`scale` の既定値は `1`。A は無視 |
| `occlusionTexture` | `OcclusionTextureInfo` または未設定 | Linear の R チャンネル。`strength` の既定値は `1`、範囲は `0..1` |
| `emissiveTexture` | `TextureInfo` または未設定 | RGB は sRGB、A は無視 |
| `emissiveFactor` | RGB `[0, 0, 0]` | 3 要素すべて有限数かつ `0..1`。Emissive テクスチャと乗算 |
| `alphaMode` | `OPAQUE` | `OPAQUE` / `MASK` / `BLEND` のいずれか。Base Color のアルファ解釈を決める |
| `alphaCutoff` | `0.5` | `MASK` の時だけ有効な有限数かつ `>= 0`。他のモードでは保存・出力しない |
| `doubleSided` | `false` | `true` の場合は背面カリングを無効にし、裏面法線を反転して評価する |

不透明度は `baseColorFactor[3]` と `baseColorTexture` のアルファを乗算し、`alphaMode` と `alphaCutoff` で解釈する。別の `opacity` フィールドは追加しない。UI の「透明度」欄ではこの関係をまとめて提示し、アルファ値を変更しただけで `alphaMode` を `BLEND` へ自動変更しない。

`TextureInfo` のコア項目と拡張項目は次のように分ける。

| Field | glTF 区分 | 編集時の扱い |
| --- | --- | --- |
| texture `index` | core | `textureAssetId` として安定 ID 参照へ変換する |
| `texCoord` | core | `TEXCOORD_n` の `n`（既定 `0`）。対象プリミティブに同じ属性が必要 |
| normal `scale` | core specialized TextureInfo | 法線 X / Y の強度。テクスチャ全体ではなくマテリアルスロット側に保存 |
| occlusion `strength` | core specialized TextureInfo | オクルージョンの強度。マテリアルスロット側に保存 |
| `offset`、`rotation`、`scale` | `KHR_texture_transform` 拡張 | コアフィールドと混ぜず、型付きの拡張ブロックに保存。offset `[0,0]`、rotation `0` ラジアン、scale `[1,1]` |
| 拡張内 `texCoord` | `KHR_texture_transform` 拡張 | 拡張対応時にコアの `texCoord` を上書きする。コアフィールドとは別に表示する |

`KHR_texture_transform` の `extensionsUsed` / `extensionsRequired` とフォールバック UV の有無も診断する。任意の拡張 JSON をそのままマテリアルへ流し込まず、Registry に登録した型付き拡張だけを編集対象データとして扱う。

色空間はファイルの ICC プロファイルではなく、マテリアルスロットの用途で決定する。`Base Color` と `Emissive` の RGB は sRGB デコード、Metallic-Roughness・Normal・Occlusion・Alpha は Linear とする。同じ元画像を異なる用途で共有する場合も元ファイルは複製せず、用途別の変換レシピと派生データを分けて管理する。`Inspector` には単に「sRGB 画像」と書くのではなく、「基本色: sRGB」「法線マップ: Linear」のように参照先の意味を表示する。

#### マテリアル枠、影、import の対応

glTF は一つのメッシュに複数のメッシュプリミティブを持ち、各プリミティブがマテリアルを一つ参照できる。3D モデルインポーターはマテリアル名だけでなく、メッシュのインデックス、プリミティブのインデックス、元のマテリアルインデックスから安定したスロット ID を生成し、3D モデル素材の派生メタデータにスロット一覧を保持する。`MeshComponent.materialBindings[]` はスロット ID ごとにマテリアル ID を一つ参照し、スロットの重複・欠落・別種別の参照を検証エラーとする。組み込みプリミティブは `default` スロット 1 件を使う。

再インポートでプリミティブ構成が変わった場合は、元のインデックス、名前、構造フィンガープリントの順にバインディングを照合する。自動で対応付けられないバインディングは削除したり別スロットへ推測割り当てしたりせず、`stale-binding` 診断として記録し、`Inspector` から置換先を選べるようにする。

`castShadow` と `receiveShadow` は XRift Studio の Mesh Component およびターゲットアダプター用の編集設定であり、glTF 2.0 コアのマテリアルフィールドではない。glTF インポート時にはプロファイルの既定値を設定し、マテリアルから推測しない。glTF へ再出力する場合もマテリアル JSON へ追加せず、XRift コンパイラーアダプターが実行環境設定として扱う。`maxDistance` も同じくレンダラーアダプターの設定とし、`0.1..1,000,000` の有限値または未設定を受け付け、`null` 更新でシーンカメラの `far` へ戻す。`doubleSided` はマテリアル側、影と描画距離は `Entity` / メッシュ側とし、UI セクションと保存先を明確に分ける。

#### Material extension Registry

マテリアルスキーマはコアの Metallic-Roughness を完全対応とし、拡張フィールドをコアフィールドのように見せない。型付きマテリアル拡張の最初の対応対象は `KHR_materials_iridescence` とし、`iridescenceFactor`、`iridescenceTexture`、`iridescenceIor`、`iridescenceThicknessMinimum`、`iridescenceThicknessMaximum`、`iridescenceThicknessTexture` を Khronos スキーマに沿って一つの拡張アダプターで扱う。既定値は factor が `0`、屈折率が `1.3`、膜厚が `100nm..400nm` とし、iridescence テクスチャの Linear R チャンネルと thickness テクスチャの Linear G チャンネルを使う。最小値が最大値を超える入力は確定せず、`KHR_materials_unlit` との同時利用も拒否する。

`KHR_materials_clearcoat`、`KHR_materials_transmission`、`KHR_materials_ior`、`KHR_materials_volume`、`KHR_materials_sheen`、`KHR_materials_specular`、`KHR_materials_anisotropy`、`KHR_materials_emissive_strength`、`KHR_materials_unlit`、`KHR_materials_dispersion` などは、一つずつ型付きアダプター、検証、`Inspector` セクション、プレビューアダプター、コンパイラーアダプターを揃えて Registry へ登録する。未対応の `extensionsRequired` を含むモデルは `ready` にせず、拡張名と対応策を示す。未対応のオプション拡張はコアフォールバックによるプレビューと見た目が変わる可能性を診断し、元ファイルは非破壊で保持する。

`KHR_texture_basisu` と `EXT_texture_webp` はマテリアルモデルではなく、テクスチャの元データを差し替える glTF 拡張として別の Registry に置く。KTX2 / WebP をコアの PNG / JPEG と同一フィールドのように保存しない。

#### Custom Shader Material

GLSL を直接記述するマテリアルはシェーダー素材として管理する。シェーダー素材は UTF-8 の GLSL ソースとハッシュを管理下に保存し、マテリアル側はシェーダー素材 ID、型付き uniform 値、テクスチャ uniform の素材 ID 参照を持つ。Studio の Play、エディタープレビュー、生成物は同じ uniform 記述子を参照する。Skybox シェーダーと水面マテリアルもこの仕組みの上に置き、シーンの風とライトを共通入力として受け取る（[マテリアルカタログ仕様](./MATERIAL_CATALOG_SPEC.md)）。

コードプロジェクトから取り込んだ `ShaderMaterial` は、マテリアルの `shader` に `kind: "classic-r3f"` の記述として保持する。記述の型と上限は `packages/xrift-studio-runtime/src/classic-shader-contract.ts` に置き、`ShaderMaterial` の組み立ては `classic-shader-runtime.ts` の `createClassicShaderMaterial` を単一の実装とする。編集画面（`Scene View`、Play、プレビュー）は `createClassicR3fMaterial` 経由で、ランタイム JSON の読み込みは直接この関数を呼び出す。生成するワールドにも同じソースを `src/xrift-studio/` へ同梱し、`XriftClassicShaderMaterial` から呼び出す。経路ごとに別の組み立て処理を増やさない。

uniform の型と variant の仕様は次の通りである。

- uniform の型: `number`、`color`、`vector`、`matrix`（9 個または 16 個、列優先）、`array`（1〜4096 個の数値）、`texture`、`texture-3d`、`texture-cube`。
- variant の項目: `side`、`transparent`、`depthWrite`、`defines`、`blending`、`frustumCulled`。後から追加した項目はすべて省略可能とし、省略時は従来の描画結果になる。上限値の根拠は `CLASSIC_SHADER_LIMITS` の注釈に記す。
- テクスチャ管理: テクスチャは Texture Asset ごとに 1 回だけ読み込み、uniform ごとに複製を渡す。複製は画像データを共有し、サンプラー設定だけを個別に持つ。`texture` は 8bit 画像・KTX2・EXR を読み込む。EXR は `classic-shader-data-texture.ts` がファイルの精度（16bit または 32bit）のまま読み込む。`texture-3d` は横並びの 8bit 画像から、`texture-cube` は 6 枚の 8bit 画像から生成し、同一画像からは 1 つだけ作成する。2D 画像は上端が v = 1、3D は画像の上端が y = 0 になる。

`texture`と`texture-cube`は、`generateMipmaps: true`でMipmapsを読む。`filter`は1段階の中の読み方を決め、隣り合う2段階は常に混ぜる。`linear`は`LinearMipmapLinearFilter`、`nearest`は`NearestMipmapLinearFilter`になる。8bitの画像は読み込むときにMipmapsを作る。KTX2はファイルが持つMipmapsを使い、持たなければ元の画像だけを読む。EXRには作らない。浮動小数のMipmapsは端末の拡張機能がないと作れず、作れない端末では黒く描かれるためである。`anisotropy`（1〜16）は、three.jsがMipmapsを読み`filter`が`linear`の場合にだけ反映する。それ以外で2以上を指定した記述は、検証で拒否する。Texture Asset自身のサンプラー設定はuniformへ引き継がない。

シーンが決めるuniformは、宣言したシェーダーにだけ渡す。風は`uWindDirection`・`uWindSpeed`・`uWindTurbulence`、主光源と環境光は`uSunDirection`・`uSunColor`・`uSunIntensity`・`uAmbientColor`・`uAmbientIntensity`である。編集画面とPlayは、`scene-driven-uniforms.ts`の`applyWindDrivenUniforms`と`applyLightingDrivenUniforms`で、描画中のマテリアルへ書き込む。プリミティブとTerrainはMeshごとのhookが、モデルは`ProjectModelVisual`が書き込む。モデルはMeshとスロットごとにvariantを選んでマテリアルを組み立てるため、そのすべてが対象になる。プレビューなどScene Viewの外で描くモデルには渡さず、マテリアルに保存した値を使う。公開物では、`compiler/classic-shader-publish.ts`の`publishedSceneClassicShader`が記述へ書き込む。生成するワールドとRuntime JSONのマニフェストは同じ記述を持つ。Runtime JSONの読み込みは、シーンの風とライトを読まない。

- メッシュ状態と時刻 uniform: `frustumCulled: false` はマテリアルの `userData` に記録し、`applyClassicShaderMeshState` がそのマテリアルを割り当てたメッシュへ反映する。マテリアルを外したとき、他に同じ指定を持つマテリアルがなければメッシュの元の値へ戻す。時刻 uniform は `userData.xriftTimeUniforms` に記録し、各経路が `advanceMaterialTimeUniforms` で進める。組み立て後に `uniforms` オブジェクト自体やその要素を差し替えず、値だけを書き換える。

#### マテリアルの新規作成

`Assets` の「作成」から「マテリアル」を選び、名前とプリセットを指定する。既定プリセットは「標準サーフェス」とし、白、不透明、metallic `0`、roughness `0.7`、double-sided オフを明示することで、Khronos コアの省略時既定値と同一だと誤解させない。「glTF既定値」プリセットを選んだ場合だけ metallic と roughness を `1` にする。

作成に成功すると、`source.kind = "document"` のマテリアルを 1 件 `AssetManifest` に追加し、`Assets` で選択して `Inspector` に表示する。既存の `Entity` やマテリアル枠へ自動割り当てはしない。空の名前、重複 ID、無効なプリセットでは `AssetManifest`、選択状態、履歴を変更せず、入力欄の近くに修正方法を示す。表示名の重複は許容して ID で識別し、必要に応じて同名件数を表示する。キャンセル時は `Assets` の直前の選択状態と `Inspector` コンテキストへ戻る。

#### コンポーネント定義と XRift のコンポーネント

Component Registry は「保存スキーマ」と「各ターゲットで実行するアダプター」を分離し、少なくとも次の要素を登録単位とする。

```text
ComponentDefinition
  type / schemaVersion / displayName / semanticIcon
  allowedProjectKinds / defaults / inspectorSections
  referenceFields / validation / migration
  previewAdapter / worldCompilerAdapter / itemCompilerAdapter
```

基礎となる `Component` は、Transform、メッシュ、ライト、コライダー、物理挙動、音源、開始位置、地形とする。

- パーティクルは、エミッター、形状、寿命、発生レート、サイズ / カラーカーブ、マテリアル / テクスチャ参照といった再利用可能なエフェクト定義をパーティクル素材側に置く。`Entity` の `ParticleRendererComponent` はパーティクル素材 ID と `Entity` 固有の再生・ループ・シード設定だけを参照し、パーティクル設定値をメッシュや `Entity` へインラインコピーしない。
- 地形は高さサンプルと草の散布ルールを持つ静的メッシュとし、固定のメッシュ形状コライダーを伴う（[地形エディター仕様](./TERRAIN_EDITOR_SPEC.md)）。

XRift 固有の `Component` には `xrift.*` 名前空間と明示的なワールド / アイテムプロファイルを持たせる。Registry にスキーマ、`Inspector` 定義、プレビュー、対象コンパイラーアダプターがすべて揃った `Component` だけを作成可能とし、任意の JavaScript コンポーネントや文字列で指定されたモジュールをビジュアルドキュメントから読み込まない。Script Component だけは例外で、ビジュアルドキュメント内ではなくプロジェクト内のスクリプトソースファイルを素材 ID で参照する。ドキュメント側が保持するのは参照と宣言済みプロパティ値だけであり、コード文字列は持たない（[4.8 スクリプト](#48-scripting-script-asset--script-component)）。プレビューアダプターはないがコンパイラーアダプターはある場合は「プレビュー未対応」と表示し、偽の見た目で代用しない。ターゲットに対応しない `Component` は保存時に警告、コンパイル前にエラーとし、別プロジェクト種別向けに黙って削除しない。

Registry が型付きで扱う XRift Component は次の 16 種とする: `Interactable`、`Grabbable`、`Seat`、`Mirror`、`Skybox`、`VideoScreen`、`VideoPlayer`、`LiveVideoPlayer`、`Video180Sphere`、`ScreenShareDisplay`、`SpawnPoint`、`TextInput`、`TagBoard`、`EntryLogBoard`、`Portal`、`BillboardY`。

- Props の定義は [公式 API リファレンス](https://docs.xrift.net/world-components/components/) ではなく、実際にステージング環境へインストールされる `@xrift/world-components` の公開エクスポートを基準とする。対象バージョンは `src/lib/xrift-cli.ts` の `COMPILER_WORLD_COMPONENTS_PACKAGE_SPEC` を単一の宣言箇所とし、`package.json` とワールド実行環境シェルの三箇所が一致することを `pnpm cli:test`（`scripts/check-world-components-alignment.mjs`）で強制する。
- 生成コードでは、たとえば `VideoScreen` に必須の `id` と任意の `url` を出力し、`sync` は `VideoPlayer` ではなく `LiveVideoPlayer` にだけ出力する。`Grabbable` は `sync` と離した位置の共有、`Seat` は座面の姿勢と `exitOffset` を出力し、`onUseStart` / `onControlInput` などの実行時コールバックはドキュメントへ保存しない。
- `EntryLogBoard` の入れ子になった部分オブジェクトは JSON オブジェクトとしてスキーマ検証し、関数型の `formatTimestamp` / `onJoin` / `onLeave` はビジュアルドキュメントにコードを保存せずパッケージの既定動作へ委ねる。`Interactable` の必須 `onInteract` は固定の no-op アダプターを生成し、任意コードをドキュメントから注入しない。
- `DevEnvironment` はローカル起動用ラッパーであり、シーン編集用 `Component` にはしない。Box / メッシュのコライダーは `@xrift/world-components` のエクスポートではなく Rapier の物理コンポーネントとして、汎用コライダー Registry とコンパイラーアダプターで扱う。

### 4.8 Scripting (Script Asset / Script Component)

制作者が `Entity` に振る舞いを与えるため、バージョン付き契約として明示的に設計した例外機構である。本節は、設計原則 7、4.3、4.7、9.4、10 章、Extension policy の各規定に対する唯一の例外範囲を定める。ここに記されていない形式の任意コード実行は対象外とする。

#### 分離の原則

パーティクルと同じ責務分離を採る。再利用可能な定義は素材側に置き、`Entity` 側は参照と `Entity` 固有の値だけを持つ。

- **Script Asset** は `kind: "script"`、`source.kind = "project"` の素材とし、実体はプロジェクト内の `scripts/` 配下に置く TypeScript ソースファイルとする。`AssetManifest` に保持するのは参照先・言語・契約バージョンだけであり、**コード本文と派生したプロパティスキーマはマニフェストへ保存しない**。プロパティスキーマはソースコードから導出してエディター状態（Editor State）に置く。これにより、ソースコードの編集が `AssetManifest` を変更せず、Play 中の保存でも全 `Entity` の実行環境世代が上がらない。
- **Script Component** は `scriptAssetId`、宣言済みプロパティ値、`assetReferences`、`entityReferences` を持つ。設定値は純粋な JSON かつ有限数に限定し、コード・関数・式は含めない。1 つの `Entity` に複数付与できる。

#### 実行境界

- 実行は `RuntimePlugin` の `start` / `update` / `stop` / `dispose` ライフサイクルに従い（4.6）、Play の開始・終了および `entityRevisions` による `Entity` 単位の再生成に従属する。
- 更新順序は `Entity` の階層順、続いて `Entity` 内の `Component` 並び順で一意に確定する。個別の `useFrame` を並べず、単一のスケジューラーが確定した順序で呼び出す。システムクエリや優先度指定は導入しない。
- 名前付きエクスポート `Render` の役割は宣言的な追加描画だけである。R3F の `useFrame` はコールバック例外をスクリプト単位で隔離できないため、Play と公開時の診断で拒否し、フレームごとの処理は `start().update(delta)` へ統一する。
- Stop 時は生成したモジュール、Blob URL、タイマー、リスナーを明示的に破棄する。React のアンマウントに依存しない。
- アイテムプロジェクトは重力と RigidBody を持たないため、物理演算へアクセスする API は未対応として縮退動作とし、動作しているように見せかけない。

#### 音声 / 音源の所有境界

- 音声素材はプロジェクト管理下の MP3 / WAV 原本とフォーマット・MIME・バイト長を保持し、外部の絶対パスや生バイト列を `AssetManifest` へ保存しない。編集中の `Scene View` では音源をアイコンで示すだけで元データを取得・再生せず、Play と `classic-jsx` 生成物で同じ音源実行環境を使う。
- Studio の Play が管理下の音声ファイルを読み込むネイティブ境界は、`assets/` 配下のプロジェクト相対パスだけを受け付ける。パストラバーサル、通常ファイル以外、シンボリックリンク / リパースポイント、128 MiB 超過、拡張子と MP3 / WAV シグネチャの不一致、読み込み中のファイルサイズ変化を拒否した上で、data URL を実行環境へ渡す。
- `ctx.assets.loadAudio` はスクリプト所有者（owner）が独立したプレイヤーを作成する API であり、保存済みの音源 Component 自体は操作しない。`ctx.audioSources` は付与先の `Entity` 自身が持つ音源だけを `componentId` / `audioAssetId` で選び、play / pause / stop / seek / volume / loop を所有者単位で上書きする。子 `Entity`、別 `Entity`、共有音声素材は変更しない。
- 同一 `Entity` 上の複数スクリプトは `Component` 順で音源の上書きを合成する。スクリプトの再起動、実行時エラー、Stop 時には、その所有者の再生要求と上書きを解除して音源 Component の保存値へ戻す。ブラウザ / WebView の自動再生ポリシーで拒否された場合も、`play()` は例外を外へ投げず開始件数 `0` で解決し、`list().status` を `autoplay-blocked` にする。シーン全体を止めず、ユーザー操作後の再試行を許容する。
- 音源の volume / loop / autoplay / 距離プロパティの変更は既存の実行環境へ反映し、音声素材参照、spatial、enabled、および Component の追加・削除は対象 `Entity` だけを再同期する。編集時に音声素材へ `place_asset` を実行すると参照設定済みの音源 `Entity` を作成し、既存 `Entity` には `core.audio-source` の追加・更新・削除を使う。
- `import_audio_asset` は編集モード限定とし、信頼された絶対パスをネイティブ側の通常ファイル・リンク禁止・128 MiB 上限・拡張子とシグネチャ照合・読み込み前後のサイズ検査へ通した上で、内容アドレス付きコピー、原子的コミット、履歴、自動保存を 1 件の操作として確定する。`get_audio_asset` とインポート結果は管理下の相対パスとメタデータだけを返し、外部パス、data URL、バイナリバイト列を MCP へ返さない。
- `import_model_asset` は単一ファイルの GLB / glTF / VRM / OBJ を同じネイティブファイル境界で検証し、`get_model_asset` / `update_model_asset` でインポート設定とマテリアル枠の既定値を保存する。`reimport_model_asset` は管理下の元ファイルを再解析し、3D モデル ID と参照を維持したまま派生メタデータを原子的に更新する。`import_skybox_asset` は HDR / EXR の正距円筒図法テクスチャをシーンの Skybox へ設定し、`set_project_thumbnail` は既存テクスチャから管理下サムネイルだけを更新する。
- `import_shader_asset` は UTF-8 の GLSL ソースを管理下シェーダー素材へ追加し、`get_shader_asset` / `update_shader_asset` はソース本文とハッシュを同じリビジョン・履歴・自動保存境界で扱う。任意の外部パス参照やシェル操作は実行せず、シェーダーソースは明示的な MCP 入力または管理下のローカルインポートだけを受け付ける。
- `create_prefab` は選択 `Entity` と子孫をプレハブドキュメントへ複製し、プレハブ、管理下ドキュメントパス、依存参照を一つのエディターリビジョンへ確定する。作成後はプレハブを選択状態にし、`place_asset` で再利用できる。`update_prefab_from_source` は `Inspector` の「プレハブに反映」と同じく、元 `Entity` の現在の構成をプレハブドキュメントへ一つのリビジョンで反映する。
- `ctx.audioSources` は実行時専用であり、`SceneDocument` のリビジョンを変えない。永続化する音源設定には `place_asset`、`add_component`、`update_component`、`remove_component` を使い、実行時状態を暗黙に永続化しない。

#### ライトと実行環境 event の所有境界

- Studio の Play と `classic-jsx` 生成物は同じ `XriftScriptLight` とライトブリッジを使う。無効化（disabled）されたライトもブリッジをマウントしたまま描画だけを止め、Play 中にスクリプトから一時点灯できるようにする。Directional / Spot ライトのターゲットもこの共通実行環境で構成し、エディターと公開ワールドで向きの計算を別実装にしない。
- `ctx.lights` は付与先の `Entity` 自身が持つライトだけを `componentId` / `lightType` で選び、enabled、color、intensity、Point / Spot の distance を所有者単位で上書きする。子 `Entity`、別 `Entity`、シーン環境光、共有設定を暗黙に変更しない。遅延マウントまたは置換されたライトにも同じ選択規則を適用する。
- 同一 `Entity` 上の複数スクリプトは `Component` 順でライトの上書きを合成する。同一スクリプト内ではフィールドごとの最後の変更を優先し、スクリプトの再起動、実行時エラー、Stop 時にはその所有者の上書きだけを外してライト Component の保存値へ戻す。`reset()` は呼び出したスクリプト所有者の上書きだけを解除する。
- `Inspector` や MCP による enabled、color、intensity、shadow、distance、decay、angle、penumbra、Area サイズの永続変更は既存のライト実行環境へ即時反映する。ライト種別の変更と Component の追加・削除は構造変更として対象 `Entity` だけを再同期する。`ctx.lights` は実行時専用で `SceneDocument` のリビジョンを変えず、永続化には `core.light.*` の `add_component` / `update_component` / `remove_component` を使う。
- スクリプトイベントバスは同一の `XriftScriptRoot` 内に閉じており、ペイロードを `SceneDocument` へ保存せず、`KHR_interactivity` へ暗黙に接続しない。近接判定は Script Component で明示参照した `Entity` の `getWorldPosition` を使う。実行時のプレイヤー / アバターは `ctx.find` へ公開しないため、プレイヤー近接判定を実装済みと表示しない。
- 組み込みの `proximity-event` は固定イベント名 `xrift:proximity-state` へ `channel`、領域内状態、`sourceEntityId`、`kind: enter | exit | sync` を送信する。`enter` / `exit` は境界遷移時に一度だけ送り、`sync` は実行中のチャンネル変更と後から起動した受信側の状態同期に限定する。停止・削除時は同じ送信元の `exit` を送る。`event-light` はチャンネルごとのアクティブ送信元を `Set` で追跡するため、複数センサーの一つが退出しても残りを維持する。イベント名の動的変更でリスナーが残留しないよう管理し、スクリプトの停止・再起動時に購読を確実に解除する。

#### テクスチャ / マテリアルの所有境界

- `ctx.assets.loadTexture` は Script Component の `assetReferences` に登録されたテクスチャだけを受け付ける。実行環境リゾルバーは URL だけでなく、素材 ID、`colorSpace`、画像の繰り返しと補間の wrap / mag / min フィルター、`flipY`、`generateMipmaps` を記述子として Play ホストと公開アダプターの両方へ渡す。
- スクリプトが省略した読み込みオプションはテクスチャ素材の読み込み設定を継承し、明示したフィールドだけをスクリプトインスタンスの読み込みへ優先適用する。`generateMipmaps: false` とミップマップフィルターの組み合わせは `linear` へ正規化する。Studio の Play と生成物で異なる暗黙の既定値を持たない。
- `ctx.materials` は付与先の `Entity` 自身が所有するメッシュだけに実行時上書きを適用する。`setTextureTransform` はマテリアルスロットごとのテクスチャ複製に `offset`、`repeat`、`center`、`rotation` を適用し、読み込んだ元のテクスチャ、共有テクスチャ、別スロット、子 `Entity`、別 `Entity` を変更しない。
- `ctx.materials.setUniform` はカスタムシェーダー（Three.js の `ShaderMaterial` / `RawShaderMaterial` 本体）の uniform を名前で上書きする。値はスクリプト所有の複製側 uniform 表に置き、共有マテリアルと共有マテリアルが持つ値オブジェクトを変更しない。上書きしていない uniform は共有マテリアルの項目を参照するため、時刻や風など描画側がマテリアルへ書き込む値も複製へ届く。Three.js は初回描画時の uniform 表を参照し続けるため、複製側の uniform 表自体は作り直さず項目だけを差し替える。値の変更でシェーダープログラムを再生成しない。
- スクリプトの再起動、実行時エラー、Stop 時には、そのスクリプト所有者のマテリアル複製、テクスチャ複製、上書き設定、読み込みキャッシュを破棄する。`resetTextureTransform(slot)` は実行中に指定スロットの Transform だけを戻し、他スクリプト所有者の上書きは外さない。`resetUniform(name)` も同様に、指定した uniform だけを元に戻す。
- `ctx.assets` / `ctx.materials` は実行時専用であり、`AssetManifest` のリビジョンを変更しない。永続化する設定には、テクスチャの読み込み・繰り返し・補間設定に `get_texture_asset` / `update_texture_asset`、マテリアルの PBR / テクスチャ割り当てに `get_material_asset` / `update_material_asset` / `set_material_texture_transform`、カスタムシェーダーの uniform 値に `get_custom_shader` / `update_custom_shader`、メッシュの割り当て枠への設定に `set_material` を使う。新規ローカルテクスチャの取り込みは編集モードの `import_texture_asset` に限定する。
- `get_scripting_capabilities` は上記の素材既定値、明示オプションの優先順位、フィルター / ミップマップ規則、複製隔離、および実行時の一時操作と MCP 永続操作のツール対応を機械可読な形式で返す。MCP クライアントがスクリプト API から永続化の挙動を推測しないようにする。

#### 動的評価の限定

- エディターの Play では、ソースコードを Monaco と同梱した TypeScript サービスの `transpileModule` で変換し、生成したモジュールを評価する。言語サービス Worker はエディター補完と診断に限定し、Play 開始時のモデル同期を挟まない。これが本節で認める唯一の動的評価であり、対象はプロジェクト内のスクリプトソースファイルに限る。ビジュアルドキュメント内の文字列は評価しない。
- 許可した bare specifier は Studio がすでに読み込んでいる同一モジュールインスタンスへ解決し、`three` を二重ロードしない。
- リモートモジュールのインポートは Play・公開ともに拒否する。対応する specifier は `SCRIPTING.md` と実装の許可リストを参照する。
- 生成コードは静的インポートだけを出力する。`eval`、`Function`、動的インポートは生成物へ出力しない（9.4）。

#### 権限と残存リスク

Play は iframe や Worker を挟まずアプリ本体と同一レルムで動作し、`withGlobalTauri` により IPC ブリッジが `window` に露出している。したがって、スクリプトは原理的にアプリ本体と同じ権限を持つ。

- モジュールスコープで `window`、`globalThis`、`__TAURI__`、`fetch`、`document`、`Function` などを遮蔽する。ES モジュールは常に strict mode であり、`eval` をレキシカル束縛として宣言すると構文エラーになるため、`eval` は遮蔽一覧に含めない。同一レルムである以上これは完全なサンドボックスではなく、事故と単純な悪用を防ぐ緩和策である。この限界は [スクリプト契約](./SCRIPTING.md) に明記し、隔離済みとは表示しない。
- スクリプトのフィンガープリントは実行版の診断とホットリロードに使い、承認情報として保存・照会しない。
- UI と MCP は保存済みスクリプトを追加承認なしで変換・実行する。`unapprovedPolicy` は旧クライアントとの互換引数であり、実行可否には影響しない。変換失敗時は編集モードを維持し、ホットリロード失敗時は直前の正常なモジュールを維持する。現行の契約は [SCRIPTING.md](./SCRIPTING.md) を参照する。
- デバッグビルドだけに登録する特権 Tauri MCP ブリッジは、WebView 上の JavaScript 実行と Tauri コマンドの `invoke` を許可する開発者向け自動化機構であり、stdio MCP エディターツール / サーバーの信頼境界には含めない。リリースビルドには同ブリッジを登録・搭載せず、スクリプト承認の公開 API としても扱わない。
- 完全な隔離と、10 章が求める CSP の適用は未達である。Monaco はローカル同梱済みだが、Play の Blob モジュールと共有モジュールブリッジを許可しつつ権限を絞る CSP 設計が別途必要となる。

#### 公開

- スクリプトのソースファイルとホスト側アダプターはステージングのオーバーレイファイルとして出力し、生成した `src/World.tsx` から静的インポートで参照する。`.ts` / `.js` は静的アセットとして許可しないため、必ずオーバーレイファイルとして出力する。
- ステージングへインストールできる npm パッケージは既存の許可リストに限定する。スクリプトが任意のパッケージを要求する形は採らない。
- ランタイム JSON 出力はスクリプトを表現できないため、選択された場合は公開を止めるブロッキング診断とする。未処理のままマニフェストへ素通ししない。
- 同じ入力から同じ出力を得る決定性を維持する。生成する識別子はハッシュ由来とし、挿入順や時刻に依存させない。

### 4.9 Interactivity (KHR_interactivity)

コードを書かずに時間とイベントで動く振る舞いを組むための仕組みである。スクリプトとは別の手段として並立させ、どちらか一方へ無理に統合しない。

- 保存形式は独自グラフではなく、glTF の `KHR_interactivity` 拡張オブジェクトそのものとする。ノードグラフ素材は `extensionName`、`specStatus`、`extension.graphs` を持ち、ノードごとの表示位置だけを `extras.xriftStudio.position` に置く。React Flow の状態を可搬な元データにはしない。
- ノードエディターはビジュアルエディターの中央から右へドッキングモーダルとして開き、`Scene View` の左側を見える状態に残す。振る舞いを組みながらシーンの状態を確認できる。
- UI からの書き込みも MCP からの書き込みも、同じバリデーターを通してから確定する。検証対象は次の通りである。
  - declaration / ノード / flow / value-source / type の各インデックス
  - RC の型シグネチャ
  - inline・type-default・connected の各 value ソース
  - value 接続が先行ノードを指すこと、flow 接続が後続ノードを指すこと
  - ノードの declaration 有無
  - エディター安全性のためのグラフ数 / ノード数上限
- 構造エラーは書き込みを原子的に拒否し、未知の拡張オペレーションは警告にとどめて破壊しない。
- 未知の拡張定義オペレーションは保存したまま保持する。理解できるオペレーションにだけ専用の接続口テンプレートを与え、独自イベント名や JavaScript へ置き換えない。
- MCP からは `list_interactivity_operations`、`get_interactivity_asset`、`create_interactivity_asset`、`add_interactivity_node`、`connect_interactivity_nodes`、`set_interactivity_value`、`set_interactivity_configuration`、`disconnect_interactivity_socket`、`delete_interactivity_node`、`validate_interactivity_asset` を提供する。書き込みツールは他の編集ツールと同じく `projectId`、`sceneId`、`expectedRevision` を要求し、古いスナップショットへの適用を防ぐ。
- 実行環境アダプターはオペレーション単位で実装する。未対応オペレーションは正規 JSON に保持したまま no-op とし、任意の JavaScript へ翻訳しない。WebXR のコントローラー / 入力取得はアプリ側の責務とし、グラフイベントへは実行環境アダプターの境界で接続する。

詳細は [KHR_interactivity Editor / MCP design](./KHR_INTERACTIVITY_EDITOR.md) に記す。

### 4.10 schemaVersion と migration

ドキュメントをまたいだ互換規則を 1 か所に集約し、個別セクションへ互換の例外を散らさない。

- `VisualProjectDocument`、`SceneDocument`、`AssetManifest`、プレハブドキュメント、フォルダー定義ドキュメントはそれぞれ `schemaVersion` を必須とし、依存順に段階的なマイグレーションを通す。
- マイグレーションは元データを直接書き換えず、移行後のコピーを検証してから保存する。検証を通らない場合はコードプロジェクトと推測して開かず、問題のあるフィールドと修復手段を示す。
- 読み込み時にだけ受け付ける旧表現は、次の対応表に従って現行スキーマへ移行する。編集や再保存の出力には旧表現を使わない。

| 旧表現 | 現行スキーマ | 移行規則 |
| --- | --- | --- |
| 素材種別 `template` | 素材種別 `prefab` | ユーザー向け名称と一致させる。旧 `templatePath` は `prefabDocumentPath` として検証する |
| 素材種別 `primitive` の内部レコード | 追加 Registry の組み込みジオメトリ参照 | Mesh Component の `geometry: { kind: "builtin", primitive }` へ移す。ユーザー素材として一覧に出さない |
| Mesh Component の `geometryAssetId` | `geometry` または `modelAssetId` | 参照先が組み込み形状なら `geometry`、3D モデル素材なら `modelAssetId` へ振り分ける |
| マテリアルの `color` / `metalness` / `roughness` / `*TextureId` | glTF コア Metallic-Roughness | `baseColorFactor`、metallic / roughness factor、型付き `TextureInfo` へ移す |

マテリアルの移行では、旧表現になかった alpha、emissive、normal、occlusion、sampler、texture transform、各種拡張を glTF 既定値または未設定として明示し、推測した画像やモードを追加しない。移行結果は `UpdateAssetCommand` として `AssetManifest` にだけ保存し、Play 中は読み取り専用とする。

未知の素材種別や未知の `Component` 種別へ推測変換しない。新しい種別の追加は、閉じた検証集合・`Inspector`・コンパイラーアダプターを同一の変更で揃え、既存プロジェクトを読めなくするスキーマバージョンの引き上げを伴わない。

## 5. XRift Studio のコード境界

### 5.1 責務分離の方針

ビジュアルエディターでは、次の責務を明確な境界で分離する。

- 編集ドキュメントとスキーマ: シーン、素材、マテリアル、プレハブの永続データとマイグレーション
- エディターセッション: クエリ、選択状態、コマンド、履歴、参照解決
- React UI: `Hierarchy`、`Scene View`、`Inspector`、`Assets` と操作状態
- プレビュー / Play 実行環境: Three.js による編集表示と成果物種別ごとの実行環境
- ネイティブ処理: Tauri によるファイル操作、CLI 実行、変換、検証、アップロード
- 生成出力: サムネイル、テクスチャ変換結果、ステージング成果物などの再生成可能な出力

パッケージ分割そのものを目的にせず、シーンデータ、エディター API、UI、実行環境、ネイティブ処理の依存方向と実行境界を固定する。

### 5.2 単一 package と module 境界

XRift Studio は単一パッケージ構成を維持し、その中でドキュメント・コマンド・素材処理・UI のモジュール境界を固定する。ビルド、型解決、Tauri のパス、プレビュー配布設定を同時に動かすモノレポ化は、独立した実行環境や複数の利用者が実際に生じるまで行わない（5.3）。

後から抽出できるよう、依存方向は最初から固定する。

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

依存方向は `components/visual-editor -> EditorSession façade -> documents / commands / asset API / play session` の一方向に固定する。`lib/visual-editor` は React、Three.js、Tauri、DOM に依存させない。UI はドキュメントの更新関数を直接インポートせず、型付きの選択状態、クエリ、Command / Intent だけを `EditorSession` へ渡す。これにより、`Hierarchy`、`Scene View`、`Inspector`、`Assets` が独自の履歴や参照解決を持つことを防ぐ。

`Entity`、素材、選択状態、履歴、スキーマを画面実装から分離するため、次の要素を一つの `EditorSession` 境界として扱う。

- 独立した型付きの `SceneSelection` と `AssetSelection`、および両方を束ねる `SelectionSnapshot`
- `CommandDispatcher` と `CommandHistory`
- 素材クエリ / インポート / 参照 API
- `Component` / 素材スキーマと参照 API
- `DropIntent = PlaceAssetIntent | ImportFilesIntent`
- `PlaySession = WorldPlaySession | ItemPreviewSession`

描画層はスナップショットを読み取り、変更はコマンドとして発行する。ネイティブのファイル操作と CLI 実行は、`src/lib/tauri.ts` と `src/lib/xrift-cli.ts` の境界を越えて呼び出す。

この境界に属するエクスポートだけを公開し、UI から内部オブジェクトを直接書き換えない。機能を移動する際も、一時的な再エクスポート（re-export）によって既存のインポート互換を維持する。

### 5.3 package を分ける条件

次のいずれかが実行環境・利用者・リリースの独立性を明確に示す形で発生した時点、または複数の弱い兆候が継続した時点で pnpm workspace への移行を判断する。「二つ以上該当すること」を機械的な必須条件にはしない。

1. デスクトップアプリと Web エディターが、それぞれ独立した配布周期を持つ。
2. コンパイラーを CLI や CI から UI なしで利用する二つ目の実利用者が生じる。または、コンパイラー自体が独立した実行環境として配布・バージョン管理を必要とする。
3. 素材プロセッサーを Worker、Node.js、WASM などの別実行環境で動かす必要が出る。
4. `VisualProjectDocument` / `SceneDocument` / `AssetManifest` または Registry を公開 API として SemVer 管理する必要が出る。
5. アプリ全体を起動しないとコアロジックのテストができず、開発フィードバックが継続的に遅くなる。
6. Tauri 専用依存と Web 専用依存の分離が、条件分岐やバンドルサイズの問題を実際に引き起こす。

ファイル数や見た目上の整理だけを移行理由にしない。逆に、上記の条件を満たした後も単一パッケージにとどめると実行環境境界とリリース境界が曖昧になるため、その段階では分割を選択する。

### 5.4 分割の順序

分割する場合も一度に全面移行せず、利用者が確定したパッケージから段階的に抽出する。

1. 単一パッケージ内で `lib/visual-editor` を純粋ロジック、`components/visual-editor` を UI として分離する。
2. フォーマットのエディター / コンパイラー利用者が独立リリースまたは独立実行環境を必要とした時点で `packages/visual-project-format` と `packages/compiler` を抽出し、既存のインポート経路は再エクスポートで維持する。
3. Web エディターの独立配布が始まった時点で `apps/desktop` と `apps/web-editor` を作成し、共有 UI が実際に存在する範囲だけを `packages/editor-ui` へ移す。
4. 素材プロセッサーが別実行環境になった時点で `packages/asset-contracts` を共有し、実装は `workers/asset-processor` または専用アプリへ置く。
5. 各段階で型チェックと開発サーバーの動作を先に確認し、Tauri、プレビュー、生成先のパスを一段階ずつ移行する。

到達形の候補は次の通りである。実体のない空パッケージを先行して作らない。

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

分割後もビジュアルプロジェクトのフォーマットとスキーマを依存グラフの最下層に置き、UI、コンパイラー、XRift アダプターが相互参照しない構成を維持する。パッケージ数を増やすこと自体を設計の完成とはせず、独立した利用者・実行環境・リリースの有無を基準に境界を決める。

## 6. 素材のライフサイクル

素材は `SceneDocument` から分離し、`AssetManifest` の安定した `assetId` で参照する。外部ファイルの取り込みでは、ファイル操作とドキュメント更新を未検証の一括処理として扱わない。Box、Sphere、Plane などは追加 Registry の組み込みプリミティブであり、ユーザー管理の `Assets` グリッドやインポート・サムネイル管理の対象にはしない。

### 6.1 Import transaction

1. `ImportFilesIntent` を取り込みキューへ登録する。この時点では編集ドキュメントを変更しない。
2. ネイティブ境界または隔離 Worker で、拡張子、MIME、マジックバイト、サイズ、ファイル名、展開後 / デコード後サイズを検証する。
3. `.gltf` の場合は JSON と外部 URI 一覧だけを上限内で解析し、[6.7](#67-gltf-external-uri-policy) の URI ポリシーに従って依存ファイル一式を確定する。ネットワーク取得は行わない。
4. 素材 ID を払い出し、プロジェクトルート内の一時領域へ元ファイルと許可済み依存ファイルをバイト列を変えずにコピーして SHA-256 を計算する。
5. インポーターがマテリアル、テクスチャ、3D モデルのスロットメタデータを正規化し、`.cache/assets/<asset-id>/` に派生ファイル、サムネイル、診断情報を生成する。
6. 元ファイル、依存ファイル、マテリアル枠、`TextureInfo`、派生ハッシュの参照整合性を検証する。
7. 元ファイルを `assets/source/<asset-id>/` へ移し、`AssetManifest` への追加を原子的に確定する。
8. `assetSelection` を新しい素材へ移し、`Inspector` で元データ、変換レシピ、派生データ、診断情報を表示する。`sceneSelection` と `SceneDocument` は変更しない。
9. 3D モデルまたはプレハブをシーンへ配置した時だけ、`PlaceAssetCommand` が素材 ID を参照する `Entity` を作成する。

失敗時は一時領域を片付け、`SceneDocument`、`AssetManifest`、両選択状態、履歴を開始前の状態で維持する。再インポートでは同じ素材 ID の元データハッシュとプロセッサーバージョンを更新し、参照中の `Entity` の ID は変えない。マテリアル枠を再照合できない場合は、バインディングを推測で変更せず診断として報告する。

### 6.2 元ファイルと derived の非破壊境界

- `assets/source/` には、ユーザーが選んだ元ファイルと許可済み依存ファイルの原本をバイト列そのままに保持する。リサイズ、ミップマップ生成、色空間変換、WebP / KTX2 圧縮、サムネイル生成によって上書きしない。
- `.cache/assets/` 配下の派生データは、元ファイル、依存ハッシュ、変換レシピ、プロセッサーバージョン、ターゲットプロファイルから再生成できるキャッシュとする。欠落しても元ファイルから復元できる。
- 元ファイルと派生ファイルのパスはプロジェクトルート相対の `/` 区切りに統一する。OS の絶対パス、元のユーザーディレクトリ、Blob URL、署名付き URL、トークンをドキュメントや診断情報に保存しない。
- 表示名を変えても素材 ID、元データハッシュ、参照は変えない。元ファイルを差し替える再インポートでも素材 ID は維持する。
- 3D モデル内蔵のマテリアルはコア / 型付き拡張スキーマに正規化したマテリアル素材として、画像・テクスチャ・サンプラーはテクスチャ素材として生成し、Mesh Component へマテリアル値をインライン展開しない。
- 直前に成功した派生データは再生成中もプレビュー表示に利用できるが、ハッシュが一致しない場合は「古いプレビュー」と明示し、コンパイルやアップロードの入力には使わない。

派生メタデータは少なくとも次の項目を持つ。

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

`sourceHash`、すべての `dependencyHashes`、`recipeHash`、`processorVersion`、`targetProfile` のいずれかが現在値と一致しなければ `stale` と判定する。単なる更新日時だけで `ready` を判断しない。

### 6.3 Texture processing recipe

テクスチャのインポート設定を一つの「最適化」チェックボックスにまとめず、`Inspector` で次の項目を独立して確認・設定できる変換レシピとする。

| セクション | 設定 | 方針 |
| --- | --- | --- |
| 用途と色空間 | `auto / sRGB / linear` と参照スロット | `auto` はマテリアル枠の用途から決定する。`Base Color` / `Emissive` の RGB は sRGB、Metallic-Roughness / Normal / Occlusion / Alpha は Linear |
| リサイズ | `maxDimension` と縦横比維持 | 候補は 1024 / 2048 / 4096 / 元データ。元データはターゲット上限内の時だけ選択可能。縦横比を変えず、元画像はそのまま保持 |
| 品質 | `fast / balanced / high` | エンコーダーごとに意味が異なるため、偽の共通 `0..100` 値にしない。非可逆形式ではプリセットの実際のエンコーダー引数と推定容量を詳細表示 |
| ミップマップ | `preserve / generate / none` | glTF サンプラーの縮小フィルターがミップマップを使う場合、完全なミップチェーンがない `none` は警告またはコンパイルブロッカーとする |
| 画像の繰り返しと補間 | mag / min フィルター、wrap S / T | glTF コアのサンプラーとして扱う。mag は `NEAREST` / `LINEAR`、min はミップマップを含む 6 種、wrap は `CLAMP` / `MIRRORED_REPEAT` / `REPEAT` |
| 圧縮 | 元データ / WebP / KTX2 ETC1S / KTX2 UASTC | PNG / JPEG はコア。WebP は `EXT_texture_webp`、KTX2 は `KHR_texture_basisu` を出力し、フォールバックと `extensionsUsed` / `extensionsRequired` を明示 |

KTX2 では、カラーデータの容量優先に ETC1S、法線マップや Metallic-Roughness などの非カラーデータの品質優先に UASTC を提案できるが、自動選択の結果を隠さず変換レシピに明記する。KTX2 にはミップレベルを格納できる。WebP / KTX2 はコア画像 MIME の追加として扱わず、それぞれの glTF 拡張アダプターを通す。未対応ターゲット向けには PNG / JPEG フォールバックを生成するか、コンパイルを止めて必要な拡張を示す。

1 枚の元画像を sRGB と Linear の両用途で使う場合も、元ファイルの素材は複製せず用途別の派生データを作成する。法線マップを sRGB として圧縮する、`Base Color` を Linear としてプレビューする、アルファを premultiply するなど、スロットの意味と矛盾するレシピは確定しない。

### 6.4 Thumbnail lifecycle

3D モデル、テクスチャ、マテリアル、プレハブ、パーティクルのサムネイルは、編集対象の素材とは別の派生ファイルとして管理する。

```text
pending -> generating -> ready
                      -> failed
ready -- source/recipe/generator changed --> stale -> generating
```

- `ready` は元データハッシュ、サムネイルレシピハッシュ、ジェネレーターバージョンがすべて一致した場合にのみ付与する。
- `failed` や `stale` の状態でも、素材カード、表示名、診断情報、再生成操作を残す。プレースホルダーだけを表示して素材が消えたように見せない。
- 3D モデル / プレハブの画角調整、マテリアルの基準球、パーティクルの代表時刻は決定的なレシピとする。シーンのライトや現在のカメラ位置に依存させない。
- テクスチャのサムネイルはマテリアル枠の色空間に応じたプレビューを用意し、Linear データを `Base Color` のようにガンマ補正して表示した結果を正しい見た目として扱わない。
- 生成中は同一素材の重複生成を防ぎ、キャンセル時は直前の正常なサムネイルを維持する。

### 6.5 Stale status と diagnostic

診断情報（diagnostic）は `code`、`severity`、`stage`、`assetId`、任意の `sourceUri`、`materialSlot`、`fieldPath`、短いメッセージ、復旧アクションを持つ。元のユーザーディレクトリの絶対パスや生のデコーダーエラー文字列をそのまま表示・保存しない。

- `stale-source`: 元ファイルまたは依存ファイルのハッシュが派生データと一致しない。
- `stale-recipe`: リサイズ、品質、ミップマップ、サンプラー、圧縮設定が直前の正常な派生データと一致しない。
- `unsupported-required-extension`: `extensionsRequired` に未対応の拡張が含まれる。
- `unsupported-optional-extension`: コアフォールバックで表示できるが、見た目が異なる可能性がある。
- `missing-external-resource` / `blocked-external-uri`: 外部 URI が欠落しているか、ポリシー違反により拒否された。
- `decode-budget-exceeded`: デコード前の見積もりがメモリ上限を超える。
- `stale-material-binding`: 3D モデルの再インポート後にマテリアル枠を安全に照合できない。
- `color-space-conflict` / `mipmap-sampler-conflict`: テクスチャの変換レシピと参照先の用途が矛盾している。

素材カードには最高深刻度（severity）と件数だけを示し、`Inspector` の「診断」セクションから対象フィールドおよび「再生成」「参照を置換」「設定を開く」「元データを再選択」のうち適切な操作へ移動できるようにする。警告がある素材を無視して `ready` と同じ表示にしない。

### 6.6 Browser Worker と memory budget

Web / WebView のインポーターは、UI スレッドで glTF JSON の解析、画像デコード、圧縮を行わない。専用 Worker に転送可能なバッファを渡し、処理完了・キャンセル・プロジェクト切り替えの時点でバッファ、デコーダー、Object URL、Worker を解放する。同じ `ArrayBuffer` の不要な複製を避け、テクスチャは 1 枚ずつデコード・エンコード・解放する。

セキュリティ上のメモリ上限は、公開 API ではなく調整可能なプロファイルとして次の値を基準にする。

| 上限項目 | 値 | 超過時の挙動 |
| --- | --- | --- |
| glTF JSON | 16 MiB | 解析前に拒否し、デスクトップ側プロセッサーまたは元データの整理を案内 |
| 単一外部リソース | 128 MiB | リソース名と上限を診断として表示 |
| 元ファイルと依存ファイルの合計 | 256 MiB | インポートを確定しない |
| 外部リソース数 | 256 | URI 一覧だけを示して確定しない |
| 単一デコード後画像 | 128 MiB 見積もり | デコード前に `maxDimension` の引き下げを案内 |
| Worker のデコード作業メモリ合計 | 256 MiB | 並列数を下げ、それでも超える場合は中止 |
| テクスチャ派生 `maxDimension` | 既定 4096、絶対上限 8192 | 元データは保持できてもプレビュー / 派生データを `ready` にしない |
| プロセッサー並列数 | 最大 2、端末状況に応じて 1 へ低下 | キューと進捗を表示 |

画像ヘッダー、accessor / bufferView の範囲、KTX2 のレベルインデックスなどから、可能な限りメモリ確保前にサイズを見積もる。`navigator.deviceMemory` の有無だけで安全性を判定せず、絶対上限、実測の作業メモリ量、`AbortSignal` を併用する。Worker のクラッシュやメモリ不足が発生しても、最後に保存したドキュメントと直前の正常な派生データを維持し、同じ設定での自動再試行ループは行わない。

### 6.7 GLTF external URI policy

glTF 2.0 コアは buffer / image に data URI と相対パスを許可しており、クライアントが追加スキームへ任意対応できる。XRift Studio のインポーターはこれより厳しい許可リストを採る。

- 受け入れるのは、GLB 内部の bufferView、許可 MIME の data URI、ドロップされた `.gltf` と同じインポートルート内に実在する相対 URI だけとする。
- `http:`、`https:`、`file:`、その他スキーム、authority、ドライブ文字、UNC、ルート絶対パス、クエリ、フラグメントは取得しない。読み込み時に暗黙のネットワークアクセスを行わない。
- パーセントデコードと Unicode 正規化を一度だけ行い、`..`、エンコード済みトラバーサル、NUL、バックスラッシュ混在、シンボリックリンク / ジャンクション越しのプロジェクトルート脱出を正規化パス検査で拒否する。
- data URI はデコード前に MIME 許可リスト、エンコード後サイズ、デコード後サイズを検査する。Base64 の膨張分も作業メモリ量に含めて計算する。
- JSON に宣言された `byteLength`、`bufferView`、`accessor`、画像の MIME とマジックバイトを照合し、範囲外参照や種別不一致をデコーダーへ渡さない。
- 相対パスで参照される依存ファイルはインポートトランザクション内の元データディレクトリへコピーし、実行時に元のディレクトリやリモートホストへ再取得しに行かない。
- 未対応の `extensionsRequired` はプレビューやコンパイルを停止する。オプション拡張はコアフォールバックの可否と見た目の差異を診断する。

外部モデルの描画は、[10 章](#10-セキュリティと認証境界) の CSP、パス検証、コンテンツ検証、リソース上限のゲートを満たしてから有効にする。

取り込みキューは元ファイルのコピー、派生データ / サムネイルの生成、`AssetManifest` への確定までを実際の処理として追跡する。各段階が成功していない素材を `ready`、保存済み、配置可能として表示しない。

### 6.8 外部リソースカタログ

手元のファイル以外から素材を取得する経路も、通常のインポートトランザクションの上に載せる。ブラウザで探して保存し直す手間をユーザーに求めない。

- `Assets` の「アセットストア」からカタログを開く。CC0 プロバイダーとして Poly Haven（HDRI / マテリアル / 3D モデル）と ambientCG（HDRI / マテリアル、3D モデルは検索のみ）、XRift 公式カタログとして Open Brush のマテリアル、Skybox シェーダー、水面シェーダー、地形プリセット、発光オブジェクト、公式 Component を扱う。
- ダウンロード時には解像度と形式を選択させ、確定前に容量の目安を示す。取得したファイル実体は 6.1 のインポートトランザクションへ通し、検証、元ファイルのコピー、派生データ生成、マニフェスト確定まで同じ経路で完了させる。カタログ専用の抜け道は作らない。
- カタログカードは静止画サムネイルではなく、実際の GLSL や高さフィールドを WebGL で描画する。カードで見えている見た目と、追加後にシーンへ入る見た目を一致させる。
- 追加した素材は作者、ライセンス、配布ページ URL を `attribution` として保持し、公開したワールドの生成物へも同じ情報を出力する。CC0 と MIT を同じ表示にまとめず、詳細パネルから配布ページとライセンス原文へ移動できるようにする。
- HDRI は環境テクスチャとして保存し、「追加後に空の背景へ設定」を選んだ場合だけシーン設定の Skybox を同じトランザクションで更新する。Skybox シェーダーと水面シェーダーはマテリアル素材、地形プリセットは地形 `Entity` 1 件として追加し、追加後は通常の素材 / `Entity` と同様に編集できる。
- 一時的な I/O 失敗は限定回数の再試行で吸収し、それでも失敗する場合はプロバイダー名、対象ファイル、再試行手段を示してドキュメントを変更しない。

## 7. Command と元に戻す / やり直す

`SceneDocument` または `AssetManifest` を変更する操作は、`EditorSession` の `CommandDispatcher` を通してコマンドトランザクションとしてまとめる。

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

- ギズモのポインター押下時に変更前のスナップショットを保持し、移動中は `Scene View` と `Inspector` に一時値を反映する。離上時に 1 件の Transform コマンドとして確定し、Escape キーが押された場合は確定前の値へ戻す。
- 「元に戻す」は `beforePatch`、「やり直す」は `afterPatch` を対象ドキュメントのリビジョン検査後に適用する。
- Transform 変更、親子付け替え、複製、削除、`Component` 追加は `SceneDocument` のコマンドとする。
- マテリアル変更、名称変更、テクスチャスロット変更は `AssetManifest` のコマンドとする。
- 通常の選択、ホバー、カメラ操作は履歴の項目にしない。ただし、ドキュメント変更と選択変更が一体の操作では、実行前後の選択状態をトランザクションに含める。
- `PlaceAssetCommand` は `Entity` の追加と新規 `Entity` の選択を 1 件のコマンドにまとめる。元に戻すと対象 `Entity` を取り除き、配置前の `sceneSelection` / `assetSelection` を復元する。やり直すと同一 ID の `Entity` を戻して再選択する。
- コピー操作はドキュメントを変更せず、選択サブツリー、`Component`、サブツリー内の `Entity` 参照、必要な素材 ID をバージョン付きコピーバッファへ直列化する Intent とし、編集の元に戻す履歴には積まない。
- 貼り付け操作は貼り付け先を検証し、新しい `Entity` ID を払い出してサブツリー内参照だけを付け替える `PasteEntitiesCommand` とする。プロジェクト外からのコピーバッファやスキーマバージョン不一致のデータは、マイグレーションと検証を通過するまで貼り付けない。
- 複製はコピーバッファを経由して結果が揺れない `DuplicateEntitiesCommand` とし、同じ親の直後へ複製する。元の `Entity` と複製 `Entity` の ID 対応をコマンド内に保持し、元に戻す時は元の `sceneSelection` と `assetSelection`、やり直す時は同一の複製 ID と両選択状態を復元する。外部の素材 ID は共有参照のままとし、マテリアルやテクスチャを暗黙に複製しない。
- `Hierarchy` から `Assets` またはフォルダーへのドロップは `CreatePrefabFromEntitiesCommand` とする。プレハブドキュメント、`AssetManifest` の項目、フォルダー所属、元サブツリーのプレハブインスタンスメタデータを一つのドキュメント横断トランザクションで確定し、失敗時は 1 件も変更しない。元に戻す・やり直す時は生成 ID、元サブツリー、`sceneSelection`、`assetSelection` を完全に復元する。
- 非同期の取り込み処理は、一時領域でのファイル操作と `AssetManifest` の更新がすべて成功した場合にだけ履歴へ確定する。失敗時はドキュメント、リビジョン、選択状態、履歴を変更しない。
- リビジョンが競合したコマンドは暗黙に上書きせず、再読み込みまたは再適用を選べる診断として扱う。

コマンド履歴はプロジェクトセッション中の確定トランザクションを保持し、元に戻す / やり直すボタンとショートカットは同じ履歴へ接続する。履歴が空、リビジョン競合中、または Play 中の時は理由を示した上で無効にする。

### 7.1 Shortcut Registry

キーボード操作は各コンポーネントの `keydown` ハンドラーに散在させず、Command / Intent と同じ ID を使う中央の Shortcut Registry で解決する。

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

コンテキストの優先順位は `modal > text-input / composition > quick-asset-editor > hierarchy / assets > viewport > editor-global` とする。同じキー組み合わせがアクティブなコンテキスト内で複数のコマンドに一致した場合はどちらも実行せず、競合としてショートカット設定画面を開く。ユーザーによる割り当て変更はプロジェクトドキュメントではなく端末のエディター設定（Editor Preferences）に保存し、`commandId` とプラットフォームごとの割り当てを保持する。予約済み OS ショートカット、重複、空の割り当ては保存前に検証し、「既定へ戻す」をコマンド単位と全体の両方で用意する。

| Command ID | アクティブコンテキスト | Windows / Linux | macOS | 備考 |
| --- | --- | --- | --- | --- |
| `edit.copy` | `Hierarchy` / `Assets` | `Ctrl+C` | `Cmd+C` | 現在の選択対象をコピーバッファへ保存 |
| `edit.paste` | `Hierarchy` / `Assets` / `Scene View` | `Ctrl+V` | `Cmd+V` | 貼り付け可能なバッファがある時だけ有効 |
| `edit.duplicate` | `Hierarchy` / `Scene View` | `Ctrl+D` | `Cmd+D` | `Entity` サブツリーを複製 |
| `edit.delete` | `Hierarchy` / `Assets` / `Scene View` | `Delete` | `Delete` | 素材削除時は参照確認を通す |
| `viewport.focus-selection` | `Scene View` | `F` | `F` | `sceneSelection` へカメラをフォーカス |
| `tool.move` | `Scene View` | `W` | `W` | 編集モードのみ |
| `tool.rotate` | `Scene View` | `E` | `E` | 編集モードのみ |
| `tool.scale` | `Scene View` | `R` | `R` | 編集モードのみ |
| `history.undo` | エディター全体 | `Ctrl+Z` | `Cmd+Z` | 確定済みトランザクションがある時だけ有効 |
| `history.redo` | エディター全体 | `Ctrl+Shift+Z`、代替 `Ctrl+Y` | `Cmd+Shift+Z` | 同じやり直しコマンドへ解決 |
| `project.save` | エディター全体 | `Ctrl+S` | `Cmd+S` | Play 中は保存可能な編集スナップショットがある時だけ有効 |
| `preview.toggle-play` | エディター全体 | `Ctrl+Enter` | `Cmd+Enter` | 編集中は Play、Play 中は Stop |

`input`、`textarea`、`select`、`contenteditable`、数値入力欄の編集中、および IME 変換中は `allowInTextInput = false` のショートカットを実行しない。したがって、`W` / `E` / `R` / `F` / `Delete` / `C` / `V` / `D` が文字入力や値削除を奪うことはない。Escape による入力キャンセルや Enter による確定など、入力欄固有のキーは Shortcut Registry より先に処理する。Play 中は編集系ショートカットの `canExecute` を `false` とし、Stop とカメラ / 実行環境向け入力だけを有効にする。

ツールバー、コンテキストメニュー、コマンドパレット、ツールチップ、ショートカット設定、ユーザー向けショートカット一覧表は、同じ Registry からラベル・割り当て・無効理由を生成する。ドキュメント内の既定ショートカット表も Registry スナップショットから検証可能とし、UI と文書の乖離を CI で検出する。

## 8. Prefabs

プレハブ（Prefab）は、ユーザーが用意したテクスチャ、パーティクル、モデル、設定済み `Component` 群を `Entity` のサブツリーとして再利用するための単位である。UI、スキーマ、フォルダー名では `Prefab` に統一する。

- `Hierarchy` の 1 つ以上のルート `Entity` を `Assets` またはフォルダーへドラッグするか、コンテキストメニューの「選択からプレハブを作成」で作成を開始する。ドラッグ中は作成先フォルダーと依存件数を表示し、`Scene View` での親子付け替えと混同させない。
- プレハブは `AssetManifest` に安定した `prefabAssetId` と `prefabDocumentPath` を持ち、`scenes/prefabs/<prefab-id>.scene.json` のバージョン付きドキュメントを参照する。
- プレハブの原点は、元のルート `Entity` 自身の原点とする。作成時にルート位置を原点へ移し、回転と大きさはそのまま残す。元のルート位置はその 1 か所固有の配置座標であり、残したままにすると全インスタンスが配置位置から同じ距離だけずれるためである。「プレハブに反映」ではルート位置を既存プレハブドキュメントの値のまま維持し、それ以外の構成を元 `Entity` から取り直す。原点移動の仕様導入前に保存されたプレハブについては、既存インスタンスの描画位置が変わらないよう従来のオフセットを維持する。
- 依存関係（dependency closure）には、選択ルート配下の `Entity`、`Component`、サブツリー内参照、および参照先の 3D モデル・テクスチャ・マテリアル・パーティクル・入れ子プレハブ ID を含める。素材のバイナリファイルは複製せず安定した素材 ID で共有し、外部参照の欠落や入れ子の循環参照を検証する。持ち運び可能なパッケージ化は別の明示操作とし、プレハブ作成時に元ファイルを隠れてコピーしない。
- 作成に成功すると、選択していたサブツリーを同じ見た目のプレハブインスタンスへ変換し、`prefabAssetId`、`prefabRevision`、プレハブ内ローカル `Entity` ID とシーン `Entity` ID の対応を保持する。`Assets` グリッドでは新規プレハブを選択し、`sceneSelection` は元のルートに対応するインスタンスルートを維持する。
- インスタンスごとの差分は `overrides` に `prefabEntityId / componentType / fieldPath / value` の型付き操作として保持する。プレハブ本体を更新した際は、上書きのないフィールドだけを自動追従させ、削除されたフィールドや依存切れは競合診断として報告する。名前や配列インデックスだけで上書き対象を照合しない。
- 「Overrideを適用」「元に戻す」は対象フィールドまたは `Component` 単位のコマンドとする。プレハブ本体の編集と 1 インスタンスの上書き編集を同じ `Inspector` フィールドで曖昧に混在させない。
- 展開（Unpack）は、インスタンスを通常の `Entity` 群へ変換する一方向コマンドとし、プレハブ本体と他インスタンスには影響しない。元に戻す操作では同じ ID 群、上書き差分、両選択状態を復元する。現在は MCP の `unpack_prefab_instance` のみが実装しており、プレハブのルートをインスタンス `Entity` の子として複製することで展開前と同じ位置に描画する。`makeSource` オプションでは展開後の `Entity` を新しい元 `Entity` として登録し、`sourceEntityMap` でプレハブ側の ID 対応を維持する。元の `Entity` を削除済みのプレハブでも、この手順で再び更新できるようになる。
- プレハブを削除する際は全インスタンスと入れ子参照を列挙し、展開（Unpack）、置換、キャンセルのいずれかを選択させる。参照が残ったまま切れた ID（dangling ID）を残さない。
- プレハブ化したサブツリーの元 `Entity` を削除しても、プレハブとプレハブドキュメントは独立して保存・利用できる状態を維持する。

追加パレットの組み込み形状は追加 Registry が提供する `Entity` ジオメトリであり、プレハブとして `Assets` へ保存しない。

## 9. XRift への変換パイプライン

ビジュアルプロジェクトの変換は、元のビジュアルプロジェクトをコードプロジェクトへ書き換えるのではなく、一時的なステージングプロジェクトを生成する一方向パイプラインとする。

### 9.1 保存 transaction と crash recovery

保存対象は `VisualProjectDocument`、開始シーンの `SceneDocument`、`AssetManifest` の 3 ファイルだけではない。`assets/folders.json`、すべてのプレハブドキュメント、追加シーン、ドキュメントが参照する元データのメタデータも同じ保存単位に含める。

元ファイルのバイナリや派生キャッシュの確定は [6 章](#6-素材のライフサイクル) のインポートトランザクションが担当し、通常の保存処理で画像を再圧縮したりキャッシュを元データへ昇格させたりしない。

1. 保存開始時の各ドキュメントリビジョンと `sceneSelection` / `assetSelection` をスナップショットし、メモリ上でスキーマ、参照整合性、パス、プレハブ循環参照を検証する。
2. 同一プロジェクトボリューム内の `.xrift-studio/transactions/<transaction-id>/` に正規化 JSON の一時ファイルを全件書き出し、フラッシュ後に読み戻してスキーマと SHA-256 を検証する。プロジェクト外の OS 一時ディレクトリからのリネームは行わない。
3. ジャーナルにトランザクション ID、変更前後の保存リビジョン、対象相対パス、変更前後のハッシュ、一時ファイルパス、状態 `prepared` を記録する。トークン、絶対パス、Blob URL は含めない。
4. Tauri バックエンドの同一ボリューム原子的置換（same-volume atomic replace）で末端ドキュメントとフォルダー / プレハブドキュメントを確定し、最後に `VisualProjectDocument` の `saveCommitId` とドキュメントハッシュ一覧をコミットマーカーとして置き換える。複数ファイルのリネーム自体を単一の OS 原子操作とはみなさず、最後のコミットマーカーとジャーナルによってプロジェクト全体の可視リビジョンを確定する。
5. すべてのハッシュとコミット済みリビジョンが一致した時点でジャーナルを `committed` にし、`EditorSession` の保存済みリビジョンを進めて「未保存」状態を解除する。その後、一時ファイルと旧バックアップを回収する。

起動時に未完了のジャーナルが存在する場合は、コミットマーカーと各ファイルのハッシュから「旧リビジョンへロールバック」または「変更後ハッシュがすべて揃ったトランザクションをロールフォワード」の一方だけを選択し、復旧内容をユーザーへ通知する。途中状態のファイルを現在ドキュメントへ混ぜて推測読み込みしない。

保存に失敗した場合は、最後にコミット済みのリビジョンを開ける状態を維持したまま `EditorSession` を未保存（dirty）状態にとどめ、再試行・別名保存・診断表示を選択できるようにする。保存処理中に編集された新しいリビジョンは完了表示に含めず、保存直後も「未保存」のまま残す。

保存操作に対する元に戻す / やり直すは設けない。元に戻す / やり直すは編集状態を変更する操作であり、保存は現在のリビジョンを永続化する操作である。保存後に元に戻した場合は、通常どおり新しい未保存リビジョンになる。

### 9.2 Compiler staging と生成元の記録

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

このパイプラインは内部の実装境界であり、ビジュアル編集の操作手順としてユーザーへ露出しない。ユーザーは同じエディター上で Play を押し、`Scene View` 内で確認し、Stop で編集へ戻る。Vite のポート、CLI コマンド、開発サーバー、別ブラウザの URL を選んだり起動したりする必要はない。

コンパイラーコアは出力アダプターを二つ持つ。デスクトップ版の公開、コード編集への書き出し CLI、エディターからの既存コードプロジェクトへの追加は `classic-jsx` を選び、ブラウザ版アップロードだけが事前ビルド済みシェル向けに `classic-runtime` を選ぶ。これはシーン変換器の複製ではなく、同じ検証、プレハブ展開、素材コピー計画、診断情報、生成元の記録を共有したまま出力アダプターだけを切り替える境界である。

エディターの Play ではビジュアルドキュメントを Three / R3F プレビューアダプターが直接読み込むため、Node.js、XRift CLI、別プロセスの Vite を要求しない。これらのツールチェーンがない環境でも、ビジュアルプロジェクトの作成・編集・保存が可能である。コンパイル、`check`、`upload` を実行する時点でのみ実行環境の前提確認（ゲート）で Node.js / XRift CLI / 認証状態を検査し、不足があれば編集画面を閉じずにセットアップ導線を示す。

ステージングプロジェクトの実行確認についても、準備と終了をエディターが管理し、同一ウィンドウ内の隔離されたプレビュー領域に表示する。準備に時間がかかる場合は「生成結果を準備中」と停止操作を表示し、CLI の生ログは詳細表示へ分離する。自動で外部ブラウザを開かない。公開に失敗した場合は CLI とビルドの出力を破棄せず、失敗したステージと併せて確認できる形で残す。

コンパイル入力のフィンガープリントは、正規化した全編集ドキュメント、プレハブ / フォルダー定義ドキュメント、参照する元ファイル / 依存ファイルのハッシュ、派生レシピ / 派生ファイルのハッシュ、スキーマバージョン、コンパイラーバージョン、ターゲット（`world | item`）、Registry / アダプターのバージョンから算出する。現在のフィンガープリントと一致する成功済みステージングだけを最新（`fresh`）とし、ファイル更新時刻（mtime）や「一度ビルドした」フラグで判断しない。保存後であっても、コンパイラーバージョン、ターゲット、素材変換レシピのいずれかが変われば古い状態（`stale`）と判定する。

ステージングには生成物とは別に、次の生成元記録マニフェストを出力する。

```text
XRiftStudioProvenance
  formatVersion
  compilerVersion / target / adapterVersions
  inputFingerprint
  documentHashes / sourceHashes / derivedHashes
  generatedFiles[]: relativePath / sha256 / sourceMappings[]
  sourceMappings[]: generatedRange -> sceneId / entityId / componentType / assetId / fieldPath
```

生成内容には現在時刻、絶対パス、ランダム ID を含めない。同じフィンガープリントから常にバイト単位で同一のステージングを得る。生成時刻のような UI 表示用メタデータが必要な場合は、生成元記録のハッシュ計算対象外に置く。プレビュー、`check`、`upload` の開始直前にフィンガープリントと全生成ファイルのハッシュを再検証し、古い状態や手編集を検出した場合は自動再生成か中止を選択させる。直前の正常なステージングを「最新」と偽って表示しない。

ここでいう双方向性とは、XRift Studio が生成した成果物の診断情報、生成コードの位置、`check` 結果、`upload` 結果を、生成元記録を通じて元の `Entity` / 素材 / フィールドへ対応付けられることを指す。

これとは別に、既存コードプロジェクトの検査済みエントリーポイントおよび相対インポートで到達するローカルモジュールから、対応する静的 JSX を一度ビジュアル編集へ取り込む不可逆インポートを提供する。任意コードの実行、素材グラフ、`package.json`、`xrift.json` を完全なビジュアルドキュメントへ戻す往復変換とはみなさず、未対応箇所は診断情報として残す。

生成ファイルへの手編集を検出した場合は上書き再生成または書き出し / Eject を選択させ、差分を元の編集ドキュメントへ自動反映しない。

### 9.3 Validation / Migration

- 三つのルートドキュメントおよび参照されるシーン / プレハブ / フォルダー定義ドキュメントの `schemaVersion` を必須とし、依存順に段階的な移行を行う（[4.10](#410-schemaversion-と-migration)）。
- マイグレーションは元データを直接書き換えず、移行後のコピーを検証してから保存する。
- パス、`Entity`、`Component`、素材、マテリアル / テクスチャスロットの参照整合性、有限数、許容スケール、親子循環を検査する。
- ワールド / アイテムごとの許容 `Component` と必須設定をプロファイルで検査する。
- 生成コードは公開テンプレートと同じ TypeScript 設定で検査する。同じ識別子を型インポートと値インポートで二重束縛しないなど、テンプレート側の `strict` / `noUnusedLocals` / `noUnusedParameters` に違反する出力を作らない。この検査はフィクスチャとして CI で実行する。

### 9.4 Code Generation

- `classic-runtime` モードは `public/xrift-runtime.json` と薄いアダプターを生成する。ブラウザ版アップロードの事前ビルドシェルだけがこれを使う。デスクトップ版の公開とコード編集への書き出しは `classic-jsx` モードを使う。`xrift-studio-runtime` は npm 未公開であるため、これをインポートする出力をコードプロジェクトへ配置するとビルドできない。
- 出力先は OS の一時ディレクトリまたはビジュアルプロジェクト内の `.cache/generated-xrift/` とし、ビジュアルプロジェクトのルートに `package.json` や `src/` を生成しない。
- ステージングプロジェクト全体はコンパイラー所有とし、自動生成マーカーと元ドキュメントのハッシュを記録する。次回コンパイル時に破棄・再生成できる前提とし、ユーザーの手編集は受け付けない。
- `public/xrift-runtime.json` は編集用ドキュメントをそのまま公開せず、実行時に必要なシーン、`Entity`、Transform、`Component`、素材 URL だけを持つ `xrift-studio.runtime` スキーマへ変換する。
- `classic-runtime` の `src/World.tsx` または `src/Item.tsx` は `xrift-studio-runtime/react-three-fiber` を呼び出す薄いアダプターとする。`classic-jsx` のエントリーポイントはシーン全体の JSX と、Play と同じ実行環境モジュール群（`src/xrift-studio/`）を生成する。どちらも編集元データはビジュアル編集ドキュメントであり、生成物を編集しても元には戻さない。
- 素の Three.js 利用者は `xrift-studio-runtime/three` だけをインポートでき、React・Tauri・CLI をバンドルに含めない。3D モデルとテクスチャは並列に読み込み、形式固有レンダラーは対象素材が存在する場合にだけ遅延読み込みする。
- `Entity`、素材、プロパティの出力順を安定させ、同じ正規化入力セットとコンパイラー / アダプターバージョンから常に同一のステージングプロジェクトを生成する。
- Component / Asset Registry は、ターゲット非依存のスキーマ・参照・検証層と、Three プレビュー・R3F・XRift ワールド・XRift アイテムのターゲットアダプター層に分離する。
- メッシュやライトなどは許可リスト済みのアダプターだけで変換する。ドキュメント内の文字列を `eval`、`Function`、任意の動的インポートとして実行しない。この禁止は生成コードに対して無条件に維持する。スクリプトはドキュメント内の文字列ではなく独立したソースファイルであり、生成コードへは**静的インポート**としてのみ出力する（[4.8 スクリプト](#48-scripting-script-asset--script-component)）。

ワールドアダプターはワールドのルート、物理、スポーンなどのコンパイラープロファイルを接続する。アイテムアダプターは XRift から渡される位置やスケールなどのアイテム props をルートへ適用し、アイテム用プロファイルにない機能は生成しない。これらのコンパイラーアダプターと、エディター内のワールド動作確認プロファイル / アイテムプレビュープロファイルは責務が異なる。

### 9.5 プレビュー経路の選択

「動作を確認する」経路には複数の選択肢があり得るため、公式に契約が定義されている経路とそうでない経路を明確に分けて採用する。公式ドキュメントに記載のない API を前提にした UI は作らない。

| 経路 | 公式に確認できる契約 | XRift Studio での採用方針 |
| --- | --- | --- |
| エディター直接プレビュー | XRift 固有 API ではない。ビジュアルドキュメントを Three / R3F アダプターが直接読み込める | 採用する。編集・Play に使用し、XRift 本番実行環境と同一とは表示しない |
| コードプロジェクト（アイテム）のローカルプレビュー | アイテムチュートリアルが `npm run dev`、`src/dev.tsx`、`localhost:5173` の Canvas / Physics / OrbitControls プレビューを示している | 制約付きで採用する。生成したステージングの検査に使い、Node・テンプレート・ポートのライフサイクルをエディターが管理する。エディター直接プレビューとは別プロファイルとする |
| XRift CLI の preview コマンド | コマンドリファレンスには `login` / `whoami` / `create` / `upload` / `check` があり、preview コマンドは存在しない | 使わない。存在を仮定したコマンドや UI を作らない |
| SDK upload | `@xrift/sdk` は world / item の upload、進捗、結果の ID / version / content hash を定義している | アップロードの根拠としてのみ使う。プレビュー API の根拠にはしない。デスクトップ版では既存の CLI / Tauri 認証境界を優先する |
| Public API v1 | 公開ワールド、公開インスタンスなどの読み取りエンドポイントを定義している | 未公開ステージングの実行面として使わない |
| XRift 上の未公開 / 下書きプレビュー | CLI、SDK、Public API のいずれにも契約の記載がない | 設計上の依存にしない。公式の認証・ライフサイクル・URL・後片付け契約が公開された時点で再評価する |

「動作確認（Play）」はエディター直接プレビュー、「生成結果を確認」はステージングのローカル開発プレビューとして明確に分ける。後者はエディターがサーバー起動、準備完了検知、隔離された表示面、停止、ポート解放、stderr の機密情報除去を管理する。CLI の `upload` はビルドと審査・公開へ進む操作であるため、プレビューボタンの代替に使わず、実データを送信する通常検証も行わない。

### 9.6 Upload modal と既存 XRift flow

アップロード操作ではエディターのライトテーマ内に専用モーダルを開き、既存の `whoami` / `login`、公開準備確認、種別別 `check --build`、`upload` 実装を再利用する。別のトークンストア、シェルコマンドビルダー、公開メタデータスキーマをビジュアルモード専用に複製しない。

公式 CLI が同じ公開先を更新するためのリモート ID は `xrift.json` ではなく、ワールドでは `.xrift/world.json`、アイテムでは `.xrift/item.json` に保存される。ビジュアルプロジェクトではこの CLI 付属ファイルをプロジェクトルート配下の非表示・編集不可メタデータとして保持し、毎回作り直すステージングへアップロード前に復元する。

ステージングには `projectId` と成果物種別を持つアプリ所有のオーナーマーカーを最後に書き込み、次回ステージングを削除する前にも CLI 付属ファイルをビジュアルプロジェクト側へ回収する。

アップロード成功後は、CLI が更新した付属ファイルをジャーナル付きでビジュアルプロジェクトへ戻してから成功結果を確定し、`lastPublication` に UI 表示用の ID と結果を同期する。既存の付属ファイル、`lastPublication`、オーナーマーカー、CLI 結果の ID が一致しない場合、または以前の ID を一意に復元できない場合は、新しいリモート成果物を重複作成しないようアップロードや再試行を停止する。

| 状態 | 表示と動作 | 取り消し / 失敗からの戻り先 |
| --- | --- | --- |
| `review` | ターゲット、タイトル、説明、サムネイル、既存 `worldId` / `itemId`、保存・コンパイルの最新性、診断件数を表示。未編集の初期値や進行を止める問題を該当フィールドの近くに示す | 閉じると編集画面へ戻る。ドキュメントとリモートは不変 |
| `auth-check` | `whoami` の結果を表示し、未認証なら既存のログイン導線を同じモーダル内から開始 | ログイン取り消し後もメタデータ入力を保持して `review` へ戻る |
| `saving` | 9.1 の保存トランザクションと対象リビジョンを表示 | 安全な区切りで取り消し、未完了保存はジャーナル復旧対象とする。リモートは不変 |
| `compiling` | 入力フィンガープリント、ターゲット、素材処理、生成件数を段階表示 | Worker / コンパイラーを取り消して `review` へ戻る。直前の正常出力を最新扱いしない |
| `checking` | 既存 `check` / `build` の `APPROVE` / `REVIEW` / `REJECT` と、生成元記録上の `Entity` / 素材リンクを表示 | ローカルプロセスを取り消して `review` へ戻る。`REJECT` の場合はアップロードへ進めない |
| `uploading` | ファイル数、バイト数、送信中ファイル、content hash、送信先を表示 | リモート確定前だけ取り消し可能。開始後のキャンセルはベストエフォートと明記し、結果不明なら状態確認まで再アップロードしない |
| `processing` | アップロード後の自動審査中であり、まだ公開完了していない可能性があることを表示 | モーダルを閉じても結果 ID を保持する。公開完了とは表示しない |
| `succeeded` | SDK / CLI が返した `worldId` / `itemId`、`versionId`、`versionNumber`、`contentHash` を表示 | 「Editorに戻る」と「結果をコピー」を表示。公式結果が URL を返した場合だけ URL を開く導線を出す |
| `failed` | 失敗ステージ、機密除去済みエラー、再試行可否、リモート確定の有無を表示 | 認証・コンパイル・検査・アップロードの失敗ステージから再試行。入力ハッシュが変わっていれば `review` からやり直す |

SDK API リファレンスのアップロード結果は ID、バージョン、コンテンツハッシュを定義しているが、公開 URL フィールドは定義していない。XRift Studio は ID から URL パターンを推測生成せず、CLI / SDK が正式な URL を返さない場合は ID とバージョンだけを表示する。既存の公式ページを開く導線や状態更新 API が確認できるまで URL ボタンは表示しない。再試行では入力フィンガープリント、コンテンツハッシュ、既知のリモート ID を照合し、結果不明のアップロードを新規プロジェクトとして重複作成しない。

自動テスト、E2E、手動 UI 検証は `compile` / `check` までをフェイクバックエンドまたはフィクスチャで行い、実際の XRift へのアップロードは実行しない。実アップロードは、ユーザーがモーダルの最終確認を明示的に実行した本番操作だけに限定する。

### 9.7 コード編集とビジュアル編集の境界

#### コードプロジェクトからの取り込み

コードプロジェクトは、ローカルフォルダーまたはネイティブ側で浅くクローンした HTTPS / git SSH リポジトリから読み込む。`package.json`、`xrift.json`、同じ種別の `src/World.tsx` または `src/Item.tsx` を検査し、ファイル数、総容量、シンボリックリンク、元コードの依存グラフのバイト数に上限を適用する。エントリーポイントから相対インポートを再帰的に解決するが、モジュールは実行せず、静的な JSX とリテラルだけを不可逆に取り込む。

- **階層と基本要素**: `group`、RigidBody、対応する Drei / XRift ラッパー、ローカルコンポーネントのインスタンスを独立した `Entity` として保持する。親子関係とローカル Transform を維持し、その配下に標準形状、R3F ライト、コライダー、型付きの XRift Component を配置する。
- **素材と確認プレビュー**: ローカルの 3D モデル、テクスチャ、MP3 / WAV は通常の素材インポートトランザクションで保存する。球体 / BackSide 画像は Skybox へ、`new Audio` は音源へ接続する。確定前の確認画面でも、ファイルを書き込まずに同じトランザクションを準備し、素材原本の容量、テクスチャ解像度と展開サイズ、3D モデルのバウンディングボックス、取り込み時のスケール、親を含む配置時の大きさ、配置後の寸法を提示する。
- **カスタムシェーダー**: `THREE.ShaderMaterial` からカスタムマテリアル中間表現へ変換するのは、GLSL、リテラル uniform、テクスチャサンプラー、メッシュ名 variant に限る。元の 3D モデルのスロット、エディタープレビュー、コンパイラーには同じ記述子を渡す。
- **OBJ の名前付きコライダー**: OBJ に明示されたコライダーメッシュ名は、名前付きサブメッシュへの参照として復元する。ルートの 3D モデルを通らない名前付きノードにも、取り込み時のスケールと中心オフセットを明示的に適用し、表示モデルと物理演算の寸法を揃える。
- **RigidBody の復元**: RigidBody はコライダー形状と分離した親 `Entity` の `Component` として保持する。保存するのは `fixed` / `dynamic` / `kinematic` 種別、静的な一般設定、自動コライダー方式である。Play とコンパイラーでは、次の入れ子 RigidBody 境界までの子孫メッシュとコライダーを同じ Rapier ボディへ復元し、親の原点に代替コライダーを自動生成しない。
- **未対応要素の扱い**: フック、コールバック、条件分岐、動的なコレクション、解決できない素材依存は、元ファイルのパス付き診断として残す。完全な往復変換や暗黙の継続同期は提供しない。

#### ビジュアルプロジェクトからの書き出し（Eject）と境界管理

- ビジュアルプロジェクト内に手書きの `src/` や生成対象外のアダプターを混在させない。拡張はバージョン付きの `Component` / 素材 / 実行環境プラグイン契約として明示的に設計する。
- CLI の書き出し / Eject は `xrift-studio convert <visual-project> --to classic --out <directory>` と同じコンパイラーコアを使い、新しい空ディレクトリへ公開時と同じ `classic-jsx` ソースを持つコードプロジェクトを生成する。スクリプトソース、素材、デコーダー、フォントも同じプロジェクトへコピーし、公式テンプレートの依存関係だけでビルドできる状態にする。
- デスクトップ版エディターの「コード編集へ書き出す」は OS のフォルダー選択ダイアログで同種の既存コードプロジェクトを検査し、生成した `src/` 一式をビジュアルプロジェクト ID ごとの `src/xrift-studio/<id>/` へ相対インポートを保ったまま配置し、`Scene.tsx` から `XriftStudioScene` として公開する。素材、デコーダー、フォントは公開ワールドが直下しか配信しないため `public/` 直下へ置き、生成元記録とエクスポートマニフェストは `.xrift-studio/exports/<id>/` へ置く。既存の `xrift.json`、サムネイル、エントリーポイントは既定で変更しない。前回のエクスポートが記録したファイルのうち今回生成しないものは削除し、手書きファイルとバックアップには触れない。
- 既存コードプロジェクトへの追加はコンポーネント接続を既定とし、エントリーポイントの切り替えにはバックアップ作成と明示的な確認を必須とする。npm のみ固定許可リストの依存パッケージインストールを自動化し、他パッケージマネージャーのロックファイルを npm で混在させない。
- Eject 先の `package.json`、`xrift.json`、`src/`、`public/xrift/` はユーザー所有へ移す。由来とハッシュを `.xrift-studio/export-manifest.json` へ残すが、自動同期やビジュアル編集への逆変換は行わない。
- `--update` は同じビジュアルプロジェクト由来であり、マニフェスト記録後にファイルの追加・削除・変更がない書き出し先にだけ許可する。コードプロジェクト側を編集した後は更新を拒否し、既存ディレクトリへの混在や `--force` は提供しない。
- Eject トランザクションは一方向であり、書き出し先の変更を元のビジュアルプロジェクトへ自動同期しない。ビジュアル編集へ戻す場合は、別のビジュアルプロジェクトとして作成するか、明示したシーン追加として静的な不可逆インポートを行う。元ディレクトリと出力先が同一または親子関係になる配置も拒否する。

## 10. セキュリティと認証境界

- ビジュアルドキュメントは宣言的データだけを受け入れ、任意のスクリプト、HTML、シェルコマンドを保持・実行しない。スクリプトの実体はプロジェクト内のソースファイルであり、ビジュアルドキュメントが持つのは素材参照と宣言済みプロパティ値だけとする。スクリプトの評価はエディターの Play 内部に限り、その実行境界と残存リスクは [4.8 スクリプト](#48-scripting-script-asset--script-component) と [スクリプト契約](./SCRIPTING.md) に明記する。
- 外部素材は拡張子だけで信用せず、サイズ、MIME、ファイル実体、展開後サイズをネイティブ境界で検証する。
- パスはプロジェクトルート内へ正規化し、`..`、絶対パス、シンボリックリンク越しの脱出を拒否する。
- インポーターとコード生成器は既知の素材種別および `Component` 種別だけを処理する。
- 外部素材のプレビュー URL と Tauri アセットプロトコルはプロジェクト管理下の元データ / キャッシュだけに制限し、CSP の `default-src`、`script-src`、`connect-src`、`img-src`、`media-src` を必要最小限に絞る。外部モデルの描画前にこのセキュリティゲートを確認する。
- シェル実行の許可範囲（shell scope）は固定した XRift 実行ファイルと許可済みサブコマンド・引数に限定し、ドキュメントや素材名を任意コマンドとして連結しない。コンパイラー接続前に権限設定とスコープをレビューする。
- アップロードトークンはビジュアルドキュメント、ステージングプロジェクト、ブラウザの永続ストレージ、ログへ保存しない。
- デスクトップ版では、認証済み CLI または Tauri バックエンドをアップロード境界とする。
- ログへ出力する前にアクセストークン、Cookie、Authorization ヘッダー、署名付き URL、ユーザーホームの絶対パスを除去（マスク処理）する。コンパイラーやアップロード処理の生の stderr を未加工のまま UI やテレメトリーへ送らない。
- Blob URL、入力リスナー、Worker、`PlaySession` のリソースは終了時に必ず解放・破棄し、次のプロジェクトへ残さない。
- Web だけでアップロードする経路を設ける場合は、サーバーから短時間かつ用途限定の資格情報を受け取り、ブラウザへ長期トークンを配布しない設計を別途行う（[ブラウザからのワールド公開](./WEB_UPLOAD.md)）。
- アップロード前には既存の公開準備確認を再利用し、タイトル、説明、サムネイルが初期値のままなら処理を開始しない。
- デバッグビルドだけに登録する特権 Tauri MCP ブリッジは、WebView 上の JavaScript 実行と Tauri コマンドの `invoke` を許可する開発者向け自動化機構である。リリースビルドには登録・搭載しない。

外部モデルの描画、コンパイラー、`check` / `upload` は、これらのセキュリティゲートと脅威レビューを通過した実装だけを有効にする。ゲート検査に失敗した処理は開始せず、対象と修復手段をエディター上に示す。

## 11. 製品能力

### Authoring workspace

- 新規作成では、アイテム / ワールド × コード編集 / ビジュアルの四つのカードを同一画面に並べ、ビジュアルプロジェクトは専用ドキュメント一式をジャーナル付きで保存してライブラリへ登録する。
- ライトテーマ上で左 `Hierarchy`、中央 `Scene View`、右 `Inspector`、下 `Assets` をリサイズおよびドッキングでき、バージョン付きのエディター設定（Editor Preferences）からレイアウトを復元・リセットできる。
- `Hierarchy` / `Scene View` の右クリック追加、ギズモ、`Inspector`、素材・マテリアル・テクスチャのドラッグ＆ドロップは、`CommandDispatcher`、元に戻す / やり直す、両選択スナップショットを共有する。
- `Assets` はフォルダー整理、検索、インポート、外部カタログ、動的サムネイル、ドラッグ元データを提供し、マテリアル・テクスチャ・3D モデルのプロパティは `Inspector` で編集する。
- ワールド / アイテムの Play では同じシーンと種別別の実行環境プロファイルを使い、Stop 後に編集ドキュメント、両選択状態、`Inspector` コンテキスト、カメラを復元する。

### Asset and scene data

- GLB / glTF / OBJ / VRM、PNG / JPEG / WebP / KTX2、HDR / EXR、MP3 / WAV を許可リスト、Worker / メモリ上限、元ファイル非破壊のインポートトランザクションで扱う。
- glTF コア Metallic-Roughness マテリアル、`TextureInfo` / サンプラー、マテリアルスロット、`KHR_texture_transform`、型付き `KHR_materials_iridescence` をインポート、`Inspector`、プレビュー、コンパイラーで共有する。
- 3D モデル・テクスチャ・マテリアル・プレハブ・パーティクル・音声・スクリプト・シェーダー・ノードグラフ、プレハブの依存関係と上書き差分、Component Registry を安定 ID とバージョン付きマイグレーションで扱う。
- 地形は高さサンプルと草の散布ルールを `SceneDocument` に保存し、`Scene View`、静的メッシュ形状コライダー、生成物で同一の三角形メッシュを使う。
- 元ファイル、変換レシピ、プロセッサー、ターゲットハッシュが変わると派生データとサムネイルを `stale` とし、バックグラウンドキューで再生成する。

### Save, compile, preview, upload

- シーン / プレハブ / 素材 / フォルダーのドキュメント一式を、一時ファイル書き出し、検証・ハッシュ計算、同一ボリューム置換、ジャーナル、コミットマーカーの順で保存し、クラッシュ後は旧または新の完全なリビジョンへ復旧する。
- ターゲット非依存 Registry とワールド / アイテムアダプターにより、生成元記録付きの決定的なステージングプロジェクトを生成し、最新性検証のうえで既存の XRift `check` / `build` へ渡す。
- エディター直接プレビューと生成ステージングのプレビューを明確に分離し、公式に定義されていないホスト型プレビューや CLI プレビューの存在を仮定しない。
- アップロードモーダルは既存の `whoami` / `login` / `check` / `build` / `upload` を再利用し、確認、進捗、取り消し、再試行、リモート ID・バージョン、審査状態をエディター内に表示する。

### Extension policy

- 後続の `KHR_materials_*` 拡張は、一つずつ型付き Registry アダプター、検証、`Inspector`、プレビュー、コンパイラーを揃えて追加する。
- `Component` / 素材プラグインは任意スクリプト実行ではなく、バージョン付き宣言スキーマと許可リスト済みのターゲットアダプターに限定する。ここでいうプラグインはサードパーティが Studio 本体を拡張する機構を指す。制作者が自身のワールド / アイテムのために書くスクリプトは [4.8 スクリプト](#48-scripting-script-asset--script-component) のバージョン付き契約として別に扱い、プラグイン機構としては開放しない。
- ECS ランタイムは、正規化ドキュメントと Command / Registry では表現できないスケジューリング要件が確認された場合にのみ評価する。Script Component のフレームごとの更新がその確認された要件であり、対応は固定順序の `RuntimePlugin` ライフサイクルにとどめる。汎用 ECS ランタイムは導入しない。

## 12. 検証と受け入れ条件

### Product UI and creation

- [ ] 新規作成の同一画面に「アイテム・コード編集」「ワールド・コード編集」「アイテム・ビジュアル」「ワールド・ビジュアル」の四つのカードがあり、選択後に編集するデータと開く画面を読み取れる。
- [ ] コード編集とビジュアル編集が同一プロジェクトの表示モード切り替えではなく、編集データと利用機能が異なるプロジェクト種別であることが選択画面から分かる。
- [ ] コード編集の選択では、既存のコードプロジェクト作成、一覧更新、コードエディターへの遷移が変わらない。
- [ ] ビジュアル編集では専用ドキュメント形式をプロジェクトルートへ保存し、ライブラリから再度開ける。
- [ ] ライトテーマ上で左 `Hierarchy`、中央 `Scene View`、右 `Inspector`、下 `Assets` の責務を識別できる。
- [ ] `Hierarchy` または `Scene View` で選択すると同じ `sceneSelection` が選択表示され、`Inspector` の `Entity` 設定が更新される。
- [ ] `Assets` の単一クリックは独立した `assetSelection` と `Inspector` の素材コンテキストを更新し、`sceneSelection` 自体は消さない。
- [ ] プリミティブは追加パレットに配置され、ユーザー管理の `Assets` グリッド（3D モデル / glTF、テクスチャ、マテリアル、プレハブ、パーティクル）と区別できる。
- [ ] `Hierarchy` / `Scene View` の右クリック追加からプリミティブを作成すると、`Hierarchy` では選択中の親、`Scene View` ではクリック位置を使って `Entity` を 1 件追加し、元に戻す / やり直すで同じ ID と両選択状態を復元できる。
- [ ] 3D モデル / プレハブの配置操作だけが `Entity` を増やし、素材の単一クリックやマテリアル / テクスチャのドラッグでは `Entity` を増やさない。
- [ ] マテリアルを `Scene View` のメッシュまたは `Inspector` のスロットへドラッグすると、ホバー中に対象スロットと置換前後を確認でき、ドロップおよび元に戻す / やり直しが 1 件の `AssignMaterialCommand` になる。複数スロット時は選択ダイアログなしで推測適用しない。
- [ ] テクスチャを `Inspector` のマテリアルスロットへドラッグすると用途別の色空間を検証し、衝突時は確定前に解決方法を選べる。
- [ ] `Entity` の `Inspector` は素材 ID 参照を示し、マテリアル値を `Entity` 側にインライン保存しない。
- [ ] 共有マテリアルを編集すると、その ID を参照するすべての `Entity` の表示が更新される。
- [ ] 3D モデル / テクスチャ / マテリアルは、元ファイル・マテリアル・依存関係の変更に追従する動的な生成サムネイルを表示し、欠落・失敗時だけ種別アイコンと状態ラベルを表示する。
- [ ] `Hierarchy`、`Scene View`、`Inspector`、`Assets` をリサイズ・ドッキングしたレイアウトが再起動後に復元され、不正または画面外のレイアウトは安全な既定値へ、「レイアウトをリセット」は既定配置へ戻る。
- [ ] ツールバーと `Assets` は中央のセマンティック Icon Registry の Lucide アイコン、ラベル、ツールチップを使い、他製品のアイコンアセットやカスタム SVG を含まない。
- [ ] ギズモまたは `Inspector` から位置・回転・大きさを変更すると、両方の表示が一致する。
- [ ] Play は同じエディター中央の `Play Window` で始まり、境界・ヘッダー・実行コピー表示で通常の `Scene View` と区別できる。Vite、CLI、ポート、別ブラウザを操作する必要がない。
- [ ] Play 中は `Entity` の Transform、コライダー、Animation、追加・削除・複製・親変更・`Component` 追加を通常の履歴と自動保存で変更でき、追加・削除・更新された `Entity` だけを実行環境へ差分同期する。素材、マテリアル、シーン設定は変更できない。
- [ ] ワールドプレビューのコントローラーと物理演算は登録済みの実行環境アダプターを使い、アイテムプレビューにワールド用コントローラーを適用しない。
- [ ] Stop 後は `PlaySession` が破棄され、Play 中の許可された調整を含む最新の `SceneDocument`、Play 前と同じ `AssetManifest`、選択状態、編集カメラへ戻る。実行環境上の位置や速度は書き戻さない。
- [ ] マテリアル / テクスチャは `Inspector` のスキーマで編集し、`Assets` 下部に別のプロパティ編集フォームを作らない。
- [ ] GLB / glTF を `Assets` へドロップすると、元ファイル、派生データ、サムネイル、`AssetManifest` がトランザクションとして保存され、明示的なシーンへのドロップ以外では `Entity` を増やさない。
- [ ] 非対応ファイルでは編集ドキュメントを変更せず、対応形式が分かる案内を表示する。
- [ ] Node.js / XRift CLI がなくてもビジュアルプロジェクトを開いて編集・保存・エディター Play ができ、コンパイル / アップロード時だけ実行環境の前提確認（ゲート）を示す。
- [ ] 保存、変換、外部モデル描画、`check`、`upload` は実際の結果に基づいて状態を更新し、`stale` / 失敗 / 処理中を成功と表示しない。
- [ ] ライブラリへの戻り先があり、未保存変更がある時は保存・破棄・キャンセルを選べる。
- [ ] `pnpm typecheck` が通り、Vite 開発サーバーで主要導線とコンソールエラーがないことを確認できる。

通常の確認には型チェックと開発サーバーを使う。詳細は `AGENT.md` と `DEVELOPMENT.md` を参照する。

### Material / Texture / Import

- [ ] glTF 2.0 コアマテリアルの `baseColorFactor` / テクスチャ、`metallicFactor`、`roughnessFactor`、`metallicRoughnessTexture`、`normalTexture` / `scale`、`occlusionTexture` / `strength`、`emissiveTexture` / `emissiveFactor`、`alphaMode` / `alphaCutoff`、`doubleSided` を欠落なくインポート、編集、保存、プレビュー、再出力できる。
- [ ] `Base Color` / `Emissive` の RGB は sRGB、Metallic-Roughness / Normal / Occlusion は Linear として扱い、Base Color のアルファは Linear かつ unpremultiplied のまま保持する。
- [ ] Metallic-Roughness テクスチャの G = Roughness / B = Metallic、Occlusion の R、Normal の `scale`、`alphaMode` の意味をフィクスチャで検証できる。
- [ ] コアの `TextureInfo` の `texCoord` と `KHR_texture_transform` の `offset` / `rotation` / `scale` / 上書き `texCoord` を別フィールドとして保持し、拡張の有無を失わない。
- [ ] `KHR_materials_iridescence` の全フィールド、既定値、Linear 単チャンネルテクスチャを型付きアダプターで保持し、他の未知 `KHR_materials_*` を編集可能フィールドとして推測しない。
- [ ] `castShadow` / `receiveShadow` は Mesh Component、`doubleSided` はマテリアルに保存され、glTF マテリアル JSON へ影設定フィールドを混入しない。
- [ ] 複数メッシュプリミティブの安定したマテリアルスロットとバインディングを保持し、再インポートで照合不能なバインディングを自動置換せず `stale-material-binding` にする。
- [ ] マテリアルをプリセットから新規作成でき、作成後は素材だけを選択し、`Entity` へ自動バインディングしない。
- [ ] テクスチャのインポートは元ファイルをバイト列そのままに残し、リサイズ、ミップマップ、サンプラー、品質、WebP / KTX2 の変換レシピと派生データを別管理する。
- [ ] KTX2 / WebP をそれぞれ `KHR_texture_basisu` / `EXT_texture_webp` として扱い、ターゲット非対応時のフォールバックまたはブロッカーを示す。
- [ ] 元ファイル・依存ファイル・変換レシピ・プロセッサー・ターゲットハッシュの変化で派生データとサムネイルが `stale` になり、直前の正常データをアップロード入力に使わない。
- [ ] glTF の相対 URI はインポートルート内だけを解決し、リモート参照、絶対パス、パストラバーサル、許可外スキーム、メモリ上限超過をドキュメント変更前に拒否する。
- [ ] Worker のキャンセル・クラッシュ・メモリ不足・デコードエラー後も、最後に保存したドキュメント、元ファイル、直前の正常な派生データ、両選択状態、履歴が壊れない。
- [ ] `Assets` フォルダーの作成・名称変更・移動とコンテキストメニュー操作が安定 ID を維持し、表示上のフォルダー移動で元ファイルのパスを変えない。
- [ ] 外部カタログから追加した素材は作者とライセンスを保持し、公開した生成物にも同じ表記が出力される。

### Command / Shortcut / Prefab

- [ ] 配置、貼り付け、複製、削除、プレハブ作成の元に戻す / やり直しが、ドキュメント ID 群と前後の `sceneSelection` / `assetSelection` の両方を復元する。
- [ ] 複製はサブツリー内の `Entity` 参照だけを新しい ID へ付け替え、マテリアルやテクスチャなどの外部素材参照を暗黙に複製しない。
- [ ] `Hierarchy` から `Assets` / フォルダーへのドロップで、プレハブドキュメント、`AssetManifest` の項目、フォルダー所属、インスタンスメタデータが 1 トランザクションとして確定し、途中失敗では 1 件も残らない。
- [ ] プレハブの依存関係、入れ子循環、インスタンス上書き、プレハブ更新、展開（Unpack）を、安定したプレハブ内ローカル ID とフィールドパスで検証できる。
- [ ] プレハブ化した元 `Entity` を削除した後も、プロジェクトを保存して再度開ける。
- [ ] `Ctrl/Cmd+C/V/D`、`Delete`、`F`、`W/E/R`、元に戻す / やり直す、保存、Play / Stop が Shortcut Registry の既定割り当てから実行され、ツールバー・ツールチップ・ドキュメントと一致する。
- [ ] テキスト入力、`contenteditable`、数値入力欄、IME 変換中はエディターショートカットが入力を奪わない。
- [ ] ショートカット競合時はどちらも実行せず、ユーザーのカスタマイズと既定へ戻す操作がエディター設定（Editor Preferences）に保存される。

### 永続化とコンパイラ

- [ ] Tauri ライブラリ探索はルートにある有効な `xrift-studio.project.json` でビジュアルプロジェクトを判定し、`.cache/generated-xrift/` をプロジェクトとして列挙しない。
- [ ] ビジュアルマニフェストが壊れている場合はコードプロジェクトと推測せず、問題のあるフィールドと修復手段を示す。
- [ ] `VisualProjectDocument`、シーン / プレハブドキュメント、`AssetManifest`、フォルダー定義ドキュメントのシリアライズと読み込みで ID・値・参照が失われない。
- [ ] 旧 `schemaVersion` のフィクスチャが依存順に最新形式へ移行でき、[4.10](#410-schemaversion-と-migration) の対応表どおりに解決される。
- [ ] 一時ファイル書き出し後の検証・ハッシュ計算、同一ボリューム置換、ジャーナル、コミットマーカーの順で保存し、各障害注入ポイントから旧または新の完全なドキュメント一式に復旧できる。
- [ ] 保存中に編集が進んだ場合、保存対象のリビジョンだけをコミット済みとし、新リビジョンの「未保存」表示を消さない。
- [ ] 欠落素材、未知 `Component`、循環 `Hierarchy` が対象 ID 付きで検証失敗となる。
- [ ] マテリアル / テクスチャスロットの型不一致と欠落参照を素材 / `Entity` ID 付きで検出できる。
- [ ] 同じ正規化入力フィンガープリント、コンパイラー / アダプターバージョン、ターゲットから、バイト単位で同一のステージングプロジェクトと同一の生成元マッピングを得られる。
- [ ] 生成したステージングプロジェクトが公開テンプレートと同じ TypeScript 設定で型検査を通過する。
- [ ] 元ファイル、派生レシピ、コンパイラーバージョン、ターゲット、または生成ファイルハッシュが変わるとステージングを `stale` と判定し、プレビュー・`check`・`upload` の前に再生成または中止する。
- [ ] 生成物に対する診断情報のパス・範囲を、生成元記録によって元のシーン・`Entity`・`Component`・素材・フィールドへ戻せる。
- [ ] コードプロジェクトの検査済み `src` モジュールグラフから許可リスト済みの静的 JSX を不可逆に取り込み、親子関係、ローカルコンポーネント境界、型付き XRift Component をフィクスチャで維持する。任意コードや手編集ステージングを実行・完全変換せず、未対応箇所は元ファイルパス付きで診断する。
- [ ] ワールド / アイテムプロファイルの違反を生成前に検出できる。
- [ ] ビジュアルプロジェクトのルートにコンパイラーが `package.json`、`xrift.json`、`src/` を生成しない。
- [ ] CLI の Eject は新しいコードプロジェクトだけを作る。デスクトップ版の既存コードプロジェクトへの追加はビジュアルプロジェクト ID ごとの所有領域だけを更新し、手書きのエントリーポイントは明示確認なしに変更しない。
- [ ] エディター直接プレビューと生成アイテムのローカル開発プレビューを別プロファイルとして表示し、公式に未記載の CLI / ホスト型プレビューを実装済みと表示しない。
- [ ] 読み込み、保存、コンパイル、生成のいずれかが失敗した後も、最後にコミット済みのドキュメント一式、リビジョン、両選択状態、履歴が壊れない。
- [ ] 公開が失敗した場合に CLI とビルドの出力を確認できる。
- [ ] アップロードトークン、絶対パス、Blob URL が編集ドキュメントとステージングプロジェクトに含まれない。
- [ ] CSP、Tauri のシェル実行範囲、パス検証、ログの機密情報除去といったセキュリティゲートを外部モデル描画やコンパイラー接続の前に検証する。

### Upload

- [ ] アップロードモーダルはタイトル、説明、サムネイル、ターゲット、認証、保存・コンパイルの最新性、診断を確認してから既存の `whoami` / `login` / `check --build` / `upload` へ進む。
- [ ] `review`、`auth-check`、`saving`、`compiling`、`checking`、`uploading`、`processing`、`succeeded`、`failed` の各状態で、進捗、取り消し可否、再試行先、戻り先を読み取れる。
- [ ] `REJECT`、古いコンパイル入力、未編集メタデータ、サムネイル欠落などのブロッカーがある時はアップロードを開始しない。
- [ ] アップロード後は `worldId` / `itemId`、`versionId`、`versionNumber`、`contentHash` を表示し、審査中を公開済みと表示しない。
- [ ] `.xrift/world.json` / `.xrift/item.json` のリモート ID をビジュアルプロジェクトと新規ステージングの間で継承し、再アップロードで同じ公開先を更新する。
- [ ] 正式な結果に URL がない場合は URL パターンを推測せず、ID を表示する。結果不明の再試行で新しいリモート成果物を重複作成しない。
- [ ] 自動テストと通常の UI 検証はフェイクバックエンド / フィクスチャを使い、実際の XRift アップロードを発生させない。

## 13. 参考資料

### XRift

- [SDK Overview](https://docs.xrift.net/sdk/overview)
- [SDK API Reference](https://docs.xrift.net/sdk/api-reference)
- [World Components](https://docs.xrift.net/world-components/components/)
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
- [KHR_interactivity](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_interactivity/README.md)
- [glTF Validator](https://github.com/KhronosGroup/glTF-Validator)

### UI icons

- [Lucide for React](https://lucide.dev/guide/react)

これらの参考資料は XRift 連携、データ互換性、UI 実装の判断基準として参照する。外部のコードや素材を取り込む場合は、それぞれのライセンスと更新方針を別途確認する。
