import type {
  XriftMcpClientId,
  XriftMcpClientStatus,
} from "../../lib/tauri";
import { EDITOR_ICONS } from "./editor-icons";

export type XriftMcpActivity = {
  clientName: string;
  message: string;
  at: string;
  revision: number;
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
            ブラウザ表示ではAIクライアントの検出や登録は実行しません。
          </p>
        </div>
        <p>
          CodexなどのAIクライアントにXRift StudioのMCPを登録すると、開いているシーンを会話から読み取り・編集できます。AIによる変更も自動保存され、「元に戻す」で取り消せます。
        </p>
      </div>
    );
  }

  const registeredCount = clients.filter(
    (client) => client.registered && !client.needsUpdate,
  ).length;
  const updateCount = clients.filter((client) => client.needsUpdate).length;
  const connectionState =
    registeredCount > 0
      ? {
          label: "AI編集を待機中",
          detail: "XRift Studioを開いている間だけ、現在のシーンを操作できます。",
          indicator: "bg-emerald-500",
        }
      : updateCount > 0
        ? {
            label: "MCPサーバーの更新が必要です",
            detail: "「更新」後、登録したAIクライアントを再起動または再読み込みしてください。",
            indicator: "bg-amber-500",
          }
        : {
            label: "AIクライアントは未登録",
            detail: "使うAIクライアントの「登録」を選んでください。",
            indicator: "bg-slate-400",
          };
  return (
    <div className="scrollbar-thin max-h-[min(32rem,calc(100vh-10rem))] space-y-3 overflow-y-auto p-3.5 text-xs text-slate-600">
      <p className="rounded-md border border-violet-100 bg-violet-50/70 p-3 leading-5 text-slate-700">
        CodexなどのAIクライアントをXRift StudioのMCPに接続できます。開いているシーンを会話から読み取り・編集し、変更は自動保存され、「元に戻す」で取り消せます。
      </p>
      <div className="flex items-start justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
        <div>
          <div className="flex items-center gap-2 font-semibold text-slate-800">
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${connectionState.indicator}`}
            />
            {connectionState.label}
          </div>
          <p className="mt-1 leading-4">{connectionState.detail}</p>
        </div>
        <button
          type="button"
          title="AIクライアントを再検出"
          aria-label="AIクライアントを再検出"
          disabled={
            loading || registeringClientId !== null
          }
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
          AIクライアントの登録
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
                  {client.id === "codex" && !client.installed ? (
                    <p className="mt-1 max-w-64 text-[10px] leading-4 text-slate-400">
                      公式インストーラー、Codexアプリ、npm、pnpm、WinGetの標準配置を確認します。
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={
                    !client.installed ||
                    (client.registered && !client.needsUpdate) ||
                    registeringClientId !== null
                  }
                  onClick={() => onRegister(client.id)}
                  className="shrink-0 rounded-md bg-brand-600 px-2.5 py-1.5 font-semibold text-white hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-500"
                >
                  {registering
                    ? client.needsUpdate
                      ? "更新中"
                      : "登録中"
                    : client.needsUpdate
                      ? "更新"
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
              AIクライアントの情報を取得できませんでした。再検出してください。
            </p>
          ) : null}
        </div>
        <p className="mt-2 text-[11px] leading-4 text-slate-500">
          登録後はAIクライアントを再起動するか、MCPを再読み込みしてください。Claude Desktop / Coworkではローカルセッションで利用できます。リモートのCoworkでは利用できません。
        </p>
      </section>

      {error ? (
        <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-2.5 text-rose-700">
          <p>{error}</p>
          <p className="mt-1 text-[11px] leading-4">
            上の「登録」から再試行できます。AIクライアントを更新した場合は状態を再確認してください。
          </p>
          <button
            type="button"
            disabled={loading}
            onClick={onRefresh}
            className="mt-1.5 font-semibold underline underline-offset-2 disabled:opacity-50"
          >
            AIクライアントの状態を再確認
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
            まだAIからの操作はありません。登録後、AIクライアントを再起動して利用してください。
          </p>
        )}
      </section>
    </div>
  );
}
