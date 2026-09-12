# プロジェクトの受け渡し形式

XRift Studioのプロジェクトは、`.xriftstudio` ファイルにまとめて受け渡す。iPadのブラウザ版、デスクトップ版、MCPの `export_project` は同じ拡張子を使う。既存のZIPとpackage manifestをそのまま利用し、編集用documentの形式は変更しない。

## 拡張子と互換性

| 項目 | 仕様 |
| --- | --- |
| 書き出すファイル名 | `プロジェクト名.xriftstudio` |
| 取り込める拡張子 | `.xriftstudio`、従来の `.zip` |
| 内部形式 | ZIP。プロジェクト直下、または一つのフォルダーの中にプロジェクトを格納する |
| ブラウザの対象 | ビジュアルエディターのプロジェクト |
| デスクトップ・MCPの対象 | ビジュアルエディターとコードエディターのプロジェクト |

拡張子はXRift Studioのプロジェクトだと見分けるために使う。取り込み時はZIPの内容、パス、容量、プロジェクト定義を検証する。package manifestのない従来のZIPも対象とし、拡張子だけで有効なプロジェクトと判定しない。

## パッケージの内容

ビジュアルプロジェクトには `xrift-studio.project.json`、全シーン、Assets、Prefab、取り込んだ素材を含む。コードプロジェクトは `xrift.json` を含む既存のプロジェクト構成を保つ。`node_modules`、`.git`、`dist`、キャッシュ、公開記録のsidecarは書き出しに含めない。

`.xrift-studio/package-manifest.json` は既存の次の情報を保つ。

| キー | 内容 |
| --- | --- |
| `format` | `xrift-studio-package` |
| `formatVersion` | `1` |
| `files` | 格納ファイルの `path`、バイト数の `size`、`sha256` |
| `studioVersion` | デスクトップ版が記録するStudioのバージョン |

`files` はpackage manifest自身を除く格納ファイルの一覧で、信頼性の署名や取り込みの許可条件ではない。書き出すたびに、実際に格納するバイト列から作り直す。

取り込み先では新しい `projectId` を付け、`lastPublication` と公開記録を引き継がない。受け取った作品を公開しても元のワールドを上書きしない。

## 操作と容量

デスクトップ版のカードでは「.xriftstudioファイルに書き出す」「ファイルから取り込む」と案内する。ブラウザでは「プロジェクトを書き出す」で保存し、「開く」から「ファイルを選ぶ」で取り込む。iPadで保存した `.xriftstudio` をMacまたはWindowsへ渡し、アプリ内から取り込んで公開する。OSのファイル関連付けや、ダブルクリックによるアプリの起動・取り込みは今回の変更に含めない。

ブラウザではファイル本体と展開後のデータを256 MB以下、ファイル数をpackage manifest込みで20,000以下に制限する。書き出しはメモリー負荷を抑えるためZIPのSTORE方式を使い、取り込みは従来のDeflateにも対応する。

利用手順は[iPadの案内](./guide/ipad.md)、画面の状態遷移は[F-44](./ux/app.md#f-44)と[F-45](./ux/publishing.md#f-45)、MCPの契約は[編集ツール](./MCP_EDITOR_TOOLS.md#project-12)を参照する。
