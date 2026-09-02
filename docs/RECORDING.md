# ワールド制作の録画

LLM が MCP 経由でワールドを作っていく様子を、XRift Studio だけで動画にする。
OBS などの外部ツールを前提にせず、投稿先に合わせたアスペクト比で、数時間の
制作過程を安定して記録できることが目的である。動画編集ソフトにはしない。
短縮、結合、字幕、BGM は FFmpeg か外部の編集ソフトに任せる。

## 流れ

```text
録画ビューを表示して構図を決める（人か MCP）
  → start_recording（人か MCP）
  → LLM が MCP でワールドを作る。必要なら set_recording_camera で構図を直す
  → stop_recording → 動画と sidecar JSON が保存される
  → 完成したワールドを Play で歩いて撮る（同じ録画機能）
  → scripts/summarize-recording.mjs で 1 分にまとめ、紹介パートと結合する
```

## 役割の分け方

| 誰が | 何を |
| --- | --- |
| XRift Studio | 録画の開始・停止と状態管理、指定したアスペクト比と解像度での録画、録画ビューと録画用カメラ、ディスクへの逐次書き込み |
| MCP | 録画の開始・停止・状態取得、プロファイルと録画ビューの指定、録画用カメラの移動、ワールド制作そのもの |
| 外部ツール (FFmpeg など) | 短縮、結合、字幕、BGM、トランジション、最終出力 |

## 仕組み

録画は React の外にある 1 つの controller (`src/lib/recording/recording-session.ts`)
が持つ。Scene View の Canvas は投影の切り替えや Project の再読み込みで作り直される
ので、Canvas そのものを録画すると take が途中で終わる。そこで controller が
プロファイルどおりの大きさの録画用フレーム (通常の canvas) を持ち、Scene View は
自分を「ソース」として登録するだけにする。React Three Fiber が 1 フレーム描くたびに
(`addAfterEffect`) そのフレームを録画用フレームへコピーし、`MediaRecorder` が
録画用フレームの `captureStream` を符号化する。ソースが消えても take は続き、最後の
絵が保たれる。Scene View が戻れば続きから映る。

符号化した chunk は 1 秒ごとに Rust へ raw body (`recording_append_chunk`) で渡し、
その場でファイルへ追記する。メモリに動画を溜めないので、数時間の take でも
メモリは増えない。Rust 側が書けるのは `recording_begin_file` で開いたファイルだけで、
開けるのは既定の保存先 (OS のビデオフォルダー直下 `XRift Studio`。無ければ app data
の `recordings`) と、人がフォルダーダイアログで選んだ場所だけである。AI client は
path を指定できない。同名のファイルがあれば番号を付けて別名にし、上書きしない。

保存後、動画の隣に同名の `.json` (sidecar) を書く。project id とタイトル、scene id、
開始した MCP client の名前、label、プロファイル、解像度、開始・停止時刻、録画用
カメラの姿勢が入る。どの録画がどの制作セッションか、あとから読める。

ファイル名は `xrift-<project>-<yyyymmdd-hhmmss>-<aspect>-<edge>p[-<label>].webm`。
同じ project の take が並び、時刻で区別でき、開く前に縦横が分かる。

## 状態

```text
idle ──start──▶ recording ──stop──▶ stopping ──flush──▶ completed
  ▲                │                    │                   │
  │                └────── error ───────┴──▶ failed         │
  └─────────────────── start (新しい take) ◀────────────────┘
```

- `start` は `recording` と `stopping` の間だけ断る。断るときも例外ではなく、
  `started: false` と現在の状態を返す。人がボタンを押しても、MCP から二重に呼んでも、
  2 つ目のファイルは開かない。
- `stop` は断らない。`recording` 以外なら `stopped: false` で現在の状態を返す。
  `stopping` の間に呼べば同じ完了を待つ。
- 失敗した take は部分ファイルの path を残す。1 時間の録画が最後の 1 秒で落ちても
  開く価値はある。
- 6 時間で自動停止する。止め忘れた REC でディスクを埋めない。
- Studio を再起動すると状態は `idle` に戻る。プロファイル、録画ビューの設定、
  保存先、project ごとの録画用カメラは localStorage に残る。

純粋な遷移は `recording-state.ts` にあり、`recording.fixture.ts` が「2 回 start」
「idle で stop」「途中で失敗」を確かめる。

## プロファイル

| 項目 | 値 |
| --- | --- |
| アスペクト比 | 16:9、9:16、1:1、4:5 |
| 短辺 | 720、1080、1440 px。長辺は比率から決める (9:16 の 1080 は 1080x1920、4:5 は 1080x1350) |
| フレームレート | 30、60 |

両辺を偶数に丸める。H.264 と多くの WebM encoder が奇数を断るため。
コンテナは WebView が対応する形式から選ぶ (WebView2 は WebM/VP9、WebKit は MP4)。

録画中にプロファイルを変えても take は開いたときの設定のまま続き、次の録画から
効く。`set_recording_profile` は `effectiveFrom` でどちらかを返す。

## 録画ビュー

「録画ビューを表示」で、Scene View のセルが黒地の中央にプロファイルの比率で
レターボックスされる。Canvas は同じもので、CSS の大きさに対する devicePixelRatio を
計算し直して**プロファイルどおりの画素数**で描く。controller はそれを 1:1 で
コピーするので、拡大でぼやけない。モニターの大きさや普段のパネル配置に左右されない。

| 設定 | 意味 |
| --- | --- |
| `cameraSource: recording` | 保存した録画用カメラを表示する。ワールドが変わっても構図は動かない |
| `cameraSource: editor` | 編集中の Scene View カメラをそのまま映す。人の手つきを残す take 向け |
| `showEditorUi` | Hierarchy、Inspector、Assets、ツールバーを残す。既定は隠す |
| `showEditorHelpers` | グリッド、ギズモ、選択枠、ヘルパーアイコンを絵に入れる。既定は入れない (サムネイル撮影と同じ「公開物の見た目」で描く) |
| `showRecordingIndicator` | フレーム左上の REC 表示。DOM なので動画には入らない |

録画ビューを閉じても録画は続く (ヘッダーの REC 表示は残る)。閉じたあとの絵は
編集中の Scene View をアスペクト比に合わせて中央で切り抜いたものになる。

Play 中も録画ビューは使える。完成したワールドを一人称で歩く紹介パートは、Play を
開始して同じ録画を回す。Play 中は録画用カメラではなくプレイヤーの視点が映る。

## 録画用カメラ

姿勢は position、target、fov の 3 つで、project ごとに保存する。録画ビューを
`cameraSource: recording` で表示している間だけ Scene View のカメラに適用し、閉じると
編集中のカメラへ戻す。録画ビューの中でドラッグした構図は、そのまま保存される。

MCP からの移動は純粋関数 (`recording-camera.ts` の `resolveRecordingCameraPose`)
で、境界の測定だけを viewport に頼む。録画ビューが隠れていても、編集中のカメラを
動かさずに姿勢を更新できる。

| 指定 | 動き |
| --- | --- |
| `fitScene` | Scene の全 root Entity の描画 bounds を union して収める。ワールドが広がったら呼び直す |
| `focusEntityId` | F キーと同じ測り方で 1 つの Entity を収める |
| `preset` | top / front / back / left / right / iso の向き。何も収めないなら注視点は保つ |
| `position` / `target` | そのまま置く。`target` だけなら距離を保つ |
| `distance`、`fov` | 上書き |

収める距離は縦横の狭い方の画角で決めるので、9:16 では 16:9 より下がる。

## MCP tool

すべて `debug` surface。document、選択、Undo 履歴は変えない。`projectId` と
`sceneId` は任意で、渡した場合だけ現在の Editor と照合する。録画は project を
またいで生きるので、project を切り替えたあとの `stop_recording` も通す。

| tool | 役割 |
| --- | --- |
| `start_recording` | 開始。`label`、この take だけの `profile`、`showViewport` |
| `stop_recording` | 停止して flush を待ち、path と長さと大きさを返す |
| `get_recording_status` | 状態機械、プロファイル、録画ビュー、カメラ |
| `set_recording_profile` | 次の take のフレーム |
| `set_recording_viewport` | 録画ビューの表示と描く内容 |
| `get_recording_viewport` | 上の読み取り |
| `set_recording_camera` | 録画用カメラの移動 |
| `get_recording_camera` | 姿勢と、いま Scene View を動かしているか |

録画の呼び出しが失敗しても、制作の tool には影響しない。controller は document の
外にあり、失敗は `failed` 状態と message として返るだけである。

典型的な手順:

```text
get_recording_status                      前の take が残っていないか
set_recording_profile { aspectRatio: "9:16" }
set_recording_viewport { visible: true }
set_recording_camera { fitScene: true }
start_recording { label: "codex-run-1" }
  ... ワールド制作 ...
set_recording_camera { fitScene: true }   広がったら構図を直す
stop_recording                            path を受け取る
```

## 短くまとめる

`scripts/summarize-recording.mjs` が FFmpeg で、長時間の制作過程を指定した長さへ
一定速度で短縮し、必要なら紹介パートを後ろに結合する。

```bash
pnpm recording:summarize -- --input ~/Videos/XRift\ Studio/xrift-sky-garden-20260902-143005-9x16-1080p.webm \
  --outro ~/Videos/XRift\ Studio/xrift-sky-garden-20260902-160210-9x16-1080p-tour.webm \
  --duration 60 --output ~/Videos/sky-garden-60s.mp4
```

- `--duration` は制作パートを何秒にまとめるか。速度は自動で決まる (2 時間を 50 秒なら 144 倍)
- `--outro` は等速のまま後ろへつなぐ。両方とも同じプロファイルで録っておく
- 出力は H.264 / yuv420p の MP4。X、YouTube、Instagram にそのまま出せる
- 字幕、BGM、トランジションは出力した MP4 に別途付ける

FFmpeg が無ければ、実行するはずだったコマンドを表示して終わる。

## OBS を使う場合

録画ビューを表示して `showEditorUi: false` にすれば、OBS のウィンドウキャプチャに
そのまま黒地とフレームが映る。Studio の録画と同時に回してもよい。必須ではない。

## 参照

- controller: `src/lib/recording/recording-session.ts`
- 状態機械と命名: `src/lib/recording/recording-state.ts`
- プロファイル: `src/lib/recording/recording-profile.ts`
- カメラ: `src/lib/recording/recording-camera.ts`
- Rust の書き込み: `src-tauri/src/lib.rs` の `recording_*`
- 録画ビュー: `src/components/visual-editor/SceneViewport.tsx`
- パネル: `src/components/visual-editor/RecordingPanel.tsx`
- MCP の分岐: `src/components/visual-editor/VisualEditorPrototype.tsx` の `handleRecordingTool`
