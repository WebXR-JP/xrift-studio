---
name: xrift-studio-error-recovery
description: XRift Studio のエラーログや不具合報告から原因を再現し、修正と再発防止を行うときに使う。
---

# エラー報告から再発防止まで

ログから最小構成で再現し、生成処理の原因を修正する。利用者の作品は保つ。個人のパス、ワールド ID、トークン、画像をテストや文書へ転記しない。

## 公開エラーを調べる場所

- `src/lib/visual-editor/publish.ts`: 保存、コンパイル、ステージング、CLI 検査、送信の流れ。
- `src/lib/visual-editor/compiler/compile.ts`: 機能ごとの公開用ファイルの選択。
- `src/lib/visual-editor/compiler/script-emit.ts` と `scene-postprocessing-emit.ts`: runtime の同梱と import の書き換え。
- `packages/xrift-studio-runtime/src/`: Play と公開用コードの共通ソース。
- `cli/convert.fixture.mjs` の `runStagedWorldTypecheck` と `typecheckWithTemplateOptions`: 公開テンプレートと同じ条件で生成コードを型チェックする回帰テスト。

`Cannot find module` が生成コードで出たら、参照先の同梱漏れと平坦化後の相対 import を調べる。型だけの import も公開前の tsc には必要だ。後続の implicit any は型の欠落による連鎖か確認してから直す。any の追加や型チェックの無効化で通さない。

## 再発を減らす修正

ステージングだけでなく生成元を修正する。ユーザーの Scene、Script、Asset を原因未確認のまま消したり初期化したりしない。

見た目の差は[編集・Play・公開の描画契約](../../../docs/AGENT_IMPLEMENTATION.md#rendering-parity)に従い、同じ素材・ローダー・シェーダー・描画処理へ統合して直す。公開側だけの代替材質や色補正を足して似せない。画像の自動変換や公開前の警告だけを対処にせず、作者が見ている実物をそのまま使う経路を修正する。

機能を多く含むテストだけでは、他の機能が依存ファイルを補って欠落を隠す。失敗した機能の最小構成と、依存を偶然補っていた機能がない構成を検査する。代表例はスクリプトなしのポストエフェクト、Text・Image 本体なしの制御処理。具体的な報告に応じて構成を選び、無関係な組み合わせを際限なく増やさない。

アプリ本体の typecheck に加え、問題が発生した生成物も検証する。可能なら修正前に同じエラーで失敗し、修正後に通ることを確かめる。テスト用の一時プロジェクトを使い、実ワールドや公開先を検証目的で変更しない。検証手段は xrift-studio-verify に従う。

原因・修正・検証範囲・未検証を報告する。コード修正、配布、再公開の実施状況を区別する。

再試行の不具合では、設定への記録と処理の完了を区別する。依存パッケージはpackage.jsonへの記載だけでは取得完了を示さない。繰り返し書き出すテストでは、元コードのバックアップと途中の手直しが残ることも確認する。

## SDKの難読化検査が依存ライブラリを拒否した場合

`no-obfuscation`の変数名を、生成したchunkから依存パッケージの配布コードまでたどる。`target: 'esnext'`と`minify: false`でも、配布済みコードの補助関数名は残る。three-vrmの`__defNormalProp`と`__getOwnPropSymbols`はこの経路で誤判定される。

three-vrmの同梱コードは`node scripts/prepare-readable-three-vrm.mjs --check`で固定バージョンの原本と照合する。更新時は同じスクリプトで再生成し、元のライセンスを保つ。拒否された既知のprivate bindingだけを構文解析で改名し、文字列・プロパティ名・公開export・利用者のコードを書き換えない。クラスの内部名を変える場合は、元のconstructor.nameとdescriptorを保つ。定義中に名前を読む処理など、原本の構造が変わった場合は生成を止めて見直す。検査ルールの無効化は修正に含めない。

型チェックに加え、隔離した生成物を実際にビルドし、公式CLIの検査を通す。変更前の拒否理由と変更後の結果を記録し、同じ素材で編集・生成コードの描画も比較する。

## スキルの改善

新しい報告から再利用できる判断が得られたときだけ、このスキルを狭く更新する。個別ログの蓄積や、全作業に適用する禁止事項へ膨らませない。`.agents/skills/` と `.claude/skills/` のコピーを同期する。
