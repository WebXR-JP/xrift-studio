# ワールド制作の録画

LLM が MCP 経由でワールドを作る様子を、XRift Studio だけで動画にする。OBS などの外部ツールを前提にしない。投稿先に合わせたアスペクト比で記録する。数時間の制作過程を安定して記録できることが目的である。動画編集ソフトにはしない。短縮、結合、字幕、BGM は FFmpeg か外部の編集ソフトに任せる。

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

録画は React の外にある 1 つの controller（`src/lib/recording/recording-session.ts`）が持つ。Scene View の Canvas は投影の切り替えや Project の再読み込みで作り直される。このため、Canvas そのものを録画すると take が途中で終わる。そこで controller がプロファイルどおりの大きさの録画用フレーム（通常の canvas）を持つ。Scene View は自分を「ソース」として登録するだけにする。React Three Fiber が 1 フレーム描くたびに（`addAfterEffect`）そのフレームを録画用フレームへコピーする。`MediaRecorder` が録画用フレームの `captureStream` を符号化する。ソースが消えても take は続く。最後のフレームが保たれる。Scene View が戻れば続きから映る。

符号化した chunk は 1 秒ごとに Rust へ raw body（`recording_append_chunk`）で渡す。その場でファイルへ追記する。

WebView に `MediaRecorder` が無い場合（Linux の WebKitGTK は「unsupported on this platform」を返す）は、PATH の FFmpeg があればフレーム単位の経路へ切り替える。録画用フレームをプロファイルのフレームレートで JPEG に読み出す。同じ `recording_append_chunk` で Rust へ渡す。Rust が `ffmpeg -f image2pipe` へ流して H.264 の MP4 を書く。JPEG の符号化が遅れた分は壁時計に合わせる。同じフレームを複製するため、動画の長さは実時間と一致する。複製は `x-xrift-recording-repeat` ヘッダーで回数だけを伝える。Rust が同じ JPEG を FFmpeg へ繰り返し送る。描いたフレーム 1 枚につき IPC は 1 回である。このため、描画が 4 fps まで落ちた WebView でも書き込みの待ち行列は伸びない。sidecar の `encoder` に `media-recorder` か `frame-stream` のどちらで録ったかが残る。FFmpeg も無ければ `failed` と「FFmpeg を PATH に置くとフレーム単位で録画できます」を返す。MP4 は fragmented（`frag_keyframe+empty_moov`）で書く。このため、途中で WebView が落ちても書けたところまでは再生できる。FFmpeg の警告とエラーは動画の隣の `<name>.ffmpeg.log` に残す。失敗の message にも末尾を添える。何も出なければ停止時に消す。

停止は無期限に待たない。JPEG の読み出しが 5 秒、書き込み待ちが 20 秒を過ぎたら、そこまでにディスクへ届いた分でファイルを閉じる。残った frame は捨てる（console に件数を warn する）。ソフトウェア GL で WebGL の context が失われた take で起きる。失敗の message は最初の原因を保つ。その後ろで「ファイルが開いていない」と失敗する書き込みには置き換えない。
Windows（WebView2）と macOS（WKWebView）は MediaRecorder を持つ。このため、この経路は通らない。メモリに動画を溜めない。このため、数時間の take でもメモリは増えない。Rust 側が書けるのは `recording_begin_file` で開いたファイルだけである。開けるのは既定の保存先（OS のビデオフォルダー直下 `XRift Studio`。無ければ app data の `recordings`）と、人がフォルダーダイアログで選んだ場所だけである。AI client は path を指定できない。同名のファイルがあれば番号を付けて別名にする。上書きしない。

保存後、動画の隣に同名の `.json`（sidecar）を書く。project id とタイトル、scene id、開始した MCP client の名前、label、プロファイル、解像度、開始・停止時刻、録画用カメラの姿勢が入る。どの録画がどの制作セッションか、あとから読める。

ファイル名は `xrift-<project>-<yyyymmdd-hhmmss>-<aspect>-<edge>p[-<label>].webm` である。同じ project の take が並ぶ。時刻で区別できる。開く前に縦横が分かる。

## 状態

```text
idle ──start──▶ recording ──stop──▶ stopping ──flush──▶ completed
  ▲                │                    │                   │
  │                └────── error ───────┴──▶ failed         │
  └─────────────────── start (新しい take) ◀────────────────┘
```

- `start` は `recording` と `stopping` の間は受け付けない。受け付けないときも例外ではなく、`started: false` と現在の状態を返す。ボタン操作でも、MCP からの二重呼び出しでも、2 つ目のファイルは開かない
- `stop` は常に受け付ける。`recording` 以外なら `stopped: false` で現在の状態を返す。`stopping` の間に呼べば同じ完了を待つ
- 失敗した take は部分ファイルの path を残す。1 時間の録画が最後の 1 秒で落ちても開く価値はある
- 6 時間で自動停止する。止め忘れた REC でディスクを埋めない
- Studio を再起動すると状態は `idle` に戻る。プロファイル、録画ビューの設定、保存先、project ごとの録画用カメラは localStorage に残る

純粋な遷移は `recording-state.ts` にある。`recording.fixture.ts` が「2 回 start」「idle で stop」「途中で失敗」を確かめる。

## プロファイル

| 項目 | 値 |
| --- | --- |
| アスペクト比 | 16:9、9:16、1:1、4:5 |
| 短辺 | 720、1080、1440 px。長辺は比率から決める (9:16 の 1080 は 1080x1920、4:5 は 1080x1350) |
| フレームレート | 30、60 |

両辺を偶数に丸める。H.264 と多くの WebM encoder が奇数を断るためである。コンテナは WebView が対応する形式から選ぶ（WebView2 は WebM/VP9、WebKit は MP4）。

録画中にプロファイルを変えても take は開いたときの設定のまま続く。次の録画から効く。`set_recording_profile` は `effectiveFrom` でどちらかを返す。

## 録画ビュー

「録画ビューを表示」で、Scene View のセルが黒地の中央にプロファイルの比率でレターボックスされる。Canvas は同じものである。CSS の大きさに対する devicePixelRatio を計算し直して**プロファイルどおりの画素数**で描く。controller はそれを 1:1 でコピーする。このため、拡大でぼやけない。モニターの大きさや普段のパネル配置の影響を受けない。

| 設定 | 意味 |
| --- | --- |
| `cameraSource: recording` | 保存した録画用カメラを表示する。ワールドが変わっても構図は動かない |
| `cameraSource: editor` | 編集中の Scene View カメラをそのまま映す。人の手つきを残す take 向け |
| `showEditorUi` | Hierarchy、Inspector、Assets、ツールバーを残す。既定は隠す |
| `showEditorHelpers` | グリッド、ギズモ、選択枠、ヘルパーアイコンを絵に入れる。既定は入れない (サムネイル撮影と同じ「公開物の見た目」で描く) |
| `showRecordingIndicator` | フレーム左上の REC 表示。DOM なので動画には入らない |

録画ビューを閉じても録画は続く（ヘッダーの REC 表示は残る）。閉じたあとの映像は編集中の Scene View をアスペクト比に合わせて中央で切り抜いたものになる。

Play 中も録画ビューは使える。完成したワールドを一人称で歩く紹介パートは、Play を開始して同じ録画を回す。Play 中は録画用カメラではなくプレイヤーの視点が映る。

録画ビューを表示して `showEditorUi: false` にすれば、OBS のウィンドウキャプチャにそのまま黒地とフレームが映る。Studio の録画と同時に回してもよい。必須ではない。

## 録画用カメラ

姿勢は position、target、fov の 3 つである。project ごとに保存する。録画ビューを `cameraSource: recording` で表示している間だけ Scene View のカメラに適用する。閉じると編集中のカメラへ戻す。録画ビューの中でドラッグした構図は、そのまま保存される。

MCP からの移動は純粋関数（`recording-camera.ts` の `resolveRecordingCameraPose`）で処理する。境界の測定だけを viewport に頼む。録画ビューが隠れていても、編集中のカメラを動かさずに姿勢を更新できる。

| 指定 | 動き |
| --- | --- |
| `fitScene` | Scene に描かれている Mesh の bounds を union して収める。半径 100 m を超える Mesh (空のドーム、地平線の板) は除外し、除外した数を `skippedLargeMeshCount` で返す。ワールドが広がったら呼び直す |
| `focusEntityId` | F キーと同じ測り方で 1 つの Entity を収める |
| `preset` | top / front / back / left / right / iso の向き。何も収めないなら注視点は保つ |
| `position` / `target` | そのまま置く。`target` だけなら距離を保つ |
| `distance`、`fov` | 上書き |

収める距離は縦横の狭い方の画角で決める。このため、9:16 では 16:9 より離れる。Mesh 単位で測る理由は、Scene がしばしば 1 つの root Entity に空も世界も入れているためである。Entity 単位の除外では空を除外できない。公式サンプルの Skybox は半径 500 m ある。これを含めるとカメラは霧の向こうへ行く。何も映らなくなる。

## MCP tool

すべて `debug` surface である。`projectId` と `sceneId` は任意である。渡した場合だけ現在の Editor と照合する。録画は project をまたいで生きる。このため、project を切り替えたあとの `stop_recording` も通す。

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

録画の呼び出しが失敗しても、制作の tool には影響しない。controller は document の外にある。失敗は `failed` 状態と message として返るだけである。

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

`scripts/summarize-recording.mjs` が FFmpeg で、長時間の制作過程を指定した長さへ一定速度で短縮する。必要なら紹介パートを後ろに結合する。

```bash
pnpm recording:summarize -- --input ~/Videos/XRift\ Studio/xrift-sky-garden-20260902-143005-9x16-1080p.webm \
  --outro ~/Videos/XRift\ Studio/xrift-sky-garden-20260902-160210-9x16-1080p-tour.webm \
  --duration 60 --output ~/Videos/sky-garden-60s.mp4
```

- `--duration` は制作パートを何秒にまとめるかである。速度は自動で決まる（2 時間を 50 秒なら 144 倍）
- `--outro` は等速のまま後ろへつなぐ。両方とも同じプロファイルで録っておく
- 出力は H.264 / yuv420p の MP4 である。X、YouTube、Instagram にそのまま出せる
- 字幕、BGM、トランジションは出力した MP4 に別途付ける

FFmpeg が無ければ、実行するはずだったコマンドを表示して終わる。

## 動作を確認した環境

| 環境 | 経路 | 結果 |
| --- | --- | --- |
| Chromium (紹介ページのブラウザ版デモ) | MediaRecorder、メモリ保存 | 42 秒の WebM。UI 操作で確認 |
| Linux デスクトップ版 (WebKitGTK、Xvfb) | frame-stream + FFmpeg | MCP だけで開始・制作・カメラ調整・停止。MP4 と sidecar |
| Linux デスクトップ版、ソフトウェア GL (llvmpipe) | frame-stream + FFmpeg | 720p までは通る。1080p と草の Terrain を重ねると WebView が止まり、Poly Haven の PBR モデルを多数置くと WebGL の context が失われて take が途中で閉じる。GPU の無い CI 環境の制限で、Studio 側は書けた分を残す |
| Windows (WebView2)、macOS (WKWebView) | MediaRecorder、ディスクへ逐次書き込み | 未確認 |

## 参照

- controller: `src/lib/recording/recording-session.ts`
- 状態機械と命名: `src/lib/recording/recording-state.ts`
- プロファイル: `src/lib/recording/recording-profile.ts`
- カメラ: `src/lib/recording/recording-camera.ts`
- Rust の書き込み: `src-tauri/src/lib.rs` の `recording_*`
- 録画ビュー: `src/components/visual-editor/SceneViewport.tsx`
- パネル: `src/components/visual-editor/RecordingPanel.tsx`
- MCP の分岐: `src/components/visual-editor/VisualEditorPrototype.tsx` の `handleRecordingTool`
