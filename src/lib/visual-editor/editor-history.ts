export type EditorHistory<Snapshot> = {
  past: Snapshot[];
  present: Snapshot;
  future: Snapshot[];
  limit: number;
};

export type HistoryTransition<Snapshot> = {
  history: EditorHistory<Snapshot>;
  changed: boolean;
};

export function createEditorHistory<Snapshot>(
  present: Snapshot,
  limit = 80,
): EditorHistory<Snapshot> {
  return {
    past: [],
    present,
    future: [],
    limit: normalizeHistoryLimit(limit),
  };
}

export function commitEditorHistory<Snapshot>(
  history: EditorHistory<Snapshot>,
  present: Snapshot,
  equal: (left: Snapshot, right: Snapshot) => boolean = Object.is,
): EditorHistory<Snapshot> {
  if (equal(history.present, present)) return history;
  const past = [...history.past, history.present];
  return {
    past: past.slice(Math.max(0, past.length - history.limit)),
    present,
    future: [],
    limit: history.limit,
  };
}

export function replaceEditorHistoryPresent<Snapshot>(
  history: EditorHistory<Snapshot>,
  present: Snapshot,
): EditorHistory<Snapshot> {
  return { ...history, present };
}

export function undoEditorHistory<Snapshot>(
  history: EditorHistory<Snapshot>,
): HistoryTransition<Snapshot> {
  const previous = history.past[history.past.length - 1];
  if (!previous) return { history, changed: false };
  return {
    changed: true,
    history: {
      ...history,
      past: history.past.slice(0, -1),
      present: previous,
      future: [history.present, ...history.future].slice(0, history.limit),
    },
  };
}

export function redoEditorHistory<Snapshot>(
  history: EditorHistory<Snapshot>,
): HistoryTransition<Snapshot> {
  const [next, ...future] = history.future;
  if (!next) return { history, changed: false };
  const past = [...history.past, history.present];
  return {
    changed: true,
    history: {
      ...history,
      past: past.slice(Math.max(0, past.length - history.limit)),
      present: next,
      future,
    },
  };
}

function normalizeHistoryLimit(value: number): number {
  return Number.isInteger(value) && value >= 1 ? Math.min(value, 500) : 80;
}
