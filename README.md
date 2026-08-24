# XRift Studio

XRift Studio は、[XRift](https://xrift.net/) のワールドとアイテムの制作を始めるための、非公式デスクトップアプリです。

Node.js や `@xrift/cli` の導入、コードまたはビジュアルエディターによる制作、ローカルプレビュー、XRift への公開までをひとつの画面にまとめます。

> **注意**: XRift Studio は XRift 公式とは無関係の有志製ツールです。XRift 本体・公式 CLI・アカウントについては、[XRift 公式サイト](https://xrift.net/)をご確認ください。

## 対応機能チェックリスト

現行のデスクトップ版で利用できる機能を、制作の流れに沿ってまとめています。

| やりたいこと | ワールド | アイテム | 現在できること |
| --- | --- | --- | --- |
| 制作環境を準備する | 対応 | 対応 | アプリ専用領域へ Node.js と `@xrift/cli` をセットアップする。システム側の環境と分けて管理できる。 |
| CLI を最新にする | 対応 | 対応 | 起動時に現在と最新のバージョンを確認し、アプリが管理する CLI だけを更新する。 |
| XRift Studio 本体を最新にする | 対応 | 対応 | 起動時または About から署名済み更新を確認し、更新内容と進捗を見ながらインストールして再起動する。 |
| プロジェクトを探して再開する | 対応 | 対応 | 種別、サムネイル、名前、説明をカードで一覧表示し、選んだプロジェクトを開く。 |
| 新しいプロジェクトを作る | 対応 | 対応 | ワールド／アイテムと、クラシック／ビジュアルの4通りから選び、作成後のプロジェクトをそのまま開く。 |
| コードと設定を編集する | 対応 | 対応 | 内蔵エディタでテキストファイルを編集・保存する。`xrift.json` はフォームと raw JSON の両方で編集できる。 |
| シーンをビジュアル編集する | 対応 | 対応 | Hierarchy、Scene View、Inspector、Assetsを使い、Primitive、Model、Prefab、XRift Componentを配置してギズモで調整する。 |
| 3D素材を取り込む | 対応 | 対応 | GLB／glTF、OBJ、VRM 0.x／1.xをModel Assetとして取り込む。sidecarを参照するglTF／OBJは、依存ファイルを一緒にdropすると自己完結GLBへ正規化する。Open Brush／Tilt Brush由来のglTFは専用表示を検証中。 |
| Unity素材を引き継ぐ | 検証中 | 検証中 | UnityPackage、`.unity`、`.prefab`を解析し、対応するScene、Prefab、Model、Textureへ変換する。 |
| アバターの見た目を保存する | 対応 | 対応 | ボーンのXYZ回転とshape keyの値をEntityごとに保存し、Scene ViewとXRift向け生成コードへ反映する。timeline animationは今後対応する。 |
| アセットと表現を作る | 対応 | 対応 | Texture、Material、Particle、PrefabをAssetsで管理し、Inspectorから編集する。PNG、JPG、WebP、KTX2に対応する。 |
| 音を配置する | 対応 | 対応 | MP3をAudio Assetとして取り込み、Audio Sourceへ割り当てて保存・変換する。 |
| 衝突判定を設定する | 対応 | 対応 | PrimitiveにはBox Collider、インポートModelにはMesh Colliderを初期設定し、Center／Half Extentsの編集と自動フィットを行う。 |
| 地形をつくる | 対応 | 対応 | Createメニューから高さサンプルTerrainを追加し、盛り上げる、掘る、高さを設定、滑らかにする、穴を開けるブラシで編集する。Scene View、static Trimesh Collider、生成コードで同じ三角形を使う。 |
| 草を生やす | 対応 | 対応 | Terrainへ草の層を重ね、ブラシで塗って生やす・消す。Scene設定のWindで揺れる。 |
| 空と水をつくる | 対応 | 対応 | GLSLで描く空Shaderと水面Materialを公式カタログから追加し、Uniform valuesで調整する。どちらもScene設定のWindとLightを共通入力にする。 |
| 光と色味を整える | 対応 | 対応 | Directional／Point／Spot／AreaのLightを配置して色、強度、影、距離を設定する。露出やコントラストなどの色味は一つのcompositorで調整する。既定はオフ。 |
| 外部の素材を取り込む | 対応 | 対応 | Poly HavenとambientCGのCC0素材、XRift公式のShader、Terrain、照明、Componentをアプリ内から追加する。作者とライセンスはAssetと公開物へ残す。 |
| 同じ構成を再利用する | 対応 | 対応 | Entityと子階層をPrefab Assetとして保存し、何度でも配置する。配置ごとの差分はoverrideとして保持する。 |
| ノードで動きをつける | 対応 | 対応 | KHR_interactivity準拠のグラフをノードエディターで編集し、開始時・毎フレーム・イベント受信をきっかけに色や再生を動かす。クリックや視線に反応するトリガーはない。 |
| Entityに振る舞いを与える | 対応 | 対応 | Script AssetをTypeScriptで書き、Script ComponentとしてEntityへ付けてPlayで実行する。未承認のsourceは内容hashを確認してから実行し、同じScriptを公開ワールドへ静的importとして出力する。対応範囲は[Scripting Contract](./docs/SCRIPTING.md)にまとめている。 |
| Editor内でPlay確認する | 対応 | 対応 | 編集状態を保持したままPlayへ切り替え、ワールドではWASD操作、アイテムでは周囲からの見え方を確認する。 |
| 画像や 3D 素材を管理する | 対応 | 対応 | ファイルの追加、名前変更、削除、画像プレビュー、3D モデルプレビューを行う。 |
| 公開情報を整える | 対応 | 対応 | タイトル、説明、ビルド設定、サムネイルを編集する。ワールドでは物理・カメラ、アイテムでは権限も設定できる。 |
| ローカルで動作を確認する | 対応 | 対応 | 開発サーバーを起動・停止し、プレビュー URL をブラウザで開く。実行ログも同じ画面で確認する。 |
| アイテムを検査する | 該当なし | 対応 | ビルドを含むセキュリティチェックを実行し、結果と修正に必要なログを確認する。 |
| XRift に公開する | 対応 | 対応 | ログイン後、タイトル・説明・サムネイルを確認する。ビジュアル制作データは保存・検査・XRift向けTSX変換を行ってから種別に応じてアップロードする。 |
| 公開前に容量を見積もる | 対応 | 対応 | 初回ロード容量と回線別の時間、Assetと実行時VRAMの目安を確認し、resize、KTX2、Dracoを選んで適用してから同じ確認画面へ戻る。 |
| 公開したものを確認する | 対応 | 対応 | アップロード後にworldId／itemId、version、content hashを表示する。公式の結果がURLを返した場合はそのページを開く。審査中を公開済みとしては表示しない。 |
| AIと一緒にSceneを編集する | 検証中 | 検証中 | Codex、Claude Code、Claude Desktop / Cowork、OpenCode、Cursorをアプリから登録し、必要ならOllamaのローカルmodelでCodex、Claude Code、OpenCodeを構成する。開いているSceneの読取・設定変更・Asset配置を限定MCP toolで行う。 |
| 外部ツールで作業を続ける | 対応 | 対応 | プロジェクトをVS Codeまたはターミナルで開く。開発版CLIはVisual projectをRuntime JSON付きClassic projectへ一方向に書き出せる。 |

`対応` はデスクトップ版の主要導線で操作できること、`検証中` は実装済みの範囲を実データや配布環境で確認していることを示します。ブラウザ版は制作フローを確認するためのWebプレビューであり、ログイン、ローカルファイル操作、CLI実行、アップロードは行いません。

現在の制約と次の完了条件は[Visual Editor Roadmap](./docs/VISUAL_EDITOR_ROADMAP.md)にまとめています。disk上のMTL／Textureの自動探索、VRMのanimation timeline、Unity固有機能の完全互換は現時点では未対応です。

## Visual projectを通常のXRift開発へ書き出す

Visual Editorで作ったproject JSONとAssets一式を、XRift Classic projectへ一方向に書き出せます。

Visual Editor headerの「Classicへ書き出す」からは、既存のClassic projectを選んで追加できます。手書きentryを保つcomponent追加、backup付きentry切替、dependency plan、完了後のfolder／VS Code／terminal導線を用意しています。

新しい空のfolderへ書き出す場合はCLIを使います。`--dry-run`、未改変exportの`--update`、衝突検知、provenanceを利用できます。

```bash
xrift-studio convert ./my-visual-project --to classic --out ./my-xrift-world
```

CLIはnpm公開前のため、`pnpm cli:build`でビルドして`node dist/cli/xrift-studio.mjs`から実行します。生成するRuntime JSONは`xrift-studio-runtime/three`または`xrift-studio-runtime/react-three-fiber`から読み込みます。仕様とRuntime Componentの対応範囲は[Visual Project Classic Export CLI](./docs/VISUAL_PROJECT_MIGRATION_CLI.md)を参照してください。

## 体験設計

XRift Studio は、制作の途中で「次に何をすればよいか」を考え直させないことを大切にします。更新、作成、起動、公開の各操作では、現在の状態、次にできる行動、完了後の到達点を同じ画面の流れで伝えます。

- 新しいアプリ本体と CLI は起動時に検知し、現在と最新のバージョンを示したうえでそれぞれ更新できる。
- 作成前にワールドまたはアイテムを選べ、作成後は結果のプロジェクトをそのまま開ける。実行後は、起動中の URL をすぐ開ける。
- アップロード前には、タイトル、説明、サムネイルが初期状態のままではないことを確認し、必要な編集から公開までをつなげる。
- プロジェクトライブラリは、サムネイル、名前、説明、件数、作成入口を一望できる制作のホームとして扱う。
- 進行中・成功・失敗を明示し、失敗した場合でもログや元の画面からやり直せるようにする。

詳細な原則と実装時の確認項目は [UX 原則](./docs/UX_PRINCIPLES.md) を参照してください。状態ごとの動きと機能一覧は [マイクロインタラクション Wiki](./docs/UX_INTERACTIONS.md) にまとめています。リポジトリの Markdown 文書では絵文字を使わず、操作名と状態を日本語で明確に書きます。

## まずはブラウザで見る

[**GitHub Pages の Web プレビューを開く →**](https://webxr-jp.github.io/xrift-studio/)

ブラウザ版では、ワールドとアイテムを選べる制作フロー、コード編集画面、3Dプレビューに加え、ビジュアルエディターのデモを確認できます。実際のログイン、ローカルファイル操作、CLI実行、XRiftへの公開はデスクトップ版の機能です。

## ダウンロード

[**最新版を GitHub Releases からダウンロード →**](https://github.com/WebXR-JP/xrift-studio/releases/latest)

| 対応 OS | 配布形式 |
| --- | --- |
| Windows 10 / 11 | `.msi`（推奨）、`.exe` |
| macOS 12 以降 | `.dmg`（Apple Silicon / Intel） |
| Linux | `.deb`、`.rpm`、`.AppImage` |

リリースがまだない場合は、[Web プレビュー](https://webxr-jp.github.io/xrift-studio/)またはソースからの開発環境をご利用ください。

## はじめて使う

1. アプリを起動します。
2. セットアップ画面で **セットアップを開始** を押します。
3. アプリ専用フォルダに Node.js と `@xrift/cli` が準備されるまで待ちます。
4. プロジェクトライブラリで **新規プロジェクト** を選び、ワールド／アイテムとクラシック／ビジュアルを選びます。
5. クラシックではコードを編集し、ビジュアルではAssetsからSceneへ素材を配置してInspectorで設定します。
6. `Ctrl/⌘ + S` で保存し、**実行** または **Play** で動作を確認します。
7. 準備ができたら **アップロード** で保存・検査・変換を行い、XRift に公開します。

システムにインストール済みの Node.js、npm、`@xrift/cli` は原則として使用しません。アプリ内ランタイムはアプリ専用領域に隔離されます。

## `@xrift/cli` の更新

アプリは起動時に CLI の最新版を確認し、新しいバージョンがあれば通知します。ダイアログの **アップデート** を押すと、アプリが管理する CLI だけを更新します。

## XRift Studio 本体の更新

アプリは起動時に [GitHub Releases](https://github.com/WebXR-JP/xrift-studio/releases/latest) の最新版を確認します。新しいバージョンがある場合は、署名済みの更新をアプリ内でダウンロードし、インストール後に自動で再起動できます。設定画面の **更新を確認** から手動でも確認できます。

## データとリセット

アプリのランタイム、キャッシュ、ログイン情報、プロジェクトは次の場所に保存されます。

| OS | 保存場所 |
| --- | --- |
| Windows | `%APPDATA%\\net.xrift.studio\\` |
| macOS | `~/Library/Application Support/net.xrift.studio/` |
| Linux | `~/.local/share/net.xrift.studio/` |

About の **Danger Zone** から、次のリセットを実行できます。

- **ランタイムのみ**: Node.js、CLI、キャッシュ、ログイン状態を削除します。プロジェクトは残ります。
- **プロジェクトのみ**: アプリが管理するプロジェクトを削除します。
- **完全リセット**: 上記のランタイムとプロジェクトをすべて削除します。

リセット前に、残したいワールドやアイテムを別の場所へバックアップしてください。

## 開発者向け

### 必要な環境

- Node.js 20 以上
- pnpm 11 以上
- Rust stable と Cargo
- Windows 10/11、macOS 12 以降、または Linux
- Windows では Microsoft C++ Build Tools と WebView2 Runtime

詳細な OS 別セットアップは [DEVELOPMENT.md](./DEVELOPMENT.md) を参照してください。

### セットアップと起動

```bash
pnpm install
pnpm tauri:dev
```

ブラウザ版だけを起動する場合は、次のコマンドを使います。

```bash
pnpm dev
```

### よく使うコマンド

| コマンド | 用途 |
| --- | --- |
| `pnpm typecheck` | TypeScript の型チェック |
| `pnpm build` | Tauri 用フロントエンドの本番ビルド |
| `pnpm tauri:build` | OS 向けインストーラのビルド |
| `pnpm build:preview` | GitHub Pages 用 Web プレビューのビルド |
| `pnpm tauri:dev` | Tauri デスクトップ開発 |

### AI connection／Tauri MCPを使う

ビジュアルエディターのAI connection panelは、インストール済みのCodex、Claude Code、Claude Desktop / Cowork、OpenCode、Cursorを検出し、XRift Studio MCP serverを登録できます。Ollamaがある場合はローカルmodelとCodex、Claude Code、OpenCodeのいずれかを選び、XRift MCP登録とOllama provider構成を一操作で行えます。構成時にmodelのtool calling対応を再確認し、model downloadやclientの自動起動は行いません。登録後にAI clientを再起動またはMCPを再読み込みすると、開いているSceneの読取、Entity更新、Asset配置など、許可されたEditor toolを利用できます。複数clientから同時操作された場合は編集を直列化し、混雑時は`EDITOR_BUSY`を返して最新のScene revisionから安全に再試行できます。Claude Desktop / Coworkはローカルsessionで利用でき、remote CoworkではローカルMCP serverを起動できません。

MCP serverはTauri側のbrokerを介して現在開いているEditorへ接続します。request size、tool名、timeoutを制限し、Editorが待機していない時は操作を受け付けません。配布時は`pnpm mcp:sidecar:prepare:release`でserver binaryを準備し、Tauri sidecarとして同梱します。

開発中の画面調査には従来のTauri Bridgeも利用できます。`pnpm tauri:dev`でデバッグ版を起動し、`.mcp.json`の`tauri`設定をMCP対応clientから読み込みます。Tauri Bridgeはデバッグビルド専用です。エージェント向けの実装ルールは[AGENT.md](./AGENT.md)にまとめています。

画面をスクリーンショットで確認しながら開発する手順は[MCP画面デバッグガイド](./docs/MCP_DEBUGGING.md)にまとめています。Codexはリポジトリの`.mcp.json`をそのまま使えます。DeepSeekなど別のMCP hostでは、`pnpm mcp:debug-config`で生成した設定を追加してください。

### リポジトリ構成

```text
src/                       React フロントエンド
  App.tsx                  デスクトップ版のメイン画面
  components/              画面コンポーネント
    visual-editor/         Hierarchy、Scene、Inspector、Assets、Play、Upload
  lib/                     Tauri IPC と CLI のラッパー
    visual-editor/         Scene/Asset/Prefab IR、履歴、検査、XRift向けcompiler
  PreviewApp.tsx           GitHub Pages 用のブラウザプレビュー
src-tauri/                 Tauri v2 / Rust バックエンド
  src/lib.rs               ランタイム、ファイル、IPC コマンド
  src/mcp.rs               AI client登録、MCP broker、sidecar起動
  capabilities/            Tauri 権限設定
  tauri.conf.json          Tauri アプリ設定
scripts/prepare-mcp-sidecar.mjs    MCP sidecarの開発／配布準備
.github/workflows/         Pages とリリースの自動化
AGENT.md                   AI エージェント向け開発ルール
DEVELOPMENT.md             OS 別の開発・リリース手順
docs/README.md             文書全体の地図。最初に読む順序もここ
docs/VISUAL_EDITOR_ARCHITECTURE.md 設計の正本。データ・実行境界・変換
docs/VISUAL_EDITOR_ROADMAP.md      対応範囲、設計上の境界、段階と完了判定
docs/UX_PRINCIPLES.md      再現可能な制作体験の設計原則
docs/UX_INTERACTIONS.md    状態ごとの動きと機能一覧を定義する Wiki
docs/wiki/                 利用者向けの使い方ガイド。GitHub Pages でも配布
docs/history/              日付ごとの監査・調査・計画の記録。現在の設計ではない
.agents/skills/            XRift Studio の実装・UX・検証に使うエージェントスキル
```

## トラブルシューティング

### セットアップに失敗する

ネットワーク接続を確認し、アプリを再起動して再試行してください。それでも直らない場合は About の Danger Zone から **ランタイムのみリセット** を実行します。

### プレビューが開かない

プロジェクトを保存してから再度 **実行** を押してください。ターミナルを開き、プロジェクトの開発サーバーのログを確認することもできます。

### Issueを相談する

[Issue相談GPTの設定と使い方](./docs/BUG_REPORT_GPT.md)では、バグ報告と機能要望を相談しながら、Issueの下書きを作る流れをまとめています。[ヘルプセンターGPTを開く](https://chatgpt.com/g/g-6a6d32ac1de881919670c649f51b52a7-heruhusenta)こともできます。デスクトップ版のプロジェクト一覧には「ヘルプと報告」があり、環境情報のコピーと現在の画面の保存を行ってからGitHub / ChatGPTへ進めます。

[GitHubで新しいIssueを作成する](https://github.com/WebXR-JP/xrift-studio/issues/new)こともできます。アカウント情報やアクセストークンは貼り付けないでください。

## 開発状況

XRift Studioは開発中です。制作領域ごとの対応状況、設計上の境界、段階と完了判定は[対応範囲と段階](./docs/VISUAL_EDITOR_ROADMAP.md)にまとめています。設計そのものは[ビジュアルエディター設計](./docs/VISUAL_EDITOR_ARCHITECTURE.md)、文書全体の地図は[docs/README.md](./docs/README.md)を参照してください。

## ライセンス

MIT
