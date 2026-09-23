# 開発ガイド

XRift Studio はソースから自分でビルド・改変できます。このドキュメントは **開発者向け** です。アプリの使い方は [README.md](./README.md) をご覧ください。

## 必要な環境

- **Node.js** 22.13.0 以上（開発用pnpmの要件。同梱する制作ツールは24系LTS）
- **Rust** (stable) — https://www.rust-lang.org/learn/get-started
- OS: Windows 10/11 / macOS 12+ / Linux

### Windows 追加要件

- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（"Desktop development with C++" ワークロード）
- WebView2 Runtime（Windows 11 は標準搭載）

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

依存管理にはpnpmを使います。`pnpm-lock.yaml`を唯一のロックファイルとして更新し、CIでは `pnpm install --frozen-lockfile` で再現性を確認します。`.npmrc` のTakumi Guard設定を、依存の導入と公開用shellの生成で引き継ぎます。

## UX の確認

機能を追加・変更したら、[UX 原則](./docs/UX_PRINCIPLES.md) に沿って実画面を確認します。特に、作成や起動の操作を成功させるだけで終わらせず、結果に到達できることを確認してください。

1. 操作前に、現在の状態と主操作がひと目で分かる。
2. 実行中に、処理中であることと二重操作できないことが分かる。
3. 成功後に、作成物・起動 URL・公開 URL など、次の目的地をすぐ開ける。
4. 失敗後に、ログまたは再試行などの復帰手段が分かる。
5. 一覧へ戻ったときに、変更結果と新規作成の入口が見つかる。

日常の検証は [検証スキル](./.agents/skills/xrift-studio-verify/SKILL.md) から変更に合う範囲を選びます。文書だけなら内容と参照を確認します。操作の許可と完了条件は [共通ガイド](./AGENT.md#意思決定と完了) に従い、依頼済みのローカルビルドを再確認しません。公開・配布とローカル生成は区別します。

手動のRelease workflowでは、主要導線9件のE2EをOS別ビルドの前に実行します。個別機能の回帰テストは変更時に `pnpm e2e:test e2e/<対象>.spec.ts` で実行し、全件は `pnpm e2e:test` で確認できます。テスト範囲、アップロード禁止境界、失敗時の確認方法は [リリース前 E2E](./docs/RELEASE_E2E.md) を参照してください。

## 紹介ページのダウンロード導線

GitHub Pages の紹介ページは、最新リリースのインストーラーを直接ダウンロードできます。表示するリリースは 2 経路で決まります。

- ビルド時: `pnpm release:snapshot` が公開済みの最新リリースを読み、`src/preview/generated/release-snapshot.ts` を書き換えます。生成物はコミットします。取得に失敗した場合は既存のスナップショットを保ったまま終了し、ビルドを止めません。
- 表示後: ページが GitHub の公開 API へ問い合わせ、返ってきたリリースでスナップショットを置き換えます。1 ページの読み込みにつき 1 回だけ問い合わせます。

`.github/workflows/pages.yml` はビルド前にスナップショットを更新し、リリースの公開時にも再デプロイします。アセット名の規則 (`[name]_[version]_[platform]_[arch]_[mode][setup][ext]`) を変える場合は、`src/preview/lib/release-download.ts` の判定も合わせて更新してください。状態設計は [マイクロインタラクション Wiki](./docs/UX_INTERACTIONS.md) の F-41 にあります。

## 配布ビルド

```bash
pnpm tauri:build
```

成果物は `src-tauri/target/release/bundle/` に OS 別で出力されます。

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
| `setup_runtime` | Node.js ダウンロード → 展開 → 推奨CLIのインストール → 実行確認 |
| `check_xrift_latest` | npm registry から @xrift/cli の最新版を取得 |
| `update_xrift` | 最新の安定版を取得し、版を指定してインストール。実行とバージョンを確認 |
| `reset_app_data` | scope に応じてアプリデータを削除（runtime / projects / all） |
| `list_projects` | `projects/` 配下のプロジェクトを列挙 |
| `read_text_file` / `write_text_file` | 任意のファイルを読み書き |

### 制作ツールのバージョン

初回セットアップの基準は `src-tauri/src/runtime_installation.rs` にまとめています。現在は Node.js **24.21.0** と `@xrift/cli` **0.24.4** です。CLIは初回導入時にこの版を指定し、既存の古い版もセットアップ画面から更新します。推奨版以上の安定版は保持します。Node.jsの保存先は版ごとに分かれますが、CLIの保存先、ログイン情報、作品フォルダーは引き継ぎます。

CLIはアプリ専用Node.jsから公式の `dist/index.js` を直接実行します。`sh -c` を使い、ログインシェルによる `PATH` やアプリ専用ホームの書き換えを避けます。セットアップ・更新は同時に実行できず、完了表示の前に `--version` の実行を確認します。

CLI 0.24.4ではアップロード対象の除外判定がSDKに統一されています。StudioもSDKを **0.1.3** に揃えます。`xrift.json` のあるプロジェクトルートで実行し、タイトルと既存の除外設定を引き続き渡します。`check world --build` / `check item --build` ではビルドが実行されないため、種類を自動判定する **`check --build`** を維持します。コンパイラと公開用shellの生成には、想定する構成を持つ公式テンプレートを明示します。

公式Componentsの更新では、エディター・Play・コンパイラ・公開用shell・runtime packageの版を揃えます。更新後は `scripts/check-world-components-alignment.mjs` と `pnpm runtime:shell:check` で整合を確認します。

Components 0.55.0のMirrorでは `reflectionInterval` に対応し、既定の反射更新を2フレームに1回へ揃えています。毎フレーム更新したい場合は1を指定します。EntryLogBoardの `formatTimestamp` は0.54.0以降、epochミリ秒の数値を受け取ります。自作の表示処理でDateのメソッドを使っている場合は、先に `new Date(timestampMs)` へ変換してください。旧形式の文字列で共有されている入退室履歴は公式側で表示対象外になるため、この依存更新で過去の履歴が復元されることはありません。

## リリース

`.github/workflows/release.yml` で Windows / macOS / Linux のインストーラを一括ビルドします。

GitHub Actions のリポジトリ Secrets に次を登録してください。

- `TAURI_SIGNING_PRIVATE_KEY`: `pnpm tauri signer generate` で生成した updater 秘密鍵の内容
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: 秘密鍵を生成したときのパスワード

公開鍵は `src-tauri/tauri.conf.json` の updater 設定に含まれます。秘密鍵ファイルとパスワードはリポジトリへ追加しないでください。

1. アプリの版番号を揃え、`docs/releases/<version>.md` を作成します。先頭は `# XRift Studio v<version>` とし、前回のリリースから利用者に関わる変更点を箇条書きで記載します。空の更新文やタグとTauri設定の版番号の不一致はリリース前の検証で止まります。
2. GitHub Actions タブ → **Release** → **Run workflow**
3. タグ名（例: `v0.1.0`）を入力して実行
4. 検査成功後にReleaseの下書きを1つ作り、全OSのインストーラーと署名を並列で添付します。すべて成功すると、最後のjobが必要ファイルと署名を確認し、全OS分の `latest.json` を1回だけ生成・添付してから公開します。更新文はGitHub Releaseと自動更新用の説明に入ります。

版番号は `package.json`、`package-lock.json` のトップレベルと `packages[""]`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock` の `xrift-studio` エントリーを揃えます。依存パッケージの版番号は変更しません。

公開済みの通常リリースだけがアプリの `releases/latest/download/latest.json` から取得されます。ドラフトは公開するまで、プレリリースは通常リリースになるまで自動更新の対象になりません。

| OS | 生成される成果物 |
|---|---|
| Windows | `.msi` (Windows Installer) / `.exe` (NSIS) |
| macOS | `.dmg`（universal — Apple Silicon + Intel） |
| Linux | `.deb` / `.rpm` / `.AppImage` |

**プレリリース／下書き** のオプションもあります（workflow 実行時のフォーム参照）。`draft` を選んだ場合も全ファイルと更新情報を添付し、公開せずに下書きに残します。OS別ビルド、添付、更新情報の生成のどこかで失敗した場合も下書きのまま停止します。

### 添付に失敗した場合

[GitHubのImmutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)では、公開すると添付ファイルとタグが固定されます。公開前に全ファイルを添付する必要があり、公開済みReleaseへの追加や差し替えはできません。ワークフローはビルド前に既存Releaseの状態を確認し、公開済みなら新しい版番号とタグを使うよう案内して停止します。

- **下書きのまま失敗した場合**: 同じcommit・同じタグの実行を再実行できます。添付済みファイルを再利用・更新し、最後に全ファイルから `latest.json` を作り直します。別commitを同じ下書きへ混ぜる操作は停止します。
- **公開済みの版にファイルが不足する場合**: 新しい版番号とタグで配布し直します。Immutable releaseを削除しても、同じタグ名は再利用できません。

2026年9月22日の `v0.10.2` は、`releaseDraft: false` により添付前に公開され、全OSのファイルが未添付のまま固定されました。修正を含むブランチをマージ後、**Release → Run workflow → `v0.10.3`** で実行します。通常公開なら `draft` と `prerelease` は選びません。古い `v0.10.2` の失敗した実行を再実行しても、固定済みReleaseの修復にはなりません。[対象の実行](https://github.com/WebXR-JP/xrift-studio/actions/runs/35712907566)

公開処理の回帰確認は `node --test scripts/prepare-release-notes.test.mjs scripts/github-release.test.mjs` で実行します。実際のReleaseを作らず、公開済みタグの拒否、下書きからの再実行、全OSの更新情報、添付失敗時に公開しないことを確認します。

### 所要時間の作り

OS別ビルドの前に置く検査は `verify` と `Release smoke E2E` の2 jobに分けて同時に走らせます。E2Eは `pnpm e2e:smoke` で主要導線9件に絞り、1台・1 workerで実行します。型検査とコンパイラfixture・公開ステージング検査は引き続き `verify` で行います。

Rust の成果物は `src-tauri/target` と `src-tauri/target-mcp-sidecar` の両方をキャッシュします。MCP sidecar は `--target-dir` で別のディレクトリへ出力するため、`target` だけをキャッシュしていた頃は毎回すべての依存を作り直していました。`Swatinem/rust-cache` の `workspaces` から片方を落とすと、その分がまるごと戻ります。

macOS は universal 版のために sidecar を aarch64 と x86_64 の 2 つ作ります。その後 `beforeBuildCommand` が host 向けに 3 つ目を作らないよう、build job だけが `XRIFT_MCP_SIDECAR_REUSE_PREBUILT` を設定します。この変数を立てると、`scripts/prepare-mcp-sidecar.mjs` は目的の実行ファイルがすでにある場合だけ cargo を省きます。無ければこれまでどおりビルドします。debug と release は同じファイル名へ書き出すので、日常の開発では設定しません。

## 対応状況

[対応範囲](./docs/VISUAL_EDITOR_ROADMAP.md)を参照してください。過去の予定バージョンを現行の実装状況として扱わず、変更対象のソースと照合します。

## コントリビュート

- Issue / Pull Request は歓迎します
- 大きめの変更は事前に Issue で相談いただけるとスムーズです

## 大規模Sceneの開発時計測

React 19.2とReact Three Fiber内蔵のreconcilerは、開発用Performance Tracksへpropsを書き出す際に巨大なTypedArrayなどを列挙・複製する。大規模モデルでは描画前にメモリ不足になるため、開発版の起動時に `console.timeStamp` を無効にして、この任意の計測経路を止めている。Chrome DevToolsのReactタイムライントラックは使えなくなるが、Reactの警告・Profiler、Studioの診断、通常の `performance.mark/measure` は利用できる。本番版には適用しない。React DOMとR3F内蔵reconcilerの両方で列挙量が制限されたら、この回避策を外す。
