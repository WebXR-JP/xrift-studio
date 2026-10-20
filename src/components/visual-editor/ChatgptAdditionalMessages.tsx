import type { PiAuthoringRun } from "../../lib/visual-editor/pi-authoring";

export function ChatgptAdditionalMessages({ messages, onReuse }: { messages: PiAuthoringRun["liveMessages"]; onReuse?: (message: NonNullable<PiAuthoringRun["liveMessages"]>[number]) => void }) {
  if (!messages?.length) return null;
  return <ol aria-label="制作中の追加指示" className="space-y-2">{messages.map(message => <li key={message.id} className="ml-5 space-y-1 rounded-xl bg-slate-100 px-3 py-2 text-slate-800">
    <p className="whitespace-pre-wrap break-words">{message.prompt}</p>
    <p className="text-[11px] text-slate-500">{message.state === "applied" ? "追加指示を受信しました" : message.state === "unapplied" ? "この指示はまだ反映されていません" : message.delivery === "steer" ? "今の応答と操作が終わると、追加指示を受け取ります" : "今の制作が終わると、追加指示を受け取ります"}</p>
    {message.state === "unapplied" && onReuse ? <button type="button" onClick={() => onReuse(message)} className="min-h-8 rounded px-2 text-[11px] text-brand-700 hover:bg-slate-200">入力欄に戻す</button> : null}
  </li>)}</ol>;
}
