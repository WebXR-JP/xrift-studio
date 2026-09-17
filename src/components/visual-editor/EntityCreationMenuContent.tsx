import { matchesEditorSearch, ENTITY_CREATION_GROUP_LABELS } from "../../lib/visual-editor/editor-menu-search";
import type { ReactNode } from "react";
import { type EntityCreationMenuEntry } from "../../lib/visual-editor/entity-creation-menu";
import { EDITOR_ICONS, getEditorComponentIcon } from "./editor-icons";
import { EditorMenuItem, EditorMenuSection } from "./EditorMenu";

export function EntityCreationMenuContent({ entries, disabled, onSelect, worldContent, searchQuery = "" }: {
  entries: readonly EntityCreationMenuEntry[];
  disabled: boolean;
  onSelect: (entry: EntityCreationMenuEntry) => void;
  worldContent?: ReactNode;
  searchQuery?: string;
}) {
  return <>
    {(["Entity", "Primitive", "World", "Light", "UI", "Audio", "Effect", "XRift"] as const).map((group) => {
      const items = entries.filter((entry) => entry.group === group && matchesEditorSearch(searchQuery, entry.label, entry.description, entry.hint, entry.id, group, ENTITY_CREATION_GROUP_LABELS[group]));
      const extra = group === "World" ? worldContent : null;
      if (!items.length && !extra) return null;
      return <EditorMenuSection key={group} label={ENTITY_CREATION_GROUP_LABELS[group]} forceOpen={Boolean(searchQuery.trim())} count={extra ? undefined : items.length}>
        {items.map((entry) => <EditorMenuItem
          key={entry.id}
          icon={entry.component ? getEditorComponentIcon(entry.component)
            : entry.xrift ? EDITOR_ICONS[entry.xrift.icon]
              : entry.kind === "empty" ? EDITOR_ICONS.sceneEntity : EDITOR_ICONS.primitive}
          label={entry.label}
          detail={entry.disabledReason ?? entry.hint}
          title={entry.disabledReason ?? (entry.description || entry.label)}
          disabled={disabled || Boolean(entry.disabledReason)}
          onClick={() => onSelect(entry)}
        />)}
        {extra}
      </EditorMenuSection>;
    })}
  </>;
}
