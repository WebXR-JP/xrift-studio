import { createContext, useContext, useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";

// Each group opens one branch at a time. Nested categories get their own group.
const MenuGroupContext = createContext<{
  openSection: string | null;
  setOpenSection: (section: string | null) => void;
} | null>(null);

export function EditorMenuGroup({ children }: { children: ReactNode }) {
  const [openSection, setOpenSection] = useState<string | null>(null);
  return <MenuGroupContext.Provider value={{ openSection, setOpenSection }}>
    {children}
  </MenuGroupContext.Provider>;
}

export const EDITOR_MENU_ROW_CLASS = "flex min-h-7 w-full min-w-0 items-center gap-2 rounded px-2 py-1 text-left text-xs leading-5 text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-300 disabled:cursor-not-allowed disabled:opacity-45";

export function EditorMenuSection({ label, icon: Icon, count, children }: {
  label: string;
  icon?: LucideIcon;
  count?: number;
  children: ReactNode;
}) {
  const id = useId();
  const group = useContext(MenuGroupContext);
  const [localOpen, setLocalOpen] = useState(false);
  const open = group ? group.openSection === id : localOpen;
  return <section data-editor-menu-section={label}>
    <button
      type="button"
      title={label}
      aria-expanded={open}
      aria-controls={open ? `${id}-content` : undefined}
      onClick={() => group ? group.setOpenSection(open ? null : id) : setLocalOpen(!open)}
      className={EDITOR_MENU_ROW_CLASS}
    >
      {Icon ? <Icon size={14} className="shrink-0" aria-hidden="true" /> : null}
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      {typeof count === "number" ? <span className="shrink-0 text-[11px] tabular-nums text-slate-400">{count}</span> : null}
      <ChevronRight size={14} className={`shrink-0 text-slate-400 ${open ? "rotate-90" : ""}`} aria-hidden="true" />
    </button>
    {open ? <div id={`${id}-content`} className="ml-3 border-l border-slate-200 pl-1">
      <EditorMenuGroup>{children}</EditorMenuGroup>
    </div> : null}
  </section>;
}

export function EditorMenuItem({ icon: Icon, label, detail, title, disabled = false, onClick }: {
  icon?: LucideIcon;
  label: string;
  /** Only a prerequisite/disabled reason belongs on a second line, not a repeated action. */
  detail?: string;
  title?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return <button type="button" disabled={disabled} title={title ?? detail ?? label} onClick={onClick} className={EDITOR_MENU_ROW_CLASS}>
    {Icon ? <Icon size={14} className="shrink-0" aria-hidden="true" /> : null}
    <span className="min-w-0 flex-1">
      <span className="block truncate">{label}</span>
      {detail ? <span className="block whitespace-normal text-[11px] leading-4 text-slate-500">{detail}</span> : null}
    </span>
  </button>;
}

/** Keep arrow navigation inside the visible branch without hijacking form controls. */
export function handleEditorMenuKeyDown(event: KeyboardEvent<HTMLElement>) {
  if (!(event.target instanceof HTMLElement) || event.target.closest("input, select, textarea, [contenteditable=true]")) return;
  const root = event.currentTarget;
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"))
    .filter((button) => button.getClientRects().length > 0);
  if (!buttons.length) return;
  const active = document.activeElement;
  const index = buttons.findIndex((button) => button === active);
  let next: HTMLButtonElement | undefined;
  if (event.key === "ArrowDown") next = buttons[(index + 1) % buttons.length];
  else if (event.key === "ArrowUp") next = buttons[(index <= 0 ? buttons.length : index) - 1];
  else if (event.key === "Home") next = buttons[0];
  else if (event.key === "End") next = buttons[buttons.length - 1];
  else if (event.key === "ArrowRight" && active instanceof HTMLButtonElement && active.getAttribute("aria-expanded") === "false") {
    active.click();
    next = active;
  } else if (event.key === "ArrowLeft" && active instanceof HTMLElement) {
    const section = active.closest("[data-editor-menu-section]");
    const toggle = section?.querySelector<HTMLButtonElement>(":scope > button");
    if (toggle?.getAttribute("aria-expanded") === "true") {
      toggle.click();
      next = toggle;
    }
  }
  if (!next) return;
  event.preventDefault();
  event.stopPropagation();
  next.focus();
}
