import { useEffect, useRef, useState } from "react";
import { loadChatgptSessions, saveChatgptSessions, type ChatgptSession } from "../../lib/visual-editor/chatgpt-sessions";

/** Conversation history belongs to this device, separately from world files. */
export function useChatgptSessions() {
  const [loaded] = useState(() => {
    try { return { sessions: loadChatgptSessions(), error: null as string | null }; }
    catch (error) { return { sessions: [] as ChatgptSession[], error: error instanceof Error ? error.message : "会話履歴を読み込めませんでした。" }; }
  });
  const [sessions, setSessions] = useState(loaded.sessions);
  const sessionsRef = useRef(sessions);
  const [selectedSessionId, setSelectedSessionId] = useState<string>();
  const selectedSessionIdRef = useRef<string | undefined>(undefined);
  const selectSession = (id: string | undefined) => {
    selectedSessionIdRef.current = id;
    setSelectedSessionId(id);
  };
  const [historyError, setHistoryError] = useState(loaded.error);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const persist = () => {
    // A failed read must never be replaced with an empty/new history silently.
    if (loaded.error) return;
    try { saveChatgptSessions(sessionsRef.current); setHistoryError(null); }
    catch (error) { setHistoryError(error instanceof Error ? error.message : "会話履歴を保存できませんでした。作業履歴をコピーして残してください。"); }
  };
  const updateSessions = (next: ChatgptSession[], flush = false) => {
    sessionsRef.current = next;
    setSessions(next);
    clearTimeout(timer.current);
    if (flush) persist();
    else timer.current = setTimeout(persist, 250);
  };
  useEffect(() => () => {
    clearTimeout(timer.current);
    if (!loaded.error) {
      try { saveChatgptSessions(sessionsRef.current); } catch { /* In-session writes already report failures. */ }
    }
  }, [loaded]);
  return { sessions, sessionsRef, selectedSessionId, selectedSessionIdRef, selectSession, historyError, updateSessions };
}
