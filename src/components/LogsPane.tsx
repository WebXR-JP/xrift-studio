import { useEffect, useRef, useState } from "react";
import type { LogLine } from "../lib/backend";

type Props = {
  logs: LogLine[];
  busy: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onClear: () => void;
};

const styleFor = (kind: LogLine["kind"]) => {
  switch (kind) {
    case "stderr":
      return "text-amber-700";
    case "info":
      return "text-violet-700 font-medium";
    case "exit":
      return "text-zinc-400";
    default:
      return "text-zinc-700";
  }
};

const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, "");

export function LogsPane({ logs, busy, collapsed, onToggle, onClear }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [hasNew, setHasNew] = useState(false);
  const lastLenRef = useRef(logs.length);

  useEffect(() => {
    if (!collapsed) {
      const el = ref.current;
      if (el) el.scrollTop = el.scrollHeight;
      setHasNew(false);
    } else if (logs.length > lastLenRef.current) {
      setHasNew(true);
    }
    lastLenRef.current = logs.length;
  }, [logs, collapsed]);

  const recent = logs[logs.length - 1];

  if (collapsed) {
    return (
      <div
        className="flex h-9 shrink-0 items-center justify-between border-t border-zinc-200 bg-zinc-50 px-4"
      >
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-800"
        >
          <span className="font-medium">Logs</span>
          {busy && (
            <span className="flex items-center gap-1 text-[11px] text-violet-600">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500" />
              実行中
            </span>
          )}
          {hasNew && !busy && (
            <span className="rounded-full bg-violet-500 px-1.5 py-0.5 text-[9px] font-semibold text-white">
              NEW
            </span>
          )}
          {recent && (
            <span className="line-clamp-1 max-w-[60vw] truncate text-[11px] text-zinc-400">
              {stripAnsi(recent.text)}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="text-[11px] text-zinc-400 hover:text-zinc-700"
        >
          展開
        </button>
      </div>
    );
  }

  return (
    <section className="flex h-72 shrink-0 flex-col border-t border-zinc-200 bg-white">
      <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-1.5">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span className="font-medium">Logs</span>
          {busy && (
            <span className="flex items-center gap-1 text-violet-600">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500" />
              実行中
            </span>
          )}
          <span className="text-zinc-400">{logs.length} 行</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClear}
            className="rounded px-1.5 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
          >
            クリア
          </button>
          <button
            type="button"
            onClick={onToggle}
            className="rounded px-1.5 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
          >
            たたむ
          </button>
        </div>
      </div>
      <div
        ref={ref}
        className="flex-1 overflow-y-auto bg-white px-4 py-2 font-mono text-[11px] leading-5"
      >
        {logs.length === 0 ? (
          <div className="text-zinc-400">
            コマンドを実行するとここにログが流れます。
          </div>
        ) : (
          logs.map((line, i) => (
            <div key={i} className={`whitespace-pre-wrap ${styleFor(line.kind)}`}>
              {stripAnsi(line.text)}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
