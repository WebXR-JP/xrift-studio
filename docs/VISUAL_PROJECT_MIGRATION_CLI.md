# Visual Project Classic Export CLI

最終更新: 2026-09-01

## 目的

XRift Studio のビジュアルプロジェクトを、通常の XRift コードプロジェクトへ一方向に書き出す。デスクトップ版の公開で XRift へ送信するものと同じ TypeScript / React Three Fiber ソースを出力し、書き出し先では公式テンプレートの依存関係だけで `npm install` と `npm run dev` を実行できる。

コードプロジェクト側の任意の React / JavaScript コードをビジュアルプロジェクトへ逆変換することはしない。ビジュアル編集側の元データは `xrift-studio.project.json`、シーン、素材マニフェスト、プレハブ、元データアセットである。コードプロジェクト側は、書き出し後に独立して編集できる別プロジェクトとして扱う。

非公式のコミュニティツールであることを明確にするため、npm パッケージと JSON 形式には公式の `@xrift/*` 名前空間を使わない。

- CLI / デスクトップ: `xrift-studio`
- ランタイム: `xrift-studio-runtime`
- ランタイム JSON 形式: `xrift-studio.runtime`

パッケージの `description` には、`Unofficial community tools for XRift. Not affiliated with the XRift project.` に相当する説明を入れる。

## コマンド

npm 公開後の利用形式は次のとおり。

```bash
npx xrift-studio convert ../my-visual-world --to classic --out .
```

npm 公開前は、リポジトリでビルドして同じ CLI を実行する。

```bash
pnpm cli:build
node dist/cli/xrift-studio.mjs convert ../my-visual-world --to classic --out ./classic-world --dry-run
```

対応するオプションは次のとおり。

| オプション | 役割 |
| --- | --- |
| `<source>` | ビジュアルプロジェクトのルート、または `xrift-studio.project.json` のパス。 |
| `--to classic` | 一方向のコードプロジェクト書き出しを指定する。 |
| `--out <directory>` | 新規コードプロジェクトの出力先ディレクトリ。 |
| `--dry-run` | ファイルを書き込まず、診断情報と生成予定だけを表示する。 |
| `--update` | 同じビジュアルプロジェクトから生成された未改変の書き出し先だけを更新する。 |
| `--format text\|json` | 人間向けまたは自動処理向けのレポート形式を指定する。 |
| `--force` | 設けない。 |

## コンパイル境界

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

デスクトップ版の公開と CLI で別々のシーン変換器は持たない。どちらも同じ `compileVisualProject()`、素材コピープラン、診断情報、生成元の記録を使う。

出力モードは次の 2 つに分かれる。

| モード | 使う経路 | 生成物 |
| --- | --- | --- |
| `classic-jsx` | デスクトップ版の公開、`xrift-studio convert`、エディターからの既存コードプロジェクトへの追加 | シーン全体の JSX エントリーポイント、Play と同じランタイムモジュール、スクリプトモジュール。公式テンプレートの依存関係だけでビルドできる |
| `classic-runtime` | ブラウザ版アップロードの事前ビルド済みシェル | `xrift-runtime.json` と、`xrift-studio-runtime/react-three-fiber` を呼ぶ薄いアダプター |

コードプロジェクトの書き出しには `classic-jsx` を使う。`xrift-studio-runtime` は npm に未公開のため、`classic-runtime` の出力では `npm install` が E404 で止まり、`xrift dev` もモジュールが見つからず起動できない。公開時に `xrift check` でビルドするものと同じファイル一式を書き出す形をとる。npm 公開後にコードプロジェクト書き出しで `classic-runtime` を使うかは、その時点で改めて判断する。

編集用の JSON をそのまま公開物へ渡すことはしない。`classic-jsx` は実行に必要な Entity、Transform、Component、素材 URL だけを JSX として出力し、`classic-runtime` は同じ内容を `xrift-runtime.json` へ正規化する。

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

`classic-runtime` が出力する `xrift-runtime.json` のルート構造は次のとおり。

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

`classic-runtime` のエントリーファイルは薄いアダプターとして生成する。マニフェストは XRift の `baseUrl` から解決し、サイトルートの絶対パスは書かない。

```tsx
import { useXRift } from "@xrift/world-components";
import { XriftWorld } from "xrift-studio-runtime/react-three-fiber";

export const World = () => {
  const { baseUrl } = useXRift();
  return <XriftWorld manifest={`${baseUrl}xrift-runtime.json`} />;
};
```

`package.json` には、コンパイラプランが要求する正確なバージョンを追加する。`@xrift/world-components` は Studio の Play と同じバージョン（`COMPILER_WORLD_COMPONENTS_PACKAGE_SPEC`）を使い、既存のバージョン範囲がその版を満たさないときだけ固定する。テキストを含む場合は `troika-three-text`、Open Brush を含む場合は `three-icosa` をそれぞれコンパイラプランから追加する。

## Three.js API

`xrift-studio-runtime/three` は、React を読み込まない独立したエントリーポイントとして提供する。

```ts
import * as THREE from "three";
import { XriftThreeLoader } from "xrift-studio-runtime/three";

const scene = new THREE.Scene();
const loader = new XriftThreeLoader({ assetBaseUrl: "/xrift/" });
const result = await loader.load("/xrift/runtime.json");
scene.add(result.root);
```

戻り値の型は次のとおり。

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

3D モデルとテクスチャの独立取得は並列に実行する。Open Brush レンダラーは対象の 3D モデルがあるときだけ動的に読み込み、通常シーンの初期バンドルには含めない。

## 安全性

- 入力プロジェクト、シーン、プレハブ、素材の元データ、サムネイルは通常ファイルだけを許可する。絶対パス、`..`、URL、シンボリックリンク経由のプロジェクト外参照は拒否する。
- 入力元と出力先が同一、または親子関係になる配置は拒否する。
- 初回書き出しは存在しない出力先、または空のフォルダーだけを許可する。`package.json`、`xrift.json`、その他ファイルが残るフォルダーには混在させない。
- 一時フォルダー内でテンプレート、ランタイム JSON、素材、生成元の記録をすべて揃えてから、最後に同一ボリューム内で出力先へ切り替える。
- `--update` は、`export-manifest.json` のプロジェクト ID、対象種別、全ファイルパス、SHA-256 が一致する未改変の書き出し先だけを更新する。
- コードプロジェクト側で追加・削除・変更されたファイルが 1 つでもあれば `--update` を停止する。ビジュアル編集側へ変更を推測して逆反映することはしない。
- `xrift create` には固定の種別、固定の一時プロジェクト名、`--skip-install -y` だけを渡す。ビジュアルプロジェクト内の文字列をシェルコマンドへ連結しない。

## 現在の実装状態

リポジトリ内で接続済みの機能は次のとおり。

- ビジュアルプロジェクトのドキュメントローダーとスキーマ検証。
- 既存コンパイラコアを使った `classic-jsx` 出力、素材コピープラン、デコーダー / フォントの同梱プラン、診断情報、生成元の記録。スクリプトの元データはビジュアルプロジェクトから読み込み、モジュールとして出力する。
- `xrift create` を使ったコードプロジェクトテンプレート生成と、一時フォルダーからのアトミックな切り替え。
- `--dry-run`、`--update`、text / JSON レポート、衝突防止。
- `xrift-studio-runtime/three` の基本形状、3D モデル、テクスチャ、マテリアル、ライト、静的ポーズ、Entity マップ、アニメーション収集。
- `xrift-studio-runtime/react-three-fiber` の `XriftWorld` / `XriftItem` アダプターと、ワールドの直接衝突判定（Box / メッシュ）を Rapier へ接続する物理アダプター。
- 旧来の `xrift.spawn-point` を含む開始位置の公式コンテキスト接続とマーカー収集（`XriftLoadResult.spawnPoints`）。
- 音源（Three 音声 / `PositionalAudio`）とパーティクル放出（上限付き Points シミュレーション）のランタイムアダプター。
- Open Brush メタデータと、必要時のみ読み込む `three-icosa` ローダー。
- ランタイム JSON から Three.js シーンを構築するフィクスチャと、改変済み書き出しの更新を拒否するフィクスチャ。
- ビジュアルエディターのヘッダーにある「コード編集へ書き出す」と、OS のフォルダー選択ダイアログ。
- 既存コードプロジェクトの `src/xrift-studio/<id>/` に、ビジュアルプロジェクト ID ごとに生成した `src/` 一式を相対 import を保ったまま配置するフロー。素材、デコーダー、フォントは `public/` 直下へ置き、`Scene.tsx` から `XriftStudioScene` として公開する。
- コンポーネントとしての追加、バックアップ付きのエントリーポイント切り替え、不足パッケージだけの `npm install`、前回書き出しの残骸除去、完了後のフォルダー / VS Code / ターミナル / 接続用スニペットの案内。
- フィクスチャ検証: 生成 `src/` を書き出し先へ移した状態でも、公式テンプレートの `tsconfig` で `tsc` が通ること（`pnpm cli:test` の `classic-export-relocated`）。

未完了の項目は次のとおり。

- npm への `xrift-studio` / `xrift-studio-runtime` 公開。公開後にコードプロジェクト書き出しを `classic-runtime` へ切り替えるかは別途判断する。
- `classic-runtime` 側の動的物理挙動・動的衝突判定、および XRift 固有 Component のランタイムアダプター完全対応。静的な直接衝突判定、開始位置、音声、パーティクルは対応済みであり、未対応分はコンパイル警告として残す。
- 任意の `xrift check` 実行オプション。現行の公式 CLI 仕様を確認してから追加する。
- `.xriftpack` のパッケージ化と取り込み。

未対応の Component はコンパイルレポートまたはランタイムの診断情報に記録し、対応済みとは表示しない。

## デスクトップエディターから既存コードプロジェクトへ追加する

ビジュアルエディターのヘッダーにある「コード編集へ書き出す」では、OS のフォルダー選択ダイアログから同じ種別の既存コードプロジェクトを選ぶ。CLI の新規プロジェクト書き出しとは安全境界を分けており、既存の `xrift.json`、サムネイル、手書きのエントリーポイントは既定では上書きしない。

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

既定の「コンポーネントとして追加」では、完了画面に接続用のコードスニペットを残す。「エントリーを切り替える」は明示的な確認のあとでのみ実行し、既存の `World.tsx` / `Item.tsx` を管理領域へバックアップしてから置き換える。テンプレートの `src/index.tsx` が問題なくビルドできるよう、置き換えたエントリーポイントからは `WorldProps` / `ItemProps` も再エクスポートする。

npm プロジェクトでは、固定の許可リストに含まれるパッケージだけを自動インストールする。pnpm / Yarn / Bun のプロジェクトでは別のロックファイルを作らず、依存関係の記録と既存パッケージマネージャーでのインストール案内までにとどめる。以前の書き出しで `xrift-studio-runtime` が `package.json` に記録されていた場合は自動で取り除き、完了画面で通知する。

## 将来のパッケージ分離

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

まずランタイム JSON の仕様とローダーの互換性を固定し、その後に形式定義とコンパイラを独立パッケージへ切り出す。パッケージ分割後も、デスクトップ版、CLI、Three.js、R3F のすべてで同じランタイム JSON フィクスチャが通ることを完了条件とする。
