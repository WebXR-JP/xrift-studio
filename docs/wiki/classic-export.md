# Visual project を通常の XRift 開発へ書き出す

ビジュアルエディターで作った project JSON と Assets 一式を、XRift の通常のコードプロジェクト（Classic）へ書き出せます。ビジュアル制作で組んだシーンを、そのままコードから続きを作れる形に移すための機能です。

書き出しは**一方向**です。書き出した先を編集しても、元のビジュアルプロジェクトへは戻りません。

## エディターから書き出す

ビジュアルエディターのヘッダーにある **Classic へ書き出す** を押します。

1. 書き出し先の Classic project をフォルダー選択で指定します。同じ種別（ワールド／アイテム）である必要があります。
2. 追加される内容と、必要な依存パッケージの一覧を確認します。
3. 実行すると、Visual Project ID ごとの領域へ Runtime、Asset、接続コード、由来情報が追加されます。
4. 完了後は、フォルダー、VS Code、ターミナル、接続用スニペットへそのまま進めます。

既存の `xrift.json`、サムネイル、entry ファイルは既定では変更しません。entry を切り替える場合はバックアップと明示的な確認を求めます。手書きのコードを黙って上書きすることはありません。

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
```

## 書き出されるもの

- `public/xrift/runtime.json`: 実行に必要な Scene、Entity、Transform、Component、Asset URL を持つ Runtime JSON
- Asset 一式: Model、Texture、Audio などの実ファイル
- 薄い adapter: `xrift-studio-runtime/three` または `xrift-studio-runtime/react-three-fiber` から Runtime JSON を読み込む
- `.xrift-studio/export-manifest.json`: 由来とハッシュ。`--update` の判定に使います

素の Three.js から使う場合は `xrift-studio-runtime/three` だけを import できます。React や CLI をバンドルへ含める必要はありません。

## 書き出さないもの

- 書き出し先で加えた変更を、ビジュアルプロジェクトへ戻す同期
- Runtime JSON で表現できない Script。Script を含むプロジェクトは書き出し前に診断で止まります

## 詳細

仕様は [Visual Project Classic Export CLI](../VISUAL_PROJECT_MIGRATION_CLI.md) を参照してください。

## 次のステップ

- [XRift への公開（アップロード）](./publishing.md)
- [ビジュアルエディターの概要](./visual-editor.md)
