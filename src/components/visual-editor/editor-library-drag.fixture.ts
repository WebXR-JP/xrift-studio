import {
  ASSET_LIBRARY_FOLDER_DRAG_MIME,
  ASSET_LIBRARY_ITEM_DRAG_MIME,
  ENTITY_DRAG_MIME,
} from "./types";
import {
  clearEditorDragData,
  hasEditorDragData,
  readEditorDragData,
  writeEditorDragData,
} from "./editor-drag-data";

/** Pure checks for Hierarchy reparent, Prefab creation, and Asset folder moves. */
export function runEditorLibraryDragFixture(): void {
  clearEditorDragData();

  const nativeEntityTransfer = new FakeDataTransfer();
  writeEditorDragData(nativeEntityTransfer as unknown as DataTransfer, {
    [ENTITY_DRAG_MIME]: "entity-chair",
  });
  assert(
    hasEditorDragData(
      nativeEntityTransfer as unknown as DataTransfer,
      ENTITY_DRAG_MIME,
    ),
    "Hierarchy and Assets must detect a native Entity drag",
  );
  assertEqual(
    readEditorDragData(
      nativeEntityTransfer as unknown as DataTransfer,
      ENTITY_DRAG_MIME,
    ),
    "entity-chair",
    "Entity drag must preserve the source Entity ID",
  );

  const webViewEntityTransfer = new FakeDataTransfer({
    rejectCustomMime: true,
  });
  writeEditorDragData(webViewEntityTransfer as unknown as DataTransfer, {
    [ENTITY_DRAG_MIME]: "entity-table",
  });
  clearEditorDragData();
  assert(
    hasEditorDragData(
      webViewEntityTransfer as unknown as DataTransfer,
      ENTITY_DRAG_MIME,
    ),
    "Assets must detect an Entity through the WebView text fallback",
  );
  assertEqual(
    readEditorDragData(
      webViewEntityTransfer as unknown as DataTransfer,
      ENTITY_DRAG_MIME,
    ),
    "entity-table",
    "Prefab creation must recover the Entity ID from fallback data",
  );

  const assetTransfer = new FakeDataTransfer({ rejectCustomMime: true });
  writeEditorDragData(assetTransfer as unknown as DataTransfer, {
    [ASSET_LIBRARY_ITEM_DRAG_MIME]: "asset-floor-texture",
  });
  clearEditorDragData();
  assertEqual(
    readEditorDragData(
      assetTransfer as unknown as DataTransfer,
      ASSET_LIBRARY_ITEM_DRAG_MIME,
    ),
    "asset-floor-texture",
    "Folder move must recover an Asset ID from fallback data",
  );

  const folderTransfer = new FakeDataTransfer({ rejectCustomMime: true });
  writeEditorDragData(folderTransfer as unknown as DataTransfer, {
    [ASSET_LIBRARY_FOLDER_DRAG_MIME]: "folder-environment",
  });
  clearEditorDragData();
  assert(
    hasEditorDragData(
      folderTransfer as unknown as DataTransfer,
      ASSET_LIBRARY_FOLDER_DRAG_MIME,
    ),
    "Folder targets must detect a Folder through fallback data",
  );
  assertEqual(
    readEditorDragData(
      folderTransfer as unknown as DataTransfer,
      ASSET_LIBRARY_FOLDER_DRAG_MIME,
    ),
    "folder-environment",
    "Folder move must preserve the source Folder ID",
  );

  const protectedTransfer = new FakeDataTransfer({ protectedReads: true });
  writeEditorDragData(protectedTransfer as unknown as DataTransfer, {
    [ENTITY_DRAG_MIME]: "entity-protected",
  });
  protectedTransfer.types.splice(0);
  assert(
    hasEditorDragData(
      protectedTransfer as unknown as DataTransfer,
      ENTITY_DRAG_MIME,
    ),
    "Same-window memory must cover protected dragover reads",
  );
  assertEqual(
    readEditorDragData(
      protectedTransfer as unknown as DataTransfer,
      ENTITY_DRAG_MIME,
    ),
    "entity-protected",
    "Protected dragover must recover the active Entity ID",
  );
  clearEditorDragData();
  assert(
    !hasEditorDragData(
      protectedTransfer as unknown as DataTransfer,
      ENTITY_DRAG_MIME,
    ),
    "Terminal drag paths must clear same-window compatibility data",
  );
}

class FakeDataTransfer {
  readonly types: string[] = [];
  private readonly values = new Map<string, string>();
  private readonly rejectCustomMime: boolean;
  private readonly protectedReads: boolean;

  constructor(
    options: {
      rejectCustomMime?: boolean;
      protectedReads?: boolean;
    } = {},
  ) {
    this.rejectCustomMime = options.rejectCustomMime ?? false;
    this.protectedReads = options.protectedReads ?? false;
  }

  setData(format: string, data: string): void {
    const normalizedFormat = format.toLowerCase();
    if (this.rejectCustomMime && normalizedFormat !== "text/plain") {
      throw new Error("Custom MIME is unavailable");
    }
    this.values.set(normalizedFormat, data);
    if (!this.types.includes(normalizedFormat)) this.types.push(normalizedFormat);
  }

  getData(format: string): string {
    if (this.protectedReads) return "";
    return this.values.get(format.toLowerCase()) ?? "";
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Editor library drag fixture failed: ${message}`);
}

function assertEqual(actual: string, expected: string, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `Editor library drag fixture failed: ${message}; expected ${expected}, received ${actual}`,
    );
  }
}
