import { ASSET_DRAG_MIME, ASSET_LIBRARY_ITEM_DRAG_MIME, ENTITIES_DRAG_MIME, ENTITY_DRAG_MIME, MATERIAL_DRAG_MIME, MATERIALS_DRAG_MIME } from "./types";
import { CHATGPT_MAX_MATERIAL_ATTACHMENTS } from "../../lib/visual-editor/chatgpt-attachments";

const EDITOR_DRAG_FALLBACK_MIME = "text/plain" as const;
const EDITOR_DRAG_PAYLOAD_TYPE = "xrift-studio/editor-drag" as const;
const EDITOR_DRAG_PAYLOAD_VERSION = 1 as const;
const MAX_FALLBACK_PAYLOAD_LENGTH = 64 * 1024;

type DragDataTransferReader = Pick<DataTransfer, "getData" | "types"> & {
  items?: Pick<DataTransferItemList, "length"> & {
    [index: number]: Pick<DataTransferItem, "type">;
  };
};

type DragDataTransferWriter = DragDataTransferReader &
  Pick<DataTransfer, "setData">;

type EditorDragPayload = {
  type: typeof EDITOR_DRAG_PAYLOAD_TYPE;
  version: typeof EDITOR_DRAG_PAYLOAD_VERSION;
  data: Record<string, string>;
};

/**
 * WebView drag events do not consistently expose custom MIME values during
 * dragenter/dragover. Keep the current same-window payload as a final fallback;
 * dragend/drop callers should clear it once the gesture has finished.
 */
let activeEditorDragData: Record<string, string> | null = null;

function normalizeMime(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeEntries(
  entries: Readonly<Record<string, string>>,
): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [mime, value] of Object.entries(entries)) {
    const normalizedMime = normalizeMime(mime);
    if (!normalizedMime || typeof value !== "string" || !value.trim()) continue;
    normalized[normalizedMime] = value;
  }
  return normalized;
}

function listTransferTypes(dataTransfer: DragDataTransferReader): string[] {
  const values = new Set<string>();
  try {
    for (const type of Array.from(dataTransfer.types ?? [])) {
      if (typeof type === "string" && type.trim()) {
        values.add(normalizeMime(type));
      }
    }
  } catch {
    // Some WebView DataTransfer implementations expose a non-iterable list.
  }

  try {
    const items = dataTransfer.items;
    if (items) {
      for (let index = 0; index < items.length; index += 1) {
        const type = items[index]?.type;
        if (typeof type === "string" && type.trim()) {
          values.add(normalizeMime(type));
        }
      }
    }
  } catch {
    // The active payload and text fallback still cover same-window gestures.
  }
  return [...values];
}

function safelyRead(
  dataTransfer: DragDataTransferReader,
  mime: string,
): string {
  try {
    const value = dataTransfer.getData(mime);
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

function parseFallbackPayload(value: string): EditorDragPayload | null {
  if (!value || value.length > MAX_FALLBACK_PAYLOAD_LENGTH) return null;
  try {
    const parsed = JSON.parse(value) as Partial<EditorDragPayload>;
    if (
      parsed.type !== EDITOR_DRAG_PAYLOAD_TYPE ||
      parsed.version !== EDITOR_DRAG_PAYLOAD_VERSION ||
      !parsed.data ||
      typeof parsed.data !== "object" ||
      Array.isArray(parsed.data)
    ) {
      return null;
    }
    const data = normalizeEntries(parsed.data as Record<string, string>);
    return { type: EDITOR_DRAG_PAYLOAD_TYPE, version: 1, data };
  } catch {
    return null;
  }
}

function readFallbackPayload(
  dataTransfer: DragDataTransferReader,
): EditorDragPayload | null {
  return parseFallbackPayload(
    safelyRead(dataTransfer, EDITOR_DRAG_FALLBACK_MIME),
  );
}

/** Writes custom MIME values plus a versioned text/plain compatibility copy. */
export function writeEditorDragData(
  dataTransfer: DragDataTransferWriter,
  entries: Readonly<Record<string, string>>,
): void {
  const data = normalizeEntries(entries);
  activeEditorDragData = Object.keys(data).length > 0 ? data : null;

  for (const [mime, value] of Object.entries(data)) {
    try {
      dataTransfer.setData(mime, value);
    } catch {
      // Continue: text/plain is accepted by WebViews that reject custom MIME.
    }
  }

  if (!activeEditorDragData) return;
  const payload: EditorDragPayload = {
    type: EDITOR_DRAG_PAYLOAD_TYPE,
    version: EDITOR_DRAG_PAYLOAD_VERSION,
    data,
  };
  try {
    dataTransfer.setData(EDITOR_DRAG_FALLBACK_MIME, JSON.stringify(payload));
  } catch {
    // Same-window gestures can still resolve through activeEditorDragData.
  }
}

/** Detects an editor drag intent across native browser and Tauri WebView paths. */
export function hasEditorDragData(
  dataTransfer: DragDataTransferReader,
  mime: string,
): boolean {
  const normalizedMime = normalizeMime(mime);
  if (!normalizedMime) return false;
  if (listTransferTypes(dataTransfer).includes(normalizedMime)) return true;
  if (activeEditorDragData?.[normalizedMime]) return true;
  return Boolean(readFallbackPayload(dataTransfer)?.data[normalizedMime]);
}

/** Reads an editor drag value, preferring the native custom MIME value. */
export function readEditorDragData(
  dataTransfer: DragDataTransferReader,
  mime: string,
): string {
  const normalizedMime = normalizeMime(mime);
  if (!normalizedMime) return "";
  const direct = safelyRead(dataTransfer, normalizedMime).trim();
  if (direct) return direct;
  const fallback = readFallbackPayload(dataTransfer)?.data[normalizedMime]?.trim();
  if (fallback) return fallback;
  return activeEditorDragData?.[normalizedMime]?.trim() ?? "";
}

/** Clears the same-window compatibility payload after dragend or drop. */
export function clearEditorDragData(): void {
  activeEditorDragData = null;
}

/** Entity references only: never treat arbitrary dropped text as an ID. */
export function readEditorEntityIds(dataTransfer: DragDataTransferReader): string[] {
  const multiple = readEditorDragData(dataTransfer, ENTITIES_DRAG_MIME);
  if (multiple && multiple.length <= MAX_FALLBACK_PAYLOAD_LENGTH) {
    try {
      const ids: unknown = JSON.parse(multiple);
      if (Array.isArray(ids) && ids.every(id => typeof id === "string" && id.length > 0 && id.length <= 160)) return [...new Set(ids as string[])].slice(0, 100);
    } catch { /* A valid primary reference still works for older clients. */ }
  }
  const primary = readEditorDragData(dataTransfer, ENTITY_DRAG_MIME);
  return primary && primary.length <= 160 ? [primary] : [];
}

/** Material references are checked against the current Asset Manifest by the receiver. */
export function readEditorMaterialIds(dataTransfer: DragDataTransferReader): string[] {
  const result: string[] = [];
  const multiple = readEditorDragData(dataTransfer, MATERIALS_DRAG_MIME);
  if (multiple && multiple.length <= MAX_FALLBACK_PAYLOAD_LENGTH) {
    try {
      const ids: unknown = JSON.parse(multiple);
      if (Array.isArray(ids) && ids.every(id => typeof id === "string" && id.length > 0 && id.length <= 160)) result.push(...ids as string[]);
    } catch { /* A valid primary Material still works for older clients. */ }
  }
  for (const mime of [MATERIAL_DRAG_MIME, ASSET_DRAG_MIME, ASSET_LIBRARY_ITEM_DRAG_MIME]) {
    const primary = readEditorDragData(dataTransfer, mime);
    if (primary && primary.length <= 160) result.push(primary);
  }
  return [...new Set(result)].slice(0, CHATGPT_MAX_MATERIAL_ATTACHMENTS);
}
