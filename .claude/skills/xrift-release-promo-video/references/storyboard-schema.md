# Storyboard schema

`storyboard.json` は動画の編集データであり、Git差分の要約と Remotion の入力値の間に置く。コードにテキストや座標を直書きせず、シーンごとに検証できる形で保存する。

## 例

```json
{
  "id": "v0.6.0-feature-promo",
  "from": "v0.5.12",
  "to": "HEAD",
  "format": { "width": 1920, "height": 1080, "fps": 30 },
  "scenes": [
    {
      "id": "new-editor-flow",
      "kind": "screen-focus",
      "durationInFrames": 180,
      "source": {
        "type": "video",
        "src": "source/editor-flow.mp4",
        "width": 1920,
        "height": 1080
      },
      "claim": "作成したワールドを、その場で起動して確認できる",
      "caption": "作成から確認までを一つの流れに",
      "pointer": {
        "from": { "x": 0.58, "y": 0.42 },
        "to": { "x": 0.74, "y": 0.46 },
        "moveStartFrame": 26,
        "moveDurationInFrames": 14,
        "clickAtFrame": 52,
        "scale": 1.8
      },
      "focus": {
        "x": 0.74,
        "y": 0.46,
        "scale": 1.45,
        "startFrame": 40,
        "durationInFrames": 24,
        "holdInFrames": 34
      },
      "doneWhen": "起動後の画面が読み取れる"
    }
  ]
}
```

## ルール

- `pointer` と `focus` の `x` / `y` は素材の左上を `(0, 0)`、右下を `(1, 1)` とする正規化座標。元素材のピクセル座標から変換し、画面サイズ変更に耐えるようにする。
- `source.src` は `public/` からの相対パスにする。元の録画・スクリーンショットは加工前のまま残す。
- `claim` は1シーンで伝える事実を一文にする。内部コンポーネント名や実装方式ではなく、ユーザーの結果を書く。
- `caption` は音声なしで読める短い文にする。ボタン名をそのまま並べない。
- `doneWhen` はシーンを採用する根拠。満たせないシーンはレンダリング対象から外す。
- `focus.scale` は通常 1.25〜1.7、`pointer.scale` は通常 1.6〜2.2 とする。対象が小さい場合でも最大値を先に上げず、素材の解像度と字幕の可読性を確認する。
- ポインターが動かないシーンでも `pointer.to` を持たせ、フォーカス対象との関係を明示する。

## 代表的な `kind`

- `hook`: タイトル、変更後の結果、短い問いかけ。
- `screen-focus`: 実画面をポインター、クリック、ズームで見せる。
- `before-after`: 変更前と変更後を同じ操作の前後で比較する。
- `proof`: 成功後のURL、生成物、一覧、ログなど結果を見せる。
- `cta`: 次回アップデート、公開先、確認依頼などの終端。

新しい `kind` を追加する場合は、入力データ、画面上の責務、完了条件をこのファイルに追記する。
