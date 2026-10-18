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
  const flush = () => {
    clearTimeout(timer.current);
    // A failed read must never be replaced with an empty/new history silently.
    if (loaded.error) {
      setHistoryError(loaded.error);
      throw new Error(loaded.error);
    }
    try { saveChatgptSessions(sessionsRef.current); setHistoryError(null); }
    catch (error) {
      const message = error instanceof Error ? error.message : "会話履歴を保存できませんでした。作業履歴をコピーして残してください。";
      setHistoryError(message);
      throw error instanceof Error ? error : new Error(message);
    }
  };
  const updateSessions = (next: ChatgptSession[], flushNow = false) => {
    sessionsRef.current = next;
    setSessions(next);
    clearTimeout(timer.current);
    // Existing UI updates report failures. Side-effect checkpoints call the
    // exposed flush directly so storage rejection stops downstream dispatch.
    if (flushNow) { try { flush(); } catch { /* The visible history error was already set. */ } }
    else timer.current = setTimeout(() => { try { flush(); } catch { /* The visible history error was already set. */ } }, 250);
  };
  useEffect(() => () => {
    clearTimeout(timer.current);
    if (!loaded.error) {
      try { saveChatgptSessions(sessionsRef.current); } catch { /* In-session writes already report failures. */ }
    }
  }, [loaded]);
  return { sessions, sessionsRef, selectedSessionId, selectedSessionIdRef, selectSession, historyError, updateSessions, flush };
}
