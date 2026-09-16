import { CREATION_CATEGORY_LABELS, matchesEditorMenuQuery } from "../../lib/visual-editor/editor-menu-search";
import type { ReactNode } from "react";
import { type EntityCreationMenuEntry } from "../../lib/visual-editor/entity-creation-menu";
import { EDITOR_ICONS, getEditorComponentIcon } from "./editor-icons";
import { EditorMenuItem, EditorMenuSection } from "./EditorMenu";

export function EntityCreationMenuContent({ entries, disabled, onSelect, worldContent, query = "" }: {
  entries: readonly EntityCreationMenuEntry[];
  disabled: boolean;
  onSelect: (entry: EntityCreationMenuEntry) => void;
  worldContent?: ReactNode;
  query?: string;
}) {
  return <>
    {(["Entity", "Primitive", "World", "Light", "UI", "Audio", "Effect", "XRift"] as const).map((group) => {
      const items = entries.filter((entry) => entry.group === group && matchesEditorMenuQuery(query, entry.label, entry.description, entry.id, group, CREATION_CATEGORY_LABELS[group], entry.hint ?? ""));
      const extra = group === "World" ? worldContent : null;
      if (!items.length && !extra) return null;
      const content = <>
        {items.map((entry) => <EditorMenuItem
          key={entry.id}
          icon={entry.component ? getEditorComponentIcon(entry.component)
            : entry.xrift ? EDITOR_ICONS[entry.xrift.icon]
              : entry.kind === "empty" ? EDITOR_ICONS.sceneEntity : EDITOR_ICONS.primitive}
          label={entry.label}
          detail={entry.hint}
          title={entry.description || entry.label}
          disabled={disabled}
          onClick={() => onSelect(entry)}
        />)}
        {extra}
      </>;
      return query.trim() ? <section key={group} aria-label={CREATION_CATEGORY_LABELS[group]}>
        <p className="px-2 pt-2 pb-1 text-[11px] font-semibold text-slate-500">{CREATION_CATEGORY_LABELS[group]}</p>{content}
      </section> : <EditorMenuSection key={group} label={CREATION_CATEGORY_LABELS[group]} count={extra ? undefined : items.length}>{content}</EditorMenuSection>;
    })}
  </>;
}
