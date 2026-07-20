import { ASSET_DRAG_MIME, type DragKind } from "./types";
import { hasEditorDragData } from "./editor-drag-data";

export function getDragKind(dataTransfer: DataTransfer): DragKind | null {
  if (hasEditorDragData(dataTransfer, "Files")) return "files";
  if (hasEditorDragData(dataTransfer, ASSET_DRAG_MIME)) return "asset";
  return null;
}

export function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function roundTo(value: number, digits = 2): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

export function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${roundTo(size / 1024, 1)} KB`;
  return `${roundTo(size / (1024 * 1024), 1)} MB`;
}
