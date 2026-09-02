import {
  describeRecordingProfile,
  type RecordingProfile,
} from "../../lib/recording/recording-profile";
import {
  formatRecordingDuration,
  isRecordingActive,
  summarizeRecording,
} from "../../lib/recording/recording-state";
import { useRecordingSelector } from "./useRecordingSession";

/**
 * The REC readouts. They subscribe to the take on their own so the elapsed
 * time can tick every second without re-rendering the Scene View around them.
 * Both are DOM overlays: never part of the recorded pixels.
 */
export function RecordingHeaderBadge({ playing }: { playing: boolean }) {
  const snapshot = useRecordingSelector((state) => state.snapshot);
  if (!isRecordingActive(snapshot)) return null;
  return (
    <span
      className={`flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums ${
        playing
          ? "border-rose-300/60 bg-rose-500/15 text-rose-100"
          : "border-rose-300 bg-rose-50 text-rose-700"
      }`}
      role="status"
      aria-live="polite"
      title={summarizeRecording(snapshot)}
    >
      <span className="size-1.5 rounded-full bg-rose-500" aria-hidden="true" />
      {snapshot.status === "stopping" ? "保存中" : "REC"}{" "}
      {formatRecordingDuration(snapshot.durationMs)}
    </span>
  );
}

export function RecordingFrameBadge({ profile }: { profile: RecordingProfile }) {
  const snapshot = useRecordingSelector((state) => state.snapshot);
  const active = isRecordingActive(snapshot);
  return (
    <div
      className="pointer-events-none absolute left-2 top-2 z-20 flex items-center gap-1.5 rounded-md bg-slate-950/75 px-2 py-1 font-mono text-[11px] text-white backdrop-blur"
      role="status"
      aria-live="polite"
    >
      {active ? (
        <>
          <span
            className="size-2 rounded-full bg-rose-500 motion-safe:animate-pulse"
            aria-hidden="true"
          />
          <span className="font-semibold tabular-nums">
            {snapshot.status === "stopping" ? "保存中" : "REC"}{" "}
            {formatRecordingDuration(snapshot.durationMs)}
          </span>
        </>
      ) : (
        <span className="font-semibold">録画ビュー</span>
      )}
      <span className="text-white/70">{describeRecordingProfile(profile)}</span>
    </div>
  );
}
