# 最終版: Collider設定とPlay実行時の修正

対象: `xrift-studio-collider-fix.zip` を土台にしたソース一式。前回のCollider設定・形状生成修正をすべて保持し、Play実行経路の修正を追加しています。

**これは修正済みソースのZIPです。ビルド済みWindowsアプリではありません。アプリ全体のビルド・画面上のPlay操作は、この環境では確認できていません。**

## Play側で追加修正した問題

### 1. Physicsの初期化前に「準備完了」になる

Playの外側にある読み込み監視は、Physics/Suspense配下がまだマウントされていない時も、読み込み中のモデルを0件と数えられました。初期化が遅いと、モデルがまだ登録されていないだけなのに準備完了となる経路です。

`SceneModelLoadCommit` を実際のPhysics配下へ配置し、シーンがコミットされるまで準備完了にしません。非同期モデルと衝突用モデルは、最初の通知を待たずLayout Effectで読み込み中として登録します。

### 2. モデルの読み込み完了と衝突形状の登録完了が別

モデルの読み込みだけで歩行を始めず、Mesh Colliderから実際のRapier Collider参照を受け取り、物理空間に登録されていることまで確認します。形状更新ごとに世代を分け、古い生成結果が新しい形状の準備完了を通知しないようにしました。

準備中は重力だけでなくPhysics自体を一時停止します。準備完了後に物理計算を1ステップ進め、その通知を受けてから既存の公式PhysicsPlayerをマウントします。プレイヤー制御を独自実装へ置き換えたものではありません。

### 3. 失敗した読み込みを成功扱いしない

モデルの読み込み失敗、衝突用モデルの欠損、指定した共有ノードに有効な衝突形状がない場合などは、開始前のエラーとして保持します。準備完了にはせず、既存のPlay表示に原因と停止後の確認案内を出します。失敗を仮の箱・仮の床で隠しません。

複数のメッシュの一部に無効な面があっても、有効な形状を取得できる部分は使用します。候補があるのにすべて無効なら生成エラーにします。子がまだないコンテナー自体は不正なモデルとは扱いません。

### 4. Stop→Playの古い状態を持ち越さない

編集/Playの切り替えでPhysicsと読み込みトラッカーを作り直します。停止済みの読み込み通知・タイマー・形状更新の結果を破棄し、前の準備完了状態を次のPlayで再利用しません。

### 5. 共有モデルの一部をColliderにした場合

`sourceNodeIndex` も読み込み依存関係へ含めました。別ノードへ切り替えた直後に、前のノードの衝突形状を使わないようにします。指定された衝突用モデルが欠けている時に、描画用モデルへ黙って置き換える経路も取り除いています。

### 6. ランタイムと出力側

Play・ランタイム・Classic JSX出力は、共通のメッシュ衝突生成ソースを使います。追加した型・Context・Hookの依存もClassic JSXへ含め、生成された補助コードの構文を検査しています。

ランタイムの非同期ロード前後でHookの呼び出し数が変わる経路も修正しました。

## 確認した範囲

実行環境: Node 22.16.0 / TypeScript 5.8.3 / 添付済みRapier 0.19.2 WASM。

| 検証 | 結果 |
| --- | --- |
| Play開始判定の状態遷移 | 27 assertions 合格 |
| Play開始・再実行の物理ワークフロー | 4ケース / 33 assertions 合格 |
| 既存の床・壁・Trigger・反転・穴・形状差し替え・接地 | 9ケース / 22 assertions 合格 |
| Collider設定操作 | 46 assertions 合格 |
| 形状変換・子要素監視 | 24 assertions 合格 |
| 既存Playセッションfixture | 合格。件数を返さないsuiteです |
| Hierarchy Transfer | 20ケース / 290 assertions 合格 |
| Authoring Workflow | 42 assertions 合格 |
| 18ファイルの構文とコードの接続、生成される補助コード | 52 assertions 合格。全体型チェックではありません |
| 新しい開始判定コアとfixtureのstrict型チェック | 合格 |
| fixtureの実行登録確認 | 116 suites登録済み。全116 suitesを実行した意味ではありません |

Play物理ワークフローのテストは、本物のRapierと実装した開始判定コアを使用しています。シーンのマウント/読み込みの時系列を模擬し、Play用カプセル寸法で接地、解除後の落下、再実行時に旧床の判定が残らないことを検証しました。**React Three Fiberの描画、実際の公式PhysicsPlayer、Tauri UIを動かしたE2Eではありません。**

実行結果は `PLAY_COLLIDER_TEST_RESULTS.txt` にあります。以前の `COLLIDER_FIX_NOTES.md` と `COLLIDER_TEST_RESULTS.txt` は前回段階の記録です。

## 未確認・反映が必要な範囲

この環境では依存パッケージを取得できず、アプリ全体の型チェックはReact/Three.js/Rapier等の未導入エラーで失敗しました。プロジェクト指定のTypeScript 7.0.2ではなく、環境内の5.8.3による限定的な検証です。依存定義とロックファイルは変更していません。

アプリ全体のビルド、コンパイラー全fixture、ブラウザ/Tauriの実画面でのPlay、公開先の動作確認は未実施です。単体テストの成功をもって実画面の不具合解消が確認済みとはしていません。

**`public/xrift-runtime-shell` は元の事前ビルド済みファイルを保持しています。ソース修正は含まれますが、ブラウザから直接公開するシェルへ反映するには、依存導入後の再ビルドが必要です。** 主エディターのPlayは今回修正したソース側の経路です。

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm cli:test
pnpm runtime:build
node scripts/build-world-runtime-shell.mjs
pnpm build
```

上記は実環境で行う手順であり、このZIPを作成した環境で全て成功したコマンドではありません。生成済みシェルの文字列を手動で書き換えたり、再ビルド済みとしてmanifestを偽装したりはしていません。

## テストの再実行

プロジェクトルートから、Node 22.15以降とTypeScriptを利用します。

```sh
node scripts/run-authoring-fixtures.cjs
node scripts/test-mesh-collider-physics.cjs
node scripts/test-play-collider-startup.cjs
node scripts/check-mesh-collider-sources.cjs
node scripts/check-fixture-coverage.mjs
```

TypeScriptが別ディレクトリーにある場合は `XRIFT_TYPESCRIPT_PATH` を指定できます。

## 実画面での確認手順

1. 修正済みエディターを起動し、既存プロジェクトを開きます。Play中なら一度停止します。
2. 対象メッシュで「当たり判定に追加」を実行します。既存のMesh Colliderを手動で削除する必要はありません。
3. Playを開始し、準備表示が消えてから床へ接地すること、壁をすり抜けないことを確認します。
4. Stop→「当たり判定から外す」→Playで、対象の判定がなくなることを確認します。
5. 「これだけを歩けるようにする」、共有モデルの別ノード、既存Mesh Colliderの再有効化、Stop→Playを繰り返す場合も確認します。

開始待ちは初回スポーン用です。Play開始後の追加ストリーミングでプレイヤーを毎回再生成する設計にはしていません。また、Shader/Skinned Meshの毎フレーム変形に追従する判定や、公式ギミック内部が独自に生成するColliderの一括解除は追加していません。
