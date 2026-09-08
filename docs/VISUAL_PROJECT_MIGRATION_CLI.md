# Visual Project Classic Export CLI

最終更新: 2026-09-01

## 目的

XRift Studio のビジュアル編集のプロジェクトを、通常の XRift コード編集のプロジェクトへ一方向に書き出す。書き出すのは desktop の公開（Publish）が XRift へ送るものと同じ TypeScript / React Three Fiber のソースである。書き出し先は公式テンプレートの依存関係だけで `npm install` と `npm run dev` が通る。

コード編集の任意 React／JavaScript をビジュアル編集のプロジェクトへ逆変換しない。ビジュアル編集側の正本は `xrift-studio.project.json`、シーン、素材 Manifest、プレハブ、元データ asset である。コード編集側は書き出し後に独立して編集できる別 project とする。

非公式 community tool であることを明確にするため、npm package と JSON format には公式の `@xrift/*` namespace を使用しない。

- CLI／desktop: `xrift-studio`
- Runtime: `xrift-studio-runtime`
- Runtime JSON format: `xrift-studio.runtime`

package description には `Unofficial community tools for XRift. Not affiliated with the XRift project.` 相当の説明を入れる。

## コマンド

npm 公開後の利用形は次のとおりとする。

```bash
npx xrift-studio convert ../my-visual-world --to classic --out .
```

npm 公開前は、repository で build して同じ CLI を実行する。

```bash
pnpm cli:build
node dist/cli/xrift-studio.mjs convert ../my-visual-world --to classic --out ./classic-world --dry-run
```

対応 option:

| Option | 役割 |
| --- | --- |
| `<source>` | ビジュアル編集のプロジェクト root または `xrift-studio.project.json`。 |
| `--to classic` | 一方向のコード編集 export を選ぶ。 |
| `--out <directory>` | 新規のコード編集のプロジェクト出力先。 |
| `--dry-run` | 書き込まず、診断と生成予定を表示する。 |
| `--update` | 同じビジュアル編集のプロジェクトから生成した未改変 export だけを更新する。 |
| `--format text\|json` | 人向けまたは自動処理向けの report 形式。 |
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

desktop publish と CLI は別のシーン変換器を持たない。同じ `compileVisualProject()`、素材 copy plan、diagnostics、生成元の記録を利用する。

出力 mode は二つある。

| mode | 使う経路 | 生成物 |
| --- | --- | --- |
| `classic-jsx` | desktop Publish、`xrift-studio convert`、Editor からの既存コード編集追加 | シーン全体の JSX 開始ファイル、動作確認と同じ実行環境 module、スクリプト module。公式テンプレートの依存関係だけでビルドできる |
| `classic-runtime` | ブラウザ版アップロードの事前ビルド shell | `xrift-runtime.json` と `xrift-studio-runtime/react-three-fiber` を呼ぶ薄い adapter |

コード編集 export が `classic-jsx` を使うのは、`xrift-studio-runtime` が npm へ未公開だからである。`classic-runtime` の出力をコード編集のプロジェクトへ置くと `npm install` が E404 で止まる。`xrift dev` は module が見つからずに起動しない。書き出しは「書けたが動かない」状態を作らない。公開が `xrift check` でビルドしているのと同じ file 一式を置く。npm 公開後に `classic-runtime` をコード編集 export へ戻すかどうかは、その時点で決める。

編集用 JSON をそのまま公開物へ渡さない。`classic-jsx` は実行に必要なオブジェクト、位置・回転・大きさ、コンポーネント、素材 URL だけを JSX へ書く。`classic-runtime` は同じ内容を `xrift-runtime.json` へ正規化する。

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

`classic-runtime` が書く `xrift-runtime.json` の root contract:

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

`classic-runtime` の開始ファイルは薄い adapter にする。manifest は XRift の `baseUrl` から解決する。site root の絶対 path は書かない。

```tsx
import { useXRift } from "@xrift/world-components";
import { XriftWorld } from "xrift-studio-runtime/react-three-fiber";

export const World = () => {
  const { baseUrl } = useXRift();
  return <XriftWorld manifest={`${baseUrl}xrift-runtime.json`} />;
};
```

`package.json` には compiler plan が要求する正確な version を追加する。`@xrift/world-components` は Studio の動作確認と同じ版（`COMPILER_WORLD_COMPONENTS_PACKAGE_SPEC`）を使う。既存 range がその版へ届かない時だけ固定する。テキストを含む場合は `troika-three-text` を compiler plan から追加する。Open Brushを含む場合は `three-icosa` を compiler plan から追加する。

## Three.js API

`xrift-studio-runtime/three` は React を読み込まない独立開始ファイル point とする。

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

3Dモデルとテクスチャの独立取得は並列に行う。Open Brush renderer は対象 3Dモデルがある時だけ動的に読み込む。通常シーンの初期 bundle へ混ぜない。

## 安全性

- 入力 project、シーン、プレハブ、素材元データ、thumbnail は通常 file だけを許可する。absolute path、`..`、URL、symlink 経由の project 外参照は拒否する。
- 元データと output が同じ、または親子関係になる配置は拒否する。
- 初回は存在しない出力先または空 folder だけを許可する。`package.json`、`xrift.json`、その他 file がある folder へ混在させない。
- 一時 folder で template、Runtime JSON、素材、生成元の記録を完成させる。最後に同一 volume 内で出力先へ切り替える。
- `--update` は `export-manifest.json` の project ID、target kind、全 file path、SHA-256 が一致する未改変 export だけを更新する。
- コード編集側で追加、削除、変更した file が一つでもあれば `--update` を停止する。ビジュアル編集側へ変更を推測して戻さない。
- `xrift create` には固定した kind、固定 temporary project 名、`--skip-install -y` だけを渡す。ビジュアル編集 document の文字列を shell command へ連結しない。

## 現在の実装状態

repository 内で次が接続済みである。

- ビジュアル編集 document loader と schema validation。
- 既存 compiler core を使う `classic-jsx` 出力、素材 copy plan、デコーダー / フォントの同梱 plan、diagnostics、生成元の記録。スクリプト元データはビジュアル編集のプロジェクトから読む。module として出力する
- `xrift create` を使うコード編集 template 生成と atomic commit。
- `--dry-run`、`--update`、text／JSON report、衝突防止。
- `xrift-studio-runtime/three` の基本形状、3Dモデル、テクスチャ、マテリアル、ライト、static pose、オブジェクト Map、animation 収集。
- `xrift-studio-runtime/react-three-fiber` の `XriftWorld`／`XriftItem` adapter と、ワールドの直接衝突判定（box／メッシュ）を Rapier へ接続する physics adapter。
- 旧来の `xrift.spawn-point` を含む開始位置の公式 Context 接続と marker 収集（`XriftLoadResult.spawnPoints`）。
- 音源（Three 音声／PositionalAudio）とパーティクルの放出（bounded Points simulation）の Runtime adapter。
- Open Brush metadata と必要時だけの `three-icosa` loader。
- Runtime JSON から Three.js scene を作る fixture と、改変済み export の更新拒否 fixture。
- ビジュアルエディター header の「コード編集へ書き出す」と OS folder picker。
- 既存コード編集のプロジェクトへ、ビジュアル編集のプロジェクト ID ごとの `src/xrift-studio/<id>/` に生成 `src/` 一式を相対 import を保ったまま置く flow。素材、デコーダー、フォントは `public/` 直下。`Scene.tsx` から `XriftStudioScene` として公開する
- component 追加、backup 付き開始ファイル切替、不足 package だけの npm install、前回 export の残骸除去、folder／VS Code／terminal／接続 snippet の完了導線。
- fixture での検証: 生成 `src/` を export 配置へ移した状態でも公式 template の tsconfig で `tsc` が通ること（`pnpm cli:test` の `classic-export-relocated`）。

未完了:

- npm への `xrift-studio`／`xrift-studio-runtime` 公開。公開後も、コード編集 export を `classic-runtime` へ戻すかは別途判断する。
- `classic-runtime` 側の物理挙動／動的衝突判定、XRift 固有コンポーネントの Runtime adapter 完全対応。静的な直接衝突判定、開始位置、音声、パーティクルは対応済みである。未対応分は compile warning として残す。
- 任意の `xrift check` 実行 option。現行公式 CLI contract を確認してから追加する。
- `.xriftpack` の pack／import。

未対応コンポーネントを黙って完成扱いにしない。compile report または実行環境 diagnostics へ残す。

## Desktop Editorから既存コード編集へ追加

ビジュアルエディター header の「コード編集へ書き出す」は、OS の folder picker で同じ種別の既存コード編集のプロジェクトを選択する。CLI の新規 project export とは安全境界を分ける。既存の `xrift.json`、thumbnail、手書き開始ファイルは既定では上書きしない。

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

既定の「コンポーネントとして追加」は接続 snippet を完了画面に残す。「エントリーを切り替える」は明示確認後だけ実行する。既存 `World.tsx`／`Item.tsx` を管理領域へ backup して置き換える。置き換えた開始ファイルは `WorldProps`／`ItemProps` も再 export する。template の `src/index.tsx` が通るようにするためである。npm project では固定 allow-list の package を自動 install する。pnpm／Yarn／Bun では別 lockfile を作らない。dependency 記録と既存 package manager での install 案内までにする。以前の書き出しが `xrift-studio-runtime` を package.json へ記録していた場合は取り除く。完了画面で知らせる。

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

まず Runtime JSON contract と loader の互換性を固定する。その後に format／compiler を独立 package へ切り出す。package 分割後も desktop、CLI、Three.js、R3F が同じ Runtime JSON fixture を通ることを完了条件とする。
