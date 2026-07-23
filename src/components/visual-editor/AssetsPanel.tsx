import {
  useRef,
  useEffect,
  useState,
  type ChangeEvent,
  type DragEvent,
  type MouseEvent,
  type ReactElement,
} from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  LoaderCircle,
  PanelBottomOpen,
  Store,
} from "lucide-react";
import type {
  AssetManifest,
  BuiltinPrefabRecipe,
  EditorCommandId,
  SceneAsset,
  VisualProjectKind,
} from "../../lib/visual-editor";
import {
  BUILTIN_PREFAB_DRAG_MIME,
  ASSET_IMPORT_ACCEPT,
  getXriftComponentDefinition,
  isEnvironmentTextureAsset,
  isScenePlaceableAsset,
  listBuiltinPrefabRecipes,
  resolveAssetCreationFolderId,
} from "../../lib/visual-editor";
import { AssetThumbnail } from "./AssetQuickEditor";
import { commandTitle, EDITOR_ICONS, type EditorIconName } from "./editor-icons";
import { formatFileSize, getDragKind } from "./editor-utils";
import {
  ASSET_LIBRARY_FOLDER_DRAG_MIME,
  ASSET_LIBRARY_ITEM_DRAG_MIME,
  ENTITY_DRAG_MIME,
  type EditorMode,
  type PendingImport,
} from "./types";
import {
  clearEditorDragData,
  hasEditorDragData,
  readEditorDragData,
  writeEditorDragData,
} from "./editor-drag-data";
import {
  clearAssetCardDragData,
  writeAssetCardDragData,
} from "./asset-card-drag";
import { hasActiveAssetImport } from "./asset-operation-lock";

type ViewMode = "grid" | "list";
type ContextMenuState = {
  x: number;
  y: number;
  assetId?: string;
  folderId?: string;
  creationFolderId: string | null;
} | null;
type BrowserFolder = {
  id: string;
  name: string;
  icon: EditorIconName;
  kind?: SceneAsset["kind"];
  custom?: boolean;
  builtinPrefabs?: boolean;
};

type AssetFolderTreeProps = {
  assets: AssetManifest;
  customFolders: BrowserFolder[];
  kindFolders: BrowserFolder[];
  activeFolderId: string | null;
  folderItemCount: (folder: BrowserFolder) => number;
  assetMutationLocked: boolean;
  onActiveFolderChange: (folderId: string | null) => void;
  onMoveAsset: (assetId: string, folderId: string | null) => void;
  onMoveFolder: (folderId: string, parentId: string | null) => void;
};

const XRIFT_PREFABS_FOLDER_ID = "virtual-xrift-prefabs";

const KIND_FOLDERS: BrowserFolder[] = [
  {
    id: XRIFT_PREFABS_FOLDER_ID,
    name: "XRift Prefabs",
    icon: "prefab",
    builtinPrefabs: true,
  },
  { id: "folder-models", name: "Models", icon: "model", kind: "model" },
  { id: "folder-materials", name: "Materials", icon: "material", kind: "material" },
  { id: "folder-textures", name: "Textures", icon: "texture", kind: "texture" },
  { id: "folder-audio", name: "Audio", icon: "audio", kind: "audio" },
  { id: "folder-particles", name: "Particles", icon: "particle", kind: "particle" },
  { id: "folder-interactivity", name: "Interactivity", icon: "asset", kind: "interactivity" },
  { id: "folder-prefabs", name: "Prefabs", icon: "prefab", kind: "template" },
];

function assetKindLabel(asset: SceneAsset): string {
  switch (asset.kind) {
    case "primitive":
      return "Primitive";
    case "model":
      return "Model";
    case "material":
      return "Material";
    case "texture":
      return isEnvironmentTextureAsset(asset) ? "Texture / HDRI" : "Texture";
    case "skybox":
      return "Texture / HDRI";
    case "particle":
      return "Particle";
    case "interactivity":
      return "KHR Interactivity";
    case "audio":
      return "Audio";
    case "template":
      return "Prefab";
  }
}

function assetIconName(asset: SceneAsset): EditorIconName {
  switch (asset.kind) {
    case "model":
      return "model";
    case "material":
      return "material";
    case "texture":
      return "texture";
    case "skybox":
      return "texture";
    case "particle":
      return "particle";
    case "interactivity":
      return "asset";
    case "audio":
      return "audio";
    case "template":
      return "prefab";
    case "primitive":
      return "primitive";
  }
}

function assetSourceLabel(asset: SceneAsset): string {
  if (asset.attribution) {
    return `${asset.attribution.providerName} · ${asset.attribution.licenseName}`;
  }
  if (asset.source.kind === "project") return asset.source.relativePath;
  if (asset.source.kind === "builtin") return asset.source.key;
  return "document";
}

function assetFolderPath(assets: AssetManifest, asset: SceneAsset): string {
  const segments: string[] = [];
  const visited = new Set<string>();
  let folderId = asset.folderId ?? null;
  while (folderId && !visited.has(folderId)) {
    visited.add(folderId);
    const folder = assets.folders?.[folderId];
    if (!folder) {
      segments.unshift("不明なフォルダー");
      break;
    }
    segments.unshift(folder.name);
    folderId = folder.parentId;
  }
  return ["Assets", ...segments].join(" / ");
}

function importedModelFolderIds(assets: AssetManifest): Set<string> {
  const folders = assets.folders ?? {};
  return new Set(
    Object.values(assets.assets)
      .filter(
        (asset) =>
          asset.kind === "model" &&
          asset.folderId &&
          folders[asset.folderId]?.name.toLocaleLowerCase() ===
            asset.name.toLocaleLowerCase() &&
          Object.values(folders).some(
            (folder) =>
              folder.parentId === asset.folderId &&
              folder.name === "Materials",
          ) &&
          Object.values(folders).some(
            (folder) =>
              folder.parentId === asset.folderId && folder.name === "Textures",
          ),
      )
      .map((asset) => asset.folderId as string),
  );
}

function AssetFolderTree({
  assets,
  customFolders,
  kindFolders,
  activeFolderId,
  folderItemCount,
  assetMutationLocked,
  onActiveFolderChange,
  onMoveAsset,
  onMoveFolder,
}: AssetFolderTreeProps) {
  const FolderIcon = EDITOR_ICONS.folder;
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(customFolders.map((folder) => folder.id)),
  );
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeFolderId || !assets.folders?.[activeFolderId]) return;
    setExpandedFolders((current) => {
      const next = new Set(current);
      let folderId: string | null = activeFolderId;
      const visited = new Set<string>();
      while (folderId && !visited.has(folderId)) {
        visited.add(folderId);
        next.add(folderId);
        folderId = assets.folders?.[folderId]?.parentId ?? null;
      }
      return next;
    });
  }, [activeFolderId, assets.folders]);

  const childrenOf = (parentId: string | null) =>
    customFolders.filter(
      (folder) => (assets.folders?.[folder.id]?.parentId ?? null) === parentId,
    );

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const handleDrop = (event: DragEvent<HTMLElement>, folderId: string | null) => {
    const assetId = readEditorDragData(
      event.dataTransfer,
      ASSET_LIBRARY_ITEM_DRAG_MIME,
    ).trim();
    const sourceFolderId = readEditorDragData(
      event.dataTransfer,
      ASSET_LIBRARY_FOLDER_DRAG_MIME,
    ).trim();
    if (!assetId && !sourceFolderId) return;
    event.preventDefault();
    event.stopPropagation();
    clearEditorDragData();
    setDropTargetId(null);
    if (assetMutationLocked) return;
    if (assetId) onMoveAsset(assetId, folderId);
    else if (sourceFolderId) onMoveFolder(sourceFolderId, folderId);
  };

  const handleDragOver = (event: DragEvent<HTMLElement>, folderId: string | null) => {
    const hasLibraryPayload =
      hasEditorDragData(event.dataTransfer, ASSET_LIBRARY_ITEM_DRAG_MIME) ||
      hasEditorDragData(event.dataTransfer, ASSET_LIBRARY_FOLDER_DRAG_MIME);
    if (!hasLibraryPayload) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = assetMutationLocked ? "none" : "move";
    setDropTargetId(assetMutationLocked ? null : folderId ?? "__root__");
  };

  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    const target = event.relatedTarget;
    if (!(target instanceof Node && event.currentTarget.contains(target))) {
      setDropTargetId(null);
    }
  };

  const renderCustomFolder = (folder: BrowserFolder, depth: number): ReactElement => {
    const children = childrenOf(folder.id);
    const expanded = expandedFolders.has(folder.id);
    const FolderIcon = EDITOR_ICONS.folder;
    const ChevronIcon = expanded ? ChevronDown : ChevronRight;
    const isActive = activeFolderId === folder.id;
    const isDropTarget = dropTargetId === folder.id;

    return (
      <div key={folder.id}>
        <div
          className={`group flex min-w-0 items-center gap-1 rounded-md pr-1 text-[13px] ${
            isDropTarget
              ? "bg-brand-100 text-brand-900 ring-1 ring-brand-300"
              : isActive
                ? "bg-brand-50 font-medium text-brand-900"
                : "text-editor-muted hover:bg-editor-subtle hover:text-editor-text"
          }`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onDragOver={(event) => handleDragOver(event, folder.id)}
          onDragLeave={handleDragLeave}
          onDrop={(event) => handleDrop(event, folder.id)}
        >
          {children.length > 0 ? (
            <button
              type="button"
              className="flex size-6 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-white hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
              aria-label={expanded ? `${folder.name}を折りたたむ` : `${folder.name}を展開する`}
              onClick={() => toggleFolder(folder.id)}
            >
              <ChevronIcon size={13} aria-hidden="true" />
            </button>
          ) : (
            <span className="w-6" aria-hidden="true" />
          )}
          <button
            type="button"
            draggable={!assetMutationLocked}
            data-editor-drag-source="asset-folder"
            onDragStart={(event) => {
              if (assetMutationLocked) return;
              writeEditorDragData(event.dataTransfer, {
                [ASSET_LIBRARY_FOLDER_DRAG_MIME]: folder.id,
              });
              event.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => {
              clearEditorDragData();
              setDropTargetId(null);
            }}
            onClick={() => onActiveFolderChange(folder.id)}
            className="flex min-h-7 min-w-0 flex-1 cursor-grab items-center gap-2 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-300 active:cursor-grabbing"
            title={`${folder.name}を開く`}
          >
            {expanded ? (
              <FolderIcon size={15} className="shrink-0 text-brand-500" aria-hidden="true" />
            ) : (
              <FolderIcon size={14} className="shrink-0 text-slate-400" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1 truncate">{folder.name}</span>
          </button>
        </div>
        {expanded
          ? children.map((child) => renderCustomFolder(child, depth + 1))
          : null}
      </div>
    );
  };

  const renderCollection = (folder: BrowserFolder) => {
    const isActive = activeFolderId === folder.id;
    const KindIcon = EDITOR_ICONS[folder.icon];
    return (
      <button
        key={folder.id}
        type="button"
        onClick={() => onActiveFolderChange(folder.id)}
        className={`flex min-h-7 w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-300 ${
          isActive
            ? "bg-brand-50 font-medium text-brand-900"
            : "text-editor-muted hover:bg-editor-subtle hover:text-editor-text"
        }`}
        title={`${folder.name}のアセットを表示`}
      >
        <KindIcon size={14} className="shrink-0 text-slate-500" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{folder.name}</span>
        <span className="tabular-nums text-[11px] text-slate-400">
          {folderItemCount(folder)}
        </span>
      </button>
    );
  };

  return (
    <aside className="flex w-48 shrink-0 flex-col border-r border-editor-border bg-editor-surface" aria-label="Asset folders">
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto px-2 py-2.5">
        <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          ライブラリ
        </p>
        <div
          onDragOver={(event) => handleDragOver(event, null)}
          onDragLeave={handleDragLeave}
          onDrop={(event) => handleDrop(event, null)}
          className={`rounded-md ${dropTargetId === "__root__" ? "bg-brand-100 ring-1 ring-brand-300" : ""}`}
        >
          <button
            type="button"
            onClick={() => onActiveFolderChange(null)}
            className={`flex min-h-8 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-300 ${
              activeFolderId === null
                ? "bg-editor-subtle font-medium text-editor-text"
                : "text-editor-text hover:bg-editor-subtle"
            }`}
            title="Assets直下を表示"
          >
            <FolderIcon size={15} className="text-slate-500" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">Assets</span>
          </button>
        </div>

        <p className="mb-1 mt-3 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          種類
        </p>
        <div className="space-y-0.5">{kindFolders.map(renderCollection)}</div>

        <p className="mb-1 mt-3 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          フォルダー
        </p>
        <div className="space-y-0.5">
          {childrenOf(null).map((folder) => renderCustomFolder(folder, 0))}
          {customFolders.length === 0 ? (
            <p className="px-2 py-2 text-[11px] leading-4 text-slate-400">
              フォルダーはまだありません。右クリックから作成できます。
            </p>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function matchesAssetSearch(
  asset: SceneAsset,
  folderPath: string,
  query: string,
): boolean {
  const tokens = query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const searchable = [
    asset.name,
    asset.kind,
    assetKindLabel(asset),
    assetSourceLabel(asset),
    folderPath,
  ]
    .join(" ")
    .toLocaleLowerCase();
  return tokens.every((token) => searchable.includes(token));
}

function importStatusLabel(status: PendingImport["status"]): string {
  switch (status) {
    case "waiting-save":
      return "保存待ち";
    case "queued":
      return "待機中";
    case "reading":
      return "読込中";
    case "processing":
      return "解析・生成中";
    case "committing":
      return "確定中";
    case "succeeded":
      return "完了";
    case "updated":
      return "既存Assetを更新";
    case "duplicate":
      return "既存Assetを再利用";
    case "failed":
      return "失敗";
  }
}

function importStatusClass(status: PendingImport["status"]): string {
  if (status === "failed") return "text-rose-700";
  if (status === "succeeded" || status === "updated") return "text-emerald-700";
  if (status === "duplicate") return "text-sky-700";
  return "text-amber-800";
}

function canRemoveImport(status: PendingImport["status"]): boolean {
  return (
    status === "waiting-save" ||
    status === "succeeded" ||
    status === "updated" ||
    status === "duplicate" ||
    status === "failed"
  );
}

function AssetCard({
  asset,
  assets,
  projectPath,
  selected,
  viewMode,
  readOnly,
  onSelect,
  onPlace,
  onOpen,
  onDelete,
  onOpenContext,
  folderPath,
}: {
  asset: SceneAsset;
  assets: AssetManifest;
  projectPath?: string;
  selected: boolean;
  viewMode: ViewMode;
  readOnly: boolean;
  onSelect: (assetId: string, event: MouseEvent<HTMLButtonElement>) => void;
  onPlace: () => void;
  onOpen: () => void;
  onDelete: () => void;
  onOpenContext: (event: MouseEvent<HTMLElement>) => void;
  folderPath?: string;
}) {
  const KindIcon = EDITOR_ICONS[assetIconName(asset)];
  const DeleteIcon = EDITOR_ICONS.delete;
  const placeable = isScenePlaceableAsset(asset);
  const dragDescription =
    asset.kind === "material"
      ? "Meshへ適用、またはFolderへ移動"
      : placeable
        ? "Sceneへ配置、またはFolderへ移動"
        : "Folderへ移動";
  const handleDragStart = (event: DragEvent<HTMLElement>) => {
    const origin = event.target;
    if (
      origin instanceof HTMLElement &&
      origin.closest("[data-no-asset-drag='true']")
    ) {
      event.preventDefault();
      return;
    }
    writeAssetCardDragData(event.dataTransfer, asset);
    event.dataTransfer.effectAllowed = "copyMove";
  };

  if (viewMode === "list") {
    return (
      <div
        onContextMenu={onOpenContext}
        className={`group relative grid min-w-0 grid-cols-[46px_minmax(110px,1fr)_90px_70px_52px_28px] items-center gap-2 rounded-md border px-2 py-1 text-left ${
          selected
            ? "border-brand-300 bg-brand-50"
            : "border-transparent bg-editor-surface hover:bg-editor-subtle"
        }`}
      >
        <button
          type="button"
          draggable={!readOnly}
          onDragStart={handleDragStart}
          onDragEnd={clearAssetCardDragData}
          aria-pressed={selected}
          onClick={(event) => onSelect(asset.id, event)}
          onDoubleClick={() => onOpen()}
          title={commandTitle(`${asset.name}を選択／${dragDescription}`, "SelectAsset")}
          className="col-span-4 grid cursor-grab grid-cols-[46px_minmax(110px,1fr)_90px_70px] items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 active:cursor-grabbing"
        >
          <span
            data-asset-drag-preview="true"
            className="pointer-events-none h-9 overflow-hidden rounded-md bg-editor-subtle"
          >
            <AssetThumbnail asset={asset} assets={assets} projectPath={projectPath} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold text-slate-800">{asset.name}</span>
            <span className="block truncate text-xs text-slate-500">
              {assetSourceLabel(asset)}
            </span>
            {folderPath ? (
              <span className="block truncate text-[11px] text-slate-400" title={folderPath}>
                {folderPath}
              </span>
            ) : null}
          </span>
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <KindIcon size={12} aria-hidden="true" />
            {assetKindLabel(asset)}
          </span>
          <span className="text-right text-xs font-medium text-slate-500">{asset.status}</span>
        </button>
        {placeable ? (
          <button
            type="button"
            data-no-asset-drag="true"
            disabled={readOnly}
            onClick={(event) => {
              event.stopPropagation();
              onPlace();
            }}
            title={commandTitle(`${asset.name}をScene Rootへ配置`, "PlaceSceneAsset")}
            className="rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-40"
          >
            配置
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          data-no-asset-drag="true"
          disabled={readOnly}
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          title={commandTitle(`${asset.name}を削除`, "DeleteAsset")}
          aria-label={`${asset.name}を削除`}
          className={`rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-30 ${selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}
        >
          <DeleteIcon size={14} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div
      onContextMenu={onOpenContext}
      className={`group relative flex min-w-0 flex-col overflow-hidden rounded-lg border bg-editor-surface text-left transition-colors ${
        selected
          ? "border-brand-400 bg-brand-50/40 ring-1 ring-brand-200"
          : "border-editor-border/70 hover:border-slate-300 hover:bg-editor-subtle"
      }`}
    >
      <button
        type="button"
        draggable={!readOnly}
        onDragStart={handleDragStart}
        onDragEnd={clearAssetCardDragData}
        aria-pressed={selected}
        onClick={(event) => onSelect(asset.id, event)}
        onDoubleClick={() => onOpen()}
        title={commandTitle(`${asset.name}を選択／${dragDescription}`, "SelectAsset")}
        className="flex min-w-0 flex-1 cursor-grab flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-300 active:cursor-grabbing"
      >
        <span
          data-asset-drag-preview="true"
          className="pointer-events-none relative block h-16 w-full shrink-0 overflow-hidden border-b border-editor-border/70 bg-editor-subtle"
        >
          <AssetThumbnail asset={asset} assets={assets} projectPath={projectPath} />
          <span
            className="absolute left-1.5 top-1.5 flex items-center rounded bg-slate-950/80 p-1 text-white"
            title={assetKindLabel(asset)}
          >
            <KindIcon size={11} aria-hidden="true" />
            <span className="sr-only">{assetKindLabel(asset)}</span>
          </span>
          {asset.status !== "ready" ? (
            <span
              title={asset.status}
              aria-label={`状態: ${asset.status}`}
              className="absolute bottom-1.5 right-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800"
            >
              <EDITOR_ICONS.warning size={11} aria-hidden="true" />
              <span className="sr-only">{asset.status}</span>
            </span>
          ) : null}
        </span>
        <span className="min-w-0 px-2 py-1.5">
          <span className="block truncate text-xs font-semibold text-slate-800">{asset.name}</span>
          <span className="mt-0.5 block truncate text-xs text-slate-500">
            {folderPath ?? assetSourceLabel(asset)}
          </span>
          {folderPath ? (
            <span className="mt-0.5 block truncate text-[11px] text-slate-400" title={assetSourceLabel(asset)}>
              {assetSourceLabel(asset)}
            </span>
          ) : null}
        </span>
      </button>
      {placeable ? (
        <button
          type="button"
          data-no-asset-drag="true"
          disabled={readOnly}
          onClick={(event) => {
            event.stopPropagation();
            onPlace();
          }}
          title={commandTitle(`${asset.name}をScene Rootへ配置`, "PlaceSceneAsset")}
          className="border-t border-editor-border/70 bg-editor-subtle px-2 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-40"
        >
          Sceneへ配置
        </button>
      ) : null}
      <button
        type="button"
        data-no-asset-drag="true"
        disabled={readOnly}
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        title={commandTitle(`${asset.name}を削除`, "DeleteAsset")}
        aria-label={`${asset.name}を削除`}
        className={`absolute right-1.5 top-1.5 rounded bg-white/95 p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-30 ${selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}
      >
        <DeleteIcon size={13} aria-hidden="true" />
      </button>
    </div>
  );
}

function FolderCard({
  folder,
  viewMode,
  readOnly,
  onOpen,
  onDelete,
  onDropAsset,
  onDropFolder,
  onOpenContext,
}: {
  folder: BrowserFolder;
  viewMode: ViewMode;
  readOnly: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onDropAsset: (assetId: string) => void;
  onDropFolder: (folderId: string) => void;
  onOpenContext: (event: MouseEvent<HTMLElement>) => void;
}) {
  const [dropTarget, setDropTarget] = useState(false);
  const FolderIcon = EDITOR_ICONS.folder;
  const KindIcon = EDITOR_ICONS[folder.icon];
  const DeleteIcon = EDITOR_ICONS.delete;
  const acceptsLibraryDrop = Boolean(folder.custom) && !readOnly;
  const handleDragStart = (event: DragEvent<HTMLElement>) => {
    if (!folder.custom || readOnly) return;
    writeEditorDragData(event.dataTransfer, {
      [ASSET_LIBRARY_FOLDER_DRAG_MIME]: folder.id,
    });
    event.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    const hasLibraryPayload =
      hasEditorDragData(event.dataTransfer, ASSET_LIBRARY_ITEM_DRAG_MIME) ||
      hasEditorDragData(event.dataTransfer, ASSET_LIBRARY_FOLDER_DRAG_MIME);
    if (
      !acceptsLibraryDrop ||
      !hasLibraryPayload
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDropTarget(true);
  };
  const handleDrop = (event: DragEvent<HTMLElement>) => {
    const hasAsset = hasEditorDragData(
      event.dataTransfer,
      ASSET_LIBRARY_ITEM_DRAG_MIME,
    );
    const hasFolder = hasEditorDragData(
      event.dataTransfer,
      ASSET_LIBRARY_FOLDER_DRAG_MIME,
    );
    if (!hasAsset && !hasFolder) return;
    event.preventDefault();
    event.stopPropagation();
    const assetId = readEditorDragData(
      event.dataTransfer,
      ASSET_LIBRARY_ITEM_DRAG_MIME,
    ).trim();
    const folderId = readEditorDragData(
      event.dataTransfer,
      ASSET_LIBRARY_FOLDER_DRAG_MIME,
    ).trim();
    clearEditorDragData();
    setDropTarget(false);
    if (!acceptsLibraryDrop || (!assetId && !folderId)) return;
    if (assetId) onDropAsset(assetId);
    else if (folderId) onDropFolder(folderId);
  };
  const handleDragEnd = () => {
    clearEditorDragData();
    setDropTarget(false);
  };
  const sharedProps = {
    onDragOver: handleDragOver,
    onDragLeave: () => setDropTarget(false),
    onDrop: handleDrop,
    onContextMenu: onOpenContext,
  };
  if (viewMode === "list") {
    return (
      <div
        {...sharedProps}
        className={`group grid grid-cols-[42px_minmax(110px,1fr)_90px_28px] items-center gap-2 rounded-md border px-2 py-1 text-left ${dropTarget ? "border-brand-400 bg-brand-50 ring-1 ring-brand-200" : "border-transparent bg-editor-surface hover:bg-editor-subtle"}`}
      >
        <button type="button" draggable={Boolean(folder.custom) && !readOnly} data-editor-drag-source={folder.custom ? "asset-folder" : undefined} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onClick={onOpen} title={commandTitle(`${folder.name}を開く`, "OpenAssetFolder")} className="col-span-3 grid cursor-grab select-none grid-cols-[42px_minmax(110px,1fr)_90px] items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 active:cursor-grabbing">
          <span className="flex h-9 items-center justify-center rounded-md bg-editor-subtle text-slate-500"><FolderIcon size={20} aria-hidden="true" /></span>
          <span className="text-xs font-semibold text-slate-800">{folder.name}</span>
          <span className="flex items-center gap-1 text-xs text-slate-500"><KindIcon size={12} aria-hidden="true" /> {folder.custom ? "フォルダー" : "コレクション"}</span>
        </button>
        {folder.custom ? (
          <button type="button" disabled={readOnly} onClick={(event) => { event.stopPropagation(); onDelete(); }} title={commandTitle(`${folder.name}を削除`, "DeleteAssetFolder")} aria-label={`${folder.name}を削除`} className="rounded p-1 text-slate-400 opacity-0 hover:bg-rose-50 hover:text-rose-700 group-hover:opacity-100 group-focus-within:opacity-100 disabled:opacity-30"><DeleteIcon size={14} aria-hidden="true" /></button>
        ) : <span />}
      </div>
    );
  }
  return (
    <div
      {...sharedProps}
      className={`group relative flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-lg border text-slate-600 ${dropTarget ? "border-brand-400 bg-brand-50 ring-1 ring-brand-200" : "border-transparent bg-editor-surface hover:bg-editor-subtle"}`}
    >
      <button type="button" draggable={Boolean(folder.custom) && !readOnly} data-editor-drag-source={folder.custom ? "asset-folder" : undefined} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onClick={onOpen} title={commandTitle(`${folder.name}を開く`, "OpenAssetFolder")} className="flex h-full w-full cursor-grab select-none flex-col items-center justify-center gap-1.5 px-2 active:cursor-grabbing">
        <span className="relative">
          <FolderIcon size={24} strokeWidth={1.5} aria-hidden="true" />
          <KindIcon size={11} className="absolute -bottom-0.5 -right-1 rounded bg-white" aria-hidden="true" />
        </span>
        <span className="max-w-full truncate text-xs font-semibold">{folder.name}</span>
      </button>
      {folder.custom ? (
        <button type="button" disabled={readOnly} onClick={(event) => { event.stopPropagation(); onDelete(); }} title={commandTitle(`${folder.name}を削除`, "DeleteAssetFolder")} aria-label={`${folder.name}を削除`} className="absolute right-1.5 top-1.5 rounded bg-white p-1 text-slate-400 opacity-0 shadow hover:bg-rose-50 hover:text-rose-700 group-hover:opacity-100 group-focus-within:opacity-100 disabled:opacity-30"><DeleteIcon size={13} aria-hidden="true" /></button>
      ) : null}
    </div>
  );
}

function BuiltinPrefabCard({
  recipe,
  viewMode,
  readOnly,
  onPlace,
}: {
  recipe: BuiltinPrefabRecipe;
  viewMode: ViewMode;
  readOnly: boolean;
  onPlace: () => void;
}) {
  const definition = getXriftComponentDefinition(recipe.schemaId);
  const Icon = definition
    ? EDITOR_ICONS[definition.icon]
    : EDITOR_ICONS.prefab;
  const handleDragStart = (event: DragEvent<HTMLElement>) => {
    writeEditorDragData(event.dataTransfer, {
      [BUILTIN_PREFAB_DRAG_MIME]: recipe.id,
    });
    event.dataTransfer.effectAllowed = "copy";
  };
  if (viewMode === "list") {
    return (
      <div className="grid grid-cols-[54px_minmax(110px,1fr)_minmax(120px,1fr)_70px] items-center gap-2 rounded-md border border-sky-200 bg-white px-1.5 py-1">
        <div
          draggable={!readOnly}
          data-editor-drag-source="builtin-prefab"
          onDragStart={handleDragStart}
          onDragEnd={clearEditorDragData}
          className="col-span-3 grid cursor-grab select-none grid-cols-[54px_minmax(110px,1fr)_minmax(120px,1fr)] items-center gap-2 active:cursor-grabbing"
          title={`${recipe.name}をSceneへドラッグ`}
        >
          <span className="pointer-events-none flex h-10 items-center justify-center rounded border border-sky-100 bg-sky-50 text-sky-700"><Icon size={22} aria-hidden="true" /></span>
          <span className="pointer-events-none min-w-0"><span className="block truncate text-xs font-semibold text-slate-800">{recipe.name}</span><span className="block text-[11px] font-medium text-sky-700">XRift 組み込み{recipe.configuration?.requiredBeforeCompile ? "・配置後に設定" : ""}</span></span>
          <span className="pointer-events-none line-clamp-2 text-xs leading-4 text-slate-500" title={recipe.configuration?.hint}>{recipe.description}</span>
        </div>
        <button type="button" disabled={readOnly} onClick={onPlace} className="rounded bg-sky-600 px-2 py-1 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-40">配置</button>
      </div>
    );
  }
  return (
    <article className="flex min-h-[132px] min-w-0 flex-col rounded-md border border-sky-200 bg-white p-2 shadow-sm">
      <div
        draggable={!readOnly}
        data-editor-drag-source="builtin-prefab"
        onDragStart={handleDragStart}
        onDragEnd={clearEditorDragData}
        className="min-w-0 flex-1 cursor-grab select-none active:cursor-grabbing"
        title={`${recipe.name}をSceneへドラッグ`}
      >
        <div className="pointer-events-none flex items-start gap-2"><span className="rounded bg-sky-50 p-2 text-sky-700"><Icon size={22} aria-hidden="true" /></span><div className="min-w-0"><h3 className="truncate text-[13px] font-semibold text-slate-800">{recipe.name}</h3><p className="text-[11px] font-medium text-sky-700">XRift 組み込み</p></div></div>
        <p className="pointer-events-none mt-1.5 line-clamp-2 text-xs leading-4 text-slate-500">{recipe.description}</p>
        {recipe.configuration?.requiredBeforeCompile ? (
          <p className="pointer-events-none mt-1 line-clamp-2 text-[11px] font-medium leading-4 text-amber-700" title={recipe.configuration.hint}>
            配置後にInspectorで設定
          </p>
        ) : null}
      </div>
      <button type="button" disabled={readOnly} onClick={onPlace} title={commandTitle(`${recipe.name}をSceneへ配置`, "PlaceBuiltinPrefab")} className="mt-auto rounded bg-sky-600 px-2 py-1 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-40">配置</button>
    </article>
  );
}

function ContextMenuItem({
  icon,
  label,
  command,
  disabled = false,
  disabledReason,
  onClick,
}: {
  icon: EditorIconName;
  label: string;
  command: string;
  disabled?: boolean;
  disabledReason?: string | null;
  onClick: () => void;
}) {
  const Icon = EDITOR_ICONS[icon];
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={disabled && disabledReason ? disabledReason : commandTitle(label, command)}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-violet-50 hover:text-violet-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-700"
    >
      <Icon size={14} aria-hidden="true" />
      {label}
    </button>
  );
}

function importInProgress(status: PendingImport["status"]): boolean {
  return (
    status === "waiting-save" ||
    status === "queued" ||
    status === "reading" ||
    status === "processing" ||
    status === "committing"
  );
}

function ImportActivityDrawer({
  entries,
  error,
  projectPersisted,
  projectSaving,
  onSaveBeforeImport,
  onRemove,
  onClearError,
  onReveal,
}: {
  entries: PendingImport[];
  error: string | null;
  projectPersisted: boolean;
  projectSaving: boolean;
  onSaveBeforeImport: () => void | Promise<void>;
  onRemove: (id: string) => void;
  onClearError: () => void;
  onReveal: (entry: PendingImport) => void;
}) {
  const waitingForSave = entries.some((entry) => entry.status === "waiting-save");
  return (
    <section
      className="max-h-52 shrink-0 overflow-auto border-t border-editor-border bg-editor-surface px-3 py-2"
      aria-labelledby="asset-activity-heading"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h3 id="asset-activity-heading" className="text-xs font-semibold text-editor-text">
            アセットアクティビティ
          </h3>
          <p className="text-[11px] text-editor-muted">
            インポート結果と診断をここで確認できます。
          </p>
        </div>
        {error ? (
          <button type="button" onClick={onClearError} className="rounded px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300">
            エラーを確認済みにする
          </button>
        ) : null}
      </div>
      {error ? <p className="mb-2 rounded-md bg-rose-50 px-2.5 py-2 text-xs leading-4 text-rose-700">{error}</p> : null}
      {!projectPersisted && waitingForSave ? (
        <div className="mb-2 rounded-md border border-brand-200 bg-brand-50 p-2.5">
          <p className="text-xs leading-4 text-slate-700">
            アセットの保存先を確定するため、先にプロジェクトを保存してください。選択したファイルはこのセッション内で待機します。
          </p>
          <button
            type="button"
            disabled={projectSaving}
            onClick={() => void onSaveBeforeImport()}
            className="mt-2 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-wait disabled:opacity-50"
          >
            {projectSaving ? "保存中…" : "保存してインポートを続ける"}
          </button>
        </div>
      ) : null}
      <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
        {entries.map((entry) => (
          <ImportQueueEntry
            key={entry.id}
            entry={entry}
            onRemove={onRemove}
            onReveal={onReveal}
          />
        ))}
      </div>
    </section>
  );
}

function ImportQueueEntry({
  entry,
  onRemove,
  onReveal,
}: {
  entry: PendingImport;
  onRemove: (id: string) => void;
  onReveal: (entry: PendingImport) => void;
}) {
  const Icon =
    entry.resourceKind === "texture"
      ? EDITOR_ICONS.texture
      : entry.resourceKind === "skybox"
        ? EDITOR_ICONS.texture
        : entry.resourceKind === "audio"
          ? EDITOR_ICONS.audio
          : entry.resourceKind === "unity-package"
            ? EDITOR_ICONS.prefab
            : EDITOR_ICONS.model;
  const diagnostic = entry.diagnostics[0];
  const removable = canRemoveImport(entry.status);
  return (
    <article className="rounded-md bg-editor-subtle px-2.5 py-2 text-xs text-editor-text">
      <div className="flex items-center gap-1.5">
        <Icon size={12} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-medium">{entry.name}</span>
        <span className="shrink-0 text-slate-400">{formatFileSize(entry.size)}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className={`font-semibold ${importStatusClass(entry.status)}`}>
          {importStatusLabel(entry.status)}
        </span>
        {entry.sourceHash ? (
          <span className="font-mono text-[11px] text-slate-400" title={entry.sourceHash}>
            SHA {entry.sourceHash.slice(0, 8)}
          </span>
        ) : null}
      </div>
      <div
        className="mt-1.5 h-1 overflow-hidden rounded bg-slate-200"
        role="progressbar"
        aria-label={`${entry.name}の進捗`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={entry.progress}
      >
        <div
          className={`h-full transition-[width] ${entry.status === "failed" ? "bg-rose-500" : entry.status === "duplicate" ? "bg-sky-500" : entry.status === "succeeded" || entry.status === "updated" ? "bg-emerald-500" : "bg-brand-500"}`}
          style={{ width: `${entry.progress}%` }}
        />
      </div>
      {diagnostic ? (
        <p
          className={`mt-1 line-clamp-2 leading-4 ${diagnostic.severity === "blocking" ? "text-rose-700" : "text-amber-700"}`}
          title={`${diagnostic.code}: ${diagnostic.message}`}
        >
          {diagnostic.message}
        </p>
      ) : null}
      {entry.result ? (
        <p className="mt-1 text-[11px] text-editor-muted">
          {entry.resourceKind === "unity-package"
            ? `Prefab ${entry.result.prefabCount ?? 0}件・Entity ${entry.result.entityCount ?? 0}件・Asset ${entry.result.assetCount ?? 0}件${entry.result.warningCount ? `・要確認 ${entry.result.warningCount}件` : ""}`
            : entry.resourceKind === "skybox"
              ? "HDRI Texture 1件・Skyboxへ設定済み"
              : entry.resourceKind === "audio"
                ? "Audio Asset 1件"
                : `Material ${entry.result.materialCount}件・Texture ${entry.result.textureCount}件`}
        </p>
      ) : null}
      {entry.assetId || removable ? (
        <div className="mt-1.5 flex items-center justify-end gap-1">
          {entry.assetId ? (
            <button
              type="button"
              onClick={() => onReveal(entry)}
              className="rounded px-2 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            >
              アセットを表示
            </button>
          ) : null}
          {removable ? (
            <button
              type="button"
              onClick={() => onRemove(entry.id)}
              title={entry.status === "waiting-save" ? "待機中のファイルを外す" : "履歴から削除"}
              aria-label={entry.status === "waiting-save" ? `${entry.name}を待機中のファイルから外す` : `${entry.name}を履歴から削除`}
              className="rounded p-1 text-slate-400 hover:bg-white hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
            >
              <EDITOR_ICONS.close size={13} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function AssetStatusBar({
  entries,
  error,
  statusMessage,
  activityOpen,
  onToggleActivity,
  onReveal,
}: {
  entries: PendingImport[];
  error: string | null;
  statusMessage: string | null;
  activityOpen: boolean;
  onToggleActivity: () => void;
  onReveal: (entry: PendingImport) => void;
}) {
  const activeEntry = entries.find((entry) => importInProgress(entry.status));
  const latestEntry = entries[entries.length - 1];
  const visibleEntry = activeEntry ?? latestEntry;
  const failed = Boolean(error) || visibleEntry?.status === "failed";
  const succeeded =
    visibleEntry?.status === "succeeded" ||
    visibleEntry?.status === "updated" ||
    visibleEntry?.status === "duplicate";
  const canRevealVisibleEntry =
    !activeEntry &&
    Boolean(visibleEntry?.assetId) &&
    (!statusMessage?.trim() || statusMessage.includes(visibleEntry?.name ?? ""));
  const summary = activeEntry
    ? `${activeEntry.name}・${importStatusLabel(activeEntry.status)}`
    : error
      ? "アセット操作でエラーが発生しました"
      : statusMessage?.trim() ||
        (visibleEntry
          ? `${visibleEntry.name}・${importStatusLabel(visibleEntry.status)}`
          : "アセット操作の準備ができています");

  return (
    <footer className="flex h-8 shrink-0 items-center gap-2 border-t border-editor-border bg-editor-surface px-3 text-[11px] text-editor-muted">
      <div className="flex min-w-0 flex-1 items-center gap-2" role="status" aria-live="polite">
        {activeEntry ? (
          <LoaderCircle size={13} className="shrink-0 animate-spin text-brand-600 motion-reduce:animate-none" aria-hidden="true" />
        ) : failed ? (
          <CircleAlert size={13} className="shrink-0 text-rose-600" aria-hidden="true" />
        ) : succeeded ? (
          <CheckCircle2 size={13} className="shrink-0 text-emerald-600" aria-hidden="true" />
        ) : (
          <EDITOR_ICONS.asset size={13} className="shrink-0 text-slate-400" aria-hidden="true" />
        )}
        <span className="truncate">{summary}</span>
        {activeEntry ? (
          <span className="shrink-0 tabular-nums text-brand-700">{activeEntry.progress}%</span>
        ) : null}
      </div>
      {canRevealVisibleEntry && visibleEntry ? (
        <button
          type="button"
          onClick={() => onReveal(visibleEntry)}
          className="rounded px-2 py-1 font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
        >
          表示
        </button>
      ) : null}
      {entries.length > 0 || error ? (
        <button
          type="button"
          onClick={onToggleActivity}
          aria-expanded={activityOpen}
          className={`flex items-center gap-1 rounded px-2 py-1 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${activityOpen ? "bg-editor-subtle text-editor-text" : "hover:bg-editor-subtle hover:text-editor-text"}`}
        >
          <PanelBottomOpen size={13} aria-hidden="true" />
          詳細
          <ChevronDown size={12} className={`transition-transform ${activityOpen ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      ) : null}
    </footer>
  );
}

export function AssetsPanel({
  assets,
  projectPath,
  projectKind,
  editorMode,
  selectedAssetId,
  selectedAssetIds,
  pendingImports,
  importError,
  statusMessage,
  onSelectAsset,
  onAssetSelectionChange,
  onQueueFiles,
  onRemovePending,
  onClearImportError,
  projectSaving,
  onSaveBeforeImport,
  onPhaseNotice,
  activeFolderId,
  onActiveFolderChange,
  onCommand,
  renameRequest,
  onRename,
  onRequestDeleteAsset,
  onRequestDeleteFolder,
  onMoveAsset,
  onMoveFolder,
  onPlaceBuiltinPrefab,
  onPlaceSceneAsset,
  onOpenExternalStore,
  onOpenInteractivity,
  externalOperationLockReason = null,
}: {
  assets: AssetManifest;
  projectPath?: string;
  projectKind: VisualProjectKind;
  editorMode: EditorMode;
  selectedAssetId: string | null;
  selectedAssetIds: readonly string[];
  pendingImports: PendingImport[];
  importError: string | null;
  statusMessage: string | null;
  onSelectAsset: (assetId: string) => void;
  onAssetSelectionChange: (assetIds: string[], primaryAssetId: string | null) => void;
  onQueueFiles: (files: File[]) => void;
  onRemovePending: (id: string) => void;
  onClearImportError: () => void;
  projectSaving: boolean;
  onSaveBeforeImport: () => void | Promise<void>;
  onPhaseNotice: (message: string) => void;
  activeFolderId: string | null;
  onActiveFolderChange: (folderId: string | null) => void;
  onCommand: (
    commandId: EditorCommandId,
    payload?: {
      assetId?: string;
      folderId?: string | null;
      entityId?: string;
    },
  ) => boolean;
  renameRequest:
    | { kind: "asset" | "folder"; id: string; requestId: number }
    | null;
  onRename: (target: { kind: "asset" | "folder"; id: string }, name: string) => void;
  onRequestDeleteAsset: (assetId: string) => void;
  onRequestDeleteFolder: (folderId: string) => void;
  onMoveAsset: (assetId: string, folderId: string | null) => void;
  onMoveFolder: (folderId: string, parentId: string | null) => void;
  onPlaceBuiltinPrefab: (recipeId: string) => void;
  onPlaceSceneAsset: (assetId: string) => void;
  onOpenExternalStore: () => void;
  onOpenInteractivity: (assetId: string) => void;
  /**
   * Reason supplied by an Asset operation owned outside this panel, such as
   * Model reimport. Selection/navigation stay available while mutations and
   * new file queue entries are rejected at every panel entry point.
   */
  externalOperationLockReason?: string | null;
}) {
  const [fileDragOver, setFileDragOver] = useState(false);
  const [rootDropTarget, setRootDropTarget] = useState(false);
  const [breadcrumbDropTargetId, setBreadcrumbDropTargetId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activityOpen, setActivityOpen] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const selectionAnchorRef = useRef<string | null>(selectedAssetId);
  const readOnly = editorMode === "play";
  const normalizedExternalLockReason =
    externalOperationLockReason?.trim() || null;
  const activeAssetImport = hasActiveAssetImport(pendingImports);
  const importDisabledReason = readOnly
    ? "Playを停止してからアセットをインポートしてください"
    : normalizedExternalLockReason;
  const importLocked = Boolean(importDisabledReason);
  const assetMutationLocked =
    readOnly ||
    Boolean(normalizedExternalLockReason) ||
    activeAssetImport;
  const assetMutationDisabledReason = readOnly
    ? "Playを停止してからアセットを編集してください"
    : normalizedExternalLockReason ??
      (activeAssetImport
        ? "アセットのインポート完了後に編集できます"
        : null);
  const customFolders: BrowserFolder[] = Object.values(assets.folders ?? {})
    .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name))
    .map((folder) => ({
      id: folder.id,
      name: folder.name,
      icon: "folder",
      custom: true,
    }));
  const allFolders = [...KIND_FOLDERS, ...customFolders];
  const activeFolder = allFolders.find((folder) => folder.id === activeFolderId);
  const allAssets = Object.values(assets.assets).filter((asset) => asset.kind !== "primitive");
  const modelFolderIds = importedModelFolderIds(assets);
  const searching = searchQuery.trim().length > 0;
  const visibleFolders = searching
    ? []
    : !activeFolderId
      ? [
          ...KIND_FOLDERS,
          ...customFolders.filter(
            (folder) => assets.folders?.[folder.id]?.parentId === null,
          ),
        ]
      : activeFolder?.custom
        ? customFolders.filter(
            (folder) => assets.folders?.[folder.id]?.parentId === activeFolder.id,
          )
        : activeFolder?.kind === "model"
          ? customFolders.filter((folder) => modelFolderIds.has(folder.id))
          : [];
  const folderAssets = activeFolder?.kind
    ? allAssets.filter((asset) => asset.kind === activeFolder.kind)
    : activeFolder?.custom
      ? allAssets.filter((asset) => (asset.folderId ?? null) === activeFolder.id)
      : activeFolder?.builtinPrefabs
        ? []
        : allAssets.filter((asset) => (asset.folderId ?? null) === null);
  const visibleAssets = searching
    ? allAssets
        .filter((asset) =>
          matchesAssetSearch(asset, assetFolderPath(assets, asset), searchQuery),
        )
        .sort(
          (left, right) =>
            left.name.localeCompare(right.name) ||
            left.kind.localeCompare(right.kind) ||
            left.id.localeCompare(right.id),
        )
    : folderAssets;
  const handleAssetSelect = (
    assetId: string,
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    const currentIds = selectedAssetIds.filter((id) => Boolean(assets.assets[id]));
    if (event.shiftKey && selectionAnchorRef.current) {
      const anchorIndex = visibleAssets.findIndex((asset) => asset.id === selectionAnchorRef.current);
      const targetIndex = visibleAssets.findIndex((asset) => asset.id === assetId);
      if (anchorIndex >= 0 && targetIndex >= 0) {
        const start = Math.min(anchorIndex, targetIndex);
        const end = Math.max(anchorIndex, targetIndex);
        onAssetSelectionChange(visibleAssets.slice(start, end + 1).map((asset) => asset.id), assetId);
        return;
      }
    }
    if (event.ctrlKey || event.metaKey) {
      const nextIds = currentIds.includes(assetId)
        ? currentIds.filter((id) => id !== assetId)
        : [...currentIds, assetId];
      onAssetSelectionChange(nextIds, nextIds.includes(assetId) ? assetId : nextIds[nextIds.length - 1] ?? null);
      selectionAnchorRef.current = assetId;
      return;
    }
    selectionAnchorRef.current = assetId;
    onAssetSelectionChange([assetId], assetId);
  };
  const builtinPrefabRecipes = listBuiltinPrefabRecipes(projectKind);
  const visibleItemCount =
    activeFolder?.builtinPrefabs && !searching
      ? builtinPrefabRecipes.length
      : visibleFolders.length + visibleAssets.length;
  const activeBreadcrumb = (() => {
    if (!activeFolder) return [] as BrowserFolder[];
    if (!activeFolder.custom) return [activeFolder];
    const chain: BrowserFolder[] = [];
    const visited = new Set<string>();
    let currentId: string | null = activeFolder.id;
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const current = customFolders.find((folder) => folder.id === currentId);
      if (!current) break;
      chain.unshift(current);
      currentId = assets.folders?.[currentId]?.parentId ?? null;
    }
    if (chain.some((folder) => modelFolderIds.has(folder.id))) {
      chain.unshift(KIND_FOLDERS.find((folder) => folder.kind === "model")!);
    }
    return chain;
  })();

  useEffect(() => {
    if (
      importError ||
      pendingImports.some(
        (entry) => entry.status === "waiting-save" || entry.status === "failed",
      )
    ) {
      setActivityOpen(true);
    }
  }, [importError, pendingImports]);

  useEffect(() => {
    if (!renameRequest) return;
    const name =
      renameRequest.kind === "asset"
        ? assets.assets[renameRequest.id]?.name
        : assets.folders?.[renameRequest.id]?.name;
    setRenameDraft(name ?? "");
    const frame = window.requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [assets.assets, assets.folders, renameRequest]);

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (hasEditorDragData(event.dataTransfer, ENTITY_DRAG_MIME)) {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = assetMutationLocked ? "none" : "copy";
      return;
    }
    if (getDragKind(event.dataTransfer) !== "files") return;
    event.preventDefault();
    event.dataTransfer.dropEffect = importLocked ? "none" : "copy";
    setFileDragOver(true);
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (hasEditorDragData(event.dataTransfer, ENTITY_DRAG_MIME)) {
      event.preventDefault();
      event.stopPropagation();
      const entityId = readEditorDragData(
        event.dataTransfer,
        ENTITY_DRAG_MIME,
      ).trim();
      clearEditorDragData();
      setFileDragOver(false);
      if (assetMutationLocked) {
        if (assetMutationDisabledReason) onPhaseNotice(assetMutationDisabledReason);
      } else if (entityId) onCommand("prefab.create", { entityId });
      else {
        onPhaseNotice("Prefab化するEntityを読み取れませんでした");
      }
      return;
    }
    if (getDragKind(event.dataTransfer) !== "files") return;
    event.preventDefault();
    setFileDragOver(false);
    if (importDisabledReason) {
      onPhaseNotice(importDisabledReason);
      return;
    }
    onQueueFiles(Array.from(event.dataTransfer.files));
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (files.length === 0) return;
    if (importDisabledReason) {
      onPhaseNotice(importDisabledReason);
      return;
    }
    onQueueFiles(files);
  };

  const openContextMenu = (
    event: MouseEvent<HTMLElement>,
    target: { assetId?: string; folderId?: string } = {},
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const bounds =
      panelRef.current?.getBoundingClientRect() ??
      event.currentTarget.getBoundingClientRect();
    setContextMenu({
      x: Math.min(event.clientX - bounds.left, Math.max(8, bounds.width - 190)),
      y: Math.min(event.clientY - bounds.top, Math.max(8, bounds.height - 160)),
      ...target,
      creationFolderId: resolveAssetCreationFolderId(
        assets,
        activeFolderId,
        target,
      ),
    });
  };

  const openCreationMenu = () => {
    const bounds = panelRef.current?.getBoundingClientRect();
    setContextMenu({
      x: Math.max(8, (bounds?.width ?? 240) - 200),
      y: 42,
      creationFolderId: resolveAssetCreationFolderId(assets, activeFolderId, {}),
    });
  };

  const handleLibraryMove = (
    event: DragEvent<HTMLElement>,
    folderId: string | null,
  ) => {
    const hasAsset = hasEditorDragData(
      event.dataTransfer,
      ASSET_LIBRARY_ITEM_DRAG_MIME,
    );
    const hasFolder = hasEditorDragData(
      event.dataTransfer,
      ASSET_LIBRARY_FOLDER_DRAG_MIME,
    );
    if (!hasAsset && !hasFolder) return false;
    event.preventDefault();
    event.stopPropagation();
    const assetId = readEditorDragData(
      event.dataTransfer,
      ASSET_LIBRARY_ITEM_DRAG_MIME,
    ).trim();
    const sourceFolderId = readEditorDragData(
      event.dataTransfer,
      ASSET_LIBRARY_FOLDER_DRAG_MIME,
    ).trim();
    clearEditorDragData();
    setRootDropTarget(false);
    if (assetMutationLocked) return true;
    if (!assetId && !sourceFolderId) {
      onPhaseNotice("移動するAssetまたはFolderを読み取れませんでした");
      return true;
    }
    if (assetId) onMoveAsset(assetId, folderId);
    else if (sourceFolderId) onMoveFolder(sourceFolderId, folderId);
    return true;
  };

  const handleRootDragOver = (event: DragEvent<HTMLElement>) => {
    const hasLibraryPayload =
      hasEditorDragData(event.dataTransfer, ASSET_LIBRARY_ITEM_DRAG_MIME) ||
      hasEditorDragData(event.dataTransfer, ASSET_LIBRARY_FOLDER_DRAG_MIME);
    if (!hasLibraryPayload) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = assetMutationLocked ? "none" : "move";
    setRootDropTarget(!assetMutationLocked);
  };

  const handleBreadcrumbDragOver = (
    event: DragEvent<HTMLElement>,
    folderId: string,
  ) => {
    const hasLibraryPayload =
      hasEditorDragData(event.dataTransfer, ASSET_LIBRARY_ITEM_DRAG_MIME) ||
      hasEditorDragData(event.dataTransfer, ASSET_LIBRARY_FOLDER_DRAG_MIME);
    if (!hasLibraryPayload) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = assetMutationLocked ? "none" : "move";
    setBreadcrumbDropTargetId(assetMutationLocked ? null : folderId);
  };

  const revealImportEntry = (entry: PendingImport) => {
    if (!entry.assetId) return;
    const asset = assets.assets[entry.assetId];
    if (!asset) {
      onPhaseNotice("インポートしたアセットが見つかりませんでした");
      return;
    }
    onActiveFolderChange(asset.folderId ?? null);
    onSelectAsset(asset.id);
  };

  const folderItemCount = (folder: BrowserFolder): number => {
    if (folder.kind) return allAssets.filter((asset) => asset.kind === folder.kind).length;
    if (folder.builtinPrefabs) return builtinPrefabRecipes.length;
    return (
      allAssets.filter((asset) => (asset.folderId ?? null) === folder.id).length +
      customFolders.filter(
        (candidate) => assets.folders?.[candidate.id]?.parentId === folder.id,
      ).length
    );
  };

  const GridIcon = EDITOR_ICONS.grid;
  const ListIcon = EDITOR_ICONS.list;
  const ImportIcon = EDITOR_ICONS.import;
  const CreateIcon = EDITOR_ICONS.create;

  return (
    <section
      ref={panelRef}
      className={`relative flex min-h-0 flex-col border-t border-editor-border bg-editor-canvas ${fileDragOver ? "ring-2 ring-inset ring-brand-500" : ""}`}
      aria-labelledby="assets-heading"
      onDragOver={handleDragOver}
      onDragLeave={(event) => {
        const target = event.relatedTarget;
        if (!(target instanceof Node && event.currentTarget.contains(target))) setFileDragOver(false);
      }}
      onDrop={handleDrop}
      onContextMenu={openContextMenu}
      onPointerDown={() => contextMenu && setContextMenu(null)}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        disabled={importLocked}
        accept={ASSET_IMPORT_ACCEPT}
        onChange={handleFileInput}
        className="sr-only"
      />
      <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-editor-border bg-editor-surface px-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 id="assets-heading" className="text-[13px] font-semibold text-slate-800">Assets</h2>
          <nav className="flex min-w-0 items-center gap-1 text-xs text-slate-500" aria-label="Asset folder breadcrumb">
            <button
              type="button"
              onClick={() => onActiveFolderChange(null)}
              onDragOver={handleRootDragOver}
              onDragLeave={() => setRootDropTarget(false)}
              onDrop={(event) => handleLibraryMove(event, null)}
              className={`rounded-md px-1.5 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${rootDropTarget ? "bg-brand-100 text-brand-800" : "hover:bg-editor-subtle hover:text-editor-text"}`}
              title="Assets直下を開く。アセットまたはフォルダーをここへドロップして移動"
            >
              Assets
            </button>
            {activeBreadcrumb.map((folder, index) => (
              <span key={folder.id} className="contents">
                <span>/</span>
                <button
                  type="button"
                  aria-current={index === activeBreadcrumb.length - 1 ? "page" : undefined}
                  onClick={() => onActiveFolderChange(folder.id)}
                  onDragOver={(event) => handleBreadcrumbDragOver(event, folder.id)}
                  onDragLeave={() => setBreadcrumbDropTargetId(null)}
                  onDrop={(event) => {
                    setBreadcrumbDropTargetId(null);
                    handleLibraryMove(event, folder.id);
                  }}
                  className={`truncate rounded-md px-1 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${breadcrumbDropTargetId === folder.id ? "bg-brand-100 text-brand-800" : index === activeBreadcrumb.length - 1 ? "font-medium text-editor-text" : "hover:bg-editor-subtle hover:text-editor-text"}`}
                >
                  {folder.name}
                </button>
              </span>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-1">
          {normalizedExternalLockReason ? (
            <span
              role="status"
              className="max-w-44 truncate rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800"
              title={normalizedExternalLockReason}
            >
              {normalizedExternalLockReason}
            </span>
          ) : null}
          <label className="relative flex h-7 w-52 items-center">
            <span className="sr-only">アセットを検索</span>
            <input
              type="search"
              name="asset-search"
              autoComplete="off"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && searchQuery) {
                  event.preventDefault();
                  setSearchQuery("");
                }
              }}
              placeholder="アセットを検索…"
              className="h-7 w-full rounded-md border border-editor-border bg-editor-surface pl-2.5 pr-12 text-xs text-editor-text placeholder:text-slate-400 focus-visible:outline-none focus-visible:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-100"
            />
            {searching ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                aria-label="検索をクリア"
              >
                クリア
              </button>
            ) : null}
          </label>
          <button type="button" onClick={() => setViewMode("grid")} aria-label="グリッド表示" aria-pressed={viewMode === "grid"} title={commandTitle("グリッド表示", "SetAssetView.Grid")} className={`rounded p-1 ${viewMode === "grid" ? "bg-slate-200 text-slate-800" : "text-slate-500 hover:bg-slate-200"}`}><GridIcon size={14} aria-hidden="true" /></button>
          <button type="button" onClick={() => setViewMode("list")} aria-label="リスト表示" aria-pressed={viewMode === "list"} title={commandTitle("リスト表示", "SetAssetView.List")} className={`rounded p-1 ${viewMode === "list" ? "bg-slate-200 text-slate-800" : "text-slate-500 hover:bg-slate-200"}`}><ListIcon size={14} aria-hidden="true" /></button>
          <button type="button" disabled={assetMutationLocked} onClick={openCreationMenu} aria-label="新規アセットまたはフォルダー" title={assetMutationDisabledReason ?? "新規アセットまたはフォルダー"} className="ml-1 rounded border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45"><CreateIcon size={14} aria-hidden="true" /></button>
          <button type="button" disabled={assetMutationLocked} onClick={onOpenExternalStore} title={assetMutationDisabledReason ?? "外部リソースからAssetまたは公式Componentを追加"} className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:opacity-45"><Store size={12} aria-hidden="true" />外部から追加</button>
          <button type="button" disabled={importLocked} onClick={() => { if (onCommand("asset.import")) fileInputRef.current?.click(); }} title={importDisabledReason ?? commandTitle("アセットをインポート", "asset.import")} className="flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:opacity-45"><ImportIcon size={12} aria-hidden="true" />インポート</button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <AssetFolderTree
          assets={assets}
          customFolders={customFolders}
          kindFolders={KIND_FOLDERS}
          activeFolderId={activeFolderId}
          folderItemCount={folderItemCount}
          assetMutationLocked={assetMutationLocked}
          onActiveFolderChange={onActiveFolderChange}
          onMoveAsset={onMoveAsset}
          onMoveFolder={onMoveFolder}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-8 shrink-0 items-center justify-between border-b border-editor-border bg-editor-subtle px-3 text-xs">
            <span className="truncate font-medium text-editor-text">
              {searching ? `「${searchQuery.trim()}」の検索結果` : activeFolder?.name ?? "Assets直下"}
            </span>
            <span className="shrink-0 tabular-nums text-[11px] text-editor-muted" aria-live="polite">
              {searching ? `${visibleAssets.length} / ${allAssets.length}件` : `${visibleItemCount}件`}
            </span>
          </div>
          <div className={`scrollbar-thin min-w-0 flex-1 overflow-auto p-2 ${viewMode === "grid" ? "grid auto-rows-max grid-cols-[repeat(auto-fill,minmax(104px,1fr))] content-start gap-1.5" : "space-y-1"}`}>
        {!activeFolder?.builtinPrefabs
          ? visibleFolders.map((folder) => (
              renameRequest?.kind === "folder" && renameRequest.id === folder.id ? (
                <div key={folder.id} className="flex min-h-[108px] items-center rounded-md border border-violet-400 bg-white p-2">
                  <input
                    ref={renameInputRef}
                    value={renameDraft}
                    onChange={(event) => setRenameDraft(event.currentTarget.value)}
                    onBlur={() => onRename({ kind: "folder", id: folder.id }, renameDraft)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                      if (event.key === "Escape") {
                        event.preventDefault();
                        onRename({ kind: "folder", id: folder.id }, folder.name);
                      }
                    }}
                    className="h-8 min-w-0 w-full rounded border border-violet-400 px-2 text-xs outline-none ring-2 ring-violet-100"
                  />
                </div>
              ) : (
                <FolderCard
                  key={folder.id}
                  folder={folder}
                  viewMode={viewMode}
                  readOnly={assetMutationLocked}
                  onOpen={() => onActiveFolderChange(folder.id)}
                  onDelete={() => onRequestDeleteFolder(folder.id)}
                  onDropAsset={(assetId) => onMoveAsset(assetId, folder.id)}
                  onDropFolder={(folderId) => onMoveFolder(folderId, folder.id)}
                  onOpenContext={(event) => openContextMenu(event, { folderId: folder.id })}
                />
              )
            ))
          : null}
        {activeFolder?.builtinPrefabs && !searching
          ? builtinPrefabRecipes.map((recipe) => (
              <BuiltinPrefabCard
                key={recipe.id}
                recipe={recipe}
                viewMode={viewMode}
                readOnly={assetMutationLocked}
                onPlace={() => onPlaceBuiltinPrefab(recipe.id)}
              />
            ))
          : null}
        {visibleAssets.map((asset) => (
          renameRequest?.kind === "asset" && renameRequest.id === asset.id ? (
            <div key={asset.id} className="flex min-h-[108px] items-center rounded-md border border-violet-400 bg-white p-2">
              <input
                ref={renameInputRef}
                value={renameDraft}
                onChange={(event) => setRenameDraft(event.currentTarget.value)}
                onBlur={() => onRename({ kind: "asset", id: asset.id }, renameDraft)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") {
                    event.preventDefault();
                    onRename({ kind: "asset", id: asset.id }, asset.name);
                  }
                }}
                className="h-8 min-w-0 w-full rounded border border-violet-400 px-2 text-xs outline-none ring-2 ring-violet-100"
              />
            </div>
          ) : (
            <AssetCard
              key={asset.id}
              asset={asset}
              assets={assets}
              projectPath={projectPath}
              selected={selectedAssetIds.includes(asset.id)}
              viewMode={viewMode}
              readOnly={assetMutationLocked}
              onSelect={handleAssetSelect}
              onPlace={() => onPlaceSceneAsset(asset.id)}
              onOpen={() => {
                if (asset.kind === "interactivity") onOpenInteractivity(asset.id);
              }}
              onDelete={() => onRequestDeleteAsset(asset.id)}
              onOpenContext={(event) => openContextMenu(event, { assetId: asset.id })}
              folderPath={searching ? assetFolderPath(assets, asset) : undefined}
            />
          )
        ))}
        {searching && visibleAssets.length === 0 ? (
          <div className="col-span-full rounded border border-dashed border-slate-300 bg-white px-4 py-4 text-center text-xs text-slate-600">
            <p className="font-semibold text-slate-700">一致するアセットがありません</p>
            <p className="mt-1 text-[11px] text-slate-500">
              名前、種類、ソースパス、フォルダーパスを検索できます。
            </p>
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="mt-2 rounded border border-slate-300 bg-slate-50 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-100"
            >
              検索をクリア
            </button>
          </div>
        ) : null}
        {!searching && activeFolderId && visibleAssets.length === 0 && visibleFolders.length === 0 && (!activeFolder?.builtinPrefabs || builtinPrefabRecipes.length === 0) ? (
          <button
            type="button"
            onClick={() => onActiveFolderChange(null)}
            onDragOver={handleRootDragOver}
            onDragLeave={() => setRootDropTarget(false)}
            onDrop={(event) => handleLibraryMove(event, null)}
            className={`col-span-full rounded border border-dashed bg-white px-4 py-3 text-xs ${rootDropTarget ? "border-violet-500 bg-violet-50 text-violet-800" : "border-slate-300 text-slate-500 hover:border-violet-300 hover:text-violet-700"}`}
          >
            Folderは空です。Assetsへ戻る
            <span className="mt-1 block text-[11px]">ここへドロップするとAssets直下へ移動します</span>
          </button>
        ) : null}
          </div>
        </div>
      </div>

      {activityOpen && (pendingImports.length > 0 || importError) ? (
        <ImportActivityDrawer
          entries={pendingImports}
          error={importError}
          projectPersisted={Boolean(projectPath)}
          projectSaving={projectSaving}
          onSaveBeforeImport={onSaveBeforeImport}
          onRemove={onRemovePending}
          onClearError={onClearImportError}
          onReveal={revealImportEntry}
        />
      ) : null}
      <AssetStatusBar
        entries={pendingImports}
        error={importError}
        statusMessage={statusMessage}
        activityOpen={activityOpen}
        onToggleActivity={() => setActivityOpen((open) => !open)}
        onReveal={revealImportEntry}
      />

      {contextMenu ? (
        <div className="absolute z-30 w-48 rounded-md border border-slate-300 bg-white p-1 shadow-xl" style={{ left: contextMenu.x, top: contextMenu.y }} role="menu" onPointerDown={(event) => event.stopPropagation()}>
          {contextMenu.assetId &&
          isScenePlaceableAsset(assets.assets[contextMenu.assetId]) ? (
            <ContextMenuItem
              icon="move"
              label="Sceneへ配置"
              command="PlaceSceneAsset"
              disabled={assetMutationLocked}
              onClick={() => {
                const assetId = contextMenu.assetId;
                setContextMenu(null);
                if (assetId) onPlaceSceneAsset(assetId);
              }}
            />
          ) : null}
          {contextMenu.assetId || assets.folders?.[contextMenu.folderId ?? ""] ? (
            <ContextMenuItem
              icon="settings"
              label="Rename"
              command="selection.rename"
              disabled={assetMutationLocked}
              onClick={() => {
                const assetId = contextMenu.assetId;
                const folderId = contextMenu.folderId;
                setContextMenu(null);
                onCommand("selection.rename", { assetId, folderId });
              }}
            />
          ) : null}
          {contextMenu.assetId && assets.assets[contextMenu.assetId]?.kind === "interactivity" ? (
            <ContextMenuItem
              icon="settings"
              label="Interactivity Graphを編集"
              command="asset.edit-interactivity"
              onClick={() => {
                const assetId = contextMenu.assetId;
                setContextMenu(null);
                if (assetId) onOpenInteractivity(assetId);
              }}
            />
          ) : null}
          {contextMenu.assetId || assets.folders?.[contextMenu.folderId ?? ""] ? (
            <ContextMenuItem
              icon="delete"
              label="削除"
              command={contextMenu.assetId ? "DeleteAsset" : "DeleteAssetFolder"}
              disabled={assetMutationLocked}
              onClick={() => {
                const assetId = contextMenu.assetId;
                const folderId = contextMenu.folderId;
                setContextMenu(null);
                if (assetId) onRequestDeleteAsset(assetId);
                else if (folderId) onRequestDeleteFolder(folderId);
              }}
            />
          ) : null}
          <ContextMenuItem disabled={assetMutationLocked} disabledReason={assetMutationDisabledReason} icon="folder" label="新規フォルダー" command="asset.create-folder" onClick={() => { setContextMenu(null); onCommand("asset.create-folder"); }} />
          <ContextMenuItem disabled={assetMutationLocked} disabledReason={assetMutationDisabledReason} icon="material" label="新規マテリアル" command="asset.create-material" onClick={() => { const folderId = contextMenu.creationFolderId; setContextMenu(null); onCommand("asset.create-material", { folderId }); }} />
          <ContextMenuItem disabled={assetMutationLocked} disabledReason={assetMutationDisabledReason} icon="particle" label="新規Particle" command="asset.create-particle" onClick={() => { const folderId = contextMenu.creationFolderId; setContextMenu(null); onCommand("asset.create-particle", { folderId }); }} />
          <ContextMenuItem disabled={assetMutationLocked} disabledReason={assetMutationDisabledReason} icon="asset" label="新規Interactivity Graph" command="asset.create-interactivity" onClick={() => { const folderId = contextMenu.creationFolderId; setContextMenu(null); onCommand("asset.create-interactivity", { folderId }); }} />
          <ContextMenuItem disabled={importLocked} disabledReason={importDisabledReason} icon="texture" label="ファイルをインポート…" command="asset.import" onClick={() => { setContextMenu(null); if (onCommand("asset.import")) fileInputRef.current?.click(); }} />
          <ContextMenuItem disabled={assetMutationLocked} disabledReason={assetMutationDisabledReason} icon="prefab" label="EntityからPrefabを作成" command="prefab.create" onClick={() => { setContextMenu(null); onPhaseNotice("HierarchyのEntityをAssetsへドラッグしてください"); }} />
        </div>
      ) : null}

      {fileDragOver ? (
        <div className="pointer-events-none absolute inset-2 z-40 flex items-center justify-center rounded-md border-2 border-dashed border-violet-500 bg-white/95 px-4 text-center text-[12px] font-semibold leading-5 text-violet-900 shadow-lg">
          {importDisabledReason ?? "UnityPackage / Scene / Prefab / Model / Texture を解析してインポート"}
        </div>
      ) : null}
    </section>
  );
}
