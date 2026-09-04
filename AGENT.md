# XRift Studio Agent Guide

このファイルは、XRift Studio の開発を支援する AI エージェント向けのプロジェクトルールです。

## プロジェクトの前提

- UI は React 19 + TypeScript + Vite + Tailwind CSS で構築する。
- デスクトップ機能は Tauri v2 の Rust バックエンドで実装する。
- Tauri の IPC は `src/lib/tauri.ts` にラッパーを追加し、React コンポーネントから Rust コマンドを直接呼ばない。
- ブラウザだけで確認できる機能は `PreviewApp.tsx` と GitHub Pages のプレビューにも反映する。ただし、ファイル操作・CLI 実行・ログインなどのネイティブ機能はデスクトップ版で扱う。
- パッケージのインストールや更新では、リポジトリの Takumi Guard 設定に従い、ロックファイルを更新する。

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

1. 静的チェック: `pnpm typecheck`。Rust に触れたら `cargo check --manifest-path src-tauri/Cargo.toml`。Rust のコードやテストが参照するファイル（`public/` の同梱アセットを含む）を消したり動かしたりしたら、`cargo test --manifest-path src-tauri/Cargo.toml` まで実行する。`cargo check` はテストコードをコンパイルしないので、`include_bytes!` の参照切れを見落とす。
2. ブラウザプレビュー: Vite を port 1420 で起動し、LP は `http://localhost:1420/preview.html` で確認する。Claude Code では `.claude/launch.json` の `web` 設定を再利用できる。HMR が効くので保存ごとに再起動しない。メインアプリは Tauri IPC を使うためブラウザでは確認できない。
3. デスクトップ実機: `pnpm tauri:dev` をバックグラウンドで起動し、Tauri MCP でスクリーンショット・DOM・コンソール・IPC を確認する。確認が終わったらプロセスを停止する。

通常の開発、レビュー、Push 前の確認では、`pnpm build`、`pnpm build:preview`、`pnpm tauri:build`、インストーラ生成などの本番ビルドを検証項目に含めない。`pnpm typecheck`、`cargo check`、Vite の開発サーバー、必要に応じた Tauri のデバッグ起動で確認する。本番ビルドは次の場合に限って実行する。ユーザーから明示的に依頼された場合、リリース成果物を作る直前、署名・バンドル・インストーラ設定を変更した場合だ。その場合も、目的、対象 OS、所要時間の見込みを伝え、事前にユーザーの許可を得る。

許可なしで実行できるのは次のとおりだ。上記の静的チェックとデバッグ起動、Tauri MCP による読み取り（スクリーンショット・DOM・ログ・IPC 監視）、作業単位のコミットだ。

事前にユーザーの許可が必要なのは次のとおりだ。例外時の本番ビルドとインストーラ生成、実機での書き込みを伴う UI 操作（ログイン、アップロード、削除、リセット）、アプリデータや公開先の変更、`git push` だ。

## Tauri MCP Bridge

このプロジェクトは、開発時の画面確認・UI 操作・コンソールログ・IPC 監視のために
[`mcp-server-tauri`](https://github.com/hypothesi/mcp-server-tauri) を使う。

- 接続にはリポジトリの `.mcp.json` にある `tauri` サーバー設定を使う。
- Tauri 側の `tauri-plugin-mcp-bridge` は `debug_assertions` のときだけ有効になる。リリースビルドには開発用ブリッジを追加しない。
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

- UI を変更・追加する前に [UX 原則](./docs/UX_PRINCIPLES.md) を読み、対象機能の「操作前・処理中・成功時・失敗時・戻り先」を設計する。画面だけを追加して終わらせず、完了後に取る次の行動を画面に残す。
- UI を変更・追加するときは、同じ画面の既存コンポーネント（モーダル、ダイアログ、ボタン、通知）の実装を先に確認し、既存のレイアウト、角丸、余白、色トークン、フォーカス表現を再利用する。新しい配色や強い装飾は独自の判断で追加しない。既存パターンと変える場合は、理由をUX原則または機能仕様に記録する。
- [マイクロインタラクション Wiki](./docs/UX_INTERACTIONS.md) の機能 ID と `MI-xx` を確認し、追加する機能の状態遷移を先に記録する。既存項目に当てはまらない動きを追加する場合は、目的、開始条件、時間、終了状態を Wiki に追記する。
- 新しい作成・起動・公開・更新フローでは、成功トーストだけで終わらせない。作成物、起動 URL、公開 URL、更新後のバージョンなど、結果そのものへ移動または到達できる表示を画面に残す。
- ワールドのアップロード前には、`xrift.json` のタイトル・説明とサムネイルがテンプレートのままではないことを確認する。未編集ならアップロードを開始せず、編集、保存、残りの確認、アップロードまでを途切れずにつなげる。
- 一覧画面では、作成入口を常に見つけられる位置に置き、各項目には見分けが付く情報と、空・読み込み中・失敗の表示を用意する。削除や一時的な操作を除き、作成者の文脈を不用意に失わせない。
- 進行する処理には実行中の表示と重複操作の防止を付ける。失敗時は次に取る行動または確認先を示し、処理中に安全でない中断ができるようには見せない。
- 静かな白・グレーを基調にし、ブランド色は主操作、成功中の URL、更新対象など意味のある強調に限定する。短く控えめな動きは画面遷移や状態変化を補助するためだけに使う。
- Markdown 文書、画面文言、コミットメッセージでは絵文字を使わない。アイコンだけに意味を持たせず、主要操作には読めるラベルか `title` を付ける。
- 新しい画面は、まずブラウザで動く React の状態・表示を作り、Tauri 固有処理を小さな IPC ラッパーへ分離する。
- XRift のワールド内 Component、公式 Component、3D Asset の見た目を、SVG、CSS 図形、DOM の疑似サムネイルで置き換えない。Edit、Play、カタログのいずれも `@xrift/world-components` 本体または同じ Three.js / React Three Fiber の描画経路を使う。公式 Component が Context を必要とする場合は Studio 用 Provider bridge を用意し、独自の古いデザインを書き直さない。Component 自体が子要素だけを包む wrapper の場合は、公式 sample の WebGL 子要素を表示する。実レンダリングできない対象は架空の見た目を作らず、未対応の理由を明示する。
- ネイティブ API が使えないブラウザプレビューでは、成功したように見えるモックを実機能と混同させない。画面上でサンプル・デモであることを明示する。
- 新しい Component を Add Component メニューへ足すときは、同じ作業単位で Inspector の削除導線も用意する。`ComponentCard` の `remove` を使い、削除ハンドラは `VisualEditorPrototype` の `handleRemoveComponent` に通す。Transform のように削除できない Component は、押しても削除できない理由が分かる通知を返す。Inspector に専用 UI を持たない種別も共通カードを表示し、見えない Component を残さない。追加できて外せない Component を残すと、Entity ごと作り直すしかなくなる。
- Scene 設定画面へ項目を足したら、同じ作業単位で「その項目をビューアーごとに実行時へ変えられるか」を決める。見え方に関わる項目 (ポストエフェクト、フォグ、環境光、Skybox、露出、視野角) は、`packages/xrift-studio-runtime/src/script/scene-runtime.tsx` の bridge へ override を足し、Interactivity Graph の `scene` ターゲットと `ctx.viewer` の両方から書けるようにする。シーン設定は全ビューアー共通なので、これを省くと「重い端末では切り捨てる」か「品質を下げる」かの二択になる。書き込みは常に client-local とし、他のビューアーへ同期せず、Stop と再入室でシーン設定へ戻す。編集時だけの項目 (ギズモ、グリッド、Editor 背景) は対象外で、その理由を `docs/KHR_INTERACTIVITY_EDITOR.md` へ書く。
- Interactivity Graph が Entity の Component を書けるようにするときは、Play と公開先が同じ runtime bridge を通ることを先に確かめる。bridge が無い Component は、まず bridge を足してから property を公開する。Inspector の Component 一覧に出るのに「プロパティを変える」の対象に出てこない Component を残さない。対象に入れない判断をした場合は、その理由を `docs/KHR_INTERACTIVITY_EDITOR.md` の「What a trigger can write」へ書く。
- 数値でない値 (Asset id、文字列) を Graph の property にするときは、`configuration` へ置き、value socket を使わない。KHR_interactivity に string 型は無く、Asset も文も補間できる量ではないので、duration は効かせない。Asset を指す property を足したら、同じ作業単位で Component の `assetReferences` を graph から導出し、compiler が公開物へ含めるところまでつなげる。導出ではグラフの全 action node を読む。`xrift/onInteract` から辿るだけでは、自分で始まるグラフの依存が記録されない。
- Editor に新しい操作を足したら、同じ作業単位で MCP tool も足す。Inspector やツールバーからしか触れない操作は、AI から見ると存在しない機能になる。手順と surface ごとの権限は `docs/MCP_EDITOR_TOOLS.md` にある。公開しない判断をした場合は、その理由を同じ文書の「意図的に公開していない操作」へ記録する。
- 公開した World が配信できるのは World 直下のファイルだけだ。`public/` のサブディレクトリは公開物に含まれないので、Asset、decoder、font、Runtime manifest はすべて `public/` 直下へ平坦に置き、名前で衝突を避ける。詳細は `docs/SCRIPTING.md` の「公開物はワールド直下にしか置けない」にある。
- Entity 単位で描くコンポーネントへ `SceneDocument` そのものを渡さない。Scene View の Entity tree は `scene-entity-tree-store.ts` の per-Entity 購読と、全ノード共通の値だけを載せた context の二経路で描く。ノードへ渡してよい prop は、親 Entity から決まる値 (`entityId`、`inheritedRigidBody`、`ancestorEnabled`) だけだ。Scene を上から配ると、1 Entity の編集で全 Entity の props が変わり、`memo` が一切効かなくなる。逆に Entity を親から配るだけでも届かない。Component を 1 つ足しても祖先の Entity は変わらないので、memo した親が再描画を止め、変更が葉へ届かなくなる。更新は上からではなく横から入れる。
- SceneDocument を作り直す処理では、変更していない Entity のオブジェクト同一性を保つ。`editor-session.ts` の更新は `{ ...scene.entities, [id]: { ...entity } }` の形を守り、`prefab-resolver.ts` は Prefab を展開した Entity だけを差し替えて、それ以外は参照のまま返す。防御的に全 Entity を clone すると、`memo` も `useMemo` も比較で必ず外れ、Scene 全体の再描画に戻る。
- 一覧を描くパネルで行数が Scene の Entity 数や Asset 数に比例する場合は、行を `memo` した部品として切り出す。行が親の closure を呼ぶ必要があるときは、毎 render で更新する 1 つの ref に束ねて渡す。closure を prop として直接渡すと毎 render で同一性が変わり、`memo` が意味を失う。
- Scene View の描画品質は、devicePixelRatio の範囲ではなく CSS 表示サイズに対する固定の割合で持つ。React Three Fiber は渡された範囲へディスプレイの devicePixelRatio を丸め込むので、範囲で書くと 1 倍ディスプレイでは何も軽くならない。ラベルの割合と実際に描くピクセル数を一致させる。
- MCP でワールドを作る・良くする作業（Scene へ物を置く、雰囲気を変える）は、`.agents/skills/xrift-world-direction/SKILL.md` を先に読み、設計図（blueprint）を書いてから始める。作業を止めてよいのは Script 承認・ログイン・公開の場合だけだ。Terrain・草・ポストエフェクト・外部素材を使うかどうかは設計図に照らして決める。数値の上限、コードの雛形、入手先の順位付けはハーネスに入れない。理由は `docs/WORLD_AUTHORING_HARNESS.md` にある。
- MCP tool の description と server の `instructions` は、AI client が読む唯一の取扱説明書だ。tool を足す・直すときは「何をするか」に加えて「選ぶ基準」「使ったあと何をするか」「行き詰まりやすい点」を書く。代わりになる tool があれば名前を挙げる。説明文では防げない失敗は、戻り値の `harness` 警告のようにコードの側に書く。
- Rust コマンドへ外部入力を渡すときは、既存のパス検証と権限制御を保ち、任意のパス実行や削除を追加しない。
- 検証は「高速フィードバックループ」の 3 段階に従う。
- 作業単位ごとに意図が分かるコミットを作り、ユーザーの指示がある場合は `main` へ Push する。

## 参照

- 開発手順: `DEVELOPMENT.md`
- Tauri バックエンド: `src-tauri/src/lib.rs`
- フロントエンド IPC ラッパー: `src/lib/tauri.ts`
- Web プレビュー: `src/PreviewApp.tsx`
- UX 原則: `docs/UX_PRINCIPLES.md`
- マイクロインタラクション Wiki: `docs/UX_INTERACTIONS.md`
- Scripting の契約: `docs/SCRIPTING.md`
- MCP editor tool の全体像: `docs/MCP_EDITOR_TOOLS.md`
- ワールド制作の録画: `docs/RECORDING.md`
- UX スキル: `.agents/skills/xrift-studio-ux/SKILL.md`
- 機能追加の方針スキル: `.agents/skills/xrift-studio-feature/SKILL.md`
- 検証ループスキル: `.agents/skills/xrift-studio-verify/SKILL.md`
- Blender × Studio モデリングスキル: `.agents/skills/xrift-mcp-blender-modeling/SKILL.md`
- ワールドの制作工程: `.agents/skills/xrift-world-direction/SKILL.md`
- ワールド制作ハーネスの設計: `docs/WORLD_AUTHORING_HARNESS.md`
- リリース動画の企画と台本: `.agents/skills/xrift-release-promo-video/SKILL.md`
- リリース動画キット: `.agents/skills/xrift-promo-kit/SKILL.md`（実装は `dev/release-promo/_kit`）
- リリース動画の音: `.agents/skills/xrift-promo-audio/SKILL.md`
- リリース動画の実画面収録: `.agents/skills/xrift-promo-capture/SKILL.md`
- MCP画面デバッグ: `docs/MCP_DEBUGGING.md`
