# XRift Studio Agent Guide

このファイルは、XRift Studio の開発を支援する AI エージェント向けのプロジェクトルールです。

## プロジェクトの前提

- UI は React 19 + TypeScript + Vite + Tailwind CSS で構築する。
- デスクトップ機能は Tauri v2 の Rust バックエンドで実装する。
- Tauri の IPC は `src/lib/tauri.ts` にラッパーを追加し、React コンポーネントから Rust コマンドを直接散在させない。
- ブラウザだけで確認できる機能は `PreviewApp.tsx` と GitHub Pages のプレビューにも反映する。ただし、ファイル操作・CLI 実行・ログインなどのネイティブ機能はデスクトップ版の責務とする。
- パッケージのインストールや更新は、リポジトリの Takumi Guard 設定を尊重し、ロックファイルを更新する。

## 日常のコマンド

```bash
pnpm install
pnpm dev                 # React/Vite のブラウザ開発
pnpm tauri:dev           # Tauri デスクトップ開発
pnpm typecheck
pnpm build               # Tauri 用フロントエンドのビルド
pnpm tauri:build         # OS 向けパッケージのビルド
pnpm build:preview       # GitHub Pages 用プレビューのビルド
```

## 高速フィードバックループ

変更を加えたら、軽い順に次の 3 段階で確認する。Claude Code では `.claude/settings.json` の許可設定を使い、Codex では現在のセッションの実行許可に従う。詳細な手順は `.agents/skills/xrift-studio-verify/SKILL.md` にある。

1. 静的チェック: `pnpm typecheck`。Rust を触ったら `cargo check --manifest-path src-tauri/Cargo.toml`。
2. ブラウザプレビュー: Vite を port 1420 で起動し、LP は `http://localhost:1420/preview.html` で確認する。Claude Code では `.claude/launch.json` の `web` 設定を再利用できる。HMR が効くので保存ごとに再起動しない。メインアプリは Tauri IPC 前提のためブラウザでは確認できない。
3. デスクトップ実機: `pnpm tauri:dev` をバックグラウンドで起動し、Tauri MCP でスクリーンショット・DOM・コンソール・IPC を確認する。終わったらプロセスを停止する。

通常の開発、レビュー、Push 前の確認では、時間のかかる `pnpm tauri:build` とインストーラ生成を検証項目に含めない。実行するのは、ユーザーから明示的に依頼された場合、リリース直前の確認、署名、バンドル、インストーラ設定を変更した場合に限る。その場合も、目的、対象 OS、所要時間の見込みを伝え、事前にユーザーの許可を得る。

許可なしで実行してよいもの: 上記の静的チェックとデバッグ起動、Tauri MCP による読み取り（スクリーンショット・DOM・ログ・IPC 監視）、作業単位のコミット。

事前にユーザーの許可が必要なもの: ネイティブビルドが必要な例外時の `pnpm tauri:build` とインストーラ生成、実機での書き込みを伴う UI 操作（ログイン、アップロード、削除、リセット）、アプリデータや公開先の変更、`git push`。

## Tauri MCP Bridge

このプロジェクトは、開発時の画面確認・UI 操作・コンソールログ・IPC 監視のために
[`mcp-server-tauri`](https://github.com/hypothesi/mcp-server-tauri) を使う。

- AI クライアントはリポジトリの `.mcp.json` にある `tauri` サーバー設定を使う。
- Tauri 側の `tauri-plugin-mcp-bridge` は `debug_assertions` のときだけ有効になる。リリースビルドへ開発用ブリッジを追加しない。
- `src-tauri/tauri.conf.json` の `withGlobalTauri` と `src-tauri/capabilities/default.json` の `mcp-bridge:default` は MCP 接続に必要な設定なので、削除しない。
- MCP を使うときは、まず `pnpm tauri:dev` でアプリを起動し、その後 AI クライアントを MCP 設定ごと再読み込みする。
- セッションに `tauri` MCP サーバーが接続されていない場合は、`pnpm mcp:cli`（@hypothesi/tauri-mcp-cli）で同じ操作を CLI から行える。
- 画面を変更したら、MCP でスクリーンショットまたは DOM スナップショットを取得し、主要導線・コンソールエラー・必要な IPC を確認する。

## MCP を使った確認の例

```text
アプリのデバッグ版を起動し、Tauri MCP で次を確認してください。
1. ウィンドウのスクリーンショットを取得
2. DOM スナップショットで主要ボタンを確認
3. コンソールログにエラーがないか確認
4. セットアップ画面の操作で発生する IPC を監視
```

## 実装ルール

- UI を変更・追加する前に [UX 原則](./docs/UX_PRINCIPLES.md) を読み、対象機能の「操作前・処理中・成功時・失敗時・戻り先」を設計する。画面だけを追加して、完了後の次の一手をユーザーに探させない。
- [マイクロインタラクション Wiki](./docs/UX_INTERACTIONS.md) の機能 ID と `MI-xx` を確認し、追加する機能の状態遷移を先に記録する。既存項目に当てはまらない動きを追加する場合は、目的、開始条件、時間、終了状態を Wiki に追記する。
- 新しい作成・起動・公開・更新フローでは、成功トーストだけで終わらせない。作成物、起動 URL、公開 URL、更新後のバージョンなど、結果そのものへ移動または到達できる状態を画面に残す。
- ワールドのアップロード前には、`xrift.json` のタイトル・説明とサムネイルがテンプレートのままではないことを確認する。未編集ならアップロードを開始せず、編集、保存、残りの確認、アップロードまでを途切れずにつなぐ。
- 一覧画面では、作成入口を常に発見できる位置に置き、各項目を視覚的に識別できる情報と、空・読み込み中・失敗の状態を用意する。削除や一時的な操作を除き、作成者の文脈を不用意に失わせない。
- 進行する処理には実行中の表示と重複操作の防止を付ける。失敗時は次に取る行動または確認先を示し、処理中に安全でない中断をできるように見せない。
- 静かな白・グレーを基調にし、ブランド色は主操作、成功中の URL、更新対象など意味のある強調に限定する。短く控えめな動きは画面遷移や状態変化を補助するためだけに使う。
- Markdown 文書、画面文言、コミットメッセージでは絵文字を使わない。アイコンだけに意味を預けず、主要操作には読めるラベルか `title` を付ける。
- 新しい画面は、まずブラウザで動く React の状態・表示を作り、Tauri 固有処理を小さな IPC ラッパーへ分離する。
- ネイティブ API が使えないブラウザプレビューでは、成功したように見せるモックを実機能と混同させない。画面上でサンプル・デモであることを明示する。
- Rust コマンドへ外部入力を渡すときは、既存のパス検証と権限制御を維持し、任意のパス実行や削除を追加しない。
- 検証は「高速フィードバックループ」の 3 段階に従う。`pnpm typecheck`、`cargo check`、ブラウザプレビュー、検証目的の `pnpm tauri:dev` 起動と MCP での読み取りは許可なしで行う。`pnpm tauri:build` とインストーラ生成は通常の開発確認では実行せず、明示依頼、リリース直前、署名、バンドル、インストーラ設定の変更時だけ候補にする。実行前に目的と副作用を示してユーザーの許可を得る。実機での書き込みを伴う UI 操作も事前に許可を得る。許可なくビルド成果物、アプリデータ、公開先を変更しない。
- 作業単位ごとに意図が分かるコミットを作成し、ユーザーの指示がある場合は `main` へ Push する。

## 参照

- 開発手順: `DEVELOPMENT.md`
- Tauri バックエンド: `src-tauri/src/lib.rs`
- フロントエンド IPC ラッパー: `src/lib/tauri.ts`
- Web プレビュー: `src/PreviewApp.tsx`
- UX 原則: `docs/UX_PRINCIPLES.md`
- マイクロインタラクション Wiki: `docs/UX_INTERACTIONS.md`
- UX スキル: `.agents/skills/xrift-studio-ux/SKILL.md`
- 機能追加の方針スキル: `.agents/skills/xrift-studio-feature/SKILL.md`
- 検証ループスキル: `.agents/skills/xrift-studio-verify/SKILL.md`
