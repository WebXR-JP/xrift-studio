// Turns a long XRift Studio recording into a short clip with FFmpeg.
//
// The Studio records the whole build; a post wants a minute of it. This keeps
// the Studio out of video editing: one speed-up, one optional outro joined at
// normal speed, one H.264 MP4 out. Subtitles, music and transitions belong to
// a real editor afterwards.
//
//   pnpm recording:summarize -- --input build.webm --duration 60 \
//     --outro tour.webm --output post.mp4
//
// Without FFmpeg on PATH it prints the commands it would have run.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function parseArgs(argv) {
  const options = { duration: 60, fps: 30, crf: 20 };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    switch (flag) {
      case "--input":
        options.input = value;
        index += 1;
        break;
      case "--outro":
        options.outro = value;
        index += 1;
        break;
      case "--output":
        options.output = value;
        index += 1;
        break;
      case "--duration":
        options.duration = Number(value);
        index += 1;
        break;
      case "--fps":
        options.fps = Number(value);
        index += 1;
        break;
      case "--crf":
        options.crf = Number(value);
        index += 1;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }
  return options;
}

function usage() {
  return [
    "Usage: node scripts/summarize-recording.mjs --input <recording> [--outro <clip>] [--output <file.mp4>]",
    "       [--duration <seconds, default 60>] [--fps <30>] [--crf <20>]",
    "",
    "Speeds the input up so it lasts --duration seconds, appends --outro at normal speed,",
    "and writes an H.264 MP4 ready for X, YouTube or Instagram.",
  ].join("\n");
}

function run(command, args, { dryRun }) {
  const rendered = [command, ...args.map((arg) => (/\s/.test(arg) ? JSON.stringify(arg) : arg))].join(" ");
  if (dryRun) {
    console.log(rendered);
    return { status: 0, stdout: "" };
  }
  const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  if (result.status !== 0) {
    throw new Error(`${command} exited with ${result.status}`);
  }
  return result;
}

function probeDuration(file, tools, dryRun) {
  if (dryRun) return null;
  const result = run(
    tools.ffprobe,
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file],
    { dryRun },
  );
  const seconds = Number(String(result.stdout).trim());
  if (Number.isFinite(seconds) && seconds > 0) return seconds;
  // A MediaRecorder WebM is written as a live stream and never gets a duration
  // in its header, so the container says N/A. The last packet's timestamp is
  // the length that matters here.
  const packets = run(
    tools.ffprobe,
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time", "-of", "csv=p=0", file],
    { dryRun },
  );
  const last = String(packets.stdout)
    .trim()
    .split(/\r?\n/)
    .map((line) => Number(line.trim().replace(/,$/, "")))
    .filter((value) => Number.isFinite(value))
    .pop();
  if (last === undefined || last <= 0) {
    throw new Error(`Could not read the duration of ${file}`);
  }
  return last;
}

const options = parseArgs(process.argv.slice(2));
if (options.help || !options.input) {
  console.log(usage());
  process.exit(options.help ? 0 : 1);
}
if (!Number.isFinite(options.duration) || options.duration <= 0) {
  throw new Error("--duration must be a positive number of seconds");
}
if (!fs.existsSync(options.input)) {
  throw new Error(`Input not found: ${options.input}`);
}
if (options.outro && !fs.existsSync(options.outro)) {
  throw new Error(`Outro not found: ${options.outro}`);
}

const tools = { ffmpeg: "ffmpeg", ffprobe: "ffprobe" };
const available = spawnSync(tools.ffmpeg, ["-version"], { stdio: "ignore" }).status === 0;
const dryRun = !available;
if (dryRun) {
  console.error("FFmpeg was not found on PATH. Showing the commands it would run:\n");
}

const output =
  options.output ?? path.join(path.dirname(options.input), `${path.parse(options.input).name}-${options.duration}s.mp4`);
const sourceSeconds = probeDuration(options.input, tools, dryRun);
const speed = sourceSeconds === null ? null : Math.max(1, sourceSeconds / options.duration);
const speedLabel = speed === null ? `<source seconds / ${options.duration}>x` : `${speed.toFixed(1)}x`;
console.error(`Build part: ${options.input}${sourceSeconds ? ` (${Math.round(sourceSeconds)} s)` : ""} -> ${options.duration} s at ${speedLabel}`);

const workDirectory = dryRun ? "<tmp>" : fs.mkdtempSync(path.join(os.tmpdir(), "xrift-recording-"));
const buildClip = path.join(workDirectory, "build.mp4");
const encode = ["-c:v", "libx264", "-preset", "medium", "-crf", String(options.crf), "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an"];
const setpts = speed === null ? "PTS/<speed>" : `PTS/${speed.toFixed(4)}`;

// Frame decimation plus a PTS rewrite: `setpts` alone would keep every frame
// and let the encoder drop them unevenly, which reads as stutter.
run(
  tools.ffmpeg,
  ["-y", "-i", options.input, "-vf", `setpts=${setpts},fps=${options.fps}`, "-t", String(options.duration), ...encode, buildClip],
  { dryRun },
);

if (!options.outro) {
  if (!dryRun) fs.copyFileSync(buildClip, output);
  else console.log(`cp ${buildClip} ${output}`);
} else {
  const outroClip = path.join(workDirectory, "outro.mp4");
  run(tools.ffmpeg, ["-y", "-i", options.outro, "-vf", `fps=${options.fps}`, ...encode, outroClip], { dryRun });
  const listFile = path.join(workDirectory, "parts.txt");
  const list = [buildClip, outroClip].map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join("\n");
  if (!dryRun) fs.writeFileSync(listFile, `${list}\n`);
  else console.log(`printf %s ${JSON.stringify(list)} > ${listFile}`);
  run(tools.ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", "-movflags", "+faststart", output], { dryRun });
}

if (!dryRun) {
  fs.rmSync(workDirectory, { recursive: true, force: true });
  console.log(output);
}
