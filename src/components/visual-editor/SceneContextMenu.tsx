import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { EntityMirrorAxis } from "../../lib/visual-editor/entity-clipboard";
import type { EditorCommandId } from "../../lib/visual-editor/shortcuts";
import { EDITOR_ICONS, type EditorIconName } from "./editor-icons";
import { ENTITY_CONTEXT_ITEM_CLASS, EntityPasteMenuItems } from "./EntityPasteMenuItems";
import { EditorMenuGroup, handleEditorMenuKeyDown } from "./EditorMenu";

export type SceneContextMenuProps = {
  x: number;
  y: number;
  entityId: string | null;
  entityName: string | null;
  selectionCount: number;
  clipboardAvailable: boolean;
  touch?: boolean;
  source?: "scene" | "hierarchy";
  onExportHierarchy?: (entityId: string) => void;
  extraContent?: ReactNode;
  renderCreation?: (close: () => void) => ReactNode;
  disabledReason?: string | null;
  shortcutLabel: (command: EditorCommandId) => string;
  onCommand: (command: EditorCommandId, payload?: {
    source?: "scene" | "hierarchy";
    entityId?: string;
    parentEntityId?: string | null;
    mirrorAxis?: EntityMirrorAxis;
  }) => boolean;
  /** Outside clicks keep focus on their own target; Escape restores the canvas. */
  onClose: (restoreFocus: boolean) => void;
};

/** Shared editor menu; Hierarchy blank space also exposes the creation catalog. */
export function SceneContextMenu(props: SceneContextMenuProps) {
  const { x, y, entityId, entityName, selectionCount, clipboardAvailable, disabledReason, shortcutLabel } = props;
  const menuRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef(props);
  actionsRef.current = props;
  const [position, setPosition] = useState<{
    left: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
  }>({ left: x, top: y, maxHeight: 640 });
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const place = () => {
      const { width } = menu.getBoundingClientRect();
      const margin = 8;
      const anchorX = Math.max(margin, Math.min(x, window.innerWidth - margin));
      const anchorY = Math.max(margin, Math.min(y, window.innerHeight - margin));
      const below = window.innerHeight - anchorY - margin;
      const above = anchorY - margin;
      const openUp = below < 240 && above > below;
      const left = anchorX + width + margin <= window.innerWidth
        ? anchorX
        : anchorX - width >= margin ? anchorX - width : margin;
      const next = {
        left,
        top: openUp ? undefined : anchorY,
        bottom: openUp ? window.innerHeight - anchorY : undefined,
        maxHeight: Math.max(32, openUp ? above : below),
      };
      setPosition((current) => current.left === next.left && current.top === next.top &&
        current.bottom === next.bottom && current.maxHeight === next.maxHeight ? current : next);
    };
    place();
    // Expansion stays inside the window, even beside a short Scene panel.
    const observer = new ResizeObserver(place);
    observer.observe(menu);
    return () => observer.disconnect();
  }, [x, y]);
  useEffect(() => {
    const menu = menuRef.current;
    (props.renderCreation ? menu?.querySelector<HTMLElement>("button") : menu?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? menu)?.focus();
    const outside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) actionsRef.current.onClose(false);
    };
    const dismiss = () => actionsRef.current.onClose(false);
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("blur", dismiss);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("blur", dismiss);
    };
  }, []);

  const run = (command: EditorCommandId, payload?: Parameters<SceneContextMenuProps["onCommand"]>[1]) => {
    actionsRef.current.onClose(true);
    actionsRef.current.onCommand(command, { ...payload, source: props.source ?? "scene" });
  };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // The menu owns its keystrokes, not the canvas gizmo or editor shortcuts.
    event.stopPropagation();
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      actionsRef.current.onClose(true);
      return;
    }
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
    if (props.renderCreation) {
      handleEditorMenuKeyDown(event);
      return;
    }
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])
      .filter((item) => item.closest('[role="menu"]') === menuRef.current);
    if (!items.length) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const index = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
      : current < 0 ? (event.key === "ArrowUp" ? items.length - 1 : 0)
      : (current + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
    items[index]?.focus();
  };
  const item = (command: EditorCommandId, label: string, iconName: EditorIconName, reason?: string | null) => {
    const Icon = EDITOR_ICONS[iconName];
    const shortcut = shortcutLabel(command);
    return (
      <button
        type="button"
        role="menuitem"
        disabled={Boolean(reason)}
        title={reason ?? (entityId ? `${label}：${selectionCount > 1 ? `${selectionCount}件のEntity` : entityName ?? "Entity"}` : label)}
        className={`${ENTITY_CONTEXT_ITEM_CLASS} ${command === "edit.delete" ? "hover:bg-rose-50 hover:text-rose-700" : ""}`}
        onClick={() => run(command, entityId ? { entityId } : undefined)}
      >
        <Icon size={14} aria-hidden="true" />
        <span className="flex-1">{label}</span>
        {shortcut ? <span className="text-[10px] text-slate-400" aria-hidden="true">{shortcut}</span> : null}
      </button>
    );
  };
  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={props.renderCreation ? "Hierarchyの追加と編集" : props.source === "hierarchy" ? "Hierarchyの編集" : "シーンの編集"}
      tabIndex={-1}
      className={`fixed z-[85] ${props.renderCreation ? "w-56" : "w-64"} max-w-[calc(100vw-16px)] overflow-y-auto overscroll-contain rounded-md border border-slate-300 bg-white p-1 text-slate-800 shadow-xl select-none ${props.source === "hierarchy" ? "[&_button]:min-h-6 [&_button]:py-0.5 [&_button]:text-[11px] [&_button]:leading-4 [&_button]:font-medium [&_button]:tracking-tight" : ""} ${props.touch ? "editor-touch-menu" : ""}`}
      style={position}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}
      onKeyDown={keyDown}
    >
      {disabledReason ? <p className="px-2 py-1 text-[11px] leading-4 text-slate-500">{disabledReason}</p> : null}
      {entityId ? <>
        <p className="truncate px-2 py-1 text-[11px] font-semibold text-slate-500" title={entityName ?? undefined}>
          {selectionCount > 1 ? `${selectionCount}件のEntity` : entityName ?? "Entity"}
        </p>
        {item("edit.copy", "コピー", "copy", disabledReason)}
      </> : null}
      {props.renderCreation ? <>
        <EditorMenuGroup>{props.renderCreation(() => actionsRef.current.onClose(false))}</EditorMenuGroup>
        <div role="separator" className="my-1 border-t border-slate-200" />
      </> : null}
      <EntityPasteMenuItems
        disabledReason={disabledReason ?? (clipboardAvailable ? null : "先にEntityをコピーしてください")}
        shortcut={shortcutLabel("edit.paste")}
        onPaste={(mirrorAxis) => run("edit.paste", { mirrorAxis, entityId: entityId ?? undefined })}
      />
      {entityId ? <>
        <div role="separator" className="my-1 border-t border-slate-200" />
        {item("edit.duplicate", "複製", "duplicate", disabledReason)}
        {item("selection.rename", "名前を変更", "rename", disabledReason ?? (selectionCount > 1 ? "名前を変更するEntityを1件選んでください" : null))}
        {item("view.frame-selection", "フォーカス", "maximize")}
        <div role="separator" className="my-1 border-t border-slate-200" />
        {item("prefab.create", "再利用素材（Prefab）を作成", "prefab", disabledReason ?? (selectionCount > 1 ? "Prefabにする親Entityを1件選んでください" : null))}
        {props.onExportHierarchy ? <button type="button" role="menuitem" disabled={Boolean(disabledReason)}
          className={ENTITY_CONTEXT_ITEM_CLASS} title={disabledReason ?? "選択したEntityと子・素材を.xriftstudioで書き出します"}
          onClick={() => { props.onClose(true); props.onExportHierarchy?.(entityId); }}>
          <EDITOR_ICONS.export size={14} aria-hidden="true" /><span className="flex-1">選択範囲を書き出す</span>
        </button> : null}
        {props.extraContent}
        <div role="separator" className="my-1 border-t border-slate-200" />
        {item("edit.delete", "削除", "delete", disabledReason)}
      </> : null}
    </div>,
    document.body,
  );
}
