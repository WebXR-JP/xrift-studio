import {
  commitEditorHistory,
  createEditorHistory,
  instantiateSceneAsset,
  type AssetManifest,
  type PrefabAsset,
  type PrefabDocument,
  type SceneDocument,
} from "../../lib/visual-editor";
import { BUILTIN_PREFAB_DRAG_MIME } from "../../lib/visual-editor";
import {
  MATERIAL_DRAG_MIME,
  SCENE_ASSET_DRAG_MIME,
} from "./types";
import {
  clearEditorDragData,
  hasEditorDragData,
  readEditorDragData,
  writeEditorDragData,
} from "./editor-drag-data";
import {
  fallbackViewportGroundPosition,
  getSceneViewportDragIntent,
  hasPointerMovedBeyondThreshold,
} from "./scene-viewport-drag";
import { createSceneViewportPreview } from "./scene-viewport-preview";

/** Browser-independent checks for the AssetCard -> Hierarchy drag contract. */
export function runEditorDragDataFixture(): void {
  clearEditorDragData();

  const nativeTransfer = new FakeDataTransfer();
  writeEditorDragData(nativeTransfer, {
    [SCENE_ASSET_DRAG_MIME]: "asset-prefab-room",
  });
  assert(
    nativeTransfer.types.includes(SCENE_ASSET_DRAG_MIME),
    "AssetCard must advertise the scene Asset MIME",
  );
  assert(
    hasEditorDragData(nativeTransfer, SCENE_ASSET_DRAG_MIME),
    "Hierarchy must detect the native scene Asset MIME",
  );
  assert(
    readEditorDragData(nativeTransfer, SCENE_ASSET_DRAG_MIME) ===
      "asset-prefab-room",
    "Hierarchy must read the dragged Prefab Asset ID",
  );
  assertDeepEqual(
    getSceneViewportDragIntent(nativeTransfer as unknown as DataTransfer),
    { kind: "scene-asset", id: "asset-prefab-room" },
    "Scene View must resolve the native Prefab drag intent",
  );

  const fallbackTransfer = new FakeDataTransfer(true);
  writeEditorDragData(fallbackTransfer, {
    [SCENE_ASSET_DRAG_MIME]: "asset-prefab-room",
  });
  clearEditorDragData();
  assert(
    fallbackTransfer.types.includes("text/plain"),
    "WebView fallback must be written when custom MIME is unavailable",
  );
  assert(
    hasEditorDragData(fallbackTransfer, SCENE_ASSET_DRAG_MIME),
    "Hierarchy must detect the versioned text fallback",
  );
  assert(
    readEditorDragData(fallbackTransfer, SCENE_ASSET_DRAG_MIME) ===
      "asset-prefab-room",
    "Hierarchy must recover the Prefab Asset ID from the fallback",
  );
  assertDeepEqual(
    getSceneViewportDragIntent(fallbackTransfer as unknown as DataTransfer),
    { kind: "scene-asset", id: "asset-prefab-room" },
    "Scene View must resolve the WebView fallback drag intent",
  );

  const protectedTransfer = new ProtectedFakeDataTransfer();
  writeEditorDragData(protectedTransfer, {
    [MATERIAL_DRAG_MIME]: "material-brushed-metal",
  });
  assertDeepEqual(
    getSceneViewportDragIntent(protectedTransfer as unknown as DataTransfer),
    { kind: "material", id: "material-brushed-metal" },
    "Same-window memory must cover WebViews that protect dragover data",
  );

  const conflictingTransfer = new FakeDataTransfer();
  writeEditorDragData(conflictingTransfer, {
    [SCENE_ASSET_DRAG_MIME]: "asset-prefab-room",
    [BUILTIN_PREFAB_DRAG_MIME]: "xrift.mirror",
  });
  assertDeepEqual(
    getSceneViewportDragIntent(conflictingTransfer as unknown as DataTransfer),
    { kind: "builtin-prefab", id: "xrift.mirror" },
    "Explicit XRift Prefab intent must win over a generic scene Asset",
  );

  const fileTransfer = new FakeDataTransfer();
  fileTransfer.setData("Files", "external.glb");
  assertDeepEqual(
    getSceneViewportDragIntent(fileTransfer as unknown as DataTransfer),
    { kind: "files" },
    "External Files must win even while stale editor drag memory exists",
  );
  clearEditorDragData();
  assertDeepEqual(
    fallbackViewportGroundPosition(60, 45, {
      left: 10,
      top: 5,
      width: 100,
      height: 80,
    }),
    [0, 0, 0],
    "Scene View fallback placement must map its center to the origin",
  );
  assertDeepEqual(
    fallbackViewportGroundPosition(-100, 1_000, {
      left: 10,
      top: 5,
      width: 100,
      height: 80,
    }),
    [-5, 0, 4],
    "Scene View fallback placement must clamp outside pointer coordinates",
  );
  assert(
    !hasPointerMovedBeyondThreshold(100, 100, 105, 103),
    "A small right-click movement must remain a context-menu click",
  );
  assert(
    hasPointerMovedBeyondThreshold(100, 100, 106, 100),
    "A right-click movement past the threshold must become a camera drag",
  );

  const { scene, assets, prefabs, prefabAsset } = createPlacementDocuments();
  const parentId = scene.rootEntityIds[0];
  assert(parentId, "Placement fixture requires a parent Entity");

  const draggedAssetId = readEditorDragData(
    fallbackTransfer,
    SCENE_ASSET_DRAG_MIME,
  );
  const dropped = instantiateSceneAsset(
    scene,
    assets,
    prefabs,
    draggedAssetId,
    { parentEntityId: parentId },
  );
  assert(dropped.placed, "Prefab drop must instantiate through asset-placement");
  if (!dropped.placed) return;
  assert(
    dropped.scene.entities[dropped.entityId]?.parentId === parentId,
    "Hierarchy row drop must preserve parentEntityId",
  );
  assert(
    dropped.scene.entities[parentId]?.children.includes(dropped.entityId),
    "Hierarchy row drop must append the instance to the parent children",
  );

  const clicked = instantiateSceneAsset(
    scene,
    assets,
    prefabs,
    prefabAsset.id,
  );
  assert(clicked.placed, "Click placement must use the same placement function");
  if (!clicked.placed) return;
  assert(
    clicked.scene.rootEntityIds.includes(clicked.entityId),
    "Click placement must add the instance to Scene Root",
  );
  const authoringEntityCount = Object.keys(clicked.scene.entities).length;
  const authoringHost = clicked.scene.entities[clicked.entityId];
  const preview = createSceneViewportPreview(
    clicked.scene,
    assets,
    prefabs,
  );
  const generatedEntityId = Object.keys(preview.scene.entities).find(
    (entityId) => !clicked.scene.entities[entityId],
  );
  assert(generatedEntityId, "Scene View preview must expand the Prefab contents");
  assert(
    preview.authoringEntityIdByEntityId[generatedEntityId] === clicked.entityId,
    "Expanded preview Entities must map back to the authoring Prefab host",
  );
  assert(
    preview.authoringEntityIdByEntityId[clicked.entityId] === clicked.entityId,
    "Authoring Entities must retain their own selection mapping",
  );
  const generatedRootId = preview.scene.entities[clicked.entityId]?.children[0];
  const generatedChildId = generatedRootId
    ? preview.scene.entities[generatedRootId]?.children[0]
    : undefined;
  assert(
    Boolean(
      generatedRootId &&
        generatedChildId &&
        preview.scene.entities[generatedRootId]?.parentId === clicked.entityId &&
        preview.scene.entities[generatedChildId]?.parentId === generatedRootId &&
        preview.authoringEntityIdByEntityId[generatedChildId] === clicked.entityId,
    ),
    "Nested Prefab preview hierarchy must preserve parent transforms and host mapping",
  );
  const previewRootTransform = generatedRootId
    ? preview.scene.entities[generatedRootId]?.components.find(
        (component) => component.type === "transform",
      )
    : undefined;
  const previewChildTransform = generatedChildId
    ? preview.scene.entities[generatedChildId]?.components.find(
        (component) => component.type === "transform",
      )
    : undefined;
  assertDeepEqual(
    previewRootTransform?.position,
    [2, 0, 0],
    "Prefab root local Transform must survive preview expansion",
  );
  assertDeepEqual(
    previewChildTransform?.position,
    [0, 1, 3],
    "Prefab child local Transform must remain nested below its root",
  );
  assert(
    Object.keys(clicked.scene.entities).length === authoringEntityCount &&
      clicked.scene.entities[clicked.entityId] === authoringHost &&
      authoringHost.components.some(
        (component) => component.type === "prefab-instance",
      ),
    "Scene View preview must not mutate the authoring Scene",
  );

  const initialSnapshot = {
    scene,
    sceneSelection: parentId,
    assetSelection: prefabAsset.id as string | null,
  };
  const history = commitEditorHistory(
    createEditorHistory(initialSnapshot),
    {
      scene: dropped.scene,
      sceneSelection: dropped.entityId,
      assetSelection: null,
    },
  );
  assert(
    history.past.length === 1 && history.future.length === 0,
    "Prefab placement must commit as one history transaction",
  );

  clearEditorDragData();
}

class FakeDataTransfer {
  readonly types: string[] = [];
  private readonly values = new Map<string, string>();

  constructor(private readonly rejectCustomMime = false) {}

  setData(format: string, data: string): void {
    const normalizedFormat = format.toLowerCase();
    if (this.rejectCustomMime && normalizedFormat !== "text/plain") {
      throw new Error("Custom MIME is unavailable");
    }
    this.values.set(normalizedFormat, data);
    if (!this.types.includes(normalizedFormat)) this.types.push(normalizedFormat);
  }

  getData(format: string): string {
    return this.values.get(format.toLowerCase()) ?? "";
  }
}

class ProtectedFakeDataTransfer extends FakeDataTransfer {
  override getData(_format: string): string {
    return "";
  }
}

function createPlacementDocuments(): {
  scene: SceneDocument;
  assets: AssetManifest;
  prefabs: Record<string, PrefabDocument>;
  prefabAsset: PrefabAsset;
} {
  const prefabPath = "prefabs/prefab-room.prefab.json";
  const prefabAsset: PrefabAsset = {
    id: "asset-prefab-room",
    name: "Room Prefab",
    kind: "template",
    status: "ready",
    source: { kind: "project", relativePath: prefabPath },
    templateType: "prefab",
    templatePath: prefabPath,
    prefabPath,
  };
  const scene: SceneDocument = {
    schemaVersion: "0.1.0",
    sceneId: "scene-fixture",
    name: "Scene",
    rootEntityIds: ["entity-parent"],
    entities: {
      "entity-parent": {
        id: "entity-parent",
        name: "Parent",
        parentId: null,
        children: [],
        enabled: true,
        components: [],
      },
    },
  };
  const prefab: PrefabDocument = {
    schemaVersion: "0.1.0",
    prefabId: "prefab-room",
    name: "Room Prefab",
    source: { sceneId: scene.sceneId, rootEntityIds: ["prefab-room-root"] },
    rootEntityIds: ["prefab-room-root"],
    entities: {
      "prefab-room-root": {
        id: "prefab-room-root",
        name: "Room",
        parentId: null,
        children: ["prefab-room-child"],
        enabled: true,
        components: [
          {
            id: "prefab-room-root-transform",
            type: "transform",
            enabled: true,
            position: [2, 0, 0],
            rotation: [0, 0.5, 0],
            scale: [1, 1, 1],
          },
        ],
      },
      "prefab-room-child": {
        id: "prefab-room-child",
        name: "Room Child",
        parentId: "prefab-room-root",
        children: [],
        enabled: true,
        components: [
          {
            id: "prefab-room-child-transform",
            type: "transform",
            enabled: true,
            position: [0, 1, 3],
            rotation: [0, 0, 0],
            scale: [0.5, 0.5, 0.5],
          },
        ],
      },
    },
  };
  return {
    scene,
    assets: {
      schemaVersion: "0.1.0",
      assets: { [prefabAsset.id]: prefabAsset },
    },
    prefabs: { [prefab.prefabId]: prefab },
    prefabAsset,
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Editor drag fixture failed: ${message}`);
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Editor drag fixture failed: ${message}; expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  }
}
