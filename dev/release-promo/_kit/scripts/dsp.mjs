// 依存なしの小さな信号処理ユーティリティ。gen-audio.mjs から使う。
// すべて決定論的に動く。同じ入力からは常に同じ WAV が生成される。

export const SR = 44100;

export const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// 位相 0..1 を受ける波形。加算合成側はナイキストで倍音を打ち切る。
export const wave = {
  sine: (p) => Math.sin(2 * Math.PI * p),
  tri: (p) => 4 * Math.abs(p - Math.floor(p + 0.5)) - 1,
  // 倍音数を指定できる帯域制限ノコギリ波。低音でも折り返しが出にくい。
  saw: (p, harmonics) => {
    let s = 0;
    for (let h = 1; h <= harmonics; h += 1) s += Math.sin(2 * Math.PI * p * h) / h;
    return s * (2 / Math.PI);
  },
  square: (p, harmonics) => {
    let s = 0;
    for (let h = 1; h <= harmonics; h += 2) s += Math.sin(2 * Math.PI * p * h) / h;
    return s * (4 / Math.PI);
  },
};

export const harmonicCap = (freq, max = 16) =>
  Math.max(1, Math.min(max, Math.floor(SR / 2 / Math.max(1, freq)) - 1));

// ADSR。t と dur は秒。
export const adsr = (t, dur, a = 0.005, d = 0.08, s = 0.7, r = 0.12) => {
  if (t < 0) return 0;
  const body = Math.max(0, dur - r);
  if (t < a) return t / a;
  if (t < a + d) return lerp(1, s, (t - a) / d);
  if (t < body) return s;
  const rel = (t - body) / r;
  return rel >= 1 ? 0 : s * (1 - rel);
};

// 指数減衰。打楽器・プラック向け。
export const decay = (t, tau) => (t < 0 ? 0 : Math.exp(-t / tau));

export class OnePole {
  constructor(cutoff, mode = "lp") {
    this.setCutoff(cutoff);
    this.mode = mode;
    this.z = 0;
  }
  setCutoff(cutoff) {
    this.a = clamp(1 - Math.exp((-2 * Math.PI * cutoff) / SR), 0, 1);
  }
  process(x) {
    this.z += this.a * (x - this.z);
    return this.mode === "lp" ? this.z : x - this.z;
  }
}

// 2次のステートバリアブルフィルタ。レゾナンス付きの掃引に使う。
export class SVF {
  constructor(cutoff, q = 0.7) {
    this.low = 0;
    this.band = 0;
    this.set(cutoff, q);
  }
  set(cutoff, q) {
    this.f = 2 * Math.sin((Math.PI * clamp(cutoff, 20, SR / 2.2)) / SR);
    this.q = 1 / Math.max(0.5, q);
  }
  process(x) {
    const high = x - this.low - this.q * this.band;
    this.band += this.f * high;
    this.low += this.f * this.band;
    return { low: this.low, band: this.band, high };
  }
}

class Comb {
  constructor(size, feedback, damp) {
    this.buf = new Float64Array(size);
    this.i = 0;
    this.fb = feedback;
    this.damp = damp;
    this.store = 0;
  }
  process(x) {
    const y = this.buf[this.i];
    this.store = y * (1 - this.damp) + this.store * this.damp;
    this.buf[this.i] = x + this.store * this.fb;
    this.i = (this.i + 1) % this.buf.length;
    return y;
  }
}

class Allpass {
  constructor(size, feedback = 0.5) {
    this.buf = new Float64Array(size);
    this.i = 0;
    this.fb = feedback;
  }
  process(x) {
    const y = this.buf[this.i];
    this.buf[this.i] = x + y * this.fb;
    this.i = (this.i + 1) % this.buf.length;
    return y - x;
  }
}

// Schroeder 型の簡易リバーブ。左右で遅延長をずらしてステレオ感を出す。
export class Reverb {
  constructor({ room = 0.82, damp = 0.35, spread = 23 } = {}) {
    const combs = [1116, 1188, 1277, 1356, 1422, 1491];
    this.l = combs.map((n) => new Comb(n, room, damp));
    this.r = combs.map((n) => new Comb(n + spread, room, damp));
    this.la = [225, 556, 441].map((n) => new Allpass(n));
    this.ra = [225 + spread, 556 + spread, 441 + spread].map((n) => new Allpass(n));
  }
  process(x) {
    let l = 0;
    let r = 0;
    for (let i = 0; i < this.l.length; i += 1) {
      l += this.l[i].process(x);
      r += this.r[i].process(x);
    }
    l /= this.l.length;
    r /= this.r.length;
    for (const ap of this.la) l = ap.process(l);
    for (const ap of this.ra) r = ap.process(r);
    return [l, r];
  }
}

export const softClip = (x) => Math.tanh(x * 0.9);

// ループの継ぎ目を消すため、バッファ末尾を超えた書き込みを先頭へ回り込ませる。
export class Track {
  constructor(lengthSamples, { wrap = false } = {}) {
    this.length = Math.max(1, Math.round(lengthSamples));
    this.l = new Float64Array(this.length);
    this.r = new Float64Array(this.length);
    this.wrap = wrap;
  }
  add(index, left, right) {
    let i = index;
    if (i < 0) return;
    if (i >= this.length) {
      if (!this.wrap) return;
      i %= this.length;
    }
    this.l[i] += left;
    this.r[i] += right;
  }
  // voice(t, i) -> [l, r] を dur 秒ぶん加算する。
  render(startSec, durSec, voice) {
    const start = Math.round(startSec * SR);
    const n = Math.round(durSec * SR);
    for (let i = 0; i < n; i += 1) {
      const out = voice(i / SR, i);
      if (out === null) break;
      this.add(start + i, out[0], out[1]);
    }
  }
  peak() {
    let p = 0;
    for (let i = 0; i < this.length; i += 1) {
      p = Math.max(p, Math.abs(this.l[i]), Math.abs(this.r[i]));
    }
    return p;
  }
  normalize(target = 0.9) {
    const p = this.peak();
    if (p <= 0) return this;
    const g = target / p;
    for (let i = 0; i < this.length; i += 1) {
      this.l[i] *= g;
      this.r[i] *= g;
    }
    return this;
  }
  gain(g) {
    for (let i = 0; i < this.length; i += 1) {
      this.l[i] *= g;
      this.r[i] *= g;
    }
    return this;
  }
  clip() {
    for (let i = 0; i < this.length; i += 1) {
      this.l[i] = softClip(this.l[i]);
      this.r[i] = softClip(this.r[i]);
    }
    return this;
  }
  // 先頭と末尾に極短いフェードを入れて、単発再生時のプチノイズを防ぐ。
  edgeFade(sec = 0.004) {
    const n = Math.min(Math.round(sec * SR), Math.floor(this.length / 2));
    for (let i = 0; i < n; i += 1) {
      const g = i / n;
      this.l[i] *= g;
      this.r[i] *= g;
      const j = this.length - 1 - i;
      this.l[j] *= g;
      this.r[j] *= g;
    }
    return this;
  }
}

export const toWav = (track) => {
  const n = track.length;
  const bytes = n * 4;
  const buf = Buffer.alloc(44 + bytes);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + bytes, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(bytes, 40);
  for (let i = 0; i < n; i += 1) {
    const l = Math.round(clamp(track.l[i], -1, 1) * 32767);
    const r = Math.round(clamp(track.r[i], -1, 1) * 32767);
    buf.writeInt16LE(l, 44 + i * 4);
    buf.writeInt16LE(r, 46 + i * 4);
  }
  return buf;
};
