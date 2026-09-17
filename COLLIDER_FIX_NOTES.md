> 前回段階の修正記録です。Playを含む最終版の説明と最新検証結果は `PLAY_COLLIDER_FIX_NOTES.md` を参照してください。

# 当たり判定の修正

対象: `xrift-studio-authoring-workflow-no-diagnostics(1).zip` のソース。
修正版のソース一式と回帰テストです。Windows向け実行ファイルではありません。

## 修正内容

### モデルが表示されても当たり判定ができない

自動コライダーの初回走査より後にモデルが読み込まれると、空の形状や読み込み中の仮の箱を使ったままになる経路がありました。

- 読み込み後のThree.jsオブジェクトの追加・削除を監視し、衝突形状を生成し直します。
- モデル読み込み中の仮の箱は衝突対象から除外します。
- 衝突形状の更新でモデル・スクリプト・Rigid Body全体を再マウントしません。
- 描画距離や描画用インスタンシングで見た目が非表示になっても、床の衝突を消さないようにしています。
- Play、Classic JSX出力、ランタイムのソースで同じ生成処理を使います。

### 既存のMesh Colliderを使う場合

「当たり判定に追加」は、既存のComponentを再利用して、固定のRigid Body・Trimesh・Triggerなしにそろえます。無効なComponentの再有効化、重複したRigid Bodyの整理、Collider固有の摩擦・反発・Trigger設定の反映も修正しました。

明示的なMesh Colliderと親の自動生成を二重に適用しないようにしています。Colliderの設定は削除せず、無効化して残します。

### 親・子・共有モデル

共有モデルの一部を外す場合は、親側の広い判定を解除し、残すノードに判定を分けます。共有モデル全体を外す場合は、子ノードに残っている判定も解除します。子に独立したRigid Bodyがあっても、表示モデルの親に残る自動生成を確認します。

「これだけを歩けるようにする」は、編集データ内のほかのColliderと自動生成を解除します。Scriptや公式ギミックの内部で独自に生成するColliderは対象外です。

### 形状・座標・読み込み待ち

- 頂点配列を直接コピーせず、アクセサーを通して読みます。glTFのInterleavedBufferAttributeも考慮しています。
- インデックスの範囲、有限な頂点値、三角形を検証し、面積のない三角形を除外します。
- 子のTransformを頂点へ反映し、衝突形状は所有Rigid Bodyの座標系に配置します。階層のScaleが位置に重複適用される経路を避けています。
- 反転した形状の面の向きと、InstancedMeshの個別Transformを扱います。
- 共有ノードや衝突用モデルの読み込みもPlayの準備待ちに含めます。
- 読み込み途中でも15秒で歩行を強制開始してしまう処理を取り除きました。準備中は既存の表示を出し、Playを停止できます。
- Triggerのみの場合は、通り抜ける設定であることをInspectorに表示します。

## 実施した確認

| 確認 | 結果 |
| --- | --- |
| Colliderの追加・解除・再有効化・共有モデルの設定操作 | 46 assertions 合格 |
| 頂点変換・Interleaved・反転・子要素監視など | 24 assertions 合格 |
| 添付済みRapier 0.19.2 WASMによる物理シミュレーション | 9ケース、22 assertions 合格 |
| 既存Hierarchy Transferの回帰テスト | 20ケース、290 assertions 合格 |
| 既存Authoring Workflowの回帰テスト | 42 assertions 合格 |
| 変更ソース13ファイルの構文・接続箇所のチェック | 21 assertions 合格。型チェックではありません |
| Fixtureの実行登録チェック | 115 suitesが登録済み。115 suites全体を実行したという意味ではありません |
| 差分の空白・競合マーカー確認 | `git diff --check` 合格 |

物理シミュレーションでは、床への着地、解除後の落下、Triggerの通り抜け、Triggerを解除した床、移動・拡縮した床、反転した床、穴のある床、形状の差し替え、両側からの壁への衝突、Rapier Character Controllerの接地を確認しました。

イベント監視のテストはObject3Dのイベント契約の単体テストです。物理テストには本物のRapier WASMを使っていますが、React Three Fiberの画面描画を含むE2Eテストではありません。

### この環境で実行できなかった確認

依存パッケージを取得できず、アプリ全体の型チェックは`three`、`react`などの未導入エラーで失敗しました。コンパイラー全体のfixtureも`three`不足で起動できていません。Tauri/Webエディターの起動、実際のワールドを歩く操作、公開先での実機確認は未実施です。成功扱いにはしていません。

単体テストと構文検査にはNode 22.16.0、環境内のTypeScript 5.8.3を使用しました。プロジェクト指定のTypeScript 7.0.2による検証ではありません。依存定義・ロックファイルは変更していません。

`public/xrift-runtime-shell`は添付時の既存ファイルを保持し、再ビルドしていません。ブラウザから直接公開するための事前ビルド済みシェルへ反映するには、依存導入後に以下を実行してください。

```sh
pnpm runtime:build
node scripts/build-world-runtime-shell.mjs
```

## テストの再実行

依存を導入したプロジェクトのルートで実行します。

```sh
node scripts/run-authoring-fixtures.cjs
node scripts/test-mesh-collider-physics.cjs
node scripts/check-mesh-collider-sources.cjs
node scripts/check-fixture-coverage.mjs
pnpm typecheck
pnpm cli:test
```

`run-authoring-fixtures.cjs`はNode 22.15以降を使います。TypeScriptを別の場所に導入している場合は、`XRIFT_TYPESCRIPT_PATH`で指定できます。

## 残る仕様上の注意

- 親の自動Cuboid/Ballを、一部の子だけ除外するために勝手にTrimeshへ変換しません。形状を維持した分割ができない場合は操作を止め、親の自動生成を解除する案内を出します。子を持たないEntity自身の自動Cuboid/Ballは追加・解除操作で置き換えられます。
- 動くRigid BodyのTrimeshをConvex Hullにする既存方針は維持しています。「当たり判定に追加」は歩行面向けの固定Trimeshを設定します。
- Shader変形・Skinned Meshの毎フレームの変形に追従する衝突判定を追加したものではありません。
- モデルの欠損や不正な形状を、仮の床で成功したように見せる処理は入れていません。

既存プロジェクトでの確認は、一度Playを停止してから対象メッシュを選び、「当たり判定に追加」を押してPlayを再開してください。既存のMesh Colliderを手動で削除して作り直す必要はありません。
