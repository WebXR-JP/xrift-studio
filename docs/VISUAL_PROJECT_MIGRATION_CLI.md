# Visual Project Classic Export CLI

最終更新: 2026-07-21

## 目的

XRift StudioのVisual projectを、通常のXRift Classic projectと、Three.jsから再利用できる実行用データへ一方向に書き出す。

Classicの任意React／JavaScriptをVisual projectへ逆変換しない。Visual側の正本は`xrift-studio.project.json`、Scene、Asset Manifest、Prefab、source assetであり、Classic側は書き出し後に独立して編集できる別projectとする。

非公式community toolであることを明確にするため、npm packageとJSON formatには公式の`@xrift/*` namespaceを使用しない。

- CLI／desktop: `xrift-studio`
- Runtime: `xrift-studio-runtime`
- Runtime JSON format: `xrift-studio.runtime`

package descriptionには`Unofficial community tools for XRift. Not affiliated with the XRift project.`相当の説明を入れる。

## コマンド

最終的なnpm利用形は次のとおりとする。

```bash
npx xrift-studio convert ../my-visual-world --to classic --out .
```

現在のrepository実装は、npm公開前でもbuildして検証できる。

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

desktop publishとCLIは別のScene変換器を持たず、同じ`compileVisualProject()`、Asset copy plan、diagnostics、provenanceを利用する。npm公開前の移行期間は、既存desktop publishを`classic-jsx` mode、`convert`を`classic-runtime` modeで呼び分け、未公開packageのために現行Uploadを壊さない。

編集用JSONをそのままRuntimeへ渡さない。選択、Inspector、履歴、folder表示、Prefab authoring metadataなどを除き、実行時に必要なEntity、Transform、Component、Asset URLだけを`runtime.json`へ正規化する。

## 生成物

```text
classic-world/
  package.json
  xrift.json
  src/
    World.tsx | Item.tsx
  public/
    thumbnail.png
    xrift/
      runtime.json
      assets/
        <asset-id>-model.glb
        <asset-id>-texture.png
  .xrift-studio/
    export-manifest.json
    compiler-provenance.json
  README.md
```

`runtime.json`のroot contract:

```json
{
  "format": "xrift-studio.runtime",
  "schemaVersion": "1.0.0",
  "generator": "xrift-studio",
  "compilerVersion": "0.5.8",
  "projectId": "project-id",
  "projectKind": "world",
  "entryScene": "scene-id",
  "scenes": {},
  "assets": {}
}
```

Classic entryは自動生成Sceneを大量のJSXとして埋め込まず、薄いadapterにする。

```tsx
import { XriftWorld } from "xrift-studio-runtime/react-three-fiber";

export const World = () => (
  <XriftWorld manifest="/xrift/runtime.json" />
);
```

`package.json`にはcompilerが要求する正確な`xrift-studio-runtime` versionを追加する。Open Brushを含む場合は、対応renderer packageもcompiler planから追加する。

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
  animations: THREE.AnimationClip[];
  entities: Map<string, THREE.Object3D>;
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
- 既存compiler coreを使うRuntime JSON、Asset copy plan、diagnostics、provenance。
- `xrift create`を使うClassic template生成とatomic commit。
- `--dry-run`、`--update`、text／JSON report、衝突防止。
- `xrift-studio-runtime/three`のPrimitive、Model、Texture、Material、Light、static pose、Entity Map、animation収集。
- `xrift-studio-runtime/react-three-fiber`の`XriftWorld`／`XriftItem` adapter。
- Open Brush metadataと必要時だけの`three-icosa` loader。
- Runtime JSONからThree.js sceneを作るfixtureと、改変済みexportの更新拒否fixture。
- Visual Editor headerの「Classicへ書き出す」とOS folder picker。
- 既存Classic projectへ、Visual Project IDごとに分離したRuntime、Asset、接続componentを追加するflow。
- component追加、backup付きentry切替、npm dependency install、folder／VS Code／terminal／接続snippetの完了導線。

未完了:

- npmへの`xrift-studio`／`xrift-studio-runtime`公開。
- Audio、Particle、Collider physics、XRift固有ComponentのRuntime adapter完全対応。
- 任意の`xrift check`実行option。現行公式CLI contractを確認してから追加する。
- `.xriftpack`のpack／import。

未対応Componentを黙って完成扱いにせず、compile reportまたはruntime diagnosticsへ残す。

## Desktop Editorから既存Classicへ追加

Visual Editor headerの「Classicへ書き出す」は、OSのfolder pickerで同じ種別の既存Classic projectを選択する。CLIの新規project exportとは安全境界を分け、既存の`xrift.json`、thumbnail、手書きentryを既定では上書きしない。

```text
public/xrift-studio/<visual-project-id>/
  runtime.json
  assets/

src/xrift-studio/<visual-project-id>/
  Scene.tsx

.xrift-studio/exports/<visual-project-id>/
  export-manifest.json
  compiler-provenance.json
```

既定の「コンポーネントとして追加」は接続snippetを完了画面に残す。「エントリーを切り替える」は明示確認後だけ既存`World.tsx`／`Item.tsx`を管理領域へbackupして置き換える。npm projectでは固定allow-listのpackageを自動installし、pnpm／Yarn／Bunでは別lockfileを作らずdependency記録と既存package managerでのinstall案内までにする。

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
