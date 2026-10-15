import type { ChatgptGenerationEvent } from "../../lib/visual-editor/chatgpt-generation";

const legacySceneOperation = /^(?:\d+\s*\/\s*\d+\s*[：:]\s*)?Scene設定を調整(?:しています|して保存しました)?。?$/u;

export function formatChatgptProgressMessage(message: string): string {
  return legacySceneOperation.test(message.trim()) ? "以前の設定変更（変更項目の詳細記録なし）" : message;
}

/** Older records do not identify the changed settings. Summarize only those
 * consecutive messages for display, keeping the stored events untouched. */
export function chatgptProgressIsRecorded(message: string, events: readonly ChatgptGenerationEvent[]): boolean {
  const last = events[events.length - 1];
  return Boolean(last?.saved && formatChatgptProgressMessage(last.message).trim() === formatChatgptProgressMessage(message).trim());
}

export function formatChatgptWorkLogEvents(events: readonly ChatgptGenerationEvent[], currentMessage?: string): { sequence: number; message: string }[] {
  const result: { sequence: number; message: string }[] = [];
  let legacy: { sequence: number; saved: number } | undefined;
  const flushLegacy = () => {
    if (!legacy) return;
    result.push({ sequence: legacy.sequence, message: `以前の設定変更${legacy.saved ? `：保存${legacy.saved}件` : ""}（変更項目の詳細記録なし）` });
    legacy = undefined;
  };
  // The current activity already appears above the record. Saved work remains
  // in the log; unfinished activity does not need a second identical line.
  let end = events.length;
  while (currentMessage !== undefined && end && !events[end - 1].saved
    && formatChatgptProgressMessage(events[end - 1].message).trim() === formatChatgptProgressMessage(currentMessage).trim()) end -= 1;
  for (const event of events.slice(0, end)) {
    if (legacySceneOperation.test(event.message.trim())) {
      legacy ??= { sequence: event.sequence, saved: 0 };
      if (event.saved || event.message.includes("して保存しました")) legacy.saved += 1;
    } else {
      flushLegacy();
      result.push({ sequence: event.sequence, message: event.message });
    }
  }
  flushLegacy();
  return result;
}

export function ChatgptWorkLog({ events, currentMessage }: { events: readonly ChatgptGenerationEvent[]; currentMessage?: string }) {
  const displayEvents = formatChatgptWorkLogEvents(events, currentMessage);
  if (!displayEvents.length) return null;
  return <section aria-label="作業の記録" className="space-y-2">
    <h4 className="text-[11px] font-medium text-slate-500">作業の記録</h4>
    <ol className="space-y-1 border-l border-slate-200 pl-2 text-[11px] leading-4">{displayEvents.map(event => <li key={event.sequence} className="break-words">{event.message}</li>)}</ol>
  </section>;
}
