import { _roots, events as createPointerEvents, unmountComponentAtNode, type EventManager, type RootStore } from "@react-three/fiber";

/** Preserve R3F pointer handling while rejecting late connections after teardown. */
export function createEditorCanvasEvents(store: RootStore) {
  return guardCanvasLifecycle(store, createPointerEvents(store));
}

/** Static thumbnails keep their zero-handler event manager. */
export function createStaticEditorCanvasEvents(store: RootStore) {
  return guardCanvasLifecycle(store, { enabled: false, priority: 1 });
}

function guardCanvasLifecycle(store: RootStore, manager: EventManager<HTMLElement>) {
  const connect = manager.connect;
  let teardownQueued = false;
  return {
    ...manager,
    connect(target: HTMLElement) {
      // CanvasImpl awaits configure before its nested Provider mounts. The
      // outer React tree may already have cleared its div ref in that interval.
      if (!target || !target.isConnected) {
        manager.disconnect?.();
        const state = store.getState();
        state.internal.active = false;
        // Its original unmount may have run before async configure created
        // the renderer. Unmount the now-configured R3F root after this layout
        // commit, so its renderer, scene and root registration are disposed.
        if (!teardownQueued) {
          teardownQueued = true;
          queueMicrotask(() => {
            const canvas = store.getState().gl.domElement;
            if (_roots.get(canvas)?.store === store) unmountComponentAtNode(canvas);
          });
        }
        return;
      }
      connect?.(target);
    },
  };
}
