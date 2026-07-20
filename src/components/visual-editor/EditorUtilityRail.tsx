import { useEffect, useMemo, useRef, useState } from "react";
import {
  shortcutForCommand,
  type EditorCommandDefinition,
} from "../../lib/visual-editor";
import { EDITOR_ICONS } from "./editor-icons";

type UtilityPanel = "shortcuts" | "help" | null;

const CATEGORY_LABELS: Record<EditorCommandDefinition["category"], string> = {
  project: "プロジェクト",
  edit: "編集",
  view: "表示",
  transform: "変形",
  play: "Play",
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
  icon: "keyboard" | "help" | "settings";
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
      className={`flex size-9 items-center justify-center rounded-md border shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
        active
          ? "border-violet-500 bg-violet-600 text-white"
          : "border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-100 hover:text-slate-900"
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
}: {
  commands: readonly EditorCommandDefinition[];
  sceneSettingsOpen: boolean;
  onToggleSceneSettings: () => void;
  onResetLayout: () => void;
}) {
  const [openPanel, setOpenPanel] = useState<UtilityPanel>(null);
  const railRef = useRef<HTMLElement>(null);
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
    const handlePointerDown = (event: PointerEvent) => {
      if (!railRef.current?.contains(event.target as Node)) setOpenPanel(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenPanel(null);
    };
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [openPanel]);

  const togglePanel = (panel: Exclude<UtilityPanel, null>) => {
    setOpenPanel((current) => (current === panel ? null : panel));
  };

  return (
    <nav
      ref={railRef}
      aria-label="エディターのヘルプと設定"
      className="absolute bottom-3 left-3 z-50 flex flex-col gap-1.5 rounded-lg border border-slate-300/90 bg-slate-100/95 p-1.5 shadow-md backdrop-blur"
    >
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
          className="absolute bottom-0 left-[calc(100%+0.5rem)] w-80 overflow-hidden rounded-lg border border-slate-300 bg-white text-slate-800 shadow-xl"
        >
          <div className="flex h-11 items-center justify-between border-b border-slate-200 px-3.5">
            <h2
              id={`editor-${openPanel}-heading`}
              className="text-sm font-semibold text-slate-900"
            >
              {openPanel === "shortcuts" ? "ショートカットキー" : "エディターの使い方"}
            </h2>
            <button
              type="button"
              aria-label="パネルを閉じる"
              title="閉じる"
              onClick={() => setOpenPanel(null)}
              className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              <EDITOR_ICONS.close size={16} aria-hidden="true" />
            </button>
          </div>

          {openPanel === "shortcuts" ? (
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
              <ol className="space-y-2.5">
                <li>
                  <span className="font-semibold text-slate-800">1. 作る</span>
                  <p>上の「Create」から、EntityやPrimitiveをシーンへ追加します。</p>
                </li>
                <li>
                  <span className="font-semibold text-slate-800">2. 選ぶ</span>
                  <p>HierarchyまたはScene Viewで選び、右のInspectorで調整します。</p>
                </li>
                <li>
                  <span className="font-semibold text-slate-800">3. 素材を使う</span>
                  <p>AssetsのModelやMaterialをScene Viewへドラッグして配置します。</p>
                </li>
                <li>
                  <span className="font-semibold text-slate-800">4. 確認する</span>
                  <p>「Play」で動作を確認し、停止すると編集位置へ戻ります。</p>
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
                  パネルが狭くなったり画面外へ寄ったときに使います。
                </p>
              </div>
            </div>
          )}
        </section>
      ) : null}
    </nav>
  );
}
