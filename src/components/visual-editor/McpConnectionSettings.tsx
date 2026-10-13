import { useCallback, useEffect, useRef, useState } from "react";
import { tauri, type XriftMcpClientId, type XriftMcpClientStatus } from "../../lib/tauri";
import { AiConnectionPanel } from "./AiConnectionPanel";
import { EditorDialog } from "./EditorDialog";
import { EDITOR_ICONS } from "./editor-icons";

/** App-level registration remains available without opening or changing a project. */
export function McpConnectionSettings({ onClose }: { onClose: () => void }) {
  const nativeAvailable = tauri.isAvailable();
  const [clients, setClients] = useState<XriftMcpClientStatus[]>([]);
  const [loading, setLoading] = useState(nativeAvailable);
  const [registeringClientId, setRegisteringClientId] = useState<XriftMcpClientId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const request = useRef(0);
  const pending = useRef(false);

  const refresh = useCallback(async () => {
    if (!nativeAvailable || pending.current) return;
    const current = ++request.current;
    pending.current = true;
    setLoading(true);
    setError(null);
    try {
      const detected = await tauri.detectXriftMcpClients();
      if (mounted.current && request.current === current) setClients(detected);
    } catch (reason) {
      if (mounted.current && request.current === current) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (mounted.current && request.current === current) {
        pending.current = false;
        setLoading(false);
      }
    }
  }, [nativeAvailable]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
      request.current++;
      pending.current = false;
    };
  }, [refresh]);

  const register = async (clientId: XriftMcpClientId) => {
    if (!nativeAvailable || pending.current) return;
    const current = ++request.current;
    pending.current = true;
    setRegisteringClientId(clientId);
    setError(null);
    try {
      const registered = await tauri.registerXriftMcpClient(clientId);
      if (mounted.current && request.current === current) {
        setClients(previous => previous.some(client => client.id === registered.id)
          ? previous.map(client => client.id === registered.id ? registered : client)
          : [...previous, registered]);
      }
    } catch (reason) {
      if (mounted.current && request.current === current) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (mounted.current && request.current === current) {
        pending.current = false;
        setRegisteringClientId(null);
      }
    }
  };

  return <EditorDialog onDismiss={onClose} ariaLabelledBy="mcp-connection-title"
    backdropClassName="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/25 p-3 sm:p-5"
    surfaceClassName="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-editor-border bg-editor-surface shadow-2xl">
    <header data-app-modal-header className="flex shrink-0 items-center justify-between gap-3 border-b border-editor-border px-4 py-3">
      <h2 id="mcp-connection-title" className="text-sm font-semibold text-editor-text">MCP接続</h2>
      <button type="button" aria-label="MCP接続を閉じる" onClick={onClose}
        className="flex size-11 shrink-0 items-center justify-center rounded-md text-editor-muted hover:bg-editor-subtle">
        <EDITOR_ICONS.close size={18} aria-hidden="true" />
      </button>
    </header>
    <div data-app-modal-body className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <AiConnectionPanel nativeAvailable={nativeAvailable} clients={clients} loading={loading}
        registeringClientId={registeringClientId} error={error} lastActivity={null} canUndo={false}
        onRefresh={() => void refresh()} onRegister={clientId => void register(clientId)} onUndo={() => {}} />
    </div>
  </EditorDialog>;
}
