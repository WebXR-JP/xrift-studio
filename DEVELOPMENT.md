# 開発ガイド

XRift Studioをソースからビルド・改変するための開発ガイドです。アプリの使い方は[README.md](./README.md)を参照してください。

## 必要な環境

- **Node.js** 22.19.0以上（Pi SDKの要件。同梱する制作ツールは24系LTS）
- [Rust](https://www.rust-lang.org/learn/get-started)のstable版
- OS: Windows 10/11 / macOS 12+ / Linux

### Windows 追加要件

- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（"Desktop development with C++" ワークロード）
- WebView2 Runtime（Windows 11は標準搭載）

### macOS 追加要件

```bash
xcode-select --install
```

### Linux 追加要件（Ubuntu 22.04 の例）

```bash
sudo apt update
sudo apt install \
  libwebkit2gtk-4.1-dev \
  librsvg2-dev \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  patchelf \
  build-essential
```

## 起動（開発モード）

```bash
pnpm install
pnpm tauri:dev
```

依存管理にはpnpmを使います。`pnpm-lock.yaml`を唯一のロックファイルとして更新し、CIでは`pnpm install --frozen-lockfile`で再現性を確認します。`.npmrc`のTakumi Guard設定を、依存の導入と公開用shellの生成で引き継ぎます。

## UX の確認

機能を追加・変更したら、[UX原則](./docs/UX_PRINCIPLES.md)に沿って実画面を確認してください。作成物や起動した画面を、操作後にすぐ開けることも確認します。

1. 操作前に、現在の状態と主操作がひと目で分かる。
2. 実行中に、処理中であることと二重操作できないことが分かる。
3. 成功後に、作成物・起動URL・公開URLなど、次の目的地をすぐ開ける。
4. 失敗後に、ログまたは再試行などの復帰手段が分かる。
5. 一覧へ戻ったときに、変更結果と新規作成の入口が見つかる。

日常の検証では、型チェック、Rustの`cargo check`、変更した機能の回帰テストと操作を確認してください。文書だけの変更では内容と参照を確認します。操作の許可と完了条件は[共通ガイド](./AGENT.md#意思決定と完了)に従ってください。依頼済みのローカルビルドは追加の許可を求めず進め、公開・配布には別途その操作の許可を確認します。

手動のRelease workflowでは、主要導線9件のE2EをOS別ビルドの前に実行します。個別機能の回帰テストは変更時に`pnpm e2e:test e2e/<対象>.spec.ts`で実行し、全件は`pnpm e2e:test`で確認できます。テスト範囲、アップロード禁止境界、失敗時の確認方法は [リリース前E2E](./docs/RELEASE_E2E.md) を参照してください。

### Piによる制作の確認

Studio内の制作チャットはPi SDKを使い、正式なEditorツールを呼びます。旧JSONプランの解析・適用、操作カタログ、独自のScene要約・再計画・入力アーカイブは削除しました。会話・Plan・使用量・進捗はPiの共通プロトコルと履歴を使います。SDKの実行ループ、OpenAI Responsesの通信、Editorへの反映、保存、停止を次で確認できます。モデル応答とnative IPCだけをテスト用に置き換え、実アカウントへの通信は行いません。

```bash
pnpm pi:test
node --test scripts/chatgpt-authoring-host.test.mjs scripts/chatgpt-sessions.test.mjs
pnpm e2e:test e2e/chatgpt-pi-authoring.spec.ts
```

`pnpm pi:prepare`は導入済みのlockfileに一致する依存を配布リソースへコピーします。Tauriの開発・配布コマンドから自動で呼び出します。実アカウントでの認証・推論とOS別アプリの起動は別途確認してください。詳しい経路は[Pi SDKによるStudio制作](./docs/CHATGPT_AUTHORING.md)を参照してください。

### 導入済みBlenderからの実GLB取り込み確認

通常のnativeテストはBlenderの導入を要求しません。実機確認では`XRIFT_TEST_BLENDER=1`を指定し、`blender_modeling::tests::installed_blender_exports_real_geometry_pbr_and_studio_axes`を実行します。新規の隔離プロジェクトで実GLBと`.blend`を作り、形状・PBR Material・Studioの軸と複合回転を検査し、作業用プロジェクトだけを削除します。

`XRIFT_TEST_BLENDER_OUTPUT`にリポジトリ直下の`node_modules/.cache/chatgpt-blender-model/fixture.glb`の絶対パスを指定すると、確認した実GLBと生成仕様の`fixture.json`を残します。保存先はこの固定cache内に限り、別の内容で上書きしません。続けて`node --test scripts/chatgpt-modeling.test.mjs`と`pnpm e2e:test e2e/chatgpt-modeling.spec.ts`を実行すると、通常のAssets取り込みとScene・Playの実描画、保存後の再表示を確認できます。実GLBがない環境では、その実データを使う試験だけをSKIPします。ブラウザ試験のnative transportと推論応答は隔離fixtureで、本物のGLB bytesと通常の取り込み・描画処理を使います。

### 実Classic書き出しの描画確認

`classic-mtoon-export.spec.ts`は、CLI変換と既存Classicへの書き出しで作った実ファイルを描画します。通常のcheckoutでは準備結果がないためSKIPします。Node.js 22.15以上、ロックファイルに沿ったリポジトリ依存、導入済みの公式CLI 0.25.0、Chromiumを用意し、次をリポジトリ直下で実行してください。`--cli`には公式CLIの`dist/index.js`を指定します。`XRIFT_CLASSIC_CLI_ENTRY`環境変数でも指定できます。

```bash
node scripts/prepare-classic-mtoon-exports.cjs --cli "/installed/path/@xrift/cli/dist/index.js"
pnpm e2e:test e2e/classic-mtoon-export.spec.ts --workers=1
```

準備にはGitHubの公式テンプレート取得が必要です。既定ではCLI版を0.25.0、world-templateのcommitを`e8b22b78a51cf83748a2019c80e2b639bb137dff`に固定します。更新時は`--cli-version`と`--template-commit`で確認する版と40桁のcommit SHAを明示してください。CLI版・入口のSHA256・テンプレートcommitは完了記録へ残ります。

[準備script](./scripts/prepare-classic-mtoon-exports.cjs)は検証用の合成VRM0/1とPNG10件を使い、`node_modules/.cache/xrift-studio/classic-mtoon-export/`内に別々のClassicプロジェクトを作ります。実際の変換とファイル書き込みを通し、素材12件・生成コード・manifest・provenanceの検査後だけ`completed.json`を作ります。開始時と失敗時には古い完了記録を除き、終了コード1で失敗を知らせます。制作物の依存インストール、ビルド、認証、公開は行いません。準備が強制終了して`prepare.lock`だけ残った場合は、準備プロセスが終了したことを確認してそのファイルだけを除いてください。

## 紹介ページのダウンロード導線

GitHub Pagesの紹介ページから、最新リリースのインストーラーを直接ダウンロードできます。ページにはビルド時に取得したリリースを表示し、表示後に公開APIの応答で更新します。

- ビルド時: `pnpm release:snapshot`が公開済みの最新リリースを読み、`src/preview/generated/release-snapshot.ts`を書き換えます。生成物はコミットします。取得に失敗した場合は既存のスナップショットを保ったまま終了し、ビルドを止めません。
- 表示後: ページがGitHubの公開APIへ問い合わせ、返ってきたリリースでスナップショットを置き換えます。1ページの読み込みにつき1回だけ問い合わせます。

`.github/workflows/pages.yml`はビルド前にスナップショットを更新し、リリースの公開時にも再デプロイします。アセット名の規則 (`[name]_[version]_[platform]_[arch]_[mode][setup][ext]`) を変える場合は、`src/preview/lib/release-download.ts`とパッケージ定義の生成処理も合わせて更新してください。状態設計は [マイクロインタラクションWiki](./docs/UX_INTERACTIONS.md) のF-41にあります。

## 配布ビルド

```bash
pnpm tauri:build
```

成果物は`src-tauri/target/release/bundle/`にOS別で出力されます。

## リポジトリ構成

```
src/                       フロントエンド (React + TypeScript)
  App.tsx                  メインレイアウト / ルーティング
  components/              UI コンポーネント
    SetupView.tsx          初回セットアップ画面
    ProjectLibrary.tsx     プロジェクト一覧
    EditorView.tsx         エディタ画面
    UpdateDialog.tsx       @xrift/cli アップデート通知
    AboutModal.tsx         バージョン情報 / リセット
    ...
  lib/
    tauri.ts               Rust コマンドの型付きラッパー
    xrift-cli.ts           tauri-plugin-shell 経由で xrift CLI を呼び出す
    semver.ts              バージョン比較ユーティリティ

src-tauri/                 Rust バックエンド (Tauri v2)
  src/lib.rs               コマンド実装（ランタイム管理 / ファイル操作 / リセット）
  capabilities/            shell 実行の許可リスト
  tauri.conf.json          Tauri 設定
  Cargo.toml

.github/workflows/
  release.yml              Windows / macOS / Linux の自動リリースワークフロー
```

## 主要な Tauri コマンド

| コマンド | 役割 |
|---|---|
| `runtime_status` | Node.js / npm、CLIの実ファイルとバージョンを確認。推奨版未満ならセットアップへ案内 |
| `setup_runtime` | Node.jsダウンロード → 展開 → 推奨CLIのインストール → 実行確認 |
| `check_xrift_latest` | npm registryから @xrift/cliの最新版を取得 |
| `update_xrift` | 最新の安定版を取得し、版を指定してインストール。実行とバージョンを確認 |
| `reset_app_data` | scopeに応じてアプリデータを削除（runtime / projects / all） |
| `list_projects` | `projects/`配下のプロジェクトを列挙 |
| `read_text_file` / `write_text_file` | 任意のファイルを読み書き |

### 制作ツールのバージョン

初回セットアップの基準は`src-tauri/src/runtime_installation.rs`にまとめています。現在はNode.js **24.21.0** と`@xrift/cli` **0.25.0** です。CLIは初回導入時にこの版を指定し、既存の古い版もセットアップ画面から更新します。推奨版以上の安定版は保持します。Node.jsの保存先は版ごとに分かれますが、CLIの保存先、ログイン情報、作品フォルダーは引き継ぎます。

CLIはアプリ専用Node.jsから公式の`dist/index.js`を直接実行します。`sh -c`を使い、ログインシェルによる`PATH`やアプリ専用ホームの書き換えを避けます。セットアップ・更新は同時に実行できず、完了表示の前に`--version`の実行を確認します。

CLI 0.25.0に合わせ、StudioもSDKを **0.2.0** に揃えます。ワールドの公開では、ビルド成果物の`<Item itemId>`と`xrift.json`の`world.items`をCLIが照合します。SDK経由の公開でも、設定にあるItem IDを公開オプションへ引き継ぎます。`xrift.json`のあるプロジェクトルートで実行し、タイトルと既存の除外設定を引き続き渡します。`check world --build` / `check item --build`ではビルドが実行されないため、種類を自動判定する **`check --build`** を維持します。コンパイラと公開用shellの生成には、想定する構成を持つ公式テンプレートを明示します。

Item配置はworld-components **0.57.1** の公式Itemを使います。2026-10-13に[componentsのソース](https://github.com/WebXR-JP/xrift-world-components/tree/16f45d38e76a6312e90098ef9e87bb2dc567b6bc)と[world-templateのソース](https://github.com/WebXR-JP/xrift-world-template/tree/e8b22b78a51cf83748a2019c80e2b639bb137dff)を照合しました。配置ごとの固定`placementId`、`world.items`宣言、`remoteEntry.js`の`./Item`公開、公式の共有依存ラベルを保ちます。生成するVite設定にはSDK 0.2.0の`xriftDev()`を含めます。Studioの編集・Play用ローダーはネイティブで認証情報を付けて配信URLだけを返し、公開物はXRift側のItemLoaderを使います。

公式Componentsの更新では、エディター・Play・コンパイラ・公開用shell・runtime packageの版を揃えます。更新後は`scripts/check-world-components-alignment.mjs`と`pnpm runtime:shell:check`で整合を確認します。

Components 0.55.0のMirrorでは`reflectionInterval`に対応し、既定の反射更新を2フレームに1回へ揃えています。毎フレーム更新したい場合は1を指定します。EntryLogBoardの`formatTimestamp`は0.54.0以降、epochミリ秒の数値を受け取ります。自作の表示処理でDateのメソッドを使っている場合は、先に`new Date(timestampMs)`へ変換してください。旧形式の文字列で共有されている入退室履歴は公式側で表示対象外になるため、この依存更新で過去の履歴が復元されることはありません。

## リリース

`.github/workflows/release.yml`でWindows / macOS / Linuxのインストーラを一括ビルドします。

GitHub ActionsのリポジトリSecretsに次を登録してください。

- `TAURI_SIGNING_PRIVATE_KEY`: `pnpm tauri signer generate`で生成したupdater秘密鍵の内容
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: 秘密鍵を生成したときのパスワード

公開鍵は`src-tauri/tauri.conf.json`のupdater設定に含まれます。秘密鍵ファイルとパスワードはリポジトリへ追加しないでください。

1. アプリの版番号を揃え、`docs/releases/<version>.md`を作成します。先頭は`# XRift Studio v<version>`とし、前回のリリースから利用者に関わる変更点を箇条書きで記載します。空の更新文やタグとTauri設定の版番号の不一致はリリース前の検証で止まります。
2. GitHub Actionsタブ → **Release** → **Run workflow**
3. タグ名（例: `v0.1.0`）を入力して実行
4. 検査成功後にReleaseの下書きを1つ作り、全OSのインストーラーと署名を並列で添付します。すべて成功すると、最後のjobが必要ファイルと署名を確認し、全OS分の`latest.json`を1回だけ生成・添付してから公開します。更新文はGitHub Releaseと自動更新用の説明に入ります。

版番号は`package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`の`xrift-studio`エントリーを揃えます。依存パッケージの版番号は変更しません。

公開済みの通常リリースだけがアプリの`releases/latest/download/latest.json`から取得されます。ドラフトは公開するまで、プレリリースは通常リリースになるまで自動更新の対象になりません。

| OS | 生成される成果物 |
|---|---|
| Windows | `.msi` (Windows Installer) / `.exe` (NSIS) |
| macOS | `.dmg`（universal — Apple Silicon + Intel） |
| Linux | `.deb` / `.rpm` / `.AppImage` |

**プレリリース／下書き** のオプションもあります（workflow実行時のフォーム参照）。`draft`を選んだ場合も全ファイルと更新情報を添付し、公開せずに下書きに残します。OS別ビルド、添付、更新情報の生成のどこかで失敗した場合も下書きのまま停止します。

### 添付に失敗した場合

[GitHubのImmutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)では、公開すると添付ファイルとタグが固定されます。公開前に全ファイルを添付する必要があり、公開済みReleaseへの追加や差し替えはできません。ワークフローはビルド前に既存Releaseの状態を確認し、公開済みなら新しい版番号とタグを使うよう案内して停止します。

- **下書きのまま失敗した場合**: 同じcommit・同じタグの実行を再実行できます。添付済みファイルを再利用・更新し、最後に全ファイルから`latest.json`を作り直します。別commitを同じ下書きへ混ぜる操作は停止します。
- **公開済みの版にファイルが不足する場合**: 新しい版番号とタグで配布し直します。Immutable releaseを削除しても、同じタグ名は再利用できません。

2026年9月22日の`v0.10.2`は、`releaseDraft: false`の設定により添付前に公開されました。全OSのファイルが未添付のままReleaseが固定されたため、修正を含むブランチのマージ後にRelease → Run workflow → `v0.10.3`で配布し直します。通常公開では`draft`と`prerelease`を選びません。`v0.10.2`の失敗した実行を再実行しても、固定済みReleaseは修復できません。[対象の実行](https://github.com/WebXR-JP/xrift-studio/actions/runs/35712907566)

公開処理の回帰確認は`node --test scripts/prepare-release-notes.test.mjs scripts/github-release.test.mjs`で実行します。実際のReleaseを作らず、公開済みタグの拒否、下書きからの再実行、全OSの更新情報、添付失敗時に公開しないことを確認します。

### Homebrewの更新

通常リリースの公開後、**Update Homebrew** が配布ファイルのURLとSHA-256から定義を更新し、このリポジトリに更新PRを作ります。HomebrewはPRのマージ後に配布版が切り替わります。

```bash
node scripts/update-package-managers.mjs
node scripts/update-package-managers.mjs --check
node --test scripts/update-package-managers.test.mjs
```

最初のコマンドは公開済みの最新リリースを取得し、`--check`は保存済みの情報と生成物の整合をネット接続なしで確認します。初回のActions設定、生成物の回収、macOSでの動作確認は[Homebrewでの配布](./docs/PACKAGE_MANAGERS.md#配布定義を更新する)を参照してください。

<a id="所要時間の作り"></a>

### 所要時間に影響する処理

OS別ビルド前の検査は、`verify`と`Release smoke E2E`の2つのjobで並列に実行します。E2Eでは`pnpm e2e:smoke`で主要導線9件を1台・1 workerで確認します。型検査、コンパイラfixture、公開ステージング検査は`verify`で行います。

Rustの成果物は`src-tauri/target`と`src-tauri/target-mcp-sidecar`の両方をキャッシュします。MCP sidecarは`--target-dir`で別のディレクトリへ出力されます。`target`だけをキャッシュしていた頃は、sidecarの依存を毎回すべてビルドし直していました。`Swatinem/rust-cache`の`workspaces`からどちらかを除外すると、そのディレクトリの再ビルドが必要になります。

macOSのuniversal版では、aarch64とx86_64のsidecarを作ります。`beforeBuildCommand`でhost向けの3つ目をビルドしないよう、build jobにだけ`XRIFT_MCP_SIDECAR_REUSE_PREBUILT`を設定します。設定時は`scripts/prepare-mcp-sidecar.mjs`が目的の実行ファイルを確認し、すでにある場合だけcargoを省略します。なければ通常どおりビルドします。debugとreleaseは同じファイル名で出力するため、日常の開発ではこの変数を設定しません。

## 対応状況

[対応範囲](./docs/VISUAL_EDITOR_ROADMAP.md)を参照してください。過去の予定バージョンを現行の実装状況として扱わず、変更対象のソースと照合します。

## コントリビュート

IssueやPull Requestを受け付けています。大きな変更は、実装前にIssueで相談してください。

## 大規模Sceneの開発時計測

React 19.2とReact Three Fiber内蔵のreconcilerは、開発用Performance Tracksへpropsを書き出す際に巨大なTypedArrayなどを列挙・複製します。大規模モデルでは描画前にメモリ不足になるため、開発版の起動時に`console.timeStamp`を無効にして計測を止めています。

この設定中はChrome DevToolsのReactタイムライントラックを使えません。Reactの警告・Profiler、Studioの診断、通常の`performance.mark/measure`は利用できます。本番版には適用しません。React DOMとR3F内蔵reconcilerの両方で列挙量が制限されたら、この回避策を外してください。
