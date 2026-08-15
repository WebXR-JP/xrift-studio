# Visual project を通常の XRift 開発へ書き出す

ビジュアルエディターで作った project JSON と Assets 一式を、新しい XRift Classic project へ安全に書き出すことができます。

## CLI での書き出し

最終的な npm 利用形は次のとおりです。

```bash
npx xrift-studio convert ./my-visual-project --to classic --out ./my-xrift-world
```

### 主なオプション

| オプション | 説明 |
| --- | --- |
| `--to classic` | 書き出し先の形式を指定します。 |
| `--out <path>` | 書き出し先のフォルダを指定します。 |
| `--dry-run` | 実際に書き出さずに内容を確認します。 |
| `--update` | 未改変の export を更新します。 |

### 機能

- 空フォルダへの書き出し
- 衝突検知
- dependency plan
- provenance（由来情報）

生成する Runtime JSON は `xrift-studio-runtime/three` または `xrift-studio-runtime/react-three-fiber` から読み込みます。

## エディターからの書き出し

現在は repository 内の開発版で、Visual Editor の header の **「Classic へ書き出す」** から既存 Classic project を選べます。

- 手書き entry を保つ component 追加
- backup 付き entry 切替
- dependency plan
- 完了後の folder／VS Code／terminal 導線

## 詳細

仕様と段階計画は [Visual Project Classic Export CLI](../VISUAL_PROJECT_MIGRATION_CLI.md) を参照してください。
