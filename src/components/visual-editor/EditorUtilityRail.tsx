import { GuideLink } from "../guide/GuideLink";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  shortcutForCommand,
  type EditorCommandDefinition,
} from "../../lib/visual-editor";
import { EDITOR_ICONS } from "./editor-icons";
import {
  AiConnectionPanel,
  type XriftMcpActivity,
} from "./AiConnectionPanel";
import { RecordingPanel, type RecordingPanelProps } from "./RecordingPanel";
import { isRecordingActive } from "../../lib/recording/recording-state";
import { useRecordingSelector } from "./useRecordingSession";
import type {
  XriftMcpClientId,
  XriftMcpClientStatus,
  XriftOllamaConfigurationResult,
  XriftOllamaIntegrationId,
  XriftOllamaStatus,
} from "../../lib/tauri";

type UtilityPanel = "ai" | "recording" | "shortcuts" | "help" | null;

const CATEGORY_LABELS: Record<EditorCommandDefinition["category"], string> = {
  project: "プロジェクト",
  edit: "編集",
  view: "表示",
  transform: "変形",
  play: "動作確認",
};

function UtilityButton({
  label,
  active = false,
  expanded,
  icon,
  onClick,
}: {
  label: string;
  active?: boolean;
  expanded?: boolean;
  icon: "ai" | "record" | "keyboard" | "help" | "report" | "settings";
  onClick: () => void;
}) {
  const Icon = EDITOR_ICONS[icon];
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={icon === "settings" ? active : undefined}
      aria-expanded={expanded}
      title={label}
      onClick={onClick}
      className={`flex size-8 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
        active
          ? "bg-brand-600 text-white"
          : "text-editor-muted hover:bg-editor-subtle hover:text-editor-text"
      }`}
    >
      <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}

export function EditorUtilityRail({
  commands,
  sceneSettingsOpen,
  onToggleSceneSettings,
  onResetLayout,
  mcpNativeAvailable,
  mcpClients,
  mcpLoading,
  mcpRegisteringClientId,
  mcpError,
  ollamaStatus,
  ollamaConfiguring,
  ollamaError,
  ollamaResult,
  mcpLastActivity,
  canUndo,
  onOpenMcp,
  onRefreshMcp,
  onRegisterMcpClient,
  onConfigureOllama,
  onUndo,
  onOpenSupport,
  onInspectDocument,
  recording,
}: {
  commands: readonly EditorCommandDefinition[];
  sceneSettingsOpen: boolean;
  onToggleSceneSettings: () => void;
  onResetLayout: () => void;
  mcpNativeAvailable: boolean;
  mcpClients: readonly XriftMcpClientStatus[];
  mcpLoading: boolean;
  mcpRegisteringClientId: XriftMcpClientId | null;
  mcpError: string | null;
  ollamaStatus: XriftOllamaStatus | null;
  ollamaConfiguring: boolean;
  ollamaError: string | null;
  ollamaResult: XriftOllamaConfigurationResult | null;
  mcpLastActivity: XriftMcpActivity;
  canUndo: boolean;
  onOpenMcp: () => void;
  onRefreshMcp: () => void;
  onRegisterMcpClient: (clientId: XriftMcpClientId) => void;
  onConfigureOllama: (
    integrationId: XriftOllamaIntegrationId,
    model: string,
  ) => void;
  onUndo: () => void;
  onOpenSupport: () => void;
  onInspectDocument?: () => void;
  /** The recording controls; omitted where recording is unavailable. */
  recording?: RecordingPanelProps;
}) {
  const [openPanel, setOpenPanel] = useState<UtilityPanel>(null);
  const recordingActive = useRecordingSelector((state) =>
    isRecordingActive(state.snapshot),
  );
  const railRef = useRef<HTMLElement>(null);
  const panelTriggerRef = useRef<HTMLElement | null>(null);
  const closePanel = () => {
    setOpenPanel(null);
    panelTriggerRef.current?.focus();
  };
  const shortcutGroups = useMemo(
    () =>
      Object.entries(CATEGORY_LABELS).flatMap(([category, label]) => {
        const items = commands.flatMap((command) => {
          if (command.category !== category) return [];
          const shortcut = shortcutForCommand(command.id, commands);
          return shortcut ? [{ ...command, shortcut }] : [];
        });
        return items.length > 0 ? [{ category, label, items }] : [];
      }),
    [commands],
  );

  useEffect(() => {
    if (!openPanel) return;
    railRef.current?.querySelector<HTMLButtonElement>('[aria-label="パネルを閉じる"]')?.focus();
    const handlePointerDown = (event: PointerEvent) => {
      if (!railRef.current?.contains(event.target as Node)) setOpenPanel(null);
    };
    window.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [openPanel]);

  const togglePanel = (panel: Exclude<UtilityPanel, null>) => {
    panelTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpenPanel((current) => (current === panel ? null : panel));
  };

  return (
    <nav
      ref={railRef}
      aria-label="エディターのヘルプと設定"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !openPanel) return;
        event.preventDefault();
        event.stopPropagation();
        closePanel();
      }}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpenPanel(null);
      }}
      className="editor-utility-rail relative flex shrink-0 items-center gap-0.5 bg-editor-surface p-1"
    >
      {onInspectDocument ? <button type="button" onClick={() => { setOpenPanel(null); onInspectDocument(); }}
        title="シーンとAssetsの参照・設定を確認します" className="h-8 shrink-0 rounded px-2 text-xs font-semibold text-editor-text hover:bg-editor-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">制作データの確認</button> : null}
      <GuideLink page="first-world" label="使い方" />
      <UtilityButton
        label="AI接続"
        icon="ai"
        active={openPanel === "ai"}
        expanded={openPanel === "ai"}
        onClick={() => {
          if (openPanel !== "ai") onOpenMcp();
          togglePanel("ai");
        }}
      />
      {recording ? (
        <UtilityButton
          label={recordingActive ? "録画（録画中）" : "録画"}
          icon="record"
          active={openPanel === "recording" || recordingActive}
          expanded={openPanel === "recording"}
          onClick={() => togglePanel("recording")}
        />
      ) : null}
      <UtilityButton
        label="ショートカットキー一覧"
        icon="keyboard"
        active={openPanel === "shortcuts"}
        expanded={openPanel === "shortcuts"}
        onClick={() => togglePanel("shortcuts")}
      />
      <UtilityButton
        label="エディターのヘルプ"
        icon="help"
        active={openPanel === "help"}
        expanded={openPanel === "help"}
        onClick={() => togglePanel("help")}
      />
      <UtilityButton
        label="ヘルプと報告"
        icon="report"
        onClick={() => {
          setOpenPanel(null);
          onOpenSupport();
        }}
      />
      <UtilityButton
        label={sceneSettingsOpen ? "シーン設定を閉じる" : "シーン設定を開く"}
        icon="settings"
        active={sceneSettingsOpen}
        onClick={() => {
          setOpenPanel(null);
          onToggleSceneSettings();
        }}
      />

      {openPanel ? (
        <section
          role="dialog"
          aria-labelledby={`editor-${openPanel}-heading`}
          className="absolute bottom-[calc(100%+0.5rem)] left-0 max-h-[calc(100dvh-5rem)] w-80 max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-lg border border-editor-border bg-editor-surface text-editor-text shadow-xl"
        >
          <div className="sticky top-0 z-10 flex h-11 shrink-0 items-center justify-between border-b border-slate-200 bg-editor-surface px-3.5">
            <h2
              id={`editor-${openPanel}-heading`}
              className="text-sm font-semibold text-slate-900"
            >
              {openPanel === "ai"
                ? "AI接続"
                : openPanel === "recording"
                  ? "録画"
                  : openPanel === "shortcuts"
                    ? "ショートカットキー"
                    : "エディターの使い方"}
            </h2>
            <button
              type="button"
              aria-label="パネルを閉じる"
              title="閉じる"
              onClick={closePanel}
              className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              <EDITOR_ICONS.close size={16} aria-hidden="true" />
            </button>
          </div>

          {openPanel === "ai" ? (
            <AiConnectionPanel
              nativeAvailable={mcpNativeAvailable}
              clients={mcpClients}
              loading={mcpLoading}
              registeringClientId={mcpRegisteringClientId}
              error={mcpError}
              ollama={ollamaStatus}
              ollamaConfiguring={ollamaConfiguring}
              ollamaError={ollamaError}
              ollamaResult={ollamaResult}
              lastActivity={mcpLastActivity}
              canUndo={canUndo}
              onRefresh={onRefreshMcp}
              onRegister={onRegisterMcpClient}
              onConfigureOllama={onConfigureOllama}
              onUndo={onUndo}
            />
          ) : openPanel === "recording" && recording ? (
            <RecordingPanel {...recording} />
          ) : openPanel === "shortcuts" ? (
            <div className="scrollbar-thin max-h-[min(28rem,calc(100vh-10rem))] space-y-4 overflow-y-auto p-3.5">
              {shortcutGroups.map((group) => (
                <section key={group.category} aria-labelledby={`shortcut-${group.category}`}>
                  <h3
                    id={`shortcut-${group.category}`}
                    className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                  >
                    {group.label}
                  </h3>
                  <dl className="space-y-1">
                    {group.items.map((command) => (
                      <div
                        key={command.id}
                        className="flex items-center justify-between gap-3 rounded px-2 py-1.5 text-xs hover:bg-slate-50"
                      >
                        <dt className="min-w-0 truncate text-slate-700">{command.label}</dt>
                        <dd>
                          <kbd className="whitespace-nowrap rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700 shadow-sm">
                            {command.shortcut}
                          </kbd>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          ) : (
            <div className="space-y-4 p-3.5 text-xs leading-5 text-slate-600">
              <div className="flex flex-col items-start gap-1">
                <GuideLink page="editor-basics" label="画面と視点操作の使い方" />
                <GuideLink page="materials" label="色と質感の変え方" />
                <GuideLink page="save-and-open" label="保存して再開する方法" />
              </div>
              <ol className="space-y-2.5">
                <li>
                  <span className="font-semibold text-slate-800">1. 作る</span>
                  <p>上部の「素材を追加 → Entityを作成」からEntityや図形を配置します。</p>
                </li>
                <li>
                  <span className="font-semibold text-slate-800">2. 選ぶ</span>
                  <p>Hierarchyやシーンで選び、Inspectorで調整します。</p>
                </li>
                <li>
                  <span className="font-semibold text-slate-800">3. 素材を使う</span>
                  <p>Assetsからモデルを配置し、マテリアルを割り当てます。</p>
                </li>
                <li>
                  <span className="font-semibold text-slate-800">4. 確認する</span>
                  <p>「Play」で試し、終わったら「Stop」を押します。</p>
                </li>
              </ol>
              <div className="border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    onResetLayout();
                    setOpenPanel(null);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <EDITOR_ICONS.layout size={14} aria-hidden="true" />
                  パネル配置を初期化
                </button>
                <p className="mt-1.5 text-[11px] leading-4 text-slate-500">
                  パネルの大きさと位置を元に戻します。
                </p>
              </div>
            </div>
          )}
        </section>
      ) : null}
    </nav>
  );
}
