# 開発ガイド

XRift Studio をソースコードからビルド・開発するためのガイドです。アプリの使い方は [README.md](./README.md) を参照してください。

## 必要な環境

- **Node.js** 22.19.0 以上（Pi SDK の要件。アプリに同梱する制作ツールは 24 系 LTS）
- **pnpm** 11 以上
- [Rust](https://www.rust-lang.org/learn/get-started)（stable 版）
- 対応 OS: Windows 10/11、macOS 12 以降、Linux

### Windows で追加で必要なもの

- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（「Desktop development with C++」ワークロード）
- WebView2 Runtime（Windows 11 は標準搭載）

### macOS で追加で必要なもの

```bash
xcode-select --install
```

### Linux で追加で必要なもの（Ubuntu 22.04 の例）

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

## 開発モードでの起動

```bash
pnpm install
pnpm tauri:dev
```

パッケージ管理には pnpm を使います。ロックファイルは `pnpm-lock.yaml` に統一し、CI では `pnpm install --frozen-lockfile` で依存関係の再現性を検証します。`.npmrc` の Takumi Guard 設定は、通常の依存インストールと公開用ランタイムシェルの生成の両方に適用されます。

## UX と動作確認の基準

機能を追加・変更したときは、[UX 原則](./docs/UX_PRINCIPLES.md) に沿って実際の画面で次の 5 点を確認してください。

1. 操作前に、現在の状態とメインの操作がひと目で分かること。
2. 処理中は実行中であることが伝わり、二重実行を防げること。
3. 成功後に、作成したプロジェクトや起動 URL・公開 URL など、次の目的地へすぐ進めること。
4. 失敗時に、ログの確認や再試行などのリカバリー手段が分かること。
5. 一覧へ戻ったとき、変更結果と新規作成の入口が迷わず見つかること。

日常の開発では、型チェック、Rust の `cargo check`、変更した機能の回帰テストおよび画面確認を行います。ドキュメントのみの変更であれば、内容の正確さとリンク切れを確認します。作業の進め方や完了条件は [開発・作業ガイド](./AGENT.md#作業の進め方と完了条件) に従ってください。

手動実行の Release ワークフローでは、OS ごとのビルド前に主要な 9 本の E2E テストを実行します。個別機能の回帰確認は `pnpm e2e:test e2e/<対象>.spec.ts`、全件実行は `pnpm e2e:test` です。テスト範囲や失敗時の確認手順は [リリース前 E2E](./docs/RELEASE_E2E.md) を参照してください。

### Pi SDK による制作チャットの確認

アプリ内の制作チャットは Pi SDK を使い、Studio の公式 Editor ツールを呼び出します。従来の JSON 一括プラン生成や独自の再計画ループは廃止し、会話・Plan・トークン使用量・進捗管理はすべて Pi の共通プロトコルと履歴で扱っています。

SDK の実行ループ、OpenAI Responses API とのやり取り、エディターへの反映・保存・停止は次のテストで確認できます（モデル応答とネイティブ IPC のみをテスト用に差し替えており、実際のアカウントへの通信は発生しません）。

```bash
pnpm pi:test
node --test scripts/chatgpt-authoring-host.test.mjs scripts/chatgpt-sessions.test.mjs
pnpm e2e:test e2e/chatgpt-pi-authoring.spec.ts
```

`pnpm pi:prepare` はロックファイルに一致する依存関係を配布リソース（`src-tauri/resources/pi`）へコピーします。Tauri の開発・ビルドコマンドは、MCP sidecar とアプリ本体のビルド前に自動でこのスクリプトを実行します。開発時にも Tauri が `src-tauri/resources/pi` の存在をチェックするため、SDK をコンパイルしただけでは起動できません（MCP sidecar 単体のビルド時のみ、このチェックを除外しています）。実アカウントでの認証・推論と各 OS での起動は別途確認してください。全体の仕組みは [Pi SDK による Studio 制作](./docs/CHATGPT_AUTHORING.md) にまとめています。

### 導入済み Blender を使った実 GLB 取り込みテスト

通常のネイティブテストでは Blender は不要です。ローカルの Blender を使った確認を行う場合は、`XRIFT_TEST_BLENDER=1` を付けて `blender_modeling::tests::installed_blender_exports_real_geometry_pbr_and_studio_axes` を実行します。テスト用に隔離した新規プロジェクトで実際の GLB と `.blend` を生成し、形状・PBR マテリアル・軸と複合回転を検証したあと、作業用プロジェクトのみ削除します。

`XRIFT_TEST_BLENDER_OUTPUT` にリポジトリ直下の `node_modules/.cache/chatgpt-blender-model/fixture.glb` の絶対パスを指定すると、生成した GLB と仕様ファイル `fixture.json` をそのキャッシュ先に保存します。続いて `node --test scripts/chatgpt-modeling.test.mjs` と `pnpm e2e:test e2e/chatgpt-modeling.spec.ts` を実行すると、Assets への取り込みから Scene・Play での描画、保存後の再表示まで通して確認できます（実 GLB がない環境では、そのデータを使うテストのみスキップされます）。

### Classic プロジェクト書き出しの描画確認

`classic-mtoon-export.spec.ts` は、CLI 変換と既存 Classic プロジェクトへの書き出しで生成したファイルを描画して検証します。通常のチェックアウト直後には事前生成データがないためスキップされます。

実行するには、Node.js 22.15 以上、リポジトリの依存パッケージ、公式 `@xrift/cli` 0.25.0、Chromium を用意し、リポジトリルートで次を実行してください。`--cli` には公式 CLI の `dist/index.js` のパスを指定します（環境変数 `XRIFT_CLASSIC_CLI_ENTRY` でも指定可能）。

```bash
node scripts/prepare-classic-mtoon-exports.cjs --cli "/installed/path/@xrift/cli/dist/index.js"
pnpm e2e:test e2e/classic-mtoon-export.spec.ts --workers=1
```

準備処理では GitHub から公式テンプレートを取得します。既定では CLI バージョン `0.25.0`、`world-template` のコミット `e8b22b78a51cf83748a2019c80e2b639bb137dff` に固定しています。バージョンを上げるときは `--cli-version` と `--template-commit`（40 桁のコミット SHA）を明示してください。

[準備スクリプト](./scripts/prepare-classic-mtoon-exports.cjs) はテスト用の合成 VRM 0/1 と PNG 10 点を使い、`node_modules/.cache/xrift-studio/classic-mtoon-export/` 配下に独立した Classic プロジェクトを作成します。変換・書き出し後に素材 12 点、生成コード、manifest、来歴情報を検証し、すべて通過したときだけ `completed.json` を出力します（依存インストール・ビルド・認証・公開は行いません）。強制終了で `prepare.lock` だけが残った場合は、プロセスが終了していることを確認した上でそのファイルのみ削除してください。

## 紹介ページのダウンロード導線

GitHub Pages の紹介ページでは、最新リリースのインストーラーを直接ダウンロードできます。ビルド時に取得したスナップショットを初期表示し、読み込み後に GitHub API の応答で最新情報へ差し替えます。

- **ビルド時**: `pnpm release:snapshot` が公開済みの最新リリースを取得し、`src/preview/generated/release-snapshot.ts` を更新します（生成物はコミット対象）。取得に失敗した場合は既存のスナップショットを維持し、ビルド自体は止めません。
- **ページ表示後**: 1 回のページ読み込みにつき 1 度だけ GitHub の公開 API へ問い合わせ、最新のリリース情報へ更新します。

`.github/workflows/pages.yml` はビルド前にスナップショットを更新し、新しいリリース公開時にも自動で再デプロイします。インストーラーのファイル名規則（`[name]_[version]_[platform]_[arch]_[mode][setup][ext]`）を変更する場合は、`src/preview/lib/release-download.ts` とパッケージ定義の生成処理も一緒に更新してください。状態遷移の設計は [マイクロインタラクション一覧](./docs/UX_INTERACTIONS.md) の F-41 にあります。

## 配布ビルド

```bash
pnpm tauri:build
```

OS ごとのインストーラーは `src-tauri/target/release/bundle/` に出力されます。

## リポジトリ構成

```text
src/                       フロントエンド（React + TypeScript）
  App.tsx                  メインレイアウト・ルーティング
  components/              UI コンポーネント
    SetupView.tsx          初回セットアップ画面
    ProjectLibrary.tsx     プロジェクト一覧
    EditorView.tsx         エディター画面
    UpdateDialog.tsx       @xrift/cli アップデート通知
    AboutModal.tsx         バージョン情報・リセット
    ...
  lib/
    tauri.ts               Rust コマンドの型付きラッパー
    xrift-cli.ts           tauri-plugin-shell 経由で xrift CLI を呼び出す
    semver.ts              バージョン比較ユーティリティ

src-tauri/                 Rust バックエンド（Tauri v2）
  src/lib.rs               コマンド実装（ランタイム管理・ファイル操作・リセット）
  capabilities/            shell 実行の許可リスト
  tauri.conf.json          Tauri 設定
  Cargo.toml

.github/workflows/
  release.yml              Windows / macOS / Linux の自動リリースワークフロー
```

## 主な Tauri コマンド

| コマンド | 役割 |
| --- | --- |
| `runtime_status` | Node.js / npm と CLI の実体・バージョンを確認。推奨バージョン未満ならセットアップへ案内 |
| `setup_runtime` | Node.js のダウンロード・展開、推奨 CLI のインストール、実行確認を一括実行 |
| `check_xrift_latest` | npm レジストリから `@xrift/cli` の最新版を確認 |
| `update_xrift` | 最新の安定版を取得してバージョン指定でインストールし、実行確認まで実施 |
| `reset_app_data` | 指定した範囲（`runtime` / `projects` / `all`）のアプリデータを削除 |
| `list_projects` | `projects/` 配下のプロジェクト一覧を取得 |
| `read_text_file` / `write_text_file` | テキストファイルの読み書き |

### 同梱する制作ツールのバージョン

初回セットアップで導入するバージョンは `src-tauri/src/runtime_installation.rs` で管理しています。現在の基準は Node.js **24.21.0** と `@xrift/cli` **0.26.0** です。初回導入時にこれらをインストールし、古いバージョンが入っている場合はセットアップ画面から更新します（推奨版以上の安定版が入っている場合はそのまま維持します）。Node.js の保存先はバージョンごとに分かれますが、CLI・ログイン情報・作品フォルダーはそのまま引き継がれます。

CLI はアプリ専用の Node.js から公式の `dist/index.js` を直接呼び出します。ログインシェルによる `PATH` やホームディレクトリの書き換えを避けるため `sh -c` を経由します。セットアップと更新は同時実行できないよう排他制御し、完了表示の前に `--version` で起動できることを確認しています。

CLI 0.26.0 に合わせて Studio の SDK は **0.2.0** を維持します。ワールド公開時は、ビルド成果物の `<Item itemId>` と `xrift.json` の `world.items` を CLI が照合します。SDK 経由の公開でも `xrift.json` にある Item ID を公開オプションへ引き継ぎ、プロジェクトルートで実行してタイトルと除外設定を渡します。`check world --build` / `check item --build` ではビルドが走らないため、種類を自動判定する **`check --build`** を使っています。コンパイラや公開用ランタイムシェルの生成では、想定構成に合う公式テンプレートを明示指定します。

Item 配置には `@xrift/world-components` **0.64.0** の公式 `Item` を使います（2026-11-12 に [components のソース](https://github.com/WebXR-JP/xrift-world-components/tree/bb5bd1c66cb1565bd039c7328d7b8ef3b4cd03c5)、2026-10-13 に [world-template のソース](https://github.com/WebXR-JP/xrift-world-template/tree/e8b22b78a51cf83748a2019c80e2b639bb137dff) を確認済み）。配置ごとの固定 `placementId`、`world.items` 宣言、`remoteEntry.js` の `./Item` 公開、公式の共有依存ラベルを維持し、生成する Vite 設定には SDK 0.2.0 の `xriftDev()` を含めます。Studio の編集・Play 用ローダーはネイティブ側で認証を処理して配信 URL のみを返し、公開先のワールドでは XRift 本体の `ItemLoader` を使います。

公式 Components を更新するときは、エディター・Play・コンパイラ・公開用ランタイムシェル・runtime パッケージのバージョンをすべてそろえ、`scripts/check-world-components-alignment.mjs` と `pnpm runtime:shell:check` で整合を確認してください。

- Components 0.55.0 の `Mirror` は `reflectionInterval` に対応しており、既定では 2 フレームに 1 回反射を更新します（毎フレーム更新したい場合は `1` を指定）。
- `EntryLogBoard` の `formatTimestamp` は 0.54.0 以降、epoch ミリ秒の数値を受け取ります。自作の表示処理で `Date` のメソッドを使っている場合は、先に `new Date(timestampMs)` へ変換してください。旧形式の文字列で共有されている入退室履歴は公式側で表示対象外となるため、このアップデートで過去履歴が復元されることはありません。

## リリース手順

`.github/workflows/release.yml` で Windows・macOS・Linux 向けのインストーラーを一括ビルドできます。

あらかじめ GitHub Actions のリポジトリ Secrets に次の 2 つを登録しておいてください（公開鍵は `src-tauri/tauri.conf.json` の updater 設定に含まれています。秘密鍵とパスワードはリポジトリにコミットしないでください）。

- `TAURI_SIGNING_PRIVATE_KEY`: `pnpm tauri signer generate` で生成した updater 秘密鍵の内容
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: 秘密鍵生成時に設定したパスワード

### 公開の流れ

1. `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`（`xrift-studio` エントリーのみ）のバージョン番号をそろえ、`docs/releases/<version>.md` を作成します。見出しは `# XRift Studio v<version>` とし、前回リリースからのユーザー向け変更点を箇条書きで書きます。空のリリースノートやバージョン不一致は事前チェックで停止します。
2. GitHub の Actions タブから **Release** → **Run workflow** を開きます。
3. タグ名（例: `v1.0.21`）を入力して実行します。
4. 事前チェック通過後にドラフトの Release を 1 つ作成し、各 OS のインストーラーと署名を並列で添付します。すべてそろった段階で最終ジョブが全 OS 分の `latest.json` を生成・添付し、公開します。リリースノートの内容は GitHub Release とアプリ内自動更新の両方に使われます。

アプリの自動更新（`releases/latest/download/latest.json`）の対象になるのは、公開済みの通常リリースだけです。ドラフトやプレリリースは通常リリースにするまで配信されません。

| OS | 生成されるインストーラー |
| --- | --- |
| Windows | `.msi`（Windows Installer）/ `.exe`（NSIS） |
| macOS | `.dmg`（Universal: Apple Silicon + Intel） |
| Linux | `.deb` / `.rpm` / `.AppImage` |

フォームのオプションでプレリリースや下書き指定も可能です。`draft` を選んだ場合や、ビルド・添付・`latest.json` 生成のどこかで失敗した場合は、公開せず下書きのまま停止します。

### 添付が途中で失敗した場合

[GitHub の Immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases) では、一度公開したリリースはタグと添付ファイルが固定され、あとからファイルを追加・差し替えできません。ワークフロー側でも既存リリースが公開済みなら新しいバージョンを使うよう案内して停止します。

- **下書きのまま失敗した場合**: 同じコミット・同じタグでワークフローを再実行できます。添付済みファイルを再利用しつつ不足分を補い、最後に `latest.json` を作り直します（別コミットを同じ下書きに混ぜる実行は停止します）。
- **公開済みリリースにファイルが足りない場合**: 新しいバージョン番号とタグでリリースし直してください。Immutable release を削除しても同じタグ名は再利用できません。

> 参考: 2026 年 9 月 22 日の `v0.10.2` は `releaseDraft: false` だったため添付完了前に公開されてしまい、ファイル不足のまま固定されました（[該当ワークフロー](https://github.com/WebXR-JP/xrift-studio/actions/runs/35712907566)）。この対策として通常リリースでは下書き作成後に全ファイル添付・公開の順で処理しています。

リリース処理の回帰テストは `node --test scripts/prepare-release-notes.test.mjs scripts/github-release.test.mjs` で実行できます（実際の Release は作成しません）。

### Homebrew 配布定義の更新

通常リリースの公開後、**Update Homebrew** ワークフローがインストーラーの URL と SHA-256 をもとに定義を更新し、PR を作成します。その PR をマージすると Homebrew 側の配布版が切り替わります。

```bash
node scripts/update-package-managers.mjs
node scripts/update-package-managers.mjs --check
node --test scripts/update-package-managers.test.mjs
```

1 つ目は最新の公開リリースを取得して定義を更新、2 つ目の `--check` はローカルの定義と生成物の整合をオフラインで検証します。詳しい運用手順は [Homebrew での配布](./docs/PACKAGE_MANAGERS.md#配布定義を更新する) を参照してください。

<a id="所要時間の作り"></a>

### CI ビルドの高速化ポイント

- OS ごとのビルド前に走る検査は、`verify`（型チェック・コンパイラ fixture・公開ステージング検証）と `Release smoke E2E`（`pnpm e2e:smoke` による主要 9 件の確認）の 2 ジョブで並列実行します。
- Rust のビルドキャッシュには `src-tauri/target` と `src-tauri/target-mcp-sidecar` の両方を含めています。MCP sidecar は `--target-dir` で別ディレクトリへ出力しているため、どちらか片方が漏れると毎回フルビルドになります。
- macOS Universal 版では aarch64 と x86_64 の sidecar を事前ビルドし、ビルドジョブにだけ `XRIFT_MCP_SIDECAR_REUSE_PREBUILT` を設定して `beforeBuildCommand` での重複ビルドを防いでいます（debug と release でファイル名が同じため、ローカル開発では設定しないでください）。

## 対応状況

現在の対応範囲は [対応状況](./docs/VISUAL_EDITOR_ROADMAP.md) を参照してください。ドキュメント上の旧予定バージョンをそのまま現行仕様とみなさず、変更時は必ず最新のソースコードと照合してください。

## コントリビュート

Issue や Pull Request を歓迎します。大きな機能追加や仕様変更は、実装前に Issue で方針を相談していただけるとスムーズです。

## 大規模 Scene での開発時パフォーマンス計測について

React 19.2 と React Three Fiber 内蔵の reconciler は、開発用の Performance Tracks へ props を記録する際に巨大な TypedArray などを列挙・複製します。大規模な 3D モデルでは描画前にメモリ不足でクラッシュするため、開発ビルド起動時に `console.timeStamp` を無効化してこの計測を止めています。

この回避策により Chrome DevTools の React タイムライントラックは使えませんが、React の警告・Profiler、Studio の診断、通常の `performance.mark` / `measure` は問題なく利用できます。本番ビルドには影響しません。React DOM と R3F の双方で列挙量の上限が導入されたら、この回避策を削除してください。
