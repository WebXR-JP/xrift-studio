import { useEffect, useMemo, useState } from "react";
import {
  tauri,
  type JevStatus,
  type XriftMcpClientId,
  type XriftMcpClientStatus,
  type XriftOllamaConfigurationResult,
  type XriftOllamaIntegrationId,
  type XriftOllamaStatus,
} from "../../lib/tauri";
import type {
  FastAuthoringTraceItem,
  FastAuthoringValidationCheck,
} from "../../lib/visual-editor/jev-fast-authoring";
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

export type JevFastAuthoringUiState = {
  status:
    | "idle"
    | "deciding"
    | "clarify"
    | "applying"
    | "checking"
    | "done"
    | "error";
  message: string;
  trace: FastAuthoringTraceItem[];
  applied: string[];
  checks?: FastAuthoringValidationCheck[];
  spawnPreviewDataUrl?: string | null;
  previewDataUrl?: string | null;
};

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
  fastAuthoringState,
  fastAuthoringDisabledReason,
  onRunFastAuthoring,
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
  fastAuthoringState: JevFastAuthoringUiState;
  fastAuthoringDisabledReason: string | null;
  onRunFastAuthoring: (prompt: string) => void | Promise<void>;
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
  const [jevStatus, setJevStatus] = useState<JevStatus | null>(null);
  const [jevApiKey, setJevApiKey] = useState("");
  const [fastAuthoringPrompt, setFastAuthoringPrompt] = useState("");
  const [jevBusy, setJevBusy] = useState(false);
  const [jevMessage, setJevMessage] = useState<string | null>(null);
  const [jevError, setJevError] = useState<string | null>(null);
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

  useEffect(() => {
    if (!nativeAvailable) return;
    let active = true;
    void tauri
      .getJevStatus()
      .then((status) => {
        if (active) setJevStatus(status);
      })
      .catch((cause) => {
        if (active) setJevError(String(cause));
      });
    return () => {
      active = false;
    };
  }, [nativeAvailable]);

  const saveJevApiKey = async () => {
    if (!jevApiKey.trim()) return;
    setJevBusy(true);
    setJevError(null);
    setJevMessage(null);
    try {
      const status = await tauri.setJevApiKey(jevApiKey);
      setJevStatus(status);
      setJevApiKey("");
      setJevMessage("APIキーを保存しました");
    } catch (cause) {
      setJevError(String(cause));
    } finally {
      setJevBusy(false);
    }
  };

  const testJevConnection = async () => {
    setJevBusy(true);
    setJevError(null);
    setJevMessage(null);
    try {
      const result = await tauri.testJevConnection();
      setJevMessage(result.message);
    } catch (cause) {
      setJevError(String(cause));
    } finally {
      setJevBusy(false);
    }
  };

  const clearJevApiKey = async () => {
    setJevBusy(true);
    setJevError(null);
    setJevMessage(null);
    try {
      const status = await tauri.clearJevApiKey();
      setJevStatus(status);
      setJevMessage("APIキーを削除しました");
    } catch (cause) {
      setJevError(String(cause));
    } finally {
      setJevBusy(false);
    }
  };

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
        ワールドは一度で完成させなくて大丈夫です。新しく作る・一角を足す・壊れたところを直す・見た目を仕上げる・軽くする、を同じ入力欄から繰り返せます。
      </p>
      <section aria-labelledby="jev-heading">
        <h3
          id="jev-heading"
          className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
        >
          ワールドを作る・直す
        </h3>
        <div className="space-y-2.5 rounded-md border border-violet-200 bg-violet-50/40 p-2.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-slate-900">Jev Fast Authoring</p>
              <p className="mt-0.5 text-[11px] leading-4 text-slate-600">
                Jevが「新規作成・追加・修復・仕上げ・最適化」と変更範囲を判断します。局所修正ではTerrainや空などWorld全体の設定を保持します。
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                jevStatus?.configured
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {jevStatus?.configured ? "利用できます" : "接続設定が必要"}
            </span>
          </div>

          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-violet-950">
              やりたいこと
            </span>
            <textarea
              value={fastAuthoringPrompt}
              disabled={
                fastAuthoringState.status === "deciding" ||
                fastAuthoringState.status === "applying" ||
                fastAuthoringState.status === "checking"
              }
              onChange={(event) => setFastAuthoringPrompt(event.target.value)}
              placeholder="例: 夜の山に焚き火の休憩所を足して / 選択中の建物の見た目が浮いているので直して / 木が多すぎるので軽くして"
              rows={4}
              className="w-full resize-none rounded-md border border-violet-200 bg-white px-2.5 py-2 text-xs leading-5 text-slate-800 focus:border-brand-500 focus:outline-none disabled:bg-slate-100"
            />
          </label>
          <button
            type="button"
            disabled={
              !jevStatus?.configured ||
              !fastAuthoringPrompt.trim() ||
              Boolean(fastAuthoringDisabledReason) ||
              fastAuthoringState.status === "deciding" ||
              fastAuthoringState.status === "applying" ||
              fastAuthoringState.status === "checking"
            }
            onClick={() => void onRunFastAuthoring(fastAuthoringPrompt.trim())}
            className="w-full rounded-md bg-brand-600 px-3 py-2 font-semibold text-white hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-500"
          >
            {fastAuthoringState.status === "deciding"
              ? "構成を決めています"
              : fastAuthoringState.status === "applying"
                ? "ワールドを作成中"
                : fastAuthoringState.status === "checking"
                  ? "仕上がりを確認中"
                  : "作る・直す"}
          </button>
          {!jevStatus?.configured ? (
            <p className="text-[11px] leading-4 text-amber-700">
              下の「Jev接続設定」でTypeSafe APIキーを設定すると使えます。
            </p>
          ) : null}
          {fastAuthoringDisabledReason ? (
            <p className="text-[11px] leading-4 text-amber-700">
              {fastAuthoringDisabledReason}
            </p>
          ) : null}

          {fastAuthoringState.status !== "idle" ? (
            <div
              className={
                fastAuthoringState.status === "error"
                  ? "rounded border border-rose-200 bg-rose-50 p-2"
                  : fastAuthoringState.status === "clarify"
                    ? "rounded border border-amber-200 bg-amber-50 p-2"
                    : "rounded border border-violet-200 bg-white p-2"
              }
            >
              <p className="text-[11px] font-semibold text-slate-800">
                {fastAuthoringState.message}
              </p>
              {fastAuthoringState.trace.length > 0 ? (
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[10px] leading-4">
                  {fastAuthoringState.trace.map((item) => (
                    <div key={item.label} className="contents">
                      <dt className="font-semibold text-slate-500">
                        {item.label}
                      </dt>
                      <dd className="min-w-0 truncate text-slate-700">
                        {item.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {fastAuthoringState.applied.length > 0 ? (
                <p className="mt-2 text-[10px] leading-4 text-slate-500">
                  {fastAuthoringState.applied.join(" → ")}
                </p>
              ) : null}
              {fastAuthoringState.checks &&
              fastAuthoringState.checks.length > 0 ? (
                <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2">
                  <p className="text-[10px] font-semibold text-slate-600">
                    自動チェック
                  </p>
                  <ul className="mt-1 space-y-1 text-[10px] leading-4">
                    {fastAuthoringState.checks.map((check) => (
                      <li key={check.id} className="flex items-start gap-1.5">
                        <span
                          className={
                            check.status === "ok"
                              ? "font-semibold text-emerald-700"
                              : "font-semibold text-amber-700"
                          }
                        >
                          {check.status === "ok" ? "OK" : "確認"}
                        </span>
                        <span className="min-w-0 text-slate-600">
                          <span className="font-semibold">{check.label}: </span>
                          {check.message}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {fastAuthoringState.spawnPreviewDataUrl ? (
                <div className="mt-2">
                  <p className="mb-1 text-[10px] font-semibold text-slate-500">
                    Spawnから
                  </p>
                  <img
                    src={fastAuthoringState.spawnPreviewDataUrl}
                    alt="Spawnから見た生成後のScene View"
                    className="w-full rounded border border-slate-200 bg-slate-950 object-cover"
                  />
                </div>
              ) : null}
              {fastAuthoringState.previewDataUrl ? (
                <div className="mt-2">
                  <p className="mb-1 text-[10px] font-semibold text-slate-500">
                    俯瞰
                  </p>
                  <img
                    src={fastAuthoringState.previewDataUrl}
                    alt="俯瞰で見た生成後のScene View"
                    className="w-full rounded border border-slate-200 bg-slate-950 object-cover"
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          <details
            open={!jevStatus?.configured}
            className="rounded-md border border-slate-200 bg-white p-2"
          >
            <summary className="cursor-pointer select-none text-[11px] font-semibold text-slate-700">
              Jev接続設定
            </summary>
            <div className="mt-2 space-y-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                  TypeSafe APIキー
                </span>
                <input
                  type="password"
                  value={jevApiKey}
                  autoComplete="off"
                  disabled={jevBusy}
                  onChange={(event) => setJevApiKey(event.target.value)}
                  placeholder={jevStatus?.configured ? "新しいキーに変更" : "APIキーを入力"}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-800 focus:border-brand-500 focus:outline-none disabled:bg-slate-100"
                />
              </label>
              <button
                type="button"
                disabled={jevBusy || !jevApiKey.trim()}
                onClick={() => void saveJevApiKey()}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400"
              >
                {jevBusy
                  ? "処理中"
                  : jevStatus?.configured
                    ? "APIキーを更新"
                    : "APIキーを保存"}
              </button>
              {jevStatus?.configured ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={jevBusy}
                    onClick={() => void testJevConnection()}
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    接続確認
                  </button>
                  <button
                    type="button"
                    disabled={jevBusy}
                    onClick={() => void clearJevApiKey()}
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                  >
                    キーを削除
                  </button>
                </div>
              ) : null}
              <p className="text-[10px] leading-4 text-slate-500">
                APIキーはデスクトップ版のローカル設定に保存し、WebViewやMCP応答には返しません。モデルは {jevStatus?.model ?? "jev-latest"} を使います。
              </p>
              {jevMessage ? (
                <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-[11px] text-emerald-800">
                  {jevMessage}
                </p>
              ) : null}
              {jevError ? (
                <p
                  role="alert"
                  className="rounded border border-rose-200 bg-rose-50 p-2 text-[11px] text-rose-700"
                >
                  {jevError}
                </p>
              ) : null}
            </div>
          </details>
        </div>
      </section>

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
              AIクライアントの情報を取得できませんでした。再検出してください。
            </p>
          ) : null}
        </div>
        <p className="mt-2 text-[11px] leading-4 text-slate-500">
          登録後はAIクライアントを再起動するか、MCPを再読み込みしてください。Claude Desktop / Coworkではローカルセッションで利用できます。リモートのCoworkでは利用できません。
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
                Ollamaをインストールして再検出すると、対応するAIクライアントでローカルモデルを使えます。
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
                  {ollama.models.length}モデル
                </span>
              </div>

              {!ollama.serverReachable ? (
                <p className="rounded border border-amber-200 bg-amber-50 p-2 text-[11px] leading-4 text-amber-800">
                  Ollamaが起動していません。Ollamaアプリを起動してから再検出してください。
                </p>
              ) : !ollama.launchSupported ? (
                <p className="rounded border border-amber-200 bg-amber-50 p-2 text-[11px] leading-4 text-amber-800">
                  このバージョンは自動設定に対応していません。Ollamaを更新して再検出してください。
                </p>
              ) : ollama.models.length === 0 ? (
                <p className="rounded border border-slate-200 bg-slate-50 p-2 text-[11px] leading-4 text-slate-600">
                  Ollamaを起動し、先に使うモデルを追加してから再検出してください。
                </p>
              ) : (
                <>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                      ローカルモデル
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
                      設定するAIクライアント
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
                      Codex、Claude Code、OpenCodeのいずれかを先にインストールしてください。
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
                      ? "MCPとモデルを設定中"
                      : "XRift MCPとOllamaを設定"}
                  </button>
                  <p className="text-[10px] leading-4 text-slate-500">
                    選んだモデルがツール呼び出しに対応しているか確認し、MCPとモデルを設定します。モデルのダウンロードやAIクライアントの起動は行いません。
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
                  {ollamaResult.integrationLabel}を{ollamaResult.model}で使うように設定しました。AIクライアントを起動または再起動してください。
                </p>
              ) : null}
            </div>
          )}
        </div>
        <p className="mt-2 text-[11px] leading-4 text-slate-500">
          シーンを操作するには、設定したAIクライアントで指示してください。
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
            disabled={loading || ollamaConfiguring}
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
