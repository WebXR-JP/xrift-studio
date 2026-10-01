# ワールド制作の録画

LLMがMCP経由でワールドを作る様子を、XRift Studioで録画する。OBSなどの外部ツールを使わず、投稿先に合うアスペクト比で数時間の制作過程を記録できるようにする。短縮、結合、字幕、BGMの編集にはFFmpegか外部の編集ソフトを使う。

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
| 外部ツール (FFmpegなど) | 短縮、結合、字幕、BGM、トランジション、最終出力 |

## 仕組み

録画はReactの外に置いた1つのcontroller（`src/lib/recording/recording-session.ts`）で管理する。シーンのCanvasは投影方式の切り替えやプロジェクトの再読み込みで作り直されるため、そのCanvasを直接録画すると途中で終了してしまう。controllerにはプロファイルに合う大きさの録画用フレームを持たせ、シーンのCanvasを映像ソースとして登録する。

React Three Fiberが1フレーム描くたびに、`addAfterEffect`で映像を録画用フレームへコピーする。`MediaRecorder`は、そのフレームの`captureStream`を符号化する。ソースのCanvasが消えても録画は続き、最後のフレームを表示し続ける。シーンが戻ると新しい映像を記録する。符号化したchunkは1秒ごとに`recording_append_chunk`のraw bodyでRustへ送り、ファイルへ追記する。

WebViewに`MediaRecorder`がない場合は、PATH上のFFmpegを使うフレーム単位の録画へ切り替える。LinuxのWebKitGTKは「unsupported on this platform」を返すため、この経路を使う。録画用フレームをプロファイルのフレームレートでJPEGに変換し、同じ`recording_append_chunk`でRustへ渡す。Rustは`ffmpeg -f image2pipe`へJPEGを送り、H.264のMP4を出力する。

JPEGの符号化が遅れた場合は、経過時間に合わせて同じフレームを複製し、動画の長さを実時間に合わせる。複製回数は`x-xrift-recording-repeat`ヘッダーでRustへ伝え、Rustが同じJPEGをFFmpegへ繰り返し送る。描画した1フレームにつきIPCは1回なので、WebViewの描画が4 fpsまで落ちても書き込みの待ち行列は伸びない。

付属JSONの`encoder`には、使った経路を`media-recorder`または`frame-stream`で記録する。FFmpegもない場合は、`failed`と「FFmpegをPATHに置くとフレーム単位で録画できます」を返す。MP4はfragmented形式（`frag_keyframe+empty_moov`）で書き込むため、WebViewが途中で落ちても書き込めた部分を再生できる。FFmpegの警告とエラーは動画の隣の`<name>.ffmpeg.log`に記録し、失敗messageにもログの末尾を添える。出力がなかったログは停止時に削除する。

停止時は、JPEGの読み出しが5秒、書き込み待ちが20秒を超えたら、ディスクへ届いた分でファイルを閉じる。残ったフレームは破棄し、consoleへ件数を警告する。ソフトウェアGLでWebGL contextが失われた録画では、この処理が必要になる。失敗messageには最初の原因を残し、後続の書き込みで生じた「ファイルが開いていない」というエラーでは置き換えない。WindowsのWebView2とmacOSのWKWebViewはMediaRecorderを持つため、FFmpegの経路は使わない。

動画をメモリに溜めず逐次書き込むので、数時間録画しても動画の長さに比例してメモリは増えない。Rustで書き込めるのは、`recording_begin_file`で開いたファイルだけとする。

保存済みのワールドでは、開いているプロジェクトの`Recording/`へ動画とJSONを保存する。保存先はプロジェクトのパスから決め、シンボリックリンクを経由する保存は拒否する。ワールドの`.gitignore`には`/Recording/`を追加する。AIクライアントから任意の保存パスは指定できない。

未保存のプレビューに限り、従来の既定先、または人が選んだ保存先を使う。既定先はOSのビデオフォルダー直下の`XRift Studio`で、ビデオフォルダーがなければapp dataの`recordings`とする。同名ファイルがあれば番号を付け、既存ファイルは上書きしない。

動画の保存後は、隣に同名の`.json`を書き込む。project idとタイトル、scene id、録画を開始したMCP client名、label、プロファイル、解像度、開始・停止時刻、録画用カメラの姿勢を記録し、あとから制作セッションを識別できるようにする。

ファイル名は`xrift-<project>-<yyyymmdd-hhmmss>-<aspect>-<edge>p[-<label>].webm`とする。同じプロジェクトの録画を並べ、時刻と縦横比をファイル名から確認できる。

## 状態

```text
idle ──start──▶ recording ──stop──▶ stopping ──flush──▶ completed
  ▲                │                    │                   │
  │                └────── error ───────┴──▶ failed         │
  └─────────────────── start (新しい take) ◀────────────────┘
```

- `start`は`recording`と`stopping`の間は受け付けない。受け付けないときも例外ではなく、`started: false`と現在の状態を返す。ボタン操作でも、MCPからの二重呼び出しでも、2つ目のファイルは開かない
- `stop`は常に受け付ける。`recording`以外なら`stopped: false`で現在の状態を返す。`stopping`の間に呼べば同じ完了を待つ
- 失敗したtakeは部分ファイルのpathを残す。1時間の録画が最後の1秒で失敗しても、それまでの映像を開けるようにする
- 6時間で自動停止する。録画の止め忘れによるディスク消費を抑える
- Studioを再起動すると状態は`idle`に戻る。プロファイル、録画ビューの設定、保存先、projectごとの録画用カメラはlocalStorageに残る

純粋な遷移は`recording-state.ts`にある。`recording.fixture.ts`が「2回start」「idleでstop」「途中で失敗」を確かめる。

## プロファイル

| 項目 | 値 |
| --- | --- |
| アスペクト比 | 16:9、9:16、1:1、4:5 |
| 短辺 | 720、1080、1440 px。長辺は比率から決める (9:16の1080は1080x1920、4:5は1080x1350) |
| フレームレート | 30、60 |

両辺を偶数に丸める。H.264と多くのWebM encoderが奇数の画素数に対応していないためである。コンテナはWebViewが対応する形式から選ぶ（WebView2はWebM/VP9、WebKitはMP4）。

録画中にプロファイルを変更した場合、現在のtakeは開始時の設定で続行し、変更は次の録画から適用する。`set_recording_profile`は適用時期を`effectiveFrom`で返す。

## 録画ビュー

「録画ビューを表示」で、シーンのセルが黒地の中央にプロファイルの比率でレターボックスされる。Canvasは同じものである。CSSの大きさに対するdevicePixelRatioを計算し直してプロファイルどおりの画素数で描く。controllerはそれを1:1でコピーする。このため、拡大でぼやけない。モニターの大きさや普段のパネル配置の影響を受けない。

| 設定 | 意味 |
| --- | --- |
| `cameraSource: recording` | 保存した録画用カメラを表示する。ワールドが変わっても構図は動かない |
| `cameraSource: editor` | 編集中のシーンカメラをそのまま映す。編集操作を記録するtake向け |
| `showEditorUi` | オブジェクト一覧、設定、素材、ツールバーを残す。既定は隠す |
| `showEditorHelpers` | グリッド、ギズモ、選択枠、ヘルパーアイコンを映像に含める。既定は入れない (サムネイル撮影と同じ「公開物の見た目」で描く) |
| `showRecordingIndicator` | フレーム左上のREC表示。DOMなので動画には入らない |

録画ビューを閉じても録画は続く（ヘッダーのREC表示は残る）。閉じたあとの映像は編集中のシーンをアスペクト比に合わせて中央で切り抜いたものになる。

動作確認中も録画ビューを使える。完成したワールドを一人称で歩く紹介パートは、動作確認を開始して同じ機能で録画する。この間はプレイヤーの視点を記録し、録画用カメラは使わない。

録画ビューを表示して`showEditorUi: false`にすれば、OBSのウィンドウキャプチャにそのまま黒地とフレームが映る。Studioの録画と同時に回してもよい。必須ではない。

## 録画用カメラ

姿勢はposition、target、fovの3つである。projectごとに保存する。録画ビューを`cameraSource: recording`で表示している間だけシーンのカメラに適用する。閉じると編集中のカメラへ戻す。録画ビューの中でドラッグした構図は、そのまま保存される。

MCPからの移動は純粋関数（`recording-camera.ts`の`resolveRecordingCameraPose`）で処理する。境界の測定だけをviewportに頼む。録画ビューが隠れていても、編集中のカメラを動かさずに姿勢を更新できる。

| 指定 | 動き |
| --- | --- |
| `fitScene` | シーンに描かれているメッシュのboundsをunionして収める。半径100 mを超えるメッシュ (空のドーム、地平線の板) は除外し、除外した数を`skippedLargeMeshCount`で返す。ワールドが広がったら呼び直す |
| `focusEntityId` | Fキーと同じ測り方で1つのオブジェクトを収める |
| `preset` | top / front / back / left / right / isoの向き。何も収めないなら注視点は保つ |
| `position` / `target` | そのまま置く。`target`だけなら距離を保つ |
| `distance`、`fov` | 上書き |

対象を収める距離は、縦横の狭い方の画角で決める。そのため、9:16では16:9よりカメラが離れる。1つのrootオブジェクトに空と他の物体をまとめたシーンでも空だけを除外できるよう、boundsはメッシュ単位で測る。公式サンプルの空の背景は半径500 mあり、含めて測るとカメラが遠ざかりすぎて対象が霧に隠れる。

## MCP tool

すべて`debug` surfaceである。`projectId`と`sceneId`は任意である。渡した場合だけ現在のEditorと照合する。projectを切り替えても録画は続く。切り替えたあとも`stop_recording`を受け付ける。

| tool | 役割 |
| --- | --- |
| `start_recording` | 開始。`label`、このtakeだけの`profile`、`showViewport` |
| `stop_recording` | 停止してflushを待ち、pathと長さと大きさを返す |
| `get_recording_status` | 状態機械、プロファイル、録画ビュー、カメラ |
| `set_recording_profile` | 次のtakeのフレーム |
| `set_recording_viewport` | 録画ビューの表示と描く内容 |
| `get_recording_viewport` | 上の読み取り |
| `set_recording_camera` | 録画用カメラの移動 |
| `get_recording_camera` | 姿勢と、いまシーンを動かしているか |

録画の呼び出しが失敗しても、制作のtoolには影響しない。controllerはdocumentの外にある。失敗は`failed`状態とmessageとして返るだけである。

典型的な手順。

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

`scripts/summarize-recording.mjs`がFFmpegで、長時間の制作過程を指定した長さへ一定速度で短縮する。必要なら紹介パートを後ろに結合する。

```bash
pnpm recording:summarize -- --input ~/Videos/XRift\ Studio/xrift-sky-garden-20260902-143005-9x16-1080p.webm \
  --outro ~/Videos/XRift\ Studio/xrift-sky-garden-20260902-160210-9x16-1080p-tour.webm \
  --duration 60 --output ~/Videos/sky-garden-60s.mp4
```

- `--duration`は制作パートを何秒にまとめるかである。速度は自動で決まる（2時間を50秒なら144倍）
- `--outro`は等速のまま後ろへつなぐ。両方とも同じプロファイルで録っておく
- 出力はH.264 / yuv420pのMP4である。X、YouTube、Instagramにそのまま出せる
- 字幕、BGM、トランジションは出力したMP4に別途付ける

FFmpegが無ければ、実行するはずだったコマンドを表示して終わる。

## 動作を確認した環境

| 環境 | 経路 | 結果 |
| --- | --- | --- |
| Chromium (紹介ページのブラウザ版デモ) | MediaRecorder、メモリ保存 | 42秒のWebM。UI操作で確認 |
| Linuxデスクトップ版 (WebKitGTK、Xvfb) | frame-stream + FFmpeg | MCPだけで開始・制作・カメラ調整・停止。MP4と付属ファイル |
| Linuxデスクトップ版、ソフトウェアGL (llvmpipe) | frame-stream + FFmpeg | 720pまでは通る。1080pと草の地形を重ねるとWebViewが止まり、Poly HavenのPBRモデルを多数置くとWebGLのcontextが失われてtakeが途中で閉じる。GPUの無いCI環境の制限で、Studio側は書けた分を残す |
| Windows (WebView2)、macOS (WKWebView) | MediaRecorder、ディスクへ逐次書き込み | 未確認 |

## 参照

- controller: `src/lib/recording/recording-session.ts`
- 状態機械と命名: `src/lib/recording/recording-state.ts`
- プロファイル: `src/lib/recording/recording-profile.ts`
- カメラ: `src/lib/recording/recording-camera.ts`
- Rustの書き込み: `src-tauri/src/lib.rs`の`recording_*`
- 録画ビュー: `src/components/visual-editor/SceneViewport.tsx`
- パネル: `src/components/visual-editor/RecordingPanel.tsx`
- MCPの分岐: `src/components/visual-editor/VisualEditorPrototype.tsx`の`handleRecordingTool`
