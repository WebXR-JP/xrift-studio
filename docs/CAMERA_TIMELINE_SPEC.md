# カメラタイムライン 仕様

決まった経路をカメラで再生する。デバッグのために、同じところへ毎回手で飛ぶのを
やめる。

置いた場所を確認するのに、いまは Scene View を手で回すか、Play を起動して歩く
しかない。同じ確認を何度もやるほど、毎回違うところを見ることになる。経路を
資産として保存できれば、確認は再現できるようになる。

## 現状（確認済み）

| 部品 | 場所 | 状態 |
| --- | --- | --- |
| KHR_interactivity のグラフ資産、ノードエディタ、検証 | `interactivity-graph.ts`、`InteractivityGraphEditor.tsx` | 実装済み |
| Studio 独自 op を足す型 | `packages/xrift-studio-runtime/src/script/interaction-trigger.ts` | 実装済み。`XRIFT_studio_interaction` として `xrift/onInteract` ほか |
| `event/onStart`、`flow/branch`、`flow/setDelay` | `interactivity-adapter.ts` | 宣言は通る。実行は後述のとおり静的 |
| Play のカメラ | `SceneViewport.tsx` の `WorldPlayPlayer` | SpawnPoint から始まる一人称プレイヤー。公式 `PhysicsPlayer` と pointer lock |
| Scene View のカメラ操作 | `SceneViewport.tsx` の `CameraControls` | Entity への寄りと、`set_scene_view_camera` からの名前付きビュー |
| カメラの Entity | なし | Scene settings に near / far / fov があるだけ |

## 一番大きい穴は、実行器が静的なこと

`walkOnStart` はグラフを一度なぞって**アニメの開始キューを集めるだけ**で、
`flow/setDelay` は「本当に待つ」のではなく、アニメの開始時刻へ遅延秒を足して
いる。

それで足りていたのは、これまでのグラフが「開始時に何を鳴らすか」しか言わな
かったからで、時間軸は three 側のアニメ再生が持っていた。

タイムラインは違う。**待ちの後に次の命令があり、その命令がカメラを動かす。**
時間軸をグラフ自身が持つ必要がある。

だから、静的 walk を置き換えない。**隣に、時間で進む実行器を足す。** 既存の
アニメキューは Play と公開ワールドの両方が使っていて、置き換えると 2 つの
runtime を同時に動かすことになる。

## camera Component

カメラを Entity にする。Entity の Transform がそのままカメラの姿勢になるので、
「指定した Entity の Transform へカメラを動かす」が、目標もカメラも同じ種類の
もので書ける。

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

触るところ:

- `SceneComponentExtensionSchemaRegistry` へ `camera`
- `EDITOR_COMPONENT_REGISTRY` へ定義を追加（Add Component から置ける）
- Inspector のカード。fov / near / far と primary
- `update_component` の `CAMERA_PATCH_KEYS`
- Scene View に錐台の gizmo。選択中だけ出す
- compiler は**出力しない**。`editor-only-camera` の warning を出す

最後の一点は `editor-only-spawn-point` と同じ形にする。黙って落とすと、公開して
から気付くことになる。「出力されない」と言うのは compiler の仕事。

## 新しい operation

extension は `XRIFT_studio_camera`。`XRIFT_studio_interaction` と分けるのは、
カメラのタイムラインを持たないプロジェクトが、使わない op の宣言を抱えないため。

| op | flow | configuration |
| --- | --- | --- |
| `xrift/cameraTo` | `in`、`out` | `entity`、`duration`、`easing` |
| `xrift/cameraHold` | `in`、`out` | `seconds` |
| `xrift/waitForInteract` | `in`、`out` | `entity` |

**`xrift/cameraTo`** — 指定 Entity の world transform（位置と角度）へ `duration`
秒かけて動かす。`0` なら瞬間移動。world transform は
`entity-bounds.ts` の `entityWorldMatrix` が既に親をたどって出している。

**`xrift/cameraHold`** — 秒待つ。

**`xrift/waitForInteract`** — 指定 Entity の Interactable が押されるまで止まる。
「一定の操作をしたあと次の演出へ」がこれ。`xrift/onInteract` を使い回さないのは、
あれがグラフの**入口**で、途中で待てないから。入口と待ちは別の概念。

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

1 フレーム分の `delta` を受けて次の状態を返す**純関数**にする。Scene View と Play
で同じものを回したいし、fixture で時間を渡して固定したいため。React の層は薄い
呼び出しだけにする。

止まる条件:

- **対応していない op に当たったら止める。** 既存の walk と同じ判断で、飛ばして
  先へ進むと、飛ばした node が成功したかのように残りが走る
- 対象 Entity が消えていたら止めて、どの node のどの Entity かを出す
- ユーザーが停止した

## どこで再生するか

### Editor の Scene View

デバッグ用途の本命。Play を起動しなくても見られる。

- Inspector の Camera カードに「このタイムラインを再生」
- 実行中は OrbitControls を止め、実行器が直接カメラを動かす。
  `set_scene_view_camera` が使っている `cameraRequest` は 1 回の移動を表す
  request で、毎フレーム更新する作りではない。流用しない
- 実行中は選択もギズモも止める。Terrain モードと同じ考え方
- 終わったら元のカメラへ戻す。`CameraControls` の `focusSnapshot` と同じ仕組みが
  すでにある

### Play mode

- プレイヤーからタイムラインへ渡し、終わったらプレイヤーへ戻す。位置はタイムライン
  の終端を引き継ぐ
- 走っている間は WASD を無効にする。**動かせるように見えて動かないのは、壊れて
  見える**

### 公開ワールド

**今回は対象外。** compiler は `editor-only-camera-timeline` の warning を出し、
出力しないことを明示する。

将来やるなら、実行器は `packages/xrift-studio-runtime` にあるので、three.js と
React Three Fiber の両 runtime から呼べる。置き場所だけ先に正しくしておく。

## 未対応の見せ方

`KHR_INTERACTIVITY_RUNTIME_SUPPORT` へ新しい op を足す。ノードのバッジ、レシピ
一覧、compiler、`list_interactivity_operations` はすべてこの 1 つの表を読んで
いるので、片方だけが「対応済み」に見えることが起きない。

Scene View で再生できて公開ワールドで動かない op は、その差が表に出る必要が
ある。分類は `executed` ではなく `conditional`（Studio でだけ走る）にする。

## MCP

- `play_camera_timeline`（debug surface）— 再生し、終端の姿勢と止まった理由を
  返す
- `capture_scene_view` と組み合わせると「各ビートを撮る」ができる。これが
  「パスを組んで、見て、直す」の一周になる
- グラフを組む側は既存の `add_interactivity_node` と
  `set_interactivity_configuration` で足りる。op 名が
  `list_interactivity_operations` に出るので、専用の作成 tool は要らない

## 実装順

1. **camera Component** — schema、registry、Inspector、錐台 gizmo、compiler の
   warning。ここまでで「カメラ位置のマーカー」として単体で使える
2. **実行器の純関数と fixture** — 時間を渡して状態が進むことを固定する
3. **`xrift/cameraTo` と `xrift/cameraHold`** — 宣言、テンプレート、support 表
4. **Scene View での再生** — ここで初めて画面で見える
5. **`xrift/waitForInteract` と Play mode のハンドオーバー**
6. **MCP tool**

1 と 2 は互いに独立しているので、順番を入れ替えても、並行して進めてもよい。

## 未決

- **`flow/setDelay` を使い回すか、`xrift/cameraHold` を足すか。** 上では足す方を
  書いた。同じ op を 2 つの実行器が違う意味で読むと、片方を直したときにもう
  片方が壊れるため。ただし「待ちの op が 2 つある」のは説明しにくい。静的 walk
  の側を実行器の意味へ寄せて直す方が、長い目では筋がいいかもしれない
- 複数カメラの扱い。`primary` フラグで足りるか、タイムラインが名指しするか
- easing をどこまで持つか。まず linear と ease-in-out の 2 つで足りるはず
- **再生中に Scene が編集されたらどうするか。** Play session の per-entity 再起動
  と同じ問題で、そちらの判断に揃えるのが自然

## 注意

- 実行器を足すときに、既存の静的 walk を壊さない。アニメキューは Play と公開
  ワールドの両方が使っている
- Scene document のスキーマへ `camera` を足すときは、`serialization.ts` と MCP の
  `update_component` を同時に更新する。片方だけだと保存した時点で Scene が
  読めなくなる
- 再生中に、安全でない中断ができるように見せない
- 停止と巻き戻しの導線を、再生と同じ場所に置く。始められて止められない画面を
  作らない
