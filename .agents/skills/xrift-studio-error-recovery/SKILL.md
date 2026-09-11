---
name: xrift-studio-error-recovery
description: XRift Studioの失敗報告やエラーログから原因を再現し、修正と回帰確認を行う。
---

# エラー報告から再発防止まで

貼られたログを手掛かりに、利用者の作品を保ったまま Studio 側の原因を修正する。ログだけで原因を断定せず、生成処理と最小の再現条件を確認する。個人のパス、ワールド ID、トークン、画像をテストや文書へ転記しない。

## 公開エラーを調べる場所

- `src/lib/visual-editor/publish.ts`: 保存、コンパイル、ステージング、CLI 検査、送信の流れ。
- `src/lib/visual-editor/compiler/compile.ts`: 機能ごとの公開用ファイルの選択。
- `src/lib/visual-editor/compiler/script-emit.ts` と `scene-postprocessing-emit.ts`: runtime の同梱と import の書き換え。
- `packages/xrift-studio-runtime/src/`: Play と公開用コードの共通ソース。
- `cli/convert.fixture.mjs` の `runStagedWorldTypecheck` と `typecheckWithTemplateOptions`: 公開テンプレートと同じ条件で生成コードを型チェックする回帰テスト。

`Cannot find module` が生成コードで出たら、参照先の同梱漏れと平坦化後の相対 import を調べる。型だけの import も公開前の tsc には必要だ。後続の implicit any は型の欠落による連鎖か確認してから直す。any の追加や型チェックの無効化で通さない。

## 再発を減らす修正

一時的なステージングのファイルだけ直して終わらず、次回の生成でも直る場所を変更する。ユーザーの Scene、Script、Asset を原因未確認のまま消したり初期化したりしない。

機能を多く含むテストだけでは、他の機能が依存ファイルを補って欠落を隠す。失敗した機能の最小構成と、依存を偶然補っていた機能がない構成を検査する。代表例はスクリプトなしのポストエフェクト、Text・Image 本体なしの制御処理。具体的な報告に応じて構成を選び、無関係な組み合わせを際限なく増やさない。

アプリ本体の typecheck に加え、問題が発生した生成物も検証する。可能なら修正前に同じエラーで失敗し、修正後に通ることを確かめる。テスト用の一時プロジェクトを使い、実ワールドや公開先を検証目的で変更しない。検証手段は xrift-studio-verify に従う。

原因、変更、検証済みの範囲、実機で未確認の範囲を短く報告する。コード修正と配布済みアプリへの反映を区別し、実行していない再公開を成功したと伝えない。

再試行の不具合では、設定への記録と処理の完了を区別する。依存パッケージはpackage.jsonへの記載だけでは取得完了を示さない。繰り返し書き出すテストでは、元コードのバックアップと途中の手直しが残ることも確認する。

## スキルの改善

新しい報告から再利用できる判断が得られたときだけ、このスキルを狭く更新する。個別ログの蓄積や、全作業に適用する禁止事項へ膨らませない。`.agents/skills/` と `.claude/skills/` のコピーを同期する。
