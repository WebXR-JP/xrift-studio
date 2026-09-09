import type { Object3D } from "three";

/** Keep late-loaded/replaced children in the official raycaster's layer.
 * Object3D child events avoid traversing every model on every frame. */
export function trackInteractionLayer(root: Object3D, layer: number): () => void {
  const previous = new Map<Object3D, boolean>();
  const added = (event: { child: Object3D }) => attach(event.child);
  const removed = (event: { child: Object3D }) => detach(event.child);
  function attach(object: Object3D) {
    if (previous.has(object)) return;
    previous.set(object, object.layers.isEnabled(layer));
    object.layers.enable(layer);
    object.addEventListener("childadded", added);
    object.addEventListener("childremoved", removed);
    object.children.forEach(attach);
  }
  function detach(object: Object3D) {
    if (!previous.has(object)) return;
    object.removeEventListener("childadded", added);
    object.removeEventListener("childremoved", removed);
    object.children.forEach(detach);
    if (!previous.get(object)) object.layers.disable(layer);
    previous.delete(object);
  }
  attach(root);
  return () => detach(root);
}
