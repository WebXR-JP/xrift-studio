import {
  useEffect,
  useMemo,
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
  childCount: number;
  collapsed: boolean;
  canCollapse: boolean;
  matchesFilter: boolean;
};

type HierarchyFilterResult = {
  matchingEntityIds: ReadonlySet<string>;
  includedEntityIds: ReadonlySet<string>;
};

type HierarchyKindFilter =
  | "mesh"
  | "light"
  | "rigid-body"
  | "collider"
  | "audio-source"
  | "particle-emitter"
  | "animation"
  | "spawn-point"
  | "xrift-component";

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

function flattenHierarchy(
  scene: SceneDocument,
  collapsedEntityIds: ReadonlySet<string>,
  filterResult: HierarchyFilterResult | null,
): HierarchyRow[] {
  const rows: HierarchyRow[] = [];
  const visited = new Set<string>();
  const pending: Array<{
    entityId: string;
    depth: number;
    ancestorsEnabled: boolean;
    visible: boolean;
  }> = [];
  const candidates = [...scene.rootEntityIds, ...Object.keys(scene.entities)];
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    pending.push({
      entityId: candidates[index],
      depth: 0,
      ancestorsEnabled: true,
      visible: true,
    });
  }

  while (pending.length > 0) {
    const { entityId, depth, ancestorsEnabled, visible } = pending.pop()!;
    if (visited.has(entityId)) continue;
    const entity = scene.entities[entityId];
    if (!entity) continue;
    visited.add(entityId);
    const effectiveEnabled = ancestorsEnabled && entity.enabled;
    const childCount = entity.children.filter(
      (childId) =>
        Boolean(scene.entities[childId]) &&
        (!filterResult || filterResult.includedEntityIds.has(childId)),
    ).length;
    const matchesFilter =
      filterResult?.matchingEntityIds.has(entityId) ?? false;
    const includedByFilter =
      !filterResult || filterResult.includedEntityIds.has(entityId);
    const canCollapse = filterResult === null && childCount > 0;
    const collapsed =
      canCollapse && collapsedEntityIds.has(entityId);
    if (visible && includedByFilter) {
      rows.push({
        entity,
        depth,
        effectiveEnabled,
        childCount,
        collapsed,
        canCollapse,
        matchesFilter,
      });
    }
    for (let index = entity.children.length - 1; index >= 0; index -= 1) {
      pending.push({
        entityId: entity.children[index],
        depth: depth + 1,
        ancestorsEnabled: effectiveEnabled,
        visible: visible && !collapsed,
      });
    }
  }
  return rows;
}

function getHierarchyFilterResult(
  scene: SceneDocument,
  query: string,
  kindFilters: ReadonlySet<HierarchyKindFilter>,
): HierarchyFilterResult | null {
  const tokens = query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0 && kindFilters.size === 0) return null;

  const matchingEntityIds = new Set<string>();
  for (const entity of Object.values(scene.entities)) {
    if (!entityMatchesKindFilters(entity, kindFilters)) continue;
    const effectivelyEnabled = isEntityEffectivelyEnabled(scene, entity);
    const statusTerms = effectivelyEnabled
      ? "enabled visible 有効 表示"
      : "disabled hidden 無効 非表示";
    const haystack = [
      entity.name,
      getEntityTypeLabel(entity),
      ...entity.components.flatMap((component) =>
        component.type === "xrift-component"
          ? [component.type, component.schemaId]
          : [component.type],
      ),
      statusTerms,
    ]
      .join(" ")
      .toLocaleLowerCase();
    if (tokens.every((token) => haystack.includes(token))) {
      matchingEntityIds.add(entity.id);
    }
  }

  const includedEntityIds = new Set(matchingEntityIds);
  for (const entityId of matchingEntityIds) {
    const visited = new Set<string>([entityId]);
    let parentId = scene.entities[entityId]?.parentId ?? null;
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      includedEntityIds.add(parentId);
      parentId = scene.entities[parentId]?.parentId ?? null;
    }
  }
  return { matchingEntityIds, includedEntityIds };
}

function entityMatchesKindFilters(
  entity: SceneEntity,
  kindFilters: ReadonlySet<HierarchyKindFilter>,
): boolean {
  if (kindFilters.size === 0) return true;
  return [...kindFilters].some((kind) => {
    switch (kind) {
      case "mesh":
        return (
          entity.modelNode?.nodeType === "mesh" ||
          entity.modelNode?.nodeType === "skinned-mesh" ||
          entity.components.some((component) => component.type === "mesh")
        );
      case "light":
      case "rigid-body":
      case "collider":
      case "audio-source":
      case "particle-emitter":
      case "animation":
      case "spawn-point":
      case "xrift-component":
        return entity.components.some((component) => component.type === kind);
    }
  });
}

function isEntityEffectivelyEnabled(
  scene: SceneDocument,
  entity: SceneEntity,
): boolean {
  const visited = new Set<string>();
  let current: SceneEntity | undefined = entity;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    if (!current.enabled) return false;
    current = current.parentId ? scene.entities[current.parentId] : undefined;
  }
  return true;
}

function sameDropTarget(
  left: HierarchyDropTarget | null,
  right: HierarchyDropTarget | null,
): boolean {
  if (left === right) return true;
  if (!left || !right || left.kind !== right.kind) return false;
  if (
    left.parentEntityId !== right.parentEntityId ||
    left.siblingIndex !== right.siblingIndex ||
    left.allowed !== right.allowed ||
    left.message !== right.message
  ) {
    return false;
  }
  return left.kind === "root"
    ? true
    : right.kind === "entity" &&
        left.entityId === right.entityId &&
        left.placement === right.placement;
}

function sameAssetDropTarget(
  left: { kind: "entity" | "root"; entityId?: string; message: string } | null,
  right: { kind: "entity" | "root"; entityId?: string; message: string } | null,
): boolean {
  return (
    left === right ||
    Boolean(
      left &&
        right &&
        left.kind === right.kind &&
        left.entityId === right.entityId &&
        left.message === right.message,
    )
  );
}

function getEntityTypeLabel(entity: SceneEntity): string {
  if (entity.modelNode?.nodeType === "bone") return "ボーン";
  if (entity.modelNode?.nodeType === "skinned-mesh") return "スキン";
  if (entity.modelNode?.nodeType === "mesh") return "メッシュ";
  if (entity.modelNode) return "ノード";
  if (entity.components.some((component) => component.type === "mesh")) {
    return "メッシュ";
  }
  if (entity.components.some((component) => component.type === "light")) {
    return "ライト";
  }
  if (entity.components.some((component) => component.type === "rigid-body")) {
    return "Rigid Body";
  }
  if (entity.components.some((component) => component.type === "audio-source")) {
    return "オーディオ";
  }
  if (
    entity.components.some((component) => component.type === "particle-emitter")
  ) {
    return "パーティクル";
  }
  if (entity.components.some((component) => component.type === "spawn-point")) {
    return "スポーン";
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
  return "エンティティ";
}

function getEntityIcon(entity: SceneEntity) {
  if (entity.modelNode) return EDITOR_ICONS.model;
  if (entity.components.some((component) => component.type === "mesh")) {
    return EDITOR_ICONS.model;
  }
  if (entity.components.some((component) => component.type === "light")) {
    return EDITOR_ICONS.light;
  }
  if (entity.components.some((component) => component.type === "rigid-body")) {
    return EDITOR_ICONS.axis;
  }
  if (entity.components.some((component) => component.type === "audio-source")) {
    return EDITOR_ICONS.audio;
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

const HIERARCHY_KIND_FILTERS = [
  { id: "mesh", label: "メッシュ", icon: EDITOR_ICONS.model },
  { id: "light", label: "ライト", icon: EDITOR_ICONS.light },
  { id: "rigid-body", label: "Rigid Body", icon: EDITOR_ICONS.axis },
  { id: "collider", label: "コライダー", icon: EDITOR_ICONS.primitive },
  { id: "audio-source", label: "オーディオ", icon: EDITOR_ICONS.audio },
  { id: "particle-emitter", label: "パーティクル", icon: EDITOR_ICONS.particle },
  { id: "animation", label: "アニメーション", icon: EDITOR_ICONS.animation },
  { id: "spawn-point", label: "スポーン", icon: EDITOR_ICONS.spawn },
  { id: "xrift-component", label: "XRift Component", icon: EDITOR_ICONS.component },
] as const satisfies ReadonlyArray<{
  id: HierarchyKindFilter;
  label: string;
  icon: (typeof EDITOR_ICONS)[keyof typeof EDITOR_ICONS];
}>;

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
  selectedEntityIds,
  readOnly,
  projectKind,
  onSelectionChange,
  onAssignMaterial,
  onDropSceneAsset,
  onDropBuiltinPrefab,
  builtinPrefabRecipes,
  onEntityEnabledChange,
  onCreateXriftObject,
  onCreateComponentObject,
  onCommand,
  renameRequest,
  onRename,
}: {
  scene: SceneDocument;
  selection: EditorSelection;
  selectedEntityIds: readonly string[];
  readOnly: boolean;
  projectKind: VisualProjectKind;
  onSelectionChange: (entityIds: string[], primaryEntityId: string | null) => void;
  onAssignMaterial: (entityId: string, materialAssetId: string) => void;
  onDropSceneAsset: (assetId: string, parentEntityId: string | null) => void;
  onDropBuiltinPrefab: (recipeId: string, parentEntityId: string | null) => void;
  builtinPrefabRecipes: readonly BuiltinPrefabRecipe[];
  onEntityEnabledChange: (entityId: string, enabled: boolean) => void;
  onCreateXriftObject: (definitionId: string) => void;
  onCreateComponentObject: (definitionId: string) => void;
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
  const [collapsedEntityIds, setCollapsedEntityIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [filterQuery, setFilterQuery] = useState("");
  const [kindFilters, setKindFilters] = useState<Set<HierarchyKindFilter>>(
    () => new Set(),
  );
  const filterResult = useMemo(
    () => getHierarchyFilterResult(scene, filterQuery, kindFilters),
    [filterQuery, kindFilters, scene],
  );
  const rows = useMemo(
    () => flattenHierarchy(scene, collapsedEntityIds, filterResult),
    [collapsedEntityIds, filterResult, scene],
  );
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
  const selectedEntityIdSet = useMemo(
    () => new Set(selectedEntityIds),
    [selectedEntityIds],
  );
  const replaceDropTarget = (target: HierarchyDropTarget | null) => {
    setDropTarget((current) =>
      sameDropTarget(current, target) ? current : target,
    );
  };
  const replaceAssetDropTarget = (target: {
    kind: "entity" | "root";
    entityId?: string;
    message: string;
  } | null) => {
    setAssetDropTarget((current) =>
      sameAssetDropTarget(current, target) ? current : target,
    );
  };
  const selectedEntityId =
    selection?.kind === "entity" && scene.entities[selection.id]
      ? selection.id
      : null;
  const selectionAnchorRef = useRef<string | null>(selectedEntityId);

  useEffect(() => {
    setCollapsedEntityIds((current) => {
      const existing = [...current].filter((entityId) =>
        Boolean(scene.entities[entityId]),
      );
      return existing.length === current.size ? current : new Set(existing);
    });
  }, [scene.entities]);

  useEffect(() => {
    if (!selectedEntityId) return;
    const ancestorIds = new Set<string>();
    const visited = new Set<string>([selectedEntityId]);
    let parentId = scene.entities[selectedEntityId]?.parentId ?? null;
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      ancestorIds.add(parentId);
      parentId = scene.entities[parentId]?.parentId ?? null;
    }
    if (ancestorIds.size === 0) return;
    setCollapsedEntityIds((current) => {
      if (![...ancestorIds].some((entityId) => current.has(entityId))) {
        return current;
      }
      const next = new Set(current);
      ancestorIds.forEach((entityId) => next.delete(entityId));
      return next;
    });
  }, [scene.sceneId, selectedEntityId]);

  const toggleEntityCollapsed = (entityId: string) => {
    setCollapsedEntityIds((current) => {
      const next = new Set(current);
      if (next.has(entityId)) next.delete(entityId);
      else next.add(entityId);
      return next;
    });
  };

  const toggleKindFilter = (kind: HierarchyKindFilter) => {
    setKindFilters((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  const clearHierarchyFilters = () => {
    setFilterQuery("");
    setKindFilters(new Set());
  };

  const selectEntity = (entityId: string, event?: MouseEvent<HTMLElement>) => {
    const currentIds = selectedEntityIds.filter((id) => Boolean(scene.entities[id]));
    const additive = Boolean(event?.ctrlKey || event?.metaKey);
    if (event?.shiftKey && selectionAnchorRef.current) {
      const anchorIndex = rows.findIndex((row) => row.entity.id === selectionAnchorRef.current);
      const targetIndex = rows.findIndex((row) => row.entity.id === entityId);
      if (anchorIndex >= 0 && targetIndex >= 0) {
        const start = Math.min(anchorIndex, targetIndex);
        const end = Math.max(anchorIndex, targetIndex);
        onSelectionChange(rows.slice(start, end + 1).map((row) => row.entity.id), entityId);
        return;
      }
    }
    if (additive) {
      const nextIds = currentIds.includes(entityId)
        ? currentIds.filter((id) => id !== entityId)
        : [...currentIds, entityId];
      onSelectionChange(nextIds, nextIds.includes(entityId) ? entityId : nextIds[nextIds.length - 1] ?? null);
      selectionAnchorRef.current = entityId;
      return;
    }
    selectionAnchorRef.current = entityId;
    onSelectionChange([entityId], entityId);
  };

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
      replaceDropTarget(target);
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
      className="relative row-span-2 flex min-h-0 flex-col border-r border-editor-border bg-editor-canvas"
      aria-labelledby="hierarchy-heading"
      onContextMenu={openContextMenu}
      onPointerDown={() => contextMenu && setContextMenu(null)}
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-editor-border bg-editor-surface px-3">
        <h2
          id="hierarchy-heading"
          className="text-[13px] font-semibold text-editor-text"
        >
          Hierarchy
        </h2>
        <div className="flex items-center gap-1.5">
          {selectedEntityIds.length > 0 ? (
            <button
              type="button"
              disabled={readOnly}
              onClick={() =>
                onCommand("edit.delete")
              }
              title={
                readOnly
                  ? "Playを停止するとEntityを削除できます"
                  : commandTitle(`${selectedEntityIds.length}件のEntityを削除`, "edit.delete")
              }
              className="flex h-7 items-center gap-1 rounded border border-editor-border bg-editor-surface px-2 text-xs font-semibold text-editor-muted transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <EDITOR_ICONS.delete size={12} aria-hidden="true" />
              {selectedEntityIds.length > 1 ? `${selectedEntityIds.length}件を削除` : "削除"}
            </button>
          ) : null}
          <span className="rounded bg-editor-subtle px-1.5 py-0.5 text-xs tabular-nums text-editor-muted">
            {filterResult
              ? `${filterResult.matchingEntityIds.size}/${Object.keys(scene.entities).length}`
              : Object.keys(scene.entities).length}
          </span>
        </div>
      </div>
      <div className="shrink-0 border-b border-editor-border bg-editor-surface px-2 py-1.5">
        <div className="relative">
          <EDITOR_ICONS.search
            size={13}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-editor-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            value={filterQuery}
            onChange={(event) => setFilterQuery(event.currentTarget.value)}
            aria-label="Hierarchyを検索"
            placeholder="名前・種類・状態で検索"
            className="h-7 w-full rounded border border-editor-border bg-white pl-7 pr-7 text-xs text-editor-text outline-none placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
          {filterQuery ? (
            <button
              type="button"
              onClick={() => setFilterQuery("")}
              aria-label="Hierarchyの検索をクリア"
              title="検索をクリア"
              className="absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-editor-muted hover:bg-editor-subtle hover:text-editor-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              <EDITOR_ICONS.close size={12} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <div
          className="mt-1 flex items-center gap-0.5"
          role="group"
          aria-label="Entityの種類で絞り込み"
        >
          {HIERARCHY_KIND_FILTERS.map((filter) => {
            const active = kindFilters.has(filter.id);
            const FilterIcon = filter.icon;
            return (
              <button
                key={filter.id}
                type="button"
                data-hierarchy-kind-filter={filter.id}
                aria-pressed={active}
                aria-label={`${filter.label}で絞り込み`}
                title={`${filter.label}だけ表示${active ? "（選択解除）" : ""}`}
                onClick={() => toggleKindFilter(filter.id)}
                className={`flex h-6 min-w-0 flex-1 items-center justify-center rounded border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
                  active
                    ? "border-violet-500 bg-violet-100 text-violet-800"
                    : "border-transparent text-editor-muted hover:border-editor-border hover:bg-editor-subtle hover:text-editor-text"
                }`}
              >
                <FilterIcon size={13} aria-hidden="true" />
              </button>
            );
          })}
        </div>
        {filterResult ? (
          <span className="sr-only" role="status">
            {filterResult.matchingEntityIds.size}件に一致
          </span>
        ) : null}
      </div>
      {readOnly ? (
        <div className="border-b border-violet-200 bg-violet-50 px-3 py-2 text-xs leading-4 text-violet-800">
          Play中は構造を変更できません。Entityを選ぶと、対応する編集データをInspectorで調整できます。
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
          replaceAssetDropTarget({
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
                replaceAssetDropTarget({
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
              replaceDropTarget(target);
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
        {filterResult && filterResult.matchingEntityIds.size === 0 ? (
          <div className="mx-2 rounded border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-xs leading-5 text-slate-500">
            <p>
              {filterQuery.trim()
                ? kindFilters.size > 0
                  ? `「${filterQuery.trim()}」と選択した種類に一致するEntityはありません。`
                  : `「${filterQuery.trim()}」に一致するEntityはありません。`
                : "選択した種類のEntityはありません。"}
            </p>
            <button
              type="button"
              onClick={clearHierarchyFilters}
              className="mt-2 rounded border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50"
            >
              条件をクリア
            </button>
          </div>
        ) : null}
        {rows.map(
          ({
            entity,
            depth,
            effectiveEnabled,
            childCount,
            collapsed,
            canCollapse,
            matchesFilter,
          }) => {
          const selected = selectedEntityIdSet.has(entity.id);
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
                aria-expanded={childCount > 0 ? !collapsed : undefined}
                className="flex w-full items-center gap-1.5 border-l-2 border-violet-700 bg-violet-100 py-1 pr-1.5 shadow-[inset_0_0_0_1px_#c4b5fd]"
                style={{ paddingLeft: `${4 + depth * 11}px` }}
              >
                {canCollapse ? (
                  <button
                    type="button"
                    aria-label={`${entity.name}を${collapsed ? "展開" : "折り畳む"}`}
                    aria-expanded={!collapsed}
                    title={`${entity.name}の子Entity ${childCount}件を${collapsed ? "展開" : "折り畳む"}`}
                    onClick={() => toggleEntityCollapsed(entity.id)}
                    className="flex h-5 w-4 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-200 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                  >
                    {collapsed ? (
                      <EDITOR_ICONS.collapsed size={14} aria-hidden="true" />
                    ) : (
                      <EDITOR_ICONS.expanded size={14} aria-hidden="true" />
                    )}
                  </button>
                ) : childCount > 0 ? (
                  <span
                    className="flex h-5 w-4 shrink-0 items-center justify-center text-slate-400"
                    title="検索中は一致する階層を自動展開します"
                  >
                    <EDITOR_ICONS.expanded size={14} aria-hidden="true" />
                  </span>
                ) : (
                  <span className="h-5 w-4 shrink-0" aria-hidden="true" />
                )}
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
              aria-expanded={childCount > 0 ? !collapsed : undefined}
              data-hierarchy-entity-id={entity.id}
              onContextMenu={(event) => {
                event.stopPropagation();
                if (!readOnly && !selected) selectEntity(entity.id);
                openContextMenu(event, entity.id);
              }}
              onDragOverCapture={(event) => {
                if (readOnly) return;
                if (hasEditorDragData(event.dataTransfer, MATERIAL_DRAG_MIME)) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = entity.components.some(
                    (component) => component.type === "mesh",
                  ) || Boolean(entity.modelNode?.sourceMaterialIndices.length)
                    ? "copy"
                    : "none";
                  return;
                }
                if (hasPlaceableDrop(event)) {
                  event.preventDefault();
                  event.stopPropagation();
                  event.dataTransfer.dropEffect = "copy";
                  replaceAssetDropTarget({
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
                replaceDropTarget(target);
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
                    ? "border-violet-700 bg-violet-100 text-violet-950 shadow-[inset_0_0_0_1px_#c4b5fd]"
                    : "border-transparent text-slate-700 hover:bg-white hover:text-slate-900"
              } ${effectiveEnabled || selected ? "opacity-100" : "opacity-50"}`}
              style={{ paddingLeft: `${3 + depth * 11}px` }}
            >
              {canCollapse ? (
                <button
                  type="button"
                  data-no-entity-drag="true"
                  aria-label={`${entity.name}を${collapsed ? "展開" : "折り畳む"}`}
                  aria-expanded={!collapsed}
                  title={`${entity.name}の子Entity ${childCount}件を${collapsed ? "展開" : "折り畳む"}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleEntityCollapsed(entity.id);
                  }}
                  className="flex w-4 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-200 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                >
                  {collapsed ? (
                    <EDITOR_ICONS.collapsed size={14} aria-hidden="true" />
                  ) : (
                    <EDITOR_ICONS.expanded size={14} aria-hidden="true" />
                  )}
                </button>
              ) : childCount > 0 ? (
                <span
                  className="flex w-4 shrink-0 items-center justify-center text-slate-400"
                  title="検索中は一致する階層を自動展開します"
                >
                  <EDITOR_ICONS.expanded size={14} aria-hidden="true" />
                </span>
              ) : (
                <span className="w-4 shrink-0" aria-hidden="true" />
              )}
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
                onClick={(event) => selectEntity(entity.id, event)}
                onDragStart={(event) => {
                  writeEditorDragData(event.dataTransfer, {
                    [ENTITY_DRAG_MIME]: entity.id,
                  });
                  // Hierarchy drop reparents (move); Assets drop creates a Prefab
                  // (copy). One drag source advertises both editor intents.
                  event.dataTransfer.effectAllowed = "copyMove";
                  setDragEntityId(entity.id);
                  setDropTarget(null);
                  selectEntity(entity.id);
                }}
                onDragEnd={() => {
                  clearEditorDragData();
                  setDragEntityId(null);
                  setDropTarget(null);
                }}
                className="flex min-w-0 flex-1 cursor-grab select-none items-center gap-1.5 py-1 pr-1 text-left active:cursor-grabbing disabled:cursor-default"
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${
                    selected
                      ? "bg-violet-700 text-white"
                      : "text-slate-500"
                  }`}
                  title={getEntityTypeLabel(entity)}
                >
                  <EntityIcon size={13} aria-hidden="true" />
                </span>
                <span
                  className={`min-w-0 flex-1 truncate ${
                    filterResult && matchesFilter
                      ? "font-semibold text-violet-800"
                      : ""
                  }`}
                >
                  {entity.name}
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
                className="my-0.5 flex w-6 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-200 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-not-allowed disabled:opacity-30"
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
                  onCommand(
                    "edit.delete",
                    selected ? undefined : { entityId: entity.id },
                  );
                }}
                aria-label={`${entity.name}を削除`}
                title={
                  readOnly
                    ? "Playを停止するとEntityを削除できます"
                    : commandTitle(`${entity.name}を削除`, "edit.delete")
                }
                className={`my-0.5 flex w-6 shrink-0 items-center justify-center rounded text-slate-500 transition-opacity hover:bg-rose-100 hover:text-rose-700 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:cursor-not-allowed disabled:opacity-30 ${
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
        },
        )}
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
                      onCommand(
                        commandId,
                        commandId === "edit.delete" && entityId && selectedEntityIds.includes(entityId)
                          ? undefined
                          : { entityId },
                      );
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
              <details open className="overflow-hidden rounded border border-slate-200">
                <summary className="cursor-pointer select-none bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                  Add Component ({getEditorComponentMenuDefinitions(projectKind).length})
                </summary>
                <div className="space-y-1 border-t border-slate-100 p-1">
                  {(["core", "rendering", "physics", "media", "world"] as const).map(
                    (category) => {
                      const definitions = getEditorComponentMenuDefinitions(
                        projectKind,
                      ).filter((definition) => definition.category === category);
                      if (definitions.length === 0) return null;
                      return (
                        <details key={category} open={category === "rendering"}>
                          <summary className="cursor-pointer select-none rounded px-1.5 py-1 text-xs font-medium capitalize text-slate-500 hover:bg-slate-50">
                            {category} ({definitions.length})
                          </summary>
                          <div className="space-y-0.5 pl-1">
                            {definitions.map((definition) => {
                              const DefinitionIcon = getEditorComponentIcon(definition);
                              const entity = contextMenu.entityId
                                ? scene.entities[contextMenu.entityId]
                                : undefined;
                              const duplicate =
                                !definition.allowMultiple &&
                                entity?.components.some((component) =>
                                  definition.componentType === "builtin-mesh"
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
                                  {duplicate ? (
                                    <span className="text-xs text-slate-400">追加済み</span>
                                  ) : null}
                                </button>
                              );
                            })}
                          </div>
                        </details>
                      );
                    },
                  )}
                </div>
              </details>
            </>
          ) : null}
          {!contextMenu.entityId ? (
            <details open className="overflow-hidden rounded border border-slate-200">
              <summary className="cursor-pointer select-none bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                Add Component ({getEditorComponentMenuDefinitions(projectKind).length})
              </summary>
              <div className="space-y-1 border-t border-slate-100 p-1">
                {(["core", "rendering", "physics", "media", "world"] as const).map(
                  (category) => {
                    const definitions = getEditorComponentMenuDefinitions(
                      projectKind,
                    ).filter((definition) => definition.category === category);
                    if (definitions.length === 0) return null;
                    return (
                      <details key={category} open={category === "rendering"}>
                        <summary className="cursor-pointer select-none rounded px-1.5 py-1 text-xs font-medium capitalize text-slate-500 hover:bg-slate-50">
                          {category} ({definitions.length})
                        </summary>
                        <div className="space-y-0.5 pl-1">
                          {definitions.map((definition) => {
                            const DefinitionIcon = getEditorComponentIcon(definition);
                            const canCreateHost = ![
                              "core.transform",
                              "physics.mesh-collider",
                            ].includes(definition.id);
                            return (
                              <button
                                key={definition.id}
                                type="button"
                                disabled={readOnly || !canCreateHost}
                                onClick={() => {
                                  setContextMenu(null);
                                  onCreateComponentObject(definition.id);
                                }}
                                className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-violet-50 hover:text-violet-800 disabled:opacity-45"
                              >
                                <span className="flex min-w-0 items-center gap-2">
                                  <DefinitionIcon size={14} className="shrink-0" aria-hidden="true" />
                                  <span className="truncate">{definition.label}</span>
                                </span>
                                <span className="text-xs text-slate-400">
                                  {canCreateHost ? "作成" : "Entityを選択"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </details>
                    );
                  },
                )}
              </div>
            </details>
          ) : null}
          <div className="my-1 border-t border-slate-200" />
          <details className="overflow-hidden rounded border border-slate-200">
            <summary className="cursor-pointer select-none bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">
              XRift Component ({getXriftComponentMenuGroups(projectKind).reduce(
                (count, group) => count + group.components.length,
                0,
              )})
            </summary>
            <div className="space-y-1 border-t border-slate-100 p-1">
              {getXriftComponentMenuGroups(projectKind).map((group) => (
                <details key={group.category}>
                  <summary className="cursor-pointer select-none rounded px-1.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50">
                    {group.label} ({group.components.length})
                  </summary>
                  <div className="space-y-0.5 pl-1">
                    {group.components.map((definition) => {
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
                    })}
                  </div>
                </details>
              ))}
            </div>
          </details>
          <div className="my-1 border-t border-slate-200" />
          <details className="overflow-hidden rounded border border-slate-200">
            <summary className="cursor-pointer select-none bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">
              XRift Prefab ({builtinPrefabRecipes.length})
            </summary>
            <div className="space-y-0.5 border-t border-slate-100 p-1">
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
            </div>
          </details>
          <div className="my-1 border-t border-slate-200" />
          <details open className="overflow-hidden rounded border border-slate-200">
            <summary className="cursor-pointer select-none bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">
              Scene Object ({BUILTIN_PRIMITIVE_CREATION_CATALOG.length + 1})
            </summary>
            <div className="space-y-0.5 border-t border-slate-100 p-1">
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
          </details>
        </div>
      ) : null}
    </aside>
  );
}
