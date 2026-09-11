# 音源の作り方

`dev/release-promo/_kit/scripts` の 3 ファイルで完結している。外部ライブラリを使わない。

| ファイル | 役割 |
|---|---|
| `dsp.mjs` | 波形、フィルタ、エンベロープ、リバーブ、WAV 書き出し |
| `instruments.mjs` | 楽器と効果音の合成 |
| `gen-audio.mjs` | 曲の設計（BEDS）と効果音の一覧（SFX）、CLI |

出力は 44.1kHz / 16bit / ステレオ。乱数はすべて種を固定した `mulberry32` なので、何度実行しても同じ波形になる。

## 曲を足す

`gen-audio.mjs` の `BEDS` に足す。

```js
{
  id: "calm-96",
  label: "落ち着いた雰囲気。使い方ガイド向け",
  bpm: 96,
  bars: 8,
  mood: "calm",          // renderBed の分岐に対応する
  chords: [
    { notes: [64, 67, 71, 74], bass: 36 },  // 1 小節ぶん。notes は MIDI 番号
    ...
  ],
}
```

`mood` は `renderBed` の中で楽器構成を切り替えるキー。新しい構成が必要なら分岐を足す。

- `bright`: 1 拍目と 3 拍目のキック、8 分ハット、シェイカー、上昇アルペジオ
- `calm`: パッドとベルだけ。打楽器なし
- `drive`: 4 つ打ち、オフビートのベース、8 分のプラック

足したら `_kit/src/core/timing.ts` の `BED_SPECS` に同じ `bpm` と `bars` を書く。ここが実際の長さとずれると、ループを並べたときに継ぎ目が合わなくなる。

## ループを途切れさせない

BGM 用のバッファは `new Track(length, { wrap: true })` で作る。末尾を超えた書き込みが先頭へ回り込むので、最後の小節の残響やリリースがループの頭に乗る。

リバーブは `applyReverb(track, { passes: 2 })` で 2 周ぶん処理し、2 周目だけを残す。1 周目で溜まった残響が 2 周目の先頭に入るため、継ぎ目で残響が切れない。

単発の効果音は `wrap` を使わず、`edgeFade()` で先頭と末尾に極短いフェードを入れる。これがないと再生開始と終了でプチノイズが出る。

## 効果音を足す

`instruments.mjs` に合成関数を書き、`Track` を返す。

```js
export const sfxConfirm = () => {
  const t = new Track(0.7 * SR);
  t.render(0, 0.7, (s) => {
    const v = Math.sin(2 * Math.PI * midi(76) * s) * decay(s, 0.16);
    return [v, v];   // [左, 右]
  });
  return t.normalize(0.58).edgeFade();
};
```

`t.render(開始秒, 長さ秒, (経過秒, サンプル番号) => [左, 右])` で加算する。`normalize` でピークを揃え、`edgeFade` で端を整える。

書けたら `gen-audio.mjs` の `SFX` に `{ id, label, make }` を足し、`node gen-audio.mjs --only sfx --force` で作り直す。

## 使える部品

| 部品 | 用途 |
|---|---|
| `wave.sine` `wave.tri` `wave.saw` `wave.square` | 基本波形。`saw` と `square` は倍音数を渡して帯域制限する |
| `harmonicCap(freq, max)` | ナイキストを超えない倍音数を返す。折り返しノイズを防ぐ |
| `adsr(t, dur, a, d, s, r)` | 持続音のエンベロープ |
| `decay(t, tau)` | 指数減衰。打楽器とプラック |
| `OnePole(cutoff, "lp" \| "hp")` | 1 次フィルタ |
| `SVF(cutoff, q)` | レゾナンス付き。掃引に使う。`process(x)` は `{low, band, high}` |
| `Reverb` / `applyReverb` | Schroeder 型の残響 |
| `mulberry32(seed)` | 種を固定した乱数。ノイズ系はこれを使う |
| `midi(n)` | MIDI 番号から周波数 |

## 音量の目安

生成側でピークを揃えてから、動画側でさらに下げている。二重に絞りすぎないよう、次を目安にする。

| 対象 | 生成時のピーク | 動画側の既定音量 |
|---|---|---|
| BGM | 0.88 に正規化して 0.82 倍 | 0.32 |
| 目立たせる効果音（`impact` `chime`） | 0.66〜0.85 | 0.50〜0.62 |
| 補助の効果音（`tick` `type` `zoom`） | 0.42〜0.60 | 0.30〜0.34 |

生成した WAV は次で確認する。

```powershell
ffmpeg -i _kit/assets/audio/bgm-bright-120.wav -af volumedetect -f null -
ffmpeg -y -i _kit/assets/audio/bgm-bright-120.wav -lavfi showspectrumpic=s=1000x300:legend=0 spec.png
```

`max_volume` が 0 dB に張り付いていたら歪んでいる。`mean_volume` が -30 dB より小さいと動画上でほとんど聞こえない。
