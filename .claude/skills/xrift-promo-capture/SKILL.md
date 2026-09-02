---
name: xrift-promo-capture
description: XRift Studio のリリース動画に使う実画面を収録し、ポインターやズームの座標を取り出す。撮る前の画面の整え方、静止画と録画の撮り分け、カーソルを入れない収録、0〜1 座標の求め方、素材の置き場所と記録を提供する。「画面を録画したい」「スクショを動画に使う」「ポインターの座標を知りたい」「どこをズームするか決めたい」「収録素材の準備」などで使う。
---

# リリース動画の実画面収録

## Overview

リリース動画に使えるのは、実際に動いている XRift Studio の画面だけ。架空の UI、作り込んだモック、成功したように見せる画像を作らない。素材がまだ無い機能は、動画を止めて収録待ちにする。

収録の実行そのものは [xrift-studio-verify](../xrift-studio-verify/SKILL.md) の流れを使う。このスキルは「動画に使える素材にするための条件」と「座標の取り出し方」を扱う。

## 撮る前に整える

1. 対象のコミットの状態でアプリを起動する。ブラウザで確認できる導線はプレビュー、Tauri 固有の導線は実機を使う。
2. 個人情報を画面から消す。プロジェクト名、ファイルパス、アカウント名、通知、他アプリのウィンドウ。
3. ウィンドウの大きさを固定する。以後の収録をすべて同じ大きさで撮る。混ざると座標が合わなくなる。
4. 素材側のカーソルを入れない。ポインターは動画側で描く。
5. 表示倍率（DPR）と viewport の大きさを記録する。

## 何を撮るか

1 つの操作について、次の 3 つを撮る。成功トーストだけで終わらせない。

| 撮るもの | 使い道 |
|---|---|
| 操作前 | ポインターが向かう先を見せる |
| 操作中 | 主操作そのもの |
| 操作後 | 結果が画面に残っている状態 |

- 静止画で足りる導線は静止画にする。ファイルが軽く、ズームやポインターの制御が正確になる。
- 連続した動きが主題のとき（ブラシ、カメラ操作、再生）は録画にする。`.mp4` を `public/source/` に置けば、storyboard 側は静止画と同じ書き方で指定できる。
- 変更前後を比べる動画では、同じ画角・同じウィンドウサイズで 2 枚撮る。ずれていると `compare` シーンで位置が飛ぶ。

## 収録した動画は必ず整える

画面収録は可変フレームレートで、タイムスタンプが飛んでいることが多い。そのまま使うと、書き出しの途中で `No frame found at position` が出て止まる。プレビューや静止画は通るのに通しの書き出しだけ落ちるため、先に整えておく。

```powershell
node ../_kit/scripts/prepare-footage.mjs          # public/source の動画を整える
node ../_kit/scripts/prepare-footage.mjs --force  # 整え直す
```

固定フレームレートへ変換し、キーフレームを詰め、音声を落として同じ場所へ置き換える。整えた記録は `public/source/prepared.json` に残る。

`feature` や `bullets` の背景に動画を敷くのは避け、静止画を使う。ぼかして薄く出すだけなので動きは見えず、書き出しが安定する。ffmpeg で 1 フレームだけ取り出して `public/source/` に置く。

## 制作セッションの長期録画から素材を作る

AI client が MCP で World を組む制作風景は、Scene View の「長期録画」で撮る。外部の録画ツールは要らない。診断の「録画」の隣にあり、押してから止めるまで Scene View の Canvas を 5fps で app data へ逐次保存し、同じフォルダの `activity.jsonl` に録画中の MCP tool call を残す。MCP からは `capture_scene_debug` を `mode: "session"` で呼ぶ。詳細は [MCP 制作セッション動画 仕様](../../../docs/MCP_SESSION_VIDEO_SPEC.md)。

1. 新規 project を開き、長期録画を始める (手で押すか、プロンプトの冒頭で AI に始めさせる)。
2. AI に制作させる。公開・アップロード・削除はさせない。
3. 停止し、結果バーの「保存先を開く」で `recording-<開始時刻>/` を取り出す。
4. 動画プロジェクトでタイムラプスと cue を作る。

```powershell
node ../_kit/scripts/session-timelapse.mjs --recording <録画フォルダ> --target-seconds 18
```

`public/source/<録画フォルダ名>/timelapse.mp4` と `cues.json` ができる。tool call が途切れた区間は 1 秒に畳み、ウィンドウが隠れていた区間は切る。`cues.json` の tool call の列と所要時間は storyboard の字幕と HUD の出典になる。費用は script では出ないので、client 側の集計を手で書き、`sourceNotes` に出典を残す。

録れるのは Scene View の Canvas だけで、Hierarchy、Inspector、terminal は入らない。「AI が何をしているか」は `cues.json` から字幕で描く。複数のモデルを比べるときは、同じ project 雛形、同じプロンプト、同じウィンドウサイズで撮る。

## 写ってはいけないものを伏せる

収録に個人情報が入っていたら、撮り直すか storyboard で伏せる。素材そのものは加工せず、動画側で重ねるだけにして元の収録を残す。

```json
"redactions": [
  { "x": 0.110, "y": 0.124, "width": 0.228, "height": 0.026,
    "mode": "blur", "reason": "ローカルパスに含まれるユーザー名" }
]
```

XRift Studio でよく写るもの:

| 出るところ | 内容 |
|---|---|
| プロジェクト一覧の見出し下 | AppData 配下のプロジェクト保存先。Windows のユーザー名が入る |
| プロジェクト名とサムネイル | 未公開の作品名、他人から預かった素材 |
| ログイン後の画面 | アカウント名 |

`mode` は `blur`（既定、下をぼかす）と `block`（塗りつぶす）。`reason` はレビューで何を隠したか分かるように必ず書く。伏せた範囲は書き出し後の静止画で必ず確認する。

## 置き場所と記録

```text
dev/release-promo/<slug>/public/source/
  01-editor.png
  02-terrain-tab.png
  03-brush.mp4
```

storyboard の `sourceNotes` に、収録日・収録元（実機かプレビューか）・カーソルを含めていないこと・書き込みを伴う操作をしていないことを書く。

```json
"sourceNotes": [
  "source/01-editor.png は 2026-08-18 にデスクトップ版 0.9.0 で収録した。",
  "素材にシステムカーソルは含まれない。ポインターは Remotion で描いている。",
  "収録中に公開・削除・アップロードは行っていない。"
]
```

## 座標を取り出す

storyboard の `pointer` `focus` `callouts` は、すべて素材内の割合（0〜1）で書く。左上が `{x:0, y:0}`。

### 画面から取る

対象の要素が分かっているときは、画面上で直接測るのが確実。Tauri MCP の webview で次を実行する。

```js
(() => {
  const el = document.querySelector('[data-testid="terrain-tab"]');
  const r = el.getBoundingClientRect();
  return {
    x: +( (r.left + r.width / 2) / window.innerWidth ).toFixed(3),
    y: +( (r.top + r.height / 2) / window.innerHeight ).toFixed(3),
  };
})()
```

収録した画面と同じウィンドウサイズで実行する。サイズが違うと値がずれる。

### 画像から取る

要素セレクタが分からないときは、画像上のピクセル位置を素材の幅と高さで割る。

```powershell
# 素材の大きさを確認する
ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 public/source/01-editor.png
```

`x = ピクセルX / 幅`、`y = ピクセルY / 高さ`。小数第 3 位まででよい。

### 決めた座標の確認

storyboard に入れたら、必ず静止画で確認する。ポインターの先端・フォーカスの輪・ズームの中心が同じ対象を指していることを目で見る。

```powershell
npm run still
pnpm exec remotion still Promo --frame=430 out/check-430.png
```

## 動画素材の指定

```json
"source": { "src": "source/03-brush.mp4", "startFrom": 45, "playbackRate": 1 }
```

- `startFrom` は素材側のフレーム番号。前後の余計な間を切る。
- 素材の音は既定で鳴らない。使う場合だけ `volume` を指定し、BGM と重ならないか確認する。
- 長い録画をそのまま貼らない。シーンの尺に収まる範囲を選び、収まらないなら操作を分ける。

## やらないこと

- 未実装の画面を隠すための画像を作らない。収録できないなら動画を止めて確認待ちにする。
- 収録のためにアプリの外へ影響する操作（公開、アップロード、削除、リセット）を勝手に行わない。必要なら事前にユーザーの許可を得る。
- 別のバージョンで撮った画面を混ぜない。UI が変わっていると、動画の主張と画面が食い違う。
- 素材を引き伸ばして縦横比を変えない。比が違う収録は `format.sourceAspect` で伝える。
