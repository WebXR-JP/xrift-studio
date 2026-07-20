---
name: xrift-studio-feature
description: XRift Studio に機能を追加・変更するときの標準手順と方針。新しい画面・ボタン・Tauri コマンド・CLI 連携の追加、既存フローの変更時に使う。「機能を追加」「新しい画面」「コマンドを追加」「〜できるようにして」で発動。
---

# XRift Studio 機能追加の方針

## 進め方（この順番を守る）

1. 設計: xrift-studio-ux スキルと docs/UX_PRINCIPLES.md に沿って「操作前・処理中・成功・失敗・戻り先」を決める。対応する動きを docs/UX_INTERACTIONS.md の MI-xx として記録する。
2. ブラウザで動く部分から実装: React の状態と表示を先に作る。この段階では Tauri API を呼ばない。
3. ネイティブが必要になったら IPC を分離: 下の「Tauri コマンドの追加手順」に従う。
4. 検証: xrift-studio-verify スキルの Tier 0 → 1 → 2 の順で確認する。
5. コミット: 作業単位ごとに意図が分かるメッセージでコミットする。Push はユーザーの指示があるときだけ。

## レイヤー構成

| 層 | 場所 | 役割 |
|---|---|---|
| UI | src/components/ | 状態表示と操作。invoke や Command を直接呼ばない |
| IPC ラッパー | src/lib/tauri.ts | invoke を型付き関数に包む |
| CLI ラッパー | src/lib/xrift-cli.ts | tauri-plugin-shell 経由で xrift CLI を実行し、LogLine を流す |
| Rust バックエンド | src-tauri/src/lib.rs | ファイル操作・ランタイム管理などのネイティブ処理 |
| Web プレビュー | src/PreviewApp.tsx | GitHub Pages 用 LP。実アプリと乖離させない |

## Tauri コマンド (IPC) の追加手順

1. src-tauri/src/lib.rs に `#[tauri::command]` 関数を追加する
2. 同ファイル末尾の `invoke_handler(tauri::generate_handler![...])` に登録する
3. src/lib/tauri.ts に型付きラッパーを追加する（Rust 側 snake_case、TS 側 camelCase。引数名は invoke の camelCase 変換に合わせる）
4. シェル実行や新しいネイティブ権限が必要なら src-tauri/capabilities/default.json に追記する
5. 既存のパス検証・権限制御を維持する。プロジェクトルート外への任意アクセスや任意コマンド実行を追加しない
6. `cargo check --manifest-path src-tauri/Cargo.toml` と `pnpm typecheck` を通す

## 状態と導線の実装ルール

- 実行中の処理は App.tsx / EditorView.tsx の `wrap` パターン（busy + finally）を踏襲し、ボタンの無効化とラベル変化で二重操作を防ぐ
- 処理のログは appendLog で LogsPane に流す。ユーザー向けの結果は Toast で伝える
- 成功トーストだけで終わらせない。作成物を開く、URL を開く、更新後の状態を見せる、のいずれかに到達できる UI を残す
- 公開に関わる機能は src/lib/publish-readiness.ts の事前チェック（タイトル・説明・サムネイルが初期値のままでないか）と整合させる
- 新しい依存パッケージは追加前に必要性を説明する。ロックファイル（pnpm-lock.yaml）を必ず更新する

## LP (Web プレビュー) との同期

- 実アプリの見た目・導線を変えたら、PreviewApp.tsx のサンプルが実アプリと食い違っていないか確認し、必要なら追従させる
- LP はブラウザで動く範囲のサンプルであることを画面上に明示する。ネイティブ機能が動くように見せない
- LP のサンプルコードは、`xrift create world` が生成する実テンプレート（@xrift/world-components + React Three Fiber + Rapier）に合わせる

## 参照

- エージェント全体ルール: AGENT.md
- UX 設計: .claude/skills/xrift-studio-ux/SKILL.md, docs/UX_PRINCIPLES.md, docs/UX_INTERACTIONS.md
- 検証ループ: .claude/skills/xrift-studio-verify/SKILL.md
- xrift CLI の仕様: xrift-cli スキル（ユーザーレベル）
