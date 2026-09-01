# Visual project を通常の XRift 開発へ書き出す

ビジュアルエディターで作った project JSON と Assets 一式を、XRift の通常のコードプロジェクト（Classic）へ書き出せます。ビジュアル制作で組んだシーンを、そのままコードから続きを作れる形に移すための機能です。

書き出されるのは、公開時に XRift へ送っているものと同じ TypeScript / React Three Fiber のソースです。書き出し先は公式テンプレートが持つ依存関係だけでビルドでき、`npm install` と `npm run dev` でそのまま開いて確認できます。

書き出しは**一方向**です。書き出した先を編集しても、元のビジュアルプロジェクトへは戻りません。

## エディターから書き出す

ビジュアルエディターのヘッダーにある **Classic へ書き出す** を押します。

1. 書き出し先の Classic project をフォルダー選択で指定します。同じ種別（ワールド／アイテム）である必要があります。
2. 追加される内容と、必要な依存パッケージの一覧を確認します。
3. 実行すると、Visual Project ID ごとの領域へ Scene のソース、接続コード、由来情報が追加され、Asset はワールド直下へ置かれます。
4. 完了後は、フォルダー、VS Code、ターミナル、接続用スニペットへそのまま進めます。

既存の `xrift.json`、サムネイル、entry ファイルは既定では変更しません。entry を切り替える場合はバックアップと明示的な確認を求めます。手書きのコードを黙って上書きすることはありません。

同じ Visual project を再度書き出すと、前回書き出したファイルのうち今回生成しなかったものは取り除かれます。手書きのファイルと entry のバックアップには触れません。

## CLI で書き出す

新しい空のフォルダーへ Classic project ごと書き出す場合は CLI を使います。

```bash
xrift-studio convert ./my-visual-project --to classic --out ./my-xrift-world
```

| オプション | 説明 |
| --- | --- |
| `--to classic` | 書き出し先の形式を指定します。 |
| `--out <path>` | 書き出し先のフォルダーを指定します。空のフォルダーが必要です。 |
| `--dry-run` | 書き込まずに、診断と生成予定の内容だけを表示します。 |
| `--update` | 同じ Visual project から生成した、未改変の書き出しだけを更新します。 |

`--update` は、書き出し後に Classic 側でファイルを追加・削除・変更していない場合だけ実行できます。編集済みの書き出し先を上書きすることはありません。

CLI は npm 公開前のため、リポジトリからビルドして実行します。

```bash
pnpm cli:build
node dist/cli/xrift-studio.mjs convert ./my-visual-project --to classic --out ./my-xrift-world
cd ./my-xrift-world
npm install
npm run dev
```

## 書き出されるもの

- `src/World.tsx` または `src/Item.tsx`: Scene 全体を React Three Fiber の JSX として書いたソース。エディターから既存 project へ追加する場合は `src/xrift-studio/<project-id>/` の下に置き、`Scene.tsx` から `XriftStudioScene` として読み込めます
- `src/xrift-studio/*.ts(x)`: 生成コードが使う Light、Audio、Particle、Text、Script、Interactivity のランタイム。Studio の Play と同じ実装です
- `src/scripts/*.ts(x)`: Script Asset を静的 import できる module にしたもの
- Asset 一式: Model、Texture、Audio などの実ファイル。ワールド直下（`public/`）へ `xrift-studio-` を先頭に付けた名前で置きます
- decoder と font: KTX2 変換ファイル、Draco デコーダー、Text の書体。公開したワールドが CDN を必要としないよう同梱します
- `package.json` の依存関係: `@xrift/world-components` の版と、Text（troika-three-text）や Open Brush（three-icosa）が必要とするパッケージ
- `.xrift-studio/export-manifest.json`: 由来とハッシュ。`--update` の判定に使います

## 書き出さないもの

- 書き出し先で加えた変更を、ビジュアルプロジェクトへ戻す同期
- `xrift-studio-runtime` npm package への依存。同 package は未公開のため、書き出し先が npm から取得するものには含めません

## 詳細

仕様は [Visual Project Classic Export CLI](../VISUAL_PROJECT_MIGRATION_CLI.md) を参照してください。

## 次のステップ

- [XRift への公開（アップロード）](./publishing.md)
- [ビジュアルエディターの概要](./visual-editor.md)
