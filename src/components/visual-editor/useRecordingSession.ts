import { useEffect, useSyncExternalStore } from "react";
import {
  recordingSession,
  type RecordingStoreState,
} from "../../lib/recording/recording-session";
import { isRecordingActive } from "../../lib/recording/recording-state";

/** The recording controller's whole state, re-rendering on every change. */
export function useRecordingSession(): RecordingStoreState {
  return useSyncExternalStore(
    recordingSession.subscribe,
    recordingSession.getState,
    recordingSession.getState,
  );
}

/**
 * One slice of the controller's state. The elapsed time ticks every second
 * while a take runs, so anything large (the Scene View, the editor shell)
 * subscribes to the objects it needs and leaves the clock to the badges.
 */
export function useRecordingSelector<T>(
  selector: (state: RecordingStoreState) => T,
): T {
  return useSyncExternalStore(
    recordingSession.subscribe,
    () => selector(recordingSession.getState()),
    () => selector(recordingSession.getState()),
  );
}

/** Keeps the elapsed time moving while a take runs. */
export function useRecordingClock(): void {
  const active = useRecordingSelector((state) => isRecordingActive(state.snapshot));
  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(() => recordingSession.tick(), 1000);
    return () => window.clearInterval(interval);
  }, [active]);
}
