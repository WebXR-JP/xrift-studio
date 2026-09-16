import { useEffect, useId, useRef, useState } from "react";
import { ENTITY_MIRROR_AXES, type EntityMirrorAxis } from "../../lib/visual-editor/entity-clipboard";
import { EDITOR_ICONS } from "./editor-icons";

export const ENTITY_CONTEXT_ITEM_CLASS =
  "flex min-h-7 w-full items-center gap-2 rounded px-2 py-1 text-left text-xs text-slate-700 hover:bg-violet-50 hover:text-violet-800 focus-visible:bg-violet-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-violet-300 disabled:cursor-not-allowed disabled:opacity-45";

/** One paste surface shared by the Scene View and Hierarchy context menus. */
export function EntityPasteMenuItems({
  disabledReason,
  shortcut,
  onPaste,
}: {
  disabledReason: string | null;
  shortcut?: string;
  onPaste: (axis?: EntityMirrorAxis) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const submenuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (expanded && !disabledReason) submenuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [expanded, disabledReason]);
  const collapse = () => {
    setExpanded(false);
    triggerRef.current?.focus();
  };
  return (
    <>
      <button
        type="button"
        role="menuitem"
        disabled={Boolean(disabledReason)}
        title={disabledReason ?? "コピーしたEntityを貼り付け"}
        onClick={() => onPaste()}
        className={ENTITY_CONTEXT_ITEM_CLASS}
      >
        <EDITOR_ICONS.paste size={14} aria-hidden="true" />
        <span className="flex-1">貼り付け</span>
        {shortcut ? <span className="text-[10px] text-slate-400" aria-hidden="true">{shortcut}</span> : null}
      </button>
      <button
        ref={triggerRef}
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={expanded && !disabledReason}
        aria-controls={expanded && !disabledReason ? submenuId : undefined}
        disabled={Boolean(disabledReason)}
        title={disabledReason ?? "反転する軸を選んで貼り付け"}
        onClick={() => setExpanded((current) => !current)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
          event.preventDefault();
          event.stopPropagation();
          setExpanded(event.key === "ArrowRight");
        }}
        className={ENTITY_CONTEXT_ITEM_CLASS}
      >
        <EDITOR_ICONS.axis size={14} aria-hidden="true" />
        <span className="flex-1">反転して貼り付け</span>
        {expanded ? <EDITOR_ICONS.expanded size={12} aria-hidden="true" /> : <EDITOR_ICONS.collapsed size={12} aria-hidden="true" />}
      </button>
      {expanded && !disabledReason ? (
        <div
          id={submenuId}
          ref={submenuRef}
          role="menu"
          aria-label="反転する軸"
          className="ml-4 border-l border-slate-200 pl-1"
          onKeyDown={(event) => {
            if (event.key === "Escape" || event.key === "ArrowLeft") {
              event.preventDefault();
              event.stopPropagation();
              collapse();
              return;
            }
            if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            event.stopPropagation();
            const items = Array.from(submenuRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
            const current = items.indexOf(document.activeElement as HTMLButtonElement);
            const index = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
              : (current + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
            items[index]?.focus();
          }}
        >
          {ENTITY_MIRROR_AXES.map((axis) => (
            <button
              key={axis}
              type="button"
              role="menuitem"
              aria-label={`${axis.toUpperCase()}軸に反転して貼り付け`}
              title={`各Entityのローカル${axis.toUpperCase()}軸を反転。位置と回転は変えません`}
              onClick={() => onPaste(axis)}
              className={ENTITY_CONTEXT_ITEM_CLASS}
            >
              {axis.toUpperCase()}軸
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
