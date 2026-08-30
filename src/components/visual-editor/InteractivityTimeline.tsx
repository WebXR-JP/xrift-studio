import { useMemo } from "react";
import {
  findInteractionTriggerTarget,
  getXriftInteractionProperty,
  type InteractivityDryRun,
  type InteractivityScheduleEntry,
  type InteractionTriggerTargetEntity,
} from "../../lib/visual-editor";

/**
 * What a graph does, laid out on time instead of on wires.
 *
 * A graph that unfolds over two minutes cannot be reviewed by reading it: the
 * question an author has is "what happens at 35 seconds", and the node layout
 * answers "what is connected to what". This runs the graph forward without a
 * renderer and draws the result, so the two views describe the same document
 * from the two directions the work actually needs.
 *
 * It is a view, never a second source of truth. Nothing here edits the graph;
 * a marker only sends the author back to the node that produced it.
 */

export const INTERACTIVITY_TIMELINE_HORIZONS: readonly number[] = [30, 60, 120, 300];

type TimelineTone = "animation" | "property" | "event" | "log";

type TimelineMarker = {
  id: string;
  timeSeconds: number;
  /** Set when the graph also says when this stops. */
  endSeconds: number | null;
  label: string;
  nodeIndex: number;
  tone: TimelineTone;
};

type TimelineTrack = {
  id: string;
  label: string;
  markers: TimelineMarker[];
};

const TONE_CLASS: Record<TimelineTone, string> = {
  animation: "bg-emerald-500/80 border-emerald-300",
  property: "bg-orange-500/80 border-orange-300",
  event: "bg-sky-500/80 border-sky-300",
  log: "bg-slate-400/80 border-slate-200",
};

function formatSeconds(seconds: number): string {
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds - minutes * 60;
    return `${minutes}:${rest.toFixed(rest % 1 === 0 ? 0 : 1).padStart(rest < 10 ? 2 : 1, "0")}`;
  }
  return `${Math.round(seconds * 10) / 10}s`;
}

function formatValue(value: readonly (number | boolean)[]): string {
  if (value.length === 1 && typeof value[0] === "boolean") {
    return value[0] ? "ON" : "OFF";
  }
  return value
    .map((entry) =>
      typeof entry === "boolean"
        ? entry
          ? "ON"
          : "OFF"
        : String(Math.round(entry * 1000) / 1000),
    )
    .join(", ");
}

/** Groups a dry run into one row per thing the graph changes. */
function buildTracks(
  entries: readonly InteractivityScheduleEntry[],
  targets: readonly InteractionTriggerTargetEntity[],
): TimelineTrack[] {
  const tracks = new Map<string, TimelineTrack>();
  const trackFor = (id: string, label: string): TimelineTrack => {
    const existing = tracks.get(id);
    if (existing) return existing;
    const created: TimelineTrack = { id, label, markers: [] };
    tracks.set(id, created);
    return created;
  };

  entries.forEach((entry, index) => {
    if (entry.kind === "animation-start") {
      const track = trackFor(
        `animation:${entry.animationIndex}`,
        `Animation ${entry.animationIndex}`,
      );
      // The stop this graph performs is what gives the bar a length. Without
      // one the clip runs for as long as it runs, which the graph does not know.
      const stop = entries.find(
        (candidate) =>
          candidate.kind === "animation-stop" &&
          candidate.animationIndex === entry.animationIndex &&
          candidate.timeSeconds > entry.timeSeconds,
      );
      track.markers.push({
        id: `start-${index}`,
        timeSeconds: entry.timeSeconds,
        endSeconds: stop ? stop.timeSeconds : null,
        label: `再生${entry.speed === 1 ? "" : ` ×${entry.speed}`}`,
        nodeIndex: entry.nodeIndex,
        tone: "animation",
      });
      return;
    }
    if (entry.kind === "animation-stop") {
      const started = entries.some(
        (candidate) =>
          candidate.kind === "animation-start" &&
          candidate.animationIndex === entry.animationIndex &&
          candidate.timeSeconds < entry.timeSeconds,
      );
      if (started) return;
      const track = trackFor(
        `animation:${entry.animationIndex}`,
        `Animation ${entry.animationIndex}`,
      );
      track.markers.push({
        id: `stop-${index}`,
        timeSeconds: entry.timeSeconds,
        endSeconds: null,
        label: "停止",
        nodeIndex: entry.nodeIndex,
        tone: "animation",
      });
      return;
    }
    if (entry.kind === "property") {
      const descriptor = getXriftInteractionProperty(
        entry.target.targetKind,
        entry.target.property,
      );
      const owner = findInteractionTriggerTarget(targets, entry.target.entityId);
      const track = trackFor(
        `property:${entry.target.entityId}:${entry.target.componentId ?? "entity"}:${entry.target.property}`,
        `${owner?.path ?? entry.target.entityId} · ${descriptor?.label ?? entry.target.property}`,
      );
      track.markers.push({
        id: `property-${index}`,
        timeSeconds: entry.timeSeconds,
        endSeconds: null,
        label: formatValue(entry.value.data),
        nodeIndex: entry.nodeIndex,
        tone: "property",
      });
      return;
    }
    if (entry.kind === "pointer") {
      const track = trackFor(`pointer:${entry.pointer}`, entry.pointer);
      track.markers.push({
        id: `pointer-${index}`,
        timeSeconds: entry.timeSeconds,
        endSeconds: null,
        label: formatValue(entry.value.data),
        nodeIndex: entry.nodeIndex,
        tone: "property",
      });
      return;
    }
    if (entry.kind === "event") {
      const track = trackFor("event", "イベント");
      track.markers.push({
        id: `event-${index}`,
        timeSeconds: entry.timeSeconds,
        endSeconds: null,
        label: entry.name,
        nodeIndex: entry.nodeIndex,
        tone: "event",
      });
      return;
    }
    const track = trackFor("log", "ログ");
    track.markers.push({
      id: `log-${index}`,
      timeSeconds: entry.timeSeconds,
      endSeconds: null,
      label: entry.message || "log",
      nodeIndex: entry.nodeIndex,
      tone: "log",
    });
  });

  return [...tracks.values()];
}

/** Axis labels at a spacing that stays readable at any horizon. */
function axisTicks(horizonSeconds: number): number[] {
  const step =
    horizonSeconds <= 30 ? 5 : horizonSeconds <= 60 ? 10 : horizonSeconds <= 120 ? 20 : 60;
  const ticks: number[] = [];
  for (let time = 0; time <= horizonSeconds; time += step) ticks.push(time);
  return ticks;
}

export function InteractivityTimeline({
  run,
  entryPoint,
  horizonSeconds,
  playheadSeconds,
  triggerTargets,
  selectedNodeIndex,
  onEntryPointChange,
  onHorizonChange,
  onPlayheadChange,
  onSelectNode,
}: {
  /** Result of running the graph forward, computed by the editor. */
  run: InteractivityDryRun;
  entryPoint: "start" | "interact";
  horizonSeconds: number;
  playheadSeconds: number;
  triggerTargets: readonly InteractionTriggerTargetEntity[];
  selectedNodeIndex: number | null;
  onEntryPointChange: (entry: "start" | "interact") => void;
  onHorizonChange: (seconds: number) => void;
  onPlayheadChange: (seconds: number) => void;
  onSelectNode: (nodeIndex: number) => void;
}) {
  const tracks = useMemo(
    () => buildTracks(run.entries, triggerTargets),
    [run.entries, triggerTargets],
  );
  const ticks = useMemo(() => axisTicks(horizonSeconds), [horizonSeconds]);
  const percent = (seconds: number) =>
    `${Math.min(100, Math.max(0, (seconds / horizonSeconds) * 100))}%`;

  return (
    <section
      className="flex min-h-0 flex-1 flex-col border-t border-slate-700 bg-slate-950"
      aria-label="Behavior graph timeline"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-800 px-3 py-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          タイムライン
        </p>
        <label className="flex items-center gap-1 text-[10px] text-slate-400">
          起点
          <select
            value={entryPoint}
            onChange={(event) =>
              onEntryPointChange(event.target.value === "interact" ? "interact" : "start")
            }
            className="h-6 rounded border border-slate-700 bg-slate-900 px-1 text-[10px] text-slate-200"
            aria-label="タイムラインの起点"
          >
            <option value="start">開始時</option>
            <option value="interact">インタラクト</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-[10px] text-slate-400">
          範囲
          <select
            value={horizonSeconds}
            onChange={(event) => onHorizonChange(Number(event.target.value))}
            className="h-6 rounded border border-slate-700 bg-slate-900 px-1 text-[10px] text-slate-200"
            aria-label="タイムラインの範囲"
          >
            {INTERACTIVITY_TIMELINE_HORIZONS.map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds}秒
              </option>
            ))}
          </select>
        </label>
        <input
          type="range"
          min={0}
          max={horizonSeconds}
          step={0.5}
          value={Math.min(playheadSeconds, horizonSeconds)}
          onChange={(event) => onPlayheadChange(Number(event.target.value))}
          className="h-6 flex-1 accent-violet-400"
          aria-label="時刻"
        />
        <span className="w-12 shrink-0 text-right text-[10px] tabular-nums text-slate-300">
          {formatSeconds(Math.min(playheadSeconds, horizonSeconds))}
        </span>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
        {tracks.length === 0 ? (
          <p className="p-3 text-[11px] leading-5 text-slate-400">
            {entryPoint === "start"
              ? "開始時から動くものがありません。「開始時」ノードから順に繋ぐと、ここに時刻が並びます。"
              : "インタラクトから動くものがありません。"}
          </p>
        ) : (
          <div className="min-w-[420px]">
            <div className="relative ml-40 h-5 border-b border-slate-800">
              {ticks.map((tick, index) => (
                <span
                  key={tick}
                  style={{ left: percent(tick) }}
                  // The first and last labels sit on the edges, so centring
                  // them on the tick would clip half of each away.
                  className={`absolute top-0 text-[9px] tabular-nums text-slate-500 ${
                    index === 0
                      ? ""
                      : index === ticks.length - 1
                        ? "-translate-x-full"
                        : "-translate-x-1/2"
                  }`}
                >
                  {formatSeconds(tick)}
                </span>
              ))}
            </div>
            {tracks.map((track) => (
              <div key={track.id} className="flex items-stretch border-b border-slate-900">
                <p
                  title={track.label}
                  className="w-40 shrink-0 truncate border-r border-slate-800 px-2 py-1.5 text-[10px] text-slate-300"
                >
                  {track.label}
                </p>
                <div className="relative min-h-8 flex-1">
                  {ticks.map((tick) => (
                    <span
                      key={tick}
                      style={{ left: percent(tick) }}
                      className="absolute inset-y-0 w-px bg-slate-800"
                    />
                  ))}
                  <span
                    style={{ left: percent(playheadSeconds) }}
                    className="absolute inset-y-0 w-px bg-violet-400"
                    aria-hidden="true"
                  />
                  {track.markers.map((marker) => {
                    const width =
                      marker.endSeconds === null
                        ? null
                        : `${Math.max(
                            0.5,
                            ((marker.endSeconds - marker.timeSeconds) / horizonSeconds) * 100,
                          )}%`;
                    return (
                      <button
                        key={marker.id}
                        type="button"
                        onClick={() => {
                          if (marker.nodeIndex >= 0) onSelectNode(marker.nodeIndex);
                          onPlayheadChange(marker.timeSeconds);
                        }}
                        title={`${formatSeconds(marker.timeSeconds)} ${marker.label}`}
                        style={{
                          left: percent(marker.timeSeconds),
                          ...(width ? { width } : {}),
                        }}
                        className={`absolute top-1.5 h-5 rounded border px-1 text-[9px] font-semibold text-slate-950 ${
                          TONE_CLASS[marker.tone]
                        } ${width ? "" : "min-w-6"} ${
                          marker.nodeIndex === selectedNodeIndex
                            ? "ring-2 ring-white/70"
                            : ""
                        } ${marker.timeSeconds > playheadSeconds ? "opacity-45" : ""}`}
                      >
                        <span className="block truncate text-left">{marker.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {run.truncated ? (
        <p className="shrink-0 border-t border-slate-800 px-3 py-1 text-[10px] text-amber-200">
          {horizonSeconds}秒の時点でまだ続きがあります。範囲を広げると先まで確認できます。
        </p>
      ) : null}
    </section>
  );
}
