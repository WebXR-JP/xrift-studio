/**
 * Synthesizes the WAV files the tutorial Scene recipes ship with.
 *
 * The sets exist to show what an Interaction Trigger, an Audio Source and a
 * graph do together, and a set whose Audio Source points at nothing shows the
 * author an empty field instead. So the sounds are generated here rather than
 * sourced: every sample is written by this script, which keeps them
 * project-original, small, and reproducible -- re-running it must produce the
 * same bytes, or `builtin-recipe-audio.ts` stops matching its own hashes.
 *
 *   node scripts/generate-recipe-audio.mjs
 *
 * Prints the definition rows for src/lib/visual-editor/builtin-recipe-audio.ts.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(
  repoRoot,
  "public",
  "visual-editor",
  "recipe-assets",
  "audio",
);

const SAMPLE_RATE = 22050;

/** Deterministic noise, so a re-run produces the same file byte for byte. */
function createNoise(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return (state / 0x100000000) * 2 - 1;
  };
}

function render(durationSeconds, sample) {
  const count = Math.round(durationSeconds * SAMPLE_RATE);
  const values = new Float64Array(count);
  for (let index = 0; index < count; index += 1) {
    values[index] = sample(index / SAMPLE_RATE, index);
  }
  return values;
}

/** Scales to a fixed peak so one set is not three times louder than the next. */
function normalize(values, peak) {
  let maximum = 0;
  for (const value of values) maximum = Math.max(maximum, Math.abs(value));
  if (maximum === 0) return values;
  const gain = peak / maximum;
  for (let index = 0; index < values.length; index += 1) {
    values[index] *= gain;
  }
  return values;
}

function encodeWav(values) {
  const header = Buffer.alloc(44);
  const data = Buffer.alloc(values.length * 2);
  for (let index = 0; index < values.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, values[index]));
    data.writeInt16LE(Math.round(clamped * 32767), index * 2);
  }
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** A struck bell: a few partials over an exponential decay. */
function pressChime() {
  const partials = [
    { frequency: 880, gain: 1, decay: 3.4 },
    { frequency: 1320, gain: 0.55, decay: 4.6 },
    { frequency: 1760, gain: 0.28, decay: 6.8 },
    { frequency: 2640, gain: 0.12, decay: 9.5 },
  ];
  return normalize(
    render(0.9, (time) => {
      // 4 ms of attack, so the onset reads as a strike rather than a click.
      const attack = Math.min(1, time / 0.004);
      let value = 0;
      for (const partial of partials) {
        value +=
          partial.gain *
          Math.exp(-time * partial.decay) *
          Math.sin(2 * Math.PI * partial.frequency * time);
      }
      return value * attack;
    }),
    0.72,
  );
}

/** A switch: the mechanical knock, not a tone. */
function softClick() {
  const noise = createNoise(0x51a7c3);
  let lowpass = 0;
  return normalize(
    render(0.16, (time) => {
      const body = Math.exp(-time * 90);
      const tail = Math.exp(-time * 26) * 0.35;
      lowpass += (noise() - lowpass) * 0.45;
      const knock = Math.sin(2 * Math.PI * 320 * time) * Math.exp(-time * 55);
      return lowpass * (body + tail) + knock * 0.6;
    }),
    0.62,
  );
}

/**
 * Room tone for the looping set.
 *
 * Every frequency here completes a whole number of cycles in the loop's four
 * seconds, so the end of the file meets its own start: a loop that clicks once
 * a bar would teach the author that Studio's looping is broken.
 */
function ambientHum() {
  const duration = 4;
  const partials = [
    { cycles: 220, gain: 0.5 },
    { cycles: 330, gain: 0.26 },
    { cycles: 440, gain: 0.16 },
    { cycles: 660, gain: 0.08 },
  ];
  return normalize(
    render(duration, (time) => {
      const phase = time / duration;
      const swell = 0.75 + 0.25 * Math.sin(2 * Math.PI * 2 * phase);
      let value = 0;
      for (const partial of partials) {
        value +=
          partial.gain * Math.sin(2 * Math.PI * partial.cycles * phase);
      }
      return value * swell;
    }),
    0.5,
  );
}

/** A sliding door: filtered noise that swells and settles into a stop. */
function doorSlide() {
  const noise = createNoise(0x2f8b16);
  let lowpass = 0;
  return normalize(
    render(1.1, (time) => {
      lowpass += (noise() - lowpass) * 0.12;
      const swell = Math.min(1, time / 0.18) * Math.exp(-Math.max(0, time - 0.45) * 3.2);
      const rumble = Math.sin(2 * Math.PI * 62 * time) * 0.25 * swell;
      // The latch at the end of the travel, so the sound has a finish.
      const latch =
        time > 0.86 ? Math.exp(-(time - 0.86) * 70) * Math.sin(2 * Math.PI * 240 * time) * 0.5 : 0;
      return lowpass * swell + rumble + latch;
    }),
    0.6,
  );
}

const SOUNDS = [
  {
    audioId: "pressChime",
    fileName: "press-chime.wav",
    displayName: "ボタンの音",
    values: pressChime,
  },
  {
    audioId: "softClick",
    fileName: "soft-click.wav",
    displayName: "スイッチの音",
    values: softClick,
  },
  {
    audioId: "ambientHum",
    fileName: "ambient-hum.wav",
    displayName: "環境音のループ",
    values: ambientHum,
  },
  {
    audioId: "doorSlide",
    fileName: "door-slide.wav",
    displayName: "扉が動く音",
    values: doorSlide,
  },
];

fs.mkdirSync(outputDirectory, { recursive: true });
const rows = [];
for (const sound of SOUNDS) {
  const bytes = encodeWav(sound.values());
  const filePath = path.join(outputDirectory, sound.fileName);
  fs.writeFileSync(filePath, bytes);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const assetId = `audio-${sound.fileName.replace(/\.wav$/, "")}-${sha256.slice(0, 12)}`;
  rows.push({
    audioId: sound.audioId,
    assetId,
    publicPath: `/visual-editor/recipe-assets/audio/${sound.fileName}`,
    fileName: sound.fileName,
    sha256,
    byteLength: bytes.length,
    displayName: sound.displayName,
    durationSeconds:
      Math.round(((bytes.length - 44) / 2 / SAMPLE_RATE) * 1000) / 1000,
  });
}

process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
