# Interactivity 実行エンジンと時間軸シーケンス

## 目的

XRift Studio だけで、時間軸に沿って進行する演出を作れるようにする。

ここでいう演出とは、開始から一定時間かけて、音・光・色・アニメーション・遷移が決められた順番と時刻で起きる体験を指す。数十秒から数分の連続した進行を一つの単位として編集する。Play と公開先で同じ順序・同じ時刻に再生できることを契約とする。

現在の Interactivity は、この用途に対して三つの層すべてが不足している。本書ではその不足を明示する。埋める順序と各層の契約を決める。

## 用語

| 語 | 意味 |
| --- | --- |
| Graph | 一つの `KHR_interactivity` behavior graph |
| Sequence | 開始からの経過時間で進行する Graph の使い方。専用データ形式ではない |
| Cue | ある時刻に発火する一つの動作 |
| Action | Graph が世界へ書き込む操作。Entity、Component、Material、Scene のいずれかを対象にする |
| Host | エンジンから世界を読み書きする境界。Play と公開先で別実装、同一契約 |

## 現状の制約

2026-08 時点の実装を読んだ結果を記録する。設計判断の前提であるため、実装が変わったらこの節も更新する。

### 実行系にインタプリタが存在しない

グラフを実行する経路は二本ある。どちらも静的な走査である。

| 経路 | 実体 | できること |
| --- | --- | --- |
| 開始時 | `packages/xrift-studio-runtime/src/interactivity-adapter.ts` の `walkOnStart` | Model へ埋め込まれた glTF の graph から「アニメ index と遅延秒数」を抽出するだけ |
| インタラクト時 | `packages/xrift-studio-runtime/src/script/interaction-trigger.ts` の `collectXriftInteractionPrograms` | Entity・Audio Source・Light へのプロパティ書き込みの列を抽出するだけ |

実行時の状態を持たない。このため、次のいずれもできない。

- 実行される operation は 8 個だけである。`event/onStart`、`animation/start`、`animation/stop`、`flow/branch`、`flow/setDelay`、および `xrift/onInteract`、`xrift/setProperty`、`xrift/toggleProperty`
- `flow/setDelay` は秒数の加算でしかない。`cancel`、`err`、`lastDelay` を持たない。インタラクト経路では遅延そのものが無視される
- 値ソケットへ他ノードを接続すると、そのノードは評価不能として実行が止まる。定数直書き以外の入力を扱えない
- `event/onTick` を実行しない。このため、時間で変化し続ける表現を書けない
- `pointer/interpolate`、`variable/interpolate` を実行しない。このため、補間が成立しない
- Interactivity Asset の `event/onStart` を実行する呼び出し元が存在しない。Asset は Interaction Trigger 経由でしか動かない。このため、開始時を起点にした Graph は Play でも公開先でも走らない

### グラフの表現力が制限されている

- 検証では、flow は自分より後ろの index、value は前の index しか参照できない決まりになっている（`src/lib/visual-editor/interactivity-graph.ts`）。循環を作れない。このため、繰り返しを表現できない
- ノード配列の index は作成順である。並べ替える手段がない。後から置いたノードを前のノードへ繋ぐと検証エラーになる
- パレットに存在する operation は 13 個だけである。検証が受け付ける `flow/sequence`、`flow/doN`、`flow/for`、`flow/while`、`flow/multiGate`、`flow/waitAll`、`flow/throttle`、`flow/cancelDelay`、`event/send`、`event/receive`、`animation/stopAt`、`math/*`、`variable/*` は、UI から置く手段がない

### 書き込める対象が狭い

インタラクトから書けるのは `entity`、`audio-source`、`light` の三種のみである（`interaction-trigger.ts`）。Transform、Animation、Particle、Material、Post-processing、Scene 遷移は対象外である。Graph からは操作できない。

### 複数グラフの組み合わせが成立しない

- 1 Asset は最大 64 graphs を持てる。ただし、UI は既存 graph を切り替える `select` だけである。追加・複製・リネーム・削除がない
- 実行されるのは常に `extension.graph` が指す 1 本だけである
- Graph 間の呼び出し operation も、共有変数も、イベントの送受信も実装がない

### エディタ操作の欠落と不具合

`src/components/visual-editor/InteractivityGraphEditor.tsx` の現状である。

- `onEdgesChange` がない。このため接続線を選択できず、線を切れない
- `onReconnect` がないまま `edgesReconnectable` を渡している。このため、繋ぎ替えを試しても元に戻る
- `onNodesDelete` がない。このため、Delete キーは接続だけを document から消す。ノードは再生成で復活する
- Undo / Redo がない。Escape と閉じるボタンは編集中の draft を確認なしに破棄する
- コピー、ペースト、複製、整列、グループ、コメントがない
- パネル、Inspector、パレット、ノードカードがすべて固定寸法である。リサイズも最大化もできない
- 実行の可視化がない。どのノードがいつ動いたか、値が何だったかを見る手段がない

## 目標とする能力

時間軸を持つ演出を作るために必要な能力を、実装の有無とあわせて並べる。

| 能力 | 内容 | 現状 |
| --- | --- | --- |
| 時刻起点 | 開始から N 秒で発火する | 加算のみ・Asset では走らない |
| 待機と取り消し | 待機を途中で取り消す | 未実装 |
| 順次実行 | 一つの入力から複数の動作を決まった順で流す | 未実装 |
| 繰り返し | 回数指定、条件指定で繰り返す | 表現不可（循環禁止） |
| 合流 | 複数の完了を待って次へ進む | 未実装 |
| 分岐 | 変数や計算結果で分岐する | 定数のみ |
| 連続変化 | 時間をかけて値を補間する | 未実装 |
| 毎フレーム | 継続的に値を更新する | 未実装 |
| 音の制御 | 再生、停止、音量の時間変化、3D 位置 | 再生設定の即時書き込みのみ |
| 光の制御 | 色と強度の時間変化 | 即時書き込みのみ |
| Transform 制御 | 位置、回転、スケールの変更と補間 | 未実装 |
| Animation 制御 | Component 単位の再生、停止、速度、クリップ選択 | Model 埋め込み index のみ |
| Material 制御 | Base Color、Emissive、不透明度 | pointer 経由の定義のみで未実行 |
| Particle 制御 | 放出の開始、停止、バースト | 未実装 |
| 画面全体の変化 | 露出、フェード、白転換 | 未実装 |
| Scene 遷移 | 次の Scene へ進む | 未実装 |
| 再利用 | 共通の演出をテンプレート化して各所で使う | 未実装 |
| 俯瞰 | 何秒に何が起きるかを一覧・スクラブする | 未実装 |
| デバッグ | 実行中のフローと値を見る | 未実装 |

## 設計

### 1. 実行エンジンを一本化する

静的走査 2 本を廃する。`packages/xrift-studio-runtime/src/interactivity/` の単一インタプリタへ集約する。Studio の Play も公開先も同じモジュールを読み込む。既存の `walkOnStart` と `collectXriftInteractionPrograms` は、当面この上の薄い互換ラッパとして残す。

構成は次の四つに分ける。

- `parse.ts` … 信頼できない JSON を構造的に読む。正規化した実行用グラフにする。読めない要素は捨てない。「実行しない」印を付けて残す
- `evaluate.ts` … 値ソケットの評価。接続先ノードを再帰的に引く pull 方式である。1 回のフロー実行の中では同じノードの出力をメモ化する
- `schedule.ts` … 待機、補間、毎フレームの時間管理
- `engine.ts` … イベント受信、フロー実行、予算管理、トレース記録

#### 評価の分離

`KHR_interactivity` は値とフローで評価方向が逆である。値は必要になった時に引く。フローは起点から押す。この二つを混ぜないことが、循環を許しても停止する条件になる。

- 値の評価: 同一評価中に同じノードへ再入したら循環と判定する。その socket は未評価として扱う。実行を止めるのではない。その入力を型既定値にして診断へ残す
- フローの実行: 循環を許す。代わりにフレームあたりのノード活性化回数に上限を設ける。超えたらそのフレームの残りを打ち切って診断へ残す

#### 予算

暴走したグラフが Play を止めないための上限を決める。値は実装時に確定する。Editor の診断と公開側の診断には同じ数値で表示する。

- 1 フレームあたりのノード活性化上限
- 同時に走る待機と補間の上限
- 1 グラフあたりのノード上限（既存の 1024 を維持）

#### ホスト境界

エンジンは three.js も React も直接触らない。世界への読み書きは `InteractivityHost` 経由に限る。

```ts
export type InteractivityHost = {
  readTarget(target: ActionTarget): number[] | boolean | null;
  writeTarget(target: ActionTarget, value: number[] | boolean): boolean;
  startAnimation(target: AnimationTarget, options: AnimationOptions): void;
  stopAnimation(target: AnimationTarget, atSeconds?: number): void;
  emitSceneEvent(name: string, payload?: Record<string, number | boolean>): void;
  log(entry: InteractivityLogEntry): void;
};
```

Play 側は現在の Audio Source / Light の runtime bridge をそのまま実装として渡す。公開側は生成コードから同じ形の実装を渡す。Script が同じ Component を操作する場合も、既存の bridge を共有するため競合しない。

### 2. Operation の語彙を広げる

`KHR_interactivity` の RC が定義する範囲を、検証だけでなく「置ける・動く」状態まで広げる。優先順位は時間軸の演出に必要な順とする。

第一段階。

- `flow/sequence`、`flow/setDelay`（`cancel` と `lastDelay` を含む完全版）、`flow/cancelDelay`、`flow/doN`、`flow/multiGate`、`flow/waitAll`、`flow/throttle`
- `event/onTick`、`event/send`、`event/receive`
- `variable/get`、`variable/set`、`variable/interpolate`
- `math` の算術、比較、論理、`math/mix`、`math/smoothStep`、`math/random`、`math/clamp`
- `type/*` の変換

第二段階。

- `flow/for`、`flow/while`、`flow/switch`
- `pointer/get`、`pointer/set`、`pointer/interpolate`
- `animation/stopAt`
- `math` の残り（行列、四元数、色空間）

`debug/log` はエディタのデバッグ表示へ出す。公開先では出力先を持たない no-op とする。

### 3. ノード順序の制約を撤廃する

flow は後ろへ、value は前へ、という index 制約を検証から外す。代わりに次を決める。

- 値の循環だけを検証エラーにする。フローの循環は正当な繰り返しであるため許可する
- 保存時に、ノード配列を到達順で正規化する。エディタ上の配置と接続は変えない。index だけを並べ替える
- 正規化は `extras.xriftStudio.position` と全参照を同時に書き換える。可逆な単一操作とする

これで「後から置いたノードを前へ繋ぐと検証エラーになる」という、作成順が正誤を決める状態がなくなる。

### 4. Action の対象を広げる

`XRIFT_studio_interaction` の `targetKind` を増やす。対象ごとに property を宣言する。property registry は既存どおり `packages/xrift-studio-runtime/src/script/interaction-trigger.ts` を単一の正本とする。Play と公開先が同じ表を読む。

| targetKind | 主な property |
| --- | --- |
| `entity` | `enabled`、`position`、`rotation`、`scale` |
| `audio-source` | `volume`、`playing`、`loop`、`pitch` |
| `light` | `color`、`intensity`、`range` |
| `animation` | `playing`、`clip`、`speed`、`time` |
| `material` | `baseColor`、`emissive`、`opacity` |
| `particle` | `emitting`、`burst` |
| `scene` | `exposure`、`fade`、`next` |

`scene` は Scene 全体を対象にする特殊な kind とする。露出と画面フェードは post-processing 側の値へ変換する。`next` は Scene 遷移の要求へ変換する。Scene 遷移は Graph が直接画面を切り替えるのではない。ホストへ要求を出す。遷移の実行はホストの役割とする。

補間つきの書き込みは、専用 operation を増やさない。既存の `xrift/setProperty` に `duration` の value socket と `easing` の configuration を足す形で扱う。`duration` が 0 なら即時になる。正の値なら補間になる。

イージングは任意の曲線ではなく、選ぶ意味のある範囲に絞る。`linear`、`ease-in`、`ease-out`、`ease-in-out`、`ease-in-strong`、`ease-out-strong`、および行き過ぎて戻る `ease-out-back` の 7 種とする。中間値を持たない bool と enum には時間を指定しない。途中の値がない場合は、指定時間の最後に値が切り替わるだけで、補間できないためである。

### 5. Graph の合成

一つの Asset に置いた複数 Graph を、実際に組み合わせられるようにする。

- Graph の追加、複製、リネーム、削除を UI と MCP へ出す
- Graph 間はイベントで結合する。`event/send` で名前付きイベントを送る。別 Graph の `event/receive` が受ける。配送は Asset を実行するホストが持つ。engine 内の自己配送は切る。送信元の Graph にある受け手も 1 回だけ動く。送信の途中で再入しない
- 共通の演出（遷移、フェード、待機付きの再生）は、レシピではなくテンプレート Graph として保存する。別 Asset からも複製できるようにするためである

Graph をまたぐ変数は当面用意しない。共有状態が必要な場合はイベントの payload で渡す。実行順が Graph 間で決まらない状態で共有変数を許すと、Play と公開先で結果が変わり得るためである。

### 6. タイムラインビュー

Graph の編集画面に、時間軸の俯瞰を追加する。

- エンジンを実時間より速く仮実行する。開始から一定時間内に発生する Cue を列挙する
- 横軸を時間、縦軸を対象（Entity・Component・Scene）として Cue を並べる
- 時刻をスクラブすると、その時刻までを仮実行した状態をグラフ側にも反映する。どのノードが動いたかを示す
- 分岐や乱数を含む Graph は結果が一意にならない。その場合は「この時刻より先は入力に依存する」ことを表示する。確定した範囲だけを描く

タイムラインは編集用の第二正本を作らない。Graph の実行結果の可視化とする。keyframe 編集を伴う Animation authoring は Phase 11 の別課題として切り離す。

### 7. デバッグ

- 実行中のフローを、直近に通った順にノードとエッジへ着色する
- 選択したノードの入力値と出力値を、直近の実行時の値として Inspector に出す
- `debug/log` の出力と、エンジンが打ち切った理由（予算超過、値の循環、未対応 operation）を一つの一覧に時刻付きで並べる
- 診断の各行からは対象ノードへ移動できるようにする。JSON path 文字列だけの表示にはしない

### 8. エディタ操作

- 接続線を選択・削除・繋ぎ替えできるようにする（`onEdgesChange`、`onReconnect`）
- Delete キーでノードを削除する。document 側も同時に更新する（`onNodesDelete`）
- Graph 編集の Undo / Redo を、Scene の history とは独立に持つ
- 未保存のまま閉じようとしたら確認を表示する
- コピー、ペースト、複製、整列を行う
- ソケットから空白へドラッグする。繋がる候補だけに絞った検索を表示する
- パネル、Inspector、パレット、ノードカードを可変にする。ノードカードは折りたたみと値のインライン表示を持つ

## 段階

| Phase | 内容 | 状態 |
| --- | --- | --- |
| A | 実行エンジンの一本化 | 完了 |
| B | Operation 第一段階と順序制約の撤廃 | 完了 |
| C | Action 対象の拡張 | 完了。Scene 遷移だけ runtime 側の未対応として残る |
| D | エディタ操作の修復と拡張 | 完了。コピー / ペーストは未着手 |
| E | Graph 合成 | 完了。Graph のテンプレート化は未着手 |
| F | タイムラインビューとデバッグ | 完了。ステップ実行とブレークポイントは未着手 |

各 Phase は、実データでの操作、保存後の再読込、Undo / Redo、失敗時の復帰、公開出力までが一致したときに完了とする。ファイルと button の存在は完了条件に含めない。

## 非目標

- 任意の JavaScript を Graph へ持ち込むこと。振る舞いのコードは Script Asset の役割である。この境界は変えない
- `KHR_interactivity` を独自形式へ置き換えること。正本は canonical JSON のままとする
- bone と shape key の keyframe 編集。Animation authoring は別課題とする
- Graph 間の共有変数

## 参照

- [KHR_interactivity Editor / MCP design](./KHR_INTERACTIVITY_EDITOR.md)
- [Visual Editor Roadmap](./VISUAL_EDITOR_ROADMAP.md)
- [Scripting Contract](./SCRIPTING.md)
- [UX 原則](./UX_PRINCIPLES.md)
- [マイクロインタラクション Wiki](./UX_INTERACTIONS.md)
