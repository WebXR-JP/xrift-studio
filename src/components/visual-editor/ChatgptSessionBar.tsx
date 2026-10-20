import { useEffect, useMemo, useState } from "react";
import { Copy, MoreHorizontal, Plus } from "lucide-react";
import { chatgptSessionTranscript, piHistoryForSession, type ChatgptSession } from "../../lib/visual-editor/chatgpt-sessions";

export type ChatgptSessionActions = {
  sessions: readonly ChatgptSession[];
  activeSessionId?: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void | Promise<void>;
  onBranch?: (id: string, entryId: string) => void;
};

export function ChatgptSessionBar({ sessions, activeSessionId, onSelect, onNew, onRename, onDelete, onBranch, disabled: inputDisabled }: ChatgptSessionActions & { disabled: boolean }) {
  const session = sessions.find(item => item.id === activeSessionId);
  const history = session && piHistoryForSession(session);
  const byId = useMemo(() => new Map(history?.nodes.map(node => [node.id, node]) ?? []), [history]);
  const [title, setTitle] = useState(session?.title ?? "");
  const [notice, setNotice] = useState("");
  const [acting, setActing] = useState(false);
  const disabled = inputDisabled || acting;
  useEffect(() => { setTitle(session?.title ?? ""); setNotice(""); }, [session?.id, session?.title]);
  const act = (operation: () => void | Promise<void>) => {
    try {
      const result = operation(); setNotice("");
      if (result) { setActing(true); void result.catch(error => setNotice(error instanceof Error ? error.message : "チャットを更新できませんでした。")).finally(() => setActing(false)); }
    } catch (error) { setNotice(error instanceof Error ? error.message : "チャットを更新できませんでした。"); }
  };
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
    {onBranch ? <details className="relative shrink-0">
      <summary className="cursor-pointer rounded-md px-2 py-1.5 hover:bg-slate-100">会話の流れ</summary>
      <div className="absolute right-0 top-9 z-20 max-h-80 w-72 max-w-[calc(100vw-3rem)] space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
        <p className="leading-5">過去の応答を選んで、そこまでの会話から別の案を始められます。現在のSceneは変わりません。</p>
        {session?.piBranch ? <p className="text-[11px] text-slate-500">過去の会話から別の案を始めたチャットです。</p> : null}
        {!history?.nodes.length ? <p className="text-slate-500">制作チャットで依頼を実行すると履歴が表示されます。</p> : <ol aria-label="会話の会話の流れ" className="space-y-1">{history.nodes.slice(-80).map(node => {
          let depth = 0, parent = node.parentId;
          while (parent && byId.has(parent) && depth < 8) { depth++; parent = byId.get(parent)!.parentId; }
          return <li key={node.id} style={{ marginLeft: Math.min(depth, 4) * 8 }} className="border-l border-slate-200 pl-2 text-[11px]">
            <span>{node.label}{node.id === history.leafId ? "（現在）" : ""}</span>
            {node.canBranch ? <button type="button" disabled={disabled} onClick={() => act(() => { if (session) onBranch(session.id, node.id); })} className="ml-2 min-h-8 rounded px-2 text-brand-700 hover:bg-slate-50 disabled:opacity-50">ここから別の案を始める</button> : null}
          </li>;
        })}</ol>}
      </div>
    </details> : null}
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
        <p className="text-[11px] leading-4 text-slate-500">一覧は最大20チャット、各30件を保存します。制作の詳細履歴も端末に保存します。削除時に他の分岐が参照している詳細履歴は残します。Sceneは変わりません。</p>
      </div>
    </details>
  </div>;
}
