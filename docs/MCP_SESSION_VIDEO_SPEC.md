# MCP 制作セッション動画 仕様

AI client (Claude Code、Codex、Ollama 経由の opencode など) が MCP で World を組み
立てる数十分から数時間の制作風景を、Studio 自身で長回し録画し、タイムラプスと
完成した World のカメラワークをつないだ短尺動画にする。

対象は「同じお題を複数のモデルに与え、制作の速さと仕上がりを並べて見せる」形式
の動画で、左右 2 画面にモデル名・所要時間・費用を出し、完成した空間をカメラが
流す作りを想定している。

## 結論

**録画は Studio の診断「録画」が担う。** 外部の画面録画ツールを前提にしない。
Scene View の診断にある録画を、15 秒の診断クリップに加えて**時間無制限の長期録画**
として使えるようにした。録画中の MCP tool call は Studio が JSONL の活動ログに
書くので、動画と「AI が何をしたか」が最初から同じ時間軸にそろう。

動画に固有の処理 (タイムラプス生成、字幕の cue、比較の並べ方) は、アプリでは
なく `dev/release-promo/_kit` (Remotion キット) とスキルに置く。マーケティング
用の機能はアプリでは負債になるが、キットとスキルは「動画を作らなくなった日に
消せる」場所なので、負債の置き場をそこへ限定する。

| 置き場 | 内容 | 状態 |
| --- | --- | --- |
| アプリ | 長期録画 (Scene View の WebM をディスクへ逐次書き、活動ログを添える) | 実装済み |
| アプリ | `capture_scene_debug` の `mode: "session"` | 実装済み |
| キット | `session-timelapse.mjs` (可変倍速のタイムラプスと `cues.json`) | 実装済み |
| アプリ | Scene View のカメラ運動 (orbit / fly-by)、のちにカメラタイムライン | 未実装 |
| アプリ | 収録ビュー (Scene View だけを Chrome 無しで大きく出す) | 未実装 |
| キット | `session` シーン (字幕と HUD)、`compare` の A vs B ラベル | 未実装 |

## 長期録画

### 何を録るか

Scene View の Canvas。診断クリップと同じ経路 (`canvas.captureStream` と
`MediaRecorder`) で、違いは 3 つ。

- **上限が無い。** 24 時間で安全のため止まる。忘れられた録画がディスクを黙って
  埋めないための止め方で、設計上の上限ではない
- **メモリに溜めない。** `MediaRecorder` が 5 秒ごとに出す chunk を、その場で
  Rust へ渡して app data のファイルへ追記する。何時間走ってもメモリは平ら。
  途中でアプリが落ちても、最後の chunk までの動画は残る。chunk を 1 つの
  ファイルへ並べたものは、クリップ録画がメモリ上で `Blob` に結合するものと
  同じバイト列なので、そのまま再生できる
- **フレームレートが低い。** 既定は 5fps、ビットレートは 1.5 Mbps (1 時間で
  約 650 MB)。タイムラプスとして見るので、多くのフレームより 1 枚の鮮明さを
  優先する。10 倍速で 30fps の出力を作るのに、元は 3fps あれば足りる

録れないもの: Hierarchy、Inspector、AI client の terminal。制作風景の「AI が
いま何をしているか」は活動ログが持つので、動画側では字幕として描く。

### 保存先

app data の `debug-captures/recording-<開始時刻>/` に 2 つ。

```text
recording-20260902-002019/
  scene-view.webm     録画
  activity.jsonl      活動ログ
```

project には入れない。`capture_scene_view` が `debug-captures` を使うのと同じ
理由で、一時的な成果物を作品に混ぜないし、AI client に保存先を選ばせない。
停止後の画面には保存先を開く導線が残る。

### 活動ログ

1 行 1 JSON。`at` は壁時計 (ISO 8601 UTC ミリ秒)、`t` はセッション開始からの秒、
`event` が種別。動画の 0 秒は `video-start` の `t` なので、動画時間は
`t - video-start.t` で出る。

| event | 書く側 | 内容 |
| --- | --- | --- |
| `session-begin` | Rust | `fps`、`bitsPerSecond`、`video` |
| `video-start` | Editor | recorder が最初のデータを出した瞬間 |
| `tool` | Rust (broker) | `client`、`tool`、`ok`、`errorCode`、`durationMs` |
| `visibility` | Editor | `hidden`。隠れている間は描画が止まるので動画も止まる |
| `session-end` | Rust | `durationMs`、`videoBytes`、`toolCalls` |

`tool` は broker が書く。Editor の tool ごとの handler は録画を知らなくてよく、
どの tool でも同じ形で残る。**引数の本文は書かない。** パスやプロンプトが残ると、
動画にする前に伏せる作業が増える。

### MCP から

`capture_scene_debug` の `start` に `mode: "session"` と `fps` (1〜10) を渡す。
`stop` は動画と活動ログのパス、フォルダ、所要時間、容量、tool call 件数を返す。
録画は同時に 1 つで、クリップと長期録画は互いに待つ。

制作の最初に AI 自身が録画を始め、最後に止めるところまでプロンプトに入れると、
録画の始点と終点が制作と一致する。

## タイムラプス

```powershell
cd dev/release-promo/<slug>
node ../_kit/scripts/session-timelapse.mjs --recording <録画フォルダ> --target-seconds 18
```

`public/source/<録画フォルダ名>/` に `timelapse.mp4` と `cues.json` を出す。

- **倍率は一定にしない。** LLM が考えている間は画面が動かない。活動ログで
  tool call が `--idle-seconds` (既定 20 秒) 以上途切れた区間は 1 秒に畳み、
  動いている区間だけを `--target-seconds` に収まる倍率で縮める。ウィンドウが
  隠れていた区間は丸ごと切る。ログが無いときだけ一定倍率 (`--speed`、既定 10)
- **`cues.json`。** 出力動画の秒へ写した tool call の列、区間ごとの倍率、
  所要時間 (最初と最後の tool call の差)、件数、client 名。Remotion 側はこれを
  読んで字幕と HUD を描く。動画へ焼き込まない。焼くと縦型で位置が合わない
- 費用は Studio も script も知らない。client 側の集計を storyboard へ手で書き、
  出典を `sourceNotes` に残す

## 全体の流れ

```text
1. Studio: 新規 project を開く
2. AI client: プロンプト雛形を貼る。冒頭で capture_scene_debug start (session)、
   World の制作、最後に完成した World を見せるカメラ操作、stop まで
   (手で録るなら Scene View の「長期録画」を押す)
3. 停止後の「保存先を開く」から録画フォルダを取り出す
4. session-timelapse.mjs で timelapse.mp4 と cues.json を作る
5. storyboard.json を書き、npm run render / render:vertical
```

2 つのモデルを比べるときは 1〜4 をモデルごとに繰り返す。同じ project 雛形、
同じプロンプト、同じウィンドウサイズで撮る。

## 次に足すもの

### Scene View のカメラ運動

締めの画は、完成した空間の中をカメラが一定速度で流れる数秒である。手で
OrbitControls を回すと毎回違い、止まる位置も定まらない。

`set_scene_view_camera` に `motion` を足す。既存の preset と `focusEntityId` で
決めた姿勢を始点に、`orbit` (注視点のまわりを `degrees` 回る) と `flyBy`
(`from` から `to` へ直線) を `seconds` かけて動かす。実行中は OrbitControls を
止め、終わったら始点へ戻す。`CameraControls` の `focusSnapshot` が既にこの
戻し方を持っている。長期録画中に AI が呼べば、締めの画まで同じ録画に入る。

複数ショットは [カメラタイムライン](./CAMERA_TIMELINE_SPEC.md) で書く。仕様は
書けているので、必要になったら `motion` を実行器の 1 ケースとして吸収する。

### 収録ビュー

Scene View は Hierarchy と Inspector に挟まれ、グリッド、ギズモ、ヘルパーが
乗っている。録画は Canvas だけを撮るので枠は入らないが、グリッドとギズモは
Canvas の中にある。View メニューに「収録ビュー」を足し、グリッド
(`sceneSettings.editor.gizmo.gridVisible`)、ヘルパー (`displayProfile.showHelpers`)、
選択表示を隠す。サムネイル撮影が `thumbnailCaptureActive` で既に部分的に同じ
ことをしている。Esc で戻り、戻る導線を隅に薄く残す。

### キットのシーン

- `session` シーン。`screen` の変種で `cues.json` を受け取り、下辺に tool call
  のティッカー、隅に経過時間・件数・client 名の HUD を描く
- `compare` に `labels` (モデル名、client 名、所要時間、費用) を足し、2 本の
  `session` を同時に流す。時間と件数は `cues.json` から、費用は手で書く

## やらないこと

- 外部の録画ツールとの連携。録画も時刻もアプリの中にある
- 活動ログへの引数本文、プロンプト全文、パスの記録
- 動画に出す時間と件数を、活動ログ以外から作らない
- Remotion の依存をリポジトリ本体へ持ち込まない (既存方針のとおり)

## 未決

- 長期録画のフレームレートを UI から選ばせるか。いまは 5fps 固定で、MCP からは
  `fps` で 1〜10 を選べる。UI の select は、選びたい人が出てから
- 完成 World の締めを、固定 dt でフレーム書き出しする経路 (`capture_scene_view`
  を毎フレーム呼ぶ形)。落ちフレームが無く縦型も原寸で出せるが、アプリ側の仕事が
  増える。長期録画の 10fps で足りなくなってから
