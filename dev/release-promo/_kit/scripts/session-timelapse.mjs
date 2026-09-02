#!/usr/bin/env node
// Scene View の長期録画フォルダから、タイムラプス動画と字幕用の cue を作る。
//
//   node ../_kit/scripts/session-timelapse.mjs --recording <録画フォルダ>
//   node ../_kit/scripts/session-timelapse.mjs --recording <録画フォルダ> --target-seconds 18
//   node ../_kit/scripts/session-timelapse.mjs --recording <録画フォルダ> --speed 10
//
// 録画フォルダは XRift Studio の「長期録画」が app data の debug-captures に作る
// もので、scene-view.webm と activity.jsonl が入っている。ログには MCP の tool
// call、動画が始まった瞬間、ウィンドウが隠れていた区間が、セッション開始からの
// 秒で書かれている。
//
// 倍率は一定にしない。LLM が考えている間は画面が動かないので、tool call の無い
// 区間は 1 秒に畳み、動いている区間だけを --target-seconds に収まる倍率で縮める。
// ログが無い、または tool call が無いときは一定倍率 (--speed、既定 10) にする。
//
// 出力は <出力先>/timelapse.mp4 と <出力先>/cues.json。cues.json は Remotion 側
// が字幕と HUD を描くためのもので、動画には焼き込まない。焼くと縦型で位置が
// 合わなくなる。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const flag = (name) => args.includes(name);

const recordingDir = option("--recording", null);
if (!recordingDir) {
  console.error("--recording <長期録画のフォルダ> を指定してください。");
  process.exit(1);
}
const recording = resolve(process.cwd(), recordingDir);
const videoPath = join(recording, "scene-view.webm");
const logPath = join(recording, "activity.jsonl");
if (!existsSync(videoPath)) {
  console.error(`scene-view.webm が見つかりません: ${videoPath}`);
  process.exit(1);
}
const outDir = resolve(process.cwd(), option("--out", join("public", "source", basename(recording))));
const targetSeconds = Number(option("--target-seconds", "0")) || 0;
const fixedSpeed = Number(option("--speed", "0")) || 0;
const idleSeconds = Number(option("--idle-seconds", "20")) || 20;
const idleKeepSeconds = Number(option("--idle-keep", "1")) || 1;
const activeSeconds = Number(option("--active-seconds", "8")) || 8;
const outputFps = Number(option("--fps", "30")) || 30;
const outputWidth = Number(option("--width", "1920")) || 1920;
const cuesOnly = flag("--cues-only");
const ffmpeg = process.env.FFMPEG ?? "ffmpeg";

// ---- ログを読む -------------------------------------------------------------

/** @type {{t:number, event:string, [key:string]: unknown}[]} */
const entries = existsSync(logPath)
  ? readFileSync(logPath, "utf8")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line))
      .filter((entry) => typeof entry.t === "number" && typeof entry.event === "string")
  : [];

const begin = entries.find((entry) => entry.event === "session-begin");
const videoStart = entries.find((entry) => entry.event === "video-start");
const end = entries.find((entry) => entry.event === "session-end");
// 動画の 0 秒は recorder が最初のデータを出した瞬間。ログの t はセッション開始
// からの秒なので、その差を引いて動画の時間へ写す。
const videoOffset = videoStart ? videoStart.t : 0;
const toVideoTime = (t) => Math.max(0, t - videoOffset);

const toolEvents = entries
  .filter((entry) => entry.event === "tool")
  .map((entry) => ({
    sourceT: toVideoTime(entry.t),
    tool: String(entry.tool ?? ""),
    client: String(entry.client ?? ""),
    ok: entry.ok !== false,
    durationMs: typeof entry.durationMs === "number" ? entry.durationMs : null,
  }));

/** ウィンドウが隠れていた区間。動画は止まっているので丸ごと切る。 */
const hiddenSpans = [];
let hiddenSince = null;
for (const entry of entries.filter((entry) => entry.event === "visibility")) {
  if (entry.hidden === true && hiddenSince === null) hiddenSince = toVideoTime(entry.t);
  if (entry.hidden === false && hiddenSince !== null) {
    hiddenSpans.push([hiddenSince, toVideoTime(entry.t)]);
    hiddenSince = null;
  }
}

// ---- 動画の長さ ---------------------------------------------------------------

function probeDurationByDecode(file) {
  const result = spawnSync(ffmpeg, ["-hide_banner", "-i", file, "-f", "null", "-"], { encoding: "utf8" });
  const text = `${result.stdout}\n${result.stderr}`;
  const matches = [...text.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
  if (matches.length === 0) return null;
  const [, h, m, s] = matches[matches.length - 1];
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

let sourceDuration = end ? toVideoTime(end.t) : null;
if (sourceDuration === null) {
  // 途中で止まった録画には session-end が無い。デコードして数える。
  sourceDuration = probeDurationByDecode(videoPath);
}
if (hiddenSince !== null && sourceDuration !== null) hiddenSpans.push([hiddenSince, sourceDuration]);
if (sourceDuration === null || sourceDuration <= 0) {
  console.error("動画の長さを決められません。activity.jsonl か ffmpeg を確認してください。");
  process.exit(1);
}

// ---- 区間を組む ---------------------------------------------------------------
//
// 動画時間を「動いている」「止まっている」「隠れている」に分け、それぞれの倍率を
// 決める。隠れている区間は捨て、止まっている区間は idleKeepSeconds に畳む。

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

function buildActiveWindows() {
  if (toolEvents.length === 0) return [[0, sourceDuration]];
  const windows = [];
  for (const event of toolEvents) {
    const start = clamp(event.sourceT, 0, sourceDuration);
    const stop = clamp(event.sourceT + activeSeconds, 0, sourceDuration);
    const last = windows[windows.length - 1];
    if (last && start - last[1] < idleSeconds) {
      last[1] = Math.max(last[1], stop);
    } else {
      windows.push([start, stop]);
    }
  }
  // 最初の call までと最後の call の後は、動いていないなら畳む対象になる。
  return windows;
}

function subtractHidden(spans) {
  let result = spans;
  for (const [hs, he] of hiddenSpans) {
    const next = [];
    for (const [s, e] of result) {
      if (he <= s || hs >= e) {
        next.push([s, e]);
        continue;
      }
      if (hs > s) next.push([s, hs]);
      if (he < e) next.push([he, e]);
    }
    result = next;
  }
  return result.filter(([s, e]) => e - s > 0.05);
}

/** @type {{kind:"active"|"idle", start:number, end:number}[]} */
const segments = [];
{
  const active = subtractHidden(buildActiveWindows());
  let cursor = 0;
  for (const [s, e] of active) {
    if (s > cursor) {
      for (const [is, ie] of subtractHidden([[cursor, s]])) segments.push({ kind: "idle", start: is, end: ie });
    }
    segments.push({ kind: "active", start: s, end: e });
    cursor = e;
  }
  if (cursor < sourceDuration) {
    for (const [is, ie] of subtractHidden([[cursor, sourceDuration]])) segments.push({ kind: "idle", start: is, end: ie });
  }
}

const activeTotal = segments.filter((s) => s.kind === "active").reduce((sum, s) => sum + (s.end - s.start), 0);
const idleCount = segments.filter((s) => s.kind === "idle").length;

let activeSpeed;
if (fixedSpeed > 0) {
  activeSpeed = fixedSpeed;
} else if (targetSeconds > 0) {
  const budget = targetSeconds - idleCount * idleKeepSeconds;
  activeSpeed = budget > 0 ? Math.max(1, activeTotal / budget) : Math.max(1, activeTotal / targetSeconds);
} else {
  activeSpeed = 10;
}

let outputCursor = 0;
for (const segment of segments) {
  const length = segment.end - segment.start;
  segment.speed = segment.kind === "active" ? activeSpeed : Math.max(activeSpeed, length / idleKeepSeconds);
  segment.outputStart = outputCursor;
  segment.outputEnd = outputCursor + length / segment.speed;
  outputCursor = segment.outputEnd;
}
const outputDuration = outputCursor;

/** 動画の秒を出力の秒へ写す。切った区間に落ちた時刻は次の区間の頭へ寄せる。 */
function toOutputTime(sourceT) {
  for (const segment of segments) {
    if (sourceT < segment.start) return segment.outputStart;
    if (sourceT <= segment.end) return segment.outputStart + (sourceT - segment.start) / segment.speed;
  }
  return outputDuration;
}

// ---- cues.json ----------------------------------------------------------------

mkdirSync(outDir, { recursive: true });
const firstTool = toolEvents[0];
const lastTool = toolEvents[toolEvents.length - 1];
const cues = {
  recording: basename(recording),
  source: { file: "scene-view.webm", durationSeconds: round(sourceDuration), fps: begin?.fps ?? null },
  output: { file: "timelapse.mp4", durationSeconds: round(outputDuration), fps: outputFps, activeSpeed: round(activeSpeed) },
  session: {
    toolCalls: toolEvents.length,
    clients: [...new Set(toolEvents.map((event) => event.client).filter(Boolean))],
    // 所要時間は最初と最後の tool call の差。録画ボタンを押してから prompt を
    // 貼るまでの間を数えない。
    elapsedSeconds: firstTool && lastTool ? round(lastTool.sourceT - firstTool.sourceT) : null,
    hiddenSeconds: round(hiddenSpans.reduce((sum, [s, e]) => sum + (e - s), 0)),
  },
  segments: segments.map((segment) => ({
    kind: segment.kind,
    sourceStart: round(segment.start),
    sourceEnd: round(segment.end),
    outputStart: round(segment.outputStart),
    outputEnd: round(segment.outputEnd),
    speed: round(segment.speed),
  })),
  cues: toolEvents.map((event) => ({
    t: round(toOutputTime(event.sourceT)),
    sourceT: round(event.sourceT),
    tool: event.tool,
    client: event.client,
    ok: event.ok,
  })),
};
writeFileSync(join(outDir, "cues.json"), `${JSON.stringify(cues, null, 2)}\n`);
console.log(
  `cues.json: tool call ${toolEvents.length} 件、動いている区間 ${round(activeTotal)} 秒を ${round(activeSpeed)} 倍、` +
    `止まっている区間 ${idleCount} 箇所、出力 ${round(outputDuration)} 秒`,
);

if (cuesOnly) process.exit(0);

// ---- ffmpeg -------------------------------------------------------------------

const filters = [];
const labels = [];
segments.forEach((segment, index) => {
  const label = `v${index}`;
  filters.push(
    `[0:v]trim=start=${segment.start.toFixed(3)}:end=${segment.end.toFixed(3)},setpts=(PTS-STARTPTS)/${segment.speed.toFixed(4)}[${label}]`,
  );
  labels.push(`[${label}]`);
});
filters.push(
  `${labels.join("")}concat=n=${segments.length}:v=1:a=0,fps=${outputFps},scale=${outputWidth}:-2:flags=lanczos,format=yuv420p[out]`,
);

const outputPath = join(outDir, "timelapse.mp4");
const result = spawnSync(
  ffmpeg,
  [
    "-hide_banner", "-v", "error", "-y",
    "-i", videoPath,
    "-filter_complex", filters.join(";"),
    "-map", "[out]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18",
    "-movflags", "+faststart",
    "-an",
    outputPath,
  ],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);
if (result.status !== 0) {
  console.error(result.stderr || result.error?.message || "ffmpeg が失敗しました。");
  process.exit(1);
}
console.log(`timelapse.mp4: ${outputPath}`);

function round(value) {
  return value === null ? null : Math.round(value * 1000) / 1000;
}
