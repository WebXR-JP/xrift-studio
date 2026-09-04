# カメラタイムライン 仕様

決まった経路に沿ってカメラを再生する。デバッグのたびに同じ場所へ手で移動する手間をなくす。

置いた場所を確認するには、Scene View を手で回すか、Play を起動して歩くしかない。同じ確認を繰り返すと、毎回違う場所を見てしまう。経路を資産として保存すれば、同じ確認を再現できる。

## 現状（確認済み）

| 部品 | 場所 | 状態 |
| --- | --- | --- |
| KHR_interactivity のグラフ資産、ノードエディタ、検証 | `interactivity-graph.ts`、`InteractivityGraphEditor.tsx` | 実装済み |
| Studio 独自 op を足す型 | `packages/xrift-studio-runtime/src/script/interaction-trigger.ts` | 実装済み。`XRIFT_studio_interaction` として `xrift/onInteract` ほか |
| `event/onStart`、`flow/branch`、`flow/setDelay` | `interactivity-adapter.ts` | 宣言は通る。実行は後述のとおり静的 |
| Play のカメラ | `SceneViewport.tsx` の `WorldPlayPlayer` | SpawnPoint から始まる一人称プレイヤー。公式 `PhysicsPlayer` と pointer lock |
| Scene View のカメラ操作 | `SceneViewport.tsx` の `CameraControls` | Entity への寄りと、`set_scene_view_camera` からの名前付きビュー |
| カメラの Entity | なし | Scene settings に near / far / fov があるだけ |

## 一番大きな不足は、実行器が静的なこと

`walkOnStart` はグラフを一度なぞり、**アニメの開始キューを集めるだけ**である。`flow/setDelay` は「本当に待つ」のではなく、アニメの開始時刻へ遅延秒を足している。

それで足りていた理由は、これまでのグラフが「開始時に何を鳴らすか」しか示さなかったためである。時間軸は three 側のアニメ再生が持っていた。

タイムラインは異なる。**待ちの後に次の命令があり、その命令がカメラを動かす。**時間軸はグラフ自身が持つ必要がある。

そのため、静的 walk は置き換えない。**隣に、時間で進む実行器を足す。**既存のアニメキューは Play と公開ワールドの両方が使っている。置き換えると 2 つの runtime を同時に動かすことになる。

## camera Component

カメラを Entity にする。Entity の Transform がそのままカメラの姿勢になる。このため「指定した Entity の Transform へカメラを動かす」では、目標とカメラを同じ種類のもので書ける。

```ts
export type CameraComponent = ComponentBase & {
  type: "camera";
  /** Scene settings の既定を、このカメラの間だけ上書きする。 */
  fov?: number;
  near?: number;
  far?: number;
  /** 複数ある時、タイムラインが既定で動かすのはどれか。 */
  primary: boolean;
};
```

変更する箇所は次のとおりである。

- `SceneComponentExtensionSchemaRegistry` へ `camera` を追加する
- `EDITOR_COMPONENT_REGISTRY` へ定義を追加する（Add Component から置ける）
- Inspector のカードを追加する。fov / near / far と primary を扱う
- `update_component` の `CAMERA_PATCH_KEYS` を更新する
- Scene View に錐台の gizmo を出す。選択中だけ表示する
- compiler は**出力しない**。`editor-only-camera` の warning を出す

最後の一点は `editor-only-spawn-point` と同じ形にする。何も出さずに落とすと、公開後に気付くことになる。「出力しない」ことを伝えるのは compiler の役割である。

## 新しい operation

extension は `XRIFT_studio_camera` とする。`XRIFT_studio_interaction` と分ける理由は、カメラのタイムラインを持たないプロジェクトが使わない op の宣言を含めないためである。

| op | flow | configuration |
| --- | --- | --- |
| `xrift/cameraTo` | `in`、`out` | `entity`、`duration`、`easing` |
| `xrift/cameraHold` | `in`、`out` | `seconds` |
| `xrift/waitForInteract` | `in`、`out` | `entity` |

**`xrift/cameraTo`** — 指定 Entity の world transform（位置と角度）へ `duration` 秒かけて動かす。`0` なら瞬間移動する。world transform は `entity-bounds.ts` の `entityWorldMatrix` が親をたどって求めた値を使う。

**`xrift/cameraHold`** — 秒数だけ待つ。

**`xrift/waitForInteract`** — 指定 Entity の Interactable が押されるまで止まる。「一定の操作をしたあと次の演出へ」に使う。`xrift/onInteract` を使わない理由は、あの op がグラフの**入口**であり、途中での待機には使えないためである。入口と待ちは別の概念である。

## 実行器

```ts
type CameraTimelinePose = { position: Vec3; rotation: Vec3 };

type CameraTimelineRun = {
  status:
    | "idle"
    | "running"
    | "waiting-time"
    | "waiting-interact"
    | "finished"
    | "stopped";
  nodeIndex: number;
  move: {
    from: CameraTimelinePose;
    to: CameraTimelinePose;
    elapsed: number;
    duration: number;
  } | null;
  waitRemaining: number;
  /** 止まった理由。画面にそのまま出せる文にする。 */
  stoppedReason: string | null;
};
```

1 フレーム分の `delta` を受け取り、次の状態を返す**純関数**にする。Scene View と Play で同じものを使う。fixture で時間を渡して固定するためである。React の層では呼び出すだけにする。

止まる条件は次のとおりである。

- **対応していない op がある場合は止める。**既存の walk と同じ判断である。飛ばして先へ進めると、飛ばした node が成功したかのように残りが走る
- 対象 Entity が消えている場合は止める。どの node のどの Entity かを出す
- 停止操作があった場合は止める

## どこで再生するか

### Editor の Scene View

デバッグ用途の本命である。Play を起動しなくても見られる。

- Inspector の Camera カードに「このタイムラインを再生」を置く
- 実行中は OrbitControls を止める。実行器が直接カメラを動かす。`set_scene_view_camera` が使っている `cameraRequest` は 1 回の移動を表す request である。毎フレーム更新する作りではないため、流用しない
- 実行中は選択もギズモも止める。Terrain モードと同じ考え方である
- 終わったら元のカメラへ戻す。`CameraControls` の `focusSnapshot` と同じ仕組みを使う

### Play mode

- プレイヤーからタイムラインへ渡す。終わったらプレイヤーへ戻す。位置はタイムラインの終端を引き継ぐ
- 走っている間は WASD を無効にする。**操作できるように見えて動かない状態では、故障と区別できないためである**

### 公開ワールド

**今回は対象外とする。**compiler は `editor-only-camera-timeline` の warning を出す。出力しないことを明示する。

将来対応する場合に備え、置き場所だけ先に決めておく。実行器は `packages/xrift-studio-runtime` にあるため、three.js と React Three Fiber の両 runtime から呼べる。

## 未対応の見せ方

`KHR_INTERACTIVITY_RUNTIME_SUPPORT` へ新しい op を足す。ノードのバッジ、レシピ一覧、compiler、`list_interactivity_operations` はすべてこの 1 つの表を読む。このため、片方だけが「対応済み」に見えることは起きない。

Scene View で再生でき、公開ワールドで動かない op は、その差を表に出す。分類は `executed` ではなく `conditional`（Studio でだけ走る）にする。

## MCP

- `play_camera_timeline`（debug surface）— 再生する。終端の姿勢と止まった理由を返す
- `capture_scene_view` と組み合わせると「各ビートを撮る」ことができる。これが「パスを組んで、見て、直す」の一周になる
- グラフを組む側は既存の `add_interactivity_node` と `set_interactivity_configuration` で足りる。op 名は `list_interactivity_operations` に出るため、専用の作成 tool は要らない

## 実装順

1. **camera Component** — schema、registry、Inspector、錐台 gizmo、compiler の warning を扱う。ここまでで「カメラ位置のマーカー」として単体で使える
2. **実行器の純関数と fixture** — 時間を渡すと状態が進むことを fixture で固定する
3. **`xrift/cameraTo` と `xrift/cameraHold`** — 宣言、テンプレート、support 表を追加する
4. **Scene View での再生** — ここで初めて画面で確認できる
5. **`xrift/waitForInteract` と Play mode のハンドオーバーを追加する**
6. **MCP tool を追加する**

1 と 2 は互いに独立している。順番を入れ替えても、並行して進めてもよい。

## 未決

- **`flow/setDelay` を使うか、`xrift/cameraHold` を足すか。**上では足す方針を書いた。同じ op を 2 つの実行器が違う意味で読むと、片方を直したときにもう片方が壊れるためである。ただし「待ちの op が 2 つある」状態は説明しにくい。静的 walk の側を実行器の意味に寄せて直す方が、将来的には妥当かもしれない
- 複数カメラの扱いを決める。`primary` フラグで足りるか、タイムラインが名指しするかを検討する
- easing をどこまで持つかを決める。まず linear と ease-in-out の 2 つで足りるはずである
- **再生中に Scene が編集されたらどうするか。**Play session の per-entity 再起動と同じ問題である。そちらの判断に揃えるのが自然である

## 注意

- 実行器を足すときは、既存の静的 walk を壊さない。
- Scene document のスキーマへ `camera` を足すときは、`serialization.ts` と MCP の `update_component` を同時に更新する。片方だけでは、保存した時点で Scene が読めなくなる
- 再生中は、安全に中断できない操作を隠す
- 停止と巻き戻しの導線は、再生と同じ場所に置く。開始できても停止できない画面にしない
