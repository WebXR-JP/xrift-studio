import type {
  XriftMcpClientId,
  XriftMcpClientStatus,
} from "../../lib/tauri";
import { EDITOR_ICONS } from "./editor-icons";

export type XriftMcpActivity = {
  clientName: string;
  message: string;
  at: string;
} | null;

export function AiConnectionPanel({
  nativeAvailable,
  clients,
  loading,
  registeringClientId,
  error,
  lastActivity,
  canUndo,
  onRefresh,
  onRegister,
  onUndo,
}: {
  nativeAvailable: boolean;
  clients: readonly XriftMcpClientStatus[];
  loading: boolean;
  registeringClientId: XriftMcpClientId | null;
  error: string | null;
  lastActivity: XriftMcpActivity;
  canUndo: boolean;
  onRefresh: () => void;
  onRegister: (clientId: XriftMcpClientId) => void;
  onUndo: () => void;
}) {
  if (!nativeAvailable) {
    return (
      <div className="space-y-3 p-3.5 text-xs leading-5 text-slate-600">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="font-semibold text-slate-800">デスクトップ版で利用できます</p>
          <p className="mt-1">
            ブラウザ表示ではAI clientの検出や登録は実行しません。
          </p>
        </div>
        <p>
          CodexやClaude Codeから、開いているSceneの設定変更とAsset配置を操作できます。
        </p>
      </div>
    );
  }

  const registeredCount = clients.filter((client) => client.registered).length;
  return (
    <div className="scrollbar-thin max-h-[min(32rem,calc(100vh-10rem))] space-y-3 overflow-y-auto p-3.5 text-xs text-slate-600">
      <div className="flex items-start justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
        <div>
          <div className="flex items-center gap-2 font-semibold text-slate-800">
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${registeredCount > 0 ? "bg-emerald-500" : "bg-slate-400"}`}
            />
            {registeredCount > 0 ? "AI編集を待機中" : "AI clientは未登録"}
          </div>
          <p className="mt-1 leading-4">
            XRift Studioを開いている間だけ、現在のSceneを操作できます。
          </p>
        </div>
        <button
          type="button"
          title="AI clientを再検出"
          aria-label="AI clientを再検出"
          disabled={loading || registeringClientId !== null}
          onClick={onRefresh}
          className="rounded p-1.5 text-slate-500 hover:bg-white hover:text-slate-800 disabled:opacity-50"
        >
          <EDITOR_ICONS.refresh
            size={15}
            className={loading ? "animate-spin" : undefined}
            aria-hidden="true"
          />
        </button>
      </div>

      <section aria-labelledby="ai-client-heading">
        <h3
          id="ai-client-heading"
          className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
        >
          ワンクリック登録
        </h3>
        <div className="space-y-1.5">
          {clients.map((client) => {
            const registering = registeringClientId === client.id;
            return (
              <div
                key={client.id}
                className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-2.5 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-800">{client.label}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{client.message}</p>
                </div>
                <button
                  type="button"
                  disabled={
                    !client.installed ||
                    client.registered ||
                    registeringClientId !== null
                  }
                  onClick={() => onRegister(client.id)}
                  className="shrink-0 rounded-md bg-brand-600 px-2.5 py-1.5 font-semibold text-white hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-500"
                >
                  {registering
                    ? "登録中"
                    : client.registered
                      ? "登録済み"
                      : client.installed
                        ? "登録"
                        : "未検出"}
                </button>
              </div>
            );
          })}
          {!loading && clients.length === 0 ? (
            <p className="rounded-md border border-slate-200 p-3 text-slate-500">
              client情報を取得できませんでした。再検出してください。
            </p>
          ) : null}
        </div>
      </section>

      {error ? (
        <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-2.5 text-rose-700">
          <p>{error}</p>
          <button
            type="button"
            onClick={onRefresh}
            className="mt-1.5 font-semibold underline underline-offset-2"
          >
            再検出
          </button>
        </div>
      ) : null}

      <section aria-labelledby="ai-activity-heading">
        <h3
          id="ai-activity-heading"
          className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
        >
          直近の操作
        </h3>
        {lastActivity ? (
          <div className="rounded-md border border-violet-200 bg-violet-50 p-2.5">
            <p className="font-semibold text-violet-900">{lastActivity.message}</p>
            <p className="mt-1 text-[11px] text-violet-700">
              {lastActivity.clientName} · {lastActivity.at}
            </p>
            <button
              type="button"
              disabled={!canUndo}
              onClick={onUndo}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-violet-300 bg-white px-2.5 py-1.5 font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-50"
            >
              <EDITOR_ICONS.undo size={13} aria-hidden="true" />
              この変更を元に戻す
            </button>
          </div>
        ) : (
          <p className="rounded-md border border-slate-200 p-3 leading-4 text-slate-500">
            まだAIからの操作はありません。登録後、clientを再起動して利用してください。
          </p>
        )}
      </section>
    </div>
  );
}
