import { useEffect, useMemo, useState } from "react";
import type {
  XriftMcpClientId,
  XriftMcpClientStatus,
  XriftOllamaConfigurationResult,
  XriftOllamaIntegrationId,
  XriftOllamaStatus,
} from "../../lib/tauri";
import { EDITOR_ICONS } from "./editor-icons";

const OLLAMA_INTEGRATION_IDS: readonly XriftOllamaIntegrationId[] = [
  "codex",
  "claude-code",
  "opencode",
];

function isOllamaIntegrationId(
  value: XriftMcpClientId,
): value is XriftOllamaIntegrationId {
  return OLLAMA_INTEGRATION_IDS.includes(
    value as XriftOllamaIntegrationId,
  );
}

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
  ollama,
  ollamaConfiguring,
  ollamaError,
  ollamaResult,
  lastActivity,
  canUndo,
  onRefresh,
  onRegister,
  onConfigureOllama,
  onUndo,
}: {
  nativeAvailable: boolean;
  clients: readonly XriftMcpClientStatus[];
  loading: boolean;
  registeringClientId: XriftMcpClientId | null;
  error: string | null;
  ollama: XriftOllamaStatus | null;
  ollamaConfiguring: boolean;
  ollamaError: string | null;
  ollamaResult: XriftOllamaConfigurationResult | null;
  lastActivity: XriftMcpActivity;
  canUndo: boolean;
  onRefresh: () => void;
  onRegister: (clientId: XriftMcpClientId) => void;
  onConfigureOllama: (
    integrationId: XriftOllamaIntegrationId,
    model: string,
  ) => void;
  onUndo: () => void;
}) {
  const [selectedOllamaModel, setSelectedOllamaModel] = useState("");
  const [selectedOllamaIntegration, setSelectedOllamaIntegration] =
    useState<XriftOllamaIntegrationId>("opencode");
  const ollamaTargets = useMemo(
    () =>
      clients.filter(
        (client): client is XriftMcpClientStatus & {
          id: XriftOllamaIntegrationId;
        } => client.installed && isOllamaIntegrationId(client.id),
      ),
    [clients],
  );

  useEffect(() => {
    if (
      !ollama?.models.some((model) => model.name === selectedOllamaModel)
    ) {
      setSelectedOllamaModel(ollama?.models[0]?.name ?? "");
    }
  }, [ollama, selectedOllamaModel]);

  useEffect(() => {
    if (
      !ollamaTargets.some(
        (client) => client.id === selectedOllamaIntegration,
      ) &&
      ollamaTargets[0]
    ) {
      setSelectedOllamaIntegration(ollamaTargets[0].id);
    }
  }, [ollamaTargets, selectedOllamaIntegration]);

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
          Codex、Claude Code、Claude Desktop / Cowork、OpenCode、Cursorから、開いているSceneの設定変更とAsset配置を操作できます。
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
          detail: "XRift Studioを開いている間だけ、現在のSceneを操作できます。",
          indicator: "bg-emerald-500",
        }
      : updateCount > 0
        ? {
            label: "MCP serverの更新が必要",
            detail: "「更新」後、対象clientを再起動または再読み込みしてください。",
            indicator: "bg-amber-500",
          }
        : {
            label: "AI clientは未登録",
            detail: "利用するclientの「登録」を選んでください。",
            indicator: "bg-slate-400",
          };
  return (
    <div className="scrollbar-thin max-h-[min(32rem,calc(100vh-10rem))] space-y-3 overflow-y-auto p-3.5 text-xs text-slate-600">
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
          title="AI clientを再検出"
          aria-label="AI clientを再検出"
          disabled={
            loading || registeringClientId !== null || ollamaConfiguring
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
                    (client.registered && !client.needsUpdate) ||
                    registeringClientId !== null ||
                    ollamaConfiguring
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
              client情報を取得できませんでした。再検出してください。
            </p>
          ) : null}
        </div>
        <p className="mt-2 text-[11px] leading-4 text-slate-500">
          登録後は対象clientを再起動またはMCP再読み込みしてください。Claude Desktop / Coworkはローカルsessionで利用でき、remote CoworkではローカルMCPを起動できません。
        </p>
      </section>

      <section aria-labelledby="ollama-heading">
        <h3
          id="ollama-heading"
          className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
        >
          Ollamaローカルモデル
        </h3>
        <div className="rounded-md border border-slate-200 p-2.5">
          {loading && ollama === null ? (
            <p className="text-slate-500">Ollamaを確認しています</p>
          ) : !ollama?.installed ? (
            <div>
              <p className="font-semibold text-slate-800">Ollamaは未検出です</p>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">
                install後に再検出すると、ローカルmodelで対応clientを構成できます。
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-800">
                    Ollama{ollama.version ? ` ${ollama.version}` : ""}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {ollama.message}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  {ollama.models.length} models
                </span>
              </div>

              {!ollama.launchSupported ? (
                <p className="rounded border border-amber-200 bg-amber-50 p-2 text-[11px] leading-4 text-amber-800">
                  このversionはワンクリック構成に未対応です。Ollamaを更新して再検出してください。
                </p>
              ) : ollama.models.length === 0 ? (
                <p className="rounded border border-slate-200 bg-slate-50 p-2 text-[11px] leading-4 text-slate-600">
                  Ollamaを起動し、先に利用するmodelを追加してから再検出してください。
                </p>
              ) : (
                <>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                      ローカルmodel
                    </span>
                    <select
                      value={selectedOllamaModel}
                      disabled={ollamaConfiguring}
                      onChange={(event) =>
                        setSelectedOllamaModel(event.target.value)
                      }
                      className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-800 focus:border-brand-500 focus:outline-none"
                    >
                      {ollama.models.map((model) => (
                        <option key={model.name} value={model.name}>
                          {model.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                      構成するAI client
                    </span>
                    <select
                      value={selectedOllamaIntegration}
                      disabled={ollamaConfiguring || ollamaTargets.length === 0}
                      onChange={(event) =>
                        setSelectedOllamaIntegration(
                          event.target.value as XriftOllamaIntegrationId,
                        )
                      }
                      className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-800 focus:border-brand-500 focus:outline-none disabled:bg-slate-100"
                    >
                      {ollamaTargets.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  {ollamaTargets.length === 0 ? (
                    <p className="text-[11px] leading-4 text-amber-700">
                      Codex、Claude Code、OpenCodeのいずれかを先にinstallしてください。
                    </p>
                  ) : null}

                  <button
                    type="button"
                    disabled={
                      ollamaConfiguring ||
                      registeringClientId !== null ||
                      !selectedOllamaModel ||
                      ollamaTargets.length === 0
                    }
                    onClick={() =>
                      onConfigureOllama(
                        selectedOllamaIntegration,
                        selectedOllamaModel,
                      )
                    }
                    className="w-full rounded-md bg-brand-600 px-3 py-2 font-semibold text-white hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-500"
                  >
                    {ollamaConfiguring
                      ? "MCPとmodelを構成中"
                      : "XRift MCPとOllamaを構成"}
                  </button>
                  <p className="text-[10px] leading-4 text-slate-500">
                    選択modelのtool対応を確認し、XRift MCP登録とmodel設定を行います。modelのdownloadやclient起動は行いません。
                  </p>
                </>
              )}

              {ollamaError ? (
                <p
                  role="alert"
                  className="rounded border border-rose-200 bg-rose-50 p-2 text-[11px] leading-4 text-rose-700"
                >
                  {ollamaError}
                </p>
              ) : null}
              {ollamaResult ? (
                <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-[11px] leading-4 text-emerald-800">
                  {ollamaResult.integrationLabel}を{ollamaResult.model}で構成しました。clientを起動または再起動してください。
                </p>
              ) : null}
            </div>
          )}
        </div>
        <p className="mt-2 text-[11px] leading-4 text-slate-500">
          Ollamaはmodelの実行基盤です。Scene操作は構成したAI clientからXRift MCPを通して行います。
        </p>
      </section>

      {error ? (
        <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-2.5 text-rose-700">
          <p>{error}</p>
          <p className="mt-1 text-[11px] leading-4">
            上の「登録」から再試行できます。clientを更新した場合は状態を再確認してください。
          </p>
          <button
            type="button"
            disabled={loading || ollamaConfiguring}
            onClick={onRefresh}
            className="mt-1.5 font-semibold underline underline-offset-2 disabled:opacity-50"
          >
            client状態を再確認
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
