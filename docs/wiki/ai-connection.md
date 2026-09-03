# AI と一緒に Scene を編集する

ビジュアルエディターの **AI connection** パネルを使うと、AI クライアント（Codex、Claude Code、Claude Desktop / Cowork、OpenCode、Cursor）をアプリから登録し、開いている Scene の読取・設定変更・Asset 配置を限定 MCP tool で行えます。

## 対応している AI クライアント

- Codex
- Claude Code
- Claude Desktop / Cowork
- OpenCode
- Cursor

## セットアップ

1. ビジュアルエディターの **AI connection** パネルを開きます。
2. インストール済みの AI クライアントを検出します。
3. 使いたいクライアントを登録します。必要なら **Ollama** のローカル model で Codex、Claude Code、OpenCode を構成できます。
4. 登録後に AI クライアントを再起動するか、MCP を再読み込みします。

## できること

登録後、AI クライアントから次のような操作ができます。

- 開いている Scene の読取
- Entity の更新
- Asset の配置
- その他、許可された Editor tool

## 良いワールドを作ってもらう頼み方

AI は指示が少ないと、草原の地形と木から作り始めがちです。Studio の MCP には「先に短い設計図を
書いてから作る」手順が組み込まれていますが、頼み方でも仕上がりが変わります。

- 求める品質を言葉にする。「とにかく高品質に」「軽さ優先で」で、AI が使う手段の重さが変わります。
- 場所ではなく、そこで何をするかを伝える。「森を作って」より「夜、友人 4 人で焚き火を囲んで話す広場。木は少なめ」。
- 入れたくないものを先に言う。「地形と草は使わない」「屋内だけ」。
- 完了の条件を言う。「スポーン位置からのスクリーンショットを撮って見せて」。
- AI が最初に出す設計図 (誰が来て何をする場所か、雰囲気、床の種類、主役、入れないもの) を読んで、違えばその場で直す。AI は途中で許可を求めずに 1 本を作り切るので、直すならこの時点が早い。
- 木や小物の質を上げたいときは、Blender を起動して MCP を接続しておく。AI は木を生成して置き換える。

## 注意点

- 複数のクライアントから同時操作された場合は編集を直列化し、混雑時は `EDITOR_BUSY` を返して最新の Scene revision から安全に再試行できます。
- Claude Desktop / Cowork はローカル session で利用できます。remote Cowork ではローカル MCP server を起動できません。
- 構成時に model の tool calling 対応を再確認します。model download や client の自動起動は行いません。
