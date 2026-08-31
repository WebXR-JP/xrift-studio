/**
 * React bindings for {@link SceneEntityTreeStore}.
 *
 * Two channels, split by how often each moves and how many nodes care:
 *
 * - The store delivers per-Entity slices. Editing one Entity wakes one node.
 * - This context carries what every node shares — the display profile, the
 *   gizmo, the transform callbacks. Changing one of those legitimately does
 *   re-render the whole tree, so it costs nothing to keep them here, and it
 *   keeps them out of the per-node comparison entirely.
 */
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type {
  AssetManifest,
  SceneGizmoSettings,
  TransformPatch,
} from "../../lib/visual-editor";
import type {
  SceneViewportDisplayMode,
  SceneViewportDisplayProfile,
} from "./scene-viewport-display";
import {
  SceneEntityTreeStore,
  type SceneEntityNodeSnapshot,
  type SceneEntityTreeInput,
} from "./scene-entity-tree-store";
import type { TransformMode, TransformSpace } from "./types";

export type SceneEntityTreeShared = {
  assets: AssetManifest;
  projectPath?: string;
  editable: boolean;
  playing: boolean;
  physicsEnabled: boolean;
  transformMode: TransformMode;
  transformSpace: TransformSpace;
  gizmo: SceneGizmoSettings;
  onTransformCommit: (entityId: string, patch: TransformPatch) => void;
  onDraggingChange: (dragging: boolean) => void;
  transformDraggingRef: { current: boolean };
  materialDragActive: boolean;
  displayMode: SceneViewportDisplayMode;
  displayProfile: SceneViewportDisplayProfile;
  renderThumbnail: boolean;
};

const StoreContext = createContext<SceneEntityTreeStore | null>(null);
const SharedContext = createContext<SceneEntityTreeShared | null>(null);

const OUTSIDE_PROVIDER =
  "SceneEntityTreeProviderの外でEntity treeを描画しています";

export function SceneEntityTreeProvider({
  input,
  shared,
  children,
}: {
  input: SceneEntityTreeInput;
  shared: SceneEntityTreeShared;
  children: ReactNode;
}) {
  const storeRef = useRef<SceneEntityTreeStore | null>(null);
  if (!storeRef.current) storeRef.current = new SceneEntityTreeStore(input);
  const store = storeRef.current;

  // Publishing during render would update subscribed nodes mid-render, which
  // React rejects. Doing it before paint keeps the tree from showing a frame of
  // the previous Scene.
  useLayoutEffect(() => {
    store.publish(input);
  }, [input, store]);

  return (
    <StoreContext.Provider value={store}>
      <SharedContext.Provider value={shared}>{children}</SharedContext.Provider>
    </StoreContext.Provider>
  );
}

export function useSceneEntityTreeShared(): SceneEntityTreeShared {
  const shared = useContext(SharedContext);
  if (!shared) throw new Error(OUTSIDE_PROVIDER);
  return shared;
}

export function useSceneEntityNode(entityId: string): SceneEntityNodeSnapshot {
  const store = useContext(StoreContext);
  if (!store) throw new Error(OUTSIDE_PROVIDER);
  const subscribe = useCallback(
    (onStoreChange: () => void) => store.subscribe(entityId, onStoreChange),
    [entityId, store],
  );
  const getSnapshot = useCallback(
    () => store.getSnapshot(entityId),
    [entityId, store],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
