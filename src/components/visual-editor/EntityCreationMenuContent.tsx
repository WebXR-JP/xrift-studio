import { useState, type ReactNode } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { type EntityCreationMenuEntry } from "../../lib/visual-editor/entity-creation-menu";
import { EDITOR_ICONS, getEditorComponentIcon } from "./editor-icons";

export function EntityCreationMenuContent({ entries, disabled, onSelect }: {
  entries: readonly EntityCreationMenuEntry[];
  disabled: boolean;
  onSelect: (entry: EntityCreationMenuEntry) => void;
}) {
  return <div className="space-y-1">
    {(["Entity", "Primitive", "World", "Light", "UI", "Audio", "Effect", "XRift"] as const).map((group) => {
      const items = entries.filter((entry) => entry.group === group);
      if (!items.length) return null;
      const rows = items.map((entry) => <MenuItem
        key={entry.id}
        icon={entry.component ? getEditorComponentIcon(entry.component)
          : entry.xrift ? EDITOR_ICONS[entry.xrift.icon]
            : entry.kind === "empty" ? EDITOR_ICONS.sceneEntity : EDITOR_ICONS.primitive}
        label={entry.label}
        detail={entry.hint}
        title={entry.description || entry.label}
        disabled={disabled}
        trailing="作成"
        onClick={() => onSelect(entry)}
      />);
      return <MenuSection key={group} label={group} collapsible count={items.length}>{rows}</MenuSection>;
    })}
  </div>;
}

function MenuSection({
  label,
  collapsible = false,
  count,
  defaultOpen = false,
  children,
}: {
  label: string;
  collapsible?: boolean;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (collapsible) {
    return (
      <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
        >
          <ChevronRight
            size={13}
            className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {typeof count === "number" ? (
            <span className="text-[10px] tabular-nums text-slate-400">{count}</span>
          ) : null}
        </button>
        {open ? <div className="space-y-0.5 border-t border-slate-100 p-1">{children}</div> : null}
      </section>
    );
  }
  return (
    <section>
      <h3 className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </h3>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function MenuItem({
  icon: Icon,
  label,
  detail,
  title,
  trailing,
  disabled = false,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  detail?: string;
  title?: string;
  trailing?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-violet-50 hover:text-violet-800 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        {detail ? (
          <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">
            {detail}
          </span>
        ) : null}
      </span>
      {trailing ? (
        <span className="shrink-0 text-[10px] font-medium text-slate-400">
          {trailing}
        </span>
      ) : null}
    </button>
  );
}
