import { BUILTIN_PREFAB_DRAG_MIME } from "../../lib/visual-editor";
import {
  ASSET_DRAG_MIME,
  MATERIAL_DRAG_MIME,
  SCENE_ASSET_DRAG_MIME,
} from "./types";
import {
  hasEditorDragData,
  readEditorDragData,
} from "./editor-drag-data";

export type SceneViewportDragIntent =
  | { kind: "files" }
  | { kind: "builtin-prefab"; id: string }
  | { kind: "material"; id: string }
  | { kind: "scene-asset"; id: string }
  | { kind: "primitive"; id: string };

/**
 * Resolves one unambiguous viewport intent. Explicit XRift Prefabs win over
 * generic scene assets when a WebView reports more than one internal type.
 */
export function getSceneViewportDragIntent(
  dataTransfer: DataTransfer,
): SceneViewportDragIntent | null {
  if (hasEditorDragData(dataTransfer, "Files")) return { kind: "files" };

  const candidates = [
    ["builtin-prefab", BUILTIN_PREFAB_DRAG_MIME],
    ["material", MATERIAL_DRAG_MIME],
    ["scene-asset", SCENE_ASSET_DRAG_MIME],
    ["primitive", ASSET_DRAG_MIME],
  ] as const;
  for (const [kind, mime] of candidates) {
    if (!hasEditorDragData(dataTransfer, mime)) continue;
    return { kind, id: readEditorDragData(dataTransfer, mime) };
  }
  return null;
}

export type ViewportClientRect = Pick<
  DOMRect,
  "left" | "top" | "width" | "height"
>;

/** Movement required to distinguish a camera gesture from a right-click. */
export const SCENE_VIEW_RIGHT_DRAG_THRESHOLD_PX = 6;

export function hasPointerMovedBeyondThreshold(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
  threshold = SCENE_VIEW_RIGHT_DRAG_THRESHOLD_PX,
): boolean {
  const deltaX = currentX - startX;
  const deltaY = currentY - startY;
  return deltaX * deltaX + deltaY * deltaY >= threshold * threshold;
}

/** Deterministic fallback used only before the Three camera bridge is ready. */
export function fallbackViewportGroundPosition(
  clientX: number,
  clientY: number,
  bounds: ViewportClientRect,
): [number, number, number] {
  const normalizedX = clampUnit((clientX - bounds.left) / bounds.width);
  const normalizedY = clampUnit((clientY - bounds.top) / bounds.height);
  return [roundTo((normalizedX - 0.5) * 10, 1), 0, roundTo((normalizedY - 0.5) * 8, 1)];
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0.5));
}

function roundTo(value: number, digits: number): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}
