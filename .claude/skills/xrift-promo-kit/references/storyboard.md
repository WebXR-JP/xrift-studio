# storyboard.json リファレンス

型の定義は `dev/release-promo/_kit/src/core/storyboard.ts` にある。この文書と食い違った場合は、型の定義を優先する。

## トップレベル

| フィールド | 必須 | 内容 |
|---|---|---|
| `id` | 必須 | 動画の識別子。ディレクトリ名と揃える |
| `from` / `to` | 任意 | 差分の範囲。`extract-release-diff.mjs` と揃える |
| `version` | 任意 | 紹介するバージョン。タイトルと締めのバッジに出る |
| `releaseStatus` | 必須 | `published` が標準。公開前だけ `upcoming` |
| `scriptApproval` | 必須 | `{ "status": "pending" | "approved", "approvedBy": "user" }` |
| `copyReview` | 任意 | 対象読者、音なしで理解できるか、監査状態 |
| `sourceNotes` | 任意 | 収録日・収録元・素材の扱いの記録 |
| `theme` | 任意 | `dark`（既定、画面が引き立つ）または `light` |
| `format` | 必須 | `width` `height` `fps`、必要なら `sourceAspect` |
| `music` | 任意 | `bed` `volume` `bpm` `fadeInInFrames` `fadeOutInFrames` |
| `sfx` | 任意 | `enabled` `volume` `auto` |
| `scenes` | 必須 | シーンの配列。上から順に並ぶ |

`format.durationInFrames` を書くとシーンの合計より優先される。通常は書かない。

## すべてのシーンに共通

| フィールド | 必須 | 内容 |
|---|---|---|
| `id` | 必須 | シーンの識別子。Remotion のタイムラインに出る |
| `kind` | 必須 | `title` `feature` `screen` `compare` `bullets` `end` |
| `durationInBars` | どちらか | 小節数。BGM の拍とカットが揃う |
| `durationInFrames` | どちらか | フレーム数。拍から外したいときだけ |
| `claim` | 必須 | このシーンが主張する事実。差分か実画面で裏づける |
| `caption` | 任意 | 画面下に出す 1 文。音なしで読めること |
| `doneWhen` | 任意 | レビューの完了条件 |
| `sfx` | 任意 | `[{ "id": "pop", "at": 24, "volume": 0.4 }]`。自動付与に足す分だけ |
| `noTransitionSfx` | 任意 | シーン頭の切り替え音とカットの帯を止める |

## kind ごとのフィールド

### title

| フィールド | 既定 |
|---|---|
| `title` | `XRift Studio アップデート情報` |
| `eyebrow` | `XRIFT STUDIO` |
| `version` | なし |

### feature

| フィールド | 内容 |
|---|---|
| `headline` | 1 行目。何が変わったか |
| `subhead` | 2 行目。利用者にとって何がよくなるか |
| `eyebrow` | 既定は `今回のアップデート` |
| `background` | 背景に敷く実画面。ぼかして薄く出るので静止画を使う |

長い見出しは日本語だと単語の途中で折り返される。`\n` を書いて切れ目を指定する。

### screen

| フィールド | 内容 |
|---|---|
| `source` | `"source/editor.png"` または `{ "src": "source/edit.mp4", "startFrom": 30, "playbackRate": 1 }` |
| `label` | 画面の出どころ。例 `実画面 / Visual Editor` |
| `pointer` | `from` `to` `moveStartFrame` `moveDurationInFrames` `clickAtFrame` `extraClickFrames` `scale` |
| `focus` | `x` `y` `scale` `startFrame` `durationInFrames` `holdInFrames` |
| `callouts` | `[{ "x", "y", "text", "at", "durationInFrames", "side" }]` |
| `keyHint` | `{ "keys": ["W","A","S","D"], "label": "移動", "at": 40, "sequence": true }` |
| `redactions` | `[{ "x", "y", "width", "height", "mode", "reason" }]`。個人情報を伏せる。mode は blur か block |

`source` を省くと「実画面の素材が未収録です」と表示される。架空の UI を作らず、収録が必要なことが分かる状態のまま止める。

拡張子が `.mp4` `.webm` `.mov` `.m4v` なら動画として扱う。素材の音は既定で無音。使う場合は `volume` を指定する。

動画素材は使う前に `prepare-footage.mjs` で整える。整えていないと、書き出しの途中で `No frame found at position` が出て止まる。

フォーカスの輪は `pointer` があるシーンにだけ出る。範囲を見せるためのズームでは輪が出ないので、指していない場所を指したようには見えない。

### compare

| フィールド | 内容 |
|---|---|
| `before` / `after` | 変更前後の素材。同じ画角・同じ解像度で撮る |
| `beforeLabel` / `afterLabel` | 既定は `変更前` / `変更後` |
| `wipeAtFrame` | 既定 25 |
| `wipeDurationInFrames` | 既定 26 |

### bullets

| フィールド | 内容 |
|---|---|
| `heading` | 見出し |
| `items` | 2〜4 項目。1 項目は短い 1 行 |
| `background` | 背景に敷く実画面 |

項目の出現は 12 フレーム目から 14 フレーム間隔。効果音の自動付与と揃えてあるので、間隔を変えるときは音側も見る。

### end

| フィールド | 内容 |
|---|---|
| `title` | 締めの見出し。省略すると `releaseStatus` から決まる |
| `featureLabel` | 紹介した更新の名前 |
| `version` | バージョンのバッジ |
| `note` | 次の一手。入手先や確認先 |

見出しは `releaseStatus` から決まる。`published` なら「アップデート公開中」、`upcoming` なら「アップデート公開予定」。アップデート紹介では、ここを自由文にしない。

アップデート以外の動画（アプリそのものの紹介など）では `title` に内容へ合う一言を指定する。実例は `dev/release-promo/studio-intro/storyboard.json`。

## 座標

`pointer` `focus` `callouts` の座標は、すべて素材内の割合（0〜1）。左上が `{x:0, y:0}`、右下が `{x:1, y:1}`。出力解像度や縦横比を変えても同じ値が使える。

取得方法は [xrift-promo-capture](../../xrift-promo-capture/SKILL.md) にある。

## 例: 実画面デモ 1 シーン

```json
{
  "id": "open-terrain",
  "kind": "screen",
  "durationInBars": 5,
  "source": "source/editor.png",
  "label": "実画面 / Visual Editor",
  "caption": "地形タブからブラシを選べます",
  "claim": "地形タブでブラシを選べる",
  "doneWhen": "タブとブラシの選択が読み取れる",
  "pointer": {
    "from": { "x": 0.42, "y": 0.5 },
    "to": { "x": 0.19, "y": 0.24 },
    "moveStartFrame": 18,
    "moveDurationInFrames": 16,
    "clickAtFrame": 42,
    "scale": 1.9
  },
  "focus": {
    "x": 0.19,
    "y": 0.24,
    "scale": 1.4,
    "startFrame": 54,
    "durationInFrames": 24,
    "holdInFrames": 60
  },
  "callouts": [
    { "x": 0.19, "y": 0.34, "text": "ブラシの強さ", "at": 96, "side": "right" }
  ]
}
```
