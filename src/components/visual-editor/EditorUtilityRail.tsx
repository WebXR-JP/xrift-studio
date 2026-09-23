import { useEffect, useRef, useState } from "react";
import { EDITOR_ICONS } from "./editor-icons";
import {
  AiConnectionPanel,
  type XriftMcpActivity,
} from "./AiConnectionPanel";
import type {
  XriftMcpClientId,
  XriftMcpClientStatus,
} from "../../lib/tauri";

type UtilityPanel = "ai" | null;

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
  icon: "ai" | "settings";
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
  sceneSettingsOpen,
  onToggleSceneSettings,
  mcpNativeAvailable,
  mcpClients,
  mcpLoading,
  mcpRegisteringClientId,
  mcpError,
  mcpLastActivity,
  canUndo,
  onOpenMcp,
  onRefreshMcp,
  onRegisterMcpClient,
  onUndo,
}: {
  sceneSettingsOpen: boolean;
  onToggleSceneSettings: () => void;
  mcpNativeAvailable: boolean;
  mcpClients: readonly XriftMcpClientStatus[];
  mcpLoading: boolean;
  mcpRegisteringClientId: XriftMcpClientId | null;
  mcpError: string | null;
  mcpLastActivity: XriftMcpActivity;
  canUndo: boolean;
  onOpenMcp: () => void;
  onRefreshMcp: () => void;
  onRegisterMcpClient: (clientId: XriftMcpClientId) => void;
  onUndo: () => void;
}) {
  const [openPanel, setOpenPanel] = useState<UtilityPanel>(null);
  const railRef = useRef<HTMLElement>(null);
  const panelTriggerRef = useRef<HTMLElement | null>(null);
  const closePanel = () => {
    setOpenPanel(null);
    panelTriggerRef.current?.focus();
  };
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
      aria-label="エディターのツールと設定"
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
              AI接続
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

          <AiConnectionPanel
            nativeAvailable={mcpNativeAvailable}
            clients={mcpClients}
            loading={mcpLoading}
            registeringClientId={mcpRegisteringClientId}
            error={mcpError}
            lastActivity={mcpLastActivity}
            canUndo={canUndo}
            onRefresh={onRefreshMcp}
            onRegister={onRegisterMcpClient}
            onUndo={onUndo}
          />
        </section>
      ) : null}
    </nav>
  );
}
