// リリース動画用の音源。すべて合成音なので、外部素材のライセンス確認が不要になる。
import { OnePole, Reverb, SR, SVF, Track, adsr, decay, harmonicCap, midi, mulberry32, wave } from "./dsp.mjs";

const pan = (v, p) => {
  const a = ((p + 1) / 2) * (Math.PI / 2);
  return [v * Math.cos(a), v * Math.sin(a)];
};

// --- 音楽用の音源 -------------------------------------------------------

export const kick = (track, at, { gain = 0.9, tune = 54, drop = 26, tau = 0.22, click = 0.25 } = {}) => {
  let phase = 0;
  track.render(at, 0.5, (t) => {
    const f = midi(tune - drop) + (midi(tune) - midi(tune - drop)) * decay(t, 0.028);
    phase += f / SR;
    const body = wave.sine(phase) * decay(t, tau);
    const tick = wave.sine(t * 1800) * decay(t, 0.006) * click;
    const v = (body + tick) * gain;
    return [v, v];
  });
};

export const hat = (track, at, { gain = 0.16, tau = 0.035, tone = 7200, p = 0 } = {}) => {
  const rnd = mulberry32(0x51a7 + Math.round(at * 1000));
  const hp = new OnePole(tone, "hp");
  track.render(at, 0.22, (t) => {
    const v = hp.process(rnd() * 2 - 1) * decay(t, tau) * gain;
    return pan(v, p);
  });
};

export const shaker = (track, at, { gain = 0.1, tau = 0.06, p = 0.25 } = {}) => {
  const rnd = mulberry32(0x9e11 + Math.round(at * 1000));
  const hp = new OnePole(4200, "hp");
  const lp = new OnePole(11000, "lp");
  track.render(at, 0.28, (t) => {
    const n = lp.process(hp.process(rnd() * 2 - 1));
    const v = n * (decay(t, tau) - decay(t, 0.004)) * gain * 2.2;
    return pan(v, p);
  });
};

export const bass = (track, at, dur, note, { gain = 0.5, cutoff = 420 } = {}) => {
  const f = midi(note);
  const h = harmonicCap(f, 10);
  const lp = new OnePole(cutoff, "lp");
  let phase = 0;
  track.render(at, dur + 0.15, (t) => {
    phase += f / SR;
    const raw = wave.saw(phase, h) * 0.55 + wave.sine(phase) * 0.75;
    const v = lp.process(raw) * adsr(t, dur, 0.008, 0.12, 0.72, 0.1) * gain;
    return [v, v];
  });
};

export const pad = (track, at, dur, notes, { gain = 0.22, cutoff = 1650, detune = 0.08, attack = 0.35 } = {}) => {
  const voices = [];
  for (const note of notes) {
    for (const [i, d] of [-detune, detune].entries()) {
      voices.push({ f: midi(note + d), phase: i * 0.37, p: i === 0 ? -0.55 : 0.55 });
    }
  }
  const lpL = new OnePole(cutoff, "lp");
  const lpR = new OnePole(cutoff, "lp");
  const g = gain / Math.max(1, notes.length);
  track.render(at, dur + 0.6, (t) => {
    let l = 0;
    let r = 0;
    const env = adsr(t, dur, attack, 0.3, 0.78, 0.5);
    for (const v of voices) {
      v.phase += v.f / SR;
      const s = wave.saw(v.phase, harmonicCap(v.f, 12)) * env * g;
      const [sl, sr] = pan(s, v.p);
      l += sl;
      r += sr;
    }
    return [lpL.process(l), lpR.process(r)];
  });
};

export const pluck = (track, at, note, { gain = 0.3, tau = 0.24, p = 0, tone = 3200 } = {}) => {
  const f = midi(note);
  const h = harmonicCap(f, 9);
  const lp = new OnePole(tone, "lp");
  let phase = 0;
  track.render(at, 0.9, (t) => {
    phase += f / SR;
    const raw = wave.tri(phase) * 0.8 + wave.saw(phase, h) * 0.2;
    const v = lp.process(raw) * decay(t, tau) * (1 - decay(t, 0.002)) * gain;
    return pan(v, p);
  });
};

export const bell = (track, at, note, { gain = 0.26, tau = 1.1, p = 0 } = {}) => {
  const f = midi(note);
  const partials = [
    [1, 1],
    [2.01, 0.42],
    [3.02, 0.2],
    [4.97, 0.1],
  ];
  track.render(at, tau * 3.2, (t) => {
    let s = 0;
    for (const [ratio, amp] of partials) {
      s += Math.sin(2 * Math.PI * f * ratio * t) * amp * decay(t, tau / ratio);
    }
    const v = s * gain * 0.5;
    return pan(v, p);
  });
};

// バッファ全体にリバーブをかける。ループ素材では2周ぶん処理して2周目だけ残し、
// 継ぎ目にリバーブの尾を持ち越す。
export const applyReverb = (track, { mix = 0.25, room = 0.84, damp = 0.32, passes = 2 } = {}) => {
  const rev = new Reverb({ room, damp });
  const wetL = new Float64Array(track.length);
  const wetR = new Float64Array(track.length);
  for (let pass = 0; pass < passes; pass += 1) {
    for (let i = 0; i < track.length; i += 1) {
      const [l, r] = rev.process((track.l[i] + track.r[i]) * 0.5);
      if (pass === passes - 1) {
        wetL[i] = l;
        wetR[i] = r;
      }
    }
  }
  for (let i = 0; i < track.length; i += 1) {
    track.l[i] = track.l[i] * (1 - mix * 0.4) + wetL[i] * mix;
    track.r[i] = track.r[i] * (1 - mix * 0.4) + wetR[i] * mix;
  }
  return track;
};

// --- 効果音 -------------------------------------------------------------

export const sfxClick = () => {
  const t = new Track(0.09 * SR);
  const rnd = mulberry32(0x1234);
  const bp = new SVF(2400, 1.6);
  t.render(0, 0.09, (s) => {
    const n = bp.process(rnd() * 2 - 1).band;
    const tick = Math.sin(2 * Math.PI * 1750 * s) * decay(s, 0.006);
    const v = (n * 0.6 + tick * 0.8) * decay(s, 0.012);
    return [v, v];
  });
  return t.normalize(0.72).edgeFade();
};

export const sfxTick = () => {
  const t = new Track(0.12 * SR);
  t.render(0, 0.12, (s) => {
    const v =
      (Math.sin(2 * Math.PI * 2400 * s) * decay(s, 0.008) +
        Math.sin(2 * Math.PI * 3600 * s) * decay(s, 0.004)) *
      0.6;
    return [v, v];
  });
  return t.normalize(0.6).edgeFade();
};

export const sfxPop = () => {
  const t = new Track(0.22 * SR);
  t.render(0, 0.22, (s) => {
    const f = 420 + 760 * (1 - decay(s, 0.03));
    const v = Math.sin(2 * Math.PI * f * s) * decay(s, 0.045) * 0.9;
    const air = Math.sin(2 * Math.PI * (f * 2.5) * s) * decay(s, 0.018) * 0.25;
    return [v + air, v + air];
  });
  return t.normalize(0.68).edgeFade();
};

export const sfxType = () => {
  const t = new Track(0.06 * SR);
  const rnd = mulberry32(0x77aa);
  const hp = new OnePole(2600, "hp");
  t.render(0, 0.06, (s) => {
    const v = hp.process(rnd() * 2 - 1) * decay(s, 0.008) * 0.9;
    return [v, v];
  });
  return t.normalize(0.5).edgeFade();
};

// 掃引ノイズ。whoosh / swish / zoom の共通実装。
const sweep = (dur, f0, f1, { q = 1.4, curve = 1, gain = 1, stereo = 0.6, tailPad = 0.05 } = {}) => {
  const t = new Track((dur + tailPad) * SR);
  const rnd = mulberry32(0x2f19);
  const filt = new SVF(f0, q);
  const lpL = new OnePole(9000, "lp");
  const lpR = new OnePole(7600, "lp");
  t.render(0, dur + tailPad, (s) => {
    const k = Math.min(1, s / dur);
    const shaped = Math.pow(k, curve);
    filt.set(f0 + (f1 - f0) * shaped, q);
    const n = filt.process(rnd() * 2 - 1).band;
    const env = Math.pow(Math.sin(Math.PI * Math.min(1, s / (dur + tailPad))), 1.4);
    const v = n * env * gain;
    return [
      lpL.process(v) * (1 - stereo * 0.5 + stereo * (1 - k) * 0.5),
      lpR.process(v) * (1 - stereo * 0.5 + stereo * k * 0.5),
    ];
  });
  return t;
};

export const sfxWhoosh = () => sweep(0.42, 380, 5200, { q: 1.2, curve: 1.7 }).normalize(0.62).edgeFade(0.01);
export const sfxSwish = () => sweep(0.2, 900, 4600, { q: 1.6, curve: 1.3 }).normalize(0.5).edgeFade(0.008);
export const sfxZoom = () => sweep(0.55, 240, 1900, { q: 2.2, curve: 2.2, stereo: 0.3 }).normalize(0.42).edgeFade(0.012);

export const sfxRiser = () => {
  const dur = 1.3;
  const t = new Track((dur + 0.12) * SR);
  const rnd = mulberry32(0x5c31);
  const filt = new SVF(300, 2.4);
  let phase = 0;
  t.render(0, dur + 0.12, (s) => {
    const k = Math.min(1, s / dur);
    filt.set(300 + 5200 * Math.pow(k, 2), 2.4);
    const n = filt.process(rnd() * 2 - 1).band * 0.8;
    const f = midi(60) * Math.pow(2, k * 1.2);
    phase += f / SR;
    const tone = wave.tri(phase) * 0.22 * k;
    const env = Math.pow(k, 1.3) * (1 - Math.max(0, (s - dur) / 0.12));
    const v = (n + tone) * env;
    return [v, v * 0.94];
  });
  return t.normalize(0.6).edgeFade(0.01);
};

export const sfxImpact = () => {
  const t = new Track(1.1 * SR);
  const rnd = mulberry32(0x8bd2);
  const lp = new OnePole(180, "lp");
  let phase = 0;
  t.render(0, 1.1, (s) => {
    const f = 120 * Math.pow(0.35, Math.min(1, s / 0.25)) + 42;
    phase += f / SR;
    const body = wave.sine(phase) * decay(s, 0.34);
    const rumble = lp.process(rnd() * 2 - 1) * decay(s, 0.18) * 0.6;
    const snap = (rnd() * 2 - 1) * decay(s, 0.01) * 0.35;
    const v = body * 0.95 + rumble + snap;
    return [v, v];
  });
  return t.normalize(0.85).edgeFade();
};

export const sfxChime = () => {
  const t = new Track(1.9 * SR);
  bell(t, 0, 84, { gain: 0.5, tau: 0.7, p: -0.25 });
  bell(t, 0.11, 88, { gain: 0.42, tau: 0.8, p: 0.25 });
  bell(t, 0.24, 91, { gain: 0.36, tau: 1.0, p: 0 });
  applyReverb(t, { mix: 0.3, room: 0.8, damp: 0.4, passes: 1 });
  return t.normalize(0.66).edgeFade();
};

export const sfxConfirm = () => {
  const t = new Track(0.7 * SR);
  const lp = new OnePole(4200, "lp");
  t.render(0, 0.7, (s) => {
    const f1 = midi(76);
    const f2 = midi(83);
    const a = Math.sin(2 * Math.PI * f1 * s) * decay(s, 0.16) * (s < 0.09 ? 1 : 0);
    const b = Math.sin(2 * Math.PI * f2 * s) * decay(Math.max(0, s - 0.09), 0.22);
    const v = lp.process((a + b) * 0.5);
    return [v, v];
  });
  return t.normalize(0.58).edgeFade();
};
