import { useEffect, useState } from "react";
import { Copy, MoreHorizontal, Plus } from "lucide-react";
import { chatgptSessionTranscript, type ChatgptSession } from "../../lib/visual-editor/chatgpt-sessions";

export type ChatgptSessionActions = {
  sessions: readonly ChatgptSession[];
  activeSessionId?: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
};

export function ChatgptSessionBar({ sessions, activeSessionId, onSelect, onNew, onRename, onDelete, disabled }: ChatgptSessionActions & { disabled: boolean }) {
  const session = sessions.find(item => item.id === activeSessionId);
  const [title, setTitle] = useState(session?.title ?? "");
  const [notice, setNotice] = useState("");
  useEffect(() => { setTitle(session?.title ?? ""); setNotice(""); }, [session?.id, session?.title]);
  const act = (operation: () => void) => { try { operation(); setNotice(""); } catch (error) { setNotice(error instanceof Error ? error.message : "チャットを更新できませんでした。"); } };
  const copy = async () => {
    if (!session) return;
    try { await navigator.clipboard.writeText(chatgptSessionTranscript(session)); setNotice("このチャットの作業履歴をコピーしました"); }
    catch { setNotice("コピーできませんでした。もう一度お試しください。"); }
  };
  return <div className="flex min-w-0 shrink-0 items-center gap-1.5">
    <select aria-label="制作チャットの履歴" value={session?.id ?? ""} disabled={disabled || !sessions.length} onChange={event => act(() => onSelect(event.target.value))} className="min-w-0 flex-1 rounded-md border-0 bg-slate-50 px-2 py-1.5 text-xs text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
      {!sessions.length ? <option value="">新しいチャット</option> : sessions.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
    </select>
    <button type="button" title="新しいチャット" aria-label="新しいチャット" disabled={disabled} onClick={() => act(onNew)} className="flex size-8 shrink-0 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-50"><Plus size={16} aria-hidden="true" /></button>
    <details className="relative shrink-0">
      <summary aria-label="チャットの操作" title="チャットの操作" className="flex size-8 cursor-pointer list-none items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"><MoreHorizontal size={16} aria-hidden="true" /></summary>
      <div className="absolute right-0 top-9 z-20 w-64 max-w-[calc(100vw-3rem)] space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
        <button type="button" disabled={!session?.turns.length} onClick={() => void copy()} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-slate-50 disabled:opacity-50"><Copy size={14} aria-hidden="true" />作業履歴をすべてコピー</button>
        {notice ? <p role="status" className="text-[11px] leading-4 text-slate-600">{notice}</p> : null}
        <form onSubmit={event => { event.preventDefault(); if (session && title.trim() && !disabled) act(() => onRename(session.id, title.trim())); }} className="space-y-2 border-t border-slate-100 pt-3">
          <input aria-label="チャットの名前" value={title} onChange={event => setTitle(event.target.value)} maxLength={80} disabled={!session || disabled} className="w-full rounded-md border border-slate-300 px-2 py-1.5 outline-none focus:border-slate-500" />
          <button type="submit" disabled={!session || !title.trim() || disabled} className="rounded-md px-2 py-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50">名前を保存</button>
        </form>
        <button type="button" disabled={!session || disabled} onClick={() => { if (session) act(() => onDelete(session.id)); }} className="rounded-md px-2 py-1.5 text-rose-700 hover:bg-rose-50 disabled:opacity-50">このチャットの履歴を削除</button>
        <p className="text-[11px] leading-4 text-slate-500">履歴はこの端末に最大20チャット、各30件保存します。履歴を削除してもSceneは変わりません。</p>
      </div>
    </details>
  </div>;
}
