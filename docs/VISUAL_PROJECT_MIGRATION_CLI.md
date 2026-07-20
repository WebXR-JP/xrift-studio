# Visual Project Migration CLI

最終更新: 2026-07-21

## 目的

XRift StudioのVisual projectで作ったScene、Asset、Material、Prefab、設定を、通常のXRiftコードプロジェクトへワンコマンドで引き渡す。

Visual projectを使い捨ての試作データにせず、ビジュアル制作からコードでの仕上げへ移れる出口を作る。初期版はVisual projectとClassic projectを双方向同期するものではなく、Visualからコードへ安全に書き出す一方向のmigrationとする。

## 想定コマンド

```bash
npx @xrift/studio-cli migrate ./my-visual-project/xrift-studio.project.json --to ./my-xrift-world
```

project rootを渡す形も受け付ける。

```bash
npx @xrift/studio-cli migrate ./my-visual-project --to ./my-xrift-world
```

このコマンドは計画中であり、現時点のリポジトリでは実行できない。

## 入力と出力

### 入力

- `xrift-studio.project.json`、またはそれを含むVisual project root。
- Visual projectから参照されるScene、Asset、Prefab、source file一式。
- `--to`で指定する、WorldまたはItemの既存XRiftコードプロジェクト。

単一のScene JSONだけではAsset参照を解決できないため、manifestとproject rootの組み合わせを正規入力とする。

### 出力

- XRift向けに生成したReact／TSX component。
- project-relativeなModel、Texture、AudioなどのAsset copy。
- 生成したファイルと元document revisionを記録するmigration manifest。
- 追加、更新、skip、警告、blocking errorをまとめたreport。

初期版では生成物を次のmanaged領域にまとめる。

```text
src/generated/xrift-studio/
public/xrift-studio-assets/
.xrift-studio/migration.json
```

手書きの`src/World.tsx`または`src/Item.tsx`には、生成componentを読み込む最小の接続方法をreportで案内する。既定では手書きファイルを上書きしない。

## 安全性の原則

- 最初にread-onlyで入力、参照、target種別、出力予定を検査する。
- `--dry-run`で書込なしの計画を表示できる。初回は対話環境でもdry-runを案内する。
- project root外へ解決されるpath、絶対path、`..`によるescapeを拒否する。
- 既存ファイルとの衝突をblocking errorとして示し、既定では上書きしない。
- `--force`を使ってもmanaged領域外は上書きしない。
- Assetはhashで同一性を確認し、同じ入力の再実行で不要なcopyや差分を作らない。
- source projectは変更しない。target側の変更内容をreportとmanifestに残す。
- 途中で失敗した場合は、一時領域からのcommit前ならtargetを変更しない。

## 予定するオプション

| Option | 役割 |
| --- | --- |
| `<source>` | Visual project rootまたは`xrift-studio.project.json`。 |
| `--to <target>` | 既存XRiftコードプロジェクト。 |
| `--dry-run` | 書き込まずに検査とcopy／生成計画だけを表示する。 |
| `--format text\|json` | 人向けまたは自動化向けのreport形式。 |
| `--scene <id>` | 複数Sceneから書き出す対象を限定する。 |
| `--force` | managed領域内の衝突だけを明示的に更新する。 |

`--write`を追加するか、dry-runを明示optionにするかは、Phase 1の利用テスト後に決める。安全側の既定値を優先する。

## 実装ロードマップ

### Phase 1: Validatorとexport plan

- Visual documentの既存serialization／reference validation／compilerをUIから分離して再利用する。
- sourceとtargetをread-onlyで読み、targetがWorldかItemかを判定する。
- 生成ファイル、Asset copy、警告、blocking errorを決定的なJSON planとして返す。
- fixtureでpath escape、欠落Asset、種別不一致、同名衝突を検証する。

完了条件: `--dry-run --format json`が、同じ入力から常に同じ意味のplanを返す。

### Phase 2: Managed write

- 一時directoryへ生成後、検査に通った一式だけをtargetへ反映する。
- `src/generated/xrift-studio`と`public/xrift-studio-assets`へ限定して書き込む。
- `.xrift-studio/migration.json`へsource revision、hash、生成先、CLI versionを保存する。
- text reportで、手書きentry pointから生成componentへ接続する手順を示す。

完了条件: 失敗途中の部分書込がなく、targetがtypecheck可能な状態になる。

### Phase 3: Updateと差分

- 前回manifestを使い、追加、更新、削除候補、利用者変更済みfileを区別する。
- 利用者が変更した生成fileは自動上書きせず、conflictとして示す。
- renameやAsset hash一致を検出し、不要なduplicateを避ける。

完了条件: 同じsourceを再実行した時は差分ゼロになり、source変更時は必要な差分だけを生成する。

### Phase 4: npm packageとCI

- `@xrift/studio-cli`として公開できる独立packageにする。
- Node.js 20以上、Windows／macOS／Linuxで同じplanを作る。
- sample Visual projectからsample XRift World／Itemへ移植するend-to-end fixtureをCIで実行する。
- README、Studio内のExport導線、CLIのhelpを同じ用語に揃える。

完了条件: npmに公開したversionを`npx`で取得し、cleanなXRift projectへ移植できる。

## 初期版で行わないこと

- Classic projectからVisual projectへの逆import。
- Visual projectと手書きコードの常時双方向同期。
- 任意のReact codeを解析してScene documentへ戻すこと。
- Unity固有ScriptやShaderの完全再現。
- VRM animation timelineの編集。timelineはVisual document側で別途実装し、安定したclip contractを後からCLIへ接続する。

## CLI実装前に固定する契約

1. Visual project root、manifest、Scene、Asset sourceのpath規則。
2. compilerが返す生成fileとcopy planのschema。
3. World／Item targetの判定方法と対応するentry component。
4. managed領域と手書き領域の境界。
5. migration manifestのversioningと再実行時の差分規則。
6. static bone／shape key pose、Audio、Open Brush、将来のanimation clipを生成コードへ渡すcontract。
