import { tauri, type XriftMcpClientId, type XriftMcpClientStatus } from "./tauri";

type RefreshMcpClientsOptions = {
  onClients?: (clients: XriftMcpClientStatus[]) => void;
  onUpdating?: (clientId: XriftMcpClientId | null) => void;
};

const registrationsInProgress = new Map<XriftMcpClientId, Promise<XriftMcpClientStatus>>();

/** Manual retries and automatic updates share the same write per client. */
export function registerXriftMcpClient(clientId: XriftMcpClientId) {
  const pending = registrationsInProgress.get(clientId);
  if (pending) return pending;
  const registration = tauri.registerXriftMcpClient(clientId).finally(() => registrationsInProgress.delete(clientId));
  registrationsInProgress.set(clientId, registration);
  return registration;
}

type RefreshResult = { clients: XriftMcpClientStatus[]; error: string | null };
type RefreshRun = {
  listeners: Set<RefreshMcpClientsOptions>;
  clients: XriftMcpClientStatus[] | null;
  updating: XriftMcpClientId | null;
  promise: Promise<RefreshResult>;
};
let activeRefresh: RefreshRun | null = null;

function publishClients(run: RefreshRun, clients: XriftMcpClientStatus[]) {
  run.clients = clients;
  for (const listener of run.listeners) listener.onClients?.(clients);
}

function publishUpdating(run: RefreshRun, clientId: XriftMcpClientId | null) {
  run.updating = clientId;
  for (const listener of run.listeners) listener.onUpdating?.(clientId);
}

async function detectAndUpdateClients(run: RefreshRun): Promise<RefreshResult> {
  let clients = await tauri.detectXriftMcpClients();
  const errors: string[] = [];
  publishClients(run, clients);
  for (const client of clients) {
    if (!client.installed || !client.registered || !client.needsUpdate || client.autoUpdateAllowed !== true) continue;
    publishUpdating(run, client.id);
    try {
      const registered = await registerXriftMcpClient(client.id);
      const updated = { ...registered, message: "MCPサーバーを更新しました。AIクライアントを再起動するか、MCPを再読み込みしてください。" };
      clients = clients.map(current => current.id === updated.id ? updated : current);
      publishClients(run, clients);
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : String(reason);
      errors.push(`${client.label}のMCPサーバーを自動更新できませんでした。${detail}`);
    } finally {
      publishUpdating(run, null);
    }
  }
  return { clients, error: errors.length ? errors.join("\n") : null };
}

/** Share detection and registration while a settings surface remounts or reopens. */
export function refreshXriftMcpClients(options: RefreshMcpClientsOptions = {}): Promise<RefreshResult> {
  if (!activeRefresh) {
    const run: RefreshRun = {
      listeners: new Set(), clients: null, updating: null,
      promise: Promise.resolve().then(() => detectAndUpdateClients(run)).finally(() => {
        if (activeRefresh === run) activeRefresh = null;
      }),
    };
    activeRefresh = run;
  }
  const run = activeRefresh;
  const listener = { ...options };
  run.listeners.add(listener);
  if (run.clients) listener.onClients?.(run.clients);
  listener.onUpdating?.(run.updating);
  return run.promise.finally(() => run.listeners.delete(listener));
}
