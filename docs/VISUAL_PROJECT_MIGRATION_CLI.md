# Visual Project Classic Export CLI

最終更新: 2026-09-01

## 目的

XRift Studioのビジュアルプロジェクトを、通常のXRiftコードプロジェクトへ一方向に書き出す。デスクトップ版の公開でXRiftへ送るものと同じTypeScript / React Three Fiberソースを出力する。書き出し先では公式テンプレートの依存関係だけで`npm install`と`npm run dev`を実行できる。

コード編集の任意React／JavaScriptをビジュアル編集のプロジェクトへ逆変換しない。ビジュアル編集側の正本は`xrift-studio.project.json`、シーン、素材Manifest、プレハブ、元データassetである。コード編集側は書き出し後に独立して編集できる別projectとする。

非公式community toolであることを明確にするため、npm packageとJSON formatには公式の`@xrift/*` namespaceを使用しない。

- CLI／desktop: `xrift-studio`
- Runtime: `xrift-studio-runtime`
- Runtime JSON format: `xrift-studio.runtime`

package descriptionには`Unofficial community tools for XRift. Not affiliated with the XRift project.`相当の説明を入れる。

## コマンド

npm公開後の利用形は次のとおりとする。

```bash
npx xrift-studio convert ../my-visual-world --to classic --out .
```

npm公開前は、repositoryでbuildして同じCLIを実行する。

```bash
pnpm cli:build
node dist/cli/xrift-studio.mjs convert ../my-visual-world --to classic --out ./classic-world --dry-run
```

対応option。

| Option | 役割 |
| --- | --- |
| `<source>` | ビジュアル編集のプロジェクトrootまたは`xrift-studio.project.json`。 |
| `--to classic` | 一方向のコード編集exportを選ぶ。 |
| `--out <directory>` | 新規のコード編集のプロジェクト出力先。 |
| `--dry-run` | 書き込まず、診断と生成予定を表示する。 |
| `--update` | 同じビジュアル編集のプロジェクトから生成した未改変exportだけを更新する。 |
| `--format text\|json` | 人向けまたは自動処理向けのreport形式。 |
| `--force` | 設けない。 |

## Compile境界

```text
VisualProjectDocument + SceneDocument + AssetManifest + Prefab
  -> schema／reference／path validation
  -> Prefab展開
  -> xrift-studio.runtime JSON
  -> Asset copy plan
  -> xrift-studio-runtime/three
  -> xrift-studio-runtime/react-three-fiber
  -> XRift Classic adapter
```

desktop publishとCLIは別のシーン変換器を持たない。同じ`compileVisualProject()`、素材copy plan、diagnostics、生成元の記録を利用する。

出力modeは二つある。

| mode | 使う経路 | 生成物 |
| --- | --- | --- |
| `classic-jsx` | desktop Publish、`xrift-studio convert`、Editorからの既存コード編集追加 | シーン全体のJSXエントリーポイント、動作確認と同じ実行環境module、スクリプトmodule。公式テンプレートの依存関係だけでビルドできる |
| `classic-runtime` | ブラウザ版アップロードの事前ビルドshell | `xrift-runtime.json`と`xrift-studio-runtime/react-three-fiber`を呼ぶ薄いadapter |

コード編集exportには`classic-jsx`を使う。`xrift-studio-runtime`はnpmへ未公開のため、`classic-runtime`の出力では`npm install`がE404で停止し、`xrift dev`もmoduleが見つからず起動できない。公開時に`xrift check`でビルドするものと同じfile一式を書き出す。npm公開後にコード編集exportで`classic-runtime`を使うかは、その時点で決める。

編集用JSONをそのまま公開物へ渡さない。`classic-jsx`は実行に必要なオブジェクト、位置・回転・大きさ、コンポーネント、素材URLだけをJSXへ書く。`classic-runtime`は同じ内容を`xrift-runtime.json`へ正規化する。

## 生成物

```text
classic-world/
  package.json                       # 公式template + compilerが要求する固定version
  xrift.json
  src/
    World.tsx | Item.tsx             # Scene全体のJSX
    xrift-studio/*.ts(x)             # Light / Audio / Particle / Text / Script / Interactivity runtime
    scripts/*.ts(x)                  # Script Assetをmoduleにしたもの
  public/
    thumbnail.png
    xrift-studio-<asset-id>-<file>   # Asset。公開Worldは直下しか配信しない
    basis_transcoder.js ...          # KTX2 / Draco decoder（必要な時だけ）
    <font>.woff                      # Textの書体（必要な時だけ）
  .xrift-studio/
    export-manifest.json
    compiler-provenance.json
  README.md
```

`classic-runtime`が書く`xrift-runtime.json`のroot contract。

```json
{
  "format": "xrift-studio.runtime",
  "schemaVersion": "1.0.0",
  "generator": "xrift-studio",
  "compilerVersion": "0.6.0",
  "projectId": "project-id",
  "projectKind": "world",
  "entryScene": "scene-id",
  "scenes": {},
  "assets": {}
}
```

`classic-runtime`の開始ファイルは薄いadapterにする。manifestはXRiftの`baseUrl`から解決する。site rootの絶対pathは書かない。

```tsx
import { useXRift } from "@xrift/world-components";
import { XriftWorld } from "xrift-studio-runtime/react-three-fiber";

export const World = () => {
  const { baseUrl } = useXRift();
  return <XriftWorld manifest={`${baseUrl}xrift-runtime.json`} />;
};
```

`package.json`にはcompiler planが要求する正確なversionを追加する。`@xrift/world-components`はStudioの動作確認と同じ版（`COMPILER_WORLD_COMPONENTS_PACKAGE_SPEC`）を使う。既存rangeがその版へ届かない時だけ固定する。テキストを含む場合は`troika-three-text`をcompiler planから追加する。Open Brushを含む場合は`three-icosa`をcompiler planから追加する。

## Three.js API

`xrift-studio-runtime/three`は、Reactを読み込まない独立したエントリーポイントとする。

```ts
import * as THREE from "three";
import { XriftThreeLoader } from "xrift-studio-runtime/three";

const scene = new THREE.Scene();
const loader = new XriftThreeLoader({ assetBaseUrl: "/xrift/" });
const result = await loader.load("/xrift/runtime.json");
scene.add(result.root);
```

戻り値。

```ts
type XriftLoadResult = {
  root: THREE.Group;
  assetBaseUrl: URL;
  animations: THREE.AnimationClip[];
  entities: Map<string, THREE.Object3D>;
  spawnPoints: Map<string, THREE.Object3D>;
  diagnostics: XriftRuntimeDiagnostic[];
  manifest: XriftRuntimeManifest;
};
```

3Dモデルとテクスチャの独立取得は並列に行う。Open Brush rendererは対象3Dモデルがある時だけ動的に読み込む。通常シーンの初期bundleへ混ぜない。

## 安全性

- 入力project、シーン、プレハブ、素材元データ、thumbnailは通常fileだけを許可する。absolute path、`..`、URL、symlink経由のproject外参照は拒否する。
- 元データとoutputが同じ、または親子関係になる配置は拒否する。
- 初回は存在しない出力先または空folderだけを許可する。`package.json`、`xrift.json`、その他fileがあるfolderへ混在させない。
- 一時folderでtemplate、Runtime JSON、素材、生成元の記録を完成させる。最後に同一volume内で出力先へ切り替える。
- `--update`は`export-manifest.json`のproject ID、target kind、全file path、SHA-256が一致する未改変exportだけを更新する。
- コード編集側で追加、削除、変更したfileが一つでもあれば`--update`を停止する。ビジュアル編集側へ変更を推測して戻さない。
- `xrift create`には固定したkind、固定temporary project名、`--skip-install -y`だけを渡す。ビジュアル編集documentの文字列をshell commandへ連結しない。

## 現在の実装状態

repository内で次が接続済みである。

- ビジュアル編集document loaderとschema validation。
- 既存compiler coreを使う`classic-jsx`出力、素材copy plan、デコーダー / フォントの同梱plan、diagnostics、生成元の記録。スクリプト元データはビジュアル編集のプロジェクトから読む。moduleとして出力する
- `xrift create`を使うコード編集template生成とatomic commit。
- `--dry-run`、`--update`、text／JSON report、衝突防止。
- `xrift-studio-runtime/three`の基本形状、3Dモデル、テクスチャ、マテリアル、ライト、static pose、オブジェクトMap、animation収集。
- `xrift-studio-runtime/react-three-fiber`の`XriftWorld`／`XriftItem` adapterと、ワールドの直接衝突判定（box／メッシュ）をRapierへ接続するphysics adapter。
- 旧来の`xrift.spawn-point`を含む開始位置の公式Context接続とmarker収集（`XriftLoadResult.spawnPoints`）。
- 音源（Three音声／PositionalAudio）とパーティクルの放出（bounded Points simulation）のRuntime adapter。
- Open Brush metadataと必要時だけの`three-icosa` loader。
- Runtime JSONからThree.js sceneを作るfixtureと、改変済みexportの更新拒否fixture。
- ビジュアルエディターheaderの「コード編集へ書き出す」とOS folder picker。
- 既存コード編集のプロジェクトへ、ビジュアル編集のプロジェクトIDごとの`src/xrift-studio/<id>/`に生成`src/`一式を相対importを保ったまま置くflow。素材、デコーダー、フォントは`public/`直下。`Scene.tsx`から`XriftStudioScene`として公開する
- component追加、backup付きエントリーポイントの切り替え、不足packageだけのnpm install、前回exportの残骸除去、folder／VS Code／terminal／接続snippetの完了導線。
- fixtureでの検証: 生成`src/`をexport配置へ移した状態でも公式templateのtsconfigで`tsc`が通ること（`pnpm cli:test`の`classic-export-relocated`）。

未完了。

- npmへの`xrift-studio`／`xrift-studio-runtime`公開。公開後も、コード編集exportを`classic-runtime`へ戻すかは別途判断する。
- `classic-runtime`側の物理挙動／動的衝突判定、XRift固有コンポーネントのRuntime adapter完全対応。静的な直接衝突判定、開始位置、音声、パーティクルは対応済みである。未対応分はcompile warningとして残す。
- 任意の`xrift check`実行option。現行公式CLI contractを確認してから追加する。
- `.xriftpack`のpack／import。

未対応コンポーネントはcompile reportか実行環境diagnosticsに記録し、対応済みとは表示しない。

## Desktop Editorから既存コード編集へ追加

ビジュアルエディターheaderの「コード編集へ書き出す」は、OSのfolder pickerで同じ種別の既存コード編集のプロジェクトを選択する。CLIの新規project exportとは安全境界を分ける。既存の`xrift.json`、thumbnail、手書きのエントリーポイントは既定では上書きしない。

```text
src/xrift-studio/<visual-project-id>/
  Scene.tsx                # export { World as XriftStudioScene }
  World.tsx | Item.tsx     # 生成したScene
  xrift-studio/*.ts(x)     # runtime module（Worldからは ./xrift-studio/...）
  scripts/*.ts(x)          # Script module（Worldからは ./scripts/...）

public/
  xrift-studio-<asset-id>-<file>
  <decoder> / <font>       # 必要な時だけ。既に同名のfileがあれば上書きしない

.xrift-studio/exports/<visual-project-id>/
  export-manifest.json
  compiler-provenance.json
  backups/src/World.tsx    # entry切替時だけ
```

既定の「コンポーネントとして追加」は接続snippetを完了画面に残す。「エントリーを切り替える」は明示確認後だけ実行する。既存`World.tsx`／`Item.tsx`を管理領域へbackupして置き換える。置き換えたエントリーポイントは`WorldProps`／`ItemProps`も再exportする。templateの`src/index.tsx`が通るようにするためである。npm projectでは固定allow-listのpackageを自動installする。pnpm／Yarn／Bunでは別lockfileを作らない。dependency記録と既存package managerでのinstall案内までにする。以前の書き出しが`xrift-studio-runtime`をpackage.jsonへ記録していた場合は取り除く。完了画面で知らせる。

## 将来のpackage分離

```text
xrift-studio
  desktop app + CLI

xrift-studio-runtime
  schema
  /three
  /react-three-fiber

将来:
  xrift-studio-visual-project-format
  xrift-studio-compiler
```

まずRuntime JSON contractとloaderの互換性を固定する。その後にformat／compilerを独立packageへ切り出す。package分割後もdesktop、CLI、Three.js、R3Fが同じRuntime JSON fixtureを通ることを完了条件とする。
