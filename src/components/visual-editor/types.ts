export const ASSET_DRAG_MIME =
  "application/x-xrift-visual-editor-asset" as const;
export const MATERIAL_DRAG_MIME =
  "application/x-xrift-visual-editor-material" as const;
export const TEXTURE_DRAG_MIME =
  "application/x-xrift-visual-editor-texture" as const;
/** Scene placement intent for imported Model/Prefab assets. */
export const SCENE_ASSET_DRAG_MIME =
  "application/x-xrift-visual-editor-scene-asset" as const;
/** Asset Browser organization intent; never interpreted as scene placement. */
export const ASSET_LIBRARY_ITEM_DRAG_MIME =
  "application/x-xrift-visual-editor-library-item" as const;
export const ASSET_LIBRARY_FOLDER_DRAG_MIME =
  "application/x-xrift-visual-editor-library-folder" as const;
export const ENTITY_DRAG_MIME =
  "application/x-xrift-visual-editor-entity" as const;

export type EditorMode = "edit" | "play";
export type TransformMode = "translate" | "rotate" | "scale";
export type TransformSpace = "world" | "local";

export type EditorSelection =
  | { kind: "entity"; id: string }
  | { kind: "asset"; id: string }
  | null;

export type PendingImportStatus =
  | "waiting-save"
  | "queued"
  | "reading"
  | "processing"
  | "committing"
  | "succeeded"
  | "updated"
  | "duplicate"
  | "failed";

export type PendingImportDiagnostic = {
  severity: "blocking" | "warning";
  code: string;
  message: string;
};

export type PendingImport = {
  id: string;
  name: string;
  size: number;
  resourceKind: "model" | "texture" | "unity-package";
  status: PendingImportStatus;
  progress: number;
  diagnostics: PendingImportDiagnostic[];
  sourceHash?: string;
  assetId?: string;
  result?: {
    materialCount: number;
    textureCount: number;
    prefabCount?: number;
    entityCount?: number;
    assetCount?: number;
    warningCount?: number;
  };
};

export type DragKind = "asset" | "files";
