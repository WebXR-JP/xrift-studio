# Visual Project Classic Export CLI

最終更新: 2026-09-01

## 目的

XRift StudioのVisual projectを、通常のXRift Classic projectへ一方向に書き出す。書き出すのはdesktopの公開（Publish）がXRiftへ送るものと同じTypeScript / React Three Fiberのソースで、書き出し先は公式テンプレートの依存関係だけで`npm install`と`npm run dev`が通る。

Classicの任意React／JavaScriptをVisual projectへ逆変換しない。Visual側の正本は`xrift-studio.project.json`、Scene、Asset Manifest、Prefab、source assetであり、Classic側は書き出し後に独立して編集できる別projectとする。

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

対応option:

| Option | 役割 |
| --- | --- |
| `<source>` | Visual project rootまたは`xrift-studio.project.json`。 |
| `--to classic` | 一方向のClassic exportを選ぶ。 |
| `--out <directory>` | 新規のClassic project出力先。 |
| `--dry-run` | 書き込まず、診断と生成予定を表示する。 |
| `--update` | 同じVisual projectから生成した未改変exportだけを更新する。 |
| `--format text\|json` | 人向けまたは自動処理向けのreport形式。 |

`--force`は設けない。

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

desktop publishとCLIは別のScene変換器を持たず、同じ`compileVisualProject()`、Asset copy plan、diagnostics、provenanceを利用する。

出力modeは二つある。

| mode | 使う経路 | 生成物 |
| --- | --- | --- |
| `classic-jsx` | desktop Publish、`xrift-studio convert`、Editorからの既存Classic追加 | Scene全体のJSX entry、Playと同じruntime module、Script module。公式テンプレートの依存関係だけでビルドできる |
| `classic-runtime` | ブラウザ版アップロードの事前ビルドshell | `xrift-runtime.json`と`xrift-studio-runtime/react-three-fiber`を呼ぶ薄いadapter |

Classic exportが`classic-jsx`を使うのは、`xrift-studio-runtime`がnpmへ未公開だからである。`classic-runtime`の出力をClassic projectへ置くと`npm install`がE404で止まり、`xrift dev`はmoduleが見つからずに起動しない。書き出しは「書けたが動かない」状態を作らず、公開が`xrift check`でビルドしているのと同じfile一式を置く。npm公開後に`classic-runtime`をClassic exportへ戻すかどうかは、その時点で決める。

編集用JSONをそのまま公開物へ渡さない。`classic-jsx`は実行に必要なEntity、Transform、Component、Asset URLだけをJSXへ書き、`classic-runtime`は同じ内容を`xrift-runtime.json`へ正規化する。

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

`classic-runtime`が書く`xrift-runtime.json`のroot contract:

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

`classic-runtime`のentryは薄いadapterにする。manifestはXRiftの`baseUrl`から解決し、site rootの絶対pathを書かない。

```tsx
import { useXRift } from "@xrift/world-components";
import { XriftWorld } from "xrift-studio-runtime/react-three-fiber";

export const World = () => {
  const { baseUrl } = useXRift();
  return <XriftWorld manifest={`${baseUrl}xrift-runtime.json`} />;
};
```

`package.json`にはcompiler planが要求する正確なversionを追加する。`@xrift/world-components`はStudioのPlayと同じ版（`COMPILER_WORLD_COMPONENTS_PACKAGE_SPEC`）を、既存rangeがその版へ届かない時だけ固定する。Textを含む場合は`troika-three-text`、Open Brushを含む場合は`three-icosa`をcompiler planから追加する。

## Three.js API

`xrift-studio-runtime/three`はReactを読み込まない独立entry pointとする。

```ts
import * as THREE from "three";
import { XriftThreeLoader } from "xrift-studio-runtime/three";

const scene = new THREE.Scene();
const loader = new XriftThreeLoader({ assetBaseUrl: "/xrift/" });
const result = await loader.load("/xrift/runtime.json");
scene.add(result.root);
```

戻り値:

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

ModelとTextureの独立取得は並列に行う。Open Brush rendererは対象Modelがある時だけ動的に読み込み、通常Sceneの初期bundleへ混ぜない。

## 安全性

- 入力project、Scene、Prefab、Asset source、thumbnailは通常fileだけを許可し、absolute path、`..`、URL、symlink経由のproject外参照を拒否する。
- sourceとoutputが同じ、または親子関係になる配置を拒否する。
- 初回は存在しない出力先または空folderだけを許可する。`package.json`、`xrift.json`、その他fileがあるfolderへ混在させない。
- 一時folderでtemplate、Runtime JSON、Asset、provenanceを完成させ、最後に同一volume内で出力先へ切り替える。
- `--update`は`export-manifest.json`のproject ID、target kind、全file path、SHA-256が一致する未改変exportだけを更新する。
- Classic側で追加、削除、変更したfileが一つでもあれば`--update`を停止する。Visual側へ変更を推測して戻さない。
- `xrift create`には固定したkind、固定temporary project名、`--skip-install -y`だけを渡し、Visual documentの文字列をshell commandへ連結しない。

## 現在の実装状態

repository内で次が接続済みである。

- Visual document loaderとschema validation。
- 既存compiler coreを使う`classic-jsx`出力、Asset copy plan、decoder / fontの同梱plan、diagnostics、provenance。Script sourceはVisual projectから読み、moduleとして出力する。
- `xrift create`を使うClassic template生成とatomic commit。
- `--dry-run`、`--update`、text／JSON report、衝突防止。
- `xrift-studio-runtime/three`のPrimitive、Model、Texture、Material、Light、static pose、Entity Map、animation収集。
- `xrift-studio-runtime/react-three-fiber`の`XriftWorld`／`XriftItem` adapterと、Worldの直接Collider（box／mesh）をRapierへ接続するphysics adapter。
- 旧来の`xrift.spawn-point`を含むSpawn Pointの公式Context接続とmarker収集（`XriftLoadResult.spawnPoints`）。
- Audio Source（Three Audio／PositionalAudio）とParticle Emitter（bounded Points simulation）のRuntime adapter。
- Open Brush metadataと必要時だけの`three-icosa` loader。
- Runtime JSONからThree.js sceneを作るfixtureと、改変済みexportの更新拒否fixture。
- Visual Editor headerの「Classicへ書き出す」とOS folder picker。
- 既存Classic projectへ、Visual Project IDごとの`src/xrift-studio/<id>/`に生成`src/`一式を相対importを保ったまま置き、`Scene.tsx`から`XriftStudioScene`として公開するflow。Asset、decoder、fontは`public/`直下。
- component追加、backup付きentry切替、不足packageだけのnpm install、前回exportの残骸除去、folder／VS Code／terminal／接続snippetの完了導線。
- fixtureでの検証: 生成`src/`をexport配置へ移した状態でも公式templateのtsconfigで`tsc`が通ること（`pnpm cli:test`の`classic-export-relocated`）。

未完了:

- npmへの`xrift-studio`／`xrift-studio-runtime`公開。公開後も、Classic exportを`classic-runtime`へ戻すかは別途判断する。
- `classic-runtime`側のRigid Body／動的Collider、XRift固有ComponentのRuntime adapter完全対応。静的な直接Collider、Spawn Point、Audio、Particleは対応済みで、未対応分はcompile warningとして残す。
- 任意の`xrift check`実行option。現行公式CLI contractを確認してから追加する。
- `.xriftpack`のpack／import。

未対応Componentを黙って完成扱いにせず、compile reportまたはruntime diagnosticsへ残す。

## Desktop Editorから既存Classicへ追加

Visual Editor headerの「Classicへ書き出す」は、OSのfolder pickerで同じ種別の既存Classic projectを選択する。CLIの新規project exportとは安全境界を分け、既存の`xrift.json`、thumbnail、手書きentryを既定では上書きしない。

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

既定の「コンポーネントとして追加」は接続snippetを完了画面に残す。「エントリーを切り替える」は明示確認後だけ既存`World.tsx`／`Item.tsx`を管理領域へbackupして置き換える。置き換えたentryは`WorldProps`／`ItemProps`も再exportし、templateの`src/index.tsx`が通るようにする。npm projectでは固定allow-listのpackageを自動installし、pnpm／Yarn／Bunでは別lockfileを作らずdependency記録と既存package managerでのinstall案内までにする。以前の書き出しが`xrift-studio-runtime`をpackage.jsonへ記録していた場合は取り除き、完了画面で知らせる。

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

まずRuntime JSON contractとloaderの互換性を固定し、その後にformat／compilerを独立packageへ切り出す。package分割後もdesktop、CLI、Three.js、R3Fが同じRuntime JSON fixtureを通ることを完了条件とする。
