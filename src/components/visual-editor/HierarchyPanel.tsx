import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
} from "react";
import {
  BUILTIN_PRIMITIVE_CREATION_CATALOG,
  BUILTIN_PREFAB_DRAG_MIME,
  getEntityReparentDecision,
  getEditorComponentMenuDefinitions,
  getXriftComponentDefinition,
  getXriftComponentMenuGroups,
  type BuiltinPrefabRecipe,
  type EntityReparentBlockReason,
  type EditorCommandId,
  type SceneDocument,
  type SceneEntity,
  type VisualProjectKind,
} from "../../lib/visual-editor";
import {
  commandTitle,
  EDITOR_ICONS,
  getEditorComponentIcon,
} from "./editor-icons";
import {
  clearEditorDragData,
  hasEditorDragData,
  readEditorDragData,
  writeEditorDragData,
} from "./editor-drag-data";
import {
  ENTITY_DRAG_MIME,
  MATERIAL_DRAG_MIME,
  SCENE_ASSET_DRAG_MIME,
  type EditorSelection,
} from "./types";

type HierarchyRow = {
  entity: SceneEntity;
  depth: number;
  effectiveEnabled: boolean;
};

type HierarchyDropPlacement = "before" | "inside" | "after";

type HierarchyDropTarget =
  | {
      kind: "entity";
      entityId: string;
      placement: HierarchyDropPlacement;
      parentEntityId: string | null;
      siblingIndex: number;
      allowed: boolean;
      message: string;
    }
  | {
      kind: "root";
      parentEntityId: null;
      siblingIndex: number;
      allowed: boolean;
      message: string;
    };

function flattenHierarchy(scene: SceneDocument): HierarchyRow[] {
  const rows: HierarchyRow[] = [];
  const visited = new Set<string>();

  const visit = (
    entityId: string,
    depth: number,
    ancestorsEnabled: boolean,
  ) => {
    if (visited.has(entityId)) return;
    const entity = scene.entities[entityId];
    if (!entity) return;
    visited.add(entityId);
    const effectiveEnabled = ancestorsEnabled && entity.enabled;
    rows.push({ entity, depth, effectiveEnabled });
    entity.children.forEach((childId) =>
      visit(childId, depth + 1, effectiveEnabled),
    );
  };

  scene.rootEntityIds.forEach((entityId) => visit(entityId, 0, true));
  Object.keys(scene.entities).forEach((entityId) => visit(entityId, 0, true));
  return rows;
}

function getEntityTypeLabel(entity: SceneEntity): string {
  if (entity.components.some((component) => component.type === "mesh")) {
    return "Mesh";
  }
  if (entity.components.some((component) => component.type === "light")) {
    return "Light";
  }
  if (
    entity.components.some((component) => component.type === "particle-emitter")
  ) {
    return "Particle";
  }
  if (entity.components.some((component) => component.type === "spawn-point")) {
    return "Spawn";
  }
  const xriftComponent = entity.components.find(
    (component) => component.type === "xrift-component",
  );
  if (xriftComponent?.type === "xrift-component") {
    return (
      getXriftComponentDefinition(xriftComponent.schemaId)?.label ??
      "XRift Component"
    );
  }
  return "Entity";
}

function getEntityIcon(entity: SceneEntity) {
  if (entity.components.some((component) => component.type === "light")) {
    return EDITOR_ICONS.light;
  }
  if (
    entity.components.some((component) => component.type === "particle-emitter")
  ) {
    return EDITOR_ICONS.particle;
  }
  const xriftComponent = entity.components.find(
    (component) => component.type === "xrift-component",
  );
  if (xriftComponent?.type === "xrift-component") {
    const icon = getXriftComponentDefinition(xriftComponent.schemaId)?.icon;
    return icon ? EDITOR_ICONS[icon] : EDITOR_ICONS.prefab;
  }
  return EDITOR_ICONS.sceneEntity;
}

function reparentBlockedMessage(
  reason: EntityReparentBlockReason,
  sourceName: string,
  parentName: string | null,
): string {
  switch (reason) {
    case "same-entity":
      return `「${sourceName}」を自分自身の子にはできません`;
    case "descendant-parent":
      return `「${parentName ?? "このEntity"}」は移動元の子孫です`;
    case "unchanged-parent":
      return parentName
        ? `「${sourceName}」はすでに「${parentName}」の子です`
        : `「${sourceName}」はすでにScene Rootにあります`;
    case "unchanged-order":
      return `「${sourceName}」はすでにこの位置にあります`;
    case "entity-missing":
      return "移動元のEntityが見つかりません";
    case "parent-missing":
      return "移動先のEntityが見つかりません";
  }
}

export function HierarchyPanel({
  scene,
  selection,
  readOnly,
  projectKind,
  onSelect,
  onAssignMaterial,
  onDropSceneAsset,
  onDropBuiltinPrefab,
  builtinPrefabRecipes,
  onEntityEnabledChange,
  onCreateXriftObject,
  onCommand,
  renameRequest,
  onRename,
}: {
  scene: SceneDocument;
  selection: EditorSelection;
  readOnly: boolean;
  projectKind: VisualProjectKind;
  onSelect: (selection: EditorSelection) => void;
  onAssignMaterial: (entityId: string, materialAssetId: string) => void;
  onDropSceneAsset: (assetId: string, parentEntityId: string | null) => void;
  onDropBuiltinPrefab: (recipeId: string, parentEntityId: string | null) => void;
  builtinPrefabRecipes: readonly BuiltinPrefabRecipe[];
  onEntityEnabledChange: (entityId: string, enabled: boolean) => void;
  onCreateXriftObject: (definitionId: string) => void;
  onCommand: (
    commandId: EditorCommandId,
    payload?: {
      creationId?: string;
      entityId?: string;
      parentEntityId?: string | null;
      siblingIndex?: number;
      componentDefinitionId?: string;
    },
  ) => boolean;
  renameRequest: { id: string; requestId: number } | null;
  onRename: (entityId: string, name: string) => void;
}) {
  const rows = flattenHierarchy(scene);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    entityId: string | null;
  } | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [dragEntityId, setDragEntityId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<HierarchyDropTarget | null>(null);
  const [assetDropTarget, setAssetDropTarget] = useState<{
    kind: "entity" | "root";
    entityId?: string;
    message: string;
  } | null>(null);
  const selectedEntityId =
    selection?.kind === "entity" && scene.entities[selection.id]
      ? selection.id
      : null;

  useEffect(() => {
    if (!renameRequest) return;
    setRenameDraft(scene.entities[renameRequest.id]?.name ?? "");
    const frame = window.requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [renameRequest, scene.entities]);

  useEffect(() => {
    if (!dragEntityId) return;
    const cancelDrag = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      clearEditorDragData();
      setDragEntityId(null);
      setDropTarget(null);
    };
    window.addEventListener("keydown", cancelDrag, true);
    return () => window.removeEventListener("keydown", cancelDrag, true);
  }, [dragEntityId]);

  useEffect(() => {
    if (!readOnly) return;
    clearEditorDragData();
    setDragEntityId(null);
    setDropTarget(null);
    setAssetDropTarget(null);
  }, [readOnly]);

  const openContextMenu = (
    event: MouseEvent<HTMLElement>,
    entityId: string | null = null,
  ) => {
    event.preventDefault();
    const bounds =
      panelRef.current?.getBoundingClientRect() ??
      event.currentTarget.getBoundingClientRect();
    setContextMenu({
      x: Math.min(event.clientX - bounds.left, Math.max(8, bounds.width - 174)),
      y: Math.min(event.clientY - bounds.top, Math.max(8, bounds.height - 196)),
      entityId,
    });
  };

  const handleMaterialDrop = (event: DragEvent<HTMLElement>, entityId: string) => {
    if (!hasEditorDragData(event.dataTransfer, MATERIAL_DRAG_MIME)) return;
    event.preventDefault();
    event.stopPropagation();
    const materialAssetId = readEditorDragData(
      event.dataTransfer,
      MATERIAL_DRAG_MIME,
    );
    clearEditorDragData();
    if (readOnly || !materialAssetId) return;
    onAssignMaterial(entityId, materialAssetId);
  };

  const describeDropTarget = (
    sourceEntityId: string,
    targetEntityId: string | null,
    placement: HierarchyDropPlacement = "inside",
  ): HierarchyDropTarget => {
    const source = scene.entities[sourceEntityId];
    if (targetEntityId === null) {
      const siblingIndex = scene.rootEntityIds.filter(
        (entityId) => entityId !== sourceEntityId,
      ).length;
      const decision = getEntityReparentDecision(
        scene,
        sourceEntityId,
        null,
        siblingIndex,
      );
      return decision.allowed
        ? {
            kind: "root",
            parentEntityId: null,
            siblingIndex,
            allowed: true,
            message: `「${source?.name ?? "Entity"}」をScene Rootの末尾へ移動`,
          }
        : {
            kind: "root",
            parentEntityId: null,
            siblingIndex,
            allowed: false,
            message: reparentBlockedMessage(
              decision.reason,
              source?.name ?? "Entity",
              null,
            ),
          };
    }

    const target = scene.entities[targetEntityId];
    if (!target) {
      return {
        kind: "entity",
        entityId: targetEntityId,
        placement,
        parentEntityId: null,
        siblingIndex: 0,
        allowed: false,
        message: "移動先のEntityが見つかりません",
      };
    }
    if (targetEntityId === sourceEntityId) {
      return {
        kind: "entity",
        entityId: targetEntityId,
        placement,
        parentEntityId: target.parentId,
        siblingIndex: 0,
        allowed: false,
        message: `「${source?.name ?? "Entity"}」は同じ位置へ移動できません`,
      };
    }

    const parentEntityId = placement === "inside" ? target.id : target.parentId;
    const siblings = (
      parentEntityId === null
        ? scene.rootEntityIds
        : scene.entities[parentEntityId]?.children ?? []
    ).filter((entityId) => entityId !== sourceEntityId);
    const targetIndex = siblings.indexOf(target.id);
    const siblingIndex =
      placement === "inside"
        ? siblings.length
        : Math.max(0, targetIndex + (placement === "after" ? 1 : 0));
    const decision = getEntityReparentDecision(
      scene,
      sourceEntityId,
      parentEntityId,
      siblingIndex,
    );
    if (decision.allowed) {
      return {
        kind: "entity",
        entityId: target.id,
        placement,
        parentEntityId,
        siblingIndex,
        allowed: true,
        message:
          placement === "inside"
            ? `「${source?.name ?? "Entity"}」を「${target.name}」の子へ移動`
            : `「${source?.name ?? "Entity"}」を「${target.name}」の${placement === "before" ? "前" : "後"}へ移動`,
      };
    }
    return {
      kind: "entity",
      entityId: target.id,
      placement,
      parentEntityId,
      siblingIndex,
      allowed: false,
      message: reparentBlockedMessage(
        decision.reason,
        source?.name ?? "Entity",
        parentEntityId ? scene.entities[parentEntityId]?.name ?? null : null,
      ),
    };
  };

  const entityDropPlacement = (
    event: DragEvent<HTMLElement>,
  ): HierarchyDropPlacement => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = bounds.height > 0
      ? (event.clientY - bounds.top) / bounds.height
      : 0.5;
    if (ratio < 0.28) return "before";
    if (ratio > 0.72) return "after";
    return "inside";
  };

  const finishEntityDrop = (
    event: DragEvent<HTMLElement>,
    targetEntityId: string | null,
    placement: HierarchyDropPlacement = "inside",
  ) => {
    if (
      !dragEntityId &&
      !hasEditorDragData(event.dataTransfer, ENTITY_DRAG_MIME)
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const sourceEntityId =
      dragEntityId ??
      readEditorDragData(event.dataTransfer, ENTITY_DRAG_MIME).trim();
    clearEditorDragData();
    if (readOnly || !sourceEntityId) {
      setDragEntityId(null);
      setDropTarget(null);
      return;
    }
    const target = describeDropTarget(
      sourceEntityId,
      targetEntityId,
      placement,
    );
    if (!target.allowed) {
      setDropTarget(target);
      setDragEntityId(null);
      return;
    }
    onCommand("entity.reparent", {
      entityId: sourceEntityId,
      parentEntityId: target.parentEntityId,
      siblingIndex: target.siblingIndex,
    });
    setDragEntityId(null);
    setDropTarget(null);
  };

  const hasPlaceableDrop = (event: DragEvent<HTMLElement>) =>
    hasEditorDragData(event.dataTransfer, SCENE_ASSET_DRAG_MIME) ||
    hasEditorDragData(event.dataTransfer, BUILTIN_PREFAB_DRAG_MIME);

  const finishPlaceableDrop = (
    event: DragEvent<HTMLElement>,
    parentEntityId: string | null,
  ) => {
    if (!hasPlaceableDrop(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const recipeId = readEditorDragData(
      event.dataTransfer,
      BUILTIN_PREFAB_DRAG_MIME,
    ).trim();
    const assetId = readEditorDragData(
      event.dataTransfer,
      SCENE_ASSET_DRAG_MIME,
    ).trim();
    clearEditorDragData();
    setAssetDropTarget(null);
    if (readOnly) return;
    if (recipeId) {
      onDropBuiltinPrefab(recipeId, parentEntityId);
      return;
    }
    if (assetId) onDropSceneAsset(assetId, parentEntityId);
  };

  return (
    <aside
      ref={panelRef}
      className="relative row-span-2 flex min-h-0 flex-col border-r border-zinc-200 bg-zinc-50"
      aria-labelledby="hierarchy-heading"
      onContextMenu={openContextMenu}
      onPointerDown={() => contextMenu && setContextMenu(null)}
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-3">
        <h2
          id="hierarchy-heading"
          className="text-[13px] font-semibold text-zinc-800"
        >
          Hierarchy
        </h2>
        <div className="flex items-center gap-1.5">
          {selectedEntityId ? (
            <button
              type="button"
              disabled={readOnly}
              onClick={() =>
                onCommand("edit.delete", { entityId: selectedEntityId })
              }
              title={
                readOnly
                  ? "Playを停止するとEntityを削除できます"
                  : commandTitle("選択中のEntityを削除", "edit.delete")
              }
              className="flex h-7 items-center gap-1 rounded border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-700 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <EDITOR_ICONS.delete size={12} aria-hidden="true" />
              削除
            </button>
          ) : null}
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs tabular-nums text-zinc-500">
            {rows.length}
          </span>
        </div>
      </div>
      {readOnly ? (
        <div className="border-b border-violet-200 bg-violet-50 px-3 py-2 text-xs leading-4 text-violet-800">
          Play中は閲覧のみです。選択は停止後も維持されます。
        </div>
      ) : null}
      {dragEntityId || assetDropTarget ? (
        <div
          className={`flex min-h-9 shrink-0 items-center gap-2 border-b px-3 py-1.5 text-xs font-medium leading-4 ${
            assetDropTarget
              ? "border-sky-200 bg-sky-50 text-sky-800"
              : dropTarget?.allowed === false
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-violet-200 bg-violet-50 text-violet-800"
          }`}
          role="status"
          aria-live="polite"
        >
          <EDITOR_ICONS.move size={13} className="shrink-0" aria-hidden="true" />
          <span>{assetDropTarget?.message ?? dropTarget?.message ?? "移動先のEntityまたはScene Rootを選択"}</span>
        </div>
      ) : null}
      <div
        className="scrollbar-thin min-h-0 flex-1 overflow-y-auto py-1.5"
        role="tree"
        aria-label="SceneのEntity階層"
        onDragEnter={(event) => {
          if (!hasPlaceableDrop(event)) return;
          event.preventDefault();
          event.stopPropagation();
          if (readOnly) return;
          setAssetDropTarget({
            kind: "root",
            message: "Asset / XRift PrefabをScene Rootへ配置",
          });
        }}
        onDragOver={(event) => {
          if (!hasPlaceableDrop(event)) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = readOnly ? "none" : "copy";
        }}
        onDragLeave={(event) => {
          const nextTarget = event.relatedTarget;
          if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
          setAssetDropTarget(null);
        }}
        onDrop={(event) => finishPlaceableDrop(event, null)}
      >
        {dragEntityId || assetDropTarget ? (
          <div
            className={`mx-2 mb-1 flex min-h-9 items-center justify-center gap-1.5 rounded border border-dashed px-2 text-xs font-semibold transition-colors ${
              assetDropTarget?.kind === "root"
                ? "border-sky-500 bg-sky-100 text-sky-800"
                : dropTarget?.kind === "root"
                ? dropTarget.allowed
                  ? "border-violet-500 bg-violet-100 text-violet-800"
                  : "border-rose-400 bg-rose-50 text-rose-700"
                : "border-slate-300 bg-white text-slate-500"
            }`}
            onDragOver={(event) => {
              if (hasPlaceableDrop(event)) {
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = readOnly ? "none" : "copy";
                if (readOnly) return;
                setAssetDropTarget({
                  kind: "root",
                  message: "Asset / XRift PrefabをScene Rootへ配置",
                });
                return;
              }
              if (
                readOnly ||
                !hasEditorDragData(event.dataTransfer, ENTITY_DRAG_MIME)
              ) {
                return;
              }
              const sourceEntityId =
                dragEntityId ??
                readEditorDragData(event.dataTransfer, ENTITY_DRAG_MIME).trim();
              if (!sourceEntityId) return;
              const target = describeDropTarget(sourceEntityId, null);
              setDropTarget(target);
              if (!target.allowed) {
                event.dataTransfer.dropEffect = "none";
                return;
              }
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
              if (hasPlaceableDrop(event)) {
                finishPlaceableDrop(event, null);
                return;
              }
              finishEntityDrop(event, null);
            }}
          >
            <EDITOR_ICONS.world size={13} aria-hidden="true" />
            {assetDropTarget ? "Scene Rootへ配置" : "Scene Rootへ移動"}
          </div>
        ) : null}
        {rows.map(({ entity, depth, effectiveEnabled }) => {
          const selected =
            selection?.kind === "entity" && selection.id === entity.id;
          const EntityIcon = getEntityIcon(entity);
          const renaming = renameRequest?.id === entity.id;
          const activeEntityDrop =
            dropTarget?.kind === "entity" &&
            dropTarget.entityId === entity.id
              ? dropTarget
              : null;
          if (renaming) {
            return (
              <div
                key={entity.id}
                role="treeitem"
                aria-level={depth + 1}
                aria-selected={selected}
                className="flex w-full items-center gap-2 border-l-2 border-violet-600 bg-violet-50 py-1.5 pr-2"
                style={{ paddingLeft: `${9 + depth * 13}px` }}
              >
                <EntityIcon size={14} className="text-violet-700" aria-hidden="true" />
                <input
                  ref={renameInputRef}
                  value={renameDraft}
                  onChange={(event) => setRenameDraft(event.currentTarget.value)}
                  onBlur={() => onRename(entity.id, renameDraft)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") {
                      event.preventDefault();
                      onRename(entity.id, entity.name);
                    }
                  }}
                  className="h-7 min-w-0 flex-1 rounded border border-violet-400 bg-white px-1.5 text-xs outline-none ring-2 ring-violet-100"
                />
              </div>
            );
          }
          return (
            <div
              key={entity.id}
              role="treeitem"
              aria-level={depth + 1}
              aria-selected={selected}
              data-hierarchy-entity-id={entity.id}
              onContextMenu={(event) => {
                event.stopPropagation();
                if (!readOnly) onSelect({ kind: "entity", id: entity.id });
                openContextMenu(event, entity.id);
              }}
              onDragOverCapture={(event) => {
                if (readOnly) return;
                if (hasEditorDragData(event.dataTransfer, MATERIAL_DRAG_MIME)) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = entity.components.some(
                    (component) => component.type === "mesh",
                  )
                    ? "copy"
                    : "none";
                  return;
                }
                if (hasPlaceableDrop(event)) {
                  event.preventDefault();
                  event.stopPropagation();
                  event.dataTransfer.dropEffect = "copy";
                  setAssetDropTarget({
                    kind: "entity",
                    entityId: entity.id,
                    message: `Asset / XRift Prefabを「${entity.name}」の子へ配置`,
                  });
                  return;
                }
                if (!hasEditorDragData(event.dataTransfer, ENTITY_DRAG_MIME)) return;
                const sourceEntityId =
                  dragEntityId ??
                  readEditorDragData(event.dataTransfer, ENTITY_DRAG_MIME).trim();
                if (!sourceEntityId) return;
                const target = describeDropTarget(
                  sourceEntityId,
                  entity.id,
                  entityDropPlacement(event),
                );
                setDropTarget(target);
                if (!target.allowed) {
                  event.dataTransfer.dropEffect = "none";
                  return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDragLeave={(event) => {
                const nextTarget = event.relatedTarget;
                if (
                  nextTarget instanceof Node &&
                  event.currentTarget.contains(nextTarget)
                ) {
                  return;
                }
                setDropTarget((current) =>
                  current?.kind === "entity" &&
                  current.entityId === entity.id
                    ? null
                    : current,
                );
              }}
              onDropCapture={(event) => {
                if (hasEditorDragData(event.dataTransfer, MATERIAL_DRAG_MIME)) {
                  handleMaterialDrop(event, entity.id);
                  return;
                }
                if (hasPlaceableDrop(event)) {
                  finishPlaceableDrop(event, entity.id);
                  return;
                }
                finishEntityDrop(
                  event,
                  entity.id,
                  entityDropPlacement(event),
                );
              }}
              className={`group flex w-full items-stretch border-l-2 text-left text-xs transition-[background-color,border-color,box-shadow,opacity] ${
                assetDropTarget?.kind === "entity" &&
                assetDropTarget.entityId === entity.id
                  ? "border-sky-600 bg-sky-100 text-sky-900 ring-1 ring-inset ring-sky-400"
                  : activeEntityDrop
                  ? activeEntityDrop.allowed
                    ? activeEntityDrop.placement === "before"
                      ? "border-violet-400 bg-violet-50 text-violet-900 shadow-[inset_0_2px_0_#7c3aed]"
                      : activeEntityDrop.placement === "after"
                        ? "border-violet-400 bg-violet-50 text-violet-900 shadow-[inset_0_-2px_0_#7c3aed]"
                        : "border-violet-600 bg-violet-100 text-violet-900 ring-1 ring-inset ring-violet-400"
                    : "border-rose-500 bg-rose-50 text-rose-800 ring-1 ring-inset ring-rose-300"
                  : selected
                    ? "border-violet-600 bg-violet-100 text-violet-900"
                    : "border-transparent text-slate-700 hover:bg-white hover:text-slate-900"
              } ${effectiveEnabled ? "opacity-100" : "opacity-50"}`}
            >
              <button
                type="button"
                draggable={!readOnly}
                data-editor-drag-source="hierarchy-entity"
                disabled={readOnly}
                aria-pressed={selected}
                aria-label={`${entity.name}、${getEntityTypeLabel(entity)}`}
                title={
                  readOnly
                    ? "Playを停止するとEntityを選択できます"
                    : commandTitle(`${entity.name}を選択`, "SelectEntity")
                }
                onClick={() => onSelect({ kind: "entity", id: entity.id })}
                onDragStart={(event) => {
                  writeEditorDragData(event.dataTransfer, {
                    [ENTITY_DRAG_MIME]: entity.id,
                  });
                  // Hierarchy drop reparents (move); Assets drop creates a Prefab
                  // (copy). One drag source advertises both editor intents.
                  event.dataTransfer.effectAllowed = "copyMove";
                  setDragEntityId(entity.id);
                  setDropTarget(null);
                  onSelect({ kind: "entity", id: entity.id });
                }}
                onDragEnd={() => {
                  clearEditorDragData();
                  setDragEntityId(null);
                  setDropTarget(null);
                }}
                className="flex min-w-0 flex-1 cursor-grab select-none items-center gap-2 py-2 pr-1 text-left active:cursor-grabbing disabled:cursor-default"
                style={{ paddingLeft: `${9 + depth * 13}px` }}
              >
                <EntityIcon
                  size={14}
                  className={selected ? "text-violet-700" : "text-slate-400"}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">{entity.name}</span>
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  {getEntityTypeLabel(entity)}
                </span>
              </button>
              <button
                type="button"
                data-no-entity-drag="true"
                disabled={readOnly}
                aria-pressed={entity.enabled}
                aria-label={`${entity.name}を${entity.enabled ? "無効" : "有効"}にする`}
                title={
                  readOnly
                    ? "Playを停止するとEnabledを変更できます"
                    : entity.enabled && !effectiveEnabled
                      ? `親Entityが無効です。「${entity.name}」自身を無効にする`
                      : `${entity.name}を${entity.enabled ? "無効" : "有効"}にする`
                }
                onClick={(event) => {
                  event.stopPropagation();
                  onEntityEnabledChange(entity.id, !entity.enabled);
                }}
                className="m-1 mr-0 flex w-7 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-200 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-not-allowed disabled:opacity-30"
              >
                {entity.enabled ? (
                  <EDITOR_ICONS.visible size={14} aria-hidden="true" />
                ) : (
                  <EDITOR_ICONS.hidden size={14} aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                data-no-entity-drag="true"
                disabled={readOnly}
                onClick={(event) => {
                  event.stopPropagation();
                  onCommand("edit.delete", { entityId: entity.id });
                }}
                aria-label={`${entity.name}を削除`}
                title={
                  readOnly
                    ? "Playを停止するとEntityを削除できます"
                    : commandTitle(`${entity.name}を削除`, "edit.delete")
                }
                className={`m-1 flex w-7 shrink-0 items-center justify-center rounded text-slate-500 transition-opacity hover:bg-rose-100 hover:text-rose-700 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:cursor-not-allowed disabled:opacity-30 ${
                  selected
                    ? "opacity-100"
                    : "opacity-0 group-hover:opacity-100"
                }`}
              >
                <EDITOR_ICONS.delete size={13} aria-hidden="true" />
                <span className="sr-only">削除</span>
              </button>
            </div>
          );
        })}
      </div>
      {contextMenu ? (
        <div
          className="absolute z-50 max-h-[80%] w-52 overflow-y-auto rounded-md border border-slate-300 bg-white p-1 shadow-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Entity
          </p>
          {contextMenu.entityId ? (
            <>
              {([
                ["selection.rename", "名前を変更", "settings"],
                ["edit.copy", "コピー", "copy"],
                ["edit.duplicate", "複製", "duplicate"],
                ["edit.delete", "削除", "delete"],
                ["prefab.create", "Prefabを作成", "prefab"],
              ] as const).map(([commandId, label, icon]) => {
                const Icon = EDITOR_ICONS[icon];
                return (
                  <button
                    key={commandId}
                    type="button"
                    disabled={readOnly}
                    onClick={() => {
                      const entityId = contextMenu.entityId ?? undefined;
                      setContextMenu(null);
                      onCommand(commandId, { entityId });
                    }}
                    title={
                      readOnly
                        ? "Playを停止すると編集できます"
                        : commandTitle(label, commandId)
                    }
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-violet-50 hover:text-violet-800 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Icon size={14} aria-hidden="true" />
                    {label}
                  </button>
                );
              })}
              <div className="my-1 border-t border-slate-200" />
              <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Add Component
              </p>
              {getEditorComponentMenuDefinitions(projectKind).map((definition) => {
                const DefinitionIcon = getEditorComponentIcon(definition);
                const entity = contextMenu.entityId
                  ? scene.entities[contextMenu.entityId]
                  : undefined;
                const duplicate =
                  !definition.allowMultiple &&
                  entity?.components.some((component) =>
                    definition.componentType === "official-xrift"
                      ? component.type === "xrift-component" &&
                        component.schemaId === definition.schemaId
                      : definition.componentType === "builtin-mesh"
                        ? component.type === "mesh"
                        : component.type === definition.componentType,
                  );
                return (
                  <button
                    key={definition.id}
                    type="button"
                    disabled={readOnly || duplicate}
                    onClick={() => {
                      const entityId = contextMenu.entityId ?? undefined;
                      setContextMenu(null);
                      onCommand("entity.add-component", {
                        entityId,
                        componentDefinitionId: definition.id,
                      });
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-violet-50 hover:text-violet-800 disabled:opacity-45"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <DefinitionIcon size={14} className="shrink-0" aria-hidden="true" />
                      <span className="truncate">{definition.label}</span>
                    </span>
                    <span className="text-xs text-slate-400">
                      {duplicate ? "追加済み" : definition.category}
                    </span>
                  </button>
                );
              })}
            </>
          ) : null}
          <div className="my-1 border-t border-slate-200" />
          <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            XRift Component
          </p>
          {getXriftComponentMenuGroups(projectKind).flatMap((group) =>
            group.components.map((definition) => {
              const DefinitionIcon = EDITOR_ICONS[definition.icon];
              const entity = contextMenu.entityId
                ? scene.entities[contextMenu.entityId]
                : undefined;
              const duplicate = Boolean(
                entity &&
                  !definition.allowMultiplePerEntity &&
                  entity.components.some(
                    (component) =>
                      component.type === "xrift-component" &&
                      component.schemaId === definition.schemaId,
                  ),
              );
              const canCreateHost = definition.attachBehavior.kind === "leaf";
              return (
                <button
                  key={definition.schemaId}
                  type="button"
                  disabled={
                    readOnly ||
                    duplicate ||
                    (!contextMenu.entityId && !canCreateHost)
                  }
                  onClick={() => {
                    const entityId = contextMenu.entityId;
                    setContextMenu(null);
                    if (entityId) {
                      onCommand("entity.add-component", {
                        entityId,
                        componentDefinitionId: definition.schemaId,
                      });
                    } else {
                      onCreateXriftObject(definition.schemaId);
                    }
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-violet-50 hover:text-violet-800 disabled:opacity-45"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <DefinitionIcon size={14} className="shrink-0" aria-hidden="true" />
                    <span className="truncate">{definition.label}</span>
                  </span>
                  <span className="text-xs text-slate-400">
                    {duplicate
                      ? "追加済み"
                      : contextMenu.entityId
                        ? "追加"
                        : canCreateHost
                          ? "作成"
                          : "Entityを選択"}
                  </span>
                </button>
              );
            }),
          )}
          <div className="my-1 border-t border-slate-200" />
          <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            XRift Prefab
          </p>
          {builtinPrefabRecipes.map((recipe) => {
            const definition = getXriftComponentDefinition(recipe.schemaId);
            const DefinitionIcon = definition
              ? EDITOR_ICONS[definition.icon]
              : EDITOR_ICONS.prefab;
            return (
              <button
                key={recipe.id}
                type="button"
                disabled={readOnly}
                onClick={() => {
                  const parentEntityId = contextMenu.entityId;
                  setContextMenu(null);
                  onDropBuiltinPrefab(recipe.id, parentEntityId);
                }}
                title={recipe.description}
                className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-violet-50 hover:text-violet-800 disabled:opacity-45"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <DefinitionIcon size={14} className="shrink-0" aria-hidden="true" />
                  <span className="truncate">{recipe.name}</span>
                </span>
                <span className="text-xs text-slate-400">
                  {recipe.configuration?.requiredBeforeCompile ? "設定" : "作成"}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            disabled={readOnly}
            onClick={() => {
              const parentEntityId = contextMenu.entityId;
              setContextMenu(null);
              onCommand("entity.create-empty", { parentEntityId });
            }}
            title={commandTitle(
              contextMenu.entityId
                ? "選択Entityの子にEmpty Entityを作成"
                : "Scene RootにEmpty Entityを作成",
              "entity.create-empty",
            )}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-violet-50 hover:text-violet-800 disabled:opacity-45"
          >
            <EDITOR_ICONS.sceneEntity size={14} aria-hidden="true" />
            Empty Entity
          </button>
          <div className="my-1 border-t border-slate-200" />
          <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Create Mesh
          </p>
          {BUILTIN_PRIMITIVE_CREATION_CATALOG.map((entry) => (
            <button
              key={entry.creationId}
              type="button"
              disabled={readOnly}
              onClick={() => {
                setContextMenu(null);
                onCommand("entity.create-primitive", {
                  creationId: entry.creationId,
                });
              }}
              title={commandTitle(`${entry.name}をSceneへ作成`, "entity.create-primitive")}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-violet-50 hover:text-violet-800 disabled:opacity-45"
            >
              <EDITOR_ICONS.primitive size={14} aria-hidden="true" />
              {entry.name}
            </button>
          ))}
        </div>
      ) : null}
    </aside>
  );
}
