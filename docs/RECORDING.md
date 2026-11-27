# ワールド制作の録画

LLM が MCP 経由でワールドを作る様子を、XRift Studio 自身で録画する機能である。OBS などの外部ツールを使わずに、投稿先に合ったアスペクト比で数時間の制作過程を記録できる。短縮、結合、字幕、BGM などの仕上げには FFmpeg や外部の編集ソフトを使う。

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

| 担当 | 役割 |
| --- | --- |
| XRift Studio | 録画の開始・停止と状態管理、指定したアスペクト比と解像度での録画、録画ビューと録画用カメラ、ディスクへの逐次書き込み |
| MCP | 録画の開始・停止・状態取得、プロファイルと録画ビューの指定、録画用カメラの移動、ワールド制作そのもの |
| 外部ツール（FFmpeg など） | 短縮、結合、字幕、BGM、トランジション、最終出力 |

## 仕組み

録画は React の外側に置いた 1 つのコントローラー（`src/lib/recording/recording-session.ts`）で管理する。シーンの Canvas は投影方式の切り替えやプロジェクトの再読み込みで作り直されるため、Canvas を直接録画すると途中で切れてしまう。コントローラー側にプロファイルに合わせたサイズの録画用フレームを持たせ、シーンの Canvas を映像ソースとして登録する仕組みにしている。

React Three Fiber が 1 フレーム描画するたびに、`addAfterEffect` で映像を録画用フレームへコピーし、`MediaRecorder` がそのフレームの `captureStream` を符号化する。ソースの Canvas が一時的に消えても録画は途切れず最後のフレームを維持し、シーンが復帰すると新しい映像の記録を再開する。符号化したチャンクは 1 秒ごとに `recording_append_chunk` の生データとして Rust へ送り、ファイルへ追記する。

### MediaRecorder 非対応環境でのフォールバック

WebView に `MediaRecorder` がない場合は、PATH 上の FFmpeg を使うフレーム単位の録画へ切り替える。Linux の WebKitGTK は「unsupported on this platform」を返すため、この経路を使う。録画用フレームをプロファイルのフレームレートで JPEG に変換し、同じ `recording_append_chunk` で Rust へ渡す。Rust は `ffmpeg -f image2pipe` へ JPEG を送り込み、H.264 の MP4 を出力する。

JPEG の符号化が遅れた場合は、経過時間に合わせて同じフレームを複製し、動画の長さを実時間に揃える。複製回数は `x-xrift-recording-repeat` ヘッダーで Rust へ伝え、Rust が同じ JPEG を FFmpeg へ繰り返し送る。描画した 1 フレームにつき IPC は 1 回で済むため、WebView の描画が 4 fps まで落ちても書き込みキューが膨らまない。

付属 JSON の `encoder` には、使用した経路に応じて `media-recorder` または `frame-stream` を記録する。FFmpeg も見つからない場合は `failed` と「FFmpegをPATHに置くとフレーム単位で録画できます」を返す。MP4 はフラグメント形式（`frag_keyframe+empty_moov`）で書き出すため、WebView が途中で落ちても書き込み済みの部分を再生できる。FFmpeg の警告やエラーは動画と同じ場所の `<name>.ffmpeg.log` に記録し、失敗メッセージの末尾にも添える。出力が空のログは停止時に削除する。

停止時に JPEG の読み出しが 5 秒、または書き込み待ちが 20 秒を超えた場合は、ディスクへ届いた分でファイルを閉じる。残ったフレームは破棄し、件数をコンソールへ警告する。ソフトウェア GL で WebGL コンテキストが失われた録画を安全に閉じるための処置である。失敗メッセージには最初の原因を残し、後続の書き込みで起きた「ファイルが開いていない」というエラーで上書きしない。Windows の WebView2 と macOS の WKWebView は `MediaRecorder` を備えているため、FFmpeg 経路は使わない。

### 保存先と付属ファイル

動画をメモリに溜めず逐次書き込むため、数時間録画しても録画時間に比例してメモリ使用量は増えない。Rust 側で書き込めるのは `recording_begin_file` で開いたファイルだけとする。

保存済みのワールドでは、開いているプロジェクト内の `Recording/` に動画と JSON を保存する。保存先はプロジェクトのパスから決定し、シンボリックリンク経由の保存は拒否する。ワールドの `.gitignore` には `/Recording/` を追加する。AI クライアントから任意の保存パスを指定することはできない。

未保存のプレビューに限り、従来の既定先またはユーザーが選んだ保存先を使う。既定先は OS のビデオフォルダー直下の `XRift Studio` とし、ビデオフォルダーがない場合はアプリデータ配下の `recordings` を使う。同名ファイルがある場合は連番を付け、既存ファイルを上書きしない。

動画の保存後、同じ場所に同名の `.json` を書き込む。プロジェクト ID とタイトル、シーン ID、録画を開始した MCP クライアント名、`label`、プロファイル、解像度、開始・停止時刻、録画用カメラの姿勢を記録し、あとから制作セッションを識別できるようにする。

ファイル名は `xrift-<project>-<yyyymmdd-hhmmss>-<aspect>-<edge>p[-<label>].webm` とする。同じプロジェクトの録画を並べたときに、時刻と縦横比をファイル名だけで判別できる。

## 状態

```text
idle ──start──▶ recording ──stop──▶ stopping ──flush──▶ completed
  ▲                │                    │                   │
  │                └────── error ───────┴──▶ failed         │
  └─────────────────── start (新しい take) ◀────────────────┘
```

- `start` は `recording` と `stopping` の間は受け付けない。受け付けない場合も例外にせず、`started: false` と現在の状態を返す。ボタン操作でも MCP からの二重呼び出しでも、2 つ目のファイルは開かない。
- `stop` は常に受け付ける。`recording` 以外の状態なら `stopped: false` で現在の状態を返す。`stopping` の間に呼ばれた場合は同じ完了を待つ。
- 失敗した録画でも部分ファイルのパスを残す。1 時間の録画が最後の 1 秒で失敗しても、それまでの映像を開けるようにするためである。
- 6 時間で自動停止し、止め忘れによるディスク消費を抑える。
- Studio を再起動すると状態は `idle` に戻る。プロファイル、録画ビューの設定、保存先、プロジェクトごとの録画用カメラは `localStorage` に保持する。

純粋な状態遷移ロジックは `recording-state.ts` にあり、`recording.fixture.ts` で「2 回 start」「idle で stop」「途中で失敗」などのケースを検証する。

## プロファイル

| 項目 | 値 |
| --- | --- |
| アスペクト比 | 16:9、9:16、1:1、4:5 |
| 短辺 | 720、1080、1440 px。長辺は比率から算出する（9:16 の 1080 は 1080×1920、4:5 は 1080×1350） |
| フレームレート | 30、60 |

H.264 や多くの WebM エンコーダーは奇数の画素数に対応していないため、縦横とも偶数に丸める。コンテナは WebView が対応する形式から自動選択する（WebView2 は WebM / VP9、WebKit は MP4）。

録画中にプロファイルを変更した場合、進行中の録画は開始時の設定のまま続け、変更は次の録画から適用する。`set_recording_profile` は適用時期を `effectiveFrom` で返す。

## 録画ビュー

「録画ビューを表示」を有効にすると、シーン領域の中央にプロファイルの比率で黒帯付き（レターボックス）の表示を行う。使う Canvas は通常のシーンと同じだが、CSS 表示サイズに対する `devicePixelRatio` を再計算してプロファイルどおりの画素数で描画し、コントローラーが 1:1 でコピーする。そのため拡大によるぼやけが起きず、モニターの解像度や普段のパネル配置にも左右されない。

| 設定 | 意味 |
| --- | --- |
| `cameraSource: recording` | 保存した録画用カメラの視点を表示する。ワールドが変化しても構図が動かない |
| `cameraSource: editor` | 編集中のシーンカメラをそのまま映す。編集操作そのものを記録したいとき向け |
| `showEditorUi` | Hierarchy、Inspector、Assets、ツールバーを残す。既定は非表示 |
| `showEditorHelpers` | グリッド、ギズモ、選択枠、ヘルパーアイコンを映像に含める。既定は非表示（サムネイル撮影と同じ「公開物の見た目」で描く） |
| `showRecordingIndicator` | フレーム左上の REC 表示。DOM 要素のため動画には映り込まない |

録画ビューを閉じても録画自体は継続する（ヘッダーの REC 表示は残る）。閉じたあとの映像は、編集中のシーンをアスペクト比に合わせて中央で切り抜いたものになる。

Play 中も録画ビューを利用できる。完成したワールドを一人称視点で歩いて紹介するパートは、Play を開始して同じ録画機能で撮影する。この間はプレイヤー視点が記録され、録画用カメラは使われない。

録画ビューを表示して `showEditorUi: false` にすれば、OBS のウィンドウキャプチャにも黒地と録画フレームがそのまま映る。必要に応じて Studio 側の録画と同時に使うこともできる。

## 録画用カメラ

カメラの姿勢は `position`、`target`、`fov` の 3 要素で持ち、プロジェクトごとに保存する。録画ビューを `cameraSource: recording` で表示している間だけシーンのカメラへ適用し、閉じると編集中のカメラへ戻す。録画ビュー内でドラッグして調整した構図はそのまま保存される。

MCP からのカメラ移動は純粋関数（`recording-camera.ts` の `resolveRecordingCameraPose`）で計算し、境界の測定だけをビューポートに委ねる。録画ビューが非表示の間でも、編集中のカメラを動かさずに録画用カメラの姿勢を更新できる。

| 指定 | 動き |
| --- | --- |
| `fitScene` | シーン内のメッシュのバウンディングボックスを合成して画面に収める。半径 100 m を超えるメッシュ（空のドームや地平線の板など）は除外し、除外件数を `skippedLargeMeshCount` で返す。ワールドが広がったら再度呼び出す |
| `focusEntityId` | F キーと同じ測り方で 1 つの Entity を収める |
| `preset` | `top` / `front` / `back` / `left` / `right` / `iso` の向きに合わせる。収める対象を指定しない場合は注視点を維持する |
| `position` / `target` | 指定値どおりに配置する。`target` だけの指定なら距離を維持する |
| `distance`、`fov` | 距離や視野角を上書きする |

対象を収める距離は縦横の狭い方の画角から算出するため、9:16 では 16:9 よりカメラが後ろへ引く。1 つのルート Entity に空と他の物体をまとめたシーンでも空だけを除外できるよう、バウンディングボックスはメッシュ単位で計測する。公式サンプルの空の背景は半径 500 m あるため、これを含めて測るとカメラが遠ざかりすぎて対象が霧に隠れてしまう。

## MCP ツール

いずれも `debug` サーフェスに属する。`projectId` と `sceneId` は省略可能で、渡した場合だけ現在のエディターと照合する。プロジェクトを切り替えても録画は継続し、切り替え後も `stop_recording` を受け付ける。

| ツール | 役割 |
| --- | --- |
| `start_recording` | 録画を開始する。`label`、この録画だけの `profile`、`showViewport` を指定できる |
| `stop_recording` | 録画を停止して書き出し完了を待ち、ファイルパス・長さ・サイズを返す |
| `get_recording_status` | 状態、プロファイル、録画ビュー、カメラの現在値を取得する |
| `set_recording_profile` | 次の録画に使うプロファイルを設定する |
| `set_recording_viewport` | 録画ビューの表示と描画対象を設定する |
| `get_recording_viewport` | 録画ビューの現在設定を取得する |
| `set_recording_camera` | 録画用カメラを移動する |
| `get_recording_camera` | 録画用カメラの姿勢と、現在シーンに適用中かを取得する |

録画ツールの呼び出しが失敗しても、ワールド制作側のツールには影響しない。コントローラーはシーンデータとは独立しており、失敗時は `failed` 状態とエラーメッセージを返すだけである。

典型的な実行手順は次のとおり。

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

`scripts/summarize-recording.mjs` を使うと、長時間の制作動画を FFmpeg で指定した長さへ一定速度で短縮できる。必要に応じて紹介パートを後ろに結合することも可能である。

```bash
pnpm recording:summarize -- --input ~/Videos/XRift\ Studio/xrift-sky-garden-20260902-143005-9x16-1080p.webm \
  --outro ~/Videos/XRift\ Studio/xrift-sky-garden-20260902-160210-9x16-1080p-tour.webm \
  --duration 60 --output ~/Videos/sky-garden-60s.mp4
```

- `--duration` は制作パートを何秒に縮めるかを指定する。倍速は自動計算される（2 時間を 50 秒にするなら 144 倍）。
- `--outro` は等速のまま後ろへ結合する。あらかじめ両方とも同じプロファイルで録画しておく。
- 出力は H.264 / yuv420p の MP4 となり、X、YouTube、Instagram へそのまま投稿できる。
- 字幕、BGM、トランジションは出力した MP4 に別途追加する。

FFmpeg が見つからない場合は、実行するはずだったコマンドを表示して終了する。

## 動作を確認した環境

| 環境 | 経路 | 結果 |
| --- | --- | --- |
| Chromium（紹介ページのブラウザ版デモ） | MediaRecorder、メモリ保存 | 42 秒の WebM を UI 操作で確認 |
| Linux デスクトップ版（WebKitGTK、Xvfb） | frame-stream + FFmpeg | MCP だけで開始・制作・カメラ調整・停止を実行し、MP4 と付属ファイルを生成 |
| Linux デスクトップ版、ソフトウェア GL（llvmpipe） | frame-stream + FFmpeg | 720p までは完走。1080p と草の地形を重ねると WebView が停止し、Poly Haven の PBR モデルを多数置くと WebGL コンテキストが失われて途中で終了する。GPU のない CI 環境の制限であり、Studio 側は書き込めた分を残す |
| Windows（WebView2）、macOS（WKWebView） | MediaRecorder、ディスクへ逐次書き込み | 未確認 |

## 参照

- コントローラー: `src/lib/recording/recording-session.ts`
- 状態遷移と命名: `src/lib/recording/recording-state.ts`
- プロファイル: `src/lib/recording/recording-profile.ts`
- カメラ: `src/lib/recording/recording-camera.ts`
- Rust の書き込み処理: `src-tauri/src/lib.rs` の `recording_*`
- 録画ビュー: `src/components/visual-editor/SceneViewport.tsx`
- パネル: `src/components/visual-editor/RecordingPanel.tsx`
- MCP の分岐処理: `src/components/visual-editor/VisualEditorPrototype.tsx` の `handleRecordingTool`
