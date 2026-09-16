import type { ReactNode } from "react";
import { type EntityCreationMenuEntry } from "../../lib/visual-editor/entity-creation-menu";
import { EDITOR_ICONS, getEditorComponentIcon } from "./editor-icons";
import { EditorMenuItem, EditorMenuSection } from "./EditorMenu";

export function EntityCreationMenuContent({ entries, disabled, onSelect, worldContent }: {
  entries: readonly EntityCreationMenuEntry[];
  disabled: boolean;
  onSelect: (entry: EntityCreationMenuEntry) => void;
  worldContent?: ReactNode;
}) {
  return <>
    {(["Entity", "Primitive", "World", "Light", "UI", "Audio", "Effect", "XRift"] as const).map((group) => {
      const items = entries.filter((entry) => entry.group === group);
      const extra = group === "World" ? worldContent : null;
      if (!items.length && !extra) return null;
      return <EditorMenuSection key={group} label={group} count={extra ? undefined : items.length}>
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
      </EditorMenuSection>;
    })}
  </>;
}
